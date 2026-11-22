// واجهة الداشبورد: القرعات، الردود التلقائية، رتب الأزرار، القائمة السوداء
const Cm = require("./utils/community");
const Pro = require("./prodb");
const idOk = v => /^\d{15,25}$/.test(String(v || ""));

function mount(app, { client, gld, h }) {
    const need = () => { const g = gld(); if (!g) throw new Error("البوت مش موجود في السيرفر — اتأكد من GUILD_ID"); return g; };
    const ev = () => require("./events/community");
    const nm = (g, id) => g.members.cache.get(id)?.displayName || id;
    app.get("/api/v/community", h(async () => {
        const g = need();
        return {
            cfg: Cm.cfg(), blBan: !!Pro.get("cm_bl_ban"), autoreplies: Cm.arAll(),
            giveaways: Cm.gwList().slice(0, 40).map(x => ({ id: x.id, prize: x.prize, status: x.status, ends: x.ends, winners: x.winners, entries: x.entries.length, winnerIds: x.winnerIds.map(w => nm(g, w)), channel: g.channels.cache.get(x.channelId)?.name || x.channelId })),
            panels: Cm.rpList().map(p => ({ id: p.id, title: p.title || "بدون عنوان", mode: p.mode, channel: g.channels.cache.get(p.channelId)?.name || p.channelId, roles: p.roles.map(r => `${r.emoji || ""} ${g.roles.cache.get(r.roleId)?.name || r.roleId}`.trim()) })),
            blacklist: Cm.blList().map(r => ({ id: r.id, name: nm(g, r.id), reason: r.reason, created: r.created }))
        };
    }));
    app.post("/api/v/community/cfg", h(async b => {
        const g = need(), c = b.cfg || {}, okCh = v => (idOk(v) && g.channels.cache.has(v) ? v : ""), okRole = v => (idOk(v) && g.roles.cache.has(v) ? v : "");
        Cm.setCfg({ gwChannel: okCh(c.gwChannel), gwPing: okRole(c.gwPing), autoreply: c.autoreply !== false });
        Pro.set("cm_bl_ban", !!b.blBan);
    }));
    // قرعات
    app.post("/api/v/gw/create", h(async b => {
        const ms = Cm.parseDur(b.duration); if (!ms) throw new Error("المدة غلط: مثل 30m أو 2h أو 1d");
        await ev().createGiveaway(need(), { channelId: b.channel, prize: b.prize, ms, winners: b.winners, reqRole: idOk(b.role) ? b.role : "" });
    }));
    app.post("/api/v/gw/end", h(async b => { await ev().endGiveaway(need(), b.id); }));
    app.post("/api/v/gw/reroll", h(async b => { await ev().endGiveaway(need(), b.id, { reroll: true }); }));
    app.post("/api/v/gw/delete", h(async b => { await ev().deleteGiveaway(need(), b.id); }));
    // ردود
    app.post("/api/v/ar/save", h(async b => { if (!Array.isArray(b.list)) throw new Error("قائمة غلط"); Cm.arSave(b.list); }));
    // رتب أزرار
    app.post("/api/v/rp/create", h(async b => {
        const roles = (Array.isArray(b.roles) ? b.roles : []).map(r => ({ roleId: r.roleId, label: r.label, emoji: r.emoji }));
        await ev().sendRolePanel(need(), { channelId: b.channel, title: b.title, description: b.description, roles, mode: b.mode });
    }));
    app.post("/api/v/rp/resend", h(async b => { await ev().resendRolePanel(need(), b.id); }));
    app.post("/api/v/rp/delete", h(async b => { await ev().deleteRolePanel(need(), b.id); }));
    // قائمة سوداء
    app.post("/api/v/bl/add", h(async b => { if (!idOk(b.id)) throw new Error("ايدي العضو غلط"); Cm.blAdd(b.id, b.reason, "dashboard"); }));
    app.post("/api/v/bl/remove", h(async b => { Cm.blRemove(b.id); }));
}

function mountInfo(app, { gld, h }) {
    const Info = require("./utils/info");
    app.get("/api/v/info", h(async () => ({ labels: Info.LABEL, content: Info.all() })));
    app.post("/api/v/info/save", h(async b => { Info.save(b.key, b.data || {}); }));
    app.post("/api/v/info/reset", h(async b => { Info.reset(b.key); }));
    app.get("/api/v/info/preview", async (q, r) => { try { const c = Info.get(String(q.query.key)); const buf = c && await require("../banner").infoCard(c); buf ? r.type("png").send(buf) : r.status(404).end(); } catch { r.status(500).end(); } });
    app.post("/api/v/info/send", h(async b => {
        const g = gld(); if (!g) throw new Error("البوت مش موجود في السيرفر");
        const ch = g.channels.cache.get(b.channel); if (!ch || !ch.isTextBased()) throw new Error("اختار روم نصي");
        const cmds = require("./Commands/Store/info.js"); await cmds[0].sendInfo(ch, b.key);
    }));
}
module.exports = { mount: (app, ctx) => { mount(app, ctx); mountInfo(app, ctx); } };
