import { useState } from 'react';
import { callPostStockMove } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { useProducts } from '../../lib/hooks';
import { downloadExcel, readSheet } from '../../lib/excel';
import { ErrorNote } from '../../components/ui';

// Opening stock from Excel: SKU, Warehouse, Quantity, Serial numbers.
// Posted through the same server function as manual stock entry, in batches.
const COLS = [
  { key: 'sku', label: 'SKU / item code' },
  { key: 'warehouse', label: 'Warehouse' },
  { key: 'qty', label: 'Quantity' },
  { key: 'serials', label: 'Serial numbers' },
];
const MAX_LINES = 50;
const MAX_SERIALS = 250;
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const serialList = (s) => String(s || '').split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean);

export default function OpeningStockImport({ setType }) {
  const { company, can } = useAuth();
  const warehouses = company?.warehouses || [];
  const { bySku, loading } = useProducts();
  const [parsed, setParsed] = useState(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const template = () => downloadExcel('AMR-opening-stock-template', COLS, [
    { sku: 'PU-100-200', warehouse: warehouses[0]?.name, qty: 120, serials: '' },
    { sku: 'HPT-3T', warehouse: warehouses[0]?.name, qty: 2, serials: 'HPT3T-0001, HPT3T-0002' },
  ]);

  const onFile = async (file) => {
    setError(null); setResult(null); setParsed(null);
    if (!file) return;
    try {
      const raw = await readSheet(file);
      if (!raw.length) throw new Error('The sheet is empty.');
      const head = Object.keys(raw[0]);
      const col = Object.fromEntries(COLS.map((c) => [c.key, head.find((h) => norm(h) === norm(c.label) || norm(h) === norm(c.key))]));
      if (!col.sku || !col.qty) throw new Error('The sheet needs at least the “SKU / item code” and “Quantity” columns. Use the template.');
      const whByName = Object.fromEntries(warehouses.map((w) => [w.name.toLowerCase(), w.id]));

      const rows = raw.map((r, i) => {
        const errors = [];
        const sku = String(r[col.sku] ?? '').trim().toUpperCase();
        const p = bySku[sku];
        if (!sku) errors.push('SKU missing');
        else if (!p) errors.push(`SKU ${sku} not found in Products`);
        const whRaw = col.warehouse ? String(r[col.warehouse] ?? '').trim() : '';
        const warehouseId = whRaw ? whByName[whRaw.toLowerCase()] || warehouses.find((w) => w.id === whRaw)?.id : warehouses[0]?.id;
        if (!warehouseId) errors.push(`Warehouse “${whRaw}” not found`);
        const qty = Number(String(r[col.qty] ?? '').replace(/[,\s]/g, ''));
        if (!Number.isFinite(qty) || qty <= 0) errors.push('Quantity must be more than 0');
        const serials = col.serials ? serialList(r[col.serials]) : [];
        if (p?.trackSerial && serials.length !== qty) errors.push(`${p.name} needs ${qty} serial number(s), ${serials.length} given`);
        if (p && !p.trackSerial && serials.length) errors.push('Serial numbers given but product is not serial-tracked');
        return { line: i + 2, productId: p?.id, name: p?.name, warehouseId, qty, serials, errors };
      });
      setParsed({ rows, fileName: file.name });
    } catch (e) { setError(e); }
  };

  const good = parsed?.rows.filter((r) => !r.errors.length) || [];
  const bad = parsed?.rows.filter((r) => r.errors.length) || [];

  const run = async () => {
    setBusy(true); setError(null); setResult(null);
    // Split into batches the server accepts.
    const batches = [];
    let cur = []; let ser = 0;
    for (const r of good) {
      if (cur.length >= MAX_LINES || ser + r.serials.length > MAX_SERIALS) { batches.push(cur); cur = []; ser = 0; }
      cur.push(r); ser += r.serials.length;
    }
    if (cur.length) batches.push(cur);

    let posted = 0;
    const failed = [];
    for (let i = 0; i < batches.length; i++) {
      setProgress(`Posting batch ${i + 1} of ${batches.length}…`);
      try {
        await callPostStockMove({
          kind: 'opening',
          note: `Imported from ${parsed.fileName}`,
          lines: batches[i].map((r) => ({ productId: r.productId, warehouseId: r.warehouseId, qty: r.qty, serials: r.serials })),
        });
        posted += batches[i].length;
      } catch (e) {
        failed.push(`Rows ${batches[i][0].line}–${batches[i].at(-1).line}: ${e.message}`);
      }
    }
    setResult({ posted, failed });
    if (!failed.length) setParsed(null);
    setBusy(false); setProgress('');
  };

  return (
    <div className="page">
      <h1>Data import</h1>
      <p className="muted">Opening stock: what is physically in each warehouse on the day you start. Count first, then import.</p>

      <section className="card stack">
        <div className="form-grid">
          <div className="field">
            <label>What are you importing?</label>
            <select value="openingStock" onChange={(e) => setType(e.target.value)}>
              <option value="products">Products</option>
              <option value="customers">Customers</option>
              <option value="suppliers">Suppliers</option>
              <option value="openingStock">Opening stock</option>
            </select>
          </div>
          <div className="field">
            <label>Step 1</label>
            <button className="btn btn-ghost" onClick={template}>Download opening stock template</button>
          </div>
        </div>
        <ul className="muted small">
          <li>Products must already exist (import Products first). Match them by SKU.</li>
          <li>Warehouse names: {warehouses.map((w) => `“${w.name}”`).join(', ')}. Left blank = {warehouses[0]?.name}.</li>
          <li>For serial-tracked items, list every serial number in the last column, separated by commas. Quantity must equal the number of serials.</li>
          <li>Importing the same file twice adds the stock twice. Check the Stock screen after importing.</li>
        </ul>
        {!can('inventory', 'create') ? <p className="error-note">Your role cannot post opening stock.</p> : (
          <div className="field">
            <label>Step 2 — upload the filled sheet</label>
            <input type="file" accept=".xlsx,.xls,.csv" disabled={loading} onChange={(e) => onFile(e.target.files?.[0])} />
          </div>
        )}
      </section>

      <ErrorNote error={error} />

      {parsed && (
        <section className="card stack">
          <h2>Check before importing — {parsed.fileName}</h2>
          <p><b>{good.length}</b> rows ready, total quantity <b>{good.reduce((n, r) => n + r.qty, 0).toLocaleString('en-IN')}</b>
            {bad.length > 0 && <>; <b className="text-bad">{bad.length}</b> rows with problems (skipped)</>}.</p>
          {bad.length > 0 && (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Excel row</th><th>Problem</th></tr></thead>
                <tbody>{bad.slice(0, 50).map((r) => <tr key={r.line}><td>{r.line}</td><td>{r.errors.join('; ')}</td></tr>)}</tbody>
              </table>
            </div>
          )}
          <div className="actions end">
            {progress && <span className="muted">{progress}</span>}
            <button className="btn" disabled={busy || !good.length} onClick={run}>{busy ? 'Importing…' : `Post opening stock for ${good.length} rows`}</button>
          </div>
        </section>
      )}

      {result && (
        <>
          <div className="ok-note">Posted {result.posted} row(s) as opening stock.</div>
          {result.failed.length > 0 && <div className="error-note">Not posted — fix and re-upload only these rows:<br />{result.failed.map((f) => <div key={f}>{f}</div>)}</div>}
        </>
      )}
    </div>
  );
}
