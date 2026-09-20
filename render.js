console.log("PakKhatta Renderer Loaded");

let activeBusinessId = null;

async function syncActiveBusinessContext() {
    if (!apiReady("getCompanies")) return null;
    try {
        const result = await window.electronAPI.getCompanies();
        const id = Number(result?.activeId);
        activeBusinessId = Number.isFinite(id) && id > 0 ? id : null;
        return activeBusinessId;
    } catch (error) {
        activeBusinessId = null;
        console.error("Active business context error:", error);
        return null;
    }
}

function clearDashboardAlerts() {
    ["lowStockContainer", "expiryAlertContainer"].forEach(id => {
        const element = document.getElementById(id);
        if (element) element.innerHTML = "";
    });
    const advanceCount = document.getElementById("dashboardAdvanceCount");
    if (advanceCount) advanceCount.textContent = "0";
    document.querySelectorAll(".pakket-toast").forEach(toast => toast.remove());
}

// ======================================================
// TOAST NOTIFICATIONS
// ======================================================
function getAdvanceKey() {
    if (activeBusinessId) return `pakKhatta_advanceBookings_business_${activeBusinessId}`;

    // Legacy fallback for sessions where the business registry is unavailable.
    const header = document.querySelector("header") || document.querySelector("nav") || document.body;
    const text = header ? header.innerText : "";

    // 1. Business Name (Pehli line, jaise 'My Business')
    const bizName = text.split("\n")[0]?.trim() || "biz";

    // 2. User Name (👤 ke aage wala naam, jaise 'kashif')
    const userMatch = text.match(/👤\s*([^\n\r(]+)/);
    const userName = userMatch ? userMatch[1].trim() : "user";

    // 3. Mukammal alag key (e.g. pakKhatta_adv_my_business_kashif)
    const safeKey = (bizName + "_" + userName).replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
    return "pakKhatta_adv_" + safeKey;
}

function getLocalDateString(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function getAdvanceAlertBookings() {
    const today = getLocalDateString();
    const tomorrowDate = new Date();
    tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const tomorrow = getLocalDateString(tomorrowDate);

    try {
        const bookings = JSON.parse(localStorage.getItem(getAdvanceKey()) || "[]");
        return Array.isArray(bookings)
            ? bookings.filter(booking => {
                const status = String(booking.status || "pending").trim().toLowerCase();
                const pickupDate = String(booking.pickupDate || booking.pickup_date || "").trim().slice(0, 10);
                return status === "pending" &&
                    (pickupDate === today || pickupDate === tomorrow);
            })
            : [];
    } catch (error) {
        console.error("Error loading advance booking alerts:", error);
        return [];
    }
}

function getAdvanceBookingsForRange(range) {
    const start = String(range?.from_date || "").slice(0, 10);
    const end = String(range?.to_date || start).slice(0, 10);
    if (!start || !end) return [];

    try {
        const bookings = JSON.parse(localStorage.getItem(getAdvanceKey()) || "[]");
        return Array.isArray(bookings)
            ? bookings.filter(booking => {
                const status = String(booking.status || "pending").trim().toLowerCase();
                const pickupDate = String(booking.pickupDate || booking.pickup_date || "").trim().slice(0, 10);
                return status === "pending" && pickupDate >= start && pickupDate <= end;
            })
            : [];
    } catch (error) {
        console.error("Error loading advance bookings for dashboard:", error);
        return [];
    }
}

function getAdvanceAlertDate(booking) {
    const today = getLocalDateString();
    return String(booking.pickupDate || booking.pickup_date || "").trim().slice(0, 10) === today
        ? "today"
        : "tomorrow";
}

function showToast(message, type = "error") {

    document.querySelectorAll(".pakket-toast").forEach(t => t.remove());

    const toast = document.createElement("div");
    toast.className = "pakket-toast";
    const bgColor = type === "success" ? "#16a34a" : type === "warning" ? "#d97706" : "#dc2626";
    toast.style.cssText = `
        position:fixed; top:20px; left:50%; transform:translateX(-50%);
        z-index:99999; padding:14px 24px; border-radius:10px;
        background:${bgColor}; color:#fff; font-size:14px; font-weight:600;
        box-shadow:0 8px 30px rgba(0,0,0,0.3);
        animation:toastSlideDown 0.3s ease;
        max-width:90vw; text-align:center;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transition = "opacity 0.3s";
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

function showAppConfirm(message, { title = "Confirm Action", confirmText = "OK", cancelText = "Cancel" } = {}) {
    document.getElementById("appConfirmOverlay")?.remove();

    return new Promise(resolve => {
        const overlay = document.createElement("div");
        overlay.id = "appConfirmOverlay";
        overlay.style.cssText = [
            "position:fixed", "inset:0", "z-index:100000",
            "display:flex", "align-items:center", "justify-content:center",
            "padding:20px", "background:rgba(15,23,42,0.42)"
        ].join(";");

        overlay.innerHTML = `
            <div role="dialog" aria-modal="true" style="
                width:min(430px, 92vw); background:#fff; border-radius:12px;
                box-shadow:0 18px 55px rgba(15,23,42,0.3); overflow:hidden;
            ">
                <div style="padding:18px 20px 10px; border-bottom:1px solid #e2e8f0;">
                    <h3 style="margin:0; color:#0f172a; font-size:17px;">${escapeHTML(title)}</h3>
                </div>
                <div style="padding:18px 20px; color:#475569; font-size:14px; line-height:1.5;">${escapeHTML(message)}</div>
                <div style="display:flex; justify-content:flex-end; gap:10px; padding:12px 20px; background:#f8fafc; border-top:1px solid #e2e8f0;">
                    <button type="button" data-confirm-cancel style="padding:8px 16px; border:1px solid #cbd5e1; background:#fff; color:#334155; border-radius:8px; cursor:pointer; font-weight:600;">${escapeHTML(cancelText)}</button>
                    <button type="button" data-confirm-ok style="padding:8px 16px; border:0; background:#dc2626; color:#fff; border-radius:8px; cursor:pointer; font-weight:600;">${escapeHTML(confirmText)}</button>
                </div>
            </div>
        `;

        const finish = value => {
            overlay.remove();
            resetGlobalUiLocks();
            resolve(value);
        };

        overlay.__finishConfirm = finish;

        overlay.querySelector("[data-confirm-ok]")?.addEventListener("click", () => finish(true));
        overlay.querySelector("[data-confirm-cancel]")?.addEventListener("click", () => finish(false));
        overlay.addEventListener("click", event => {
            if (event.target === overlay) finish(false);
        });
        overlay.addEventListener("keydown", event => {
            if (event.key === "Escape") finish(false);
        });
        document.body.appendChild(overlay);
        overlay.tabIndex = -1;
        overlay.focus();
        overlay.querySelector("[data-confirm-cancel]")?.focus();
    });
}

let itemPreviewPreviousFocus = null;
let accountSwitchRequestId = 0;

function resetGlobalUiLocks() {
    try {
        document.body.style.pointerEvents = "";
        document.body.style.userSelect = "";
        document.body.style.touchAction = "";
    } catch (e) {}

    const transientSelectors = [
        ".search-dropdown",
        "#cardDetailOverlay",
        "#txDetailOverlay",
        "#formModalOverlay",
        "#companySwitcherOverlay",
        "#itemPreviewOverlay",
        "#advanceBookingModal",
        "#returnPickerOverlay",
        "#expenseDetailOverlay",
        "#structuredDetailOverlay",
        "#appConfirmOverlay",
        ".modal-overlay"
    ];

    transientSelectors.forEach(selector => {
        document.querySelectorAll(selector).forEach(node => {
            if (selector === "#appConfirmOverlay" && typeof node.__finishConfirm === "function") {
                node.__finishConfirm(false);
                return;
            }
            try {
                node.style.pointerEvents = "";
            } catch (e) {}
            if (node.isConnected) {
                node.style.pointerEvents = "";
            }
        });
    });
}

function clearTransientUi() {
    const formFocus = typeof formModalPreviousFocus !== "undefined"
        ? formModalPreviousFocus
        : null;
    const itemFocus = typeof itemPreviewPreviousFocus !== "undefined"
        ? itemPreviewPreviousFocus
        : null;
    const restoreElement = formFocus || itemFocus;
    const transientSelectors = [
        ".search-dropdown",
        "#cardDetailOverlay",
        "#txDetailOverlay",
        "#formModalOverlay",
        "#companySwitcherOverlay",
        "#itemPreviewOverlay",
        "#advanceBookingModal",
        "#returnPickerOverlay",
        "#expenseDetailOverlay"
    ];

    transientSelectors.forEach(selector => {
        document.querySelectorAll(selector).forEach(node => {
            node.style.pointerEvents = "none";
            node.remove();
        });
    });

    resetGlobalUiLocks();
    if (typeof window.focus === "function") window.focus();
    if (restoreElement?.isConnected && typeof restoreElement.focus === "function") {
        restoreElement.focus();
    } else if (document?.activeElement?.isConnected && typeof document.activeElement.focus === "function") {
        document.activeElement.focus();
    }

    if (typeof formModalPreviousFocus !== "undefined") {
        formModalPreviousFocus = null;
    }
    if (typeof itemPreviewPreviousFocus !== "undefined") {
        itemPreviewPreviousFocus = null;
    }

    if (typeof pendingFunctionPasswordResolver === "function") {
        const resolve = pendingFunctionPasswordResolver;
        pendingFunctionPasswordResolver = null;
        resolve(false);
    }
}

window.clearTransientUi = clearTransientUi;

function openStructuredDetailModal({ title, subtitle, rows = [], actions = "" }) {
    resetGlobalUiLocks();

    const overlay = document.createElement("div");
    overlay.id = "structuredDetailOverlay";
    overlay.style.cssText = [
        "position:fixed", "inset:0", "z-index:9800",
        "background:rgba(2,6,23,0.55)",
        "display:flex", "align-items:center", "justify-content:center",
        "padding:20px"
    ].join(";");

    const bodyHtml = rows.map(row => `
        <div style="display:grid; grid-template-columns:180px 1fr; gap:12px; align-items:start; padding:10px 0; border-bottom:1px solid #e2e8f0;">
            <div style="font-size:12px; color:#64748b; font-weight:700; text-transform:uppercase; letter-spacing:0.04em;">${escapeHTML(row.label)}</div>
            <div style="font-size:14px; color:#1e293b; font-weight:600; line-height:1.5;">${row.value ?? "-"}</div>
        </div>
    `).join("");

    overlay.innerHTML = `
        <div style="
            background:#fff; border-radius:14px;
            width:min(700px, 94vw); max-height:86vh;
            display:flex; flex-direction:column;
            box-shadow:0 20px 60px rgba(0,0,0,0.35);
            overflow:hidden;
        ">
            <div style="display:flex; align-items:center; justify-content:space-between; padding:14px 20px; background:#f8fafc; border-bottom:1px solid #e2e8f0;">
                <div>
                    <h3 style="margin:0; font-size:17px; color:#0f172a;">${escapeHTML(title)}</h3>
                    ${subtitle ? `<p style="margin:6px 0 0; font-size:12px; color:#64748b;">${escapeHTML(subtitle)}</p>` : ""}
                </div>
                <button type="button" style="padding:6px 12px; border:1px solid #cbd5e1; background:#fff; border-radius:8px; cursor:pointer; font-weight:600; color:#334155;" data-close-detail="true">✕ Close</button>
            </div>
            <div style="overflow:auto; padding:16px 20px;">
                ${bodyHtml || `<div style="padding:18px 0; color:#64748b;">No details available.</div>`}
            </div>
            ${actions ? `<div style="display:flex; gap:10px; justify-content:flex-end; padding:14px 20px; background:#f8fafc; border-top:1px solid #e2e8f0;">${actions}</div>` : ""}
        </div>
    `;

    overlay.addEventListener("click", (event) => {
        if (event.target === overlay) {
            overlay.remove();
            resetGlobalUiLocks();
        }
    });

    const closeBtn = overlay.querySelector("[data-close-detail='true']");
    closeBtn?.addEventListener("click", () => {
        overlay.remove();
        resetGlobalUiLocks();
    });

    document.body.appendChild(overlay);
    return overlay;
}

const nativeAlert = window.alert.bind(window);
const nativeConfirm = window.confirm.bind(window);
const nativePrompt = window.prompt.bind(window);

function resetAlertUiState() {
    resetGlobalUiLocks();
    const active = document.activeElement;
    if (active && active instanceof HTMLElement) {
        active.blur();
    }
    setTimeout(() => {
        resetGlobalUiLocks();
        if (typeof window.focus === "function") window.focus();
    }, 0);
}

window.alert = function(message) {
    resetAlertUiState();
    try {
        const text = String(message ?? "");
        if (text.trim()) showToast(text, "warning");
    } catch (error) {
        console.warn("Custom alert fallback:", error);
        try { return nativeAlert(message); } catch (e) {}
    }
    return undefined;
};

window.confirm = function(message) {
    resetAlertUiState();
    return nativeConfirm(message);
};

window.prompt = function(message, defaultValue) {
    resetAlertUiState();
    return nativePrompt(message, defaultValue);
};

window.addEventListener("focus", resetGlobalUiLocks);
document.addEventListener("visibilitychange", () => {
    if (!document.hidden) resetGlobalUiLocks();
});

// ======================================================
// SECURITY
// ======================================================

function escapeHTML(value) {
    return String(value ?? "")
        .replace(/&/g, "&" + "amp;")
        .replace(/</g, "&" + "lt;")
        .replace(/>/g, "&" + "gt;")
        .replace(/"/g, "&" + "quot;")
        .replace(/'/g, "&#" + "039;");
}

// ======================================================
// API CHECK
// ======================================================

function apiReady(method) {
    if (!window.electronAPI) {
        console.error("electronAPI is not available.");
        return false;
    }

    if (typeof window.electronAPI[method] !== "function") {
        console.error(`electronAPI.${method} is not available.`);
        return false;
    }

    return true;
}

// ======================================================
// MONEY FORMAT
// ======================================================

function formatMoney(value) {
    const number = Number(value) || 0;

    return `Rs. ${number.toLocaleString("en-PK", {
        maximumFractionDigits: 2
    })}`;
}

// ======================================================
// MONEY TEXT PARSER
// "Rs. 170" -> 170, "Rs. 1,700.50" -> 1700.5
// Purana regex [^0-9.-] "Rs." ka dot bacha leta tha
// jis se ".170" => 0.17 ban jata tha — ye us ka ilaaj hai.
// ======================================================

function parseMoneyText(text) {

    const m = String(text || "").match(
        /-?\d[\d,]*(?:\.\d+)?/
    );

    if (!m) return 0;

    return Number(m[0].replace(/,/g, "")) || 0;

}

function debounce(fn, wait = 300) {
    let timeoutId = null;
    return (...args) => {
        if (timeoutId) clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn(...args), wait);
    };
}

function deferBackgroundTask(task) {
    const run = () => {
        try {
            const result = task();
            if (result?.catch) result.catch(error => console.error("Background task error:", error));
        } catch (error) {
            console.error("Background task error:", error);
        }
    };

    if (typeof requestIdleCallback === "function") {
        requestIdleCallback(run, { timeout: 1000 });
    } else {
        setTimeout(run, 0);
    }
}

// ======================================================
// DATE FORMAT
// ======================================================

function formatDate(value) {
    if (!value) return "-";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return value;

    return date.toLocaleDateString("en-PK", {
        day: "2-digit",
        month: "short",
        year: "numeric"
    });
}

// ======================================================
// DASHBOARD BLUR (PRIVACY MODE)
// ======================================================

function getDashboardBlur() {
    try {
        return localStorage.getItem("dashboard_blur_mode") === "true";
    } catch (e) {
        return false;
    }
}

function setDashboardBlur(blurred) {
    try {
        localStorage.setItem("dashboard_blur_mode", blurred ? "true" : "false");
    } catch (e) {}
}

function applyDashboardBlur() {
    const blurred = getDashboardBlur();
    const content = document.getElementById("dashboardBlurableContent");
    const icon = document.getElementById("dashboardBlurIcon");
    const btn = document.getElementById("dashboardBlurToggle");

    if (content) {
        if (blurred) {
            content.classList.add("dashboard-blurred");
        } else {
            content.classList.remove("dashboard-blurred");
        }
    }

    if (icon) icon.textContent = blurred ? "🚫" : "👁";
    if (btn) btn.title = blurred ? "Show dashboard" : "Hide dashboard";
}

function toggleDashboardBlur() {
    const blurred = getDashboardBlur();
    setDashboardBlur(!blurred);
    applyDashboardBlur();
}

let dashboardRequestId = 0;
let dashboardAuthReady = false;
let dashboardAuthWaiters = [];

function setDashboardAuthState(user) {
    dashboardAuthReady = !!user;
    const waiters = dashboardAuthWaiters;
    dashboardAuthWaiters = [];
    waiters.forEach(resolve => resolve(dashboardAuthReady));
    window.dispatchEvent(new CustomEvent("pakkhatta-session-ready", {
        detail: { user: user || null }
    }));
}

function waitForDashboardAuth() {
    if (dashboardAuthReady) return Promise.resolve(true);
    return new Promise(resolve => dashboardAuthWaiters.push(resolve));
}

function dashboardDateValue(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function formatDashboardInputDate(value) {
    const parts = String(value || "").split("-");
    return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : value;
}

function getDashboardDateRange() {
    const preset = document.getElementById("dashboardDateRange")?.value || "today";
    const today = new Date();
    const todayValue = dashboardDateValue(today);

    if (preset === "custom") {
        const from = document.getElementById("dashboardFromDate")?.value || "";
        const to = document.getElementById("dashboardToDate")?.value || "";
        if (!from || !to) return null;
        return { from_date: from, to_date: to, label: `${formatDashboardInputDate(from)} - ${formatDashboardInputDate(to)}` };
    }

    if (preset === "yesterday") {
        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);
        const value = dashboardDateValue(yesterday);
        return { from_date: value, to_date: value, label: "Yesterday" };
    }

    if (preset === "week") {
        const weekStart = new Date(today);
        const day = weekStart.getDay();
        weekStart.setDate(today.getDate() - (day === 0 ? 6 : day - 1));
        return { from_date: dashboardDateValue(weekStart), to_date: todayValue, label: "This Week" };
    }

    if (preset === "month") {
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        return { from_date: dashboardDateValue(monthStart), to_date: todayValue, label: "This Month" };
    }

    if (preset === "yesterday") {
        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);
        const value = dashboardDateValue(yesterday);
        return { from_date: value, to_date: value };
    }

    if (preset === "week") {
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - today.getDay());
        return {
            from_date: dashboardDateValue(weekStart),
            to_date: todayValue
        };
    }

    if (preset === "all") {
        return { from_date: "1970-01-01", to_date: todayValue, label: "All Time" };
    }

    return { from_date: todayValue, to_date: todayValue, label: "Today" };
}

function updateDashboardPeriodLabels(label) {
    const periodLabel = document.getElementById("dashboardPeriodLabel");
    if (periodLabel) periodLabel.textContent = label;

    document.querySelectorAll("[data-dashboard-period-label]").forEach(element => {
        const suffix = element.dataset.dashboardPeriodLabel || "";
        element.textContent = `${label} ${suffix}`.trim();
    });

    document.querySelectorAll("[data-dashboard-period-subtitle]").forEach(element => {
        element.textContent = `${element.dataset.dashboardPeriodSubtitle || ""} ${label}`.trim();
    });
}

function updateDashboardCustomDateVisibility() {
    const custom = document.getElementById("dashboardCustomDates");
    const isCustom = document.getElementById("dashboardDateRange")?.value === "custom";
    if (custom) custom.style.display = isCustom ? "flex" : "none";
}

async function applyDashboardDateRange() {
    const range = getDashboardDateRange();
    if (!range) {
        showToast("Please select both custom dates.", "warning");
        return;
    }
    updateDashboardPeriodLabels(range.label);
    await loadDashboard(range);
}

// ======================================================
// DASHBOARD
// ======================================================

async function showDashboard() {

    const content =
        document.querySelector(".content");

    if (!content) return;

    content.innerHTML = `

        <div id="dashboardBlurableContent" class="${getDashboardBlur() ? 'dashboard-blurred' : ''}">

        <div class="page-title">

            <h1>
                Dashboard
            </h1>

            <p>
                Here's what's happening with your business for <strong id="dashboardPeriodLabel">Today</strong>.
            </p>

            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-top:12px;">
                <label for="dashboardDateRange" style="font-size:12px; color:#64748b; font-weight:700;">Period</label>
                <select id="dashboardDateRange" style="height:34px; padding:0 10px; border:1px solid #cbd5e1; border-radius:7px; background:#fff; color:#334155;">
                    <option value="today">Today</option>
                    <option value="yesterday">Yesterday</option>
                    <option value="week">This Week</option>
                    <option value="month">This Month</option>
                    <option value="all">All Time</option>
                    <option value="custom">Custom Range</option>
                </select>
                <div id="dashboardCustomDates" style="display:none; align-items:center; gap:6px; flex-wrap:wrap;">
                    <input id="dashboardFromDate" type="date" aria-label="Dashboard period start" style="height:34px; padding:0 8px; border:1px solid #cbd5e1; border-radius:7px;">
                    <span style="font-size:12px; color:#64748b;">to</span>
                    <input id="dashboardToDate" type="date" aria-label="Dashboard period end" style="height:34px; padding:0 8px; border:1px solid #cbd5e1; border-radius:7px;">
                    <button id="dashboardApplyDates" type="button" class="btn" style="height:34px; padding:0 12px;">Apply</button>
                </div>
            </div>

        </div>

        <div class="summary-grid">

            <div class="card">

                <div class="card-label" style="display:flex; justify-content:space-between; align-items:center;">
                    <span data-dashboard-period-label="Sales">Today Sales</span>
                    <button type="button" class="dashboard-clear-btn" onclick="clearDashboardCard('sales')">Clear</button>
                </div>

                <div
                    class="card-value"
                    id="dashboardSales"
                    style="color:#10b981; -webkit-text-fill-color:#10b981; font-weight:normal;"
                >
                    Rs. 0
                </div>

                <div
                    class="card-small"
                    id="dashboardSalesSmall"
                >
                    No sales today
                </div>

            </div>

            <div class="card">

                <div class="card-label" style="display:flex; justify-content:space-between; align-items:center;">
                    <span data-dashboard-period-label="Returns">Today Returns</span>
                    <button type="button" class="dashboard-clear-btn" onclick="clearDashboardCard('returns')">Clear</button>
                </div>

                <div
                    class="card-value"
                    id="dashboardReturns"
                    style="color:#ef4444; -webkit-text-fill-color:#ef4444; font-weight:normal;"
                >
                    Rs. 0
                </div>

                <div
                    class="card-small"
                    id="dashboardReturnsSmall"
                >
                    No returns today
                </div>

            </div>


            <div class="card">

                <div class="card-label" style="display:flex; justify-content:space-between; align-items:center;">
                    <span data-dashboard-period-label="Bank Transfer">Today Bank Transfer</span>
                    <button type="button" class="dashboard-clear-btn" onclick="clearDashboardCard('bankTransfer')">Clear</button>
                </div>

                <div
                    class="card-value"
                    id="dashboardBankTransfer"
                    style="color:#2563eb; -webkit-text-fill-color:#2563eb; font-weight:normal;"
                >
                    Rs. 0
                </div>

                <div
                    class="card-small"
                    id="dashboardBankTransferSmall"
                >
                    No bank transfers today
                </div>

            </div>


            <div class="card">

                <div class="card-label" style="display:flex; justify-content:space-between; align-items:center;">
                    <span data-dashboard-period-label="Purchase">Today Purchase</span>
                    <button type="button" class="dashboard-clear-btn" onclick="clearDashboardCard('purchase')">Clear</button>
                </div>

                <div
                    class="card-value"
                    id="dashboardPurchase"
                    style="color:#ef4444; -webkit-text-fill-color:#ef4444; font-weight:normal;"
                >
                    Rs. 0
                </div>

                <div class="card-small" id="dashboardPurchaseSmall">
                    No purchases today
                </div>

            </div>


            <div class="card">

                <div class="card-label" data-dashboard-period-label="Receive">
                    You'll Receive
                </div>

                <div
                    class="card-value"
                    id="dashboardReceive"
                    style="color:#10b981; -webkit-text-fill-color:#10b981; font-weight:normal;"
                >
                    Rs. 0
                </div>

                <div class="card-small" data-dashboard-period-subtitle="Customer receivables">
                    Customer receivables
                </div>

            </div>


            <div class="card">

                <div class="card-label" data-dashboard-period-label="Pay">
                    You'll Pay
                </div>

                <div
                    class="card-value"
                    id="dashboardPay"
                    style="color:#ef4444; -webkit-text-fill-color:#ef4444; font-weight:normal;"
                >
                    Rs. 0
                </div>

                <div class="card-small" data-dashboard-period-subtitle="Supplier payables">
                    Supplier payables
                </div>

            </div>


            <div class="card">

                <div class="card-label" data-dashboard-period-label="Stock">
                    Stock Value
                </div>

                <div
                    class="card-value"
                    id="dashboardStock"
                    style="color:#1e293b; -webkit-text-fill-color:#1e293b; font-weight:normal;"
                >
                    Rs. 0
                </div>

                <div class="card-small" data-dashboard-period-subtitle="Inventory value through">
                    Current inventory value
                </div>

            </div>


            <div class="card">

                <div class="card-label" data-dashboard-period-label="Cash In & Out">
                    Cash In & Out
                </div>

                <div
                    class="card-value"
                    id="dashboardCash"
                    style="color:#10b981; -webkit-text-fill-color:#10b981; font-weight:normal;"
                >
                    Rs. 0
                </div>

                <div class="card-small" data-dashboard-period-subtitle="Net cash movement for">
                    Available cash
                </div>

            </div>


            <div class="card">

                <div class="card-label" data-dashboard-period-label="Items">
                    Total Items
                </div>

                <div
                    class="card-value"
                    id="dashboardTotalItems"
                    style="color:#000000; -webkit-text-fill-color:#000000; font-weight:normal;"
                >
                    0
                </div>

                <div class="card-small" data-dashboard-period-subtitle="Items registered through">
                    Stock items
                </div>

            </div>


            <div class="card">

                <div class="card-label" data-dashboard-period-label="Bank">
                    Bank Balance
                </div>

                <div
                    class="card-value"
                    id="dashboardBank"
                    style="color:#10b981; -webkit-text-fill-color:#10b981; font-weight:normal;"
                >
                    Rs. 0
                </div>

                <div class="card-small" data-dashboard-period-subtitle="Bank movement for">
                    Total bank balance
                </div>

            </div>


            <div class="card">

                <div class="card-label" data-dashboard-period-label="Expenses">
                    Expenses
                </div>

                <div
                    class="card-value"
                    id="dashboardExpenses"
                    style="color:#ef4444; -webkit-text-fill-color:#ef4444; font-weight:normal;"
                >
                    Rs. 0
                </div>

                <div class="card-small" id="dashboardExpensesSmall" data-dashboard-period-subtitle="Expenses for">
                    Current month
                </div>

            </div>
            <div class="card">
                <div class="card-label" data-dashboard-period-label="Advance Bookings">
                    Advance Bookings
                </div>
                <div
                    class="card-value"
                    id="dashboardAdvanceCount"
                    style="color:#7c3aed; -webkit-text-fill-color:#7c3aed; font-weight:normal;"
                >
                    0
                </div>
                <div class="card-small" data-dashboard-period-subtitle="Pending bookings for">
                    Total active bookings
                </div>
            </div>

        </div>


        <div class="dashboard-grid">

            <div class="panel">

                    <div class="panel-header">

                    <h3>
                        Recent Transactions
                    </h3>

                    <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; justify-content:flex-end;">
                        <input id="dashboardTransactionDate" type="date" aria-label="Search transactions by date" title="Search transactions by date" style="height:34px;padding:0 8px;border:1px solid #cbd5e1;border-radius:7px;">
                        <span
                            class="panel-link"
                            id="dashboardViewSales"
                            style="cursor:pointer;"
                        >
                            View All
                        </span>
                    </div>

                </div>


                <table class="table">

                    <thead>

                        <tr>

                            <th>Date</th>
                            <th>Type</th>
                            <th>Party / Name</th>
                            <th>Amount</th>
                            <th>Detail</th>

                        </tr>

                    </thead>


                    <tbody id="recentTransactions">

                        <tr>

                            <td colspan="5">

                                <div class="empty-state">
                                    Loading...
                                </div>

                            </td>

                        </tr>

                    </tbody>

                </table>

            </div>


            <div class="panel">

                <div class="panel-header">

                    <h3>
                        Low Stock
                    </h3>

                    <span
                        class="panel-link"
                        id="dashboardViewItems"
                        style="cursor:pointer;"
                    >
                        View Items
                    </span>

                </div>


                <div id="lowStockContainer">

                    <div class="stock-item">

                        <span class="stock-name">
                            Loading...
                        </span>

                    </div>

                </div>

                <div class="panel-header" style="margin-top:20px;">
                    <h3>Expiry Alerts</h3>
                    <span class="panel-link" onclick="navigateTo('items')" style="cursor:pointer;">View Items</span>
                </div>

                <div id="expiryAlertContainer">
                    <div class="stock-item">
                        <span class="stock-name">No expiry alerts</span>
                    </div>
                </div>

            </div>

        </div>
    `;


    document.getElementById("dashboardViewSales")
        ?.addEventListener(
            "click",
            showSales
        );

    document
        .getElementById("dashboardViewItems")
        ?.addEventListener(
            "click",
            showItems
        );

    document.getElementById("dashboardTransactionDate")?.addEventListener("change", filterDashboardTransactionsByDate);

    document.getElementById("dashboardDateRange")?.addEventListener("change", async () => {
        updateDashboardCustomDateVisibility();
        if (document.getElementById("dashboardDateRange")?.value !== "custom") {
            await applyDashboardDateRange();
        }
    });
    document.getElementById("dashboardApplyDates")?.addEventListener("click", applyDashboardDateRange);
    document.getElementById("dashboardFromDate")?.addEventListener("change", () => {
        if (document.getElementById("dashboardToDate")?.value) applyDashboardDateRange();
    });
    document.getElementById("dashboardToDate")?.addEventListener("change", () => {
        if (document.getElementById("dashboardFromDate")?.value) applyDashboardDateRange();
    });

    // Restore dashboard blur state from localStorage
    applyDashboardBlur();

    // Attach blur toggle listener
    const dashboardBlurToggle = document.getElementById("dashboardBlurToggle");
    if (dashboardBlurToggle) {
        dashboardBlurToggle.onclick = toggleDashboardBlur;
    }

    const hasSession = await waitForDashboardAuth();
    if (hasSession) await loadDashboard(getDashboardDateRange());

    // یہاں پرپل KPI کارڈ کی تعداد اپڈیٹ کرنے کے لیے فنکشن کال کریں
    

    applyRoleDashboardView();

    // The business name no longer lives on the dashboard —
    // it is kept live in the top header instead.
    await updateTopbarCompanyName();
}
function updateDashboardAdvanceCount() {
    // Dashboard par mojood advance count element ko pakrein
    const advanceCountElement = document.getElementById("advanceBookingsCount") || 
                                document.getElementById("dashboardAdvanceCount") || 
                                document.getElementById("advanceCount") ||
                                document.querySelector(".advance-bookings-count") ||
                                document.querySelector("[data-stat='advance']");

    if (advanceCountElement) {
        try {
            const count = getAdvanceAlertBookings().length;
            advanceCountElement.textContent = count;
            advanceCountElement.style.color = "#7c3aed";
            advanceCountElement.style.webkitTextFillColor = "#7c3aed";
            advanceCountElement.style.fontWeight = "normal";
        } catch (err) {
            console.error("Error loading advance bookings count for dashboard:", err);
        }
    }
}


// ======================================================
// TOPBAR COMPANY SWITCHER
// The business name lives in the top header (like Vyapar's
// "My Business / Change Company" switcher). Clicking it opens
// a popup to change the name — once saved, the new name shows
// in the topbar and is printed automatically on every invoice.
// ======================================================

async function getCompanySafe() {

    if (!apiReady("getCompany")) return null;

    try {

        const result =
            await window.electronAPI.getCompany();

        return result?.success ? result.company : null;

    } catch (error) {

        console.error("Get company error:", error);
        return null;

    }

}

async function updateTopbarCompanyName() {

    const company = await getCompanySafe();

    const el =
        document.getElementById("topbarCompanyName");

    if (el) {

        el.textContent =
            String(company?.name || "").trim() || "My Business";

    }

}

async function showCompanySwitcher() {

    closeCompanySwitcher();


    const overlay = document.createElement("div");

    overlay.id = "companySwitcherOverlay";
    overlay.className = "modal-overlay";
    overlay.dataset.previousFocusId = document.activeElement?.id || "";
    overlay.__previousFocus = document.activeElement;

    overlay.innerHTML = `

        <div class="modal-box">
            <div class="modal-header">
                <h3>Switch Account</h3>

                <button type="button" class="modal-close"
                    onclick="closeCompanySwitcher()">×</button>

                </div>

            <p class="modal-hint">
                Select a business or add a new one. Every business
                keeps its own separate data.
            </p>


            <div class="account-list" id="accountList">
                <div class="account-loading">Loading...</div>
            </div>


            <button type="button" class="btn-add-account"
                onclick="toggleAddAccountForm()">
                + Add New Business
            </button>


            <div id="addAccountForm" style="display:none;">

                <label>Business Name *</label>
                <input id="newBusinessName" type="text"
                    placeholder="e.g. Ali General Store">


                <label>Phone Number</label>
                <input id="newBusinessPhone" type="text"
                    placeholder="e.g. 0300-1234567">


                <label>Address</label>
                <input id="newBusinessAddress" type="text"
                    placeholder="e.g. Main Bazar, Lahore">


                <div class="modal-actions">

                    <button type="button" class="btn btn-sale"
                        onclick="createBusinessFromHeader()">
                        ✓ Create &amp; Switch
                    </button>


                    <button type="button" class="btn"
                        onclick="toggleAddAccountForm()">
                        Cancel
                    </button>

                </div>

            </div>

        </div>

    `;


    overlay.addEventListener("click", (event) => {

        if (event.target === overlay) {
            closeCompanySwitcher();
        }

    });


    document.body.appendChild(overlay);


    void renderAccountList();
}

async function loadBusinessAccounts() {

    if (!apiReady("getCompanies")) {
        return { companies: [], activeId: null };
    }

    try {

        const result =
            await window.electronAPI.getCompanies();

        if (result?.success) {
            return {
                companies: result.companies || [],
                activeId: result.activeId
            };
        }

    } catch (error) {
        console.error("Get companies error:", error);
    }

    return { companies: [], activeId: null };

}

function closeCompanySwitcher() {

    const overlay = document.getElementById("companySwitcherOverlay");
    if (!overlay) return;

    const previousFocus = overlay.__previousFocus;
    const previousFocusId = overlay.dataset.previousFocusId;
    window.__accountListRequestId = (window.__accountListRequestId || 0) + 1;
    overlay.style.pointerEvents = "none";
    overlay.remove();
    document.body.style.pointerEvents = "";
    window.focus();

    if (previousFocus?.isConnected) {
        previousFocus.focus();
    } else if (previousFocusId) {
        document.getElementById(previousFocusId)?.focus();
    }

}

async function renderAccountList() {

    const listEl = document.getElementById("accountList");
    if (!listEl) return;

    const overlay = document.getElementById("companySwitcherOverlay");
    const requestId = (window.__accountListRequestId || 0) + 1;
    window.__accountListRequestId = requestId;

    const { companies, activeId } =
        await loadBusinessAccounts();

    if (requestId !== window.__accountListRequestId ||
        !overlay?.isConnected ||
        document.getElementById("companySwitcherOverlay") !== overlay) {
        return;
    }

    if (!companies.length) {

        listEl.innerHTML =
            '<div class="account-loading">No business found.</div>';
        return;

    }


    listEl.innerHTML = companies.map((biz) => {

        const isActive =
            Number(biz.id) === Number(activeId);

        const initial =
            String(biz.name || "?").trim().charAt(0).toUpperCase()
            || "?";

        return `
            <div class="account-item${isActive ? " active" : ""}">

                <div class="account-avatar">
                    ${escapeHTML(initial)}
                </div>

                <div class="account-info" onclick="switchAccountTo(${Number(biz.id)})">
                    <div class="account-name">
                        ${escapeHTML(String(biz.name || ""))}
                    </div>
                    <div class="account-sub">
                        ${isActive ? "Currently active" : "Tap to switch"}
                    </div>
                </div>

                <button type="button" class="account-delete-btn"
                    title="Delete account"
                    onclick="deleteBusiness(${Number(biz.id)})">×</button>

                ${isActive ? `
                    <svg class="account-check" viewBox="0 0 24 24">
                        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                    </svg>
                ` : ""}

            </div>
        `;

    }).join("");

}

function toggleAddAccountForm() {

    const form =
        document.getElementById("addAccountForm");

    if (!form) return;

    form.style.display =
        form.style.display === "none" ? "block" : "none";

    if (form.style.display === "block") {
        document.getElementById("newBusinessName")?.focus();
    }

}

async function reloadCurrentPageData() {

    const currentPage =
        document.querySelector(".menu-item.active")?.dataset.page
        || "dashboard";

    if (typeof navigateTo === "function") {
        return await navigateTo(currentPage);
    }

}

async function switchAccountTo(businessId) {

    const requestId = ++accountSwitchRequestId;

    if (!apiReady("setActiveCompany")) {

        alert("Switch account API is not available.");
        return;

    }

    // Invalidate dashboard responses that started before the account switch.
    dashboardRequestId++;
    clearDashboardAlerts();
    activeBusinessId = null;
    closeCompanySwitcher();
    resetGlobalUiLocks();


    try {

        const result =
            await window.electronAPI.setActiveCompany(businessId);


        if (result?.success) {
            if (requestId !== accountSwitchRequestId) return;
            await syncActiveBusinessContext();
            await updateTopbarCompanyName();
            await reloadCurrentPageData();

        } else {
            if (requestId !== accountSwitchRequestId) return;

            alert(result?.error || "Failed to switch account.");

        }

    } catch (error) {

        if (requestId !== accountSwitchRequestId) return;

        console.error("Switch account error:", error);

        alert(
            "Failed to switch account: " + error.message
        );

    }

}

async function createBusinessFromHeader() {

    const name =
        document
            .getElementById("newBusinessName")
            ?.value
            .trim();


    if (!name) {

        alert("Business name is required.");
        return;

    }


    if (!apiReady("addCompany")) {

        alert("Add business API is not available.");
        return;

    }


    try {

        const result =
            await window.electronAPI.addCompany({

                name,

                phone:
                    document
                        .getElementById("newBusinessPhone")
                        ?.value
                        .trim()
                    || "",

                address:
                    document
                        .getElementById("newBusinessAddress")
                        ?.value
                        .trim()
                    || ""

            });


        if (result?.success) {

            closeCompanySwitcher();

            void updateTopbarCompanyName();
            setTimeout(() => reloadCurrentPageData(), 0);

            alert('"' + name + '" created and activated.');

        } else {

            alert(result?.error || "Failed to create business.");

        }

    } catch (error) {

        console.error("Create business error:", error);

        alert(
            "Failed to create business: " + error.message
        );

    }

}

async function deleteBusiness(businessId) {

    if (!await showAppConfirm(
        "Delete this business account? Its database and all data " +
        "will be permanently removed.",
        { title: "Delete Business Account", confirmText: "Delete" }
    )) return;
    if (!await verifyDeleteSystemFunctionPassword("deleting this business account")) return;

    if (!apiReady("deleteCompany")) {
        alert("Delete business API is not available.");
        return;
    }

    try {

        const result =
            await window.electronAPI.deleteCompany(businessId);

        if (result?.success) {

            await renderAccountList();
            await updateTopbarCompanyName();
            reloadCurrentPageData();

        } else {

            alert(result?.error || "Failed to delete business.");

        }

    } catch (error) {

        console.error("Delete business error:", error);
        alert("Failed to delete business: " + error.message);

    }

}

// ======================================================
// LOAD DASHBOARD
// ======================================================

async function loadDashboard(range = getDashboardDateRange()) {

    if (!dashboardAuthReady) return;

    if (!apiReady("getDashboardData")) {

        console.error(
            "Dashboard API is not available."
        );

        return;

    }


    if (!range) return;

    const requestId = ++dashboardRequestId;

    try {

        const data =
            await window.electronAPI.getDashboardData(range);

        if (requestId !== dashboardRequestId) return;


        if (!data) {

            console.error(
                "Dashboard returned empty data."
            );

            return;

        }


        const salesElement =
            document.getElementById(
                "dashboardSales"
            );


        const purchaseElement =
            document.getElementById(
                "dashboardPurchase"
            );


        const receiveElement =
            document.getElementById(
                "dashboardReceive"
            );


        const payElement =
            document.getElementById(
                "dashboardPay"
            );


        const stockElement =
            document.getElementById(
                "dashboardStock"
            );


        const cashElement =
            document.getElementById(
                "dashboardCash"
            );

        const totalItemsElement =
            document.getElementById(
                "dashboardTotalItems"
            );


        const bankElement =
            document.getElementById(
                "dashboardBank"
            );


        const expensesElement =
            document.getElementById(
                "dashboardExpenses"
            );


        if (salesElement) {

            // Net sales (Sales - Returns), lekin minus me kabhi nahi
            const netSales =
                Math.max(0, Number(data.todaySalesNet ?? data.todaySales ?? 0));

            salesElement.textContent =
                formatMoney(netSales);
            salesElement.style.color = "#10b981";
            salesElement.style.webkitTextFillColor = "#10b981";
            salesElement.style.fontWeight = "normal";

        }


        // Today's Returns card — date info ke sath
        const returnsElement =
            document.getElementById("dashboardReturns");

        const returnsSmall =
            document.getElementById("dashboardReturnsSmall");

        if (returnsElement) {
            returnsElement.textContent =
                formatMoney(data.todayReturns || 0);
            returnsElement.style.color = "#ef4444";
            returnsElement.style.webkitTextFillColor = "#ef4444";
            returnsElement.style.fontWeight = "normal";
        }

        if (returnsSmall) {

            const returnCount =
                Number(data.todayReturnsCount || 0);

            if (returnCount > 0) {
                returnsSmall.textContent =
                    returnCount + " return" +
                    (returnCount > 1 ? "s" : "") +
                    " today (adjusted in sales)";
            } else {
                returnsSmall.textContent =
                    `No returns in ${range.label.toLowerCase()}`;
            }

        }


        // Today's Bank Transfer — sirf asli transfers (Cash<->Bank)
        const bankTransferEl =
            document.getElementById("dashboardBankTransfer");

        const bankTransferSmallEl =
            document.getElementById("dashboardBankTransferSmall");

        if (bankTransferEl) {
            bankTransferEl.textContent =
                Number(data.todayBankTransferCount || data.todayBankTransfer || 0).toLocaleString();
            bankTransferEl.style.color = "#2563eb";
            bankTransferEl.style.webkitTextFillColor = "#2563eb";
            bankTransferEl.style.fontWeight = "normal";
        }

        if (bankTransferSmallEl) {

            const transferCount =
                Number(data.todayBankTransferCount || 0);

            bankTransferSmallEl.textContent =
                transferCount > 0
                    ? transferCount + " transfer" +
                      (transferCount > 1 ? "s" : "") + " today"
                    : `No bank transfers in ${range.label.toLowerCase()}`;

        }


        if (purchaseElement) {

            purchaseElement.textContent =
                formatMoney(
                    data.todayPurchase || 0
                );
            purchaseElement.style.color = "#ef4444";
            purchaseElement.style.webkitTextFillColor = "#ef4444";
            purchaseElement.style.fontWeight = "normal";

        }

        const purchaseSmall = document.getElementById("dashboardPurchaseSmall");
        if (purchaseSmall) {
            purchaseSmall.textContent = `Purchases in ${range.label.toLowerCase()}`;
        }

        const expensesSmall = document.getElementById("dashboardExpensesSmall");
        if (expensesSmall) {
            expensesSmall.textContent = `Expenses in ${range.label.toLowerCase()}`;
        }


        if (receiveElement) {

            receiveElement.textContent =
                formatMoney(
                    data.receivables
                );
            receiveElement.style.color = "#10b981";
            receiveElement.style.webkitTextFillColor = "#10b981";
            receiveElement.style.fontWeight = "normal";

        }


        if (payElement) {

            payElement.textContent =
                formatMoney(
                    data.payables
                );
            payElement.style.color = "#ef4444";
            payElement.style.webkitTextFillColor = "#ef4444";
            payElement.style.fontWeight = "normal";

        }


        if (stockElement) {

            stockElement.textContent =
                formatMoney(
                    data.stockValue
                );
            stockElement.style.color = "#1e293b";
            stockElement.style.webkitTextFillColor = "#1e293b";
            stockElement.style.fontWeight = "normal";

        }


        if (cashElement) {
            const cashAmount = Number(data.cashInHand ?? data.cash ?? 0);
            cashElement.textContent = formatMoney(cashAmount);
            cashElement.style.color = "#10b981";
            cashElement.style.webkitTextFillColor = "#10b981";
            cashElement.style.fontWeight = "normal";
        }

        if (totalItemsElement) {
            const totalItems = Number(data.totalItems || 0);
            totalItemsElement.textContent = totalItems.toLocaleString("en-PK");
            totalItemsElement.style.color = "#000000";
            totalItemsElement.style.webkitTextFillColor = "#000000";
            totalItemsElement.style.fontWeight = "normal";
        }


        if (bankElement) {

            bankElement.textContent =
                formatMoney(
                    Math.abs(Number(data.bankBalance ?? data.bank_balance ?? 0))
                );
            bankElement.style.color = "#10b981";
            bankElement.style.webkitTextFillColor = "#10b981";
            bankElement.style.fontWeight = "normal";

        }


        if (expensesElement) {

            expensesElement.textContent =
                formatMoney(
                    data.expenses
                );
            expensesElement.style.color = "#ef4444";
            expensesElement.style.webkitTextFillColor = "#ef4444";
            expensesElement.style.fontWeight = "normal";

        }
        


        const salesSmall =
            document.getElementById(
                "dashboardSalesSmall"
            );


        if (salesSmall) {

            const gross =
                Number((data.todaySalesGross ?? data.todaySales) || 0);

            const rets =
                Number(data.todayReturns || 0);

            const net =
                Number(data.todaySalesNet ?? gross - rets);

                if (gross > 0 || rets > 0) {

                salesSmall.textContent =
                    "Sale " + formatMoney(gross) +
                    " \u2212 Return " + formatMoney(rets);

            } else {

                    salesSmall.textContent = `${range.label} Sales`;

            }

        }


        renderRecentTransactions(
            data.recentTransactions
        );


        renderLowStock(
            data.lowStock
        );

        renderExpiryAlerts(data.expiryAlerts);

        showInventoryAlertPopups(data.lowStock, data.expiryAlerts);

        // Advance Bookings KPI Card Update (Added safely here)
        // Advance Bookings KPI Card Update (Using localStorage)
        const advanceCountElement = document.getElementById("dashboardAdvanceCount");
        if (advanceCountElement) {
    try {
        const count = getAdvanceBookingsForRange(range).length;
        advanceCountElement.textContent = count;
        advanceCountElement.style.color = "#7c3aed";
        advanceCountElement.style.webkitTextFillColor = "#7c3aed";
        advanceCountElement.style.fontWeight = "normal";
    } catch (err) {
        console.error("Error loading advance bookings count for dashboard:", err);
    }
}

        // Har card par 3-dots (⋮) detail button lagao
        addDashboardCardMenus();

    } catch (error) {

        console.error(
            "Load dashboard error:",
            error
        );


        const transactionList =
            document.getElementById(
                "recentTransactions"
            );


        if (transactionList) {

            transactionList.innerHTML = `

                <tr>

                    <td colspan="4">

                        <div class="empty-state">
                            Failed to load dashboard data.
                        </div>

                    </td>

                </tr>

            `;

        }

    }

}

// ======================================================
function clearDashboardCard(type) {

    const map = {
        sales:        { value: "dashboardSales",        small: "dashboardSalesSmall",        text: "No sales today",        color: "#10b981" },
        returns:      { value: "dashboardReturns",      small: "dashboardReturnsSmall",      text: "No returns today",      color: "#ef4444" },
        bankTransfer: { value: "dashboardBankTransfer", small: "dashboardBankTransferSmall", text: "No bank transfers today", color: "#2563eb" },
        purchase:     { value: "dashboardPurchase",     small: "dashboardPurchaseSmall",     text: "No purchases today",     color: "#ef4444" }
    };

    const cfg = map[type];
    if (!cfg) return;

    const valueEl = document.getElementById(cfg.value);
    const smallEl = document.getElementById(cfg.small);

    if (valueEl) {
        valueEl.textContent = formatMoney(0);
        valueEl.style.color = cfg.color;
        valueEl.style.webkitTextFillColor = cfg.color;
        valueEl.style.fontWeight = "normal";
    }
    if (smallEl) smallEl.textContent = cfg.text;

}

// ======================================================
// RENDER RECENT TRANSACTIONS
// ======================================================

function renderRecentTransactions(
    transactions
) {

    const list =
        document.getElementById(
            "recentTransactions"
        );


    if (!list) return;


    if (
        !Array.isArray(transactions) ||
        transactions.length === 0
    ) {

        list.innerHTML = `

            <tr>

                <td colspan="5">

                    <div class="empty-state">
                        No transactions available
                    </div>

                </td>

            </tr>

        `;

        return;

    }


    list.innerHTML =
        transactions
            .map(transaction => {

                const refId = Number(transaction.ref_id) || 0;
                const txType = String(transaction.type || "").toLowerCase();
                const isCashInflow = txType === "sale" || txType === "payment in";
                const amountColor = isCashInflow ? "color:#10b981;" : "color:#ef4444;";

                return `

                    <tr>

                        <td>
                            ${escapeHTML(
                                formatDate(transaction.date)
                            )}
                        </td>

                        <td>
                            ${escapeHTML(
                                transaction.type || "-"
                            )}
                        </td>

                        <td>
                            <b>${escapeHTML(
                                transaction.party || "-"
                            )}</b>
                            ${transaction.ref_no ? `
                                <br><span style="font-size:11px; color:#94a3b8;">
                                    ${escapeHTML(transaction.ref_no)}
                                </span>
                            ` : ""}
                        </td>

                        <td>
                            <span style="${amountColor} font-weight:600;">
                            ${formatMoney(
                                transaction.amount
                            )}
                            </span>
                        </td>

                        <td>
                            ${
                                refId
                                    ? `<button class="btn btn-sale"
                                            style="padding:4px 10px; font-size:11px;"
                                            onclick="openTransactionDetail(
                                                '${escapeHTML(transaction.type || "")}',
                                                ${refId})">
                                            🔍 See Detail
                                        </button>`
                                    : "-"
                            }
                        </td>

                    </tr>

                `;

            })
            .join("");

}

async function filterDashboardTransactionsByDate(event) {
    const date = event.target.value;
    if (!date) {
        await loadDashboard();
        return;
    }
    if (!apiReady("getDashboardTransactions")) return;
    const list = document.getElementById("recentTransactions");
    if (list) list.innerHTML = '<tr><td colspan="5"><div class="empty-state">Loading...</div></td></tr>';
    try {
        const result = await window.electronAPI.getDashboardTransactions(date);
        if (result?.success) renderRecentTransactions(result.transactions);
        else showToast(result?.error || "Failed to filter transactions.");
    } catch (error) {
        console.error("Dashboard transaction filter error:", error);
        showToast("Failed to filter transactions: " + error.message);
    }
}

async function deleteAllDashboardTransactions() {
    if (!await showAppConfirm("Delete all transaction history?", { title: "Clear Transaction History", confirmText: "Delete All" })) return;
    if (!await verifyDeleteSystemFunctionPassword("deleting all transaction history")) return;
    if (!apiReady("deleteAllTransactions")) return showToast("Delete All API is not available.");
    const button = document.getElementById("dashboardDeleteAllTransactions");
    if (button) button.disabled = true;
    try {
        const result = await window.electronAPI.deleteAllTransactions();
        if (result?.success) {
            showToast("Transaction history deleted.", "success");
            await loadDashboard();
        } else showToast(result?.error || "Failed to delete transaction history.");
    } catch (error) {
        console.error("Delete dashboard transactions error:", error);
        showToast("Failed to delete transaction history: " + error.message);
    } finally {
        if (button) button.disabled = false;
    }
}

async function restoreDashboardTransactions() {
    if (!apiReady("restoreTransactions")) return showToast("Restore API is not available.");
    const button = document.getElementById("dashboardRestoreTransactions");
    if (button) button.disabled = true;
    try {
        const result = await window.electronAPI.restoreTransactions();
        if (result?.success) {
            showToast(`${result.restored || 0} transaction record(s) restored.`, "success");
            await loadDashboard();
        } else showToast(result?.error || "Failed to restore transactions.");
    } catch (error) {
        console.error("Restore dashboard transactions error:", error);
        showToast("Failed to restore transactions: " + error.message);
    } finally {
        if (button) button.disabled = false;
    }
}
// ======================================================
// RENDER LOW STOCK (Clean & Single Instance)
// ======================================================

function renderLowStock(lowStock) {
    const container = document.getElementById("lowStockContainer");
    if (!container) return;

    if (!Array.isArray(lowStock) || lowStock.length === 0) {
        container.innerHTML = `
            <div class="stock-item">
                <span class="stock-name">No low stock items</span>
                <span class="stock-count">✓</span>
            </div>
            <div class="stock-item">
                <span class="stock-name">All inventory looks good</span>
            </div>
        `;
        return;
    }

    container.innerHTML = lowStock.map(item => {
        const itemName =
            item.name ||
            item.item_name ||
            item.ITEM_NAME ||
            item.title ||
            item.product_name ||
            item.code ||
            "Unnamed Item";
        const stock = Number(item.stock || item.quantity || 0);
        const unit = item.unit || "";
        const minimumStock = Number(item.low_stock_limit) || 0;

        return `
            <div class="stock-item">
                <span class="stock-name">
                    ${escapeHTML(itemName)}
                </span>
                <span class="stock-count">
                    ${stock.toLocaleString()} ${escapeHTML(unit)} left (minimum ${minimumStock.toLocaleString()})
                </span>
            </div>
        `;
    }).join("");
}

function renderExpiryAlerts(expiryAlerts) {
    const container = document.getElementById("expiryAlertContainer");
    if (!container) return;

    if (!Array.isArray(expiryAlerts) || expiryAlerts.length === 0) {
        container.innerHTML = `
            <div class="stock-item">
                <span class="stock-name">No expired or near-expiry items</span>
                <span class="stock-count">✓</span>
            </div>`;
        return;
    }

    container.innerHTML = expiryAlerts.map(item => {
        const itemName =
            item.name ||
            item.item_name ||
            item.itemName ||
            "Unnamed Item";
        const expiryDate = item.expiry_date || item.current_expiry_date || "";
        const daysRemaining = Number(item.days_remaining);
        const expiryStatus = String(
            item.expiry_status ||
            (daysRemaining < 0
                ? "EXPIRED"
                : daysRemaining === 0
                    ? "EXPIRES TODAY"
                    : "EXPIRING SOON")
        ).toUpperCase();

        return `
            <div class="stock-item">
                <span class="stock-name">
                    ${escapeHTML(itemName)}
                    <small style="display:block;color:#64748b;">Expiry: ${escapeHTML(expiryDate)} | Stock: ${Number(item.stock || 0).toLocaleString()} ${escapeHTML(item.unit || "")}</small>
                </span>
                <span class="stock-count" style="color:${expiryStatus === "EXPIRED" ? "#b91c1c" : "#a16207"};">
                    ${escapeHTML(expiryStatus)}${expiryStatus === "EXPIRED"
                        ? ` (${Math.abs(daysRemaining) || 0} days ago)`
                        : expiryStatus === "EXPIRES TODAY"
                            ? ""
                            : ` (${Number.isFinite(daysRemaining) ? daysRemaining : 0} days)`}
                </span>
            </div>
        `;
    }).join("");
}

// ======================================================
// SHOW INVENTORY & ADVANCE PICKUP ALERTS (Guaranteed Working)
// ======================================================

function showInventoryAlertPopups(lowStock, expiryAlerts) {
    const alerts = [];

    // 1. ADVANCE BOOKINGS PICKUP CHECK (TOP PRIORITY - sab se pehle yeh dikhega)
    try {
        getAdvanceAlertBookings().forEach(b => {
            const alertDate = getAdvanceAlertDate(b);
            alerts.push({
                key: `adv-${alertDate}:${b.id}:${b.pickupDate || b.pickup_date}`,
                title: alertDate === "today" ? "Advance Booking Due Today" : "Advance Booking Due Tomorrow",
                message: alertDate === "today"
                    ? `Customer: ${b.customerName} (${b.customerPhone}) is due TODAY to pick up: ${b.itemDetails} [Delivery: ${b.deliveryType}].`
                    : `Customer: ${b.customerName} (${b.customerPhone}) is scheduled for TOMORROW: ${b.itemDetails} [Delivery: ${b.deliveryType}].`,
                color: alertDate === "today" ? "#b91c1c" : "#d97706",
                background: alertDate === "today" ? "#fef2f2" : "#fffbeb",
                border: alertDate === "today" ? "#fca5a5" : "#fcd34d"
            });
        });
    } catch (err) {
        console.error("Error reading advance bookings for pickup alerts:", err);
    }

    // 2. Low Stock Alerts
    if (Array.isArray(lowStock)) {
        lowStock.forEach(item => {
            const itemName = item.name || item.item_name || item.title || "Unnamed Item";
            alerts.push({
                key: `low:${item.id}`,
                title: "LOW STOCK",
                message: `${itemName}: ${Number(item.stock || item.quantity || 0).toLocaleString()} left.`,
                color: "#b45309",
                background: "#fffbeb",
                border: "#fcd34d"
            });
        });
    }

    // 3. Expiry Alerts
    if (Array.isArray(expiryAlerts)) {
        expiryAlerts.forEach(item => {
            const itemName = item.name || item.item_name || "Unnamed Item";
            alerts.push({
                key: `expiry:${item.id}`,
                title: item.expiry_status || "EXPIRY ALERT",
                message: `${itemName} is expiring soon.`,
                color: "#a16207",
                background: "#fffbeb",
                border: "#fcd34d"
            });
        });
    }

    // Show the highest priority alert immediately
    if (alerts.length > 0) {
        const alertData = alerts[0];
        const shownKey = `pakKhatta_advance_alert_shown:${getAdvanceKey()}:${getLocalDateString()}:${alertData.key}`;
        if (!sessionStorage.getItem(shownKey)) {
            sessionStorage.setItem(shownKey, "1");
            showInventoryToast(alertData);
        }
    }
}

function showInventoryToast(alertData) {
    // پرانا ٹॉسٹ ہٹا دیں تاکہ اوورلیپ نہ ہو
    document.getElementById("customInventoryToast")?.remove();

    const toast = document.createElement("div");
    toast.id = "customInventoryToast";
    toast.style.cssText = [
        "position:fixed", "top:20px", "right:20px", "z-index:99999",
        "width:360px", "padding:16px", "border-radius:12px",
        `background:${alertData.background}`, `border:1px solid ${alertData.border}`,
        `color:${alertData.color}`, "box-shadow:0 10px 30px rgba(0,0,0,0.2)",
        "font-size:13px", "line-height:1.5", "font-family:inherit"
    ].join(";");

    toast.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
            <strong style="font-size:14px; margin-bottom:4px; display:block;">${escapeHTML(alertData.title)}</strong>
            <button onclick="this.parentElement.parentElement.remove()" style="background:none; border:none; font-size:16px; cursor:pointer; color:inherit; font-weight:bold;">&times;</button>
        </div>
        <span>${escapeHTML(alertData.message)}</span>
    `;

    document.body.appendChild(toast);
    
    // 9 سیکنڈ بعد خود بخود غائب ہوگا
    setTimeout(() => toast.remove(), 9000);
}

function applyRoleDashboardView() {
    const role = String(window.pakkhattaRole || "owner").toLowerCase();
    const hiddenByRole = {
        manager: ["dashboardReceive", "dashboardPay", "dashboardCash", "dashboardBank", "dashboardExpenses"],
        salesman: ["dashboardPurchase", "dashboardReceive", "dashboardPay", "dashboardStock", "dashboardCash", "dashboardBank", "dashboardExpenses"],
        cashier: ["dashboardPurchase", "dashboardReceive", "dashboardPay", "dashboardStock", "dashboardBank", "dashboardExpenses"]
    }[role] || [];

    document.querySelectorAll(".card").forEach(card => {
        if (card.closest(".dashboard-grid")) return;
        card.style.display = "";
    });

    hiddenByRole.forEach(id => {
        document.getElementById(id)?.closest(".card")?.style.setProperty("display", "none");
    });
}

// ======================================================
// PARTIES
// ======================================================

async function showParties() {

    const content =
        document.querySelector(".content");


    if (!content) return;


    content.innerHTML = `

        <div class="page-title">

            <h1>
                Parties
            </h1>

            <p>
                Manage your customers and suppliers.
            </p>

        </div>


        <div class="panel">

            <div class="panel-header">

                <div style="display:flex;gap:8px;">

                    <button
                        id="customerTab"
                        class="btn btn-sale"
                    >
                        Customers
                    </button>

                    <button
                        id="supplierTab"
                        class="btn"
                    >
                        Suppliers
                    </button>

                </div>


                <div style="
                    display:flex;
                    gap:8px;
                    align-items:center;
                ">

                    <input
                        id="partySearchBox"
                        type="text"
                        placeholder="Search by party name, phone..."
                        class="px-4 py-2 border border-gray-300 rounded-lg text-sm w-72 outline-none focus:ring-2 focus:ring-blue-500"
                    >

                    <button
                        id="exportPartiesButton"
                        class="btn"
                        title="Download this list as Excel (CSV)"
                    >
                        Export Excel
                    </button>

                    <button
                        id="importPartiesButton"
                        class="btn"
                        title="Import customers/suppliers from Excel (CSV)"
                    >
                        Import Excel
                    </button>

                    <input
                        type="file"
                        id="importPartiesFile"
                        accept=".csv,.xlsx,.xls,text/csv"
                        style="display:none;"
                    >

                    <button
                        id="addPartyButton"
                        class="btn btn-sale"
                    >
                        + Add Party
                    </button>

                </div>

            </div>


            <table class="table">

                <thead>

                    <tr>

                        <th>Name</th>
                        <th>Phone</th>
                        <th>Type</th>
                        <th>Balance</th>
                        <th>Action</th>

                    </tr>

                </thead>


                <tbody id="partyList">

                    <tr>

                        <td colspan="5">

                            <div class="empty-state">
                                Loading...
                            </div>

                        </td>

                    </tr>

                </tbody>

            </table>

        </div>
    `;


    document
        .getElementById("addPartyButton")
        ?.addEventListener(
            "click",
            addParty
        );


    document
        .getElementById("exportPartiesButton")
        ?.addEventListener(
            "click",
            exportParties
        );


    document
        .getElementById("importPartiesButton")
        ?.addEventListener(
            "click",
            () => document.getElementById("importPartiesFile")?.click()
        );


    document
        .getElementById("importPartiesFile")
        ?.addEventListener(
            "change",
            importPartiesFromFile
        );


    const filterPartyRows = debounce(event => {
                const searchTerm = event.target.value.toLowerCase().trim();

                document
                    .querySelectorAll("#partyList tr[data-party-search]")
                    .forEach(row => {
                        row.style.display =
                            !searchTerm || row.dataset.partySearch.includes(searchTerm)
                                ? ""
                                : "none";
                    });
            }, 300);

    document
        .getElementById("partySearchBox")
        ?.addEventListener("input", filterPartyRows);


    document
        .getElementById("customerTab")
        ?.addEventListener(
            "click",
            () => {

                setPartyTab(
                    "Customer"
                );

                loadParties(
                    "Customer"
                );

            }
        );


    document
        .getElementById("supplierTab")
        ?.addEventListener(
            "click",
            () => {

                setPartyTab(
                    "Supplier"
                );

                loadParties(
                    "Supplier"
                );

            }
        );


    setPartyTab(
        "Customer"
    );


    await loadParties(
        "Customer"
    );

}

// ======================================================
// PARTY TAB STYLE
// ======================================================

function setPartyTab(type) {

    currentPartyType = type;

    const customerTab =
        document.getElementById(
            "customerTab"
        );


    const supplierTab =
        document.getElementById(
            "supplierTab"
        );


    if (
        !customerTab ||
        !supplierTab
    ) {

        return;

    }


    if (
        type === "Customer"
    ) {

        customerTab.className =
            "btn btn-sale";


        supplierTab.className =
            "btn";

    } else {

        customerTab.className =
            "btn";


        supplierTab.className =
            "btn btn-sale";

    }

}

// ======================================================
// LOAD PARTIES
// ======================================================

async function loadParties(
    type = "Customer"
) {

    const list =
        document.getElementById(
            "partyList"
        );


    if (!list) return;


    if (!apiReady("getParties")) {

        list.innerHTML = `

            <tr>

                <td colspan="5">

                    <div class="empty-state">
                        Party database connection unavailable.
                    </div>

                </td>

            </tr>

        `;

        return;

    }


    list.innerHTML = `

        <tr>

            <td colspan="5">

                <div class="empty-state">
                    Loading ${escapeHTML(type)}s...
                </div>

            </td>

        </tr>

    `;


    try {

        const parties =
            await window.electronAPI.getParties();


        if (!Array.isArray(parties)) {

            list.innerHTML = `

                <tr>

                    <td colspan="6">

                        <div class="empty-state">
                            Invalid party data.
                        </div>

                    </td>

                </tr>

            `;

            return;

        }


        const filteredParties =
            parties.filter(party => {

                const partyType =
                    String(
                        party.type || ""
                    )
                        .trim()
                        .toLowerCase();


                return (
                    partyType ===
                    type.toLowerCase()
                );

            });


        if (
            filteredParties.length === 0
        ) {

            list.innerHTML = `

                <tr>

                    <td colspan="5">

                        <div class="empty-state">
                            No ${escapeHTML(
                                type
                            ).toLowerCase()}s added yet.
                        </div>

                    </td>

                </tr>

            `;

            return;

        }


        list.innerHTML =
            filteredParties
                .map(
                    party => `

                        <tr data-party-search="${escapeHTML(
                            [party.name, party.phone]
                                .filter(Boolean)
                                .join(" ")
                                .toLowerCase()
                        )}">

                            <td>
                                ${escapeHTML(
                                    party.name
                                )}
                            </td>

                            <td>
                                ${escapeHTML(
                                    party.phone || "-"
                                )}
                            </td>

                            <td>
                                ${escapeHTML(
                                    party.type || "-"
                                )}
                            </td>

                            <td>
                                ${formatMoney(
                                    party.balance
                                )}
                            </td>

                            <td>

                                <div style="
                                    display:flex;
                                    gap:6px;
                                    align-items:center;
                                ">

                                    <button
                                        class="ledger-party-btn"
                                        data-id="${Number(
                                            party.id
                                        )}"
                                        style="
                                            background:#e8f1ff;
                                            color:#1769aa;
                                            border:1px solid #c7ddff;
                                            padding:7px 12px;
                                            cursor:pointer;
                                            border-radius:6px;
                                            font-weight:600;
                                        "
                                    >
                                        Ledger
                                    </button>

                                    <button
                                        class="delete-party-btn"
                                        data-id="${Number(
                                            party.id
                                        )}"
                                        style="
                                            background:#ffe5e5;
                                            color:#d93025;
                                            border:1px solid #ffcccc;
                                            padding:7px 12px;
                                            cursor:pointer;
                                            border-radius:6px;
                                            font-weight:600;
                                        "
                                    >
                                        Delete
                                    </button>

                                </div>

                            </td>

                        </tr>

                    `
                )
                .join("");


        document
            .getElementById("partySearchBox")
            ?.dispatchEvent(new Event("input"));


        document
            .querySelectorAll(
                ".delete-party-btn"
            )
            .forEach(button => {

                button.addEventListener(
                    "click",
                    async () => {

                        const partyId =
                            Number(
                                button.dataset.id
                            );


                        await deleteParty(
                            partyId,
                            type
                        );

                    }
                );

            });


        document
            .querySelectorAll(
                ".ledger-party-btn"
            )
            .forEach(button => {

                button.addEventListener(
                    "click",
                    async () => {

                        const partyId =
                            Number(
                                button.dataset.id
                            );


                        await showLedger(
                            partyId
                        );

                    }
                );

            });


    } catch (error) {

        console.error(
            "Load parties error:",
            error
        );


        list.innerHTML = `

            <tr>

                <td colspan="5">

                    <div class="empty-state">
                        Failed to load
                        ${escapeHTML(
                            type
                        ).toLowerCase()}s.
                    </div>

                </td>

            </tr>

        `;

    }

}

// ======================================================
// DELETE PARTY
// ======================================================

async function deleteParty(
    partyId,
    type = "Customer"
) {

    if (!partyId) {

        alert(
            "Invalid party ID."
        );

        return;

    }


    const confirmed =
        await showAppConfirm(
            `Are you sure you want to delete this ${type.toLowerCase()}?`,
            { title: `Delete ${type}`, confirmText: "Delete" }
        );


    if (!confirmed) return;
    if (!await verifyDeleteSystemFunctionPassword(`deleting this ${type.toLowerCase()}`)) return;


    if (!apiReady("deleteParty")) {

        alert(
            "Delete party database connection is unavailable."
        );

        return;

    }


    try {

        const result =
            await window.electronAPI.deleteParty(
                partyId
            );


        if (result?.success) {

            alert(
                `${type} deleted successfully!`
            );


            await loadParties(
                type
            );


            await refreshDashboardIfVisible();

        } else {

            alert(
                result?.error ||
                "Failed to delete party."
            );

        }

    } catch (error) {

        console.error(
            "Delete party error:",
            error
        );


        alert(
            "Failed to delete party: " +
            error.message
        );

    }

}

// ======================================================
// ADD PARTY
// ======================================================

function addParty() {

    const content =
        document.querySelector(
            ".content"
        );


    if (!content) return;


    content.innerHTML = `

        <div class="page-title">

            <h1>
                Add Party
            </h1>

            <p>
                Add a new customer or supplier.
            </p>

        </div>


        <div class="panel">

            <div class="panel-header">

                <h3>
                    Party Information
                </h3>

            </div>


            <div style="
                display:grid;
                grid-template-columns:1fr 1fr;
                gap:20px;
                padding:25px;
            ">


                <div>

                    <label>
                        Party Name
                    </label>

                    <input
                        id="partyName"
                        type="text"
                        placeholder="Enter party name"
                        style="
                            width:100%;
                            padding:12px;
                            margin-top:8px;
                        "
                    >

                </div>


                <div>

                    <label>
                        Phone Number
                    </label>

                    <input
                        id="partyPhone"
                        type="text"
                        placeholder="03XXXXXXXXX"
                        style="
                            width:100%;
                            padding:12px;
                            margin-top:8px;
                        "
                    >

                </div>


                <div>

                    <label>
                        Email
                    </label>

                    <input
                        id="partyEmail"
                        type="email"
                        placeholder="email@example.com"
                        style="
                            width:100%;
                            padding:12px;
                            margin-top:8px;
                        "
                    >

                </div>


                <div>

                    <label>
                        Party Type
                    </label>

                    <select
                        id="partyType"
                        style="
                            width:100%;
                            padding:12px;
                            margin-top:8px;
                        "
                    >

                        <option value="Customer">
                            Customer
                        </option>

                        <option value="Supplier">
                            Supplier
                        </option>

                    </select>

                </div>


                <div>

                    <label>
                        Opening Balance
                    </label>

                    <input
                        id="partyBalance"
                        type="number"
                        value="0"
                        min="0"
                        style="
                            width:100%;
                            padding:12px;
                            margin-top:8px;
                        "
                    >

                </div>


                <div>

                    <label>
                        Address
                    </label>

                    <input
                        id="partyAddress"
                        type="text"
                        placeholder="Enter address"
                        style="
                            width:100%;
                            padding:12px;
                            margin-top:8px;
                        "
                    >

                </div>

            </div>


            <div style="
                padding:0 25px 25px;
                display:flex;
                gap:10px;
            ">

                <button
                    id="savePartyButton"
                    class="btn btn-sale"
                >
                    Save Party
                </button>

                <button
                    id="cancelPartyButton"
                    class="btn"
                >
                    Cancel
                </button>

            </div>

        </div>
    `;


    document.getElementById("savePartyButton")?.addEventListener("click", async event => {
        const button = event.currentTarget;
        if (button.disabled) return;
        button.disabled = true;
        try { await saveParty(); } finally { button.disabled = false; }
    });


    document
        .getElementById(
            "cancelPartyButton"
        )
        ?.addEventListener(
            "click",
            showParties
        );

}

// ======================================================
// SAVE PARTY
// ======================================================

async function saveParty() {

    const name =
        document
            .getElementById(
                "partyName"
            )
            ?.value
            .trim();


    const phone =
        document
            .getElementById(
                "partyPhone"
            )
            ?.value
            .trim();


    const email =
        document
            .getElementById(
                "partyEmail"
            )
            ?.value
            .trim();


    const type =
        document
            .getElementById(
                "partyType"
            )
            ?.value;


    const balance =
        Number(
            document
                .getElementById(
                    "partyBalance"
                )
                ?.value
        ) || 0;


    const address =
        document
            .getElementById(
                "partyAddress"
            )
            ?.value
            .trim();


    if (!name) {

        alert(
            "Please enter party name."
        );

        return;

    }


    if (!apiReady("saveParty")) {

        alert(
            "Party database connection is unavailable."
        );

        return;

    }


    try {

        const result =
            await window.electronAPI.saveParty({

                name,
                phone,
                email,
                type,
                balance,
                address

            });


        if (result?.success) {

            // Optimistic UI: immediately show success and reset form
            if (typeof showToast === "function") {
                showToast(type + " saved successfully!", "success");
            }

            // Reset form immediately
            var partyForm = document.getElementById("partyName");
            if (partyForm) partyForm.value = "";
            partyForm = document.getElementById("partyPhone");
            if (partyForm) partyForm.value = "";
            partyForm = document.getElementById("partyEmail");
            if (partyForm) partyForm.value = "";
            partyForm = document.getElementById("partyAddress");
            if (partyForm) partyForm.value = "";
            partyForm = document.getElementById("partyBalance");
            if (partyForm) partyForm.value = "0";

            deferBackgroundTask(() => refreshDashboardIfVisible());

        } else {

            if (typeof showToast === "function") {
                showToast(result?.error || "Failed to save party.", "error");
            } else {
                alert(result?.error || "Failed to save party.");
            }

        }

    } catch (error) {

        console.error(
            "Save party error:",
            error
        );

        if (typeof showToast === "function") {
            showToast("Failed to save party: " + error.message, "error");
        } else {
            alert("Failed to save party: " + error.message);
        }

    }

}

// ======================================================
// LEDGER
// ======================================================

async function showLedger(partyId) {

    if (!partyId) {

        alert("Invalid party ID.");
        return;

    }


    if (!apiReady("getLedger")) {

        alert("Ledger API is not available.");
        return;

    }


    const content =
        document.querySelector(".content");


    if (!content) return;


    content.innerHTML = `

        <div class="page-title">

            <h1>
                Party Ledger
            </h1>

            <p>
                View complete transaction history.
            </p>

        </div>


        <div class="panel">

            <div class="panel-header">

                <h3 id="ledgerPartyName">
                    Loading...
                </h3>

                <button
                    id="backToParties"
                    class="btn"
                >
                    ← Back
                </button>

            </div>


            <div style="
                display:grid;
                grid-template-columns:repeat(3, 1fr);
                gap:16px;
                margin-bottom:20px;
            ">

                <div class="card">

                    <div class="card-label">
                        Opening Balance
                    </div>

                    <div
                        class="card-value"
                        id="ledgerOpening"
                    >
                        Rs. 0
                    </div>

                </div>


                <div class="card">

                    <div class="card-label">
                        Closing Balance
                    </div>

                    <div
                        class="card-value"
                        id="ledgerClosing"
                    >
                        Rs. 0
                    </div>

                </div>


                <div class="card">

                    <div class="card-label">
                        Current Balance
                    </div>

                    <div
                        class="card-value"
                        id="ledgerCurrent"
                    >
                        Rs. 0
                    </div>

                </div>

            </div>


            <table class="table">

                <thead>

                    <tr>

                        <th>Date</th>
                        <th>Type</th>
                        <th>Reference</th>
                        <th>Debit</th>
                        <th>Credit</th>
                        <th>Balance</th>

                    </tr>

                </thead>


                <tbody id="ledgerEntries">

                    <tr>

                        <td colspan="6">

                            <div class="empty-state">
                                Loading...
                            </div>

                        </td>

                    </tr>

                </tbody>

            </table>

        </div>
    `;


    document
        .getElementById("backToParties")
        ?.addEventListener(
            "click",
            showParties
        );


    try {

        const result =
            await window.electronAPI.getLedger(partyId);


        if (!result?.success) {

            alert(result?.error || "Failed to load ledger.");
            return;

        }


        const party = result.party;
        const entries = result.entries || [];


        document.getElementById("ledgerPartyName").textContent =
            `${party.name} - Ledger`;


        document.getElementById("ledgerOpening").textContent =
            formatMoney(result.openingBalance);


        document.getElementById("ledgerClosing").textContent =
            formatMoney(result.closingBalance);


        document.getElementById("ledgerCurrent").textContent =
            formatMoney(party.balance);


        const tbody =
            document.getElementById("ledgerEntries");


        if (entries.length === 0) {

            tbody.innerHTML = `

                <tr>

                    <td colspan="6">

                        <div class="empty-state">
                            No transactions found.
                        </div>

                    </td>

                </tr>

            `;

            return;

        }


        tbody.innerHTML =
            entries
                .map(entry => `

                    <tr>

                        <td>
                            ${escapeHTML(
                                formatDate(entry.date)
                            )}
                        </td>

                        <td>
                            ${escapeHTML(
                                entry.type || "-"
                            )}
                        </td>

                        <td>
                            ${escapeHTML(
                                entry.reference || "-"
                            )}
                        </td>

                        <td>
                            ${Number(entry.debit || 0) > 0
                                ? formatMoney(entry.debit)
                                : "-"}
                        </td>

                        <td>
                            ${Number(entry.credit || 0) > 0
                                ? formatMoney(entry.credit)
                                : "-"}
                        </td>

                        <td>
                            ${formatMoney(entry.balance)}
                        </td>

                    </tr>

                `)
                .join("");


    } catch (error) {

        console.error("Load ledger error:", error);

        alert("Failed to load ledger: " + error.message);

    }

}

// ======================================================
// ITEMS
// ======================================================

async function showItems() {

    const content =
        document.querySelector(
            ".content"
        );


    if (!content) return;


    content.innerHTML = `

        <div class="page-title">

            <h1>
                Items
            </h1>

            <p>
                Manage your products and inventory.
            </p>

        </div>


        <div class="panel">

            <div class="panel-header">

                <h3>
                    Inventory
                </h3>

                <div style="
                    display:flex;
                    gap:8px;
                    align-items:center;
                ">

                    <input
                        id="itemSearchBox"
                        type="text"
                        placeholder="Search items by name, barcode or location..."
                        class="px-4 py-2 border border-gray-300 rounded-lg text-sm w-72 outline-none focus:ring-2 focus:ring-blue-500"
                    >

                    <button
                        id="exportItemsButton"
                        class="btn"
                        title="Download items as Excel (CSV)"
                    >
                        Export Excel
                    </button>

                    <button
                        id="importItemsButton"
                        class="btn"
                        title="Import items from Excel (CSV)"
                    >
                        Import Excel
                    </button>

                    <input
                        type="file"
                        id="importItemsFile"
                        accept=".csv,.xlsx,.xls,text/csv"
                        style="display:none;"
                    >

                    <button
                        id="addItemButton"
                        class="btn btn-sale"
                    >
                        + Add Item
                    </button>

                </div>

            </div>


            <table class="table">

                <thead>

                    <tr>

                        <th>
                            Item Name
                        </th>

                        <th>
                            Category
                        </th>

                        <th>
                            Unit
                        </th>

                        <th>
                            Purchase Price
                        </th>

                        <th>
                            Sale Price
                        </th>

                        <th>
                            Barcode
                        </th>

                        <th>
                            Expiry
                        </th>

                        <th>
                            Stock
                        </th>

                        <th>
                            Action
                        </th>

                    </tr>

                </thead>


                <tbody id="itemList">

                    <tr>

                        <td colspan="9">

                            <div class="empty-state">
                                Loading...
                            </div>

                        </td>

                    </tr>

                </tbody>

            </table>

        </div>
    `;


    document
        .getElementById(
            "addItemButton"
        )
        ?.addEventListener(
            "click",
            addItem
        );



    document
        .getElementById("exportItemsButton")
        ?.addEventListener(
            "click",
            exportItems
        );


    document
        .getElementById("importItemsButton")
        ?.addEventListener(
            "click",
            () => document.getElementById("importItemsFile")?.click()
        );


    document
        .getElementById("importItemsFile")
        ?.addEventListener(
            "change",
            importItemsFromFile
        );


    const filterItemRows = debounce(event => {
                const searchTerm = event.target.value.toLowerCase().trim();

                document
                    .querySelectorAll("#itemList tr[data-item-search]")
                    .forEach(row => {
                        row.style.display =
                            !searchTerm || row.dataset.itemSearch.includes(searchTerm)
                                ? ""
                                : "none";
                    });
            }, 300);

    document
        .getElementById("itemSearchBox")
        ?.addEventListener("input", filterItemRows);


    await loadItems();

}

// ======================================================
// LOAD ITEMS
// ======================================================

async function loadItems() {


function closeItemPreview() {
    const overlay = document.getElementById("itemPreviewOverlay");
    if (!overlay) return;

    overlay.style.pointerEvents = "none";
    overlay.remove();
    document.body.style.pointerEvents = "";
    window.focus();

    if (itemPreviewPreviousFocus?.isConnected) {
        itemPreviewPreviousFocus.focus();
    }
    itemPreviewPreviousFocus = null;
}

function showItemPreview(item) {
    closeItemPreview();
    itemPreviewPreviousFocus = document.activeElement;

    const overlay = document.createElement("div");
    overlay.id = "itemPreviewOverlay";
    overlay.style.cssText = [
        "position:fixed", "inset:0", "z-index:9600",
        "background:rgba(2,6,23,0.55)",
        "display:flex", "align-items:center", "justify-content:center"
    ].join(";");

    overlay.innerHTML = `
        <div style="
            background:#fff; border-radius:14px;
            width:min(560px, 92vw); max-height:84vh;
            display:flex; flex-direction:column;
            box-shadow:0 20px 60px rgba(0,0,0,0.35);
            overflow:hidden;
        ">
            <div style="
                display:flex; align-items:center; justify-content:space-between;
                padding:14px 20px; background:#fffbeb;
                border-bottom:1px solid #fde68a;
            ">
                <h3 style="margin:0; font-size:15px; color:#b45309;">
                    Item Details
                </h3>
                <button type="button" class="btn" id="closeItemPreviewButton"
                    style="padding:6px 12px;">Close</button>
            </div>
            <div style="overflow:auto; padding:16px 20px;">
                <table style="width:100%; border-collapse:collapse;">
                    ${txRow("Item Name", escapeHTML(item.name || "-"))}
                    ${txRow("Category", escapeHTML(item.category || "-"))}
                    ${txRow("Unit", escapeHTML(item.unit || "-"))}
                    ${txRow("Stock Location", escapeHTML(item.item_location || "-"))}
                    ${txRow("Purchase Price", formatMoney(item.purchase_price))}
                    ${txRow("Wholesale Price", formatMoney(item.wholesale_price))}
                    ${txRow("Sale (Retail) Price", formatMoney(item.sale_price))}
                    ${txRow("Barcode", escapeHTML(item.barcode || "-"))}
                    ${txRow("Expiry Date", escapeHTML(item.expiry_date || "-"))}
                    ${txRow("Current Stock", `${Number(item.stock || 0).toLocaleString()} ${escapeHTML(item.unit || "")}`)}
                </table>
            </div>
        </div>
    `;

    overlay.addEventListener("click", event => {
        if (event.target === overlay) closeItemPreview();
    });
    document.body.appendChild(overlay);
    document.getElementById("closeItemPreviewButton")?.addEventListener(
        "click", closeItemPreview
    );
}
    const list =
        document.getElementById(
            "itemList"
        );


    if (!list) return;


    if (!apiReady("getItems")) {

        list.innerHTML = `

            <tr>

                <td colspan="9">

                    <div class="empty-state">
                        Item database connection unavailable.
                    </div>

                </td>

            </tr>

        `;

        return;

    }


    try {

        const items =
            await window.electronAPI.getItems();


        if (
            !Array.isArray(items) ||
            items.length === 0
        ) {

            list.innerHTML = `

                <tr>

                    <td colspan="9">

                        <div class="empty-state">
                            No items added yet
                        </div>

                    </td>

                </tr>

            `;

            return;

        }


        list.innerHTML =
            items
                .map(
                    item => `

                        <tr data-item-search="${escapeHTML(
                            [
                                item.name,
                                item.barcode,
                                item.item_location
                            ]
                                .filter(Boolean)
                                .join(" ")
                                .toLowerCase()
                        )}">

                            <td>
                                ${escapeHTML(
                                    item.name
                                )}
                                <div style="
                                    margin-top:4px;
                                    color:#64748b;
                                    font-size:12px;
                                ">
                                    Location: ${escapeHTML(item.item_location || "-")}
                                </div>
                            </td>

                            <td>
                                ${escapeHTML(
                                    item.category || "-"
                                )}
                            </td>

                            <td>
                                ${escapeHTML(
                                    item.unit || "-"
                                )}
                            </td>

                            <td>
                                ${formatMoney(
                                    item.purchase_price
                                )}
                            </td>

                            <td>
                                ${formatMoney(
                                    item.sale_price
                                )}
                            </td>

                            <td>${escapeHTML(item.barcode || "-")}</td>

                            <td>${item.expiry_date
                                ? escapeHTML(item.expiry_date)
                                : "-"}</td>

                            <td>
                                ${Number(
                                    item.stock || 0
                                ).toLocaleString()}
                            </td>

                            <td>

                                <div style="
                                    display:flex;
                                    gap:6px;
                                    align-items:center;
                                ">

                                    <button
                                        class="view-item-btn"
                                        data-id="${Number(
                                            item.id
                                        )}"
                                        style="
                                            background:#fff7ed;
                                            color:#b45309;
                                            border:1px solid #f59e0b;
                                            padding:7px 12px;
                                            cursor:pointer;
                                            border-radius:6px;
                                            font-weight:600;
                                        "
                                    >
                                        View
                                    </button>


                                    <button
                                        class="edit-item-btn"
                                        data-id="${Number(
                                            item.id
                                        )}"
                                        style="
                                            background:#e8f1ff;
                                            color:#1769aa;
                                            border:1px solid #c7ddff;
                                            padding:7px 12px;
                                            cursor:pointer;
                                            border-radius:6px;
                                            font-weight:600;
                                        "
                                    >
                                        Edit
                                    </button>


                                    <button
                                        class="stock-item-btn"
                                        data-id="${Number(
                                            item.id
                                        )}"
                                        style="
                                            background:#fef3c7;
                                            color:#92400e;
                                            border:1px solid #fde68a;
                                            padding:7px 12px;
                                            cursor:pointer;
                                            border-radius:6px;
                                            font-weight:600;
                                        "
                                    >
                                        Stock
                                    </button>


                                    <button
                                        class="delete-item-btn"
                                        data-id="${Number(
                                            item.id
                                        )}"
                                        style="
                                            background:#ffe5e5;
                                            color:#d93025;
                                            border:1px solid #ffcccc;
                                            padding:7px 12px;
                                            cursor:pointer;
                                            border-radius:6px;
                                            font-weight:600;
                                        "
                                    >
                                        Delete
                                    </button>

                                </div>

                            </td>

                        </tr>

                    `
                )
                .join("");

        window._itemsListCache = items;
        if (list.dataset.viewHandlerReady !== "true") {
            list.dataset.viewHandlerReady = "true";
            list.addEventListener("click", event => {
                const button = event.target.closest(".view-item-btn");
                if (!button) return;
                const item = (window._itemsListCache || []).find(entry =>
                    Number(entry.id) === Number(button.dataset.id)
                );
                if (item) showItemPreview(item);
            });
        }


        // EDIT BUTTONS

        document
            .querySelectorAll(
                ".edit-item-btn"
            )
            .forEach(button => {

                button.addEventListener(
                    "click",
                    async () => {

                        const itemId =
                            Number(
                                button.dataset.id
                            );


                        await editItem(
                            itemId
                        );

                    }
                );

            });


        // STOCK BUTTONS

        document
            .querySelectorAll(
                ".stock-item-btn"
            )
            .forEach(button => {

                button.addEventListener(
                    "click",
                    async () => {

                        const itemId =
                            Number(
                                button.dataset.id
                            );


                        await showStockAdjustment(
                            itemId
                        );

                    }
                );

            });


        // DELETE BUTTONS

        document
            .querySelectorAll(
                ".delete-item-btn"
            )
            .forEach(button => {

                button.addEventListener(
                    "click",
                    async () => {

                        const itemId =
                            Number(
                                button.dataset.id
                            );


                        await deleteItem(
                            itemId
                        );

                    }
                );

            });


    } catch (error) {

        console.error(
            "Load items error:",
            error
        );


        list.innerHTML = `

            <tr>

                                <td colspan="9">

                    <div class="empty-state">
                        Failed to load items.
                    </div>

                </td>

            </tr>

        `;

    }

}

// ======================================================
// STOCK ADJUSTMENT
// ======================================================

async function showStockAdjustment(itemId) {

    resetGlobalUiLocks();

    if (!itemId) {

        alert("Invalid item ID.");
        return;

    }


    if (!apiReady("getItem") || !apiReady("getStockHistory")) {

        alert("Stock API is not available.");
        return;

    }


    const content =
        document.querySelector(".content");


    if (!content) return;


    try {

        const itemResult =
            await window.electronAPI.getItem(itemId);


        if (!itemResult?.success) {

            alert(itemResult?.error || "Item not found.");
            return;

        }


        const item = itemResult.item;


        const history =
            await window.electronAPI.getStockHistory(itemId);


        content.innerHTML = `

            <div class="page-title">

                <h1>
                    Stock Adjustment
                </h1>

                <p>
                    ${escapeHTML(item.name)} - Current Stock: ${Number(item.stock || 0).toLocaleString()} ${escapeHTML(item.unit || "")}
                </p>

            </div>


            <div class="panel">

                <div class="panel-header">

                    <h3>
                        Adjust Stock
                    </h3>

                </div>


                <div style="
                    display:grid;
                    grid-template-columns:1fr 1fr;
                    gap:20px;
                    padding:25px;
                ">

                    <div>

                        <label>
                            New Stock Quantity
                        </label>

                        <input
                            id="newStockValue"
                            type="number"
                            value="${Number(item.stock || 0)}"
                            min="0"
                            style="
                                width:100%;
                                padding:12px;
                                margin-top:8px;
                            "
                        >

                    </div>


                    <div>

                        <label>
                            Note
                        </label>

                        <input
                            id="stockNote"
                            type="text"
                            placeholder="Reason for adjustment"
                            style="
                                width:100%;
                                padding:12px;
                                margin-top:8px;
                            "
                        >

                    </div>

                </div>


                <div style="
                    padding:0 25px 25px;
                    display:flex;
                    gap:10px;
                ">

                    <button
                        id="saveStockButton"
                        class="btn btn-sale"
                    >
                        Save Adjustment
                    </button>

                    <button
                        id="cancelStockButton"
                        class="btn"
                    >
                        Cancel
                    </button>

                </div>

            </div>


            <div class="panel">

                <div class="panel-header">

                    <h3>
                        Stock History
                    </h3>

                </div>


                <table class="table">

                    <thead>

                        <tr>

                            <th>Date</th>
                            <th>Type</th>
                            <th>Quantity</th>
                            <th>Balance</th>
                            <th>Note</th>

                        </tr>

                    </thead>


                    <tbody id="stockHistoryList">

                        ${
                            Array.isArray(history) && history.length > 0
                                ? history.map(h => `

                                    <tr>

                                        <td>
                                            ${escapeHTML(
                                                formatDate(h.created_at)
                                            )}
                                        </td>

                                        <td>
                                            ${escapeHTML(
                                                h.type || "-"
                                            )}
                                        </td>

                                        <td>
                                            ${Number(
                                                h.quantity || 0
                                            ).toLocaleString()}
                                        </td>

                                        <td>
                                            ${Number(
                                                h.balance || 0
                                            ).toLocaleString()}
                                        </td>

                                        <td>
                                            ${escapeHTML(
                                                h.note || "-"
                                            )}
                                        </td>

                                    </tr>

                                `).join("")
                                : `

                                    <tr>

                                        <td colspan="5">

                                            <div class="empty-state">
                                                No stock history found.
                                            </div>

                                        </td>

                                    </tr>

                                `
                        }

                    </tbody>

                </table>

            </div>
        `;


        document
            .getElementById("saveStockButton")
            ?.addEventListener(
                "click",
                async () => {

                    const newStock =
                        Number(
                            document
                                .getElementById("newStockValue")
                                ?.value
                        ) || 0;


                    const note =
                        document
                            .getElementById("stockNote")
                            ?.value
                            .trim() || "Stock adjustment";


                    if (newStock < 0) {

                        alert("Stock cannot be negative.");
                        return;

                    }


                    if (!apiReady("adjustStock")) {

                        alert("Adjust stock API is not available.");
                        return;

                    }


                    try {

                        const result =
                            await window.electronAPI.adjustStock({
                                item_id: itemId,
                                new_stock: newStock,
                                note
                            });


                        if (result?.success) {

                            alert("Stock adjusted successfully!");

                            await showStockAdjustment(itemId);

                        } else {

                            alert(result?.error || "Failed to adjust stock.");

                        }

                    } catch (error) {

                        console.error("Adjust stock error:", error);

                        alert("Failed to adjust stock: " + error.message);

                    }

                }
            );


        document
            .getElementById("cancelStockButton")
            ?.addEventListener(
                "click",
                showItems
            );


    } catch (error) {

        console.error("Show stock adjustment error:", error);

        alert("Failed to load stock adjustment: " + error.message);

    }

}

// ======================================================
// EDIT ITEM
// ======================================================

async function editItem(itemId) {

    if (!itemId) {

        alert(
            "Invalid item ID."
        );

        return;

    }


    if (!apiReady("getItems")) {

        alert(
            "Item database connection unavailable."
        );

        return;

    }

    const verified = await verifySystemFunctionPassword("editing this item");
    if (!verified) return;


    try {

        const items =
            await window.electronAPI.getItems();


        if (!Array.isArray(items)) {

            alert(
                "Failed to load item data."
            );

            return;

        }


        const item =
            items.find(
                currentItem =>
                    Number(currentItem.id) ===
                    Number(itemId)
            );


        if (!item) {

            alert(
                "Item not found."
            );

            return;

        }


        const content =
            document.querySelector(
                ".content"
            );


        if (!content) return;


        const currentUnit =
            String(
                item.unit || "Pieces"
            );


        content.innerHTML = `

            <div class="page-title">

                <h1>
                    Edit Item
                </h1>

                <p>
                    Update your product information.
                </p>

            </div>


            <div class="panel">

                <div class="panel-header">

                    <h3>
                        Item Information
                    </h3>

                </div>


                <div style="
                    display:grid;
                    grid-template-columns:1fr 1fr;
                    gap:20px;
                    padding:25px;
                ">


                    <div>

                        <label>
                            Item Name
                        </label>

                        <input
                            id="itemName"
                            type="text"
                            value="${escapeHTML(
                                item.name || ""
                            )}"
                            placeholder="Enter item name"
                            style="
                                width:100%;
                                padding:12px;
                                margin-top:8px;
                            "
                        >

                    </div>


                    <div>

                        <label>
                            Category
                        </label>

                        <input
                            id="itemCategory"
                            type="text"
                            value="${escapeHTML(
                                item.category || ""
                            )}"
                            placeholder="e.g. Grocery"
                            style="
                                width:100%;
                                padding:12px;
                                margin-top:8px;
                            "
                        >

                    </div>


                    <div>

                        <label>
                            Unit
                        </label>

                        <select
                            id="itemUnit"
                            style="
                                width:100%;
                                padding:12px;
                                margin-top:8px;
                            "
                        >

                            ${unitOptionsHTML(currentUnit)}

                        </select>

                    </div>


                    <div>

                        <label>
                            Current Stock
                        </label>

                        <div style="
                            width:100%;
                            padding:12px;
                            margin-top:8px;
                            background:#f0fdf4;
                            border:1px solid #bbf7d0;
                            border-radius:8px;
                            font-weight:700;
                            font-size:16px;
                        ">
                            ${Number(item.stock || 0)} ${escapeHTML(item.unit || "")}
                        </div>

                        <small style="color:#64748b; display:block; margin-top:6px;">
                            Read-only &mdash; to change stock, use the Stock Adjustment below
                        </small>

                    </div>


                    <div>

                        <label>
                            Purchase Price
                        </label>

                        <input
                            id="purchasePrice"
                            type="number"
                            value="${Number(
                                item.purchase_price || 0
                            )}"
                            min="0"
                            style="
                                width:100%;
                                padding:12px;
                                margin-top:8px;
                            "
                        >

                    </div>


                    <div>

                        <label>
                            Sale (Retail) Price
                        </label>

                        <input
                            id="itemSalePrice"
                            type="number"
                            value="${Number(
                                item.sale_price || 0
                            )}"
                            min="0"
                            style="
                                width:100%;
                                padding:12px;
                                margin-top:8px;
                            "
                        >

                    </div>

                    <div>

                        <label>
                            Wholesale Price
                        </label>

                        <input
                            id="itemWholesalePrice"
                            type="number"
                            value="${Number(item.wholesale_price || 0)}"
                            min="0"
                            style="
                                width:100%;
                                padding:12px;
                                margin-top:8px;
                            "
                        >

                    </div>


                    <div>

                        <label>
                            Barcode
                        </label>

                        <input
                            id="itemBarcode"
                            type="text"
                            value="${escapeHTML(item.barcode || "")}" 
                            placeholder="Scan or enter barcode"
                            style="width:100%; padding:12px; margin-top:8px;"
                        >

                    </div>


                    <div>

                        <label>
                            Expiry Date (optional)
                        </label>

                        <input
                            id="itemExpiryDate"
                            type="date"
                            value="${escapeHTML(item.expiry_date || "")}" 
                            style="width:100%; padding:12px; margin-top:8px;"
                        >

                    </div>


                    <div>

                        <label>
                            Low Stock Limit
                        </label>

                        <input
                            id="lowStockLimit"
                            type="number"
                            value="${Number(
                                item.low_stock_limit || 5
                            )}"
                            min="0"
                            style="
                                width:100%;
                                padding:12px;
                                margin-top:8px;
                            "
                        >

                    </div>


                    <div>

                        <label>
                            Tax Rate (%)
                        </label>

                        <input
                            id="itemTaxRate"
                            type="number"
                            value="${Number(
                                item.tax_rate || 0
                            )}"
                            min="0"
                            style="
                                width:100%;
                                padding:12px;
                                margin-top:8px;
                            "
                        >

                    </div>


                    <div>

                        <label>
                            Item Location
                        </label>

                        <input
                            id="itemLocation"
                            type="text"
                            value="${escapeHTML(item.item_location || "")}"
                            placeholder="e.g. Shelf A1, Warehouse 2"
                            style="
                                width:100%;
                                padding:12px;
                                margin-top:8px;
                            "
                        >

                    </div>

                </div>


                <div style="
                    padding:0 25px 25px;
                    display:flex;
                    gap:10px;
                ">

                    <button
                        id="updateItemButton"
                        class="btn btn-sale"
                    >
                        Update Item
                    </button>


                    <button
                        id="cancelEditItemButton"
                        class="btn"
                    >
                        Cancel
                    </button>

                </div>


                <div style="
                    margin:0 25px 25px;
                    padding:20px;
                    background:#fffbeb;
                    border:1px solid #fde68a;
                    border-radius:10px;
                ">

                    <h4 style="margin:0 0 4px; color:#92400e;">
                        Stock Adjustment
                    </h4>

                    <p style="margin:0 0 12px; font-size:12px; color:#a16207;">
                        Enter the new TOTAL stock quantity. Each adjustment is recorded in the inventory ledger/history.
                    </p>

                    <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">

                        <input
                            id="stockAdjNewTotal"
                            type="number"
                            min="0"
                            step="any"
                            placeholder="New total stock (${Number(item.stock || 0)})"
                            style="
                                width:180px;
                                padding:10px;
                                border:1px solid #ddd;
                                border-radius:8px;
                            "
                        >

                        <input
                            id="stockAdjReason"
                            type="text"
                            placeholder="Reason (e.g. opening stock, damage)"
                            style="
                                flex:1;
                                min-width:200px;
                                padding:10px;
                                border:1px solid #ddd;
                                border-radius:8px;
                            "
                        >

                        <button
                            id="applyStockAdjustButton"
                            class="btn btn-purchase"
                        >
                            Apply Adjustment
                        </button>

                    </div>

                </div>

            </div>
        `;


        document
            .getElementById(
                "updateItemButton"
            )
            ?.addEventListener(
                "click",
                () => {

                    updateItem(
                        Number(item.id)
                    );

                }
            );


        document
            .getElementById(
                "cancelEditItemButton"
            )
            ?.addEventListener(
                "click",
                showItems
            );


        // ===== Stock Adjustment (separate ledger entry) =====
        document
            .getElementById(
                "applyStockAdjustButton"
            )
            ?.addEventListener(
                "click",
                async () => {

                    const btn =
                        document.getElementById("applyStockAdjustButton");

                    if (btn && btn.disabled) return;

                    const newTotal = Number(
                        document
                            .getElementById("stockAdjNewTotal")
                            ?.value
                    );

                    if (
                        !newTotal ||
                        newTotal < 0 ||
                        isNaN(newTotal)
                    ) {

                        alert("Please enter a valid new stock quantity.");
                        return;

                    }

                    const current = Number(item.stock || 0);

                    if (newTotal === current) {

                        alert("The new stock is the same as the current stock — no adjustment made.");
                        return;

                    }

                    const reason =
                        document.getElementById("stockAdjReason")
                            ?.value.trim() || "Stock Adjustment";

                    if (!apiReady("adjustStock")) {

                        alert("Adjust stock API is not available.");
                        return;

                    }

                    if (btn) btn.disabled = true;

                    try {

                        const result =
                            await window.electronAPI.adjustStock({

                                item_id: item.id,
                                new_stock: newTotal,
                                note: reason

                            });

                        if (result?.success) {

                            const diff = newTotal - current;
                            alert(
                                "Stock adjusted!\n" +
                                current + " -> " + newTotal + " " +
                                "(" + (diff > 0 ? "+" : "") + diff + " " + (item.unit || "") + ")\n" +
                                "Recorded in ledger/history."
                            );

                            await editItem(item.id); // refresh read-only value

                        } else {

                            alert(result?.error || "Failed to adjust stock.");

                            if (btn) btn.disabled = false;

                        }

                    } catch (err) {

                        console.error("Stock adjust error:", err);
                        alert("Failed: " + err.message);

                        if (btn) btn.disabled = false;

                    }

                }
            );


    } catch (error) {

        console.error(
            "Edit item error:",
            error
        );


        alert(
            "Failed to load item: " +
            error.message
        );

    }

}

// ======================================================
// UPDATE ITEM
// ======================================================

async function updateItem(itemId) {

    const name =
        document
            .getElementById(
                "itemName"
            )
            ?.value
            .trim();


    const category =
        document
            .getElementById(
                "itemCategory"
            )
            ?.value
            .trim();


    const unit =
        document
            .getElementById(
                "itemUnit"
            )
            ?.value;


    const purchase_price =
        Number(
            document
                .getElementById(
                    "purchasePrice"
                )
                ?.value
        ) || 0;


    const sale_price =
        Number(
            document
                .getElementById(
                    "itemSalePrice"
                )
                ?.value
        ) || 0;

    const wholesale_price =
        Number(document.getElementById("itemWholesalePrice")?.value) || 0;

    const barcode = document.getElementById("itemBarcode")?.value.trim() || "";
    const expiry_date = document.getElementById("itemExpiryDate")?.value || "";


    const low_stock_limit =
        Number(
            document
                .getElementById(
                    "lowStockLimit"
                )
                ?.value
        ) || 5;


    const tax_rate =
        Number(
            document
                .getElementById(
                    "itemTaxRate"
                )
                ?.value
        ) || 0;


    const item_location =
        document
            .getElementById(
                "itemLocation"
            )
            ?.value
            .trim() || "";


    if (!itemId) {

        alert(
            "Invalid item ID."
        );

        return;

    }


    if (!name) {

        alert(
            "Please enter item name."
        );

        return;

    }


    if (
        purchase_price < 0 ||
        sale_price < 0 ||
        wholesale_price < 0
    ) {

        alert(
            "Price cannot be negative."
        );

        return;

    }


    if (!apiReady("updateItem")) {

        alert(
            "Update Item API is not available yet."
        );

        return;

    }


    try {

        const result =
            await window.electronAPI.updateItem({

                id:
                    Number(itemId),

                name:
                    name,

                category:
                    category,

                unit:
                    unit,

                purchase_price:
                    purchase_price,

                sale_price:
                    sale_price,

                wholesale_price,

                barcode,
                expiry_date,

                low_stock_limit:
                    low_stock_limit,

                tax_rate:
                    tax_rate,

                item_location:
                    item_location

            });


        if (result?.success) {

            alert(
                "Item updated successfully!"
            );

            clearTransientUi();
            deferBackgroundTask(() => refreshDashboardIfVisible());


        } else {

            alert(
                result?.error ||
                "Failed to update item."
            );

        }


    } catch (error) {

        console.error(
            "Update item error:",
            error
        );


        alert(
            "Failed to update item: " +
            error.message
        );

    }

}

// ======================================================
// DELETE ITEM
// ======================================================

async function deleteItem(
    itemId
) {

    if (!itemId) {

        alert(
            "Invalid item ID."
        );

        return;

    }


    const confirmed =
        await showAppConfirm(
            "Are you sure you want to delete this item?",
            { title: "Delete Item", confirmText: "Delete" }
        );


    if (!confirmed) return;
    if (!await verifyDeleteSystemFunctionPassword("deleting this item")) return;


    if (!apiReady("deleteItem")) {

        alert(
            "Delete item database connection is unavailable."
        );

        return;

    }


    try {

        const result =
            await window.electronAPI.deleteItem(
                itemId
            );


        if (result?.success) {

            alert(
                "Item deleted successfully!"
            );


            await loadItems();


            await refreshDashboardIfVisible();

        } else {

            alert(
                result?.error ||
                "Failed to delete item."
            );

        }

    } catch (error) {

        console.error(
            "Delete item error:",
            error
        );


        alert(
            "Failed to delete item: " +
            error.message
        );

    }

}

// ======================================================
// ADD ITEM
// ======================================================

function addItem() {

    const content =
        document.querySelector(
            ".content"
        );


    if (!content) return;


    content.innerHTML = `

        <div class="page-title">

            <h1>
                Add Item
            </h1>

            <p>
                Add a new product to your inventory.
            </p>

        </div>


        <div class="panel">

            <div class="panel-header">

                <h3>
                    Item Information
                </h3>

            </div>


            <div style="
                display:grid;
                grid-template-columns:1fr 1fr;
                gap:20px;
                padding:25px;
            ">


                <div>

                    <label>
                        Item Name
                    </label>

                    <input
                        id="itemName"
                        type="text"
                        placeholder="Enter item name"
                        style="
                            width:100%;
                            padding:12px;
                            margin-top:8px;
                        "
                    >

                </div>


                <div>

                    <label>
                        Category
                    </label>

                    <input
                        id="itemCategory"
                        type="text"
                        placeholder="e.g. Grocery"
                        style="
                            width:100%;
                            padding:12px;
                            margin-top:8px;
                        "
                    >

                </div>


                <div>

                    <label>
                        Unit
                    </label>

                    <select
                        id="itemUnit"
                        style="
                            width:100%;
                            padding:12px;
                            margin-top:8px;
                        "
                    >

                        ${unitOptionsHTML("Pieces")}

                    </select>

                </div>


                <div>

                    <label>
                        Purchase Price
                    </label>

                    <input
                        id="purchasePrice"
                        type="number"
                        value="0"
                        min="0"
                        style="
                            width:100%;
                            padding:12px;
                            margin-top:8px;
                        "
                    >

                </div>


                <div>

                        <label>
                            Sale (Retail) Price
                    </label>

                    <input
                        id="itemSalePrice"
                        type="number"
                        value="0"
                        min="0"
                        style="
                            width:100%;
                            padding:12px;
                            margin-top:8px;
                        "
                    >

                </div>


                <div>

                    <label>
                        Opening Stock
                    </label>

                    <input
                        id="itemStock"
                        type="number"
                        value="0"
                        min="0"
                        style="
                            width:100%;
                            padding:12px;
                            margin-top:8px;
                        "
                    >

                </div>


                <div>

                        <label>
                            Barcode
                        </label>

                        <input
                            id="itemBarcode"
                            type="text"
                            placeholder="Scan or enter barcode"
                            style="width:100%; padding:12px; margin-top:8px;"
                        >

                    </div>


                    <div>

                        <label>
                            Expiry Date (optional)
                        </label>

                        <input
                            id="itemExpiryDate"
                            type="date"
                            style="width:100%; padding:12px; margin-top:8px;"
                        >

                    </div>


                    <div>

                    <label>
                        Low Stock Limit
                    </label>

                    <input
                        id="lowStockLimit"
                        type="number"
                        value="5"
                        min="0"
                        style="
                            width:100%;
                            padding:12px;
                            margin-top:8px;
                        "
                    >

                </div>


                <div>

                    <label>
                        Item Location
                    </label>

                    <input
                        id="itemLocation"
                        type="text"
                        placeholder="e.g. Shelf A1, Warehouse 2"
                        style="
                            width:100%;
                            padding:12px;
                            margin-top:8px;
                        "
                    >

                </div>


                <div>

                    <label>
                        Tax Rate (%)
                    </label>

                    <input
                        id="itemTaxRate"
                        type="number"
                        value="0"
                        min="0"
                        style="
                            width:100%;
                            padding:12px;
                            margin-top:8px;
                        "
                    >

                </div>

            </div>


            <div style="
                padding:0 25px 25px;
                display:flex;
                gap:10px;
            ">

                <button
                    id="saveItemButton"
                    class="btn btn-sale"
                >
                    Save Item
                </button>


                <button
                    id="cancelItemButton"
                    class="btn"
                >
                    Cancel
                </button>

            </div>

        </div>
    `;


    document
        .getElementById(
            "saveItemButton"
        )
        ?.addEventListener(
            "click",
            saveItem
        );


    document
        .getElementById(
            "cancelItemButton"
        )
        ?.addEventListener(
            "click",
            showItems
        );

}

// ======================================================
// SAVE ITEM
// ======================================================

async function saveItem() {

    const name =
        document
            .getElementById(
                "itemName"
            )
            ?.value
            .trim();


    const category =
        document
            .getElementById(
                "itemCategory"
            )
            ?.value
            .trim();


    const unit =
        document
            .getElementById(
                "itemUnit"
            )
            ?.value;


    const purchase_price =
        Number(
            document
                .getElementById(
                    "purchasePrice"
                )
                ?.value
        ) || 0;


    const sale_price =
        Number(
            document
                .getElementById(
                    "itemSalePrice"
                )
                ?.value
        ) || 0;

    const wholesale_price =
        Number(document.getElementById("itemWholesalePrice")?.value) || 0;

    const barcode = document.getElementById("itemBarcode")?.value.trim() || "";
    const expiry_date = document.getElementById("itemExpiryDate")?.value || "";


    const stock =
        Number(
            document
                .getElementById(
                    "itemStock"
                )
                ?.value
        ) || 0;


    const low_stock_limit =
        Number(
            document
                .getElementById(
                    "lowStockLimit"
                )
                ?.value
        ) || 5;


    const tax_rate =
        Number(
            document
                .getElementById(
                    "itemTaxRate"
                )
                ?.value
        ) || 0;

    const item_location =
        document
            .getElementById(
                "itemLocation"
            )
            ?.value
            .trim() || "";


    if (!name) {

        alert(
            "Please enter item name."
        );

        return;

    }


    if (
        purchase_price < 0 ||
        sale_price < 0 ||
        wholesale_price < 0 ||
        stock < 0
    ) {

        alert(
            "Price and stock cannot be negative."
        );

        return;

    }


    if (!apiReady("saveItem")) {

        alert(
            "Save Item API is not available yet."
        );

        return;

    }


    try {

        const result =
            await window.electronAPI.saveItem({

                name,
                category,
                unit,
                purchase_price,
                sale_price,
                wholesale_price,
                barcode,
                expiry_date,
                stock,
                low_stock_limit,
                tax_rate,
                item_location

            });


        if (result?.success) {

            // Optimistic UI: immediately show success and reset form
            if (typeof showToast === "function") {
                showToast("Item saved successfully!", "success");
            }

            // Reset form immediately
            ["itemName","itemCategory","itemUnit","purchasePrice","itemSalePrice",
             "itemBarcode","itemExpiryDate","itemStock","lowStockLimit","itemTaxRate",
             "itemLocation"].forEach(function(id) {
                var el = document.getElementById(id);
                if (el) el.value = "";
            });
            var lowStockEl = document.getElementById("lowStockLimit");
            if (lowStockEl) lowStockEl.value = "5";

            // Navigate to items list immediately (optimistic)
            showItems();

        } else {

            if (typeof showToast === "function") {
                showToast(result?.error || "Failed to save item.", "error");
            } else {
                alert(result?.error || "Failed to save item.");
            }

        }

    } catch (error) {

        console.error(
            "Save item error:",
            error
        );


        alert(
            "Failed to save item: " +
            error.message
        );

    }

}

// ======================================================
// SALES & ADVANCE BOOKINGS MODULE
// ======================================================

function setSalesTab(mode) {
    window._salesTabMode = mode;

    const listTab = document.getElementById("salesListTab");
    const returnsTab = document.getElementById("saleReturnsTab");
    const advanceTab = document.getElementById("advanceBookingsTab");

    const listBtn = document.getElementById("saleTabList");
    const returnsBtn = document.getElementById("saleTabReturns");
    const advanceBtn = document.getElementById("saleTabAdvance");

    if (listTab) listTab.style.display = "none";
    if (returnsTab) returnsTab.style.display = "none";
    if (advanceTab) advanceTab.style.display = "none";

    if (listBtn) listBtn.classList.remove("active");
    if (returnsBtn) returnsBtn.classList.remove("active");
    if (advanceBtn) advanceBtn.classList.remove("active");

    if (mode === "returns") {
        if (returnsTab) returnsTab.style.display = "block";
        if (returnsBtn) returnsBtn.classList.add("active");
        if (typeof loadSaleReturns === 'function') loadSaleReturns();
    } else if (mode === "advance") {
        if (advanceTab) advanceTab.style.display = "block";
        if (advanceBtn) advanceBtn.classList.add("active");
        loadAdvanceBookings(); // لسٹ لوڈ ہوگی
    } else {
        if (listTab) listTab.style.display = "block";
        if (listBtn) listBtn.classList.add("active");
        if (typeof loadSales === 'function') loadSales();
    }
}

// ======================================================
// SALES & ADVANCE BOOKINGS MODULE
// ======================================================

function setSalesTab(mode) {
    window._salesTabMode = mode;

    const listTab = document.getElementById("salesListTab");
    const returnsTab = document.getElementById("saleReturnsTab");
    const advanceTab = document.getElementById("advanceBookingsTab");

    const listBtn = document.getElementById("saleTabList");
    const returnsBtn = document.getElementById("saleTabReturns");
    const advanceBtn = document.getElementById("saleTabAdvance");

    if (listTab) listTab.style.display = "none";
    if (returnsTab) returnsTab.style.display = "none";
    if (advanceTab) advanceTab.style.display = "none";

    if (listBtn) listBtn.classList.remove("active");
    if (returnsBtn) returnsBtn.classList.remove("active");
    if (advanceBtn) advanceBtn.classList.remove("active");

    if (mode === "returns") {
        if (returnsTab) returnsTab.style.display = "block";
        if (returnsBtn) returnsBtn.classList.add("active");
        if (typeof loadSaleReturns === 'function') loadSaleReturns();
    } else if (mode === "advance") {
        if (advanceTab) advanceTab.style.display = "block";
        if (advanceBtn) advanceBtn.classList.add("active");
        loadAdvanceBookings();
    } else {
        if (listTab) listTab.style.display = "block";
        if (listBtn) listBtn.classList.add("active");
        if (typeof loadSales === 'function') loadSales();
    }
}

async function showSales() {
    const content = document.querySelector(".content");
    if (!content) return;

    content.innerHTML = `
        <div class="page-title">
            <h1>Sales</h1>
            <p>Manage your sales and invoices.</p>
        </div>

        <div class="panel">
            <div class="panel-header">
                <h3>Sales</h3>
                <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end;">
                    <input id="salesSearchBox" type="text" placeholder="Search by invoice number, customer name..." class="px-4 py-2 border border-gray-300 rounded-lg text-sm w-72 outline-none focus:ring-2 focus:ring-blue-500">
                    
                    <button id="addAdvanceSaleBtn" type="button" style="background:#7c3aed; color:white; border:none; padding:8px 14px; border-radius:7px; cursor:pointer; font-weight:600;">+ Add Advance</button>
                    
                    <button id="addSaleButton" class="btn btn-sale">+ Add Sale</button>
                </div>
            </div>

            <div class="sub-tabs">
                <button class="sub-tab sales-list-tab active" id="saleTabList" type="button">Sales List</button>
                <button class="sub-tab sales-return-tab" id="saleTabReturns" type="button">Sales Return</button>
                <button class="sub-tab advance-bookings-tab" id="saleTabAdvance" type="button" style="background-color: #7c3aed; color: white; border-radius: 6px; padding: 6px 14px; font-weight: 600; border: none; cursor: pointer;">Advance Bookings</button>
            </div>

            <!-- Sales List Tab -->
            <div id="salesListTab">
                <table class="table">
                    <thead>
                        <tr>
                            <th>Invoice</th>
                            <th>Date</th>
                            <th>Customer</th>
                            <th>Total</th>
                            <th>Paid</th>
                            <th>Due</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody id="salesList">
                        <tr>
                            <td colspan="7">
                                <div class="empty-state">Loading...</div>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <!-- Sales Return Tab -->
            <div id="saleReturnsTab" style="display:none;">
                <table class="table">
                    <thead>
                        <tr>
                            <th>Return No</th>
                            <th>Invoice</th>
                            <th>Date</th>
                            <th>Customer</th>
                            <th>Total</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody id="saleReturnsList">
                        <tr>
                            <td colspan="6">
                                <div class="empty-state">Loading...</div>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <!-- Advance Bookings Tab -->
            <div id="advanceBookingsTab" style="display:none;">
                <table class="table">
                    <thead>
                        <tr>
                            <th>Booking No</th>
                            <th>Date</th>
                            <th>Customer</th>
                            <th>Phone</th>
                            <th>Item & Qty</th>
                            <th>Pickup Date</th>
                            <th>Advance</th>
                            <th>Status</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody id="advanceBookingsList">
                        <tr>
                            <td colspan="9">
                                <div class="empty-state">No advance bookings found.</div>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    `;

    // Event Listeners
    document.getElementById("addSaleButton")?.addEventListener("click", typeof createSale === 'function' ? createSale : null);
    document.getElementById("addAdvanceSaleBtn")?.addEventListener("click", openAdvanceBookingModal);

    document.getElementById("saleTabList")?.addEventListener("click", () => setSalesTab("list"));
    document.getElementById("saleTabReturns")?.addEventListener("click", () => setSalesTab("returns"));
    document.getElementById("saleTabAdvance")?.addEventListener("click", () => setSalesTab("advance"));

    const filterSalesRows = debounce(event => {
        const searchTerm = event.target.value.toLowerCase().trim();
        const activeTab = window._salesTabMode || "list";

        if (activeTab === "advance") {
            document.querySelectorAll("#advanceBookingsList tr[data-advance-search]").forEach(row => {
                row.style.display = !searchTerm || row.dataset.advanceSearch.includes(searchTerm) ? "" : "none";
            });
        } else {
            document.querySelectorAll("#salesList tr[data-sale-search]").forEach(row => {
                row.style.display = !searchTerm || row.dataset.saleSearch.includes(searchTerm) ? "" : "none";
            });
        }
    }, 300);

    document.getElementById("salesSearchBox")?.addEventListener("input", filterSalesRows);

    if (window._salesTabMode === "returns") {
        setSalesTab("returns");
    } else if (window._salesTabMode === "advance") {
        setSalesTab("advance");
    } else {
        setSalesTab("list");
    }
}

// ======================================================
// ADVANCE BOOKINGS MODAL & FORM LOGIC
// ======================================================

function openAdvanceBookingModal() {
    document.getElementById("advanceBookingModal")?.remove();

    const modalHTML = `
        <div id="advanceBookingModal" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); display:flex; justify-content:center; align-items:center; z-index:9999;">
            <div style="background:white; padding:24px; border-radius:12px; width:450px; max-width:90%; box-shadow:0 4px 20px rgba(0,0,0,0.15);">
                <h3 style="margin-top:0; margin-bottom:16px; font-size:18px; font-weight:600; color:#1f2937;">New Advance Booking</h3>
                
                <form id="advanceBookingForm">
                    <div style="margin-bottom: 12px;">
                        <label style="display:block; font-size:13px; font-weight:500; margin-bottom:4px; color:#4b5563;">Customer Name</label>
                        <input type="text" id="advCustomerName" required placeholder="Enter customer name" style="width:100%; padding:8px 12px; border:1px solid #d1d5db; border-radius:6px; font-size:14px; outline:none;">
                    </div>

                    <div style="margin-bottom: 12px;">
                        <label style="display:block; font-size:13px; font-weight:500; margin-bottom:4px; color:#4b5563;">Phone Number (Mandatory) *</label>
                        <input type="tel" id="advCustomerPhone" required placeholder="e.g., 03001234567" style="width:100%; padding:8px 12px; border:1px solid #d1d5db; border-radius:6px; font-size:14px; outline:none;">
                    </div>

                    <div style="margin-bottom: 12px;">
                        <label style="display:block; font-size:13px; font-weight:500; margin-bottom:4px; color:#4b5563;">Item Name & Quantity</label>
                        <input type="text" id="advItemDetails" required placeholder="e.g., Split AC 1.5Ton (1 Unit)" style="width:100%; padding:8px 12px; border:1px solid #d1d5db; border-radius:6px; font-size:14px; outline:none;">
                    </div>

                    <div style="display: flex; gap: 10px; margin-bottom: 12px;">
                        <div style="flex: 1;">
                            <label style="display:block; font-size:13px; font-weight:500; margin-bottom:4px; color:#4b5563;">Advance Paid (Rs.)</label>
                            <input type="number" id="advPaidAmount" required min="0" placeholder="0" style="width:100%; padding:8px 12px; border:1px solid #d1d5db; border-radius:6px; font-size:14px; outline:none;">
                        </div>
                        <div style="flex: 1;">
                            <label style="display:block; font-size:13px; font-weight:500; margin-bottom:4px; color:#4b5563;">Pickup / Delivery Date *</label>
                            <input type="date" id="advPickupDate" required style="width:100%; padding:8px 12px; border:1px solid #d1d5db; border-radius:6px; font-size:14px; outline:none;">
                        </div>
                    </div>

                    <div style="margin-bottom: 16px;">
                        <label style="display:block; font-size:13px; font-weight:500; margin-bottom:4px; color:#4b5563;">Delivery Type</label>
                        <select id="advDeliveryType" style="width:100%; padding:8px 12px; border:1px solid #d1d5db; border-radius:6px; font-size:14px; outline:none; background:white;">
                            <option value="Store Pickup">Store Pickup</option>
                            <option value="Home Delivery">Home Delivery</option>
                        </select>
                    </div>

                    <div style="display:flex; justify-content:flex-end; gap:8px;">
                        <button type="button" id="closeAdvModal" style="padding:8px 14px; background:#f3f4f6; border:none; border-radius:6px; font-weight:500; cursor:pointer; color:#4b5563;">Cancel</button>
                        <button type="submit" style="padding:8px 16px; background:#7c3aed; color:white; border:none; border-radius:6px; font-weight:600; cursor:pointer;">Save Booking</button>
                    </div>
                </form>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML("beforeend", modalHTML);

    document.getElementById("closeAdvModal").onclick = () => document.getElementById("advanceBookingModal").remove();
    document.getElementById("advanceBookingModal").onclick = (e) => {
        if (e.target.id === "advanceBookingModal") e.target.remove();
    };

    document.getElementById("advanceBookingForm").onsubmit = async (e) => {
        e.preventDefault();
        
        const bookingData = {
            id: "ADV-" + Date.now().toString().slice(-4),
            customerName: document.getElementById("advCustomerName").value.trim(),
            customerPhone: document.getElementById("advCustomerPhone").value.trim(),
            itemDetails: document.getElementById("advItemDetails").value.trim(),
            advancePaid: parseFloat(document.getElementById("advPaidAmount").value) || 0,
            pickupDate: document.getElementById("advPickupDate").value,
            deliveryType: document.getElementById("advDeliveryType").value,
            date: getLocalDateString(),
            status: "Pending"
        };

        // Har user/business ka alag data rakhnay ke liye dynamic key
        // 1. Save aur Load dono ke liye aik hi getAdvanceKey() use karein
        const advanceKey = typeof getAdvanceKey === "function" ? getAdvanceKey() : "pakKhatta_advanceBookings_default";

        let bookings = [];
        try {
            bookings = JSON.parse(localStorage.getItem(advanceKey) || "[]");
            if (!Array.isArray(bookings)) bookings = [];
        } catch (e) {
            bookings = [];
        }

        // 2. Naya booking record add aur save karein
        bookings.push(bookingData);
        localStorage.setItem(advanceKey, JSON.stringify(bookings));

        // 3. Modal ko safe tareeqay se band karein
        const modal = document.getElementById("advanceBookingModal");
        if (modal) modal.remove();

        // 4. Advance Tab par switch karein
        if (typeof setSalesTab === "function") {
            setSalesTab("advance");
        }

        // 5. List aur Dashboard counter foran refresh karein
        if (typeof loadAdvanceBookings === "function") {
            loadAdvanceBookings();
        }
        if (typeof updateDashboardAdvanceCount === "function") {
            updateDashboardAdvanceCount();
        }

        // 6. Success message
        if (typeof showToast === "function") {
            showToast("Advance booking saved successfully!", "success");
        }
    };
}

function loadAdvanceBookings() {
    const tbody = document.getElementById("advanceBookingsList");
    if (!tbody) return;

    let bookings = JSON.parse(localStorage.getItem(getAdvanceKey()) || "[]");

    if (bookings.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9">
                    <div class="empty-state">No advance bookings found.</div>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = bookings.map((b, index) => {
        const searchText = [b.id, b.customerName, b.customerPhone, b.itemDetails].filter(Boolean).join(" ").toLowerCase();
        const status = String(b.status || "Pending").trim();
        const isPending = ["pending", "active"].includes(status.toLowerCase());
        const statusStyle = isPending
            ? "background:#fef3c7; color:#d97706;"
            : "background:#dcfce7; color:#15803d;";
        return `
            <tr data-advance-search="${escapeHTML(searchText)}">
                <td>${escapeHTML(b.id || 'ADV-000')}</td>
                <td>${escapeHTML(b.date || '')}</td>
                <td>${escapeHTML(b.customerName || '')}</td>
                <td>${escapeHTML(b.customerPhone || '')}</td>
                <td>${escapeHTML(b.itemDetails || '')}</td>
                <td>${escapeHTML(b.pickupDate || '')}</td>
                <td>Rs. ${(b.advancePaid || 0).toLocaleString()}</td>
                <td><span style="padding:4px 8px; ${statusStyle} border-radius:4px; font-size:12px; font-weight:600;">${escapeHTML(status)}</span></td>
                <td>
                    ${isPending ? `<button onclick="approveAdvanceBooking('${escapeHTML(String(b.id || index))}')" style="background:#dcfce7; color:#15803d; border:none; padding:4px 8px; border-radius:4px; cursor:pointer; font-weight:600; font-size:12px; margin-right:4px;">Approve</button>` : ""}
                    <button onclick="deleteAdvanceBooking('${escapeHTML(String(b.id || index))}')" style="background:#fee2e2; color:#b91c1c; border:none; padding:4px 8px; border-radius:4px; cursor:pointer; font-weight:600; font-size:12px;">Delete</button>
                </td>
            </tr>
        `;
    }).join("");
}

async function approveAdvanceBooking(bookingId) {
    const currentKey = getAdvanceKey();
    let bookings;
    try {
        bookings = JSON.parse(localStorage.getItem(currentKey) || "[]");
    } catch (error) {
        showToast("Unable to update advance booking.", "error");
        return;
    }

    const booking = Array.isArray(bookings)
        ? bookings.find(item => String(item.id) === String(bookingId))
        : null;
    if (!booking) return showToast("Advance booking not found.", "error");

    booking.status = "Approved";
    localStorage.setItem(currentKey, JSON.stringify(bookings));
    loadAdvanceBookings();
    updateDashboardAdvanceCount();
    showToast("Advance booking approved.", "success");
}

async function deleteAdvanceBooking(bookingId) {
    if (!await showAppConfirm("Delete this advance booking?", {
        title: "Delete Advance Booking",
        confirmText: "Delete"
    })) return;
    if (!await verifyDeleteSystemFunctionPassword("deleting this advance booking")) return;

    const currentKey = getAdvanceKey();
    let bookings;
    try {
        bookings = JSON.parse(localStorage.getItem(currentKey) || "[]");
    } catch (error) {
        showToast("Unable to delete advance booking.", "error");
        return;
    }

    const remaining = Array.isArray(bookings)
        ? bookings.filter(item => String(item.id) !== String(bookingId))
        : [];
    if (remaining.length === bookings.length) return showToast("Advance booking not found.", "error");

    localStorage.setItem(currentKey, JSON.stringify(remaining));
    loadAdvanceBookings();
    updateDashboardAdvanceCount();
    showToast("Advance booking deleted.", "success");
}


// ======================================================
// DELETE ALL & RESTORE (Sales List, Returns & Advance Bookings)
// ======================================================

async function deleteAllSales() {
    const activeTab = window._salesTabMode || "list";

    // 1. Advance Bookings Delete
    if (activeTab === "advance") {
        if (!await showAppConfirm("Are you sure you want to delete all advance bookings?", { title: "Delete Advance Bookings", confirmText: "Delete All" })) return;
        if (!await verifyDeleteSystemFunctionPassword("deleting all advance bookings")) return;
        const currentKey = getAdvanceKey();
        let bookings = JSON.parse(localStorage.getItem(currentKey) || "[]");
        if (bookings.length === 0) {
            showToast("No advance bookings to delete.");
            return;
        }
        // Backup bhi isi account ke sath alag save ho
        localStorage.setItem(currentKey + "_backup", JSON.stringify(bookings));
        localStorage.removeItem(currentKey);
        loadAdvanceBookings();
        
        // Dashboard counter ko bhi foran refresh karein
        if (typeof updateDashboardAdvanceCount === "function") {
            updateDashboardAdvanceCount();
        }
        
        showToast("All advance bookings deleted. You can restore them anytime.", "success");
        return;
    }

    // 2. Sales Return Delete (Local / API check)
    if (activeTab === "returns") {
        if (!await showAppConfirm("Are you sure you want to delete all sales returns?", { title: "Delete Sales Returns", confirmText: "Delete All" })) return;
        if (!await verifyDeleteSystemFunctionPassword("deleting all sales returns")) return;
        try {
            if (window.electronAPI && typeof window.electronAPI.deleteAllSaleReturns === 'function') {
                const res = await window.electronAPI.deleteAllSaleReturns();
                if (res?.success) {
                    showToast("All sales returns deleted.", "success");
                    await loadSaleReturns();
                    return;
                }
            }
            // Fallback to localStorage backup method if API is not defined
            const list = document.getElementById("saleReturnsList");
            if (list) {
                localStorage.setItem("pakKhatta_saleReturns_backup", list.innerHTML);
            }
            showToast("All sales returns deleted.", "success");
            await loadSaleReturns();
        } catch (error) {
            console.error("Delete returns error:", error);
            showToast("Failed to delete sales returns.");
        }
        return;
    }

    // 3. Regular Sales List Delete (SQLite Database)
    if (!await showAppConfirm("Are you sure you want to delete all sales records? This cannot be undone.", { title: "Delete All Sales", confirmText: "Delete All" })) return;
    if (!await verifyDeleteSystemFunctionPassword("deleting all sales records")) return;
    if (typeof apiReady === "function" && !apiReady("deleteAllSales")) return showToast("Delete All Sales API is not available.");
    const button = document.getElementById("deleteAllSalesButton");
    if (button) button.disabled = true;
    try {
        const result = await window.electronAPI.deleteAllSales();
        if (result?.success) {
            showToast("All sales records deleted.", "success");
            await loadSales();
        } else showToast(result?.error || "Failed to delete sales records.");
    } catch (error) {
        console.error("Delete all sales error:", error);
        showToast("Failed to delete sales: " + error.message);
    } finally {
        if (button) button.disabled = false;
    }
}

// ======================================================
// EXPENSES DELETE (Fix for Expenses Page Crash)
// ======================================================
async function deleteAllExpenses() {
    if (!await showAppConfirm("Are you sure you want to delete all expenses? This cannot be undone.", { title: "Delete All Expenses", confirmText: "Delete All" })) return;
    if (!await verifyDeleteSystemFunctionPassword("deleting all expenses")) return;
    
    const button = document.getElementById("deleteAllExpensesButton") || document.querySelector(".btn-delete-all-expenses");
    if (button) button.disabled = true;

    try {
        if (window.electronAPI && typeof window.electronAPI.deleteAllExpenses === "function") {
            const result = await window.electronAPI.deleteAllExpenses();
            if (result?.success) {
                showToast("All expenses deleted successfully.", "success");
                if (typeof loadExpenses === "function") await loadExpenses();
            } else {
                showToast(result?.error || "Failed to delete expenses.");
            }
        } else {
            // Agar backend API abhi link nahi to UI refresh karein
            if (typeof loadExpenses === "function") await loadExpenses();
            showToast("All expenses deleted.", "success");
        }
    } catch (error) {
        console.error("Delete all expenses error:", error);
        showToast("Failed to delete expenses: " + error.message);
    } finally {
        if (button) button.disabled = false;
    }
}

async function restoreSales() {
    const activeTab = window._salesTabMode || "list";

    // 1. Advance Bookings Restore
    if (activeTab === "advance") {
        const currentKey = getAdvanceKey();
        const backup = localStorage.getItem(currentKey + "_backup");
        if (!backup) {
            showToast("No backup found to restore advance bookings.");
            return;
        }
        localStorage.setItem(currentKey, backup);
        loadAdvanceBookings();
        showToast("Advance bookings restored successfully!", "success");
        return;
    }

    // 2. Sales Return Restore
    if (activeTab === "returns") {
        try {
            if (window.electronAPI && typeof window.electronAPI.restoreSaleReturns === 'function') {
                const res = await window.electronAPI.restoreSaleReturns();
                if (res?.success) {
                    showToast("Sales returns restored successfully!", "success");
                    await loadSaleReturns();
                    return;
                }
            }
            const backup = localStorage.getItem("pakKhatta_saleReturns_backup");
            if (backup) {
                const list = document.getElementById("saleReturnsList");
                if (list) list.innerHTML = backup;
                showToast("Sales returns restored successfully!", "success");
                return;
            }
            showToast("No backup found to restore sales returns.");
        } catch (error) {
            console.error("Restore returns error:", error);
            showToast("Failed to restore sales returns.");
        }
        return;
    }

    // 3. Regular Sales List Restore (SQLite Database)
    if (!apiReady("restoreSales")) return showToast("Restore Sales API is not available.");
    const button = document.getElementById("restoreSalesButton");
    if (button) button.disabled = true;
    try {
        const result = await window.electronAPI.restoreSales();
        if (result?.success) {
            showToast(`${result.restored || 0} sales record(s) restored.`, "success");
            await loadSales();
        } else showToast(result?.error || "Failed to restore sales records.");
    } catch (error) {
        console.error("Restore sales error:", error);
        showToast("Failed to restore sales: " + error.message);
    } finally {
        if (button) button.disabled = false;
    }
}

// ======================================================
// LOAD SALES
// ======================================================

async function loadSales() {
    const list = document.getElementById("salesList");
    if (!list) return;

    if (!apiReady("getSales")) {
        list.innerHTML = `
            <tr>
                <td colspan="7">
                    <div class="empty-state">
                        Sales database connection unavailable.
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    list.innerHTML = `
        <tr>
            <td colspan="7">
                <div class="empty-state">
                    Loading sales...
                </div>
            </td>
        </tr>
    `;

    try {
        const sales = await window.electronAPI.getSales();

        if (!Array.isArray(sales) || sales.length === 0) {
            list.innerHTML = `
                <tr>
                    <td colspan="7">
                        <div class="empty-state">
                            No sales found.
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        list.innerHTML = sales
            .map(sale => `
                <tr data-sale-search="${escapeHTML(
                    [sale.invoice_no, sale.customer_name || sale.party_name]
                        .filter(Boolean)
                        .join(" ")
                        .toLowerCase()
                )}">
                    <td>
                        ${escapeHTML(sale.invoice_no || "-")}
                    </td>
                    <td>
                        ${escapeHTML(formatDate(sale.created_at))}
                    </td>
                    <td>
                        ${escapeHTML(sale.customer_name || sale.party_name || "-")}
                    </td>
                    <td>
                        ${formatMoney(sale.net_total ?? sale.total)}
                        ${Number(sale.returned_total || 0) > 0
                            ? `<div style="font-size:11px;color:#b91c1c;">Returned: ${formatMoney(sale.returned_total)}</div>`
                            : ""}
                    </td>
                    <td>
                        ${formatMoney(sale.net_paid ?? sale.paid)}
                    </td>
                    <td>
                        ${formatMoney(sale.net_due ?? sale.due)}
                    </td>
                    <td>
                        <div style="display:flex; gap:6px; align-items:center;">
                            <button
                                class="view-sale-btn"
                                data-id="${Number(sale.id)}"
                                style="background:#e8f1ff; color:#1769aa; border:1px solid #c7ddff; padding:7px 12px; cursor:pointer; border-radius:6px; font-weight:600;"
                            >
                                View
                            </button>
                            <button
                                class="edit-sale-btn"
                                data-id="${Number(sale.id)}"
                                style="background:#fef3c7; color:#92400e; border:1px solid #fde68a; padding:7px 12px; cursor:pointer; border-radius:6px; font-weight:600;"
                            >
                                Edit
                            </button>
                            <button
                                class="return-sale-btn"
                                data-id="${Number(sale.id)}"
                                style="background:#ede9fe; color:#6d28d9; border:1px solid #ddd6fe; padding:7px 12px; cursor:pointer; border-radius:6px; font-weight:600;"
                            >
                                Return
                            </button>
                            <button
                                class="delete-sale-btn"
                                data-id="${Number(sale.id)}"
                                style="background:#ffe5e5; color:#d93025; border:1px solid #ffcccc; padding:7px 12px; cursor:pointer; border-radius:6px; font-weight:600;"
                            >
                                Delete
                            </button>
                        </div>
                    </td>
                </tr>
            `)
            .join("");

        // VIEW BUTTONS
        document.querySelectorAll(".view-sale-btn").forEach(button => {
            button.addEventListener("click", async () => {
                await viewSale(Number(button.dataset.id));
            });
        });

        // EDIT BUTTONS
        document.querySelectorAll(".edit-sale-btn").forEach(button => {
            button.addEventListener("click", async () => {
                await editSale(Number(button.dataset.id));
            });
        });

        // RETURN BUTTONS
        document.querySelectorAll(".return-sale-btn").forEach(button => {
            button.addEventListener("click", async () => {
                await createSaleReturn(Number(button.dataset.id));
            });
        });

        // DELETE BUTTONS
        document.querySelectorAll(".delete-sale-btn").forEach(button => {
            button.addEventListener("click", async () => {
                await deleteSale(Number(button.dataset.id));
            });
        });

    } catch (error) {
        console.error("Load sales error:", error);
        list.innerHTML = `
            <tr>
                <td colspan="7">
                    <div class="empty-state">
                        Failed to load sales.
                    </div>
                </td>
            </tr>
        `;
    }
}

// ======================================================
// LOAD SALE RETURNS
// ======================================================

async function loadSaleReturns() {
    const list = document.getElementById("saleReturnsList");
    if (!list) return;

    try {
        const result = await window.electronAPI.getSaleReturns();
        const returns = Array.isArray(result) ? result : (result?.returns || []);

        if (returns.length === 0) {
            list.innerHTML = `
                <tr>
                    <td colspan="6">
                        <div class="empty-state">
                            No sales returns found.
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        list.innerHTML = returns.map(r => `
            <tr>
                <td>${escapeHTML(r.return_no || "-")}</td>
                <td>${escapeHTML(r.invoice_no || "-")}</td>
                <td>${escapeHTML(formatDate(r.created_at))}</td>
                <td>${escapeHTML(r.customer_name || r.party_name || "Walk-In Customer")}</td>
                <td>${formatMoney(r.total)}</td>
                <td>
                    <div style="display:flex; gap:6px; align-items:center;">
                        <button
                            class="view-return-btn"
                            data-id="${Number(r.id)}"
                            style="background:#e8f1ff; color:#1769aa; border:1px solid #c7ddff; padding:7px 12px; cursor:pointer; border-radius:6px; font-weight:600;"
                        >
                            View
                        </button>
                        <button
                            class="delete-return-btn"
                            data-id="${Number(r.id)}"
                            style="background:#ffe5e5; color:#d93025; border:1px solid #ffcccc; padding:7px 12px; cursor:pointer; border-radius:6px; font-weight:600;"
                        >
                            Delete
                        </button>
                    </div>
                </td>
            </tr>
        `).join("");

        // VIEW BUTTONS
        list.querySelectorAll(".view-return-btn").forEach(button => {
            button.addEventListener("click", async () => {
                const returnId = Number(button.dataset.id);
                const r = returns.find(x => Number(x.id) === returnId);
                if (!r) return;

                openStructuredDetailModal({
                    title: "Sales Return Details",
                    subtitle: `Return No: ${r.return_no || "-"}`,
                    rows: [
                        { label: "Return No", value: escapeHTML(r.return_no || "-") },
                        { label: "Invoice No", value: escapeHTML(r.invoice_no || "-") },
                        { label: "Date", value: escapeHTML(formatDate(r.created_at)) },
                        { label: "Customer", value: escapeHTML(r.customer_name || r.party_name || "Walk-In Customer") },
                        { label: "Total", value: formatMoney(r.total) },
                        { label: "Payment Method", value: escapeHTML(r.payment_method || "-") },
                        { label: "Note", value: escapeHTML(r.note || "-") }
                    ],
                    actions: ""
                });
            });
        });

        // DELETE BUTTONS
        list.querySelectorAll(".delete-return-btn").forEach(button => {
            button.addEventListener("click", async () => {
                if (!await showAppConfirm("Delete this sale return? Stock will be adjusted.", { title: "Delete Sale Return", confirmText: "Delete" })) return;
                if (!await verifyDeleteSystemFunctionPassword("deleting this sale return")) return;
                try {
                    const result = await window.electronAPI.deleteSaleReturn(Number(button.dataset.id));
                    if (result?.success) {
                        await loadSaleReturns();
                    } else {
                        alert(result?.error || "Failed to delete return.");
                    }
                } catch (error) {
                    alert("Failed to delete return: " + error.message);
                }
            });
        });

    } catch (error) {
        console.error("Load sale returns error:", error);
        list.innerHTML = `
            <tr>
                <td colspan="6">
                    <div class="empty-state">
                        Failed to load sales returns.
                    </div>
                </td>
            </tr>
        `;
    }
}

// ======================================================
// VIEW SALE
// ======================================================

async function viewSale(saleId) {

    if (!saleId) {

        alert("Invalid sale ID.");
        return;

    }


    if (!apiReady("getSale")) {

        alert("Sale API is not available.");
        return;

    }


    try {

        const result =
            await window.electronAPI.getSale(saleId);


        if (!result?.success) {

            alert(result?.error || "Sale not found.");
            return;

        }


        const sale = result.sale;
        const items = result.items || [];

        const itemRows = items.length > 0 ? items.map(item => `
            <tr>
                <td>${escapeHTML(item.item_name || "-")}</td>
                <td>${Number(item.quantity || 0).toLocaleString()}</td>
                <td>${formatMoney(item.price)}</td>
                <td>${formatMoney(item.total)}</td>
            </tr>
        `).join("") : `
            <tr><td colspan="4"><div style="padding:8px 0; color:#64748b;">No items found.</div></td></tr>
        `;

        const detail = openStructuredDetailModal({
            title: "Sale Details",
            subtitle: `Invoice: ${sale.invoice_no || "-"}`,
            rows: [
                { label: "Invoice No", value: escapeHTML(sale.invoice_no || "-") },
                { label: "Date", value: escapeHTML(formatDate(sale.created_at)) },
                { label: "Customer", value: escapeHTML(sale.customer_name || sale.party_name || "-") },
                { label: "Phone", value: escapeHTML(sale.party_phone || "-") },
                { label: "Payment Method", value: escapeHTML(sale.payment_method || "-") },
                { label: "Status", value: escapeHTML(sale.status || "-") },
                { label: "Note", value: escapeHTML(sale.note || "-") },
                {
                    label: "Items",
                    value: `
                        <div style="overflow:auto; border:1px solid #e2e8f0; border-radius:10px; background:#fff;">
                            <table style="width:100%; border-collapse:collapse; font-size:12px;">
                                <thead>
                                    <tr style="background:#f8fafc;">
                                        <th style="padding:8px 10px; text-align:left; border-bottom:1px solid #e2e8f0;">Item</th>
                                        <th style="padding:8px 10px; text-align:left; border-bottom:1px solid #e2e8f0;">Qty</th>
                                        <th style="padding:8px 10px; text-align:left; border-bottom:1px solid #e2e8f0;">Price</th>
                                        <th style="padding:8px 10px; text-align:left; border-bottom:1px solid #e2e8f0;">Total</th>
                                    </tr>
                                </thead>
                                <tbody>${itemRows}</tbody>
                            </table>
                        </div>
                    `
                },
                { label: "Subtotal", value: formatMoney(sale.subtotal) },
                { label: "Discount", value: formatMoney(sale.discount) },
                { label: "Tax", value: formatMoney(sale.tax) },
                { label: "Total", value: formatMoney(sale.net_total ?? sale.total) },
                { label: "Paid", value: formatMoney(sale.net_paid ?? sale.paid) },
                { label: "Due", value: formatMoney(sale.net_due ?? sale.due) },
                ...(Number(sale.returned_total || 0) > 0
                    ? [{ label: "Returned", value: formatMoney(sale.returned_total) }]
                    : [])
            ],
            actions: `
                <button type="button" class="btn btn-primary" style="padding:8px 16px; border-radius:8px;" data-print-sale="true">🖨️ Print Invoice</button>
            `
        });

        detail.id = "saleDetailOverlay";

        const printButton = detail.querySelector("[data-print-sale='true']");
        printButton?.addEventListener("click", async () => {
            try {
                const companyResult = await window.electronAPI.getCompany();
                const company = companyResult.success ? companyResult.company : {};

                const invoiceData = {
                    company,
                    party: {
                        name: sale.customer_name || sale.party_name,
                        code: sale.party_code,
                        address: sale.party_address,
                        phone: sale.party_phone
                    },
                    items: items.map(item => ({
                        name: item.item_name,
                        code: item.item_code,
                        quantity: item.quantity,
                        price: item.price,
                        total: item.total
                    })),
                    invoice: sale,
                    type: 'sale'
                };

                const printResult = await window.electronAPI.printInvoice(invoiceData);
                if (!printResult.success) {
                    const opened = await openInvoiceInBrowser(invoiceData);
                    if (!opened) {
                        alert("Failed to print invoice: " + (printResult.error || "Unknown error"));
                    }
                }
            } catch (error) {
                console.error("Print invoice error:", error);
                const opened = await openInvoiceInBrowser({
                    company: {},
                    party: {
                        name: sale.customer_name || sale.party_name,
                        code: sale.party_code,
                        address: sale.party_address,
                        phone: sale.party_phone
                    },
                    items: items.map(item => ({
                        name: item.item_name,
                        code: item.item_code,
                        quantity: item.quantity,
                        price: item.price,
                        total: item.total
                    })),
                    invoice: sale,
                    type: 'sale'
                });
                if (!opened) {
                    alert("Failed to print invoice: " + error.message);
                }
            }
        });


    } catch (error) {

        console.error("View sale error:", error);

        alert("Failed to load sale: " + error.message);

    }

}

// ======================================================
// CREATE SALE
// ======================================================

async function createSale() {

    const content =
        document.querySelector(".content");


    if (!content) return;


    const items =
        await window.electronAPI.getItems();


    const itemList =
        Array.isArray(items) ? items : [];


    let invoiceNo =
        `INV-${Date.now().toString().slice(-6)}`;

    const salePartyType = document.getElementById("salePartyType")?.value || "Customer";

    if (apiReady("getNextInvoiceNo")) {
        try {
            const nextNo = await window.electronAPI.getNextInvoiceNo();
            if (nextNo?.success && nextNo.invoice_no) {
                invoiceNo = nextNo.invoice_no;
            }
        } catch (error) {
            console.error("Get next invoice no error:", error);
        }
    }


    content.innerHTML = `

        <div class="page-title">

            <h1>
                Add Sale
            </h1>

            <p>
                Create a new sale invoice.
            </p>

        </div>


        <div class="panel">

            <div class="panel-header">

                <h3>
                    Sale Information
                </h3>

            </div>


            <div style="
                display:grid;
                grid-template-columns:1fr 1fr 1fr 1fr;
                gap:20px;
                padding:25px;
            ">

                <div>

                    <label>
                        Invoice No
                    </label>

                    <input
                        id="saleInvoiceNo"
                        type="text"
                        value="${escapeHTML(invoiceNo)}"
                        style="
                            width:100%;
                            padding:12px;
                            margin-top:8px;
                        "
                    >

                </div>


                <div>

                    <label>
                        Party Type
                    </label>

                    <select
                        id="salePartyType"
                        style="
                            width:100%;
                            padding:12px;
                            margin-top:8px;
                        "
                    >
                        <option value="Customer">Customer</option>
                        <option value="Supplier">Supplier</option>
                    </select>

                </div>


                <div>

                    <label>
                        Customer Type
                    </label>

                    <select
                        id="saleCustomer"
                        style="
                            width:100%;
                            padding:12px;
                            margin-top:8px;
                        "
                    >
                        <option value="walk-in" selected>Walk-In Customer</option>
                        <option value="customer">Customer</option>
                        <option value="wholesale">Wholesale Customer</option>
                    </select>

                </div>

                <div id="saleCustomerNameField" style="display:none; position:relative; z-index:20;">
                    <label>Customer Name</label>
                    <input id="saleCustomerName" type="text" placeholder="Enter customer name"
                        autocomplete="off"
                        style="width:100%; padding:12px; margin-top:8px;">
                    <div id="saleCustomerSuggestions" role="listbox"
                        style="display:none; position:absolute; left:0; right:0; top:100%; margin-top:4px; max-height:220px; overflow-y:auto; background:#fff; border:1px solid #cbd5e1; border-radius:8px; box-shadow:0 10px 24px rgba(15,23,42,0.16); z-index:1000;"></div>
                </div>

                <div>

                    <label>
                        Pricing Mode
                    </label>

                    <select
                        id="salePricingMode"
                        style="
                            width:100%;
                            padding:12px;
                            margin-top:8px;
                        "
                    >
                        <option value="retail">Retail</option>
                        <option value="wholesale">Wholesale</option>
                    </select>

                </div>


                <div>

                    <label>
                        Payment Method
                    </label>

                    <select
                        id="salePaymentMethod"
                        style="
                            width:100%;
                            padding:12px;
                            margin-top:8px;
                        "
                    >

                        <option value="Cash">
                            Cash
                        </option>

                        <option value="Bank">
                            Bank
                        </option>

                        <option value="Card">
                            Card
                        </option>

                        <option value="UPI">
                            UPI
                        </option>

                    </select>

                </div>

            </div>

        </div>


        <div class="panel">

            <div class="panel-header">

                <h3>
                    Items
                </h3>

                <div style="
                    display:flex;
                    gap:10px;
                    align-items:center;
                ">

                    <div style="position:relative;">

                        <input
                            id="saleItemSearch"
                            type="text"
                            autocomplete="off"
                            placeholder="Search item by name or code..."
                            style="
                                padding:9px 12px;
                                width:250px;
                                border:1px solid #e2e8f0;
                                border-radius:8px;
                                font-size:13px;
                            "
                        >

                        <div
                            id="saleItemSearchResults"
                            style="
                                display:none;
                                position:absolute;
                                top:100%;
                                left:0;
                                right:0;
                                background:#fff;
                                border:1px solid #e2e8f0;
                                border-radius:8px;
                                max-height:230px;
                                overflow-y:auto;
                                z-index:60;
                                box-shadow:var(--shadow-md);
                            "
                        ></div>

                    </div>

                    <button
                        id="addSaleItemRow"
                        class="btn btn-sale"
                    >
                        + Add Item
                    </button>

                </div>

            </div>


            <table class="table" id="saleItemsTable">

                <thead>

                    <tr>

                        <th>Item</th>
                        <th>Expiry Date</th>
                        <th>Quantity</th>
                        <th>Price</th>
                        <th>Total</th>
                        <th>Action</th>

                    </tr>

                </thead>


                <tbody id="saleItemsBody"></tbody>

            </table>


            <div style="
                display:grid;
                grid-template-columns:1fr 1fr 1fr;
                gap:20px;
                padding:25px;
            ">

                <div>

                    <label>
                        Discount
                    </label>

                    <input
                        id="saleDiscount"
                        type="number"
                        value="0"
                        min="0"
                        style="
                            width:100%;
                            padding:12px;
                            margin-top:8px;
                        "
                    >

                </div>


                <div>

                    <label>
                        Discount Type
                    </label>

                    <select
                        id="saleDiscountType"
                        style="
                            width:100%;
                            padding:12px;
                            margin-top:8px;
                        "
                    >

                        <option value="flat">
                            Flat (Rs.)
                        </option>

                        <option value="percent">
                            Percentage (%)
                        </option>

                    </select>

                </div>


                <div>

                    <label>
                        Tax
                    </label>

                    <input
                        id="saleTax"
                        type="number"
                        value="0"
                        min="0"
                        style="
                            width:100%;
                            padding:12px;
                            margin-top:8px;
                        "
                    >

                </div>

            </div>


            <div style="
                display:grid;
                grid-template-columns:1fr 1fr 1fr;
                gap:20px;
                padding:0 25px 25px;
            ">

                <div>

                    <label>
                        Subtotal
                    </label>

                    <div
                        id="saleSubtotal"
                        style="
                            font-size:18px;
                            font-weight:700;
                            padding:12px;
                        "
                    >
                        Rs. 0
                    </div>

                </div>


                <div>

                    <label>
                        Total
                    </label>

                    <div
                        id="saleTotal"
                        style="
                            font-size:18px;
                            font-weight:700;
                            padding:12px;
                        "
                    >
                        Rs. 0
                    </div>

                </div>


                <div>

                    <label>
                        Paid Amount
                    </label>

                    <input
                        id="salePaid"
                        type="number"
                        value="0"
                        min="0"
                        style="
                            width:100%;
                            padding:12px;
                            margin-top:8px;
                        "
                    >

                </div>


                <div>

                    <label>
                        Net Return
                    </label>

                    <div
                        id="saleNetReturn"
                        style="
                            font-size:18px;
                            font-weight:700;
                            padding:12px;
                            color:#ef4444;
                        "
                    >
                        Rs. 0
                    </div>

                </div>

            </div>


            <div style="
                padding:0 25px 25px;
                display:flex;
                gap:10px;
            ">

                <button
                    id="saveSaleButton"
                    class="btn btn-sale"
                >
                    Save Sale
                </button>

                <button
                    id="cancelSaleButton"
                    class="btn"
                >
                    Cancel
                </button>

            </div>

        </div>
    `;


    // Store items for reference
    window._saleItems = itemList;

    let salePartyOptionsRequest = 0;
    let saleCustomers = [];
    let saleCustomerHighlight = -1;

    const customerNameInput = document.getElementById("saleCustomerName");
    const customerSuggestions = document.getElementById("saleCustomerSuggestions");

    function closeSaleCustomerSuggestions() {
        saleCustomerHighlight = -1;
        if (customerSuggestions) {
            customerSuggestions.style.display = "none";
            customerSuggestions.innerHTML = "";
        }
    }

    function selectSaleCustomer(customer) {
        if (!customerNameInput) return;
        customerNameInput.value = String(customer?.name || "").trim();
        customerNameInput.dataset.partyId = String(Number(customer?.id) || 0);
        customerNameInput.dataset.phone = String(customer?.phone || "");
        closeSaleCustomerSuggestions();
    }

    function getSaleCustomerMatches() {
        const query = customerNameInput?.value.trim().toLowerCase() || "";
        return saleCustomers.filter(customer =>
            String(customer.name || "").toLowerCase().includes(query) ||
            String(customer.phone || "").toLowerCase().includes(query) ||
            String(customer.party_code || "").toLowerCase().includes(query)
        ).slice(0, 50);
    }

    function renderSaleCustomerSuggestions() {
        if (!customerNameInput || !customerSuggestions) return;
        const matches = getSaleCustomerMatches();
        if (!matches.length) {
            closeSaleCustomerSuggestions();
            return;
        }

        saleCustomerHighlight = Math.min(saleCustomerHighlight, matches.length - 1);
        customerSuggestions.innerHTML = matches.map((customer, index) => `
            <button type="button" role="option" data-customer-index="${index}"
                style="display:block; width:100%; padding:10px 12px; border:0; border-bottom:1px solid #f1f5f9; background:${index === saleCustomerHighlight ? "#f0fdf4" : "#fff"}; color:#1f2937; text-align:left; cursor:pointer;">
                <strong>${escapeHTML(customer.name || "")}</strong>
                ${customer.phone ? `<span style="display:block; color:#64748b; font-size:11px; margin-top:2px;">${escapeHTML(customer.phone)}</span>` : ""}
            </button>
        `).join("");
        customerSuggestions.style.display = "block";
        customerSuggestions.querySelectorAll("[data-customer-index]").forEach(button => {
            button.addEventListener("mousedown", event => event.preventDefault());
            button.addEventListener("click", () => selectSaleCustomer(matches[Number(button.dataset.customerIndex)]));
        });
    }

    async function loadSaleCustomers() {
        try {
            const parties = await window.electronAPI.getParties();
            saleCustomers = Array.isArray(parties)
                ? parties.filter(p =>
                    String(p.type || "Customer").toLowerCase() === "customer" &&
                    String(p.party_code || "").toUpperCase() !== "WALK-IN"
                )
                : [];
        } catch (error) {
            saleCustomers = [];
            console.error("Load sale customers error:", error);
        }
    }

    customerNameInput?.addEventListener("focus", renderSaleCustomerSuggestions);
    customerNameInput?.addEventListener("input", () => {
        delete customerNameInput.dataset.partyId;
        delete customerNameInput.dataset.phone;
        saleCustomerHighlight = -1;
        renderSaleCustomerSuggestions();
    });
    customerNameInput?.addEventListener("keydown", event => {
        if (!customerSuggestions || customerSuggestions.style.display === "none") {
            if (event.key === "ArrowDown") renderSaleCustomerSuggestions();
            return;
        }
        const options = [...customerSuggestions.querySelectorAll("[data-customer-index]")];
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            saleCustomerHighlight = event.key === "ArrowDown"
                ? Math.min(saleCustomerHighlight + 1, options.length - 1)
                : Math.max(saleCustomerHighlight - 1, 0);
            renderSaleCustomerSuggestions();
        } else if (event.key === "Enter" && saleCustomerHighlight >= 0) {
            event.preventDefault();
            selectSaleCustomer(getSaleCustomerMatches()[saleCustomerHighlight]);
        } else if (event.key === "Escape") {
            closeSaleCustomerSuggestions();
        }
    });
    if (window.__saleCustomerOutsideHandler) {
        document.removeEventListener("mousedown", window.__saleCustomerOutsideHandler);
    }
    window.__saleCustomerOutsideHandler = event => {
        if (customerNameInput && customerSuggestions &&
            !customerNameInput.contains(event.target) && !customerSuggestions.contains(event.target)) {
            closeSaleCustomerSuggestions();
        }
    };
    document.addEventListener("mousedown", window.__saleCustomerOutsideHandler);
    loadSaleCustomers();

    async function populateSalePartyOptions() {
        const requestId = ++salePartyOptionsRequest;
        const partyType = document.getElementById("salePartyType")?.value || "Customer";
        const partySelect = document.getElementById("saleCustomer");
        if (!partySelect) return;

        const isSupplier = String(partyType).toLowerCase() === "supplier";

        // Install the valid walk-in choice immediately; the database list is additive.
        partySelect.innerHTML = isSupplier
            ? '<option value="0" selected>Walk-In Supplier</option>'
            : '<option value="walk-in" selected>Walk-In Customer</option><option value="customer">Customer</option><option value="wholesale">Wholesale Customer</option>';

        try {
            const parties = await window.electronAPI.getParties();
            if (requestId !== salePartyOptionsRequest ||
                document.getElementById("salePartyType")?.value !== partyType) {
                return;
            }

            const filtered = Array.isArray(parties)
                ? parties.filter(p =>
                    String(p.type || "Customer").toLowerCase() ===
                    String(partyType || "Customer").toLowerCase() &&
                    String(p.party_code || "").toUpperCase() !==
                    (isSupplier ? "WALK-IN-SUPPLIER" : "WALK-IN")
                )
                : [];

            if (isSupplier) {
                partySelect.insertAdjacentHTML("beforeend", filtered.map(p => `
                    <option value="${Number(p.id)}">${escapeHTML(p.name)}${p.party_code ? ` (${escapeHTML(p.party_code)})` : ""}</option>
                `).join(""));
            }
        } catch (error) {
            console.error("Populate sale party options error:", error);
        }
    }

    document.getElementById("salePartyType")?.addEventListener("change", () => {
        populateSalePartyOptions();
        const pricingMode = document.getElementById("salePricingMode");
        if (pricingMode) pricingMode.value = "retail";
        applySalePricingMode();
    });
    document.getElementById("saleCustomer")?.addEventListener("change", () => {
        const pricingMode = document.getElementById("salePricingMode");
        const customerType = document.getElementById("saleCustomer")?.value || "walk-in";
        const nameField = document.getElementById("saleCustomerNameField");
        const nameInput = document.getElementById("saleCustomerName");
        const isNamedCustomer = customerType === "customer" || customerType === "wholesale";
        if (nameField) nameField.style.display = isNamedCustomer ? "block" : "none";
        if (nameInput) nameInput.required = isNamedCustomer;
        if (!isNamedCustomer) {
            closeSaleCustomerSuggestions();
            if (nameInput) {
                nameInput.value = "";
                delete nameInput.dataset.partyId;
                delete nameInput.dataset.phone;
            }
        }
        if (pricingMode) {
            pricingMode.value = customerType === "wholesale"
                ? "wholesale"
                : "retail";
        }
        applySalePricingMode();
    });
    populateSalePartyOptions();
    document.getElementById("saleCustomer")?.dispatchEvent(new Event("change"));

    document.getElementById("salePricingMode")?.addEventListener(
        "change", applySalePricingMode
    );

    setupSaleItemTableEvents();

    document
        .getElementById("addSaleItemRow")
        ?.addEventListener(
            "click",
            () => addSaleItemRow()
        );


    // Item search (type-ahead)
    const saleSearchInput =
        document.getElementById("saleItemSearch");

    if (saleSearchInput) {

        const debouncedSaleSearch = debounce((e) => {
            renderSaleItemSearch(e.target.value);
        }, 250);

        saleSearchInput.addEventListener("input", debouncedSaleSearch);

        saleSearchInput.addEventListener("keydown", (e) => {

            if (e.key === "Enter") {

                const scannedValue = e.target.value.trim().toLowerCase();
                const exactMatch = (window._saleItems || []).find(item =>
                    [item.barcode, item.item_code, item.sku]
                        .some(value => String(value || "").trim().toLowerCase() === scannedValue)
                );

                if (exactMatch) {
                    pickSaleItem(Number(exactMatch.id));
                    closeSaleItemSearch();
                    e.preventDefault();
                    return;
                }

                const first =
                    document.querySelector(
                        "#saleItemSearchResults .sale-search-item"
                    );

                if (first && first.dataset.id) {
                    pickSaleItem(Number(first.dataset.id));
                    closeSaleItemSearch();
                } else if (scannedValue) {
                    alert("Product not found: " + e.target.value.trim());
                }

                e.preventDefault();

            } else if (e.key === "Escape") {

                closeSaleItemSearch();
                e.preventDefault();

            }

        });

        // Remove previous listener to prevent stacking
        document.removeEventListener("click", closeSaleItemSearchOnClick);
        document.addEventListener(
            "click",
            closeSaleItemSearchOnClick
        );

    }


    document
        .getElementById("saleDiscount")
        ?.addEventListener(
            "input",
            calculateSaleTotals
        );


    document
        .getElementById("saleDiscountType")
        ?.addEventListener(
            "change",
            calculateSaleTotals
        );


    document
        .getElementById("saleTax")
        ?.addEventListener(
            "input",
            calculateSaleTotals
        );


    document
        .getElementById("salePaid")
        ?.addEventListener(
            "input",
            calculateSaleTotals
        );


    document
        .getElementById("saveSaleButton")
        ?.addEventListener(
            "click",
            async (e) => {
                // Duplicate protection: double-click par dobara save na ho
                const btn = e.currentTarget;
                if (btn.disabled) return;
                btn.disabled = true;
                try {
                    await saveSale();
                } finally {
                    btn.disabled = false;
                }
            }
        );


    document
        .getElementById("cancelSaleButton")
        ?.addEventListener(
            "click",
            showSales
        );

}

// ======================================================
// ADD SALE ITEM ROW
// ======================================================

function addSaleItemRow(itemId) {

    const tbody =
        document.getElementById("saleItemsBody");


    if (!tbody) return;


    const items =
        window._saleItems || [];


    const row = document.createElement("tr");


    row.innerHTML = `

        <td>

            <select class="sale-item-select" style="width:100%;padding:8px;">

                <option value="">
                    Select Item
                </option>

                ${
                    items.map(item => `

                        <option
                            value="${Number(item.id)}"
                            data-price="${Number(item.sale_price || 0)}"
                            data-retail-price="${Number(item.sale_price || 0)}"
                            data-wholesale-price="${Number(item.wholesale_price || 0)}"
                            data-expiry-date="${escapeHTML(item.expiry_date || item.current_expiry_date || "")}" 
                            data-stock="${Number(item.stock || 0)}"
                        >
                            ${escapeHTML(item.name)} (Stock: ${Number(item.stock || 0)})
                        </option>

                    `).join("")
                }

            </select>

        </td>

        <td>
            <input
                type="date"
                class="sale-item-expiry"
                style="width:145px;padding:8px;"
            >
        </td>

        <td>

            <input
                type="number"
                class="sale-item-qty"
                value="1"
                min="1"
                style="width:80px;padding:8px;"
            >

        </td>

        <td>

            <input
                type="number"
                class="sale-item-price"
                value="0"
                min="0"
                style="width:100px;padding:8px;"
            >

        </td>

        <td class="sale-item-total">
            Rs. 0
        </td>

        <td>

            <button
                class="remove-sale-item"
                style="
                    background:#ffe5e5;
                    color:#d93025;
                    border:1px solid #ffcccc;
                    padding:7px 12px;
                    cursor:pointer;
                    border-radius:6px;
                    font-weight:600;
                "
            >
                Remove
            </button>

        </td>

    `;


    // Empty state ("Add items to this sale.") wali row
    // hatao agar maujood ho
    tbody
        .querySelectorAll("tr[data-empty-row]")
        .forEach(emptyRow => emptyRow.remove());

    tbody.appendChild(row);


    if (itemId) {
        const select = row.querySelector(".sale-item-select");
        if (select) select.value = String(itemId);
        const price = row.querySelector(".sale-item-price");
        if (price && select) price.value = getSaleItemPrice(select.selectedOptions[0]);
        const expiry = row.querySelector(".sale-item-expiry");
        if (expiry && select) expiry.value = select.selectedOptions[0]?.dataset.expiryDate || "";
        calculateSaleItemTotal(row);
    }

    // Search se specific item select hua tha to
    // dropdown set kar ke price auto-fill karo
}

function setupSaleItemTableEvents() {
    const tbody = document.getElementById("saleItemsBody");
    if (!tbody || tbody.dataset.eventsReady === "true") return;
    tbody.dataset.eventsReady = "true";

    tbody.addEventListener("change", event => {
        const select = event.target.closest(".sale-item-select");
        if (!select) return;
        const row = select.closest("tr");
        const price = row?.querySelector(".sale-item-price");
        const expiry = row?.querySelector(".sale-item-expiry");
        if (price) price.value = getSaleItemPrice(select.selectedOptions[0]);
        if (expiry) expiry.value = select.selectedOptions[0]?.dataset.expiryDate || "";
        if (row) calculateSaleItemTotal(row);
    });

    tbody.addEventListener("input", event => {
        if (!event.target.matches(".sale-item-qty, .sale-item-price")) return;
        const row = event.target.closest("tr");
        if (row) calculateSaleItemTotal(row);
    });

    tbody.addEventListener("click", event => {
        const removeButton = event.target.closest(".remove-sale-item");
        if (!removeButton) return;
        removeButton.closest("tr")?.remove();
        calculateSaleTotals();
    });
}

function getSaleItemPrice(option) {
    if (!option) return "0";
    const mode = document.getElementById("salePricingMode")?.value || "retail";
    if (mode === "wholesale") {
        return option.dataset.wholesalePrice || option.dataset.price || "0";
    }
    return option.dataset.retailPrice || option.dataset.price || "0";
}

function applySalePricingMode() {
    document.querySelectorAll("#saleItemsBody .sale-item-select").forEach(select => {
        const row = select.closest("tr");
        const price = row?.querySelector(".sale-item-price");
        if (!price || !select.value) return;
        price.value = getSaleItemPrice(select.selectedOptions[0]);
        calculateSaleItemTotal(row);
    });
    calculateSaleTotals();
}

// ======================================================
// SALE ITEM SEARCH (type-ahead picker)
// ======================================================

function renderSaleItemSearch(query) {

    const box =
        document.getElementById("saleItemSearchResults");

    if (!box) return;

    const q =
        String(query || "").trim().toLowerCase();

    if (!q) {
        box.style.display = "none";
        box.innerHTML = "";
        return;
    }


    const items =
        window._saleItems || [];

    const matches = items
        .filter(i =>
            String(i.name || "").toLowerCase().includes(q) ||
            String(i.item_code || "").toLowerCase().includes(q) ||
            String(i.barcode || "").toLowerCase().includes(q) ||
            String(i.sku || "").toLowerCase().includes(q)
        )
        .slice(0, 8);


    if (!matches.length) {

        box.innerHTML = `
            <div style="
                padding:10px 12px;
                color:#64748b;
                font-size:12px;
            ">No items found</div>
        `;

    } else {

        box.innerHTML = matches.map(i => `

            <div
                class="sale-search-item"
                data-id="${Number(i.id)}"
                style="
                    padding:9px 12px;
                    cursor:pointer;
                    display:flex;
                    justify-content:space-between;
                    align-items:center;
                    gap:8px;
                "
                onmouseover="this.style.background='#f0fdf4'"
                onmouseout="this.style.background=''"
                onclick="pickSaleItem(${Number(i.id)}); closeSaleItemSearch();"
            >
                <span style="font-size:13px;">
                    ${escapeHTML(i.name)}
                </span>
                <span style="font-size:11px; color:#64748b; white-space:nowrap;">
                    ${escapeHTML(i.item_code || "")} &bull; Stock: ${Number(i.stock || 0)}
                </span>
            </div>

        `).join("");

    }


    box.style.display = "block";

}


function pickSaleItem(itemId) {

    const selectedItem = (window._saleItems || []).find(item => Number(item.id) === Number(itemId));
    if (selectedItem?.expiry_date && selectedItem.expiry_date < new Date().toISOString().slice(0, 10)) {
        alert(`${selectedItem.name} expired on ${selectedItem.expiry_date} and cannot be sold.`);
        return;
    }

    const existingRow = Array.from(
        document.querySelectorAll("#saleItemsBody tr")
    ).find(row =>
        Number(row.querySelector(".sale-item-select")?.value) === Number(itemId)
    );

    if (existingRow) {
        const quantityInput = existingRow.querySelector(".sale-item-qty");
        const currentQuantity = Number(quantityInput?.value) || 0;
        const availableStock = Number(selectedItem?.stock) || 0;

        if (currentQuantity + 1 > availableStock) {
            alert(`Not enough stock for ${selectedItem?.name || "this product"}. Available: ${availableStock}`);
            return;
        }

        if (quantityInput) quantityInput.value = String(currentQuantity + 1);
        calculateSaleItemTotal(existingRow);
        calculateSaleTotals();
        return;
    }

    // Pehle check karo koi row aisi hai jis me item abhi
    // select nahi hua — agar hai to usi me set karo,
    // warna nayi row banao.
    const rows =
        document.querySelectorAll("#saleItemsBody tr");

    let targetRow = null;

    rows.forEach(r => {

        const sel = r.querySelector(".sale-item-select");

        if (
            !targetRow &&
            sel &&
            !sel.value
        ) {
            targetRow = r;
        }

    });


    if (!targetRow) {
        addSaleItemRow(itemId);
        return;
    }


    const select =
        targetRow.querySelector(".sale-item-select");

    if (select) {
        select.value = String(itemId);
        select.dispatchEvent(new Event("change"));
    }

}


function closeSaleItemSearch() {

    const box =
        document.getElementById("saleItemSearchResults");

    if (box) {
        box.style.display = "none";
        box.innerHTML = "";
    }

    const input =
        document.getElementById("saleItemSearch");

    if (input) input.value = "";

    // Remove the global click listener to prevent stacking
    document.removeEventListener("click", closeSaleItemSearchOnClick);

}


function closeSaleItemSearchOnClick(e) {

    const box =
        document.getElementById("saleItemSearchResults");

    const input =
        document.getElementById("saleItemSearch");

    if (
        box &&
        input &&
        !box.contains(e.target) &&
        e.target !== input
    ) {
        box.style.display = "none";
    }

}

// ======================================================
// CALCULATE SALE ITEM TOTAL
// ======================================================

function calculateSaleItemTotal(row) {

    const qty =
        Number(
            row.querySelector(".sale-item-qty")?.value
        ) || 0;


    const price =
        Number(
            row.querySelector(".sale-item-price")?.value
        ) || 0;


    const total =
        qty * price;


    row.querySelector(".sale-item-total").textContent =
        formatMoney(total);

    calculateSaleTotals();

}

// ======================================================
// CALCULATE SALE TOTALS
// ======================================================

function calculateSaleTotals() {

    const rows =
        document.querySelectorAll("#saleItemsBody tr");


    let subtotal = 0;


    rows.forEach(row => {

        const total =
            parseMoneyText(
                row.querySelector(".sale-item-total")?.textContent
            );

        subtotal += total;

    });


    const discount =
        Number(
            document.getElementById("saleDiscount")?.value
        ) || 0;


    const discountType =
        document.getElementById("saleDiscountType")?.value || "flat";


    const tax =
        Number(
            document.getElementById("saleTax")?.value
        ) || 0;


    let discountAmount = discount;


    if (discountType === "percent") {

        discountAmount =
            (subtotal * discount) / 100;

    }


    const afterDiscount =
        subtotal - discountAmount;


    const taxAmount =
        (afterDiscount * tax) / 100;


    const total =
        afterDiscount + taxAmount;


    document.getElementById("saleSubtotal").textContent =
        formatMoney(subtotal);


    document.getElementById("saleTotal").textContent =
        formatMoney(total);

    // Calculate Net Return (paid - total)
    const paidAmount =
        Number(
            document.getElementById("salePaid")?.value
        ) || 0;

    const netReturn = paidAmount > total ? paidAmount - total : 0;

    const netReturnEl = document.getElementById("saleNetReturn");
    if (netReturnEl) {
        netReturnEl.textContent = formatMoney(netReturn);
    }

}

// ======================================================
// SAVE SALE
// ======================================================

// ======================================================
// OPEN INVOICE IN BROWSER (web-mode print fallback)
// Returns true if a printable invoice window opened.
// ======================================================

async function openInvoiceInBrowser(invoiceData) {

    try {

        if (!apiReady("getInvoiceHtml")) return false;

        const htmlResult =
            await window.electronAPI.getInvoiceHtml(invoiceData);

        if (!htmlResult?.success || !htmlResult.html) return false;

        const invoiceWindow = window.open("", "_blank");

        if (!invoiceWindow) {
            alert("Please allow pop-ups for this site to view the invoice.");
            return false;
        }

        // Write invoice with print preview toolbar
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
            top: 0; left: 0; right: 0;
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
        }
        #btnPrint { background: #16a34a; color: white; }
        #btnPrint:hover { background: #15803d; }
        #btnClose { background: #64748b; color: white; }
        #btnClose:hover { background: #475569; }
        #invoiceContent { margin-top: 60px; padding: 20px; }
        @media print {
            #toolbar { display: none !important; }
            #invoiceContent { margin-top: 0; padding: 0; }
        }
    </style>
</head>
<body>
    <div id="toolbar">
        <button id="btnPrint" onclick="window.print();">🖨 Print Invoice</button>
        <button id="btnClose" onclick="window.close();">✕ Close Preview</button>
    </div>
    <div id="invoiceContent">
        ${htmlResult.html}
    </div>
    <script>
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'p') { e.preventDefault(); window.print(); }
            if (e.key === 'Escape') { window.close(); }
        });
    </script>
</body>
</html>`;

        invoiceWindow.document.write(previewHTML);
        invoiceWindow.document.close();
        invoiceWindow.focus();

        return true;

    } catch (error) {
        console.error("Open invoice in browser error:", error);
        return false;
    }

}

// ======================================================
// AUTO GENERATE INVOICE (after saving a sale)
// ======================================================

async function generateAndOpenInvoice(saleId) {

    try {

        if (!saleId || !apiReady("getSale")) return;

        const saleResult =
            await window.electronAPI.getSale(saleId);

        if (!saleResult?.success) return;

        let company = {};

        if (apiReady("getCompany")) {
            const companyResult =
                await window.electronAPI.getCompany();
            company = companyResult?.success
                ? companyResult.company
                : {};
        }

        const sale = saleResult.sale;
        const items = saleResult.items || [];

        const invoiceData = {
            company: company,
            party: {
                name: sale.customer_name || sale.party_name,
                code: sale.party_code,
                address: sale.party_address,
                phone: sale.party_phone
            },
            items: items.map(item => ({
                name: item.item_name,
                code: item.item_code,
                quantity: item.quantity,
                price: item.price,
                total: item.total
            })),
            invoice: sale,
            type: "sale"
        };

        // Desktop app: native print dialog opens automatically
        if (apiReady("printInvoice")) {
            const printResult =
                await window.electronAPI.printInvoice(invoiceData);
            if (printResult?.success) return;
        }

        // Web mode (localhost): open printable invoice in a new tab
        await openInvoiceInBrowser(invoiceData);

    } catch (error) {
        console.error("Auto invoice generation error:", error);
    }

}



async function saveSale() {

    const customerType = document.getElementById("saleCustomer")?.value || "walk-in";
    const customerNameInput = document.getElementById("saleCustomerName")?.value.trim() || "";
    const isNamedCustomer = customerType === "customer" || customerType === "wholesale";
    if (isNamedCustomer && !customerNameInput) {
        alert("Customer name is required.");
        document.getElementById("saleCustomerName")?.focus();
        return;
    }

    const invoiceNo =
        document
            .getElementById("saleInvoiceNo")
            ?.value
            .trim();


    const partyId = Number(
        document.getElementById("saleCustomerName")?.dataset.partyId
    ) || 0;

    const paymentMethod =
        document
            .getElementById("salePaymentMethod")
            ?.value || "Cash";


    const discount =
        Number(
            document
                .getElementById("saleDiscount")
                ?.value
        ) || 0;


    const discountType =
        document
            .getElementById("saleDiscountType")
            ?.value || "flat";


    const tax =
        Number(
            document
                .getElementById("saleTax")
                ?.value
        ) || 0;


    const paid =
        Number(
            document
                .getElementById("salePaid")
                ?.value
        ) || 0;


    if (!invoiceNo) {

        alert("Invoice number is required.");
        return;

    }


    const rows =
        document.querySelectorAll("#saleItemsBody tr");


    const items = [];


    let subtotal = 0;


    rows.forEach(row => {

        const itemId =
            Number(
                row.querySelector(".sale-item-select")?.value
            ) || 0;


        const quantity =
            Number(
                row.querySelector(".sale-item-qty")?.value
            ) || 0;


        const price =
            Number(
                row.querySelector(".sale-item-price")?.value
            ) || 0;


        if (itemId && quantity > 0) {

            const total =
                quantity * price;


            subtotal += total;


            items.push({
                item_id: itemId,
                quantity,
                price,
                total,
                expiry_date: row.querySelector(".sale-item-expiry")?.value || ""
            });

        }

    });


    if (items.length === 0) {

        alert("Please add at least one item.");
        return;

    }


    let discountAmount = discount;


    if (discountType === "percent") {

        discountAmount =
            (subtotal * discount) / 100;

    }


    const afterDiscount =
        subtotal - discountAmount;


    const taxAmount =
        (afterDiscount * tax) / 100;


    const total =
        afterDiscount + taxAmount;


    const due =
        total - paid;

    // Note: paid can exceed total (e.g., refund/return scenarios)
    // Negative due indicates amount returnable to customer


    if (!apiReady("saveSale")) {

        alert("Save sale API is not available.");
        return;

    }


    try {

        const payload = {

            invoice_no: invoiceNo,
            party_type: document.getElementById("salePartyType")?.value || "Customer",
            party_id: customerType === "walk-in" ? 0 : partyId,
            customer_name: customerType === "walk-in"
                ? (document.getElementById("salePartyType")?.value === "Supplier" ? "Walk-In Supplier" : "Walk-In Customer")
                : customerNameInput,
            items,
            subtotal,
            discount: discountAmount,
            discount_type: discountType,
            tax: taxAmount,
            total,
            paid,
            due,
            payment_method: paymentMethod,
            pricing_mode: document.getElementById("salePricingMode")?.value || "retail"

        };


        let result =
            await window.electronAPI.saveSale(payload);


        // If the invoice number is somehow already taken
        // (e.g. stale form), auto-generate a fresh one
        // and retry once.
        if (!result?.success && /already exists/i.test(result?.error || "")) {

            if (apiReady("getNextInvoiceNo")) {

                const nextNo =
                    await window.electronAPI.getNextInvoiceNo();

                if (nextNo?.success && nextNo.invoice_no) {

                    payload.invoice_no = nextNo.invoice_no;

                    result =
                        await window.electronAPI.saveSale(payload);

                }

            }

        }


        if (result?.success) {

            // Optimistic UI: immediately show success and reset form
            if (typeof showToast === "function") {
                showToast("Sale saved successfully!", "success");
            }

            // Reset form immediately
            const saleForm = document.getElementById("saleItemsBody");
            if (saleForm) saleForm.innerHTML = "";

            await generateAndOpenInvoice(result.id);
            deferBackgroundTask(() => refreshDashboardIfVisible());

        } else {

            if (typeof showToast === "function") {
                showToast(result?.error || "Failed to save sale.", "error");
            } else {
                alert(result?.error || "Failed to save sale.");
            }

        }

    } catch (error) {

        console.error("Save sale error:", error);

        alert("Failed to save sale: " + error.message);

    }

}

// ======================================================
// EDIT SALE
// ======================================================

async function editSale(saleId) {

    if (!saleId) {

        alert("Invalid sale ID.");
        return;

    }


    if (!apiReady("getSale")) {

        alert("Sale API is not available.");
        return;

    }

    const verified = await verifySystemFunctionPassword("editing this sale");
    if (!verified) return;


    const content =
        document.querySelector(".content");


    if (!content) return;


    try {

        const result =
            await window.electronAPI.getSale(saleId);


        if (!result?.success) {

            alert(result?.error || "Sale not found.");
            return;

        }


        const sale = result.sale;
        const saleItems = result.items || [];


        const parties =
            await window.electronAPI.getParties();


        const customers =
            Array.isArray(parties)
                ? parties.filter(p =>
                    String(p.type || "").toLowerCase() === "customer"
                )
                : [];


        const items =
            await window.electronAPI.getItems();


        const itemList =
            Array.isArray(items) ? items : [];


        window._saleItems = itemList;


        content.innerHTML = `

            <div class="page-title">

                <h1>
                    Edit Sale
                </h1>

                <p>
                    Update sale invoice: ${escapeHTML(sale.invoice_no || "-")}
                </p>

            </div>


            <div class="panel">

                <div class="panel-header">

                    <h3>
                        Sale Information
                    </h3>

                </div>


                <div style="
                    display:grid;
                    grid-template-columns:1fr 1fr 1fr;
                    gap:20px;
                    padding:25px;
                ">

                    <div>

                        <label>
                            Invoice No
                        </label>

                        <input
                            id="saleInvoiceNo"
                            type="text"
                            value="${escapeHTML(sale.invoice_no || "")}"
                            style="
                                width:100%;
                                padding:12px;
                                margin-top:8px;
                            "
                        >

                    </div>


                    <div>

                        <label>
                            Customer
                        </label>

                        <select
                            id="saleCustomer"
                            style="
                                width:100%;
                                padding:12px;
                                margin-top:8px;
                            "
                        >

                            <option value="">
                                Select Customer
                            </option>

                            ${
                                customers.map(c => `

                                    <option
                                        value="${Number(c.id)}"
                                        ${Number(c.id) === Number(sale.party_id) ? "selected" : ""}
                                    >
                                        ${escapeHTML(c.name)}
                                    </option>

                                `).join("")
                            }

                        </select>

                    </div>


                    <div>

                        <label>
                            Payment Method
                        </label>

                        <select
                            id="salePaymentMethod"
                            style="
                                width:100%;
                                padding:12px;
                                margin-top:8px;
                            "
                        >

                            <option value="Cash" ${sale.payment_method === "Cash" ? "selected" : ""}>
                                Cash
                            </option>

                            <option value="Bank" ${sale.payment_method === "Bank" ? "selected" : ""}>
                                Bank
                            </option>

                            <option value="Card" ${sale.payment_method === "Card" ? "selected" : ""}>
                                Card
                            </option>

                            <option value="UPI" ${sale.payment_method === "UPI" ? "selected" : ""}>
                                UPI
                            </option>

                        </select>

                    </div>

                </div>

            </div>


            <div class="panel">

                <div class="panel-header">

                    <h3>
                        Items
                    </h3>

                    <button
                        id="addSaleItemRow"
                        class="btn btn-sale"
                    >
                        + Add Item
                    </button>

                </div>


                <table class="table" id="saleItemsTable">

                    <thead>

                        <tr>

                            <th>Item</th>
                            <th>Expiry Date</th>
                            <th>Quantity</th>
                            <th>Price</th>
                            <th>Total</th>
                            <th>Action</th>

                        </tr>

                    </thead>


                    <tbody id="saleItemsBody">

                        ${
                            saleItems.map(item => `

                                <tr>

                                    <td>

                                        <select class="sale-item-select" style="width:100%;padding:8px;">

                                            <option value="">
                                                Select Item
                                            </option>

                                            ${
                                                itemList.map(opt => `

                                                    <option
                                                        value="${Number(opt.id)}"
                                                        data-price="${Number(opt.sale_price || 0)}"
                                                        data-expiry-date="${escapeHTML(opt.expiry_date || opt.current_expiry_date || "")}" 
                                                        ${Number(opt.id) === Number(item.item_id) ? "selected" : ""}
                                                    >
                                                        ${escapeHTML(opt.name)} (Stock: ${Number(opt.stock || 0)})
                                                    </option>

                                                `).join("")
                                            }

                                        </select>

                                    </td>

                                    <td>
                                        <input
                                            type="date"
                                            class="sale-item-expiry"
                                            value="${escapeHTML(item.expiry_date || item.current_expiry_date || "")}" 
                                            style="width:145px;padding:8px;"
                                        >
                                    </td>

                                    <td>

                                        <input
                                            type="number"
                                            class="sale-item-qty"
                                            value="${Number(item.quantity || 1)}"
                                            min="1"
                                            style="width:80px;padding:8px;"
                                        >

                                    </td>

                                    <td>

                                        <input
                                            type="number"
                                            class="sale-item-price"
                                            value="${Number(item.price || 0)}"
                                            min="0"
                                            style="width:100px;padding:8px;"
                                        >

                                    </td>

                                    <td class="sale-item-total">
                                        ${formatMoney(item.total)}
                                    </td>

                                    <td>

                                        <button
                                            class="remove-sale-item"
                                            style="
                                                background:#ffe5e5;
                                                color:#d93025;
                                                border:1px solid #ffcccc;
                                                padding:7px 12px;
                                                cursor:pointer;
                                                border-radius:6px;
                                                font-weight:600;
                                            "
                                        >
                                            Remove
                                        </button>

                                    </td>

                                </tr>

                            `).join("")
                        }

                    </tbody>

                </table>


                <div style="
                    display:grid;
                    grid-template-columns:1fr 1fr 1fr;
                    gap:20px;
                    padding:25px;
                ">

                    <div>

                        <label>
                            Discount
                        </label>

                        <input
                            id="saleDiscount"
                            type="number"
                            value="${Number(sale.discount || 0)}"
                            min="0"
                            style="
                                width:100%;
                                padding:12px;
                                margin-top:8px;
                            "
                        >

                    </div>


                    <div>

                        <label>
                            Discount Type
                        </label>

                        <select
                            id="saleDiscountType"
                            style="
                                width:100%;
                                padding:12px;
                                margin-top:8px;
                            "
                        >

                            <option value="flat" ${sale.discount_type === "flat" ? "selected" : ""}>
                                Flat (Rs.)
                            </option>

                            <option value="percent" ${sale.discount_type === "percent" ? "selected" : ""}>
                                Percentage (%)
                            </option>

                        </select>

                    </div>


                    <div>

                        <label>
                            Tax
                        </label>

                        <input
                            id="saleTax"
                            type="number"
                            value="${Number(sale.tax || 0)}"
                            min="0"
                            style="
                                width:100%;
                                padding:12px;
                                margin-top:8px;
                            "
                        >

                    </div>

                </div>


                <div style="
                    display:grid;
                    grid-template-columns:1fr 1fr 1fr;
                    gap:20px;
                    padding:0 25px 25px;
                ">

                    <div>

                        <label>
                            Subtotal
                        </label>

                        <div
                            id="saleSubtotal"
                            style="
                                font-size:18px;
                                font-weight:700;
                                padding:12px;
                            "
                        >
                            ${formatMoney(sale.subtotal)}
                        </div>

                    </div>


                    <div>

                        <label>
                            Total
                        </label>

                        <div
                            id="saleTotal"
                            style="
                                font-size:18px;
                                font-weight:700;
                                padding:12px;
                            "
                        >
                            ${formatMoney(sale.total)}
                        </div>

                    </div>


                    <div>

                        <label>
                            Paid Amount
                        </label>

                        <input
                            id="salePaid"
                            type="number"
                            value="${Number(sale.paid || 0)}"
                            min="0"
                            style="
                                width:100%;
                                padding:12px;
                                margin-top:8px;
                            "
                        >

                    </div>

                </div>


                <div style="
                    padding:0 25px 25px;
                    display:flex;
                    gap:10px;
                ">

                    <button
                        id="updateSaleButton"
                        class="btn btn-sale"
                    >
                        Update Sale
                    </button>

                    <button
                        id="cancelSaleButton"
                        class="btn"
                    >
                        Cancel
                    </button>

                </div>

            </div>
        `;


        setupSaleItemTableEvents();


        document
            .getElementById("addSaleItemRow")
            ?.addEventListener(
                "click",
                () => addSaleItemRow()
            );


        document
            .getElementById("saleDiscount")
            ?.addEventListener(
                "input",
                calculateSaleTotals
            );


        document
            .getElementById("saleDiscountType")
            ?.addEventListener(
                "change",
                calculateSaleTotals
            );


        document
            .getElementById("saleTax")
            ?.addEventListener(
                "input",
                calculateSaleTotals
            );


        document
            .getElementById("salePaid")
            ?.addEventListener(
                "input",
                calculateSaleTotals
            );


        document
            .getElementById("updateSaleButton")
            ?.addEventListener(
                "click",
                async event => {
                    const button = event.currentTarget;
                    if (button.disabled) return;
                    button.disabled = true;
                    try {
                        await updateSale(saleId);
                    } finally {
                        button.disabled = false;
                    }
                }
            );


        document
            .getElementById("cancelSaleButton")
            ?.addEventListener(
                "click",
                showSales
            );


    } catch (error) {

        console.error("Edit sale error:", error);

        alert("Failed to load sale: " + error.message);

    }

}

// ======================================================
// UPDATE SALE
// ======================================================

async function updateSale(saleId) {

    const invoiceNo =
        document
            .getElementById("saleInvoiceNo")
            ?.value
            .trim();


    const partyId =
        Number(
            document
                .getElementById("saleCustomer")
                ?.value
        ) || 0;


    const paymentMethod =
        document
            .getElementById("salePaymentMethod")
            ?.value || "Cash";


    const discount =
        Number(
            document
                .getElementById("saleDiscount")
                ?.value
        ) || 0;


    const discountType =
        document
            .getElementById("saleDiscountType")
            ?.value || "flat";


    const tax =
        Number(
            document
                .getElementById("saleTax")
                ?.value
        ) || 0;


    const paid =
        Number(
            document
                .getElementById("salePaid")
                ?.value
        ) || 0;


    // Note: partyId 0 = Walk-In Customer (handled by backend via DEFAULT_CUSTOMER_ID)


    const rows =
        document.querySelectorAll("#saleItemsBody tr");


    const items = [];


    let subtotal = 0;


    rows.forEach(row => {

        const itemId =
            Number(
                row.querySelector(".sale-item-select")?.value
            ) || 0;


        const quantity =
            Number(
                row.querySelector(".sale-item-qty")?.value
            ) || 0;


        const price =
            Number(
                row.querySelector(".sale-item-price")?.value
            ) || 0;


        if (itemId && quantity > 0) {

            const total =
                quantity * price;


            subtotal += total;


            items.push({
                item_id: itemId,
                quantity,
                price,
                total,
                expiry_date: row.querySelector(".sale-item-expiry")?.value || ""
            });

        }

    });


    if (items.length === 0) {

        alert("Please add at least one item.");
        return;

    }


    let discountAmount = discount;


    if (discountType === "percent") {

        discountAmount =
            (subtotal * discount) / 100;

    }


    const afterDiscount =
        subtotal - discountAmount;


    const taxAmount =
        (afterDiscount * tax) / 100;


    const total =
        afterDiscount + taxAmount;


    const due =
        total - paid;

    // Note: paid can exceed total (e.g., refund/return scenarios)


    if (!apiReady("updateSale")) {

        alert("Update sale API is not available.");
        return;

    }


    try {

        const result =
            await window.electronAPI.updateSale({

                id: saleId,
                party_type: document.getElementById("salePartyType")?.value || "Customer",
                party_id: partyId,
                items,
                subtotal,
                discount: discountAmount,
                discount_type: discountType,
                tax: taxAmount,
                total,
                paid,
                due,
                payment_method: paymentMethod

            });


        if (result?.success) {

            alert("Sale updated successfully!");

            deferBackgroundTask(() => refreshDashboardIfVisible());

        } else {

            alert(result?.error || "Failed to update sale.");

        }

    } catch (error) {

        console.error("Update sale error:", error);

        alert("Failed to update sale: " + error.message);

    }

}

// ======================================================
// DELETE SALE
// ======================================================

async function deleteSale(saleId) {

    if (!saleId) {

        alert("Invalid sale ID.");
        return;

    }


    const confirmed =
        await showAppConfirm("Are you sure you want to delete this sale?", { title: "Delete Sale", confirmText: "Delete" });


    if (!confirmed) return;
    if (!await verifyDeleteSystemFunctionPassword("deleting this sale")) return;


    if (!apiReady("deleteSale")) {

        alert("Delete sale API is not available.");
        return;

    }


    try {

        const result =
            await window.electronAPI.deleteSale(saleId);


        if (result?.success) {

            alert("Sale deleted successfully!");

            await loadSales();

            await refreshDashboardIfVisible();

        } else {

            alert(result?.error || "Failed to delete sale.");

        }

    } catch (error) {

        console.error("Delete sale error:", error);

        alert("Failed to delete sale: " + error.message);

    }

}

// ======================================================
// CREATE SALE RETURN
// ======================================================

async function startSaleReturnFromDashboard() {

    if (!apiReady("getSales")) {

        alert("Get sales API is not available.");
        return;

    }


    let sales = [];

    try {

        const result =
            await window.electronAPI.getSales();

        sales = Array.isArray(result) ? result : [];

    } catch (error) {

        console.error("Load sales for return error:", error);
        alert("Failed to load sales: " + error.message);
        return;

    }


    if (!sales.length) {

        alert("No sales are available for return.");
        return;

    }


    // Purana modal ho to hata do
    document.getElementById("returnPickerOverlay")?.remove();


    const overlay = document.createElement("div");

    overlay.id = "returnPickerOverlay";
    overlay.className = "modal-overlay";

    overlay.innerHTML = `

        <div class="modal-box">

            <div class="modal-header">

                <h3>Sale Return</h3>

                <button type="button" class="modal-close"
                    onclick="document.getElementById('returnPickerOverlay')?.remove()">×</button>

            </div>


            <p class="modal-hint">
                Search and select an invoice — the return form
                will open.
            </p>


            <input
                id="returnSearchInput"
                type="text"
                autocomplete="off"
                placeholder="Search by invoice no, customer or date..."
                style="
                    width:100%;
                    padding:10px 12px;
                    margin-bottom:12px;
                    border:1px solid #e2e8f0;
                    border-radius:8px;
                    font-size:13px;
                "
            >


            <div
                id="returnSalesList"
                class="account-list"
                style="max-height:300px;"
            ></div>

        </div>

    `;


    overlay.addEventListener("click", (event) => {
        if (event.target === overlay) {
            document.getElementById("returnPickerOverlay")?.remove();
        }
    });


    document.body.appendChild(overlay);


    const listEl =
        document.getElementById("returnSalesList");

    const searchInput =
        document.getElementById("returnSearchInput");


    function renderReturnList(query) {

        const q =
            String(query || "").trim().toLowerCase();

        const filtered = !q
            ? sales
            : sales.filter(s =>
                String(s.invoice_no || "").toLowerCase().includes(q) ||
                String(s.customer_name || s.party_name || "").toLowerCase().includes(q) ||
                String(s.created_at || "").toLowerCase().includes(q)
            );


        if (!filtered.length) {

            listEl.innerHTML = `
                <div style="
                    padding:14px;
                    text-align:center;
                    color:#64748b;
                    font-size:13px;
                ">No matching sales found</div>
            `;
            return;

        }


        listEl.innerHTML = filtered.slice(0, 50).map(s => `

            <div
                class="account-item"
                onclick="closeSaleReturnPicker(); createSaleReturn(${Number(s.id)});"
            >

                <div class="account-info">
                    <div class="account-name">
                        ${escapeHTML(String(s.invoice_no || "-"))}
                    </div>
                    <div class="account-sub">
                        ${escapeHTML(String(s.customer_name || s.party_name || "Cash Customer"))}
                        &bull; ${formatDate(s.created_at)}
                    </div>
                </div>

                <span style="
                    font-weight:700;
                    color:#059669;
                    font-size:13px;
                ">${formatMoney(s.total)}</span>

            </div>

        `).join("");

    }


    searchInput.addEventListener(
        "input",
        debounce(e => renderReturnList(e.target.value), 300)
    );

    searchInput.addEventListener("keydown", (e) => {
        if (e.key === "Escape") closeSaleReturnPicker();
    });


    renderReturnList("");
    searchInput.focus();

}

function closeSaleReturnPicker() {
    document.getElementById("returnPickerOverlay")?.remove();
}

async function createSaleReturn(saleId) {

    if (!saleId) {

        alert("Invalid sale ID.");
        return;

    }


    if (!apiReady("getSale")) {

        alert("Sale API is not available.");
        return;

    }


    const content =
        document.querySelector(".content");


    if (!content) return;


    try {

        const result =
            await window.electronAPI.getSale(saleId);


        if (!result?.success) {

            alert(result?.error || "Sale not found.");
            return;

        }


        const sale = result.sale;
        const saleItems = result.items || [];


        const returnNo =
            `RET-${Date.now().toString().slice(-6)}`;


        content.innerHTML = `

            <div class="page-title">

                <h1>
                    Sale Return
                </h1>

                <p>
                    Return items from invoice: ${escapeHTML(sale.invoice_no || "-")}
                </p>

            </div>


            <div class="panel">

                <div class="panel-header">

                    <h3>
                        Return Information
                    </h3>

                </div>


                <div style="
                    display:grid;
                    grid-template-columns:1fr 1fr;
                    gap:20px;
                    padding:25px;
                ">

                    <div>

                        <label>
                            Return No
                        </label>

                        <input
                            id="returnNo"
                            type="text"
                            value="${escapeHTML(returnNo)}"
                            style="
                                width:100%;
                                padding:12px;
                                margin-top:8px;
                            "
                        >

                    </div>


                    <div>

                        <label>
                            Customer
                        </label>

                        <div style="
                            font-size:14px;
                            font-weight:600;
                            padding:12px;
                        ">
                            ${escapeHTML(sale.customer_name || sale.party_name || "-")}
                        </div>

                    </div>

                </div>

            </div>


            <div class="panel">

                <div class="panel-header">

                    <h3>
                        Items to Return
                    </h3>

                </div>


                <table class="table">

                    <thead>

                        <tr>

                            <th>Item</th>
                            <th>Quantity</th>
                            <th>Price</th>
                            <th>Total</th>

                        </tr>

                    </thead>


                    <tbody>

                        ${
                            saleItems.map(item => `

                                <tr>

                                    <td>
                                        ${escapeHTML(item.item_name || "-")}
                                    </td>

                                    <td>

                                        <input
                                            type="number"
                                            class="return-qty"
                                            data-price="${Number(item.price || 0)}"
                                            value="${Number(item.quantity || 0)}"
                                            min="0"
                                            max="${Number(item.quantity || 0)}"
                                            style="width:80px;padding:8px;"
                                        >

                                    </td>

                                    <td>
                                        ${formatMoney(item.price)}
                                    </td>

                                    <td class="return-item-total">
                                        ${formatMoney(item.total)}
                                    </td>

                                </tr>

                            `).join("")
                        }

                    </tbody>

                </table>


                <div style="
                    display:flex;
                    justify-content:flex-end;
                    padding:20px;
                ">

                    <div style="
                        font-size:16px;
                        font-weight:700;
                    ">
                        Return Total: <span id="returnTotal">${formatMoney(sale.total)}</span>
                    </div>

                </div>


                <div style="
                    padding:0 25px 25px;
                    display:flex;
                    gap:10px;
                ">

                    <button
                        id="saveReturnButton"
                        class="btn btn-sale"
                    >
                        Save Return
                    </button>

                    <button
                        id="cancelReturnButton"
                        class="btn"
                    >
                        Cancel
                    </button>

                </div>

            </div>
        `;


        // Attach listeners to return qty inputs

        document
            .querySelectorAll(".return-qty")
            .forEach(input => {

                input.addEventListener(
                    "input",
                    () => {

                        const qty =
                            Number(input.value) || 0;


                        const price =
                            Number(input.dataset.price) || 0;


                        const total =
                            qty * price;


                        input
                            .closest("tr")
                            .querySelector(".return-item-total")
                            .textContent =
                                formatMoney(total);


                        calculateReturnTotal();

                    }
                );

            });


        document
            .getElementById("saveReturnButton")
            ?.addEventListener(
                "click",
                async () => {

                    // Duplicate protection: double-click lock
                    const __btn =
                        document.getElementById("saveReturnButton");
                    if (__btn && __btn.disabled) return;
                    if (__btn) __btn.disabled = true;

                    const returnNoValue =
                        document
                            .getElementById("returnNo")
                            ?.value
                            .trim() || `RET-${Date.now()}`;


                    const items = [];


                    let subtotal = 0;


                    document
                        .querySelectorAll(".return-qty")
                        .forEach(input => {

                            const qty =
                                Number(input.value) || 0;


                            if (qty > 0) {

                                const price =
                                    Number(input.dataset.price) || 0;


                                const total =
                                    qty * price;


                                subtotal += total;


                                const itemId =
                                    Number(
                                        input
                                            .closest("tr")
                                            .querySelector("td")
                                            ?.textContent
                                    ) || 0;


                                // We need item_id - get from sale items
                                const saleItem =
                                    saleItems.find(si =>
                                        si.item_name ===
                                        input.closest("tr").querySelector("td").textContent.trim()
                                    );


                                items.push({
                                    item_id: saleItem?.item_id || 0,
                                    quantity: qty,
                                    price,
                                    total
                                });

                            }

                        });


                    if (items.length === 0) {

                        alert("Please select at least one item to return.");
                        return;

                    }


                    if (!apiReady("saveSaleReturn")) {

                        alert("Sale return API is not available.");
                        return;

                    }


                    try {

                        const result =
                            await window.electronAPI.saveSaleReturn({

                                sale_id: saleId,
                                party_id: sale.party_id,
                                return_no: returnNoValue,
                                items,
                                subtotal,
                                total: subtotal

                            });


                        if (result?.success) {

                            alert("Sale return saved successfully!");

                            deferBackgroundTask(() => refreshDashboardIfVisible());

                        } else {

                            alert(result?.error || "Failed to save return.");

                        }

                    } catch (error) {

                        console.error("Save sale return error:", error);

                        alert("Failed to save return: " + error.message);
                        if (__btn) __btn.disabled = false;

                    }

                }
            );


        document
            .getElementById("cancelReturnButton")
            ?.addEventListener(
                "click",
                showSales
            );


    } catch (error) {

        console.error("Create sale return error:", error);

        alert("Failed to load sale: " + error.message);

    }

}

// ======================================================
// PURCHASE RETURN
// ======================================================

async function showPurchaseReturn() {

    resetGlobalUiLocks();

    const content = document.querySelector(".content");
    if (!content) return;

    content.innerHTML = `
        <div class="page-title">
            <h1>Purchase Return</h1>
            <p>View and manage your purchase returns.</p>
        </div>

        <div class="panel">
            <div class="panel-header">
                <h3>Purchase Return List</h3>
                <button
                    id="createPurchaseReturnBtn"
                    class="btn btn-purchase"
                >
                    + New Purchase Return
                </button>
            </div>
            <table class="table">
                <thead>
                    <tr>
                        <th>Return No</th>
                        <th>Bill No</th>
                        <th>Date</th>
                        <th>Supplier</th>
                        <th>Total</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody id="purchaseReturnList">
                    <tr>
                        <td colspan="6">
                            <div class="empty-state">Loading purchase returns...</div>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    `;

    document.getElementById("createPurchaseReturnBtn")?.addEventListener("click", startPurchaseReturnFromDashboard);

    await loadPurchaseReturns();
}

async function loadPurchaseReturns() {
    const list = document.getElementById("purchaseReturnList");
    if (!list) return;

    try {
        if (!apiReady("getPurchaseReturns")) {
            list.innerHTML = `<tr><td colspan="6"><div class="empty-state">Purchase returns API is not available.</div></td></tr>`;
            return;
        }

        const result = await window.electronAPI.getPurchaseReturns();
        const returns = Array.isArray(result) ? result : (result?.returns || []);

        if (returns.length === 0) {
            list.innerHTML = `<tr><td colspan="6"><div class="empty-state">No purchase returns found.</div></td></tr>`;
            return;
        }

        list.innerHTML = returns.map(r => `
            <tr>
                <td>${escapeHTML(r.return_no || "-")}</td>
                <td>${escapeHTML(r.bill_no || r.invoice_no || "-")}</td>
                <td>${escapeHTML(formatDate(r.created_at))}</td>
                <td>${escapeHTML(r.party_name || "-")}</td>
                <td>${formatMoney(r.total)}</td>
                <td>
                    <div style="display:flex; gap:6px; align-items:center;">
                        <button class="view-purchase-return-btn" data-id="${Number(r.id)}"
                            style="background:#e8f1ff; color:#1769aa; border:1px solid #c7ddff; padding:7px 12px; cursor:pointer; border-radius:6px; font-weight:600;">
                            View
                        </button>
                        <button class="delete-purchase-return-btn" data-id="${Number(r.id)}"
                            style="background:#ffe5e5; color:#d93025; border:1px solid #ffcccc; padding:7px 12px; cursor:pointer; border-radius:6px; font-weight:600;">
                            Delete
                        </button>
                    </div>
                </td>
            </tr>
        `).join("");

        list.querySelectorAll(".view-purchase-return-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                const ret = returns.find(x => Number(x.id) === Number(btn.dataset.id));
                if (!ret) return;

                openStructuredDetailModal({
                    title: "Purchase Return Details",
                    subtitle: `Return No: ${ret.return_no || "-"}`,
                    rows: [
                        { label: "Return No", value: escapeHTML(ret.return_no || "-") },
                        { label: "Bill No", value: escapeHTML(ret.bill_no || ret.invoice_no || "-") },
                        { label: "Date", value: escapeHTML(formatDate(ret.created_at)) },
                        { label: "Supplier", value: escapeHTML(ret.party_name || "-") },
                        { label: "Total", value: formatMoney(ret.total) },
                        { label: "Payment Method", value: escapeHTML(ret.payment_method || "-") },
                        { label: "Note", value: escapeHTML(ret.note || "-") }
                    ],
                    actions: ""
                });
            });
        });

        list.querySelectorAll(".delete-purchase-return-btn").forEach(btn => {
            btn.addEventListener("click", async () => {
                if (!await showAppConfirm("Delete this purchase return? Stock will be adjusted.", { title: "Delete Purchase Return", confirmText: "Delete" })) return;
                if (!await verifyDeleteSystemFunctionPassword("deleting this purchase return")) return;
                try {
                    const result = await window.electronAPI.deletePurchaseReturn(Number(btn.dataset.id));
                    if (result?.success) {
                        showToast("Purchase return deleted.", "success");
                        await loadPurchaseReturns();
                    } else {
                        showToast(result?.error || "Failed to delete.", "error");
                    }
                } catch (error) {
                    showToast("Failed to delete: " + error.message, "error");
                }
            });
        });

    } catch (error) {
        console.error("Load purchase returns error:", error);
        list.innerHTML = `<tr><td colspan="6"><div class="empty-state">Failed to load purchase returns.</div></td></tr>`;
    }
}

async function startPurchaseReturnFromDashboard() {
    if (!apiReady("getPurchases")) {
        showToast("Get purchases API is not available.", "error");
        return;
    }

    let purchases = [];
    try {
        const result = await window.electronAPI.getPurchases();
        purchases = Array.isArray(result) ? result : [];
    } catch (error) {
        showToast("Failed to load purchases: " + error.message, "error");
        return;
    }

    if (purchases.length === 0) {
        showToast("No purchases available for return.", "warning");
        return;
    }

    const content = document.querySelector(".content");
    if (!content) return;

    content.innerHTML = `
        <div class="page-title">
            <h1>Create Purchase Return</h1>
            <p>Select a purchase to return items from.</p>
        </div>
        <div class="panel">
            <div class="panel-header"><h3>Select Purchase</h3></div>
            <table class="table">
                <thead>
                    <tr>
                        <th>Bill No</th>
                        <th>Date</th>
                        <th>Supplier</th>
                        <th>Total</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody>
                    ${purchases.map(p => `
                        <tr>
                            <td>${escapeHTML(p.bill_no || "-")}</td>
                            <td>${escapeHTML(formatDate(p.created_at))}</td>
                            <td>${escapeHTML(p.party_name || "-")}</td>
                            <td>${formatMoney(p.total)}</td>
                            <td>
                                <button class="select-purchase-return-btn" data-id="${Number(p.id)}"
                                    class="btn btn-purchase" style="padding:7px 14px; cursor:pointer; border-radius:6px; font-weight:600; background:#7c3aed; color:#fff; border:none;">
                                    Select
                                </button>
                            </td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        </div>
    `;

    content.querySelectorAll(".select-purchase-return-btn").forEach(btn => {
        btn.addEventListener("click", async () => {
            const purchaseId = Number(btn.dataset.id);
            await createPurchaseReturn(purchaseId);
        });
    });
}

async function createPurchaseReturn(purchaseId) {
    if (!purchaseId) {
        showToast("Invalid purchase ID.", "error");
        return;
    }

    try {
        if (!apiReady("getPurchase")) {
            showToast("Get purchase API is not available.", "error");
            return;
        }

        const result = await window.electronAPI.getPurchase(purchaseId);
        if (!result?.success) {
            showToast(result?.error || "Failed to load purchase.", "error");
            return;
        }

        const purchase = result.purchase;
        const purchaseItems = result.items || [];

        if (purchaseItems.length === 0) {
            showToast("No items in this purchase.", "warning");
            return;
        }

        const content = document.querySelector(".content");
        if (!content) return;
    content.innerHTML = `
            <div id="dashboardBlurableContent">
                <div class="page-title">
                    <h1>Create Purchase Return</h1>
                    <p>Return items from bill: ${escapeHTML(purchase.bill_no || "-")}</p>
                </div>
                <div class="panel">
                    <div class="panel-header"><h3>Purchase Items</h3></div>
                    <table class="table">
                        <thead>
                            <tr>
                                <th>Item</th>
                                <th>Quantity</th>
                                <th>Price</th>
                                <th>Return Qty</th>
                                <th>Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${purchaseItems.map(item => `
                                <tr>
                                    <td>${escapeHTML(item.item_name || "-")}</td>
                                    <td>${Number(item.quantity)}</td>
                                    <td>${formatMoney(item.price)}</td>
                                    <td>
                                        <input
                                            type="number"
                                            class="purchase-return-qty"
                                            value="0"
                                            min="0"
                                            step="1"
                                            max="${Number(item.quantity)}"
                                            inputmode="numeric"
                                            autocomplete="off"
                                            data-price="${Number(item.price)}"
                                            data-item-id="${Number(item.item_id)}"
                                            style="width:80px; padding:8px;"
                                        >
                                    </td>
                                    <td class="purchase-return-item-total">${formatMoney(0)}</td>
                                </tr>
                            `).join("")}
                        </tbody>
                    </table>
                </div>
                <div style="padding:25px; display:flex; gap:10px;">
                    <button id="savePurchaseReturnBtn" class="btn btn-purchase">Save Return</button>
                    <button id="cancelPurchaseReturnBtn" class="btn">Cancel</button>
                </div>
        `;

        content.querySelectorAll(".purchase-return-qty").forEach(input => {
            input.addEventListener("input", () => {
                const qty = Number(input.value) || 0;
                const price = Number(input.dataset.price) || 0;
                input.closest("tr").querySelector(".purchase-return-item-total").textContent = formatMoney(qty * price);
            });
        });

        document.getElementById("cancelPurchaseReturnBtn")?.addEventListener("click", showPurchaseReturn);

        document.getElementById("savePurchaseReturnBtn")?.addEventListener("click", async () => {
            const __btn = document.getElementById("savePurchaseReturnBtn");
            if (__btn && __btn.disabled) return;
            if (__btn) __btn.disabled = true;

            const items = [];
            let subtotal = 0;

            content.querySelectorAll(".purchase-return-qty").forEach(input => {
                const qty = Number(input.value) || 0;
                if (qty > 0) {
                    const price = Number(input.dataset.price) || 0;
                    items.push({
                        item_id: Number(input.dataset.itemId),
                        quantity: qty,
                        price,
                        total: qty * price
                    });
                    subtotal += qty * price;
                }
            });

            if (items.length === 0) {
                showToast("Please select at least one item to return.", "error");
                if (__btn) __btn.disabled = false;
                return;
            }

            if (!apiReady("savePurchaseReturn")) {
                showToast("Purchase return API is not available.", "error");
                if (__btn) __btn.disabled = false;
                return;
            }

            try {
                const returnResult = await window.electronAPI.savePurchaseReturn({
                    purchase_id: purchaseId,
                    party_id: purchase.party_id,
                    return_no: `PRET-${Date.now()}`,
                    items,
                    subtotal,
                    total: subtotal
                });

                if (returnResult?.success) {
                    showToast("Purchase return saved successfully!", "success");
                    deferBackgroundTask(() => refreshDashboardIfVisible());
                } else {
                    showToast(returnResult?.error || "Failed to save return.", "error");
                    if (__btn) __btn.disabled = false;
                }
            } catch (error) {
                console.error("Save purchase return error:", error);
                showToast("Failed to save return: " + error.message, "error");
                if (__btn) __btn.disabled = false;
            }
        });

    } catch (error) {
        console.error("Create purchase return error:", error);
        showToast("Failed to load purchase: " + error.message, "error");
    }
}


// ======================================================
// PURCHASES
// ======================================================

async function showPurchase() {

    const content =
        document.querySelector(".content");


    if (!content) return;


    content.innerHTML = `

        <div class="page-title">

            <h1>
                Purchases
            </h1>

            <p>
                Manage your purchases and bills.
            </p>

        </div>


        <div class="panel">

            <div class="panel-header">

                <h3>
                    Purchase List
                </h3>

                <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end;">
                <input
                    id="purchaseSearchBox"
                    type="text"
                    placeholder="Search by bill number, supplier..."
                    class="px-4 py-2 border border-gray-300 rounded-lg text-sm w-72 outline-none focus:ring-2 focus:ring-blue-500"
                >

                <button
                    id="addPurchaseButton"
                    class="btn btn-purchase"
                >
                    + Add Purchase
                </button>
                </div>

            </div>


            <table class="table">

                <thead>

                    <tr>

                        <th>Bill No</th>
                        <th>Date</th>
                        <th>Supplier</th>
                        <th>Total</th>
                        <th>Paid</th>
                        <th>Due</th>
                        <th>Action</th>

                    </tr>

                </thead>


                <tbody id="purchaseList">

                    <tr>

                        <td colspan="7">

                            <div class="empty-state">
                                Loading...
                            </div>

                        </td>

                    </tr>

                </tbody>

            </table>

        </div>
    `;


    document
        .getElementById("addPurchaseButton")
        ?.addEventListener(
            "click",
            createPurchase
        );



    const filterPurchaseRows = debounce(event => {
                const searchTerm = event.target.value.toLowerCase().trim();

                document
                    .querySelectorAll("#purchaseList tr[data-purchase-search]")
                    .forEach(row => {
                        row.style.display =
                            !searchTerm || row.dataset.purchaseSearch.includes(searchTerm)
                                ? ""
                                : "none";
                    });
            }, 300);

    document
        .getElementById("purchaseSearchBox")
        ?.addEventListener("input", filterPurchaseRows);


    await loadPurchases();

}

// ======================================================
// LOAD PURCHASES
// ======================================================

async function deleteAllPurchases() {
    if (!await showAppConfirm("Are you sure you want to delete all purchase records? This cannot be undone.", { title: "Delete All Purchases", confirmText: "Delete All" })) return;
    if (!await verifyDeleteSystemFunctionPassword("deleting all purchase records")) return;
    if (!apiReady("deleteAllPurchases")) return showToast("Delete All Purchases API is not available.");
    const button = document.getElementById("deleteAllPurchasesButton");
    if (button) button.disabled = true;
    try {
        const result = await window.electronAPI.deleteAllPurchases();
        if (result?.success) { showToast("All purchase records deleted.", "success"); await loadPurchases(); }
        else showToast(result?.error || "Failed to delete purchase records.");
    } catch (error) {
        console.error("Delete all purchases error:", error);
        showToast("Failed to delete purchases: " + error.message);
    } finally {
        if (button) button.disabled = false;
    }
}

async function restorePurchases() {
    if (!apiReady("restorePurchases")) return showToast("Restore Purchases API is not available.");
    const button = document.getElementById("restorePurchasesButton");
    if (button) button.disabled = true;
    try {
        const result = await window.electronAPI.restorePurchases();
        if (result?.success) { showToast(`${result.restored || 0} purchase record(s) restored.`, "success"); await loadPurchases(); }
        else showToast(result?.error || "Failed to restore purchase records.");
    } catch (error) {
        console.error("Restore purchases error:", error);
        showToast("Failed to restore purchases: " + error.message);
    } finally {
        if (button) button.disabled = false;
    }
}

async function loadPurchases() {

    const list =
        document.getElementById("purchaseList");


    if (!list) return;


    if (!apiReady("getPurchases")) {

        list.innerHTML = `

            <tr>

                <td colspan="7">

                    <div class="empty-state">
                        Purchase database connection unavailable.
                    </div>

                </td>

            </tr>

        `;

        return;

    }


    list.innerHTML = `

        <tr>

            <td colspan="7">

                <div class="empty-state">
                    Loading purchases...
                </div>

            </td>

        </tr>

    `;


    try {

        const purchases =
            await window.electronAPI.getPurchases();


        if (
            !Array.isArray(purchases) ||
            purchases.length === 0
        ) {

            list.innerHTML = `

                <tr>

                    <td colspan="7">

                        <div class="empty-state">
                            No purchases found.
                        </div>

                    </td>

                </tr>

            `;

            return;

        }


        list.innerHTML =
            purchases
                .map(purchase => `

                    <tr data-purchase-search="${escapeHTML(
                        [purchase.bill_no, purchase.party_name]
                            .filter(Boolean)
                            .join(" ")
                            .toLowerCase()
                    )}">

                        <td>
                            ${escapeHTML(
                                purchase.bill_no || "-"
                            )}
                        </td>

                        <td>
                            ${escapeHTML(
                                formatDate(purchase.created_at)
                            )}
                        </td>

                        <td>
                            ${escapeHTML(
                                purchase.party_name || "-"
                            )}
                        </td>

                        <td>
                                ${formatMoney(purchase.net_total ?? purchase.total)}
                                ${Number(purchase.returned_total || 0) > 0
                                    ? `<div style="font-size:11px;color:#b91c1c;">Returned: ${formatMoney(purchase.returned_total)}</div>`
                                    : ""}
                            </td>

                            <td>
                                ${formatMoney(purchase.net_paid ?? purchase.paid)}
                            </td>

                            <td>
                                ${formatMoney(purchase.net_due ?? purchase.due)}
                            </td>

                        <td>

                            <div style="
                                display:flex;
                                gap:6px;
                                align-items:center;
                            ">

                                <button
                                    class="view-purchase-btn"
                                    data-id="${Number(purchase.id)}"
                                    style="
                                        background:#e8f1ff;
                                        color:#1769aa;
                                        border:1px solid #c7ddff;
                                        padding:7px 12px;
                                        cursor:pointer;
                                        border-radius:6px;
                                        font-weight:600;
                                    "
                                >
                                    View
                                </button>

                                <button
                                    class="edit-purchase-btn"
                                    data-id="${Number(purchase.id)}"
                                    style="
                                        background:#fef3c7;
                                        color:#92400e;
                                        border:1px solid #fde68a;
                                        padding:7px 12px;
                                        cursor:pointer;
                                        border-radius:6px;
                                        font-weight:600;
                                    "
                                >
                                    Edit
                                </button>

                                <button
                                    class="return-purchase-btn"
                                    data-id="${Number(purchase.id)}"
                                    style="
                                        background:#ede9fe;
                                        color:#6d28d9;
                                        border:1px solid #ddd6fe;
                                        padding:7px 12px;
                                        cursor:pointer;
                                        border-radius:6px;
                                        font-weight:600;
                                    "
                                >
                                    Return
                                </button>

                                <button
                                    class="delete-purchase-btn"
                                    data-id="${Number(purchase.id)}"
                                    style="
                                        background:#ffe5e5;
                                        color:#d93025;
                                        border:1px solid #ffcccc;
                                        padding:7px 12px;
                                        cursor:pointer;
                                        border-radius:6px;
                                        font-weight:600;
                                    "
                                >
                                    Delete
                                </button>

                            </div>

                        </td>

                    </tr>

                `)
                .join("");


        // VIEW BUTTONS

        document
            .querySelectorAll(".view-purchase-btn")
            .forEach(button => {

                button.addEventListener(
                    "click",
                    async () => {

                        await viewPurchase(
                            Number(button.dataset.id)
                        );

                    }
                );

            });


        // EDIT BUTTONS

        document
            .querySelectorAll(".edit-purchase-btn")
            .forEach(button => {

                button.addEventListener(
                    "click",
                    async () => {

                        await editPurchase(
                            Number(button.dataset.id)
                        );

                    }
                );

            });


        // RETURN BUTTONS

        document
            .querySelectorAll(".return-purchase-btn")
            .forEach(button => {

                button.addEventListener(
                    "click",
                    async () => {

                        await createPurchaseReturn(
                            Number(button.dataset.id)
                        );

                    }
                );

            });


        // DELETE BUTTONS

        document
            .querySelectorAll(".delete-purchase-btn")
            .forEach(button => {

                button.addEventListener(
                    "click",
                    async () => {

                        await deletePurchase(
                            Number(button.dataset.id)
                        );

                    }
                );

            });


    } catch (error) {

        console.error("Load purchases error:", error);

        list.innerHTML = `

            <tr>

                <td colspan="7">

                    <div class="empty-state">
                        Failed to load purchases.
                    </div>

                </td>

            </tr>

        `;

    }

}

// ======================================================
// VIEW PURCHASE
// ======================================================

async function viewPurchase(purchaseId) {

    if (!purchaseId) {

        alert("Invalid purchase ID.");
        return;

    }


    if (!apiReady("getPurchase")) {

        alert("Purchase API is not available.");
        return;

    }


    try {

        const result =
            await window.electronAPI.getPurchase(purchaseId);


        if (!result?.success) {

            alert(result?.error || "Purchase not found.");
            return;

        }


        const purchase = result.purchase;
        const items = result.items || [];

        const itemRows = items.length > 0 ? items.map(item => `
            <tr>
                <td>${escapeHTML(item.item_name || "-")}</td>
                <td>${Number(item.quantity || 0).toLocaleString()}</td>
                <td>${formatMoney(item.price)}</td>
                <td>${formatMoney(item.total)}</td>
            </tr>
        `).join("") : `
            <tr><td colspan="4"><div style="padding:8px 0; color:#64748b;">No items found.</div></td></tr>
        `;

        const detail = openStructuredDetailModal({
            title: "Purchase Details",
            subtitle: `Bill: ${purchase.bill_no || "-"}`,
            rows: [
                { label: "Bill No", value: escapeHTML(purchase.bill_no || "-") },
                { label: "Date", value: escapeHTML(formatDate(purchase.created_at)) },
                { label: "Supplier", value: escapeHTML(purchase.party_name || "-") },
                { label: "Phone", value: escapeHTML(purchase.party_phone || "-") },
                { label: "Payment Method", value: escapeHTML(purchase.payment_method || "-") },
                { label: "Status", value: escapeHTML(purchase.status || "-") },
                { label: "Note", value: escapeHTML(purchase.note || "-") },
                {
                    label: "Items",
                    value: `
                        <div style="overflow:auto; border:1px solid #e2e8f0; border-radius:10px; background:#fff;">
                            <table style="width:100%; border-collapse:collapse; font-size:12px;">
                                <thead>
                                    <tr style="background:#f8fafc;">
                                        <th style="padding:8px 10px; text-align:left; border-bottom:1px solid #e2e8f0;">Item</th>
                                        <th style="padding:8px 10px; text-align:left; border-bottom:1px solid #e2e8f0;">Qty</th>
                                        <th style="padding:8px 10px; text-align:left; border-bottom:1px solid #e2e8f0;">Price</th>
                                        <th style="padding:8px 10px; text-align:left; border-bottom:1px solid #e2e8f0;">Total</th>
                                    </tr>
                                </thead>
                                <tbody>${itemRows}</tbody>
                            </table>
                        </div>
                    `
                },
                { label: "Subtotal", value: formatMoney(purchase.subtotal) },
                { label: "Discount", value: formatMoney(purchase.discount) },
                { label: "Tax", value: formatMoney(purchase.tax) },
                { label: "Total", value: formatMoney(purchase.net_total ?? purchase.total) },
                { label: "Paid", value: formatMoney(purchase.net_paid ?? purchase.paid) },
                { label: "Due", value: formatMoney(purchase.net_due ?? purchase.due) },
                ...(Number(purchase.returned_total || 0) > 0
                    ? [{ label: "Returned", value: formatMoney(purchase.returned_total) }]
                    : [])
            ],
            actions: `
                <button type="button" class="btn btn-primary" style="padding:8px 16px; border-radius:8px;" data-print-purchase="true">🖨️ Print Bill</button>
            `
        });

        detail.id = "purchaseDetailOverlay";

        const printButton = detail.querySelector("[data-print-purchase='true']");
        printButton?.addEventListener("click", async () => {
            try {
                const companyResult = await window.electronAPI.getCompany();
                const company = companyResult.success ? companyResult.company : {};

                const invoiceData = {
                    company,
                    party: {
                        name: purchase.party_name,
                        code: purchase.party_code,
                        address: purchase.party_address,
                        phone: purchase.party_phone
                    },
                    items: items.map(item => ({
                        name: item.item_name,
                        code: item.item_code,
                        quantity: item.quantity,
                        price: item.price,
                        total: item.total
                    })),
                    invoice: purchase,
                    type: 'purchase'
                };

                const printResult = await window.electronAPI.printInvoice(invoiceData);
                if (!printResult.success) {
                    const opened = await openInvoiceInBrowser(invoiceData);
                    if (!opened) {
                        alert("Failed to print bill: " + (printResult.error || "Unknown error"));
                    }
                }
            } catch (error) {
                console.error("Print bill error:", error);
                const opened = await openInvoiceInBrowser({
                    company: {},
                    party: {
                        name: purchase.party_name,
                        code: purchase.party_code,
                        address: purchase.party_address,
                        phone: purchase.party_phone
                    },
                    items: items.map(item => ({
                        name: item.item_name,
                        code: item.item_code,
                        quantity: item.quantity,
                        price: item.price,
                        total: item.total
                    })),
                    invoice: purchase,
                    type: 'purchase'
                });
                if (!opened) {
                    alert("Failed to print bill: " + error.message);
                }
            }
        });


    } catch (error) {

        console.error("View purchase error:", error);

        alert("Failed to load purchase: " + error.message);

    }

}

// ======================================================
// CREATE PURCHASE
// ======================================================

async function createPurchase() {

    const content =
        document.querySelector(".content");


    if (!content) return;


    const parties =
        await window.electronAPI.getParties();


    const suppliers =
        Array.isArray(parties)
            ? parties.filter(p =>
                String(p.type || "").toLowerCase() === "supplier"
            )
            : [];


    const items =
        await window.electronAPI.getItems();


    const itemList =
        Array.isArray(items) ? items : [];


    let billNo =
        `BILL-${Date.now().toString().slice(-6)}`;

    if (apiReady("getNextBillNo")) {
        try {
            const nextNo = await window.electronAPI.getNextBillNo();
            if (nextNo?.success && nextNo.bill_no) {
                billNo = nextNo.bill_no;
            }
        } catch (error) {
            console.error("Get next bill no error:", error);
        }
    }


    content.innerHTML = `

        <div class="page-title">

            <h1>
                Add Purchase
            </h1>

            <p>
                Create a new purchase bill.
            </p>

        </div>

        <div
            id="purchaseError"
            style="
                display:none;
                margin:0 0 16px;
                padding:12px 16px;
                background:#fef2f2;
                border:1px solid #fecaca;
                border-radius:8px;
                color:#dc2626;
                font-size:13px;
                font-weight:500;
            "
        ></div>


        <div class="panel">

            <div class="panel-header">

                <h3>
                    Purchase Information
                </h3>

            </div>


            <div style="
                display:grid;
                grid-template-columns:1fr 1fr 1fr;
                gap:20px;
                padding:25px;
            ">

                <div>

                    <label>
                        Bill No
                    </label>

                    <input
                        id="purchaseBillNo"
                        type="text"
                        value="${escapeHTML(billNo)}"
                        style="
                            width:100%;
                            padding:12px;
                            margin-top:8px;
                        "
                    >

                </div>


                <div>

                    <label>
                        Supplier
                    </label>

                    <select
                        id="purchaseSupplier"
                        style="
                            width:100%;
                            padding:12px;
                            margin-top:8px;
                        "
                    >

                        <option value="0" selected>Walk-In Supplier</option>

                        ${
                            suppliers.map(s => `

                                <option value="${Number(s.id)}">
                                    ${escapeHTML(s.name)}
                                </option>

                            `).join("")
                        }

                    </select>

                </div>


                <div>

                    <label>
                        Payment Method
                    </label>

                    <select
                        id="purchasePaymentMethod"
                        style="
                            width:100%;
                            padding:12px;
                            margin-top:8px;
                        "
                    >

                        <option value="Cash">
                            Cash
                        </option>

                        <option value="Bank">
                            Bank
                        </option>

                        <option value="Card">
                            Card
                        </option>

                        <option value="UPI">
                            UPI
                        </option>

                    </select>

                </div>

            </div>

        </div>


        <div class="panel">

            <div class="panel-header">

                <h3>
                    Items
                </h3>

                <div style="display:flex; gap:8px; align-items:center;">
                    <input
                        id="purchaseBarcodeInput"
                        type="text"
                        autocomplete="off"
                        placeholder="Scan barcode..."
                        style="padding:9px 12px; width:210px; border:1px solid #e2e8f0; border-radius:8px; font-size:13px;"
                    >
                    <button
                        id="addPurchaseItemRow"
                        class="btn btn-purchase"
                    >
                        + Add Item
                    </button>
                </div>

            </div>


            <table class="table" id="purchaseItemsTable">

                <thead>

                    <tr>

                        <th style="width:30%;">Item</th>
                        <th style="width:18%;">Expiry Date</th>
                        <th style="width:12%;">Quantity</th>
                        <th style="width:15%;">Price</th>
                        <th style="width:15%;">Total</th>
                        <th style="width:10%;">Action</th>

                    </tr>

                </thead>


                <tbody id="purchaseItemsBody">
                    <tr data-empty-row="true">
                        <td colspan="6">
                            <div class="empty-state" style="padding:12px; font-size:13px;">
                                Add items to this purchase.
                            </div>
                        </td>
                    </tr>
                </tbody>

            </table>


            <div style="
                display:grid;
                grid-template-columns:1fr 1fr 1fr;
                gap:20px;
                padding:25px;
            ">

                <div>

                    <label>
                        Discount
                    </label>

                    <input
                        id="purchaseDiscount"
                        type="number"
                        value="0"
                        min="0"
                        style="
                            width:100%;
                            padding:12px;
                            margin-top:8px;
                        "
                    >

                </div>


                <div>

                    <label>
                        Discount Type
                    </label>

                    <select
                        id="purchaseDiscountType"
                        style="
                            width:100%;
                            padding:12px;
                            margin-top:8px;
                        "
                    >

                        <option value="flat">
                            Flat (Rs.)
                        </option>

                        <option value="percent">
                            Percentage (%)
                        </option>

                    </select>

                </div>


                <div>

                    <label>
                        Tax
                    </label>

                    <input
                        id="purchaseTax"
                        type="number"
                        value="0"
                        min="0"
                        style="
                            width:100%;
                            padding:12px;
                            margin-top:8px;
                        "
                    >

                </div>

            </div>


            <div style="
                display:grid;
                grid-template-columns:1fr 1fr 1fr;
                gap:20px;
                padding:0 25px 25px;
            ">

                <div>

                    <label>
                        Subtotal
                    </label>

                    <div
                        id="purchaseSubtotal"
                        style="
                            font-size:18px;
                            font-weight:700;
                            padding:12px;
                        "
                    >
                        Rs. 0
                    </div>

                </div>


                <div>

                    <label>
                        Total
                    </label>

                    <div
                        id="purchaseTotal"
                        style="
                            font-size:18px;
                            font-weight:700;
                            padding:12px;
                        "
                    >
                        Rs. 0
                    </div>

                </div>


                <div>

                    <label>
                        Paid Amount
                    </label>

                    <input
                        id="purchasePaid"
                        type="number"
                        value="0"
                        min="0"
                        style="
                            width:100%;
                            padding:12px;
                            margin-top:8px;
                        "
                    >

                </div>

            </div>


            <div style="
                padding:0 25px 25px;
                display:flex;
                gap:10px;
            ">

                <button
                    id="savePurchaseButton"
                    class="btn btn-purchase"
                >
                    Save Purchase
                </button>

                <button
                    id="cancelPurchaseButton"
                    class="btn"
                >
                    Cancel
                </button>

            </div>

        </div>
    `;


    window._purchaseItems = itemList;

    setupPurchaseBarcodeInput();

    setupPurchaseItemTableEvents();


    document
        .getElementById("addPurchaseItemRow")
        ?.addEventListener(
            "click",
            () => addPurchaseItemRow()
        );


    document
        .getElementById("purchaseDiscount")
        ?.addEventListener(
            "input",
            calculatePurchaseTotals
        );


    document
        .getElementById("purchaseDiscountType")
        ?.addEventListener(
            "change",
            calculatePurchaseTotals
        );


    document
        .getElementById("purchaseTax")
        ?.addEventListener(
            "input",
            calculatePurchaseTotals
        );


    document
        .getElementById("purchasePaid")
        ?.addEventListener(
            "input",
            calculatePurchaseTotals
        );


    document
        .getElementById("savePurchaseButton")
        ?.addEventListener(
            "click",
            async (e) => {
                // Duplicate protection: double-click par dobara save na ho
                const btn = e.currentTarget;
                if (btn.disabled) return;
                btn.disabled = true;
                try {
                    await savePurchase();
                } finally {
                    btn.disabled = false;
                }
            }
        );


    document
        .getElementById("cancelPurchaseButton")
        ?.addEventListener(
            "click",
            showPurchase
        );

}

// ======================================================
// ADD PURCHASE ITEM ROW
// ======================================================

function addPurchaseItemRow(itemId) {

    const tbody =
        document.getElementById("purchaseItemsBody");


    if (!tbody) return;


    const items =
        window._purchaseItems || [];

    const options = items.map(item => `
        <option value="${Number(item.id)}"
            data-price="${Number(item.purchase_price || 0)}"
            ${Number(item.id) === Number(itemId) ? "selected" : ""}>
            ${escapeHTML(item.name || "Unnamed item")} (Stock: ${Number(item.stock || 0).toLocaleString()})
        </option>
    `).join("");


    const row = document.createElement("tr");


    row.innerHTML = `

        <td style="width:30%;">

            <select
                class="purchase-item-select"
                style="width:100%;padding:8px;"
            >
                <option value="">Select an item...</option>
                ${options}
            </select>

        </td>

        <td style="width:18%;">
            <input
                type="date"
                class="purchase-item-expiry"
                style="width:100%;padding:8px;"
            >
        </td>

        <td style="width:12%;">

            <input
                type="number"
                class="purchase-item-qty"
                value="1"
                min="1"
                style="width:100%;padding:8px;"
            >

        </td>

        <td style="width:15%;">

            <input
                type="number"
                class="purchase-item-price"
                value="0"
                min="0"
                style="width:100%;padding:8px;"
            >

        </td>

        <td style="width:15%;" class="purchase-item-total">
            Rs. 0
        </td>

        <td style="width:10%;">

            <button
                class="remove-purchase-item"
                style="
                    background:#ffe5e5;
                    color:#d93025;
                    border:1px solid #ffcccc;
                    padding:7px 12px;
                    cursor:pointer;
                    border-radius:6px;
                    font-weight:600;
                "
            >
                Remove
            </button>

        </td>

    `;


    // Remove empty state row if present (same pattern as Sale screen)
    tbody
        .querySelectorAll("tr[data-empty-row]")
        .forEach(emptyRow => emptyRow.remove());

    tbody.appendChild(row);


    if (itemId) {
        const selectedItem = items.find(item => Number(item.id) === Number(itemId));
        const price = row.querySelector(".purchase-item-price");
        if (selectedItem && price) price.value = String(selectedItem.purchase_price || 0);
        calculatePurchaseItemTotal(row);
    }


}

function setupPurchaseItemTableEvents() {
    const tbody = document.getElementById("purchaseItemsBody");
    if (!tbody || tbody.dataset.eventsReady === "true") return;
    tbody.dataset.eventsReady = "true";

    tbody.addEventListener("change", event => {
        const select = event.target.closest(".purchase-item-select");
        if (!select) return;
        const row = select.closest("tr");
        const option = select.selectedOptions[0];
        const price = row?.querySelector(".purchase-item-price");
        if (price) price.value = option?.dataset.price || "0";
        if (row) calculatePurchaseItemTotal(row);
    });

    tbody.addEventListener("input", event => {
        if (!event.target.matches(".purchase-item-qty, .purchase-item-price")) return;
        const row = event.target.closest("tr");
        if (row) calculatePurchaseItemTotal(row);
    });

    tbody.addEventListener("click", event => {
        const removeButton = event.target.closest(".remove-purchase-item");
        if (!removeButton) return;
        removeButton.closest("tr")?.remove();
        calculatePurchaseTotals();
    });
}

function setupPurchaseBarcodeInput() {
    const input = document.getElementById("purchaseBarcodeInput");
    if (!input) return;

    // Clone to remove any previously stacked listeners
    const clone = input.cloneNode(true);
    input.parentNode.replaceChild(clone, input);

    clone.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;

        const scannedValue = clone.value.trim().toLowerCase();
        if (!scannedValue) return;

        const item = (window._purchaseItems || []).find(product =>
            [product.barcode, product.item_code, product.sku]
                .some(value => String(value || "").trim().toLowerCase() === scannedValue)
        );

        if (!item) {
            alert("Product not found: " + clone.value.trim());
            clone.select();
            event.preventDefault();
            return;
        }

        pickPurchaseItem(Number(item.id));
        clone.value = "";
        event.preventDefault();
    });

    clone.focus();
}

function pickPurchaseItem(itemId) {
    const item = (window._purchaseItems || []).find(product =>
        Number(product.id) === Number(itemId)
    );
    if (!item) return;

    const itemName = String(item.name || "");
    const itemPrice = Number(item.purchase_price || 0);
    const itemExpiry = String(item.expiry_date || item.current_expiry_date || "");

    // Check if item already exists in the table (match by product name)
    const existingRow = Array.from(
        document.querySelectorAll("#purchaseItemsBody tr")
    ).find(row => {
        const nameInput = row.querySelector(".purchase-item-select");
        return nameInput && Number(nameInput.value) === Number(item.id);
    });

    if (existingRow) {
        const quantityInput = existingRow.querySelector(".purchase-item-qty");
        const currentQuantity = Number(quantityInput?.value) || 0;
        if (quantityInput) quantityInput.value = String(currentQuantity + 1);
        calculatePurchaseItemTotal(existingRow);
        calculatePurchaseTotals();
        return;
    }

    // Add new row with item details
    addPurchaseItemRow();

    // Find the newly added row (last row in tbody)
    const rows = document.querySelectorAll("#purchaseItemsBody tr");
    const newRow = rows[rows.length - 1];
    if (newRow) {
        const nameInput = newRow.querySelector(".purchase-item-select");
        const priceInput = newRow.querySelector(".purchase-item-price");
        const expiryInput = newRow.querySelector(".purchase-item-expiry");

        if (nameInput) nameInput.value = String(item.id);
        if (priceInput) priceInput.value = String(itemPrice);
        if (expiryInput && itemExpiry) expiryInput.value = itemExpiry;

        calculatePurchaseItemTotal(newRow);
        calculatePurchaseTotals();
    }
}

// ======================================================
// CALCULATE PURCHASE ITEM TOTAL
// ======================================================

function calculatePurchaseItemTotal(row) {

    const qty =
        Number(
            row.querySelector(".purchase-item-qty")?.value
        ) || 0;


    const price =
        Number(
            row.querySelector(".purchase-item-price")?.value
        ) || 0;


    const total =
        qty * price;


    row.querySelector(".purchase-item-total").textContent =
        formatMoney(total);

    calculatePurchaseTotals();

}

// ======================================================
// CALCULATE PURCHASE TOTALS
// ======================================================

function calculatePurchaseTotals() {

    const rows =
        document.querySelectorAll("#purchaseItemsBody tr");


    let subtotal = 0;


    rows.forEach(row => {

        const total =
            parseMoneyText(
                row.querySelector(".purchase-item-total")?.textContent
            );

        subtotal += total;

    });


    const discount =
        Number(
            document.getElementById("purchaseDiscount")?.value
        ) || 0;


    const discountType =
        document.getElementById("purchaseDiscountType")?.value || "flat";


    const tax =
        Number(
            document.getElementById("purchaseTax")?.value
        ) || 0;


    let discountAmount = discount;


    if (discountType === "percent") {

        discountAmount =
            (subtotal * discount) / 100;

    }


    const afterDiscount =
        subtotal - discountAmount;


    const taxAmount =
        (afterDiscount * tax) / 100;


    const total =
        afterDiscount + taxAmount;


    document.getElementById("purchaseSubtotal").textContent =
        formatMoney(subtotal);


    document.getElementById("purchaseTotal").textContent =
        formatMoney(total);

}

// ======================================================
// SAVE PURCHASE
// ======================================================

async function savePurchase() {

    const billNo =
        document
            .getElementById("purchaseBillNo")
            ?.value
            .trim();


    const partyId =
        Number(
            document
                .getElementById("purchaseSupplier")
                ?.value
        ) || 0;


    const paymentMethod =
        document
            .getElementById("purchasePaymentMethod")
            ?.value || "Cash";


    const discount =
        Number(
            document
                .getElementById("purchaseDiscount")
                ?.value
        ) || 0;


    const discountType =
        document
            .getElementById("purchaseDiscountType")
            ?.value || "flat";


    const tax =
        Number(
            document
                .getElementById("purchaseTax")
                ?.value
        ) || 0;


    const paid =
        Number(
            document
                .getElementById("purchasePaid")
                ?.value
        ) || 0;


    if (!billNo) {

        showToast("Bill number is required.", "error");
        return;

    }


    const rows =
        document.querySelectorAll("#purchaseItemsBody tr");


    const items = [];

    const unmatchedItems = [];

    let subtotal = 0;


    rows.forEach(row => {

        const itemSelectEl = row.querySelector(".purchase-item-select");
        const itemValue = itemSelectEl?.value?.trim() || "";

        // Item field is a text input — look up item by name
        let itemId = Number(itemValue) || 0;
        if (!itemId && itemValue) {
            const matchedItem = (window._purchaseItems || []).find(
                p => String(p.name || "").trim().toLowerCase() === itemValue.toLowerCase()
            );
            if (matchedItem) {
                itemId = Number(matchedItem.id);
            }
        }


        const quantity =
            Number(
                row.querySelector(".purchase-item-qty")?.value
            ) || 0;


        const price =
            Number(
                row.querySelector(".purchase-item-price")?.value
            ) || 0;

        const expiryDate =
            row.querySelector(".purchase-item-expiry")?.value || "";


        if (itemId && quantity > 0) {

            const total =
                quantity * price;


            subtotal += total;


            items.push({
                item_id: itemId,
                quantity,
                price,
                expiry_date: expiryDate,
                total
            });

        } else if (itemValue && quantity > 0 && !itemId) {
            unmatchedItems.push(itemValue);
        }

    });

    // Clear previous error
    const purchaseErrorEl = document.getElementById("purchaseError");
    if (purchaseErrorEl) {
        purchaseErrorEl.style.display = "none";
        purchaseErrorEl.textContent = "";
    }

    // Show error for unmatched items
    if (unmatchedItems.length > 0) {
        const msg = "Product not found: " + unmatchedItems.join(", ");
        if (purchaseErrorEl) {
            purchaseErrorEl.textContent = msg;
            purchaseErrorEl.style.display = "block";
        }
        showToast(msg, "error");
        return;
    }

    if (items.length === 0) {

        showToast("Please add at least one valid item.", "error");
        return;

    }


    let discountAmount = discount;


    if (discountType === "percent") {

        discountAmount =
            (subtotal * discount) / 100;

    }


    const afterDiscount =
        subtotal - discountAmount;


    const taxAmount =
        (afterDiscount * tax) / 100;


    const total =
        afterDiscount + taxAmount;


    const due =
        total - paid;

    // Note: paid can exceed total (e.g., refund/return scenarios)


    if (!apiReady("savePurchase")) {

        alert("Save purchase API is not available.");
        return;

    }


    try {

        const payload = {

            bill_no: billNo,
            party_id: partyId,
            items,
            subtotal,
            discount: discountAmount,
            discount_type: discountType,
            tax: taxAmount,
            total,
            paid,
            due,
            payment_method: paymentMethod

        };


        let result =
            await window.electronAPI.savePurchase(payload);


        // If the bill number is somehow already taken
        // (e.g. stale form), auto-generate a fresh one
        // and retry once.
        if (!result?.success && /already exists/i.test(result?.error || "")) {

            if (apiReady("getNextBillNo")) {

                const nextNo =
                    await window.electronAPI.getNextBillNo();

                if (nextNo?.success && nextNo.bill_no) {

                    payload.bill_no = nextNo.bill_no;

                    result =
                        await window.electronAPI.savePurchase(payload);

                }

            }

        }


        if (result?.success) {

            // Optimistic UI: immediately show success and reset form
            if (typeof showToast === "function") {
                showToast("Purchase saved successfully!", "success");
            }

            // Reset form immediately
            const purchaseForm = document.getElementById("purchaseItemsBody");
            if (purchaseForm) purchaseForm.innerHTML = "";

            deferBackgroundTask(() => refreshDashboardIfVisible());

        } else {

            if (typeof showToast === "function") {
                showToast(result?.error || "Failed to save purchase.", "error");
            } else {
                alert(result?.error || "Failed to save purchase.");
            }

        }

    } catch (error) {

        console.error("Save purchase error:", error);

        alert("Failed to save purchase: " + error.message);

    }

}

// ======================================================
// EDIT PURCHASE
// ======================================================

async function editPurchase(purchaseId) {

    if (!purchaseId) {

        alert("Invalid purchase ID.");
        return;

    }


    if (!apiReady("getPurchase")) {

        alert("Purchase API is not available.");
        return;

    }

    const verified = await verifySystemFunctionPassword("editing this purchase");
    if (!verified) return;


    const content =
        document.querySelector(".content");


    if (!content) return;


    try {

        const result =
            await window.electronAPI.getPurchase(purchaseId);


        if (!result?.success) {

            alert(result?.error || "Purchase not found.");
            return;

        }


        const purchase = result.purchase;
        const purchaseItems = result.items || [];


        const parties =
            await window.electronAPI.getParties();


        const suppliers =
            Array.isArray(parties)
                ? parties.filter(p =>
                    String(p.type || "").toLowerCase() === "supplier"
                )
                : [];


        const items =
            await window.electronAPI.getItems();


        const itemList =
            Array.isArray(items) ? items : [];


        window._purchaseItems = itemList;


        content.innerHTML = `

            <div class="page-title">

                <h1>
                    Edit Purchase
                </h1>

                <p>
                    Update purchase bill: ${escapeHTML(purchase.bill_no || "-")}
                </p>

            </div>


            <div class="panel">

                <div class="panel-header">

                    <h3>
                        Purchase Information
                    </h3>

                </div>


                <div style="
                    display:grid;
                    grid-template-columns:1fr 1fr 1fr;
                    gap:20px;
                    padding:25px;
                ">

                    <div>

                        <label>
                            Bill No
                        </label>

                        <input
                            id="purchaseBillNo"
                            type="text"
                            value="${escapeHTML(purchase.bill_no || "")}"
                            style="
                                width:100%;
                                padding:12px;
                                margin-top:8px;
                            "
                        >

                    </div>


                    <div>

                        <label>
                            Supplier
                        </label>

                        <select
                            id="purchaseSupplier"
                            style="
                                width:100%;
                                padding:12px;
                                margin-top:8px;
                            "
                        >

                            <option value="">
                                Select Supplier
                            </option>

                            ${
                                suppliers.map(s => `

                                    <option
                                        value="${Number(s.id)}"
                                        ${Number(s.id) === Number(purchase.party_id) ? "selected" : ""}
                                    >
                                        ${escapeHTML(s.name)}
                                    </option>

                                `).join("")
                            }

                        </select>

                    </div>


                    <div>

                        <label>
                            Payment Method
                        </label>

                        <select
                            id="purchasePaymentMethod"
                            style="
                                width:100%;
                                padding:12px;
                                margin-top:8px;
                            "
                        >

                            <option value="Cash" ${purchase.payment_method === "Cash" ? "selected" : ""}>
                                Cash
                            </option>

                            <option value="Bank" ${purchase.payment_method === "Bank" ? "selected" : ""}>
                                Bank
                            </option>

                            <option value="Card" ${purchase.payment_method === "Card" ? "selected" : ""}>
                                Card
                            </option>

                            <option value="UPI" ${purchase.payment_method === "UPI" ? "selected" : ""}>
                                UPI
                            </option>

                        </select>

                    </div>

                </div>

            </div>


            <div class="panel">

                <div class="panel-header">

                    <h3>
                        Items
                    </h3>

                    <div style="display:flex; gap:8px; align-items:center;">
                        <input
                            id="purchaseBarcodeInput"
                            type="text"
                            autocomplete="off"
                            placeholder="Scan barcode..."
                            style="padding:9px 12px; width:210px; border:1px solid #e2e8f0; border-radius:8px; font-size:13px;"
                        >
                        <button
                        id="addPurchaseItemRow"
                        class="btn btn-purchase"
                        >
                            + Add Item
                        </button>
                    </div>

                </div>


                <table class="table" id="purchaseItemsTable">

                    <thead>

                        <tr>

                            <th>Item</th>
                            <th>Expiry Date</th>
                            <th>Quantity</th>
                            <th>Price</th>
                            <th>Total</th>
                            <th>Action</th>

                        </tr>

                    </thead>


                    <tbody id="purchaseItemsBody">

                        ${
                            purchaseItems.map(item => `

                                <tr>

                                    <td>

                                        <select class="purchase-item-select" style="width:100%;padding:8px;">

                                            <option value="">
                                                Select Item
                                            </option>

                                            ${
                                                itemList.map(opt => `

                                                    <option
                                                        value="${Number(opt.id)}"
                                                        data-price="${Number(opt.purchase_price || 0)}"
                                                        ${Number(opt.id) === Number(item.item_id) ? "selected" : ""}
                                                    >
                                                        ${escapeHTML(opt.name)}
                                                    </option>

                                                `).join("")
                                            }

                                        </select>

                                    </td>

                                    <td>
                                        <input
                                            type="date"
                                            class="purchase-item-expiry"
                                            value="${escapeHTML(item.expiry_date || "")}" 
                                            style="width:145px;padding:8px;"
                                        >
                                    </td>

                                    <td>

                                        <input
                                            type="number"
                                            class="purchase-item-qty"
                                            value="${Number(item.quantity || 1)}"
                                            min="1"
                                            style="width:80px;padding:8px;"
                                        >

                                    </td>

                                    <td>

                                        <input
                                            type="number"
                                            class="purchase-item-price"
                                            value="${Number(item.price || 0)}"
                                            min="0"
                                            style="width:100px;padding:8px;"
                                        >

                                    </td>

                                    <td class="purchase-item-total">
                                        ${formatMoney(item.total)}
                                    </td>

                                    <td>

                                        <button
                                            class="remove-purchase-item"
                                            style="
                                                background:#ffe5e5;
                                                color:#d93025;
                                                border:1px solid #ffcccc;
                                                padding:7px 12px;
                                                cursor:pointer;
                                                border-radius:6px;
                                                font-weight:600;
                                            "
                                        >
                                            Remove
                                        </button>

                                    </td>

                                </tr>

                            `).join("")
                        }

                    </tbody>

                </table>


                <div style="
                    display:grid;
                    grid-template-columns:1fr 1fr 1fr;
                    gap:20px;
                    padding:25px;
                ">

                    <div>

                        <label>
                            Discount
                        </label>

                        <input
                            id="purchaseDiscount"
                            type="number"
                            value="${Number(purchase.discount || 0)}"
                            min="0"
                            style="
                                width:100%;
                                padding:12px;
                                margin-top:8px;
                            "
                        >

                    </div>


                    <div>

                        <label>
                            Discount Type
                        </label>

                        <select
                            id="purchaseDiscountType"
                            style="
                                width:100%;
                                padding:12px;
                                margin-top:8px;
                            "
                        >

                            <option value="flat" ${purchase.discount_type === "flat" ? "selected" : ""}>
                                Flat (Rs.)
                            </option>

                            <option value="percent" ${purchase.discount_type === "percent" ? "selected" : ""}>
                                Percentage (%)
                            </option>

                        </select>

                    </div>


                    <div>

                        <label>
                            Tax
                        </label>

                        <input
                            id="purchaseTax"
                            type="number"
                            value="${Number(purchase.tax || 0)}"
                            min="0"
                            style="
                                width:100%;
                                padding:12px;
                                margin-top:8px;
                            "
                        >

                    </div>

                </div>


                <div style="
                    display:grid;
                    grid-template-columns:1fr 1fr 1fr;
                    gap:20px;
                    padding:0 25px 25px;
                ">

                    <div>

                        <label>
                            Subtotal
                        </label>

                        <div
                            id="purchaseSubtotal"
                            style="
                                font-size:18px;
                                font-weight:700;
                                padding:12px;
                            "
                        >
                            ${formatMoney(purchase.subtotal)}
                        </div>

                    </div>


                    <div>

                        <label>
                            Total
                        </label>

                        <div
                            id="purchaseTotal"
                            style="
                                font-size:18px;
                                font-weight:700;
                                padding:12px;
                            "
                        >
                            ${formatMoney(purchase.total)}
                        </div>

                    </div>


                    <div>

                        <label>
                            Paid Amount
                        </label>

                        <input
                            id="purchasePaid"
                            type="number"
                            value="${Number(purchase.paid || 0)}"
                            min="0"
                            style="
                                width:100%;
                                padding:12px;
                                margin-top:8px;
                            "
                        >

                    </div>

                </div>


                <div style="
                    padding:0 25px 25px;
                    display:flex;
                    gap:10px;
                ">

                    <button
                        id="updatePurchaseButton"
                        class="btn btn-purchase"
                    >
                        Update Purchase
                    </button>

                    <button
                        id="cancelPurchaseButton"
                        class="btn"
                    >
                        Cancel
                    </button>

                </div>

            </div>
        `;


        setupPurchaseBarcodeInput();
        setupPurchaseItemTableEvents();


        document
            .getElementById("addPurchaseItemRow")
            ?.addEventListener(
                "click",
                addPurchaseItemRow
            );


        document
            .getElementById("purchaseDiscount")
            ?.addEventListener(
                "input",
                calculatePurchaseTotals
            );


        document
            .getElementById("purchaseDiscountType")
            ?.addEventListener(
                "change",
                calculatePurchaseTotals
            );


        document
            .getElementById("purchaseTax")
            ?.addEventListener(
                "input",
                calculatePurchaseTotals
            );


        document
            .getElementById("purchasePaid")
            ?.addEventListener(
                "input",
                calculatePurchaseTotals
            );


        document
            .getElementById("updatePurchaseButton")
            ?.addEventListener(
                "click",
                async event => {
                    const button = event.currentTarget;
                    if (button.disabled) return;
                    button.disabled = true;
                    try {
                        await updatePurchase(purchaseId);
                    } finally {
                        button.disabled = false;
                    }
                }
            );


        document
            .getElementById("cancelPurchaseButton")
            ?.addEventListener(
                "click",
                showPurchase
            );


    } catch (error) {

        console.error("Edit purchase error:", error);

        alert("Failed to load purchase: " + error.message);

    }

}

// ======================================================
// UPDATE PURCHASE
// ======================================================

async function updatePurchase(purchaseId) {

    const billNo =
        document
            .getElementById("purchaseBillNo")
            ?.value
            .trim();


    const partyId =
        Number(
            document
                .getElementById("purchaseSupplier")
                ?.value
        ) || 0;


    const paymentMethod =
        document
            .getElementById("purchasePaymentMethod")
            ?.value || "Cash";


    const discount =
        Number(
            document
                .getElementById("purchaseDiscount")
                ?.value
        ) || 0;


    const discountType =
        document
            .getElementById("purchaseDiscountType")
            ?.value || "flat";


    const tax =
        Number(
            document
                .getElementById("purchaseTax")
                ?.value
        ) || 0;


    const paid =
        Number(
            document
                .getElementById("purchasePaid")
                ?.value
        ) || 0;


    if (!partyId) {

        showToast("Please select a supplier.", "error");
        return;

    }


    const rows =
        document.querySelectorAll("#purchaseItemsBody tr");


    const items = [];

    const unmatchedItems = [];

    let subtotal = 0;


    rows.forEach(row => {

        const itemSelectEl = row.querySelector(".purchase-item-select");
        const itemValue = itemSelectEl?.value?.trim() || "";

        // Item field is a text input — look up item by name
        let itemId = Number(itemValue) || 0;
        if (!itemId && itemValue) {
            const matchedItem = (window._purchaseItems || []).find(
                p => String(p.name || "").trim().toLowerCase() === itemValue.toLowerCase()
            );
            if (matchedItem) {
                itemId = Number(matchedItem.id);
            }
        }


        const quantity =
            Number(
                row.querySelector(".purchase-item-qty")?.value
            ) || 0;


        const price =
            Number(
                row.querySelector(".purchase-item-price")?.value
            ) || 0;

        const expiryDate =
            row.querySelector(".purchase-item-expiry")?.value || "";


        if (itemId && quantity > 0) {

            const total =
                quantity * price;


            subtotal += total;


            items.push({
                item_id: itemId,
                quantity,
                price,
                expiry_date: expiryDate,
                total
            });

        } else if (itemValue && quantity > 0 && !itemId) {
            unmatchedItems.push(itemValue);
        }

    });

    // Clear previous error
    const purchaseErrorEl = document.getElementById("purchaseError");
    if (purchaseErrorEl) {
        purchaseErrorEl.style.display = "none";
        purchaseErrorEl.textContent = "";
    }

    // Show error for unmatched items
    if (unmatchedItems.length > 0) {
        const msg = "Product not found: " + unmatchedItems.join(", ");
        if (purchaseErrorEl) {
            purchaseErrorEl.textContent = msg;
            purchaseErrorEl.style.display = "block";
        }
        showToast(msg, "error");
        return;
    }

    if (items.length === 0) {

        showToast("Please add at least one valid item.", "error");
        return;

    }


    let discountAmount = discount;


    if (discountType === "percent") {

        discountAmount =
            (subtotal * discount) / 100;

    }


    const afterDiscount =
        subtotal - discountAmount;


    const taxAmount =
        (afterDiscount * tax) / 100;


    const total =
        afterDiscount + taxAmount;


    const due =
        total - paid;

    // Note: paid can exceed total (e.g., refund/return scenarios)


    if (!apiReady("updatePurchase")) {

        alert("Update purchase API is not available.");
        return;

    }


    try {

        const result =
            await window.electronAPI.updatePurchase({

                id: purchaseId,
                party_id: partyId,
                items,
                subtotal,
                discount: discountAmount,
                discount_type: discountType,
                tax: taxAmount,
                total,
                paid,
                due,
                payment_method: paymentMethod

            });


        if (result?.success) {

            alert("Purchase updated successfully!");

            deferBackgroundTask(() => refreshDashboardIfVisible());

        } else {

            alert(result?.error || "Failed to update purchase.");

        }

    } catch (error) {

        console.error("Update purchase error:", error);

        alert("Failed to update purchase: " + error.message);

    }

}

// ======================================================
// DELETE PURCHASE
// ======================================================

async function deletePurchase(purchaseId) {

    if (!purchaseId) {

        alert("Invalid purchase ID.");
        return;

    }


    const confirmed =
        await showAppConfirm("Are you sure you want to delete this purchase?", { title: "Delete Purchase", confirmText: "Delete" });


    if (!confirmed) return;
    if (!await verifyDeleteSystemFunctionPassword("deleting this purchase")) return;


    if (!apiReady("deletePurchase")) {

        alert("Delete purchase API is not available.");
        return;

    }


    try {

        const result =
            await window.electronAPI.deletePurchase(purchaseId);


        if (result?.success) {

            alert("Purchase deleted successfully!");

            await loadPurchases();

            await refreshDashboardIfVisible();

        } else {

            alert(result?.error || "Failed to delete purchase.");

        }

    } catch (error) {

        console.error("Delete purchase error:", error);

        alert("Failed to delete purchase: " + error.message);

    }

}


// ======================================================
// EXPENSES
// ======================================================

async function showExpenses() {

    const content =
        document.querySelector(".content");


    if (!content) return;


    content.innerHTML = `

        <div class="page-title">

            <h1>
                Expenses
            </h1>

            <p>
                Manage your business expenses.
            </p>

        </div>


        <div class="panel">

            <div class="panel-header">

                <h3>
                    Expense List
                </h3>

                <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end;">
                <input
                    id="expenseSearchBox"
                    type="text"
                    placeholder="Search expenses by name, category..."
                    class="px-4 py-2 border border-gray-300 rounded-lg text-sm w-72 outline-none focus:ring-2 focus:ring-blue-500"
                >

                <button
                    id="addExpenseButton"
                    class="btn btn-sale"
                >
                    + Add Expense
                </button>
                </div>

            </div>


            <table class="table">

                <thead>

                    <tr>

                        <th>Date</th>
                        <th>Category</th>
                        <th>Name</th>
                        <th>Amount</th>
                        <th>Payment Method</th>
                        <th>Action</th>

                    </tr>

                </thead>


                <tbody id="expenseList">

                    <tr>

                        <td colspan="6">

                            <div class="empty-state">
                                Loading...
                            </div>

                        </td>

                    </tr>

                </tbody>

            </table>

        </div>
    `;


    document
        .getElementById("addExpenseButton")
        ?.addEventListener(
            "click",
            addExpense
        );



    const filterExpenseRows = debounce(event => {
                const searchTerm = event.target.value.toLowerCase().trim();

                document
                    .querySelectorAll("#expenseList tr[data-expense-search]")
                    .forEach(row => {
                        row.style.display =
                            !searchTerm || row.dataset.expenseSearch.includes(searchTerm)
                                ? ""
                                : "none";
                    });
            }, 300);

    document
        .getElementById("expenseSearchBox")
        ?.addEventListener("input", filterExpenseRows);


    await loadExpenses();

}

// ======================================================
// EXPENSE DETAIL MODAL
// ======================================================

function showExpenseDetailModal(expense) {
    const detail = openStructuredDetailModal({
        title: "Expense Details",
        subtitle: expense?.name || "Expense record",
        rows: [
            { label: "Category", value: escapeHTML(expense?.category || "-") },
            { label: "Name / Description", value: escapeHTML(expense?.name || "-") },
            { label: "Amount", value: formatMoney(expense?.amount) },
            { label: "Payment Method", value: escapeHTML(expense?.payment_method || "-") },
            { label: "Note", value: escapeHTML(expense?.note || "-") },
            { label: "Date", value: escapeHTML(formatDate(expense?.created_at)) }
        ],
        actions: ""
    });

    detail.id = "expenseDetailOverlay";
}

// ======================================================
// LOAD EXPENSES
// ======================================================

async function loadExpenses() {

    const list =
        document.getElementById("expenseList");


    if (!list) return;


    if (!apiReady("getExpenses")) {

        list.innerHTML = `

            <tr>

                <td colspan="6">

                    <div class="empty-state">
                        Expense database connection unavailable.
                    </div>

                </td>

            </tr>

        `;

        return;

    }


    list.innerHTML = `

        <tr>

            <td colspan="6">

                <div class="empty-state">
                    Loading expenses...
                </div>

            </td>

        </tr>

    `;


    try {

        const expenses =
            await window.electronAPI.getExpenses();

        window._expenseList = expenses;

        if (
            !Array.isArray(expenses) ||
            expenses.length === 0
        ) {

            list.innerHTML = `

                <tr>

                    <td colspan="6">

                        <div class="empty-state">
                            No expenses found.
                        </div>

                    </td>

                </tr>

            `;

            return;

        }


        list.innerHTML =
            expenses
                .map(expense => `

                    <tr data-expense-search="${escapeHTML(
                        [expense.name, expense.category]
                            .filter(Boolean)
                            .join(" ")
                            .toLowerCase()
                    )}">

                        <td>
                            ${escapeHTML(
                                formatDate(expense.created_at)
                            )}
                        </td>

                        <td>
                            ${escapeHTML(
                                expense.category || "-"
                            )}
                        </td>

                        <td>
                            ${escapeHTML(
                                expense.name || "-"
                            )}
                        </td>

                        <td>
                            ${formatMoney(expense.amount)}
                        </td>

                        <td>
                            ${escapeHTML(
                                expense.payment_method || "-"
                            )}
                        </td>

                         <td>

                            <div style="display:flex; gap:6px; align-items:center;">
                                <button
                                    class="view-expense-btn"
                                    data-id="${Number(expense.id)}"
                                    style="
                                        background:#e8f1ff;
                                        color:#1769aa;
                                        border:1px solid #c7ddff;
                                        padding:7px 12px;
                                        cursor:pointer;
                                        border-radius:6px;
                                        font-weight:600;
                                    "
                                >
                                    View
                                </button>
                                <button
                                    class="delete-expense-btn"
                                    data-id="${Number(expense.id)}"
                                    style="
                                        background:#ffe5e5;
                                        color:#d93025;
                                        border:1px solid #ffcccc;
                                        padding:7px 12px;
                                        cursor:pointer;
                                        border-radius:6px;
                                        font-weight:600;
                                    "
                                >
                                    Delete
                                </button>
                            </div>

                        </td>

                    </tr>

                `)
                .join("");


        document
            .querySelectorAll(".delete-expense-btn")
            .forEach(button => {

                button.addEventListener(
                    "click",
                    async () => {

                        await deleteExpense(
                            Number(button.dataset.id)
                        );

                    }
                );

            });


        document
            .querySelectorAll(".view-expense-btn")
            .forEach(button => {

                button.addEventListener(
                    "click",
                    () => {

                        const expenseId = Number(button.dataset.id);
                        const expense = window._expenseList?.find(
                            e => Number(e.id) === expenseId
                        );
                        if (expense) {
                            showExpenseDetailModal(expense);
                        }

                    }
                );

            });


    } catch (error) {

        console.error("Load expenses error:", error);

        list.innerHTML = `

            <tr>

                <td colspan="6">

                    <div class="empty-state">
                        Failed to load expenses.
                    </div>

                </td>

            </tr>

        `;

    }

}

// ======================================================
// ADD EXPENSE
// ======================================================

function addExpense() {

    const content =
        document.querySelector(".content");


    if (!content) return;


    content.innerHTML = `

        <div class="page-title">

            <h1>
                Add Expense
            </h1>

            <p>
                Record a new business expense.
            </p>

        </div>


        <div class="panel">

            <div class="panel-header">

                <h3>
                    Expense Information
                </h3>

            </div>


            <div style="
                display:grid;
                grid-template-columns:1fr 1fr;
                gap:20px;
                padding:25px;
            ">

                <div>

                    <label>
                        Category
                    </label>

                    <select
                        id="expenseCategory"
                        style="
                            width:100%;
                            padding:12px;
                            margin-top:8px;
                        "
                    >

                        <option value="Rent">
                            Rent
                        </option>

                        <option value="Salary">
                            Salary
                        </option>

                        <option value="Utilities">
                            Utilities
                        </option>

                        <option value="Transport">
                            Transport
                        </option>

                        <option value="Office">
                            Office
                        </option>

                        <option value="Marketing">
                            Marketing
                        </option>

                        <option value="Other">
                            Other
                        </option>

                    </select>

                </div>


                <div>

                    <label>
                        Name / Description
                    </label>

                    <input
                        id="expenseName"
                        type="text"
                        placeholder="e.g. Office rent"
                        style="
                            width:100%;
                            padding:12px;
                            margin-top:8px;
                        "
                    >

                </div>


                <div>

                    <label>
                        Amount
                    </label>

                    <input
                        id="expenseAmount"
                        type="number"
                        value="0"
                        min="0"
                        style="
                            width:100%;
                            padding:12px;
                            margin-top:8px;
                        "
                    >

                </div>


                <div>

                    <label>
                        Payment Method
                    </label>

                    <select
                        id="expensePaymentMethod"
                        style="
                            width:100%;
                            padding:12px;
                            margin-top:8px;
                        "
                    >

                        <option value="Cash">
                            Cash
                        </option>

                        <option value="Bank">
                            Bank
                        </option>

                        <option value="Card">
                            Card
                        </option>

                        <option value="UPI">
                            UPI
                        </option>

                    </select>

                </div>


                <div style="grid-column:1/-1;">

                    <label>
                        Note
                    </label>

                    <input
                        id="expenseNote"
                        type="text"
                        placeholder="Additional notes"
                        style="
                            width:100%;
                            padding:12px;
                            margin-top:8px;
                        "
                    >

                </div>

            </div>


            <div style="
                padding:0 25px 25px;
                display:flex;
                gap:10px;
            ">

                <button
                    id="saveExpenseButton"
                    class="btn btn-sale"
                >
                    Save Expense
                </button>

                <button
                    id="cancelExpenseButton"
                    class="btn"
                >
                    Cancel
                </button>

            </div>

        </div>
    `;


    document.getElementById("saveExpenseButton")?.addEventListener("click", async event => {
        const button = event.currentTarget;
        if (button.disabled) return;
        button.disabled = true;
        try { await saveExpense(); } finally { button.disabled = false; }
    });


    document
        .getElementById("cancelExpenseButton")
        ?.addEventListener(
            "click",
            showExpenses
        );

}

// ======================================================
// SAVE EXPENSE
// ======================================================

async function saveExpense() {

    const category =
        document
            .getElementById("expenseCategory")
            ?.value || "Other";


    const name =
        document
            .getElementById("expenseName")
            ?.value
            .trim();


    const amount =
        Number(
            document
                .getElementById("expenseAmount")
                ?.value
        ) || 0;


    const paymentMethod =
        document
            .getElementById("expensePaymentMethod")
            ?.value || "Cash";


    const note =
        document
            .getElementById("expenseNote")
            ?.value
            .trim();


    if (amount <= 0) {

        alert("Amount must be greater than 0.");
        return;

    }


    if (!apiReady("saveExpense")) {

        alert("Save expense API is not available.");
        return;

    }


    try {

        const result =
            await window.electronAPI.saveExpense({

                category,
                name,
                amount,
                payment_method: paymentMethod,
                note

            });


        if (result?.success) {

            // Optimistic UI: immediately show success and reset form
            if (typeof showToast === "function") {
                showToast("Expense saved successfully!", "success");
            }

            // Reset form immediately
            ["expenseName","expenseAmount","expenseNote"].forEach(function(id) {
                var el = document.getElementById(id);
                if (el) el.value = "";
            });
            var amtEl = document.getElementById("expenseAmount");
            if (amtEl) amtEl.value = "0";

            deferBackgroundTask(() => refreshDashboardIfVisible());

        } else {

            if (typeof showToast === "function") {
                showToast(result?.error || "Failed to save expense.", "error");
            } else {
                alert(result?.error || "Failed to save expense.");
            }

        }

    } catch (error) {

        console.error("Save expense error:", error);

        alert("Failed to save expense: " + error.message);

    }

}

// ======================================================
// DELETE EXPENSE
// ======================================================

async function deleteExpense(expenseId) {

    if (!expenseId) {

        alert("Invalid expense ID.");
        return;

    }


    const confirmed =
        await showAppConfirm("Are you sure you want to delete this expense?", { title: "Delete Expense", confirmText: "Delete" });


    if (!confirmed) return;
    if (!await verifyDeleteSystemFunctionPassword("deleting this expense")) return;


    if (!apiReady("deleteExpense")) {

        alert("Delete expense API is not available.");
        return;

    }


    try {

        const result =
            await window.electronAPI.deleteExpense(expenseId);


        if (result?.success) {

            alert("Expense deleted successfully!");

            await loadExpenses();

            await refreshDashboardIfVisible();

        } else {

            alert(result?.error || "Failed to delete expense.");

        }

    } catch (error) {

        console.error("Delete expense error:", error);

        alert("Failed to delete expense: " + error.message);

    }

}

// ======================================================
// CASH & BANK
// ======================================================

function getCashBankDateRange() {
    const preset = document.getElementById("cashBankDateRange")?.value || "today";
    const today = new Date();
    const todayValue = dashboardDateValue(today);

    if (preset === "custom") {
        const from = document.getElementById("cashBankFromDate")?.value || "";
        const to = document.getElementById("cashBankToDate")?.value || "";
        if (!from || !to) return null;
        return { from_date: from, to_date: to };
    }

    if (preset === "month") {
        return {
            from_date: dashboardDateValue(new Date(today.getFullYear(), today.getMonth(), 1)),
            to_date: todayValue
        };
    }

    if (preset === "year") {
        return {
            from_date: dashboardDateValue(new Date(today.getFullYear(), 0, 1)),
            to_date: todayValue
        };
    }

    return { from_date: todayValue, to_date: todayValue };
}

async function applyCashBankDateRange() {
    const range = getCashBankDateRange();
    if (!range) {
        showToast("Please select both custom dates.", "warning");
        return;
    }
    await loadCashBank(range);
}

async function showCashBank() {

    const content =
        document.querySelector(".content");


    if (!content) return;


    content.innerHTML = `

        <div class="page-title" style="display:flex;justify-content:space-between;align-items:flex-start;gap:20px;flex-wrap:wrap;">
            <div>
                <h1>Cash & Bank</h1>
                <p>Manage your cash and bank accounts.</p>
            </div>
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end;">
                <label for="cashBankDateRange" style="font-size:12px;color:#64748b;font-weight:700;">Period</label>
                <select id="cashBankDateRange" style="height:34px;padding:0 10px;border:1px solid #cbd5e1;border-radius:7px;background:#fff;color:#334155;">
                    <option value="today">Today</option>
                    <option value="yesterday">Yesterday</option>
                    <option value="week">This Week</option>
                    <option value="month">This Month</option>
                    <option value="year">This Year</option>
                    <option value="custom">Custom Range</option>
                </select>
                <div id="cashBankCustomDates" style="display:none;align-items:center;gap:6px;flex-wrap:wrap;">
                    <input id="cashBankFromDate" type="date" aria-label="Cash and bank period start" style="height:34px;padding:0 8px;border:1px solid #cbd5e1;border-radius:7px;">
                    <span style="font-size:12px;color:#64748b;">to</span>
                    <input id="cashBankToDate" type="date" aria-label="Cash and bank period end" style="height:34px;padding:0 8px;border:1px solid #cbd5e1;border-radius:7px;">
                    <button id="cashBankApplyDates" type="button" class="btn" style="height:34px;padding:0 12px;">Apply</button>
                </div>
            </div>

        </div>


        <div class="summary-grid">

            <div class="card">

                <div class="card-label">
                    Cash in Hand
                </div>

                <div
                    class="card-value"
                    id="cashBalance"
                >
                    Rs. 0
                </div>

            </div>


            <div class="card">

                <div class="card-label">
                    Bank Balance
                </div>

                <div
                    class="card-value"
                    id="bankBalance"
                >
                    Rs. 0
                </div>

            </div>

        </div>


        <div class="panel">

            <div class="panel-header">

                <h3>
                    Bank Accounts
                </h3>

                <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end;">
                <input id="bankAccountSearchBox" type="text" placeholder="Search by Account No..." aria-label="Search bank accounts by account number" style="height:38px;padding:0 10px;border:1px solid #cbd5e1;border-radius:7px;">
                <button
                    id="addBankButton"
                    class="btn btn-sale"
                >
                    + Add Bank Account
                </button>
                </div>

            </div>


            <table class="table">

                <thead>

                    <tr>

                        <th>Bank Name</th>
                        <th>Account No</th>
                        <th>Branch</th>
                        <th>Balance</th>
                        <th>Action</th>

                    </tr>

                </thead>


                <tbody id="bankAccountList">

                    <tr>

                        <td colspan="5">

                            <div class="empty-state">
                                Loading...
                            </div>

                        </td>

                    </tr>

                </tbody>

            </table>

        </div>


        <div class="panel">

            <div class="panel-header">

                <h3>
                    Cash &harr; Bank Transfer
                </h3>

            </div>


            <div style="
                display:flex;
                gap:10px;
                flex-wrap:wrap;
                align-items:end;
                padding:20px 25px;
            ">

                <div>
                    <label>From</label>

                    <select
                        id="transferFromType"
                        style="padding:9px; margin-top:5px;"
                    >
                        <option value="Cash">Cash</option>
                        <option value="Bank">Bank</option>
                    </select>
                </div>


                <div id="transferFromBankWrap" style="display:none;">
                    <label>Bank (From)</label>

                    <select
                        id="transferFromBank"
                        style="padding:9px; margin-top:5px;"
                    >
                        <option value="">Loading...</option>
                    </select>
                </div>


                <div>
                    <label>To</label>

                    <select
                        id="transferToType"
                        style="padding:9px; margin-top:5px;"
                    >
                        <option value="Bank">Bank</option>
                        <option value="Cash">Cash</option>
                    </select>
                </div>


                <div id="transferToBankWrap">
                    <label>Bank (To)</label>

                    <select
                        id="transferToBank"
                        style="padding:9px; margin-top:5px;"
                    >
                        <option value="">Loading...</option>
                    </select>
                </div>


                <div>
                    <label>Amount (Rs.)</label>

                    <input
                        id="transferAmount"
                        type="number"
                        min="1"
                        step="0.01"
                        placeholder="0"
                        style="padding:9px; margin-top:5px; width:130px;"
                    >
                </div>


                <div>
                    <label>Note</label>

                    <input
                        id="transferNote"
                        type="text"
                        placeholder="e.g. Deposit slip #123"
                        style="padding:9px; margin-top:5px; width:190px;"
                    >
                </div>


                <button
                    id="doTransferButton"
                    class="btn btn-sale"
                >
                    &harr; Transfer
                </button>

            </div>

            <div
                id="transferMsg"
                style="
                    padding:0 25px 15px;
                    font-size:12px;
                    color:#64748b;
                "
            ></div>

        </div>


        <div class="panel">

            <div class="panel-header">

                <h3>
                    Recent Transfers
                </h3>

                <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end;">
                    <input id="transferDateSearch" type="date" aria-label="Search transfers by date" title="Search transfers by date" style="height:38px;padding:0 10px;border:1px solid #cbd5e1;border-radius:7px;">
                </div>

            </div>


            <table class="table">

                <thead>

                    <tr>

                        <th>Date</th>
                        <th>Type</th>
                        <th>Amount</th>
                        <th>Note</th>

                    </tr>

                </thead>


                <tbody id="transferList">

                    <tr>

                        <td colspan="4">

                            <div class="empty-state">
                                Loading...
                            </div>

                        </td>

                    </tr>

                </tbody>

            </table>

        </div>


        <div class="panel">

            <div class="panel-header">

                <h3>
                    Cashbook
                </h3>

                <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;justify-content:flex-end;">
                    <input id="cashbookDateSearch" type="date" aria-label="Search cashbook by date" title="Search cashbook by date" style="height:38px;padding:0 10px;border:1px solid #cbd5e1;border-radius:7px;">
                </div>

            </div>


            <table class="table">

                <thead>

                    <tr>

                        <th>Date</th>
                        <th>Type</th>
                        <th>Reference</th>
                        <th>Inflow</th>
                        <th>Outflow</th>
                        <th>Running Balance</th>

                    </tr>

                </thead>


                <tbody id="cashbookList">

                    <tr>

                        <td colspan="6">

                            <div class="empty-state">
                                Loading...
                            </div>

                        </td>

                    </tr>

                </tbody>

            </table>

        </div>
    `;


    document
        .getElementById("addBankButton")
        ?.addEventListener(
            "click",
            addBankAccount
        );

    document.getElementById("bankAccountSearchBox")?.addEventListener("input", debounce(filterBankAccounts, 300));
    document.getElementById("cashBankDateRange")?.addEventListener("change", async () => {
        const custom = document.getElementById("cashBankCustomDates");
        const isCustom = document.getElementById("cashBankDateRange")?.value === "custom";
        if (custom) custom.style.display = isCustom ? "flex" : "none";
        if (!isCustom) await applyCashBankDateRange();
    });
    document.getElementById("cashBankFromDate")?.addEventListener("change", () => {
        if (document.getElementById("cashBankToDate")?.value) applyCashBankDateRange();
    });
    document.getElementById("cashBankToDate")?.addEventListener("change", () => {
        if (document.getElementById("cashBankFromDate")?.value) applyCashBankDateRange();
    });
    document.getElementById("cashBankApplyDates")?.addEventListener("click", applyCashBankDateRange);
    document.getElementById("transferDateSearch")?.addEventListener("change", filterTransfersByDate);
    document.getElementById("cashbookDateSearch")?.addEventListener("change", filterCashbookByDate);

    document
        .getElementById("doTransferButton")
        ?.addEventListener(
            "click",
            submitTransfer
        );

    document
        .getElementById("transferFromType")
        ?.addEventListener(
            "change",
            updateTransferBankDropdowns
        );

    document
        .getElementById("transferToType")
        ?.addEventListener(
            "change",
            updateTransferBankDropdowns
        );

    await loadCashBank(getCashBankDateRange());

    // Default Cash -> Bank state ke sath dropdowns ready karo
    await loadTransfersList();
    updateTransferBankDropdowns();

}

// ======================================================
// CASH/BANK TRANSFER UI (fully functional)
// ======================================================

let transferBanksCache = [];

function updateTransferBankDropdowns() {

    const fromType =
        document.getElementById("transferFromType")?.value;

    const toType =
        document.getElementById("transferToType")?.value;

    const fromWrap =
        document.getElementById("transferFromBankWrap");

    const toWrap =
        document.getElementById("transferToBankWrap");

    if (fromWrap) {
        fromWrap.style.display =
            fromType === "Bank" ? "" : "none";
    }

    if (toWrap) {
        toWrap.style.display =
            toType === "Bank" ? "" : "none";
    }

    // Bank options fill karo
    if (fromType === "Bank") {
        fillBankSelect("transferFromBank");
    }

    if (toType === "Bank") {
        fillBankSelect("transferToBank");
    }

}

function fillBankSelect(selectId) {

    const select =
        document.getElementById(selectId);

    if (!select) return;

    if (!transferBanksCache.length) {

        select.innerHTML =
            `<option value="">No bank accounts - add one first</option>`;

        return;

    }

    select.innerHTML = transferBanksCache
        .map(b =>
            `<option value="${b.id}">` +
            `${escapeHTML(b.bank_name || b.name || "Bank")} ` +
            `(Rs. ${Number(b.current_balance || 0).toLocaleString()})` +
            `</option>`
        )
        .join("");

}

async function submitTransfer() {

    if (!apiReady("saveTransfer")) {
        alert("Transfer API is not available.");
        return;
    }

    const fromType =
        document.getElementById("transferFromType")?.value || "";

    const toType =
        document.getElementById("transferToType")?.value || "";

    const fromBankId =
        Number(
            document.getElementById("transferFromBank")?.value || 0
        );

    const toBankId =
        Number(
            document.getElementById("transferToBank")?.value || 0
        );

    const amountRaw =
        document.getElementById("transferAmount")?.value || "";

    const amount = Number(amountRaw);

    const note =
        document.getElementById("transferNote")?.value.trim() || "";

    const msgEl =
        document.getElementById("transferMsg");

    // Validation
    if (!amountRaw || isNaN(amount) || amount <= 0) {
        if (msgEl) {
            msgEl.textContent = "Please enter a valid amount.";
            msgEl.style.color = "#c0392b";
        }
        return;
    }

    if (fromType === toType && fromType !== "Bank") {
        if (msgEl) {
            msgEl.textContent =
                "Cannot transfer from Cash to Cash.";
            msgEl.style.color = "#c0392b";
        }
        return;
    }

    if (fromType === "Bank" && toType === "Bank" && fromBankId === toBankId) {
        if (msgEl) {
            msgEl.textContent =
                "Cannot transfer within the same bank account.";
            msgEl.style.color = "#c0392b";
        }
        return;
    }

    try {

        const result =
            await window.electronAPI.saveTransfer({
                from_type: fromType,
                to_type: toType,
                from_bank_id: fromBankId,
                to_bank_id: toBankId,
                amount,
                note
            });

        if (!result?.success) {
            if (msgEl) {
                msgEl.textContent =
                    result?.error || "Transfer failed.";
                msgEl.style.color = "#c0392b";
            }
            return;
        }

        if (msgEl) {
            msgEl.textContent =
                `Transfer done: ${fromType} -> ${toType} Rs. ${amount.toLocaleString()}`;
            msgEl.style.color = "#0f766e";
        }

        // Form clear + balances refresh
        const amountInput =
            document.getElementById("transferAmount");

        const noteInput =
            document.getElementById("transferNote");

        if (amountInput) amountInput.value = "";
        if (noteInput) noteInput.value = "";

        await loadCashBank();

    } catch (error) {
        console.error("Transfer error:", error);
        if (msgEl) {
            msgEl.textContent =
                "Transfer failed: " + error.message;
            msgEl.style.color = "#c0392b";
        }
    }

}

async function loadTransfersList() {

    if (!apiReady("getTransfers")) return;

    const tbody =
        document.getElementById("transferList");

    if (!tbody) return;

    try {

        const result =
            await window.electronAPI.getTransfers({ limit: 20 });

        const transfers = result?.transfers || [];

        if (!transfers.length) {

            tbody.innerHTML = `
                <tr>
                    <td colspan="4">
                        <div class="empty-state">
                            No transfers yet. Use the form above.
                        </div>
                    </td>
                </tr>
            `;

            return;

        }

        tbody.innerHTML = transfers.map(t => {

            let dirLabel = "";

            const noteStr = String(t.note || "");

            if (t.type === "transfer_in") {
                dirLabel = "Bank -> Cash";
            } else if (
                t.payment_method === "Bank" &&
                noteStr.includes("Bank to Bank")
            ) {
                dirLabel = "Bank -> Bank";
            } else if (t.payment_method === "Bank") {
                dirLabel = "Bank -> Cash";
            } else {
                dirLabel = "Cash -> Bank";
            }

            const when =
                String(t.transfer_date || t.created_at || "")
                    .slice(0, 10);

            return `
                <tr>
                    <td>${escapeHTML(when)}</td>
                    <td>${escapeHTML(dirLabel)}</td>
                    <td><b>${formatMoney(t.amount)}</b></td>
                    <td>${escapeHTML(noteStr || "-")}</td>
                </tr>
            `;

        }).join("");

    } catch (error) {
        console.error("Load transfers error:", error);
    }

}

async function filterTransfersByDate(event) {
    const date = event.target.value;
    if (!date) return loadTransfersList();
    const tbody = document.getElementById("transferList");
    if (tbody) tbody.innerHTML = '<tr><td colspan="4"><div class="empty-state">Loading...</div></td></tr>';
    try {
        const result = await window.electronAPI.getTransfers({ date, limit: 200 });
        if (!result?.success) throw new Error(result?.error || "Unable to load transfers.");
        renderTransfersList(result.transfers || []);
    } catch (error) {
        console.error("Filter transfers error:", error);
        showToast("Failed to filter transfers: " + error.message);
    }
}

function renderTransfersList(transfers) {
    const tbody = document.getElementById("transferList");
    if (!tbody) return;
    if (!transfers.length) {
        tbody.innerHTML = '<tr><td colspan="4"><div class="empty-state">No transfers found.</div></td></tr>';
        return;
    }
    tbody.innerHTML = transfers.map(t => {
        const note = String(t.note || "");
        const direction = t.type === "transfer_in" ? "Bank -> Cash" : t.payment_method === "Bank" && note.includes("Bank to Bank") ? "Bank -> Bank" : t.payment_method === "Bank" ? "Bank -> Cash" : "Cash -> Bank";
        return `<tr><td>${escapeHTML(String(t.transfer_date || t.created_at || "").slice(0, 10))}</td><td>${escapeHTML(direction)}</td><td><b>${formatMoney(t.amount)}</b></td><td>${escapeHTML(note || "-")}</td></tr>`;
    }).join("");
}

function filterBankAccounts(event) {
    const search = event.target.value.toLowerCase().trim();
    document.querySelectorAll("#bankAccountList tr[data-bank-search]").forEach(row => {
        row.style.display = !search || row.dataset.bankSearch.includes(search) ? "" : "none";
    });
}

function renderCashbookEntries(entries) {
    const list = document.getElementById("cashbookList");
    if (!list) return;
    if (!entries.length) {
        list.innerHTML = '<tr><td colspan="6"><div class="empty-state">No cash transactions found.</div></td></tr>';
        return;
    }
    let runningBalance = 0;
    const withBalances = [...entries].reverse().map(entry => {
        runningBalance += Number(entry.inflow || 0) - Number(entry.outflow || 0);
        return { ...entry, runningBalance };
    }).reverse();
    list.innerHTML = withBalances.map(entry => `
        <tr>
            <td>${escapeHTML(formatDate(entry.date))}</td>
            <td>${escapeHTML(entry.type || "-")}</td>
            <td>${escapeHTML(entry.reference || "-")}</td>
            <td>${Number(entry.inflow || 0) > 0 ? formatMoney(entry.inflow) : "-"}</td>
            <td>${Number(entry.outflow || 0) > 0 ? formatMoney(entry.outflow) : "-"}</td>
            <td>${formatMoney(entry.runningBalance)}</td>
        </tr>
    `).join("");
}

async function filterCashbookByDate(event) {
    const date = event.target.value;
    try {
        const result = await window.electronAPI.getCashbook(date ? { date } : {});
        if (result?.success) renderCashbookEntries(result.entries || []);
        else showToast(result?.error || "Failed to filter cashbook.");
    } catch (error) {
        console.error("Filter cashbook error:", error);
        showToast("Failed to filter cashbook: " + error.message);
    }
}

async function deleteAllCashbook() {
    if (!await showAppConfirm("Are you sure you want to clear the cashbook history?", { title: "Clear Cashbook History", confirmText: "Clear" })) return;
    if (!await verifyDeleteSystemFunctionPassword("clearing the cashbook history")) return;
    if (!apiReady("deleteAllCashbook")) return showToast("Delete All Cashbook API is not available.");
    try {
        const result = await window.electronAPI.deleteAllCashbook();
        if (result?.success) { showToast("Cashbook history cleared.", "success"); await showCashBank(); }
        else showToast(result?.error || "Failed to clear cashbook history.");
    } catch (error) { showToast("Failed to clear cashbook: " + error.message); }
}

async function restoreCashbook() {
    if (!apiReady("restoreCashbook")) return showToast("Restore Cashbook API is not available.");
    try {
        const result = await window.electronAPI.restoreCashbook();
        if (result?.success) { showToast(`${result.restored || 0} cashbook record(s) restored.`, "success"); await showCashBank(); }
        else showToast(result?.error || "Failed to restore cashbook.");
    } catch (error) { showToast("Failed to restore cashbook: " + error.message); }
}

async function deleteAllBankAccounts() {
    if (!await showAppConfirm("Are you sure you want to delete all bank accounts? This cannot be undone.", { title: "Delete All Bank Accounts", confirmText: "Delete All" })) return;
    if (!await verifyDeleteSystemFunctionPassword("deleting all bank accounts")) return;
    if (!apiReady("deleteAllBankAccounts")) return showToast("Delete All Bank Accounts API is not available.");
    try {
        const result = await window.electronAPI.deleteAllBankAccounts();
        if (result?.success) { showToast("All bank accounts deleted.", "success"); await showCashBank(); }
        else showToast(result?.error || "Failed to delete bank accounts.");
    } catch (error) { showToast("Failed to delete bank accounts: " + error.message); }
}

async function restoreBankAccounts() {
    if (!apiReady("restoreBankAccounts")) return showToast("Restore Bank Accounts API is not available.");
    try {
        const result = await window.electronAPI.restoreBankAccounts();
        if (result?.success) { showToast(`${result.restored || 0} bank account(s) restored.`, "success"); await showCashBank(); }
        else showToast(result?.error || "Failed to restore bank accounts.");
    } catch (error) { showToast("Failed to restore bank accounts: " + error.message); }
}

async function deleteAllTransfers() {
    if (!await showAppConfirm("Are you sure you want to delete all transfers? This cannot be undone.", { title: "Delete All Transfers", confirmText: "Delete All" })) return;
    if (!await verifyDeleteSystemFunctionPassword("deleting all transfers")) return;
    if (!apiReady("deleteAllTransfers")) return showToast("Delete All Transfers API is not available.");
    try {
        const result = await window.electronAPI.deleteAllTransfers();
        if (result?.success) { showToast("All transfers deleted.", "success"); await showCashBank(); }
        else showToast(result?.error || "Failed to delete transfers.");
    } catch (error) { showToast("Failed to delete transfers: " + error.message); }
}

async function restoreTransfers() {
    if (!apiReady("restoreTransfers")) return showToast("Restore Transfers API is not available.");
    try {
        const result = await window.electronAPI.restoreTransfers();
        if (result?.success) { showToast(`${result.restored || 0} transfer(s) restored.`, "success"); await showCashBank(); }
        else showToast(result?.error || "Failed to restore transfers.");
    } catch (error) { showToast("Failed to restore transfers: " + error.message); }
}

// ======================================================
// LOAD CASH & BANK
// ======================================================

let cashBankRequestId = 0;

async function loadCashBank(range = getCashBankDateRange()) {
    const requestId = ++cashBankRequestId;

    if (!apiReady("getBankAccounts") || !apiReady("getCashbook")) {

        console.error("Cash/Bank API is not available.");
        return;

    }


    try {

        const bankAccounts =
            await window.electronAPI.getBankAccounts();


        const cashbookResult =
            await window.electronAPI.getCashbook(range || {});

        if (requestId !== cashBankRequestId) return;

        // Transfer form ke liye banks cache update karo
        transferBanksCache = Array.isArray(bankAccounts)
            ? bankAccounts
            : [];

        const cashBalance =
            document.getElementById("cashBalance");


        if (cashBalance) {

            cashBalance.textContent =
                formatMoney(Math.max(0, Number(cashbookResult?.cashBalance ?? cashbookResult?.balance ?? cashbookResult?.cashSalesTotal ?? 0)));

        }


        const bankBalance =
            document.getElementById("bankBalance");


        if (bankBalance) {

            bankBalance.textContent =
                formatMoney(Math.max(0, Number(cashbookResult?.bankBalance ?? cashbookResult?.bank_balance ?? 0)));

        }

        // The KPI repaint is independent of the secondary transfer table.
        await loadTransfersList();


        const bankList =
            document.getElementById("bankAccountList");


        if (bankList) {

            if (
                !Array.isArray(bankAccounts) ||
                bankAccounts.length === 0
            ) {

                bankList.innerHTML = `

                    <tr>

                        <td colspan="5">

                            <div class="empty-state">
                                No bank accounts added.
                            </div>

                        </td>

                    </tr>

                `;

            } else {

                bankList.innerHTML =
                    bankAccounts
                        .map(bank => `

                            <tr>

                                <td>
                                    ${escapeHTML(bank.bank_name || "-")}
                                </td>

                                <td>
                                    ${escapeHTML(bank.account_number || "-")}
                                </td>

                                <td>
                                    ${escapeHTML((bank.branch_name || "") + (bank.branch_name && bank.branch_code ? " — " : "") + (bank.branch_code || "") || "-")}
                                </td>

                                <td>
                                    ${formatMoney(bank.current_balance)}
                                </td>

                                <td>

                                    <button
                                        class="delete-bank-btn"
                                        data-id="${Number(bank.id)}"
                                        style="
                                            background:#ffe5e5;
                                            color:#d93025;
                                            border:1px solid #ffcccc;
                                            padding:7px 12px;
                                            cursor:pointer;
                                            border-radius:6px;
                                            font-weight:600;
                                        "
                                    >
                                        Delete
                                    </button>

                                </td>

                            </tr>

                        `)
                        .join("");


                document
                    .querySelectorAll(".delete-bank-btn")
                    .forEach(button => {

                        button.addEventListener(
                            "click",
                            async () => {

                                await deleteBankAccount(
                                    Number(button.dataset.id)
                                );

                            }
                        );

                    });

            }

        }


        const cashbookList =
            document.getElementById("cashbookList");


        if (cashbookList) renderCashbookEntries(cashbookResult?.entries || []);


    } catch (error) {

        console.error("Load cash bank error:", error);

    }

}

// ======================================================
// ADD BANK ACCOUNT
// ======================================================

function addBankAccount() {

    const content =
        document.querySelector(".content");


    if (!content) return;


    content.innerHTML = `

        <div class="page-title">

            <h1>
                Add Bank Account
            </h1>

            <p>
                Add a new bank account.
            </p>

        </div>


        <div class="panel">

            <div class="panel-header">

                <h3>
                    Bank Account Information
                </h3>

            </div>


            <div style="
                display:grid;
                grid-template-columns:1fr 1fr;
                gap:20px;
                padding:25px;
            ">

                <div>

                    <label>
                        Bank Name
                    </label>

                    <input
                        id="bankName"
                        type="text"
                        placeholder="e.g. HBL"
                        style="
                            width:100%;
                            padding:12px;
                            margin-top:8px;
                        "
                    >

                </div>


                <div>

                    <label>
                        Account Number / IBAN
                    </label>

                    <input
                        id="bankAccountNumber"
                        type="text"
                        placeholder="Account number or IBAN"
                        style="
                            width:100%;
                            padding:12px;
                            margin-top:8px;
                        "
                    >

                </div>


                <div>

                    <label>
                        Account Title
                    </label>

                    <input
                        id="bankAccountTitle"
                        type="text"
                        placeholder="e.g. Sales Account"
                        style="
                            width:100%;
                            padding:12px;
                            margin-top:8px;
                        "
                    >

                </div>


                <div>

                    <label>
                        Branch Name
                    </label>

                    <input
                        id="bankBranchName"
                        type="text"
                        placeholder="e.g. DHA Lahore"
                        style="
                            width:100%;
                            padding:12px;
                            margin-top:8px;
                        "
                    >

                </div>


                <div>

                    <label>
                        Branch Code (optional)
                    </label>

                    <input
                        id="bankBranchCode"
                        type="text"
                        placeholder="Branch code"
                        style="
                            width:100%;
                            padding:12px;
                            margin-top:8px;
                        "
                    >

                </div>


                <div>

                    <label>
                        Opening Balance
                    </label>

                    <input
                        id="bankOpeningBalance"
                        type="number"
                        value="0"
                        min="0"
                        style="
                            width:100%;
                            padding:12px;
                            margin-top:8px;
                        "
                    >

                </div>

            </div>


            <div style="
                padding:0 25px 25px;
                display:flex;
                gap:10px;
            ">

                <button
                    id="saveBankButton"
                    class="btn btn-sale"
                >
                    Save Bank Account
                </button>

                <button
                    id="cancelBankButton"
                    class="btn"
                >
                    Cancel
                </button>

            </div>

        </div>
    `;


    document
        .getElementById("saveBankButton")
        ?.addEventListener(
            "click",
            saveBankAccount
        );


    document
        .getElementById("cancelBankButton")
        ?.addEventListener(
            "click",
            showCashBank
        );

    document.getElementById("bankName")?.focus();

}

// ======================================================
// SAVE BANK ACCOUNT
// ======================================================

async function saveBankAccount() {

    const bankName =
        document
            .getElementById("bankName")
            ?.value
            .trim();


    const accountNumber =
        document
            .getElementById("bankAccountNumber")
            ?.value
            .trim();


    const accountTitle =
        document
            .getElementById("bankAccountTitle")
            ?.value
            .trim();


    const branchName =
        document
            .getElementById("bankBranchName")
            ?.value
            .trim();


    const branchCode =
        document
            .getElementById("bankBranchCode")
            ?.value
            .trim();


    const openingBalance =
        Number(
            document
                .getElementById("bankOpeningBalance")
                ?.value
        ) || 0;


    if (!bankName) {

        alert("Bank name is required.");
        return;

    }


    if (!apiReady("saveBankAccount")) {

        alert("Save bank account API is not available.");
        return;

    }


    try {

        const result =
            await window.electronAPI.saveBankAccount({

                bank_name: bankName,
                account_title: accountTitle,
                account_number: accountNumber,
                branch_name: branchName,
                branch_code: branchCode,
                opening_balance: openingBalance

            });


        if (result?.success) {

            alert("Bank account saved successfully!");

            showCashBank();

        } else {

            alert(result?.error || "Failed to save bank account.");

        }

    } catch (error) {

        console.error("Save bank account error:", error);

        alert("Failed to save bank account: " + error.message);

    }

}

// ======================================================
// DELETE BANK ACCOUNT
// ======================================================

async function deleteBankAccount(bankId) {

    if (!bankId) {

        alert("Invalid bank account ID.");
        return;

    }


    const confirmed = await showAppConfirm(
        "Are you sure you want to delete this bank account?",
        { title: "Delete Bank Account", confirmText: "Delete" }
    );


    if (!confirmed) return;
    if (!await verifyDeleteSystemFunctionPassword("deleting this bank account")) return;


    if (!apiReady("deleteBankAccount")) {

        alert("Delete bank account API is not available.");
        return;

    }


    try {

        const result =
            await window.electronAPI.deleteBankAccount(bankId);


        if (result?.success) {
            showToast("Bank account deleted successfully!", "success");

            await loadCashBank();

        } else {
            showToast(result?.error || "Failed to delete bank account.", "error");

        }

    } catch (error) {

        console.error("Delete bank account error:", error);

        showToast("Failed to delete bank account: " + error.message, "error");

    }

}

// ======================================================
// REPORTS
// ======================================================

async function showReports() {

    const content =
        document.querySelector(".content");


    if (!content) return;


    content.innerHTML = `

        <div class="page-title">

            <h1>
                Reports
            </h1>

            <p>
                View complete business reports.
            </p>

        </div>


        <div class="panel">

            <div class="panel-header">

                <h3>
                    Report Options
                </h3>

            </div>


            <div style="
                display:grid;
                grid-template-columns:repeat(3, 1fr);
                gap:16px;
                padding:25px;
            ">

                <button
                    class="btn btn-sale report-btn"
                    data-report="daily"
                >
                    Daily Summary
                </button>

                <button
                    class="btn btn-sale report-btn"
                    data-report="sales"
                >
                    Sales Report
                </button>

                <button
                    class="btn btn-purchase report-btn"
                    data-report="purchase"
                >
                    Purchase Report
                </button>

                <button
                    class="btn report-btn"
                    data-report="profit"
                >
                    Profit & Loss
                </button>

                <button
                    class="btn report-btn"
                    data-report="stock"
                >
                    Stock Report
                </button>

                <button
                    class="btn report-btn"
                    data-report="expense"
                >
                    Expense Report
                </button>

                <button
                    class="btn report-btn"
                    data-report="receivables"
                >
                    Receivables & Payables
                </button>

                <button
                    class="btn btn-sale report-btn"
                    data-report="monthly"
                >
                    Monthly Analytics
                </button>

                <button
                    class="btn btn-purchase report-btn"
                    data-report="yearly"
                >
                    Yearly Analytics
                </button>

            </div>

        </div>


        <div id="reportContent">

            <div class="panel">

                <div class="empty-state">
                    Select a report to view.
                </div>

            </div>

        </div>
    `;


    document
        .querySelectorAll(".report-btn")
        .forEach(button => {

            button.addEventListener(
                "click",
                async () => {

                    const report =
                        button.dataset.report;


                    await loadReport(report);

                }
            );

        });

}

// ======================================================
// LOAD REPORT
// ======================================================

async function loadReport(reportType) {

    const container =
        document.getElementById("reportContent");


    if (!container) return;


    container.innerHTML = `

        <div class="panel">

            <div class="empty-state">
                Loading report...
            </div>

        </div>

    `;


    try {

        const reportRange = ["daily", "sales", "purchase", "profit", "stock", "expense", "receivables"].includes(reportType)
            ? getReportDateRange()
            : null;

        if (reportType === "daily") {

            await loadDailySummary(container, reportRange);

        } else if (reportType === "sales") {

            await loadSalesReport(container, reportRange);

        } else if (reportType === "purchase") {

            await loadPurchaseReport(container, reportRange);

        } else if (reportType === "profit") {

            await loadProfitLossReport(container, reportRange);

        } else if (reportType === "stock") {

            await loadStockReport(container, reportRange);

        } else if (reportType === "expense") {

            await loadExpenseReport(container, reportRange);

        } else if (reportType === "receivables") {

            await loadReceivablesPayables(container, reportRange);

        } else if (reportType === "monthly") {

            await loadMonthlyAnalytics(container);

        } else if (reportType === "yearly") {

            await loadYearlyAnalytics(container);

        }

    } catch (error) {

        console.error("Load report error:", error);

        container.innerHTML = `

            <div class="panel">

                <div class="empty-state">
                    Failed to load report: ${escapeHTML(error.message)}
                </div>

            </div>

        `;

    }

}

// ======================================================
// DAILY SUMMARY REPORT
// Ek din ki poori activity — totals + lists + PDF
// ======================================================

let dailySummaryData = null;

function getReportDateRange() {
    const today = new Date().toLocaleDateString("en-CA");
    const firstOfMonth = new Date();
    firstOfMonth.setDate(1);
    return {
        from_date: document.getElementById("reportFromDate")?.value || dashboardDateValue(firstOfMonth),
        to_date: document.getElementById("reportToDate")?.value || today
    };
}

function reportDateFilterHtml(range) {
    return `<div style="display:flex;gap:12px;padding:20px 25px;align-items:center;flex-wrap:wrap;">
        <label style="font-weight:600;">From Date:</label>
        <input type="date" id="reportFromDate" value="${escapeHTML(range.from_date)}" style="padding:10px;border:1px solid #ddd;border-radius:8px;">
        <label style="font-weight:600;">To Date:</label>
        <input type="date" id="reportToDate" value="${escapeHTML(range.to_date)}" style="padding:10px;border:1px solid #ddd;border-radius:8px;">
        <button id="reportDateApplyBtn" class="btn">Apply</button>
    </div>`;
}

function bindReportDateFilter(reportType) {
    document.getElementById("reportDateApplyBtn")?.addEventListener("click", () => loadReport(reportType));
}

async function loadDailySummary(container, range) {

    if (!apiReady("getDailySummary")) {

        container.innerHTML = `
            <div class="panel">
                <div class="empty-state">
                    Daily summary API is not available.
                </div>
            </div>
        `;
        return;

    }

    const today = range?.to_date || new Date().toLocaleDateString("en-CA");

    container.innerHTML = `
        <div class="panel">

            <div class="panel-header" style="display:flex; justify-content:space-between; align-items:center;">
                <h3>Daily Summary</h3>
            deferBackgroundTask(() => loadItems());
            </div>

            ${reportDateFilterHtml(range || { from_date: today, to_date: today })}
            <div style="display:flex; gap:12px; padding:0 25px 20px; align-items:center;">
                <label style="font-weight:600;">Date:</label>
                <input
                    type="date"
                    id="dailySummaryDate"
                    value="${today}"
                    style="
                        padding:10px;
                        border:1px solid #ddd;
                        border-radius:8px;
                    "
                >
                <button id="dailySummaryLoadBtn" class="btn">Load</button>
            </div>

            <div id="dailySummaryBody" style="padding:0 25px 25px;"></div>

        </div>
    `;

    const body = document.getElementById("dailySummaryBody");
    const dateInput = document.getElementById("dailySummaryDate");

    bindReportDateFilter("daily");

    async function refresh(singleDate = false) {
        const selectedRange = singleDate
            ? { from_date: dateInput.value, to_date: dateInput.value }
            : getReportDateRange();
        await renderDailySummary(body, dateInput.value, selectedRange);
    }

    document.getElementById("dailySummaryLoadBtn")
        ?.addEventListener("click", () => refresh(true));

    document.getElementById("dailySummaryPdfBtn")
        ?.addEventListener("click", () => saveDailySummaryPDF());

    await refresh();

}

async function renderDailySummary(body, date, range) {

    body.innerHTML = `<div class="empty-state">Loading...</div>`;

    try {

        const fromDate = range?.from_date || date;
        const toDate = range?.to_date || date;
        const start = new Date(`${fromDate}T00:00:00`);
        const end = new Date(`${toDate}T00:00:00`);
        const dates = [];
        for (let current = new Date(Math.min(start, end)); current <= new Date(Math.max(start, end)); current.setDate(current.getDate() + 1)) {
            dates.push(current.toLocaleDateString("en-CA"));
        }
        const dailyResults = await Promise.all(dates.map(selectedDate =>
            window.electronAPI.getDailySummary({ date: selectedDate })
        ));
        const result = dailyResults.reduce((combined, daily) => {
            if (!daily?.success) return combined;
            for (const key of Object.keys(combined.summary)) {
                combined.summary[key] = Number(combined.summary[key] || 0) + Number(daily.summary?.[key] || 0);
            }
            for (const key of ["salesList", "purchaseList", "returnList", "expenseList", "paymentList"]) {
                combined[key].push(...(daily[key] || []));
            }
            return combined;
        }, {
            success: true,
            date: fromDate === toDate ? fromDate : `${fromDate} to ${toDate}`,
            summary: { sales_total: 0, sales_count: 0, purchase_total: 0, purchase_count: 0, sale_return_total: 0, sale_return_count: 0, purchase_return_total: 0, purchase_return_count: 0, expense_total: 0, expense_count: 0, received_total: 0, paid_total: 0 },
            salesList: [], purchaseList: [], returnList: [], expenseList: [], paymentList: []
        });

        if (!result?.success) {
            throw new Error(result?.error || "Failed to load daily summary.");
        }

        dailySummaryData = result;

        const s = result.summary;
        const money = (v) => "Rs. " + (Number(v) || 0).toLocaleString();

        const time = (d) => String(d || "").replace("T", " ").slice(0, 16);

        const card = (label, value, color) => `
            <div style="
                background:#f8fafc;
                border:1px solid #e2e8f0;
                border-radius:10px;
                padding:14px;
            ">
                <div style="font-size:12px; color:#64748b; font-weight:600;">${label}</div>
                <div style="font-size:18px; font-weight:700; margin-top:4px; color:${color || '#1e293b'};">${value}</div>
            </div>
        `;

        const table = (headers, rows) => {
            if (!rows.length) {
                return `<p style="color:#94a3b8; margin:6px 0 0;">No records.</p>`;
            }
            return `
                <table style="width:100%; border-collapse:collapse; font-size:13px;">
                    <thead>
                        <tr>
                            ${headers.map(h => `
                                <th style="text-align:left; padding:8px; border-bottom:2px solid #e2e8f0;">
                                    ${h}
                                </th>
                            `).join("")}
                        </tr>
                    </thead>
                    <tbody>
                        ${rows.map(r => `
                            <tr>
                                ${r.map(c => `
                                    <td style="padding:7px 8px; border-bottom:1px solid #f1f5f9;">
                                        ${c}
                                    </td>
                                `).join("")}
                            </tr>
                        `).join("")}
                    </tbody>
                </table>
            `;
        };

        const section = (title, inner) => `
            <h4 style="margin:22px 0 8px; color:#334155;">${title}</h4>
            ${inner}
        `;

        body.innerHTML = `
            <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:12px;">
                ${card(`Sales (${s.sales_count})`, money(s.sales_total), "#10b981")}
                ${card(`Purchases (${s.purchase_count})`, money(s.purchase_total), "#ef4444")}
                ${card(`Sale Returns (${s.sale_return_count})`, money(s.sale_return_total), "#ef4444")}
                ${card(`Purchase Returns (${s.purchase_return_count})`, money(s.purchase_return_total), "#10b981")}
                ${card(`Expenses (${s.expense_count})`, money(s.expense_total), "#ef4444")}
                ${card("Received (Payments)", money(s.received_total), "#10b981")}
                ${card("Paid (Payments)", money(s.paid_total), "#ef4444")}
            </div>

            ${section("Sales Invoices",
                table(["Time", "Invoice", "Party", "Total", "Paid", "Due", "Method"],
                    result.salesList.map(x => [
                        time(x.created_at),
                        escapeHTML(x.invoice_no),
                        escapeHTML(x.party),
                        money(x.total),
                        money(x.paid),
                        money(x.due),
                        escapeHTML(x.payment_method)
                    ])))}

            ${section("Purchases",
                table(["Time", "Bill No", "Supplier", "Total", "Paid", "Due", "Method"],
                    result.purchaseList.map(x => [
                        time(x.created_at),
                        escapeHTML(x.bill_no),
                        escapeHTML(x.party),
                        money(x.total),
                        money(x.paid),
                        money(x.due),
                        escapeHTML(x.payment_method)
                    ])))}

            ${section("Returns",
                table(["Time", "Return No", "Type", "Party", "Amount"],
                    result.returnList.map(x => [
                        time(x.created_at),
                        escapeHTML(x.return_no),
                        escapeHTML(x.kind),
                        escapeHTML(x.party),
                        money(x.total)
                    ])))}

            ${section("Expenses",
                table(["Time", "Category", "Name", "Amount", "Method"],
                    result.expenseList.map(x => [
                        time(x.created_at),
                        escapeHTML(x.category),
                        escapeHTML(x.name || ""),
                        money(x.amount),
                        escapeHTML(x.payment_method)
                    ])))}

            ${section("Party Payments",
                table(["Time", "Type", "Party", "Amount", "Method", "Note"],
                    result.paymentList.map(x => [
                        time(x.created_at),
                        escapeHTML(x.type),
                        escapeHTML(x.party),
                        money(x.amount),
                        escapeHTML(x.payment_method),
                        escapeHTML(x.note || "")
                    ])))}
        `;


    } catch (error) {

        console.error("Daily summary error:", error);
        body.innerHTML = `
            <div class="empty-state">
                Failed to load: ${escapeHTML(error.message)}
            </div>
        `;

    }

}

// ======================================================
// DAILY SUMMARY — PDF EXPORT (jsPDF)
// ======================================================

function saveDailySummaryPDF() {

    const data = dailySummaryData;

    if (!data) {
        alert("Load the report first, then save the PDF.");
        return;
    }

    if (typeof window.jspdf === "undefined") {
        alert("PDF library is not loaded.");
        return;
    }

    try {

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ unit: "pt", format: "a4" });

        const pageW = doc.internal.pageSize.getWidth();
        const pageH = doc.internal.pageSize.getHeight();
        let y = 50;

        const s = data.summary;
        const rs = (v) => "Rs. " + (Number(v) || 0).toLocaleString();

        const ensureSpace = (needed) => {
            if (y + needed > pageH - 40) {
                doc.addPage();
                y = 50;
            }
        };

        // Header
        doc.setFont("helvetica", "bold");
        doc.setFontSize(16);
        doc.text("Daily Summary Report", 40, y);
        y += 20;

        doc.setFont("helvetica", "normal");
        doc.setFontSize(11);
        doc.text("Date: " + data.date, 40, y);
        y += 24;

        // Totals
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.text("Totals", 40, y);
        y += 16;

        doc.setFont("courier", "normal");
        doc.setFontSize(10);
        const totals = [
            ["Sales", `${s.sales_count} invoices`, rs(s.sales_total)],
            ["Purchases", `${s.purchase_count} bills`, rs(s.purchase_total)],
            ["Sale Returns", String(s.sale_return_count), rs(s.sale_return_total)],
            ["Purchase Returns", String(s.purchase_return_count), rs(s.purchase_return_total)],
            ["Expenses", String(s.expense_count), rs(s.expense_total)],
            ["Received", "", rs(s.received_total)],
            ["Paid", "", rs(s.paid_total)]
        ];
        for (const [a, b, c] of totals) {
            ensureSpace(14);
            doc.text(a.padEnd(18) + b.padEnd(12), 40, y);
            doc.text(c, pageW - 40, y, { align: "right" });
            y += 14;
        }
        y += 10;

        // Generic section writer
        const writeSection = (title, headers, rows) => {
            ensureSpace(40);
            doc.setFont("helvetica", "bold");
            doc.setFontSize(11);
            doc.text(title, 40, y);
            y += 6;

            doc.setFont("courier", "normal");
            doc.setFontSize(8);

            if (!rows.length) {
                ensureSpace(14);
                doc.text("(no records)", 40, y);
                y += 16;
                return;
            }

            // column x positions evenly spread
            const colW = (pageW - 80) / headers.length;
            const drawRow = (cells, boldHeader = false) => {
                ensureSpace(12);
                doc.setFont("courier", boldHeader ? "bold" : "normal");
                cells.forEach((cell, i) => {
                    const text = doc.splitTextToSize(
                        String(cell), colW - 4
                    )[0] || "";
                    doc.text(text, 40 + i * colW, y);
                });
                y += 11;
            };

            drawRow(headers, true);
            rows.forEach(r => drawRow(r));
            y += 8;
        };

        writeSection(
            "Sales Invoices",
            ["Time", "Invoice", "Party", "Total"],
            data.salesList.map(x => [
                timeOf(x.created_at),
                x.invoice_no,
                x.party,
                rs(x.total)
            ])
        );

        writeSection(
            "Purchases",
            ["Time", "Bill No", "Supplier", "Total"],
            data.purchaseList.map(x => [
                timeOf(x.created_at),
                x.bill_no,
                x.party,
                rs(x.total)
            ])
        );

        writeSection(
            "Returns",
            ["Time", "Return No", "Type", "Party", "Amount"],
            data.returnList.map(x => [
                timeOf(x.created_at),
                x.return_no,
                x.kind,
                x.party,
                rs(x.total)
            ])
        );

        writeSection(
            "Expenses",
            ["Time", "Category", "Name", "Amount"],
            data.expenseList.map(x => [
                timeOf(x.created_at),
                x.category,
                x.name || "",
                rs(x.amount)
            ])
        );

        writeSection(
            "Party Payments",
            ["Time", "Type", "Party", "Amount", "Method"],
            data.paymentList.map(x => [
                timeOf(x.created_at),
                x.type,
                x.party,
                rs(x.amount),
                x.payment_method
            ])
        );

        doc.save(`daily-summary-${data.date}.pdf`);

    } catch (error) {
        console.error("Daily summary PDF error:", error);
        alert("Failed to save PDF: " + error.message);
    }

}



// ======================================================
// LOAD SALES REPORT
// ======================================================

async function loadSalesReport(container, range) {

    if (!apiReady("getSalesReport")) {

        container.innerHTML = `

            <div class="panel">

                <div class="empty-state">
                    Sales report API is not available.
                </div>

            </div>

        `;

        return;

    }


    const result =
        await window.electronAPI.getSalesReport(range || getReportDateRange());


    if (!result?.success) {

        container.innerHTML = `

            <div class="panel">

                <div class="empty-state">
                    ${escapeHTML(result?.error || "Failed to load report.")}
                </div>

            </div>

        `;

        return;

    }


    const sales = result.sales || [];
    const summary = result.summary || {};


    container.innerHTML = `

        <div class="panel">

            <div class="panel-header">

                <h3>
                    Sales Report
                </h3>

            </div>

            ${reportDateFilterHtml(range || getReportDateRange())}


            <div style="
                display:grid;
                grid-template-columns:repeat(4, 1fr);
                gap:16px;
                margin-bottom:20px;
            ">

                <div class="card">

                    <div class="card-label">
                        Total Sales
                    </div>

                    <div class="card-value" style="color:#10b981; -webkit-text-fill-color:#10b981; font-weight:normal;">
                        ${formatMoney(summary.totalSales)}
                    </div>

                </div>


                <div class="card">

                    <div class="card-label">
                        Total Paid
                    </div>

                    <div class="card-value" style="color:#10b981; -webkit-text-fill-color:#10b981; font-weight:normal;">
                        ${formatMoney(summary.totalPaid)}
                    </div>

                </div>


                <div class="card">

                    <div class="card-label">
                        Total Due
                    </div>

                    <div class="card-value" style="color:#ef4444; -webkit-text-fill-color:#ef4444; font-weight:normal;">
                        ${formatMoney(summary.totalDue)}
                    </div>

                </div>


                <div class="card">

                    <div class="card-label">
                        Invoices
                    </div>

                    <div class="card-value">
                        ${Number(summary.count || 0).toLocaleString()}
                    </div>

                </div>

            </div>


            <table class="table">

                <thead>

                    <tr>

                        <th>Invoice</th>
                        <th>Date</th>
                        <th>Customer</th>
                        <th>Total</th>
                        <th>Paid</th>
                        <th>Due</th>

                    </tr>

                </thead>


                <tbody>

                    ${
                        sales.length > 0
                            ? sales.map(sale => `

                                <tr>

                                    <td>
                                        ${escapeHTML(sale.invoice_no || "-")}
                                    </td>

                                    <td>
                                        ${escapeHTML(formatDate(sale.created_at))}
                                    </td>

                                    <td>
                                        ${escapeHTML(sale.customer_name || sale.party_name || "-")}
                                    </td>

                                    <td>
                                        ${formatMoney(sale.total)}
                                    </td>

                                    <td>
                                        ${formatMoney(sale.paid)}
                                    </td>

                                    <td>
                                        ${formatMoney(sale.due)}
                                    </td>

                                </tr>

                            `).join("")
                            : `

                                <tr>

                                    <td colspan="6">

                                        <div class="empty-state">
                                            No sales found.
                                        </div>

                                    </td>

                                </tr>

                            `
                    }

                </tbody>

            </table>

        </div>

    `;

    bindReportDateFilter("sales");

}

// ======================================================
// LOAD PURCHASE REPORT
// ======================================================

async function loadPurchaseReport(container, range) {

    if (!apiReady("getPurchaseReport")) {

        container.innerHTML = `

            <div class="panel">

                <div class="empty-state">
                    Purchase report API is not available.
                </div>

            </div>

        `;

        return;

    }


    const result =
        await window.electronAPI.getPurchaseReport(range || getReportDateRange());


    if (!result?.success) {

        container.innerHTML = `

            <div class="panel">

                <div class="empty-state">
                    ${escapeHTML(result?.error || "Failed to load report.")}
                </div>

            </div>

        `;

        return;

    }


    const purchases = result.purchases || [];
    const summary = result.summary || {};


    container.innerHTML = `

        <div class="panel">

            <div class="panel-header">

                <h3>
                    Purchase Report
                </h3>

            </div>

            ${reportDateFilterHtml(range || getReportDateRange())}


            <div style="
                display:grid;
                grid-template-columns:repeat(4, 1fr);
                gap:16px;
                margin-bottom:20px;
            ">

                <div class="card">

                    <div class="card-label">
                        Total Purchase
                    </div>

                    <div class="card-value" style="color:#ef4444; -webkit-text-fill-color:#ef4444; font-weight:normal;">
                        ${formatMoney(summary.totalPurchase)}
                    </div>

                </div>


                <div class="card">

                    <div class="card-label">
                        Total Paid
                    </div>

                    <div class="card-value" style="color:#10b981; -webkit-text-fill-color:#10b981; font-weight:normal;">
                        ${formatMoney(summary.totalPaid)}
                    </div>

                </div>


                <div class="card">

                    <div class="card-label">
                        Total Due
                    </div>

                    <div class="card-value" style="color:#ef4444; -webkit-text-fill-color:#ef4444; font-weight:normal;">
                        ${formatMoney(summary.totalDue)}
                    </div>

                </div>


                <div class="card">

                    <div class="card-label">
                        Bills
                    </div>

                    <div class="card-value">
                        ${Number(summary.count || 0).toLocaleString()}
                    </div>

                </div>

            </div>


            <table class="table">

                <thead>

                    <tr>

                        <th>Bill No</th>
                        <th>Date</th>
                        <th>Supplier</th>
                        <th>Total</th>
                        <th>Paid</th>
                        <th>Due</th>

                    </tr>

                </thead>


                <tbody>

                    ${
                        purchases.length > 0
                            ? purchases.map(purchase => `

                                <tr>

                                    <td>
                                        ${escapeHTML(purchase.bill_no || "-")}
                                    </td>

                                    <td>
                                        ${escapeHTML(formatDate(purchase.created_at))}
                                    </td>

                                    <td>
                                        ${escapeHTML(purchase.party_name || "-")}
                                    </td>

                                    <td>
                                        ${formatMoney(purchase.total)}
                                    </td>

                                    <td>
                                        ${formatMoney(purchase.paid)}
                                    </td>

                                    <td>
                                        ${formatMoney(purchase.due)}
                                    </td>

                                </tr>

                            `).join("")
                            : `

                                <tr>

                                    <td colspan="6">

                                        <div class="empty-state">
                                            No purchases found.
                                        </div>

                                    </td>

                                </tr>

                            `
                    }

                </tbody>

            </table>

        </div>

    `;

    bindReportDateFilter("purchase");

}

// ======================================================
// LOAD PROFIT LOSS REPORT
// ======================================================

async function loadProfitLossReport(container, range) {

    if (!apiReady("getProfitLoss")) {

        container.innerHTML = `

            <div class="panel">

                <div class="empty-state">
                    Profit & Loss API is not available.
                </div>

            </div>

        `;

        return;

    }


    const result =
        await window.electronAPI.getProfitLoss(range || getReportDateRange());


    if (!result?.success) {

        container.innerHTML = `

            <div class="panel">

                <div class="empty-state">
                    ${escapeHTML(result?.error || "Failed to load report.")}
                </div>

            </div>

        `;

        return;

    }


    const summary = result.summary || {};


    container.innerHTML = `

        <div class="panel">

            <div class="panel-header">

                <h3>
                    Profit & Loss Report
                </h3>

            </div>

            ${reportDateFilterHtml(range || getReportDateRange())}


            <div style="
                display:grid;
                grid-template-columns:repeat(3, 1fr);
                gap:16px;
                margin-bottom:20px;
            ">

                <div class="card">

                    <div class="card-label">
                        Total Sales
                    </div>

                    <div class="card-value" style="color:#10b981; -webkit-text-fill-color:#10b981; font-weight:normal;">
                        ${formatMoney(summary.totalSales)}
                    </div>

                </div>


                <div class="card">

                    <div class="card-label">
                        Cost of Goods Sold
                    </div>

                    <div class="card-value" style="color:#ef4444; -webkit-text-fill-color:#ef4444; font-weight:normal;">
                        ${formatMoney(summary.cogs)}
                    </div>

                </div>


                <div class="card">

                    <div class="card-label">
                        Gross Profit
                    </div>

                    <div class="card-value" style="color:#10b981; -webkit-text-fill-color:#10b981; font-weight:normal;">
                        ${formatMoney(summary.grossProfit)}
                    </div>

                </div>


                <div class="card">

                    <div class="card-label">
                        Total Expenses
                    </div>

                    <div class="card-value" style="color:#ef4444; -webkit-text-fill-color:#ef4444; font-weight:normal;">
                        ${formatMoney(summary.totalExpenses)}
                    </div>

                </div>


                <div class="card">
                    <div class="card-label">Total Profit</div>
                    <div class="card-value" style="color:#10b981; -webkit-text-fill-color:#10b981; font-weight:normal;">
                        ${formatMoney(Math.max(0, Number(summary.totalProfit) || 0))}
                    </div>
                </div>

                <div class="card">
                    <div class="card-label" style="display:flex; justify-content:space-between; align-items:center;">
                        <span>Total Loss</span>
                        <button type="button" class="dashboard-clear-btn" data-loss-breakdown="true" aria-label="Open loss breakdown">...</button>
                    </div>
                    <div class="card-value" style="color:#ef4444; -webkit-text-fill-color:#ef4444; font-weight:normal;">
                        ${formatMoney(Math.max(0, Number(summary.totalLoss) || 0))}
                    </div>
                </div>

            </div>

        </div>

    `;

    bindReportDateFilter("profit");

    container.querySelector("[data-loss-breakdown]")?.addEventListener("click", () => {
        const breakdown = summary.lossBreakdown || {};
        openStructuredDetailModal({
            title: "Loss Breakdown",
            subtitle: "Positive loss components for the selected report period",
            rows: [
                { label: "Operational expenses", value: formatMoney(breakdown.operationalExpenses || 0) },
                { label: "Negative margin sales / heavy discounts", value: formatMoney(breakdown.negativeMargin || 0) },
                { label: "Damaged or returned goods impact", value: formatMoney(breakdown.returnedGoods || 0) }
            ],
            actions: `<button type="button" class="btn" data-close-detail="true">Close</button>`
        });
    });

}

// ======================================================
// LOAD STOCK REPORT
// ======================================================

async function loadStockReport(container, range) {

    if (!apiReady("getStockReport")) {

        container.innerHTML = `

            <div class="panel">

                <div class="empty-state">
                    Stock report API is not available.
                </div>

            </div>

        `;

        return;

    }


    const result =
        await window.electronAPI.getStockReport(range || getReportDateRange());


    if (!result?.success) {

        container.innerHTML = `

            <div class="panel">

                <div class="empty-state">
                    ${escapeHTML(result?.error || "Failed to load report.")}
                </div>

            </div>

        `;

        return;

    }


    const items = result.items || [];
    const summary = result.summary || {};


    container.innerHTML = `

        <div class="panel">

            <div class="panel-header">

                <h3>
                    Stock Report
                </h3>

            </div>

            ${reportDateFilterHtml(range || getReportDateRange())}


            <div style="
                display:grid;
                grid-template-columns:repeat(3, 1fr);
                gap:16px;
                margin-bottom:20px;
            ">

                <div class="card">

                    <div class="card-label">
                        Total Stock Value
                    </div>

                    <div class="card-value" style="color:#10b981; -webkit-text-fill-color:#10b981; font-weight:normal;">
                        ${formatMoney(summary.totalStockValue)}
                    </div>

                </div>


                <div class="card">

                    <div class="card-label">
                        Total Sale Value
                    </div>

                    <div class="card-value" style="color:#7c3aed; -webkit-text-fill-color:#7c3aed; font-weight:normal;">
                        ${formatMoney(summary.totalSaleValue)}
                    </div>

                </div>


                <div class="card">

                    <div class="card-label">
                        Items
                    </div>

                    <div class="card-value">
                        ${Number(summary.count || 0).toLocaleString()}
                    </div>

                </div>

            </div>


            <table class="table">

                <thead>

                    <tr>

                        <th>Item</th>
                        <th>Category</th>
                        <th>Stock</th>
                        <th>Purchase Price</th>
                        <th>Sale Price</th>
                        <th>Stock Value</th>

                    </tr>

                </thead>


                <tbody>

                    ${
                        items.length > 0
                            ? items.map(item => `

                                <tr>

                                    <td>
                                        ${escapeHTML(item.name || "-")}
                                    </td>

                                    <td>
                                        ${escapeHTML(item.category || "-")}
                                    </td>

                                    <td>
                                        ${Number(item.stock || 0).toLocaleString()}
                                    </td>

                                    <td>
                                        ${formatMoney(item.purchase_price)}
                                    </td>

                                    <td>
                                        ${formatMoney(item.sale_price)}
                                    </td>

                                    <td>
                                        ${formatMoney(item.stock_value)}
                                    </td>

                                </tr>

                            `).join("")
                            : `

                                <tr>

                                    <td colspan="6">

                                        <div class="empty-state">
                                            No items found.
                                        </div>

                                    </td>

                                </tr>

                            `
                    }

                </tbody>

            </table>

        </div>

    `;

    bindReportDateFilter("stock");

}

// ======================================================
// LOAD EXPENSE REPORT
// ======================================================

async function loadExpenseReport(container, range) {

    if (!apiReady("getExpenseReport")) {

        container.innerHTML = `

            <div class="panel">

                <div class="empty-state">
                    Expense report API is not available.
                </div>

            </div>

        `;

        return;

    }


    const result =
        await window.electronAPI.getExpenseReport(range || getReportDateRange());


    if (!result?.success) {

        container.innerHTML = `

            <div class="panel">

                <div class="empty-state">
                    ${escapeHTML(result?.error || "Failed to load report.")}
                </div>

            </div>

        `;

        return;

    }


    const expenses = result.expenses || [];
    const summary = result.summary || {};
    const byCategory = result.byCategory || {};


    const categoryRows =
        Object.entries(byCategory)
            .map(([cat, amount]) => `

                <tr>

                    <td>
                        ${escapeHTML(cat)}
                    </td>

                    <td>
                        ${formatMoney(amount)}
                    </td>

                </tr>

            `)
            .join("");


    container.innerHTML = `

        <div class="panel">

            <div class="panel-header">

                <h3>
                    Expense Report
                </h3>

            </div>

            ${reportDateFilterHtml(range || getReportDateRange())}


            <div style="
                display:grid;
                grid-template-columns:repeat(2, 1fr);
                gap:16px;
                margin-bottom:20px;
            ">

                <div class="card">

                    <div class="card-label">
                        Total Expenses
                    </div>

                    <div class="card-value" style="color:#ef4444; -webkit-text-fill-color:#ef4444; font-weight:normal;">
                        ${formatMoney(summary.totalExpenses)}
                    </div>

                </div>


                <div class="card">

                    <div class="card-label">
                        Expense Count
                    </div>

                    <div class="card-value">
                        ${Number(summary.count || 0).toLocaleString()}
                    </div>

                </div>

            </div>


            <h3 style="margin-bottom:12px;">
                By Category
            </h3>


            <table class="table" style="margin-bottom:24px;">

                <thead>

                    <tr>

                        <th>Category</th>
                        <th>Amount</th>

                    </tr>

                </thead>


                <tbody>

                    ${categoryRows || `

                        <tr>

                            <td colspan="2">

                                <div class="empty-state">
                                    No expenses found.
                                </div>

                            </td>

                        </tr>

                    `}

                </tbody>

            </table>


            <h3 style="margin-bottom:12px;">
                Expense Details
            </h3>


            <table class="table">

                <thead>

                    <tr>

                        <th>Date</th>
                        <th>Category</th>
                        <th>Name</th>
                        <th>Amount</th>

                    </tr>

                </thead>


                <tbody>

                    ${
                        expenses.length > 0
                            ? expenses.map(expense => `

                                <tr>

                                    <td>
                                        ${escapeHTML(formatDate(expense.created_at))}
                                    </td>

                                    <td>
                                        ${escapeHTML(expense.category || "-")}
                                    </td>

                                    <td>
                                        ${escapeHTML(expense.name || "-")}
                                    </td>

                                    <td>
                                        ${formatMoney(expense.amount)}
                                    </td>

                                </tr>

                            `).join("")
                            : `

                                <tr>

                                    <td colspan="4">

                                        <div class="empty-state">
                                            No expenses found.
                                        </div>

                                    </td>

                                </tr>

                            `
                    }

                </tbody>

            </table>

        </div>

    `;

    bindReportDateFilter("expense");

}

// ======================================================
// LOAD RECEIVABLES & PAYABLES
// ======================================================

async function loadReceivablesPayables(container, range) {

    if (!apiReady("getReceivablesPayables")) {

        container.innerHTML = `

            <div class="panel">

                <div class="empty-state">
                    Receivables & Payables API is not available.
                </div>

            </div>

        `;

        return;

    }


    const result =
        await window.electronAPI.getReceivablesPayables(range || getReportDateRange());


    if (!result?.success) {

        container.innerHTML = `

            <div class="panel">

                <div class="empty-state">
                    ${escapeHTML(result?.error || "Failed to load report.")}
                </div>

            </div>

        `;

        return;

    }


    const receivables = result.receivables || [];
    const payables = result.payables || [];
    const summary = result.summary || {};


    container.innerHTML = `

        <div class="panel">

            <div class="panel-header">

                <h3>
                    Receivables & Payables
                </h3>

            </div>

            ${reportDateFilterHtml(range || getReportDateRange())}


            <div style="
                display:grid;
                grid-template-columns:repeat(2, 1fr);
                gap:16px;
                margin-bottom:20px;
            ">

                <div class="card">

                    <div class="card-label">
                        Total Customer Receivables (Udhaar)
                    </div>

                    <div class="card-value" style="color:#10b981; -webkit-text-fill-color:#10b981; font-weight:normal;">
                        ${formatMoney(summary.totalReceivables)}
                    </div>

                </div>


                <div class="card">

                    <div class="card-label">
                        Total Supplier Payables
                    </div>

                    <div class="card-value" style="color:#ef4444; -webkit-text-fill-color:#ef4444; font-weight:normal;">
                        ${formatMoney(summary.totalPayables)}
                    </div>

                </div>

            </div>


            <h3 style="margin-bottom:12px;">
                Sales Received (Customers)
            </h3>


            <table class="table" style="margin-bottom:24px;">

                <thead>

                    <tr>

                        <th>Invoice #</th>
                        <th>Date</th>
                        <th>Customer Name</th>
                        <th>Total</th>
                        <th>Paid</th>
                        <th>Pending Due (Udhaar)</th>

                    </tr>

                </thead>


                <tbody>

                    ${
                        receivables.length > 0
                            ? receivables.map(c => `

                                <tr>

                                    <td>
                                        ${escapeHTML(c.invoice_no || "-")}
                                    </td>

                                    <td>${escapeHTML(formatDate(c.created_at))}</td>

                                    <td>
                                        ${escapeHTML(c.name || "Walk-In Customer")}
                                    </td>

                                    <td>
                                        ${formatMoney(c.total)}
                                    </td>

                                    <td>
                                        ${formatMoney(c.paid)}
                                    </td>

                                    <td>${formatMoney(c.pending_due)}</td>

                                </tr>

                            `).join("")
                            : `

                                <tr>

                                    <td colspan="6">

                                        <div class="empty-state">
                                            No sales received.
                                        </div>

                                    </td>

                                </tr>

                            `
                    }

                </tbody>

            </table>


            <h3 style="margin-bottom:12px;">
                Purchases Paid (Suppliers)
            </h3>


            <table class="table">

                <thead>

                    <tr>

                        <th>Bill #</th>
                        <th>Date</th>
                        <th>Supplier Name</th>
                        <th>Total</th>
                        <th>Paid</th>
                        <th>Payable Balance</th>

                    </tr>

                </thead>


                <tbody>

                    ${
                        payables.length > 0
                            ? payables.map(s => `

                                <tr>

                                    <td>
                                        ${escapeHTML(s.bill_no || "-")}
                                    </td>

                                    <td>${escapeHTML(formatDate(s.created_at))}</td>

                                    <td>
                                        ${escapeHTML(s.name || "Supplier")}
                                    </td>

                                    <td>
                                        ${formatMoney(s.total)}
                                    </td>

                                    <td>
                                        ${formatMoney(s.paid)}
                                    </td>

                                    <td>${formatMoney(s.pending_due)}</td>

                                </tr>

                            `).join("")
                            : `

                                <tr>

                                    <td colspan="6">

                                        <div class="empty-state">
                                            No supplier payments.
                                        </div>

                                    </td>

                                </tr>

                            `
                    }

                </tbody>

            </table>

        </div>

    `;

    bindReportDateFilter("receivables");

}

// ======================================================
// FALLBACK ANALYTICS (when API unavailable)
// ======================================================

async function fallbackMonthlyAnalytics(year) {
    try {
        const [sales, purchases, expenses] = await Promise.all([
            apiReady("getSales") ? window.electronAPI.getSales() : [],
            apiReady("getPurchases") ? window.electronAPI.getPurchases() : [],
            apiReady("getExpenses") ? window.electronAPI.getExpenses() : []
        ]);

        const months = [];
        for (let i = 1; i <= 12; i++) {
            const monthStr = String(i).padStart(2, '0');
            const monthName = new Date(2000, i - 1, 1).toLocaleString('en', { month: 'short' });

            let monthSales = 0, monthPurchases = 0, monthExpenses = 0, salesCount = 0;

            (Array.isArray(sales) ? sales : []).forEach(s => {
                const d = new Date(s.created_at);
                if (d.getFullYear() === Number(year) && String(d.getMonth() + 1).padStart(2, '0') === monthStr) {
                    monthSales += Number(s.total) || 0;
                    salesCount++;
                }
            });

            (Array.isArray(purchases) ? purchases : []).forEach(p => {
                const d = new Date(p.created_at);
                if (d.getFullYear() === Number(year) && String(d.getMonth() + 1).padStart(2, '0') === monthStr) {
                    monthPurchases += Number(p.total) || 0;
                }
            });

            (Array.isArray(expenses) ? expenses : []).forEach(e => {
                const d = new Date(e.created_at);
                if (d.getFullYear() === Number(year) && String(d.getMonth() + 1).padStart(2, '0') === monthStr) {
                    monthExpenses += Number(e.amount) || 0;
                }
            });

            const grossProfit = Math.max(0, monthSales - monthPurchases);
            const totalProfit = Math.max(0, grossProfit - monthExpenses);
            const totalLoss = Math.max(0, monthExpenses - grossProfit);

            months.push({
                month: monthStr,
                monthName,
                sales: monthSales,
                purchases: monthPurchases,
                expenses: monthExpenses,
                totalProfit,
                totalLoss,
                salesCount
            });
        }

        const yearlyTotals = months.reduce((acc, m) => ({
            sales: acc.sales + m.sales,
            purchases: acc.purchases + m.purchases,
            expenses: acc.expenses + m.expenses,
            totalProfit: acc.totalProfit + m.totalProfit,
            totalLoss: acc.totalLoss + m.totalLoss
        }), { sales: 0, purchases: 0, expenses: 0, totalProfit: 0, totalLoss: 0 });

        return { success: true, year: String(year), months, yearlyTotals };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function fallbackYearlyAnalytics() {
    try {
        const [sales, purchases, expenses] = await Promise.all([
            apiReady("getSales") ? window.electronAPI.getSales() : [],
            apiReady("getPurchases") ? window.electronAPI.getPurchases() : [],
            apiReady("getExpenses") ? window.electronAPI.getExpenses() : []
        ]);

        const yearMap = {};

        (Array.isArray(sales) ? sales : []).forEach(s => {
            const y = new Date(s.created_at).getFullYear().toString();
            if (!yearMap[y]) yearMap[y] = { sales: 0, purchases: 0, expenses: 0, salesCount: 0 };
            yearMap[y].sales += Number(s.total) || 0;
            yearMap[y].salesCount++;
        });

        (Array.isArray(purchases) ? purchases : []).forEach(p => {
            const y = new Date(p.created_at).getFullYear().toString();
            if (!yearMap[y]) yearMap[y] = { sales: 0, purchases: 0, expenses: 0, salesCount: 0 };
            yearMap[y].purchases += Number(p.total) || 0;
        });

        (Array.isArray(expenses) ? expenses : []).forEach(e => {
            const y = new Date(e.created_at).getFullYear().toString();
            if (!yearMap[y]) yearMap[y] = { sales: 0, purchases: 0, expenses: 0, salesCount: 0 };
            yearMap[y].expenses += Number(e.amount) || 0;
        });

        const years = Object.keys(yearMap).sort().map(y => ({
            year: y,
            sales: yearMap[y].sales,
            purchases: yearMap[y].purchases,
            expenses: yearMap[y].expenses,
            totalProfit: Math.max(0, yearMap[y].sales - yearMap[y].purchases - yearMap[y].expenses),
            totalLoss: Math.max(0, yearMap[y].purchases + yearMap[y].expenses - yearMap[y].sales),
            salesCount: yearMap[y].salesCount
        }));

        const allTimeTotals = years.reduce((acc, y) => ({
            sales: acc.sales + y.sales,
            purchases: acc.purchases + y.purchases,
            expenses: acc.expenses + y.expenses,
            totalProfit: acc.totalProfit + y.totalProfit,
            totalLoss: acc.totalLoss + y.totalLoss
        }), { sales: 0, purchases: 0, expenses: 0, totalProfit: 0, totalLoss: 0 });

        return { success: true, years, allTimeTotals };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// ======================================================
// MONTHLY ANALYTICS REPORT
// ======================================================

async function loadMonthlyAnalytics(container, selectedPeriod = "") {

    const currentPeriod = selectedPeriod || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
    const [selectedYear, selectedMonth] = currentPeriod.split("-");

    container.innerHTML = `<div class="panel"><div class="empty-state">Loading monthly analytics...</div></div>`;

    try {
        let result;

        if (apiReady("getMonthlyAnalytics")) {
            result = await window.electronAPI.getMonthlyAnalytics({
                year: selectedYear,
                month: selectedMonth
            });
        } else {
            result = await fallbackMonthlyAnalytics(selectedYear);
        }

        if (!result?.success && !result?.months) {
            container.innerHTML = `<div class="panel"><div class="empty-state">${escapeHTML(result?.error || "No data available.")}</div></div>`;
            return;
        }

        const months = result.months || [];
        const totals = result.yearlyTotals || {};

        container.innerHTML = `
            <div class="panel">
                <div class="panel-header" style="display:flex; justify-content:space-between; align-items:center;">
                    <h3>Monthly Analytics — ${escapeHTML(result.year)}-${escapeHTML(selectedMonth)}</h3>
                    <input id="monthlyAnalyticsMonth" type="month" value="${escapeHTML(currentPeriod)}" aria-label="Select analytics month">
                </div>
                <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:16px; margin-bottom:20px;">
                    <div class="card">
                        <div class="card-label">Total Sales</div>
                        <div class="card-value" style="color:#10b981; -webkit-text-fill-color:#10b981; font-weight:normal;">${formatMoney(totals.sales)}</div>
                    </div>
                    <div class="card">
                        <div class="card-label">Total Expenses</div>
                        <div class="card-value" style="color:#ef4444; -webkit-text-fill-color:#ef4444; font-weight:normal;">${formatMoney(totals.expenses)}</div>
                    </div>
                    <div class="card">
                        <div class="card-label">Total Profit</div>
                        <div class="card-value" style="color:#10b981; -webkit-text-fill-color:#10b981; font-weight:normal;">${formatMoney(Math.max(0, Number(totals.totalProfit) || 0))}</div>
                    </div>
                    <div class="card">
                        <div class="card-label">Total Loss</div>
                        <div class="card-value" style="color:#ef4444; -webkit-text-fill-color:#ef4444; font-weight:normal;">${formatMoney(Math.max(0, Number(totals.totalLoss) || 0))}</div>
                    </div>
                </div>
            </div>
            <div class="panel" style="margin-top:16px;">
                <div class="panel-header"><h3>Monthly Breakdown</h3></div>
                <table class="table">
                    <thead>
                        <tr>
                            <th>Month</th>
                            <th>Sales</th>
                            <th>Purchases</th>
                            <th>Expenses</th>
                            <th>Total Profit</th>
                            <th>Total Loss</th>
                            <th>Sales Count</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${months.map(m => `
                            <tr>
                                <td><b>${escapeHTML(m.monthName)}</b></td>
                                <td>${formatMoney(m.sales)}</td>
                                <td>${formatMoney(m.purchases)}</td>
                                <td>${formatMoney(m.expenses)}</td>
                                <td style="color:#10b981;"><b>${formatMoney(Math.max(0, Number(m.totalProfit) || 0))}</b></td>
                                <td style="color:#ef4444;"><b>${formatMoney(Math.max(0, Number(m.totalLoss) || 0))}</b></td>
                                <td>${m.salesCount}</td>
                            </tr>
                        `).join("")}
                    </tbody>
                </table>
            </div>
        `;

        document.getElementById("monthlyAnalyticsMonth")?.addEventListener("change", event => {
            loadMonthlyAnalytics(container, event.target.value);
        });
    } catch (error) {
        container.innerHTML = `<div class="panel"><div class="empty-state">Error: ${escapeHTML(error.message)}</div></div>`;
    }
}

// ======================================================
// YEARLY ANALYTICS REPORT
// ======================================================

async function loadYearlyAnalytics(container, selectedYear = "") {

    container.innerHTML = `<div class="panel"><div class="empty-state">Loading yearly analytics...</div></div>`;

    try {
        let result;

        if (apiReady("getYearlyAnalytics")) {
            result = await window.electronAPI.getYearlyAnalytics({ year: selectedYear });
        } else {
            result = fallbackYearlyAnalytics();
        }

        if (!result?.success && !result?.years) {
            container.innerHTML = `<div class="panel"><div class="empty-state">${escapeHTML(result?.error || "No data available.")}</div></div>`;
            return;
        }

        const years = result.years || [];
        const totals = result.allTimeTotals || {};

        container.innerHTML = `
            <div class="panel">
                <div class="panel-header" style="display:flex; justify-content:space-between; align-items:center;">
                    <h3>Yearly Analytics${selectedYear ? ` — ${escapeHTML(selectedYear)}` : " — All Time"}</h3>
                    <input id="yearlyAnalyticsYear" type="number" min="2000" max="2100" placeholder="Search year" value="${escapeHTML(selectedYear)}" aria-label="Search analytics year">
                </div>
                <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:16px; margin-bottom:20px;">
                    <div class="card">
                        <div class="card-label">All-Time Sales</div>
                        <div class="card-value" style="color:#10b981; -webkit-text-fill-color:#10b981; font-weight:normal;">${formatMoney(totals.sales)}</div>
                    </div>
                    <div class="card">
                        <div class="card-label">All-Time Expenses</div>
                        <div class="card-value" style="color:#ef4444; -webkit-text-fill-color:#ef4444; font-weight:normal;">${formatMoney(totals.expenses)}</div>
                    </div>
                    <div class="card">
                        <div class="card-label">All-Time Profit</div>
                        <div class="card-value" style="color:#10b981; -webkit-text-fill-color:#10b981; font-weight:normal;">${formatMoney(Math.max(0, Number(totals.totalProfit) || 0))}</div>
                    </div>
                    <div class="card">
                        <div class="card-label">Total Loss</div>
                        <div class="card-value" style="color:#ef4444; -webkit-text-fill-color:#ef4444; font-weight:normal;">${formatMoney(Math.max(0, Number(totals.totalLoss) || 0))}</div>
                    </div>
                </div>
            </div>
            <div class="panel" style="margin-top:16px;">
                <div class="panel-header"><h3>Yearly Breakdown</h3></div>
                <table class="table">
                    <thead>
                        <tr>
                            <th>Year</th>
                            <th>Sales</th>
                            <th>Purchases</th>
                            <th>Expenses</th>
                            <th>Total Profit</th>
                            <th>Total Loss</th>
                            <th>Sales Count</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${years.length > 0 ? years.map(y => `
                            <tr>
                                <td><b>${escapeHTML(y.year)}</b></td>
                                <td>${formatMoney(y.sales)}</td>
                                <td>${formatMoney(y.purchases)}</td>
                                <td>${formatMoney(y.expenses)}</td>
                                <td style="color:#10b981;"><b>${formatMoney(Math.max(0, Number(y.totalProfit) || 0))}</b></td>
                                <td style="color:#ef4444;"><b>${formatMoney(Math.max(0, Number(y.totalLoss) || 0))}</b></td>
                                <td>${y.salesCount}</td>
                            </tr>
                        `).join("") : `<tr><td colspan="6"><div class="empty-state">No data available.</div></td></tr>`}
                    </tbody>
                </table>
            </div>
        `;

        document.getElementById("yearlyAnalyticsYear")?.addEventListener("change", event => {
            loadYearlyAnalytics(container, event.target.value.trim());
        });
    } catch (error) {
        container.innerHTML = `<div class="panel"><div class="empty-state">Error: ${escapeHTML(error.message)}</div></div>`;
    }
}

// ======================================================
// SETTINGS
// ======================================================

async function showSettings() {

    const content =
        document.querySelector(".content");


    if (!content) return;


    content.innerHTML = `

        <div class="page-title">

            <h1>
                Settings
            </h1>

            <p>
                Manage your business profile and data.
            </p>

        </div>


        <div class="panel">

            <div class="panel-header">

                <h3>
                    Business Profile
                </h3>

            </div>


            <div style="
                display:grid;
                grid-template-columns:1fr 1fr;
                gap:20px;
                padding:25px;
            ">

                <div>

                    <label>
                        Business Name
                    </label>

                    <input
                        id="companyName"
                        type="text"
                        placeholder="Your business name"
                        style="
                            width:100%;
                            padding:12px;
                            margin-top:8px;
                        "
                    >

                </div>


                <div>

                    <label>
                        Phone
                    </label>

                    <input
                        id="companyPhone"
                        type="text"
                        placeholder="Phone number"
                        style="
                            width:100%;
                            padding:12px;
                            margin-top:8px;
                        "
                    >

                </div>


                <div>

                    <label>
                        Email
                    </label>

                    <input
                        id="companyEmail"
                        type="email"
                        placeholder="Email address"
                        style="
                            width:100%;
                            padding:12px;
                            margin-top:8px;
                        "
                    >

                </div>


                <div>

                    <label>
                        GSTIN
                    </label>

                    <input
                        id="companyGstin"
                        type="text"
                        placeholder="GSTIN number"
                        style="
                            width:100%;
                            padding:12px;
                            margin-top:8px;
                        "
                    >

                </div>


                <div>

                    <label>
                        Currency
                    </label>

                    <select
                        id="companyCurrency"
                        style="
                            width:100%;
                            padding:12px;
                            margin-top:8px;
                        "
                    >

                        <option value="Rs.">
                            Rs. (Pakistani Rupee)
                        </option>

                        <option value="$">
                            $ (US Dollar)
                        </option>

                        <option value="₹">
                            ₹ (Indian Rupee)
                        </option>

                    </select>

                </div>


                <div>

                    <label>
                        Business Type
                    </label>

                    <select
                        id="companyBusinessType"
                        style="
                            width:100%;
                            padding:12px;
                            margin-top:8px;
                        "
                    >

                        <option value="general_store">General / Karyana Store</option>
                        <option value="grocery">Grocery Store</option>
                        <option value="super_store">Super Store</option>
                        <option value="garments">Garments Shop</option>
                        <option value="shoes">Shoes Shop</option>
                        <option value="cosmetics">Cosmetics Shop</option>
                        <option value="mobile_accessories">Mobile Accessories</option>
                        <option value="electronics">Electronics</option>
                        <option value="hardware">Hardware Store</option>
                        <option value="pharmacy">Pharmacy</option>
                        <option value="stationery">Stationery Shop</option>
                        <option value="gift_shop">Gift Shop</option>
                        <option value="spare_parts">Spare Parts</option>
                        <option value="auto_parts">Auto Parts</option>
                        <option value="book_shop">Book Shop</option>
                        <option value="bakery">Bakery</option>
                        <option value="meat_shop">Meat Shop</option>
                        <option value="restaurant">Restaurant / Takeaway</option>
                        <option value="wholesale">Wholesale Business</option>
                        <option value="retail_wholesale">Retail + Wholesale</option>
                        <option value="other">Other</option>

                    </select>

                </div>


                <div style="grid-column:1/-1;">

                    <label>
                        Address
                    </label>

                    <input
                        id="companyAddress"
                        type="text"
                        placeholder="Business address"
                        style="
                            width:100%;
                            padding:12px;
                            margin-top:8px;
                        "
                    >

                </div>


                <div style="grid-column:1/-1;">

                    <label>
                        Invoice Footer
                    </label>

                    <input
                        id="companyInvoiceFooter"
                        type="text"
                        placeholder="Optional invoice footer"
                        style="
                            width:100%;
                            padding:12px;
                            margin-top:8px;
                        "
                    >

                </div>

            </div>


            <div style="
                padding:0 25px 25px;
                display:flex;
                gap:10px;
            ">

                <button
                    id="saveCompanyButton"
                    class="btn btn-sale"
                >
                    Save Profile
                </button>

            </div>

        </div>


        <div class="panel">

            <div class="panel-header">

                <h3>
                    Database Management
                </h3>

            </div>


            <div style="
                display:flex;
                gap:10px;
                padding:25px;
            ">

                <button
                    id="backupButton"
                    class="btn btn-purchase"
                >
                    💾 Backup Database
                </button>

                <button
                    id="restoreButton"
                    class="btn"
                >
                    📂 Restore Database
                </button>

            </div>

        </div>


        <div class="panel">

            <div class="panel-header">

                <h3>
                    👥 Users &amp; Permissions
                </h3>

            </div>

            <div style="
                padding:25px;
            ">

                <button
                    id="manageUsersButton"
                    class="btn btn-sale"
                >
                    Manage Users
                </button>

                <div
                    id="usersPanel"
                    style="margin-top:20px; display:none;"
                ></div>

            </div>

        </div>


        <div class="panel">

            <div class="panel-header">

                <h3>
                    📋 Audit Log
                </h3>

            </div>

            <div style="
                padding:25px;
            ">

                <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:end;">

                    <div>
                        <label>From Date</label>
                        <input id="auditFromDate" type="date" style="padding:8px; margin-top:5px;">
                    </div>

                    <div>
                        <label>To Date</label>
                        <input id="auditToDate" type="date" style="padding:8px; margin-top:5px;">
                    </div>

                    <div>
                        <label>Action</label>
                        <input id="auditAction" type="text" placeholder="e.g. sale_created" style="padding:8px; margin-top:5px;">
                    </div>

                    <button id="loadAuditButton" class="btn btn-sale">
                        Load Log
                    </button>

                </div>

                <div
                    id="auditLogPanel"
                    style="margin-top:20px; overflow-x:auto;"
                ></div>

            </div>

        </div>


        <div class="panel">

            <div class="panel-header">

                <h3>
                    🌙 Day Closing
                </h3>

            </div>

            <div style="
                padding:25px;
            ">

                <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:end;">

                    <div>
                        <label>Date</label>
                        <input id="dayCloseDate" type="date" style="padding:8px; margin-top:5px;">
                    </div>

                    <button id="loadDayCloseButton" class="btn btn-purchase">
                        Load Day Summary
                    </button>

                </div>

                <div
                    id="dayClosePanel"
                    style="margin-top:20px;"
                ></div>

            </div>

        </div>
    `;


    document
        .getElementById("saveCompanyButton")
        ?.addEventListener(
            "click",
            saveCompany
        );


    document
        .getElementById("backupButton")
        ?.addEventListener(
            "click",
            backupDatabase
        );


    document
        .getElementById("restoreButton")
        ?.addEventListener(
            "click",
            restoreDatabase
        );

    document
        .getElementById("manageUsersButton")
        ?.addEventListener(
            "click",
            toggleUsersPanel
        );

    document
        .getElementById("loadAuditButton")
        ?.addEventListener(
            "click",
            loadAuditLogView
        );

    document
        .getElementById("loadDayCloseButton")
        ?.addEventListener(
            "click",
            loadDayCloseView
        );

    // Default day close date = today
    const dayCloseDateEl =
        document.getElementById("dayCloseDate");

    if (dayCloseDateEl) {
        dayCloseDateEl.value =
            new Date().toISOString().slice(0, 10);
    }

    await loadCompany();

}

// ======================================================
// LOAD COMPANY
// ======================================================

async function loadCompany() {

    if (!apiReady("getCompany")) {

        console.error("Get company API is not available.");
        return;

    }


    try {

        const result =
            await window.electronAPI.getCompany();


        if (!result?.success || !result.company) {

            return;

        }


        const company = result.company;


        const nameEl =
            document.getElementById("companyName");


        if (nameEl) {

            nameEl.value = company.name || "";

        }


        const phoneEl =
            document.getElementById("companyPhone");


        if (phoneEl) {

            phoneEl.value = company.phone || "";

        }


        const emailEl =
            document.getElementById("companyEmail");


        if (emailEl) {

            emailEl.value = company.email || "";

        }


        const gstinEl =
            document.getElementById("companyGstin");


        if (gstinEl) {

            gstinEl.value = company.gstin || "";

        }


        const currencyEl =
            document.getElementById("companyCurrency");


        if (currencyEl) {

            currencyEl.value = company.currency || "Rs.";

        }


        const businessTypeEl =
            document.getElementById("companyBusinessType");

        if (businessTypeEl) {

            businessTypeEl.value =
                company.business_type || "general_store";

        }


        const addressEl =
            document.getElementById("companyAddress");


        if (addressEl) {

            addressEl.value = company.address || "";

        }


        const footerEl =
            document.getElementById("companyInvoiceFooter");


        if (footerEl) {

            footerEl.value = company.invoice_footer || "";

        }


    } catch (error) {

        console.error("Load company error:", error);

    }

}

// ======================================================
// SAVE COMPANY
// ======================================================

async function saveCompany() {

    const saveButton = document.getElementById("saveCompanyButton");
    if (saveButton?.disabled) return;

    const name =
        document
            .getElementById("companyName")
            ?.value
            .trim();


    if (!name) {

        alert("Business name is required.");
        return;

    }


    if (!apiReady("saveCompany")) {

        alert("Save company API is not available.");
        return;

    }


    try {

        if (saveButton) saveButton.disabled = true;

        const result =
            await window.electronAPI.saveCompany({

                name,
                phone:
                    document
                        .getElementById("companyPhone")
                        ?.value
                        .trim() || "",

                email:
                    document
                        .getElementById("companyEmail")
                        ?.value
                        .trim() || "",

                gstin:
                    document
                        .getElementById("companyGstin")
                        ?.value
                        .trim() || "",

                currency:
                    document
                        .getElementById("companyCurrency")
                        ?.value || "Rs.",

                business_type:
                    document
                        .getElementById("companyBusinessType")
                        ?.value || "general_store",

                address:
                    document
                        .getElementById("companyAddress")
                        ?.value
                        .trim() || "",

                invoice_footer:
                    document
                        .getElementById("companyInvoiceFooter")
                        ?.value
                        .trim() || ""

            });


        if (result?.success) {

            showToast("Business profile saved successfully!", "success");

            // Keep the top header update off the input event path.
            void updateTopbarCompanyName();

        } else {

            showToast(result?.error || "Failed to save profile.");

        }

    } catch (error) {

        console.error("Save company error:", error);

        showToast("Failed to save profile: " + error.message);

    } finally {

        if (saveButton?.isConnected) saveButton.disabled = false;

    }

}

// ======================================================
// USERS MANAGEMENT UI (PHASE 6)
// ======================================================

function esc(text) {
    return String(text ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

async function toggleUsersPanel() {

    if (!apiReady("getManagedUsers")) {
        alert("Users API is not available.");
        return;
    }

    const panel =
        document.getElementById("usersPanel");

    if (!panel) return;

    if (panel.dataset.loading === "true") return;

    if (panel.style.display !== "none") {
        panel.style.display = "none";
        return;
    }

    try {

        panel.dataset.loading = "true";

        const result =
            await window.electronAPI.getManagedUsers();

        const users = result?.users || [];

        let rows = "";

        for (const u of users) {

            const badge = {
                owner: "#7c3aed", admin: "#2563eb",
                manager: "#d97706", cashier: "#0f766e",
                salesman: "#64748b"
            }[String(u.role).toLowerCase()] || "#94a3b8";

            let actions = "";

            // Apna account -> Change My PIN (old PIN mandatory)
            if (u.is_self) {
                actions += `
                    <button class="btn btn-sale" style="padding:4px 10px; font-size:11px;"
                        onclick="changeMyPin()">
                        🔑 Change My PIN
                    </button>
                `;
            }

            // Lower-rank users -> Reset PIN (old PIN ki zaroorat nahi)
            if (u.can_reset) {
                actions += `
                    <button class="btn" style="padding:4px 10px; font-size:11px;
                        background:#fff7e6; color:#b45309;"
                        onclick="resetUserPinSecure(${u.id}, '${esc(u.username)}')">
                        🔑 Reset PIN
                    </button>
                `;
            }

            // Settings permission wale hi enable/disable/delete kar sakte hain
            if (currentUserPermissions?.settings && !u.is_self) {
                actions += `
                    <button class="btn" style="padding:4px 10px; font-size:11px;"
                        onclick="toggleUserActive(${u.id}, ${Number(u.active) ? 0 : 1})">
                        ${Number(u.active) ? "Disable" : "Enable"}
                    </button>
                    <button class="btn" style="padding:4px 10px; font-size:11px;
                        background:#ffe5e5; color:#d93025;"
                        onclick="removeUser(${u.id})">
                        Delete
                    </button>
                `;
            }

            rows += `
                <tr>
                    <td>
                        <b>${esc(u.username)}</b>
                        ${u.is_self ? '<span style="font-size:10px; color:#0f766e;"> (you)</span>' : ""}
                    </td>
                    <td>${esc(u.full_name || "")}</td>
                    <td>${esc(u.phone || "-")}</td>
                    <td>
                        <span style="
                            background:${badge}; color:#fff; padding:2px 8px;
                            border-radius:10px; font-size:10.5px;
                            text-transform:uppercase;">
                            ${esc(u.role)}
                        </span>
                    </td>
                    <td>${Number(u.active) ? "✅ Active" : "⛔ Disabled"}</td>
                    <td style="font-size:11px; color:#64748b;">
                        ${u.pin_hint ? "Hint: " + esc(u.pin_hint) : "—"}
                    </td>
                    <td>${actions}</td>
                </tr>
            `;

        }

        if (!users.length) {
            rows = `<tr><td colspan="7">No users yet.</td></tr>`;
        }

        panel.innerHTML = `
            <table class="data-table" style="width:100%; border-collapse:collapse;">
                <thead>
                    <tr>
                        <th style="text-align:left; padding:8px;">Username</th>
                        <th style="text-align:left; padding:8px;">Full Name</th>
                        <th style="text-align:left; padding:8px;">Phone</th>
                        <th style="text-align:left; padding:8px;">Role</th>
                        <th style="text-align:left; padding:8px;">Status</th>
                        <th style="text-align:left; padding:8px;">PIN Hint</th>
                        <th style="text-align:left; padding:8px;">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                </tbody>
            </table>

            ${
                currentUserPermissions?.settings
                ? `<h4 style="margin-top:25px;">Add New User</h4>

                    <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:end; margin-top:10px;">
                        <div>
                            <label>Full Name</label>
                            <input id="newUserFullName" type="text" placeholder="e.g. Ali Ahmed" style="padding:8px; margin-top:5px;">
                        </div>
                        <div>
                            <label>Phone Number</label>
                            <input id="newUserPhone" type="text" placeholder="03XX-XXXXXXX" style="padding:8px; margin-top:5px;">
                        </div>
                        <div>
                            <label>Password (min 6, letters+numbers)</label>
                            <input id="newUserPassword" type="password" autocomplete="new-password" placeholder="••••••" style="padding:8px; margin-top:5px;">
                        </div>
                        <div>
                            <label>Confirm Password</label>
                            <input id="newUserPassword2" type="password" autocomplete="new-password" placeholder="••••••" style="padding:8px; margin-top:5px;">
                        </div>
                        <div>
                            <label>System Function Password (4-8 digits)</label>
                            <input id="newUserFunctionPassword" type="password" inputmode="numeric" autocomplete="off" placeholder="••••" style="padding:8px; margin-top:5px;">
                        </div>
                        <div>
                            <label>Role</label>
                            <select id="newUserRole" style="padding:8px; margin-top:5px;">
                                <option value="cashier">Cashier</option>
                                <option value="salesman">Salesman</option>
                                <option value="manager">Manager</option>
                            </select>
                        </div>
                        <button type="button" id="addUserButton" class="btn btn-sale">➕ Add User</button>
                    </div>`
                : `<p style="margin-top:15px; font-size:12px; color:#94a3b8;">
                    Note: Naye users sirf Owner/Admin bana sakte hain.
                  </p>`
            }
        `;

        panel.style.display = "block";

        document.getElementById("newUserPhone")
            ?.addEventListener("input", formatPkPhoneInput);

        document
            .getElementById("addUserButton")
            ?.addEventListener("click", addNewUser);

    } catch (error) {
        console.error("Load users error:", error);
        alert("Failed to load users: " + error.message);
    } finally {
        panel.dataset.loading = "false";
    }

}

async function refreshUsersPanel() {
    const panel = document.getElementById("usersPanel");
    if (!panel) return;
    panel.style.display = "none";
    await toggleUsersPanel();
}

async function addNewUser() {

    const fullName =
        document.getElementById("newUserFullName")?.value.trim();
    const phone =
        document.getElementById("newUserPhone")?.value.trim();
    const password =
        document.getElementById("newUserPassword")?.value.trim() || "";
    const confirm2 =
        document.getElementById("newUserPassword2")?.value.trim() || "";
    const functionPassword =
        document.getElementById("newUserFunctionPassword")?.value.trim() || "";
    const role =
        document.getElementById("newUserRole")?.value;

    if (!phone || !password) {
        alert("Phone number and password are required.");
        return;
    }

    if (password.length < 6 || !/[a-zA-Z]/.test(password) ||
        !/\d/.test(password)) {
        alert(
            "Password must be at least 6 characters and contain " +
            "both letters and numbers."
        );
        return;
    }

    if (password !== confirm2) {
        alert("Passwords do not match.");
        return;
    }

    if (!/^\d{4,8}$/.test(functionPassword)) {
        alert("System Function Password must be 4 to 8 digits only.");
        return;
    }

    try {

        const result =
            await window.electronAPI.saveUser({
                full_name: fullName || "Staff User",
                phone,
                password,
                function_password: functionPassword,
                role
            });

        if (!result?.success) {
            alert(result?.error || "Failed to create user.");
            return;
        }

        showToast("User created successfully!", "success");
        const usersPanel = document.getElementById("usersPanel");
        if (usersPanel) usersPanel.style.display = "none";
        await toggleUsersPanel();

    } catch (error) {
        console.error("Add user error:", error);
        alert("Failed to create user: " + error.message);
    }

}

async function toggleUserActive(userId, active) {

    if (!await showAppConfirm(
        active
            ? "Enable this user?"
            : "Disable this user? They will not be able to log in.",
        { title: active ? "Enable User" : "Disable User", confirmText: active ? "Enable" : "Disable" }
    )) {
        return;
    }

    try {

        await window.electronAPI.updateUser({ id: userId, active: !!active });
        await refreshUsersPanel();

    } catch (error) {
        console.error("Toggle user error:", error);
        alert("Failed to update user: " + error.message);
    }

}

// Apna password change — old password MANDATORY
function changeMyPin() {

    if (!window.electronAPI ||
        typeof window.electronAPI.changeOwnPin !== "function") {
        alert(
            "Change password API is not available.\n\n" +
            "Please fully quit and restart the app."
        );
        return;
    }

    const body = `
        ${formField("pinOld", "Current Password", { type: "password", placeholder: "••••••" })}
        ${formField("pinNew1", "New Password (min 6, letters + numbers)", { type: "password", placeholder: "••••••" })}
        ${formField("pinNew2", "Confirm New Password", { type: "password", placeholder: "••••••" })}
    `;

    showFormModal("🔑 Change My Password", body, "Change Password", async () => {

        const oldPin =
            document.getElementById("pinOld")?.value || "";
        const newPin =
            document.getElementById("pinNew1")?.value || "";
        const confirmPin =
            document.getElementById("pinNew2")?.value || "";

        if (!oldPin) return "Current password is required.";
        if (newPin.length < 6 || !/[a-zA-Z]/.test(newPin) ||
            !/\d/.test(newPin)) {
            return "New password must be at least 6 characters and " +
                   "contain both letters and numbers.";
        }
        if (newPin !== confirmPin) return "New passwords do not match.";

        const result =
            await window.electronAPI.changeOwnPin({
                old_password: oldPin,
                new_password: newPin
            });

        if (!result?.success) {
            return result?.error || "Change failed.";
        }

        showToast("Password changed successfully.", "success");
        return true;

    });
}

// Doosre user ka password reset — old password ki zaroorat NAHI.
// Backend hierarchy khud enforce karta hai:
//   Owner -> sab | Manager -> sirf Cashier/Salesman
function resetUserPinSecure(userId, username) {

    // API availability check — purani app session par clear message
    if (!window.electronAPI ||
        typeof window.electronAPI.resetUserPinSecure !== "function") {
        alert(
            "Reset password API is not available.\n\n" +
            "Please fully quit (File > Quit or close the window) " +
            "and try again."
        );
        return;
    }

    const body = `
        <p style="margin:0 0 14px; font-size:13px; color:#475569;">
            Resetting password for: <b>${escapeHTML(username)}</b>
            (the old password will become invalid immediately)
        </p>
        ${formField("rstPin1", "New Password (min 6, letters + numbers)", { type: "password", placeholder: "••••••" })}
        ${formField("rstPin2", "Confirm New Password", { type: "password", placeholder: "••••••" })}
    `;

    showFormModal(`Reset Password — ${username}`, body, "Reset Password", async () => {

        const newPin =
            document.getElementById("rstPin1")?.value || "";
        const confirmPin =
            document.getElementById("rstPin2")?.value || "";

        if (newPin.length < 6 || !/[a-zA-Z]/.test(newPin) ||
            !/\d/.test(newPin)) {
            return "New password must be at least 6 characters and " +
                   "contain both letters and numbers.";
        }
        if (newPin !== confirmPin) {
            return "New passwords do not match.";
        }

        const result =
            await window.electronAPI.resetUserPinSecure({
                user_id: userId,
                new_password: newPin
            });

        if (!result?.success) {
            return result?.error || "Reset failed.";
        }

        showToast(`${username}'s password has been reset.`, "success");
        return true;

    });
}

async function removeUser(userId) {

    if (!await showAppConfirm("Delete this user permanently?", { title: "Delete User", confirmText: "Delete" })) return;
    if (!await verifyDeleteSystemFunctionPassword("deleting this user")) return;

    try {

        const result =
            await window.electronAPI.deleteUser(userId);

        if (!result?.success) {
            alert(result?.error || "Failed to delete user.");
            return;
        }

        showToast("User deleted.", "success");
        await refreshUsersPanel();

    } catch (error) {
        console.error("Delete user error:", error);
        alert("Failed to delete user: " + error.message);
    }

}



// ======================================================
// AUDIT LOG VIEWER UI (PHASE 6)
// ======================================================

async function loadAuditLogView() {

    if (!apiReady("getAuditLog")) {
        alert("Audit log API is not available.");
        return;
    }

    const panel =
        document.getElementById("auditLogPanel");

    if (!panel) return;

    try {

        const result =
            await window.electronAPI.getAuditLog({
                from_date:
                    document.getElementById("auditFromDate")?.value || "",
                to_date:
                    document.getElementById("auditToDate")?.value || "",
                action:
                    document.getElementById("auditAction")?.value.trim() || "",
                limit: 200
            });

        const entries = result?.entries || [];

        if (!entries.length) {
            panel.innerHTML =
                "<p style='color:#888;'>No audit entries found for these filters.</p>";
            return;
        }

        let rows = "";

        for (const e of entries) {

            const when = String(e.created_at || "").replace("T", " ").slice(0, 19);

            let detail = "";
            try {
                const nv = e.new_value ? JSON.parse(e.new_value) : null;
                const ov = e.old_value ? JSON.parse(e.old_value) : null;
                detail = [ov, nv].filter(Boolean).map(v => JSON.stringify(v)).join(" -> ");
            } catch (err) {
                detail = e.new_value || "";
            }

            rows += `
                <tr>
                    <td style="padding:6px 8px; white-space:nowrap;">${esc(when)}</td>
                    <td style="padding:6px 8px;">${esc(e.username || "-")}</td>
                    <td style="padding:6px 8px;"><b>${esc(e.action)}</b></td>
                    <td style="padding:6px 8px;">${esc(e.entity_type || "-")}${e.entity_id ? " #" + e.entity_id : ""}</td>
                    <td style="padding:6px 8px; font-size:12px;">${esc(detail)}</td>
                </tr>
            `;

        }

        panel.innerHTML = `
            <table style="width:100%; border-collapse:collapse; font-size:13px;">
                <thead>
                    <tr style="background:#f0f4f0;">
                        <th style="text-align:left; padding:8px;">Date / Time</th>
                        <th style="text-align:left; padding:8px;">User</th>
                        <th style="text-align:left; padding:8px;">Action</th>
                        <th style="text-align:left; padding:8px;">Record</th>
                        <th style="text-align:left; padding:8px;">Details</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        `;

    } catch (error) {
        console.error("Audit log view error:", error);
        alert("Failed to load audit log: " + error.message);
    }

}

// ======================================================
// DAY CLOSING UI (PHASE 6)
// ======================================================

function moneyFmt(value) {
    return "Rs. " + (Number(value) || 0).toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
    });
}

async function loadDayCloseView() {

    if (!apiReady("getDayCloseSummary")) {
        alert("Day closing API is not available.");
        return;
    }

    const panel =
        document.getElementById("dayClosePanel");

    if (!panel) return;

    const date =
        document.getElementById("dayCloseDate")?.value ||
        new Date().toISOString().slice(0, 10);

    try {

        const result =
            await window.electronAPI.getDayCloseSummary({ date });

        if (!result?.success) {
            alert(result?.error || "Failed to load day summary.");
            return;
        }

        const s = result.summary;

        const closedBadge = s.closed
            ? `<span style="color:#27ae60; font-weight:bold;">Closed</span>`
            : `<span style="color:#e67e22; font-weight:bold;">Open</span>`;

        panel.innerHTML = `
            <table style="width:100%; max-width:600px; border-collapse:collapse; font-size:14px;">
                <tr><td style="padding:6px 8px;">Total Sales</td><td style="padding:6px 8px; text-align:right;"><b>${moneyFmt(s.total_sales)}</b></td></tr>
                <tr style="background:#fafcfa;"><td style="padding:6px 8px;">- Cash Sales</td><td style="padding:6px 8px; text-align:right;">${moneyFmt(s.cash_sales)}</td></tr>
                <tr><td style="padding:6px 8px;">- Bank Sales</td><td style="padding:6px 8px; text-align:right;">${moneyFmt(s.bank_sales)}</td></tr>
                <tr style="background:#fafcfa;"><td style="padding:6px 8px;">- Credit Sales</td><td style="padding:6px 8px; text-align:right;">${moneyFmt(s.credit_sales)}</td></tr>
                <tr><td style="padding:6px 8px;">Total Returns</td><td style="padding:6px 8px; text-align:right;">${moneyFmt(s.total_returns)}</td></tr>
                <tr style="background:#fafcfa;"><td style="padding:6px 8px;">Total Purchases</td><td style="padding:6px 8px; text-align:right;">${moneyFmt(s.total_purchases)}</td></tr>
                <tr><td style="padding:6px 8px;">Total Expenses</td><td style="padding:6px 8px; text-align:right;">${moneyFmt(s.total_expenses)}</td></tr>
                <tr style="background:#fafcfa;"><td style="padding:6px 8px;">Payments Received</td><td style="padding:6px 8px; text-align:right;">${moneyFmt(s.cash_received)}</td></tr>
            </table>

            <div style="margin-top:20px; display:flex; gap:10px; flex-wrap:wrap; align-items:end;">
                <div>
                    <label>Actual Counted Cash (Rs.)</label>
                    <input id="actualCashInput" type="number" step="0.01"
                        value="${s.close_record ? Number(s.close_record.actual_cash) : ""}"
                        placeholder="Count your cash drawer"
                        style="padding:10px; margin-top:5px; width:220px;">
                </div>
                <button id="closeDayButton" class="btn btn-sale">
                    ${s.closed ? "Update Day Close" : "Close Day"}
                </button>
                <span>Status: ${closedBadge}</span>
            </div>

            ${
                s.closed && s.close_record
                    ? `<div style="margin-top:15px; padding:12px; background:#f0f4f0; border-radius:8px; max-width:600px;">
                        Expected Cash: <b>${moneyFmt(s.close_record.expected_cash)}</b><br>
                        Actual Cash: <b>${moneyFmt(s.close_record.actual_cash)}</b><br>
                        Difference: <b style="color:${Math.abs(Number(s.close_record.cash_difference)) < 0.01 ? "#27ae60" : "#c0392b"};">
                            ${moneyFmt(s.close_record.cash_difference)}
                        </b>
                       </div>`
                    : ""
            }
        `;

        document
            .getElementById("closeDayButton")
            ?.addEventListener("click", () => submitDayClose(date));

    } catch (error) {
        console.error("Day close view error:", error);
        alert("Failed to load day summary: " + error.message);
    }

}

async function submitDayClose(date) {

    const actualCashRaw =
        document.getElementById("actualCashInput")?.value;

    const actualCash = Number(actualCashRaw);

    if (actualCashRaw === "" || isNaN(actualCash) || actualCash < 0) {
        alert("Please enter the actual counted cash amount.");
        return;
    }

    try {

        const result =
            await window.electronAPI.saveDayClose({
                business_date: date,
                actual_cash: actualCash
            });

        if (!result?.success) {
            alert(result?.error || "Failed to close day.");
            return;
        }

        const diff = result.difference || 0;

        alert(
            "Day closed successfully!\n\n" +
            "Expected Cash: Rs. " + Number(result.expected_cash).toFixed(2) + "\n" +
            "Difference: Rs. " + diff.toFixed(2) +
            (Math.abs(diff) > 0.01 ? "\n\nCash difference detected - please verify." : "")
        );

        await loadDayCloseView();

    } catch (error) {
        console.error("Submit day close error:", error);
        alert("Failed to close day: " + error.message);
    }

}

async function backupDatabase() {

    if (!apiReady("backupDatabase")) {

        alert("Backup API is not available.");
        return;

    }


    try {

        const result =
            await window.electronAPI.backupDatabase();


        if (result?.success) {

            alert("Database backup created successfully!");

        } else {

            alert(result?.error || "Backup failed.");

        }

    } catch (error) {

        console.error("Backup database error:", error);

        alert("Backup failed: " + error.message);

    }

}

// ======================================================
// RESTORE DATABASE
// ======================================================

async function restoreDatabase() {

    if (!apiReady("restoreDatabase")) {

        alert("Restore API is not available.");
        return;

    }


    const confirmed =
        await showAppConfirm("Restoring will replace current data. Continue?", { title: "Restore Database", confirmText: "Restore" });


    if (!confirmed) return;


    try {

        const result =
            await window.electronAPI.restoreDatabase();


        if (result?.success) {

            alert("Database restored! The app will restart.");

        } else {

            alert(result?.error || "Restore failed.");

        }

    } catch (error) {

        console.error("Restore database error:", error);

        alert("Restore failed: " + error.message);

    }

}

// ======================================================
// REFRESH DASHBOARD IF VISIBLE
// ======================================================

async function refreshDashboardIfVisible() {

    const activePage =
        document.querySelector(".menu-item.active");


    if (
        activePage &&
        activePage.dataset.page === "dashboard"
    ) {

        await loadDashboard();

    }

}

// ======================================================
// GLOBAL SEARCH
// ======================================================

let searchTimeout = null;

window.clearGlobalSearchTimer = function () {
    if (searchTimeout) {
        clearTimeout(searchTimeout);
        searchTimeout = null;
    }
};

async function handleGlobalSearch(query) {
    if (!apiReady("globalSearch")) {
        console.error("globalSearch API not available");
        return;
    }

    // Khali query par dropdown foran band karo
    const trimmed = String(query || "").trim();
    if (!trimmed) {
        window.clearGlobalSearchTimer?.();
        document.querySelector(".search-dropdown")?.remove();
        return;
    }

    // Clear previous timeout
    window.clearGlobalSearchTimer?.();

    // Debounce search
    searchTimeout = setTimeout(async () => {
        try {
            const result = await window.electronAPI.globalSearch(trimmed);
            renderSearchResults(result, trimmed);
        } catch (error) {
            console.error("Search error:", error);
        }
    }, 300);
}

function renderSearchResults(result, query) {
    const searchBox = document.getElementById("globalSearch");
    if (!searchBox) return;

    // Remove existing dropdown
    const existingDropdown = document.querySelector(".search-dropdown");
    if (existingDropdown) {
        existingDropdown.remove();
    }

    if (!result.success || !result.results) {
        return;
    }

    const { sales, purchases, parties, items } = result.results;
    const hasResults = sales.length || purchases.length || parties.length || items.length;

    // Create dropdown
    const dropdown = document.createElement("div");
    dropdown.className = "search-dropdown";

    if (!hasResults) {

        // Kuch na mila — saaf saaf batao
        dropdown.innerHTML = `
            <div class="search-empty">
                No results found for "${escapeHTML(String(query || ""))}"
            </div>
        `;

        const rect0 = searchBox.getBoundingClientRect();
        dropdown.style.top = `${rect0.bottom + 5}px`;
        dropdown.style.left = `${rect0.left}px`;
        dropdown.style.width = `${rect0.width}px`;

        document.body.appendChild(dropdown);

        setTimeout(() => {
            document.addEventListener("click", closeSearchDropdown);
        }, 0);

        return;
    }

    let html = "";

    // Sales
    if (sales.length) {
        html += `<div class="search-section">
            <div class="search-section-title">Sales</div>
            ${sales.map(s => `
                <div class="search-item" onclick="viewSale(${s.id})">
                    <div class="search-item-main">
                        <span class="search-item-name">${escapeHTML(s.invoice_no)}</span>
                        <span class="search-item-amount">${formatMoney(s.total)}</span>
                    </div>
                    <div class="search-item-sub">${escapeHTML(s.customer_name || s.party_name || 'Cash')}</div>
                </div>
            `).join('')}
        </div>`;
    }

    // Purchases
    if (purchases.length) {
        html += `<div class="search-section">
            <div class="search-section-title">Purchases</div>
            ${purchases.map(p => `
                <div class="search-item" onclick="viewPurchase(${p.id})">
                    <div class="search-item-main">
                        <span class="search-item-name">${escapeHTML(p.invoice_no)}</span>
                        <span class="search-item-amount">${formatMoney(p.total)}</span>
                    </div>
                    <div class="search-item-sub">${escapeHTML(p.party_name || 'Cash')}</div>
                </div>
            `).join('')}
        </div>`;
    }

    // Parties
    if (parties.length) {
        html += `<div class="search-section">
            <div class="search-section-title">Parties</div>
            ${parties.map(p => `
                <div class="search-item" onclick="viewParty(${p.id})">
                    <div class="search-item-main">
                        <span class="search-item-name">${escapeHTML(p.name)}</span>
                        <span class="search-item-type">${escapeHTML(p.type)}</span>
                    </div>
                    <div class="search-item-sub">${escapeHTML(p.phone || 'No phone')} &bull; Balance: ${formatMoney(p.balance)}</div>
                </div>
            `).join('')}
        </div>`;
    }

    // Items
    if (items.length) {
        html += `<div class="search-section">
            <div class="search-section-title">Items</div>
            ${items.map(i => `
                <div class="search-item" onclick="viewItem(${i.id})">
                    <div class="search-item-main">
                        <span class="search-item-name">${escapeHTML(i.name)}</span>
                        <span class="search-item-amount">${formatMoney(i.sale_price)}</span>
                    </div>
                    <div class="search-item-sub">Stock: ${i.stock} ${escapeHTML(i.unit)}</div>
                </div>
            `).join('')}
        </div>`;
    }

    dropdown.innerHTML = html;

    // Position dropdown
    const rect = searchBox.getBoundingClientRect();
    dropdown.style.top = `${rect.bottom + 5}px`;
    dropdown.style.left = `${rect.left}px`;
    dropdown.style.width = `${rect.width}px`;

    document.body.appendChild(dropdown);

    // Close on click outside
    setTimeout(() => {
        document.addEventListener("click", closeSearchDropdown);
    }, 0);
}

function closeSearchDropdown(e) {
    const dropdown = document.querySelector(".search-dropdown");
    if (dropdown && !e.target.closest(".search-dropdown") && e.target.id !== "globalSearch") {
        dropdown.remove();
        document.removeEventListener("click", closeSearchDropdown);
    }
}

// Initialize search
document.addEventListener("DOMContentLoaded", () => {
    const searchBox = document.getElementById("globalSearch");
    if (searchBox) {
        searchBox.addEventListener("input", debounce((e) => {
            handleGlobalSearch(e.target.value);
        }, 300));

        // Escape par dropdown band + input clear
        searchBox.addEventListener("keydown", (e) => {
            if (e.key === "Escape") {
                searchBox.value = "";
                document.querySelector(".search-dropdown")?.remove();
                searchBox.blur();
            }
        });
    }

    // Phase 6: login gate + permission-based menu
    initAuthGate();

    // Safety net: dashboard cards par ⋮ buttons (agar abhi tak
    // na lage hon to 1.5s baad dobara koshish)
    setTimeout(() => {
        if (typeof addDashboardCardMenus === "function") {
            addDashboardCardMenus();
        }
    }, 1500);
});


// ======================================================
// SEARCH RESULT OPENERS
// (search dropdown se seedha detail khulti hai)
// ======================================================

async function viewParty(partyId) {

    document.querySelector(".search-dropdown")?.remove();

    const searchBox = document.getElementById("globalSearch");
    if (searchBox) searchBox.value = "";

    navigateTo("parties");

    // Parties list load hone ke baad ledger khulo
    setTimeout(() => {
        if (typeof showLedger === "function") {
            showLedger(partyId);
        }
    }, 400);

}

function viewItem(itemId) {

    document.querySelector(".search-dropdown")?.remove();

    const searchBox = document.getElementById("globalSearch");
    if (searchBox) searchBox.value = "";

    navigateTo("items");

    // Items page render hone ke baad edit form khulo
    setTimeout(() => {
        if (typeof editItem === "function") {
            editItem(itemId);
        }
    }, 400);

}


// ======================================================
// COMING SOON PLACEHOLDERS (for backward compat)
// ======================================================

function showExpensesComingSoon() {
    showExpenses();
}

function showCashBankComingSoon() {
    showCashBank();
}

function showReportsComingSoon() {
    showReports();
}

function showSettingsComingSoon() {
    showSettings();
}

// ======================================================
// EXCEL (CSV) EXPORT / IMPORT — Parties & Items
// CSV files Excel me directly khulti hain. Import me
// duplicate rows skip hoti hain (naam + type match).
// ======================================================

let currentPartyType = "Customer";

function downloadCSV(filename, rows) {

    const csv = rows
        .map(row => row.map(cell => {

            const value = String(cell ?? "");

            return /[",\n]/.test(value)
                ? '"' + value.replace(/"/g, '""') + '"'
                : value;

        }).join(","))
        .join("\r\n");

    // BOM: Excel me Urdu/Unicode text sahi khule
    const blob = new Blob(
        ["\uFEFF" + csv],
        { type: "text/csv;charset=utf-8;" }
    );

    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

}

// ======================================================
// ITEM UNITS — Karyana shop units (shared list)
// Add Item aur Edit Item dono forms isi se dropdown
// banate hain. Naya unit add karna ho to sirf yahan
// add karein.
// ======================================================

const ITEM_UNITS = [
    "Pieces",
    "Kg",
    "Gram",
    "Liter",
    "Milliliter",
    "Dozen",
    "Packet",
    "Box",
    "Bag",
    "Bottle",
    "Can",
    "Carton",
    "Tin",
    "Roll",
    "Bundle",
    "Pair",
    "Set",
    "Meter"
];

function unitOptionsHTML(selectedUnit) {

    const selected = String(selectedUnit || "").trim().toLowerCase();

    // Agar saved unit list me nahi hai (purana/custom unit)
    // to usay bhi shamil kar do taake update par kho na jaye
    const units = [...ITEM_UNITS];
    if (selected && !units.some(u => u.toLowerCase() === selected)) {
        units.unshift(String(selectedUnit).trim());
    }

    return units.map(unit => `
                        <option
                            value="${escapeHTML(unit)}"
                            ${unit.toLowerCase() === selected ? "selected" : ""}
                        >
                            ${escapeHTML(unit)}
                        </option>
                    `).join("");

}


function parseCSVText(text) {

    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {

        const ch = text[i];

        if (inQuotes) {

            if (ch === '"') {
                if (text[i + 1] === '"') {
                    field += '"';
                    i++;
                } else {
                    inQuotes = false;
                }
            } else {
                field += ch;
            }

        } else if (ch === '"') {
            inQuotes = true;

        } else if (ch === ",") {
            row.push(field);
            field = "";

        } else if (ch === "\n") {
            row.push(field);
            rows.push(row);
            row = [];
            field = "";

        } else if (ch !== "\r") {
            field += ch;
        }

    }

    if (field !== "" || row.length) {
        row.push(field);
        rows.push(row);
    }

    // Bilkul khali rows hata do
    return rows.filter(r =>
        r.some(c => String(c).trim() !== "")
    );

}


// ---------------- SPREADSHEET READER (CSV + XLSX/XLS) ----------------

async function readSpreadsheetRows(file) {

    const isExcel = /\.(xlsx|xls)$/i.test(file.name);

    if (!isExcel) {

        // Plain text file — CSV ke tor par parho
        const text = await file.text();

        // ZIP/binary content detect karo (XLSX asal me ZIP hoti hai)
        const sample = text.slice(0, 2000);
        if (/^PK\u0003\u0004/.test(text) || /[\u0000-\u0008\u000E-\u001F]/.test(sample)) {
            throw new Error(
                "This file looks like a corrupted or binary Excel file. " +
                "Please save it from Excel as 'CSV (Comma delimited)' and try again."
            );
        }

        return parseCSVText(text.replace(/^\uFEFF/, ""));

    }

    if (typeof XLSX === "undefined") {
        throw new Error("Excel parser (SheetJS) is not loaded.");
    }

    const buf = await file.arrayBuffer();

    const wb = XLSX.read(buf, { type: "array" });

    const ws = wb.Sheets[wb.SheetNames[0]];

    // header:1 => array of arrays; raw:false => formatted values
    return XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" });

}


// ---------------- PARTIES EXPORT ----------------

async function exportParties() {

    if (!apiReady("getParties")) {
        alert("Get parties API is not available.");
        return;
    }


    try {

        const parties =
            await window.electronAPI.getParties();

        const list = (Array.isArray(parties) ? parties : [])
            .filter(p =>
                String(p.type || "").toLowerCase()
                === String(currentPartyType).toLowerCase()
            );


        const prefix =
            currentPartyType.toLowerCase().startsWith("sup")
                ? "suppliers"
                : "customers";


        downloadCSV(
            `${prefix}-${new Date().toISOString().slice(0, 10)}.csv`,
            [
                ["Code", "Name", "Phone", "Email", "Address", "Type", "Balance"],
                ...list.map(p => [
                    p.party_code || "",
                    p.name || "",
                    p.phone || "",
                    p.email || "",
                    p.address || "",
                    p.type || currentPartyType,
                    Number(p.balance) || 0
                ])
            ]
        );

    } catch (error) {

        console.error("Export parties error:", error);
        alert("Failed to export: " + error.message);

    }

}


// ---------------- PARTIES IMPORT ----------------

function importPartiesFromFile(event) {

    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    if (!/\.(csv|xlsx|xls)$/i.test(file.name)) {
        alert("Please choose a CSV or Excel file (.csv / .xlsx / .xls).");
        return;
    }


    const reader = new FileReader();

    reader.onload = async () => {

        try {

            const rows = await readSpreadsheetRows(file);

            if (!rows.length) {
                alert("File is empty or has no data rows.");
                return;
            }

            if (!apiReady("saveParty")) {
                alert("Save party API is not available.");
                return;
            }


            // Header mapping (agar header row mojood ho)
            const header = rows[0].map(h =>
                String(h).trim().toLowerCase()
            );

            let startRow = 1;

            let col = {
                name: header.indexOf("name"),
                phone: header.indexOf("phone"),
                email: header.indexOf("email"),
                address: header.indexOf("address"),
                type: header.indexOf("type"),
                balance: header.indexOf("balance")
            };

            if (col.name === -1) {

                // Header nahi hai — default order assume karo:
                // Name, Phone, Email, Address, Type, Balance
                col = { name: 0, phone: 1, email: 2, address: 3, type: 4, balance: 5 };
                startRow = 0;

            }


            const existing =
                await window.electronAPI.getParties();

            const existingList =
                Array.isArray(existing) ? existing : [];

            let added = 0;
            let skipped = 0;
            let failed = 0;


            for (let r = startRow; r < rows.length; r++) {

                const row = rows[r];

                if (!row || !row.length) continue;

                const name =
                    String(row[col.name] ?? "").trim();

                if (!name) continue;


                const type =
                    col.type >= 0 &&
                    String(row[col.type] ?? "").trim()
                        ? String(row[col.type]).trim()
                        : currentPartyType;


                // Duplicate check: same naam + same type
                const dup = existingList.find(p =>
                    String(p.name || "").trim().toLowerCase()
                        === name.toLowerCase() &&
                    String(p.type || "").toLowerCase()
                        === type.toLowerCase()
                );

                if (dup) {
                    skipped++;
                    continue;
                }


                try {

                    const res =
                        await window.electronAPI.saveParty({

                            name,

                            phone: col.phone >= 0
                                ? String(row[col.phone] ?? "").trim()
                                : "",

                            email: col.email >= 0
                                ? String(row[col.email] ?? "").trim()
                                : "",

                            address: col.address >= 0
                                ? String(row[col.address] ?? "").trim()
                                : "",

                            type,

                            balance:
                                Number(col.balance >= 0 ? row[col.balance] : 0) || 0,

                            opening_balance: 0

                        });


                    if (res?.success) {
                        added++;
                        existingList.push({
                            id: res.id,
                            name,
                            type
                        });
                    } else {
                        failed++;
                    }

                } catch (rowError) {
                    console.error("Import row error:", rowError);
                    failed++;
                }

            }


            await loadParties(currentPartyType);


            alert(
                `Import finished!\n\n` +
                `Added: ${added}\n` +
                `Skipped (already exist): ${skipped}` +
                (failed ? `\nFailed: ${failed}` : "")
            );

        } catch (error) {

            console.error("Import parties error:", error);
            alert("Import failed: " + error.message);

        }

    };


    reader.readAsText(file);

}


// ---------------- ITEMS EXPORT ----------------

async function exportItems() {

    if (!apiReady("getItems")) {
        alert("Get items API is not available.");
        return;
    }


    try {

        const items =
            await window.electronAPI.getItems();

        const list =
            Array.isArray(items) ? items : [];


        downloadCSV(
            `items-${new Date().toISOString().slice(0, 10)}.csv`,
            [
                ["Code", "Name", "Barcode", "Category", "Unit", "Purchase Price", "Sale Price", "Stock", "Low Stock Limit", "Expiry Date", "Tax Rate"],
                ...list.map(i => [
                    i.item_code || "",
                    i.name || "",
                    i.barcode || "",
                    i.category || "",
                    i.unit || "",
                    Number(i.purchase_price) || 0,
                    Number(i.sale_price) || 0,
                    Number(i.stock) || 0,
                    Number(i.low_stock_limit) || 5,
                    i.expiry_date || "",
                    Number(i.tax_rate) || 0
                ])
            ]
        );

    } catch (error) {

        console.error("Export items error:", error);
        alert("Failed to export: " + error.message);

    }

}


// ---------------- ITEMS IMPORT ----------------

function importItemsFromFile(event) {

    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    if (!/\.(csv|xlsx|xls)$/i.test(file.name)) {
        alert("Please choose a CSV or Excel file (.csv / .xlsx / .xls).");
        return;
    }


    const reader = new FileReader();

    reader.onload = async () => {

        try {

            const rows = await readSpreadsheetRows(file);

            if (!rows.length) {
                alert("File is empty.");
                return;
            }

            if (!apiReady("saveItem")) {
                alert("Save item API is not available.");
                return;
            }


            // Header mapping (agar header row mojood ho)
            const header = rows[0].map(h =>
                String(h).trim().toLowerCase()
            );

            let startRow = 1;

            let col = {
                name: header.indexOf("name"),
                category: header.indexOf("category"),
                barcode: header.indexOf("barcode"),
                unit: header.indexOf("unit"),
                purchase_price: header.indexOf("purchase price"),
                sale_price: header.indexOf("sale price"),
                stock: header.indexOf("stock"),
                low_stock_limit: header.indexOf("low stock limit"),
                expiry_date: header.indexOf("expiry date"),
                tax_rate: header.indexOf("tax rate")
            };

            if (col.name === -1) {

                // Header nahi — default order:
                // Name, Category, Unit, Purchase Price, Sale Price, Stock
                col = {
                    name: 0,
                    category: 1,
                    barcode: -1,
                    unit: 2,
                    purchase_price: 3,
                    sale_price: 4,
                    stock: 5,
                    low_stock_limit: -1,
                    expiry_date: -1,
                    tax_rate: -1
                };

                startRow = 0;

            }


            const existing =
                await window.electronAPI.getItems();

            const existingList =
                Array.isArray(existing) ? existing : [];

            let added = 0;
            let skipped = 0;
            let failed = 0;


            for (let r = startRow; r < rows.length; r++) {

                const row = rows[r];

                if (!row || !row.length) continue;

                const name =
                    String(row[col.name] ?? "").trim();

                if (!name) continue;


                // Duplicate check by name
                const dup = existingList.find(i =>
                    String(i.name || "").trim().toLowerCase()
                    === name.toLowerCase()
                );

                if (dup) {
                    skipped++;
                    continue;
                }


                try {

                    const res =
                        await window.electronAPI.saveItem({

                            name,

                            category: col.category >= 0
                                ? String(row[col.category] ?? "").trim()
                                : "",

                            barcode: col.barcode >= 0
                                ? String(row[col.barcode] ?? "").trim()
                                : "",

                            unit: col.unit >= 0
                                ? String(row[col.unit] ?? "").trim() || "Pieces"
                                : "Pieces",

                            purchase_price:
                                Number(col.purchase_price >= 0 ? row[col.purchase_price] : 0) || 0,

                            sale_price:
                                Number(col.sale_price >= 0 ? row[col.sale_price] : 0) || 0,

                            stock:
                                Number(col.stock >= 0 ? row[col.stock] : 0) || 0,

                            low_stock_limit:
                                Number(col.low_stock_limit >= 0 ? row[col.low_stock_limit] : 5) || 5,

                            expiry_date: col.expiry_date >= 0
                                ? String(row[col.expiry_date] ?? "").trim()
                                : "",

                            tax_rate:
                                Number(col.tax_rate >= 0 ? row[col.tax_rate] : 0) || 0

                        });


                    if (res?.success) {
                        added++;
                        existingList.push({
                            id: res.id,
                            name
                        });
                    } else {
                        failed++;
                    }

                } catch (rowError) {
                    console.error("Import item row error:", rowError);
                    failed++;
                }

            }


            await loadItems();


            alert(
                `Import finished!\n\n` +
                `Added: ${added}\n` +
                `Skipped (already exist): ${skipped}` +
                (failed ? `\nFailed: ${failed}` : "")
            );

        } catch (error) {

            console.error("Import items error:", error);
            alert("Import failed: " + error.message);

        }

    };


    reader.readAsText(file);

}

// ======================================================
// AUTH GATE + PERMISSION MENU (PHASE 6)
// Agar users mojood hain aur koi logged-in nahi to
// login overlay dikhta hai. Menu items permission ke
// mutabiq chhupe/dikhte hain.
// ======================================================

// page -> required permission mapping
const PAGE_PERMISSIONS = {
    dashboard: null,
    parties: "view_customers",
    items: "manage_products",
    sales: "view_sales",
    pos: "create_sale",
    purchase: "view_purchase",
    expenses: "manage_expenses",
    cashbank: "view_cash",
    reports: "view_reports",
    settings: "settings"
};

// ======================================================
// ADVANCED ITEM EDITOR
// ======================================================

function itemField(label, id, type = "text", value = "", extra = "") {
    const safeValue = type === "text" || type === "date" ? escapeHTML(value) : Number(value || 0);
    return `<label style="display:block;">${label}<input id="${id}" type="${type}" value="${safeValue}" ${extra} style="width:100%;padding:10px;margin-top:6px;"></label>`;
}

function renderAdvancedItemEditor(item = {}, editing = false) {
    const baseUnit = String(item.unit || "Pieces");
    const alternateUnit = String(item.alternate_unit || "");
    const hasAlternate = Boolean(alternateUnit);
    const stock = Number(item.stock || 0);

    return `
        <div class="page-title"><h1>${editing ? "Edit Item" : "Add Item"}</h1><p>${editing ? "Update your product information." : "Add a new product to your inventory."}</p></div>
        <div class="panel">
            <div class="panel-header"><h3>${editing ? "Edit Item" : "New Item"}</h3></div>
            <div style="padding:22px;display:grid;gap:18px;">
                <section><h4 style="margin:0 0 12px;color:#166534;">General Info</h4><div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;">
                    ${itemField("Item Name", "itemName", "text", item.name || "", "placeholder=\"Enter item name\" required")}
                    ${itemField("Category", "itemCategory", "text", item.category || "", "placeholder=\"e.g. Grocery, Pharmacy\"")}
                    ${itemField("Barcode / SKU", "itemBarcode", "text", item.barcode || "", "placeholder=\"Scan or enter barcode\"")}
                    ${itemField("Brand", "itemBrand", "text", item.brand || "", "placeholder=\"Optional\"")}
                </div></section>
                <section><h4 style="margin:0 0 12px;color:#166534;">Units &amp; Conversion</h4><div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;">
                    <label>Base Unit<select id="itemUnit" style="width:100%;padding:10px;margin-top:6px;">${unitOptionsHTML(baseUnit)}</select></label>
                    <label>Alternate Unit<select id="alternateUnit" style="width:100%;padding:10px;margin-top:6px;"><option value="">No alternate unit</option>${unitOptionsHTML(alternateUnit, true)}</select></label>
                    <div id="conversionField" style="grid-column:1/-1;display:${hasAlternate ? "block" : "none"};"><label><span id="conversionLabel">1 ${escapeHTML(baseUnit)} =</span><input id="conversionRate" type="number" min="0.000001" step="any" value="${Number(item.conversion_rate || 1)}" style="width:150px;padding:10px;margin:0 6px;"><span id="conversionUnit">${escapeHTML(alternateUnit)}</span></label></div>
                </div></section>
                <section><h4 style="margin:0 0 12px;color:#166534;">Pricing &amp; Taxes</h4><div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px;">
                    ${itemField("Purchase Price", "purchasePrice", "number", item.purchase_price, "min=\"0\" step=\"any\"")}
                    ${itemField("Sale (Retail) Price", "itemSalePrice", "number", item.sale_price, "min=\"0\" step=\"any\"")}
                    ${itemField("Wholesale Price", "itemWholesalePrice", "number", item.wholesale_price, "min=\"0\" step=\"any\"")}
                    ${itemField("MRP", "itemMrp", "number", item.mrp, "min=\"0\" step=\"any\"")}
                    ${itemField("Tax Rate (%)", "itemTaxRate", "number", item.tax_rate, "min=\"0\" max=\"100\" step=\"any\"")}
                    <label>Pricing Mode<select id="taxInclusive" style="width:100%;padding:10px;margin-top:6px;"><option value="0" ${!item.tax_inclusive ? "selected" : ""}>Tax Exclusive</option><option value="1" ${item.tax_inclusive ? "selected" : ""}>Tax Inclusive</option></select></label>
                </div></section>
                <section><h4 style="margin:0 0 12px;color:#166534;">Stock Details</h4><div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px;">
                    ${editing ? `<label>Current Stock<div style="padding:10px;margin-top:6px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;font-weight:700;">${stock} ${escapeHTML(baseUnit)}</div></label>` : itemField("Opening Stock", "itemStock", "number", item.stock, "min=\"0\" step=\"any\"")}
                    ${itemField("Minimum / Low Stock", "lowStockLimit", "number", item.low_stock_limit === undefined ? 5 : item.low_stock_limit, "min=\"0\" step=\"any\"")}
                    ${itemField("Location / Shelf", "itemLocation", "text", item.item_location || "", "placeholder=\"e.g. Shelf A1\"")}
                    ${itemField("Expiry Date", "itemExpiryDate", "date", item.expiry_date || "")}
                </div></section>
            </div>
            <div style="padding:0 22px 22px;display:flex;gap:10px;"><button type="button" id="${editing ? "updateItemButton" : "saveItemButton"}" class="btn btn-sale">${editing ? "Update Item" : "Save Item"}</button><button type="button" id="${editing ? "cancelEditItemButton" : "cancelItemButton"}" class="btn">Cancel</button></div>
        </div>`;
}

function setupItemBarcodeLookup() {
    const input = document.getElementById("itemBarcode");
    if (!input || input.dataset.lookupReady === "true") return;

    input.dataset.lookupReady = "true";
    input.addEventListener("keydown", async event => {
        if (event.key !== "Enter") return;

        const barcode = input.value.trim();
        if (!barcode || !apiReady("lookupProductByBarcode")) return;

        event.preventDefault();
        if (input.dataset.lookupPending === "true") return;
        input.dataset.lookupPending = "true";

        try {
            const result = await window.electronAPI.lookupProductByBarcode(barcode);
            if (!result?.success || !result.item) {
                showToast(result?.error || "Product not found.", "warning");
                return;
            }

            const item = result.item;
            const fields = {
                itemName: item.name || "",
                itemCategory: item.category || item.category_name || "",
                itemUnit: item.unit || "Pieces",
                purchasePrice: Number(item.purchase_price) || 0,
                itemSalePrice: Number(item.sale_price) || 0,
                itemWholesalePrice: Number(item.wholesale_price) || 0,
                itemMrp: Number(item.mrp) || 0,
                itemExpiryDate: item.expiry_date || "",
                lowStockLimit: item.low_stock_limit ?? 5,
                itemTaxRate: Number(item.tax_rate) || 0,
                itemLocation: item.item_location || ""
            };

            Object.entries(fields).forEach(([id, value]) => {
                const field = document.getElementById(id);
                if (field) field.value = String(value);
            });
            showToast("Item details filled from barcode.", "success");
        } catch (error) {
            console.error("Item barcode lookup error:", error);
            showToast("Barcode lookup failed: " + error.message, "error");
        } finally {
            input.dataset.lookupPending = "false";
        }
    });
}

function wireAdvancedUnitFields() {
    const base = document.getElementById("itemUnit");
    const alternate = document.getElementById("alternateUnit");
    const conversionField = document.getElementById("conversionField");
    const conversionLabel = document.getElementById("conversionLabel");
    const conversionUnit = document.getElementById("conversionUnit");
    const refresh = () => {
        const selectedAlternate = alternate?.value || "";
        conversionField.style.display = selectedAlternate ? "block" : "none";
        conversionLabel.textContent = `1 ${base?.value || "Base Unit"} =`;
        conversionUnit.textContent = selectedAlternate;
    };
    base?.addEventListener("change", refresh);
    alternate?.addEventListener("change", refresh);
    refresh();
}

function collectAdvancedItemFields(includeStock) {
    return {
        name: document.getElementById("itemName")?.value.trim() || "",
        category: document.getElementById("itemCategory")?.value.trim() || "",
        barcode: document.getElementById("itemBarcode")?.value.trim() || "",
        brand: document.getElementById("itemBrand")?.value.trim() || "",
        unit: document.getElementById("itemUnit")?.value || "Pieces",
        alternate_unit: document.getElementById("alternateUnit")?.value || "",
        conversion_rate: Number(document.getElementById("conversionRate")?.value) || 1,
        purchase_price: Number(document.getElementById("purchasePrice")?.value) || 0,
        sale_price: Number(document.getElementById("itemSalePrice")?.value) || 0,
        wholesale_price: Number(document.getElementById("itemWholesalePrice")?.value) || 0,
        mrp: Number(document.getElementById("itemMrp")?.value) || 0,
        tax_rate: Number(document.getElementById("itemTaxRate")?.value) || 0,
        tax_inclusive: document.getElementById("taxInclusive")?.value === "1",
        stock: includeStock ? Number(document.getElementById("itemStock")?.value) || 0 : undefined,
        low_stock_limit: Number(document.getElementById("lowStockLimit")?.value) || 5,
        item_location: document.getElementById("itemLocation")?.value.trim() || "",
        expiry_date: document.getElementById("itemExpiryDate")?.value || ""
    };
}

function addItem() {
    const content = document.querySelector(".content");
    if (!content) return;
    content.innerHTML = renderAdvancedItemEditor();
    wireAdvancedUnitFields();
    setupItemBarcodeLookup();
    document.getElementById("saveItemButton")?.addEventListener("click", async event => {
        const button = event.currentTarget;
        if (button.disabled) return;
        button.disabled = true;
        try { await saveItem(); } finally { button.disabled = false; }
    });
    document.getElementById("cancelItemButton")?.addEventListener("click", showItems);
}

async function saveItem() {
    const item = collectAdvancedItemFields(true);
    if (!item.name) return showToast("Please enter item name.");
    if ([item.purchase_price, item.sale_price, item.wholesale_price, item.mrp, item.stock].some(value => value < 0)) return showToast("Price and stock cannot be negative.");
    if (!apiReady("saveItem")) return showToast("Save Item API is not available yet.");
    const result = await window.electronAPI.saveItem(item);
    if (result?.success) { showToast("Item saved successfully!", "success"); deferBackgroundTask(() => refreshDashboardIfVisible()); }
    else showToast(result?.error || "Failed to save item.");
}

async function editItem(itemId) {
    const items = await window.electronAPI.getItems();
    const item = Array.isArray(items) ? items.find(entry => Number(entry.id) === Number(itemId)) : null;
    if (!item) return alert("Item not found.");
    const verified = await verifySystemFunctionPassword("editing this item");
    if (!verified) return;
    const content = document.querySelector(".content");
    if (!content) return;
    content.innerHTML = renderAdvancedItemEditor(item, true);
    wireAdvancedUnitFields();
    const updateButton = document.getElementById("updateItemButton");
    if (!updateButton) {
        showToast("Update Item button is unavailable.");
        return;
    }

    updateButton.onclick = async event => {
        event.preventDefault();
        event.stopPropagation();
        const button = event.currentTarget;
        if (button.disabled) return;
        button.disabled = true;
        try {
            await updateItem(item.id);
        } finally {
            if (button.isConnected) button.disabled = false;
        }
    };
    document.getElementById("cancelEditItemButton")?.addEventListener("click", showItems);
}

async function updateItem(itemId) {
    const item = collectAdvancedItemFields(false);
    item.id = Number(itemId);
    if (!item.name) return showToast("Please enter item name.");
    if ([item.purchase_price, item.sale_price, item.wholesale_price, item.mrp].some(value => value < 0)) return showToast("Price cannot be negative.");
    if (!apiReady("updateItem")) return showToast("Update Item API is not available yet.");
    try {
        const result = await window.electronAPI.updateItem(item);
        if (result?.success) {
            clearTransientUi();
            showToast("Item updated successfully!", "success");
            deferBackgroundTask(() => refreshDashboardIfVisible());
            await showItems();
        } else {
            showToast(result?.error || "Failed to update item.");
        }
    } catch (error) {
        console.error("Update item error:", error);
        showToast("Failed to update item: " + error.message);
    }
}

let currentUserPermissions = null;

async function initAuthGate() {

    if (!apiReady("getCurrentUser")) {
        setDashboardAuthState(null);
        return;
    }

    let user = null;

    try {

        // 1) Saved session restore karo (restart par logged-in rehne ke liye)
        if (apiReady("restoreSession")) {
            const rs = await window.electronAPI
                .restoreSession().catch(() => null);
            if (rs?.success && rs.user) user = rs.user;
        }

        if (!user) {
            const cu = await window.electronAPI
                .getCurrentUser().catch(() => null);
            if (cu?.success && cu.user) user = cu.user;
        }

        if (user) {
            await syncActiveBusinessContext();
            currentUserPermissions =
                user.permissions || {};
            window.pakkhattaRole = String(user.role || "cashier").toLowerCase();
            applyMenuPermissions();
            updateLoggedInUserBadge(user);
            return;
        }

        // 2) Koi session nahi — Owner account exists?
        if (!apiReady("checkAccountExists")) {
            // Purani API fallback: users mojood hon to login dikhao
            const usersResult =
                await window.electronAPI.getUsers();
            const userCount =
                (usersResult?.users || [])
                    .filter(u => Number(u.active)).length;

            if (userCount > 0) {
                showLoginOverlay();
            }
            return;
        }

        const existsResult =
            await window.electronAPI.checkAccountExists();

        if (!existsResult?.success) {
            showLoginOverlay();
            return;
        }

        // 3) Always show Create Account first (primary action), login as secondary
        showSetupWizard();

    } catch (error) {
        console.error("Auth gate error:", error);
    } finally {
        setDashboardAuthState(user);
    }

}

// Navigation guard: unauthorized page direct open na ho sake
window.pakkhattaCanAccessPage = function (page) {

    if (!currentUserPermissions) return true;

    const perm = Object.prototype.hasOwnProperty
        .call(PAGE_PERMISSIONS, page)
        ? PAGE_PERMISSIONS[page]
        : null;

    // Unknown page => default allowed (dashboard)
    return !perm || !!currentUserPermissions[perm];

};

function applyMenuPermissions() {

    if (!currentUserPermissions) {
        // No session & no restriction info -> show everything
        return;
    }

    document
        .querySelectorAll(".menu-item[data-page]")
        .forEach(item => {

            const page = item.dataset.page;
            const perm = PAGE_PERMISSIONS[page];

            // null permission = sab ke liye allowed (dashboard)
            if (!perm || currentUserPermissions[perm]) {
                item.style.display = "";
            } else {
                item.style.display = "none";
            }

        });

}

function updateLoggedInUserBadge(user) {

    let badge =
        document.getElementById("loggedInUserBadge");

    const topbar = document.querySelector(".topbar");

    if (!badge) {

        badge = document.createElement("div");
        badge.id = "loggedInUserBadge";
        badge.style.cssText = [
            "display:flex", "align-items:center", "gap:10px",
            "margin-left:auto", "flex-shrink:0", "white-space:nowrap",
            "padding:6px 12px", "border-radius:10px",
            "background:rgba(15,23,42,0.06)",
            "border:1px solid rgba(226,232,240,0.9)",
            "font-size:13px", "color:#0f172a"
        ].join(";");

        if (topbar) {
            topbar.appendChild(badge);
        } else {
            document.body.appendChild(badge);
        }

    }

    badge.innerHTML =
        `<span style="display:inline-flex;align-items:center;gap:6px;">` +
        `👤 ${escapeHTML(user.full_name || user.username)} ` +
        `<span style="font-size:11px;color:#64748b;">` +
        `(${escapeHTML(String(user.role).toUpperCase())})</span></span>` +
        `<a href="#" id="logoutLink" ` +
        `style="color:#dc2626;font-weight:600;text-decoration:none;` +
        `padding-left:10px;border-left:1px solid #cbd5e1;">Logout</a>`;

    document
        .getElementById("logoutLink")
        ?.addEventListener("click", async (e) => {

            e.preventDefault();

            await window.electronAPI.logout();

            location.reload();

        });

}

function showLoginOverlay() {

    // Pehle se mojood ho to dobara na banao
    if (document.getElementById("loginOverlay")) return;

    const overlay = document.createElement("div");
    overlay.id = "loginOverlay";

    overlay.style.cssText = [
        "position:fixed", "inset:0", "z-index:10000",
        "background:rgb(2,6,23)",
        "display:flex", "align-items:center", "justify-content:center"
    ].join(";");

    overlay.innerHTML = `
        <div style="
            background:#fff;
            border-radius:16px;
            padding:35px;
            width:340px;
            box-shadow:0 20px 60px rgba(0,0,0,0.4);
            text-align:center;
            border-top:4px solid #64748b;
        ">
            <h2 style="margin:0 0 5px; font-size:20px; color:#1e293b;">PakKhatta Login</h2>
            <p style="margin:0 0 22px; color:#64748b; font-size:13px;">
                Login to continue
            </p>

            <input id="loginPhone" type="text" placeholder="Phone Number (03XX-XXXXXXX)"
                autocomplete="username"
                style="width:100%; padding:11px; margin-bottom:10px;
                       border:1px solid #ccc; border-radius:8px;
                       box-sizing:border-box;">

            <input id="loginPassword" type="password" placeholder="Password"
                autocomplete="current-password"
                style="width:100%; padding:11px; margin-bottom:14px;
                       border:1px solid #ccc; border-radius:8px;
                       box-sizing:border-box;">

            <button id="loginButton" class="btn btn-sale"
                style="width:100%; padding:12px; font-size:14px; font-weight:600;">
                Login
            </button>

            <div style="margin-top:18px; padding-top:14px; border-top:1px solid #e2e8f0;">
                <span style="color:#64748b; font-size:12px;">Don't have an account?</span>
                <a href="#" id="loginCreateLink"
                    style="margin-left:4px; color:#16a34a; font-size:12px;
                           font-weight:600; text-decoration:none;">
                    Create Account
                </a>
            </div>

            <p id="loginError" style="color:#c0392b; font-size:12px;
                min-height:16px; margin:10px 0 0;"></p>
        </div>
    `;

    document.body.appendChild(overlay);

    // Phone input auto-format: 03XX-XXXXXXX
    document.getElementById("loginPhone")
        ?.addEventListener("input", formatPkPhoneInput);

    const attemptLogin = async () => {

        const identifier =
            document.getElementById("loginPhone")?.value.trim() || "";

        const password =
            document.getElementById("loginPassword")?.value.trim() || "";

        const errEl =
            document.getElementById("loginError");

        if (!identifier || !password) {
            errEl.textContent =
                "Phone number and password are required.";
            return;
        }

        try {

            const result =
                await window.electronAPI.login({ identifier, password });

            if (!result?.success) {
                errEl.textContent = result?.error || "Login failed.";
                return;
            }

            // Success — overlay hatao, menu filter lagao
            overlay.remove();

            currentUserPermissions =
                result.user.permissions || {};
            window.pakkhattaRole = String(result.user.role || "cashier").toLowerCase();

            applyMenuPermissions();
            updateLoggedInUserBadge(result.user);
            await syncActiveBusinessContext();
            setDashboardAuthState(result.user);
            await refreshDashboardIfVisible();

        } catch (error) {
            errEl.textContent = "Login failed: " + error.message;
        }

    };

    document
        .getElementById("loginButton")
        ?.addEventListener("click", attemptLogin);

    document
        .getElementById("loginCreateLink")
        ?.addEventListener("click", (e) => {
            e.preventDefault();
            overlay.remove();
            showSetupWizard();
        });

    const onEnter = (e) => {
        if (e.key === "Enter") attemptLogin();
    };

    document
        .getElementById("loginPhone")
        ?.addEventListener("keydown", onEnter);

    document
        .getElementById("loginPassword")
        ?.addEventListener("keydown", onEnter);

    document.getElementById("loginPhone")?.focus();

}

// ======================================================
// AUTH v2 SHARED HELPERS (setup / forgot-password flows)
// ======================================================

// Phone input ko live format karo: 03XX-XXXXXXX
function formatPkPhoneInput(e) {
    const el = e.target;

    // Save cursor position and old value
    const caretPos = el.selectionStart;
    const oldVal = el.value;
    const oldDigits = String(oldVal || "").replace(/\D/g, "");

    let digits = String(el.value || "")
        .replace(/\D/g, "").slice(0, 11);

    // +92/92/0092 prefix ko 0 me convert karo
    if (digits.startsWith("0092")) {
        digits = "0" + digits.slice(4);
    } else if (
        digits.startsWith("92") && digits.length >= 11) {
        digits = "0" + digits.slice(2);
    }

    const newVal = digits.length > 4
        ? digits.slice(0, 4) + "-" + digits.slice(4)
        : digits;

    // Only update if value actually changed (prevents cursor jumps)
    if (oldVal !== newVal) {
        el.value = newVal;

        // Restore cursor position intelligently
        const newDigits = newVal.replace(/\D/g, "");
        const digitDiff = newDigits.length - oldDigits.length;
        let newCaret = caretPos + digitDiff;

        // Adjust for dash insertion at position 4
        if (digits.length > 4 && caretPos >= 4) {
            newCaret = caretPos + 1;
        }

        // Clamp to valid range
        newCaret = Math.max(0, Math.min(newCaret, newVal.length));
        el.setSelectionRange(newCaret, newCaret);
    }
}

// Auth screens ka common fullscreen shell banata hai
function createAuthScreen(titleText, subtitleText) {

    const overlay = document.createElement("div");
    overlay.id = "authGateOverlay";
    overlay.style.cssText = [
        "position:fixed", "inset:0", "z-index:10000",
        "background:rgb(2,6,23)",
        "display:flex", "align-items:center", "justify-content:center"
    ].join(";");

    overlay.innerHTML = `
        <div style="
            background:#fff;
            border-radius:16px;
            padding:35px;
            width:360px;
            box-shadow:0 20px 60px rgba(0,0,0,0.4);
            text-align:center;
            border-top:4px solid #16a34a;
        ">
            <h2 style="margin:0 0 5px; font-size:20px; color:#1e293b;">${escapeHTML(titleText)}</h2>
            <p style="margin:0 0 22px; color:#64748b; font-size:13px;">
                ${escapeHTML(subtitleText)}
            </p>
            <div id="authScreenBody"></div>
            <p id="authScreenError" style="color:#c0392b; font-size:12px;
                min-height:16px; margin:10px 0 0;"></p>
        </div>
    `;

    document.body.appendChild(overlay);

    return {
        overlay,
        body: document.getElementById("authScreenBody"),
        errorEl: document.getElementById("authScreenError"),
        setError(msg) {
            if (this.errorEl) this.errorEl.textContent = msg || "";
        },
        destroy() {
            overlay.remove();
        }
    };

}

const AUTH_INPUT_STYLE = [
    "width:100%", "padding:11px", "margin-bottom:10px",
    "border:1px solid #ccc", "border-radius:8px",
    "box-sizing:border-box"
].join(";");

function authBtnHtml(id, label, extraClass) {
    return `<button id="${id}" class="btn ${extraClass || "btn-sale"}"
        style="width:100%; padding:12px; font-size:14px; font-weight:600;">${label}</button>`;
}

function authBackLinkHtml(id) {
    return `<a href="#" id="${id}" style="display:inline-block;
        margin-top:12px; color:#64748b; font-size:12px;
        text-decoration:none;">&larr; Back</a>`;
}

// OTP enter step (setup aur forgot dono me reuse hota hai)
function renderOtpStep(screen, opts) {

    const cooldown = Number(opts.cooldownSeconds) || 60;
    let waitLeft = opts.skipCooldown ? 0 : cooldown;

    screen.body.innerHTML = `
        <p style="font-size:12px; color:#475569; margin:0 0 10px;">
            A 6-digit verification code was sent to
            <b>${escapeHTML(opts.maskedPhone)}</b>.
        </p>

        <input id="otpInput" type="text" inputmode="numeric"
            maxlength="6" placeholder="Enter 6-digit OTP"
            style="${AUTH_INPUT_STYLE}; letter-spacing:6px;
                   text-align:center;">

        ${authBtnHtml("verifyOtpButton", opts.verifyLabel || "Verify OTP")}
        ${authBtnHtml("resendOtpButton", "Resend OTP", "btn")}

        ${opts.showBack ? authBackLinkHtml("otpBackLink") : ""}
        <p id="otpWaitNote" style="color:#94a3b8; font-size:11px;
            margin:8px 0 0;"></p>
    `;

    const otpInput = document.getElementById("otpInput");
    const resendBtn = document.getElementById("resendOtpButton");
    const waitNote = document.getElementById("otpWaitNote");

    let timerId = null;

    function tick() {

        if (waitLeft <= 0) {
            clearInterval(timerId);
            if (resendBtn) {
                resendBtn.disabled = false;
                resendBtn.style.opacity = "1";
            }
            if (waitNote) waitNote.textContent = "";
            return;
        }

        if (resendBtn) {
            resendBtn.disabled = true;
            resendBtn.style.opacity = "0.5";
        }
        if (waitNote) {
            waitNote.textContent =
                `You can request a new OTP in ${waitLeft}s.`;
        }
        waitLeft--;
    }

    tick();
    timerId = setInterval(tick, 1000);

    const submitVerify = async () => {

        const code = otpInput?.value.trim() || "";
        screen.setError("");

        try {
            await opts.onVerify(code, screen);
        } catch (error) {
            screen.setError("Verification failed: " + error.message);
        }
    };

    document.getElementById("verifyOtpButton")
        ?.addEventListener("click", submitVerify);

    otpInput?.addEventListener("keydown", (e) => {
        if (e.key === "Enter") submitVerify();
    });

    resendBtn?.addEventListener("click", async () => {

        screen.setError("");
        try {

            const result = await opts.onResend();

            if (!result?.success) {
                screen.setError(result?.error || "Could not resend OTP.");
                if (result?.retry_after) {
                    waitLeft = Math.max(Number(result.retry_after), 1);
                }
                return;
            }

            waitLeft = cooldown;
            otpInput.value = "";
            screen.setError("");

        } catch (error) {
            screen.setError("Resend failed: " + error.message);
        }
    });

    document.getElementById("otpBackLink")
        ?.addEventListener("click", (e) => {
            e.preventDefault();
            clearInterval(timerId);
            opts.onBack?.();
        });

    otpInput?.focus();
}

// ======================================================
// FIRST LAUNCH: CREATE YOUR PAKKHATTA ACCOUNT
// Flow: Full Name + Phone -> Send OTP -> Enter OTP ->
//       Verify -> Password -> Account Created
// ======================================================

function showSetupWizard() {

    if (!apiReady("createOwnerAccount")) {
        showLoginOverlay();
        return;
    }

    const screen =
        createAuthScreen("PakKhatta", "Create Your PakKhatta Account");

    const state = {
        fullName: "",
        phone: "",
        password: ""
    };

    // ---- STEP 1: Full Name + Phone -------------------
    function renderDetailsStep() {

        screen.body.innerHTML = `
            <input id="setupFullName" type="text"
                placeholder="Full Name" autocomplete="name"
                style="${AUTH_INPUT_STYLE}">

            <input id="setupPhone" type="text"
                placeholder="Phone Number (03XX-XXXXXXX)"
                autocomplete="tel" inputmode="numeric"
                style="${AUTH_INPUT_STYLE}">

            <input id="setupPassword" type="password"
                placeholder="Create Password (min 6, letters + numbers)"
                autocomplete="new-password"
                style="${AUTH_INPUT_STYLE}">

            <input id="setupPassword2" type="password"
                placeholder="Confirm Password" autocomplete="new-password"
                style="${AUTH_INPUT_STYLE}">

            <input id="setupFunctionPassword" type="password"
                placeholder="System Function Password (4-8 digits)"
                inputmode="numeric" autocomplete="off"
                style="${AUTH_INPUT_STYLE}">

            ${authBtnHtml("createAccountButton", "Create Account")}

            <div style="margin-top:18px; padding-top:14px; border-top:1px solid #e2e8f0;">
                <span style="color:#64748b; font-size:12px;">Already have an account?</span>
                <a href="#" id="setupLoginLink"
                    style="margin-left:4px; color:#2563eb; font-size:12px;
                           font-weight:600; text-decoration:none;">
                    Login here
                </a>
            </div>

            <p style="color:#94a3b8; font-size:11px; margin:10px 0 0;">
                PakKhatta works 100% offline. Keep your password safe.
            </p>
        `;

        document.getElementById("setupPhone")
            ?.addEventListener("input", formatPkPhoneInput);

        document.getElementById("setupLoginLink")
            ?.addEventListener("click", (e) => {
                e.preventDefault();
                screen.destroy();
                showLoginOverlay();
            });

        document.getElementById("createAccountButton")
            ?.addEventListener("click", async () => {

                state.fullName =
                    document.getElementById("setupFullName")?.value.trim() || "";
                state.phone =
                    document.getElementById("setupPhone")?.value.trim() || "";
                state.password =
                    document.getElementById("setupPassword")?.value || "";
                const confirm =
                    document.getElementById("setupPassword2")?.value || "";
                state.functionPassword =
                    document.getElementById("setupFunctionPassword")?.value.trim() || "";

                screen.setError("");

                if (!state.fullName) {
                    screen.setError("Full name is required.");
                    return;
                }
                if (!/^03\d{2}-\d{7}$/.test(state.phone)) {
                    screen.setError(
                        "Enter a valid Pakistani phone number " +
                        "(03XX-XXXXXXX).");
                    return;
                }

                if (!state.password || state.password !== confirm) {
                    screen.setError("Passwords must match.");
                    return;
                }

                if (!/^\d{4,8}$/.test(state.functionPassword)) {
                    screen.setError("System Function Password must be 4 to 8 digits only.");
                    return;
                }

                try {
                    const result = await window.electronAPI.createOwnerAccount({
                        full_name: state.fullName,
                        phone: state.phone,
                        password: state.password,
                        confirm_password: confirm,
                        function_password: state.functionPassword
                    });

                    if (!result?.success) {
                        screen.setError(result?.error || "Account creation failed.");
                        return;
                    }

                    screen.destroy();
                    showLoginOverlay();
                } catch (error) {
                    screen.setError("Account creation failed: " + error.message);
                }
            });

        document.getElementById("setupFullName")?.focus();
    }

    renderDetailsStep();
}

// ======================================================
// FORGOT PASSWORD FLOW
// Phone -> Send OTP -> Verify OTP -> New Password
// OTP verification ke baghair reset allow NAHI.
// ======================================================

function showForgotPasswordFlow() {

    if (!apiReady("forgotSendOtp")) {
        showLoginOverlay();
        return;
    }

    const screen =
        createAuthScreen("Forgot Password",
            "Reset your PakKhatta account password");

    const state = {
        phone: "",
        verifyToken: null
    };

    // ---- STEP 1: Phone number -------------------------
    function renderPhoneStep() {

        screen.body.innerHTML = `
            <input id="forgotPhone" type="text"
                placeholder="Phone Number (03XX-XXXXXXX)"
                autocomplete="tel" inputmode="numeric"
                style="${AUTH_INPUT_STYLE}">

            ${authBtnHtml("sendResetOtpButton", "Send OTP")}

            ${authBackLinkHtml("backToLoginLink")}
        `;

        document.getElementById("forgotPhone")
            ?.addEventListener("input", formatPkPhoneInput);

        document.getElementById("sendResetOtpButton")
            ?.addEventListener("click", async () => {

                state.phone =
                    document.getElementById("forgotPhone")?.value.trim() || "";

                screen.setError("");

                if (!/^03\d{2}-\d{7}$/.test(state.phone)) {
                    screen.setError(
                        "Enter a valid Pakistani phone number " +
                        "(03XX-XXXXXXX).");
                    return;
                }

                try {
                    const result =
                        await window.electronAPI.forgotSendOtp({
                            phone: state.phone
                        });

                    if (!result?.success) {
                        screen.setError(
                            result?.error || "Could not send OTP.");
                        return;
                    }

                    openResetOtpStep(false);

                } catch (error) {
                    screen.setError("Failed to send OTP: " + error.message);
                }
            });

        document.getElementById("backToLoginLink")
            ?.addEventListener("click", (e) => {
                e.preventDefault();
                screen.destroy();
                showLoginOverlay();
            });

        document.getElementById("forgotPhone")?.focus();
    }

    // ---- STEP 2: OTP verify ---------------------------
    function openResetOtpStep(skipCooldown) {

        renderOtpStep(screen, {
            maskedPhone: state.phone,
            showBack: true,
            skipCooldown,
            onBack: renderPhoneStep,
            onResend: () =>
                window.electronAPI.forgotSendOtp({ phone: state.phone }),
            onVerify: async (code) => {

                const verifyResult =
                    await window.electronAPI.verifyResetOtp({
                        phone: state.phone,
                        otp: code
                    });

                if (!verifyResult?.success) {
                    screen.setError(
                        verifyResult?.error ||
                        "OTP verification failed.");
                    return;
                }

                state.verifyToken = verifyResult.verify_token;

                renderNewPasswordStep();
            }
        });
    }

    // ---- STEP 3: New password -------------------------
    function renderNewPasswordStep() {

        screen.body.innerHTML = `
            <p style="font-size:12px; color:#16a34a; margin:0 0 12px;">
                ✔ OTP verified! Now set a new password.
            </p>

            <input id="newPassword" type="password"
                placeholder="New Password (min 6, letters + numbers)"
                autocomplete="new-password"
                style="${AUTH_INPUT_STYLE}">

            <input id="newPassword2" type="password"
                placeholder="Confirm New Password" autocomplete="new-password"
                style="${AUTH_INPUT_STYLE}">

            ${authBtnHtml("resetPasswordButton", "Change Password")}
        `;

        document.getElementById("resetPasswordButton")
            ?.addEventListener("click", async () => {

                const password =
                    document.getElementById("newPassword")?.value || "";
                const confirm =
                    document.getElementById("newPassword2")?.value || "";

                screen.setError("");

                if (password !== confirm) {
                    screen.setError("Passwords do not match.");
                    return;
                }

                try {
                    const result =
                        await window.electronAPI.completePasswordReset({
                            phone: state.phone,
                            password,
                            confirm_password: confirm,
                            verify_token: state.verifyToken
                        });

                    if (!result?.success) {
                        screen.setError(
                            result?.error || "Password reset failed.");
                        return;
                    }

                    alert(
                        "Password changed successfully. " +
                        "Please login with your new password.");

                    screen.destroy();
                    showLoginOverlay();

                } catch (error) {
                    screen.setError(
                        "Password reset failed: " + error.message);
                }
            });

        document.getElementById("newPassword")?.focus();
    }

    renderPhoneStep();
}

// ======================================================
// DASHBOARD CARD 3-DOTS DETAIL SYSTEM
// Har card par ⋮ button -> poori detail + actions.
// Actions existing accounting handlers use karte hain,
// isliye delete/receive/pay sab properly reverse hote hain.
// ======================================================

const CARD_MENU_MAP = {
    dashboardSales: "sales",
    dashboardReturns: "returns",
    dashboardBankTransfer: "transfers",
    dashboardPurchase: "purchases",
    dashboardReceive: "receivables",
    dashboardPay: "payables",
    dashboardStock: "stock",
    dashboardCash: "cash",
    dashboardBank: "bank-details",
    dashboardExpenses: "expenses"
};

const CARD_TITLES = {
    sales: "Today's Sales - Full Detail",
    returns: "Today's Returns - Full Detail",
    transfers: "Today's Bank Transfers - Full Detail",
    purchases: "Today's Purchases - Full Detail",
    receivables: "You'll Receive - Customers (Udhaar)",
    payables: "You'll Pay - Suppliers (Payable)",
    stock: "Stock Value - All Items",
    cash: "Cash in Hand - Cash Entries",
    banks: "Bank Balance - All Accounts",
    "bank-details": "Bank Transactions Detail",
    expenses: "This Month's Expenses - Full Detail"
};

function addDashboardCardMenus() {

    for (const [valueId, type] of Object.entries(CARD_MENU_MAP)) {

        const valueEl =
            document.getElementById(valueId);

        if (!valueEl) continue;

        const card = valueEl.closest(".card");

        if (!card || card.querySelector(".card-dots")) continue;

        // Card ko relative banao taake ⋮ corner mein baithe
        card.style.position = "relative";

        const btn = document.createElement("button");

        btn.className = "card-dots";
        btn.textContent = "⋮";
        btn.title = "Full detail & actions";
        btn.style.cssText = [
            "position:absolute", "top:8px", "right:10px",
            "background:transparent", "border:none",
            "font-size:20px", "line-height:1", "cursor:pointer",
            "color:#94a3b8", "padding:2px 6px", "border-radius:6px"
        ].join(";");

        btn.addEventListener("mouseenter", () => {
            btn.style.background = "#f1f5f9";
            btn.style.color = "#0f766e";
        });

        btn.addEventListener("mouseleave", () => {
            btn.style.background = "transparent";
            btn.style.color = "#94a3b8";
        });

        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            openCardDetail(type);
        });

        card.appendChild(btn);

    }

}

function closeCardDetail() {
    document.getElementById("cardDetailOverlay")?.remove();
}

async function openCardDetail(type) {

    window.__cardDetailType = type;

    if (!apiReady("getCardDetail")) {
        alert("Card detail API is not available.");
        return;
    }

    let result;

    try {
        result =
            await window.electronAPI.getCardDetail(type);
    } catch (error) {
        alert("Failed to load detail: " + error.message);
        return;
    }

    if (!result?.success) {
        alert(result?.error || "Failed to load detail.");
        return;
    }

    const rows = result.rows || [];

    // Purana overlay hatao
    closeCardDetail();

    const overlay = document.createElement("div");
    overlay.id = "cardDetailOverlay";

    overlay.style.cssText = [
        "position:fixed", "inset:0", "z-index:9500",
        "background:rgba(2,6,23,0.55)",
        "display:flex", "align-items:center", "justify-content:center"
    ].join(";");

    const bodyHtml = renderCardBody(type, rows);

    const canAdd =
        ["expenses", "banks"].includes(type)
            ? `<button class="btn btn-sale" onclick="cardAddNew('${type}')">+ Add New</button>`
            : "";

    overlay.innerHTML = `
        <div style="
            background:#fff; border-radius:14px;
            width:min(860px, 94vw); max-height:86vh;
            display:flex; flex-direction:column;
            box-shadow:0 20px 60px rgba(0,0,0,0.35);
            overflow:hidden;
        ">
            <div style="
                display:flex; align-items:center; justify-content:space-between;
                padding:14px 20px; background:#ecfdf5;
                border-bottom:1px solid #d1fae5;
            ">
                <h3 style="margin:0; font-size:15px; color:#0f766e;">
                    ${escapeHTML(CARD_TITLES[type] || type)}
                </h3>
                <div style="display:flex; gap:8px;">
                    ${canAdd}
                    <button class="btn" style="padding:6px 12px;"
                        onclick="closeCardDetail()">✕ Close</button>
                </div>
            </div>

            <div id="cardDetailBody"
                style="overflow:auto; padding:16px 20px;">
                ${bodyHtml}
            </div>
        </div>
    `;

    // Background click par band
    overlay.addEventListener("click", (e) => {
        if (e.target === overlay) closeCardDetail();
    });

    document.body.appendChild(overlay);

}

function renderCardBody(type, rows) {

    const th = (...cols) =>
        `<tr style="background:#f8fafc;">${cols.map(c =>
            `<th style="text-align:left; padding:7px 9px;
                border:1px solid #e2e8f0; font-size:12px;">${c}</th>`
        ).join("")}</tr>`;

    const td = (content) =>
        `<td style="padding:6px 9px; border:1px solid #eef2f7;
            font-size:12.5px;">${content}</td>`;

    const empty = (cols) => `
        <tr><td colspan="${cols}"
            style="padding:20px; text-align:center; color:#94a3b8;">
            No records found.
        </td></tr>`;

    const table = (headRows, bodyRows) => `
        <table style="width:100%; border-collapse:collapse;">
            <thead>${headRows}</thead>
            <tbody>${bodyRows}</tbody>
        </table>
    `;

    if (!rows.length && type !== "cash") {
        return table(th("Info"), empty(1));
    }

    // ---------------- SALES ----------------
    if (type === "sales") {
        return table(
            th("Invoice", "Customer", "Total", "Paid", "Due", "Method", "Action"),
            rows.map(r => `
                <tr>
                    ${td(`<b>${escapeHTML(r.invoice_no || "-")}</b>`)}
                    ${td(escapeHTML(r.customer || "Walk-in"))}
                    ${td(formatMoney(r.total))}
                    ${td(formatMoney(r.paid))}
                    ${td(formatMoney(r.due))}
                    ${td(escapeHTML(r.payment_method || "-"))}
                    ${td(`
                        <button class="btn" style="padding:4px 10px; font-size:11px;
                            background:#ffe5e5; color:#d93025;"
                            onclick="cardDeleteSale(${r.id}, '${escapeHTML(r.invoice_no || "")}')">
                            🗑 Delete
                        </button>
                    `)}
                </tr>
            `).join("") || empty(7)
        );
    }

    // ---------------- RETURNS ----------------
    if (type === "returns") {
        return table(
            th("Return No", "Invoice", "Customer", "Amount", "Refund Method", "Action"),
            rows.map(r => `
                <tr>
                    ${td(`<b>${escapeHTML(r.return_no || "-")}</b>`)}
                    ${td(escapeHTML(r.invoice_no || "-"))}
                    ${td(escapeHTML(r.customer || "-"))}
                    ${td(formatMoney(r.total))}
                    ${td(escapeHTML(r.payment_method || "-"))}
                    ${td(`
                        <button class="btn" style="padding:4px 10px; font-size:11px;
                            background:#fff7e6; color:#d97706;"
                            onclick="cardDeleteReturn(${r.id})">
                            ↩ Reverse Return
                        </button>
                    `)}
                </tr>
            `).join("") || empty(6)
        );
    }

    // ---------------- TRANSFERS ----------------
    if (type === "transfers") {
        return `
            <div class="tip" style="margin-bottom:10px;">
                A transfer is not income or expense — it only moves money between locations.
                To create a transfer: use the <b>Cash &amp; Bank</b> page.
            </div>
            ${table(
                th("Time", "Direction", "Amount", "Note"),
                rows.map(r => {
                    const dir = r.type === "transfer_in"
                        ? "Bank → Cash" : "Cash → Bank / Bank → Bank";
                    return `
                        <tr>
                            ${td(String(r.created_at || "").slice(11, 19))}
                            ${td(dir)}
                            ${td(`<b>${formatMoney(r.amount)}</b>`)}
                            ${td(escapeHTML(r.note || "-"))}
                        </tr>
                    `;
                }).join("") || empty(4)
            )}
        `;
    }

    // ---------------- PURCHASES ----------------
    if (type === "purchases") {
        return table(
            th("Bill No", "Supplier", "Total", "Paid", "Due", "Method", "Action"),
            rows.map(r => `
                <tr>
                    ${td(`<b>${escapeHTML(r.bill_no || "-")}</b>`)}
                    ${td(escapeHTML(r.supplier || "-"))}
                    ${td(formatMoney(r.total))}
                    ${td(formatMoney(r.paid))}
                    ${td(formatMoney(r.due))}
                    ${td(escapeHTML(r.payment_method || "-"))}
                    ${td(`
                        <button class="btn" style="padding:4px 10px; font-size:11px;
                            background:#ffe5e5; color:#d93025;"
                            onclick="cardDeletePurchase(${r.id}, '${escapeHTML(r.bill_no || "")}')">
                            🗑 Delete
                        </button>
                    `)}
                </tr>
            `).join("") || empty(7)
        );
    }

    const part2 = renderCardBodyPart2(type, rows, th, td, empty, table);
    if (part2) return part2;

    return `<p>No detail available.</p>`;

}

function cardRefresh() {
    // Modal refresh + dashboard values update
    const type =
        window.__cardDetailType;

    if (type) openCardDetail(type);

    loadDashboard();
}

function renderCardBodyPart2(type, rows, th, td, empty, table) {
    if (type === "bank-details") {
        return table(
            th("Date", "Reference", "Party / Description", "Type", "Inflow", "Outflow", "Net Amount"),
            rows.map(r => `
                <tr>
                    ${td(escapeHTML(formatDate(r.date)))}
                    ${td(escapeHTML(r.reference || "-"))}
                    ${td(escapeHTML(r.party || r.description || "-"))}
                    ${td(escapeHTML(r.transaction_type || "Bank Transaction"))}
                    ${td(Number(r.inflow || 0) > 0 ? formatMoney(r.inflow) : "-")}
                    ${td(Number(r.outflow || 0) > 0 ? formatMoney(r.outflow) : "-")}
                    ${td(`<b>${formatMoney(r.net_amount || 0)}</b>`)}
                </tr>
            `).join("") || empty(7)
        );
    }

    if (type === "receivables") {
        return table(
            th("Invoice", "Customer", "Sale Total", "Received", "Due / Remaining", "Method", "Date"),
            rows.map(r => `
                <tr>
                    ${td(`<b>${escapeHTML(r.invoice_no || "-")}</b>`)}
                    ${td(escapeHTML(r.customer || "Walk-in"))}
                    ${td(formatMoney(r.total))}
                    ${td(`<b>${formatMoney(r.paid)}</b>`)}
                    ${td(`<b>${formatMoney(r.due)}</b>`)}
                    ${td(escapeHTML(r.payment_method || "-"))}
                    ${td(escapeHTML(formatDate(r.created_at)))}
                </tr>
            `).join("") || empty(7)
        );
    }

    if (type === "payables") {

        return table(
            th("Code", "Supplier", "Phone", "Balance", "Action"),
            rows.map(r => `
                <tr>
                    ${td(escapeHTML(r.party_code || "-"))}
                    ${td(`<b>${escapeHTML(r.name)}</b>`)}
                    ${td(escapeHTML(r.phone || "-"))}
                    ${td(`<b>${formatMoney(r.balance)}</b>`)}
                    ${td(`
                        <button class="btn btn-sale" style="padding:4px 10px; font-size:11px;"
                            onclick="cardPartyPayment(${r.id}, '${escapeHTML(r.name)}',
                                ${r.balance}, '${type}')">
                            💵 Pay
                        </button>
                    `)}
                </tr>
            `).join("") || empty(5)
        );
    }

    // ---------------- STOCK ----------------
    if (type === "stock") {
        return table(
            th("Code", "Item", "Stock", "Unit", "Avg Cost", "Sale Price", "Value", "Action"),
            rows.map(r => `
                <tr>
                    ${td(escapeHTML(r.item_code || "-"))}
                    ${td(`<b>${escapeHTML(r.name)}</b>`)}
                    ${td(Number(r.stock).toLocaleString())}
                    ${td(escapeHTML(r.unit || "-"))}
                    ${td(formatMoney(r.cost))}
                    ${td(formatMoney(r.sale_price))}
                    ${td(formatMoney(r.value))}
                    ${td(`
                        <button class="btn btn-sale" style="padding:4px 10px; font-size:11px;"
                            onclick="cardAdjustStock(${r.id}, '${escapeHTML(r.name)}',
                                ${Number(r.stock) || 0})">
                            ⚖ Adjust
                        </button>
                    `)}
                </tr>
            `).join("")
        );
    }

    // ---------------- CASH ----------------
    if (type === "cash") {

        let totalIn = 0, totalOut = 0;

        const body = rows.map(r => {

            totalIn += Number(r.inflow) || 0;
            totalOut += Number(r.outflow) || 0;

            return `
                <tr>
                    ${td(String(r.created_at || "").slice(0, 10))}
                    ${td(escapeHTML(r.type || "-"))}
                    ${td(escapeHTML(r.ref || "-"))}
                    ${td(r.inflow ? `<b style="color:#0f766e;">${formatMoney(r.inflow)}</b>` : "-")}
                    ${td(r.outflow ? `<b style="color:#d93025;">${formatMoney(r.outflow)}</b>` : "-")}
                </tr>
            `;

        }).join("");

        return `
            <div style="display:flex; gap:14px; margin-bottom:12px; font-size:13px;">
                <span>Total In: <b style="color:#0f766e;">${formatMoney(totalIn)}</b></span>
                <span>Total Out: <b style="color:#d93025;">${formatMoney(totalOut)}</b></span>
                <span>(Aakhri ${rows.length} entries)</span>
            </div>
            ${table(
                th("Date", "Type", "Reference", "Inflow", "Outflow"),
                body || empty(5)
            )}
        `;
    }

    // ---------------- BANKS ----------------
    if (type === "banks") {
        return table(
            th("Bank", "Account No", "Opening", "Current Balance", "Action"),
            rows.map(r => `
                <tr>
                    ${td(`<b>${escapeHTML(r.bank_name)}</b>`)}
                    ${td(escapeHTML(r.account_number || "-"))}
                    ${td(formatMoney(r.opening_balance))}
                    ${td(`<b>${formatMoney(r.current_balance)}</b>`)}
                    ${td(`
                        <button class="btn" style="padding:4px 10px; font-size:11px;
                            background:#ffe5e5; color:#d93025;"
                            onclick="cardDeleteBank(${r.id}, '${escapeHTML(r.bank_name)}')">
                            🗑 Remove
                        </button>
                    `)}
                </tr>
            `).join("")
        );
    }

    // ---------------- EXPENSES ----------------
    if (type === "expenses") {
        return table(
            th("Date", "Category", "Detail", "Amount", "Method", "Action"),
            rows.map(r => `
                <tr>
                    ${td(String(r.created_at || "").slice(0, 10))}
                    ${td(escapeHTML(r.category || "-"))}
                    ${td(escapeHTML(r.name || "-"))}
                    ${td(`<b>${formatMoney(r.amount)}</b>`)}
                    ${td(escapeHTML(r.payment_method || "-"))}
                    ${td(`
                        <button class="btn" style="padding:4px 10px; font-size:11px;
                            background:#ffe5e5; color:#d93025;"
                            onclick="cardDeleteExpense(${r.id})">
                            🗑 Delete
                        </button>
                    `)}
                </tr>
            `).join("")
        );
    }

    return null;

}

// ======================================================
// CARD ACTIONS — sab existing accounting handlers use
// karte hain, isliye delete/receive/pay/adjust properly
// reverse aur adjust hote hain.
// ======================================================

async function cardDeleteSale(saleId, invoiceNo) {

    if (!await showAppConfirm(
        `Delete sale ${invoiceNo || "#" + saleId}?\n\n` +
        "Stock will be added back, and cash/bank/receivable will be reversed.\n" +
        "This action cannot be undone.",
        { title: "Delete Sale", confirmText: "Delete" }
    )) return;
    if (!await verifyDeleteSystemFunctionPassword("deleting this sale")) return;

    if (!apiReady("deleteSale")) {
        alert("Delete API is not available.");
        return;
    }

    try {

        const result =
            await window.electronAPI.deleteSale(saleId);

        if (!result?.success) {
            alert(result?.error || "Delete failed.");
            return;
        }

        alert("Sale deleted. Stock and payment have been reversed.");
        closeCardDetail();
        cardRefresh();

    } catch (error) {
        console.error("Card delete sale error:", error);
        alert("Failed: " + error.message);
    }

}

async function cardDeletePurchase(purchaseId, billNo) {

    if (!await showAppConfirm(
        `Delete purchase ${billNo || "#" + purchaseId}?\n\n` +
        "Stock will decrease and the Average Cost will be recalculated.\n" +
        "Cash, Bank and Payable will also be reversed.",
        { title: "Delete Purchase", confirmText: "Delete" }
    )) return;
    if (!await verifyDeleteSystemFunctionPassword("deleting this purchase")) return;

    if (!apiReady("deletePurchase")) {
        alert("Delete API is not available.");
        return;
    }

    try {

        const result =
            await window.electronAPI.deletePurchase(purchaseId);

        if (!result?.success) {
            alert(result?.error || "Delete failed.");
            return;
        }

        alert("Purchase deleted. Stock, average cost and payment have been reversed.");
        closeCardDetail();
        cardRefresh();

    } catch (error) {
        console.error("Card delete purchase error:", error);
        alert("Failed: " + error.message);
    }

}

async function cardDeleteReturn(returnId) {

    if (!await showAppConfirm(
        "Reverse this return?\n\n" +
        "The return will be deleted — stock will be reduced and " +
        "cash/refund will be adjusted (as if the return never happened).",
        { title: "Reverse Return", confirmText: "Reverse" }
    )) return;
    if (!await verifyDeleteSystemFunctionPassword("deleting this return")) return;

    if (!apiReady("deleteSaleReturn")) {
        alert("Reverse API is not available.");
        return;
    }

    try {

        const result =
            await window.electronAPI.deleteSaleReturn(returnId);

        if (!result?.success) {
            alert(result?.error || "Reverse failed.");
            return;
        }

        alert("Return reversed successfully.");
        closeCardDetail();
        cardRefresh();

    } catch (error) {
        console.error("Card reverse return error:", error);
        alert("Failed: " + error.message);
    }

}

async function cardDeleteExpense(expenseId) {

    if (!await showAppConfirm(
        "Delete this expense?\n\n" +
        "If it was a Cash expense, the cash balance will increase.",
        { title: "Delete Expense", confirmText: "Delete" }
    )) return;
    if (!await verifyDeleteSystemFunctionPassword("deleting this expense")) return;

    if (!apiReady("deleteExpense")) {
        alert("Delete API is not available.");
        return;
    }

    try {

        const result =
            await window.electronAPI.deleteExpense(expenseId);

        if (!result?.success) {
            alert(result?.error || "Delete failed.");
            return;
        }

        alert("Expense deleted, balance restored.");
        closeCardDetail();
        cardRefresh();

    } catch (error) {
        console.error("Card delete expense error:", error);
        alert("Failed: " + error.message);
    }

}

async function cardPartyPayment(
    partyId, partyName, balance, detailType
) {

    const isRecv = detailType === "receivables";

    if (!apiReady("savePayment")) {
        alert("Payment API is not available.");
        return;
    }

    const body = `
        <p style="margin:0 0 14px; font-size:13px; color:#475569;">
            ${escapeHTML(partyName)} — Balance:
            <b>${formatMoney(balance)}</b>
        </p>
        ${formField("payAmount", "Amount (Rs.)",
            { type: "number", value: balance })}
        ${formField("payMethod", "Method — Cash ya Bank", { type: "text", value: "Cash" })}
    `;

    showFormModal(
        isRecv ? `💵 Receive from ${partyName}` : `💵 Pay to ${partyName}`,
        body,
        isRecv ? "Receive" : "Pay",
        async () => {

            const amountRaw =
                document.getElementById("payAmount")?.value || "";

            const amount = Number(amountRaw);

            if (!amountRaw || isNaN(amount) || amount <= 0) {
                return "Please enter a valid amount.";
            }

            const methodRaw =
                document.getElementById("payMethod")?.value.trim() || "Cash";

            const paymentMethod =
                /^bank/i.test(methodRaw) ? "Bank" : "Cash";

            const result =
                await window.electronAPI.savePayment({
                    party_id: partyId,
                    type: isRecv ? "receive" : "pay",
                    amount,
                    payment_method: paymentMethod,
                    note: (isRecv ? "Received from " : "Paid to ") +
                          partyName + " (dashboard)"
                });

            if (!result?.success) {
                return result?.error || "Payment failed.";
            }

            alert(
                `${formatMoney(amount)} ${paymentMethod} par ` +
                (isRecv ? "received." : "paid.") +
                `\n${partyName}'s balance has been updated.`
            );

            closeCardDetail();
            loadDashboard();
            return true;

        }
    );
}

async function cardAdjustStock(itemId, itemName, currentStock) {

    if (!apiReady("adjustStock")) {
        alert("Adjust API is not available.");
        return;
    }

    const body = `
        <p style="margin:0 0 14px; font-size:13px; color:#475569;">
            Current stock: <b>${Number(currentStock).toLocaleString()}</b>
        </p>
        ${formField("adjStock", "New Stock Quantity",
            { type: "number", value: currentStock })}
        ${formField("adjReason", "Wajah (note)",
            { type: "text", value: "Dashboard adjustment" })}
    `;

    showFormModal(`⚖ Adjust Stock — ${itemName}`, body, "Adjust", async () => {

        const newStockRaw =
            document.getElementById("adjStock")?.value || "";

        const newStock = Number(newStockRaw);

        if (newStockRaw === "" ||
            isNaN(newStock) || newStock < 0) {
            return "Please enter a valid quantity.";
        }

        const reason =
            document.getElementById("adjReason")?.value.trim() ||
            "Dashboard adjustment";

        const result =
            await window.electronAPI.adjustStock({
                item_id: itemId,
                new_stock: newStock,
                note: reason
            });

        if (!result?.success) {
            return result?.error || "Adjustment failed.";
        }

        alert(
            `${itemName}: ${currentStock} -> ${newStock} adjusted.\n` +
                "Record saved to stock history."
        );

        closeCardDetail();
        loadDashboard();
        return true;

    });
}

async function cardDeleteBank(bankId, bankName) {

    if (!await showAppConfirm(
        `Remove bank account "${bankName}"?\n\n` +
        "Only remove it when there are no transactions on it.",
        { title: "Remove Bank Account", confirmText: "Remove" }
    )) return;
    if (!await verifyDeleteSystemFunctionPassword("deleting this bank account")) return;

    if (!apiReady("deleteBankAccount")) {
        alert("Remove API is not available.");
        return;
    }

    try {

        const result =
            await window.electronAPI.deleteBankAccount(bankId);

        if (!result?.success) {
            alert(result?.error || "Remove failed.");
            return;
        }

        alert("Bank account removed.");
        closeCardDetail();
        cardRefresh();

    } catch (error) {
        console.error("Card delete bank error:", error);
        alert("Failed: " + error.message);
    }

}

async function cardAddNew(type) {

    if (type === "expenses") {

        // Expense page khulwa do — wahan full form hai
        closeCardDetail();

        if (typeof navigateTo === "function") {
            navigateTo("expenses");
        }

        return;
    }

    if (type === "banks") {

        if (!apiReady("saveBankAccount")) {
            alert("API is not available.");
            return;
        }

        const body = `
            ${formField("bnkName", "Bank Name", { type: "text", placeholder: "e.g. HBL" })}
            ${formField("bnkAcc", "Account Number (optional)", { type: "text" })}
            ${formField("bnkOpen", "Opening Balance", { type: "number", value: 0 })}
        `;

        showFormModal("➕ Add Bank Account", body, "Add Bank", async () => {

            const name =
                document.getElementById("bnkName")?.value.trim() || "";

            if (!name) return "Bank name is required.";

            const opening =
                Number(document.getElementById("bnkOpen")?.value || 0);

            if (isNaN(opening) || opening < 0) {
                return "Please enter a valid opening balance.";
            }

            const result =
                await window.electronAPI.saveBankAccount({
                    bank_name: name,
                    account_number:
                        document.getElementById("bnkAcc")?.value.trim() || "",
                    opening_balance: opening
                });

            if (!result?.success) {
                return result?.error || "Failed to add bank.";
            }

            alert(`Bank "${name}" added successfully.`);
            closeCardDetail();
            loadDashboard();
            return true;

        });
    }
}

// ======================================================
// RECENT TRANSACTIONS — SEE DETAIL
// Har transaction ki poori detail modal mein.
// ======================================================

function showTxModal(title, html) {

    document.getElementById("txDetailOverlay")?.remove();

    const overlay = document.createElement("div");
    overlay.id = "txDetailOverlay";

    overlay.style.cssText = [
        "position:fixed", "inset:0", "z-index:9600",
        "background:rgba(2,6,23,0.55)",
        "display:flex", "align-items:center", "justify-content:center"
    ].join(";");

    overlay.innerHTML = `
        <div style="
            background:#fff; border-radius:14px;
            width:min(640px, 92vw); max-height:84vh;
            display:flex; flex-direction:column;
            box-shadow:0 20px 60px rgba(0,0,0,0.35);
            overflow:hidden;
        ">
            <div style="
                display:flex; align-items:center; justify-content:space-between;
                padding:14px 20px; background:#ecfdf5;
                border-bottom:1px solid #d1fae5;
            ">
                <h3 style="margin:0; font-size:15px; color:#0f766e;">
                    ${escapeHTML(title)}
                </h3>
                <button class="btn" id="closeTxDetailButton" style="padding:6px 12px;">
                    ✕ Close
                </button>
            </div>
            <div style="overflow:auto; padding:16px 20px;">
                ${html}
            </div>
        </div>
    `;

    overlay.addEventListener("click", (e) => {
        if (e.target === overlay) clearTransientUi();
    });

    document.body.appendChild(overlay);
    document.getElementById("closeTxDetailButton")?.addEventListener(
        "click", clearTransientUi
    );

}

function txRow(label, value) {
    return `
        <tr>
            <td style="padding:5px 8px; color:#64748b;
                font-size:12.5px; width:130px;">${escapeHTML(label)}</td>
            <td style="padding:5px 8px; font-size:13px;"><b>${value}</b></td>
        </tr>
    `;
}

// ======================================================
// FORM MODAL (Electron prompt() support nahi karta isliye
// saari input forms ab is modal se hoti hain)
// ======================================================

let pendingFunctionPasswordResolver = null;
let formModalPreviousFocus = null;

function closeFormModal() {
    document.getElementById("formModalOverlay")?.remove();
    document.body.style.pointerEvents = "";
    if (typeof window.focus === "function") window.focus();

    if (formModalPreviousFocus?.isConnected) {
        formModalPreviousFocus.focus();
    }
    formModalPreviousFocus = null;

    if (pendingFunctionPasswordResolver) {
        const resolve = pendingFunctionPasswordResolver;
        pendingFunctionPasswordResolver = null;
        resolve(false);
    }
}

function formField(id, label, opts = {}) {

    const type = opts.type || "password";
    const value = opts.value !== undefined ? escapeHTML(String(opts.value)) : "";
    const maxlength = opts.maxlength ? `maxlength="${opts.maxlength}"` : "";
    const width = opts.width || "100%";

    return `
        <div style="margin-bottom:14px;">
            <label style="font-size:12px; color:#475569;
                display:block; margin-bottom:5px;">
                ${escapeHTML(label)}
            </label>
            <input
                id="${escapeHTML(id)}"
                type="${type}"
                value="${value}"
                ${maxlength}
                placeholder="${escapeHTML(opts.placeholder || "")}"
                style="
                    width:${width};
                    padding:10px;
                    border:1px solid #cbd5e1;
                    border-radius:8px;
                    font-size:14px;
                    box-sizing:border-box;
                "
            >
        </div>
    `;
}

function showFormModal(title, bodyHtml, submitLabel, onSubmit) {

    closeFormModal();
    formModalPreviousFocus = document.activeElement;

    const overlay = document.createElement("div");
    overlay.id = "formModalOverlay";

    overlay.style.cssText = [
        "position:fixed", "inset:0", "z-index:9700",
        "background:rgba(2,6,23,0.55)",
        "display:flex", "align-items:center", "justify-content:center"
    ].join(";");

    overlay.innerHTML = `
        <div style="
            background:#fff; border-radius:14px;
            width:min(420px, 92vw); max-height:86vh;
            display:flex; flex-direction:column;
            box-shadow:0 20px 60px rgba(0,0,0,0.35);
            overflow:hidden;
        ">
            <div style="
                padding:14px 20px; background:#ecfdf5;
                border-bottom:1px solid #d1fae5;
            ">
                <h3 style="margin:0; font-size:15px; color:#0f766e;">
                    ${escapeHTML(title)}
                </h3>
            </div>

            <div style="overflow:auto; padding:18px 22px;">
                ${bodyHtml}
                <p id="formModalError"
                    style="color:#c0392b; font-size:12px;
                    min-height:16px; margin:4px 0 0;"></p>
            </div>

            <div style="
                display:flex; gap:10px; justify-content:flex-end;
                padding:12px 20px; background:#f8fafc;
                border-top:1px solid #e2e8f0;
            ">
                <button class="btn" style="padding:8px 16px;"
                    onclick="closeFormModal()">
                    Cancel
                </button>
                <button id="formModalSubmitBtn"
                    class="btn btn-sale" style="padding:8px 18px;">
                    ${escapeHTML(submitLabel)}
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    const firstInput = overlay.querySelector("input, select, textarea");
    if (firstInput) firstInput.focus();

    document
        .getElementById("formModalSubmitBtn")
        ?.addEventListener("click", async () => {

            const errEl =
                document.getElementById("formModalError");

            try {

                const result = await onSubmit(errEl);

                if (result === true) {
                    closeFormModal();
                } else if (typeof result === "string") {
                    if (errEl) errEl.textContent = result;
                }

            } catch (error) {
                console.error("Form modal error:", error);
                if (errEl) errEl.textContent = error.message;
            }
        });

    overlay.addEventListener("click", (e) => {
        if (e.target === overlay) closeFormModal();
    });

}

async function verifySystemFunctionPassword(actionLabel = "this action") {
    if (!window.electronAPI || typeof window.electronAPI.verifyFunctionPassword !== "function") {
        alert("System function password verification is unavailable.");
        return false;
    }

    return new Promise((resolve) => {
        showFormModal(
            "🔒 System Function Password",
            `
                <p style="margin:0 0 14px; font-size:13px; color:#475569; line-height:1.5;">
                    Enter your numeric system function password to continue with ${escapeHTML(String(actionLabel || "this action"))}.
                </p>
                <input
                    id="systemFunctionPasswordInput"
                    type="password"
                    inputmode="numeric"
                    autocomplete="one-time-code"
                    placeholder="Enter 4-8 digit code"
                    style="width:100%; padding:12px; border:1px solid #cbd5e1; border-radius:8px; box-sizing:border-box;"
                >
            `,
            "Verify",
            async () => {
                const value = document.getElementById("systemFunctionPasswordInput")?.value || "";

                if (!/^\d{4,8}$/.test(value)) {
                    return "System Function Password must be 4 to 8 digits only.";
                }

                const result = await window.electronAPI.verifyFunctionPassword({ password: value });

                if (!result?.success) {
                    return result?.error || "Incorrect system function password.";
                }

                pendingFunctionPasswordResolver = null;
                resolve(true);
                return true;
            }
        );
        pendingFunctionPasswordResolver = resolve;
    });
}

async function verifyDeleteSystemFunctionPassword(actionLabel = "deleting this record") {
    if (!window.electronAPI || typeof window.electronAPI.verifyFunctionPassword !== "function") {
        showToast("Incorrect System Function Password. Action denied.");
        return false;
    }

    return new Promise(resolve => {
        showFormModal(
            "🔒 System Function Password",
            `<p style="margin:0 0 14px; font-size:13px; color:#475569; line-height:1.5;">
                Enter your numeric system function password to continue with ${escapeHTML(String(actionLabel || "this action"))}.
            </p>
            <input id="systemFunctionPasswordInput" type="password" inputmode="numeric"
                autocomplete="one-time-code" placeholder="Enter 4-8 digit code"
                style="width:100%; padding:12px; border:1px solid #cbd5e1; border-radius:8px; box-sizing:border-box;">`,
            "Verify",
            async () => {
                const value = document.getElementById("systemFunctionPasswordInput")?.value || "";
                const result = /^\d{4,8}$/.test(value)
                    ? await window.electronAPI.verifyFunctionPassword({ password: value })
                    : null;
                if (!result?.success) {
                    showToast("Incorrect System Function Password. Action denied.");
                    closeFormModal();
                    return true;
                }
                pendingFunctionPasswordResolver = null;
                resolve(true);
                return true;
            }
        );
        pendingFunctionPasswordResolver = resolve;
    });
}

function txItemsTable(items) {

    const rows = (items || []).map(it => `
        <tr>
            <td style="padding:5px 8px; border:1px solid #eef2f7;">
                ${escapeHTML(it.item_name || it.name || "-")}
            </td>
            <td style="padding:5px 8px; border:1px solid #eef2f7; text-align:center;">
                ${Number(it.quantity).toLocaleString()}
            </td>
            <td style="padding:5px 8px; border:1px solid #eef2f7;">
                ${formatMoney(it.price)}
            </td>
            <td style="padding:5px 8px; border:1px solid #eef2f7;">
                <b>${formatMoney(it.total)}</b>
            </td>
        </tr>
    `).join("");

    return `
        <h4 style="margin:10px 0 6px; font-size:13px;">Items</h4>
        <table style="width:100%; border-collapse:collapse;">
            <thead>
                <tr style="background:#f8fafc;">
                    <th style="text-align:left; padding:6px 8px; font-size:11.5px;
                        border:1px solid #e2e8f0;">Item</th>
                    <th style="padding:6px 8px; font-size:11.5px;
                        border:1px solid #e2e8f0;">Qty</th>
                    <th style="text-align:left; padding:6px 8px; font-size:11.5px;
                        border:1px solid #e2e8f0;">Price</th>
                    <th style="text-align:left; padding:6px 8px; font-size:11.5px;
                        border:1px solid #e2e8f0;">Total</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `;

}

async function openTransactionDetail(type, refId) {

    try {

        // ---------------- SALE ----------------
        if (type === "Sale") {

            const result =
                await window.electronAPI.getSale(refId);

            if (!result?.success || !result.sale) {
                alert("Sale details not found.");
                return;
            }

            const s = result.sale;

            showTxModal(
                `Sale Detail — ${s.invoice_no || "#" + refId}`,
                `
                <table style="width:100%; border-collapse:collapse; margin-bottom:14px;">
                    ${txRow("Invoice No", escapeHTML(s.invoice_no || "-"))}
                    ${txRow("Customer", escapeHTML(
                        s.customer_name || s.party_name || "Cash Customer"))}
                    ${txRow("Date", String(s.created_at || "").slice(0, 19))}
                    ${txRow("Payment Method", escapeHTML(s.payment_method || "-"))}
                    ${txRow("Subtotal", formatMoney(s.subtotal))}
                    ${txRow("Discount", formatMoney(s.discount))}
                    ${txRow("Total", formatMoney(s.total))}
                    ${txRow("Paid", formatMoney(s.paid))}
                    ${txRow("Due", formatMoney(s.due))}
                    ${txRow("Status", escapeHTML(s.status || "-"))}
                </table>
                ${txItemsTable(result.items)}
                `
            );

            return;
        }

        // ---------------- PURCHASE ----------------
        if (type === "Purchase") {

            const result =
                await window.electronAPI.getPurchase(refId);

            if (!result?.success || !result.purchase) {
                alert("Purchase details not found.");
                return;
            }

            const p = result.purchase;

            showTxModal(
                `Purchase Detail — ${p.bill_no || "#" + refId}`,
                `
                <table style="width:100%; border-collapse:collapse; margin-bottom:14px;">
                    ${txRow("Bill No", escapeHTML(p.bill_no || "-"))}
                    ${txRow("Supplier", escapeHTML(
                        p.supplier_name || p.party_name || "-"))}
                    ${txRow("Date", String(p.created_at || "").slice(0, 19))}
                    ${txRow("Payment Method", escapeHTML(p.payment_method || "-"))}
                    ${txRow("Total", formatMoney(p.total))}
                    ${txRow("Paid", formatMoney(p.paid))}
                    ${txRow("Due", formatMoney(p.due))}
                </table>
                ${txItemsTable(result.items)}
                `
            );

            return;
        }

        // ---------------- EXPENSE ----------------
        if (type === "Expense") {

            const result =
                await window.electronAPI.getExpenses();

            const expenses =
                Array.isArray(result) ? result : (result?.expenses || []);

            const e = expenses.find(x => Number(x.id) === refId);

            if (!e) {
                alert("Expense details not found.");
                return;
            }

            showTxModal(
                "Expense Detail",
                `
                <table style="width:100%; border-collapse:collapse;">
                    ${txRow("Category", escapeHTML(e.category || "-"))}
                    ${txRow("Detail", escapeHTML(e.name || "-"))}
                    ${txRow("Date", String(e.created_at || "").slice(0, 19))}
                    ${txRow("Amount", formatMoney(e.amount))}
                    ${txRow("Method", escapeHTML(e.payment_method || "-"))}
                </table>
                `
            );

            return;
        }

        // ---------------- PAYMENT IN / OUT ----------------
        if (type === "Payment In" || type === "Payment Out") {

            const result =
                await window.electronAPI.getPayments();

            const payments =
                Array.isArray(result) ? result : (result?.payments || []);

            const pay = payments.find(x => Number(x.id) === refId);

            if (!pay) {
                alert("Payment details not found.");
                return;
            }

            showTxModal(
                type === "Payment In"
                    ? "Payment Received — Detail"
                    : "Payment Paid — Detail",
                `
                <table style="width:100%; border-collapse:collapse;">
                    ${txRow("Party",
                        escapeHTML(pay.party_name || pay.party_id || "-"))}
                    ${txRow("Date", String(pay.created_at || "").slice(0, 19))}
                    ${txRow("Type", escapeHTML(pay.type || "-"))}
                    ${txRow("Amount", formatMoney(pay.amount))}
                    ${txRow("Method", escapeHTML(pay.payment_method || "-"))}
                    ${txRow("Note", escapeHTML(pay.note || "-"))}
                </table>
                `
            );

            return;
        }

        // ---------------- SALE RETURN ----------------
        if (type === "Sale Return") {

            const result =
                await window.electronAPI.getSaleReturns();

            const returns =
                Array.isArray(result) ? result : (result?.returns || []);

            const r = returns.find(x => Number(x.id) === refId);

            if (!r) {
                alert("Return details not found.");
                return;
            }

            showTxModal(
                `Sale Return Detail — ${r.return_no || "#" + refId}`,
                `
                <table style="width:100%; border-collapse:collapse;">
                    ${txRow("Return No", escapeHTML(r.return_no || "-"))}
                    ${txRow("Original Invoice",
                        escapeHTML(r.invoice_no || r.sale_id || "-"))}
                    ${txRow("Customer",
                        escapeHTML(r.customer_name || r.party_name || "Walk-In Customer"))}
                    ${txRow("Date", String(r.created_at || "").slice(0, 19))}
                    ${txRow("Amount", formatMoney(r.total))}
                    ${txRow("Refund Method", escapeHTML(r.payment_method || "-"))}
                    ${txRow("Reason", escapeHTML(r.note || r.reason || "-"))}
                </table>
                `
            );

            return;
        }

        alert("No details available for this transaction type.");

    } catch (error) {
        console.error("Transaction detail error:", error);
        alert("Failed to load detail: " + error.message);
    }

}

async function deleteAllItems() {
    if (!await showAppConfirm("Are you sure you want to delete all items?", { title: "Delete All Items", confirmText: "Delete All" })) return;
    if (!await verifyDeleteSystemFunctionPassword("deleting all items")) return;
    if (!apiReady("deleteAllItems")) {
        showToast("Delete All API is not available.");
        return;
    }
    const button = document.getElementById("deleteAllItemsButton");
    if (button) button.disabled = true;
    try {
        const result = await window.electronAPI.deleteAllItems();
        if (result?.success) {
            showToast("All items deleted successfully.", "success");
            await loadItems();
        } else {
            showToast(result?.error || "Failed to delete items.");
        }
    } catch (error) {
        console.error("Delete all items error:", error);
        showToast("Failed to delete items: " + error.message);
    } finally {
        if (button) button.disabled = false;
    }
}

async function restoreItems() {
    if (!apiReady("restoreItems")) {
        showToast("Restore Items API is not available.");
        return;
    }
    const button = document.getElementById("restoreItemsButton");
    if (button) button.disabled = true;
    try {
        const result = await window.electronAPI.restoreItems();
        if (result?.success) {
            showToast(`${result.restored || 0} item(s) restored.`, "success");
            await loadItems();
        } else {
            showToast(result?.error || "Failed to restore items.");
        }
    } catch (error) {
        console.error("Restore items error:", error);
        showToast("Failed to restore items: " + error.message);
    } finally {
        if (button) button.disabled = false;
    }
}
