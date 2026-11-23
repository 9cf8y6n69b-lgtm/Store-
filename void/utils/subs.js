// NOVA STORE • الاشتراكات: كل منتج مسلَّم = اشتراك له تاريخ انتهاء، وتقدر تضيف اشتراكات يدوي من الداشبورد
const Pro = require("../prodb");
const DAY = 864e5;
const K = { list: "subs_list", seq: "subs_seq", cfg: "subs_cfg" };
const DEFAULT_CFG = {
    title: "تحكم باشتراكاتك بكل سهولة!",
    sub: "تقدر تشوف اشتراكاتك ووقت انتهائها، وتطلب التجديد أو تفعّل التذكير بضغطة زر.",
    banner: true, remindDays: [3, 1], pingRole: ""
};
const cfg = () => ({ ...DEFAULT_CFG, ...(Pro.get(K.cfg) || {}) });
const setCfg = p => { const c = { ...cfg() }; for (const [k, v] of Object.entries(p || {})) if (v !== undefined && v !== null) c[k] = v; Pro.set(K.cfg, c); return c; };

const all = () => Pro.get(K.list) || [];
const save = l => Pro.set(K.list, l);
const get = id => all().find(s => s.id === Number(id)) || null;
function add({ userId, name, emoji, days, orderId, note }) {
    const id = Pro.add(K.seq, 1), now = Date.now();
    const s = { id, userId: String(userId), name: String(name || "اشتراك").slice(0, 60), emoji: String(emoji || "🤖").slice(0, 60), orderId: orderId || 0, note: String(note || "").slice(0, 200),
        start: now, expires: now + Math.max(0, Number(days) || 0) * DAY, reminders: true, status: "active", stage: 0, renewReq: 0 };
    save([...all(), s]); return s;
}
function update(id, fn) { const l = all(), s = l.find(x => x.id === Number(id)); if (!s) return null; fn(s); save(l); return s; }
const remove = id => save(all().filter(s => s.id !== Number(id)));
const ofUser = uid => all().filter(s => s.userId === String(uid) && s.status !== "removed").sort((a, b) => a.expires - b.expires);
function extend(id, days) { return update(id, s => { s.expires = Math.max(Date.now(), s.status === "cancelled" ? 0 : s.expires) + Number(days) * DAY; s.status = "active"; s.stage = 0; s.renewReq = 0; }); }
// ينشئ اشتراكات من طلب مسلَّم: منتج = اشتراك، ومدته = أشهر المنتج
function fromOrder(o) {
    if (all().some(s => s.orderId === o.id)) return [];
    return o.items.map(i => add({ userId: o.userId, name: i.name, emoji: i.emoji, days: Math.max(1, Math.round(Number(i.months || 1) * 30)), orderId: o.id }));
}
const left = s => s.expires - Date.now();
const state = s => s.status === "cancelled" ? "cancelled" : left(s) <= 0 ? "expired" : left(s) <= 3 * DAY ? "soon" : "active";
const ICON = { active: "🟢", soon: "🟠", expired: "🔴", cancelled: "⚪" };
const TXT = { active: "فعّال", soon: "قارب على الانتهاء", expired: "منتهي", cancelled: "ملغي" };
const ts = ms => Math.floor(ms / 1000);
const stats = () => { const l = all(); return { total: l.length, active: l.filter(s => state(s) === "active").length, soon: l.filter(s => state(s) === "soon").length, expired: l.filter(s => state(s) === "expired").length }; };

module.exports = { DAY, cfg, setCfg, all, get, add, update, remove, ofUser, extend, fromOrder, left, state, ICON, TXT, ts, stats };
