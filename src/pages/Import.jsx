import { useMemo, useState } from 'react';
import { collection, doc, getDocs, writeBatch } from 'firebase/firestore';
import { useSearchParams } from 'react-router-dom';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { downloadExcel, readSheet } from '../lib/excel';
import {
  coerce, customerFields, partyBeforeSave, productBeforeSave, productCostFields, productFields, supplierFields,
} from '../lib/masters';
import { ownerChainFor, stamp } from '../lib/data';
import { ErrorNote } from '../components/ui';

const ROWS_PER_BATCH = 200; // each product row can write 2 documents (product + cost); limit is 500 per batch

export default function Import() {
  const { me, can, lists, company, canSeeCost } = useAuth();
  const [params] = useSearchParams();
  const [type, setType] = useState(['products', 'customers', 'suppliers'].includes(params.get('type')) ? params.get('type') : 'products');
  const [parsed, setParsed] = useState(null); // { rows, unknownCols, fileName }
  const [updateExisting, setUpdateExisting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const config = useMemo(() => {
    if (type === 'products') {
      return { coll: 'products', mod: 'products', fields: productFields(lists), cost: canSeeCost ? productCostFields : [], before: productBeforeSave, key: 'sku' };
    }
    if (type === 'customers') return { coll: 'customers', mod: 'customers', fields: customerFields(company), cost: [], before: partyBeforeSave, scoped: true };
    return { coll: 'suppliers', mod: 'suppliers', fields: supplierFields(), cost: [], before: partyBeforeSave };
  }, [type, lists, company, canSeeCost]);

  const allFields = [...config.fields, ...config.cost];
  const allowed = can(config.mod, 'create');

  const template = () => {
    const sample = {
      products: { sku: 'PU-100-200', category: 'Castor', material: 'PU', diameterMm: 100, capacityKg: 200, bearingType: 'Ball bearing', grade: 'Heavy duty', hsn: '8716', gstRate: 18, uom: 'Nos', reorderLevel: 20, dealerPrice: 450, retailPrice: 550, costPrice: 380 },
      customers: { name: 'Shree Engineering Works', customerType: 'Dealer', priceList: 'Dealer price', phone: '9812345678', gstin: '27ABCDE1234F1Z5', state: 'Maharashtra', city: 'Pune', creditLimit: 200000, creditDays: 30, unitId: company?.units?.[0]?.name },
      suppliers: { name: 'Precision Bearings Pvt Ltd', contactPerson: 'Mr. Shah', phone: '9822012345', state: 'Maharashtra', city: 'Pune', paymentDays: 45 },
    }[type];
    downloadExcel(`AMR-${type}-template`, allFields.map((f) => ({ key: f.key, label: f.label })), [sample]);
  };

  const onFile = async (file) => {
    setError(null); setResult(null); setParsed(null);
    if (!file) return;
    try {
      const raw = await readSheet(file);
      if (!raw.length) throw new Error('The sheet is empty.');
      const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
      const headerMap = {};
      const unknownCols = [];
      for (const h of Object.keys(raw[0])) {
        const f = allFields.find((x) => norm(x.label) === norm(h) || norm(x.key) === norm(h));
        if (f) headerMap[h] = f; else unknownCols.push(h);
      }
      // Unit column: accept the unit's name
      const unitByName = Object.fromEntries((company?.units || []).map((u) => [u.name.toLowerCase(), u.id]));

      const seen = new Set();
      const rows = raw.map((r, i) => {
        const data = {};
        const errors = [];
        for (const [h, f] of Object.entries(headerMap)) {
          let v = r[h];
          if (f.key === 'unitId' && typeof v === 'string' && unitByName[v.trim().toLowerCase()]) v = unitByName[v.trim().toLowerCase()];
          const c = coerce(f, v);
          if (f.type === 'number' && Number.isNaN(c)) errors.push(`${f.label} is not a number`);
          if (c !== undefined && c !== '') data[f.key] = c;
        }
        for (const f of allFields) {
          if (data[f.key] === undefined && f.default !== undefined) data[f.key] = coerce(f, f.default);
          if (f.required && (data[f.key] === undefined || data[f.key] === '' || data[f.key] === null)) errors.push(`${f.label} missing`);
        }
        let out = data;
        if (!errors.length) {
          const res = config.before(data);
          if (res.error) errors.push(res.error); else out = res.data;
        }
        if (config.key && out[config.key]) {
          const k = String(out[config.key]).trim().toUpperCase();
          if (seen.has(k)) errors.push(`Duplicate ${config.key.toUpperCase()} in file`);
          seen.add(k);
        }
        return { line: i + 2, data: out, errors };
      });
      setParsed({ rows, unknownCols, fileName: file.name, mapped: Object.values(headerMap).map((f) => f.label) });
    } catch (e) { setError(e); }
  };

  const good = parsed?.rows.filter((r) => !r.errors.length) || [];
  const bad = parsed?.rows.filter((r) => r.errors.length) || [];

  const run = async () => {
    setBusy(true); setError(null); setResult(null);
    try {
      let existing = {};
      if (config.key) {
        const snap = await getDocs(collection(db, config.coll));
        existing = Object.fromEntries(snap.docs.map((d) => [String(d.data()[config.key]).trim().toUpperCase(), d.id]));
      }
      let created = 0, updated = 0, skipped = 0;
      for (let i = 0; i < good.length; i += ROWS_PER_BATCH) {
        const batch = writeBatch(db);
        for (const r of good.slice(i, i + ROWS_PER_BATCH)) {
          const data = { ...r.data };
          const costData = Object.fromEntries(config.cost.map((f) => [f.key, data[f.key] ?? null]));
          for (const f of config.cost) delete data[f.key];

          if (config.scoped) {
            data.ownerId = me.uid;
            data.ownerChain = ownerChainFor(me);
            if (!data.unitId) data.unitId = company?.units?.[0]?.id;
          }

          const existingId = config.key ? existing[String(data[config.key]).trim().toUpperCase()] : null;
          if (existingId && !updateExisting) { skipped++; continue; }
          const ref = existingId ? doc(db, config.coll, existingId) : doc(collection(db, config.coll));
          batch.set(ref, { ...data, isActive: true, ...stamp(me.uid) }, { merge: true });
          if (config.cost.length && costData.costPrice !== null) {
            batch.set(doc(db, 'productCosts', ref.id), { ...costData, ...stamp(me.uid) }, { merge: true });
          }
          if (existingId) updated++; else created++;
        }
        await batch.commit();
        setProgress(`${Math.min(i + ROWS_PER_BATCH, good.length)} of ${good.length} rows written…`);
      }
      setResult({ created, updated, skipped });
      setParsed(null);
    } catch (e) { setError(e); }
    setBusy(false); setProgress('');
  };

  return (
    <div className="page">
      <h1>Data import</h1>
      <p className="muted">Bring products, customers and suppliers from Miracle or Excel. Export from Miracle to Excel, then match the columns to the template.</p>

      <section className="card stack">
        <div className="form-grid">
          <div className="field">
            <label>What are you importing?</label>
            <select value={type} onChange={(e) => { setType(e.target.value); setParsed(null); setResult(null); }}>
              <option value="products">Products</option>
              <option value="customers">Customers</option>
              <option value="suppliers">Suppliers</option>
            </select>
          </div>
          <div className="field">
            <label>Step 1</label>
            <button className="btn btn-ghost" onClick={template}>Download {type} template</button>
          </div>
        </div>

        {!allowed ? <p className="error-note">Your role cannot add {type}.</p> : (
          <div className="field">
            <label>Step 2 — upload the filled sheet (.xlsx, .xls or .csv)</label>
            <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => onFile(e.target.files?.[0])} />
          </div>
        )}
        {type === 'products' && (
          <label className="check"><input type="checkbox" checked={updateExisting} onChange={(e) => setUpdateExisting(e.target.checked)} /> If a SKU already exists, update it (otherwise skip it)</label>
        )}
        {type === 'customers' && <p className="muted small">Imported customers belong to you. Reassign them to salespeople from the Customers screen.</p>}
        {type === 'products' && !canSeeCost && <p className="muted small">Cost price is not imported because your role cannot see cost.</p>}
      </section>

      <ErrorNote error={error} />

      {parsed && (
        <section className="card stack">
          <h2>Check before importing — {parsed.fileName}</h2>
          <p><b>{good.length}</b> rows ready{bad.length > 0 && <>, <b className="text-bad">{bad.length}</b> rows with problems (these will be skipped)</>}.</p>
          <p className="muted small">Columns matched: {parsed.mapped.join(', ') || 'none'}</p>
          {parsed.unknownCols.length > 0 && <p className="muted small">Columns ignored (not recognised): {parsed.unknownCols.join(', ')}</p>}

          {bad.length > 0 && (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Excel row</th><th>Problem</th></tr></thead>
                <tbody>{bad.slice(0, 50).map((r) => <tr key={r.line}><td>{r.line}</td><td>{r.errors.join('; ')}</td></tr>)}</tbody>
              </table>
              {bad.length > 50 && <p className="muted small">…and {bad.length - 50} more.</p>}
            </div>
          )}

          <div className="actions end">
            {progress && <span className="muted">{progress}</span>}
            <button className="btn" disabled={busy || !good.length} onClick={run}>{busy ? 'Importing…' : `Import ${good.length} rows`}</button>
          </div>
        </section>
      )}

      {result && (
        <div className="ok-note">Done: {result.created} added, {result.updated} updated{result.skipped ? `, ${result.skipped} skipped` : ''}.</div>
      )}

      <section className="card muted small">
        Opening stock, opening customer and supplier balances, and bank balances are imported in Phase 1 and Phase 2,
        on the date you choose to start using the system.
      </section>
    </div>
  );
}
