const { contextBridge, ipcRenderer } = require("electron");


// ======================================================
// PAKKHATTA ELECTRON API
// ======================================================

contextBridge.exposeInMainWorld("electronAPI", {

    // ==================================================
    // PARTIES
    // ==================================================

    getParties: () => {
        return ipcRenderer.invoke("get-parties");
    },

    getParty: (id) => {
        return ipcRenderer.invoke("get-party", id);
    },

    saveParty: (party) => {
        return ipcRenderer.invoke("save-party", party);
    },

    updateParty: (party) => {
        return ipcRenderer.invoke("update-party", party);
    },

    deleteParty: (id) => {
        return ipcRenderer.invoke("delete-party", id);
    },


    // ==================================================
    // ITEMS
    // ==================================================

    getItems: () => {
        return ipcRenderer.invoke("get-items");
    },

    getItem: (id) => {
        return ipcRenderer.invoke("get-item", id);
    },

    saveItem: (item) => {
        return ipcRenderer.invoke("save-item", item);
    },

    updateItem: (item) => {
        return ipcRenderer.invoke("update-item", item);
    },

    deleteItem: (id) => {
        return ipcRenderer.invoke("delete-item", id);
    },

    deleteAllItems: () => {
        return ipcRenderer.invoke("delete-all-items");
    },

    restoreItems: () => {
        return ipcRenderer.invoke("restore-items");
    },

    lookupProductByBarcode: (barcode) => {
        return ipcRenderer.invoke("lookup-product-by-barcode", barcode);
    },

    registerProductByBarcode: (productData) => {
        return ipcRenderer.invoke("register-product-by-barcode", productData);
    },

    getItemBatches: (itemId) => {
        return ipcRenderer.invoke("get-item-batches", itemId);
    },

    addItemBatch: (batchData) => {
        return ipcRenderer.invoke("add-item-batch", batchData);
    },

    getItemExpirySummary: (itemId) => {
        return ipcRenderer.invoke("get-item-expiry-summary", itemId);
    },

    getExpiryAlerts: () => {
        return ipcRenderer.invoke("get-expiry-alerts");
    },


    // ==================================================
    // STOCK
    // ==================================================

    adjustStock: (data) => {
        return ipcRenderer.invoke("adjust-stock", data);
    },

    getStockHistory: (itemId) => {
        return ipcRenderer.invoke("get-stock-history", itemId);
    },


    // ==================================================
    // SALES
    // ==================================================

    getSales: () => {
        return ipcRenderer.invoke("get-sales");
    },

    getSale: (id) => {
        return ipcRenderer.invoke("get-sale", id);
    },

    getNextInvoiceNo: () => {
        return ipcRenderer.invoke("get-next-invoice-no");
    },

    saveSale: (sale) => {
        return ipcRenderer.invoke("save-sale", sale);
    },

    updateSale: (sale) => {
        return ipcRenderer.invoke("update-sale", sale);
    },

    deleteSale: (id) => {
        return ipcRenderer.invoke("delete-sale", id);
    },


    // ==================================================
    // SALE RETURNS
    // ==================================================

    saveSaleReturn: (data) => {
        return ipcRenderer.invoke("save-sale-return", data);
    },

    getSaleReturns: () => {
        return ipcRenderer.invoke("get-sale-returns");
    },

    deleteSaleReturn: (id) => {
        return ipcRenderer.invoke("delete-sale-return", id);
    },


    // ==================================================
    // PURCHASES
    // ==================================================

    getPurchases: () => {
        return ipcRenderer.invoke("get-purchases");
    },

    getPurchase: (id) => {
        return ipcRenderer.invoke("get-purchase", id);
    },

    getNextBillNo: () => {
        return ipcRenderer.invoke("get-next-bill-no");
    },

    savePurchase: (purchase) => {
        return ipcRenderer.invoke("save-purchase", purchase);
    },

    updatePurchase: (purchase) => {
        return ipcRenderer.invoke("update-purchase", purchase);
    },

    deletePurchase: (id) => {
        return ipcRenderer.invoke("delete-purchase", id);
    },


    // ==================================================
    // PURCHASE RETURNS
    // ==================================================

    savePurchaseReturn: (data) => {
        return ipcRenderer.invoke("save-purchase-return", data);
    },

    getPurchaseReturns: () => {
        return ipcRenderer.invoke("get-purchase-returns");
    },

    deletePurchaseReturn: (id) => {
        return ipcRenderer.invoke("delete-purchase-return", id);
    },


    // ==================================================
    // PAYMENTS
    // ==================================================

    getPayments: (partyId) => {
        return ipcRenderer.invoke("get-payments", partyId);
    },

    savePayment: (data) => {
        return ipcRenderer.invoke("save-payment", data);
    },

    deletePayment: (id) => {
        return ipcRenderer.invoke("delete-payment", id);
    },


    // ==================================================
    // LEDGER
    // ==================================================

    getLedger: (partyId) => {
        return ipcRenderer.invoke("get-ledger", partyId);
    },


    // ==================================================
    // EXPENSES
    // ==================================================

    getExpenses: () => {
        return ipcRenderer.invoke("get-expenses");
    },

    saveExpense: (data) => {
        return ipcRenderer.invoke("save-expense", data);
    },

    deleteExpense: (id) => {
        return ipcRenderer.invoke("delete-expense", id);
    },

    deleteAllExpenses: () => {
        return ipcRenderer.invoke("delete-all-expenses");
    },

    restoreExpenses: () => {
        return ipcRenderer.invoke("restore-expenses");
    },


    // ==================================================
    // CASHBOOK
    // ==================================================

    getCashbook: (filters) => {
        return ipcRenderer.invoke("get-cashbook", filters);
    },

    deleteAllCashbook: () => {
        return ipcRenderer.invoke("delete-all-cashbook");
    },

    restoreCashbook: () => {
        return ipcRenderer.invoke("restore-cashbook");
    },


    // ==================================================
    // BANK ACCOUNTS
    // ==================================================

    getBankAccounts: () => {
        return ipcRenderer.invoke("get-bank-accounts");
    },

    deleteAllBankAccounts: () => {
        return ipcRenderer.invoke("delete-all-bank-accounts");
    },

    restoreBankAccounts: () => {
        return ipcRenderer.invoke("restore-bank-accounts");
    },

    saveBankAccount: (data) => {
        return ipcRenderer.invoke("save-bank-account", data);
    },

    deleteBankAccount: (id) => {
        return ipcRenderer.invoke("delete-bank-account", id);
    },


    // ==================================================
    // CASH/BANK TRANSFERS
    // ==================================================

    saveTransfer: (data) => {
        return ipcRenderer.invoke("save-transfer", data);
    },

    getTransfers: (filters) => {
        return ipcRenderer.invoke("get-transfers", filters);
    },

    deleteAllTransfers: () => {
        return ipcRenderer.invoke("delete-all-transfers");
    },

    restoreTransfers: () => {
        return ipcRenderer.invoke("restore-transfers");
    },

    getCardDetail: (cardType) => {
        return ipcRenderer.invoke("get-card-detail", cardType);
    },


    // ==================================================
    // REPORTS
    // ==================================================

    getSalesReport: (filters) => {
        return ipcRenderer.invoke("get-sales-report", filters);
    },

    getPurchaseReport: (filters) => {
        return ipcRenderer.invoke("get-purchase-report", filters);
    },

    getProfitLoss: (filters) => {
        return ipcRenderer.invoke("get-profit-loss", filters);
    },

    getStockReport: () => {
        return ipcRenderer.invoke("get-stock-report");
    },

    getExpenseReport: (filters) => {
        return ipcRenderer.invoke("get-expense-report", filters);
    },

    getDailySummary: (filters) => {
        return ipcRenderer.invoke("get-daily-summary", filters);
    },

    getReceivablesPayables: () => {
        return ipcRenderer.invoke("get-receivables-payables");
    },

    getMonthlyAnalytics: (filters) => {
        return ipcRenderer.invoke("get-monthly-analytics", filters);
    },

    getYearlyAnalytics: () => {
        return ipcRenderer.invoke("get-yearly-analytics");
    },


    // ==================================================
    // COMPANY / SETTINGS
    // ==================================================

    getCompany: () => {
        return ipcRenderer.invoke("get-company");
    },

    saveCompany: (data) => {
        return ipcRenderer.invoke("save-company", data);
    },

    getCompanies: () => {
        return ipcRenderer.invoke("get-companies");
    },

    addCompany: (data) => {
        return ipcRenderer.invoke("add-company", data);
    },

    setActiveCompany: (id) => {
        return ipcRenderer.invoke("set-active-company", { id: id });
    },

    deleteCompany: (id) => {
        return ipcRenderer.invoke("delete-company", id);
    },


    // ==================================================
    // DASHBOARD
    // ==================================================

    getDashboardData: (filters) => {
        return ipcRenderer.invoke("get-dashboard-data", filters || {});
    },

    getDashboardTransactions: (date) => {
        return ipcRenderer.invoke("get-dashboard-transactions", date);
    },

    deleteAllTransactions: () => {
        return ipcRenderer.invoke("delete-all-transactions");
    },

    restoreTransactions: () => {
        return ipcRenderer.invoke("restore-transactions");
    },

    deleteAllSales: () => {
        return ipcRenderer.invoke("delete-all-sales");
    },

    restoreSales: () => {
        return ipcRenderer.invoke("restore-sales");
    },

    deleteAllPurchases: () => {
        return ipcRenderer.invoke("delete-all-purchases");
    },

    restorePurchases: () => {
        return ipcRenderer.invoke("restore-purchases");
    },


    // ==================================================
    // DATABASE BACKUP & RESTORE
    // ==================================================

    backupDatabase: () => {
        return ipcRenderer.invoke("backup-database");
    },

    restoreDatabase: () => {
        return ipcRenderer.invoke("restore-database");
    },


    // ==================================================
    // GLOBAL SEARCH
    // ==================================================

    globalSearch: (query) => {
        return ipcRenderer.invoke("global-search", query);
    },


    // ==================================================
    // PRINT INVOICE
    // ==================================================

    printInvoice: (invoiceData) => {
        return ipcRenderer.invoke("print-invoice", invoiceData);
    },

    getInvoiceHtml: (invoiceData) => {
        return ipcRenderer.invoke("get-invoice-html", invoiceData);
    },


    // ==================================================
    // USERS & PERMISSIONS (PHASE 6)
    // ==================================================

    login: (data) => {
        return ipcRenderer.invoke("login", data);
    },

    logout: () => {
        return ipcRenderer.invoke("logout");
    },

    getCurrentUser: () => {
        return ipcRenderer.invoke("get-current-user");
    },

    getUsers: () => {
        return ipcRenderer.invoke("get-users");
    },

    saveUser: (data) => {
        return ipcRenderer.invoke("save-user", data);
    },

    updateUser: (data) => {
        return ipcRenderer.invoke("update-user", data);
    },

    deleteUser: (id) => {
        return ipcRenderer.invoke("delete-user", id);
    },

    changeOwnPin: (data) => {
        return ipcRenderer.invoke("change-own-pin", data);
    },

    resetUserPinSecure: (data) => {
        return ipcRenderer.invoke("reset-user-pin", data);
    },

    getManagedUsers: () => {
        return ipcRenderer.invoke("get-users-managed");
    },

    // AUTH
    checkAccountExists: () => {
        return ipcRenderer.invoke("check-account-exists");
    },

    createOwnerAccount: (data) => {
        return ipcRenderer.invoke("create-owner-account", data);
    },

    requestSetupOtp: (data) => {
        return ipcRenderer.invoke("setup-send-otp", data);
    },

    verifySetupOtp: (data) => {
        return ipcRenderer.invoke("setup-verify-otp", data);
    },

    forgotSendOtp: (data) => {
        return ipcRenderer.invoke("forgot-send-otp", data);
    },

    verifyResetOtp: (data) => {
        return ipcRenderer.invoke("verify-reset-otp", data);
    },

    completePasswordReset: (data) => {
        return ipcRenderer.invoke("complete-password-reset", data);
    },

    restoreSession: () => {
        return ipcRenderer.invoke("restore-session");
    },

    verifyFunctionPassword: (data) => {
        return ipcRenderer.invoke("verify-function-password", data);
    },


    // ==================================================
    // AUDIT LOG (PHASE 6)
    // ==================================================

    getAuditLog: (filters) => {
        return ipcRenderer.invoke("get-audit-log", filters);
    },


    // ==================================================
    // DAY CLOSING (PHASE 6)
    // ==================================================

    getDayCloseSummary: (filters) => {
        return ipcRenderer.invoke("get-day-close-summary", filters);
    },

    saveDayClose: (data) => {
        return ipcRenderer.invoke("save-day-close", data);
    },

    getDayCloses: (filters) => {
        return ipcRenderer.invoke("get-day-closes", filters);
    }

});


// ======================================================
// PRELOAD READY
// ======================================================

console.log("PakKhatta Preload Loaded");