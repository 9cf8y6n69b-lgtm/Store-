// ═══════════════════════════════════════════════
//  NOVA STORE • بيانات المتجر (منتجات، أسعار، كوبونات، طلبات، نقاط الستاف)
//  مدمج من مشروع Store ومحوّل لتخزين prodb (JSON) بدل sqlite
// ═══════════════════════════════════════════════
const { EmbedBuilder } = require("discord.js");
const Pro = require("../prodb");
const DEF = require("./store_defaults.json");

const PAY = {
    nitro: { label: "نيترو (أشهر)", emoji: "💎" }, boost: { label: "بوست", emoji: "🚀" },
    robux: { label: "روبوكس", emoji: "🟡" }, credit: { label: "كردت", emoji: "🪙" },
    vbucks: { label: "في بوكس", emoji: "🎮" }, uc: { label: "شدات ببجي", emoji: "🔫" }
};
const CAT = { basic: "🟢 بوتات بسيطة", standard: "🔵 بوتات متوسطة", premium: "🟣 بوتات متقدمة", package: "📦 الباقات" };
const STATUS = { pending: "⏳ بانتظار الدفع", paid: "💳 تم الدفع", delivered: "✅ تم التسليم", cancelled: "❌ ملغي" };
const COLOR = 0x9b6bff;

const K = { cfg: "store_cfg", prods: "store_products", orders: "store_orders", seq: "store_seq", coupons: "store_coupons", staff: "store_staff" };

const DEFAULT_CFG = {
    open: true, bundleMin: 3, bundleDiscount: 10, allBotsMonths: 12, customMin: 6, maxOpen: 2,
    pointsPaid: 1, pointsDeliver: 2, customerRole: "", logChannel: "",
    storeName: "NOVA STORE", invoiceEnabled: true, invoiceDm: false, warrantyEnabled: true, warrantyDays: 7, warrantyRemindHours: 24,
    reportChannel: "", reportIntervalDays: 0, saleValue: 0, costValue: 0, currency: "",
    rates: DEF.rates, payInfo: DEF.payInfo
};

const fmt = n => (Math.round(Number(n) * 100) / 100).toLocaleString("en-US");

function cfg() {
    const c = Pro.get(K.cfg) || {};
    return { ...DEFAULT_CFG, ...c, rates: { ...DEFAULT_CFG.rates, ...(c.rates || {}) }, payInfo: { ...DEFAULT_CFG.payInfo, ...(c.payInfo || {}) } };
}
const setCfg = patch => { const c = { ...cfg(), ...patch }; Pro.set(K.cfg, c); return c; };

function products() {
    let p = Pro.get(K.prods);
    if (!Array.isArray(p)) { p = DEF.products; Pro.set(K.prods, p); }
    return p;
}
const activeProducts = () => products().filter(p => p.active !== false);
function saveProducts(list) {
    let max = 0; list.forEach(p => { if (Number(p.id) > max) max = Number(p.id); });
    const out = list.slice(0, 200).map(p => ({
        id: Number(p.id) || ++max,
        category: CAT[p.category] ? p.category : "basic",
        name: String(p.name || "").trim().slice(0, 60) || "منتج",
        months: Math.max(0, Math.min(1000, Number(p.months) || 0)),
        emoji: String(p.emoji || "🤖").slice(0, 60),
        active: p.active !== false
    }));
    Pro.set(K.prods, out); return out;
}

// ───────────── الأسعار ─────────────
function price(prods, couponPct = 0) {
    const c = cfg(), realAll = activeProducts().filter(p => p.category !== "package").length;
    const bots = prods.filter(p => p.category !== "package");
    let base = prods.reduce((s, p) => s + Number(p.months || 0), 0);
    if (realAll && prods.filter(p => p.id !== "custom" && p.category !== "package").length >= realAll) base = Math.min(base, Number(c.allBotsMonths));
    const bundle = bots.length >= Number(c.bundleMin) ? Number(c.bundleDiscount) : 0;
    return { base, bundle, couponPct };
}
const totalMonths = o => o.base * (1 - (Number(o.bundle) + Number(o.couponPct || 0)) / 100);
const amountFor = (months, pay) => `${fmt(months * (cfg().rates[pay] || 0))} ${PAY[pay]?.label || pay}`;
const payInfo = k => cfg().payInfo[k] || "";

