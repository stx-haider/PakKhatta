// ======================================================
// PAKKHATTA AUTH SYSTEM (v2 - Production Redesign)
// ------------------------------------------------------
// ISOLATION RULES:
//   1. Yeh module SIRF authentication ka kaam karta hai.
//      Accounting/POS/Inventory logic ko touch nahi karta.
//      Sirf ADDITIVE DB migration: users par naye columns
//      + naye otp_codes, sessions, auth_meta tables.
//   2. Offline rule: login/POS/accounting kabhi internet
//      na mangta. Internet sirf OTP bhejne ke waqt chahiye.
//   3. Passwords: scrypt hash. OTP: sirf SHA-256 hash
//      store hota hai, plain code kabhi nahi.
// ======================================================

const crypto = require("crypto");
const dns = require("dns");
const fs = require("fs");
const path = require("path");

const AUTH_DIR = path.resolve(process.env.PAKKHATTA_DATA_DIR || __dirname);
fs.mkdirSync(AUTH_DIR, { recursive: true });
const CONFIG_FILE = path.join(AUTH_DIR, "auth.config.json");
const SESSION_FILE = path.join(AUTH_DIR, "auth-session.json");

// OTP outbox file (console provider ke liye dev/test mode)
const OTP_OUTBOX_FILE = path.join(AUTH_DIR, "otp-outbox.log");

function loadAuthConfig() {

    let cfg = {};
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")) || {};
        }
    } catch (e) {
        console.error("auth.config.json parse error:", e.message);
    }

    return Object.assign({
        provider: "console",
        cooldown_seconds: 60,
        otp_ttl_minutes: 5,
        max_attempts_per_otp: 5,
        hourly_send_limit: 5,
        daily_send_limit: 20,
        session_days: 30,
        verify_token_minutes: 10,
        min_password_length: 6,
        twilio: {},
        webhook_url: ""
    }, cfg);

}

let cachedConfig = null;
function authConfig() {
    if (!cachedConfig) cachedConfig = loadAuthConfig();
    return cachedConfig;
}

// ======================================================
// SCHEMA MIGRATION (additive only - kuch delete nahi)
// ======================================================

const schemaReadyTargets = new WeakSet();

