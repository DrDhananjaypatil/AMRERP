import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { ACTIONS, MODULES, SCOPES } from '../lib/modules';
import { slugify, stamp } from '../lib/data';
import { Badge, ErrorNote } from '../components/ui';

const blankRole = () => ({
  name: '', permissions: { dashboard: ['view'] }, scopes: {}, canSeeCost: false,
  maxDiscountPct: 0, maxPurchaseAmount: 0, isActive: true,
});

export default function Roles() {
  const { me } = useAuth();
  const [roles, setRoles] = useState(null);
  const [selected, setSelected] = useState(null); // role id or 'new'
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => onSnapshot(collection(db, 'roles'), (s) => {
    const list = s.docs.map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.id === 'owner' ? -1 : b.id === 'owner' ? 1 : a.name.localeCompare(b.name)));
    setRoles(list);
  }), []);

  const pick = (r) => {
    setSelected(r ? r.id : 'new');
    setDraft(r ? JSON.parse(JSON.stringify({ ...r, updatedAt: undefined })) : blankRole());
    setError(null); setSaved(false);
  };

  const has = (mod, act) => (draft.permissions?.[mod] || []).includes(act);
  const toggle = (mod, act) => {
    const cur = new Set(draft.permissions?.[mod] || []);
    if (cur.has(act)) {
      cur.delete(act);
      if (act === 'view') cur.clear(); // no view = no access to that module at all
    } else {
      cur.add(act);
      cur.add('view'); // any action implies view
    }
    setDraft({ ...draft, permissions: { ...draft.permissions, [mod]: [...cur] } });
    setSaved(false);
  };
  const setField = (k, v) => { setDraft({ ...draft, [k]: v }); setSaved(false); };

  const save = async () => {
    setError(null);
    if (!draft.name?.trim()) return setError('Give the role a name.');
    setSaving(true);
    try {
      const id = selected === 'new' ? `${slugify(draft.name)}_${Math.random().toString(36).slice(2, 6)}` : selected;
      const { id: _drop, updatedAt, updatedBy, ...rest } = draft;
      await setDoc(doc(db, 'roles', id), {
        ...rest,
        name: draft.name.trim(),
        system: false,
        maxDiscountPct: Number(draft.maxDiscountPct) || 0,
        maxPurchaseAmount: draft.maxPurchaseAmount === '' || draft.maxPurchaseAmount === null ? 0 : Number(draft.maxPurchaseAmount),
        ...stamp(me.uid),
      });
      setSelected(id);
      setSaved(true);
    } catch (e) { setError(e); }
    setSaving(false);
  };

  if (!roles) return <div className="page"><h1>Roles &amp; permissions</h1><p className="muted">Loading…</p></div>;

  const locked = selected === 'owner';

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Roles &amp; permissions</h1>
          <p className="muted">Only the owner can change these. Changes apply to everyone in the role immediately.</p>
        </div>
        <div className="actions"><button className="btn" onClick={() => pick(null)}>+ New role</button></div>
      </div>

      <div className="split">
        <div className="card role-list">
          {roles.map((r) => (
            <button key={r.id} className={`role-item ${selected === r.id ? 'active' : ''}`} onClick={() => pick(r)}>
              {r.name} {r.isActive === false && <Badge tone="muted">Off</Badge>}
            </button>
          ))}
        </div>

        <div className="card role-editor">
          {!draft ? <p className="muted">Pick a role to see or change what it can do.</p> : (
            <>
              <div className="form-grid">
                <div className="field">
                  <label>Role name</label>
                  <input value={draft.name} disabled={locked} onChange={(e) => setField('name', e.target.value)} />
                </div>
                <div className="field">
                  <label className="check">
                    <input type="checkbox" disabled={locked} checked={draft.isActive !== false} onChange={(e) => setField('isActive', e.target.checked)} />
                    <span>Role is active (can be assigned)</span>
                  </label>
                </div>
              </div>

              {locked ? (
                <p className="note">The Owner / CEO role always has full access to everything, including the audit log. It cannot be edited.</p>
              ) : (
                <>
                  <h3>Module access</h3>
                  <div className="table-wrap">
                    <table className="table matrix">
                      <thead>
                        <tr><th>Module</th>{ACTIONS.map((a) => <th key={a}>{a}</th>)}<th>Data scope</th></tr>
                      </thead>
                      <tbody>
                        {MODULES.map((m) => (
                          <tr key={m.id}>
                            <td>{m.label} {!m.ready && <Badge tone="muted">Phase {m.phase}</Badge>}</td>
                            {ACTIONS.map((a) => (
                              <td key={a} className="center">
                                {m.actions.includes(a) && (
                                  <input type="checkbox" checked={has(m.id, a)} onChange={() => toggle(m.id, a)} aria-label={`${m.label} ${a}`} />
                                )}
                              </td>
                            ))}
                            <td>
                              {m.scoped && has(m.id, 'view') && (
                                <select value={draft.scopes?.[m.id] || 'own'} onChange={(e) => setField('scopes', { ...draft.scopes, [m.id]: e.target.value })}>
                                  {SCOPES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                                </select>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="muted small">Inventory: “create” = opening stock and transfers, “edit” = stock adjustments (add / remove with a reason).</p>
                  <p className="muted small">“delete” means deactivate. Records are never erased, so history and the audit log stay complete.</p>

                  <h3>Hidden information</h3>
                  <label className="check">
                    <input type="checkbox" checked={!!draft.canSeeCost} onChange={(e) => setField('canSeeCost', e.target.checked)} />
                    <span>Can see cost price, margins and profit</span>
                  </label>

                  <h3>Approval limits</h3>
                  <div className="form-grid">
                    <div className="field">
                      <label>Max discount this role can give or approve (%)</label>
                      <input type="number" min="0" max="100" value={draft.maxDiscountPct ?? 0} onChange={(e) => setField('maxDiscountPct', e.target.value)} />
                      <small className="help">Above this, the quotation goes to their manager (used from Phase 1).</small>
                    </div>
                    <div className="field">
                      <label>Max purchase order this role can approve (₹)</label>
                      <input type="number" min="0" value={draft.maxPurchaseAmount ?? 0} onChange={(e) => setField('maxPurchaseAmount', e.target.value)} />
                      <small className="help">0 = cannot approve purchases (used from Phase 2).</small>
                    </div>
                  </div>

                  <div className="actions end">
                    {saved && <span className="ok-note inline">Saved</span>}
                    <button className="btn" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save role'}</button>
                  </div>
                </>
              )}
              <ErrorNote error={error} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
