// ======================================================
// PAKKHATTA WEB SHIM (browser / localhost mode)
// ------------------------------------------------------
// Replaces the Electron preload API in the browser.
// Every window.electronAPI.* call becomes an HTTP
// request to the local web-server.js (/ipc/<channel>).
// Inside the Electron desktop app this file does
// nothing (electronAPI already exists).
// ======================================================

(function () {

    if (window.electronAPI) {
        // Running inside Electron - real preload already loaded.
        return;
    }


    async function invoke(channel, payload) {

        const response =
            await fetch(
                "/ipc/" + encodeURIComponent(channel),
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify(payload === undefined ? null : payload)
                }
            );

        if (!response.ok) {
            throw new Error(`IPC request failed (${response.status})`);
        }

        const text =
            await response.text();

        let data;

        try {
            data = text ? JSON.parse(text) : null;
        } catch (error) {
            throw new Error("Invalid server response: " + text);
        }

        return data;

    }

    const invokeOf = (channel) =>
        (payload) => invoke(channel, payload);


    window.electronAPI = {

        // PARTIES
        getParties: invokeOf("get-parties"),
        getParty: invokeOf("get-party"),
        saveParty: invokeOf("save-party"),
        updateParty: invokeOf("update-party"),
        deleteParty: invokeOf("delete-party"),

        // ITEMS
        getItems: invokeOf("get-items"),
        getItem: invokeOf("get-item"),
        saveItem: invokeOf("save-item"),
        updateItem: invokeOf("update-item"),
        deleteItem: invokeOf("delete-item"),
        deleteAllItems: invokeOf("delete-all-items"),
        restoreItems: invokeOf("restore-items"),
        lookupProductByBarcode: invokeOf("lookup-product-by-barcode"),
        registerProductByBarcode: invokeOf("register-product-by-barcode"),

        // ITEM BATCHES / EXPIRY
        getItemBatches: invokeOf("get-item-batches"),
        addItemBatch: invokeOf("add-item-batch"),
        getItemExpirySummary: invokeOf("get-item-expiry-summary"),
        getExpiryAlerts: invokeOf("get-expiry-alerts"),

        // STOCK
        adjustStock: invokeOf("adjust-stock"),
        getStockHistory: invokeOf("get-stock-history"),

        // SALES
        getSales: invokeOf("get-sales"),
        getSale: invokeOf("get-sale"),
        getNextInvoiceNo: invokeOf("get-next-invoice-no"),
        saveSale: invokeOf("save-sale"),
        updateSale: invokeOf("update-sale"),
        deleteSale: invokeOf("delete-sale"),

        // SALE RETURNS
        saveSaleReturn: invokeOf("save-sale-return"),
        getSaleReturns: invokeOf("get-sale-returns"),
        deleteSaleReturn: invokeOf("delete-sale-return"),

        // PURCHASES
        getPurchases: invokeOf("get-purchases"),
        getPurchase: invokeOf("get-purchase"),
        getNextBillNo: invokeOf("get-next-bill-no"),
        savePurchase: invokeOf("save-purchase"),
        updatePurchase: invokeOf("update-purchase"),
        deletePurchase: invokeOf("delete-purchase"),

        // PURCHASE RETURNS
        savePurchaseReturn: invokeOf("save-purchase-return"),
        getPurchaseReturns: invokeOf("get-purchase-returns"),
        deletePurchaseReturn: invokeOf("delete-purchase-return"),

        // PAYMENTS
        getPayments: invokeOf("get-payments"),
        savePayment: invokeOf("save-payment"),
        deletePayment: invokeOf("delete-payment"),

        // LEDGER
        getLedger: invokeOf("get-ledger"),

        // EXPENSES
        getExpenses: invokeOf("get-expenses"),
        saveExpense: invokeOf("save-expense"),
        deleteExpense: invokeOf("delete-expense"),
        deleteAllExpenses: invokeOf("delete-all-expenses"),
        restoreExpenses: invokeOf("restore-expenses"),

        // CASHBOOK
        getCashbook: invokeOf("get-cashbook"),
        deleteAllCashbook: invokeOf("delete-all-cashbook"),
        restoreCashbook: invokeOf("restore-cashbook"),

        // BANK ACCOUNTS
        getBankAccounts: invokeOf("get-bank-accounts"),
        deleteAllBankAccounts: invokeOf("delete-all-bank-accounts"),
        restoreBankAccounts: invokeOf("restore-bank-accounts"),
        saveBankAccount: invokeOf("save-bank-account"),
        deleteBankAccount: invokeOf("delete-bank-account"),

        // CASH/BANK TRANSFERS
        saveTransfer: invokeOf("save-transfer"),
        getTransfers: invokeOf("get-transfers"),
        deleteAllTransfers: invokeOf("delete-all-transfers"),
        restoreTransfers: invokeOf("restore-transfers"),

        // DASHBOARD CARD DETAIL
        getCardDetail: invokeOf("get-card-detail"),

        // REPORTS
        getSalesReport: invokeOf("get-sales-report"),
        getPurchaseReport: invokeOf("get-purchase-report"),
        getProfitLoss: invokeOf("get-profit-loss"),
        getStockReport: invokeOf("get-stock-report"),
        getExpenseReport: invokeOf("get-expense-report"),
        getDailySummary: invokeOf("get-daily-summary"),
        getReceivablesPayables: invokeOf("get-receivables-payables"),
        getMonthlyAnalytics: invokeOf("get-monthly-analytics"),
        getYearlyAnalytics: invokeOf("get-yearly-analytics"),

        // COMPANY / SETTINGS
        getCompany: invokeOf("get-company"),
        saveCompany: invokeOf("save-company"),
        getCompanies: invokeOf("get-companies"),
        addCompany: invokeOf("add-company"),
        setActiveCompany: invokeOf("set-active-company"),
        deleteCompany: invokeOf("delete-company"),

        // DASHBOARD
        getDashboardData: (filters) => invokeOf("get-dashboard-data")(filters || {}),
        getDashboardTransactions: invokeOf("get-dashboard-transactions"),
        deleteAllTransactions: invokeOf("delete-all-transactions"),
        restoreTransactions: invokeOf("restore-transactions"),
        deleteAllSales: invokeOf("delete-all-sales"),
        restoreSales: invokeOf("restore-sales"),
        deleteAllPurchases: invokeOf("delete-all-purchases"),
        restorePurchases: invokeOf("restore-purchases"),

        // DATABASE BACKUP & RESTORE
        backupDatabase: invokeOf("backup-database"),
        restoreDatabase: invokeOf("restore-database"),

        // GLOBAL SEARCH
        globalSearch: invokeOf("global-search"),

        // PRINT INVOICE
        printInvoice: invokeOf("print-invoice"),
        getInvoiceHtml: invokeOf("get-invoice-html"),

        // USERS & PERMISSIONS (PHASE 6)
        login: invokeOf("login"),
        logout: invokeOf("logout"),
        getCurrentUser: invokeOf("get-current-user"),
        getUsers: invokeOf("get-users"),
        saveUser: invokeOf("save-user"),
        updateUser: invokeOf("update-user"),
        deleteUser: invokeOf("delete-user"),
        changeOwnPin: invokeOf("change-own-pin"),
        resetUserPinSecure: invokeOf("reset-user-pin"),
        getManagedUsers: invokeOf("get-users-managed"),

        // AUTH
        checkAccountExists: invokeOf("check-account-exists"),
        createOwnerAccount: invokeOf("create-owner-account"),
        restoreSession: invokeOf("restore-session"),

        // AUDIT LOG (PHASE 6)
        getAuditLog: invokeOf("get-audit-log"),

        // DAY CLOSING (PHASE 6)
        getDayCloseSummary: invokeOf("get-day-close-summary"),
        saveDayClose: invokeOf("save-day-close"),
        getDayCloses: invokeOf("get-day-closes")

    };


    console.log("PakKhatta Web API Loaded");

})();
