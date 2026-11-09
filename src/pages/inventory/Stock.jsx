import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { useCollection, useProducts } from '../../lib/hooks';
import { fmtDateTime, inr } from '../../lib/data';
import { downloadExcel } from '../../lib/excel';
import { Badge, Empty, ErrorNote, Modal } from '../../components/ui';

const fmtQty = (n) => (n === undefined || n === null ? '' : Number(n).toLocaleString('en-IN', { maximumFractionDigits: 3 }));

export default function Stock() {
  const { company, can, canSeeCost } = useAuth();
  const warehouses = company?.warehouses || [];
  const { products, loading } = useProducts();
  const [stockRows, stockErr] = useCollection('stock');
  const [costRows] = useCollection('productCosts', canSeeCost);
  const [search, setSearch] = useState('');
  const [view, setView] = useState('instock'); // instock | low | all
  const [category, setCategory] = useState('');
  const [open, setOpen] = useState(null);

  const qty = useMemo(() => {
    const m = {};
    for (const s of stockRows || []) {
      m[s.productId] = m[s.productId] || { total: 0 };
      m[s.productId][s.warehouseId] = s.qty;
      m[s.productId].total += Number(s.qty) || 0;
    }
    return m;
  }, [stockRows]);
  const cost = useMemo(() => Object.fromEntries((costRows || []).map((c) => [c.id, c.costPrice])), [costRows]);

  const statusOf = (p) => {
    const t = qty[p.id]?.total || 0;
    if (t <= 0) return 'out';
    if (p.reorderLevel && t <= p.reorderLevel) return 'low';
    return 'ok';
  };

  const categories = [...new Set(products.map((p) => p.category).filter(Boolean))].sort();
  const rows = useMemo(() => {
    const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return products.filter((p) => {
      if (category && p.category !== category) return false;
      const st = statusOf(p);
      if (view === 'instock' && st === 'out') return false;
      if (view === 'low' && !(st === 'low' || (st === 'out' && p.reorderLevel))) return false;
      if (!words.length) return true;
      const hay = `${p.sku} ${p.name} ${p.category} ${p.material || ''}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [products, qty, search, view, category]); // eslint-disable-line react-hooks/exhaustive-deps

  const lowCount = products.filter((p) => p.reorderLevel && (qty[p.id]?.total || 0) <= p.reorderLevel).length;
  const inStockCount = products.filter((p) => (qty[p.id]?.total || 0) > 0).length;
  const stockValue = canSeeCost
    ? products.reduce((sum, p) => sum + (qty[p.id]?.total || 0) * (Number(cost[p.id]) || 0), 0)
    : null;

  const doExport = () => {
    const cols = [
      { key: 'sku', label: 'SKU' }, { key: 'name', label: 'Item' }, { key: 'category', label: 'Category' },
      ...warehouses.map((w) => ({ key: `w_${w.id}`, label: w.name })),
      { key: 'total', label: 'Total' }, { key: 'reorderLevel', label: 'Reorder level' },
      ...(canSeeCost ? [{ key: 'cost', label: 'Cost price' }, { key: 'value', label: 'Stock value' }] : []),
    ];
    const data = rows.map((p) => ({
      ...p,
      ...Object.fromEntries(warehouses.map((w) => [`w_${w.id}`, qty[p.id]?.[w.id] || 0])),
      total: qty[p.id]?.total || 0,
      cost: cost[p.id] ?? '',
      value: canSeeCost ? (qty[p.id]?.total || 0) * (Number(cost[p.id]) || 0) : '',
    }));
    downloadExcel(`stock-${new Date().toISOString().slice(0, 10)}`, cols, data);
  };

  if (loading || !stockRows) return <div className="page"><h1>Stock</h1><p className="muted">Loading…</p></div>;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Stock</h1>
          <p className="muted">Live quantity in each warehouse. Click an item to see its movements and serial numbers.</p>
        </div>
        <div className="actions">
          {can('inventory', 'export') && <button className="btn btn-ghost" onClick={doExport}>Export to Excel</button>}
          {(can('inventory', 'create') || can('inventory', 'edit')) && <Link className="btn" to="/stock/entry">+ Stock entry</Link>}
        </div>
      </div>

      <ErrorNote error={stockErr} />

      <div className="tiles">
        <div className="tile"><div className="tile-value">{inStockCount}</div><div className="tile-label">Items in stock</div></div>
        <button className={`tile tile-btn ${view === 'low' ? 'tile-active' : ''}`} onClick={() => setView(view === 'low' ? 'instock' : 'low')}>
          <div className={`tile-value ${lowCount ? 'text-bad' : ''}`}>{lowCount}</div><div className="tile-label">At or below reorder level</div>
        </button>
        {stockValue !== null && <div className="tile"><div className="tile-value">{inr(Math.round(stockValue))}</div><div className="tile-label">Stock value at cost</div></div>}
      </div>

      <div className="toolbar">
        <input className="search" placeholder="Search SKU, name, material…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select value={view} onChange={(e) => setView(e.target.value)}>
          <option value="instock">Items in stock</option>
          <option value="low">Low / out (reorder needed)</option>
          <option value="all">All products</option>
        </select>
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All categories</option>
          {categories.map((c) => <option key={c}>{c}</option>)}
        </select>
        <span className="muted">{rows.length} items</span>
      </div>

      {rows.length === 0 ? (
        <Empty>{products.length === 0 ? 'Add or import products first.' : view === 'instock' ? 'No stock yet. Use “+ Stock entry” → Opening stock, or import opening stock from Excel.' : 'Nothing to show.'}</Empty>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>SKU</th><th>Item</th>
                {warehouses.map((w) => <th key={w.id} className="num">{w.name}</th>)}
                <th className="num">Total</th><th className="num">Reorder at</th>
                {canSeeCost && <th className="num">Value</th>}
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const st = statusOf(p);
                return (
                  <tr key={p.id} onClick={() => setOpen(p)}>
                    <td className="nowrap"><b>{p.sku}</b></td>
                    <td>{p.name}{p.trackSerial && <span className="badge" style={{ marginLeft: 6 }}>Serial</span>}</td>
                    {warehouses.map((w) => <td key={w.id} className="num">{fmtQty(qty[p.id]?.[w.id] || 0)}</td>)}
                    <td className="num"><b>{fmtQty(qty[p.id]?.total || 0)}</b> <span className="muted small">{p.uom}</span></td>
                    <td className="num muted">{p.reorderLevel ?? ''}</td>
                    {canSeeCost && <td className="num">{inr(Math.round((qty[p.id]?.total || 0) * (Number(cost[p.id]) || 0)))}</td>}
                    <td>{st === 'out' ? <Badge tone="bad">Out</Badge> : st === 'low' ? <Badge tone="bad">Low</Badge> : null}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {open && <ProductStockModal product={open} qty={qty[open.id] || {}} warehouses={warehouses} onClose={() => setOpen(null)} />}
    </div>
  );
}

function ProductStockModal({ product, qty, warehouses, onClose }) {
  const [moves, setMoves] = useState(null);
  const [serials, setSerials] = useState(null);
  const [error, setError] = useState(null);
  const whName = (id) => warehouses.find((w) => w.id === id)?.name || id;

  useEffect(() => onSnapshot(
    query(collection(db, 'stockMoves'), where('productId', '==', product.id), orderBy('at', 'desc'), limit(100)),
    (s) => setMoves(s.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (e) => { setError(e); setMoves([]); },
  ), [product.id]);

  useEffect(() => {
    if (!product.trackSerial) { setSerials([]); return; }
    return onSnapshot(
      query(collection(db, 'serials'), where('productId', '==', product.id), where('status', '==', 'in_stock')),
      (s) => setSerials(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.serial.localeCompare(b.serial))),
      (e) => { setError(e); setSerials([]); },
    );
  }, [product.id, product.trackSerial]);

  return (
    <Modal title={`${product.sku} — ${product.name}`} onClose={onClose} wide>
      <div className="chips">
        {warehouses.map((w) => <span key={w.id} className="chip">{w.name}: <b>{fmtQty(qty[w.id] || 0)}</b></span>)}
        <span className="chip chip-strong">Total: <b>{fmtQty(qty.total || 0)}</b> {product.uom}</span>
      </div>
      <ErrorNote error={error} />

      {product.trackSerial && (
        <>
          <h3>Serial numbers in stock ({serials?.length ?? '…'})</h3>
          {serials && serials.length > 0 ? (
            <div className="serial-grid">
              {serials.map((s) => <span key={s.id} className="chip" title={whName(s.warehouseId)}>{s.serial} <small className="muted">· {whName(s.warehouseId)}</small></span>)}
            </div>
          ) : <p className="muted small">None.</p>}
        </>
      )}

      <h3>Movements (latest 100)</h3>
      {!moves ? <p className="muted">Loading…</p> : moves.length === 0 ? <p className="muted small">No movements yet.</p> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>When</th><th>Type</th><th>Warehouse</th><th className="num">Qty</th><th>Ref / note</th><th>By</th></tr></thead>
            <tbody>
              {moves.map((m) => (
                <tr key={m.id}>
                  <td className="nowrap small">{fmtDateTime(m.at)}</td>
                  <td>{m.kindLabel}{m.otherWarehouseId && <span className="muted small"> {m.qty < 0 ? '→' : '←'} {whName(m.otherWarehouseId)}</span>}</td>
                  <td>{whName(m.warehouseId)}</td>
                  <td className={`num ${m.qty < 0 ? 'text-bad' : 'text-good'}`}>{m.qty > 0 ? '+' : ''}{fmtQty(m.qty)}</td>
                  <td className="small">{m.refNo || m.entryNo}{m.note && <div className="muted">{m.note}</div>}{m.serials?.length > 0 && <div className="muted">{m.serials.join(', ')}</div>}</td>
                  <td className="small">{m.byName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
