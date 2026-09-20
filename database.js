const initSqlJs = require("sql.js");
const fs = require("fs");
const path = require("path");

// ======================================================
// DATABASE
// ======================================================

const storageDir = path.resolve(process.env.PAKKHATTA_DATA_DIR || __dirname);
fs.mkdirSync(storageDir, { recursive: true });

const dbPath = path.join(storageDir, "pakkhatta.db");
let db;
let SQL;

// Active business ki db file (multi-account support).
// saveDatabase() hamesha isi file me likhta hai.
let activeFilePath = dbPath;

// > 0 while a db.transaction() is running - saving to disk
// is deferred until the outermost transaction finishes,
// because db.export() breaks an open sql.js transaction.
let txDepth = 0;
let saveScheduled = false;
let saveGeneration = 0;
let saveHandle = null;

function dataFilePath(fileName) {
    return path.join(storageDir, fileName);
}

function migrateLegacyStorage() {
    if (storageDir === __dirname) return;

    const legacyFiles = ["pakkhatta.db", "businesses.json"];
    try {
        fs.readdirSync(__dirname)
            .filter(fileName => /^pakkhatta-biz-.*\.db$/i.test(fileName))
            .forEach(fileName => legacyFiles.push(fileName));
    } catch (error) {
        console.error("Legacy storage scan error:", error.message);
    }

    for (const fileName of legacyFiles) {
        const source = path.join(__dirname, fileName);
        const target = dataFilePath(fileName);
        if (!fs.existsSync(target) && fs.existsSync(source)) {
            try {
                fs.copyFileSync(source, target);
            } catch (error) {
                console.error("Legacy storage migration error:", error.message);
            }
        }
    }
}

migrateLegacyStorage();

// Initialize database
async function initDatabase() {
    try {
        SQL = await initSqlJs();
        
        if (fs.existsSync(dbPath)) {
            const fileBuffer = fs.readFileSync(dbPath);
            db = new SQL.Database(fileBuffer);
        } else {
            db = new SQL.Database();
        }
        
        // Enable foreign keys
        db.run("PRAGMA foreign_keys = ON");
        
        // Create schema
        createSchema();
        
        // Insert default data
        insertDefaultData();
        
        // Purani rows ko unique codes (CUS-/SUP-/ITM-) do
        migrateCodeColumns(db);
        
        // MULTI-BUSINESS: agar active business koi aur hai to
        // us ka apna .db file load karo (har account ka data alag)
        try {
            // Business #1 ka naam purani db se verify karo
            const reg0 = loadRegistry();
            const firstBiz = reg0.businesses.find(
                (b) => b.file === path.basename(dbPath)
            );
            if (firstBiz) {
                const nmStmt = db.prepare(
                    "SELECT name FROM companies ORDER BY id ASC LIMIT 1"
                );
                if (nmStmt.step()) {
                    const nmRow = nmStmt.get();
                    const nm = Array.isArray(nmRow)
                        ? nmRow[0]
                        : (nmRow && nmRow.name);
                    if (nm && firstBiz.name !== String(nm)) {
                        firstBiz.name = String(nm);
                        saveRegistry();
                    }
                }
                nmStmt.free();
            }

            const activeBiz = getActiveBusiness();
            if (
                activeBiz &&
                activeBiz.file &&
                activeBiz.file !== path.basename(dbPath)
            ) {
                db = openBusinessFile(activeBiz.file);
            }
            activeFilePath = dataFilePath(
                activeBiz ? activeBiz.file : "pakkhatta.db"
            );
        } catch (regError) {
            console.error("Business registry error:", regError);
        }

        console.log("Database initialized successfully");
        return db;
    } catch (error) {
        console.error("Database initialization error:", error);
        throw error;
    }
}

// Persist changes after the current IPC handler yields. Multiple writes made
// during one event-loop turn share a single export and disk write.
function saveDatabase() {
    if (!db) return;
    saveGeneration++;

    if (saveScheduled) return;

    saveScheduled = true;
    saveHandle = setImmediate(async () => {
        saveHandle = null;
        saveScheduled = false;

        const database = db;
        const filePath = activeFilePath;
        const generation = saveGeneration;

        try {
            const buffer = Buffer.from(database.export());
            await fs.promises.writeFile(filePath, buffer);
        } catch (error) {
            console.error("Database save error:", error);
            return;
        }

        // A write may have happened while the export or disk write was in
        // progress. Queue another snapshot so no later change is lost.
        if (saveGeneration !== generation) {
            saveDatabase();
        }
    });
}

// Used only when changing database files or shutting down the process.
function saveDatabaseSync() {
    if (!db) return;

    saveGeneration++;
    if (saveHandle) {
        clearImmediate(saveHandle);
        saveHandle = null;
    }
    saveScheduled = false;

    try {
        const buffer = Buffer.from(db.export());
        fs.writeFileSync(activeFilePath, buffer);
    } catch (error) {
        console.error("Database save error:", error);
    }
}

// ======================================================
// PARAMETER PROCESSING
// Supports BOTH styles used across the app:
//   - Positional:   .get(5), .run(a, b, c), .all([1, 2])
//   - Named:        .get({ partyId: 5 }) with @partyId in SQL
// ======================================================

