import { Fragment, useEffect, useMemo, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { fmtDateTime } from '../lib/data';
import { Badge, Empty, ErrorNote } from '../components/ui';

const COLLECTIONS = ['products', 'productCosts', 'customers', 'suppliers', 'users', 'roles', 'config'];
const TONE = { create: 'good', update: 'neutral', deactivate: 'bad', reactivate: 'good', delete: 'bad' };
const PAGE = 100;

const show = (v) => {
  if (v === null || v === undefined || v === '') return '—';
  if (v && typeof v === 'object' && '_seconds' in v) return fmtDateTime(new Date(v._seconds * 1000));
  if (v && v.toDate) return fmtDateTime(v);
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
};

export default function AuditLog() {
  const [logs, setLogs] = useState(null);
  const [users, setUsers] = useState({});
  const [coll, setColl] = useState('');
  const [by, setBy] = useState('');
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(null);

  useEffect(() => onSnapshot(collection(db, 'users'), (s) =>
    setUsers(Object.fromEntries(s.docs.map((d) => [d.id, d.data().name])))), []);

  useEffect(() => {
    const parts = [collection(db, 'auditLogs')];
    if (coll) parts.push(where('collection', '==', coll));
    if (by) parts.push(where('by', '==', by));
    parts.push(orderBy('at', 'desc'), limit(PAGE));
    setLogs(null);
    return onSnapshot(query(...parts), (s) => setLogs(s.docs.map((d) => ({ id: d.id, ...d.data() }))), (e) => { setError(e); setLogs([]); });
  }, [coll, by]);

  const people = useMemo(() => Object.entries(users).sort((a, b) => a[1].localeCompare(b[1])), [users]);

  return (
    <div className="page">
      <h1>Audit log</h1>
      <p className="muted">Every create, edit and deactivation, with who did it and the old and new values. Nobody can edit or delete these entries.</p>

      <div className="toolbar">
        <select value={coll} onChange={(e) => setColl(e.target.value)}>
          <option value="">All areas</option>
          {COLLECTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={by} onChange={(e) => setBy(e.target.value)}>
          <option value="">All people</option>
          {people.map(([uid, name]) => <option key={uid} value={uid}>{name}</option>)}
        </select>
        <span className="muted">Latest {PAGE}</span>
      </div>

      <ErrorNote error={error} />

      {!logs ? <p className="muted">Loading…</p> : logs.length === 0 ? <Empty>No entries.</Empty> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Area</th><th>Record</th><th>Fields changed</th></tr></thead>
            <tbody>
              {logs.map((l) => (
                <Fragment key={l.id}>
                  <tr onClick={() => setOpen(open === l.id ? null : l.id)}>
                    <td className="nowrap">{fmtDateTime(l.at)}</td>
                    <td>{users[l.by] || (l.by === 'system' ? 'System' : l.by)}</td>
                    <td><Badge tone={TONE[l.action]}>{l.action}</Badge></td>
                    <td>{l.collection}</td>
                    <td>{l.label}</td>
                    <td className="small">{Object.keys(l.changes || {}).join(', ')}</td>
                  </tr>
                  {open === l.id && (
                    <tr className="detail-row">
                      <td colSpan={6}>
                        <table className="table inner">
                          <thead><tr><th>Field</th><th>Before</th><th>After</th></tr></thead>
                          <tbody>
                            {Object.entries(l.changes || {}).map(([k, v]) => (
                              <tr key={k}><td>{k}</td><td>{show(v.from)}</td><td>{show(v.to)}</td></tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
