import { GST_RATES, INDIAN_STATES } from './modules';
import { isValidGstin, isValidMobile } from './data';

// Field definitions shared by the master screens and the Excel import.
// type: text | number | select | checkbox | textarea

const EQUIPMENT = ['Hand pallet truck', 'Trolley', 'Stacker'];

export function productFields(lists = {}) {
  return [
    { key: 'sku', label: 'SKU / item code', type: 'text', required: true, inTable: true, unique: true },
    { key: 'name', label: 'Item name', type: 'text', inTable: true, help: 'Left blank, it is built from category, material, size and capacity.' },
    { key: 'category', label: 'Category', type: 'select', options: lists.categories || [], required: true, inTable: true },
    { key: 'material', label: 'Material', type: 'select', options: lists.materials || [] },
    { key: 'diameterMm', label: 'Diameter (mm)', type: 'number', inTable: true },
    { key: 'widthMm', label: 'Width (mm)', type: 'number' },
    { key: 'capacityKg', label: 'Load capacity (kg)', type: 'number', inTable: true },
    { key: 'bearingType', label: 'Bearing type', type: 'select', options: lists.bearingTypes || [] },
    { key: 'brand', label: 'Brand', type: 'text' },
    { key: 'grade', label: 'Quality grade', type: 'select', options: lists.grades || [] },
    { key: 'hsn', label: 'HSN code', type: 'text', required: true },
    { key: 'gstRate', label: 'GST rate (%)', type: 'select', options: GST_RATES.map(String), default: '18', required: true },
    { key: 'uom', label: 'Unit', type: 'select', options: lists.uoms || ['Nos'], default: 'Nos' },
    { key: 'trackSerial', label: 'Track serial numbers', type: 'checkbox', help: 'Tick for pallet trucks, stackers and other equipment sold with warranty.' },
    { key: 'warrantyMonths', label: 'Warranty (months)', type: 'number' },
    { key: 'reorderLevel', label: 'Reorder level', type: 'number' },
    { key: 'dealerPrice', label: 'Dealer price (₹, excl. GST)', type: 'number', inTable: true, money: true },
    { key: 'retailPrice', label: 'End-customer price (₹, excl. GST)', type: 'number', inTable: true, money: true },
    { key: 'description', label: 'Description', type: 'textarea', full: true },
  ];
}

// Shown and saved only for roles allowed to see cost (stored separately in productCosts).
export const productCostFields = [
  { key: 'costPrice', label: 'Cost price (₹, excl. GST)', type: 'number', money: true, inTable: true, help: 'Purchase price + freight, without GST. From Phase 2 this updates automatically as weighted average cost.' },
];

export function productBeforeSave(d) {
  const out = { ...d };
  if (out.sku) out.sku = String(out.sku).trim().toUpperCase();
  if (!out.name) {
    out.name = [
      out.category,
      out.material,
      out.diameterMm ? `${out.diameterMm}mm` : '',
      out.capacityKg ? `${out.capacityKg}kg` : '',
      out.grade,
    ].filter(Boolean).join(' ');
  }
  if (out.trackSerial === undefined || out.trackSerial === null || out.trackSerial === '') {
    out.trackSerial = EQUIPMENT.includes(out.category);
  }
  if (out.gstRate !== undefined && out.gstRate !== '') out.gstRate = Number(out.gstRate);
  if (out.hsn && !/^\d{4,8}$/.test(String(out.hsn))) return { error: 'HSN code should be 4 to 8 digits.' };
  return { data: out };
}

export const CUSTOMER_TYPES = ['Dealer', 'Distributor', 'Factory / industrial', 'Retail walk-in'];

