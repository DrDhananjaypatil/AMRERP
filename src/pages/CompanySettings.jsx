import { useEffect, useState } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { INDIAN_STATES } from '../lib/modules';
import { isValidGstin, slugify, stamp } from '../lib/data';
import { ErrorNote } from '../components/ui';
import { unitLogo } from '../lib/brand';

const LIST_KEYS = [
  { key: 'categories', label: 'Product categories' },
  { key: 'materials', label: 'Materials' },
  { key: 'bearingTypes', label: 'Bearing types' },
  { key: 'grades', label: 'Quality grades' },
  { key: 'uoms', label: 'Units of measure' },
];

export default function CompanySettings() {
  const { me, company, lists, can } = useAuth();
  const editable = can('settings', 'edit');
  const [c, setC] = useState(null);
  const [l, setL] = useState(null);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState('');

  useEffect(() => { if (company && !c) setC(JSON.parse(JSON.stringify(company))); }, [company, c]);
  useEffect(() => {
    if (lists && !l) setL(Object.fromEntries(LIST_KEYS.map(({ key }) => [key, (lists[key] || []).join(', ')])));
  }, [lists, l]);

  if (!c || !l) return <div className="page"><h1>Company settings</h1><p className="muted">Loading…</p></div>;

  const setUnit = (i, k, v) => setC({ ...c, units: c.units.map((u, j) => (j === i ? { ...u, [k]: v } : u)) });
  const setWh = (i, k, v) => setC({ ...c, warehouses: c.warehouses.map((w, j) => (j === i ? { ...w, [k]: v } : w)) });

  const saveCompany = async () => {
    setError(null); setSaved('');
    for (const u of c.units) {
      if (!u.name) return setError('Every unit needs a name.');
      if (!isValidGstin(u.gstin)) return setError(`GSTIN for ${u.name} is not valid.`);
    }
    try {
      const units = c.units.map((u) => ({ ...u, id: u.id || slugify(u.name), gstin: (u.gstin || '').toUpperCase() }));
      const warehouses = c.warehouses.map((w) => ({ ...w, id: w.id || slugify(w.name) }));
      const { updatedAt, updatedBy, ...rest } = c;
      await setDoc(doc(db, 'config', 'company'), { ...rest, units, warehouses, ...stamp(me.uid) });
      setSaved('company');
    } catch (e) { setError(e); }
  };

  const saveLists = async () => {
    setError(null); setSaved('');
    try {
      const out = Object.fromEntries(LIST_KEYS.map(({ key }) => [key, l[key].split(',').map((s) => s.trim()).filter(Boolean)]));
      await setDoc(doc(db, 'config', 'lists'), { ...out, ...stamp(me.uid) });
      setSaved('lists');
    } catch (e) { setError(e); }
  };

  return (
    <div className="page">
      <h1>Company settings</h1>
      <ErrorNote error={error} />

      <section className="card">
        <h2>Company</h2>
        <div className="form-grid">
          <div className="field"><label>Company name</label><input disabled={!editable} value={c.name || ''} onChange={(e) => setC({ ...c, name: e.target.value })} /></div>
          <div className="field"><label>Financial year</label><input disabled value="April to March" /></div>
        </div>

        <h3>Units</h3>
        <p className="muted small">If both units bill under the same GSTIN, enter the same number for both.</p>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Logo</th><th>Name</th><th>Type</th><th>GSTIN</th><th>State</th><th>Address</th><th>Phone</th></tr></thead>
            <tbody>
              {c.units.map((u, i) => (
                <tr key={u.id || i}>
                  <td>{unitLogo(u.id) ? <img className="unit-logo" src={unitLogo(u.id)} alt={u.name} /> : <span className="muted small">—</span>}</td>
                  <td><input disabled={!editable} value={u.name} onChange={(e) => setUnit(i, 'name', e.target.value)} /></td>
                  <td><input disabled={!editable} value={u.kind || ''} onChange={(e) => setUnit(i, 'kind', e.target.value)} /></td>
                  <td><input disabled={!editable} value={u.gstin || ''} onChange={(e) => setUnit(i, 'gstin', e.target.value.toUpperCase())} placeholder="27ABCDE1234F1Z5" /></td>
                  <td>
                    <select disabled={!editable} value={u.state || ''} onChange={(e) => setUnit(i, 'state', e.target.value)}>
                      {INDIAN_STATES.map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </td>
                  <td><input disabled={!editable} value={u.address || ''} onChange={(e) => setUnit(i, 'address', e.target.value)} /></td>
                  <td><input disabled={!editable} value={u.phone || ''} onChange={(e) => setUnit(i, 'phone', e.target.value)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {editable && <button className="btn btn-ghost btn-sm" onClick={() => setC({ ...c, units: [...c.units, { name: '', kind: '', gstin: '', state: 'Maharashtra', address: '', phone: '' }] })}>+ Add unit</button>}

        <h3>Warehouses / stock locations</h3>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Name</th><th>Unit</th></tr></thead>
            <tbody>
              {c.warehouses.map((w, i) => (
                <tr key={w.id || i}>
                  <td><input disabled={!editable} value={w.name} onChange={(e) => setWh(i, 'name', e.target.value)} /></td>
                  <td>
                    <select disabled={!editable} value={w.unitId} onChange={(e) => setWh(i, 'unitId', e.target.value)}>
                      {c.units.map((u) => <option key={u.id || u.name} value={u.id || slugify(u.name)}>{u.name}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {editable && <button className="btn btn-ghost btn-sm" onClick={() => setC({ ...c, warehouses: [...c.warehouses, { name: '', unitId: c.units[0]?.id }] })}>+ Add warehouse</button>}

        {editable && (
          <div className="actions end">
            {saved === 'company' && <span className="ok-note inline">Saved</span>}
            <button className="btn" onClick={saveCompany}>Save company</button>
          </div>
        )}
      </section>

      <section className="card">
        <h2>Pick-lists</h2>
        <p className="muted small">Comma-separated. These fill the dropdowns on the product screen.</p>
        <div className="form-grid">
          {LIST_KEYS.map(({ key, label }) => (
            <div className="field field-full" key={key}>
              <label>{label}</label>
              <textarea rows={2} disabled={!editable} value={l[key]} onChange={(e) => setL({ ...l, [key]: e.target.value })} />
            </div>
          ))}
        </div>
        {editable && (
          <div className="actions end">
            {saved === 'lists' && <span className="ok-note inline">Saved</span>}
            <button className="btn" onClick={saveLists}>Save pick-lists</button>
          </div>
        )}
      </section>
    </div>
  );
}