function processParams(sql, params) {
    if (params === null || params === undefined) {
        return { sql: sql, values: [] };
    }

    if (Array.isArray(params)) {
        return {
            sql: sql,
            values: params.map(v => v === undefined ? null : v)
        };
    }

    if (typeof params === "object") {
        const keys = Object.keys(params);
        if (keys.length === 0) {
            return { sql: sql, values: [] };
        }

        const matches = sql.match(/@(\w+)/g);
        if (!matches) {
            return { sql: sql, values: [] };
        }

        const values = matches.map(match => {
            const value = params[match.substring(1)];
            return value === undefined ? null : value;
        });

        return { sql: sql, values: values };
    }

    return { sql: sql, values: [params] };
}

// Create compatibility layer for better-sqlite3 API
const dbProxy = {
    run: function(sql, params = {}) {
        if (!db) throw new Error("Database not initialized");

        const processed = processParams(sql, params);

        db.run(processed.sql, processed.values);

        let lastInsertRowid = null;
        const idStmt = db.prepare("SELECT last_insert_rowid() AS id");
        try {
            if (idStmt.step()) {
                lastInsertRowid = idStmt.getAsObject().id;
            }
        } finally {
            idStmt.free();
        }

        if (txDepth === 0) saveDatabase();

        return { changes: db.getRowsModified(), lastInsertRowid: lastInsertRowid };
    },

    prepare: function(sql) {
        if (!db) throw new Error("Database not initialized");

        return {
            get: function(...args) {
                const processed = processParams(sql, args.length > 1 ? args : args[0]);
                const stmt = db.prepare(processed.sql);

                try {
                    stmt.bind(processed.values);
                    if (stmt.step()) {
                        return stmt.getAsObject();
                    }
                    return undefined;
                } finally {
                    stmt.free();
                }
            },

            all: function(...args) {
                const processed = processParams(sql, args.length > 1 ? args : args[0]);
                const stmt = db.prepare(processed.sql);

                try {
                    stmt.bind(processed.values);
                    const results = [];
                    while (stmt.step()) {
                        results.push(stmt.getAsObject());
                    }
                    return results;
                } finally {
                    stmt.free();
                }
            },

            run: function(...args) {
                const processed = processParams(sql, args.length > 1 ? args : args[0]);
                const stmt = db.prepare(processed.sql);

                try {
                    stmt.bind(processed.values);
                    stmt.step();

                    const changes = db.getRowsModified();
                    let lastInsertRowid = null;
                    const idStmt = db.prepare("SELECT last_insert_rowid() AS id");
                    try {
                        if (idStmt.step()) {
                            lastInsertRowid = idStmt.getAsObject().id;
                        }
                    } finally {
                        idStmt.free();
                    }

                    return { changes: changes, lastInsertRowid: lastInsertRowid };
                } finally {
                    stmt.free();
                    if (txDepth === 0) {
                        saveDatabase();
                    }
                }
            }
        };
    },

    transaction: function(fn) {
        return function(...args) {
            if (!db) throw new Error("Database not initialized");

            db.run("BEGIN");
            txDepth++;

            try {
                const result = fn.apply(null, args);
                db.run("COMMIT");
                return result;
            } catch (error) {
                try {
                    db.run("ROLLBACK");
                } catch (rollbackError) {
                    console.error("Transaction rollback error:", rollbackError.message);
                }
                throw error;
            } finally {
                txDepth--;
                if (txDepth === 0) {
                    saveDatabase();
                }
            }
        };
    },

    exec: function(sql) {
        if (!db) throw new Error("Database not initialized");
        db.run(sql);
        if (txDepth === 0) saveDatabase();
    },
    
    pragma: function(pragma) {
        if (!db) throw new Error("Database not initialized");
        db.run(`PRAGMA ${pragma}`);
    }
};

// Bank balance is scoped by the active business database and follows the
// transaction ledger used by the bank-details modal.
dbProxy.calculateTotalBankBalance = function(companyId) {
        const flow = dbProxy.prepare(`
                SELECT COALESCE(SUM(amount), 0) AS total
                FROM (
                        SELECT paid AS amount FROM sales
                        WHERE LOWER(TRIM(COALESCE(payment_method, ''))) IN ('bank', 'online')
                            AND LOWER(COALESCE(status, 'completed')) NOT IN ('void', 'cancelled')
                        UNION ALL
                        SELECT amount FROM payments
                        WHERE type = 'receive'
                            AND LOWER(TRIM(COALESCE(payment_method, ''))) IN ('bank', 'online')
                        UNION ALL
                        SELECT amount FROM transfers WHERE type = 'cash_to_bank'
                        UNION ALL
                        SELECT -paid AS amount FROM purchases
                        WHERE LOWER(TRIM(COALESCE(payment_method, ''))) IN ('bank', 'online')
                            AND LOWER(COALESCE(status, 'completed')) NOT IN ('void', 'cancelled')
                        UNION ALL
                        SELECT -amount FROM payments
                        WHERE type = 'pay'
                            AND LOWER(TRIM(COALESCE(payment_method, ''))) IN ('bank', 'online')
                        UNION ALL
                        SELECT -amount FROM expenses
                        WHERE LOWER(TRIM(COALESCE(payment_method, ''))) IN ('bank', 'online')
                        UNION ALL
                        SELECT -amount FROM transfers WHERE type = 'bank_to_cash'
                        UNION ALL
                        SELECT -COALESCE(bank_refunded, total) FROM sale_returns
                        WHERE LOWER(TRIM(COALESCE(payment_method, ''))) IN ('bank', 'online')
                        UNION ALL
                        SELECT COALESCE(bank_refunded, total) FROM purchase_returns
                        WHERE LOWER(TRIM(COALESCE(payment_method, ''))) IN ('bank', 'online')
                )
        `).get()?.total;
        return Number(flow || 0);
};

