import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { callPostStockMove } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { useProducts } from '../../lib/hooks';
import ProductPicker from '../../components/ProductPicker';
import Scanner from '../../components/Scanner';
import { ErrorNote } from '../../components/ui';

const KINDS = [
  { id: 'opening', label: 'Opening stock', perm: 'create', help: 'Stock you already have when you start using the system.' },
  { id: 'adjust_in', label: 'Adjustment — add', perm: 'edit', help: 'Found extra stock, count correction upwards. Reason required.' },
  { id: 'adjust_out', label: 'Adjustment — remove', perm: 'edit', help: 'Damaged, lost, scrapped, count correction downwards. Reason required.' },
  { id: 'transfer', label: 'Transfer between warehouses', perm: 'create', help: 'Move stock between AMR Wheels and AMR Technofab stores.' },
];

const blankLine = () => ({ key: Math.random().toString(36).slice(2), productId: '', qty: '', serials: '' });
const serialList = (s) => String(s || '').split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean);

export default function StockEntry() {
  const { company, can } = useAuth();
  const navigate = useNavigate();
  const warehouses = company?.warehouses || [];
  const { products, byId, bySku } = useProducts();
  const allowed = KINDS.filter((k) => can('inventory', k.perm));

  const [kind, setKind] = useState(allowed[0]?.id || 'opening');
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id || '');
  const [toWarehouseId, setToWarehouseId] = useState(warehouses[1]?.id || '');
  const [note, setNote] = useState('');
  const [lines, setLines] = useState([blankLine()]);
  const [scanFor, setScanFor] = useState(null); // line key, or 'product'
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);

  const k = KINDS.find((x) => x.id === kind);
  const setLine = (key, patch) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  // A scan is either a serial (added to that line) or a product SKU (adds a new line).
  const onScan = (text) => {
    if (scanFor === 'product') {
      const p = bySku[text.trim().toUpperCase()];
      if (!p) { setError(`No product with SKU “${text}”.`); return; }
      setLines((ls) => {
        const existing = ls.find((l) => l.productId === p.id && !p.trackSerial);
        if (existing) return ls.map((l) => (l === existing ? { ...l, qty: String((Number(l.qty) || 0) + 1) } : l));
        const empty = ls.find((l) => !l.productId);
        const nl = { ...(empty || blankLine()), productId: p.id, qty: p.trackSerial ? '' : '1' };
        return empty ? ls.map((l) => (l === empty ? nl : l)) : [...ls, nl];
      });
    } else {
      setLines((ls) => ls.map((l) => {
        if (l.key !== scanFor) return l;
        const list = serialList(l.serials);
        if (list.map((s) => s.toUpperCase()).includes(text.trim().toUpperCase())) return l;
        const next = [...list, text.trim()];
        return { ...l, serials: next.join('\n'), qty: String(next.length) };
      }));
    }
  };

  const submit = async () => {
    setError(null); setDone(null);
    const filled = lines.filter((l) => l.productId);
    if (!filled.length) return setError('Add at least one item.');
    if ((kind === 'adjust_in' || kind === 'adjust_out') && !note.trim()) return setError('Write the reason for this adjustment.');
    setBusy(true);
    try {
      const res = await callPostStockMove({
        kind,
        note,
        lines: filled.map((l) => ({
          productId: l.productId,
          warehouseId,
          ...(kind === 'transfer' ? { toWarehouseId } : {}),
          qty: Number(l.qty),
          serials: serialList(l.serials),
        })),
      });
      setDone(res.data);
      setLines([blankLine()]);
      setNote('');
    } catch (e) { setError(e); }
    setBusy(false);
  };

  if (!allowed.length) return <div className="page"><h1>Stock entry</h1><p className="muted">Your role cannot post stock entries.</p></div>;

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Stock entry</h1><p className="muted">{k.help}</p></div>
        <div className="actions">
          <button className="btn btn-ghost" onClick={() => setScanFor('product')}>Scan product QR</button>
        </div>
      </div>

      <section className="card">
        <div className="form-grid">
          <div className="field">
            <label>Type</label>
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              {allowed.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label>{kind === 'transfer' ? 'From warehouse' : 'Warehouse'}</label>
            <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          {kind === 'transfer' && (
            <div className="field">
              <label>To warehouse</label>
              <select value={toWarehouseId} onChange={(e) => setToWarehouseId(e.target.value)}>
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
          )}
          <div className="field field-full">
            <label>{kind.startsWith('adjust') ? 'Reason *' : 'Note (optional)'}</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={kind.startsWith('adjust') ? 'e.g. 2 wheels damaged in transit' : ''} />
          </div>
        </div>
      </section>

      <section className="card">
        <h2>Items</h2>
        <div className="entry-lines">
          {lines.map((l, i) => {
            const p = byId[l.productId];
            const serials = serialList(l.serials);
            return (
              <div key={l.key} className="entry-line">
                <div className="entry-no">{i + 1}</div>
                <div className="entry-product">
                  <ProductPicker products={products} value={l.productId} onChange={(id, prod) => setLine(l.key, { productId: id, qty: prod.trackSerial ? String(serialList(l.serials).length || '') : l.qty })} />
                </div>
                <div className="entry-qty">
                  <input
                    type="number" min="0" step="any" placeholder="Qty" value={l.qty}
                    readOnly={p?.trackSerial}
                    title={p?.trackSerial ? 'Quantity = number of serial numbers' : ''}
                    onChange={(e) => setLine(l.key, { qty: e.target.value })}
                  />
                  <span className="muted small">{p?.uom}</span>
                </div>
                <button type="button" className="btn-icon" aria-label="Remove line" onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : [blankLine()]))}>×</button>
                {p?.trackSerial && (
                  <div className="entry-serials">
                    <textarea
                      rows={2}
                      placeholder="Serial numbers — one per line, or separated by commas"
                      value={l.serials}
                      onChange={(e) => setLine(l.key, { serials: e.target.value, qty: String(serialList(e.target.value).length) })}
                    />
                    <div className="actions">
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setScanFor(l.key)}>Scan serials</button>
                      <span className="muted small">{serials.length} serial(s)</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => setLines((ls) => [...ls, blankLine()])}>+ Add line</button>
      </section>

      <ErrorNote error={error} />
      {done && <div className="ok-note">Saved {done.entryNo} — {done.lines} line(s). Stock is updated.</div>}

      <div className="actions end">
        <button className="btn btn-ghost" onClick={() => navigate('/stock')}>View stock</button>
        <button className="btn" disabled={busy} onClick={submit}>{busy ? 'Saving…' : `Save ${k.label.toLowerCase()}`}</button>
      </div>

      {scanFor && (
        <Scanner
          continuous
          title={scanFor === 'product' ? 'Scan product QR labels' : 'Scan serial numbers'}
          onScan={onScan}
          onClose={() => setScanFor(null)}
        />
      )}
    </div>
  );
}
