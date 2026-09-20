// ======================================================
// RUN MODE: Electron desktop OR Web (localhost) mode
// ------------------------------------------------------
// PAKKHATTAWEB=1 set karke chalao (npm run web) to
// backend plain Node par aur UI http://localhost:3000
// par chalta hai. Warna normal Electron desktop app.
// ======================================================

const WEB_MODE = process.env.PAKKHATTAWEB === "1";

let app;
let BrowserWindow;
let dialog;
let ipcMain;

if (WEB_MODE) {
    // Lightweight ipcMain replacement (web-ipc.js)
    ipcMain = require("./web-ipc");
} else {
    ({ app, BrowserWindow, dialog, ipcMain } = require("electron"));
}

const path = require("path");
const fs = require("fs");

if (!WEB_MODE) {
    process.env.PAKKHATTA_DATA_DIR = app.getPath("userData");
}

const db = require("./database");


// ======================================================
// VALIDATION HELPERS
// ======================================================

function validateRequired(value, fieldName) {
    if (!value || (typeof value === 'string' && !value.trim())) {
        return `${fieldName} is required.`;
    }
    return null;
}

function validateNumber(value, fieldName, min = null, max = null) {
    const num = Number(value);
    if (isNaN(num)) {
        return `${fieldName} must be a valid number.`;
    }
    if (min !== null && num < min) {
        return `${fieldName} must be at least ${min}.`;
    }
    if (max !== null && num > max) {
        return `${fieldName} must be at most ${max}.`;
    }
    return null;
}

function validateEmail(value) {
    if (!value) return null;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) {
        return "Please enter a valid email address.";
    }
    return null;
}

function validatePhone(value) {
    if (!value) return null;
    const phoneRegex = /^[\d\s\-\+\(\)]{10,}$/;
    if (!phoneRegex.test(value)) {
        return "Please enter a valid phone number.";
    }
    return null;
}


// ======================================================
// WINDOW
// ======================================================

function createWindow() {
    const win = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1100,
        minHeight: 700,

        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    win.loadFile(path.join(__dirname, "index.html"));
}


// ======================================================
// HELPER: LOG STOCK HISTORY
// ======================================================

