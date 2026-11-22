// واجهة الداشبورد للاستضافة + بوابة العميل (/portal) بمفتاح خاص لكل بوت
const crypto = require("crypto");
const path = require("path");
const express = require("express");
const hb = require("../hosted/manager");
const PK = require("../hosted/packages");
const sec = require("../hosted/secure");
const { db, S, setS, KEYS } = require("../hosted/hdb");

const idOk = v => /^\d{15,25}$/.test(String(v || ""));
const jr = x => { try { return JSON.parse(x || "{}"); } catch { return {}; } };
const SECRET = crypto.createHash("sha256").update(`${process.env.DASH_PASSWORD || ""}|${process.env.TOKEN || ""}|portal`).digest();
const sign = v => crypto.createHmac("sha256", SECRET).update(v).digest("hex");
const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const TTL = 8 * 3600 * 1000;
const pkgView = p => ({ id: p.id, label: p.label, emoji: p.emoji, days: p.days, price: p.price, templates: p.templates, rights: p.rights });

function mount(app, { gld, h }) {
    // ───────── الداشبورد ─────────
    app.get("/api/v/hosted", h(async () => ({
        bots: hb.list(), templates: hb.templates(), packages: PK.list().map(pkgView),
        cfg: Object.fromEntries(KEYS.map(k => [k, S(k)]))
    })));
    app.post("/api/v/hosted/cfg", h(async b => {
        const g = gld(), c = b.cfg || {};
        for (const k of KEYS) {
            if (!(k in c)) continue;
            let v = String(c[k] ?? "").slice(0, 1800);
            if (["staff_role", "hosted_review_role"].includes(k) && v && !(idOk(v) && g?.roles.cache.has(v))) v = "";
            if (k === "hosted_registry_channel" && v && !(idOk(v) && g?.channels.cache.has(v))) v = "";
            if (k === "hosted_remind_days") v = v.split(/[ ,،]+/).map(Number).filter(n => n > 0 && n <= 60).join(",") || "3,1";
            setS(k, v);
        }
    }));
    app.post("/api/v/hosted/create", h(async b => {
        const pk = b.package && PK.get(b.package);
        const bot = hb.create({ name: b.name, token: b.token, templates: b.templates?.length ? b.templates : pk?.templates, guildId: b.guildId, ownerId: b.ownerId, days: Number(b.days) || pk?.days || 30, note: b.note, pkg: pk?.id || "", rights: pk?.rights || { config: 1, power: 1, presence: 1, logs: 1, portal: 0 } });
        if (b.start !== false) hb.start(bot.id).catch(() => {});
        return { id: bot.id };
    }));
    app.post("/api/v/hosted/update", h(async b => { hb.update(Number(b.id), b.data || {}); }));
    app.post("/api/v/hosted/action", h(async b => {
        const id = Number(b.id); if (!hb.get(id)) throw new Error("البوت غير موجود");
        switch (b.action) {
            case "start": case "stop": case "restart": await hb[b.action](id); return;
            case "suspend": await hb.suspend(id, true); return;
            case "resume": await hb.suspend(id, false); return;
            case "remove": await hb.remove(id); return;
            case "extend": hb.update(id, { addDays: Math.max(1, Math.min(3650, Number(b.days) || 30)) }); return;
            case "portal-key": { const key = sec.newKey(), salt = crypto.randomBytes(16).toString("hex"); db.prepare("UPDATE hosted_bots SET portal_salt=?, portal_hash=? WHERE id=?").run(salt, sec.hashKey(key, salt), id); return { key }; }
            case "portal-key-delete": db.prepare("UPDATE hosted_bots SET portal_salt='', portal_hash='' WHERE id=?").run(id); return;
            default: throw new Error("أمر غير معروف");
        }
    }));
    app.post("/api/v/hosted/logs", h(async b => ({ logs: hb.logsOf(Number(b.id)).slice(-120) })));
    app.post("/api/v/hosted/guild", h(async b => hb.guildInfo(Number(b.id)) || {}));

    // ───────── بوابة العميل ─────────
    const tries = new Map();
    const cookieOf = q => { const m = /(?:^|;\s*)nova_portal=([^;]+)/.exec(q.headers.cookie || ""); if (!m) return null; const [id, exp, sig] = m[1].split("."); return Number(exp) > Date.now() && same(sig || "", sign(`${id}.${exp}`)) ? Number(id) : null; };
    const pauth = (q, r, next) => { const id = cookieOf(q), b = id && hb.get(id); if (!b) return r.status(401).json({ error: "auth" }); q.bot = b; next(); };
    const right = k => (q, r, next) => (jr(q.bot.rights)[k] ? next() : r.status(403).json({ error: "ما عندك هذي الصلاحية" }));
    const wrap = f => async (q, r) => { try { await f(q, r); } catch (e) { r.status(400).json({ error: e.message }); } };
    const json = express.json({ limit: "1mb" });

    app.get("/portal", (q, r) => r.sendFile(path.join(__dirname, "..", "public", "portal.html")));
    app.post("/portal/login", json, (q, r) => {
        const ip = String(q.headers["x-forwarded-for"] || q.socket.remoteAddress || "").split(",")[0].trim(), now = Date.now(), arr = (tries.get(ip) || []).filter(t => now - t < 6e5);
        if (arr.length >= 8) return r.status(429).json({ error: "محاولات كثيرة، انتظر 10 دقائق" });
        const b = hb.get(Number(q.body.id));
        if (b && b.portal_hash && sec.checkKey(String(q.body.key || ""), b.portal_salt, b.portal_hash)) {
            const exp = now + TTL, secure = q.secure || q.headers["x-forwarded-proto"] === "https";
            r.setHeader("Set-Cookie", `nova_portal=${b.id}.${exp}.${sign(`${b.id}.${exp}`)}; HttpOnly; SameSite=Strict; Path=/portal; Max-Age=${TTL / 1000}${secure ? "; Secure" : ""}`);
            return r.json({ ok: true });
        }
        arr.push(now); tries.set(ip, arr); r.status(401).json({ error: "رقم البوت أو المفتاح غلط" });
    });
    app.post("/portal/logout", (q, r) => { r.setHeader("Set-Cookie", "nova_portal=; HttpOnly; SameSite=Strict; Path=/portal; Max-Age=0"); r.json({ ok: true }); });
    app.get("/portal/api/bot", pauth, (q, r) => {
        const v = hb.view(q.bot), T = hb.templates().filter(t => v.templates.includes(t.id));
        r.json({ bot: { id: v.id, name: v.name, state: v.state, error: v.error, tag: v.tag, expires: v.expires, expired: v.expired, config: v.config, presence: v.presence, rights: v.rights, package: v.package, invite: v.invite, uptime: v.uptime, templates: v.templates }, templates: T });
    });
    app.put("/portal/api/config", json, pauth, right("config"), wrap(async (q, r) => {
        const allowed = hb.templates().filter(t => JSON.parse(q.bot.templates || "[]").includes(t.id)), cur = jr(q.bot.config), out = { ...cur };
        for (const t of allowed) { const inc = (q.body.config || {})[t.id]; if (!inc) continue; out[t.id] = { ...(cur[t.id] || {}) }; for (const f of t.settings) if (f.key in inc) out[t.id][f.key] = String(inc[f.key]).slice(0, 4000); }
        const p = jr(q.bot.rights).presence ? q.body.presence : null;
        hb.update(q.bot.id, { config: out, ...(p ? { presence: { status: String(p.status || "online"), type: String(p.type || "Playing"), text: String(p.text || "").slice(0, 128) } } : {}) });
        r.json({ ok: true });
    }));
    for (const act of ["start", "stop", "restart"]) app.post(`/portal/api/${act}`, pauth, right("power"), wrap(async (q, r) => { await hb[act](q.bot.id); r.json({ ok: true }); }));
    app.get("/portal/api/logs", pauth, right("logs"), (q, r) => r.json(hb.logsOf(q.bot.id).slice(-80)));
    app.get("/portal/api/guild", pauth, (q, r) => r.json(hb.guildInfo(q.bot.id) || {}));
}
module.exports = { mount };
