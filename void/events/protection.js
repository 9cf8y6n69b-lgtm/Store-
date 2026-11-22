// الحماية (anti): تراقب الأوديت لوق وتعاقب اللي يتجاوز الحد، وترجع اللي انحذف أو تغيّر
const client = require("../index");
const K = require("../utils/kit");
const P = require("../utils/prot");

const hits = new Map(), joins = new Map();
const trusted = (guild, id) => !id || id === client.user.id || guild.ownerId === id || K.CC.owners.includes(id) || P.get(guild.id).wl.includes(id);
const DANGER = ["Administrator", "ManageGuild", "ManageRoles", "ManageChannels", "BanMembers", "KickMembers", "ManageWebhooks"];

function count(guild, type, id) {
    const k = `${guild.id}:${type}:${id}`, now = Date.now(), a = (hits.get(k) || []).filter(t => now - t < 60000); a.push(now); hits.set(k, a); return a.length;
}
async function notify(guild, text) {
    try { const o = await guild.fetchOwner(); await o.send({ embeds: [K.emb("#e74c3c", text, `🛡 حماية ${guild.name}`)] }); } catch {}
}
async function punish(guild, id, type, why) {
    const how = P.get(guild.id)[type].punish, mem = await guild.members.fetch(id).catch(() => null), reason = `حماية ${type}: ${why}`;
    try {
        if (how === "ban") await guild.members.ban(id, { reason });
        else if (how === "kick" && mem) await mem.kick(reason);
        else if (how === "timeout" && mem) await mem.timeout(864e5, reason);
        else if (mem) await mem.roles.set(mem.roles.cache.filter(r => r.managed).map(r => r.id), reason);
    } catch (e) { console.error("[protect] punish:", e.message); }
    K.addRecord(guild.id, id, "protection", client.user.id, `${type}: ${why}`);
    notify(guild, `<@${id}> تجاوز حد **${type}** (${why}).\nالعقوبة: **${P.PUNISH[how]}**`);
}
// يرجع true لو الفاعل غير موثوق وتجاوز الحد (وتم عقابه)
async function guard(guild, type, auditType, targetId, why) {
    const cfg = P.get(guild.id)[type]; if (!cfg.on) return { on: false };
    const e = await K.audit(guild, auditType, targetId); if (!e || !e.executor || trusted(guild, e.executor.id)) return { on: true, bad: false };
    const n = count(guild, type, e.executor.id), over = n >= cfg.limit;
    if (over) await punish(guild, e.executor.id, type, why);
    return { on: true, bad: true, over, exec: e.executor.id };
}

client.on("channelCreate", async ch => { if (!ch.guild) return; const r = await guard(ch.guild, "anticreate", "CHANNEL_CREATE", ch.id, "إنشاء رومات"); if (r.over) ch.delete("حماية").catch(() => {}); });
client.on("roleCreate", async role => { const r = await guard(role.guild, "anticreate", "ROLE_CREATE", role.id, "إنشاء رتب"); if (r.over) role.delete("حماية").catch(() => {}); });
client.on("channelDelete", async ch => {
    if (!ch.guild) return; const r = await guard(ch.guild, "antidelete", "CHANNEL_DELETE", ch.id, "حذف رومات");
    if (r.bad) ch.guild.channels.create({ name: ch.name, type: ch.type, topic: ch.topic || undefined, nsfw: ch.nsfw, parent: ch.parentId || undefined, reason: "حماية: استرجاع" }).catch(() => {});
});
client.on("roleDelete", async role => {
    const r = await guard(role.guild, "antidelete", "ROLE_DELETE", role.id, "حذف رتب");
    if (r.bad) role.guild.roles.create({ name: role.name, color: role.color, hoist: role.hoist, mentionable: role.mentionable, permissions: role.permissions, reason: "حماية: استرجاع" }).catch(() => {});
});
client.on("guildBanAdd", async ban => { const r = await guard(ban.guild, "antidelete", "MEMBER_BAN_ADD", ban.user.id, "حظر جماعي"); if (r.bad) ban.guild.members.unban(ban.user.id, "حماية").catch(() => {}); });
client.on("guildMemberRemove", async m => { if (m.user.bot && false) return; await guard(m.guild, "antidelete", "MEMBER_KICK", m.id, "طرد جماعي"); });

