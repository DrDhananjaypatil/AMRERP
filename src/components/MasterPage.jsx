import { useEffect, useMemo, useState } from 'react';
import {
  addDoc, collection, doc, getDocs, onSnapshot, query, setDoc, updateDoc, where,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { ownerChainFor, scopedQuery, stamp, inr } from '../lib/data';
import { coerce, optionLabel } from '../lib/masters';
import { downloadExcel } from '../lib/excel';
import { Badge, Empty, ErrorNote, FieldInput, Modal } from './ui';

/**
 * Generic list + add/edit screen for a master collection.
 * - scoped: records belong to a person (ownerId/ownerChain) and follow the role's data scope
 * - cost:   { collection, fields } stored in a separate collection, shown only if canSeeCost
 */
export default function MasterPage({ title, collName, mod, fields, beforeSave, scoped, cost, intro }) {
  const { me, can, scopeOf, canSeeCost } = useAuth();
  const scope = scoped ? scopeOf(mod) : 'all';
  const showCost = !!cost && canSeeCost;

  const [rows, setRows] = useState(null);
  const [costs, setCosts] = useState({});
  const [staff, setStaff] = useState([]);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState(null); // { id?, data }

  useEffect(() => {
    const q = scoped ? scopedQuery(collName, scope, me) : collection(db, collName);
    return onSnapshot(q, (s) => setRows(s.docs.map((d) => ({ id: d.id, ...d.data() }))), (e) => { setError(e); setRows([]); });
  }, [collName, scoped, scope, me]);

  useEffect(() => {
    if (!showCost) return;
    return onSnapshot(collection(db, cost.collection), (s) =>
      setCosts(Object.fromEntries(s.docs.map((d) => [d.id, d.data()]))));
  }, [showCost, cost?.collection]);

  // Staff list lets managers assign a record to someone in their team.
  const canAssign = scoped && scope !== 'own' && can('staff', 'view');
  useEffect(() => {
    if (!canAssign) return;
    return onSnapshot(collection(db, 'users'), (s) =>
      setStaff(s.docs.map((d) => ({ uid: d.id, ...d.data() })).filter((u) => u.active)));
  }, [canAssign]);

  const assignable = useMemo(() => {
    if (!canAssign) return [me];
    if (scope === 'team') return staff.filter((u) => u.uid === me.uid || (u.managerChain || []).includes(me.uid));
    if (scope === 'unit') return staff.filter((u) => u.unitId === me.unitId || u.uid === me.uid);
    return staff;
  }, [canAssign, staff, scope, me]);
  const staffName = (uid) => (uid === me.uid ? me.name : staff.find((u) => u.uid === uid)?.name || '—');

  const tableFields = fields.filter((f) => f.inTable);
  const allFields = showCost ? [...fields, ...cost.fields] : fields;

  const visible = useMemo(() => {
    if (!rows) return [];
    const s = search.trim().toLowerCase();
    return rows
      .filter((r) => showInactive || r.isActive !== false)
      .filter((r) => !s || allFields.some((f) => String(r[f.key] ?? '').toLowerCase().includes(s)))
      .sort((a, b) => String(a.name || a.sku || '').localeCompare(String(b.name || b.sku || '')));
  }, [rows, search, showInactive, allFields]);

  const openNew = () => {
    const data = Object.fromEntries(fields.filter((f) => f.default !== undefined).map((f) => [f.key, f.default]));
    if (scoped) data.ownerId = me.uid;
    setEditing({ data });
  };
  const openEdit = (r) => setEditing({ id: r.id, data: { ...r, ...(showCost ? costs[r.id] : {}) } });

  const doExport = () => {
    const cols = [...allFields.map((f) => ({ key: f.key, label: f.label })), ...(scoped ? [{ key: '_owner', label: 'Owner' }] : [])];
    const data = visible.map((r) => ({
      ...r,
      ...(showCost ? costs[r.id] : {}),
      ...Object.fromEntries(allFields.map((f) => [f.key, f.type === 'checkbox' ? (r[f.key] ? 'Yes' : 'No') : optionLabel(f, r[f.key])])),
      _owner: scoped ? staffName(r.ownerId) : undefined,
    }));
    downloadExcel(`${collName}-${new Date().toISOString().slice(0, 10)}`, cols, data);
  };

  const toggleActive = async (r) => {
    setError(null);
    try {
      await updateDoc(doc(db, collName, r.id), { isActive: r.isActive === false, ...stamp(me.uid) });
    } catch (e) { setError(e); }
  };

  if (!rows) return <div className="page"><h1>{title}</h1><p className="muted">Loading…</p></div>;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{title}</h1>
          {intro && <p className="muted">{intro}</p>}
        </div>
        <div className="actions">
          {can(mod, 'export') && <button className="btn btn-ghost" onClick={doExport}>Export to Excel</button>}
          {can(mod, 'create') && <button className="btn" onClick={openNew}>+ Add</button>}
        </div>
      </div>

      <div className="toolbar">
        <input className="search" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <label className="check"><input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Show inactive</label>
        <span className="muted">{visible.length} of {rows.length}</span>
        {scoped && scope !== 'all' && <Badge>Showing: {scope === 'own' ? 'your records' : scope === 'team' ? 'you and your team' : 'your unit'}</Badge>}
      </div>

      <ErrorNote error={error} />

      {visible.length === 0 ? (
        <Empty>No records yet.{can(mod, 'create') && ' Use “+ Add” or Data import to bring in existing data.'}</Empty>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                {tableFields.map((f) => <th key={f.key} className={f.type === 'number' ? 'num' : ''}>{f.label}</th>)}
                {showCost && cost.fields.filter((f) => f.inTable).map((f) => <th key={f.key} className="num">{f.label}</th>)}
                {scoped && <th>Owner</th>}
                <th />
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.id} className={r.isActive === false ? 'row-inactive' : ''} onClick={() => can(mod, 'edit') && openEdit(r)}>
                  {tableFields.map((f) => (
                    <td key={f.key} className={f.type === 'number' ? 'num' : ''}>
                      {f.money ? inr(r[f.key]) : optionLabel(f, r[f.key])}
                    </td>
                  ))}
                  {showCost && cost.fields.filter((f) => f.inTable).map((f) => (
                    <td key={f.key} className="num">{inr(costs[r.id]?.[f.key])}</td>
                  ))}
                  {scoped && <td>{staffName(r.ownerId)}</td>}
                  <td className="row-actions" onClick={(e) => e.stopPropagation()}>
                    {r.isActive === false && <Badge tone="muted">Inactive</Badge>}
                    {can(mod, 'delete') && (
                      <button className="btn btn-ghost btn-sm" onClick={() => toggleActive(r)}>
                        {r.isActive === false ? 'Reactivate' : 'Deactivate'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <EditModal
          title={`${editing.id ? 'Edit' : 'Add'} ${title.replace(/s$/, '').toLowerCase()}`}
          initial={editing}
          fields={fields}
          costFields={showCost ? cost.fields : []}
          assignable={scoped ? assignable : null}
          onClose={() => setEditing(null)}
          onSave={async (data, costData) => {
            const res = beforeSave ? beforeSave(data) : { data };
            if (res.error) throw new Error(res.error);
            const out = { ...res.data };

            for (const f of fields.filter((x) => x.unique)) {
              const dup = await getDocs(query(collection(db, collName), where(f.key, '==', out[f.key])));
              if (dup.docs.some((d) => d.id !== editing.id)) throw new Error(`${f.label} "${out[f.key]}" already exists.`);
            }
            if (scoped) {
              const owner = out.ownerId === me.uid ? me : assignable.find((u) => u.uid === out.ownerId);
              if (!owner) throw new Error('Choose who this customer belongs to.');
              out.ownerChain = ownerChainFor(owner);
            }
            delete out.id;
            for (const k of Object.keys(costData)) delete out[k];
            if (!editing.id) out.isActive = true;

            let id = editing.id;
            if (id) await setDoc(doc(db, collName, id), { ...out, ...stamp(me.uid) });
            else id = (await addDoc(collection(db, collName), { ...out, ...stamp(me.uid) })).id;

            if (showCost && Object.keys(costData).length) {
              await setDoc(doc(db, cost.collection, id), { ...costData, ...stamp(me.uid) }, { merge: true });
            }
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function EditModal({ title, initial, fields, costFields, assignable, onClose, onSave }) {
  const [data, setData] = useState(initial.data);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const set = (k, v) => setData((d) => ({ ...d, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    const all = [...fields, ...costFields];
    const clean = {};
    for (const f of all) {
      const v = coerce(f, data[f.key]);
      if (f.required && (v === '' || v === null || v === undefined)) return setError(`${f.label} is required.`);
      if (f.type === 'number' && Number.isNaN(v)) return setError(`${f.label} must be a number.`);
      if (v !== undefined) clean[f.key] = v;
    }
    if (assignable) clean.ownerId = data.ownerId;
    const costData = Object.fromEntries(costFields.map((f) => [f.key, clean[f.key] ?? null]));
    setSaving(true);
    try { await onSave({ ...data, ...clean }, costData); } catch (err) { setError(err); setSaving(false); }
  };

  return (
    <Modal
      title={title}
      onClose={onClose}
      wide
      footer={<>
        <button className="btn btn-ghost" onClick={onClose} type="button">Cancel</button>
        <button className="btn" form="master-form" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
      </>}
    >
      <form id="master-form" className="form-grid" onSubmit={submit}>
        {fields.map((f) => <FieldInput key={f.key} field={f} value={data[f.key]} onChange={(v) => set(f.key, v)} />)}
        {costFields.map((f) => <FieldInput key={f.key} field={f} value={data[f.key]} onChange={(v) => set(f.key, v)} />)}
        {assignable && assignable.length > 1 && (
          <FieldInput
            field={{ key: 'ownerId', label: 'Belongs to (salesperson)', type: 'select', required: true, options: assignable.map((u) => ({ value: u.uid, label: u.name })) }}
            value={data.ownerId}
            onChange={(v) => set('ownerId', v)}
          />
        )}
      </form>
      <ErrorNote error={error} />
    </Modal>
  );
}
