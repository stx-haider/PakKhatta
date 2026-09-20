### PakKhatta - Desktop POS & Accounting ERP

An offline-first, high-performance Desktop Point of Sale (POS) and Khata/Ledger accounting software tailored for retail stores, wholesalers, and multi-branch commercial businesses.

📌 Overview

PakKhatta is an all-in-one business management solution built to streamline retail billing, wholesale transactions, inventory control, and financial accounting. Engineered with Electron and React, it functions 100% offline with zero external cloud dependencies, keeping all business data safe and secure on the merchant's local machine.

✨ Key Features

### 1. 📊 Interactive Dashboard & Financial KPIs

Live Aggregated Metrics: Real-time visibility into Today's Sales, Returns, Bank Inflows, Purchases, Customer Receivables (Udhaar), Supplier Payables, Stock Value, Cash in Hand, and Net Cash Flow.

3-Dot Drilldown Modals: Instant detailed audit breakdowns for sales, receivables, and bank transactions directly from the dashboard cards.

Session Hydration Guard: Instant and smooth KPI data loading on login and user switches without race conditions or delay.

### 2. 🧾 Billing & Point of Sale (POS)

Retail & Wholesale Modes: Switch seamlessly between retail and wholesale pricing per customer.

Customer Autocomplete Dropdown: Searchable live-filtering dropdown linked to saved customer records with instant auto-population.

Flexible Payments: Support for Cash, Bank/Online transfer, and Credit (Udhaar/Pay Later) payments.

Batch-Aware FIFO Stock Deductions: Accurate inventory allocation preventing stock checkout mismatches.

### 3. 📦 Inventory & Stock Management

Item Cataloging: Track purchase cost, retail price, wholesale price, and unit measures.

Batch & Expiry Monitoring: Low-stock alerts and proactive 30-day expiry warning banners.

Multi-Branch Isolation: Strict stock isolation per branch/company with zero data leakage.

### 4. 👥 Parties & Ledger (Customers & Suppliers)

Full customer and supplier Khata management.

Track outstanding balances, credit limits, and payment histories with Excel import and export.

### 5. 💳 Cash & Bank Management

Unified Financial Ledger: Synchronized tracking of liquid cash in hand vs. bank deposits.

Cashbook ledger recording cash inflows, withdrawals, and bank transfers with period filtering.

### 6. 📈 Comprehensive Business Reports

Reports Included:

Daily Summary

Sales Report

Purchase Report

Profit & Loss Statement

Stock Ledger Report

Expense Report

Receivables & Payables (Udhaar)

Monthly Analytics & Yearly Analytics

Date-range filtering across transaction reports for flexible financial auditing.

### 7. 🔒 Security & Multi-Role Access

Role-Based Controls: Owner, Manager, Cashier, and Salesman permission scopes.

Protected Setup: Masked password-protected installer wizard.

### 🛠️ Tech Stack

Frontend: React.js, Tailwind CSS / Modern CSS, Lucide / React Icons

Runtime: Electron (Node.js IPC Architecture)

Database: SQLite (sql.js / local file-based database)

Packaging & Distribution: electron-builder with NSIS custom installer scripts

### 🚀 Getting Started

Prerequisites

Ensure you have the following installed on your development machine:

Node.js (v16.x, v18.x, or v20.x LTS recommended)

Git

Windows OS (for native Windows builds and NSIS compilation)

Installation

Clone the repository:

git clone https://github.com/your-username/PakKhatta.git
cd PakKhatta


Install project dependencies:

npm install


Launch in development mode:

npm start


(Or run frontend and Electron concurrently according to your package.json setup script)

### 📦 Building the Production Installer (.exe)

PakKhatta packages into a single-file Windows installer via electron-builder and custom NSIS configuration.

1. Clean Build Directory

Delete any previous outputs to ensure a clean compilation:

# Windows Command Prompt / PowerShell
rmdir /s /q dist


2. Compile Frontend Assets

npm run build


3. Generate Windows Executable

npx electron-builder --win


(Or use npm run dist if configured in your scripts)

The compiled installer will be available in:

dist/PakKhatta Setup 1.0.0.exe


### Default Installer Password: If prompted during installation setup, the administrative access key is: 229170

### 📂 Project Structure

PakKhatta/
├── build/                 # Application build icons and metadata
├── src/                   # React frontend application
│   ├── assets/            # Static assets and icons
│   ├── components/        # Reusable UI components, modals, and KPI cards
│   ├── pages/             # Dashboard, Sales, Purchases, Cash & Bank, Reports
│   ├── App.jsx            # Main view router and session provider
│   └── index.js           # Frontend entry point
├── database.js            # SQLite database schema, initialization, and queries
├── main.js                # Electron main process and IPC message handlers
├── preload.js             # Electron preload script exposing safe IPC APIs
├── installer.nsh          # Custom NSIS installer password script
├── package.json           # Project manifest and build scripts
└── README.md              # Project documentation


### 💾 Local Storage & Database Location

All transactions, invoices, and accounting balances are saved locally on the client machine inside SQLite:

Windows Path:

%APPDATA%/pakkhatta/pakkhatta.db


(e.g., C:\Users\<YourUser>\AppData\Roaming\pakkhatta\pakkhatta.db)

### 📞 Support & Maintenance

Developed by Solo Tech

Phone: 0371-0636105

Email: PakKhata229170@gmail.com

### 📄 License

This software is licensed under proprietary terms. Unauthorized copying, distribution, or decompilation of this software via any medium is strictly prohibited.
