// واجهات الداشبورد لنظام Void والتصميم: تكت، لوقات، فلاتر، أوامر، اختصارات، خبرة، وتصميم بنر الترحيب/التقييم
const fs = require("fs"), path = require("path");
const Pro = require("./prodb");
const banner = require("../banner");
const TA = require("./utils/ticketAdmin");
const LOG_TYPES = require("./Extras/logTypes");
const LP = require("./utils/logPanel");
const F = require("./utils/filters");
const CC = require("./utils/cmdConfig");
const SC = require("./utils/shortcuts");
const XP = require("./utils/xp");
const FT = require("./utils/feat");
const DESC = require("./utils/cmdDescriptions");
const V = require("./utils/void");

const idOk = v => /^\d{15,25}$/.test(String(v));
const MAX_IMG = 3 * 1024 * 1024;

// يفك data:image/...;base64 ويتأكد إنها صورة حقيقية (png / jpg / webp) وحجمها مقبول
function readImage(dataUrl) {
    const m = /^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ""));
    if (!m) throw new Error("الصورة لازم تكون PNG أو JPG أو WEBP");
    const buf = Buffer.from(m[2], "base64");
    if (buf.length > MAX_IMG) throw new Error("الصورة أكبر من 3MB");
    const ok = (buf[0] === 0x89 && buf[1] === 0x50) || (buf[0] === 0xff && buf[1] === 0xd8) || (buf.slice(0, 4).toString() === "RIFF");
    if (!ok) throw new Error("الملف مو صورة صحيحة");
    return { buf, ext: m[1] === "png" ? ".png" : m[1] === "webp" ? ".webp" : ".jpg", b64: m[2] };
}

const frameOf = kind => { const b = Pro.get(`frame_${kind}`); return b ? Buffer.from(b, "base64") : null; };

