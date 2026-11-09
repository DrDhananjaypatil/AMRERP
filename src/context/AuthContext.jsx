import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase';

const AuthCtx = createContext(null);

// status: 'loading' | 'signedOut' | 'noProfile' | 'inactive' | 'ready'
export function AuthProvider({ children }) {
  const [authUser, setAuthUser] = useState(undefined);
  const [me, setMe] = useState(undefined);
  const [role, setRole] = useState(null);
  const [company, setCompany] = useState(null);
  const [lists, setLists] = useState(null);

  useEffect(() => onAuthStateChanged(auth, setAuthUser), []);

  // Profile (users/{uid})
  useEffect(() => {
    if (!authUser) { setMe(authUser === null ? null : undefined); return; }
    return onSnapshot(
      doc(db, 'users', authUser.uid),
      (snap) => setMe(snap.exists() ? { uid: snap.id, ...snap.data() } : null),
      () => setMe(null),
    );
  }, [authUser]);

  // Role, company and pick-lists once the profile is active
  const ready = !!me && me.active === true;
  useEffect(() => {
    if (!ready) { setRole(null); return; }
    return onSnapshot(doc(db, 'roles', me.roleId), (s) => setRole(s.exists() ? { id: s.id, ...s.data() } : null));
  }, [ready, me?.roleId]);

  useEffect(() => {
    if (!ready) { setCompany(null); setLists(null); return; }
    const u1 = onSnapshot(doc(db, 'config', 'company'), (s) => setCompany(s.data() || null));
    const u2 = onSnapshot(doc(db, 'config', 'lists'), (s) => setLists(s.data() || null));
    return () => { u1(); u2(); };
  }, [ready]);

  const value = useMemo(() => {
    let status = 'ready';
    if (authUser === undefined || (authUser && me === undefined)) status = 'loading';
    else if (!authUser) status = 'signedOut';
    else if (me === null) status = 'noProfile';
    else if (me.active !== true) status = 'inactive';
    else if (!role || !company) status = 'loading';

    const isOwner = me?.roleId === 'owner';
    const can = (mod, act = 'view') =>
      isOwner || !!(role?.permissions?.[mod] || []).includes(act);
    const scopeOf = (mod) => (isOwner ? 'all' : role?.scopes?.[mod] || 'own');

    return {
      status,
      authUser,
      me,
      role,
      company,
      lists: lists || {},
      isOwner,
      can,
      scopeOf,
      canSeeCost: isOwner || role?.canSeeCost === true,
      logout: () => signOut(auth),
    };
  }, [authUser, me, role, company, lists]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