// ======================================================
// MULTI-BUSINESS ACCOUNTS
// ======================================================

const REGISTRY_FILE = dataFilePath("businesses.json");
const DEFAULT_DB_NAME = path.basename(dbPath);
let registryCache = null;

function saveRegistry() {
    try {
        fs.writeFileSync(
            REGISTRY_FILE,
            JSON.stringify(registryCache, null, 2)
        );
    } catch (error) {
        console.error("Registry save error:", error);
    }
}

function loadRegistry() {
    if (registryCache) return registryCache;

    try {
        if (fs.existsSync(REGISTRY_FILE)) {
            registryCache =
                JSON.parse(fs.readFileSync(REGISTRY_FILE, "utf8"));
        }
    } catch (error) {
        console.error("Registry load error:", error);
        registryCache = null;
    }

    if (
        !registryCache ||
        !Array.isArray(registryCache.businesses) ||
        registryCache.businesses.length === 0
    ) {
        let migratedName = "My Business";
        try {
            if (db) {
                const row = db.prepare(
                    "SELECT name FROM companies ORDER BY id ASC LIMIT 1"
                ).get();
                const nm = Array.isArray(row)
                    ? row[0]
                    : (row && row.name);
                if (nm) migratedName = String(nm);
            }
        } catch (ignoreError) {}

        registryCache = {
            activeId: 1,
            nextId: 2,
            businesses: [
                { id: 1, name: migratedName, file: DEFAULT_DB_NAME }
            ]
        };
        saveRegistry();
    }

    return registryCache;
}

function getActiveBusiness() {
    const reg = loadRegistry();
    return (
        reg.businesses.find((b) => b.id === reg.activeId) ||
        reg.businesses[0]
    );
}

function getBusinessForUser(identifier) {
    const reg = loadRegistry();
    const rawKey = String(identifier || "").trim().toLowerCase();
    const phoneKey = rawKey.replace(/\D/g, "");
    const keys = new Set([rawKey]);
    if (phoneKey.length >= 10) keys.add(phoneKey);
    return reg.businesses.find((business) =>
        Array.isArray(business.user_keys) &&
        business.user_keys.some((value) => {
            const ownerKey = String(value || "").trim().toLowerCase();
            const ownerPhone = ownerKey.replace(/\D/g, "");
            return keys.has(ownerKey) ||
                (ownerPhone.length >= 10 && keys.has(ownerPhone));
        })
    ) || null;
}

function openBusinessFile(fileName) {
    const filePath = dataFilePath(fileName);

    if (fs.existsSync(filePath)) {
        const inst = new SQL.Database(fs.readFileSync(filePath));
        createSchema(inst);
        ensureColumn(inst, "users", "phone", "TEXT");
        ensureColumn(inst, "users", "password_hash", "TEXT");
        ensureColumn(inst, "users", "phone_verified", "INTEGER DEFAULT 0");
        ensureColumn(inst, "users", "failed_logins", "INTEGER DEFAULT 0");
        ensureColumn(inst, "users", "locked_until", "DATETIME");
        ensureColumn(inst, "users", "is_primary", "INTEGER DEFAULT 0");
        inst.exec(`
            CREATE TABLE IF NOT EXISTS auth_meta (
                key TEXT PRIMARY KEY,
                value TEXT
            );
            CREATE TABLE IF NOT EXISTS sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                token_hash TEXT NOT NULL UNIQUE,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                expires_at DATETIME NOT NULL,
                revoked INTEGER DEFAULT 0
            );
        `);
        migrateCodeColumns(inst);
        return inst;
    }

    const fresh = new SQL.Database();
    fresh.run("PRAGMA foreign_keys = ON");
    createSchema(fresh);
    ensureColumn(fresh, "users", "phone", "TEXT");
    ensureColumn(fresh, "users", "password_hash", "TEXT");
    ensureColumn(fresh, "users", "phone_verified", "INTEGER DEFAULT 0");
    ensureColumn(fresh, "users", "failed_logins", "INTEGER DEFAULT 0");
    ensureColumn(fresh, "users", "locked_until", "DATETIME");
    ensureColumn(fresh, "users", "is_primary", "INTEGER DEFAULT 0");
    fresh.exec(`
        CREATE TABLE IF NOT EXISTS auth_meta (
            key TEXT PRIMARY KEY,
            value TEXT
        );
        CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            token_hash TEXT NOT NULL UNIQUE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            expires_at DATETIME NOT NULL,
            revoked INTEGER DEFAULT 0
        );
    `);
    insertDefaultData(fresh);
    migrateCodeColumns(fresh);
    return fresh;
}

// ======================================================
// UNIQUE CODES (CUS-/SUP-/ITM-)
// ======================================================

function eachRow(target, sql, cb) {
    const stmt = target.prepare(sql);
    while (stmt.step()) {
        cb(stmt.getAsObject());
    }
    stmt.free();
}

function ensureColumn(target, table, column, decl) {
    const stmt = target.prepare(`PRAGMA table_info(${table})`);
    let exists = false;
    while (stmt.step()) {
        const row = stmt.getAsObject();
        if (
            String(row.name || "").toLowerCase() ===
            column.toLowerCase()
        ) {
            exists = true;
            break;
        }
    }
    stmt.free();

    if (!exists) {
        target.run(
            `ALTER TABLE ${table} ADD COLUMN ${column} ${decl}`
        );
    }
}

