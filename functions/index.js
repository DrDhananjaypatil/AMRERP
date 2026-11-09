// AMR Wheels — Phase 0 Cloud Functions
//   bootstrapOwner : first-time setup; the first person to run it becomes Owner / CEO
//   createStaff    : add an employee login (email + password and/or mobile OTP) with role and manager
//   updateStaff    : change role, manager, unit, login details, or deactivate an employee
//   auditTrail     : records every create / edit / deactivate in auditLogs (who, when, old -> new)

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { setGlobalOptions } = require('firebase-functions/v2');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const DEFAULT_ROLES = require('./defaultRoles');

initializeApp();
const db = getFirestore();
const adminAuth = getAuth();

// Mumbai. Create the Firestore database in the same region (asia-south1).
setGlobalOptions({ region: 'asia-south1', maxInstances: 10 });

// ---------------------------------------------------------------- helpers

function normalizePhone(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits;
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  throw new HttpsError('invalid-argument', `Mobile number "${raw}" is not a valid 10-digit number.`);
}

function clean(s) {
  return typeof s === 'string' ? s.trim() : s;
}

async function getCaller(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Please sign in.');
  const snap = await db.doc(`users/${request.auth.uid}`).get();
  if (!snap.exists || snap.data().active !== true) {
    throw new HttpsError('permission-denied', 'Your account is not active.');
  }
  const user = { uid: snap.id, ...snap.data() };
  const roleSnap = await db.doc(`roles/${user.roleId}`).get();
  user.role = roleSnap.exists ? roleSnap.data() : { permissions: {} };
  user.isOwner = user.roleId === 'owner';
  return user;
}

function can(caller, mod, act) {
  if (caller.isOwner) return true;
  const list = (caller.role.permissions || {})[mod] || [];
  return list.includes(act);
}

// True if `uid` reports (directly or indirectly) to `managerUid`.
async function isInSubtree(uid, managerUid) {
  if (uid === managerUid) return true;
  const snap = await db.doc(`users/${uid}`).get();
  return snap.exists && (snap.data().managerChain || []).includes(managerUid);
}

async function otherActiveOwners(exceptUid) {
  const snap = await db.collection('users').where('roleId', '==', 'owner').where('active', '==', true).get();
  return snap.docs.filter((d) => d.id !== exceptUid).length;
}

function mapAuthError(err) {
  const code = err && err.code ? err.code : '';
  if (code.includes('email-already-exists')) return new HttpsError('already-exists', 'This email is already used by another login.');
  if (code.includes('phone-number-already-exists')) return new HttpsError('already-exists', 'This mobile number is already used by another login.');
  if (code.includes('invalid-password')) return new HttpsError('invalid-argument', 'Password must be at least 6 characters.');
  if (code.includes('invalid-email')) return new HttpsError('invalid-argument', 'Email address is not valid.');
  if (code.includes('invalid-phone-number')) return new HttpsError('invalid-argument', 'Mobile number is not valid.');
  return new HttpsError('internal', err.message || 'Could not update the login.');
}

// ---------------------------------------------------------------- bootstrapOwner

