// NOVA STORE • بيانات المجتمع: قرعات، ردود تلقائية، رتب أزرار، قائمة سوداء (مدمجة من مشروع Store، تخزين prodb)
const Pro = require("../prodb");
const K = { cfg: "cm_cfg", gw: "cm_giveaways", gwSeq: "cm_gw_seq", ar: "cm_autoreplies", arSeq: "cm_ar_seq", rp: "cm_rolepanels", rpSeq: "cm_rp_seq", bl: "cm_blacklist" };
const DEF = { gwChannel: "", gwPing: "", autoreply: true, announceChannel: "", announcePing: "" };
const cfg = () => ({ ...DEF, ...(Pro.get(K.cfg) || {}) });
const setCfg = p => { const c = { ...cfg(), ...p }; Pro.set(K.cfg, c); return c; };

// ───────── القرعات ─────────
const gwAll = () => Pro.get(K.gw) || {};
const gwGet = id => gwAll()[String(id)] || null;
const gwSave = g => { const m = gwAll(); m[String(g.id)] = g; Pro.set(K.gw, m); return g; };
const gwNew = o => gwSave({ id: Pro.add(K.gwSeq, 1), status: "active", entries: [], winnerIds: [], created: Date.now(), msgId: "", ...o });
const gwList = () => Object.values(gwAll()).sort((a, b) => b.id - a.id);
function gwDelete(id) { const m = gwAll(); delete m[String(id)]; Pro.set(K.gw, m); }
const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const parseDur = s => { const m = /^(\d+)\s*(s|m|h|d|w)$/i.exec(String(s || "").trim()); return m ? +m[1] * { s: 1e3, m: 6e4, h: 36e5, d: 864e5, w: 6048e5 }[m[2].toLowerCase()] : 0; };

// ───────── الردود التلقائية ─────────
const norm = t => String(t || "").toLowerCase().replace(/[\u064B-\u065F\u0640]/g, "").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").trim();
const arAll = () => Pro.get(K.ar) || [];
function arSave(list) {
    let max = 0; list.forEach(r => { if (Number(r.id) > max) max = Number(r.id); });
    const out = list.slice(0, 100).map(r => ({
        id: Number(r.id) || ++max, trigger: String(r.trigger || "").slice(0, 300), response: String(r.response || "").slice(0, 1800),
        match: ["contains", "exact", "starts", "word"].includes(r.match) ? r.match : "contains", channel: /^\d{15,25}$/.test(r.channel || "") ? r.channel : "",
        cooldown: Math.max(0, Math.min(3600, Number(r.cooldown) || 0)), reply: r.reply !== false, enabled: r.enabled !== false
    })).filter(r => r.trigger && r.response);
    Pro.set(K.ar, out); Pro.set(K.arSeq, Math.max(max, Number(Pro.get(K.arSeq)) || 0)); return out;
}
function arMatch(r, text) {
    const t = norm(text), padded = ` ${t.replace(/[^\p{L}\p{N}]+/gu, " ")} `;
    return r.trigger.split(/[|\n]/).map(norm).filter(Boolean).some(x => r.match === "exact" ? t === x : r.match === "starts" ? t.startsWith(x) : r.match === "word" ? padded.includes(` ${x} `) : t.includes(x));
}

// ───────── رتب الأزرار ─────────
const rpAll = () => Pro.get(K.rp) || {};
const rpGet = id => rpAll()[String(id)] || null;
const rpSave = p => { const m = rpAll(); m[String(p.id)] = p; Pro.set(K.rp, m); return p; };
const rpNew = o => rpSave({ id: Pro.add(K.rpSeq, 1), msgId: "", ...o });
const rpList = () => Object.values(rpAll()).sort((a, b) => b.id - a.id);
function rpDelete(id) { const m = rpAll(); delete m[String(id)]; Pro.set(K.rp, m); }

// ───────── القائمة السوداء ─────────
const DENY = "🚫 حسابك ضمن **القائمة السوداء** لدى المتجر ولا يمكنك استخدام هذه الخدمة. للاعتراض تواصل مع الإدارة.";
const blAll = () => Pro.get(K.bl) || {};
const blGet = id => blAll()[String(id)] || null;
function blAdd(id, reason, by) { const m = blAll(); m[String(id)] = { reason: String(reason || "").slice(0, 200), by: String(by || ""), created: Date.now() }; Pro.set(K.bl, m); }
function blRemove(id) { const m = blAll(), had = String(id) in m; delete m[String(id)]; Pro.set(K.bl, m); return had; }
const blList = () => Object.entries(blAll()).map(([id, r]) => ({ id, ...r })).sort((a, b) => b.created - a.created);

module.exports = { cfg, setCfg, gwGet, gwSave, gwNew, gwList, gwDelete, shuffle, parseDur, arAll, arSave, arMatch, norm, rpGet, rpSave, rpNew, rpList, rpDelete, DENY, blGet, blAdd, blRemove, blList };
