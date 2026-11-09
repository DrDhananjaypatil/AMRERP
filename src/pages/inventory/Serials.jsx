import { useEffect, useState } from 'react';
import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { fmtDateTime } from '../../lib/data';
import Scanner from '../../components/Scanner';
import { Badge, Empty, ErrorNote } from '../../components/ui';

const STATUS = {
  in_stock: { label: 'In stock', tone: 'good' },
  sold: { label: 'Sold', tone: 'neutral' },
  removed: { label: 'Removed', tone: 'bad' },
  returned: { label: 'Returned', tone: 'good' },
};

// Look up any serial number: where it is, or who bought it and until when the warranty runs.
export default function Serials() {
  const { company } = useAuth();
  const whName = (id) => company?.warehouses?.find((w) => w.id === id)?.name || id || '—';
  const [text, setText] = useState('');
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [scan, setScan] = useState(false);

  const search = async (raw) => {
    const s = String(raw ?? text).trim().toUpperCase();
    if (!s) return;
    setError(null); setResults(null);
    try {
      // prefix match on the serial number
      const snap = await getDocs(query(collection(db, 'serials'), where('serial', '>=', s), where('serial', '<=', `${s}`), orderBy('serial'), limit(50)));
      setResults(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) { setError(e); setResults([]); }
  };

  useEffect(() => { if (text === '') setResults(null); }, [text]);

  return (
    <div className="page">
      <h1>Serial numbers</h1>
      <p className="muted">Find any pallet truck, stacker or other serial-tracked item: where it is, or which customer has it and until when the warranty runs.</p>

      <form className="toolbar" onSubmit={(e) => { e.preventDefault(); search(); }}>
        <input className="search" placeholder="Type a serial number (or its first characters)" value={text} onChange={(e) => setText(e.target.value)} />
        <button className="btn">Search</button>
        <button type="button" className="btn btn-ghost" onClick={() => setScan(true)}>Scan</button>
      </form>

      <ErrorNote error={error} />

      {results && (results.length === 0 ? <Empty>No serial number starting with “{text.toUpperCase()}”.</Empty> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Serial</th><th>Product</th><th>Status</th><th>Location / customer</th><th>Received</th><th>Warranty until</th></tr></thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.id}>
                  <td><b>{r.serial}</b></td>
                  <td>{r.sku} — {r.productName}</td>
                  <td><Badge tone={STATUS[r.status]?.tone}>{STATUS[r.status]?.label || r.status}</Badge></td>
                  <td>{r.status === 'in_stock' ? whName(r.warehouseId) : r.customerName || r.removedNote || '—'}</td>
                  <td className="small">{fmtDateTime(r.receivedAt)}</td>
                  <td className="small">{r.warrantyUntil ? fmtDateTime(r.warrantyUntil).split(',')[0] : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {scan && <Scanner onScan={(t) => { setText(t); search(t); }} onClose={() => setScan(false)} />}
    </div>
  );
}
