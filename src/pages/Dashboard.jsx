import { useEffect, useState } from 'react';
import { collection, getCountFromServer, query, where } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { scopedQuery } from '../lib/data';

// Phase 0 dashboard: setup progress. Sales, profit, GST and cash tiles arrive with Phases 1 and 2.
export default function Dashboard() {
  const { me, can, scopeOf, isOwner, company } = useAuth();
  const [counts, setCounts] = useState({});

  useEffect(() => {
    const jobs = [];
    const count = (key, q) => jobs.push(getCountFromServer(q).then((s) => [key, s.data().count]).catch(() => [key, null]));
    if (can('products')) count('products', query(collection(db, 'products'), where('isActive', '==', true)));
    if (can('customers')) count('customers', scopedQuery('customers', scopeOf('customers'), me));
    if (can('suppliers')) count('suppliers', query(collection(db, 'suppliers'), where('isActive', '==', true)));
    if (can('staff')) count('staff', query(collection(db, 'users'), where('active', '==', true)));
    Promise.all(jobs).then((r) => setCounts(Object.fromEntries(r)));
  }, [me, can, scopeOf]);

  const tiles = [
    { key: 'products', label: 'Active products', to: '/products' },
    { key: 'customers', label: 'Customers', to: '/customers' },
    { key: 'suppliers', label: 'Suppliers', to: '/suppliers' },
    { key: 'staff', label: 'Active staff', to: '/staff' },
  ].filter((t) => counts[t.key] !== undefined);

  const unitsMissingGstin = (company?.units || []).filter((u) => !u.gstin);

  return (
    <div className="page">
      <h1>Welcome, {me.name}</h1>
      <div className="tiles">
        {tiles.map((t) => (
          <Link key={t.key} to={t.to} className="tile">
            <div className="tile-value">{counts[t.key] ?? '—'}</div>
            <div className="tile-label">{t.label}</div>
          </Link>
        ))}
      </div>

      {isOwner && (
        <section className="card">
          <h2>Setup checklist</h2>
          <ul className="checklist">
            <li className={unitsMissingGstin.length ? '' : 'done'}>
              Add GSTIN and address for each unit in <Link to="/settings">Company settings</Link>
              {unitsMissingGstin.length > 0 && <span className="muted"> — missing for {unitsMissingGstin.map((u) => u.name).join(', ')}</span>}
            </li>
            <li>Review default roles and approval limits in <Link to="/roles">Roles &amp; permissions</Link></li>
            <li className={counts.staff > 1 ? 'done' : ''}>Add staff and set who reports to whom in <Link to="/staff">Staff &amp; hierarchy</Link></li>
            <li className={counts.products > 0 ? 'done' : ''}>Import products from Miracle / Excel in <Link to="/import">Data import</Link></li>
            <li className={counts.customers > 0 ? 'done' : ''}>Import customers and suppliers</li>
          </ul>
        </section>
      )}

      <section className="card muted">
        Sales, profit, outstanding, stock value, GST payable and cash tiles appear here from Phase 1 and Phase 2.
      </section>
    </div>
  );
}
