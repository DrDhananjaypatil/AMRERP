import { collection, query, where, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

// Every write from the browser must carry these two fields (enforced in firestore.rules).
export const stamp = (uid) => ({ updatedBy: uid, updatedAt: serverTimestamp() });

// Query a person-owned collection (customers now; quotations/orders later) within the user's data scope.
export function scopedQuery(collName, scope, me) {
  const ref = collection(db, collName);
  if (scope === 'own') return query(ref, where('ownerId', '==', me.uid));
  if (scope === 'team') return query(ref, where('ownerChain', 'array-contains', me.uid));
  if (scope === 'unit') return query(ref, where('unitId', '==', me.unitId));
  return ref;
}

export const ownerChainFor = (ownerUser) => [ownerUser.uid, ...(ownerUser.managerChain || [])];

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
export const isValidGstin = (v) => !v || GSTIN_RE.test(String(v).trim().toUpperCase());
export const isValidMobile = (v) => !v || /^(\+91)?[6-9]\d{9}$/.test(String(v).replace(/[\s-]/g, ''));

export const inr = (n) =>
  n === null || n === undefined || n === ''
    ? ''
    : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(n));

export const fmtDateTime = (ts) => {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
};

export const slugify = (s) =>
  String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);