function mount(app, { client, gld, db, save, h }) {
    const need = () => { const g = gld(); if (!g) throw new Error("البوت مش موجود في السيرفر — اتأكد من GUILD_ID"); return g; };
    const chOk = (g, id) => id === null || id === "" || (idOk(id) && g.channels.cache.has(id));

    // ───────────── تصميم البنر ─────────────
    const kinds = ["welcome", "feedback", "boost"];
    const kind = q => { if (!kinds.includes(q.params.kind)) throw new Error("نوع غلط"); return q.params.kind; };

    app.get("/api/design/:kind", h(async (b, q) => {
        const k = kind(q);
        return { design: banner.cleanDesign(db[k].design), defaults: banner.DEFAULT_DESIGN, hasFrame: !!frameOf(k) };
    }));
    app.post("/api/design/:kind", h(async (b, q) => { const k = kind(q); db[k].design = banner.cleanDesign(b.design); save(); }));
    app.post("/api/design/:kind/reset", h(async (b, q) => { const k = kind(q); delete db[k].design; Pro.delete(`frame_${k}`); save(); }));
    app.post("/api/design/:kind/frame", h(async (b, q) => {
        const k = kind(q);
        if (b.clear) { Pro.delete(`frame_${k}`); db[k].design = { ...banner.cleanDesign(db[k].design), frame: "default" }; save(); return; }
        const img = readImage(b.data);
        Pro.set(`frame_${k}`, img.b64);
        db[k].design = { ...banner.cleanDesign(db[k].design), frame: "custom" }; save();
    }));
    // معاينة حية: التصميم يجي في الـ body بدون ما يتحفظ
    app.post("/api/preview/:kind", async (q, r) => {
        try {
            const k = kind(q), g = need(), m = g.members.me, name = m?.displayName || client.user.username;
            const avatar = client.user.displayAvatarURL({ extension: "png", size: 256 });
            const design = banner.cleanDesign(q.body.design), frameBuf = design.frame === "custom" ? frameOf(k) : null;
            const sample = q.body.sample || {};
            const buf = k === "boost"
                ? await banner.boostBanner({ title: String(sample.title || db.boost.title).slice(0, 60), name, avatar, line: String(sample.line || "السيرفر صار فيه 14 بوست").slice(0, 80), design, frameBuf })
                : k === "welcome"
                ? await banner.welcomeBanner({ title: String(sample.title || db.welcome.title).slice(0, 60), name, avatar, line: String(sample.line || "أنت العضو رقم 123 في " + g.name).slice(0, 80), design, frameBuf })
                : await banner.feedbackBanner({ name, avatar, stars: Math.min(5, Math.max(0, Number(sample.stars) || 4)), thanks: String(sample.thanks || db.feedback.thanks).slice(0, 60), design, frameBuf });
            if (!buf) return r.status(404).end();
            r.type("png").send(buf);
        } catch (e) { r.status(400).json({ error: e.message }); }
    });

    // ───────────── التكت المتقدم ─────────────
    app.get("/api/v/tickets", h(async () => { const g = need(); return { cfg: TA.load(g.id), hasImg: { panel: !!TA.load(g.id).panelImagePath, request: !!TA.load(g.id).requestImagePath } }; }));
    app.post("/api/v/tickets", h(async b => {
        const g = need(), cur = TA.load(g.id);
        const roles = (b.reviewerRoleIds || []).filter(r => g.roles.cache.has(r)).slice(0, 15);
        const transferRoles = [...new Set((b.transferRoleIds || []).filter(r => g.roles.cache.has(r)))].slice(0, 25); // الرتب اللي يتحول لها التكت
        const cats = (b.categories || []).slice(0, 24).map(x => ({
            id: String(x.id || "").replace(/\W/g, "").slice(0, 20) || "c" + Math.random().toString(36).slice(2, 8),
            name: String(x.name || "").trim().slice(0, 80), description: String(x.description || "").slice(0, 100),
            emoji: TA.cleanEmoji(x.emoji), roleId: x.roleId && g.roles.cache.has(x.roleId) ? x.roleId : null
        })).filter(x => x.name);
        for (const k of ["panelChannelId", "requestChannelId", "ticketCategoryId"]) if (b[k] !== undefined && !chOk(g, b[k])) throw new Error("روم أو كاتيغوري غلط");
        const txt = k => String(b[k] ?? cur[k] ?? "").slice(0, 1500);
        TA.save(g.id, {
            ...cur, reviewerRoleIds: roles, transferRoleIds: transferRoles, categories: cats,
            panelChannelId: b.panelChannelId || null, requestChannelId: b.requestChannelId || null, ticketCategoryId: b.ticketCategoryId || null,
            ticketNoEmbed: !!b.ticketNoEmbed, panelText: txt("panelText"), requestText: txt("requestText"), ticketText: txt("ticketText"), acceptedText: txt("acceptedText"), pointText: txt("pointText")
        });
    }));
    app.post("/api/v/tickets/send", h(async b => {
        const g = need(), cfg = TA.load(g.id), ch = g.channels.cache.get(b.channelId || cfg.panelChannelId);
        if (!ch) throw new Error("حدد روم اللوحة واحفظ");
        if (!cfg.categories.length) throw new Error("أضف قسم واحد على الأقل");
        await ch.send(TA.buildPanel(g, cfg));
    }));
    app.post("/api/v/tickets/image", h(async b => {
        const g = need(), cfg = TA.load(g.id);
        if (!["panel", "request"].includes(b.kind)) throw new Error("نوع غلط");
        const field = b.kind === "panel" ? "panelImagePath" : "requestImagePath";
        const store = Pro.get(`ticket_imgs_${g.id}`) || {};
        if (b.clear) { if (cfg[field]) { delete store[path.basename(cfg[field])]; Pro.set(`ticket_imgs_${g.id}`, store); fs.rmSync(cfg[field], { force: true }); } cfg[field] = null; return TA.save(g.id, cfg); }
        const img = readImage(b.data), file = path.join(TA.IMAGES_DIR, `${g.id}_${b.kind}${img.ext}`);
        fs.mkdirSync(TA.IMAGES_DIR, { recursive: true }); fs.writeFileSync(file, img.buf);
        store[path.basename(file)] = img.b64; Pro.set(`ticket_imgs_${g.id}`, store);
        cfg[field] = file; TA.save(g.id, cfg);
    }));
    app.post("/api/v/emojis", h(async () => V.uploadEmojis(need())));

    // ───────────── اللوقات ─────────────
    app.get("/api/v/logs", h(async () => { const g = need(), c = LP.getCfg(g.id); return { types: LOG_TYPES.map(t => ({ key: t.key, label: t.label, emoji: t.emoji })), map: c.types, prisonRole: c.prisonRole || null }; }));
    app.post("/api/v/logs", h(async b => {
        const g = need();
        if (!LOG_TYPES.some(t => t.key === b.key) || !chOk(g, b.channelId)) throw new Error("بيانات غلط");
        LP.setRoom(g.id, b.key, b.channelId || null);
    }));
    app.post("/api/v/logs/all", h(async b => { const g = need(); if (!b.channelId || !chOk(g, b.channelId)) throw new Error("اختار روم"); LP.setAll(g.id, b.channelId); }));
    app.post("/api/v/logs/clear", h(async () => { const g = need(), c = LP.getCfg(g.id); c.types = {}; LP.saveCfg(g.id, c); }));

    // ───────────── الفلاتر ─────────────
    const PK = Object.keys(F.PUNISH), cp = p => (PK.includes(p) ? p : "delete");
    app.get("/api/v/filters", h(async () => ({ filters: F.get(need().id), punish: F.PUNISH })));
    app.post("/api/v/filters", h(async b => {
        const g = need(), cur = F.get(g.id);
        cur.words.enabled = !!(b.words && b.words.enabled);
        cur.words.list = [...new Set(((b.words && b.words.list) || []).map(w => String(w).trim().slice(0, 40)).filter(Boolean))].slice(0, 500);
        cur.words.punish = [0, 1, 2].map(i => cp(b.words && b.words.punish && b.words.punish[i]));
        for (const k of ["spam", "invites", "links"]) { cur[k].enabled = !!(b[k] && b[k].enabled); cur[k].punish = cp(b[k] && b[k].punish); }
        cur.spam.count = Math.min(10, Math.max(2, Number(b.spam && b.spam.count) || 3));
        cur.spam.seconds = Math.min(120, Math.max(5, Number(b.spam && b.spam.seconds) || 20));
        cur.links.allow = [...new Set(((b.links && b.links.allow) || []).map(d => String(d).toLowerCase().trim().slice(0, 80)).filter(Boolean))].slice(0, 100);
        cur.exemptRoles = (b.exemptRoles || []).filter(r => g.roles.cache.has(r)).slice(0, 25);
        F.save(g.id, cur);
    }));

    // ───────────── الأوامر والاختصارات ─────────────
    app.get("/api/v/commands", h(async () => {
        const g = need();
        return {
            commands: [...client.commands.values()].map(c => ({ name: c.name, dir: c.directory || "General", desc: c.description || DESC[c.name] || "", aliases: c.aliases || [], cfg: CC.get(g.id, c.name) })).sort((a, b) => a.name.localeCompare(b.name)),
            shortcuts: SC.all(g.id)
        };
    }));
    app.post("/api/v/command", h(async b => {
        const g = need();
        if (!client.commands.has(b.name)) throw new Error("أمر غلط");
        const aliases = [...new Set((b.aliases || []).map(a => String(a).toLowerCase().trim()).filter(a => a && a.length <= 30 && !/\s/.test(a) && !CC.taken(client, g.id, a, b.name)))].slice(0, 10);
        CC.set(g.id, b.name, { disabled: !!b.disabled, aliases, roleId: null, roleIds: [...new Set((b.roleIds || []).filter(r => g.roles.cache.has(r)))].slice(0, 25), channelId: b.channelId && chOk(g, b.channelId) ? b.channelId : null });
    }));
    app.post("/api/v/shortcut", h(async b => {
        const g = need(), word = String(b.word || "").toLowerCase().trim();
        if (!word || /\s/.test(word) || client.commands.has(word)) throw new Error("كلمة غلط أو محجوزة");
        if (b.remove) return SC.remove(g.id, word);
        if (!String(b.full || "").trim()) throw new Error("اكتب الأمر الكامل");
        SC.set(g.id, word, String(b.full).slice(0, 200));
    }));


    // ───────────── الخط التلقائي ─────────────
    const textCh = (g, id) => { const c = g.channels.cache.get(id); return !!c && c.isTextBased() && !c.isVoiceBased() && !c.isThread(); };
    app.get("/api/v/line", h(async () => { const g = need(), f = FT.get(g.id), up = Pro.get(`line_img_${g.id}`); return { rooms: f.autoline.filter(id => g.channels.cache.has(id)), lineUrl: f.lineUrl || "", hasImg: !!(up && up.b64) }; }));
    app.post("/api/v/line", h(async b => {
        const g = need(), url = String(b.lineUrl || "").trim();
        if (url && !/^https?:\/\/\S+$/.test(url)) throw new Error("الرابط لازم يبدأ بـ http أو https");
        const rooms = [...new Set((b.rooms || []).filter(id => idOk(id) && textCh(g, id)))].slice(0, 100);
        FT.edit(g.id, s => { s.autoline = rooms; s.lineUrl = url.slice(0, 500); });
    }));
    app.post("/api/v/line/image", h(async b => {
        const g = need();
        if (b.clear) return void Pro.delete(`line_img_${g.id}`);
        const img = readImage(b.data); Pro.set(`line_img_${g.id}`, { b64: img.b64, ext: img.ext.slice(1) });
    }));

    // ───────────── الخبرة XP ─────────────
    app.get("/api/v/xp", h(async () => {
        const g = need();
        return { cfg: XP.getCfg(g.id), top: XP.top(g.id, 10).map(r => ({ id: r.id, name: g.members.cache.get(r.id)?.displayName || r.id, level: r.level, xp: r.xp })) };
    }));
    app.post("/api/v/xp", h(async b => {
        const g = need();
        if (!chOk(g, b.levelChannelId)) throw new Error("روم غلط");
        const rewards = (b.rewards || []).map(r => ({ level: Math.min(500, Math.max(1, parseInt(r.level) || 0)), roleId: r.roleId })).filter(r => r.level && g.roles.cache.has(r.roleId));
        XP.setEnabled(g.id, b.enabled); XP.setLevelChannel(g.id, b.levelChannelId || null); XP.setRoleRewards(g.id, rewards);
    }));
    require("./storeApi").mount(app, { client, gld, h });
}

module.exports = { mount, frameOf };
