import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Setup from './pages/Setup';
import Dashboard from './pages/Dashboard';
import { Customers, Products, Suppliers } from './pages/Masters';
import Staff from './pages/Staff';
import Roles from './pages/Roles';
import CompanySettings from './pages/CompanySettings';
import Import from './pages/Import';
import AuditLog from './pages/AuditLog';
import Stock from './pages/inventory/Stock';
import StockEntry from './pages/inventory/StockEntry';
import Serials from './pages/inventory/Serials';
import Labels from './pages/inventory/Labels';

function Guard({ mod, act = 'view', ownerOnly, children }) {
  const { can, isOwner } = useAuth();
  const ok = ownerOnly ? isOwner : can(mod, act);
  return ok ? children : (
    <div className="page"><h1>No access</h1><p className="muted">Your role does not include this screen. Ask the owner if you need it.</p></div>
  );
}

function Gate() {
  const { status, logout } = useAuth();
  if (status === 'loading') return <div className="splash">Loading…</div>;
  if (status === 'signedOut') return <Login />;
  if (status === 'noProfile') return <Setup />;
  if (status === 'inactive') {
    return (
      <div className="auth-page">
        <div className="auth-card stack">
          <h1>Account inactive</h1>
          <p>Your login has been deactivated. Contact the owner.</p>
          <button className="btn btn-block" onClick={logout}>Sign out</button>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Guard mod="dashboard"><Dashboard /></Guard>} />
        <Route path="products" element={<Guard mod="products"><Products /></Guard>} />
        <Route path="customers" element={<Guard mod="customers"><Customers /></Guard>} />
        <Route path="suppliers" element={<Guard mod="suppliers"><Suppliers /></Guard>} />
        <Route path="stock" element={<Guard mod="inventory"><Stock /></Guard>} />
        <Route path="stock/entry" element={<Guard mod="inventory"><StockEntry /></Guard>} />
        <Route path="serials" element={<Guard mod="inventory"><Serials /></Guard>} />
        <Route path="labels" element={<Guard mod="inventory"><Labels /></Guard>} />
        <Route path="staff" element={<Guard mod="staff"><Staff /></Guard>} />
        <Route path="roles" element={<Guard ownerOnly><Roles /></Guard>} />
        <Route path="settings" element={<Guard mod="settings"><CompanySettings /></Guard>} />
        <Route path="import" element={<Guard mod="import" act="create"><Import /></Guard>} />
        <Route path="audit" element={<Guard mod="audit"><AuditLog /></Guard>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Gate />
      </BrowserRouter>
    </AuthProvider>
  );
}