exports.bootstrapOwner = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Please sign in.');
  const uid = request.auth.uid;
  const companyName = clean(request.data?.companyName) || 'AMR Wheels';
  const ownerName = clean(request.data?.ownerName) || request.auth.token.name || 'Owner';

  const companyRef = db.doc('config/company');
  await db.runTransaction(async (tx) => {
    const existing = await tx.get(companyRef);
    if (existing.exists) {
      throw new HttpsError('already-exists', 'Setup is already done. Ask the owner to add you as staff.');
    }
    const stamp = { updatedBy: uid, updatedAt: FieldValue.serverTimestamp() };

    tx.set(companyRef, {
      name: companyName,
      fyStartMonth: 4,
      units: [
        { id: 'amr-wheels', name: 'AMR Wheels', kind: 'Sales outlet', gstin: '', address: '', state: 'Maharashtra', phone: '' },
        { id: 'amr-technofab', name: 'AMR Technofab', kind: 'Manufacturing', gstin: '', address: '', state: 'Maharashtra', phone: '' },
      ],
      warehouses: [
        { id: 'wheels-store', name: 'AMR Wheels store', unitId: 'amr-wheels' },
        { id: 'technofab-store', name: 'AMR Technofab store', unitId: 'amr-technofab' },
      ],
      ...stamp,
    });

    tx.set(db.doc('config/lists'), {
      categories: ['Industrial wheel', 'Castor', 'Trolley wheel', 'Forklift wheel', 'Hand pallet truck', 'Trolley', 'Stacker', 'Spare part', 'Raw material', 'Other'],
      materials: ['PU', 'Nylon', 'Rubber', 'Cast iron', 'Mould on', 'Polypropylene', 'Steel'],
      bearingTypes: ['Ball bearing', 'Roller bearing', 'Bush', 'Plain'],
      grades: ['Economy', 'Standard', 'Heavy duty', 'Premium'],
      uoms: ['Nos', 'Set', 'Pair', 'Kg', 'Mtr'],
      ...stamp,
    });

    tx.set(db.doc('roles/owner'), {
      name: 'Owner / CEO', system: true, permissions: {}, scopes: {},
      canSeeCost: true, maxDiscountPct: 100, maxPurchaseAmount: null, isActive: true, ...stamp,
    });
    for (const [id, role] of Object.entries(DEFAULT_ROLES)) {
      tx.set(db.doc(`roles/${id}`), { ...role, system: false, isActive: true, ...stamp });
    }

    tx.set(db.doc(`users/${uid}`), {
      name: ownerName,
      email: request.auth.token.email || null,
      phone: request.auth.token.phone_number || null,
      designation: 'Owner / CEO',
      roleId: 'owner',
      unitId: 'all',
      reportsTo: null,
      managerChain: [],
      active: true,
      ...stamp,
    });
  });
  return { ok: true };
});

// ---------------------------------------------------------------- createStaff

