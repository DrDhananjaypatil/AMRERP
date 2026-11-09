import { useEffect, useRef, useState } from 'react';
import {
  createUserWithEmailAndPassword, RecaptchaVerifier, sendPasswordResetEmail,
  signInWithEmailAndPassword, signInWithPhoneNumber, updateProfile,
} from 'firebase/auth';
import { auth } from '../firebase';
import { ErrorNote } from '../components/ui';

const friendly = (e) => {
  const c = e?.code || '';
  if (c.includes('invalid-credential') || c.includes('wrong-password') || c.includes('user-not-found')) return 'Email or password is incorrect.';
  if (c.includes('too-many-requests')) return 'Too many attempts. Please wait a few minutes.';
  if (c.includes('invalid-verification-code')) return 'The OTP is incorrect.';
  if (c.includes('invalid-phone-number')) return 'Enter a valid 10-digit mobile number.';
  if (c.includes('email-already-in-use')) return 'This email already has an account. Use Sign in instead.';
  if (c.includes('weak-password')) return 'Password must be at least 6 characters.';
  return e?.message || 'Something went wrong.';
};

export default function Login() {
  const [tab, setTab] = useState('email');
  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>AMR Wheels</h1>
        <p className="muted">Management system</p>
        <div className="tabs">
          <button className={tab === 'email' ? 'active' : ''} onClick={() => setTab('email')}>Email</button>
          <button className={tab === 'phone' ? 'active' : ''} onClick={() => setTab('phone')}>Mobile OTP</button>
        </div>
        {tab === 'email' && <EmailLogin />}
        {tab === 'phone' && <PhoneLogin />}
        {tab === 'setup' && <FirstSetup />}
        {tab !== 'setup' && (
          <button className="link small" onClick={() => setTab('setup')}>First-time setup (owner only)</button>
        )}
      </div>
    </div>
  );
}

function EmailLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [note, setNote] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try { await signInWithEmailAndPassword(auth, email.trim(), password); }
    catch (err) { setError(friendly(err)); setBusy(false); }
  };
  const reset = async () => {
    if (!email) return setError('Enter your email first.');
    try { await sendPasswordResetEmail(auth, email.trim()); setNote('Password reset email sent.'); }
    catch (err) { setError(friendly(err)); }
  };

  return (
    <form onSubmit={submit} className="stack">
      <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required /></label>
      <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></label>
      <button className="btn btn-block" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      <button type="button" className="link small" onClick={reset}>Forgot password?</button>
      {note && <div className="ok-note">{note}</div>}
      <ErrorNote error={error} />
    </form>
  );
}

function PhoneLogin() {
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const verifier = useRef(null);

  useEffect(() => () => { verifier.current?.clear?.(); verifier.current = null; }, []);

  const send = async (e) => {
    e.preventDefault();
    setError(null);
    const digits = phone.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
    if (!/^[6-9]\d{9}$/.test(digits)) return setError('Enter a valid 10-digit mobile number.');
    setBusy(true);
    try {
      if (!verifier.current) verifier.current = new RecaptchaVerifier(auth, 'recaptcha-box', { size: 'invisible' });
      setConfirm(await signInWithPhoneNumber(auth, `+91${digits}`, verifier.current));
    } catch (err) {
      setError(friendly(err));
      verifier.current?.clear?.(); verifier.current = null;
    }
    setBusy(false);
  };

  const verify = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try { await confirm.confirm(otp.trim()); }
    catch (err) { setError(friendly(err)); setBusy(false); }
  };

  return (
    <>
      {!confirm ? (
        <form onSubmit={send} className="stack">
          <label>Mobile number
            <div className="prefix-input"><span>+91</span><input inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98XXXXXXXX" required /></div>
          </label>
          <button className="btn btn-block" disabled={busy}>{busy ? 'Sending…' : 'Send OTP'}</button>
        </form>
      ) : (
        <form onSubmit={verify} className="stack">
          <label>OTP sent to +91 {phone}<input inputMode="numeric" value={otp} onChange={(e) => setOtp(e.target.value)} maxLength={6} autoFocus required /></label>
          <button className="btn btn-block" disabled={busy}>{busy ? 'Verifying…' : 'Verify & sign in'}</button>
          <button type="button" className="link small" onClick={() => { setConfirm(null); setOtp(''); }}>Change number</button>
        </form>
      )}
      <div id="recaptcha-box" />
      <ErrorNote error={error} />
    </>
  );
}

// Creates the owner's login. The company setup itself happens on the next screen.
function FirstSetup() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      await updateProfile(cred.user, { displayName: name.trim() });
    } catch (err) { setError(friendly(err)); setBusy(false); }
  };

  return (
    <form onSubmit={submit} className="stack">
      <p className="muted small">Use this once, for the owner. Staff are added later from Staff &amp; hierarchy.</p>
      <label>Your name<input value={name} onChange={(e) => setName(e.target.value)} required /></label>
      <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
      <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required /></label>
      <button className="btn btn-block" disabled={busy}>{busy ? 'Creating…' : 'Create owner login'}</button>
      <ErrorNote error={error} />
    </form>
  );
}
