// ═══════════════════════════════════════════════
//  NOVA STORE • المجتمع: قرعات + ردود تلقائية + رتب بالأزرار + قائمة سوداء
//  (مدمج من مشروع Store ومحوّل لتخزين prodb)
// ═══════════════════════════════════════════════
const client = require("../index");
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField: PB } = require("discord.js");
const Cm = require("../utils/community");

const EPH = 64, COLOR = 0x9b6bff;
const ts = ms => Math.floor(ms / 1000);
const DANGEROUS = [PB.Flags.Administrator, PB.Flags.ManageGuild, PB.Flags.ManageRoles, PB.Flags.ManageChannels, PB.Flags.BanMembers, PB.Flags.KickMembers, PB.Flags.ManageWebhooks, PB.Flags.ManageMessages, PB.Flags.ModerateMembers];
const dangerous = role => DANGEROUS.some(p => role.permissions.has(p));
const gld = () => client.guilds.cache.get(process.env.GUILD_ID);

// ───────────── القرعات ─────────────
function gwEmbed(g) {
    const ended = g.status !== "active";
    const lines = [
        ended ? "🔒 **انتهت القرعة**" : "اضغط الزر بالأسفل للدخول في القرعة!",
        `⏰ ${ended ? "انتهت" : "تنتهي"}: <t:${ts(g.ends)}:R> (<t:${ts(g.ends)}:f>)`,
        `👑 المنظم: ${g.host ? `<@${g.host}>` : "الإدارة"}`, `🏆 عدد الفائزين: **${g.winners}**`,
        g.reqRole ? `🔒 شرط المشاركة: <@&${g.reqRole}>` : "", `👥 المشاركون: **${g.entries.length}**`,
        ended ? `🎉 الفائزون: ${g.winnerIds.length ? g.winnerIds.map(x => `<@${x}>`).join(" ") : "لا يوجد"}` : ""
    ].filter(Boolean);
    return new EmbedBuilder().setColor(ended ? 0x8d99ae : 0xffd166).setTitle(`🎁 ${g.prize}`).setDescription(lines.join("\n")).setFooter({ text: `قرعة #${g.id} • NOVA STORE` });
}
const gwRow = g => new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`gw_join:${g.id}`).setLabel("شارك").setEmoji("🎉").setStyle(ButtonStyle.Success).setDisabled(g.status !== "active"));

