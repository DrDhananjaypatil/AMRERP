import { useState } from 'react';
import { callBootstrapOwner } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { ErrorNote } from '../components/ui';
import { MAIN_LOGO } from '../lib/brand';

// Shown when someone is signed in but has no staff profile yet.
export default function Setup() {
  const { authUser, logout } = useAuth();
  const [companyName, setCompanyName] = useState('AMR Wheels');
  const [ownerName, setOwnerName] = useState(authUser?.displayName || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [alreadySetUp, setAlreadySetUp] = useState(false);

  const run = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await callBootstrapOwner({ companyName, ownerName });
      // AuthContext picks up the new profile automatically.
    } catch (err) {
      if (err.code === 'functions/already-exists') setAlreadySetUp(true);
      else setError(err);
      setBusy(false);
    }
  };

  if (alreadySetUp) {
    return (
      <div className="auth-page">
        <div className="auth-card stack">
          <h1>Not registered</h1>
          <p>This login ({authUser?.email || authUser?.phoneNumber}) is not added as staff yet. Ask the owner to add you from <b>Staff &amp; hierarchy</b>.</p>
          <button className="btn btn-block" onClick={logout}>Sign out</button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <form className="auth-card stack" onSubmit={run}>
        <img className="auth-logo" src={MAIN_LOGO.color} alt="AMR Wheels" />
        <h1>Set up the company</h1>
        <p className="muted small">
          If the company is not set up yet, you become the Owner / CEO with full access.
          If it is already set up, you will be asked to contact the owner.
        </p>
        <label>Company name<input value={companyName} onChange={(e) => setCompanyName(e.target.value)} required /></label>
        <label>Your name<input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} required /></label>
        <button className="btn btn-block" disabled={busy}>{busy ? 'Setting up…' : 'Continue'}</button>
        <button type="button" className="link small" onClick={logout}>Sign out</button>
        <ErrorNote error={error} />
      </form>
    </div>
  );
}
