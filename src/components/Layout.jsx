import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { MODULES } from '../lib/modules';
import { MAIN_LOGO } from '../lib/brand';

const NAV = [
  { group: null, items: [{ to: '/', label: 'Dashboard', mod: 'dashboard', end: true }] },
  {
    group: 'Masters',
    items: [
      { to: '/products', label: 'Products', mod: 'products' },
      { to: '/customers', label: 'Customers', mod: 'customers' },
      { to: '/suppliers', label: 'Suppliers', mod: 'suppliers' },
    ],
  },
  {
    group: 'Inventory',
    items: [
      { to: '/stock', label: 'Stock', mod: 'inventory' },
      { to: '/stock/entry', label: 'Stock entry', mod: 'inventory', anyAct: ['create', 'edit'] },
      { to: '/serials', label: 'Serial numbers', mod: 'inventory' },
      { to: '/labels', label: 'QR labels', mod: 'inventory' },
    ],
  },
  {
    group: 'Admin',
    items: [
      { to: '/staff', label: 'Staff & hierarchy', mod: 'staff' },
      { to: '/roles', label: 'Roles & permissions', ownerOnly: true },
      { to: '/settings', label: 'Company settings', mod: 'settings' },
      { to: '/import', label: 'Data import', mod: 'import', act: 'create' },
      { to: '/audit', label: 'Audit log', mod: 'audit' },
    ],
  },
];

export default function Layout() {
  const { me, role, company, can, isOwner, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const comingSoon = MODULES.filter((m) => !m.ready && can(m.id, 'view'));

  return (
    <div className={`shell ${open ? 'nav-open' : ''}`}>
      <header className="topbar">
        <button className="btn-icon menu-btn" onClick={() => setOpen(!open)} aria-label="Menu">☰</button>
        <NavLink to="/" className="brand" title={company?.name || 'AMR Wheels'}>
          <img src={MAIN_LOGO.white} alt={company?.name || 'AMR Wheels'} />
        </NavLink>
        <div className="who">
          <span className="who-name">{me?.name}</span>
          <span className="who-role">{role?.name}</span>
          <button className="btn btn-ghost btn-sm" onClick={logout}>Sign out</button>
        </div>
      </header>

      <nav className="sidebar" onClick={() => setOpen(false)}>
        {NAV.map((sec) => {
          const items = sec.items.filter((i) => (i.ownerOnly ? isOwner : i.anyAct ? i.anyAct.some((a) => can(i.mod, a)) : can(i.mod, i.act || 'view')));
          if (!items.length) return null;
          return (
            <div key={sec.group || 'main'} className="nav-group">
              {sec.group && <div className="nav-title">{sec.group}</div>}
              {items.map((i) => (
                <NavLink key={i.to} to={i.to} end={i.end} className="nav-link">{i.label}</NavLink>
              ))}
            </div>
          );
        })}
        {comingSoon.length > 0 && (
          <div className="nav-group">
            <div className="nav-title">Coming next</div>
            {comingSoon.map((m) => (
              <span key={m.id} className="nav-link nav-disabled" title={`Built in Phase ${m.phase}`}>
                {m.label} <small>P{m.phase}</small>
              </span>
            ))}
          </div>
        )}
      </nav>

      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