async function createGiveaway(guild, { channelId, prize, ms, winners = 1, host = "", reqRole = "" }) {
    const c = Cm.cfg(), ch = await guild.channels.fetch(channelId || c.gwChannel).catch(() => null);
    if (!ch || !ch.isTextBased()) throw new Error("حدد روم القرعة (من الأمر أو من الداشبورد ← القرعات)");
    if (!prize || !ms || ms < 5000) throw new Error("الجائزة أو المدة غير صحيحة");
    const g = Cm.gwNew({ channelId: ch.id, prize: String(prize).slice(0, 200), winners: Math.min(Math.max(+winners || 1, 1), 50), ends: Date.now() + ms, host, reqRole });
    const ping = c.gwPing, msg = await ch.send({ content: ping ? `<@&${ping}> 🎁 قرعة جديدة!` : "🎁 قرعة جديدة!", embeds: [gwEmbed(g)], components: [gwRow(g)], allowedMentions: { roles: ping ? [ping] : [] } });
    g.msgId = msg.id; return Cm.gwSave(g);
}
async function pickWinners(guild, g, n, exclude = []) {
    const out = [];
    for (const id of Cm.shuffle(g.entries.filter(x => !exclude.includes(x)))) {
        if (out.length >= n) break;
        const m = await guild.members.fetch(id).catch(() => null);
        if (m && !m.user.bot && (!g.reqRole || m.roles.cache.has(g.reqRole)) && !Cm.blGet(id)) out.push(id);
    }
    return out;
}
async function endGiveaway(guild, id, { reroll = false, count } = {}) {
    let g = Cm.gwGet(id); if (!g) throw new Error("القرعة غير موجودة");
    if (!reroll && g.status !== "active") throw new Error("القرعة منتهية");
    if (reroll && g.status === "active") throw new Error("القرعة ما انتهت بعد");
    const winners = await pickWinners(guild, g, reroll ? (count || g.winners) : g.winners, reroll ? g.winnerIds : []);
    g.status = "ended"; g.winnerIds = reroll ? [...g.winnerIds, ...winners] : winners; Cm.gwSave(g);
    const ch = await guild.channels.fetch(g.channelId).catch(() => null);
    const msg = ch && g.msgId && await ch.messages.fetch(g.msgId).catch(() => null);
    if (msg) await msg.edit({ embeds: [gwEmbed(g)], components: [gwRow(g)] }).catch(() => {});
    if (ch) await ch.send({ content: winners.length ? `🎉 مبروك ${winners.map(x => `<@${x}>`).join(" ")}! فزتم بـ **${g.prize}**` : `😔 انتهت قرعة **${g.prize}** بدون مشاركين مؤهلين.`, ...(msg ? { reply: { messageReference: msg.id, failIfNotExists: false } } : {}), allowedMentions: { users: winners } }).catch(() => {});
    for (const w of winners) client.users.fetch(w).then(u => u.send(`🎉 مبروك! فزت بـ **${g.prize}** في **${guild.name}**. تواصل مع الإدارة لاستلام جائزتك.`)).catch(() => {});
    return { winners, giveaway: g };
}
async function editGiveaway(guild, id, { prize, winners, addMinutes }) {
    const g = Cm.gwGet(id); if (!g) throw new Error("القرعة غير موجودة");
    if (g.status !== "active") throw new Error("القرعة منتهية");
    const ends = g.ends + (+addMinutes || 0) * 6e4; if (ends <= Date.now()) throw new Error("وقت الانتهاء لازم يكون بالمستقبل");
    g.ends = ends; g.prize = String(prize || g.prize).slice(0, 200); g.winners = Math.min(Math.max(+winners || g.winners, 1), 50); Cm.gwSave(g);
    const ch = await guild.channels.fetch(g.channelId).catch(() => null), msg = ch && g.msgId && await ch.messages.fetch(g.msgId).catch(() => null);
    if (msg) await msg.edit({ embeds: [gwEmbed(g)], components: [gwRow(g)] }).catch(() => {});
    return g;
}
async function deleteGiveaway(guild, id) {
    const g = Cm.gwGet(id); if (!g) return;
    const ch = await guild.channels.fetch(g.channelId).catch(() => null);
    (g.msgId && ch && await ch.messages.fetch(g.msgId).catch(() => null))?.delete().catch(() => {});
    Cm.gwDelete(id);
}
const gwTimers = new Map();
function gwTouch(g, message) {
    clearTimeout(gwTimers.get(g.id));
    gwTimers.set(g.id, setTimeout(() => { gwTimers.delete(g.id); const f = Cm.gwGet(g.id); if (f) message.edit({ embeds: [gwEmbed(f)] }).catch(() => {}); }, 4000));
}
async function gwJoin(i) {
    const g = Cm.gwGet(i.customId.split(":")[1]);
    if (!g || g.status !== "active" || g.ends <= Date.now()) return i.reply({ content: "⌛ هذي القرعة انتهت", flags: EPH });
    if (Cm.blGet(i.user.id)) return i.reply({ content: Cm.DENY, flags: EPH });
    if (g.reqRole && !i.member.roles.cache.has(g.reqRole)) return i.reply({ content: `🔒 لازم تملك رتبة <@&${g.reqRole}> للمشاركة`, flags: EPH });
    const has = g.entries.includes(i.user.id);
    g.entries = has ? g.entries.filter(x => x !== i.user.id) : [...g.entries, i.user.id]; Cm.gwSave(g);
    gwTouch(g, i.message);
    return i.reply({ content: has ? "↩️ تم انسحابك من القرعة" : "✅ تم دخولك في القرعة، بالتوفيق! 🍀", flags: EPH });
}
async function gwTick() {
    const g = gld(); if (!g) return;
    for (const x of Cm.gwList()) if (x.status === "active" && x.ends <= Date.now()) await endGiveaway(g, x.id).catch(e => console.error("[giveaway]", e.message));
}

// ───────────── الردود التلقائية ─────────────
const arCool = new Map();
client.on("messageCreate", async m => {
    try {
        if (!m.guild || m.author.bot || m.webhookId || !m.content || m.guild.id !== process.env.GUILD_ID || !Cm.cfg().autoreply) return;
        const rules = Cm.arAll().filter(r => r.enabled);
        if (!rules.length) return;
        const ticketRoom = /^(order|ticket)-\d+$|^(تكت|ticket)/i.test(m.channel.name || "");
        for (const r of rules) {
            if (r.channel ? r.channel !== m.channelId : ticketRoom) continue;
            if (!Cm.arMatch(r, m.content)) continue;
            const key = `${r.id}:${m.channelId}`, now = Date.now();
            if (now - (arCool.get(key) || 0) < (r.cooldown || 0) * 1000) return;
            arCool.set(key, now);
            const out = String(r.response).replace(/\{user\}/g, `<@${m.author.id}>`).replace(/\{name\}/g, m.member?.displayName || m.author.username).replace(/\{server\}/g, m.guild.name).replace(/\{channel\}/g, `<#${m.channelId}>`).slice(0, 2000);
            const opts = { content: out, allowedMentions: { parse: [], users: [m.author.id], repliedUser: false } };
            return r.reply ? m.reply(opts).catch(() => {}) : m.channel.send(opts).catch(() => {});
        }
    } catch (e) { console.error("[autoreply]", e.message); }
});

