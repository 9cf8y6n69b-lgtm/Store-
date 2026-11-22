// أوامر الأونر: إدارة البوت (أونرز، حظر، حالة، اسم/صورة، بادئة، إعدادات، لوقات سريعة، تسطيب)
const K = require("../../utils/kit");
const { Pro, CC } = K;
const LP = require("../../utils/logPanel");
const LOG_TYPES = require("../../Extras/logTypes");

const own = (name, aliases, run, directory = "Owners") => ({ name, aliases, directory, run: async (client, m, a) => { if (!K.isOwner(m)) return; return run(client, m, a); } });
const TYPES = { playing: 0, listening: 2, watching: 3, competing: 5, streaming: 1 };
function applyStatus(client) {
    const s = Pro.get("bot_status"); if (!s) return;
    try { client.user.setPresence({ activities: [{ name: s.text, type: TYPES[s.type] ?? 0, ...(s.type === "streaming" ? { url: "https://twitch.tv/discord" } : {}) }], status: s.state || "online" }); } catch {}
}
const logKeys = a => a.map(x => x.toLowerCase()).filter(x => LOG_TYPES.some(t => t.key === x));

module.exports = [
    own("owners", ["الاونرز"], async (c, m) => K.info(m, [...new Set([m.guild.ownerId, ...CC.owners])].map(x => `<@${x}>`).join("\n"), "👑 الأونرز")),
    own("setowner", ["اضافة-اونر"], async (c, m, a) => {
        const id = K.idOf(a[0]); if (!id) return K.bad(m, "setowner @عضو  |  setowner remove @عضو");
        const rm = a.includes("remove"), list = Pro.get("bot_owners") || [];
        if (rm) { Pro.set("bot_owners", list.filter(x => x !== id)); const i = CC.owners.indexOf(id); if (i >= 0 && !String(process.env.OWNER_IDS || "").includes(id)) CC.owners.splice(i, 1); return K.ok(m, "تمت الإزالة."); }
        if (!list.includes(id)) list.push(id); Pro.set("bot_owners", list); if (!CC.owners.includes(id)) CC.owners.push(id); K.ok(m, `<@${id}> صار أونر.`);
    }),
    own("block", ["حظر-من-البوت"], async (c, m, a) => { const id = K.idOf(a[0]); if (!id) return K.bad(m, "block @عضو"); const l = Pro.get("bot_blocked") || []; if (!l.includes(id)) l.push(id); Pro.set("bot_blocked", l); K.ok(m, `<@${id}> ما عاد يقدر يستخدم البوت.`); }),
    own("unblock", ["فك-الحظر-من-البوت"], async (c, m, a) => { const id = K.idOf(a[0]); if (!id) return K.bad(m, "unblock @عضو"); Pro.set("bot_blocked", (Pro.get("bot_blocked") || []).filter(x => x !== id)); K.ok(m, "تم."); }),
    own("allow", ["سماح"], async (c, m, a) => {
        const name = (a[0] || "").toLowerCase(), cm = CC.find(c, m.guild.id, name); if (!cm) return K.bad(m, "allow <أمر> @رتبة  |  allow <أمر> off");
        if (a[1] === "off") { CC.set(m.guild.id, cm.name, { roleId: null, roleIds: [], channelId: null, disabled: false }); return K.ok(m, `تم فتح الأمر **${cm.name}** للجميع.`); }
        const r = m.mentions.roles.first(), ch = m.mentions.channels.first(); if (!r && !ch) return K.bad(m, "حدد رتبة أو روم."); CC.set(m.guild.id, cm.name, { ...(r ? { roleId: r.id, roleIds: [] } : {}), ...(ch ? { channelId: ch.id } : {}), disabled: false }); K.ok(m, `تم تقييد **${cm.name}** ${r ? r : ""} ${ch ? ch : ""}`);
    }),
    own("restart", ["اعادة-تشغيل"], async (c, m) => { await K.ok(m, "🔄 جاري إعادة التشغيل..."); setTimeout(() => process.exit(0), 800); }),
    own("setavatar", ["تغيير-صورة-البوت"], async (c, m, a) => { const u = (m.attachments.first() || {}).url || a[0]; if (!/^https?:\/\//.test(u || "")) return K.bad(m, "setavatar رابط أو أرفق صورة"); await c.user.setAvatar(u).then(() => K.ok(m, "تم تغيير صورة البوت.")).catch(e => K.bad(m, e.message)); }),
    own("setname", ["تغيير-اسم-البوت"], async (c, m, a) => { const n = a.join(" ").trim(); if (!n) return K.bad(m, "setname الاسم"); await c.user.setUsername(n.slice(0, 32)).then(() => K.ok(m, "تم تغيير اسم البوت.")).catch(e => K.bad(m, e.message)); }),
    own("setprefix", ["تغيير-البريفكس"], async (c, m, a) => { const p = (a[0] || "").slice(0, 3); if (a[0] === "off") { Pro.delete("bot_prefix"); return K.ok(m, "تم حذف البادئة المخصصة (الأوامر تشتغل بدون بادئة أو بـ ! - .)"); } if (!p) return K.bad(m, "setprefix $  |  setprefix off"); Pro.set("bot_prefix", p); K.ok(m, `تم. صار ممكن تستخدم \`${p}\` قبل الأمر (والأوامر تظل تشتغل بدون بادئة).`); }),
    own("setstatus", ["تغيير-الحالة"], async (c, m, a) => {
        const type = (a[0] || "").toLowerCase(), text = a.slice(1).join(" ").trim(); if (!(type in TYPES) || !text) return K.bad(m, "setstatus playing|watching|listening|competing|streaming النص");
        Pro.set("bot_status", { type, text: text.slice(0, 120) }); applyStatus(c); K.ok(m, "تم تغيير حالة البوت.");
    }),
    { name: "settings", aliases: ["Settings", "الاعدادات"], directory: "Owners", run: async (c, m) => {
        if (!K.has(m, "ADMINISTRATOR")) return; const g = m.guild.id, F = require("../../utils/feat").get(g), ar = Pro.get(`autorole_${g}`) || { humans: [], bots: [] }, p = Pro.get(`prot_${g}`) || {};
        K.info(m, [`البادئة: ${Pro.get("bot_prefix") || "بدون (أو ! - .)"}`, `الأونرز: ${[...new Set([m.guild.ownerId, ...CC.owners])].length}`, `الحالة: ${(Pro.get("bot_status") || {}).text || "—"}`,
            `رتب تلقائية: ${ar.humans.length + ar.bots.length} • ريأكشن رول: ${(Pro.get(`rr_${g}`) || []).length} • ردود تلقائية: ${F.autoreply.length}`, `رومات الخط: ${F.autoline.length} • صور فقط: ${F.pic.length + F.avt.length} • غياب: ${F.absence.length}`,
            `الحماية: ${Object.values(p).filter(x => x && x.on).length} نشطة`, `محظورين من البوت: ${(Pro.get("bot_blocked") || []).length}`].join("\n"), "⚙️ إعدادات البوت");
    } },
    { name: "order", aliases: ["الاوامر-كاملة"], directory: "General", run: async (c, m, a) => c.commands.get("help").run(c, m, a) },

    // ───── لوقات سريعة ─────
    own("setlog", ["تعيين-اللوق"], async (c, m, a) => {
        const ch = K.getChannel(m, a[0]) || m.channel, keys = logKeys(a.slice(1)); if (!keys.length) { LP.setAll(m.guild.id, ch.id); return K.ok(m, `كل اللوقات صارت في ${ch}`); }
        keys.forEach(k => LP.setRoom(m.guild.id, k, ch.id)); K.ok(m, `تم تعيين ${keys.join("، ")} في ${ch}`);
    }),
    own("detlog", ["حذف-اللوق", "log-off"], async (c, m, a) => { const keys = logKeys(a); if (!keys.length) { const cfg = LP.getCfg(m.guild.id); cfg.types = {}; LP.saveCfg(m.guild.id, cfg); return K.ok(m, "تم إيقاف كل اللوقات."); } keys.forEach(k => LP.setRoom(m.guild.id, k, null)); K.ok(m, `تم إيقاف ${keys.join("، ")}`); }),
    own("log-creat", ["انشاء-اللوق"], async (c, m, a) => c.commands.get("logsetup").run(c, m, a.length ? a : ["all"])),
    own("log-delete", ["حذف-رومات-اللوق"], async (c, m, a) => {
        const ids = [...new Set(Object.values(LP.getCfg(m.guild.id).types || {}))].filter(id => m.guild.channels.cache.has(id)); if (!ids.length) return K.bad(m, "ما فيه رومات لوق.");
        if (a[0] !== "confirm") return K.info(m, `بيتم حذف **${ids.length}** روم لوق:\n${ids.map(x => `<#${x}>`).join(" ")}\n\nللتأكيد: \`log-delete confirm\``, "⚠️ تأكيد");
        let n = 0; for (const id of ids) { await m.guild.channels.cache.get(id).delete("log-delete").then(() => n++).catch(() => {}); await K.sleep(300); }
        const cfg = LP.getCfg(m.guild.id); cfg.types = {}; LP.saveCfg(m.guild.id, cfg); K.ok(m, `تم حذف ${n} روم.`);
    }),
    own("voidsetup", ["تسطيب-السيرفر"], async (c, m, a) => {
        if (m.author.id !== m.guild.ownerId && !CC.owners.includes(m.author.id)) return;
        if (a[0] !== "confirm") return K.info(m, "⚠️ هذا الأمر ينشئ رتب ورومات جاهزة (هيكل سيرفر كامل) وقد يضيف أشياء كثيرة.\nللتأكيد اكتب: `voidsetup confirm`", "تسطيب السيرفر");
        const wait = await K.rep(m, { embeds: [K.emb("#f1c40f", "⏳ جاري التسطيب... قد ياخذ دقايق.")] });
        try { await require("../../utils/voidServer").buildServer(m.guild); K.ok(m, "تم تسطيب السيرفر."); } catch (e) { K.bad(m, "فشل التسطيب: " + e.message); } wait && wait.delete().catch(() => {});
    })
];
module.exports.applyStatus = applyStatus;