client.on("roleUpdate", async (o, n) => {
    const cfg = P.get(n.guild.id).antiperms; if (!cfg.on || o.permissions.bitfield === n.permissions.bitfield) return;
    if (!DANGER.some(p => n.permissions.has(p, false) && !o.permissions.has(p, false))) return;
    const e = await K.audit(n.guild, "ROLE_UPDATE", n.id); if (!e || trusted(n.guild, e.executor && e.executor.id)) return;
    await n.setPermissions(o.permissions, "حماية: صلاحيات خطيرة").catch(() => {});
    if (count(n.guild, "antiperms", e.executor.id) >= cfg.limit) punish(n.guild, e.executor.id, "antiperms", "إعطاء صلاحيات خطيرة لرتبة");
});
client.on("guildMemberUpdate", async (o, n) => {
    const cfg = P.get(n.guild.id).antiperms; if (!cfg.on) return;
    const added = n.roles.cache.filter(r => !o.roles.cache.has(r.id) && DANGER.some(p => r.permissions.has(p, false))); if (!added.size) return;
    const e = await K.audit(n.guild, "MEMBER_ROLE_UPDATE", n.id); if (!e || trusted(n.guild, e.executor && e.executor.id)) return;
    await n.roles.remove([...added.keys()], "حماية: رتبة بصلاحيات خطيرة").catch(() => {});
    if (count(n.guild, "antiperms", e.executor.id) >= cfg.limit) punish(n.guild, e.executor.id, "antiperms", "إعطاء رتبة بصلاحيات خطيرة");
});
client.on("webhooksUpdate", async ch => {
    if (!ch.guild) return; const cfg = P.get(ch.guild.id).antiwebhook; if (!cfg.on) return;
    const e = await K.audit(ch.guild, "WEBHOOK_CREATE", null); if (!e || trusted(ch.guild, e.executor && e.executor.id)) return;
    const wh = await ch.fetchWebhooks().then(l => l.get(e.target && e.target.id)).catch(() => null); wh && wh.delete("حماية").catch(() => {});
    if (count(ch.guild, "antiwebhook", e.executor.id) >= cfg.limit) punish(ch.guild, e.executor.id, "antiwebhook", "إنشاء ويب هوك");
});
client.on("channelUpdate", async (o, n) => {
    if (!n.guild || o.rateLimitPerUser === n.rateLimitPerUser) return; const cfg = P.get(n.guild.id).sloprot; if (!cfg.on) return;
    const e = await K.audit(n.guild, "CHANNEL_UPDATE", n.id); if (!e || trusted(n.guild, e.executor && e.executor.id)) return;
    n.setRateLimitPerUser(o.rateLimitPerUser || 0, "حماية السلو مود").catch(() => {});
    if (count(n.guild, "sloprot", e.executor.id) >= cfg.limit) punish(n.guild, e.executor.id, "sloprot", "تغيير السلو مود");
});

client.on("guildMemberAdd", async member => {
    try {
        const g = member.guild, s = P.get(g.id);
        if (member.user.bot) {
            if (!s.antibots.on) return; const e = await K.audit(g, "BOT_ADD", member.id);
            if (e && e.executor && trusted(g, e.executor.id)) return;
            await member.kick("حماية: منع البوتات").catch(() => {}); if (e && e.executor) { if (count(g, "antibots", e.executor.id) >= s.antibots.limit) punish(g, e.executor.id, "antibots", "إضافة بوت"); } return;
        }
        if (s.antijoin.on && !trusted(g, member.id)) { member.send({ embeds: [K.emb("#e74c3c", `الدخول مقفل مؤقتاً في **${g.name}**.`)] }).catch(() => {}); return void member.kick("حماية: قفل الدخول").catch(() => {}); }
        if (s.rjoin.on) {
            const now = Date.now(), list = (joins.get(g.id) || []).filter(x => now - x.t < s.rjoin.seconds * 1000); list.push({ t: now, id: member.id }); joins.set(g.id, list);
            if (list.length >= s.rjoin.count) {
                joins.set(g.id, []); notify(g, `🚨 دخول جماعي مشبوه: ${list.length} عضو خلال ${s.rjoin.seconds} ثانية. تم طردهم.`);
                for (const x of list) { const mem = await g.members.fetch(x.id).catch(() => null); if (mem && !trusted(g, x.id)) await mem.kick("حماية: دخول جماعي").catch(() => {}); await K.sleep(300); }
            }
        }
    } catch (e) { console.error("[protect] memberAdd:", e.message); }
});
