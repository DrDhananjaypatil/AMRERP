import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

// Live list of a whole collection, or null while loading.
export function useCollection(name, enabled = true) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    if (!enabled) { setRows([]); return; }
    return onSnapshot(
      collection(db, name),
      (s) => setRows(s.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (e) => { setError(e); setRows([]); },
    );
  }, [name, enabled]);
  return [rows, error];
}

// Active products sorted by name, plus a lookup by id and by SKU.
export function useProducts() {
  const [rows, error] = useCollection('products');
  const list = (rows || []).filter((p) => p.isActive !== false).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const byId = Object.fromEntries((rows || []).map((p) => [p.id, p]));
  const bySku = Object.fromEntries((rows || []).map((p) => [String(p.sku || '').trim().toUpperCase(), p]));
  return { products: list, byId, bySku, loading: rows === null, error };
}
