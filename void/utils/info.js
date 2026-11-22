// NOVA STORE • القوانين والسياسات: محتوى قابل للتعديل من الداشبورد، وتتولد منه صور بتصميم NOVA STORE
const Pro = require("../prodb");
const DEF = require("./info_defaults.json");
const KEY = "info_content", LABEL = { rules: "القوانين", store: "سياسة المتجر", trade: "سياسة البيع والشراء", refund: "الضمان والاسترجاع", howto: "طريقة الطلب", faq: "الأسئلة الشائعة", payment: "طرق الدفع" };
const clean = (s, n) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const all = () => { const c = Pro.get(KEY) || {}, out = {}; for (const k of Object.keys(DEF)) out[k] = c[k] || DEF[k]; return out; };
function save(key, d) {
    if (!DEF[key]) throw new Error("نوع غير معروف");
    const items = (d.items || []).map(x => ({ h: clean(x.h, 80), t: clean(x.t, 400) })).filter(x => x.h || x.t).slice(0, 12);
    if (!items.length) throw new Error("لازم بند واحد على الأقل");
    const c = Pro.get(KEY) || {}; c[key] = { file: DEF[key].file, title: clean(d.title, 40) || DEF[key].title, sub: clean(d.sub, 50) || DEF[key].sub, items, footer: clean(d.footer, 90) || DEF[key].footer };
    Pro.set(KEY, c); return c[key];
}
function reset(key) { const c = Pro.get(KEY) || {}; delete c[key]; Pro.set(KEY, c); }
module.exports = { LABEL, all, save, reset, get: k => all()[k] };
