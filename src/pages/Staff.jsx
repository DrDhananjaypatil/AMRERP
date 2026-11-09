import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db, callCreateStaff, callUpdateStaff } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { Badge, ErrorNote, FieldInput, Modal } from '../components/ui';

export default function Staff() {
  const { me, can, isOwner, company } = useAuth();
  const [users, setUsers] = useState(null);
  const [roles, setRoles] = useState([]);
  const [view, setView] = useState('list');
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => onSnapshot(collection(db, 'users'), (s) => setUsers(s.docs.map((d) => ({ uid: d.id, ...d.data() }))), setError), []);
  useEffect(() => onSnapshot(collection(db, 'roles'), (s) => setRoles(s.docs.map((d) => ({ id: d.id, ...d.data() })))), []);

  const byId = useMemo(() => Object.fromEntries((users || []).map((u) => [u.uid, u])), [users]);
  const roleName = (id) => roles.find((r) => r.id === id)?.name || id;
  const unitName = (id) => (id === 'all' || !id ? 'All units' : company?.units?.find((u) => u.id === id)?.name || id);

  // Who the current user may manage: owner = everyone; others = their own subtree.
  const manageable = (u) => isOwner || (u.managerChain || []).includes(me.uid);

  if (!users) return <div className="page"><h1>Staff &amp; hierarchy</h1><p className="muted">Loading…</p></div>;

  const sorted = [...users].sort((a, b) => (b.active - a.active) || a.name.localeCompare(b.name));

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Staff &amp; hierarchy</h1>
          <p className="muted">Each person has a role (what they can do) and a manager (who sees their records and approves above their limits).</p>
        </div>
        <div className="actions">
          <div className="tabs tabs-inline">
            <button className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}>List</button>
            <button className={view === 'tree' ? 'active' : ''} onClick={() => setView('tree')}>Hierarchy</button>
          </div>
          {can('staff', 'create') && <button className="btn" onClick={() => setEditing({})}>+ Add staff</button>}
        </div>
      </div>

      <ErrorNote error={error} />

      {view === 'list' ? (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Name</th><th>Designation</th><th>Role</th><th>Unit</th><th>Reports to</th><th>Login</th><th>Status</th></tr>
            </thead>
            <tbody>
              {sorted.map((u) => {
                const editable = u.uid !== me.uid && u.roleId !== 'owner' && can('staff', 'edit') && manageable(u);
                return (
                  <tr key={u.uid} className={u.active ? '' : 'row-inactive'} onClick={() => editable && setEditing(u)}>
                    <td><b>{u.name}</b></td>
                    <td>{u.designation}</td>
                    <td>{roleName(u.roleId)}</td>
                    <td>{unitName(u.unitId)}</td>
                    <td>{byId[u.reportsTo]?.name || '—'}</td>
                    <td className="small">{[u.email, u.phone].filter(Boolean).join(' · ')}</td>
                    <td>{u.active ? <Badge tone="good">Active</Badge> : <Badge tone="muted">Inactive</Badge>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card tree">
          {sorted.filter((u) => !u.reportsTo || !byId[u.reportsTo]).map((root) => (
            <TreeNode key={root.uid} user={root} users={users} roleName={roleName} />
          ))}
        </div>
      )}

      {editing && (
        <StaffModal
          user={editing.uid ? editing : null}
          users={users}
          roles={roles.filter((r) => r.id !== 'owner' && r.isActive !== false)}
          units={company?.units || []}
          me={me}
          isOwner={isOwner}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function TreeNode({ user, users, roleName }) {
  const kids = users.filter((u) => u.reportsTo === user.uid && u.active).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className="tree-node">
      <div className="tree-label"><b>{user.name}</b> <span className="muted">· {roleName(user.roleId)}{user.designation ? ` · ${user.designation}` : ''}</span></div>
      {kids.length > 0 && <div className="tree-children">{kids.map((k) => <TreeNode key={k.uid} user={k} users={users} roleName={roleName} />)}</div>}
    </div>
  );
}

function StaffModal({ user, users, roles, units, me, isOwner, onClose }) {
  const isNew = !user;
  const [d, setD] = useState(() => (user
    ? { name: user.name, designation: user.designation || '', roleId: user.roleId, unitId: user.unitId || 'all', reportsTo: user.reportsTo, email: user.email || '', phone: (user.phone || '').replace(/^\+91/, ''), password: '', active: user.active }
    : { name: '', designation: '', roleId: '', unitId: 'all', reportsTo: me.uid, email: '', phone: '', password: '', active: true }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (v) => setD((x) => ({ ...x, [k]: v }));

  // A person cannot report to themselves or to anyone below them.
  const managerOptions = users
    .filter((u) => u.active && (!user || (u.uid !== user.uid && !(u.managerChain || []).includes(user.uid))))
    .filter((u) => isOwner || u.uid === me.uid || (u.managerChain || []).includes(me.uid))
    .map((u) => ({ value: u.uid, label: u.name }));

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!d.email && !d.phone) return setError('Give an email + password, a mobile number, or both.');
    if (isNew && d.email && d.password.length < 6) return setError('Password must be at least 6 characters.');
    if (d.phone && !/^[6-9]\d{9}$/.test(d.phone.replace(/\D/g, ''))) return setError('Mobile number should be 10 digits.');
    setBusy(true);
    try {
      const payload = {
        name: d.name, designation: d.designation, roleId: d.roleId, unitId: d.unitId, reportsTo: d.reportsTo,
        email: d.email || null, phone: d.phone || null,
        ...(d.password ? { password: d.password } : {}),
      };
      if (isNew) await callCreateStaff(payload);
      else await callUpdateStaff({ uid: user.uid, ...payload, active: d.active });
      onClose();
    } catch (err) { setError(err); setBusy(false); }
  };

  return (
    <Modal
      title={isNew ? 'Add staff' : `Edit ${user.name}`}
      onClose={onClose}
      wide
      footer={<>
        <button className="btn btn-ghost" type="button" onClick={onClose}>Cancel</button>
        <button className="btn" form="staff-form" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
      </>}
    >
      <form id="staff-form" className="form-grid" onSubmit={submit}>
        <FieldInput field={{ key: 'name', label: 'Full name', type: 'text', required: true }} value={d.name} onChange={set('name')} />
        <FieldInput field={{ key: 'designation', label: 'Designation', type: 'text', help: 'e.g. Sales Executive, Store In-charge, Welder' }} value={d.designation} onChange={set('designation')} />
        <FieldInput field={{ key: 'roleId', label: 'Role', type: 'select', required: true, options: roles.map((r) => ({ value: r.id, label: r.name })), help: 'Decides which modules and actions they get.' }} value={d.roleId} onChange={set('roleId')} />
        <FieldInput field={{ key: 'reportsTo', label: 'Reports to', type: 'select', required: true, options: managerOptions }} value={d.reportsTo} onChange={set('reportsTo')} />
        <FieldInput field={{ key: 'unitId', label: 'Unit', type: 'select', required: true, options: [{ value: 'all', label: 'All units' }, ...units.map((u) => ({ value: u.id, label: u.name }))] }} value={d.unitId} onChange={set('unitId')} />
        <div className="field-full section-label">Login — email + password, mobile OTP, or both</div>
        <FieldInput field={{ key: 'email', label: 'Email', type: 'text' }} value={d.email} onChange={set('email')} />
        <FieldInput field={{ key: 'password', label: isNew ? 'Password' : 'New password (leave blank to keep)', type: 'text', help: 'At least 6 characters. Share it with the employee privately.' }} value={d.password} onChange={set('password')} />
        <FieldInput field={{ key: 'phone', label: 'Mobile (for OTP login)', type: 'text', help: '10 digits, without +91' }} value={d.phone} onChange={set('phone')} />
        {!isNew && (
          <FieldInput field={{ key: 'active', label: 'Active (untick to block login immediately)', type: 'checkbox' }} value={d.active} onChange={set('active')} />
        )}
      </form>
      <ErrorNote error={error} />
    </Modal>
  );
}