function maxCodeSuffix(target, table, col, prefix) {
    let max = 0;
    eachRow(
        target,
        `SELECT ${col} AS code FROM ${table}
         WHERE ${col} LIKE '${prefix}-%'`,
        (row) => {
            const m = String(row.code || "").match(/(\d+)\s*$/);
            if (m) {
                const n = parseInt(m[1], 10);
                if (n > max) max = n;
            }
        }
    );
    return max;
}

function migrateCodeColumns(target) {
    const t = target || db;
    if (!t) return;

    try {
        ensureColumn(t, "parties", "party_code", "TEXT");
        ensureColumn(t, "items", "item_code", "TEXT");
        ensureColumn(t, "items", "avg_cost", "REAL DEFAULT 0");
        ensureColumn(t, "items", "barcode", "TEXT");
        ensureColumn(t, "items", "sku", "TEXT");
        ensureColumn(t, "items", "expiry_date", "TEXT");
        ensureColumn(t, "items", "wholesale_price", "REAL DEFAULT 0");
        ensureColumn(t, "items", "special_price", "REAL DEFAULT 0");
        ensureColumn(t, "items", "brand", "TEXT");
        ensureColumn(t, "items", "supplier_id", "INTEGER");
        ensureColumn(t, "items", "item_location", "TEXT");
        ensureColumn(t, "items", "alternate_unit", "TEXT");
        ensureColumn(t, "items", "conversion_rate", "REAL DEFAULT 1");
        ensureColumn(t, "items", "mrp", "REAL DEFAULT 0");
        ensureColumn(t, "items", "tax_inclusive", "INTEGER DEFAULT 0");

        // Advance Bookings Table Creation
        t.exec(`
            CREATE TABLE IF NOT EXISTS advance_bookings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                booking_no TEXT NOT NULL UNIQUE,
                date TEXT NOT NULL,
                customer TEXT NOT NULL,
                phone TEXT,
                item_qty TEXT,
                pickup_date TEXT,
                advance REAL DEFAULT 0,
                status TEXT DEFAULT 'Pending',
                note TEXT,
                created_by INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_advance_bookings_pickup 
                ON advance_bookings(pickup_date);
            CREATE INDEX IF NOT EXISTS idx_advance_bookings_booking_no 
                ON advance_bookings(booking_no);
        `);

        t.exec(`
            CREATE TABLE IF NOT EXISTS items_backup (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                item_code TEXT,
                barcode TEXT,
                sku TEXT,
                category_id INTEGER,
                brand TEXT,
                supplier_id INTEGER,
                unit TEXT DEFAULT 'Pieces',
                alternate_unit TEXT,
                conversion_rate REAL DEFAULT 1,
                purchase_price REAL DEFAULT 0,
                sale_price REAL DEFAULT 0,
                wholesale_price REAL DEFAULT 0,
                special_price REAL DEFAULT 0,
                mrp REAL DEFAULT 0,
                avg_cost REAL DEFAULT 0,
                stock REAL DEFAULT 0,
                low_stock_limit REAL DEFAULT 5,
                tax_rate REAL DEFAULT 0,
                tax_inclusive INTEGER DEFAULT 0,
                expiry_date TEXT,
                item_location TEXT,
                created_at DATETIME
            )
        `);
        t.exec(`
            CREATE TABLE IF NOT EXISTS transactions_backup (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source_table TEXT NOT NULL,
                source_id INTEGER NOT NULL,
                payload TEXT NOT NULL,
                backed_up_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(source_table, source_id)
            )
        `);
        t.exec(`
            CREATE TABLE IF NOT EXISTS sales_backup (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source_table TEXT NOT NULL,
                source_id INTEGER NOT NULL,
                payload TEXT NOT NULL,
                backed_up_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(source_table, source_id)
            )
        `);
        t.exec(`
            CREATE TABLE IF NOT EXISTS purchases_backup (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source_table TEXT NOT NULL,
                source_id INTEGER NOT NULL,
                payload TEXT NOT NULL,
                backed_up_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(source_table, source_id)
            )
        `);
        t.exec(`
            CREATE TABLE IF NOT EXISTS expenses_backup (
                id INTEGER PRIMARY KEY,
                category TEXT NOT NULL,
                name TEXT,
                amount REAL NOT NULL,
                payment_method TEXT DEFAULT 'Cash',
                note TEXT,
                created_by INTEGER,
                created_at DATETIME
            )
        `);
        t.exec(`
            CREATE TABLE IF NOT EXISTS bank_accounts_backup AS
            SELECT * FROM bank_accounts WHERE 0;
        `);
        t.exec(`
            CREATE TABLE IF NOT EXISTS transfers_backup AS
            SELECT * FROM payments WHERE 0;
        `);
        t.exec(`
            CREATE TABLE IF NOT EXISTS cashbook_backup (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source_table TEXT NOT NULL,
                source_id INTEGER NOT NULL,
                payload TEXT NOT NULL,
                backed_up_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(source_table, source_id)
            );
            CREATE TABLE IF NOT EXISTS cashbook_hidden (
                source_table TEXT NOT NULL,
                source_id INTEGER NOT NULL,
                PRIMARY KEY(source_table, source_id)
            );
        `);
        ensureColumn(t, "inventory_batches", "batch_number", "TEXT");
        ensureColumn(t, "inventory_batches", "supplier_id", "INTEGER");
        ensureColumn(t, "inventory_batches", "purchase_price", "REAL DEFAULT 0");
        ensureColumn(t, "sales", "created_by", "INTEGER");
        ensureColumn(t, "sales", "customer_name", "TEXT");
        ensureColumn(t, "sales", "pricing_mode", "TEXT DEFAULT 'retail'");
        ensureColumn(t, "purchases", "created_by", "INTEGER");
        ensureColumn(t, "sale_returns", "created_by", "INTEGER");
        ensureColumn(t, "sale_returns", "customer_name", "TEXT");
        ensureColumn(t, "sale_returns", "cash_refunded", "REAL");
        ensureColumn(t, "sale_returns", "bank_refunded", "REAL");
        ensureColumn(t, "purchase_returns", "created_by", "INTEGER");
        ensureColumn(t, "purchase_returns", "cash_refunded", "REAL");
        ensureColumn(t, "purchase_returns", "bank_refunded", "REAL");
        ensureColumn(t, "purchase_items", "expiry_date", "TEXT");
        ensureColumn(t, "sale_items", "expiry_date", "TEXT");
        ensureColumn(t, "expenses", "created_by", "INTEGER");
        ensureColumn(t, "payments", "created_by", "INTEGER");
        ensureColumn(t, "stock_history", "created_by", "INTEGER");
        t.exec(`
            CREATE INDEX IF NOT EXISTS idx_sale_returns_sale_id ON sale_returns(sale_id);
            CREATE INDEX IF NOT EXISTS idx_purchase_returns_purchase_id ON purchase_returns(purchase_id);
        `);
        t.exec(`
            CREATE TABLE IF NOT EXISTS inventory_batches (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                item_id INTEGER NOT NULL,
                purchase_id INTEGER,
                quantity REAL NOT NULL DEFAULT 0,
                quantity_remaining REAL NOT NULL DEFAULT 0,
                expiry_date TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
                FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE SET NULL
            );
            CREATE INDEX IF NOT EXISTS idx_inventory_batches_item_expiry
                ON inventory_batches(item_id, expiry_date);
        `);
        ensureColumn(t, "sale_returns", "payment_method", "TEXT DEFAULT 'Cash'");
        ensureColumn(t, "purchase_returns", "payment_method", "TEXT DEFAULT 'Cash'");
        ensureColumn(t, "companies", "business_type", "TEXT DEFAULT 'general_store'");
        ensureColumn(t, "users", "pin_hash", "TEXT");
        ensureColumn(t, "users", "pin_hint", "TEXT");
        ensureColumn(t, "bank_accounts", "account_title", "TEXT");
        ensureColumn(t, "bank_accounts", "branch_name", "TEXT");
        ensureColumn(t, "bank_accounts", "branch_code", "TEXT");

        const counters = {};

        eachRow(
            t,
            `SELECT id, type FROM parties
             WHERE party_code IS NULL OR party_code = ''
             ORDER BY id ASC`,
            (row) => {
                const prefix =
                    /supplier/i.test(String(row.type || ""))
                        ? "SUP"
                        : "CUS";

                counters[prefix] = Math.max(
                    counters[prefix] || 0,
                    0
                );

                if (counters[prefix] === 0) {
                    counters[prefix] = maxCodeSuffix(
                        t, "parties", "party_code", prefix
                    );
                }
                counters[prefix] += 1;

                const code =
                    prefix + "-" +
                    String(counters[prefix]).padStart(4, "0");

                t.run(
                    "UPDATE parties SET party_code = ? WHERE id = ?",
                    [code, row.id]
                );
            }
        );

        let itmMax = maxCodeSuffix(t, "items", "item_code", "ITM");

        eachRow(
            t,
            `SELECT id FROM items
             WHERE item_code IS NULL OR item_code = ''
             ORDER BY id ASC`,
            (row) => {
                itmMax += 1;
                t.run(
                    "UPDATE items SET item_code = ? WHERE id = ?",
                    ["ITM-" + String(itmMax).padStart(4, "0"), row.id]
                );
            }
        );
    } catch (error) {
        console.error("Code migration error:", error);
    }
}

