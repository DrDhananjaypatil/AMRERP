// Starting roles created on first setup. The owner can edit all of them (except Owner)
// from Settings > Roles & permissions, and add new ones.
const V = ['view'];
const VCE = ['view', 'create', 'edit'];
const ALL = ['view', 'create', 'edit', 'delete', 'export'];

module.exports = {
  manager: {
    name: 'Manager',
    permissions: {
      dashboard: V, products: ALL, customers: ALL, suppliers: ALL,
      staff: ['view'], import: ['create'], settings: ['view'],
      inventory: ALL, sales: [...ALL, 'approve'], receivables: ['view', 'create', 'export'],
      purchase: [...ALL, 'approve'], reports: ['view', 'export'], manufacturing: [...ALL, 'approve'],
    },
    scopes: { customers: 'all', sales: 'all', receivables: 'all' },
    canSeeCost: true,
    maxDiscountPct: 10,
    maxPurchaseAmount: 100000,
  },
  accountant: {
    name: 'Accountant',
    permissions: {
      dashboard: V, products: ['view'], customers: ['view', 'export'], suppliers: ['view', 'create', 'edit', 'export'],
      receivables: ['view', 'create', 'export'], purchase: ['view', 'export'],
      accounts: ALL, gst: ['view', 'export'], reports: ['view', 'export'],
    },
    scopes: { customers: 'all', sales: 'all', receivables: 'all' },
    canSeeCost: true,
    maxDiscountPct: 0,
    maxPurchaseAmount: 0,
  },
  sales_head: {
    name: 'Sales Head',
    permissions: {
      dashboard: V, products: ['view'], customers: ALL, sales: [...ALL, 'approve'],
      receivables: ['view', 'create', 'export'], inventory: ['view'], reports: ['view'],
    },
    scopes: { customers: 'team', sales: 'team', receivables: 'team' },
    canSeeCost: false,
    maxDiscountPct: 8,
    maxPurchaseAmount: 0,
  },
  salesman: {
    name: 'Salesman',
    permissions: {
      dashboard: V, products: ['view'], customers: VCE, sales: VCE,
      receivables: ['view'], inventory: ['view'],
    },
    scopes: { customers: 'own', sales: 'own', receivables: 'own' },
    canSeeCost: false,
    maxDiscountPct: 3,
    maxPurchaseAmount: 0,
  },
  store_keeper: {
    name: 'Store Keeper',
    permissions: {
      dashboard: V, products: ['view'], suppliers: ['view'],
      inventory: VCE, purchase: ['view', 'create'],
    },
    scopes: {},
    canSeeCost: false,
    maxDiscountPct: 0,
    maxPurchaseAmount: 0,
  },
  production_supervisor: {
    name: 'Production Supervisor',
    permissions: {
      dashboard: V, products: ['view'], inventory: ['view', 'create'],
      manufacturing: VCE, payroll: ['view'],
    },
    scopes: {},
    canSeeCost: false,
    maxDiscountPct: 0,
    maxPurchaseAmount: 0,
  },
};