exports.createStaff = onCall(async (request) => {
  const caller = await getCaller(request);
  if (!can(caller, 'staff', 'create')) throw new HttpsError('permission-denied', 'You cannot add staff.');

  const d = request.data || {};
  const name = clean(d.name);
  const email = clean(d.email) || null;
  const password = d.password || null;
  const phone = normalizePhone(clean(d.phone));
  const roleId = clean(d.roleId);
  const makeOwner = roleId === 'owner';
  const reportsTo = makeOwner ? null : clean(d.reportsTo) || caller.uid;

  if (!name) throw new HttpsError('invalid-argument', 'Name is required.');
  if (!email && !phone) throw new HttpsError('invalid-argument', 'Give an email + password, a mobile number, or both.');
  if (email && !password) throw new HttpsError('invalid-argument', 'A password is needed for email login.');
  if (!roleId) throw new HttpsError('invalid-argument', 'Choose a role.');
  if (makeOwner && !caller.isOwner) throw new HttpsError('permission-denied', 'Only an owner can add another owner.');

  const roleSnap = await db.doc(`roles/${roleId}`).get();
  if (!roleSnap.exists || roleSnap.data().isActive === false) throw new HttpsError('invalid-argument', 'That role does not exist.');

  let managerChain = [];
  if (!makeOwner) {
    const managerSnap = await db.doc(`users/${reportsTo}`).get();
    if (!managerSnap.exists || managerSnap.data().active !== true) throw new HttpsError('invalid-argument', 'The selected manager is not an active user.');
    if (!caller.isOwner && !(await isInSubtree(reportsTo, caller.uid))) {
      throw new HttpsError('permission-denied', 'You can only add staff under yourself or your team.');
    }
    managerChain = [reportsTo, ...(managerSnap.data().managerChain || [])];
  }

  let authUser;
  try {
    authUser = await adminAuth.createUser({
      displayName: name,
      ...(email ? { email, password } : {}),
      ...(phone ? { phoneNumber: phone } : {}),
    });
  } catch (err) {
    throw mapAuthError(err);
  }

  await db.doc(`users/${authUser.uid}`).set({
    name,
    email,
    phone,
    designation: clean(d.designation) || '',
    roleId,
    unitId: clean(d.unitId) || 'all',
    reportsTo,
    managerChain,
    active: true,
    updatedBy: caller.uid,
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { uid: authUser.uid };
});

// ---------------------------------------------------------------- updateStaff

exports.updateStaff = onCall(async (request) => {
  const caller = await getCaller(request);
  const d = request.data || {};
  const uid = clean(d.uid);
  if (!uid) throw new HttpsError('invalid-argument', 'Missing employee.');

  const targetRef = db.doc(`users/${uid}`);
  const targetSnap = await targetRef.get();
  if (!targetSnap.exists) throw new HttpsError('not-found', 'Employee not found.');
  const target = targetSnap.data();
  const targetIsOwner = target.roleId === 'owner';

  const editingSelfOnlyBasics = uid === caller.uid;
  if (!editingSelfOnlyBasics) {
    if (!can(caller, 'staff', 'edit')) throw new HttpsError('permission-denied', 'You cannot edit staff.');
    if (targetIsOwner && !caller.isOwner) throw new HttpsError('permission-denied', 'Only an owner can edit an owner account.');
    if (!caller.isOwner && !(await isInSubtree(uid, caller.uid))) {
      throw new HttpsError('permission-denied', 'You can only edit people in your team.');
    }
  }

  const userUpdate = {};
  const authUpdate = {};

  if (d.name !== undefined) { userUpdate.name = clean(d.name); authUpdate.displayName = clean(d.name); }
  if (d.designation !== undefined) userUpdate.designation = clean(d.designation);
  if (d.email !== undefined) { userUpdate.email = clean(d.email) || null; if (clean(d.email)) authUpdate.email = clean(d.email); }
  if (d.password) authUpdate.password = d.password;
  if (d.phone !== undefined) {
    const p = normalizePhone(clean(d.phone));
    userUpdate.phone = p;
    authUpdate.phoneNumber = p; // null removes mobile login
  }

  // Nobody changes their own role, manager, unit or status (another owner must do it).
  const structural = ['roleId', 'unitId', 'reportsTo', 'active'].some((k) => d[k] !== undefined && d[k] !== target[k]);
  if (structural && editingSelfOnlyBasics) {
    throw new HttpsError('permission-denied', 'Your own role, manager, unit and status can only be changed by an owner.');
  }

  const becomingOwner = d.roleId === 'owner' && !targetIsOwner;
  const leavingOwner = targetIsOwner && d.roleId !== undefined && d.roleId !== 'owner';
  const finalIsOwner = becomingOwner || (targetIsOwner && !leavingOwner);

  if ((becomingOwner || leavingOwner) && !caller.isOwner) {
    throw new HttpsError('permission-denied', 'Only an owner can give or remove the Owner role.');
  }
  const deactivating = d.active !== undefined && d.active !== true && target.active === true;
  if ((leavingOwner || (targetIsOwner && deactivating)) && (await otherActiveOwners(uid)) === 0) {
    throw new HttpsError('failed-precondition', 'This is the only active owner. Make someone else an owner first.');
  }

  if (d.roleId !== undefined && d.roleId !== target.roleId) {
    const r = await db.doc(`roles/${d.roleId}`).get();
    if (!r.exists) throw new HttpsError('invalid-argument', 'That role does not exist.');
    userUpdate.roleId = d.roleId;
  }
  if (d.unitId !== undefined) userUpdate.unitId = clean(d.unitId) || 'all';
  if (d.active !== undefined) {
    userUpdate.active = d.active === true;
    authUpdate.disabled = d.active !== true;
  }

  // Manager change: recompute this person's chain and everyone below them,
  // then re-stamp ownerChain on their customers so managers keep seeing their team's records.
  let chainUpdates = [];
  const desiredManager = finalIsOwner
    ? null
    : (d.reportsTo !== undefined ? clean(d.reportsTo) || null : target.reportsTo || null);
  if (!finalIsOwner && !desiredManager) throw new HttpsError('invalid-argument', 'Choose who this person reports to.');

  if (desiredManager !== (target.reportsTo || null)) {
    let newChain = [];
    if (desiredManager) {
      if (desiredManager === uid) throw new HttpsError('invalid-argument', 'Choose a different manager.');
      const mSnap = await db.doc(`users/${desiredManager}`).get();
      if (!mSnap.exists || mSnap.data().active !== true) throw new HttpsError('invalid-argument', 'Manager is not an active user.');
      const mChain = mSnap.data().managerChain || [];
      if (mChain.includes(uid)) throw new HttpsError('invalid-argument', 'That would create a loop: the new manager reports to this person.');
      if (!caller.isOwner && !(await isInSubtree(desiredManager, caller.uid))) {
        throw new HttpsError('permission-denied', 'The new manager must be in your team.');
      }
      newChain = [desiredManager, ...mChain];
    }
    const newManager = desiredManager;
    userUpdate.reportsTo = newManager;
    userUpdate.managerChain = newChain;
    chainUpdates.push({ uid, chain: newChain });

    const below = await db.collection('users').where('managerChain', 'array-contains', uid).get();
    below.forEach((doc) => {
      const old = doc.data().managerChain || [];
      const idx = old.indexOf(uid);
      chainUpdates.push({ uid: doc.id, chain: [...old.slice(0, idx + 1), ...newChain] });
    });
  }

  if (Object.keys(authUpdate).length) {
    try {
      await adminAuth.updateUser(uid, authUpdate);
      if (authUpdate.disabled) await adminAuth.revokeRefreshTokens(uid);
    } catch (err) {
      throw mapAuthError(err);
    }
  }

  const stamp = { updatedBy: caller.uid, updatedAt: FieldValue.serverTimestamp() };
  let batch = db.batch();
  let ops = 0;
  const commitIfFull = async () => {
    if (ops >= 400) { await batch.commit(); batch = db.batch(); ops = 0; }
  };

  batch.update(targetRef, { ...userUpdate, ...stamp });
  ops++;

  for (const { uid: u, chain } of chainUpdates) {
    if (u !== uid) { batch.update(db.doc(`users/${u}`), { managerChain: chain, ...stamp }); ops++; await commitIfFull(); }
    const owned = await db.collection('customers').where('ownerId', '==', u).get();
    for (const c of owned.docs) {
      batch.update(c.ref, { ownerChain: [u, ...chain], ...stamp });
      ops++;
      await commitIfFull();
    }
  }
  await batch.commit();
  return { ok: true, restamped: chainUpdates.length };
});

// ---------------------------------------------------------------- auditTrail

const SKIP_AUDIT = new Set(['auditLogs']);
const IGNORE_FIELDS = new Set(['updatedAt']);

function same(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

exports.auditTrail = onDocumentWritten('{collection}/{docId}', async (event) => {
  const { collection, docId } = event.params;
  if (SKIP_AUDIT.has(collection)) return;

  const before = event.data.before.exists ? event.data.before.data() : null;
  const after = event.data.after.exists ? event.data.after.data() : null;

  let action = 'update';
  if (!before) action = 'create';
  else if (!after) action = 'delete';
  else if (before.isActive !== false && after.isActive === false) action = 'deactivate';
  else if (before.isActive === false && after.isActive === true) action = 'reactivate';

  const changes = {};
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  for (const k of keys) {
    if (IGNORE_FIELDS.has(k) || k === 'updatedBy') continue;
    const from = before ? before[k] ?? null : null;
    const to = after ? after[k] ?? null : null;
    if (!same(from, to)) changes[k] = { from, to };
  }
  if (action === 'update' && Object.keys(changes).length === 0) return;

  const by = (after && after.updatedBy) || (before && before.updatedBy) || 'system';
  const label = (after || before || {}).name || (after || before || {}).sku || docId;

  await db.collection('auditLogs').add({
    collection,
    docId,
    label,
    action,
    by,
    changes,
    at: FieldValue.serverTimestamp(),
  });
});