dbProxy.generateNextCode = function (prefix, table, column) {
    const reg = loadRegistry();
    void reg;
    const max = maxCodeSuffix(db, table, column, prefix);
    return prefix + "-" + String(max + 1).padStart(4, "0");
};

dbProxy.getBusinesses = function () {
    const reg = loadRegistry();
    return { businesses: reg.businesses, activeId: reg.activeId };
};

dbProxy.getBusinessesForUser = function (identifiers) {
    const reg = loadRegistry();
    const values = Array.isArray(identifiers) ? identifiers : [identifiers];
    const keys = values
        .map(value => String(value || "").trim().toLowerCase())
        .filter(Boolean);
    const completePhoneKeys = keys
        .map(value => value.replace(/\D/g, ""))
        .filter(value => value.length >= 10);

    const belongsToUser = (business) => {
        const ownerKeys = Array.isArray(business.user_keys)
            ? business.user_keys
            : [];

        return ownerKeys.some(value => {
            const key = String(value || "").trim().toLowerCase();
            const phoneKey = key.replace(/\D/g, "");
            return keys.includes(key) ||
                (phoneKey.length >= 10 && completePhoneKeys.includes(phoneKey));
        });
    };

    return {
        businesses: reg.businesses.filter(belongsToUser),
        activeId: reg.activeId
    };
};

dbProxy.getActiveBusiness = getActiveBusiness;
dbProxy.getBusinessForUser = getBusinessForUser;

