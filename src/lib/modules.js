// Every module the system will have. `phase` marks when it gets built; `ready` = live now.
// Roles are set up against this full list now, so the owner configures access once.
export const ACTIONS = ['view', 'create', 'edit', 'delete', 'approve', 'export'];

export const MODULES = [
  { id: 'dashboard', ready: true, label: 'Dashboard', phase: 0, actions: ['view'] },
  { id: 'products', ready: true, label: 'Products', phase: 0, actions: ['view', 'create', 'edit', 'delete', 'export'] },
  { id: 'customers', ready: true, label: 'Customers', phase: 0, actions: ['view', 'create', 'edit', 'delete', 'export'], scoped: true },
  { id: 'suppliers', ready: true, label: 'Suppliers', phase: 0, actions: ['view', 'create', 'edit', 'delete', 'export'] },
  { id: 'staff', ready: true, label: 'Staff & hierarchy', phase: 0, actions: ['view', 'create', 'edit'] },
  { id: 'import', ready: true, label: 'Data import', phase: 0, actions: ['create'] },
  { id: 'settings', ready: true, label: 'Company settings', phase: 0, actions: ['view', 'edit'] },
  { id: 'audit', ready: true, label: 'Audit log', phase: 0, actions: ['view'] },
  { id: 'inventory', ready: true, label: 'Inventory', phase: 1, actions: ['view', 'create', 'edit', 'delete', 'export'] },
  { id: 'sales', label: 'Sales', phase: 1, actions: ['view', 'create', 'edit', 'delete', 'approve', 'export'], scoped: true },
  { id: 'receivables', label: 'Receivables', phase: 1, actions: ['view', 'create', 'export'], scoped: true },
  { id: 'purchase', label: 'Purchase', phase: 2, actions: ['view', 'create', 'edit', 'delete', 'approve', 'export'] },
  { id: 'accounts', label: 'Accounts', phase: 2, actions: ['view', 'create', 'edit', 'delete', 'export'] },
  { id: 'gst', label: 'GST', phase: 2, actions: ['view', 'export'] },
  { id: 'manufacturing', label: 'Manufacturing', phase: 3, actions: ['view', 'create', 'edit', 'delete', 'approve'] },
  { id: 'payroll', label: 'HR & payroll', phase: 4, actions: ['view', 'create', 'edit', 'approve', 'export'] },
  { id: 'reports', label: 'Reports', phase: 1, actions: ['view', 'export'] },
];

export const SCOPES = [
  { id: 'own', label: 'Own records only' },
  { id: 'team', label: 'Own + people reporting to them' },
  { id: 'unit', label: 'Own unit only' },
  { id: 'all', label: 'All records' },
];

export const PRODUCT_CATEGORIES_DEFAULT = [
  'Industrial wheel', 'Castor', 'Trolley wheel', 'Forklift wheel',
  'Hand pallet truck', 'Trolley', 'Stacker', 'Spare part', 'Raw material', 'Other',
];

export const GST_RATES = [0, 5, 12, 18, 28];

export const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat',
  'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh',
  'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
  'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh',
  'Uttarakhand', 'West Bengal', 'Andaman and Nicobar Islands', 'Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Jammu and Kashmir', 'Ladakh',
  'Lakshadweep', 'Puducherry',
];