function logStockHistory(itemId, type, quantity, balance, referenceType, referenceId, note) {
    try {
        db.prepare(`
            INSERT INTO stock_history
            (
                item_id,
                type,
                quantity,
                balance,
                reference_type,
                reference_id,
                note,
                created_by
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            itemId,
            type,
            quantity,
            balance,
            referenceType || null,
            referenceId || null,
            note || null,
            currentSession?.id || null
        );
    } catch (error) {
        console.error("Log stock history error:", error);
    }
}

// ======================================================
// HELPER: GENERATE UNIQUE SALE INVOICE NUMBER
// ======================================================

function generateSaleInvoiceNo() {

    const rows = db.prepare(`
        SELECT invoice_no
        FROM sales
    `).all();

    let maxNum = 0;

    for (const row of rows) {
        const num = parseInt(
            String(row.invoice_no || "").replace(/\D/g, ""),
            10
        ) || 0;
        if (num > maxNum) maxNum = num;
    }

    // Loop until guaranteed unique (safety against gaps/collisions)
    let candidate = maxNum + 1;
    const exists = db.prepare(`
        SELECT id
        FROM sales
        WHERE invoice_no = ?
    `);

    while (exists.get(`INV-${candidate}`)) {
        candidate++;
    }

    return `INV-${candidate}`;
}


// ======================================================
// HELPER: GENERATE UNIQUE PURCHASE BILL NUMBER
// ======================================================

function generatePurchaseBillNo() {

    const rows = db.prepare(`
        SELECT bill_no
        FROM purchases
    `).all();

    let maxNum = 0;

    for (const row of rows) {
        const num = parseInt(
            String(row.bill_no || "").replace(/\D/g, ""),
            10
        ) || 0;
        if (num > maxNum) maxNum = num;
    }

    // Loop until guaranteed unique (safety against gaps/collisions)
    let candidate = maxNum + 1;
    const exists = db.prepare(`
        SELECT id
        FROM purchases
        WHERE bill_no = ?
    `);

    while (exists.get(`BILL-${candidate}`)) {
        candidate++;
    }

    return `BILL-${candidate}`;
}




// ======================================================
// GLOBAL BACKEND AUTH GUARD (requirement #8)
// ------------------------------------------------------
// Har non-pre-login IPC call ko valid session chahiye.
// Auth/bootstrap channels (PRE_LOGIN_CHANNELS) exempt
// hain. Business + user-management handlers sab logged-in
// session mangte hain — UI gate ke saath yeh double
// protection deta hai (direct IPC call bhi block hoga).
// ======================================================

let currentSession = null;

const PRE_LOGIN_CHANNELS = new Set([
    "auth-setup-status", "setup-status", "check-account-exists",
    "request-setup-otp", "setup-send-otp",
    "verify-setup-otp", "setup-verify-otp",
    "complete-account-setup", "create-owner-account",
    "internet-status",
    "login", "restore-session",
    "request-reset-otp", "forgot-send-otp",
    "verify-reset-otp", "complete-password-reset"
]);

const CHANNEL_PERMISSIONS = {
    "get-parties": "view_customers",
    "get-party": "view_customers",
    "get-items": "view_products",
    "get-item": "view_products",
    "save-item": "manage_products",
    "update-item": "manage_products",
    "delete-item": "manage_products",
    "delete-all-items": "manage_products",
    "restore-items": "manage_products",
    "get-dashboard-transactions": "view_sales",
    "delete-all-transactions": "manage_products",
    "restore-transactions": "manage_products",
    "delete-all-sales": "delete_sale",
    "restore-sales": "edit_sale",
    "delete-all-purchases": "delete_purchase",
    "restore-purchases": "edit_purchase",
    "delete-all-expenses": "manage_expenses",
    "restore-expenses": "manage_expenses",
    "delete-all-bank-accounts": "manage_cash",
    "restore-bank-accounts": "manage_cash",
    "delete-all-transfers": "manage_cash",
    "restore-transfers": "manage_cash",
    "delete-all-cashbook": "manage_cash",
    "restore-cashbook": "manage_cash",
    "adjust-stock": "stock_adjustment",
    "get-sales": "view_sales",
    "get-sale": "view_sales",
    "save-sale": "create_sale",
    "update-sale": "edit_sale",
    "delete-sale": "delete_sale",
    "save-sale-return": "create_sale",
    "get-sale-returns": "view_sales",
    "delete-sale-return": "delete_sale",
    "get-purchases": "view_purchase",
    "get-purchase": "view_purchase",
    "save-purchase": "create_purchase",
    "update-purchase": "edit_purchase",
    "delete-purchase": "delete_purchase",
    "save-purchase-return": "create_purchase",
    "get-purchase-returns": "view_purchase",
    "delete-purchase-return": "delete_purchase",
    "get-expenses": "manage_expenses",
    "save-expense": "manage_expenses",
    "delete-expense": "manage_expenses",
    "get-payments": "view_customers",
    "save-payment": "view_cash",
    "delete-payment": "view_cash",
    "get-bank-accounts": "view_cash",
    "save-bank-account": "manage_cash",
    "delete-bank-account": "manage_cash",
    "get-cashbook": "view_cash",
    "save-transfer": "manage_cash",
    "get-transfers": "view_cash",
    "get-sales-report": "view_reports",
    "get-purchase-report": "view_reports",
    "get-profit-loss": "view_profit",
    "get-stock-report": "view_reports",
    "get-expense-report": "view_reports",
    "get-receivables-payables": "view_reports",
    "get-users": "settings",
    "save-user": "settings",
    "update-user": "settings",
    "delete-user": "settings",
    "get-audit-log": "settings",
    "get-day-close-summary": "settings",
    "save-day-close": "settings",
    "get-day-closes": "settings",
    "get-company": "view_company",
    "save-company": "manage_company",
    "delete-company": "manage_company"
};

(function installBackendSessionGuard() {
    const _origHandle = ipcMain.handle.bind(ipcMain);
    ipcMain.handle = function (channel, listener) {
        const wrapped = (event, ...args) => {
            if (!PRE_LOGIN_CHANNELS.has(channel) && !currentSession) {
                return {
                    success: false,
                    error: "Login required. Please login to continue."
                };
            }
            const permission = CHANNEL_PERMISSIONS[channel];
            if (permission && !canDo(permission)) {
                return permissionDenied();
            }
            return listener(event, ...args);
        };
        return _origHandle(channel, wrapped);
    };
})();

// ======================================================
// PARTIES
// ======================================================

ipcMain.handle("get-parties", () => {
    try {
        return db.prepare(`
            SELECT *
            FROM parties
            ORDER BY id DESC
        `).all();
    } catch (error) {
        console.error("Get parties error:", error);
        return [];
    }
});


ipcMain.handle("get-party", (event, partyId) => {
    try {
        const id = Number(partyId);

        if (!id) {
            return { success: false, error: "Invalid party ID." };
        }

        const party = db.prepare(`
            SELECT *
            FROM parties
            WHERE id = ?
        `).get(id);

        if (!party) {
            return { success: false, error: "Party not found." };
        }

        return { success: true, party };
    } catch (error) {
        console.error("Get party error:", error);
        return { success: false, error: error.message };
    }
});


ipcMain.handle("save-party", (event, party) => {
    try {
        // Validation
        const nameError = validateRequired(party?.name, "Party name");
        if (nameError) {
            return { success: false, error: nameError };
        }

        const phoneError = validatePhone(party?.phone);
        if (phoneError) {
            return { success: false, error: phoneError };
        }

        const emailError = validateEmail(party?.email);
        if (emailError) {
            return { success: false, error: emailError };
        }

        const balanceError = validateNumber(party?.balance, "Opening balance", 0);
        if (balanceError) {
            return { success: false, error: balanceError };
        }

        const type = String(party.type || "Customer").trim() || "Customer";
        const prefix = /supplier/i.test(type) ? "SUP" : "CUS";
        const partyCode = db.generateNextCode(prefix, "parties", "party_code");

        const result = db.prepare(`
            INSERT INTO parties
            (
                name,
                party_code,
                phone,
                email,
                address,
                type,
                balance,
                opening_balance
            )
            VALUES
            (
                @name,
                @party_code,
                @phone,
                @email,
                @address,
                @type,
                @balance,
                @opening_balance
            )
        `).run({
            name: String(party.name).trim(),
            party_code: partyCode,
            phone: party.phone || "",
            email: party.email || "",
            address: party.address || "",
            type: type,
            balance: Number(party.balance) || 0,
            opening_balance: Number(party.opening_balance) || 0
        });

        return {
            success: true,
            id: result.lastInsertRowid,
            party_code: partyCode
        };
    } catch (error) {
        console.error("Save party error:", error);

        return {
            success: false,
            error: error.message
        };
    }
});


ipcMain.handle("update-party", (event, party) => {
    try {
        if (!party || !party.id) {
            return {
                success: false,
                error: "Invalid party."
            };
        }

        if (!party.name || !String(party.name).trim()) {
            return {
                success: false,
                error: "Party name is required."
            };
        }

        const id = Number(party.id);

        if (!id) {
            return {
                success: false,
                error: "Invalid party ID."
            };
        }

        const existingParty = db.prepare(`
            SELECT id
            FROM parties
            WHERE id = ?
        `).get(id);

        if (!existingParty) {
            return {
                success: false,
                error: "Party not found."
            };
        }

        db.prepare(`
            UPDATE parties
            SET
                name = ?,
                phone = ?,
                email = ?,
                address = ?,
                type = ?
            WHERE id = ?
        `).run(
            String(party.name).trim(),
            party.phone || "",
            party.email || "",
            party.address || "",
            party.type || "Customer",
            id
        );

        return {
            success: true,
            id
        };
    } catch (error) {
        console.error("Update party error:", error);

        return {
            success: false,
            error: error.message
        };
    }
});


ipcMain.handle("delete-party", (event, partyId) => {
    try {
        const id = Number(partyId);

        if (!id) {
            return {
                success: false,
                error: "Invalid party ID."
            };
        }

        const party = db.prepare(`
            SELECT id, name, type
            FROM parties
            WHERE id = ?
        `).get(id);

        if (!party) {
            return {
                success: false,
                error: "Party not found."
            };
        }

        db.prepare(`
            DELETE FROM parties
            WHERE id = ?
        `).run(id);

        return {
            success: true
        };
    } catch (error) {
        console.error("Delete party error:", error);

        return {
            success: false,
            error: error.message
        };
    }
});


// ======================================================
// ITEMS
// ======================================================

ipcMain.handle("get-items", async () => {
    try {
        return db.prepare(`
            SELECT
                items.*,
                categories.name AS category,
                COALESCE(
                    (SELECT expiry_date FROM inventory_batches
                     WHERE item_id = items.id AND quantity_remaining > 0
                     ORDER BY expiry_date ASC LIMIT 1),
                    items.expiry_date
                ) AS current_expiry_date
            FROM items
            LEFT JOIN categories
                ON items.category_id = categories.id
            ORDER BY items.id DESC
        `).all();
    } catch (error) {
        console.error("Get items error:", error);
        return [];
    }
});


ipcMain.handle("get-item", async (event, itemId) => {
    try {
        const id = Number(itemId);

        if (!id) {
            return { success: false, error: "Invalid item ID." };
        }

        const item = db.prepare(`
            SELECT
                items.*,
                categories.name AS category,
                COALESCE(
                    (SELECT expiry_date FROM inventory_batches
                     WHERE item_id = items.id AND quantity_remaining > 0
                     ORDER BY expiry_date ASC LIMIT 1),
                    items.expiry_date
                ) AS current_expiry_date
            FROM items
            LEFT JOIN categories
                ON items.category_id = categories.id
            WHERE items.id = ?
        `).get(id);

        if (!item) {
            return { success: false, error: "Item not found." };
        }

        return { success: true, item };
    } catch (error) {
        console.error("Get item error:", error);
        return { success: false, error: error.message };
    }
});


ipcMain.handle("save-item", async (event, item) => {
    try {
        // Validation
        const nameError = validateRequired(item?.name, "Item name");
        if (nameError) {
            return { success: false, error: nameError };
        }

        const purchasePriceError = validateNumber(item?.purchase_price, "Purchase price", 0);
        if (purchasePriceError) {
            return { success: false, error: purchasePriceError };
        }

        const salePriceError = validateNumber(item?.sale_price, "Sale price", 0);
        if (salePriceError) {
            return { success: false, error: salePriceError };
        }

        const wholesalePriceError = validateNumber(item?.wholesale_price, "Wholesale price", 0);
        if (wholesalePriceError) {
            return { success: false, error: wholesalePriceError };
        }

        const stockError = validateNumber(item?.stock, "Stock", 0);
        if (stockError) {
            return { success: false, error: stockError };
        }

        const taxError = validateNumber(item?.tax_rate, "Tax rate", 0, 100);
        if (taxError) {
            return { success: false, error: taxError };
        }

        const barcode = String(item?.barcode || "").trim();
        if (barcode) {
            const duplicateBarcode = db.prepare(`
                SELECT id FROM items WHERE barcode = ?
            `).get(barcode);
            if (duplicateBarcode) {
                return { success: false, error: "Barcode already belongs to another item." };
            }
        }

        let categoryId = null;

        if (item.category && String(item.category).trim()) {
            const categoryName = String(item.category).trim();

            const existing = db.prepare(`
                SELECT id
                FROM categories
                WHERE name = ?
            `).get(categoryName);

            if (existing) {
                categoryId = existing.id;
            } else {
                const categoryResult = db.prepare(`
                    INSERT INTO categories (name)
                    VALUES (?)
                `).run(categoryName);

                categoryId = categoryResult.lastInsertRowid;
            }
        }

        const itemCode = db.generateNextCode("ITM", "items", "item_code");

        const result = db.prepare(`
            INSERT INTO items
            (
                name,
                item_code,
                barcode,
                brand,
                expiry_date,
                category_id,
                unit,
                alternate_unit,
                conversion_rate,
                purchase_price,
                sale_price,
                wholesale_price,
                mrp,
                stock,
                low_stock_limit,
                tax_rate,
                tax_inclusive,
                item_location
            )
            VALUES
            (
                @name,
                @item_code,
                @barcode,
                @brand,
                @expiry_date,
                @category_id,
                @unit,
                @alternate_unit,
                @conversion_rate,
                @purchase_price,
                @sale_price,
                @wholesale_price,
                @mrp,
                @stock,
                @low_stock_limit,
                @tax_rate,
                @tax_inclusive,
                @item_location
            )
        `).run({
            name: String(item.name).trim(),
            item_code: itemCode,
            barcode,
            brand: String(item.brand || "").trim(),
            expiry_date: item.expiry_date ? String(item.expiry_date).trim() : null,
            category_id: categoryId,
            unit: item.unit || "Pieces",
            alternate_unit: item.alternate_unit || null,
            conversion_rate: item.alternate_unit ? Number(item.conversion_rate) || 1 : null,
            purchase_price: Number(item.purchase_price) || 0,
            sale_price: Number(item.sale_price) || 0,
            wholesale_price: Number(item.wholesale_price) || 0,
            mrp: Number(item.mrp) || 0,
            stock: Number(item.stock) || 0,
            low_stock_limit: item.low_stock_limit === undefined || item.low_stock_limit === null || item.low_stock_limit === ""
                ? 5
                : Number(item.low_stock_limit),
            tax_rate: Number(item.tax_rate) || 0,
            tax_inclusive: item.tax_inclusive ? 1 : 0,
            item_location: String(item.item_location || "").trim()
        });

        const itemId = Number(result.lastInsertRowid);

        // Log opening stock
        if (Number(item.stock) > 0) {
            logStockHistory(
                itemId,
                "Opening",
                Number(item.stock),
                Number(item.stock),
                "item",
                itemId,
                "Opening stock"
            );
        }

        return {
            success: true,
            id: itemId,
            item_code: itemCode
        };
    } catch (error) {
        console.error("Save item error:", error);

        return {
            success: false,
            error: error.message
        };
    }
});


ipcMain.handle("update-item", async (event, item) => {
    try {
        if (!item || !item.id) {
            return {
                success: false,
                error: "Invalid item."
            };
        }

        if (!item.name || !String(item.name).trim()) {
            return {
                success: false,
                error: "Item name is required."
            };
        }

        const id = Number(item.id);

        if (!id) {
            return {
                success: false,
                error: "Invalid item ID."
            };
        }

        const existingItem = db.prepare(`
            SELECT id, stock, barcode
            FROM items
            WHERE id = ?
        `).get(id);

        if (!existingItem) {
            return {
                success: false,
                error: "Item not found."
            };
        }

        const barcode = String(item.barcode || "").trim();
        if (barcode) {
            const duplicateBarcode = db.prepare(`
                SELECT id FROM items WHERE barcode = ? AND id != ?
            `).get(barcode, id);
            if (duplicateBarcode) {
                return { success: false, error: "Barcode already belongs to another item." };
            }
        }

        let categoryId = null;

        if (item.category && String(item.category).trim()) {
            const categoryName = String(item.category).trim();

            const existingCategory = db.prepare(`
                SELECT id
                FROM categories
                WHERE name = ?
            `).get(categoryName);

            if (existingCategory) {
                categoryId = existingCategory.id;
            } else {
                const categoryResult = db.prepare(`
                    INSERT INTO categories (name)
                    VALUES (?)
                `).run(categoryName);

                categoryId = Number(categoryResult.lastInsertRowid);
            }
        }

        db.prepare(`
            UPDATE items
            SET
                name = ?,
                barcode = ?,
                brand = ?,
                expiry_date = ?,
                category_id = ?,
                unit = ?,
                alternate_unit = ?,
                conversion_rate = ?,
                purchase_price = ?,
                sale_price = ?,
                wholesale_price = ?,
                mrp = ?,
                low_stock_limit = ?,
                tax_rate = ?,
                tax_inclusive = ?,
                item_location = ?
            WHERE id = ?
        `).run(
            String(item.name).trim(),
            barcode,
            String(item.brand || "").trim(),
            item.expiry_date ? String(item.expiry_date).trim() : null,
            categoryId,
            item.unit || "Pieces",
            item.alternate_unit || null,
            item.alternate_unit ? Number(item.conversion_rate) || 1 : null,
            Number(item.purchase_price) || 0,
            Number(item.sale_price) || 0,
            Number(item.wholesale_price) || 0,
            Number(item.mrp) || 0,
            item.low_stock_limit === undefined || item.low_stock_limit === null || item.low_stock_limit === ""
                ? 5
                : Number(item.low_stock_limit),
            Number(item.tax_rate) || 0,
            item.tax_inclusive ? 1 : 0,
            String(item.item_location || "").trim(),
            id
        );

        return {
            success: true,
            id
        };
    } catch (error) {
        console.error("Update item error:", error);

        return {
            success: false,
            error: error.message
        };
    }
});


ipcMain.handle("delete-item", async (event, itemId) => {
    try {
        const id = Number(itemId);

        if (!id) {
            return {
                success: false,
                error: "Invalid item ID."
            };
        }

        const item = db.prepare(`
            SELECT id, name
            FROM items
            WHERE id = ?
        `).get(id);

        if (!item) {
            return {
                success: false,
                error: "Item not found."
            };
        }

        db.prepare(`
            UPDATE sale_items
            SET item_id = NULL
            WHERE item_id = ?
        `).run(id);

        db.prepare(`
            UPDATE purchase_items
            SET item_id = NULL
            WHERE item_id = ?
        `).run(id);

        db.prepare(`
            DELETE FROM items
            WHERE id = ?
        `).run(id);

        return {
            success: true
        };
    } catch (error) {
        console.error("Delete item error:", error);

        return {
            success: false,
            error: error.message
        };
    }
});


// ======================================================
// STOCK ADJUSTMENT
// ======================================================

ipcMain.handle("adjust-stock", (event, data) => {
    try {
        if (!canDo("stock_adjustment")) {
            return permissionDenied();
        }

        const itemId = Number(data.item_id || data.itemId || 0);
        const newStock = Number(data.new_stock ?? data.newStock ?? 0);
        const note = data.note || "Stock adjustment";

        if (!itemId) {
            return { success: false, error: "Invalid item ID." };
        }

        if (newStock < 0) {
            return { success: false, error: "Stock cannot be negative." };
        }

        const item = db.prepare(`
            SELECT id, name, stock
            FROM items
            WHERE id = ?
        `).get(itemId);

        if (!item) {
            return { success: false, error: "Item not found." };
        }

        const oldStock = Number(item.stock);
        const diff = newStock - oldStock;

        db.prepare(`
            UPDATE items
            SET stock = ?
            WHERE id = ?
        `).run(newStock, itemId);

        // Weighted Average: increase par naya stock item ki current
        // default purchase price par avg cost me fold-in hota hai.
        // Decrease par avg cost wesa hi rehta hai.
        if (diff > 0) {
            const invItem = db.prepare(`
                SELECT COALESCE(avg_cost, purchase_price, 0) AS avg_cost,
                       COALESCE(purchase_price, 0) AS default_cost
                FROM items
                WHERE id = ?
            `).get(itemId);

            const oldCost = Number(invItem.avg_cost) || 0;
            const openCost = Number(invItem.default_cost) || 0;

            let newAvgCost = oldCost;
            if (oldCost > 0 && newStock > 0) {
                newAvgCost =
                    ((oldStock * oldCost) + (diff * openCost)) / newStock;
            } else if (openCost > 0) {
                newAvgCost = openCost;
            }

            db.prepare(`
                UPDATE items
                SET avg_cost = ?
                WHERE id = ?
            `).run(newAvgCost, itemId);
        }

        logStockHistory(
            itemId,
            diff > 0 ? "Adjustment In" : "Adjustment Out",
            Math.abs(diff),
            newStock,
            "adjustment",
            itemId,
            note
        );

        logAudit(
            currentSession?.id, currentSession?.username,
            "stock_adjusted", "item", itemId,
            { stock: oldStock }, { stock: newStock, note }
        );

        return { success: true };
    } catch (error) {
        console.error("Adjust stock error:", error);
        return { success: false, error: error.message };
    }
});


// ======================================================
// STOCK HISTORY
// ======================================================

ipcMain.handle("get-stock-history", (event, itemId) => {
    try {
        const id = Number(itemId);

        if (!id) {
            return [];
        }

        return db.prepare(`
            SELECT *
            FROM stock_history
            WHERE item_id = ?
            ORDER BY id DESC
            LIMIT 200
        `).all(id);
    } catch (error) {
        console.error("Get stock history error:", error);
        return [];
    }
});


// ======================================================
// NEXT INVOICE / BILL NUMBER
// ======================================================

ipcMain.handle("get-next-invoice-no", () => {
    try {
        return { success: true, invoice_no: generateSaleInvoiceNo() };
    } catch (error) {
        console.error("Get next invoice no error:", error);
        return { success: false, error: error.message };
    }
});


ipcMain.handle("get-next-bill-no", () => {
    try {
        return { success: true, bill_no: generatePurchaseBillNo() };
    } catch (error) {
        console.error("Get next bill no error:", error);
        return { success: false, error: error.message };
    }
});


// ======================================================
// SALES
// ======================================================

ipcMain.handle("get-sales", () => {
    try {
        return db.prepare(`
            SELECT
                sales.*,
                parties.name AS party_name,
                COALESCE(SUM(sale_returns.total), 0) AS returned_total,
                COALESCE(SUM(COALESCE(sale_returns.cash_refunded, CASE WHEN LOWER(sale_returns.payment_method) = 'cash' THEN sale_returns.total ELSE 0 END)), 0) AS cash_refunded,
                COALESCE(SUM(COALESCE(sale_returns.bank_refunded, CASE WHEN LOWER(sale_returns.payment_method) IN ('bank', 'online') THEN sale_returns.total ELSE 0 END)), 0) AS bank_refunded,
                sales.total - COALESCE(SUM(sale_returns.total), 0) AS net_total,
                sales.paid - COALESCE(SUM(COALESCE(sale_returns.cash_refunded, CASE WHEN LOWER(sale_returns.payment_method) = 'cash' THEN sale_returns.total ELSE 0 END)), 0)
                    - COALESCE(SUM(COALESCE(sale_returns.bank_refunded, CASE WHEN LOWER(sale_returns.payment_method) IN ('bank', 'online') THEN sale_returns.total ELSE 0 END)), 0) AS net_paid,
                sales.due - (COALESCE(SUM(sale_returns.total), 0) - COALESCE(SUM(COALESCE(sale_returns.cash_refunded, CASE WHEN LOWER(sale_returns.payment_method) = 'cash' THEN sale_returns.total ELSE 0 END)), 0) - COALESCE(SUM(COALESCE(sale_returns.bank_refunded, CASE WHEN LOWER(sale_returns.payment_method) IN ('bank', 'online') THEN sale_returns.total ELSE 0 END)), 0)) AS net_due
            FROM sales
            LEFT JOIN parties
                ON sales.party_id = parties.id
            LEFT JOIN sale_returns
                ON sale_returns.sale_id = sales.id
            WHERE sales.status IS NULL OR sales.status != 'void'
            GROUP BY sales.id
            ORDER BY sales.id DESC
        `).all();
    } catch (error) {
        console.error("Get sales error:", error);
        return [];
    }
});


ipcMain.handle("get-sale", (event, saleId) => {
    try {
        const id = Number(saleId);

        if (!id) {
            return { success: false, error: "Invalid sale ID." };
        }

        const sale = db.prepare(`
            SELECT
                sales.*,
                parties.name AS party_name,
                parties.party_code AS party_code,
                parties.phone AS party_phone,
                parties.address AS party_address,
                COALESCE((SELECT SUM(total) FROM sale_returns WHERE sale_id = sales.id), 0) AS returned_total,
                sales.total - COALESCE((SELECT SUM(total) FROM sale_returns WHERE sale_id = sales.id), 0) AS net_total,
                sales.paid - COALESCE((SELECT SUM(COALESCE(cash_refunded, CASE WHEN LOWER(payment_method) = 'cash' THEN total ELSE 0 END) + COALESCE(bank_refunded, CASE WHEN LOWER(payment_method) IN ('bank', 'online') THEN total ELSE 0 END)) FROM sale_returns WHERE sale_id = sales.id), 0) AS net_paid,
                sales.due - (COALESCE((SELECT SUM(total) FROM sale_returns WHERE sale_id = sales.id), 0) - COALESCE((SELECT SUM(COALESCE(cash_refunded, CASE WHEN LOWER(payment_method) = 'cash' THEN total ELSE 0 END) + COALESCE(bank_refunded, CASE WHEN LOWER(payment_method) IN ('bank', 'online') THEN total ELSE 0 END)) FROM sale_returns WHERE sale_id = sales.id), 0)) AS net_due
            FROM sales
            LEFT JOIN parties
                ON sales.party_id = parties.id
            WHERE sales.id = ?
        `).get(id);

        if (!sale) {
            return { success: false, error: "Sale not found." };
        }

        const items = db.prepare(`
            SELECT
                sale_items.*,
                items.name AS item_name,
                items.item_code,
                items.unit
            FROM sale_items
            LEFT JOIN items
                ON sale_items.item_id = items.id
            WHERE sale_items.sale_id = ?
        `).all(id);

        return { success: true, sale, items };
    } catch (error) {
        console.error("Get sale error:", error);
        return { success: false, error: error.message };
    }
});


ipcMain.handle("save-sale", (event, data) => {
    try {
        if (!data) {
            return {
                success: false,
                error: "Sale data is missing."
            };
        }

        let invoiceNo = String(
            data.invoice_no ??
            data.invoiceNo ??
            data.invoiceNumber ??
            data.invoice ??
            data.bill_no ??
            ""
        ).trim();

        const partyType = normalizePartyType(
            data.party_type ??
            data.partyType ??
            data.customer_type ??
            data.customerType ??
            "Customer"
        );

        const rawPartyId = data.party_id ?? data.partyId ?? data.customer_id ?? data.customerId;
        const partyId = Number(rawPartyId) || 0;
        const customerName = String(data.customer_name ?? data.customerName ?? "").trim();
        const isWalkInParty = !rawPartyId || String(rawPartyId).trim().toLowerCase() === "walk-in" || !partyId;
        const effectivePartyId = isWalkInParty ? null : partyId;

        // Auto-generate a unique invoice number if not provided
        if (!invoiceNo) {
            invoiceNo = generateSaleInvoiceNo();
        }

        if (!invoiceNo) {
            return {
                success: false,
                error: "Invoice number is required."
            };
        }

        const items = Array.isArray(data.items) ? data.items : [];

        if (items.length === 0) {
            return {
                success: false,
                error: "At least one item is required."
            };
        }

        const subtotal = Number(data.subtotal) || 0;
        const discount = Number(data.discount) || 0;
        const discountType = data.discount_type || data.discountType || "flat";
        const tax = Number(data.tax) || 0;
        const total = Number(data.total) || 0;
        const paid = Number(data.paid) || 0;
        const due = Number(data.due) || 0;
        const paymentMethodInput = String(data.payment_method || data.paymentMethod || "Cash").trim().toLowerCase();
        const paymentMethod = paymentMethodInput === "bank" || paymentMethodInput === "online"
            ? "Bank"
            : paymentMethodInput === "cash"
                ? "Cash"
                : (data.payment_method || data.paymentMethod || "Cash");
        const note = data.note || "";
        const pricingMode = String(data.pricing_mode ?? data.pricingMode ?? "retail").toLowerCase() === "wholesale"
            ? "wholesale"
            : "retail";

        if (total < 0 || paid < 0) {
            return {
                success: false,
                error: "Invalid amount."
            };
        }

        const existingInvoice = db.prepare(`
            SELECT id
            FROM sales
            WHERE invoice_no = ?
        `).get(invoiceNo);

        if (existingInvoice) {
            return {
                success: false,
                error: "Invoice number already exists."
            };
        }

        if (!isWalkInParty) {
            const party = db.prepare(`
                SELECT id, name, type, balance
                FROM parties
                WHERE id = ?
            `).get(effectivePartyId);

            if (!party) {
                return {
                    success: false,
                    error: partyType === "Supplier"
                        ? "Selected supplier was not found."
                        : "Selected customer was not found."
                };
            }

            if (String(party.type || "Customer").toLowerCase() !== partyType.toLowerCase()) {
                return {
                    success: false,
                    error: `Selected ${partyType.toLowerCase()} was not found.`
                };
            }
        }

        // Validate all items and stock, including duplicate rows for one item.
        const requestedQuantities = new Map();
        for (const item of items) {
            const itemId = Number(item.item_id ?? item.itemId ?? 0);
            const quantity = Number(item.quantity) || 0;
            requestedQuantities.set(itemId, (requestedQuantities.get(itemId) || 0) + quantity);
        }

        for (const item of items) {
            const itemId = Number(item.item_id ?? item.itemId ?? 0);
            const quantity = Number(item.quantity) || 0;

            if (!itemId) {
                return { success: false, error: "Invalid item selected." };
            }

            if (quantity <= 0) {
                return { success: false, error: "Quantity must be greater than 0." };
            }

            const dbItem = db.prepare(`
                SELECT id, name, stock, expiry_date
                FROM items
                WHERE id = ?
            `).get(itemId);

            if (!dbItem) {
                return { success: false, error: "Selected item was not found." };
            }

            if (dbItem.expiry_date && dbItem.expiry_date < new Date().toISOString().slice(0, 10)) {
                return {
                    success: false,
                    error: `${dbItem.name} expired on ${dbItem.expiry_date} and cannot be sold.`
                };
            }

                    // items.stock is the same canonical quantity returned to the
                    // Add Sale item dropdown. Batch rows are consumed separately
                    // below, so an expiry-formatted batch cannot hide valid stock.
                    const availableStock = Number(dbItem.stock) || 0;

                    if (availableStock < requestedQuantities.get(itemId)) {
                        return {
                            success: false,
                            error: `Not enough saleable stock for ${dbItem.name}. Available: ${availableStock}`
                        };
                    }
        }

        const transaction = db.transaction(() => {
            const sale = db.prepare(`
                INSERT INTO sales
                (
                    invoice_no,
                    party_id,
                    subtotal,
                    discount,
                    discount_type,
                    tax,
                    total,
                    paid,
                    due,
                    payment_method,
                    customer_name,
                    pricing_mode,
                    status,
                    note,
                    created_by
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?)
            `).run(
                invoiceNo,
                effectivePartyId,
                subtotal,
                discount,
                discountType,
                tax,
                total,
                paid,
                due,
                paymentMethod,
                customerName || (partyType === "Customer" ? "Walk-In Customer" : null),
                pricingMode,
                note,
                currentSession?.id || null
            );

            const saleId = Number(sale.lastInsertRowid);

            for (const item of items) {
                const itemId = Number(item.item_id ?? item.itemId ?? 0);
                const quantity = Number(item.quantity) || 0;
                const price = Number(item.price) || 0;
                const itemTotal = Number(item.total) || (quantity * price);
                const expiryDate = String(item.expiry_date || "").trim() || null;

                db.prepare(`
                    INSERT INTO sale_items
                    (
                        sale_id,
                        item_id,
                        quantity,
                        price,
                        total,
                        expiry_date
                    )
                    VALUES (?, ?, ?, ?, ?, ?)
                `).run(
                    saleId,
                    itemId,
                    quantity,
                    price,
                    itemTotal,
                    expiryDate
                );

                // Reduce stock
                db.prepare(`
                    UPDATE items
                    SET stock = stock - ?
                    WHERE id = ?
                `).run(quantity, itemId);

                consumeInventoryBatches(itemId, quantity);

                // Get new balance
                const updatedItem = db.prepare(`
                    SELECT stock
                    FROM items
                    WHERE id = ?
                `).get(itemId);

                logStockHistory(
                    itemId,
                    "Sale",
                    quantity,
                    Number(updatedItem.stock),
                    "sale",
                    saleId,
                    `Invoice: ${invoiceNo}`
                );
            }

            if (due > 0 && effectivePartyId) {
                db.prepare(`
                    UPDATE parties
                    SET balance = balance + ?
                    WHERE id = ?
                `).run(due, effectivePartyId);
            }

            if (paid > 0 && paymentMethod === "Cash") {
                db.prepare(`
                    UPDATE cash
                    SET balance = balance + ?
                    WHERE id = 1
                `).run(paid);
            }

            if (paid > 0 && paymentMethod === "Bank") {
                const bank = db.prepare(`
                    SELECT id
                    FROM bank_accounts
                    ORDER BY id ASC
                    LIMIT 1
                `).get();

                if (bank) {
                    db.prepare(`
                        UPDATE bank_accounts
                        SET current_balance = current_balance + ?
                        WHERE id = ?
                    `).run(paid, bank.id);
                }
            }

            return saleId;
        });

        const saleId = transaction();

        logAudit(
            currentSession?.id, currentSession?.username,
            "sale_created", "sale", Number(saleId),
            null, { invoice_no: data.invoice_no, total: data.total, payment_method: data.payment_method }
        );

        return {
            success: true,
            id: saleId
        };
    } catch (error) {
        console.error("Save sale error:", error);

        return {
            success: false,
            error: error.message
        };
    }
});


ipcMain.handle("update-sale", (event, data) => {
    try {
        if (!canDo("edit_sale")) {
            return permissionDenied();
        }

        const saleId = Number(data.id ?? data.sale_id ?? 0);

        if (!saleId) {
            return { success: false, error: "Invalid sale ID." };
        }

        const originalSale = db.prepare(`
            SELECT id, party_id
            FROM sales
            WHERE id = ?
        `).get(saleId);

        if (!originalSale) {
            return { success: false, error: "Original sale was not found." };
        }

        const existingSale = db.prepare(`
            SELECT *
            FROM sales
            WHERE id = ?
        `).get(saleId);

        if (!existingSale) {
            return { success: false, error: "Sale not found." };
        }

        const partyId = Number(data.party_id ?? data.partyId ?? existingSale.party_id ?? 0) || 0;
        const effectivePartyId = partyId || null;
        const items = Array.isArray(data.items) ? data.items : [];

        if (items.length === 0) {
            return { success: false, error: "At least one item is required." };
        }

        const subtotal = Number(data.subtotal) || 0;
        const discount = Number(data.discount) || 0;
        const discountType = data.discount_type || data.discountType || "flat";
        const tax = Number(data.tax) || 0;
        const total = Number(data.total) || 0;
        const paid = Number(data.paid) || 0;
        const due = Number(data.due) || 0;
        const paymentMethod = data.payment_method || data.paymentMethod || "Cash";
        const note = data.note || "";

        for (const item of items) {
            const itemId = Number(item.item_id ?? item.itemId ?? 0);
            const dbItem = db.prepare(`
                SELECT name, expiry_date, stock
                FROM items
                WHERE id = ?
            `).get(itemId);

            if (!dbItem) {
                return { success: false, error: "Selected item was not found." };
            }

            if (dbItem.expiry_date && dbItem.expiry_date < new Date().toISOString().slice(0, 10)) {
                return {
                    success: false,
                    error: `${dbItem.name} expired on ${dbItem.expiry_date} and cannot be sold.`
                };
            }

            if (Number(dbItem.stock) < Number(item.quantity)) {
                return { success: false, error: `Not enough stock for ${dbItem.name}. Available: ${dbItem.stock}` };
            }
        }

        const transaction = db.transaction(() => {
            // Restore old stock
            const oldItems = db.prepare(`
                SELECT item_id, quantity
                FROM sale_items
                WHERE sale_id = ?
            `).all(saleId);

            for (const oldItem of oldItems) {
                if (!oldItem.item_id) continue;

                db.prepare(`
                    UPDATE items
                    SET stock = stock + ?
                    WHERE id = ?
                `).run(Number(oldItem.quantity) || 0, Number(oldItem.item_id));
            }

            // Restore old party balance
            if (Number(existingSale.due || 0) > 0 && existingSale.party_id) {
                db.prepare(`
                    UPDATE parties
                    SET balance = MAX(0, balance - ?)
                    WHERE id = ?
                `).run(Number(existingSale.due) || 0, Number(existingSale.party_id));
            }

            // Restore old cash/bank
            if (Number(existingSale.paid || 0) > 0) {
                const oldMethod = existingSale.payment_method || "Cash";

                if (oldMethod === "Cash") {
                    db.prepare(`
                        UPDATE cash
                        SET balance = MAX(0, balance - ?)
                        WHERE id = 1
                    `).run(Number(existingSale.paid) || 0);
                } else if (oldMethod === "Bank") {
                    const bank = db.prepare(`
                        SELECT id
                        FROM bank_accounts
                        ORDER BY id ASC
                        LIMIT 1
                    `).get();

                    if (bank) {
                        db.prepare(`
                            UPDATE bank_accounts
                            SET current_balance = current_balance - ?
                            WHERE id = ?
                        `).run(Number(existingSale.paid) || 0, bank.id);
                    }
                }
            }

            // Delete old items
            db.prepare(`
                DELETE FROM sale_items
                WHERE sale_id = ?
            `).run(saleId);

            // Update sale
            db.prepare(`
                UPDATE sales
                SET
                    party_id = ?,
                    subtotal = ?,
                    discount = ?,
                    discount_type = ?,
                    tax = ?,
                    total = ?,
                    paid = ?,
                    due = ?,
                    payment_method = ?,
                    note = ?
                WHERE id = ?
            `).run(
                effectivePartyId,
                subtotal,
                discount,
                discountType,
                tax,
                total,
                paid,
                due,
                paymentMethod,
                note,
                saleId
            );

            // Insert new items
            for (const item of items) {
                const itemId = Number(item.item_id ?? item.itemId ?? 0);
                const quantity = Number(item.quantity) || 0;
                const price = Number(item.price) || 0;
                const itemTotal = Number(item.total) || (quantity * price);
                const expiryDate = String(item.expiry_date || "").trim() || null;

                db.prepare(`
                    INSERT INTO sale_items
                    (
                        sale_id,
                        item_id,
                        quantity,
                        price,
                        total,
                        expiry_date
                    )
                    VALUES (?, ?, ?, ?, ?, ?)
                `).run(saleId, itemId, quantity, price, itemTotal, expiryDate);

                db.prepare(`
                    UPDATE items
                    SET stock = stock - ?
                    WHERE id = ?
                `).run(quantity, itemId);

                consumeInventoryBatches(itemId, quantity);

                const updatedItem = db.prepare(`
                    SELECT stock
                    FROM items
                    WHERE id = ?
                `).get(itemId);

                logStockHistory(
                    itemId,
                    "Sale Edit",
                    quantity,
                    Number(updatedItem.stock),
                    "sale",
                    saleId,
                    `Invoice: ${existingSale.invoice_no} (edited)`
                );
            }

            // Update new party balance
            if (due > 0 && effectivePartyId) {
                db.prepare(`
                    UPDATE parties
                    SET balance = balance + ?
                    WHERE id = ?
                `).run(due, effectivePartyId);
            }

            // Update new cash/bank
            if (paid > 0 && paymentMethod === "Cash") {
                db.prepare(`
                    UPDATE cash
                    SET balance = balance + ?
                    WHERE id = 1
                `).run(paid);
            }

            if (paid > 0 && paymentMethod === "Bank") {
                const bank = db.prepare(`
                    SELECT id
                    FROM bank_accounts
                    ORDER BY id ASC
                    LIMIT 1
                `).get();

                if (bank) {
                    db.prepare(`
                        UPDATE bank_accounts
                        SET current_balance = current_balance + ?
                        WHERE id = ?
                    `).run(paid, bank.id);
                }
            }
        });

        transaction();

        return { success: true, id: saleId };
    } catch (error) {
        console.error("Update sale error:", error);
        return { success: false, error: error.message };
    }
});


ipcMain.handle("delete-sale", (event, saleId) => {
    try {
        if (!canDo("delete_sale")) {
            return permissionDenied();
        }

        const id = Number(saleId);

        if (!id) {
            return {
                success: false,
                error: "Invalid sale ID."
            };
        }

        const sale = db.prepare(`
            SELECT
                id,
                party_id,
                total,
                paid,
                due,
                payment_method
            FROM sales
            WHERE id = ?
        `).get(id);

        if (!sale) {
            return {
                success: false,
                error: "Sale not found."
            };
        }

        const saleItems = db.prepare(`
            SELECT item_id, quantity
            FROM sale_items
            WHERE sale_id = ?
        `).all(id);

        const transaction = db.transaction(() => {
            for (const saleItem of saleItems) {
                if (!saleItem.item_id) continue;

                const itemId = Number(saleItem.item_id);
                const quantity = Number(saleItem.quantity) || 0;

                db.prepare(`
                    UPDATE items
                    SET stock = stock + ?
                    WHERE id = ?
                `).run(quantity, itemId);

                // Restore batch quantities (reverse FEFO consumption)
                const batches = db.prepare(`
                    SELECT id, quantity_remaining, quantity
                    FROM inventory_batches
                    WHERE item_id = ? AND quantity_remaining < quantity
                    ORDER BY expiry_date DESC NULLS LAST, id DESC
                `).all(itemId);

                let restoreRemaining = quantity;
                for (const batch of batches) {
                    if (restoreRemaining <= 0) break;
                    const batchQty = Number(batch.quantity);
                    const batchRem = Number(batch.quantity_remaining);
                    const canRestore = Math.min(restoreRemaining, batchQty - batchRem);
                    db.prepare(`
                        UPDATE inventory_batches
                        SET quantity_remaining = quantity_remaining + ?
                        WHERE id = ?
                    `).run(canRestore, batch.id);
                    restoreRemaining -= canRestore;
                }
            }

            if (Number(sale.due || 0) > 0) {
                db.prepare(`
                    UPDATE parties
                    SET balance = MAX(0, balance - ?)
                    WHERE id = ?
                `).run(
                    Number(sale.due) || 0,
                    Number(sale.party_id)
                );
            }

            if (
                Number(sale.paid || 0) > 0 &&
                (
                    !sale.payment_method ||
                    sale.payment_method === "Cash"
                )
            ) {
                db.prepare(`
                    UPDATE cash
                    SET balance = MAX(0, balance - ?)
                    WHERE id = 1
                `).run(Number(sale.paid) || 0);
            }

            if (
                Number(sale.paid || 0) > 0 &&
                sale.payment_method === "Bank"
            ) {
                const bank = db.prepare(`
                    SELECT id
                    FROM bank_accounts
                    ORDER BY id ASC
                    LIMIT 1
                `).get();

                if (bank) {
                    db.prepare(`
                        UPDATE bank_accounts
                        SET current_balance = current_balance - ?
                        WHERE id = ?
                    `).run(
                        Number(sale.paid) || 0,
                        bank.id
                    );
                }
            }

            db.prepare(`
                DELETE FROM sale_items
                WHERE sale_id = ?
            `).run(id);

            db.prepare(`
                DELETE FROM sales
                WHERE id = ?
            `).run(id);
        });

        transaction();

        logAudit(
            currentSession?.id, currentSession?.username,
            "sale_deleted", "sale", id, null, null
        );

        return {
            success: true
        };
    } catch (error) {
        console.error("Delete sale error:", error);

        return {
            success: false,
            error: error.message
        };
    }
});

ipcMain.handle("delete-all-sales", async () => {
    try {
        const result = await Promise.resolve().then(() => db.transaction(() => {
            db.prepare("DELETE FROM sales_backup").run();
            const sales = db.prepare("SELECT * FROM sales").all();
            const saleItems = db.prepare("SELECT * FROM sale_items").all();
            for (const row of sales) {
                db.prepare("INSERT INTO sales_backup (source_table, source_id, payload) VALUES (?, ?, ?)")
                    .run("sales", row.id, JSON.stringify(row));
            }
            for (const row of saleItems) {
                db.prepare("INSERT INTO sales_backup (source_table, source_id, payload) VALUES (?, ?, ?)")
                    .run("sale_items", row.id, JSON.stringify(row));
                if (row.item_id) {
                    db.prepare("UPDATE items SET stock = stock + ? WHERE id = ?")
                        .run(Number(row.quantity) || 0, Number(row.item_id));
                }
            }
            db.prepare("DELETE FROM sale_items").run();
            db.prepare("DELETE FROM sales").run();
            return sales.length;
        })());
        return { success: true, deleted: Number(result || 0) };
    } catch (error) {
        console.error("Delete all sales error:", error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle("restore-sales", async () => {
    try {
        const restored = await Promise.resolve().then(() => db.transaction(() => {
            let count = 0;
            const backups = db.prepare("SELECT source_table, payload FROM sales_backup ORDER BY id ASC").all();
            for (const backup of backups) {
                if (backup.source_table !== "sales") continue;
                const row = JSON.parse(backup.payload);
                const columns = Object.keys(row);
                const result = db.prepare(`INSERT OR IGNORE INTO sales (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`)
                    .run(columns.map(column => row[column]));
                count += Number(result.changes || 0);
            }
            for (const backup of backups) {
                if (backup.source_table !== "sale_items") continue;
                const row = JSON.parse(backup.payload);
                const columns = Object.keys(row);
                const result = db.prepare(`INSERT OR IGNORE INTO sale_items (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`)
                    .run(columns.map(column => row[column]));
                count += Number(result.changes || 0);
            }
            return count;
        })());
        return { success: true, restored };
    } catch (error) {
        console.error("Restore sales error:", error);
        return { success: false, error: error.message };
    }
});


// ======================================================
// SALE RETURNS
// ======================================================

// ======================================================
// SALE RETURN STATUS HELPER
// Agar kisi sale ke saare items wapas aa gaye hon to
// sale ko 'returned' mark hota hai (Sales tab se hide).
// Return delete hone par wapas 'completed'.
// ======================================================

function isSaleFullyReturned(saleId) {

    const saleItems = db.prepare(`
        SELECT item_id, quantity
        FROM sale_items
        WHERE sale_id = ?
    `).all(saleId);

    if (!saleItems.length) return false;

    for (const si of saleItems) {

        if (!si.item_id) return false;

        const returnedQty = db.prepare(`
            SELECT COALESCE(SUM(sri.quantity), 0) AS q
            FROM sale_return_items sri
            JOIN sale_returns sr
                ON sr.id = sri.return_id
            WHERE sr.sale_id = ?
              AND sri.item_id = ?
        `).get(saleId, si.item_id);

        if (Number(returnedQty?.q || 0) < Number(si.quantity)) {
            return false;
        }

    }

    return true;

}

function syncSaleReturnStatus(saleId) {

    db.prepare(`
        UPDATE sales
        SET status = ?
        WHERE id = ?
    `).run(
        isSaleFullyReturned(saleId) ? "returned" : "completed",
        saleId
    );

}


ipcMain.handle("save-sale-return", (event, data) => {
    try {
        const saleId = Number(data.sale_id ?? data.saleId ?? 0);
        let partyId = Number(data.party_id ?? data.partyId ?? 0);
        const returnNo = String(data.return_no ?? data.returnNo ?? `RET-${Date.now()}`).trim();
        const items = Array.isArray(data.items) ? data.items : [];

        if (!saleId) {
            return { success: false, error: "Invalid sale ID." };
        }

        const originalSale = db.prepare(`
            SELECT sales.id, sales.party_id, sales.customer_name, parties.name AS party_name
            FROM sales
            LEFT JOIN parties ON sales.party_id = parties.id
            WHERE sales.id = ?
        `).get(saleId);

        if (!originalSale) {
            return { success: false, error: "Original sale not found." };
        }

        const customerName = String(
            data.customer_name ?? data.customerName ?? originalSale.customer_name ?? originalSale.party_name ?? ""
        ).trim() || "Walk-In Customer";

        // If partyId not provided, get from original sale
        if (!partyId) {
            partyId = Number(originalSale.party_id) || 0;
        }

        if (items.length === 0) {
            return { success: false, error: "At least one item is required." };
        }

        const soldQuantities = db.prepare(`
            SELECT item_id, SUM(quantity) AS quantity
            FROM sale_items
            WHERE sale_id = ?
            GROUP BY item_id
        `).all(saleId);
        const alreadyReturned = db.prepare(`
            SELECT sri.item_id, SUM(sri.quantity) AS quantity
            FROM sale_return_items sri
            JOIN sale_returns sr ON sr.id = sri.return_id
            WHERE sr.sale_id = ?
            GROUP BY sri.item_id
        `).all(saleId);
        const soldByItem = new Map(soldQuantities.map(row => [Number(row.item_id), Number(row.quantity) || 0]));
        const returnedByItem = new Map(alreadyReturned.map(row => [Number(row.item_id), Number(row.quantity) || 0]));
        const requestedReturns = new Map();

        for (const item of items) {
            const itemId = Number(item.item_id ?? item.itemId ?? 0);
            const quantity = Number(item.quantity) || 0;
            if (!itemId || quantity <= 0) {
                return { success: false, error: "Return quantity must be greater than 0." };
            }
            requestedReturns.set(itemId, (requestedReturns.get(itemId) || 0) + quantity);
        }

        for (const [itemId, quantity] of requestedReturns) {
            const soldQuantity = soldByItem.get(itemId);
            if (soldQuantity === undefined) {
                return { success: false, error: "Returned item was not part of the original sale." };
            }
            const remaining = soldQuantity - (returnedByItem.get(itemId) || 0);
            if (quantity > remaining) {
                return { success: false, error: `Return quantity exceeds the remaining sold quantity. Available: ${remaining}` };
            }
        }

        const subtotal = Number(data.subtotal) || 0;
        const total = Number(data.total) || 0;
        const paymentMethod = data.payment_method || data.paymentMethod || "Cash";
        const note = data.note || "";
        const originalSaleForRefund = db.prepare(`
            SELECT due
            FROM sales
            WHERE id = ?
        `).get(saleId);
        const saleDue = Math.max(0, Number(originalSaleForRefund?.due) || 0);
        const creditAdjust = Math.min(total, saleDue);
        const cashRefund = paymentMethod === "Cash" ? total - creditAdjust : 0;
        const bankRefund = paymentMethod === "Bank" || paymentMethod === "Online"
            ? total - creditAdjust
            : 0;

        const transaction = db.transaction(() => {
            const result = db.prepare(`
                INSERT INTO sale_returns
                (
                    sale_id,
                    party_id,
                    return_no,
                    subtotal,
                    total,
                    payment_method,
                    customer_name,
                    cash_refunded,
                    bank_refunded,
                    note,
                    created_by
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(saleId, partyId, returnNo, subtotal, total, paymentMethod, customerName, cashRefund, bankRefund, note,
                currentSession?.id || null);

            const returnId = Number(result.lastInsertRowid);

            for (const item of items) {
                const itemId = Number(item.item_id ?? item.itemId ?? 0);
                const quantity = Number(item.quantity) || 0;
                const price = Number(item.price) || 0;
                const itemTotal = Number(item.total) || (quantity * price);

                db.prepare(`
                    INSERT INTO sale_return_items
                    (
                        return_id,
                        item_id,
                        quantity,
                        price,
                        total
                    )
                    VALUES (?, ?, ?, ?, ?)
                `).run(returnId, itemId, quantity, price, itemTotal);

                // Restore stock
                db.prepare(`
                    UPDATE items
                    SET stock = stock + ?
                    WHERE id = ?
                `).run(quantity, itemId);

                const updatedItem = db.prepare(`
                    SELECT stock
                    FROM items
                    WHERE id = ?
                `).get(itemId);

                logStockHistory(
                    itemId,
                    "Sale Return",
                    quantity,
                    Number(updatedItem.stock),
                    "sale_return",
                    returnId,
                    `Return: ${returnNo}`
                );
            }

            // Refund split — original sale ke paid/due ke hisab se:
            // - pehle unpaid (due) hissa customer ki balance se adjust hota hai
            // - baqi jitna cash/bank mein paid tha wo cash/bank se wapas hota hai
            if (total > 0) {
                if (creditAdjust > 0 && partyId) {
                    db.prepare(`
                        UPDATE parties
                        SET balance = MAX(0, balance - ?)
                        WHERE id = ?
                    `).run(creditAdjust, partyId);
                }

                // Adjust cash/bank (refund money to customer)
                if (cashRefund > 0 && paymentMethod === "Cash") {
                    db.prepare(`
                        UPDATE cash
                        SET balance = MAX(0, balance - ?)
                        WHERE id = 1
                    `).run(cashRefund);
                } else if (bankRefund > 0 && (paymentMethod === "Bank" || paymentMethod === "Online")) {
                    const bank = db.prepare(`
                        SELECT id
                        FROM bank_accounts
                        ORDER BY id ASC
                        LIMIT 1
                    `).get();

                    if (bank) {
                        db.prepare(`
                            UPDATE bank_accounts
                            SET current_balance = current_balance - ?
                            WHERE id = ?
                        `).run(bankRefund, bank.id);
                    }
                }
            }

            // Agar poori sale wapas aa chuki hai to 'returned' mark
            syncSaleReturnStatus(saleId);

            return returnId;
        });

        const returnId = transaction();

        return { success: true, id: returnId };
    } catch (error) {
        console.error("Save sale return error:", error);
        return { success: false, error: error.message };
    }
});


ipcMain.handle("get-sale-returns", () => {
    try {
        return db.prepare(`
            SELECT
                sale_returns.*,
                COALESCE(NULLIF(sale_returns.customer_name, ''), NULLIF(sales.customer_name, ''), parties.name, 'Walk-In Customer') AS party_name,
                sales.invoice_no
            FROM sale_returns
            LEFT JOIN parties
                ON sale_returns.party_id = parties.id
            LEFT JOIN sales
                ON sale_returns.sale_id = sales.id
            ORDER BY sale_returns.id DESC
        `).all();
    } catch (error) {
        console.error("Get sale returns error:", error);
        return [];
    }
});


// ======================================================
// DELETE SALE RETURN
// ======================================================

ipcMain.handle("delete-sale-return", (event, returnId) => {
    try {
        const id = Number(returnId);

        if (!id) {
            return {
                success: false,
                error: "Invalid return ID."
            };
        }

        const saleReturn = db.prepare(`
            SELECT
                id,
                sale_id,
                party_id,
                total,
                payment_method,
                cash_refunded,
                bank_refunded
            FROM sale_returns
            WHERE id = ?
        `).get(id);

        if (!saleReturn) {
            return {
                success: false,
                error: "Sale return not found."
            };
        }

        const returnItems = db.prepare(`
            SELECT item_id, quantity
            FROM sale_return_items
            WHERE return_id = ?
        `).all(id);

        const transaction = db.transaction(() => {
            for (const item of returnItems) {
                if (!item.item_id) continue;
                // Reduce the stock that was previously restored
                db.prepare(`
                    UPDATE items
                    SET stock = stock - ?
                    WHERE id = ?
                `).run(
                    Number(item.quantity) || 0,
                    Number(item.item_id)
                );
            }

            // Reverse the refund split (same split logic as create):
            // - jo hissa customer balance se adjust hua tha wo wapas add hota hai
            // - jo hissa cash/bank se refund hua tha wo wapas milta hai
            if (Number(saleReturn.total || 0) > 0) {
                const returnTotal = Number(saleReturn.total) || 0;
                const paymentMethod = saleReturn.payment_method || "Cash";

                const sale = db.prepare(`
                    SELECT paid, due
                    FROM sales
                    WHERE id = ?
                `).get(saleReturn.sale_id);

                const saleDue = Math.max(0, Number(sale?.due) || 0);
                const creditAdjust = Math.min(returnTotal, saleDue);
                const cashRefund = Number(saleReturn.cash_refunded ??
                    (paymentMethod === "Cash" ? returnTotal - creditAdjust : 0));
                const bankRefund = Number(saleReturn.bank_refunded ??
                    (paymentMethod === "Bank" || paymentMethod === "Online" ? returnTotal - creditAdjust : 0));

                if (creditAdjust > 0 && saleReturn.party_id) {
                    db.prepare(`
                        UPDATE parties
                        SET balance = balance + ?
                        WHERE id = ?
                    `).run(
                        creditAdjust,
                        Number(saleReturn.party_id)
                    );
                }

                if (cashRefund > 0 && paymentMethod === "Cash") {
                    db.prepare(`
                        UPDATE cash
                        SET balance = balance + ?
                        WHERE id = 1
                    `).run(cashRefund);
                } else if (bankRefund > 0 && (paymentMethod === "Bank" || paymentMethod === "Online")) {
                    const bank = db.prepare(`
                        SELECT id
                        FROM bank_accounts
                        ORDER BY id ASC
                        LIMIT 1
                    `).get();

                    if (bank) {
                        db.prepare(`
                            UPDATE bank_accounts
                            SET current_balance = current_balance + ?
                            WHERE id = ?
                        `).run(bankRefund, bank.id);
                    }
                }
            }

            db.prepare(`
                DELETE FROM sale_return_items
                WHERE return_id = ?
            `).run(id);

            db.prepare(`
                DELETE FROM sale_returns
                WHERE id = ?
            `).run(id);

            // Return delete hone par sale ka status dobara check karo —
            // agar ab poori sale wapas nahi hui to wapas 'completed'
            syncSaleReturnStatus(Number(saleReturn.sale_id));
        });

        transaction();

        return {
            success: true
        };
    } catch (error) {
        console.error("Delete sale return error:", error);
        return {
            success: false,
            error: error.message
        };
    }
});


// ======================================================
// PURCHASES
// ======================================================

ipcMain.handle("get-purchases", () => {
    try {
        return db.prepare(`
            SELECT
                purchases.*,
                parties.name AS party_name,
                COALESCE(SUM(purchase_returns.total), 0) AS returned_total,
                purchases.total - COALESCE(SUM(purchase_returns.total), 0) AS net_total,
                purchases.paid - COALESCE(SUM(COALESCE(purchase_returns.cash_refunded, CASE WHEN LOWER(purchase_returns.payment_method) = 'cash' THEN purchase_returns.total ELSE 0 END)), 0)
                    - COALESCE(SUM(COALESCE(purchase_returns.bank_refunded, CASE WHEN LOWER(purchase_returns.payment_method) IN ('bank', 'online') THEN purchase_returns.total ELSE 0 END)), 0) AS net_paid,
                purchases.due - (COALESCE(SUM(purchase_returns.total), 0) - COALESCE(SUM(COALESCE(purchase_returns.cash_refunded, CASE WHEN LOWER(purchase_returns.payment_method) = 'cash' THEN purchase_returns.total ELSE 0 END)), 0) - COALESCE(SUM(COALESCE(purchase_returns.bank_refunded, CASE WHEN LOWER(purchase_returns.payment_method) IN ('bank', 'online') THEN purchase_returns.total ELSE 0 END)), 0)) AS net_due
            FROM purchases
            LEFT JOIN parties
                ON purchases.party_id = parties.id
            LEFT JOIN purchase_returns
                ON purchase_returns.purchase_id = purchases.id
            GROUP BY purchases.id
            ORDER BY purchases.id DESC
        `).all();
    } catch (error) {
        console.error("Get purchases error:", error);
        return [];
    }
});


ipcMain.handle("get-purchase", (event, purchaseId) => {
    try {
        const id = Number(purchaseId);

        if (!id) {
            return { success: false, error: "Invalid purchase ID." };
        }

        const purchase = db.prepare(`
            SELECT
                purchases.*,
                parties.name AS party_name,
                parties.party_code AS party_code,
                parties.phone AS party_phone,
                parties.address AS party_address,
                COALESCE((SELECT SUM(total) FROM purchase_returns WHERE purchase_id = purchases.id), 0) AS returned_total,
                purchases.total - COALESCE((SELECT SUM(total) FROM purchase_returns WHERE purchase_id = purchases.id), 0) AS net_total,
                purchases.paid - COALESCE((SELECT SUM(COALESCE(cash_refunded, CASE WHEN LOWER(payment_method) = 'cash' THEN total ELSE 0 END) + COALESCE(bank_refunded, CASE WHEN LOWER(payment_method) IN ('bank', 'online') THEN total ELSE 0 END)) FROM purchase_returns WHERE purchase_id = purchases.id), 0) AS net_paid,
                purchases.due - (COALESCE((SELECT SUM(total) FROM purchase_returns WHERE purchase_id = purchases.id), 0) - COALESCE((SELECT SUM(COALESCE(cash_refunded, CASE WHEN LOWER(payment_method) = 'cash' THEN total ELSE 0 END) + COALESCE(bank_refunded, CASE WHEN LOWER(payment_method) IN ('bank', 'online') THEN total ELSE 0 END)) FROM purchase_returns WHERE purchase_id = purchases.id), 0)) AS net_due
            FROM purchases
            LEFT JOIN parties
                ON purchases.party_id = parties.id
            WHERE purchases.id = ?
        `).get(id);

        if (!purchase) {
            return { success: false, error: "Purchase not found." };
        }

        const items = db.prepare(`
            SELECT
                purchase_items.*,
                items.name AS item_name,
                items.item_code,
                items.unit
            FROM purchase_items
            LEFT JOIN items
                ON purchase_items.item_id = items.id
            WHERE purchase_items.purchase_id = ?
        `).all(id);

        return { success: true, purchase, items };
    } catch (error) {
        console.error("Get purchase error:", error);
        return { success: false, error: error.message };
    }
});


ipcMain.handle("save-purchase", (event, data) => {
    try {
        if (!data) {
            return {
                success: false,
                error: "Purchase data is missing."
            };
        }

        let billNo = String(
            data.bill_no ??
            data.billNo ??
            data.billNumber ??
            data.invoice_no ??
            data.invoiceNo ??
            ""
        ).trim();

        const partyId = Number(
            data.party_id ??
            data.partyId ??
            data.supplier_id ??
            data.supplierId ??
            0
        ) || 0;
        const effectivePartyId = partyId || null;

        // Auto-generate a unique bill number if not provided
        if (!billNo) {
            billNo = generatePurchaseBillNo();
        }

        const items = Array.isArray(data.items) ? data.items : [];

        if (items.length === 0) {
            return {
                success: false,
                error: "At least one item is required."
            };
        }

        const subtotal = Number(data.subtotal) || 0;
        const discount = Number(data.discount) || 0;
        const discountType = data.discount_type || data.discountType || "flat";
        const tax = Number(data.tax) || 0;
        const total = Number(data.total) || 0;
        const paid = Number(data.paid) || 0;
        const due = Number(data.due) || 0;
        const paymentMethod = data.payment_method || data.paymentMethod || "Cash";
        const note = data.note || "";

        if (total < 0 || paid < 0) {
            return {
                success: false,
                error: "Invalid amount."
            };
        }

        const existingBill = db.prepare(`
            SELECT id
            FROM purchases
            WHERE bill_no = ?
        `).get(billNo);

        if (existingBill) {
            return {
                success: false,
                error: "Bill number already exists."
            };
        }

        if (effectivePartyId) {
            const supplier = db.prepare(`
                SELECT id, name, type, balance
                FROM parties
                WHERE id = ?
            `).get(effectivePartyId);

            if (!supplier) {
                return {
                    success: false,
                    error: "Selected supplier was not found."
                };
            }

            if (
                String(supplier.type || "")
                    .trim()
                    .toLowerCase() !== "supplier"
            ) {
                return {
                    success: false,
                    error: "Selected party is not a supplier."
                };
            }
        }

        // Validate items
        for (const item of items) {
            const itemId = Number(item.item_id ?? item.itemId ?? 0);
            const quantity = Number(item.quantity) || 0;

            if (!itemId) {
                return { success: false, error: "Invalid item selected." };
            }

            if (quantity <= 0) {
                return { success: false, error: "Quantity must be greater than 0." };
            }

            const dbItem = db.prepare(`
                SELECT id
                FROM items
                WHERE id = ?
            `).get(itemId);

            if (!dbItem) {
                return { success: false, error: "Selected item was not found." };
            }
        }

        const transaction = db.transaction(() => {
            const purchase = db.prepare(`
                INSERT INTO purchases
                (
                    bill_no,
                    party_id,
                    subtotal,
                    discount,
                    discount_type,
                    tax,
                    total,
                    paid,
                    due,
                    payment_method,
                    status,
                    note,
                    created_by
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?)
            `).run(
                billNo,
                effectivePartyId,
                subtotal,
                discount,
                discountType,
                tax,
                total,
                paid,
                due,
                paymentMethod,
                note,
                currentSession?.id || null
            );

            const purchaseId = Number(purchase.lastInsertRowid);

            for (const item of items) {
                const itemId = Number(item.item_id ?? item.itemId ?? 0);
                const quantity = Number(item.quantity) || 0;
                const price = Number(item.price) || 0;
                const itemTotal = Number(item.total) || (quantity * price);
                const expiryDate = String(item.expiry_date || "").trim() || null;

                db.prepare(`
                    INSERT INTO purchase_items
                    (
                        purchase_id,
                        item_id,
                        quantity,
                        price,
                        total,
                        expiry_date
                    )
                    VALUES (?, ?, ?, ?, ?, ?)
                `).run(
                    purchaseId,
                    itemId,
                    quantity,
                    price,
                    itemTotal,
                    expiryDate
                );

                // Weighted Average cost update:
                // naya avg = (purana qty x purana avg + naya qty x rate) / total
                const invItem = db.prepare(`
                    SELECT stock, COALESCE(avg_cost, purchase_price, 0) AS avg_cost
                    FROM items
                    WHERE id = ?
                `).get(itemId);

                const oldQty = Number(invItem.stock) || 0;
                const oldCost = Number(invItem.avg_cost) || 0;
                const newQty = oldQty + quantity;

                let newAvgCost = price; // pehli baar / stock 0 ho to yehi cost
                if (newQty > 0 && oldQty > 0 && oldCost > 0) {
                    newAvgCost =
                        ((oldQty * oldCost) + (quantity * price)) / newQty;
                }

                db.prepare(`
                    UPDATE items
                    SET
                        stock = stock + ?,
                        avg_cost = ?
                    WHERE id = ?
                `).run(quantity, newAvgCost, itemId);

                addInventoryBatchWithBatchNumber(itemId, purchaseId, quantity, expiryDate, null, price);

                const updatedItem = db.prepare(`
                    SELECT stock
                    FROM items
                    WHERE id = ?
                `).get(itemId);

                logStockHistory(
                    itemId,
                    "Purchase",
                    quantity,
                    Number(updatedItem.stock),
                    "purchase",
                    purchaseId,
                    `Bill: ${billNo}`
                );
            }

            if (due > 0 && effectivePartyId) {
                db.prepare(`
                    UPDATE parties
                    SET balance = balance + ?
                    WHERE id = ?
                `).run(due, partyId);
            }

            if (paid > 0 && paymentMethod === "Cash") {
                db.prepare(`
                    UPDATE cash
                    SET balance = MAX(0, balance - ?)
                    WHERE id = 1
                `).run(paid);
            }

            if (paid > 0 && paymentMethod === "Bank") {
                const bank = db.prepare(`
                    SELECT id
                    FROM bank_accounts
                    ORDER BY id ASC
                    LIMIT 1
                `).get();

                if (bank) {
                    db.prepare(`
                        UPDATE bank_accounts
                        SET current_balance = current_balance - ?
                        WHERE id = ?
                    `).run(paid, bank.id);
                }
            }

            return purchaseId;
        });

        const purchaseId = transaction();

        logAudit(
            currentSession?.id, currentSession?.username,
            "purchase_created", "purchase", Number(purchaseId),
            null, { bill_no: data.bill_no, total: data.total, payment_method: data.payment_method }
        );

        return {
            success: true,
            id: purchaseId
        };
    } catch (error) {
        console.error("Save purchase error:", error);

        return {
            success: false,
            error: error.message
        };
    }
});


ipcMain.handle("update-purchase", (event, data) => {
    try {
        const purchaseId = Number(data.id ?? data.purchase_id ?? 0);

        if (!purchaseId) {
            return { success: false, error: "Invalid purchase ID." };
        }

        const originalPurchase = db.prepare(`
            SELECT id
            FROM purchases
            WHERE id = ?
        `).get(purchaseId);

        if (!originalPurchase) {
            return { success: false, error: "Original purchase was not found." };
        }

        const existingPurchase = db.prepare(`
            SELECT *
            FROM purchases
            WHERE id = ?
        `).get(purchaseId);

        if (!existingPurchase) {
            return { success: false, error: "Purchase not found." };
        }

        const partyId = Number(data.party_id ?? data.partyId ?? existingPurchase.party_id ?? 0);
        const items = Array.isArray(data.items) ? data.items : [];

        if (items.length === 0) {
            return { success: false, error: "At least one item is required." };
        }

        const purchasedQuantities = db.prepare(`
            SELECT item_id, SUM(quantity) AS quantity
            FROM purchase_items
            WHERE purchase_id = ?
            GROUP BY item_id
        `).all(purchaseId);
        const alreadyPurchaseReturned = db.prepare(`
            SELECT pri.item_id, SUM(pri.quantity) AS quantity
            FROM purchase_return_items pri
            JOIN purchase_returns pr ON pr.id = pri.return_id
            WHERE pr.purchase_id = ?
            GROUP BY pri.item_id
        `).all(purchaseId);
        const purchasedByItem = new Map(purchasedQuantities.map(row => [Number(row.item_id), Number(row.quantity) || 0]));
        const purchaseReturnedByItem = new Map(alreadyPurchaseReturned.map(row => [Number(row.item_id), Number(row.quantity) || 0]));
        const requestedPurchaseReturns = new Map();

        for (const item of items) {
            const itemId = Number(item.item_id ?? item.itemId ?? 0);
            const quantity = Number(item.quantity) || 0;
            if (!itemId || quantity <= 0) {
                return { success: false, error: "Return quantity must be greater than 0." };
            }
            requestedPurchaseReturns.set(itemId, (requestedPurchaseReturns.get(itemId) || 0) + quantity);
        }

        for (const [itemId, quantity] of requestedPurchaseReturns) {
            const purchasedQuantity = purchasedByItem.get(itemId);
            if (purchasedQuantity === undefined) {
                return { success: false, error: "Returned item was not part of the original purchase." };
            }
            const remaining = purchasedQuantity - (purchaseReturnedByItem.get(itemId) || 0);
            if (quantity > remaining) {
                return { success: false, error: `Return quantity exceeds the remaining purchased quantity. Available: ${remaining}` };
            }
        }

        const subtotal = Number(data.subtotal) || 0;
        const discount = Number(data.discount) || 0;
        const discountType = data.discount_type || data.discountType || "flat";
        const tax = Number(data.tax) || 0;
        const total = Number(data.total) || 0;
        const paid = Number(data.paid) || 0;
        const due = Number(data.due) || 0;
        const paymentMethod = data.payment_method || data.paymentMethod || "Cash";
        const note = data.note || "";

        const transaction = db.transaction(() => {
            // Restore old stock
            const oldItems = db.prepare(`
                SELECT item_id, quantity
                FROM purchase_items
                WHERE purchase_id = ?
            `).all(purchaseId);

            for (const oldItem of oldItems) {
                if (!oldItem.item_id) continue;

                db.prepare(`
                    UPDATE items
                    SET stock = stock - ?
                    WHERE id = ?
                `).run(Number(oldItem.quantity) || 0, Number(oldItem.item_id));
            }

            // Restore old party balance
            if (Number(existingPurchase.due || 0) > 0 && existingPurchase.party_id) {
                db.prepare(`
                    UPDATE parties
                    SET balance = MAX(0, balance - ?)
                    WHERE id = ?
                `).run(Number(existingPurchase.due) || 0, Number(existingPurchase.party_id));
            }

            // Restore old cash/bank
            if (Number(existingPurchase.paid || 0) > 0) {
                const oldMethod = existingPurchase.payment_method || "Cash";

                if (oldMethod === "Cash") {
                    db.prepare(`
                        UPDATE cash
                        SET balance = balance + ?
                        WHERE id = 1
                    `).run(Number(existingPurchase.paid) || 0);
                } else if (oldMethod === "Bank") {
                    const bank = db.prepare(`
                        SELECT id
                        FROM bank_accounts
                        ORDER BY id ASC
                        LIMIT 1
                    `).get();

                    if (bank) {
                        db.prepare(`
                            UPDATE bank_accounts
                            SET current_balance = current_balance + ?
                            WHERE id = ?
                        `).run(Number(existingPurchase.paid) || 0, bank.id);
                    }
                }
            }

            // Delete old items
            db.prepare(`
                DELETE FROM purchase_items
                WHERE purchase_id = ?
            `).run(purchaseId);

            db.prepare(`
                DELETE FROM inventory_batches
                WHERE purchase_id = ?
            `).run(purchaseId);

            // Update purchase
            db.prepare(`
                UPDATE purchases
                SET
                    party_id = ?,
                    subtotal = ?,
                    discount = ?,
                    discount_type = ?,
                    tax = ?,
                    total = ?,
                    paid = ?,
                    due = ?,
                    payment_method = ?,
                    note = ?
                WHERE id = ?
            `).run(
                partyId,
                subtotal,
                discount,
                discountType,
                tax,
                total,
                paid,
                due,
                paymentMethod,
                note,
                purchaseId
            );

            // Insert new items
            for (const item of items) {
                const itemId = Number(item.item_id ?? item.itemId ?? 0);
                const quantity = Number(item.quantity) || 0;
                const price = Number(item.price) || 0;
                const itemTotal = Number(item.total) || (quantity * price);
                const expiryDate = String(item.expiry_date || "").trim() || null;

                db.prepare(`
                    INSERT INTO purchase_items
                    (
                        purchase_id,
                        item_id,
                        quantity,
                        price,
                        total,
                        expiry_date
                    )
                    VALUES (?, ?, ?, ?, ?, ?)
                `).run(purchaseId, itemId, quantity, price, itemTotal, expiryDate);

                db.prepare(`
                    UPDATE items
                    SET stock = stock + ?
                    WHERE id = ?
                `).run(quantity, itemId);

                addInventoryBatchWithBatchNumber(itemId, purchaseId, quantity, expiryDate, null, price);

                const updatedItem = db.prepare(`
                    SELECT stock
                    FROM items
                    WHERE id = ?
                `).get(itemId);

                logStockHistory(
                    itemId,
                    "Purchase Edit",
                    quantity,
                    Number(updatedItem.stock),
                    "purchase",
                    purchaseId,
                    `Bill: ${existingPurchase.bill_no} (edited)`
                );
            }

            // Update new party balance
            if (due > 0) {
                db.prepare(`
                    UPDATE parties
                    SET balance = balance + ?
                    WHERE id = ?
                `).run(due, partyId);
            }

            // Update new cash/bank
            if (paid > 0 && paymentMethod === "Cash") {
                db.prepare(`
                    UPDATE cash
                    SET balance = MAX(0, balance - ?)
                    WHERE id = 1
                `).run(paid);
            }

            if (paid > 0 && paymentMethod === "Bank") {
                const bank = db.prepare(`
                    SELECT id
                    FROM bank_accounts
                    ORDER BY id ASC
                    LIMIT 1
                `).get();

                if (bank) {
                    db.prepare(`
                        UPDATE bank_accounts
                        SET current_balance = current_balance - ?
                        WHERE id = ?
                    `).run(paid, bank.id);
                }
            }
        });

        transaction();

        for (const item of items) {
            const itemId = Number(item.item_id ?? item.itemId ?? 0);
            if (itemId) {
                recalculateAvgCost(itemId);
            }
        }

        return { success: true, id: purchaseId };
    } catch (error) {
        console.error("Update purchase error:", error);
        return { success: false, error: error.message };
    }
});


ipcMain.handle("delete-purchase", (event, purchaseId) => {
    try {
        if (!canDo("delete_purchase")) {
            return permissionDenied();
        }

        const id = Number(purchaseId);

        if (!id) {
            return {
                success: false,
                error: "Invalid purchase ID."
            };
        }

        const purchase = db.prepare(`
            SELECT
                id,
                party_id,
                total,
                paid,
                due,
                payment_method
            FROM purchases
            WHERE id = ?
        `).get(id);

        if (!purchase) {
            return {
                success: false,
                error: "Purchase not found."
            };
        }

        const purchaseItems = db.prepare(`
            SELECT item_id, quantity
            FROM purchase_items
            WHERE purchase_id = ?
        `).all(id);

        const transaction = db.transaction(() => {
            for (const purchaseItem of purchaseItems) {
                if (!purchaseItem.item_id) continue;

                db.prepare(`
                    UPDATE items
                    SET stock = stock - ?
                    WHERE id = ?
                `).run(
                    Number(purchaseItem.quantity) || 0,
                    Number(purchaseItem.item_id)
                );
            }

            if (Number(purchase.due || 0) > 0) {
                db.prepare(`
                    UPDATE parties
                    SET balance = MAX(0, balance - ?)
                    WHERE id = ?
                `).run(
                    Number(purchase.due) || 0,
                    Number(purchase.party_id)
                );
            }

            if (
                Number(purchase.paid || 0) > 0 &&
                (
                    !purchase.payment_method ||
                    purchase.payment_method === "Cash"
                )
            ) {
                db.prepare(`
                    UPDATE cash
                    SET balance = balance + ?
                    WHERE id = 1
                `).run(Number(purchase.paid) || 0);
            }

            if (
                Number(purchase.paid || 0) > 0 &&
                purchase.payment_method === "Bank"
            ) {
                const bank = db.prepare(`
                    SELECT id
                    FROM bank_accounts
                    ORDER BY id ASC
                    LIMIT 1
                `).get();

                if (bank) {
                    db.prepare(`
                        UPDATE bank_accounts
                        SET current_balance = current_balance + ?
                        WHERE id = ?
                    `).run(
                        Number(purchase.paid) || 0,
                        bank.id
                    );
                }
            }

            db.prepare(`
                DELETE FROM purchase_items
                WHERE purchase_id = ?
            `).run(id);

            db.prepare(`
                DELETE FROM inventory_batches
                WHERE purchase_id = ?
            `).run(id);

            db.prepare(`
                DELETE FROM purchases
                WHERE id = ?
            `).run(id);
        });

        transaction();

        for (const purchaseItem of purchaseItems) {
            const itemId = Number(purchaseItem.item_id) || 0;
            if (itemId) {
                recalculateAvgCost(itemId);
            }
        }

        logAudit(
            currentSession?.id, currentSession?.username,
            "purchase_deleted", "purchase", id, null, null
        );

        return {
            success: true
        };
    } catch (error) {
        console.error("Delete purchase error:", error);

        return {
            success: false,
            error: error.message
        };
    }
});

ipcMain.handle("delete-all-purchases", async () => {
    try {
        const deleted = await Promise.resolve().then(() => db.transaction(() => {
            db.prepare("DELETE FROM purchases_backup").run();
            const purchases = db.prepare("SELECT * FROM purchases").all();
            const purchaseItems = db.prepare("SELECT * FROM purchase_items").all();
            const batches = db.prepare("SELECT * FROM inventory_batches WHERE purchase_id IS NOT NULL").all();
            for (const [table, rows] of [["purchases", purchases], ["purchase_items", purchaseItems], ["inventory_batches", batches]]) {
                for (const row of rows) {
                    db.prepare("INSERT INTO purchases_backup (source_table, source_id, payload) VALUES (?, ?, ?)")
                        .run(table, row.id, JSON.stringify(row));
                }
            }
            for (const purchase of purchases) {
                if (purchase.due > 0 && purchase.party_id) db.prepare("UPDATE parties SET balance = MAX(0, balance - ?) WHERE id = ?").run(Number(purchase.due), purchase.party_id);
                if (purchase.paid > 0 && (!purchase.payment_method || purchase.payment_method === "Cash")) db.prepare("UPDATE cash SET balance = balance + ? WHERE id = 1").run(Number(purchase.paid));
                if (purchase.paid > 0 && purchase.payment_method === "Bank") {
                    const bank = db.prepare("SELECT id FROM bank_accounts ORDER BY id ASC LIMIT 1").get();
                    if (bank) db.prepare("UPDATE bank_accounts SET current_balance = current_balance + ? WHERE id = ?").run(Number(purchase.paid), bank.id);
                }
            }
            for (const row of purchaseItems) if (row.item_id) db.prepare("UPDATE items SET stock = stock - ? WHERE id = ?").run(Number(row.quantity) || 0, row.item_id);
            db.prepare("DELETE FROM purchase_items").run();
            db.prepare("DELETE FROM inventory_batches").run();
            db.prepare("DELETE FROM purchases").run();
            return purchases.length;
        })());
        return { success: true, deleted: Number(deleted || 0) };
    } catch (error) {
        console.error("Delete all purchases error:", error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle("restore-purchases", async () => {
    try {
        const restored = await Promise.resolve().then(() => db.transaction(() => {
            const backups = db.prepare("SELECT source_table, payload FROM purchases_backup ORDER BY id ASC").all();
            const restoredPurchases = [];
            const insertRows = (table, rows) => {
                let count = 0;
                for (const backup of rows.filter(row => row.source_table === table)) {
                    const row = JSON.parse(backup.payload);
                    const columns = Object.keys(row);
                    const result = db.prepare(`INSERT OR IGNORE INTO ${table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`).run(columns.map(column => row[column]));
                    if (result.changes) { count += Number(result.changes); if (table === "purchases") restoredPurchases.push(row); }
                }
                return count;
            };
            let count = insertRows("purchases", backups);
            for (const purchase of restoredPurchases) {
                const rows = db.prepare("SELECT payload FROM purchases_backup WHERE source_table = 'purchase_items' AND json_extract(payload, '$.purchase_id') = ?").all(purchase.id);
                for (const row of rows) {
                    const item = JSON.parse(row.payload);
                    if (item.item_id) db.prepare("UPDATE items SET stock = stock + ? WHERE id = ?").run(Number(item.quantity) || 0, item.item_id);
                }
                if (purchase.due > 0 && purchase.party_id) db.prepare("UPDATE parties SET balance = balance + ? WHERE id = ?").run(Number(purchase.due), purchase.party_id);
                if (purchase.paid > 0 && (!purchase.payment_method || purchase.payment_method === "Cash")) db.prepare("UPDATE cash SET balance = balance - ? WHERE id = 1").run(Number(purchase.paid));
                if (purchase.paid > 0 && purchase.payment_method === "Bank") {
                    const bank = db.prepare("SELECT id FROM bank_accounts ORDER BY id ASC LIMIT 1").get();
                    if (bank) db.prepare("UPDATE bank_accounts SET current_balance = current_balance - ? WHERE id = ?").run(Number(purchase.paid), bank.id);
                }
            }
            count += insertRows("purchase_items", backups);
            count += insertRows("inventory_batches", backups);
            return count;
        })());
        return { success: true, restored };
    } catch (error) {
        console.error("Restore purchases error:", error);
        return { success: false, error: error.message };
    }
});


// ======================================================
// PURCHASE RETURNS
// ======================================================

ipcMain.handle("save-purchase-return", (event, data) => {
    try {
        const purchaseId = Number(data.purchase_id ?? data.purchaseId ?? 0);
        const partyId = Number(data.party_id ?? data.partyId ?? 0);
        const returnNo = String(data.return_no ?? data.returnNo ?? `PRET-${Date.now()}`).trim();
        const items = Array.isArray(data.items) ? data.items : [];
        const paymentMethod = data.payment_method || data.paymentMethod || "Cash";

        if (!purchaseId) {
            return { success: false, error: "Invalid purchase ID." };
        }

        if (!partyId) {
            return { success: false, error: "Supplier is required." };
        }

        if (items.length === 0) {
            return { success: false, error: "At least one item is required." };
        }

        const subtotal = Number(data.subtotal) || 0;
        const total = Number(data.total) || 0;
        const note = data.note || "";
        const originalPurchase = db.prepare(`
            SELECT due
            FROM purchases
            WHERE id = ?
        `).get(purchaseId);
        const purchaseDue = Math.max(0, Number(originalPurchase?.due) || 0);
        const creditAdjust = Math.min(total, purchaseDue);
        const cashRefund = paymentMethod === "Cash" ? total - creditAdjust : 0;
        const bankRefund = paymentMethod === "Bank" || paymentMethod === "Online"
            ? total - creditAdjust
            : 0;

        const transaction = db.transaction(() => {
            const result = db.prepare(`
                INSERT INTO purchase_returns
                (
                    purchase_id,
                    party_id,
                    return_no,
                    subtotal,
                    total,
                    payment_method,
                    cash_refunded,
                    bank_refunded,
                    note,
                    created_by
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(purchaseId, partyId, returnNo, subtotal, total, paymentMethod, cashRefund, bankRefund, note,
                currentSession?.id || null);

            const returnId = Number(result.lastInsertRowid);

            for (const item of items) {
                const itemId = Number(item.item_id ?? item.itemId ?? 0);
                const quantity = Number(item.quantity) || 0;
                const price = Number(item.price) || 0;
                const itemTotal = Number(item.total) || (quantity * price);

                db.prepare(`
                    INSERT INTO purchase_return_items
                    (
                        return_id,
                        item_id,
                        quantity,
                        price,
                        total
                    )
                    VALUES (?, ?, ?, ?, ?)
                `).run(returnId, itemId, quantity, price, itemTotal);

                // Reduce stock
                db.prepare(`
                    UPDATE items
                    SET stock = stock - ?
                    WHERE id = ?
                `).run(quantity, itemId);

                const updatedItem = db.prepare(`
                    SELECT stock
                    FROM items
                    WHERE id = ?
                `).get(itemId);

                logStockHistory(
                    itemId,
                    "Purchase Return",
                    quantity,
                    Number(updatedItem.stock),
                    "purchase_return",
                    returnId,
                    `Return: ${returnNo}`
                );
            }

            // Refund split — original purchase ke paid/due ke hisab se:
            // - pehle unpaid (due) hissa supplier ki balance se adjust hota hai
            // - baqi jitna cash/bank mein paid tha wo cash/bank mein wapas aata hai
            if (total > 0) {
                const cashBack = Number(cashRefund);
                const bankBack = Number(bankRefund);

                if (creditAdjust > 0) {
                    db.prepare(`
                        UPDATE parties
                        SET balance = MAX(0, balance - ?)
                        WHERE id = ?
                    `).run(creditAdjust, partyId);
                }

                // Adjust cash/bank (get money back from supplier)
                if (cashBack > 0 && paymentMethod === "Cash") {
                    db.prepare(`
                        UPDATE cash
                        SET balance = balance + ?
                        WHERE id = 1
                    `).run(cashBack);
                } else if (bankBack > 0 && (paymentMethod === "Bank" || paymentMethod === "Online")) {
                    const bank = db.prepare(`
                        SELECT id
                        FROM bank_accounts
                        ORDER BY id ASC
                        LIMIT 1
                    `).get();

                    if (bank) {
                        db.prepare(`
                            UPDATE bank_accounts
                            SET current_balance = current_balance + ?
                            WHERE id = ?
                        `).run(bankBack, bank.id);
                    }
                }
            }

            return returnId;
        });

        const returnId = transaction();

        return { success: true, id: returnId };
    } catch (error) {
        console.error("Save purchase return error:", error);
        return { success: false, error: error.message };
    }
});


ipcMain.handle("get-purchase-returns", () => {
    try {
        return db.prepare(`
            SELECT
                purchase_returns.*,
                parties.name AS party_name,
                purchases.bill_no
            FROM purchase_returns
            LEFT JOIN parties
                ON purchase_returns.party_id = parties.id
            LEFT JOIN purchases
                ON purchase_returns.purchase_id = purchases.id
            ORDER BY purchase_returns.id DESC
        `).all();
    } catch (error) {
        console.error("Get purchase returns error:", error);
        return [];
    }
});


// ======================================================
// DELETE PURCHASE RETURN
// ======================================================

ipcMain.handle("delete-purchase-return", (event, returnId) => {
    try {
        const id = Number(returnId);

        if (!id) {
            return {
                success: false,
                error: "Invalid return ID."
            };
        }

        const purchaseReturn = db.prepare(`
            SELECT
                id,
                purchase_id,
                party_id,
                total,
                payment_method
            FROM purchase_returns
            WHERE id = ?
        `).get(id);

        if (!purchaseReturn) {
            return {
                success: false,
                error: "Purchase return not found."
            };
        }

        const returnItems = db.prepare(`
            SELECT item_id, quantity
            FROM purchase_return_items
            WHERE return_id = ?
        `).all(id);

        const transaction = db.transaction(() => {
            for (const item of returnItems) {
                if (!item.item_id) continue;
                db.prepare(`
                    UPDATE items
                    SET stock = stock + ?
                    WHERE id = ?
                `).run(
                    Number(item.quantity) || 0,
                    Number(item.item_id)
                );
            }

            // Reverse the refund split (same split logic as create)
            if (Number(purchaseReturn.total || 0) > 0) {
                const returnTotal = Number(purchaseReturn.total) || 0;
                const paymentMethod = purchaseReturn.payment_method || "Cash";

                const purchase = db.prepare(`
                    SELECT paid, due
                    FROM purchases
                    WHERE id = ?
                `).get(purchaseReturn.purchase_id);

                const purchaseDue = Math.max(0, Number(purchase?.due) || 0);
                const creditAdjust = Math.min(returnTotal, purchaseDue);
                const cashBack = returnTotal - creditAdjust;

                if (creditAdjust > 0 && purchaseReturn.party_id) {
                    db.prepare(`
                        UPDATE parties
                        SET balance = balance + ?
                        WHERE id = ?
                    `).run(
                        creditAdjust,
                        Number(purchaseReturn.party_id)
                    );
                }

                if (cashBack > 0 && paymentMethod === "Cash") {
                    db.prepare(`
                        UPDATE cash
                        SET balance = MAX(0, balance - ?)
                        WHERE id = 1
                    `).run(cashBack);
                } else if (cashBack > 0 && paymentMethod === "Bank") {
                    const bank = db.prepare(`
                        SELECT id
                        FROM bank_accounts
                        ORDER BY id ASC
                        LIMIT 1
                    `).get();

                    if (bank) {
                        db.prepare(`
                            UPDATE bank_accounts
                            SET current_balance = current_balance - ?
                            WHERE id = ?
                        `).run(cashBack, bank.id);
                    }
                }
            }

            db.prepare(`
                DELETE FROM purchase_return_items
                WHERE return_id = ?
            `).run(id);

            db.prepare(`
                DELETE FROM purchase_returns
                WHERE id = ?
            `).run(id);
        });

        transaction();

        for (const item of returnItems) {
            const itemId = Number(item.item_id) || 0;
            if (itemId) {
                recalculateAvgCost(itemId);
            }
        }

        return {
            success: true
        };
    } catch (error) {
        console.error("Delete purchase return error:", error);
        return {
            success: false,
            error: error.message
        };
    }
});


// ======================================================
// CASH/BANK TRANSFER
// ======================================================

ipcMain.handle("save-transfer", (event, data) => {
    try {
        const fromType = String(data.from_type || data.fromType || "").trim();
        const toType = String(data.to_type || data.toType || "").trim();
        const fromBankId = Number(data.from_bank_id ?? data.fromBankId ?? 0);
        const toBankId = Number(data.to_bank_id ?? data.toBankId ?? 0);
        const amount = Number(data.amount) || 0;
        const note = data.note || "";

        if (!fromType || !toType) {
            return { success: false, error: "From and To account types are required." };
        }

        if (fromType === toType && fromType !== "Bank") {
            return { success: false, error: "Cannot transfer between same account type." };
        }

        if (fromType === "Bank" && !fromBankId) {
            return { success: false, error: "Source bank account is required." };
        }

        if (toType === "Bank" && !toBankId) {
            return { success: false, error: "Destination bank account is required." };
        }

        if (amount <= 0) {
            return { success: false, error: "Amount must be greater than 0." };
        }

        const transaction = db.transaction(() => {
            if (fromType === "Cash" && toType === "Bank") {
                const cash = db.prepare("SELECT balance FROM cash WHERE id = 1").get();
                if (Number(cash?.balance || 0) < amount) {
                    throw new Error("Insufficient cash balance.");
                }

                db.prepare("UPDATE cash SET balance = balance - ? WHERE id = 1").run(amount);

                const bank = db.prepare("SELECT id FROM bank_accounts WHERE id = ?").get(toBankId);
                if (!bank) throw new Error("Destination bank account was not found.");
                db.prepare("UPDATE bank_accounts SET current_balance = current_balance + ? WHERE id = ?").run(amount, toBankId);

                db.prepare(`
                    INSERT INTO payments (party_id, type, amount, payment_method, note, created_by)
                    VALUES (?, ?, ?, ?, ?, ?)
                `).run(0, "transfer_out", amount, "Cash", `Transfer to Bank: ${note}`, currentSession?.id || null);

            } else if (fromType === "Bank" && toType === "Cash") {
                const bank = db.prepare("SELECT current_balance FROM bank_accounts WHERE id = ?").get(fromBankId);
                if (Number(bank?.current_balance || 0) < amount) {
                    throw new Error("Insufficient bank balance.");
                }

                db.prepare("UPDATE bank_accounts SET current_balance = current_balance - ? WHERE id = ?").run(amount, fromBankId);
                db.prepare("UPDATE cash SET balance = balance + ? WHERE id = 1").run(amount);

                db.prepare(`
                    INSERT INTO payments (party_id, type, amount, payment_method, note, created_by)
                    VALUES (?, ?, ?, ?, ?, ?)
                `).run(0, "transfer_in", amount, "Bank", `Transfer to Cash: ${note}`, currentSession?.id || null);

            } else if (fromType === "Bank" && toType === "Bank") {
                const fromBank = db.prepare("SELECT current_balance FROM bank_accounts WHERE id = ?").get(fromBankId);
                if (Number(fromBank?.current_balance || 0) < amount) {
                    throw new Error("Insufficient source bank balance.");
                }

                db.prepare("UPDATE bank_accounts SET current_balance = current_balance - ? WHERE id = ?").run(amount, fromBankId);
                db.prepare("UPDATE bank_accounts SET current_balance = current_balance + ? WHERE id = ?").run(amount, toBankId);

                db.prepare(`
                    INSERT INTO payments (party_id, type, amount, payment_method, note, created_by)
                    VALUES (?, ?, ?, ?, ?, ?)
                `).run(0, "transfer_out", amount, "Bank", `Bank to Bank Transfer: ${note}`, currentSession?.id || null);
            }

            const transferType = fromType === "Cash" && toType === "Bank"
                ? "cash_to_bank"
                : fromType === "Bank" && toType === "Cash"
                    ? "bank_to_cash"
                    : "bank_to_bank";
            const bankAccountId = transferType === "cash_to_bank" ? toBankId
                : transferType === "bank_to_cash" ? fromBankId
                    : null;
            db.prepare(`
                INSERT INTO transfers (date, type, amount, bank_account_id, note, created_by)
                VALUES (datetime('now', 'localtime'), ?, ?, ?, ?, ?)
            `).run(transferType, amount, bankAccountId, note, currentSession?.id || null);

            return true;
        });

        const result = transaction();
        db.saveNow();

        logAudit(
            currentSession?.id, currentSession?.username,
            "transfer_created", "transfer", null,
            null, { from: fromType, to: toType, amount, note }
        );

        return { success: true, id: result };
    } catch (error) {
        console.error("Save transfer error:", error);
        return { success: false, error: error.message };
    }
});

// Recent transfers list (Cash/Bank page + dashboard detail)
ipcMain.handle("get-transfers", async (event, filters) => {
    try {
        const f = filters || {};
        const dateFilter = String(f.date || "").trim();
                const limit = Math.min(Number(f.limit) || 50, 200);
                const rows = await Promise.resolve().then(() => db.prepare(`
                        SELECT id,
                                     CASE type WHEN 'bank_to_cash' THEN 'transfer_in' ELSE 'transfer_out' END AS type,
                                     amount,
                                 CASE type WHEN 'cash_to_bank' THEN 'Cash' ELSE 'Bank' END AS payment_method,
                                 CASE type WHEN 'bank_to_bank' THEN 'Bank to Bank Transfer: ' ELSE '' END || COALESCE(note, '') AS note,
                                     DATE(date, 'localtime') AS transfer_date,
                                     date AS created_at
                        FROM transfers
                        WHERE (? = '' OR DATE(date, 'localtime') = DATE(?))
                        ORDER BY date DESC, id DESC
                        LIMIT ?
                `).all(dateFilter, dateFilter, limit));

                // Older business files stored transfers in payments. Keep them visible
                // until they are replaced by the dedicated ledger records.
                rows.push(...db.prepare(`
                                SELECT id, type, amount, payment_method, note,
                                             DATE(created_at, 'localtime') AS transfer_date,
                                             created_at
                                FROM payments
                                WHERE type IN ('transfer_in', 'transfer_out')
                                    AND (? = '' OR DATE(created_at, 'localtime') = DATE(?))
                                    AND NOT EXISTS (
                                            SELECT 1 FROM transfers t
                                            WHERE t.amount = payments.amount
                                                AND DATE(t.date, 'localtime') = DATE(payments.created_at, 'localtime')
                                                AND ((t.type = 'bank_to_cash' AND payments.type = 'transfer_in')
                                                    OR (t.type IN ('cash_to_bank', 'bank_to_bank') AND payments.type = 'transfer_out'))
                                    )
                                ORDER BY created_at DESC, id DESC
                                LIMIT ?
                        `).all(dateFilter, dateFilter, limit));
                rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at) || Number(b.id) - Number(a.id));
                rows.splice(limit);

        return { success: true, transfers: rows };
    } catch (error) {
        console.error("Get transfers error:", error);
        return { success: false, error: error.message, transfers: [] };
    }
});



// ======================================================
// PAYMENTS (Customer/Supplier)
// ======================================================

function recalculateAvgCost(itemId) {
    const purchases = db.prepare(`
        SELECT pi.quantity, pi.price
        FROM purchase_items pi
        LEFT JOIN purchases p ON pi.purchase_id = p.id
        WHERE pi.item_id = ?
          AND (p.status IS NULL OR p.status != 'returned')
    `).all(itemId);

    const returns = db.prepare(`
        SELECT pri.quantity, pri.price
        FROM purchase_return_items pri
        LEFT JOIN purchase_returns pr ON pri.return_id = pr.id
        WHERE pri.item_id = ?
    `).all(itemId);

    let totalQty = 0;
    let totalCost = 0;

    for (const p of purchases) {
        totalQty += Number(p.quantity) || 0;
        totalCost += (Number(p.quantity) || 0) * (Number(p.price) || 0);
    }

    for (const r of returns) {
        totalQty -= Number(r.quantity) || 0;
        totalCost -= (Number(r.quantity) || 0) * (Number(r.price) || 0);
    }

    const avgCost = totalQty > 0 ? totalCost / totalQty : 0;
    db.prepare("UPDATE items SET avg_cost = ? WHERE id = ?").run(avgCost, itemId);
    return avgCost;
}


// ======================================================
// PAYMENTS (Customer/Supplier)
// ======================================================

ipcMain.handle("get-payments", (event, partyId) => {
    try {
        if (partyId) {
            return db.prepare(`
                SELECT
                    payments.*,
                    parties.name AS party_name
                FROM payments
                LEFT JOIN parties
                    ON payments.party_id = parties.id
                WHERE payments.party_id = ?
                ORDER BY payments.id DESC
            `).all(Number(partyId));
        }

        return db.prepare(`
            SELECT
                payments.*,
                parties.name AS party_name
            FROM payments
            LEFT JOIN parties
                ON payments.party_id = parties.id
            ORDER BY payments.id DESC
        `).all();
    } catch (error) {
        console.error("Get payments error:", error);
        return [];
    }
});


ipcMain.handle("save-payment", (event, data) => {
    try {
        const partyId = Number(data.party_id ?? data.partyId ?? 0);
        const type = data.type || "receive";
        const amount = Number(data.amount) || 0;
        const paymentMethod = data.payment_method || data.paymentMethod || "Cash";
        const note = data.note || "";

        if (!partyId) {
            return { success: false, error: "Party is required." };
        }

        if (amount <= 0) {
            return { success: false, error: "Amount must be greater than 0." };
        }

        const party = db.prepare(`
            SELECT id, name, type, balance
            FROM parties
            WHERE id = ?
        `).get(partyId);

        if (!party) {
            return { success: false, error: "Party not found." };
        }

        const transaction = db.transaction(() => {
            const result = db.prepare(`
                INSERT INTO payments
                (
                    party_id,
                    type,
                    amount,
                    payment_method,
                    note,
                    created_by
                )
                VALUES (?, ?, ?, ?, ?, ?)
            `).run(partyId, type, amount, paymentMethod, note,
                currentSession?.id || null);

            const paymentId = Number(result.lastInsertRowid);

            // Update party balance
            // receive = customer pays us (reduce balance)
            // pay = we pay supplier (reduce balance)
            if (type === "receive") {
                db.prepare(`
                    UPDATE parties
                    SET balance = MAX(0, balance - ?)
                    WHERE id = ?
                `).run(amount, partyId);
            } else {
                db.prepare(`
                    UPDATE parties
                    SET balance = MAX(0, balance - ?)
                    WHERE id = ?
                `).run(amount, partyId);
            }

            // Update cash/bank
            if (type === "receive") {
                // Money comes in
                if (paymentMethod === "Cash") {
                    db.prepare(`
                        UPDATE cash
                        SET balance = balance + ?
                        WHERE id = 1
                    `).run(amount);
                } else if (paymentMethod === "Bank") {
                    const bank = db.prepare(`
                        SELECT id
                        FROM bank_accounts
                        ORDER BY id ASC
                        LIMIT 1
                    `).get();

                    if (bank) {
                        db.prepare(`
                            UPDATE bank_accounts
                            SET current_balance = current_balance + ?
                            WHERE id = ?
                        `).run(amount, bank.id);
                    }
                }
            } else {
                // Money goes out
                if (paymentMethod === "Cash") {
                    db.prepare(`
                        UPDATE cash
                        SET balance = MAX(0, balance - ?)
                        WHERE id = 1
                    `).run(amount);
                } else if (paymentMethod === "Bank") {
                    const bank = db.prepare(`
                        SELECT id
                        FROM bank_accounts
                        ORDER BY id ASC
                        LIMIT 1
                    `).get();

                    if (bank) {
                        db.prepare(`
                            UPDATE bank_accounts
                            SET current_balance = current_balance - ?
                            WHERE id = ?
                        `).run(amount, bank.id);
                    }
                }
            }

            return paymentId;
        });

        const paymentId = transaction();

        logAudit(
            currentSession?.id, currentSession?.username,
            "payment_created", "payment", Number(paymentId),
            null, { party_id: data.party_id, amount: data.amount, payment_method: data.payment_method }
        );

        return { success: true, id: paymentId };
    } catch (error) {
        console.error("Save payment error:", error);
        return { success: false, error: error.message };
    }
});


ipcMain.handle("delete-payment", (event, paymentId) => {
    try {
        const id = Number(paymentId);

        if (!id) {
            return { success: false, error: "Invalid payment ID." };
        }

        const payment = db.prepare(`
            SELECT *
            FROM payments
            WHERE id = ?
        `).get(id);

        if (!payment) {
            return { success: false, error: "Payment not found." };
        }

        const transaction = db.transaction(() => {
            // Reverse party balance
            db.prepare(`
                UPDATE parties
                SET balance = balance + ?
                WHERE id = ?
            `).run(Number(payment.amount) || 0, Number(payment.party_id));

            // Reverse cash/bank
            if (payment.type === "receive") {
                if (payment.payment_method === "Cash") {
                    db.prepare(`
                        UPDATE cash
                        SET balance = MAX(0, balance - ?)
                        WHERE id = 1
                    `).run(Number(payment.amount) || 0);
                } else if (payment.payment_method === "Bank") {
                    const bank = db.prepare(`
                        SELECT id
                        FROM bank_accounts
                        ORDER BY id ASC
                        LIMIT 1
                    `).get();

                    if (bank) {
                        db.prepare(`
                            UPDATE bank_accounts
                            SET current_balance = current_balance - ?
                            WHERE id = ?
                        `).run(Number(payment.amount) || 0, bank.id);
                    }
                }
            } else {
                if (payment.payment_method === "Cash") {
                    db.prepare(`
                        UPDATE cash
                        SET balance = balance + ?
                        WHERE id = 1
                    `).run(Number(payment.amount) || 0);
                } else if (payment.payment_method === "Bank") {
                    const bank = db.prepare(`
                        SELECT id
                        FROM bank_accounts
                        ORDER BY id ASC
                        LIMIT 1
                    `).get();

                    if (bank) {
                        db.prepare(`
                            UPDATE bank_accounts
                            SET current_balance = current_balance + ?
                            WHERE id = ?
                        `).run(Number(payment.amount) || 0, bank.id);
                    }
                }
            }

            db.prepare(`
                DELETE FROM payments
                WHERE id = ?
            `).run(id);
        });

        transaction();

        return { success: true };
    } catch (error) {
        console.error("Delete payment error:", error);
        return { success: false, error: error.message };
    }
});


// ======================================================
// LEDGER
// ======================================================

ipcMain.handle("get-ledger", (event, partyId) => {
    try {
        const id = Number(partyId);

        if (!id) {
            return { success: false, error: "Invalid party ID." };
        }

        const party = db.prepare(`
            SELECT *
            FROM parties
            WHERE id = ?
        `).get(id);

        if (!party) {
            return { success: false, error: "Party not found." };
        }

        const sales = db.prepare(`
            SELECT
                id,
                invoice_no AS reference,
                created_at AS date,
                total AS debit,
                0 AS credit,
                'Sale' AS type
            FROM sales
            WHERE party_id = ?
        `).all(id);

        const purchases = db.prepare(`
            SELECT
                id,
                bill_no AS reference,
                created_at AS date,
                0 AS debit,
                total AS credit,
                'Purchase' AS type
            FROM purchases
            WHERE party_id = ?
        `).all(id);

        const payments = db.prepare(`
            SELECT
                id,
                note AS reference,
                created_at AS date,
                CASE WHEN type = 'receive' THEN amount ELSE 0 END AS debit,
                CASE WHEN type = 'pay' THEN amount ELSE 0 END AS credit,
                CASE WHEN type = 'receive' THEN 'Received' ELSE 'Paid' END AS type
            FROM payments
            WHERE party_id = ?
        `).all(id);

        const saleReturns = db.prepare(`
            SELECT
                id,
                return_no AS reference,
                created_at AS date,
                0 AS debit,
                total AS credit,
                'Sale Return' AS type
            FROM sale_returns
            WHERE party_id = ?
        `).all(id);

        const purchaseReturns = db.prepare(`
            SELECT
                id,
                return_no AS reference,
                created_at AS date,
                total AS debit,
                0 AS credit,
                'Purchase Return' AS type
            FROM purchase_returns
            WHERE party_id = ?
        `).all(id);

        const entries = [
            ...sales,
            ...purchases,
            ...payments,
            ...saleReturns,
            ...purchaseReturns
        ].sort((a, b) => {
            return new Date(a.date) - new Date(b.date);
        });

        let runningBalance = Number(party.opening_balance) || 0;

        const ledger = entries.map(entry => {
            runningBalance += (Number(entry.debit) || 0) - (Number(entry.credit) || 0);

            return {
                ...entry,
                balance: runningBalance
            };
        });

        return {
            success: true,
            party,
            entries: ledger,
            openingBalance: Number(party.opening_balance) || 0,
            closingBalance: runningBalance
        };
    } catch (error) {
        console.error("Get ledger error:", error);
        return { success: false, error: error.message };
    }
});


// ======================================================
// EXPENSES
// ======================================================

ipcMain.handle("get-expenses", () => {
    try {
        return db.prepare(`
            SELECT *
            FROM expenses
            ORDER BY id DESC
        `).all();
    } catch (error) {
        console.error("Get expenses error:", error);
        return [];
    }
});


ipcMain.handle("save-expense", (event, data) => {
    try {
        const category = String(data.category || "").trim();
        const name = String(data.name || "").trim();
        const amount = Number(data.amount) || 0;
        const paymentMethod = data.payment_method || data.paymentMethod || "Cash";
        const note = data.note || "";

        if (!category) {
            return { success: false, error: "Category is required." };
        }

        if (amount <= 0) {
            return { success: false, error: "Amount must be greater than 0." };
        }

        const transaction = db.transaction(() => {
            const result = db.prepare(`
                INSERT INTO expenses
                (
                    category,
                    name,
                    amount,
                    payment_method,
                    note,
                    created_by
                )
                VALUES (?, ?, ?, ?, ?, ?)
            `).run(category, name, amount, paymentMethod, note,
                currentSession?.id || null);

            const expenseId = Number(result.lastInsertRowid);

            if (paymentMethod === "Cash") {
                db.prepare(`
                    UPDATE cash
                    SET balance = MAX(0, balance - ?)
                    WHERE id = 1
                `).run(amount);
            } else if (paymentMethod === "Bank") {
                const bank = db.prepare(`
                    SELECT id
                    FROM bank_accounts
                    ORDER BY id ASC
                    LIMIT 1
                `).get();

                if (bank) {
                    db.prepare(`
                        UPDATE bank_accounts
                        SET current_balance = current_balance - ?
                        WHERE id = ?
                    `).run(amount, bank.id);
                }
            }

            return expenseId;
        });

        const expenseId = transaction();

        logAudit(
            currentSession?.id, currentSession?.username,
            "expense_created", "expense", Number(expenseId),
            null, { category: data.category, amount: data.amount }
        );

        return { success: true, id: expenseId };
    } catch (error) {
        console.error("Save expense error:", error);
        return { success: false, error: error.message };
    }
});


ipcMain.handle("delete-expense", (event, expenseId) => {
    try {
        const id = Number(expenseId);

        if (!id) {
            return { success: false, error: "Invalid expense ID." };
        }

        const expense = db.prepare(`
            SELECT *
            FROM expenses
            WHERE id = ?
        `).get(id);

        if (!expense) {
            return { success: false, error: "Expense not found." };
        }

        const transaction = db.transaction(() => {
            if (expense.payment_method === "Cash") {
                db.prepare(`
                    UPDATE cash
                    SET balance = balance + ?
                    WHERE id = 1
                `).run(Number(expense.amount) || 0);
            } else if (expense.payment_method === "Bank") {
                const bank = db.prepare(`
                    SELECT id
                    FROM bank_accounts
                    ORDER BY id ASC
                    LIMIT 1
                `).get();

                if (bank) {
                    db.prepare(`
                        UPDATE bank_accounts
                        SET current_balance = current_balance + ?
                        WHERE id = ?
                    `).run(Number(expense.amount) || 0, bank.id);
                }
            }

            db.prepare(`
                DELETE FROM expenses
                WHERE id = ?
            `).run(id);
        });

        transaction();

        return { success: true };
    } catch (error) {
        console.error("Delete expense error:", error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle("delete-all-expenses", async () => {
    try {
        const deleted = await Promise.resolve().then(() => db.transaction(() => {
            db.prepare("DELETE FROM expenses_backup").run();
            const expenses = db.prepare("SELECT * FROM expenses").all();
            for (const expense of expenses) {
                db.prepare(`
                    INSERT INTO expenses_backup
                    (id, category, name, amount, payment_method, note, created_by, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `).run(expense.id, expense.category, expense.name, expense.amount,
                    expense.payment_method, expense.note, expense.created_by, expense.created_at);
                if (expense.payment_method === "Cash") {
                    db.prepare("UPDATE cash SET balance = balance + ? WHERE id = 1").run(Number(expense.amount) || 0);
                } else if (expense.payment_method === "Bank") {
                    const bank = db.prepare("SELECT id FROM bank_accounts ORDER BY id ASC LIMIT 1").get();
                    if (bank) db.prepare("UPDATE bank_accounts SET current_balance = current_balance + ? WHERE id = ?").run(Number(expense.amount) || 0, bank.id);
                }
            }
            db.prepare("DELETE FROM expenses").run();
            return expenses.length;
        })());
        return { success: true, deleted: Number(deleted || 0) };
    } catch (error) {
        console.error("Delete all expenses error:", error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle("restore-expenses", async () => {
    try {
        const restored = await Promise.resolve().then(() => db.transaction(() => {
            const expenses = db.prepare("SELECT * FROM expenses_backup ORDER BY id ASC").all();
            let count = 0;
            for (const expense of expenses) {
                const result = db.prepare(`
                    INSERT OR IGNORE INTO expenses
                    (id, category, name, amount, payment_method, note, created_by, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `).run(expense.id, expense.category, expense.name, expense.amount,
                    expense.payment_method, expense.note, expense.created_by, expense.created_at);
                if (result.changes) {
                    count += Number(result.changes);
                    if (expense.payment_method === "Cash") {
                        db.prepare("UPDATE cash SET balance = MAX(0, balance - ?) WHERE id = 1").run(Number(expense.amount) || 0);
                    } else if (expense.payment_method === "Bank") {
                        const bank = db.prepare("SELECT id FROM bank_accounts ORDER BY id ASC LIMIT 1").get();
                        if (bank) db.prepare("UPDATE bank_accounts SET current_balance = current_balance - ? WHERE id = ?").run(Number(expense.amount) || 0, bank.id);
                    }
                }
            }
            return count;
        })());
        return { success: true, restored };
    } catch (error) {
        console.error("Restore expenses error:", error);
        return { success: false, error: error.message };
    }
});


// ======================================================
// CASHBOOK
// ======================================================

ipcMain.handle("get-cashbook", async (event, filters = {}) => {
    try {
        const entries = db.prepare(`
            SELECT source_table, source_id, date, reference, inflow, outflow, type FROM (
                SELECT 'sales' source_table, id source_id, created_at date, invoice_no reference,
                       paid inflow, 0 outflow, 'Sale' type FROM sales
                WHERE LOWER(TRIM(COALESCE(payment_method, ''))) = 'cash' AND paid > 0
                  AND status != 'void'
                  AND NOT EXISTS (SELECT 1 FROM cashbook_hidden h WHERE h.source_table = 'sales' AND h.source_id = sales.id)
                UNION ALL
                SELECT 'purchases', id, created_at, bill_no, 0, paid, 'Purchase' FROM purchases
                WHERE LOWER(TRIM(COALESCE(payment_method, ''))) = 'cash' AND paid > 0
                  AND status != 'void'
                  AND NOT EXISTS (SELECT 1 FROM cashbook_hidden h WHERE h.source_table = 'purchases' AND h.source_id = purchases.id)
                UNION ALL
                SELECT 'expenses', id, created_at, COALESCE(NULLIF(name, ''), category), 0, amount, 'Expense' FROM expenses
                WHERE LOWER(TRIM(COALESCE(payment_method, ''))) = 'cash'
                  AND NOT EXISTS (SELECT 1 FROM cashbook_hidden h WHERE h.source_table = 'expenses' AND h.source_id = expenses.id)
                UNION ALL
                SELECT 'payments', id, created_at, note,
                       CASE WHEN type = 'receive' THEN amount ELSE 0 END,
                       CASE WHEN type = 'pay' THEN amount ELSE 0 END,
                       CASE WHEN type = 'receive' THEN 'Received' ELSE 'Paid' END
                FROM payments
                WHERE LOWER(TRIM(COALESCE(payment_method, ''))) = 'cash'
                  AND type IN ('receive', 'pay')
                  AND NOT EXISTS (SELECT 1 FROM cashbook_hidden h WHERE h.source_table = 'payments' AND h.source_id = payments.id)
                UNION ALL
                  SELECT 'sale_returns', id, created_at, return_no, 0,
                      COALESCE(cash_refunded, CASE WHEN LOWER(TRIM(COALESCE(payment_method, ''))) = 'cash' THEN total ELSE 0 END),
                      'Sale Return' FROM sale_returns
                WHERE LOWER(TRIM(COALESCE(payment_method, ''))) = 'cash' AND total > 0
                UNION ALL
                  SELECT 'purchase_returns', id, created_at, return_no,
                      COALESCE(cash_refunded, CASE WHEN LOWER(TRIM(COALESCE(payment_method, ''))) = 'cash' THEN total ELSE 0 END),
                      0, 'Purchase Return' FROM purchase_returns
                WHERE LOWER(TRIM(COALESCE(payment_method, ''))) = 'cash' AND total > 0
                                UNION ALL
                                SELECT 'sales', id, created_at, invoice_no, paid, 0, 'Bank Sale' FROM sales
                                WHERE LOWER(TRIM(COALESCE(payment_method, ''))) IN ('bank', 'card', 'online', 'transfer', 'cheque')
                                    AND paid > 0 AND LOWER(COALESCE(status, 'completed')) NOT IN ('void', 'cancelled')
                                UNION ALL
                                SELECT 'purchases', id, created_at, bill_no, 0, paid, 'Bank Purchase' FROM purchases
                                WHERE LOWER(TRIM(COALESCE(payment_method, ''))) IN ('bank', 'card', 'online', 'transfer', 'cheque')
                                    AND paid > 0 AND LOWER(COALESCE(status, 'completed')) NOT IN ('void', 'cancelled')
                                UNION ALL
                                SELECT 'expenses', id, created_at, COALESCE(NULLIF(name, ''), category), 0, amount, 'Bank Expense' FROM expenses
                                WHERE LOWER(TRIM(COALESCE(payment_method, ''))) IN ('bank', 'card', 'online', 'transfer', 'cheque')
                UNION ALL
                SELECT 'transfers', id, date, COALESCE(NULLIF(note, ''), type),
                       CASE WHEN type = 'bank_to_cash' THEN amount ELSE 0 END,
                       CASE WHEN type = 'cash_to_bank' THEN amount ELSE 0 END,
                       CASE WHEN type = 'bank_to_cash' THEN 'Bank to Cash' ELSE 'Cash to Bank' END
                FROM transfers
                WHERE type IN ('cash_to_bank', 'bank_to_cash')
                UNION ALL
                SELECT 'payments', id, created_at, note,
                       CASE WHEN type = 'transfer_in' THEN amount ELSE 0 END,
                       CASE WHEN type = 'transfer_out' THEN amount ELSE 0 END,
                       CASE WHEN type = 'transfer_in' THEN 'Bank to Cash' ELSE 'Cash to Bank' END
                FROM payments
                WHERE type IN ('transfer_in', 'transfer_out')
                  AND NOT EXISTS (
                      SELECT 1 FROM transfers t
                      WHERE t.amount = payments.amount
                        AND DATE(t.date, 'localtime') = DATE(payments.created_at, 'localtime')
                        AND ((t.type = 'bank_to_cash' AND payments.type = 'transfer_in')
                          OR (t.type = 'cash_to_bank' AND payments.type = 'transfer_out'))
                  )
                  UNION ALL
                  SELECT 'payments', id, created_at, note,
                      CASE WHEN type = 'receive' THEN amount ELSE 0 END,
                      CASE WHEN type = 'pay' THEN amount ELSE 0 END,
                      CASE WHEN type = 'receive' THEN 'Bank Received' ELSE 'Bank Paid' END
                  FROM payments
                  WHERE LOWER(TRIM(COALESCE(payment_method, ''))) IN ('bank', 'card', 'online', 'transfer', 'cheque')
                    AND type IN ('receive', 'pay')
                  UNION ALL
                  SELECT 'sale_returns', id, created_at, return_no, 0,
                      COALESCE(bank_refunded, CASE WHEN LOWER(TRIM(COALESCE(payment_method, ''))) IN ('bank', 'card', 'online', 'transfer', 'cheque') THEN total ELSE 0 END),
                      'Bank Sale Return' FROM sale_returns
                  WHERE LOWER(TRIM(COALESCE(payment_method, ''))) IN ('bank', 'card', 'online', 'transfer', 'cheque') AND total > 0
                  UNION ALL
                  SELECT 'purchase_returns', id, created_at, return_no,
                      COALESCE(bank_refunded, CASE WHEN LOWER(TRIM(COALESCE(payment_method, ''))) IN ('bank', 'card', 'online', 'transfer', 'cheque') THEN total ELSE 0 END),
                      0, 'Bank Purchase Return' FROM purchase_returns
                  WHERE LOWER(TRIM(COALESCE(payment_method, ''))) IN ('bank', 'card', 'online', 'transfer', 'cheque') AND total > 0
            )
            ORDER BY date DESC, source_id DESC
        `).all();

        const requestedFrom = String(filters.from_date || filters.fromDate || '').trim();
        const requestedTo = String(filters.to_date || filters.toDate || requestedFrom).trim();
        const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value);
        const today = new Date().toLocaleDateString('en-CA');
        const fromDate = validDate(requestedFrom) ? requestedFrom : today;
        const toDate = validDate(requestedTo) ? requestedTo : fromDate;
        const rangeStart = fromDate <= toDate ? fromDate : toDate;
        const rangeEnd = fromDate <= toDate ? toDate : fromDate;
        const salesDateFilter = `AND DATE(created_at, 'localtime') BETWEEN DATE(?) AND DATE(?)`;
        const cashSales = Number(db.prepare(`
            SELECT COALESCE(SUM(sales.paid - COALESCE((
                SELECT SUM(COALESCE(sr.cash_refunded, CASE WHEN LOWER(sr.payment_method) = 'cash' THEN sr.total ELSE 0 END))
                FROM sale_returns sr WHERE sr.sale_id = sales.id
            ), 0)), 0) AS total
            FROM sales
            WHERE LOWER(TRIM(COALESCE(payment_method, ''))) = 'cash'
              AND LOWER(COALESCE(status, 'completed')) NOT IN ('cancelled', 'void')
              ${salesDateFilter}
        `).get(rangeStart, rangeEnd)?.total || 0);
        const bankSales = Number(db.prepare(`
            SELECT COALESCE(SUM(sales.paid - COALESCE((
                SELECT SUM(COALESCE(sr.bank_refunded, CASE WHEN LOWER(sr.payment_method) IN ('bank', 'online') THEN sr.total ELSE 0 END))
                FROM sale_returns sr WHERE sr.sale_id = sales.id
            ), 0)), 0) AS total
            FROM sales
            WHERE LOWER(TRIM(COALESCE(payment_method, ''))) IN ('bank', 'card', 'online', 'transfer', 'cheque')
              AND LOWER(COALESCE(status, 'completed')) NOT IN ('cancelled', 'void')
              ${salesDateFilter}
        `).get(rangeStart, rangeEnd)?.total || 0);

        const bankBalance = Number(db.calculateTotalBankBalance(currentSession?.business_id) || 0);

        const selectedDate = String(filters.date || '').trim();
        if (selectedDate && !/^\d{4}-\d{2}-\d{2}$/.test(selectedDate)) return { success: false, error: 'Please select a valid date.' };
        const filteredEntries = selectedDate
            ? entries.filter(entry => String(entry.date || '').slice(0, 10) === selectedDate)
            : entries.filter(entry => {
                const entryDate = String(entry.date || '').slice(0, 10);
                return entryDate >= rangeStart && entryDate <= rangeEnd;
            });
        return {
            success: true,
            cashSalesTotal: cashSales,
            balance: Number(db.prepare("SELECT COALESCE(balance, 0) AS total FROM cash WHERE id = 1").get()?.total || 0),
            cashBalance: Number(db.prepare("SELECT COALESCE(balance, 0) AS total FROM cash WHERE id = 1").get()?.total || 0),
            bankBalance,
            bank_balance: bankBalance,
            bankSalesTotal: bankSales,
            entries: filteredEntries
        };
    } catch (error) {
        console.error("Get cashbook error:", error);
        return { success: false, error: error.message };
    }
});


// ======================================================
// BANK ACCOUNTS
// ======================================================

ipcMain.handle("get-bank-accounts", () => {
    try {
        return db.prepare(`
            SELECT *
            FROM bank_accounts
            ORDER BY id ASC
        `).all();
    } catch (error) {
        console.error("Get bank accounts error:", error);
        return [];
    }
});


ipcMain.handle("save-bank-account", (event, data) => {
    try {
        const bankName = String(data.bank_name || data.bankName || "").trim();
        const accountNumber = data.account_number || data.accountNumber || "";
        const accountTitle = data.account_title || data.accountTitle || "";
        const branchName = data.branch_name || data.branchName || "";
        const branchCode = data.branch_code || data.branchCode || "";
        const openingBalance = Number(data.opening_balance ?? data.openingBalance ?? 0);
        const printOnInvoice = data.print_on_invoice ?? data.printOnInvoice ?? 0;

        if (!bankName) {
            return { success: false, error: "Bank name is required." };
        }

        const result = db.prepare(`
            INSERT INTO bank_accounts
            (
                bank_name,
                account_number,
                account_title,
                branch_name,
                branch_code,
                opening_balance,
                current_balance,
                print_on_invoice
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            bankName,
            accountNumber,
            accountTitle,
            branchName,
            branchCode,
            openingBalance,
            openingBalance,
            printOnInvoice ? 1 : 0
        );

        db.saveNow();

        return { success: true, id: Number(result.lastInsertRowid) };
    } catch (error) {
        console.error("Save bank account error:", error);
        return { success: false, error: error.message };
    }
});


ipcMain.handle("delete-bank-account", (event, bankId) => {
    try {
        const id = Number(bankId);

        if (!id) {
            return { success: false, error: "Invalid bank account ID." };
        }

        db.prepare(`
            DELETE FROM bank_accounts
            WHERE id = ?
        `).run(id);

        return { success: true };
    } catch (error) {
        console.error("Delete bank account error:", error);
        return { success: false, error: error.message };
    }
});


// ======================================================
// REPORTS
// ======================================================

ipcMain.handle("get-sales-report", (event, filters) => {
    try {
        const fromDate = filters?.from_date || filters?.fromDate || "";
        const toDate = filters?.to_date || filters?.toDate || "";
        const partyId = Number(filters?.party_id ?? filters?.partyId ?? 0);

        let query = `
            SELECT
                sales.*,
                parties.name AS party_name
            FROM sales
            LEFT JOIN parties
                ON sales.party_id = parties.id
            WHERE 1=1
        `;

        const params = [];

        if (fromDate) {
            query += ` AND DATE(sales.created_at, 'localtime') >= DATE(?)`;
            params.push(fromDate);
        }

        if (toDate) {
            query += ` AND DATE(sales.created_at, 'localtime') <= DATE(?)`;
            params.push(toDate);
        }

        if (partyId) {
            query += ` AND sales.party_id = ?`;
            params.push(partyId);
        }

        query += ` ORDER BY sales.id DESC`;

        const sales = db.prepare(query).all(...params);

        const totalSales = sales.reduce((sum, s) => sum + (Number(s.total) || 0), 0);
        const totalPaid = sales.reduce((sum, s) => sum + (Number(s.paid) || 0), 0);
        const totalDue = sales.reduce((sum, s) => sum + (Number(s.due) || 0), 0);

        return {
            success: true,
            sales,
            summary: {
                totalSales,
                totalPaid,
                totalDue,
                count: sales.length
            }
        };
    } catch (error) {
        console.error("Get sales report error:", error);
        return { success: false, error: error.message };
    }
});


ipcMain.handle("get-purchase-report", (event, filters) => {
    try {
        const fromDate = filters?.from_date || filters?.fromDate || "";
        const toDate = filters?.to_date || filters?.toDate || "";
        const partyId = Number(filters?.party_id ?? filters?.partyId ?? 0);

        let query = `
            SELECT
                purchases.*,
                parties.name AS party_name
            FROM purchases
            LEFT JOIN parties
                ON purchases.party_id = parties.id
            WHERE 1=1
        `;

        const params = [];

        if (fromDate) {
            query += ` AND DATE(purchases.created_at, 'localtime') >= DATE(?)`;
            params.push(fromDate);
        }

        if (toDate) {
            query += ` AND DATE(purchases.created_at, 'localtime') <= DATE(?)`;
            params.push(toDate);
        }

        if (partyId) {
            query += ` AND purchases.party_id = ?`;
            params.push(partyId);
        }

        query += ` ORDER BY purchases.id DESC`;

        const purchases = db.prepare(query).all(...params);

        const totalPurchase = purchases.reduce((sum, p) => sum + (Number(p.total) || 0), 0);
        const totalPaid = purchases.reduce((sum, p) => sum + (Number(p.paid) || 0), 0);
        const totalDue = purchases.reduce((sum, p) => sum + (Number(p.due) || 0), 0);

        return {
            success: true,
            purchases,
            summary: {
                totalPurchase,
                totalPaid,
                totalDue,
                count: purchases.length
            }
        };
    } catch (error) {
        console.error("Get purchase report error:", error);
        return { success: false, error: error.message };
    }
});


ipcMain.handle("get-profit-loss", (event, filters) => {
    try {
        const fromDate = filters?.from_date || filters?.fromDate || "";
        const toDate = filters?.to_date || filters?.toDate || "";

        const salesQuery = `
            SELECT COALESCE(SUM(total), 0) AS total
            FROM sales
            WHERE 1 = 1
            ${fromDate ? "AND DATE(created_at, 'localtime') >= DATE(?)" : ""}
            ${toDate ? "AND DATE(created_at, 'localtime') <= DATE(?)" : ""}
        `;

        const returnsQuery = `
            SELECT COALESCE(SUM(total), 0) AS total
            FROM sale_returns
            WHERE 1 = 1
            ${fromDate ? "AND DATE(created_at, 'localtime') >= DATE(?)" : ""}
            ${toDate ? "AND DATE(created_at, 'localtime') <= DATE(?)" : ""}
        `;

        const cogsQuery = `
            SELECT COALESCE(SUM(si.quantity * COALESCE(i.avg_cost, i.purchase_price, 0)), 0) AS total
            FROM sale_items si
            JOIN items i ON i.id = si.item_id
            JOIN sales s ON s.id = si.sale_id
            WHERE 1 = 1
            ${fromDate ? "AND DATE(s.created_at, 'localtime') >= DATE(?)" : ""}
            ${toDate ? "AND DATE(s.created_at, 'localtime') <= DATE(?)" : ""}
        `;

        const expenseQuery = `
            SELECT COALESCE(SUM(amount), 0) AS total
            FROM expenses
            WHERE 1 = 1
            ${fromDate ? "AND DATE(created_at, 'localtime') >= DATE(?)" : ""}
            ${toDate ? "AND DATE(created_at, 'localtime') <= DATE(?)" : ""}
        `;

        const params = [];
        if (fromDate) params.push(fromDate);
        if (toDate) params.push(toDate);

        const salesResult = db.prepare(salesQuery).get(...params);
        const returnsResult = db.prepare(returnsQuery).get(...params);
        const cogsResult = db.prepare(cogsQuery).get(...params);
        const expenseResult = db.prepare(expenseQuery).get(...params);

        const totalSales = Math.max(0, Number(salesResult?.total || 0) - Number(returnsResult?.total || 0));
        const cogs = Number(cogsResult?.total || 0);
        const totalExpenses = Number(expenseResult?.total || 0);
        const grossProfit = Math.max(0, totalSales - cogs);
        const totalProfit = Math.max(0, grossProfit - totalExpenses);
        const totalLoss = Math.max(0, totalExpenses - grossProfit);

        return {
            success: true,
            summary: {
                totalSales,
                totalPurchases: cogs,
                cogs,
                grossProfit,
                totalExpenses,
                totalProfit,
                totalLoss,
                lossBreakdown: {
                    operationalExpenses: totalExpenses,
                    negativeMargin: Math.max(0, cogs - totalSales),
                    returnedGoods: Number(returnsResult?.total || 0)
                }
            }
        };
    } catch (error) {
        console.error("Get profit loss error:", error);
        return { success: false, error: error.message };
    }
});


ipcMain.handle("get-stock-report", (event, filters) => {
    try {
        const fromDate = filters?.from_date || filters?.fromDate || "";
        const toDate = filters?.to_date || filters?.toDate || "";
        const items = db.prepare(`
            SELECT
                items.*,
                categories.name AS category,
                (items.stock * items.purchase_price) AS stock_value
            FROM items
            LEFT JOIN categories
                ON items.category_id = categories.id
            WHERE (? = '' OR DATE(items.created_at, 'localtime') >= DATE(?))
              AND (? = '' OR DATE(items.created_at, 'localtime') <= DATE(?))
            ORDER BY items.name ASC
        `).all(fromDate, fromDate, toDate, toDate);

        const totalStockValue = items.reduce((sum, item) => sum + (Number(item.stock_value) || 0), 0);
        const totalSaleValue = items.reduce((sum, item) => sum + ((Number(item.stock) || 0) * (Number(item.sale_price) || 0)), 0);

        return {
            success: true,
            items,
            summary: {
                totalStockValue,
                totalSaleValue,
                count: items.length
            }
        };
    } catch (error) {
        console.error("Get stock report error:", error);
        return { success: false, error: error.message };
    }
});


ipcMain.handle("get-expense-report", (event, filters) => {
    try {
        const fromDate = filters?.from_date || filters?.fromDate || "";
        const toDate = filters?.to_date || filters?.toDate || "";

        let query = `
            SELECT *
            FROM expenses
            WHERE 1=1
        `;

        const params = [];

        if (fromDate) {
            query += ` AND DATE(created_at, 'localtime') >= DATE(?)`;
            params.push(fromDate);
        }

        if (toDate) {
            query += ` AND DATE(created_at, 'localtime') <= DATE(?)`;
            params.push(toDate);
        }

        query += ` ORDER BY id DESC`;

        const expenses = db.prepare(query).all(...params);

        const totalExpenses = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

        // Group by category
        const byCategory = {};
        for (const expense of expenses) {
            const cat = expense.category || "Other";
            if (!byCategory[cat]) {
                byCategory[cat] = 0;
            }
            byCategory[cat] += Number(expense.amount) || 0;
        }

        return {
            success: true,
            expenses,
            summary: {
                totalExpenses,
                count: expenses.length
            },
            byCategory
        };
    } catch (error) {
        console.error("Get expense report error:", error);
        return { success: false, error: error.message };
    }
});


ipcMain.handle("get-receivables-payables", (event, filters) => {
    try {
        const fromDate = filters?.from_date || filters?.fromDate || "";
        const toDate = filters?.to_date || filters?.toDate || "";
        const salesDue = db.prepare(`
            SELECT s.id, s.invoice_no, s.created_at, s.total, s.paid,
                   MAX(s.total - s.paid - COALESCE(r.returned_total, 0), 0) AS pending_due,
                   COALESCE(NULLIF(s.customer_name, ''), p.name, 'Walk-In Customer') AS name
            FROM sales s
            LEFT JOIN parties p ON p.id = s.party_id
            LEFT JOIN (
                SELECT sale_id, SUM(total) AS returned_total
                FROM sale_returns
                GROUP BY sale_id
            ) r ON r.sale_id = s.id
            WHERE (s.status IS NULL OR s.status NOT IN ('void', 'cancelled'))
              AND (s.total - s.paid - COALESCE(r.returned_total, 0)) > 0
                            AND (? = '' OR DATE(s.created_at, 'localtime') >= DATE(?))
                            AND (? = '' OR DATE(s.created_at, 'localtime') <= DATE(?))
            ORDER BY s.id DESC
                `).all(fromDate, fromDate, toDate, toDate);

        const purchasesDue = db.prepare(`
            SELECT p.id, p.bill_no, p.created_at, p.total, p.paid,
                   MAX(p.total - p.paid - COALESCE(r.returned_total, 0), 0) AS pending_due,
                   COALESCE(s.name, 'Supplier') AS name
            FROM purchases p
            LEFT JOIN parties s ON s.id = p.party_id
            LEFT JOIN (
                SELECT purchase_id, SUM(total) AS returned_total
                FROM purchase_returns
                GROUP BY purchase_id
            ) r ON r.purchase_id = p.id
            WHERE (p.status IS NULL OR p.status NOT IN ('void', 'cancelled'))
              AND (p.total - p.paid - COALESCE(r.returned_total, 0)) > 0
                            AND (? = '' OR DATE(p.created_at, 'localtime') >= DATE(?))
                            AND (? = '' OR DATE(p.created_at, 'localtime') <= DATE(?))
            ORDER BY p.id DESC
                `).all(fromDate, fromDate, toDate, toDate);

        const totalReceivables = salesDue.reduce((sum, sale) => sum + (Number(sale.pending_due) || 0), 0);
        const totalPayables = purchasesDue.reduce((sum, purchase) => sum + (Number(purchase.pending_due) || 0), 0);

        return {
            success: true,
            receivables: salesDue,
            payables: purchasesDue,
            summary: {
                totalReceivables,
                totalPayables
            }
        };
    } catch (error) {
        console.error("Get receivables payables error:", error);
        return { success: false, error: error.message };
    }
});


// ======================================================
// MONTHLY ANALYTICS
// ======================================================

ipcMain.handle("get-monthly-analytics", (event, filters) => {
    try {
        const year = filters?.year || new Date().getFullYear().toString();
        const selectedMonth = String(filters?.month || "").padStart(2, "0");
        const monthClause = /^0[1-9]|1[0-2]$/.test(selectedMonth)
            ? " AND strftime('%m', created_at) = ?"
            : "";
        const queryParams = monthClause ? [year, selectedMonth] : [year];

        const salesQuery = `
            SELECT
                strftime('%m', created_at) AS month,
                COALESCE(SUM(total), 0) AS total,
                COUNT(*) AS sales_count
            FROM sales
            WHERE strftime('%Y', created_at) = ? AND (status IS NULL OR status NOT IN ('void', 'cancelled'))${monthClause}
            GROUP BY strftime('%m', created_at)
            ORDER BY month
        `;

        const returnsQuery = `
            SELECT
                strftime('%m', created_at) AS month,
                COALESCE(SUM(total), 0) AS total
            FROM sale_returns
            WHERE strftime('%Y', created_at) = ?${monthClause}
            GROUP BY strftime('%m', created_at)
            ORDER BY month
        `;

        const expenseQuery = `
            SELECT
                strftime('%m', created_at) AS month,
                COALESCE(SUM(amount), 0) AS total
            FROM expenses
            WHERE strftime('%Y', created_at) = ?${monthClause}
            GROUP BY strftime('%m', created_at)
            ORDER BY month
        `;

        const purchasesQuery = `
            SELECT
                strftime('%m', created_at) AS month,
                COALESCE(SUM(total), 0) AS total
            FROM purchases
            WHERE strftime('%Y', created_at) = ? AND (status IS NULL OR status NOT IN ('void', 'cancelled'))${monthClause}
            GROUP BY strftime('%m', created_at)
            ORDER BY month
        `;

        const salesData = db.prepare(salesQuery).all(...queryParams);
        const returnsData = db.prepare(returnsQuery).all(...queryParams);
        const expenseData = db.prepare(expenseQuery).all(...queryParams);
        const purchasesData = db.prepare(purchasesQuery).all(...queryParams);

        const months = [];
        const firstMonth = monthClause ? Number(selectedMonth) : 1;
        const lastMonth = monthClause ? Number(selectedMonth) : 12;
        for (let i = firstMonth; i <= lastMonth; i++) {
            const monthStr = String(i).padStart(2, '0');
            const sales = salesData.find(s => s.month === monthStr) || { total: 0 };
            const returns = returnsData.find(r => r.month === monthStr) || { total: 0 };
            const expenses = expenseData.find(e => e.month === monthStr) || { count: 0, total: 0 };
            const purchases = purchasesData.find(p => p.month === monthStr) || { total: 0 };

            const totalSales = Math.max(0, Number(sales.total) - Number(returns.total));
            const totalPurchases = Number(purchases.total);
            const totalExpenses = Number(expenses.total);
            const grossProfit = Math.max(0, totalSales - totalPurchases);
            const totalProfit = Math.max(0, grossProfit - totalExpenses);
            const totalLoss = Math.max(0, totalExpenses - grossProfit);

            months.push({
                month: monthStr,
                monthName: new Date(2000, i - 1, 1).toLocaleString('en', { month: 'short' }),
                sales: totalSales,
                purchases: totalPurchases,
                expenses: totalExpenses,
                grossProfit,
                totalProfit,
                totalLoss,
                salesCount: Number(sales.sales_count || 0),
                purchaseCount: 0,
                expenseCount: Number(expenses.total > 0 ? 1 : 0)
            });
        }

        const yearlyTotals = months.reduce((acc, m) => ({
            sales: acc.sales + m.sales,
            purchases: acc.purchases + m.purchases,
            expenses: acc.expenses + m.expenses,
            grossProfit: acc.grossProfit + m.grossProfit,
            totalProfit: acc.totalProfit + m.totalProfit,
            totalLoss: acc.totalLoss + m.totalLoss
        }), { sales: 0, purchases: 0, expenses: 0, grossProfit: 0, totalProfit: 0, totalLoss: 0 });

        return {
            success: true,
            year,
            month: selectedMonth || null,
            months,
            yearlyTotals
        };
    } catch (error) {
        console.error("Get monthly analytics error:", error);
        return { success: false, error: error.message };
    }
});

// ======================================================
// YEARLY ANALYTICS
// ======================================================

ipcMain.handle("get-yearly-analytics", (event, filters = {}) => {
    try {
    const selectedYear = String(filters?.year || "").trim();
    const yearClause = /^\d{4}$/.test(selectedYear) ? " WHERE strftime('%Y', created_at) = ?" : "";
    const yearParams = yearClause ? [selectedYear] : [];
        const salesQuery = `
            SELECT
                strftime('%Y', created_at) AS year,
                COALESCE(SUM(total), 0) AS total,
                COUNT(*) AS sales_count
            FROM sales${yearClause}
            GROUP BY strftime('%Y', created_at)
            ORDER BY year
        `;

        const returnsQuery = `
            SELECT
                strftime('%Y', created_at) AS year,
                COALESCE(SUM(total), 0) AS total
            FROM sale_returns${yearClause}
            GROUP BY strftime('%Y', created_at)
            ORDER BY year
        `;

        const expenseQuery = `
            SELECT
                strftime('%Y', created_at) AS year,
                COALESCE(SUM(amount), 0) AS total
            FROM expenses${yearClause}
            GROUP BY strftime('%Y', created_at)
            ORDER BY year
        `;

        const purchasesQuery = `
            SELECT
                strftime('%Y', created_at) AS year,
                COALESCE(SUM(total), 0) AS total
            FROM purchases${yearClause}
            GROUP BY strftime('%Y', created_at)
            ORDER BY year
        `;

        const salesData = db.prepare(salesQuery).all(...yearParams);
        const returnsData = db.prepare(returnsQuery).all(...yearParams);
        const expenseData = db.prepare(expenseQuery).all(...yearParams);
        const purchasesData = db.prepare(purchasesQuery).all(...yearParams);

        const allYears = new Set();
        salesData.forEach(s => allYears.add(s.year));
        returnsData.forEach(r => allYears.add(r.year));
        expenseData.forEach(e => allYears.add(e.year));
        purchasesData.forEach(p => allYears.add(p.year));

        const years = [];
        for (const year of Array.from(allYears).sort()) {
            const sales = salesData.find(s => s.year === year) || { total: 0 };
            const returns = returnsData.find(r => r.year === year) || { total: 0 };
            const expenses = expenseData.find(e => e.year === year) || { count: 0, total: 0 };
            const purchases = purchasesData.find(p => p.year === year) || { total: 0 };

            const totalSales = Math.max(0, Number(sales.total) - Number(returns.total));
            const totalPurchases = Number(purchases.total);
            const totalExpenses = Number(expenses.total);
            const grossProfit = Math.max(0, totalSales - totalPurchases);
            const totalProfit = Math.max(0, grossProfit - totalExpenses);
            const totalLoss = Math.max(0, totalExpenses - grossProfit);

            years.push({
                year,
                sales: totalSales,
                purchases: totalPurchases,
                expenses: totalExpenses,
                grossProfit,
                totalProfit,
                totalLoss,
                salesCount: Number(sales.sales_count || 0),
                purchaseCount: 0,
                expenseCount: Number(expenses.total > 0 ? 1 : 0)
            });
        }

        const allTimeTotals = years.reduce((acc, y) => ({
            sales: acc.sales + y.sales,
            purchases: acc.purchases + y.purchases,
            expenses: acc.expenses + y.expenses,
            grossProfit: acc.grossProfit + y.grossProfit,
            totalProfit: acc.totalProfit + y.totalProfit,
            totalLoss: acc.totalLoss + y.totalLoss
        }), { sales: 0, purchases: 0, expenses: 0, grossProfit: 0, totalProfit: 0, totalLoss: 0 });

        return {
            success: true,
            years,
            allTimeTotals
        };
    } catch (error) {
        console.error("Get yearly analytics error:", error);
        return { success: false, error: error.message };
    }
});


// ======================================================
// COMPANY / SETTINGS
// ======================================================

ipcMain.handle("get-company", () => {
    try {
        const company = db.prepare(`
            SELECT *
            FROM companies
            ORDER BY id ASC
            LIMIT 1
        `).get();

        return { success: true, company: company || null };
    } catch (error) {
        console.error("Get company error:", error);
        return { success: false, error: error.message };
    }
});


ipcMain.handle("save-company", (event, data) => {
    try {
        if (!canDo("settings")) {
            return permissionDenied();
        }

        const name = String(data.name || "").trim();

        if (!name) {
            return { success: false, error: "Company name is required." };
        }

        const existing = db.prepare(`
            SELECT id
            FROM companies
            ORDER BY id ASC
            LIMIT 1
        `).get();

        if (existing) {
            db.prepare(`
                UPDATE companies
                SET
                    name = ?,
                    phone = ?,
                    email = ?,
                    address = ?,
                    gstin = ?,
                    currency = ?,
                    invoice_footer = ?,
                    business_type = ?
                WHERE id = ?
            `).run(
                name,
                data.phone || "",
                data.email || "",
                data.address || "",
                data.gstin || "",
                data.currency || "Rs.",
                data.invoice_footer || "",
                String(data.business_type || "general_store"),
                existing.id
            );

            return { success: true, id: existing.id };
        }

        const result = db.prepare(`
            INSERT INTO companies
            (
                name,
                phone,
                email,
                address,
                gstin,
                currency,
                invoice_footer,
                business_type
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            name,
            data.phone || "",
            data.email || "",
            data.address || "",
            data.gstin || "",
            data.currency || "Rs.",
            data.invoice_footer || "",
            String(data.business_type || "general_store")
        );

        return { success: true, id: Number(result.lastInsertRowid) };
    } catch (error) {
        console.error("Save company error:", error);
        return { success: false, error: error.message };
    }
});


ipcMain.handle("get-companies", () => {
    try {
        const user = db.prepare(`
            SELECT username, phone FROM users WHERE id = ? AND active = 1
        `).get(currentSession?.id);
        const identifiers = [
            user?.username,
            user?.phone,
            currentSession?.username
        ];
        const data = db.getBusinessesForUser(identifiers);
        const companies = (data.businesses || []).map((b) => ({
            ...b,
            name: db.peekBusinessName(b.file) || b.name
        }));
        return {
            success: true,
            companies: companies,
            activeId: data.activeId
        };
    } catch (error) {
        console.error("Get companies error:", error);
        return { success: false, error: error.message };
    }
});


ipcMain.handle("add-company", (event, data) => {
    try {
        if (!currentSession) {
            return { success: false, error: "Login required." };
        }

        const name = String((data && data.name) || "").trim();

        if (!name) {
            return { success: false, error: "Business name is required." };
        }

        const sourceUser = db.prepare(`
            SELECT * FROM users WHERE id = ?
        `).get(currentSession.id);

        const source = sourceUser || {
            ...currentSession,
            active: 1,
            phone_verified: 1,
            password_hash: currentSession.password_hash || "",
            function_password: currentSession.function_password || ""
        };

        const biz = db.addBusiness(name, {
            phone: (data && data.phone) || "",
            address: (data && data.address) || "",
            user_keys: [currentSession.username, currentSession.phone]
        });

        if (!ensureCurrentUserOnActiveBusiness(source)) {
            return { success: false, error: "Could not prepare the new business account." };
        }

        return { success: true, company: biz };
    } catch (error) {
        console.error("Add company error:", error);
        return { success: false, error: error.message };
    }
});


ipcMain.handle("set-active-company", async (event, payload) => {
    try {
    await db.ready;

        // Web mode raw number bhejta hai (2), Electron
        // object bhejta hai ({ id: 2 }) — dono handle karo
        let rawId = payload;
        if (payload && typeof payload === "object") {
            rawId = payload.id;
        }

        const id = Number(rawId);

        if (!id) {
            return { success: false, error: "Company id is required." };
        }

        const user = db.prepare(`
            SELECT username, phone FROM users WHERE id = ?
        `).get(currentSession?.id);
        const identifiers = [
            currentSession?.username,
            currentSession?.phone,
            user?.username,
            user?.phone
        ];
        const ownedBusinesses = db.getBusinessesForUser(identifiers).businesses;
        const owned = ownedBusinesses.some(business => Number(business.id) === id);

        if (!owned) {
            return { success: false, error: "Business is not available for this account." };
        }

        const sourceUser = ownedBusinesses
            .map(business => db.getUserFromBusiness(business.id, identifiers))
            .find(Boolean) || {
                ...currentSession,
                active: 1,
                phone_verified: 1,
                password_hash: currentSession.password_hash || "",
                function_password: currentSession.function_password || ""
            };

        const ok = db.switchBusiness(id);

        if (!ok) {
            return { success: false, error: "Business not found." };
        }

        if (!ensureCurrentUserOnActiveBusiness(sourceUser)) {
            return { success: false, error: "Could not prepare the selected business account." };
        }

        if (Number(db.getActiveBusiness()?.id) !== id) {
            return { success: false, error: "Business switch did not complete." };
        }

        return { success: true };
    } catch (error) {
        console.error("Set active company error:", error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle("delete-company", (event, businessId) => {
    try {
        const id = Number(businessId);
        if (!id) {
            return { success: false, error: "Company id is required." };
        }

        const reg = db.getBusinesses();
        if (reg.businesses.length <= 1) {
            return { success: false, error: "Cannot delete the only business account." };
        }

        const user = db.prepare(`
            SELECT username, phone FROM users WHERE id = ?
        `).get(currentSession?.id);
        const owned = db.getBusinessesForUser([
            currentSession?.username,
            currentSession?.phone,
            user?.username,
            user?.phone
        ]).businesses.some(business => Number(business.id) === id);

        if (!owned) {
            return { success: false, error: "Business is not available for this account." };
        }

        const ok = db.deleteBusiness(id);
        if (!ok) {
            return { success: false, error: "Business not found." };
        }

        return { success: true };
    } catch (error) {
        console.error("Delete company error:", error);
        return { success: false, error: error.message };
    }
});


// ======================================================
// DASHBOARD
// ======================================================

ipcMain.handle("get-dashboard-data", async (event, filters = {}) => {
    try {
        await new Promise(resolve => setImmediate(resolve));
        const localToday = new Date().toLocaleDateString("en-CA");
        const requestedFrom = String(filters?.from_date || filters?.fromDate || localToday).trim();
        const requestedTo = String(filters?.to_date || filters?.toDate || requestedFrom).trim();
        const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value);
        const fromDate = validDate(requestedFrom) ? requestedFrom : localToday;
        const toDate = validDate(requestedTo) ? requestedTo : fromDate;
        const rangeStart = fromDate <= toDate ? fromDate : toDate;
        const rangeEnd = fromDate <= toDate ? toDate : fromDate;

        const todaySales = db.prepare(`
            SELECT COALESCE(SUM(total), 0) AS total
            FROM sales
                        WHERE DATE(created_at, 'localtime') BETWEEN DATE(?) AND DATE(?)
                            AND LOWER(COALESCE(status, 'completed')) NOT IN ('void', 'cancelled')
        `).get(rangeStart, rangeEnd);

        const todayPurchase = db.prepare(`
            SELECT COALESCE(SUM(total), 0) AS total
            FROM purchases
                        WHERE DATE(created_at, 'localtime') BETWEEN DATE(?) AND DATE(?)
                            AND LOWER(COALESCE(status, 'completed')) NOT IN ('void', 'cancelled')
        `).get(rangeStart, rangeEnd);

        const todayPurchaseReturns = db.prepare(`
            SELECT COALESCE(SUM(total), 0) AS total
            FROM purchase_returns
            WHERE DATE(created_at, 'localtime') BETWEEN DATE(?) AND DATE(?)
        `).get(rangeStart, rangeEnd);

        const todayReturns = db.prepare(`
            SELECT COALESCE(SUM(total), 0) AS total,
                   COUNT(*) AS count
            FROM sale_returns
            WHERE DATE(created_at, 'localtime') BETWEEN DATE(?) AND DATE(?)
        `).get(rangeStart, rangeEnd);

        const todayBankTransfer = db.prepare(`
            SELECT COALESCE(SUM(amount), 0) AS total,
                   COUNT(*) AS cnt
            FROM payments
            WHERE type IN ('transfer_in', 'transfer_out')
              AND DATE(created_at, 'localtime') BETWEEN DATE(?) AND DATE(?)
        `).get(rangeStart, rangeEnd);

        const receivables = db.prepare(`
            SELECT COALESCE(SUM(MAX(sales.total - sales.paid - COALESCE(returns.total, 0), 0)), 0) AS total
            FROM sales
            LEFT JOIN (
                SELECT sale_id, SUM(total) AS total
                FROM sale_returns
                WHERE DATE(created_at, 'localtime') BETWEEN DATE(?) AND DATE(?)
                GROUP BY sale_id
            ) returns ON returns.sale_id = sales.id
                        WHERE (sales.status IS NULL OR sales.status != 'void')
                            AND DATE(sales.created_at, 'localtime') BETWEEN DATE(?) AND DATE(?)
        `).get(rangeStart, rangeEnd, rangeStart, rangeEnd);

        const payables = db.prepare(`
            SELECT COALESCE(SUM(MAX(purchases.total - purchases.paid - COALESCE(returns.total, 0), 0)), 0) AS total
            FROM purchases
            LEFT JOIN (
                SELECT purchase_id, SUM(total) AS total
                FROM purchase_returns
                WHERE DATE(created_at, 'localtime') BETWEEN DATE(?) AND DATE(?)
                GROUP BY purchase_id
            ) returns ON returns.purchase_id = purchases.id
                        WHERE (purchases.status IS NULL OR purchases.status != 'void')
                            AND DATE(purchases.created_at, 'localtime') BETWEEN DATE(?) AND DATE(?)
                `).get(rangeStart, rangeEnd, rangeStart, rangeEnd);

                const customerSettlements = db.prepare(`
                        SELECT COALESCE(SUM(amount), 0) AS total
                        FROM payments
                        LEFT JOIN parties ON parties.id = payments.party_id
                        WHERE payments.type = 'receive' AND parties.type = 'Customer'
                            AND DATE(payments.created_at, 'localtime') BETWEEN DATE(?) AND DATE(?)
                `).get(rangeStart, rangeEnd);

                const supplierSettlements = db.prepare(`
                        SELECT COALESCE(SUM(amount), 0) AS total
                        FROM payments
                        LEFT JOIN parties ON parties.id = payments.party_id
                        WHERE payments.type = 'pay' AND parties.type = 'Supplier'
                            AND DATE(payments.created_at, 'localtime') BETWEEN DATE(?) AND DATE(?)
                `).get(rangeStart, rangeEnd);

        const totalItems = db.prepare(`
            SELECT COUNT(*) AS total
            FROM items
            WHERE DATE(created_at, 'localtime') <= DATE(?)
        `).get(rangeEnd);

        const stockValue = db.prepare(`
            SELECT COALESCE(SUM(stock * COALESCE(avg_cost, purchase_price)), 0) AS total
            FROM items
            WHERE DATE(created_at, 'localtime') <= DATE(?)
        `).get(rangeEnd);

        const cashSales = db.prepare(`
            SELECT COALESCE(SUM(paid), 0) AS total
            FROM sales
                        WHERE LOWER(TRIM(COALESCE(payment_method, ''))) = 'cash'
                            AND LOWER(COALESCE(status, 'completed')) NOT IN ('void', 'cancelled')
                            AND DATE(created_at, 'localtime') BETWEEN DATE(?) AND DATE(?)
                `).get(rangeStart, rangeEnd);

        const cashPurchases = db.prepare(`
            SELECT COALESCE(SUM(paid), 0) AS total
            FROM purchases
                        WHERE LOWER(TRIM(COALESCE(payment_method, ''))) = 'cash'
                            AND LOWER(COALESCE(status, 'completed')) NOT IN ('void', 'cancelled')
                            AND DATE(created_at, 'localtime') BETWEEN DATE(?) AND DATE(?)
                `).get(rangeStart, rangeEnd);

        const cashExpenses = db.prepare(`
            SELECT COALESCE(SUM(amount), 0) AS total
            FROM expenses
                        WHERE LOWER(TRIM(COALESCE(payment_method, ''))) = 'cash'
                            AND DATE(created_at, 'localtime') BETWEEN DATE(?) AND DATE(?)
                `).get(rangeStart, rangeEnd);

        const cashRefunds = db.prepare(`
            SELECT COALESCE(SUM(COALESCE(cash_refunded, CASE WHEN LOWER(payment_method) = 'cash' THEN total ELSE 0 END)), 0) AS total
            FROM sale_returns
                        WHERE LOWER(TRIM(COALESCE(payment_method, ''))) = 'cash'
                            AND DATE(created_at, 'localtime') BETWEEN DATE(?) AND DATE(?)
                `).get(rangeStart, rangeEnd);

        const cashPurchaseRefunds = db.prepare(`
            SELECT COALESCE(SUM(COALESCE(cash_refunded, CASE WHEN LOWER(payment_method) = 'cash' THEN total ELSE 0 END)), 0) AS total
            FROM purchase_returns
            WHERE DATE(created_at, 'localtime') BETWEEN DATE(?) AND DATE(?)
        `).get(rangeStart, rangeEnd);

        const cashInHand = Number(cashSales?.total || 0)
            - Number(cashPurchases?.total || 0)
            - Number(cashExpenses?.total || 0)
            - Number(cashRefunds?.total || 0)
            + Number(cashPurchaseRefunds?.total || 0);
        const cashLedger = db.prepare(`
            SELECT COALESCE(balance, 0) AS total
            FROM cash
            WHERE id = 1
        `).get();

        const bank = db.prepare(`
            SELECT COALESCE(SUM(current_balance), 0) AS total
            FROM bank_accounts
        `).get();
        const unifiedBankBalance = Number(
            db.calculateTotalBankBalance(currentSession?.business_id) || 0
        );

        const expenses = db.prepare(`
            SELECT COALESCE(SUM(amount), 0) AS total
            FROM expenses
            WHERE DATE(created_at, 'localtime') BETWEEN DATE(?) AND DATE(?)
        `).get(rangeStart, rangeEnd);

        const lowStock = db.prepare(`
            SELECT id, name, stock, low_stock_limit, unit
            FROM items
            WHERE stock <= low_stock_limit
            ORDER BY stock ASC
            LIMIT 10
        `).all();

        const expiryAlerts = db.prepare(`
            SELECT item_id AS id, item_name AS name, expiry_date,
                   quantity_remaining AS stock, unit, days_remaining,
                   CASE
                       WHEN days_remaining < 0 THEN 'EXPIRED'
                       WHEN days_remaining = 0 THEN 'EXPIRES TODAY'
                       ELSE 'EXPIRING SOON'
                   END AS expiry_status
            FROM (
                SELECT b.item_id, i.name AS item_name, b.expiry_date,
                       b.quantity_remaining, i.unit,
                       CAST(julianday(b.expiry_date) - julianday(DATE('now', 'localtime')) AS INTEGER) AS days_remaining
                FROM inventory_batches b
                JOIN items i ON i.id = b.item_id
                WHERE b.quantity_remaining > 0
                  AND b.expiry_date IS NOT NULL
                  AND TRIM(b.expiry_date) != ''

                UNION ALL

                SELECT i.id, i.name, i.expiry_date, i.stock, i.unit,
                       CAST(julianday(i.expiry_date) - julianday(DATE('now', 'localtime')) AS INTEGER) AS days_remaining
                FROM items i
                WHERE i.stock > 0
                  AND i.expiry_date IS NOT NULL
                  AND TRIM(i.expiry_date) != ''
                  AND NOT EXISTS (
                        SELECT 1 FROM inventory_batches b2
                        WHERE b2.item_id = i.id
                          AND b2.quantity_remaining > 0
                          AND b2.expiry_date IS NOT NULL
                          AND TRIM(b2.expiry_date) != ''
                  )
            )
            WHERE days_remaining <= 30
            ORDER BY expiry_date ASC, id ASC
            LIMIT 20
        `).all();

        const recentTransactions = db.prepare(`
            SELECT * FROM (
                SELECT sales.id AS ref_id, sales.invoice_no AS ref_no, sales.created_at AS date,
                       CASE WHEN COALESCE(sales.pricing_mode, 'retail') = 'wholesale' THEN 'Wholesale Sale' ELSE 'Sale' END AS type,
                       COALESCE(NULLIF(sales.customer_name, ''), parties.name,
                           CASE WHEN parties.type = 'Supplier' THEN 'Walk-In Supplier' ELSE 'Walk-In Customer' END) AS party,
                       sales.total AS amount, sales.payment_method AS method
                FROM sales
                LEFT JOIN parties ON sales.party_id = parties.id

                UNION ALL

                SELECT sale_returns.id, sale_returns.return_no, sale_returns.created_at,
                       'Sale Return', COALESCE(NULLIF(sale_returns.customer_name, ''), NULLIF(sales.customer_name, ''), parties.name, 'Walk-In Customer'), -sale_returns.total,
                       sale_returns.payment_method
                FROM sale_returns
                LEFT JOIN parties ON sale_returns.party_id = parties.id
                LEFT JOIN sales ON sale_returns.sale_id = sales.id

                UNION ALL

                  SELECT purchases.id, purchases.bill_no, purchases.created_at, 'Purchase',
                      COALESCE(parties.name, 'Walk-In Supplier'), purchases.total, purchases.payment_method
                FROM purchases
                LEFT JOIN parties ON purchases.party_id = parties.id

                  UNION ALL

                  SELECT purchase_returns.id, purchase_returns.return_no, purchase_returns.created_at,
                      'Purchase Return', COALESCE(parties.name, 'Walk-In Supplier'), -purchase_returns.total,
                      purchase_returns.payment_method
                  FROM purchase_returns
                  LEFT JOIN parties ON purchase_returns.party_id = parties.id

                UNION ALL

                SELECT expenses.id, expenses.category, expenses.created_at, 'Expense',
                       COALESCE(NULLIF(expenses.name, ''), expenses.category), expenses.amount,
                       expenses.payment_method
                FROM expenses

                UNION ALL

                SELECT pay.id, COALESCE(NULLIF(pay.note, ''), 'Payment'), pay.created_at,
                       CASE WHEN pay.type = 'receive' THEN 'Payment In' ELSE 'Payment Out' END,
                       COALESCE(parties.name, '-'), pay.amount, pay.payment_method
                FROM payments pay
                LEFT JOIN parties ON pay.party_id = parties.id
                WHERE pay.type IN ('receive', 'pay')
            )
            WHERE DATE(date, 'localtime') BETWEEN DATE(?) AND DATE(?)
            ORDER BY date DESC
            LIMIT 12
        `).all(rangeStart, rangeEnd);

        const grossTodaySales = Number(todaySales?.total || 0);
        const returnsTotal = Number(todayReturns?.total || 0);
        const grossTodayPurchase = Number(todayPurchase?.total || 0);
        const purchaseReturnsTotal = Number(todayPurchaseReturns?.total || 0);
        const netTodaySales = grossTodaySales - returnsTotal;

        const role = String(currentSession?.role || "owner").toLowerCase();
        const isOwner = role === "owner" || role === "admin";
        const isManager = role === "manager";
        const salesRecentTransactions = Array.isArray(recentTransactions)
            ? recentTransactions.filter(transaction => ["Sale", "Wholesale Sale", "Sale Return"].includes(transaction.type))
            : [];

        return {
            totalItems: Number(totalItems?.total || 0),
            todaySalesGross: grossTodaySales,
            todaySalesNet: netTodaySales,
            todaySales: netTodaySales,
            todayReturns: returnsTotal,
            todayReturnsCount: Number(todayReturns?.count || 0),
            todayPurchaseGross: isOwner || isManager ? grossTodayPurchase : 0,
            todayPurchaseNet: isOwner || isManager ? grossTodayPurchase - purchaseReturnsTotal : 0,
            todayPurchase: isOwner || isManager ? grossTodayPurchase : 0,
            todayBankTransfer: isOwner ? Number(todayBankTransfer?.cnt || 0) : 0,
            todayBankTransferCount: isOwner ? Number(todayBankTransfer?.cnt || 0) : 0,
            dashboardFromDate: rangeStart,
            dashboardToDate: rangeEnd,
            receivables: isOwner || isManager ? Math.max(0, Number(receivables?.total || 0) - Number(customerSettlements?.total || 0)) : 0,
            totalReceivedFromSales: isOwner || isManager ? Math.max(0, Number(receivables?.total || 0) - Number(customerSettlements?.total || 0)) : 0,
            payables: isOwner || isManager ? Math.max(0, Number(payables?.total || 0) - Number(supplierSettlements?.total || 0)) : 0,
            stockValue: isOwner || isManager ? Number(stockValue?.total || 0) : 0,
            cash: isOwner || role === "cashier" ? cashInHand : 0,
            cashInHand,
            bank: isOwner ? unifiedBankBalance : 0,
            bankBalance: isOwner ? unifiedBankBalance : 0,
            bank_balance: isOwner ? unifiedBankBalance : 0,
            bankLedger: isOwner ? Number(bank?.total || 0) : 0,
            expenses: isOwner ? Number(expenses?.total || 0) : 0,
            lowStock: isOwner || isManager ? (Array.isArray(lowStock) ? lowStock : []) : [],
            expiryAlerts: isOwner || isManager ? (Array.isArray(expiryAlerts) ? expiryAlerts : []) : [],
            recentTransactions: isOwner || isManager ? recentTransactions : salesRecentTransactions
        };
    } catch (error) {
        console.error("Dashboard data error:", error);

        return {
            totalItems: 0,
            todaySales: 0,
            todayPurchase: 0,
            receivables: 0,
            payables: 0,
            stockValue: 0,
            cash: 0,
            cashInHand: 0,
            bank: 0,
            bankBalance: 0,
            bank_balance: 0,
            bankLedger: 0,
            expenses: 0,
            lowStock: [],
            expiryAlerts: [],
            recentTransactions: []
        };
    }
});

const DASHBOARD_TRANSACTION_QUERY = `
    SELECT * FROM (
        SELECT sales.id AS ref_id, sales.invoice_no AS ref_no, sales.created_at AS date,
               CASE WHEN COALESCE(sales.pricing_mode, 'retail') = 'wholesale' THEN 'Wholesale Sale' ELSE 'Sale' END AS type,
               COALESCE(NULLIF(sales.customer_name, ''), parties.name,
                   CASE WHEN parties.type = 'Supplier' THEN 'Walk-In Supplier' ELSE 'Walk-In Customer' END) AS party,
               sales.total AS amount, sales.payment_method AS method
        FROM sales LEFT JOIN parties ON sales.party_id = parties.id
        WHERE date(sales.created_at) = ?
        UNION ALL
        SELECT sale_returns.id, sale_returns.return_no, sale_returns.created_at,
               'Sale Return', COALESCE(NULLIF(sale_returns.customer_name, ''), NULLIF(sales.customer_name, ''), parties.name, 'Walk-In Customer'), -sale_returns.total,
               sale_returns.payment_method
        FROM sale_returns
        LEFT JOIN parties ON sale_returns.party_id = parties.id
        LEFT JOIN sales ON sale_returns.sale_id = sales.id
        WHERE date(sale_returns.created_at) = ?
        UNION ALL
         SELECT purchases.id, purchases.bill_no, purchases.created_at, 'Purchase',
             COALESCE(parties.name, 'Walk-In Supplier'), purchases.total, purchases.payment_method
        FROM purchases LEFT JOIN parties ON purchases.party_id = parties.id
        WHERE date(purchases.created_at) = ?
         UNION ALL
         SELECT purchase_returns.id, purchase_returns.return_no, purchase_returns.created_at,
             'Purchase Return', COALESCE(parties.name, 'Walk-In Supplier'), -purchase_returns.total,
             purchase_returns.payment_method
         FROM purchase_returns LEFT JOIN parties ON purchase_returns.party_id = parties.id
         WHERE date(purchase_returns.created_at) = ?
         UNION ALL
         SELECT expenses.id, expenses.category, expenses.created_at, 'Expense',
               COALESCE(NULLIF(expenses.name, ''), expenses.category), expenses.amount,
               expenses.payment_method
        FROM expenses WHERE date(expenses.created_at) = ?
        UNION ALL
        SELECT pay.id, COALESCE(NULLIF(pay.note, ''), 'Payment'), pay.created_at,
               CASE WHEN pay.type = 'receive' THEN 'Payment In' ELSE 'Payment Out' END,
               COALESCE(parties.name, '-'), pay.amount, pay.payment_method
        FROM payments pay LEFT JOIN parties ON pay.party_id = parties.id
        WHERE pay.type IN ('receive', 'pay') AND date(pay.created_at) = ?
    ) ORDER BY date DESC LIMIT 100
`;

ipcMain.handle("get-dashboard-transactions", async (event, selectedDate) => {
    try {
        const date = String(selectedDate || "").trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return { success: false, error: "Please select a valid date." };
        }
        const transactions = await Promise.resolve().then(() =>
            db.prepare(DASHBOARD_TRANSACTION_QUERY).all(date, date, date, date, date, date)
        );
        return { success: true, transactions };
    } catch (error) {
        console.error("Dashboard transaction filter error:", error);
        return { success: false, error: error.message };
    }
});

const TRANSACTION_SOURCE_TABLES = [
    "sales", "sale_returns", "purchases", "purchase_returns", "expenses", "payments"
];

ipcMain.handle("delete-all-transactions", async () => {
    try {
        const result = await Promise.resolve().then(() => db.transaction(() => {
            db.prepare("DELETE FROM transactions_backup").run();
            for (const table of TRANSACTION_SOURCE_TABLES) {
                const rows = db.prepare(`SELECT * FROM ${table}`).all();
                for (const row of rows) {
                    db.prepare("INSERT INTO transactions_backup (source_table, source_id, payload) VALUES (?, ?, ?)")
                        .run(table, row.id, JSON.stringify(row));
                }
            }
            db.prepare("DELETE FROM sale_return_items").run();
            db.prepare("DELETE FROM purchase_return_items").run();
            db.prepare("DELETE FROM sale_items").run();
            db.prepare("DELETE FROM purchase_items").run();
            for (const table of ["sale_returns", "purchase_returns", "sales", "purchases", "expenses", "payments"]) {
                db.prepare(`DELETE FROM ${table}`).run();
            }
            return true;
        })());
        return { success: result, backedUp: true };
    } catch (error) {
        console.error("Delete all transactions error:", error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle("restore-transactions", async () => {
    try {
        const restored = await Promise.resolve().then(() => db.transaction(() => {
            let count = 0;
            for (const backup of db.prepare("SELECT source_table, payload FROM transactions_backup ORDER BY id ASC").all()) {
                if (!TRANSACTION_SOURCE_TABLES.includes(backup.source_table)) continue;
                const row = JSON.parse(backup.payload);
                const columns = Object.keys(row).filter(column => /^[A-Za-z_][A-Za-z0-9_]*$/.test(column));
                const placeholders = columns.map(() => "?").join(", ");
                const result = db.prepare(`INSERT OR IGNORE INTO ${backup.source_table} (${columns.join(", ")}) VALUES (${placeholders})`)
                    .run(columns.map(column => row[column]));
                count += Number(result.changes || 0);
            }
            return count;
        })());
        return { success: true, restored };
    } catch (error) {
        console.error("Restore transactions error:", error);
        return { success: false, error: error.message };
    }
});


// ======================================================
// DAILY SUMMARY REPORT
// Kisi bhi ek din ki poori activity — totals + lists
// ======================================================

ipcMain.handle("get-daily-summary", (event, filters) => {
    try {

        // YYYY-MM-DD format; default = aaj
        const date = String(filters?.date || "").trim() ||
            new Date().toLocaleDateString("en-CA");

        const summary = db.prepare(`
            SELECT
                (SELECT COALESCE(SUM(total), 0) FROM sales
                    WHERE DATE(created_at, 'localtime') = ?)
                AS sales_total,
                (SELECT COUNT(*) FROM sales
                    WHERE DATE(created_at, 'localtime') = ?)
                AS sales_count,
                (SELECT COALESCE(SUM(total), 0) FROM purchases
                    WHERE DATE(created_at, 'localtime') = ?)
                AS purchase_total,
                (SELECT COUNT(*) FROM purchases
                    WHERE DATE(created_at, 'localtime') = ?)
                AS purchase_count,
                (SELECT COALESCE(SUM(total), 0) FROM sale_returns
                    WHERE DATE(created_at, 'localtime') = ?)
                AS sale_return_total,
                (SELECT COUNT(*) FROM sale_returns
                    WHERE DATE(created_at, 'localtime') = ?)
                AS sale_return_count,
                (SELECT COALESCE(SUM(total), 0) FROM purchase_returns
                    WHERE DATE(created_at, 'localtime') = ?)
                AS purchase_return_total,
                (SELECT COUNT(*) FROM purchase_returns
                    WHERE DATE(created_at, 'localtime') = ?)
                AS purchase_return_count,
                (SELECT COALESCE(SUM(amount), 0) FROM expenses
                    WHERE DATE(created_at, 'localtime') = ?)
                AS expense_total,
                (SELECT COUNT(*) FROM expenses
                    WHERE DATE(created_at, 'localtime') = ?)
                AS expense_count,
                (SELECT COALESCE(SUM(amount), 0) FROM payments
                    WHERE type IN ('receive', 'received', 'in')
                      AND DATE(created_at, 'localtime') = ?)
                AS received_total,
                (SELECT COALESCE(SUM(amount), 0) FROM payments
                    WHERE type IN ('pay', 'paid', 'out')
                      AND DATE(created_at, 'localtime') = ?)
                AS paid_total
        `).get([date]);

        const partyJoin = (t) => `
            LEFT JOIN parties
                ON ${t}.party_id = parties.id
        `;

        const salesList = db.prepare(`
            SELECT
                sales.invoice_no,
                COALESCE(parties.name, 'Cash Customer') AS party,
                sales.total,
                sales.paid,
                sales.due,
                sales.payment_method,
                sales.created_at
            FROM sales
            ${partyJoin("sales")}
            WHERE DATE(sales.created_at, 'localtime') = ?
            ORDER BY sales.created_at ASC
        `).all([date]);

        const purchaseList = db.prepare(`
            SELECT
                purchases.bill_no,
                COALESCE(parties.name, '-') AS party,
                purchases.total,
                purchases.paid,
                purchases.due,
                purchases.payment_method,
                purchases.created_at
            FROM purchases
            ${partyJoin("purchases")}
            WHERE DATE(purchases.created_at, 'localtime') = ?
            ORDER BY purchases.created_at ASC
        `).all([date]);

        const expenseList = db.prepare(`
            SELECT
                category,
                name,
                amount,
                payment_method,
                created_at
            FROM expenses
            WHERE DATE(created_at, 'localtime') = ?
            ORDER BY created_at ASC
        `).all([date]);

        const returnList = db.prepare(`
            SELECT
                sale_returns.return_no AS return_no,
                'Sale Return' AS kind,
                COALESCE(parties.name, 'Customer') AS party,
                sale_returns.total AS total,
                sale_returns.created_at AS created_at
            FROM sale_returns
            ${partyJoin("sale_returns")}
            WHERE DATE(sale_returns.created_at, 'localtime') = ?
            UNION ALL

            SELECT
                purchase_returns.return_no,
                'Purchase Return',
                COALESCE(parties.name, 'Supplier'),
                purchase_returns.total,
                purchase_returns.created_at
            FROM purchase_returns
            ${partyJoin("purchase_returns")}
            WHERE DATE(purchase_returns.created_at, 'localtime') = ?
            ORDER BY created_at ASC
        `).all([date, date]);

        const paymentList = db.prepare(`
            SELECT
                payments.type,
                payments.amount,
                payments.payment_method,
                COALESCE(parties.name, '-') AS party,
                payments.note,
                payments.created_at
            FROM payments
            ${partyJoin("payments")}
            WHERE DATE(payments.created_at, 'localtime') = ?
            ORDER BY payments.created_at ASC
        `).all([date]);

        return {
            success: true,
            date,
            summary: {
                sales_total: Number(summary?.sales_total || 0),
                sales_count: Number(summary?.sales_count || 0),
                purchase_total: Number(summary?.purchase_total || 0),
                purchase_count: Number(summary?.purchase_count || 0),
                sale_return_total: Number(summary?.sale_return_total || 0),
                sale_return_count: Number(summary?.sale_return_count || 0),
                purchase_return_total: Number(summary?.purchase_return_total || 0),
                purchase_return_count: Number(summary?.purchase_return_count || 0),
                expense_total: Number(summary?.expense_total || 0),
                expense_count: Number(summary?.expense_count || 0),
                received_total: Number(summary?.received_total || 0),
                paid_total: Number(summary?.paid_total || 0)
            },
            salesList,
            purchaseList,
            expenseList,
            returnList,
            paymentList
        };


    } catch (error) {
        console.error("Daily summary error:", error);
        return { success: false, error: error.message };
    }
});


// ======================================================
// DATABASE BACKUP
// ======================================================

ipcMain.handle("backup-database", async () => {
    try {
        if (WEB_MODE) {
            return {
                success: false,
                error: "Backup dialog is only available in the desktop app."
            };
        }

        const dbFile = db.getDatabasePath();

        if (!fs.existsSync(dbFile)) {
            return { success: false, error: "Database file not found." };
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const defaultName = `pakkhatta-backup-${timestamp}.db`;

        const result = await dialog.showSaveDialog({
            title: "Backup Database",
            defaultPath: path.join(app.getPath("documents"), defaultName),
            filters: [
                { name: "Database Files", extensions: ["db"] }
            ]
        });

        if (result.canceled || !result.filePath) {
            return { success: false, error: "Backup cancelled." };
        }

        // Close WAL checkpoint and copy
        db.pragma("wal_checkpoint(TRUNCATE)");

        fs.copyFileSync(dbFile, result.filePath);

        return { success: true, path: result.filePath };
    } catch (error) {
        console.error("Backup database error:", error);
        return { success: false, error: error.message };
    }
});


ipcMain.handle("restore-database", async () => {
    try {
        if (WEB_MODE) {
            return {
                success: false,
                error: "Restore dialog is only available in the desktop app."
            };
        }

        const result = await dialog.showOpenDialog({
            title: "Restore Database",
            properties: ["openFile"],
            filters: [
                { name: "Database Files", extensions: ["db"] }
            ]
        });

        if (result.canceled || result.filePaths.length === 0) {
            return { success: false, error: "Restore cancelled." };
        }

        const sourceFile = result.filePaths[0];
        const dbFile = db.getDatabasePath();

        // Close database connection
        db.close();

        // Copy backup over current
        fs.copyFileSync(sourceFile, dbFile);

        // Restart app
        app.relaunch();
        app.exit(0);

        return { success: true };
    } catch (error) {
        console.error("Restore database error:", error);
        return { success: false, error: error.message };
    }
});


// ======================================================
// GLOBAL SEARCH
// ======================================================

ipcMain.handle("global-search", (event, query) => {
    try {
        const searchTerm = String(query || "").trim();

        if (!searchTerm || searchTerm.length < 2) {
            return {
                success: true,
                results: {
                    sales: [],
                    purchases: [],
                    parties: [],
                    items: []
                }
            };
        }

        const searchPattern = `%${searchTerm}%`;

        // Search sales by invoice number or party name
        const sales = db.prepare(`
            SELECT
                sales.id,
                sales.invoice_no,
                sales.total,
                sales.created_at,
                parties.name AS party_name,
                'sale' AS type
            FROM sales
            LEFT JOIN parties ON sales.party_id = parties.id
            WHERE sales.invoice_no LIKE ?
               OR parties.name LIKE ?
            ORDER BY sales.id DESC
            LIMIT 20
        `).all(searchPattern, searchPattern);

        // Search purchases by bill number or party name
        const purchases = db.prepare(`
            SELECT
                purchases.id,
                purchases.bill_no AS invoice_no,
                purchases.total,
                purchases.created_at,
                parties.name AS party_name,
                'purchase' AS type
            FROM purchases
            LEFT JOIN parties ON purchases.party_id = parties.id
            WHERE purchases.bill_no LIKE ?
               OR parties.name LIKE ?
            ORDER BY purchases.id DESC
            LIMIT 20
        `).all(searchPattern, searchPattern);

        // Search parties by name or phone
        const parties = db.prepare(`
            SELECT
                id,
                name,
                phone,
                type,
                balance,
                'party' AS type
            FROM parties
            WHERE name LIKE ?
               OR phone LIKE ?
            ORDER BY id DESC
            LIMIT 20
        `).all(searchPattern, searchPattern);

        // Search items by name
        const items = db.prepare(`
            SELECT
                id,
                name,
                sale_price,
                stock,
                unit,
                'item' AS type
            FROM items
            WHERE name LIKE ?
            ORDER BY id DESC
            LIMIT 20
        `).all(searchPattern);

        return {
            success: true,
            results: {
                sales,
                purchases,
                parties,
                items
            }
        };
    } catch (error) {
        console.error("Global search error:", error);
        return {
            success: false,
            error: error.message,
            results: {
                sales: [],
                purchases: [],
                parties: [],
                items: []
            }
        };
    }
});


// ======================================================
// PRINT INVOICE
// ======================================================

// ======================================================
// GET INVOICE HTML (for web-mode auto invoice)
// ======================================================

ipcMain.handle("get-invoice-html", (event, invoiceData) => {
    try {
        return { success: true, html: generateInvoiceHTML(invoiceData) };
    } catch (error) {
        console.error("Get invoice html error:", error);
        return { success: false, error: error.message };
    }
});


ipcMain.handle("print-invoice", (event, invoiceData) => {
    try {
        if (WEB_MODE) {
            return {
                success: false,
                error: "Printing is only available in the desktop app. Use the browser's Print (Ctrl+P) instead."
            };
        }

        const focusedWindow = BrowserWindow.getFocusedWindow();
        if (!focusedWindow) {
            return { success: false, error: "No active window found." };
        }

        // Generate HTML for invoice
        const invoiceHTML = generateInvoiceHTML(invoiceData);
        const previewPaperSize = normalizeInvoicePaperSize(
            invoiceData?.paperSize || invoiceData?.invoice?.paper_size || invoiceData?.paper_size || "A4"
        );

        // Create a preview window (visible) for print preview
        const previewWindow = new BrowserWindow({
            width: 800,
            height: 900,
            show: true,
            title: "Invoice Preview",
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            }
        });

        // Load invoice HTML with print button overlay
        const previewHTML = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Invoice Preview</title>
    <style>
        body { margin: 0; padding: 0; font-family: Arial, sans-serif; }
        #toolbar {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            background: #1e293b;
            padding: 12px 20px;
            display: flex;
            gap: 12px;
            align-items: center;
            z-index: 9999;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        }
        #toolbar button {
            padding: 8px 20px;
            border: none;
            border-radius: 6px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
        }
        #toolbar label {
            color: #e2e8f0;
            font-size: 13px;
            font-weight: 600;
        }
        #paperSize {
            padding: 8px 10px;
            border: 0;
            border-radius: 6px;
            color: #1e293b;
            font-weight: 600;
            cursor: pointer;
        }
        #btnPrint {
            background: #16a34a;
            color: white;
        }
        #btnPrint:hover { background: #15803d; }
        #btnClose {
            background: #64748b;
            color: white;
        }
        #btnClose:hover { background: #475569; }
        #invoiceContent {
            margin-top: 60px;
            padding: 20px;
        }
        @media print {
            #toolbar { display: none !important; }
            #invoiceContent { margin-top: 0; padding: 0; }
        }
    </style>
</head>
<body>
    <div id="toolbar">
        <label for="paperSize">Paper:</label>
        <select id="paperSize" aria-label="Invoice paper size">
            <option value="A4"${previewPaperSize === "A4" ? " selected" : ""}>A4</option>
            <option value="A5"${previewPaperSize === "A5" ? " selected" : ""}>A5</option>
            <option value="A6"${previewPaperSize === "A6" ? " selected" : ""}>A6 / Small</option>
            <option value="Thermal">80mm Thermal</option>
        </select>
        <button id="btnPrint">🖨 Print Invoice</button>
        <button id="btnClose" onclick="window.close();">✕ Close Preview</button>
    </div>
    <div id="invoiceContent">
        ${invoiceHTML}
    </div>
    <script>
        const paperSize = document.getElementById('paperSize');
        const printButton = document.getElementById('btnPrint');
        const printStyle = document.createElement('style');
        document.head.appendChild(printStyle);
        const paperSettings = {
            A4: { page: 'A4 portrait', margin: '12mm', width: '190mm', padding: '10mm' },
            A5: { page: 'A5 portrait', margin: '10mm', width: '140mm', padding: '8mm' },
            A6: { page: 'A6 portrait', margin: '6mm', width: '93mm', padding: '4mm' },
            Thermal: { page: '80mm auto', margin: '3mm', width: '72mm', padding: '3mm' }
        };

        function applyPaperSize() {
            const selected = paperSettings[paperSize.value] || paperSettings.A4;
            printStyle.textContent = '@media print { @page { size: ' + selected.page + '; margin: ' + selected.margin + '; } }';
            document.body.style.width = selected.width;
            document.body.style.padding = selected.padding;
        }

        paperSize.addEventListener('change', applyPaperSize);
        applyPaperSize();

        printButton.addEventListener('click', () => {
            if (printButton.disabled) return;
            printButton.disabled = true;
            printButton.textContent = 'Preparing...';
            applyPaperSize();
            setTimeout(() => {
                window.print();
                printButton.disabled = false;
                printButton.textContent = '🖨 Print Invoice';
            }, 0);
        });

        // Keyboard shortcut: Ctrl+P for print, Escape to close
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'p') {
                e.preventDefault();
                printButton.click();
            }
            if (e.key === 'Escape') {
                window.close();
            }
        });
    </script>
</body>
</html>`;

        previewWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(previewHTML)}`);

        return { success: true };
    } catch (error) {
        console.error("Print invoice error:", error);
        return { success: false, error: error.message };
    }
});

// ======================================================
// USERS & PERMISSIONS (PHASE 6)
// ======================================================

const DEFAULT_PERMISSIONS = {
    view_sales: true,
    create_sale: true,
    edit_sale: false,
    delete_sale: false,
    view_purchase: true,
    create_purchase: true,
    edit_purchase: false,
    delete_purchase: false,
    view_profit: true,
    view_cash: true,
    view_reports: true,
    manage_products: true,
    view_products: true,
    stock_adjustment: true,
    manage_expenses: true,
    manage_cash: true,
    view_company: true,
    manage_company: true,
    view_customers: true,
    view_suppliers: true,
    settings: false
};

const ROLE_PERMISSIONS = {
    owner: Object.assign({}, DEFAULT_PERMISSIONS, {
        edit_sale: true, delete_sale: true, edit_purchase: true,
        delete_purchase: true, settings: true
    }),
    // Keep legacy admin accounts functional with owner-like access.
    admin: Object.assign({}, DEFAULT_PERMISSIONS, {
        edit_sale: true, delete_sale: true, edit_purchase: true,
        settings: true
    }),
    manager: Object.assign({}, DEFAULT_PERMISSIONS, {
        edit_sale: true, edit_purchase: true,
        view_cash: false, manage_expenses: false,
        manage_cash: false, manage_company: false
    }),
    cashier: Object.assign({}, DEFAULT_PERMISSIONS, {
        edit_sale: false, delete_sale: false,
        view_purchase: false, create_purchase: false,
        view_profit: false, view_reports: false,
        manage_products: false, stock_adjustment: false,
        view_suppliers: false, settings: false,
        view_products: true, manage_expenses: false,
        manage_cash: false, view_company: false,
        manage_company: false
    }),
    salesman: Object.assign({}, DEFAULT_PERMISSIONS, {
        edit_sale: false, delete_sale: false,
        view_purchase: false, create_purchase: false,
        edit_purchase: false, delete_purchase: false,
        manage_products: false, stock_adjustment: false,
        view_cash: false, view_profit: false, view_reports: false,
        view_suppliers: false, settings: false,
        view_products: true, manage_expenses: false,
        manage_cash: false, view_company: false,
        manage_company: false
    })
};

// In-memory session (offline single-terminal) — declared once
// at the top (GLOBAL BACKEND AUTH GUARD) so the IPC session
// guard and the auth handlers share the same variable.

// ======================================================
// SECURE AUTH v2 (Production Redesign)
// ------------------------------------------------------
// - Default/seeded logins REMOVED (no hardcoded passwords)
// - First-launch Owner Account Setup (Phone + OTP)
// - scrypt password hashing, hashed OTPs, rate limits
// - Internet sirf OTP ke waqt; baqi sab 100% offline
// Isolated module: ./auth-system.js (accounting untouched)
// ======================================================

const auth = require("./auth-system");

// Auth schema har business DB par idempotent ensure hota hai
// (WeakSet memo ki wajah se sirf pehli dafa chalta hai per DB)
function ensureAuthReady() {
    try {
        auth.ensureAuthSchema(db);
    } catch (e) {
        console.error("Auth schema ensure error:", e.message);
    }
}

function ensureCurrentUserOnActiveBusiness(sourceUser) {
    if (!sourceUser) return null;

    try {
        ensureAuthReady();

        const username = String(
            sourceUser.username ||
            sourceUser.name ||
            sourceUser.full_name ||
            currentSession?.username ||
            currentSession?.name ||
            sourceUser.phone ||
            currentSession?.phone ||
            ""
        ).trim();

        if (!username) {
            console.error("Active business user sync skipped: no user identity available.");
            return null;
        }

        const phone = String(
            sourceUser.phone || currentSession?.phone || ""
        ).trim();
        const fullName = String(
            sourceUser.full_name ||
            sourceUser.name ||
            currentSession?.full_name ||
            username
        ).trim() || username;

        let targetUser = db.prepare(`
            SELECT * FROM users
            WHERE (phone = ? AND phone != '')
               OR username = ? COLLATE NOCASE
            LIMIT 1
        `).get(phone, username);

        if (!targetUser) {
            const result = db.prepare(`
                INSERT INTO users
                    (username, pin, full_name, role, permissions,
                     function_password, active, phone, password_hash,
                     phone_verified, failed_logins, locked_until, is_primary)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
            `).run(
                username,
                sourceUser.pin || "",
                fullName,
                sourceUser.role || "owner",
                sourceUser.permissions || "{}",
                sourceUser.function_password || "",
                sourceUser.active === undefined ? 1 : (Number(sourceUser.active) ? 1 : 0),
                phone,
                sourceUser.password_hash || "",
                Number(sourceUser.phone_verified) ? 1 : 0,
                sourceUser.locked_until || null,
                Number(sourceUser.is_primary) ? 1 : 0
            );
            targetUser = db.prepare(
                "SELECT * FROM users WHERE id = ?"
            ).get(Number(result.lastInsertRowid));
        }

        if (!targetUser) return null;

        currentSession = buildSession(targetUser);
        const session = auth.createSessionToken(db, targetUser.id);
        auth.writeSessionFile(session.token, db.getActiveBusiness()?.file);
        return targetUser;
    } catch (error) {
        console.error("Active business user sync error:", error);
        return null;
    }
}

function registerActiveUsersWithStore() {
    try {
        const users = db.prepare(`
            SELECT username, phone
            FROM users
            WHERE active = 1
        `).all();
        for (const user of users) {
            db.assignActiveBusinessUser([
                user.username,
                user.phone
            ]);
        }
    } catch (error) {
        console.error("User store mapping error:", error.message);
    }
}

function migrateSharedOwnerStores() {
    try {
        const registry = db.getBusinesses();
        if (registry.businesses.length !== 1 ||
            registry.businesses[0].user_keys) return;

        const users = db.prepare(`
            SELECT id, username, full_name, role, permissions, active,
                   phone, password_hash, phone_verified, failed_logins,
                   locked_until, is_primary, pin
            FROM users
            WHERE active = 1
            ORDER BY id ASC
        `).all();

        if (!users.length) return;

        const primaryUser = users[0];
        db.assignActiveBusinessUser([primaryUser.username, primaryUser.phone]);

        for (const user of users.slice(1)) {
            db.addBusiness(`${user.full_name || user.username}'s Store`);
            ensureAuthReady();
            db.prepare(`
                INSERT INTO users
                    (username, pin, full_name, role, permissions, active,
                     phone, password_hash, phone_verified, failed_logins,
                     locked_until, is_primary)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                user.username,
                user.pin || "",
                user.full_name || user.username,
                user.role || "owner",
                user.permissions || "{}",
                user.active ? 1 : 0,
                user.phone || "",
                user.password_hash || "",
                user.phone_verified ? 1 : 0,
                Number(user.failed_logins || 0),
                user.locked_until || null,
                user.is_primary ? 1 : 0
            );
            db.assignActiveBusinessUser([user.username, user.phone]);
        }

        db.switchBusiness(registry.businesses[0].id);
        ensureAuthReady();
        for (const user of users.slice(1)) {
            db.prepare("DELETE FROM sessions WHERE user_id = ?").run(user.id);
            db.prepare("DELETE FROM users WHERE id = ?").run(user.id);
        }
        db.saveNow();
    } catch (error) {
        console.error("Shared owner store migration error:", error.message);
    }
}

// ======================================================
// DEFAULT WALK-IN CUSTOMER
// ======================================================
// Ensures a default "Walk-In Customer" party exists for
// transactions where no specific customer is selected.

let DEFAULT_CUSTOMER_ID = 1;
let DEFAULT_SUPPLIER_ID = 1;

function normalizePartyType(value) {
    const normalized = String(value || "Customer").trim();
    if (normalized.toLowerCase() === "supplier") return "Supplier";
    return "Customer";
}

function ensureDefaultCustomer() {
    try {
        // Check if Walk-In Customer exists by party_code (more reliable than hardcoded ID)
        let walkIn = db.prepare(`SELECT id FROM parties WHERE party_code = ?`).get('WALK-IN');
        
        if (walkIn) {
            DEFAULT_CUSTOMER_ID = Number(walkIn.id);
        } else {
            // Check if id = 1 is available and not taken by another party
            const existing = db.prepare(`SELECT id, party_code FROM parties WHERE id = 1`).get();
            if (!existing) {
                // id = 1 is free, insert directly
                db.prepare(`
                    INSERT INTO parties (id, name, type, balance, phone, email, address, party_code)
                    VALUES (1, 'Walk-In Customer', 'Customer', 0, '', '', '', 'WALK-IN')
                `).run();
                DEFAULT_CUSTOMER_ID = 1;
            } else if (existing.party_code === 'WALK-IN') {
                DEFAULT_CUSTOMER_ID = 1;
            } else {
                // id = 1 is taken by another party, insert with auto-increment
                const result = db.prepare(`
                    INSERT INTO parties (name, type, balance, phone, email, address, party_code)
                    VALUES ('Walk-In Customer', 'Customer', 0, '', '', '', 'WALK-IN')
                `).run();
                DEFAULT_CUSTOMER_ID = Number(result.lastInsertRowid);
            }
        }
        console.log(`[INIT] Walk-In Customer ID: ${DEFAULT_CUSTOMER_ID}`);
    } catch (e) {
        console.error("Default customer ensure error:", e.message);
    }
}

function ensureDefaultSupplier() {
    try {
        let walkIn = db.prepare(`SELECT id FROM parties WHERE party_code = ?`).get('WALK-IN-SUPPLIER');
        if (walkIn) {
            DEFAULT_SUPPLIER_ID = Number(walkIn.id);
            return;
        }

        const existing = db.prepare(`SELECT id, party_code FROM parties WHERE id = 2`).get();
        if (!existing) {
            db.prepare(`
                INSERT INTO parties (id, name, type, balance, phone, email, address, party_code)
                VALUES (2, 'Walk-In Supplier', 'Supplier', 0, '', '', '', 'WALK-IN-SUPPLIER')
            `).run();
            DEFAULT_SUPPLIER_ID = 2;
        } else if (existing.party_code === 'WALK-IN-SUPPLIER') {
            DEFAULT_SUPPLIER_ID = 2;
        } else {
            const result = db.prepare(`
                INSERT INTO parties (name, type, balance, phone, email, address, party_code)
                VALUES ('Walk-In Supplier', 'Supplier', 0, '', '', '', 'WALK-IN-SUPPLIER')
            `).run();
            DEFAULT_SUPPLIER_ID = Number(result.lastInsertRowid);
        }
        console.log(`[INIT] Walk-In Supplier ID: ${DEFAULT_SUPPLIER_ID}`);
    } catch (e) {
        console.error("Default supplier ensure error:", e.message);
    }
}

// ensureAuthReady() will be called after DB is ready (in app.whenReady)
// This synchronous call at module load time causes timing issues

function roleRank(role) {
    const r = String(role || "").toLowerCase().trim();
    if (r === "owner") return 40;
    if (r === "admin") return 30;
    if (r === "manager") return 20;
    if (r === "cashier") return 10;
    if (r === "salesman") return 10;
    return 5;
}

// ======================================================
// LEGACY USER MIGRATION (one-time, non-destructive)
// ------------------------------------------------------
// Purane default/hardcoded accounts (Owner/Cashier/etc.)
// DELETE nahi karte — sirf DISABLE karte hain taake login
// screen se gayab ho jayen aur unka historical audit/
// references salamat rahe. Nayi data delete nahi hoti.
// ======================================================

let legacyMigrationDone = false;

function disableLegacyDefaultUsers() {

    if (legacyMigrationDone) return;
    legacyMigrationDone = true;

    try {

        // Users jo na phone+password (naya system) rakhte hain
        // na manually banaye gaye — ye purane seeds hain.
        const legacySeeds = [
            "Cashier", "Saleman", "Salesman", "manager", "owner"
        ];

        const placeholders =
            legacySeeds.map(() => "?").join(", ");

        const rows = db.prepare(`
            SELECT id FROM users
            WHERE username COLLATE NOCASE IN (${placeholders})
              AND (phone IS NULL OR phone = '')
              AND (password_hash IS NULL OR password_hash = '')
        `).all(...legacySeeds);

        for (const u of rows) {
            // Disabled => login possible nahi. Plaintext PIN bhi saaf.
            db.prepare(`
                UPDATE users
                SET active = 0, pin = '', pin_hash = '', pin_hint = ''
                WHERE id = ?
            `).run(u.id);
        }

        // Also disable any owner-role users with no phone (incomplete setups)
        const staleOwners = db.prepare(`
            SELECT id FROM users
            WHERE role = 'owner'
              AND (phone IS NULL OR phone = '')
              AND active = 1
        `).all();

        for (const u of staleOwners) {
            db.prepare(`UPDATE users SET active = 0 WHERE id = ?`).run(u.id);
        }

        if (rows.length || staleOwners.length) {
            console.log(
                `[AUTH] ${rows.length + staleOwners.length} legacy/stale user(s) disabled. ` +
                `First-run account setup ab available hai.`
            );
        }

        // OTP/session maintenance
        auth.cleanupOldOtps(db);

    } catch (error) {
        console.error("Legacy user migration error:", error);
        legacyMigrationDone = false;
    }
}

// Kya koi verified account already exists?
function hasVerifiedAccount() {
    ensureAuthReady();
    try {
        const row = db.prepare(`
            SELECT COUNT(*) AS c FROM users
            WHERE active = 1
              AND phone_verified = 1
              AND phone IS NOT NULL AND phone != ''
              AND password_hash IS NOT NULL
              AND password_hash != ''
              AND role = 'owner'
        `).get();
        return Number(row.c) > 0;
    } catch (e) {
        return false;
    }
}

function buildSession(user) {

    return {
        id: user.id,
        username: String(user.username || "").trim(),
        full_name: user.full_name || user.username,
        role: String(user.role || "cashier").toLowerCase().trim(),
        rank: roleRank(user.role),
        permissions: getUserPermissions(user),
        is_primary: Number(user.is_primary || 0),
        phone: user.phone ? auth.maskPhone(user.phone) : "",
        password_hash: user.password_hash || "",
        function_password: user.function_password || "",
        login_time: new Date().toISOString()
    };
}

function failLoginDelay() {
    return new Promise(resolve => setTimeout(resolve, 400));
}

function registerFailAttempt(user) {
    try {
        const fails = Number(user.failed_logins || 0) + 1;
        const lockUntil = fails >= 5
            ? new Date(Date.now() + 15 * 60 * 1000).toISOString()
            : null;
        db.prepare(`
            UPDATE users SET failed_logins = ?, locked_until = ?
            WHERE id = ?
        `).run(fails, lockUntil, user.id);
    } catch (e) { /* non-fatal */ }
}

function clearFailAttempts(userId) {
    try {
        db.prepare(`
            UPDATE users SET failed_logins = 0, locked_until = NULL
            WHERE id = ?
        `).run(userId);
    } catch (e) { /* non-fatal */ }
}

// SMS provider internet mangta hai ya nahi (console = offline OK)
function otpProviderNeedsInternet() {
    const p = String(auth.authConfig().provider || "console").toLowerCase();
    return p !== "console";
}

function safeParseJson(text, fallback) {
    try {
        const v = JSON.parse(text);
        return v && typeof v === "object" ? v : fallback;
    } catch (e) {
        return fallback;
    }
}

function getUserPermissions(user) {
    const base = ROLE_PERMISSIONS[String(user.role || "cashier").toLowerCase()]
        || ROLE_PERMISSIONS.cashier;

    const custom = safeParseJson(user.permissions, {});
    if (["owner", "admin"].includes(String(user.role || "").toLowerCase())) {
        return Object.assign({}, base, custom);
    }

    return Object.keys(base).reduce((permissions, key) => {
        permissions[key] = !!base[key] && custom[key] !== false;
        return permissions;
    }, {});
}

function logAudit(userId, username, action, entityType, entityId, oldValue, newValue) {
    try {
        db.prepare(`
            INSERT INTO audit_log
            (user_id, username, action, entity_type, entity_id, old_value, new_value)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
            userId || null,
            username || "system",
            String(action),
            entityType || null,
            entityId ? Number(entityId) : null,
            oldValue ? JSON.stringify(oldValue) : null,
            newValue ? JSON.stringify(newValue) : null
        );
    } catch (error) {
        // Audit logging must never break a business operation
        console.error("Audit log error:", error);
    }
}

// Permission gate: agar koi user mojood nahi (single-owner mode)
// to sab allowed. Users exist karte hain to session permission chahiye.
function canDo(permission) {
    try {
        const count = db.prepare(
            "SELECT COUNT(*) AS c FROM users WHERE active = 1"
        ).get().c;

        if (!count) return true;

        if (!currentSession) return false;
        if (!permission) return true;
        return !!currentSession.permissions[permission];
    } catch (error) {
        // Fail-open on infra errors so business never blocks unexpectedly
        return true;
    }
}

function permissionDenied() {
    return {
        success: false,
        error: "Permission denied. Your role is not allowed to perform this action."
    };
}

// Kya current session user (target) ko manage kar sakta hai?
// Owner -> sab; Manager/Admin -> sirf lower rank (cashier/salesman)
function canManageUser(targetUser) {

    if (!currentSession) {
        // No users mode me settings waise bhi open hai
        return canDo("settings");
    }

    if (!canDo("settings") && roleRank(currentSession.role) < 20) {
        return false;
    }

    // Apne aap ko "reset" se change karna allowed nahi
    // (apna PIN Change My PIN se hoga, old PIN ke sath)
    if (Number(targetUser.id) === Number(currentSession.id)) {
        return false;
    }

    return roleRank(currentSession.role) > roleRank(targetUser.role);
}


// ======================================================
// AUTH IPC v2
// Flow: Setup Status -> Send OTP -> Verify OTP ->
//       Create Password -> Account Created -> Login
// ------------------------------------------------------
// registerAuthHandler() channel ko register karta hai aur
// PRE-LOGIN channels ke ilawa HAR request par session
// check karta hai (requirement #8: backend par bhi guard).
// Aliased channels (preload/web-shim naming) same logic
// reuse karte hain.
// ======================================================

const _authHandlerImpls = {};

// PRE_LOGIN_CHANNELS is declared once near the top
// (GLOBAL BACKEND AUTH GUARD) so the IPC session guard and
// registerAuthHandler share the exact same set.

function registerAuthHandler(channel, impl) {

    _authHandlerImpls[channel] = impl;

    const wrapper = (event, payload) => {
        try {
            // Backend-level session guard: pre-login channels ke
            // siwa koi bhi call bina valid session ke reject hogi.
            if (!PRE_LOGIN_CHANNELS.has(channel) && !currentSession) {
                return {
                    success: false,
                    error: "Login required. Please login to continue."
                };
            }
            return impl(event, payload);
        } catch (err) {
            console.error(`Handler error [${channel}]:`, err);
            return { success: false, error: err.message };
        }
    };

    ipcMain.handle(channel, wrapper);
}

// handlers_get function removed - using aliasAuthHandler instead

function aliasAuthHandler(aliasChannel, targetChannel) {
    const impl = (event, data) => _authHandlerImpls[targetChannel](event, data);
    registerAuthHandler(aliasChannel, impl);
}

registerAuthHandler("setup-status", () => {

    ensureAuthReady();
    disableLegacyDefaultUsers();
    return { success: true, account_exists: hasVerifiedAccount() };
});

// STEP 1: Phone par OTP bhejo (account setup ke liye)
registerAuthHandler("request-setup-otp", async (event, data) => {

    ensureAuthReady();
    disableLegacyDefaultUsers();

    try {

        const fullName = String(data?.full_name || "").trim();

        if (!fullName || fullName.length < 3) {
            return { success: false, error: "Full Name is required." };
        }

        const phone = String(data?.phone || "").trim();
        if (!auth.isValidPhone(phone)) {
            return {
                success: false,
                error:
                    "Enter a valid Pakistani mobile number " +
                    "in 03XX-XXXXXXX format."
            };
        }

        // Duplicate account check
        const norm = auth.normalizePhone(phone);
        const existing = db.prepare(`
            SELECT id FROM users
            WHERE phone = ? AND active = 1 AND phone_verified = 1
        `).get(norm);

        if (existing) {
            return {
                success: false,
                error:
                    "This phone number is already registered. " +
                    "Please use Forgot Password on the login screen."
            };
        }

        // Internet sirf SMS bhejne ke liye chahiye
        if (otpProviderNeedsInternet()) {
            const online = await auth.internetAvailable();
            if (!online) {
                return {
                    success: false,
                    error:
                        "Internet connection is required to verify your " +
                        "phone number. Please connect to the internet " +
                        "and try again."
                };
            }
        }

        const result = await auth.issueOtp(db, "account_setup", norm);
        if (!result.success) return result;

        logAudit(null, fullName, "setup_otp_sent",
            "user", null, null, { phone: auth.maskPhone(norm) });

        return {
            success: true,
            message: `OTP sent to ${auth.maskPhone(norm)}.`
        };

    } catch (error) {
        console.error("Request setup otp error:", error);
        return { success: false, error: error.message };
    }
});

// STEP 2: OTP verify karo (single-use token milta hai)
registerAuthHandler("verify-setup-otp", (event, data) => {

    ensureAuthReady();

    try {

        const result = auth.verifyOtpCode(
            db, "account_setup", data?.phone, data?.otp);

        if (!result.success) {
            logAudit(null, "", "setup_otp_failed",
                "user", null, null,
                { phone: auth.maskPhone(data?.phone) });
            return result;
        }

        return { success: true, verify_token: result.verify_token };

    } catch (error) {
        console.error("Verify setup otp error:", error);
        return { success: false, error: error.message };
    }
});

// STEP 3: Password set karke account FINAL create karo
registerAuthHandler("complete-account-setup", (event, data) => {

    ensureAuthReady();
    disableLegacyDefaultUsers();

    try {
        const fullName = String(data?.full_name || "").trim();
        const phoneRaw = String(data?.phone || "").trim();

        if (!fullName || !auth.isValidPhone(phoneRaw)) {
            return {
                success: false,
                error: "Invalid details. Please restart account setup."
            };
        }

        const norm = auth.normalizePhone(phoneRaw);

        const password = String(data?.password || "");
        const confirm = String(data?.confirm_password || "");
        const functionPassword = String(data?.function_password || "").trim();
        const minLength =
            Number(auth.authConfig().min_password_length) || 6;

        if (password !== confirm) {
            return { success: false, error: "Passwords do not match." };
        }

        if (!auth.passwordStrengthOk(password, minLength)) {
            return {
                success: false,
                error: `Password must be at least ${minLength} characters ` +
                       `and contain both letters and numbers.`
            };
        }

        if (!/^\d{4,8}$/.test(functionPassword)) {
            return {
                success: false,
                error: "System function password must be 4 to 8 digits only."
            };
        }

        // The first owner uses the legacy primary store. Every later owner
        // receives a separate fresh store so owner data never crosses accounts.
        if (hasVerifiedAccount()) {
            db.addBusiness(`${fullName}'s Store`, { phone: norm });
            ensureAuthReady();
        }

        // Username unique-safe derive karo without changing existing users or data.
        let username = fullName.replace(/\s+/g, " ").trim();
        const taken = db.prepare(`
            SELECT id FROM users WHERE username = ? COLLATE NOCASE
        `).get(username);
        if (taken) username = username + " (" + norm.slice(-4) + ")";

        const result = db.prepare(`
            INSERT INTO users
                (username, pin, full_name, role, permissions,
                 function_password, active, phone, password_hash, phone_verified,
                 failed_logins, is_primary)
            VALUES (?, '', ?, 'owner', '{}', ?, 1, ?, ?, 1, 0, 1)
        `).run(username, fullName, auth.hashFunctionPassword(functionPassword), norm, auth.hashPassword(password));

        const userId = Number(result.lastInsertRowid);

        // Clear any old session file and create fresh session
        auth.clearSessionFile();
        const sess = auth.createSessionToken(db, userId);
        auth.writeSessionFile(sess.token, db.getActiveBusiness()?.file);

        currentSession = buildSession(db.prepare(
            `SELECT * FROM users WHERE id = ?`).get(userId));

        db.assignActiveBusinessUser([norm, username]);

        clearFailAttempts(userId);

        logAudit(userId, username, "owner_account_created",
            "user", userId, null,
            { phone: auth.maskPhone(norm), role: "owner" });

        // Registration must be durable before the success response is sent.
        db.saveNow();

        return { success: true, user: currentSession };

    } catch (error) {
        console.error("Complete account setup error:", error);
        return { success: false, error: error.message };
    }
});

// ======================================================
// FORGOT PASSWORD FLOW (OTP mandatory)
// ======================================================

// ------------------------------------------------------
// IPC CHANNEL ALIASES
// preload.js / web-shim.js channels ke naam is tarah map
// karo jaise upar defined handlers hain (single source of
// truth wahi handlers hain, yeh sirf naam ka Jori hai).
// ------------------------------------------------------

// These channels are now handled via aliasAuthHandler below
// to avoid duplicate registration errors


registerAuthHandler("request-reset-otp", async (event, data) => {

    ensureAuthReady();

    try {

        const phone = String(data?.phone || "").trim();
        if (!auth.isValidPhone(phone)) {
            return {
                success: false,
                error:
                    "Enter a valid Pakistani mobile number " +
                    "in 03XX-XXXXXXX format."
            };
        }

        const norm = auth.normalizePhone(phone);
        const user = db.prepare(`
            SELECT id FROM users
            WHERE phone = ? AND active = 1
              AND phone_verified = 1 AND password_hash != ''
        `).get(norm);

        if (!user) {
            return {
                success: false,
                error: "No verified account found for this phone number."
            };
        }

        if (otpProviderNeedsInternet()) {
            const online = await auth.internetAvailable();
            if (!online) {
                return {
                    success: false,
                    error:
                        "Internet connection is required to verify your " +
                        "phone number. Please connect to the internet " +
                        "and try again."
                };
            }
        }

        const result = await auth.issueOtp(db, "password_reset", norm);
        if (!result.success) return result;

        logAudit(user.id, "", "reset_otp_sent",
            "user", user.id, null, { phone: auth.maskPhone(norm) });

        return { success: true, message: `OTP sent to ${auth.maskPhone(norm)}.` };

    } catch (error) {
        console.error("Request reset otp error:", error);
        return { success: false, error: error.message };
    }
});

registerAuthHandler("verify-reset-otp", (event, data) => {

    ensureAuthReady();

    try {
        const result = auth.verifyOtpCode(
            db, "password_reset", data?.phone, data?.otp);

        if (!result.success) {
            logAudit(null, "", "reset_otp_failed",
                "user", null, null,
                { phone: auth.maskPhone(data?.phone) });
        }

        return result;

    } catch (error) {
        console.error("Verify reset otp error:", error);
        return { success: false, error: error.message };
    }
});

registerAuthHandler("complete-password-reset", (event, data) => {

    ensureAuthReady();

    try {

        const phoneRaw = String(data?.phone || "").trim();
        const password = String(data?.password || "");
        const confirm = String(data?.confirm_password || "");

        const minLength =
            Number(auth.authConfig().min_password_length) || 6;

        if (password !== confirm) {
            return { success: false, error: "Passwords do not match." };
        }

        if (!auth.passwordStrengthOk(password, minLength)) {
            return {
                success: false,
                error: `Password must be at least ${minLength} characters ` +
                       `and contain both letters and numbers.`
            };
        }

        const consumed = auth.consumeVerifyToken(
            db, "password_reset", phoneRaw,
            String(data?.verify_token || ""));

        if (!consumed.success) return consumed;

        const norm = auth.normalizePhone(phoneRaw);
        const user = db.prepare(`
            SELECT * FROM users
            WHERE phone = ? AND active = 1 AND phone_verified = 1
        `).get(norm);

        if (!user) {
            return {
                success: false,
                error: "Account not found."
            };
        }

        db.prepare(`
            UPDATE users SET password_hash = ? WHERE id = ?
        `).run(auth.hashPassword(password), user.id);

        // Security: purane sessions revoke karo
        auth.revokeSessionsForUser(db, user.id);
        auth.clearSessionFile();
        currentSession = null;

        clearFailAttempts(user.id);

        logAudit(user.id, user.username, "password_reset_completed",
            "user", user.id, null, {});

        return { success: true, message: "Password changed successfully." };

    } catch (error) {
        console.error("Complete password reset error:", error);
        return { success: false, error: error.message };
    }
});

// ======================================================
// NORMAL LOGIN (har dafa OTP nahi chahiye)
// Identifier: Phone number (03XX-XXXXXXX) ya Username
// ======================================================

registerAuthHandler("login", async (event, data) => {

    ensureAuthReady();
    disableLegacyDefaultUsers();

    try {

        const identifier =
            String(data?.identifier ?? data?.username ?? "").trim();

        const password = String(data?.password ?? "");

        if (!identifier || !password) {
            return {
                success: false,
                error:
                    "Phone number and password are required."
            };
        }

        const normalizedIdentifier = auth.isValidPhone(identifier)
            ? auth.normalizePhone(identifier)
            : identifier.toLowerCase();
        const mappedBusiness = db.getBusinessForUser(normalizedIdentifier);
        const activeBusiness = db.getActiveBusiness();
        const loginIdentifiers = [normalizedIdentifier, identifier];
        const accessibleBusinesses = db.getBusinessesForUser(loginIdentifiers).businesses;
        const sourceUser = accessibleBusinesses
            .map(business => db.getUserFromBusiness(business.id, loginIdentifiers))
            .find(Boolean);

        if (mappedBusiness && activeBusiness &&
            mappedBusiness.id !== activeBusiness.id) {
            db.switchBusiness(mappedBusiness.id);
            ensureAuthReady();
            ensureCurrentUserOnActiveBusiness(sourceUser);
        } else if (mappedBusiness && activeBusiness && sourceUser) {
            const activeUser = auth.isValidPhone(identifier)
                ? db.prepare("SELECT id FROM users WHERE phone = ? AND active = 1").get(normalizedIdentifier)
                : db.prepare("SELECT id FROM users WHERE username = ? COLLATE NOCASE AND active = 1").get(identifier);
            if (!activeUser) ensureCurrentUserOnActiveBusiness(sourceUser);
        }

        // Phone ya username dono se dhoondo
        let user = null;
        if (auth.isValidPhone(identifier)) {
            user = db.prepare(`
                SELECT * FROM users
                WHERE phone = ? AND active = 1
            `).get(auth.normalizePhone(identifier));
        } else {
            user = db.prepare(`
                SELECT * FROM users
                WHERE username = ? COLLATE NOCASE AND active = 1
            `).get(identifier);
        }

        const failMsg = "Invalid credentials.";

        if (!user) {
            await failLoginDelay();
            logAudit(null, identifier, "login_failed",
                "user", null, null, { reason: "unknown_user" });
            return { success: false, error: failMsg };
        }

        // Account lockout check (5 failed attempts => 15 min)
        if (user.locked_until &&
            new Date(user.locked_until).getTime() > Date.now()) {
            return {
                success: false,
                error:
                    "Account temporarily locked due to multiple failed " +
                    "attempts. Try again after 15 minutes or use " +
                    "Forgot Password."
            };
        }

        // Password verify (scrypt, timing-safe)
        const ok =
            user.password_hash &&
            auth.verifyPassword(password, user.password_hash);

        if (!ok) {
            registerFailAttempt(user);
            await failLoginDelay();
            logAudit(user.id, user.username, "login_failed",
                "user", user.id, null, { reason: "wrong_password" });
            return { success: false, error: failMsg };
        }

        if (!Number(user.phone_verified)) {
            return {
                success: false,
                error:
                    "This account is not enabled for password login. " +
                    "Please ask the Owner to reset your access from " +
                    "Manage Users."
            };
        }

        clearFailAttempts(user.id);

        currentSession = buildSession(user);

        // Restart par logged-in rehne ke liye persistent session
        try {
            const sess = auth.createSessionToken(db, user.id);
            auth.writeSessionFile(sess.token, db.getActiveBusiness()?.file);
        } catch (e) {
            console.error("Session persist error:", e.message);
        }

        logAudit(user.id, user.username, "login", "user", user.id);

        return { success: true, user: currentSession };

    } catch (error) {
        console.error("Login error:", error);
        return { success: false, error: error.message };
    }
});

// App restart ke baad saved session wapis restore karo
registerAuthHandler("restore-session", () => {

    ensureAuthReady();

    try {

        if (currentSession) {
            return { success: true, user: currentSession };
        }

        const saved = auth.readSessionFile();
        if (!saved || !saved.token) {
            return { success: false };
        }

        if (saved.business_file) {
            const businesses = db.getBusinesses().businesses || [];
            const savedBusiness = businesses.find(
                (business) => business.file === saved.business_file
            );
            const activeBusiness = db.getActiveBusiness();
            if (savedBusiness && activeBusiness?.id !== savedBusiness.id) {
                db.switchBusiness(savedBusiness.id);
                ensureAuthReady();
            }
        }

        const row = db.prepare(`
            SELECT s.user_id FROM sessions s
            WHERE s.token_hash = ? AND s.revoked = 0
              AND s.expires_at > ?
        `).get(
            auth.sha256(saved.token),
            new Date().toISOString()
        );

        if (!row) {
            auth.clearSessionFile();
            return { success: false };
        }

        const user = db.prepare(`
            SELECT * FROM users WHERE id = ? AND active = 1
        `).get(row.user_id);

        if (!user || !Number(user.phone_verified)) {
            auth.clearSessionFile();
            return { success: false };
        }

        currentSession = buildSession(user);
        return { success: true, user: currentSession };

    } catch (error) {
        console.error("Restore session error:", error);
        return { success: false };
    }
});

registerAuthHandler("logout", () => {

    ensureAuthReady();

    if (currentSession) {
        logAudit(currentSession.id, currentSession.username,
            "logout", "user", currentSession.id);

        // Session revoke (security best practice)
        try {
            auth.revokeSessionsForUser(db, currentSession.id);
        } catch (e) { /* non-fatal */ }
    }

    currentSession = null;
    auth.clearSessionFile();

    return { success: true };
});

registerAuthHandler("verify-function-password", (event, data) => {
    ensureAuthReady();

    try {
        if (!currentSession) {
            return { success: false, error: "Login required." };
        }

        const password = String(data?.password ?? "").trim();
        if (!/^\d{4,8}$/.test(password)) {
            return {
                success: false,
                error: "System function password must be 4 to 8 digits only."
            };
        }

        const user = db.prepare(`
            SELECT function_password FROM users WHERE id = ?
        `).get(currentSession.id);

        if (!user || !user.function_password) {
            return {
                success: false,
                error: "System function password is not set for this account."
            };
        }

        const ok = auth.verifyFunctionPassword(password, user.function_password);

        return {
            success: ok,
            error: ok ? undefined : "Incorrect system function password."
        };

    } catch (error) {
        console.error("Verify function password error:", error);
        return { success: false, error: error.message };
    }
});

// [AUTH-PART-F]

// ------------------------------------------------------
// Preload/web-shim ki naye naam wali channels ko
// internal channels par map karo
// ------------------------------------------------------
aliasAuthHandler("check-account-exists", "setup-status");
aliasAuthHandler("setup-send-otp", "request-setup-otp");
aliasAuthHandler("setup-verify-otp", "verify-setup-otp");
aliasAuthHandler("create-owner-account", "complete-account-setup");
aliasAuthHandler("forgot-send-otp", "request-reset-otp");

// Koi bhi naya auth channel idhar register karo -
// session guard automatic lag jayega.
registerAuthHandler("get-current-user", () => {
    return { success: true, user: currentSession };
});

// ======================================================
// USER MANAGEMENT IPC
// ======================================================

ipcMain.handle("get-users", () => {
    try {
        const users = db.prepare(`
            SELECT id, username, full_name, phone, role, permissions, active, created_at
            FROM users
            ORDER BY id ASC
        `).all();

        return { success: true, users };
    } catch (error) {
        console.error("Get users error:", error);
        return { success: false, error: error.message, users: [] };
    }
});

ipcMain.handle("save-user", (event, data) => {
    try {
        if (!canDo("settings")) {
            return permissionDenied();
        }

        const phone = String(data?.phone || "").trim();
        const password = String(data?.password || "").trim();
        const functionPassword = String(data?.function_password || "").trim();
        const role = String(data?.role || "cashier").trim().toLowerCase();

        if (!auth.isValidPhone(phone)) {
            return { success: false, error: "A valid Pakistani phone number is required." };
        }

        const normalizedPhone = auth.normalizePhone(phone);
        const username = String(data?.username || `user_${normalizedPhone}`).trim();
        const minLength =
            Number(auth.authConfig().min_password_length) || 6;
        if (!auth.passwordStrengthOk(password, minLength)) {
            return {
                success: false,
                error: `Password must be at least ${minLength} characters ` +
                       `and contain both letters and numbers.`
            };
        }
        if (!/^\d{4,8}$/.test(functionPassword)) {
            return { success: false, error: "System function password must be 4 to 8 digits only." };
        }
        if (!ROLE_PERMISSIONS[role]) {
            return { success: false, error: "Invalid role." };
        }

        // Sirf Owner hi staff accounts bana sakta hai
        if (String(currentSession?.role || "") !== "owner" &&
            roleRank(currentSession?.role || "") < 30) {
            return {
                success: false,
                error:
                    "Only the Owner (or Admin) can create staff accounts."
            };
        }

        const exists = db.prepare(`
            SELECT id FROM users WHERE username = ?
        `).get(username);

        if (exists) {
            return { success: false, error: "Username already exists." };
        }

        const phoneExists = db.prepare(`
            SELECT id FROM users WHERE phone = ?
        `).get(normalizedPhone);

        if (phoneExists) {
            return { success: false, error: "Phone number already belongs to another user." };
        }

        const result = db.prepare(`
            INSERT INTO users
            (username, pin, full_name, role, permissions,
             function_password, active, phone, phone_verified, failed_logins, is_primary)
            VALUES (?, '', ?, ?, '{}', ?, 1, ?, 1, 0, 0)
        `).run(
            username,
            String(data?.full_name || username),
            role,
            auth.hashFunctionPassword(functionPassword),
            normalizedPhone
        );

        // Password hash store karo (plain kabhi nahi)
        db.prepare(`
            UPDATE users SET password_hash = ? WHERE id = ?
        `).run(
            auth.hashPassword(password),
            Number(result.lastInsertRowid)
        );

        const userId = Number(result.lastInsertRowid);

        logAudit(
            currentSession?.id, currentSession?.username,
            "user_created", "user", userId,
            null, { username, phone: auth.maskPhone(phone), role }
        );

        return { success: true, id: userId };
    } catch (error) {
        console.error("Save user error:", error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle("update-user", (event, data) => {
    try {
        if (!canDo("settings")) {
            return permissionDenied();
        }

        // Role/permission changes sirf Owner (ya Admin) hi kar sakta hai
        if (String(currentSession?.role || "") !== "owner" &&
            roleRank(currentSession?.role || "") < 30) {
            return {
                success: false,
                error: "Only the Owner (or Admin) can modify user roles."
            };
        }

        const id = Number(data?.id || 0);
        if (!id) {
            return { success: false, error: "Invalid user ID." };
        }

        const existing = db.prepare(`SELECT * FROM users WHERE id = ?`).get(id);
        if (!existing) {
            return { success: false, error: "User not found." };
        }

        const role = String(data.role || existing.role).trim().toLowerCase();
        if (!ROLE_PERMISSIONS[role]) {
            return { success: false, error: "Invalid role." };
        }

        let phone = existing.phone || "";
        if (data.phone !== undefined) {
            phone = String(data.phone || "").trim();
            if (!auth.isValidPhone(phone)) {
                return { success: false, error: "A valid Pakistani phone number is required." };
            }
            phone = auth.normalizePhone(phone);
            const phoneExists = db.prepare(`
                SELECT id FROM users WHERE phone = ? AND id != ?
            `).get(phone, id);
            if (phoneExists) {
                return { success: false, error: "Phone number already belongs to another user." };
            }
        }

        let permissions = existing.permissions;
        if (data && typeof data.permissions === "object" && data.permissions !== null) {
            permissions = JSON.stringify(
                Object.assign({}, getUserPermissions(existing), data.permissions)
            );
        }

        // Password reset (sirf authorized higher-rank user hi kar sakta hai)
        let passwordHash = existing.password_hash;

        if (String(data.password || "").trim()) {

            if (!canManageUser(existing)) {
                return {
                    success: false,
                    error:
                        "You are not allowed to change this user's password."
                };
            }

            const minLength =
                Number(auth.authConfig().min_password_length) || 6;
            if (!auth.passwordStrengthOk(
                    String(data.password).trim(), minLength)) {
                return {
                    success: false,
                    error: `Password must be at least ${minLength} ` +
                           `characters and contain both letters and numbers.`
                };
            }

            passwordHash = auth.hashPassword(String(data.password).trim());
        }

        db.prepare(`
            UPDATE users
            SET full_name = ?, role = ?, permissions = ?,
                password_hash = ?, active = ?, phone = ?
            WHERE id = ?
        `).run(
            String(data.full_name || existing.full_name || existing.username),
            role,
            permissions,
            passwordHash,
            data.active === undefined ? Number(existing.active) : (data.active ? 1 : 0),
            phone,
            id
        );

        logAudit(
            currentSession?.id, currentSession?.username,
            "user_updated", "user", id,
            { role: existing.role, active: Number(existing.active) },
            { role, active: data.active === undefined ? Number(existing.active) : (data.active ? 1 : 0) }
        );

        return { success: true };
    } catch (error) {
        console.error("Update user error:", error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle("delete-user", (event, userId) => {
    try {
        if (!canDo("settings")) {
            return permissionDenied();
        }

        const id = Number(userId);
        if (!id) {
            return { success: false, error: "Invalid user ID." };
        }

        const count = db.prepare(`SELECT COUNT(*) AS c FROM users`).get().c;
        if (count <= 1) {
            return { success: false, error: "Cannot delete the last user." };
        }

        const existing = db.prepare(`SELECT * FROM users WHERE id = ?`).get(id);
        if (!existing) {
            return { success: false, error: "User not found." };
        }

        // Primary/Owner account delete na ho jab tak koi
        // doosra verified primary account mojood na ho
        if (Number(existing.is_primary)) {
            const otherPrimary = db.prepare(`
                SELECT COUNT(*) AS c FROM users
                WHERE is_primary = 1 AND id != ? AND active = 1
                  AND phone_verified = 1 AND password_hash != ''
            `).get(id).c;
            if (!otherPrimary) {
                return {
                    success: false,
                    error:
                        "Cannot delete the primary Owner account. Create " +
                        "another verified Owner first."
                };
            }
        }

        db.prepare(`DELETE FROM users WHERE id = ?`).run(id);

        // Uske sessions bhi revoke kar do
        try { auth.revokeSessionsForUser(db, id); } catch (e) {}

        logAudit(
            currentSession?.id, currentSession?.username,
            "user_deleted", "user", id,
            { username: existing.username }, null
        );

        return { success: true };
    } catch (error) {
        console.error("Delete user error:", error);
        return { success: false, error: error.message };
    }
});

// ======================================================
// PIN MANAGEMENT (secure, hashed)
// ======================================================

// Apna PIN change karna — old PIN MANDATORY
ipcMain.handle("change-own-pin", (event, data) => {

    try {

        if (!currentSession) {
            return { success: false, error: "Login required." };
        }

        const oldPassword =
            String(data?.old_password ?? data?.old_pin ?? "");
        const newPassword =
            String(data?.new_password ?? data?.new_pin ?? "");

        const minLength =
            Number(auth.authConfig().min_password_length) || 6;

        if (!auth.passwordStrengthOk(newPassword, minLength)) {
            return {
                success: false,
                error: `New password must be at least ${minLength} ` +
                       `characters and contain both letters and numbers.`
            };
        }

        const user = db.prepare(`
            SELECT * FROM users WHERE id = ?
        `).get(currentSession.id);

        if (!user) {
            return { success: false, error: "User not found." };
        }

        // Old password verify — ghalat ho to reject
        if (!auth.verifyPassword(oldPassword, user.password_hash)) {
            return { success: false, error: "Current password is incorrect." };
        }

        db.prepare(`
            UPDATE users SET password_hash = ? WHERE id = ?
        `).run(auth.hashPassword(newPassword), user.id);

        logAudit(
            user.id, user.username,
            "password_changed", "user", user.id,
            null, { self: true }
        );

        return { success: true };

    } catch (error) {
        console.error("Change own pin error:", error);
        return { success: false, error: error.message };
    }
});

// Admin/Manager/Owner reset — old PIN ki zaroorat NAHI
// lekin hierarchy enforce hoti hai:
//   Owner  -> sab reset kar sakta hai
//   Manager-> sirf Cashier/Salesman
ipcMain.handle("reset-user-pin", (event, data) => {

    try {

        if (!currentSession) {
            return { success: false, error: "Login required." };
        }

        const targetId = Number(data?.user_id || 0);
        const newPassword = String(data?.new_password ?? data?.new_pin ?? "").trim();

        const minLength =
            Number(auth.authConfig().min_password_length) || 6;

        if (!auth.passwordStrengthOk(newPassword, minLength)) {
            return {
                success: false,
                error: `New password must be at least ${minLength} ` +
                       `characters and contain both letters and numbers.`
            };
        }

        const target = db.prepare(`
            SELECT * FROM users WHERE id = ?
        `).get(targetId);

        if (!target) {
            return { success: false, error: "User not found." };
        }

        // Hierarchy check
        if (!canManageUser(target)) {
            return {
                success: false,
                error:
                    "You are not allowed to reset this user's PIN. " +
                    "(A Manager can only reset Cashier/Salesman PINs; " +
                    "the Owner can reset anyone's.)"
            };
        }

        // Reset — purana password foran invalid
        db.prepare(`
            UPDATE users SET password_hash = ? WHERE id = ?
        `).run(auth.hashPassword(newPassword), target.id);

        logAudit(
            currentSession.id, currentSession.username,
            "password_reset", "user", target.id,
            null, { target: target.username }
        );

        return { success: true };

    } catch (error) {
        console.error("Reset user pin error:", error);
        return { success: false, error: error.message };
    }
});

// Users list with hint visibility rules:
// Hint sirf un users ka dikhta hai jo current session
// manage kar sakta hai (rank-wise).
ipcMain.handle("get-users-managed", () => {

    try {

        const rows = db.prepare(`
            SELECT id, username, full_name, role, permissions,
                   active, created_at,
                   CASE WHEN phone IS NULL OR phone = ''
                        THEN '' ELSE phone END AS contact_phone
            FROM users ORDER BY
                CASE role
                    WHEN 'owner' THEN 1
                    WHEN 'admin' THEN 2
                    WHEN 'manager' THEN 3
                    ELSE 4
                END,
                username COLLATE NOCASE ASC
        `).all();

        const users = rows.map(u => {

            const canManage =
                currentSession &&
                Number(u.id) !== Number(currentSession.id) &&
                roleRank(currentSession.role) > roleRank(u.role);

            return {
                id: u.id,
                username: u.username,
                full_name: u.full_name,
                role: u.role,
                active: u.active,
                created_at: u.created_at,
                // PIN hints removed (security) - password model par hai ab
                pin_hint: "",
                phone: auth.maskPhone(u.contact_phone || "")
            };

        });

        return { success: true, users };

    } catch (error) {
        console.error("Get managed users error:", error);
        return { success: false, error: error.message, users: [] };
    }
});

// ======================================================
// AUDIT LOG VIEWER (PHASE 6)
// ======================================================

ipcMain.handle("get-audit-log", (event, filters) => {
    try {
        const f = filters || {};
        const conditions = [];
        const params = [];

        if (f.from_date) {
            conditions.push("date(created_at) >= date(?)");
            params.push(String(f.from_date));
        }
        if (f.to_date) {
            conditions.push("date(created_at) <= date(?)");
            params.push(String(f.to_date));
        }
        if (f.action) {
            conditions.push("action LIKE ?");
            params.push(`%${String(f.action)}%`);
        }
        if (f.username) {
            conditions.push("username LIKE ?");
            params.push(`%${String(f.username)}%`);
        }

        const whereSql = conditions.length
            ? `WHERE ${conditions.join(" AND ")}`
            : "";

        const limit = Math.min(Number(f.limit) || 200, 1000);

        const rows = db.prepare(`
            SELECT *
            FROM audit_log
            ${whereSql}
            ORDER BY id DESC
            LIMIT ${limit}
        `).all(...params);

        return { success: true, entries: rows };
    } catch (error) {
        console.error("Audit log error:", error);
        return { success: false, error: error.message, entries: [] };
    }
});

// ======================================================
// DAY CLOSING (PHASE 6)
// ======================================================

ipcMain.handle("get-day-close-summary", (event, filters) => {
    try {
        const f = filters || {};
        const businessDate = String(f.date || new Date().toISOString().slice(0, 10));

        const sales = db.prepare(`
            SELECT
                COALESCE(SUM(total), 0) AS total_sales,
                COALESCE(SUM(CASE WHEN payment_method = 'Cash' THEN total ELSE 0 END), 0) AS cash_sales,
                COALESCE(SUM(CASE WHEN payment_method = 'Bank' THEN total ELSE 0 END), 0) AS bank_sales,
                COALESCE(SUM(CASE WHEN payment_method NOT IN ('Cash','Bank') THEN total ELSE 0 END), 0) AS credit_sales
            FROM sales
            WHERE date(created_at) = date(?)
              AND status != 'void'
        `).get(businessDate);

        const returns = db.prepare(`
            SELECT COALESCE(SUM(total), 0) AS total_returns
            FROM sale_returns
            WHERE date(created_at) = date(?)
        `).get(businessDate);

        const purchases = db.prepare(`
            SELECT COALESCE(SUM(total), 0) AS total_purchases
            FROM purchases
            WHERE date(created_at) = date(?)
              AND status != 'void'
        `).get(businessDate);

        const expenses = db.prepare(`
            SELECT COALESCE(SUM(amount), 0) AS total_expenses
            FROM expenses
            WHERE date(created_at) = date(?)
        `).get(businessDate);

        const cashReceived = db.prepare(`
            SELECT COALESCE(SUM(amount), 0) AS amt
            FROM payments
            WHERE date(created_at) = date(?)
        `).get(businessDate);

        const alreadyClosed = db.prepare(`
            SELECT * FROM day_close WHERE business_date = date(?)
        `).get(businessDate);

        return {
            success: true,
            summary: {
                business_date: businessDate,
                total_sales: Number(sales.total_sales) || 0,
                cash_sales: Number(sales.cash_sales) || 0,
                bank_sales: Number(sales.bank_sales) || 0,
                credit_sales: Number(sales.credit_sales) || 0,
                total_returns: Number(returns.total_returns) || 0,
                total_purchases: Number(purchases.total_purchases) || 0,
                total_expenses: Number(expenses.total_expenses) || 0,
                cash_received: Number(cashReceived.amt) || 0,
                closed: !!alreadyClosed,
                close_record: alreadyClosed || null
            }
        };
    } catch (error) {
        console.error("Day close summary error:", error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle("save-day-close", (event, data) => {
    try {
        const businessDate = String(data?.business_date || new Date().toISOString().slice(0, 10));

        const sales = db.prepare(`
            SELECT
                COALESCE(SUM(total), 0) AS total_sales,
                COALESCE(SUM(CASE WHEN payment_method = 'Cash' THEN total ELSE 0 END), 0) AS cash_sales,
                COALESCE(SUM(CASE WHEN payment_method = 'Bank' THEN total ELSE 0 END), 0) AS bank_sales,
                COALESCE(SUM(CASE WHEN payment_method NOT IN ('Cash','Bank') THEN total ELSE 0 END), 0) AS credit_sales
            FROM sales
            WHERE date(created_at) = date(?)
              AND status != 'void'
        `).get(businessDate);

        const returns = db.prepare(`
            SELECT COALESCE(SUM(total), 0) AS t FROM sale_returns
            WHERE date(created_at) = date(?)
        `).get(businessDate);

        const purchases = db.prepare(`
            SELECT COALESCE(SUM(total), 0) AS t FROM purchases
            WHERE date(created_at) = date(?) AND status != 'void'
        `).get(businessDate);

        const expenses = db.prepare(`
            SELECT COALESCE(SUM(amount), 0) AS t FROM expenses
            WHERE date(created_at) = date(?)
        `).get(businessDate);

        const cashIn = db.prepare(`
            SELECT COALESCE(SUM(amount), 0) AS amt FROM payments
            WHERE date(created_at) = date(?) AND type IN ('receive', 'payment_in', 'Receive')
        `).get(businessDate);

        const cashOut = db.prepare(`
            SELECT COALESCE(SUM(amount), 0) AS amt FROM payments
            WHERE date(created_at) = date(?) AND type IN ('pay', 'payment_out', 'Pay')
        `).get(businessDate);

        const expenseCash = db.prepare(`
            SELECT COALESCE(SUM(amount), 0) AS amt FROM expenses
            WHERE date(created_at) = date(?) AND payment_method = 'Cash'
        `).get(businessDate);

        const actualCash = Number(data?.actual_cash ?? 0);

        // Expected cash today = cash sales + cash received - cash paid out
        // - cash expenses. Purchases already reduce via payments/paid amounts.
        const expectedCash =
            (Number(sales.cash_sales) || 0) +
            (Number(cashIn.amt) || 0) -
            (Number(cashOut.amt) || 0) -
            (Number(expenseCash.amt) || 0);

        const diff = actualCash - expectedCash;

        db.prepare(`
            INSERT INTO day_close
            (
                business_date, total_sales, cash_sales, bank_sales, credit_sales,
                total_returns, total_purchases, total_expenses,
                cash_received, cash_paid, expected_cash, actual_cash,
                cash_difference, note, user_id, username
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(business_date) DO UPDATE SET
                total_sales = excluded.total_sales,
                cash_sales = excluded.cash_sales,
                bank_sales = excluded.bank_sales,
                credit_sales = excluded.credit_sales,
                total_returns = excluded.total_returns,
                total_purchases = excluded.total_purchases,
                total_expenses = excluded.total_expenses,
                cash_received = excluded.cash_received,
                cash_paid = excluded.cash_paid,
                expected_cash = excluded.expected_cash,
                actual_cash = excluded.actual_cash,
                cash_difference = excluded.cash_difference,
                note = excluded.note,
                user_id = excluded.user_id,
                username = excluded.username
        `).run(
            businessDate,
            Number(sales.total_sales) || 0,
            Number(sales.cash_sales) || 0,
            Number(sales.bank_sales) || 0,
            Number(sales.credit_sales) || 0,
            Number(returns.t) || 0,
            Number(purchases.t) || 0,
            Number(expenses.t) || 0,
            Number(cashIn.amt) || 0,
            Number(cashOut.amt) || 0,
            expectedCash,
            actualCash,
            diff,
            data?.note || "",
            currentSession?.id || null,
            currentSession?.username || "system"
        );

        logAudit(
            currentSession?.id, currentSession?.username,
            "day_closed", "day_close", null,
            null, { business_date: businessDate, actual_cash: actualCash, difference: diff }
        );

        return { success: true, expected_cash: expectedCash, difference: diff };
    } catch (error) {
        console.error("Save day close error:", error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle("get-day-closes", (event, filters) => {
    try {
        const f = filters || {};
        const rows = db.prepare(`
            SELECT * FROM day_close
            ORDER BY business_date DESC
            LIMIT ?
        `).all(Math.min(Number(f.limit) || 60, 365));

        return { success: true, records: rows };
    } catch (error) {
        console.error("Get day closes error:", error);
        return { success: false, error: error.message, records: [] };
    }
});

// ======================================================
// DASHBOARD CARD DETAIL (+ actions data) 
// Har card ke neeche ki asal records
// ======================================================

ipcMain.handle("get-card-detail", (event, cardType) => {
    try {
        const today = "DATE('now', 'localtime')";
        const type = String(cardType || "");

        if (type === "sales") {
            const rows = db.prepare(`
                SELECT sales.id, sales.invoice_no, sales.party_id,
                       COALESCE(
                           NULLIF(CASE
                               WHEN parties.id IS NOT NULL
                                    AND LOWER(TRIM(COALESCE(sales.customer_name, ''))) IN ('walk-in', 'walk-in customer', 'walk-in supplier')
                               THEN ''
                               ELSE TRIM(COALESCE(sales.customer_name, ''))
                           END, ''),
                           parties.name,
                           'Walk-In Customer'
                       ) || CASE WHEN LOWER(COALESCE(sales.pricing_mode, 'retail')) = 'wholesale'
                                 THEN ' (Wholesale)' ELSE '' END AS customer,
                       sales.total, sales.paid AS paid, sales.due, sales.payment_method, sales.status, sales.created_at
                FROM sales
                LEFT JOIN parties ON parties.id = sales.party_id
                                WHERE DATE(sales.created_at, 'localtime') = ${today}
                  AND LOWER(COALESCE(sales.status, 'completed')) NOT IN ('void', 'cancelled')
                                ORDER BY sales.id DESC
            `).all();
            return { success: true, rows };
        }

        if (type === "returns") {
            const rows = db.prepare(`
                SELECT sr.id, sr.return_no, s.invoice_no,
                       (SELECT name FROM parties WHERE id = sr.party_id) AS customer,
                       sr.total, sr.payment_method, sr.created_at
                FROM sale_returns sr
                LEFT JOIN sales s ON s.id = sr.sale_id
                WHERE DATE(sr.created_at, 'localtime') = ${today}
                ORDER BY sr.id DESC
            `).all();
            return { success: true, rows };
        }

        if (type === "purchases") {
            const rows = db.prepare(`
                SELECT p.id, p.bill_no,
                       (SELECT name FROM parties WHERE id = p.party_id) AS supplier,
                       p.total, p.paid AS paid, p.due, p.payment_method, p.status, p.created_at
                FROM purchases p
                WHERE DATE(p.created_at, 'localtime') = ${today}
                  AND p.status != 'void'
                ORDER BY p.id DESC
            `).all();
            return { success: true, rows };
        }

        if (type === "transfers") {
            const rows = db.prepare(`
                SELECT id, type, amount, payment_method, note, created_at
                FROM payments
                WHERE type IN ('transfer_in', 'transfer_out')
                  AND DATE(created_at, 'localtime') = ${today}
                ORDER BY id DESC
            `).all();
            return { success: true, rows };
        }

        if (type === "receivables") {
            const rows = db.prepare(`
              SELECT sales.id, sales.invoice_no, sales.created_at,
                       COALESCE(NULLIF(TRIM(sales.customer_name), ''), parties.name, 'Walk-In Customer') AS customer,
                                             sales.total, sales.paid,
                                             MAX(sales.total - sales.paid - COALESCE(returns.returned_total, 0), 0) AS due,
                                             sales.payment_method, sales.status
                FROM sales
                LEFT JOIN parties ON parties.id = sales.party_id
                                LEFT JOIN (
                                        SELECT sale_id, SUM(total) AS returned_total
                                        FROM sale_returns
                                        GROUP BY sale_id
                                ) returns ON returns.sale_id = sales.id
                            WHERE LOWER(COALESCE(sales.status, 'completed')) NOT IN ('void', 'cancelled')
                                AND (sales.total - sales.paid - COALESCE(returns.returned_total, 0)) > 0
                ORDER BY sales.id DESC
            `).all();
            return { success: true, rows };
        }

        if (type === "payables") {
            const rows = db.prepare(`
                SELECT id, party_code, name, phone, balance
                FROM parties
                WHERE type = 'Supplier' AND balance > 0
                ORDER BY balance DESC
            `).all();
            return { success: true, rows };
        }

        if (type === "stock") {
            const rows = db.prepare(`
                SELECT id, item_code, name, stock, unit,
                       COALESCE(avg_cost, purchase_price, 0) AS cost,
                       sale_price,
                       ROUND(stock * COALESCE(avg_cost, purchase_price, 0), 2) AS value
                FROM items
                ORDER BY value DESC
            `).all();
            return { success: true, rows };
        }

        if (type === "cash") {
            // Cashbook jaisi hi entries — aakhri 100
            const sales = db.prepare(`
                SELECT created_at, invoice_no AS ref,
                       paid AS inflow, 'Sale' AS type
                FROM sales
                WHERE payment_method = 'Cash' AND paid > 0
                ORDER BY id DESC LIMIT 100
            `).all();

            const purchases = db.prepare(`
                SELECT created_at, bill_no AS ref,
                       paid AS outflow, 'Purchase' AS type
                FROM purchases
                WHERE payment_method = 'Cash' AND paid > 0
                ORDER BY id DESC LIMIT 100
            `).all();

            const expenses = db.prepare(`
                SELECT created_at, name AS ref,
                       amount AS outflow, 'Expense' AS type
                FROM expenses
                WHERE payment_method = 'Cash'
                ORDER BY id DESC LIMIT 100
            `).all();

            const payments = db.prepare(`
                SELECT created_at, note AS ref,
                       CASE WHEN type = 'receive' THEN amount ELSE 0 END AS inflow,
                       CASE WHEN type = 'pay' THEN amount ELSE 0 END AS outflow,
                       CASE WHEN type = 'receive' THEN 'Received' ELSE 'Paid' END AS type
                FROM payments
                WHERE payment_method = 'Cash'
                  AND type NOT IN ('transfer_in','transfer_out')
                ORDER BY id DESC LIMIT 100
            `).all();

            const rows = [...sales, ...purchases, ...expenses, ...payments]
                .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                .slice(0, 100);

            return { success: true, rows };
        }

        if (type === "banks") {
            const rows = db.prepare(`
                SELECT id, bank_name, account_number, opening_balance, current_balance
                FROM bank_accounts
                ORDER BY id ASC
            `).all();
            return { success: true, rows };
        }

         if (type === "bank-details") {
             const rows = db.prepare(`
              SELECT sales.id, sales.created_at AS date, sales.invoice_no AS reference,
                  COALESCE(NULLIF(sales.customer_name, ''), parties.name, 'Walk-In Customer') AS party,
                  'Sale' AS transaction_type, sales.paid AS inflow, 0 AS outflow,
                  sales.paid AS net_amount
              FROM sales
              LEFT JOIN parties ON parties.id = sales.party_id
              WHERE LOWER(TRIM(COALESCE(sales.payment_method, ''))) IN ('bank', 'online')
                AND sales.paid > 0
                AND LOWER(COALESCE(sales.status, 'completed')) NOT IN ('void', 'cancelled')
              UNION ALL
              SELECT purchases.id, purchases.created_at, purchases.bill_no,
                  COALESCE(parties.name, 'Supplier'), 'Purchase', 0, purchases.paid,
                  -purchases.paid
              FROM purchases
              LEFT JOIN parties ON parties.id = purchases.party_id
              WHERE LOWER(TRIM(COALESCE(purchases.payment_method, ''))) IN ('bank', 'online')
                AND purchases.paid > 0
                AND LOWER(COALESCE(purchases.status, 'completed')) NOT IN ('void', 'cancelled')
              UNION ALL
              SELECT expenses.id, expenses.created_at,
                  COALESCE(NULLIF(expenses.name, ''), expenses.category),
                  COALESCE(expenses.note, expenses.category), 'Expense', 0, expenses.amount,
                  -expenses.amount
              FROM expenses
              WHERE LOWER(TRIM(COALESCE(expenses.payment_method, ''))) IN ('bank', 'online')
              UNION ALL
              SELECT payments.id, payments.created_at, COALESCE(NULLIF(payments.note, ''), 'Payment'),
                  COALESCE(parties.name, '-'),
                  CASE WHEN payments.type = 'receive' THEN 'Customer Collection' ELSE 'Supplier Settlement' END,
                  CASE WHEN payments.type = 'receive' THEN payments.amount ELSE 0 END,
                  CASE WHEN payments.type = 'pay' THEN payments.amount ELSE 0 END,
                  CASE WHEN payments.type = 'receive' THEN payments.amount ELSE -payments.amount END
              FROM payments
              LEFT JOIN parties ON parties.id = payments.party_id
              WHERE LOWER(TRIM(COALESCE(payments.payment_method, ''))) IN ('bank', 'online')
                AND payments.type IN ('receive', 'pay')
              UNION ALL
              SELECT transfers.id, transfers.date, COALESCE(NULLIF(transfers.note, ''), transfers.type),
                  'Cash / Bank',
                  CASE WHEN transfers.type = 'cash_to_bank' THEN 'Cash to Bank' ELSE 'Bank to Cash' END,
                  CASE WHEN transfers.type = 'cash_to_bank' THEN transfers.amount ELSE 0 END,
                  CASE WHEN transfers.type = 'bank_to_cash' THEN transfers.amount ELSE 0 END,
                  CASE WHEN transfers.type = 'cash_to_bank' THEN transfers.amount ELSE -transfers.amount END
              FROM transfers
              WHERE transfers.type IN ('cash_to_bank', 'bank_to_cash')
              UNION ALL
              SELECT sale_returns.id, sale_returns.created_at, sale_returns.return_no,
                  'Customer', 'Sale Return', 0,
                  COALESCE(sale_returns.bank_refunded, sale_returns.total),
                  -COALESCE(sale_returns.bank_refunded, sale_returns.total)
              FROM sale_returns
              WHERE LOWER(TRIM(COALESCE(sale_returns.payment_method, ''))) IN ('bank', 'online')
              UNION ALL
              SELECT purchase_returns.id, purchase_returns.created_at, purchase_returns.return_no,
                  'Supplier', 'Purchase Return',
                  COALESCE(purchase_returns.bank_refunded, purchase_returns.total), 0,
                  COALESCE(purchase_returns.bank_refunded, purchase_returns.total)
              FROM purchase_returns
              WHERE LOWER(TRIM(COALESCE(purchase_returns.payment_method, ''))) IN ('bank', 'online')
              ORDER BY date DESC, id DESC
             `).all();
             return { success: true, rows };
         }

        if (type === "expenses") {
            const rows = db.prepare(`
                SELECT id, category, name, amount, payment_method, created_at
                FROM expenses
                WHERE strftime('%Y-%m', created_at) =
                      strftime('%Y-%m', 'now', 'localtime')
                ORDER BY id DESC
            `).all();
            return { success: true, rows };
        }

        return { success: false, error: "Unknown card type." };
    } catch (error) {
        console.error("Card detail error:", error);
        return { success: false, error: error.message, rows: [] };
    }
});


function normalizeInvoicePaperSize(paperSize) {
    const value = String(paperSize || "A4").trim().toLowerCase();
    if (value === "a4") return "A4";
    if (value === "a5") return "A5";
    if (value === "a6") return "A6";
    if (value === "thermal" || value === "thermal-printer") return "A6";
    return "A4";
}

function generateInvoiceHTML(data) {
    const company = data.company || { name: 'My Business', address: '', phone: '', email: '' };
    const party = data.party || { name: 'Customer', address: '', phone: '' };
    const items = data.items || [];
    const invoice = data.invoice || {};
    const type = data.type || 'sale';
    const paperSize = normalizeInvoicePaperSize(data.paperSize || data.invoice?.paper_size || data.paper_size || 'A4');

    const invoiceTitle = type === 'sale' ? 'INVOICE' : 'PURCHASE ORDER';
    const invoiceNumber = type === 'sale' ? invoice.invoice_no : invoice.bill_no;

    const itemsHTML = items.map((item, index) => `
        <tr${index % 2 === 1 ? ' style="background:#fafcfa;"' : ''}>
            <td style="padding: 3px; border-bottom: 0.5px solid #e5e7eb; text-align: left;">${escapeHtml(item.item_code || item.code || '-')}</td>
            <td style="padding: 3px; border-bottom: 0.5px solid #e5e7eb;">${escapeHtml(item.name || '')}</td>
            <td style="padding: 3px; border-bottom: 0.5px solid #e5e7eb; text-align: center;">${item.quantity || 0}</td>
            <td style="padding: 3px; border-bottom: 0.5px solid #e5e7eb; text-align: right;">${formatMoney(item.price || 0)}</td>
            <td style="padding: 3px; border-bottom: 0.5px solid #e5e7eb; text-align: right;">${formatMoney(item.total || 0)}</td>
        </tr>
    `).join('');

    return `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                /* ===== PAPER SIZE SETUP ===== */
                @page { size: ${paperSize} portrait; margin: ${paperSize === 'A4' ? '12mm' : paperSize === 'A5' ? '10mm' : '6mm'}; }
                html, body {
                    -webkit-print-color-adjust: exact;
                    print-color-adjust: exact;
                }
                body {
                    font-family: Arial, sans-serif;
                    margin: 0 auto;
                    padding: ${paperSize === 'A4' ? '10mm' : paperSize === 'A5' ? '8mm' : '4mm'};
                    width: ${paperSize === 'A4' ? '190mm' : paperSize === 'A5' ? '140mm' : '93mm'};
                    box-sizing: border-box;
                    color: #333;
                    font-size: ${paperSize === 'A4' ? '10px' : paperSize === 'A5' ? '9px' : '9px'};
                }

                .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; border-bottom: 1.5px solid #059669; padding-bottom: 6px; }
                .company-info h1 { margin: 0 0 2px 0; color: #059669; font-size: 13px; }
                .company-info p { margin: 0; font-size: 7.5px; color: #555; }
                .invoice-title { text-align: right; }
                .invoice-title h2 { margin: 0; font-size: 15px; color: #333; }
                .invoice-number { margin-top: 2px; font-size: 8.5px; font-weight: bold; }
                .invoice-number + div { font-size: 7.5px; margin-top: 1px; }

                .section { margin-bottom: 6px; }
                .section-title { font-weight: bold; margin-bottom: 1px; color: #64748b; font-size: 7px; text-transform: uppercase; }
                .party-info { margin-bottom: 8px; }
                .party-info div { font-size: 8.5px; margin: 0; }

                table { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
                th, td { padding: 3px; }

                /* Naya page par bhi headings repeat hon */
                thead { display: table-header-group; }

                th {
                    background: #f0fdf4;
                    border-bottom: 1.5px solid #059669;
                    font-weight: 600;
                    font-size: 7.5px;
                    text-align: left;
                }
                td { font-size: 8.5px; }
                tr { page-break-inside: avoid; }

                .totals { display: flex; justify-content: flex-end; }
                .totals-table { width: 55mm; }
                .totals-table td { padding: 2px 3px; border-bottom: 0.5px solid #e2e8f0; font-size: 8.5px; }
                .totals-table tr:last-child td { border-bottom: none; font-weight: bold; font-size: 10px; }

                .footer { margin-top: 8px; padding-top: 5px; border-top: 1px solid #e2e8f0; text-align: center; color: #64748b; font-size: 7px; }
            </style>
        </head>
        <body>
            <div class="header">
                <div class="company-info">
                    <h1>${escapeHtml(company.name)}</h1>
                    <p>${escapeHtml(company.address || '')}</p>
                    <p>${escapeHtml(company.phone || '')}</p>
                    <p>${escapeHtml(company.email || '')}</p>
                </div>
                <div class="invoice-title">
                    <h2>${invoiceTitle}</h2>
                    <div class="invoice-number">#${escapeHtml(invoiceNumber)}</div>
                    <div>Date: ${formatDate(invoice.created_at)}</div>
                </div>
            </div>

            <div class="party-info">
                <div class="section-title">${type === 'sale' ? 'Bill To' : 'Bill From'}</div>
                <div><strong>${escapeHtml(party.name)}</strong>${party.party_code || party.code ? ` <span style="color:#94a3b8; font-size:6.5px;">(${escapeHtml(party.party_code || party.code)})</span>` : ''}</div>
                ${party.address ? `<div>${escapeHtml(party.address)}</div>` : ''}
                ${party.phone ? `<div>${escapeHtml(party.phone)}</div>` : ''}
            </div>

            <table>
                <thead>
                    <tr>
                        <th style="width:15mm;">Code</th>
                        <th>Item</th>
                        <th style="text-align: center; width:9mm;">Qty</th>
                        <th style="text-align: right; width:13mm;">Price</th>
                        <th style="text-align: right; width:15mm;">Total</th>
                    </tr>
                </thead>
                <tbody>
                    ${itemsHTML}
                </tbody>
            </table>

            <div class="totals">
                <table class="totals-table">
                    <tr>
                        <td>Subtotal:</td>
                        <td style="text-align: right;">${formatMoney(invoice.subtotal || 0)}</td>
                    </tr>
                    <tr>
                        <td>Discount (${invoice.discount_type === 'percentage' ? (invoice.discount || 0) + '%' : 'Flat'}):</td>
                        <td style="text-align: right;">-${formatMoney(invoice.discount || 0)}</td>
                    </tr>
                    <tr>
                        <td>Tax:</td>
                        <td style="text-align: right;">${formatMoney(invoice.tax || 0)}</td>
                    </tr>
                    <tr>
                        <td><strong>Total:</strong></td>
                        <td style="text-align: right;"><strong>${formatMoney(invoice.total || 0)}</strong></td>
                    </tr>
                    <tr>
                        <td>Paid:</td>
                        <td style="text-align: right;">${formatMoney(invoice.paid || 0)}</td>
                    </tr>
                    <tr>
                        <td>Due:</td>
                        <td style="text-align: right;">${formatMoney(invoice.due || 0)}</td>
                    </tr>
                </table>
            </div>

            ${invoice.note ? `
            <div class="section">
                <div class="section-title">Note</div>
                <div>${escapeHtml(invoice.note)}</div>
            </div>
            ` : ''}

            <div class="footer">
                <p style="margin: 0;">${escapeHtml(company.invoice_footer || '')}</p>
            </div>
        </body>
        </html>
    `;
}

function escapeHtml(text) {
    return String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function formatMoney(amount) {
    return 'Rs. ' + Number(amount || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' });
}


// ======================================================
// APP START
// ======================================================

if (!WEB_MODE) {

    app.whenReady().then(async () => {
        // Wait for database to be fully initialized
        await db.ready;
        // Ensure auth schema is ready after database initialization
        ensureAuthReady();
        migrateSharedOwnerStores();
        registerActiveUsersWithStore();
        // Ensure default walk-in customer/supplier exists
        ensureDefaultCustomer();
        ensureDefaultSupplier();
        createWindow();

        app.on("activate", () => {
            if (BrowserWindow.getAllWindows().length === 0) {
                createWindow();
            }
        });
    });


    app.on("window-all-closed", () => {
        if (process.platform !== "darwin") {
            // Final flush: active business DB + registry disk par
            if (typeof db.saveNow === "function") {
                db.saveNow();
            }
            app.quit();
        }
    });

} else {
    // Web mode: no server window needed.
    // web-server.js serves the app over HTTP.
    console.log("PakKhatta WEB MODE: handlers registered.");
}

function addInventoryBatch(itemId, purchaseId, quantity, expiryDate, batchNumber, supplierId, purchasePrice) {
    if (Number(quantity) <= 0) return;

    const qty = Number(quantity);
    const bNumber = String(batchNumber || "").trim() || null;
    const sId = supplierId ? Number(supplierId) : null;
    const pPrice = purchasePrice !== undefined && purchasePrice !== null ? Number(purchasePrice) : null;

    db.prepare(`
        INSERT INTO inventory_batches
            (item_id, purchase_id, quantity, quantity_remaining, expiry_date, batch_number, supplier_id, purchase_price)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(itemId, purchaseId || null, qty, qty, expiryDate || null, bNumber, sId, pPrice);
}

function getNextBatchNumber(itemId) {
    const result = db.prepare(`
        SELECT batch_number FROM inventory_batches 
        WHERE item_id = ? AND batch_number IS NOT NULL AND batch_number != ''
        ORDER BY batch_number DESC LIMIT 1
    `).get(itemId);
    
    if (!result?.batch_number) return "B-001";
    
    const match = result.batch_number.match(/^(B|BAT|BB?)-(\d+)$/);
    if (match) {
        let num = parseInt(match[2]) + 1;
        return `B-${num.toString().padStart(3, '0')}`;
    }
    
    return "B-001";
}

// ======================================================
// BARCODE PRODUCT LOOKUP
// ======================================================

ipcMain.handle("lookup-product-by-barcode", (event, barcode) => {
    try {
        const trimmed = String(barcode || "").trim();
        if (!trimmed) return { success: false, error: "Barcode is required." };

        const item = db.prepare(`
            SELECT items.*, categories.name AS category_name
            FROM items
            LEFT JOIN categories ON items.category_id = categories.id
            WHERE items.barcode = ?
        `).get(trimmed);

        if (!item) {
            return { success: false, error: "Product not found." };
        }

        // Check if item is expired (using item-level expiry if no batches)
        const currentDate = new Date().toISOString().slice(0, 10);
        const expiryToCheck = item.expiry_date || null;
        
        if (expiryToCheck && expiryToCheck < currentDate) {
            return { success: false, error: `${item.name} expired on ${expiryToCheck} and cannot be sold.` };
        }

        return { success: true, item };
    } catch (error) {
        console.error("Lookup product by barcode error:", error);
        return { success: false, error: error.message };
    }
});

// ======================================================
// BARCODE REGISTRATION (NEW PRODUCT)
// ======================================================

ipcMain.handle("register-product-by-barcode", (event, productData) => {
    try {
        // Validation
        const nameError = validateRequired(productData?.name, "Product name");
        if (nameError) return { success: false, error: nameError };

        const barcode = String(productData?.barcode || "").trim();
        if (!barcode) return { success: false, error: "Barcode is required." };

        const duplicateBarcode = db.prepare(`SELECT id FROM items WHERE barcode = ?`).get(barcode);
        if (duplicateBarcode) return { success: false, error: "Barcode already belongs to another product." };

        const purchasePriceError = validateNumber(productData?.purchase_price, "Purchase price", 0);
        if (purchasePriceError) return { success: false, error: purchasePriceError };

        const salePriceError = validateNumber(productData?.sale_price, "Sale price", 0);
        if (salePriceError) return { success: false, error: salePriceError };

        let categoryId = null;
        if (productData.category && String(productData.category).trim()) {
            const categoryName = String(productData.category).trim();
            const existing = db.prepare(`SELECT id FROM categories WHERE name = ?`).get(categoryName);
            if (existing) {
                categoryId = existing.id;
            } else {
                const categoryResult = db.prepare(`INSERT INTO categories (name) VALUES (?)`).run(categoryName);
                categoryId = Number(categoryResult.lastInsertRowid);
            }
        }

        const itemCode = db.generateNextCode("ITM", "items", "item_code");

        const result = db.prepare(`
            INSERT INTO items (
                name, item_code, barcode, expiry_date, category_id,
                unit, purchase_price, sale_price, stock, low_stock_limit, tax_rate
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run({
            name: String(productData.name).trim(),
            item_code: itemCode,
            barcode: barcode,
            expiry_date: productData.expiry_date ? String(productData.expiry_date).trim() : null,
            category_id: categoryId,
            unit: productData.unit || "Pieces",
            purchase_price: Number(productData.purchase_price) || 0,
            sale_price: Number(productData.sale_price) || 0,
            stock: 0,
            low_stock_limit: productData.low_stock_limit === undefined || productData.low_stock_limit === null || productData.low_stock_limit === "" ? 5 : Number(productData.low_stock_limit),
            tax_rate: Number(productData.tax_rate) || 0
        });

        return { success: true, id: Number(result.lastInsertRowid), item_code: itemCode };
    } catch (error) {
        console.error("Register product by barcode error:", error);
        return { success: false, error: error.message };
    }
});

// ======================================================
// ADD INVENTORY BATCH WITH AUTOMATIC BATCH NUMBER
// ======================================================

function addInventoryBatchWithBatchNumber(itemId, purchaseId, quantity, expiryDate, supplierId, purchasePrice) {
    const batchNumber = getNextBatchNumber(itemId);
    addInventoryBatch(itemId, purchaseId, quantity, expiryDate, batchNumber, supplierId, purchasePrice);
}

// ======================================================
// CONSUME INVENTORY BATCHES (FEFO)
// ======================================================

function consumeInventoryBatches(itemId, quantity) {
    if (Number(quantity) <= 0) return;

    let remaining = Number(quantity);

    // Get batches ordered by FEFO (First Expiry, First Out)
    // NULL expiry dates go last (non-perishable items)
    const batches = db.prepare(`
        SELECT id, quantity_remaining, expiry_date
        FROM inventory_batches
        WHERE item_id = ? AND quantity_remaining > 0
        ORDER BY
            CASE WHEN expiry_date IS NULL THEN 1 ELSE 0 END ASC,
            expiry_date ASC,
            id ASC
    `).all(itemId);

    for (const batch of batches) {
        if (remaining <= 0) break;

        const batchRemaining = Number(batch.quantity_remaining);
        const deduct = Math.min(remaining, batchRemaining);
        const newRemaining = batchRemaining - deduct;

        db.prepare(`
            UPDATE inventory_batches
            SET quantity_remaining = ?
            WHERE id = ?
        `).run(newRemaining, batch.id);

        remaining -= deduct;
    }
}

// ======================================================
// GET BATCHES BY ITEM
// ======================================================

ipcMain.handle("get-item-batches", (event, itemId) => {
    try {
        const id = Number(itemId);
        if (!id) return { success: false, error: "Invalid item ID." };

        const batches = db.prepare(`
            SELECT id, batch_number, quantity, quantity_remaining, expiry_date, supplier_id, purchase_price
            FROM inventory_batches
            WHERE item_id = ?
            ORDER BY expiry_date ASC NULLS FIRST, id ASC
        `).all(id);

        return { success: true, batches };
    } catch (error) {
        console.error("Get item batches error:", error);
        return { success: false, error: error.message };
    }
});

// ======================================================
// ADD NEW BATCH TO EXISTING PRODUCT
// ======================================================

ipcMain.handle("add-item-batch", (event, batchData) => {
    try {
        const itemId = Number(batchData.item_id || batchData.itemId);
        const quantity = Number(batchData.quantity);
        const expiryDate = String(batchData.expiry_date || "").trim() || null;
        const batchNumber = String(batchData.batch_number || "").trim();
        const supplierId = batchData.supplier_id ? Number(batchData.supplier_id) : null;
        const purchasePrice = batchData.purchase_price !== undefined && batchData.purchase_price !== null ? Number(batchData.purchase_price) : null;

        if (!itemId) return { success: false, error: "Invalid item ID." };
        if (quantity <= 0) return { success: false, error: "Quantity must be greater than 0." };

        // Validate item exists
        const item = db.prepare(`SELECT id, name FROM items WHERE id = ?`).get(itemId);
        if (!item) return { success: false, error: "Item not found." };

        // Generate batch number if not provided
        const finalBatchNumber = batchNumber || getNextBatchNumber(itemId);

        // Add the batch
        addInventoryBatch(itemId, null, quantity, expiryDate, finalBatchNumber, supplierId, purchasePrice);

        // Update item stock
        db.prepare(`UPDATE items SET stock = stock + ? WHERE id = ?`).run(quantity, itemId);

        return { success: true, batchNumber: finalBatchNumber };
    } catch (error) {
        console.error("Add item batch error:", error);
        return { success: false, error: error.message };
    }
});

// ======================================================
// CALCULATE EXPIRY STATUS
// ======================================================

function getExpiryStatus(expiryDate) {
    if (!expiryDate) return "NO_EXPIRY";
    
    const currentDate = new Date();
    const expiry = new Date(expiryDate);
    const diffTime = expiry.getTime() - currentDate.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays > 30) return "NORMAL";
    if (diffDays >= 1 && diffDays <= 30) return "EXPIRING_SOON";
    if (diffDays === 0) return "EXPIRES_TODAY";
    return "EXPIRED";
}

// ======================================================
// GET EXPIRY SUMMARY FOR ITEM
// ======================================================

ipcMain.handle("get-item-expiry-summary", (event, itemId) => {
    try {
        const id = Number(itemId);
        if (!id) return { success: false, error: "Invalid item ID." };

        const batches = db.prepare(`
            SELECT id, batch_number, quantity, quantity_remaining, expiry_date
            FROM inventory_batches
            WHERE item_id = ?
            ORDER BY expiry_date ASC NULLS FIRST, id ASC
        `).all(id);

        const summary = batches.map(batch => {
            const status = getExpiryStatus(batch.expiry_date);
            const currentDate = new Date().toISOString().slice(0, 10);
            let daysRemaining = null;
            
            if (batch.expiry_date && status !== "EXPIRED") {
                const expiry = new Date(batch.expiry_date);
                const today = new Date(currentDate);
                daysRemaining = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            }
            
            return {
                id: batch.id,
                batch_number: batch.batch_number || `B-${String(batch.id).padStart(3, '0')}`,
                quantity: batch.quantity,
                quantity_remaining: batch.quantity_remaining,
                expiry_date: batch.expiry_date,
                status: status,
                days_remaining: daysRemaining
            };
        });

        return { success: true, batches: summary };
    } catch (error) {
        console.error("Get item expiry summary error:", error);
        return { success: false, error: error.message };
    }
});

// ======================================================
// CALCULATE EXPIRY ALERTS FOR DASHBOARD
// ======================================================

ipcMain.handle("get-expiry-alerts", () => {
    try {
        const alerts = db.prepare(`
                 SELECT i.id, i.name, i.unit, b.id AS batch_id, b.batch_number, b.quantity_remaining,
                     b.quantity_remaining AS stock, b.expiry_date,
                   CAST(julianday(b.expiry_date) - julianday(DATE('now', 'localtime')) AS INTEGER) AS days_remaining
            FROM items i
            JOIN inventory_batches b ON i.id = b.item_id
            WHERE b.expiry_date IS NOT NULL AND b.quantity_remaining > 0
            ORDER BY b.expiry_date ASC
            LIMIT 50
        `).all();

        return {
            success: true,
            alerts: alerts.map(item => ({
                ...item,
                expiry_status:
                    Number(item.days_remaining) < 0
                        ? "EXPIRED"
                        : Number(item.days_remaining) === 0
                            ? "EXPIRES TODAY"
                            : "EXPIRING SOON"
            }))
        };
    } catch (error) {
        console.error("Get expiry alerts error:", error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle("delete-all-items", async () => {
    try {
        db.transaction(() => {
            db.prepare("DELETE FROM items_backup").run();
            db.prepare(`
                INSERT INTO items_backup
                SELECT id, name, item_code, barcode, sku, category_id, brand,
                       supplier_id, unit, alternate_unit, conversion_rate,
                       purchase_price, sale_price, wholesale_price, special_price,
                       mrp, avg_cost, stock, low_stock_limit, tax_rate,
                       tax_inclusive, expiry_date, item_location, created_at
                FROM items
            `).run();
            db.prepare("UPDATE sale_items SET item_id = NULL WHERE item_id IS NOT NULL").run();
            db.prepare("UPDATE purchase_items SET item_id = NULL WHERE item_id IS NOT NULL").run();
            db.prepare("DELETE FROM items").run();
        })();
        return { success: true };
    } catch (error) {
        console.error("Delete all items error:", error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle("restore-items", async () => {
    try {
        const result = db.transaction(() => db.prepare(`
            INSERT OR IGNORE INTO items (
                id, name, item_code, barcode, sku, category_id, brand, supplier_id,
                unit, alternate_unit, conversion_rate, purchase_price, sale_price,
                wholesale_price, special_price, mrp, avg_cost, stock, low_stock_limit,
                tax_rate, tax_inclusive, expiry_date, item_location, created_at
            )
            SELECT id, name, item_code, barcode, sku, category_id, brand, supplier_id,
                   unit, alternate_unit, conversion_rate, purchase_price, sale_price,
                   wholesale_price, special_price, mrp, avg_cost, stock, low_stock_limit,
                   tax_rate, tax_inclusive, expiry_date, item_location, created_at
            FROM items_backup
        `).run())();
        return { success: true, restored: Number(result.changes || 0) };
    } catch (error) {
        console.error("Restore items error:", error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle("delete-all-bank-accounts", async () => {
    try {
        const deleted = await Promise.resolve().then(() => db.transaction(() => {
            db.prepare("DELETE FROM bank_accounts_backup").run();
            const banks = db.prepare("SELECT * FROM bank_accounts").all();
            for (const bank of banks) {
                const columns = Object.keys(bank);
                db.prepare(`INSERT INTO bank_accounts_backup (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`).run(columns.map(column => bank[column]));
            }
            db.prepare("DELETE FROM bank_accounts").run();
            return banks.length;
        })());
        return { success: true, deleted };
    } catch (error) {
        console.error("Delete all bank accounts error:", error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle("restore-bank-accounts", async () => {
    try {
        const restored = await Promise.resolve().then(() => db.transaction(() => {
            const rows = db.prepare("SELECT * FROM bank_accounts_backup").all();
            let count = 0;
            for (const bank of rows) {
                const columns = Object.keys(bank);
                const result = db.prepare(`INSERT OR IGNORE INTO bank_accounts (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`).run(columns.map(column => bank[column]));
                count += Number(result.changes || 0);
            }
            return count;
        })());
        return { success: true, restored };
    } catch (error) {
        console.error("Restore bank accounts error:", error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle("delete-all-transfers", async () => {
    try {
        const deleted = await Promise.resolve().then(() => db.transaction(() => {
            db.prepare("DELETE FROM transfers_backup").run();
            const transfers = db.prepare("SELECT * FROM payments WHERE type IN ('transfer_in', 'transfer_out')").all();
            for (const transfer of transfers) {
                const columns = Object.keys(transfer);
                db.prepare(`INSERT INTO transfers_backup (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`).run(columns.map(column => transfer[column]));
            }
            for (const transfer of transfers) {
                const amount = Number(transfer.amount) || 0;
                const note = String(transfer.note || "");
                if (transfer.type === "transfer_out") {
                    if (transfer.payment_method === "Cash") db.prepare("UPDATE cash SET balance = balance + ? WHERE id = 1").run(amount);
                    else if (note.includes("Bank to Bank")) { const bank = db.prepare("SELECT id FROM bank_accounts ORDER BY id ASC LIMIT 1").get(); if (bank) db.prepare("UPDATE bank_accounts SET current_balance = current_balance + ? WHERE id = ?").run(amount, bank.id); }
                } else if (transfer.type === "transfer_in") {
                    db.prepare("UPDATE cash SET balance = MAX(0, balance - ?) WHERE id = 1").run(amount);
                }
            }
            db.prepare("DELETE FROM payments WHERE type IN ('transfer_in', 'transfer_out')").run();
            return transfers.length;
        })());
        return { success: true, deleted };
    } catch (error) {
        console.error("Delete all transfers error:", error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle("restore-transfers", async () => {
    try {
        const restored = await Promise.resolve().then(() => db.transaction(() => {
            const rows = db.prepare("SELECT * FROM transfers_backup").all();
            let count = 0;
            for (const transfer of rows) {
                const columns = Object.keys(transfer);
                const result = db.prepare(`INSERT OR IGNORE INTO payments (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`).run(columns.map(column => transfer[column]));
                if (result.changes) count += Number(result.changes);
            }
            return count;
        })());
        return { success: true, restored };
    } catch (error) {
        console.error("Restore transfers error:", error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle("delete-all-cashbook", async () => {
    try {
        const deleted = await Promise.resolve().then(() => db.transaction(() => {
            db.prepare("DELETE FROM cashbook_backup").run();
            db.prepare("DELETE FROM cashbook_hidden").run();
            const sources = [
                ["sales", "SELECT * FROM sales WHERE payment_method = 'Cash' AND paid > 0"],
                ["purchases", "SELECT * FROM purchases WHERE payment_method = 'Cash' AND paid > 0"],
                ["expenses", "SELECT * FROM expenses WHERE payment_method = 'Cash'"],
                ["payments", "SELECT * FROM payments WHERE payment_method = 'Cash'"],
                ["sale_returns", "SELECT * FROM sale_returns WHERE payment_method = 'Cash' AND total > 0"],
                ["purchase_returns", "SELECT * FROM purchase_returns WHERE payment_method = 'Cash' AND total > 0"]
            ];
            let count = 0;
            for (const [table, query] of sources) {
                for (const row of db.prepare(query).all()) {
                    db.prepare("INSERT INTO cashbook_backup (source_table, source_id, payload) VALUES (?, ?, ?)").run(table, row.id, JSON.stringify(row));
                    db.prepare("INSERT INTO cashbook_hidden (source_table, source_id) VALUES (?, ?)").run(table, row.id);
                    count++;
                }
            }
            return count;
        })());
        return { success: true, deleted };
    } catch (error) {
        console.error("Delete all cashbook error:", error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle("restore-cashbook", async () => {
    try {
        const restored = await Promise.resolve().then(() => db.transaction(() => {
            const result = db.prepare(`DELETE FROM cashbook_hidden WHERE EXISTS (
                SELECT 1 FROM cashbook_backup b
                WHERE b.source_table = cashbook_hidden.source_table
                  AND b.source_id = cashbook_hidden.source_id
            )`).run();
            return Number(result.changes || 0);
        })());
        return { success: true, restored };
    } catch (error) {
        console.error("Restore cashbook error:", error);
        return { success: false, error: error.message };
    }
});