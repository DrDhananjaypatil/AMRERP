import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { useProducts } from '../../lib/hooks';
import { LOGOS } from '../../lib/brand';
import ProductPicker from '../../components/ProductPicker';
import { ErrorNote } from '../../components/ui';

// Printable QR labels on A4. Product labels carry the SKU; serial labels carry the serial number.
// The same QR codes are read by "Scan" on Stock entry, Serial numbers and (from Phase 1B) invoices.
const SIZES = {
  small: { label: 'Small — 4 × 10 per A4 (48 × 25 mm)', cols: 4, cls: 'lbl-small' },
  medium: { label: 'Medium — 3 × 8 per A4 (64 × 34 mm)', cols: 3, cls: 'lbl-medium' },
  large: { label: 'Large — 2 × 5 per A4 (96 × 55 mm)', cols: 2, cls: 'lbl-large' },
};

export default function Labels() {
  const { company } = useAuth();
  const { products, byId } = useProducts();
  const [mode, setMode] = useState('product');
  const [size, setSize] = useState('medium');
  const [unitId, setUnitId] = useState(company?.units?.[0]?.id || 'amr-wheels');
  const [items, setItems] = useState([]); // product mode: [{productId, copies}]
  const [serialProduct, setSerialProduct] = useState('');
  const [serials, setSerials] = useState([]); // [{serial, checked}]
  const [qr, setQr] = useState({});
  const [error, setError] = useState(null);

  // Load in-stock serials for the chosen product
  useEffect(() => {
    if (mode !== 'serial' || !serialProduct) { setSerials([]); return; }
    getDocs(query(collection(db, 'serials'), where('productId', '==', serialProduct), where('status', '==', 'in_stock')))
      .then((s) => setSerials(s.docs.map((d) => ({ serial: d.data().serial, checked: true })).sort((a, b) => a.serial.localeCompare(b.serial))))
      .catch(setError);
  }, [mode, serialProduct]);

  // The label list is derived directly from the choices (no extra state, so no render loops).
  const labels = useMemo(() => {
    if (mode === 'product') {
      return items.flatMap((it) => {
        const p = byId[it.productId];
        if (!p) return [];
        return Array.from({ length: Math.max(1, Math.min(200, Number(it.copies) || 1)) }, () => ({ code: p.sku, title: p.sku, sub: p.name }));
      });
    }
    const p = byId[serialProduct];
    return serials.filter((s) => s.checked).map((s) => ({ code: s.serial, title: `S/N ${s.serial}`, sub: p ? `${p.sku} — ${p.name}` : '' }));
  }, [mode, items, serials, serialProduct, byId]);

  // Generate QR images (cached by code); only runs when the set of codes changes
  const codesKey = [...new Set(labels.map((l) => l.code))].sort().join('\n');
  useEffect(() => {
    const missing = codesKey ? codesKey.split('\n').filter((c) => !qr[c]) : [];
    if (!missing.length) return;
    let cancelled = false;
    Promise.all(missing.map((c) => QRCode.toDataURL(c, { margin: 0, width: 240, errorCorrectionLevel: 'M' }).then((url) => [c, url])))
      .then((pairs) => { if (!cancelled) setQr((q) => ({ ...q, ...Object.fromEntries(pairs) })); })
      .catch(setError);
    return () => { cancelled = true; };
  }, [codesKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const logo = LOGOS[unitId]?.color;

  return (
    <div className="page">
      <div className="no-print">
        <div className="page-head">
          <div>
            <h1>QR labels</h1>
            <p className="muted">Print labels on plain A4 or A4 sticker sheets. Scan them with a phone in Stock entry and Serial numbers.</p>
          </div>
          <div className="actions">
            <button className="btn" disabled={!labels.length} onClick={() => window.print()}>Print {labels.length} label(s)</button>
          </div>
        </div>

        <section className="card">
          <div className="form-grid">
            <div className="field">
              <label>Label type</label>
              <select value={mode} onChange={(e) => setMode(e.target.value)}>
                <option value="product">Product labels (QR = SKU) — for shelves and bins</option>
                <option value="serial">Serial number labels — for pallet trucks, stackers</option>
              </select>
            </div>
            <div className="field">
              <label>Label size</label>
              <select value={size} onChange={(e) => setSize(e.target.value)}>
                {Object.entries(SIZES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Logo on label</label>
              <select value={unitId} onChange={(e) => setUnitId(e.target.value)}>
                {(company?.units || []).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                <option value="none">No logo</option>
              </select>
            </div>
          </div>

          {mode === 'product' ? (
            <>
              <h3>Products</h3>
              {items.map((it, i) => (
                <div key={i} className="label-row">
                  <div className="grow"><ProductPicker products={products} value={it.productId} onChange={(id) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, productId: id } : x)))} /></div>
                  <input type="number" min="1" max="200" className="copies" value={it.copies} onChange={(e) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, copies: e.target.value } : x)))} title="Number of copies" />
                  <span className="muted small">copies</span>
                  <button className="btn-icon" onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))} aria-label="Remove">×</button>
                </div>
              ))}
              <button className="btn btn-ghost btn-sm" onClick={() => setItems((xs) => [...xs, { productId: '', copies: 1 }])}>+ Add product</button>
            </>
          ) : (
            <>
              <h3>Product</h3>
              <ProductPicker products={products.filter((p) => p.trackSerial)} value={serialProduct} onChange={setSerialProduct} placeholder="Choose a serial-tracked product…" />
              {serialProduct && (
                <div className="serial-pick">
                  {serials.length === 0 ? <p className="muted small">No serial numbers in stock for this product.</p> : (
                    <>
                      <label className="check"><input type="checkbox" checked={serials.every((s) => s.checked)} onChange={(e) => setSerials((ss) => ss.map((s) => ({ ...s, checked: e.target.checked })))} /> Select all ({serials.length})</label>
                      <div className="serial-grid">
                        {serials.map((s, i) => (
                          <label key={s.serial} className="chip check">
                            <input type="checkbox" checked={s.checked} onChange={(e) => setSerials((ss) => ss.map((x, j) => (j === i ? { ...x, checked: e.target.checked } : x)))} /> {s.serial}
                          </label>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </section>
        <ErrorNote error={error} />
        {labels.length > 0 && <h3>Preview</h3>}
      </div>

      <div className={`label-sheet ${SIZES[size].cls}`} style={{ gridTemplateColumns: `repeat(${SIZES[size].cols}, 1fr)` }}>
        {labels.map((l, i) => (
          <div key={i} className="label">
            {qr[l.code] ? <img className="label-qr" src={qr[l.code]} alt={l.code} /> : <div className="label-qr" />}
            <div className="label-text">
              {logo && unitId !== 'none' && <img className="label-logo" src={logo} alt="" />}
              <div className="label-title">{l.title}</div>
              <div className="label-sub">{l.sub}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
