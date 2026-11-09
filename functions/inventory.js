// Inventory (Phase 1A)
//
// Collections (written ONLY here, never from the browser):
//   stock/{productId__warehouseId}   current quantity per product per warehouse
//   stockMoves/{id}                  every movement: who, when, why, how many (the stock ledger)
//   serials/{productId__SERIAL}      one doc per serial number: where it is, sold to whom, warranty end
//
// postStockMove handles opening stock, adjustments (add / remove) and transfers between warehouses.
// Sales (Phase 1B), purchases (Phase 2) and production (Phase 3) will post through the same helpers.

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const KINDS = {
  opening: { label: 'Opening stock', sign: +1, perm: 'create' },
  adjust_in: { label: 'Adjustment (add)', sign: +1, perm: 'edit' },
  adjust_out: { label: 'Adjustment (remove)', sign: -1, perm: 'edit' },
  transfer: { label: 'Transfer', sign: 0, perm: 'create' },
};
const MAX_LINES = 100;

const stockId = (productId, warehouseId) => `${productId}__${warehouseId}`;
const normSerial = (s) => String(s).trim().toUpperCase();
const serialDocId = (productId, serial) => `${productId}__${normSerial(serial).replace(/[/\s#?]+/g, '-')}`;

function parseSerials(raw) {
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : String(raw).split(/[\n,;]+/);
  return list.map((s) => String(s).trim()).filter(Boolean);
}