dbProxy.getUserFromBusiness = function (businessId, identifiers) {
    const reg = loadRegistry();
    const business = reg.businesses.find(
        (entry) => Number(entry.id) === Number(businessId)
    );
    if (!business) return null;

    const keys = (Array.isArray(identifiers) ? identifiers : [identifiers])
        .map(value => String(value || "").trim())
        .filter(Boolean);
    const phoneKeys = keys.map(value => value.replace(/\D/g, ""));
    const usernameKeys = keys.map(value => value.toLowerCase());
    const target = Number(business.id) === Number(reg.activeId)
        ? db
        : openBusinessFile(business.file);

    try {
        const findOne = (sql, values) => {
            if (target === db) return target.prepare(sql).get(...values);

            const statement = target.prepare(sql);
            try {
                statement.bind(values);
                return statement.step() ? statement.getAsObject() : null;
            } finally {
                statement.free();
            }
        };

        for (const key of keys) {
            const user = findOne(`
                SELECT * FROM users
                WHERE username = ? COLLATE NOCASE OR phone = ?
                LIMIT 1
            `, [key, key]);
            if (user) return user;
        }

        for (const phone of phoneKeys) {
            if (!phone) continue;
            const user = findOne(
                "SELECT * FROM users WHERE phone = ? LIMIT 1",
                [phone]
            );
            if (user) return user;
        }

        for (const username of usernameKeys) {
            const user = findOne(
                "SELECT * FROM users WHERE username = ? COLLATE NOCASE LIMIT 1",
                [username]
            );
            if (user) return user;
        }

        return null;
    } finally {
        if (target !== db && typeof target.close === "function") {
            target.close();
        }
    }
};

dbProxy.assignActiveBusinessUser = function (identifiers) {
    const reg = loadRegistry();
    const business = reg.businesses.find(
        (entry) => entry.id === reg.activeId
    );
    if (!business) return false;

    const keys = Array.isArray(identifiers) ? identifiers : [identifiers];
    const existing = Array.isArray(business.user_keys)
        ? business.user_keys
        : [];

    for (const value of keys) {
        const key = String(value || "").trim().toLowerCase();
        if (key && !existing.includes(key)) existing.push(key);
    }

    business.user_keys = existing;
    saveRegistry();
    return true;
};

dbProxy.switchBusiness = function (businessId) {
    const reg = loadRegistry();
    const biz = reg.businesses.find(
        (b) => b.id === Number(businessId)
    );

    if (!biz) return false;
    if (biz.id === reg.activeId) return true;

    saveDatabaseSync();

    const previousDb = db;
    const nextDb = openBusinessFile(biz.file);
    db = nextDb;
    activeFilePath = dataFilePath(biz.file);

    if (previousDb && previousDb !== nextDb && typeof previousDb.close === "function") {
        previousDb.close();
    }

    reg.activeId = biz.id;
    saveRegistry();

    console.log("Switched to business:", biz.name, "(" + biz.file + ")");
    return true;
};

dbProxy.addBusiness = function (name, details) {
    const reg = loadRegistry();
    const cleanName = String(name || "").trim();

    if (!cleanName) throw new Error("Business name is required.");

    const newId = reg.nextId++;
    const fileName = "pakkhatta-biz-" + newId + ".db";

    saveDatabaseSync();

    const fresh = openBusinessFile(fileName);

    fresh.run(
        "UPDATE companies SET name = ?, phone = ?, address = ?",
        [
            cleanName,
            (details && details.phone) || "",
            (details && details.address) || ""
        ]
    );

    db = fresh;
    activeFilePath = dataFilePath(fileName);

    const ownerKeys = details && Array.isArray(details.user_keys)
        ? details.user_keys
            .map(value => String(value || "").trim().toLowerCase())
            .filter(Boolean)
        : [];
    const biz = {
        id: newId,
        name: cleanName,
        file: fileName,
        user_keys: ownerKeys
    };
    reg.businesses.push(biz);
    reg.activeId = newId;
    saveRegistry();

    saveDatabase();

    console.log("New business created:", cleanName, "(" + fileName + ")");
    return biz;
};

