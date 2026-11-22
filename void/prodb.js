// بديل pro.db: تخزين مفتاح/قيمة في ملف JSON (data/prodb.json) مع حفظ مؤجل
const fs = require("fs"), path = require("path");
const DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
const FILE = path.join(DIR, "prodb.json");
let data = {}, timer = null, listeners = [], changeL = [];
try { fs.mkdirSync(DIR, { recursive: true }); data = JSON.parse(fs.readFileSync(FILE, "utf8")); } catch {}

const flush = () => {
    timer = null;
    if (global.__NOVA_RESTORING) return; // أثناء استرجاع نسخة: ممنوع نكتب فوق الملفات المسترجعة
    try { fs.writeFileSync(FILE + ".tmp", JSON.stringify(data)); fs.renameSync(FILE + ".tmp", FILE); } catch (e) { console.error("[prodb] save:", e.message); }
    listeners.forEach(f => { try { f(data); } catch {} });
};
const touch = k => { if (!timer) timer = setTimeout(flush, 400); if (k !== undefined) changeL.forEach(f => { try { f(k); } catch {} }); };
const clone = v => (v && typeof v === "object" ? JSON.parse(JSON.stringify(v)) : v);

const api = {
    get: k => clone(data[k]),
    set: (k, v) => { data[k] = clone(v); touch(k); return v; },
    delete: k => { const had = k in data; delete data[k]; touch(k); return had; },
    has: k => k in data,
    push: (k, v) => { const a = Array.isArray(data[k]) ? data[k] : []; a.push(clone(v)); data[k] = a; touch(k); return a; },
    add: (k, n) => { data[k] = (Number(data[k]) || 0) + n; touch(k); return data[k]; },
    subtract: (k, n) => api.add(k, -n),
    all: () => Object.entries(data).map(([ID, data]) => ({ ID, data: clone(data) })),
    startsWith: p => Object.entries(data).filter(([k]) => k.startsWith(p)).map(([ID, v]) => ({ ID, data: clone(v) })),
    // للتخزين الخارجي (MongoDB): يحمّل كل البيانات ويسمع للتغييرات
    _dump: () => data,
    _load: obj => { data = obj && typeof obj === "object" ? obj : {}; },
    _onSave: f => listeners.push(f),
    _onChange: f => changeL.push(f), // يتنادى باسم المفتاح عند أي تعديل (للنسخ الاحتياطي)
    _paths: { dir: DIR, file: FILE },
    _flush: flush
};
process.on("SIGTERM", () => { try { flush(); } catch {} });
module.exports = api;
