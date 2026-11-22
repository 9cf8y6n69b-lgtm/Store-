// ═══════════════════════════════════════════════════════════
//  نسخ احتياطي واسترجاع للبوت (كود + إعدادات + بيانات)
//  • تلقائي: أي تعديل في الإعدادات/الداشبورد أو في ملفات الكود → نسخة zip تنرسل خاص للأونر
//  • /backup  ← نسخة فورية      • /restore ← استرجاع من ملف أو من نسخة محفوظة
//  • لو الأونر أرسل ملف nova-backup-*.zip للبوت (خاص أو سيرفر) يسترجعه تلقائيا ويعيد التشغيل
//  الأمان: ما ينحط .env (التوكن) داخل النسخة أبدا، والاسترجاع للأونر المحدد فقط
// ═══════════════════════════════════════════════════════════
const fs = require("fs"), path = require("path"), vm = require("vm");
const Zip = require("./zip");
const Pro = require("./prodb");

const ROOT = path.join(__dirname, "..");
const DATA_DIR = process.env.DATA_DIR || null;
const DATA_JSON = path.join(DATA_DIR || ROOT, "data.json");
const PRODB_JSON = Pro._paths.file;
const BK_DIR = path.join(DATA_DIR || path.join(ROOT, "data"), "backups");
const NOTICE = path.join(BK_DIR, "restore_notice.json");

const OWNER_ID = String(process.env.BACKUP_USER_ID || "1345715711095472280").trim();
const ALLOWED = new Set([OWNER_ID, ...String(process.env.BACKUP_ADMIN_IDS || "").split(",").map(x => x.trim()).filter(Boolean)]);
const isAllowed = id => ALLOWED.has(String(id));

const FORMAT = "nova-backup-v1";
const KEEP_LOCAL = 20, DEBOUNCE = 45 * 1000, MIN_GAP = 3 * 60 * 1000, MAX_DM = 9.5 * 1024 * 1024;
// مجلدات/ملفات ما تدخل النسخة (data.json و prodb.json ينحفظون لحالهم تحت store/)
const SKIP_TOP = new Set(["node_modules", ".git", "data", "backups", "songs", ".env", ".DS_Store", "data.json"]);
const skip = rel => { const parts = rel.split("/"); return SKIP_TOP.has(parts[0]) || /\.(tmp|log)$/i.test(rel) || parts.includes("node_modules"); };
// مفاتيح تتغير كل لحظة (خبرة، تكتات شغالة…) ما تستاهل نسخة بكل تغيير
const NOISY = /^(xp_users_|ticket_chan_|ticket_num_|ticket_pending_|ticket_hist_|ticket_points_|lastvoice_|invby_|records_|mutes_|prison_)/;

let client = null, ready = false, running = false, restoring = false, timer = null, last = 0;
const pending = new Set();

