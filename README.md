# AMR Wheels — Management System (Phase 0)

Web app for AMR Wheels and AMR Technofab. Phase 0 is the foundation every later module builds on:

- Login by **email + password** or **mobile OTP** (owner chooses per employee)
- **Company setup**: both units (GSTIN, address, state), warehouses, pick-lists
- **Roles & permissions** (owner only): module access, actions, data scope, hidden cost/profit, discount and purchase approval limits
- **Staff & hierarchy**: add employees, set role, unit and who they report to; deactivate instantly
- **Masters**: products (with attributes, HSN, GST, dealer and retail price, serial tracking), customers (dealer/retail, credit limit, owner salesperson), suppliers
- **Data import** from Excel/CSV (Miracle exports), with templates and row-by-row checks
- **Audit log**: every create, edit and deactivation with who, when, old and new value

Stack: React + Vite, Firebase Auth, Firestore, Cloud Functions (Mumbai region `asia-south1`), Firebase Hosting.

---

## Folder layout

```
amr-erp/
├── .env.example            ← copy to .env.local and fill in
├── .gitignore
├── firebase.json
├── firestore.rules         ← ALL permissions are enforced here
├── firestore.indexes.json
├── index.html
├── package.json
├── vite.config.js
├── README.md
├── functions/
│   ├── package.json
│   ├── index.js            ← bootstrapOwner, createStaff, updateStaff, auditTrail
│   └── defaultRoles.js     ← starting roles (editable later in the app)
└── src/
    ├── main.jsx
    ├── App.jsx             ← routes and access guards
    ├── firebase.js
    ├── styles.css
    ├── context/AuthContext.jsx
    ├── components/Layout.jsx
    ├── components/MasterPage.jsx
    ├── components/ui.jsx
    ├── lib/modules.js      ← list of all modules (current + future phases)
    ├── lib/masters.js      ← product / customer / supplier fields
    ├── lib/data.js
    ├── lib/excel.js
    └── pages/
        ├── Login.jsx
        ├── Setup.jsx
        ├── Dashboard.jsx
        ├── Masters.jsx     ← Products, Customers, Suppliers screens
        ├── Staff.jsx
        ├── Roles.jsx
        ├── CompanySettings.jsx
        ├── Import.jsx
        └── AuditLog.jsx
```

---

## One-time setup (about 30 minutes)

### 1. Firebase project
1. Go to https://console.firebase.google.com → **Add project** → name it e.g. `amr-wheels`.
2. Upgrade to the **Blaze (pay-as-you-go)** plan. Cloud Functions and SMS OTP need it. At AMR's size most usage stays inside the free allowance, but SMS OTPs are charged per message — check current Firebase pricing and set a budget alert in Google Cloud billing.
3. **Firestore Database** → Create database → **Production mode** → location **asia-south1 (Mumbai)**. The location cannot be changed later.
4. **Authentication** → Get started → Sign-in method → enable **Email/Password** and **Phone**.
   - Under Phone, add 1–2 *test phone numbers* with fixed OTPs for testing without SMS cost.
   - Authentication → Settings → **Authorized domains**: your hosting domain is added automatically; add your custom domain later if you use one.
5. Project settings → General → **Your apps** → add a **Web app** → copy the config values.

### 2. On your computer
Install **Node.js 22** from https://nodejs.org, then in a terminal:

```bash
npm install -g firebase-tools
firebase login

cd amr-erp
cp .env.example .env.local        # then paste the web app config values into .env.local
firebase use --add                # pick the amr-wheels project, alias "default"

npm install
cd functions && npm install && cd ..
```

### 3. Deploy

```bash
firebase deploy --only firestore,functions    # rules, indexes, and the 4 functions
npm run deploy                                # builds the app and deploys hosting
```

The first functions deploy can take 5–10 minutes and may ask to enable some Google Cloud APIs — say yes.

### 4. Create the owner login
1. Open the hosting URL shown after deploy (e.g. `https://amr-wheels.web.app`).
2. Click **First-time setup (owner only)**, enter the owner's name, email and password.
3. On the next screen click **Continue**. This creates the company, both units, default roles, and makes this login **Owner / CEO**. It only works once.

### 5. In the app, as owner
1. **Company settings** — enter GSTIN, address and phone for AMR Wheels and AMR Technofab (same GSTIN for both if they share one).
2. **Roles & permissions** — review the default roles and change access, data scope, cost visibility and approval limits.
3. **Staff & hierarchy** — add employees, choose role, unit and manager. For mobile login, enter their 10-digit number; they sign in with OTP.
4. **Data import** — download each template, paste data exported from Miracle, upload, check the problem rows, import.

---

## How permissions work

| Layer | Where it's set | Enforced by |
|---|---|---|
| Module + action (view/create/edit/delete/approve/export) | Roles & permissions | `firestore.rules` → `can()` |
| Data scope (own / team / unit / all) | Roles & permissions, per scoped module | `firestore.rules` → `inScope()` |
| Hidden cost price | "Can see cost price" on the role | Cost is stored in a separate `productCosts` collection only readable by those roles |
| Hierarchy | Staff & hierarchy → Reports to | `managerChain` on each user; `ownerChain` on each customer |
| Approval limits | Roles & permissions | Stored now; used by quotations (Phase 1) and purchase orders (Phase 2) |

- The screens hide what a role can't use, but the **rules** are what actually block it, so nothing can be read or changed by tampering with the browser.
- "Delete" means **deactivate**. Nothing is erased, so the audit log and old invoices stay valid.
- Changing someone's manager automatically updates the hierarchy for everyone below them and re-links their customers, so the new manager sees them at once.
- The Owner role always has full access and cannot be edited or assigned to anyone else.

## Day-to-day commands

```bash
npm run dev                                   # run locally at http://localhost:5173 (uses the live Firebase project)
npm run deploy                                # publish app changes
firebase deploy --only firestore:rules        # publish rules changes
firebase deploy --only functions              # publish function changes
```

## What comes next (Phase 1)
Inventory with stock by warehouse and serial numbers, QR labels, quotation → sales order → GST invoice → delivery challan, dealer/retail pricing with discount approvals, e-way bill, receivables with payment reminders, and the first live dashboard tiles. Opening stock and opening customer balances are imported at the start of Phase 1.