export function customerFields(company) {
  const units = (company?.units || []).map((u) => ({ value: u.id, label: u.name }));
  return [
    { key: 'name', label: 'Customer / firm name', type: 'text', required: true, inTable: true },
    { key: 'customerType', label: 'Customer type', type: 'select', options: CUSTOMER_TYPES, required: true, inTable: true },
    { key: 'priceList', label: 'Price list', type: 'select', options: [{ value: 'dealer', label: 'Dealer price' }, { value: 'retail', label: 'End-customer price' }], default: 'retail', required: true },
    { key: 'contactPerson', label: 'Contact person', type: 'text' },
    { key: 'phone', label: 'Mobile', type: 'text', inTable: true },
    { key: 'email', label: 'Email', type: 'text' },
    { key: 'gstin', label: 'GSTIN', type: 'text', inTable: true, upper: true },
    { key: 'state', label: 'State', type: 'select', options: INDIAN_STATES, default: 'Maharashtra', required: true },
    { key: 'city', label: 'City', type: 'text', inTable: true },
    { key: 'pincode', label: 'PIN code', type: 'text' },
    { key: 'address', label: 'Billing address', type: 'textarea', full: true },
    { key: 'shippingAddress', label: 'Shipping address (if different)', type: 'textarea', full: true },
    { key: 'creditLimit', label: 'Credit limit (₹)', type: 'number', money: true },
    { key: 'creditDays', label: 'Credit days', type: 'number' },
    { key: 'unitId', label: 'Handled by unit', type: 'select', options: units, default: units[0]?.value, required: true },
  ];
}

export function partyBeforeSave(d) {
  const out = { ...d };
  if (out.gstin) out.gstin = String(out.gstin).trim().toUpperCase();
  if (!isValidGstin(out.gstin)) return { error: 'GSTIN format is not valid (15 characters, e.g. 27ABCDE1234F1Z5).' };
  if (!isValidMobile(out.phone)) return { error: 'Mobile number should be 10 digits.' };
  if (out.phone) out.phone = String(out.phone).replace(/[\s-]/g, '').replace(/^\+91/, '');
  return { data: out };
}

export function supplierFields() {
  return [
    { key: 'name', label: 'Supplier / firm name', type: 'text', required: true, inTable: true },
    { key: 'contactPerson', label: 'Contact person', type: 'text', inTable: true },
    { key: 'phone', label: 'Mobile', type: 'text', inTable: true },
    { key: 'email', label: 'Email', type: 'text' },
    { key: 'gstin', label: 'GSTIN', type: 'text', inTable: true, upper: true },
    { key: 'state', label: 'State', type: 'select', options: INDIAN_STATES, default: 'Maharashtra', required: true },
    { key: 'city', label: 'City', type: 'text', inTable: true },
    { key: 'address', label: 'Address', type: 'textarea', full: true },
    { key: 'paymentDays', label: 'Payment terms (days)', type: 'number' },
    { key: 'supplies', label: 'What they supply', type: 'text', full: true },
    { key: 'notes', label: 'Notes', type: 'textarea', full: true },
  ];
}

// Convert a raw cell (from a form or Excel) into the stored value for a field.
export function coerce(field, raw) {
  if (raw === undefined || raw === null) return field.type === 'checkbox' ? undefined : '';
  if (field.type === 'number') {
    if (raw === '') return null;
    const n = Number(String(raw).replace(/[₹,\s]/g, ''));
    return Number.isFinite(n) ? n : NaN;
  }
  if (field.type === 'checkbox') {
    if (typeof raw === 'boolean') return raw;
    const s = String(raw).trim().toLowerCase();
    if (s === '') return undefined;
    return ['yes', 'y', 'true', '1'].includes(s);
  }
  let s = String(raw).trim();
  if (field.upper) s = s.toUpperCase();
  if (field.type === 'select' && field.options?.length && typeof field.options[0] === 'object') {
    // accept either the stored value or its label
    const hit = field.options.find((o) => o.value === s || o.label.toLowerCase() === s.toLowerCase());
    return hit ? hit.value : s;
  }
  return s;
}

export function optionLabel(field, value) {
  if (field.type !== 'select' || !field.options?.length || typeof field.options[0] !== 'object') return value;
  return field.options.find((o) => o.value === value)?.label ?? value;
}