function walk(dir = ROOT, rel = "") {
    const out = [];
    for (const name of fs.readdirSync(dir)) {
        const r = rel ? rel + "/" + name : name;
        if (skip(r)) continue;
        const abs = path.join(dir, name), st = fs.statSync(abs);
        if (st.isDirectory()) out.push(...walk(abs, r)); else if (st.isFile()) out.push({ rel: r, abs, size: st.size });
    }
    return out;
}
const stamp = (d = new Date()) => { const p = n => String(n).padStart(2, "0"); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`; };

function build(reason, { lite = false } = {}) {
    try { Pro._flush(); } catch {}
    const entries = [], files = walk().filter(f => f.size < 8 * 1024 * 1024 && !(lite && /\.(png|jpe?g|webp|gif)$/i.test(f.rel) && f.size > 200 * 1024));
    entries.push({ name: "manifest.json", data: Buffer.from(JSON.stringify({ format: FORMAT, createdAt: new Date().toISOString(), reason: String(reason || "").slice(0, 400), files: files.length, lite, node: process.version }, null, 1)) });
    for (const f of files) entries.push({ name: "app/" + f.rel, data: fs.readFileSync(f.abs) });
    for (const [n, p] of [["data.json", DATA_JSON], ["prodb.json", PRODB_JSON]]) { try { entries.push({ name: "store/" + n, data: fs.readFileSync(p) }); } catch {} }
    return { buf: Zip.write(entries), name: `nova-backup-${stamp()}.zip`, count: files.length };
}

// ───────────── النسخ المحلية ─────────────
const indexFile = () => path.join(BK_DIR, "index.json");
const readIndex = () => { try { return JSON.parse(fs.readFileSync(indexFile(), "utf8")); } catch { return {}; } };
function saveLocal(buf, name, reason) {
    try {
        fs.mkdirSync(BK_DIR, { recursive: true });
        fs.writeFileSync(path.join(BK_DIR, name), buf);
        const idx = readIndex(); idx[name] = { reason: String(reason || "").slice(0, 200), at: Date.now() };
        const all = fs.readdirSync(BK_DIR).filter(f => /^nova-backup-.*\.zip$/.test(f)).sort();
        for (const old of all.slice(0, Math.max(0, all.length - KEEP_LOCAL))) { fs.rmSync(path.join(BK_DIR, old), { force: true }); delete idx[old]; }
        fs.writeFileSync(indexFile(), JSON.stringify(idx));
    } catch (e) { console.error("[backup] local save:", e.message); }
}
function listLocal() {
    try {
        const idx = readIndex();
        return fs.readdirSync(BK_DIR).filter(f => /^nova-backup-.*\.zip$/.test(f)).sort().reverse()
            .map(f => ({ name: f, reason: (idx[f] || {}).reason || "", at: (idx[f] || {}).at || fs.statSync(path.join(BK_DIR, f)).mtimeMs }));
    } catch { return []; }
}

// ───────────── الإرسال ─────────────
async function send(reason, { to } = {}) {
    if (!client) throw new Error("البوت لسه ما جهز");
    let b = build(reason);
    saveLocal(b.buf, b.name, reason);
    let note = "";
    if (b.buf.length > MAX_DM) { b = build(reason, { lite: true }); note = "\n⚠️ النسخة كبيرة، انشالت الصور الكبيرة منها."; if (b.buf.length > MAX_DM) throw new Error("النسخة أكبر من حد ديسكورد"); }
    const user = await client.users.fetch(to || OWNER_ID);
    await user.send({
        content: `📦 **نسخة احتياطية** • <t:${Math.floor(Date.now() / 1000)}:F>\n**السبب:** ${String(reason).slice(0, 900)}\n**الملفات:** ${b.count} • **الحجم:** ${(b.buf.length / 1024).toFixed(0)}KB${note}\nلاسترجاعها أرسل الملف نفسه للبوت.`,
        files: [{ attachment: b.buf, name: b.name }]
    });
    return b;
}

function notify(reason, detail) {
    if (!ready || restoring || global.__NOVA_RESTORING) return;
    pending.add(detail ? `${reason}: ${String(detail).slice(0, 80)}` : reason);
    if (timer) return;
    timer = setTimeout(fire, Math.max(DEBOUNCE, last + MIN_GAP - Date.now()));
}
async function fire() {
    timer = null;
    if (running || restoring) { if (pending.size) timer = setTimeout(fire, 15000); return; }
    const why = [...pending].slice(0, 8).join(" • ") + (pending.size > 8 ? ` • (+${pending.size - 8})` : "");
    pending.clear(); running = true;
    try { await send(why); last = Date.now(); }
    catch (e) { console.error("[backup] send:", e.message); last = Date.now(); }
    finally { running = false; }
}

// ───────────── الاسترجاع ─────────────
const atomic = (file, buf) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file + ".tmp", buf); fs.renameSync(file + ".tmp", file); };
const safeRel = rel => rel && !path.isAbsolute(rel) && !rel.split("/").some(s => s === ".." || s === "." || s === "");
const syntaxOk = (rel, buf) => { if (!rel.endsWith(".js")) return null; try { new vm.Script("(function(exports,require,module,__filename,__dirname){" + buf.toString("utf8") + "\n})", { filename: rel }); return null; } catch (e) { return `${rel}: ${e.message}`; } };

function inspect(buf) {
    const items = Zip.read(buf), map = new Map(items.map(i => [i.name, i.data]));
    let man; try { man = JSON.parse((map.get("manifest.json") || "").toString()); } catch {}
    if (!man || man.format !== FORMAT) throw new Error("هذا الملف مو نسخة احتياطية من البوت");
    if (!map.has("app/index.js")) throw new Error("النسخة ناقصة (ما فيها index.js)");
    const bad = [];
    for (const [n, d] of map) { if (n.startsWith("app/")) { const e = syntaxOk(n.slice(4), d); if (e) bad.push(e); } }
    if (bad.length) throw new Error("فيه أخطاء كود داخل النسخة، ما استرجعتها:\n" + bad.slice(0, 3).join("\n"));
    for (const n of ["store/data.json", "store/prodb.json"]) if (map.has(n)) { try { JSON.parse(map.get(n).toString()); } catch { throw new Error(n + " تالف"); } }
    return { map, man };
}

async function restoreFromBuffer(buf, by) {
    if (restoring) throw new Error("فيه استرجاع شغال الحين");
    const { map, man } = inspect(buf);
    restoring = true;
    try {
        // نسخة من الوضع الحالي قبل أي تغيير (تقدر ترجع لها)
        const snap = build("قبل الاسترجاع"); saveLocal(snap.buf, snap.name, "قبل الاسترجاع");
        let oldDeps = "", newDeps = "";
        try { oldDeps = JSON.stringify(JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).dependencies); } catch {}
        try { newDeps = JSON.stringify(JSON.parse(map.get("app/package.json").toString()).dependencies); } catch {}

        global.__NOVA_RESTORING = true;
        const keep = new Set(); let written = 0;
        for (const [n, data] of map) {
            if (!n.startsWith("app/")) continue;
            const rel = n.slice(4);
            if (!safeRel(rel) || skip(rel)) continue;
            const dest = path.join(ROOT, rel);
            if (!dest.startsWith(ROOT + path.sep)) continue;
            atomic(dest, data); keep.add(rel); written++;
        }
        let removed = 0;
        // نحذف الملفات اللي ما كانت بالنسخة (رجوع حقيقي)، إلا لو النسخة lite أو الملف كبير (ما كان يدخل النسخ أصلا)
        if (!man.lite) for (const f of walk()) if (!keep.has(f.rel) && f.size < 8 * 1024 * 1024) { fs.rmSync(f.abs, { force: true }); removed++; }
        if (map.has("store/data.json")) atomic(DATA_JSON, map.get("store/data.json"));
        if (map.has("store/prodb.json")) atomic(PRODB_JSON, map.get("store/prodb.json"));
        fs.mkdirSync(BK_DIR, { recursive: true });
        fs.writeFileSync(NOTICE, JSON.stringify({ user: by, at: Date.now(), from: man.createdAt, reason: man.reason, written, removed }));
        return { written, removed, man, depsChanged: !!newDeps && oldDeps !== newDeps };
    } catch (e) { global.__NOVA_RESTORING = false; restoring = false; throw e; }
}
// بعد الاسترجاع لازم يعيد التشغيل عشان يحمّل الكود الجديد (الاستضافة ترجعه تلقائيا مثل أمر restart)
const restartSoon = () => setTimeout(() => process.exit(0), 1500);

async function download(att) {
    if (att.size > 50 * 1024 * 1024) throw new Error("الملف كبير");
    const r = await fetch(att.url); if (!r.ok) throw new Error("فشل تحميل الملف (HTTP " + r.status + ")");
    return Buffer.from(await r.arrayBuffer());
}
const doneText = r => `✅ تم استرجاع النسخة (${r.man.createdAt ? "بتاريخ " + r.man.createdAt.slice(0, 19).replace("T", " ") : ""})\n**ملفات مكتوبة:** ${r.written} • **ملفات انحذفت (ما كانت بالنسخة):** ${r.removed}${r.depsChanged ? "\n⚠️ مكتبات package.json اختلفت: شغّل `npm install` بعد ما يشتغل." : ""}\n🔄 البوت يعيد التشغيل الحين...`;

function init(c) {
    client = c;
    c.once("clientReady", async () => {
        setTimeout(() => { ready = true; }, 60 * 1000);
        try { // رسالة تأكيد بعد إعادة التشغيل اللي تلت استرجاع
            const n = JSON.parse(fs.readFileSync(NOTICE, "utf8")); fs.rmSync(NOTICE, { force: true });
            const u = await c.users.fetch(n.user || OWNER_ID);
            await u.send(`✅ رجع البوت يشتغل بعد استرجاع النسخة.\n**ملفات:** ${n.written} • **سبب النسخة:** ${n.reason || "—"}`);
        } catch {}
    });
    Pro._onChange(k => { if (!NOISY.test(String(k))) notify("تعديل إعدادات", k); });
    setInterval(() => notify("نسخة يومية"), 24 * 3600 * 1000).unref();
    try { // أي تعديل/إضافة على ملفات الكود
        fs.watch(ROOT, { recursive: true }, (ev, file) => { if (!file) return; const rel = String(file).split(path.sep).join("/"); if (!skip(rel)) notify("تعديل كود", rel); }).on("error", () => {});
    } catch (e) { console.log("[backup] مراقبة الملفات غير متاحة:", e.message); }

    // استرجاع تلقائي: الأونر يرسل ملف nova-backup-*.zip
    c.on("messageCreate", async m => {
        try {
            if (m.author.bot || !isAllowed(m.author.id)) return;
            const att = m.attachments.find(a => /^nova-backup.*\.zip$/i.test(a.name || ""));
            if (!att) return;
            const wait = await m.reply({ content: "⏳ جاري فحص النسخة واسترجاعها...", allowedMentions: { repliedUser: false } }).catch(() => null);
            try {
                const r = await restoreFromBuffer(await download(att), m.author.id);
                if (wait) await wait.edit(doneText(r)).catch(() => {}); restartSoon();
            } catch (e) { if (wait) wait.edit("❌ " + e.message).catch(() => {}); }
        } catch (e) { console.error("[backup] auto restore:", e.message); }
    });

    // اختيار نسخة محفوظة من القائمة
    c.on("interactionCreate", async i => {
        try {
            if (!i.isStringSelectMenu() || i.customId !== "bk_pick") return;
            if (!isAllowed(i.user.id)) return i.reply({ content: "ما عندك صلاحية.", ephemeral: true }).catch(() => {});
            const name = path.basename(i.values[0]), file = path.join(BK_DIR, name);
            if (!fs.existsSync(file)) return i.update({ content: "❌ النسخة مو موجودة.", components: [] }).catch(() => {});
            await i.update({ content: "⏳ جاري الاسترجاع...", components: [] }).catch(() => {});
            try { const r = await restoreFromBuffer(fs.readFileSync(file), i.user.id); await i.editReply({ content: doneText(r) }).catch(() => {}); restartSoon(); }
            catch (e) { await i.editReply({ content: "❌ " + e.message }).catch(() => {}); }
        } catch (e) { console.error("[backup] pick:", e.message); }
    });
}

module.exports = { init, notify, send, build, listLocal, restoreFromBuffer, restartSoon, download, doneText, isAllowed, OWNER_ID };