// ───────────── رتب الأزرار ─────────────
function rpMessage(guild, p) {
    const roles = p.roles.filter(r => guild.roles.cache.has(r.roleId));
    const e = new EmbedBuilder().setColor(COLOR).setTitle(p.title || "🏷️ اختر رتبك")
        .setDescription(`${p.description ? p.description + "\n\n" : ""}${roles.map(r => `${r.emoji || "▫️"} <@&${r.roleId}>`).join("\n")}\n\n*اضغط الزر لأخذ الرتبة، واضغطه مرة ثانية لإزالتها.*`).setFooter({ text: "NOVA STORE" });
    const rows = [];
    roles.slice(0, 25).forEach((r, n) => {
        if (n % 5 === 0) rows.push(new ActionRowBuilder());
        const b = new ButtonBuilder().setCustomId(`br:${p.id}:${r.roleId}`).setLabel((r.label || guild.roles.cache.get(r.roleId).name).slice(0, 80)).setStyle(ButtonStyle.Secondary);
        if (r.emoji) b.setEmoji(r.emoji);
        rows[rows.length - 1].addComponents(b);
    });
    return { embeds: [e], components: rows };
}
async function sendRolePanel(guild, { channelId, title, description, roles, mode = "toggle" }) {
    const ch = await guild.channels.fetch(channelId).catch(() => null); if (!ch || !ch.isTextBased()) throw new Error("اختار روم نصي");
    const clean = (roles || []).filter(r => guild.roles.cache.has(r.roleId));
    if (!clean.length) throw new Error("اختر رتبة واحدة على الأقل");
    const bad = clean.find(r => dangerous(guild.roles.cache.get(r.roleId)));
    if (bad) throw new Error(`الرتبة «${guild.roles.cache.get(bad.roleId).name}» فيها صلاحيات إدارية، ممنوع توزيعها بالأزرار`);
    const p = Cm.rpNew({ channelId: ch.id, title: title || "", description: description || "", roles: clean.slice(0, 25).map(r => ({ roleId: r.roleId, label: String(r.label || "").slice(0, 80), emoji: String(r.emoji || "").slice(0, 60) })), mode: mode === "single" ? "single" : "toggle" });
    const msg = await ch.send(rpMessage(guild, p)); p.msgId = msg.id; return Cm.rpSave(p);
}
async function resendRolePanel(guild, id) {
    const p = Cm.rpGet(id); if (!p) throw new Error("غير موجود");
    const ch = await guild.channels.fetch(p.channelId).catch(() => null); if (!ch) throw new Error("الروم محذوف");
    const old = p.msgId && await ch.messages.fetch(p.msgId).catch(() => null);
    if (old) { await old.edit(rpMessage(guild, p)); return p; }
    const msg = await ch.send(rpMessage(guild, p)); p.msgId = msg.id; return Cm.rpSave(p);
}
async function deleteRolePanel(guild, id) {
    const p = Cm.rpGet(id); if (!p) return;
    const ch = await guild.channels.fetch(p.channelId).catch(() => null);
    (p.msgId && ch && await ch.messages.fetch(p.msgId).catch(() => null))?.delete().catch(() => {});
    Cm.rpDelete(id);
}
async function rpClick(i) {
    const [, pid, rid] = i.customId.split(":"), p = Cm.rpGet(pid);
    if (!p || !p.roles.some(r => r.roleId === rid)) return i.reply({ content: "⚠️ هذا البانل غير موجود أو تم تعديله", flags: EPH });
    const role = i.guild.roles.cache.get(rid);
    if (!role) return i.reply({ content: "⚠️ الرتبة محذوفة", flags: EPH });
    if (dangerous(role) || role.managed || role.position >= i.guild.members.me.roles.highest.position) return i.reply({ content: "❌ ما أقدر أعطيك هذي الرتبة", flags: EPH });
    await i.deferReply({ flags: EPH });
    if (i.member.roles.cache.has(rid)) { await i.member.roles.remove(rid).catch(() => {}); return i.editReply(`➖ تمت إزالة <@&${rid}>`); }
    if (p.mode === "single") for (const r of p.roles) if (r.roleId !== rid && i.member.roles.cache.has(r.roleId)) await i.member.roles.remove(r.roleId).catch(() => {});
    await i.member.roles.add(rid).catch(() => {});
    return i.editReply(`➕ تم إعطاؤك <@&${rid}>`);
}

// ───────────── التوجيه + القائمة السوداء عند الدخول ─────────────
client.on("interactionCreate", async i => {
    try {
        if (!i.guild || !i.isButton()) return;
        const id = String(i.customId || "");
        if (id.startsWith("gw_join:")) return await gwJoin(i);
        if (id.startsWith("br:")) return await rpClick(i);
    } catch (e) {
        console.error("[community]", e);
        const m = { content: "⚠️ صار خطأ، حاول مرة ثانية", flags: EPH };
        (i.replied || i.deferred ? i.followUp(m) : i.reply(m)).catch(() => {});
    }
});
client.on("guildMemberAdd", async m => {
    if (m.guild.id !== process.env.GUILD_ID) return;
    const r = Cm.blGet(m.id); if (!r || !require("../prodb").get("cm_bl_ban")) return;
    await m.ban({ reason: `قائمة سوداء: ${r.reason || "—"}` }).catch(() => {});
});
setInterval(() => gwTick().catch(() => {}), 20000);

module.exports = { createGiveaway, endGiveaway, editGiveaway, deleteGiveaway, sendRolePanel, resendRolePanel, deleteRolePanel, gwEmbed };