function ensureColumn(target, table, column, decl) {
    // Works with BOTH the dbProxy compat layer (.all()) and a
    // raw sql.js statement (.step()/.getAsObject()). The proxy is
    // what main.js passes in, so .all() is the common path.
    const stmt = target.prepare(`PRAGMA table_info(${table})`);

    let rows = [];
    if (typeof stmt.all === "function") {
        rows = stmt.all();
    } else if (typeof stmt.step === "function") {
        while (stmt.step()) rows.push(stmt.getAsObject());
        if (typeof stmt.free === "function") stmt.free();
    }

    const exists = rows.some(
        (r) => String(r.name || "").toLowerCase() === column.toLowerCase()
    );

    if (!exists) {
        target.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${decl}`);
    }
}

function ensureAuthSchema(target) {

    if (!target || schemaReadyTargets.has(target)) return;

    ensureColumn(target, "users", "phone", "TEXT");
    ensureColumn(target, "users", "password_hash", "TEXT");
    ensureColumn(target, "users", "function_password", "TEXT");
    ensureColumn(target, "users", "phone_verified", "INTEGER DEFAULT 0");
    ensureColumn(target, "users", "failed_logins", "INTEGER DEFAULT 0");
    ensureColumn(target, "users", "locked_until", "DATETIME");
    ensureColumn(target, "users", "is_primary", "INTEGER DEFAULT 0");

    target.exec(`
        CREATE TABLE IF NOT EXISTS auth_meta (
            key TEXT PRIMARY KEY,
            value TEXT
        );

        CREATE TABLE IF NOT EXISTS otp_codes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            purpose TEXT NOT NULL,
            phone TEXT NOT NULL,
            otp_hash TEXT NOT NULL,
            attempts_left INTEGER DEFAULT 5,
            expires_at DATETIME NOT NULL,
            consumed INTEGER DEFAULT 0,
            verify_token_hash TEXT,
            token_expires_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_otp_phone_purpose
            ON otp_codes(phone, purpose, consumed);

        CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            token_hash TEXT NOT NULL UNIQUE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            expires_at DATETIME NOT NULL,
            revoked INTEGER DEFAULT 0
        );
    `);

    // Session/OTP pepper (persisted so hashes survive restarts)
    const pepperRow =
        target.prepare(`SELECT value FROM auth_meta WHERE key = 'pepper'`).get();

    if (!pepperRow || !pepperRow.value) {
        target.prepare(
            `INSERT INTO auth_meta (key, value) VALUES ('pepper', ?)`
        ).run(crypto.randomBytes(32).toString("hex"));
    }

    schemaReadyTargets.add(target);
}

function hashFunctionPassword(password) {
    const value = String(password || "").trim();
    if (!value) return "";
    return crypto.createHash("sha256").update(value).digest("hex");
}

function verifyFunctionPassword(password, storedHash) {
    if (!storedHash) return false;
    const expected = String(storedHash).trim();
    const actual = hashFunctionPassword(password);
    return actual && expected && crypto.timingSafeEqual(
        Buffer.from(actual, "hex"),
        Buffer.from(expected, "hex")
    );
}

function getPepper(target) {
    const row = target
        .prepare(`SELECT value FROM auth_meta WHERE key = 'pepper'`)
        .get();
    return String(row?.value || "");
}

// ======================================================
// PASSWORD HASHING (scrypt) + PHONE HELPERS
// ======================================================

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };

function deriveKey(password, saltBuf, params) {
    return crypto.scryptSync(String(password), saltBuf, 32, {
        N: params.N, r: params.r, p: params.p,
        maxmem: 64 * 1024 * 1024
    });
}

function hashPassword(password) {
    const salt = crypto.randomBytes(16);
    const hash = deriveKey(password, salt, SCRYPT_PARAMS);
    return [
        "scrypt",
        SCRYPT_PARAMS.N, SCRYPT_PARAMS.r, SCRYPT_PARAMS.p,
        salt.toString("hex"), hash.toString("hex")
    ].join("$");
}

function verifyPassword(password, storedHash) {
    try {
        if (!storedHash) return false;
        const parts = String(storedHash).split("$");
        if (parts[0] !== "scrypt") return false;

        const params = {
            N: parseInt(parts[1], 10),
            r: parseInt(parts[2], 10),
            p: parseInt(parts[3], 10)
        };
        const salt = Buffer.from(parts[4], "hex");
        const expected = Buffer.from(parts[5], "hex");
        const actual = deriveKey(password, salt, params);

        // timing-safe compare
        return actual.length === expected.length &&
            crypto.timingSafeEqual(actual, expected);
    } catch (e) {
        return false;
    }
}

function passwordStrengthOk(password, minLength) {
    const pw = String(password || "");
    if (pw.length < minLength) return false;
    // kam az kam digit aur letter hona chahiye
    return /[a-zA-Z]/.test(pw) && /\d/.test(pw);
}

// Pakistani format: 03XX-XXXXXXX
// Accepts: 03XX-XXXXXXX | 03XXXXXXXXX | +923XX... |
//          00923XX... | 923XX...
// Stores normalized as 03XXXXXXXXX (11 digits).
function normalizePhone(input) {
    let digits = String(input || "").replace(/\D/g, "");

    if (digits.startsWith("0092")) digits = "0" + digits.slice(4);
    else if (digits.startsWith("92")) digits = "0" + digits.slice(2);
    else if (/^3\d{9}$/.test(digits)) digits = "0" + digits;

    return digits;
}

function isValidPhone(input) {
    const norm = normalizePhone(input);
    return /^03\d{9}$/.test(norm);
}

function maskPhone(phone) {
    const n = normalizePhone(phone);
    if (!/^03\d{9}$/.test(n)) return phone || "";
    return n.slice(0, 4) + "-" + n.slice(4);
}

// Internet check (sirf OTP bhejne se pehle use hota hai)
function internetAvailable(timeoutMs = 4000) {
    return new Promise((resolve) => {
        let settled = false;
        const done = (ok) => {
            if (!settled) { settled = true; resolve(ok); }
        };
        try {
            const timer = setTimeout(() => done(false), timeoutMs);
            dns.lookup("api.twilio.com", (err) => {
                clearTimeout(timer);
                done(!err);
            });
        } catch (e) {
            done(false);
        }
    });
}

// ======================================================
// OTP PROVIDER (loosely coupled - accounting se koi
// taluq nahi). Config: auth.config.json
// ======================================================

function sendViaConsole(phone, code) {
    const line = `[${new Date().toISOString()}] OTP for ${phone}: ${code}\n`;
    try {
        fs.appendFileSync(OTP_OUTBOX_FILE, line);
    } catch (e) { /* non-fatal */ }
    console.log(`[AUTH][console-provider] OTP written for ${maskPhone(phone)}`);
    return true;
}

function sendViaWebhook(phone, code, url) {
    return new Promise((resolve, reject) => {
        try {
            const payload = JSON.stringify({ phone, code });
            const mod = url.startsWith("https:") ?
                require("https") : require("http");
            const u = new URL(url);
            const req = mod.request({
                hostname: u.hostname,
                port: u.port,
                path: u.pathname + u.search,
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Content-Length": Buffer.byteLength(payload)
                },
                timeout: 10000
            }, (res) => {
                res.resume();
                (res.statusCode >= 200 && res.statusCode < 300)
                    ? resolve(true)
                    : reject(new Error(`SMS gateway returned ${res.statusCode}`));
            });
            req.on("timeout", () => req.destroy(new Error("SMS gateway timeout")));
            req.on("error", reject);
            req.write(payload);
            req.end();
        } catch (e) {
            reject(e);
        }
    });
}

async function sendOtpSms(phone, code) {

    const cfg = authConfig();

    switch (String(cfg.provider || "").toLowerCase()) {

        case "twilio": {
            const sid = process.env.TWILIO_ACCOUNT_SID ||
                cfg.twilio.account_sid;
            const token = process.env.TWILIO_AUTH_TOKEN ||
                cfg.twilio.auth_token;
            const from = process.env.TWILIO_FROM ||
                cfg.twilio.from_number;

            if (!sid || !token || !from) {
                throw new Error(
                    "Twilio credentials missing. Set TWILIO_ACCOUNT_SID, " +
                    "TWILIO_AUTH_TOKEN, TWILIO_FROM env vars or fill " +
                    "auth.config.json."
                );
            }

            return new Promise((resolve, reject) => {
                const auth = Buffer.from(`${sid}:${token}`).toString("base64");
                const payload = new URLSearchParams({
                    To: "+92" + normalizePhone(phone).slice(1),
                    From: from,
                    Body: `PakKhatta verification code: ${code} ` +
                          `(valid ${cfg.otp_ttl_minutes} minutes)`
                }).toString();

                const req = require("https").request({
                    hostname: "api.twilio.com",
                    path: `/2010-04-01/Accounts/${sid}/Messages.json`,
                    method: "POST",
                    headers: {
                        "Authorization": "Basic " + auth,
                        "Content-Type": "application/x-www-form-urlencoded",
                        "Content-Length": Buffer.byteLength(payload)
                    },
                    timeout: 15000
                }, (res) => {
                    res.resume();
                    (res.statusCode >= 200 && res.statusCode < 300)
                        ? resolve(true)
                        : reject(new Error(`Twilio error HTTP ${res.statusCode}`));
                });
                req.on("timeout", () =>
                    req.destroy(new Error("Twilio request timeout")));
                req.on("error", reject);
                req.write(payload);
                req.end();
            });
        }

        case "webhook":
            if (!cfg.webhook_url) {
                throw new Error("webhook_url missing in auth.config.json.");
            }
            return sendViaWebhook(phone, code, cfg.webhook_url);

        case "console":
        default:
            // DEV/TEST MODE ONLY - production me provider change karo
            sendViaConsole(phone, code);
            return true;
    }
}

// ======================================================
// OTP ENGINE
// Storage: sha256(pepper + code) only.
// Rules: expiry, max attempts, resend cooldown,
//        hourly + daily rate limits (phone+purpose wise)
// ======================================================

function sha256(text) {
    return crypto.createHash("sha256").update(String(text)).digest("hex");
}

function genOtpCode() {
    // 6-digit, cryptographically secure
    return String(100000 + crypto.randomInt(900000));
}

async function issueOtp(dbProxy, purpose, phone) {

    const cfg = authConfig();
    const norm = normalizePhone(phone);

    const oneHourAgo =
        new Date(Date.now() - 3600 * 1000).toISOString();
    const oneDayAgo =
        new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const lastSentCutoff = new Date(
        Date.now() - cfg.cooldown_seconds * 1000).toISOString();

    // Hourly rate limit
    const hourCount = dbProxy.prepare(`
        SELECT COUNT(*) AS c FROM otp_codes
        WHERE phone = ? AND purpose = ? AND created_at > ?
    `).get(norm, purpose, oneHourAgo).c;

    if (hourCount >= cfg.hourly_send_limit) {
        return {
            success: false,
            error: "Too many OTP requests. Please try again after an hour."
        };
    }

    // Daily rate limit
    const dayCount = dbProxy.prepare(`
        SELECT COUNT(*) AS c FROM otp_codes
        WHERE phone = ? AND purpose = ? AND created_at > ?
    `).get(norm, purpose, oneDayAgo).c;

    if (dayCount >= cfg.daily_send_limit) {
        return {
            success: false,
            error: "Daily OTP limit reached. Please try again tomorrow."
        };
    }

    // Resend cooldown
    const lastSent = dbProxy.prepare(`
        SELECT MAX(created_at) AS t FROM otp_codes
        WHERE phone = ? AND purpose = ?
    `).get(norm, purpose);

    if (lastSent && lastSent.t &&
        new Date(lastSent.t).getTime() > new Date(lastSentCutoff).getTime()) {
        const waitSec = Math.ceil(cfg.cooldown_seconds -
            (Date.now() - new Date(lastSent.t).getTime()) / 1000);
        return {
            success: false,
            error: `Please wait ${Math.max(waitSec, 1)} seconds before ` +
                   `requesting a new OTP.`,
            retry_after: waitSec
        };
    }

    // Purane unconsumed codes invalid kar do
    dbProxy.prepare(`
        UPDATE otp_codes SET consumed = 1
        WHERE phone = ? AND purpose = ? AND consumed = 0
    `).run(norm, purpose);

    const code = genOtpCode();
    const expiry = new Date(
        Date.now() + cfg.otp_ttl_minutes * 60 * 1000).toISOString();
    const createdAt = new Date().toISOString();

    dbProxy.prepare(`
        INSERT INTO otp_codes
            (purpose, phone, otp_hash, attempts_left, expires_at, created_at, consumed)
        VALUES (?, ?, ?, ?, ?, ?, 0)
    `).run(purpose, norm,
           sha256(getPepper(dbProxy) + code),
           cfg.max_attempts_per_otp, expiry, createdAt);

    // OTP actually deliver karo (SMS / console / webhook).
    // Sirf tab success return karo jab delivery successful ho.
    try {
        await sendOtpSms(norm, code);
    } catch (e) {
        return {
            success: false,
            error: "Unable to send OTP: " + (e && e.message ? e.message : e)
        };
    }

    return { success: true, sms_sent: true, code };
}

function verifyOtpCode(dbProxy, purpose, phone, code) {

    const norm = normalizePhone(phone);
    const clean = String(code || "").replace(/\D/g, "");

    if (!clean) {
        return { success: false, error: "OTP is required." };
    }

    const row = dbProxy.prepare(`
        SELECT * FROM otp_codes
        WHERE phone = ? AND purpose = ? AND consumed = 0
        ORDER BY id DESC LIMIT 1
    `).get(norm, purpose);

    if (!row) {
        return {
            success: false,
            error: "No active OTP found. Please request a new OTP."
        };
    }

    // Expiry check
    if (new Date(row.expires_at).getTime() < Date.now()) {
        dbProxy.prepare(
            `UPDATE otp_codes SET consumed = 1 WHERE id = ?`
        ).run(row.id);
        return {
            success: false,
            error: "OTP has expired. Please request a new OTP."
        };
    }

    // Attempts check
    if (Number(row.attempts_left) <= 0) {
        dbProxy.prepare(
            `UPDATE otp_codes SET consumed = 1 WHERE id = ?`
        ).run(row.id);
        return {
            success: false,
            error: "Too many wrong attempts. Please request a new OTP."
        };
    }

    if (sha256(getPepper(dbProxy) + clean) !== row.otp_hash) {
        dbProxy.prepare(`
            UPDATE otp_codes SET attempts_left = attempts_left - 1
            WHERE id = ?
        `).run(row.id);
        return {
            success: false,
            error: `Incorrect OTP. ${
                Number(row.attempts_left) - 1} attempt(s) remaining.`
        };
    }

    // Sahi code => consume karo aur single-use token do
    const cfg = authConfig();
    const token = crypto.randomBytes(32).toString("hex");
    const tokenExpiry = new Date(
        Date.now() + cfg.verify_token_minutes * 60 * 1000).toISOString();

    dbProxy.prepare(`
        UPDATE otp_codes
        SET consumed = 1,
            verify_token_hash = ?,
            token_expires_at = ?
        WHERE id = ?
    `).run(sha256(token), tokenExpiry, row.id);

    return { success: true, verify_token: token, phone: norm };
}

// Single-use verify token consumption
function consumeVerifyToken(dbProxy, purpose, phone, token) {

    if (!token) {
        return { success: false, error: "Verification token missing." };
    }

    const norm = normalizePhone(phone);
    const row = dbProxy.prepare(`
        SELECT * FROM otp_codes
        WHERE phone = ? AND purpose = ? AND consumed = 1
              AND verify_token_hash IS NOT NULL
        ORDER BY id DESC LIMIT 1
    `).get(norm, purpose);

    if (!row ||
        !row.verify_token_hash ||
        row.verify_token_hash !== sha256(token) ||
        new Date(row.token_expires_at).getTime() < Date.now()) {
        return {
            success: false,
            error: "Verification session expired or invalid. " +
                   "Please restart the verification flow."
        };
    }

    // Token khali => dobara use nahi ho sakta
    dbProxy.prepare(`
        UPDATE otp_codes
        SET verify_token_hash = NULL, token_expires_at = NULL
        WHERE id = ?
    `).run(row.id);

    return { success: true, phone: norm };
}

// Purani expired/consumed OTP + session rows ka cleanup
function cleanupOldOtps(dbProxy) {
    try {
        const cutoff =
            new Date(Date.now() - 48 * 3600 * 1000).toISOString();
        dbProxy.prepare(
            `DELETE FROM otp_codes WHERE created_at < ?`
        ).run(cutoff);

        const sessCutoff =
            new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString();
        dbProxy.prepare(
            `DELETE FROM sessions WHERE expires_at < ?`
        ).run(sessCutoff);
    } catch (e) { /* non-fatal */ }
}

// ======================================================
// SESSIONS (restart par logged-in rehne ke liye)
// Token disk par auth-session.json, DB me sirf hash.
// ======================================================

function createSessionToken(dbProxy, userId) {
    const cfg = authConfig();
    const token = crypto.randomBytes(48).toString("hex");
    const expiry = new Date(
        Date.now() + cfg.session_days * 24 * 3600 * 1000).toISOString();

    dbProxy.prepare(`
        INSERT INTO sessions (user_id, token_hash, expires_at)
        VALUES (?, ?, ?)
    `).run(userId, sha256(token), expiry);

    return { token, expiry };
}

function writeSessionFile(token, businessFile) {
    try {
        fs.writeFileSync(SESSION_FILE, JSON.stringify({
            token,
            business_file: businessFile || null,
            saved_at: new Date().toISOString()
        }));
    } catch (e) {
        console.error("Session save error:", e.message);
    }
}

function readSessionFile() {
    try {
        if (!fs.existsSync(SESSION_FILE)) return null;
        return JSON.parse(fs.readFileSync(SESSION_FILE, "utf8"));
    } catch (e) {
        return null;
    }
}

function clearSessionFile() {
    try {
        if (fs.existsSync(SESSION_FILE)) fs.unlinkSync(SESSION_FILE);
    } catch (e) { /* ignore */ }
}

function revokeSessionsForUser(dbProxy, userId) {
    dbProxy.prepare(
        `UPDATE sessions SET revoked = 1 WHERE user_id = ?`
    ).run(userId);
}

module.exports = {
    authConfig,
    OTP_OUTBOX_FILE,

    // hashing helpers
    sha256,

    // schema
    ensureAuthSchema,
    getPepper,

    // password
    hashPassword,
    verifyPassword,
    hashFunctionPassword,
    verifyFunctionPassword,
    passwordStrengthOk,

    // phone
    normalizePhone,
    isValidPhone,
    maskPhone,

    // connectivity (OTP-only usage)
    internetAvailable,

    // otp
    issueOtp,
    verifyOtpCode,
    consumeVerifyToken,
    cleanupOldOtps,

    // sessions
    createSessionToken,
    writeSessionFile,
    readSessionFile,
    clearSessionFile,
    revokeSessionsForUser
};