dbProxy.deleteBusiness = function (businessId) {
    const reg = loadRegistry();
    const id = Number(businessId);

    const idx = reg.businesses.findIndex((b) => b.id === id);
    if (idx === -1) return false;

    if (reg.businesses.length <= 1) return false;

    const biz = reg.businesses[idx];

    if (reg.activeId === id) {
        const other = reg.businesses.find((b) => b.id !== id);
        if (other) {
            db = openBusinessFile(other.file);
            activeFilePath = dataFilePath(other.file);
            reg.activeId = other.id;
        }
    }

    reg.businesses.splice(idx, 1);
    saveRegistry();

    try {
        const filePath = dataFilePath(biz.file);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (err) {
        console.error("Delete business file error:", err);
    }

    return true;
};

dbProxy.saveNow = saveDatabaseSync;
dbProxy.getDatabasePath = function() {
    return activeFilePath;
};

dbProxy.peekBusinessName = function (fileName) {
    try {
        const filePath = dataFilePath(fileName);
        if (!fs.existsSync(filePath)) return null;

        const inst = new SQL.Database(fs.readFileSync(filePath));
        const stmt = inst.prepare(
            "SELECT name FROM companies ORDER BY id ASC LIMIT 1"
        );

        let nm = null;
        if (stmt.step()) {
            const row = stmt.get();
            nm = Array.isArray(row) ? row[0] : (row && row.name);
        }
        stmt.free();
        inst.close();

        return nm ? String(nm) : null;
    } catch (error) {
        console.error("Peek business name error:", error);
        return null;
    }
};

// ======================================================
// DATABASE TABLES
// ======================================================

function createSchema(target) {
    (target || db).exec(`
    CREATE TABLE IF NOT EXISTS companies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        phone TEXT,
        email TEXT,
        address TEXT,
        gstin TEXT,
        logo TEXT,
        currency TEXT DEFAULT 'Rs.',
        invoice_footer TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS parties (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        party_code TEXT,
        phone TEXT,
        email TEXT,
        address TEXT,
        type TEXT NOT NULL DEFAULT 'Customer',
        balance REAL DEFAULT 0,
        opening_balance REAL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        item_code TEXT,
        barcode TEXT,
        sku TEXT,
        category_id INTEGER,
        brand TEXT,
        supplier_id INTEGER,
        unit TEXT DEFAULT 'Pieces',
        alternate_unit TEXT,
        conversion_rate REAL DEFAULT 1,
        purchase_price REAL DEFAULT 0,
        sale_price REAL DEFAULT 0,
        mrp REAL DEFAULT 0,
        wholesale_price REAL DEFAULT 0,
        special_price REAL DEFAULT 0,
        avg_cost REAL DEFAULT 0,
        stock REAL DEFAULT 0,
        low_stock_limit REAL DEFAULT 5,
        tax_rate REAL DEFAULT 0,
        tax_inclusive INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

        FOREIGN KEY (category_id)
        REFERENCES categories(id)
        ON DELETE SET NULL,

        FOREIGN KEY (supplier_id)
        REFERENCES parties(id)
        ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS sales (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_no TEXT NOT NULL UNIQUE,
        party_id INTEGER,
        subtotal REAL DEFAULT 0,
        discount REAL DEFAULT 0,
        discount_type TEXT DEFAULT 'flat',
        tax REAL DEFAULT 0,
        total REAL DEFAULT 0,
        paid REAL DEFAULT 0,
        due REAL DEFAULT 0,
        payment_method TEXT DEFAULT 'Cash',
        status TEXT DEFAULT 'completed',
        note TEXT,
        created_by INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

        FOREIGN KEY (party_id)
        REFERENCES parties(id)
        ON DELETE SET NULL
    );

    -- ADVANCE BOOKINGS TABLE (ACCOUNT ISOLATED)
    CREATE TABLE IF NOT EXISTS advance_bookings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        booking_no TEXT NOT NULL UNIQUE,
        date TEXT NOT NULL,
        customer TEXT NOT NULL,
        phone TEXT,
        item_qty TEXT,
        pickup_date TEXT,
        advance REAL DEFAULT 0,
        status TEXT DEFAULT 'Pending',
        note TEXT,
        created_by INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS purchases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bill_no TEXT NOT NULL,
        party_id INTEGER,
        subtotal REAL DEFAULT 0,
        discount REAL DEFAULT 0,
        discount_type TEXT DEFAULT 'flat',
        tax REAL DEFAULT 0,
        total REAL DEFAULT 0,
        paid REAL DEFAULT 0,
        due REAL DEFAULT 0,
        payment_method TEXT DEFAULT 'Cash',
        status TEXT DEFAULT 'completed',
        note TEXT,
        created_by INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

        FOREIGN KEY (party_id)
        REFERENCES parties(id)
        ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS sale_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sale_id INTEGER NOT NULL,
        item_id INTEGER,
        quantity REAL NOT NULL,
        price REAL NOT NULL,
        total REAL NOT NULL,

        FOREIGN KEY (sale_id)
        REFERENCES sales(id)
        ON DELETE CASCADE,

        FOREIGN KEY (item_id)
        REFERENCES items(id)
        ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS purchase_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        purchase_id INTEGER NOT NULL,
        item_id INTEGER,
        quantity REAL NOT NULL,
        price REAL NOT NULL,
        total REAL NOT NULL,
        expiry_date TEXT,

        FOREIGN KEY (purchase_id)
        REFERENCES purchases(id)
        ON DELETE CASCADE,

        FOREIGN KEY (item_id)
        REFERENCES items(id)
        ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS inventory_batches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        item_id INTEGER NOT NULL,
        purchase_id INTEGER,
        quantity REAL NOT NULL DEFAULT 0,
        quantity_remaining REAL NOT NULL DEFAULT 0,
        expiry_date TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

        FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
        FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        party_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        amount REAL NOT NULL,
        payment_method TEXT DEFAULT 'Cash',
        note TEXT,
        created_by INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

        FOREIGN KEY (party_id)
        REFERENCES parties(id)
        ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT NOT NULL,
        name TEXT,
        amount REAL NOT NULL,
        payment_method TEXT DEFAULT 'Cash',
        note TEXT,
        created_by INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS bank_accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bank_name TEXT NOT NULL,
        account_number TEXT,
        account_title TEXT,
        branch_name TEXT,
        branch_code TEXT,
        opening_balance REAL DEFAULT 0,
        current_balance REAL DEFAULT 0,
        print_on_invoice INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS transfers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
        type TEXT NOT NULL,
        amount REAL NOT NULL,
        bank_account_id INTEGER,
        note TEXT,
        created_by INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS cash (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        balance REAL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS stock_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        item_id INTEGER,
        type TEXT NOT NULL,
        quantity REAL NOT NULL,
        balance REAL DEFAULT 0,
        reference_type TEXT,
        reference_id INTEGER,
        note TEXT,
        created_by INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

        FOREIGN KEY (item_id)
        REFERENCES items(id)
        ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS sale_returns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sale_id INTEGER,
        party_id INTEGER,
        return_no TEXT NOT NULL,
        subtotal REAL DEFAULT 0,
        total REAL DEFAULT 0,
        payment_method TEXT DEFAULT 'Cash',
        customer_name TEXT,
        note TEXT,
        created_by INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

        FOREIGN KEY (sale_id)
        REFERENCES sales(id)
        ON DELETE SET NULL,

        FOREIGN KEY (party_id)
        REFERENCES parties(id)
        ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS sale_return_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        return_id INTEGER NOT NULL,
        item_id INTEGER,
        quantity REAL NOT NULL,
        price REAL NOT NULL,
        total REAL NOT NULL,

        FOREIGN KEY (return_id)
        REFERENCES sale_returns(id)
        ON DELETE CASCADE,

        FOREIGN KEY (item_id)
        REFERENCES items(id)
        ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS purchase_returns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        purchase_id INTEGER,
        party_id INTEGER,
        return_no TEXT NOT NULL,
        subtotal REAL DEFAULT 0,
        total REAL DEFAULT 0,
        payment_method TEXT DEFAULT 'Cash',
        note TEXT,
        created_by INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

        FOREIGN KEY (purchase_id)
        REFERENCES purchases(id)
        ON DELETE SET NULL,

        FOREIGN KEY (party_id)
        REFERENCES parties(id)
        ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS purchase_return_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        return_id INTEGER NOT NULL,
        item_id INTEGER,
        quantity REAL NOT NULL,
        price REAL NOT NULL,
        total REAL NOT NULL,

        FOREIGN KEY (return_id)
        REFERENCES purchase_returns(id)
        ON DELETE CASCADE,

        FOREIGN KEY (item_id)
        REFERENCES items(id)
        ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
    );

    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        pin TEXT NOT NULL,
        full_name TEXT,
        role TEXT DEFAULT 'cashier',
        permissions TEXT DEFAULT '{}',
        function_password TEXT,
        active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        username TEXT,
        action TEXT NOT NULL,
        entity_type TEXT,
        entity_id INTEGER,
        old_value TEXT,
        new_value TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS day_close (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        business_date TEXT NOT NULL UNIQUE,
        total_sales REAL DEFAULT 0,
        cash_sales REAL DEFAULT 0,
        bank_sales REAL DEFAULT 0,
        credit_sales REAL DEFAULT 0,
        total_returns REAL DEFAULT 0,
        total_purchases REAL DEFAULT 0,
        total_expenses REAL DEFAULT 0,
        cash_received REAL DEFAULT 0,
        cash_paid REAL DEFAULT 0,
        expected_cash REAL DEFAULT 0,
        actual_cash REAL DEFAULT 0,
        cash_difference REAL DEFAULT 0,
        note TEXT,
        user_id INTEGER,
        username TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    -- Performance Indexes
    CREATE INDEX IF NOT EXISTS idx_sales_party_id ON sales(party_id);
    CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales(created_at);
    CREATE INDEX IF NOT EXISTS idx_sales_invoice_no ON sales(invoice_no);
    CREATE INDEX IF NOT EXISTS idx_advance_bookings_pickup ON advance_bookings(pickup_date);
    CREATE INDEX IF NOT EXISTS idx_advance_bookings_booking_no ON advance_bookings(booking_no);
    CREATE INDEX IF NOT EXISTS idx_purchases_party_id ON purchases(party_id);
    CREATE INDEX IF NOT EXISTS idx_purchases_created_at ON purchases(created_at);
    CREATE INDEX IF NOT EXISTS idx_purchases_bill_no ON purchases(bill_no);
    CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON sale_items(sale_id);
    CREATE INDEX IF NOT EXISTS idx_sale_items_item_id ON sale_items(item_id);
    CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase_id ON purchase_items(purchase_id);
    CREATE INDEX IF NOT EXISTS idx_purchase_items_item_id ON purchase_items(item_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_batches_item_expiry ON inventory_batches(item_id, expiry_date);
    CREATE INDEX IF NOT EXISTS idx_parties_type ON parties(type);
    CREATE INDEX IF NOT EXISTS idx_items_category_id ON items(category_id);
    CREATE INDEX IF NOT EXISTS idx_stock_history_item_id ON stock_history(item_id);
    CREATE INDEX IF NOT EXISTS idx_stock_history_created_at ON stock_history(created_at);
    CREATE INDEX IF NOT EXISTS idx_payments_party_id ON payments(party_id);
    CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at);
    CREATE INDEX IF NOT EXISTS idx_expenses_created_at ON expenses(created_at);
    CREATE INDEX IF NOT EXISTS idx_transfers_date ON transfers(date);
    CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at);
    CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username);
`);
}

function insertDefaultData(target) {
    const d = target || db;

    d.run(`
        INSERT OR IGNORE INTO cash (id, balance)
        VALUES (1, 0)
    `);

    let count = -1;
    const stmt = d.prepare("SELECT COUNT(*) AS c FROM companies");
    if (stmt.step()) {
        count = Number(stmt.get()[0]);
    }
    stmt.free();

    if (count === 0) {
        d.run("INSERT INTO companies (name) VALUES ('My Business')");
    }
}

// Initialize immediately and export proxy
const dbInitPromise = (async function() {
    await initDatabase();
})();

module.exports = dbProxy;
module.exports.ready = dbInitPromise;

console.log("======================================");
console.log("PakKhatta database initialized");
console.log("Database:", dbPath);
console.log("======================================");
console.log("PakKhatta database module ready.");