module.exports = function inventory({ getCaller, can }) {
  const db = getFirestore();

  const postStockMove = onCall(async (request) => {
    const caller = await getCaller(request);
    const d = request.data || {};
    const kind = d.kind;
    const k = KINDS[kind];
    if (!k) throw new HttpsError('invalid-argument', 'Unknown stock entry type.');
    if (!can(caller, 'inventory', k.perm)) throw new HttpsError('permission-denied', `Your role cannot post ${k.label.toLowerCase()}.`);

    const lines = Array.isArray(d.lines) ? d.lines : [];
    if (!lines.length) throw new HttpsError('invalid-argument', 'Add at least one item.');
    if (lines.length > MAX_LINES) throw new HttpsError('invalid-argument', `At most ${MAX_LINES} lines per entry.`);
    const note = String(d.note || '').trim().slice(0, 500);
    if ((kind === 'adjust_in' || kind === 'adjust_out') && !note) {
      throw new HttpsError('invalid-argument', 'Give a reason for the adjustment (e.g. damaged, count correction).');
    }

    const company = (await db.doc('config/company').get()).data() || {};
    const warehouses = Object.fromEntries((company.warehouses || []).map((w) => [w.id, w]));

    // Validate lines and collect every doc the transaction must read.
    const clean = lines.map((l, i) => {
      const row = i + 1;
      const qty = Number(l.qty);
      if (!l.productId) throw new HttpsError('invalid-argument', `Line ${row}: choose a product.`);
      if (!warehouses[l.warehouseId]) throw new HttpsError('invalid-argument', `Line ${row}: choose a warehouse.`);
      if (kind === 'transfer') {
        if (!warehouses[l.toWarehouseId]) throw new HttpsError('invalid-argument', `Line ${row}: choose the destination warehouse.`);
        if (l.toWarehouseId === l.warehouseId) throw new HttpsError('invalid-argument', `Line ${row}: from and to warehouse are the same.`);
      }
      if (!Number.isFinite(qty) || qty <= 0) throw new HttpsError('invalid-argument', `Line ${row}: quantity must be more than 0.`);
      return { ...l, qty, serials: parseSerials(l.serials), row };
    });

    const productIds = [...new Set(clean.map((l) => l.productId))];
    const productSnaps = await db.getAll(...productIds.map((id) => db.doc(`products/${id}`)));
    const products = Object.fromEntries(productSnaps.map((s) => [s.id, s.exists ? s.data() : null]));

    for (const l of clean) {
      const p = products[l.productId];
      if (!p) throw new HttpsError('invalid-argument', `Line ${l.row}: product not found.`);
      if (p.trackSerial) {
        if (!Number.isInteger(l.qty)) throw new HttpsError('invalid-argument', `Line ${l.row}: ${p.name} is serial-tracked, so quantity must be a whole number.`);
        if (l.serials.length !== l.qty) {
          throw new HttpsError('invalid-argument', `Line ${l.row}: ${p.name} needs ${l.qty} serial number(s), ${l.serials.length} given.`);
        }
        const seen = new Set();
        for (const s of l.serials) {
          const n = normSerial(s);
          if (seen.has(n)) throw new HttpsError('invalid-argument', `Line ${l.row}: serial ${s} is repeated.`);
          seen.add(n);
        }
      } else if (l.serials.length) {
        throw new HttpsError('invalid-argument', `Line ${l.row}: ${p.name} is not serial-tracked; remove the serial numbers or turn on tracking for the product.`);
      }
    }

    const serialCount = clean.reduce((n, l) => n + l.serials.length, 0);
    if (serialCount > 300) throw new HttpsError('invalid-argument', 'At most 300 serial numbers per entry. Split it into smaller entries.');

    // Same serial in two lines of one entry?
    const allSerialIds = new Set();
    for (const l of clean) {
      for (const s of l.serials) {
        const id = serialDocId(l.productId, s);
        if (allSerialIds.has(id)) throw new HttpsError('invalid-argument', `Serial ${s} appears in more than one line.`);
        allSerialIds.add(id);
      }
    }

    const moveRef = db.collection('stockMoves').doc(); // group id for this entry
    const entryNo = `${kind.toUpperCase().replace('_', '-')}-${Date.now().toString(36).toUpperCase()}`;

    await db.runTransaction(async (tx) => {
      // ---- reads
      const stockRefs = new Map();
      const addStockRef = (pid, wid) => {
        const id = stockId(pid, wid);
        if (!stockRefs.has(id)) stockRefs.set(id, db.doc(`stock/${id}`));
      };
      clean.forEach((l) => {
        addStockRef(l.productId, l.warehouseId);
        if (kind === 'transfer') addStockRef(l.productId, l.toWarehouseId);
      });
      const stockSnaps = await tx.getAll(...stockRefs.values());
      const qtyNow = Object.fromEntries(stockSnaps.map((s) => [s.id, s.exists ? Number(s.data().qty) || 0 : 0]));

      const serialRefs = [...allSerialIds].map((id) => db.doc(`serials/${id}`));
      const serialSnaps = serialRefs.length ? await tx.getAll(...serialRefs) : [];
      const serialNow = Object.fromEntries(serialSnaps.map((s) => [s.id, s.exists ? s.data() : null]));

      // ---- validate against current state
      const delta = {};
      const bump = (pid, wid, q) => { const id = stockId(pid, wid); delta[id] = (delta[id] || 0) + q; };
      for (const l of clean) {
        const p = products[l.productId];
        if (kind === 'transfer') { bump(l.productId, l.warehouseId, -l.qty); bump(l.productId, l.toWarehouseId, l.qty); }
        else bump(l.productId, l.warehouseId, k.sign * l.qty);

        for (const s of l.serials) {
          const cur = serialNow[serialDocId(l.productId, s)];
          if (k.sign > 0) {
            if (cur && cur.status === 'in_stock') throw new HttpsError('failed-precondition', `${p.name}: serial ${s} is already in stock (${warehouses[cur.warehouseId]?.name || cur.warehouseId}).`);
          } else if (!cur || cur.status !== 'in_stock' || cur.warehouseId !== l.warehouseId) {
            throw new HttpsError('failed-precondition', `${p.name}: serial ${s} is not in stock at ${warehouses[l.warehouseId].name}.`);
          }
        }
      }
      for (const [id, dq] of Object.entries(delta)) {
        const after = (qtyNow[id] || 0) + dq;
        if (after < -1e-9) {
          const [pid, wid] = id.split('__');
          throw new HttpsError('failed-precondition', `${products[pid].name}: only ${qtyNow[id] || 0} in ${warehouses[wid].name}, cannot remove ${-dq}.`);
        }
      }

      // ---- writes
      const now = FieldValue.serverTimestamp();
      for (const [id, dq] of Object.entries(delta)) {
        const [pid, wid] = id.split('__');
        tx.set(stockRefs.get(id), {
          productId: pid,
          warehouseId: wid,
          unitId: warehouses[wid].unitId || null,
          qty: Math.round(((qtyNow[id] || 0) + dq) * 1000) / 1000,
          updatedAt: now,
        }, { merge: true });
      }

      clean.forEach((l, i) => {
        const p = products[l.productId];
        const base = {
          entryId: moveRef.id, entryNo, kind, kindLabel: k.label,
          productId: l.productId, productName: p.name, sku: p.sku,
          serials: l.serials.map(normSerial), note, by: caller.uid, byName: caller.name, at: now,
        };
        if (kind === 'transfer') {
          tx.set(db.collection('stockMoves').doc(`${moveRef.id}_${i}_out`), { ...base, warehouseId: l.warehouseId, qty: -l.qty, otherWarehouseId: l.toWarehouseId });
          tx.set(db.collection('stockMoves').doc(`${moveRef.id}_${i}_in`), { ...base, warehouseId: l.toWarehouseId, qty: l.qty, otherWarehouseId: l.warehouseId });
        } else {
          tx.set(db.collection('stockMoves').doc(`${moveRef.id}_${i}`), { ...base, warehouseId: l.warehouseId, qty: k.sign * l.qty });
        }

        for (const s of l.serials) {
          const ref = db.doc(`serials/${serialDocId(l.productId, s)}`);
          if (kind === 'transfer') {
            tx.update(ref, { warehouseId: l.toWarehouseId, unitId: warehouses[l.toWarehouseId].unitId || null, updatedAt: now });
          } else if (k.sign > 0) {
            tx.set(ref, {
              serial: normSerial(s), productId: l.productId, productName: p.name, sku: p.sku,
              warehouseId: l.warehouseId, unitId: warehouses[l.warehouseId].unitId || null,
              status: 'in_stock', receivedAt: now, receivedVia: kind, entryNo,
              invoiceId: null, customerId: null, soldAt: null, warrantyUntil: null, updatedAt: now,
            });
          } else {
            tx.update(ref, { status: 'removed', removedNote: note, entryNo, updatedAt: now });
          }
        }
      });
    });

    return { ok: true, entryNo, lines: clean.length };
  });

  return { postStockMove };
};

module.exports.stockId = stockId;
module.exports.serialDocId = serialDocId;
module.exports.normSerial = normSerial;