function pricesEmbed() {
    const c = cfg(), e = new EmbedBuilder().setColor(COLOR).setTitle("💰 قائمة الأسعار — NOVA STORE");
    for (const [cat, name] of Object.entries(CAT)) {
        const rows = activeProducts().filter(p => p.category === cat);
        if (rows.length) e.addFields({ name, value: rows.map(r => `${r.emoji} ${r.name} — **${fmt(r.months)} شهر**`).join("\n").slice(0, 1024), inline: true });
    }
    e.addFields({ name: "🎁 العروض", value: `• باقة ${c.bundleMin} بوتات = خصم ${c.bundleDiscount}%\n• كل البوتات = نيترو ${c.allBotsMonths} شهر\n• بوت مخصص بالكامل من ${c.customMin} أشهر` });
    return e.setFooter({ text: "NOVA STORE • الأسعار تقديرية وتُأكَّد من الإدارة" });
}

// ───────────── الطلبات ─────────────
const allOrders = () => Pro.get(K.orders) || {};
const getOrder = id => allOrders()[String(id)] || null;
function saveOrder(o) { const m = allOrders(); m[String(o.id)] = o; Pro.set(K.orders, m); return o; }
function newOrder(o) { const id = Pro.add(K.seq, 1); return saveOrder({ ...o, id, created: Date.now(), status: "pending" }); }
const listOrders = (limit = 60) => Object.values(allOrders()).sort((a, b) => b.id - a.id).slice(0, limit);
const userOrders = (uid, limit = 10) => Object.values(allOrders()).filter(o => o.userId === uid).sort((a, b) => b.id - a.id).slice(0, limit);
const openOrdersOf = uid => Object.values(allOrders()).filter(o => o.userId === uid && !["delivered", "cancelled"].includes(o.status)).length;
const byChannel = ch => Object.values(allOrders()).filter(o => o.channelId === ch).sort((a, b) => b.id - a.id);

// ───────────── الكوبونات ─────────────
const coupons = () => Pro.get(K.coupons) || {};
function saveCoupons(list) {
    const m = {};
    for (const c of list.slice(0, 200)) {
        const code = String(c.code || "").trim().toUpperCase().replace(/[^A-Z0-9_\-ء-ي]/g, "").slice(0, 30);
        if (!code) continue;
        m[code] = { percent: Math.max(1, Math.min(100, Number(c.percent) || 0)), maxUses: Math.max(0, Number(c.maxUses) || 0), uses: Math.max(0, Number(c.uses) || 0) };
    }
    Pro.set(K.coupons, m); return m;
}
function useCoupon(code) {
    const m = coupons(), c = m[code];
    if (!c || (c.maxUses && c.uses >= c.maxUses)) return null;
    c.uses++; Pro.set(K.coupons, m); return c;
}

// ───────────── نقاط الستاف ─────────────
function addStaffPoints(uid, kind, pts) {
    const m = Pro.get(K.staff) || {}, r = m[uid] || { points: 0, paid: 0, delivered: 0 };
    r.points += Number(pts) || 0; r[kind] = (r[kind] || 0) + 1; m[uid] = r; Pro.set(K.staff, m);
}
const topStaff = (n = 10) => Object.entries(Pro.get(K.staff) || {}).map(([id, r]) => ({ id, ...r })).sort((a, b) => b.points - a.points).slice(0, n);

function stats() {
    const os = Object.values(allOrders());
    return {
        total: os.length, pending: os.filter(o => o.status === "pending").length, paid: os.filter(o => o.status === "paid").length,
        delivered: os.filter(o => o.status === "delivered").length, cancelled: os.filter(o => o.status === "cancelled").length,
        months: Math.round(os.filter(o => o.status === "delivered").reduce((s, o) => s + totalMonths(o), 0) * 100) / 100
    };
}

module.exports = {
    PAY, CAT, STATUS, COLOR, fmt, cfg, setCfg, products, activeProducts, saveProducts, price, totalMonths, amountFor, payInfo, pricesEmbed,
    getOrder, saveOrder, newOrder, listOrders, userOrders, openOrdersOf, byChannel, coupons, saveCoupons, useCoupon, addStaffPoints, topStaff, stats
};
