const { EmbedBuilder, PermissionFlagsBits: P } = require('discord.js');
const { db, S } = require('./db');
const { modLog } = require('./logs');
const { rankImage, topEmbed } = require('./levels');
const COLOR = 0x9b6bff;
const PERM = { ban: P.BanMembers, unban: P.BanMembers, kick: P.KickMembers, mute: P.ModerateMembers, unmute: P.ModerateMembers, warn: P.ModerateMembers, warns: P.ModerateMembers,
  clearwarns: P.ModerateMembers, clear: P.ManageMessages, lock: P.ManageChannels, unlock: P.ManageChannels, slowmode: P.ManageChannels, say: P.ManageMessages, nick: P.ManageNicknames, role: P.ManageRoles };

const parseDur = s => { const m = /^(\d+)(s|m|h|d)$/i.exec(s || ''); return m ? +m[1] * { s: 1e3, m: 6e4, h: 36e5, d: 864e5 }[m[2].toLowerCase()] : null; };
const idOf = (m, a) => (m.mentions.users.first()?.id) || (/^\d{15,22}$/.test(a || '') ? a : null);
const ok = t => new EmbedBuilder().setColor(0x06d6a0).setDescription(`✅ ${t}`);
const bad = t => new EmbedBuilder().setColor(0xef476f).setDescription(`❌ ${t}`);
async function member(m, a) { const id = idOf(m, a); return id ? m.guild.members.fetch(id).catch(() => null) : null; }
const dm = (u, t) => u.send(t).catch(() => {});

const H = {
  async ban(m, a) {
    const id = idOf(m, a[0]); if (!id) return m.reply({ embeds: [bad('منشن العضو أو اكتب ايديه')] });
    const reason = a.slice(1).join(' '), t = await m.guild.members.fetch(id).catch(() => null);
    if (t && !t.bannable) return m.reply({ embeds: [bad('ما أقدر أحظره (رتبته أعلى)')] });
    if (t) dm(t, `⛔ تم حظرك من **${m.guild.name}**\nالسبب: ${reason || '—'}`);
    await m.guild.members.ban(id, { reason: `${m.author.tag}: ${reason}` });
    const u = t?.user || await m.client.users.fetch(id);
    m.reply({ embeds: [ok(`تم حظر **${u.tag}**`)] }); modLog(m.guild, { action: 'حظر', target: u, mod: m.author, reason, image: m.attachments.first()?.url });
  },
  async unban(m, a) {
    const id = idOf(m, a[0]); if (!id) return m.reply({ embeds: [bad('اكتب ايدي العضو')] });
    const u = await m.client.users.fetch(id).catch(() => null); if (!u) return m.reply({ embeds: [bad('ما لقيته')] });
    await m.guild.members.unban(id).catch(() => null); const reason = a.slice(1).join(' ');
    m.reply({ embeds: [ok(`تم فك الحظر عن **${u.tag}**`)] }); modLog(m.guild, { action: 'فك حظر', color: 0x06d6a0, target: u, mod: m.author, reason, image: m.attachments.first()?.url });
  },
  async kick(m, a) {
    const t = await member(m, a[0]); if (!t) return m.reply({ embeds: [bad('منشن العضو')] });
    if (!t.kickable) return m.reply({ embeds: [bad('ما أقدر أطرده')] }); const reason = a.slice(1).join(' ');
    await dm(t, `👢 تم طردك من **${m.guild.name}**\nالسبب: ${reason || '—'}`); await t.kick(`${m.author.tag}: ${reason}`);
    m.reply({ embeds: [ok(`تم طرد **${t.user.tag}**`)] }); modLog(m.guild, { action: 'طرد', color: 0xff9f1c, target: t, mod: m.author, reason, image: m.attachments.first()?.url });
  },
  async mute(m, a) {
    const t = await member(m, a[0]); const ms = parseDur(a[1]); if (!t || !ms) return m.reply({ embeds: [bad('الاستخدام: `mute @عضو 10m السبب` (s/m/h/d)')] });
    if (!t.moderatable) return m.reply({ embeds: [bad('ما أقدر أعطيه تايم أوت')] }); const reason = a.slice(2).join(' ');
    await t.timeout(Math.min(ms, 28 * 864e5), `${m.author.tag}: ${reason}`); dm(t, `🔇 أخذت تايم أوت في **${m.guild.name}** (${a[1]})\nالسبب: ${reason || '—'}`);
    m.reply({ embeds: [ok(`تم إسكات **${t.user.tag}** لمدة ${a[1]}`)] }); modLog(m.guild, { action: 'تايم أوت', color: 0xffd166, target: t, mod: m.author, reason, extra: `المدة: ${a[1]}`, image: m.attachments.first()?.url });
  },
  async unmute(m, a) {
    const t = await member(m, a[0]); if (!t) return m.reply({ embeds: [bad('منشن العضو')] }); await t.timeout(null); const reason = a.slice(1).join(' ');
    m.reply({ embeds: [ok(`تم فك الإسكات عن **${t.user.tag}**`)] }); modLog(m.guild, { action: 'فك تايم أوت', color: 0x06d6a0, target: t, mod: m.author, reason, image: m.attachments.first()?.url });
  },
  async warn(m, a) {
    const t = await member(m, a[0]); if (!t) return m.reply({ embeds: [bad('منشن العضو')] }); const reason = a.slice(1).join(' ') || 'بدون سبب';
    db.prepare('INSERT INTO warns(user_id,mod_id,reason,created) VALUES(?,?,?,?)').run(t.id, m.author.id, reason, Date.now());
    const n = db.prepare('SELECT COUNT(*) c FROM warns WHERE user_id=?').get(t.id).c; dm(t, `⚠️ تحذير في **${m.guild.name}**\nالسبب: ${reason}\nعدد تحذيراتك: ${n}`);
    m.reply({ embeds: [ok(`تم تحذير **${t.user.tag}** (إجمالي ${n})`)] }); modLog(m.guild, { action: 'تحذير', color: 0xffd166, target: t, mod: m.author, reason, extra: `إجمالي التحذيرات: ${n}`, image: m.attachments.first()?.url });
  },
  async warns(m, a) {
    const id = idOf(m, a[0]) || m.author.id, rows = db.prepare('SELECT * FROM warns WHERE user_id=? ORDER BY id DESC LIMIT 10').all(id);
    m.reply({ embeds: [new EmbedBuilder().setColor(COLOR).setTitle('⚠️ التحذيرات').setDescription(rows.map(r => `**#${r.id}** <t:${Math.floor(r.created / 1000)}:d> — ${r.reason} (بواسطة <@${r.mod_id}>)`).join('\n') || 'لا يوجد تحذيرات')] });
  },
  async clearwarns(m, a) { const id = idOf(m, a[0]); if (!id) return m.reply({ embeds: [bad('منشن العضو')] }); db.prepare('DELETE FROM warns WHERE user_id=?').run(id); m.reply({ embeds: [ok('تم مسح التحذيرات')] }); },
  async clear(m, a) {
    const n = Math.min(100, Math.max(1, parseInt(a[0]) || 0)); if (!parseInt(a[0])) return m.reply({ embeds: [bad('اكتب العدد (1-100)')] });
    const d = await m.channel.bulkDelete(n + 1, true); const r = await m.channel.send({ embeds: [ok(`تم مسح ${d.size - 1} رسالة`)] }); setTimeout(() => r.delete().catch(() => {}), 3000);
    modLog(m.guild, { action: 'مسح رسائل', color: 0x9b6bff, target: m.author, mod: m.author, reason: `${d.size - 1} رسالة في <#${m.channelId}>` });
  },
  async lock(m) { await m.channel.permissionOverwrites.edit(m.guild.id, { SendMessages: false }); m.reply({ embeds: [ok('🔒 تم قفل الروم')] }); },
  async unlock(m) { await m.channel.permissionOverwrites.edit(m.guild.id, { SendMessages: null }); m.reply({ embeds: [ok('🔓 تم فتح الروم')] }); },
  async slowmode(m, a) { await m.channel.setRateLimitPerUser(Math.min(21600, parseInt(a[0]) || 0)); m.reply({ embeds: [ok(`السلو مود: ${parseInt(a[0]) || 0} ثانية`)] }); },
  async say(m, a) { if (!a.length) return; await m.delete().catch(() => {}); m.channel.send({ content: a.join(' '), allowedMentions: { parse: [] } }); },
  async nick(m, a) { const t = await member(m, a[0]); if (!t) return m.reply({ embeds: [bad('منشن العضو')] }); await t.setNickname(a.slice(1).join(' ') || null); m.reply({ embeds: [ok('تم تغيير النك نيم')] }); },
  async role(m, a) {
    const t = await member(m, a[0]), r = m.mentions.roles.first() || m.guild.roles.cache.get(a[1]); if (!t || !r) return m.reply({ embeds: [bad('الاستخدام: `role @عضو @رتبة`')] });
    if (r.position >= m.member.roles.highest.position && m.guild.ownerId !== m.author.id) return m.reply({ embeds: [bad('الرتبة أعلى منك')] });
    const has = t.roles.cache.has(r.id); await (has ? t.roles.remove(r) : t.roles.add(r)); m.reply({ embeds: [ok(`${has ? 'تم سحب' : 'تم إعطاء'} ${r} ${has ? 'من' : 'لـ'} ${t}`)] });
    modLog(m.guild, { action: has ? 'سحب رتبة' : 'إعطاء رتبة', color: 0x9b6bff, target: t, mod: m.author, reason: `${r.name}` });
  },
  async userinfo(m, a) {
    const t = (await member(m, a[0])) || m.member;
    m.reply({ embeds: [new EmbedBuilder().setColor(COLOR).setTitle(t.user.tag).setThumbnail(t.user.displayAvatarURL({ size: 256 })).addFields(
      { name: 'ID', value: t.id, inline: true }, { name: 'أنشأ الحساب', value: `<t:${Math.floor(t.user.createdTimestamp / 1000)}:R>`, inline: true },
      { name: 'دخل السيرفر', value: `<t:${Math.floor(t.joinedTimestamp / 1000)}:R>`, inline: true },
      { name: 'أعلى رتبة', value: `${t.roles.highest}`, inline: true }, { name: 'تحذيرات', value: String(db.prepare('SELECT COUNT(*) c FROM warns WHERE user_id=?').get(t.id).c), inline: true })] });
  },
  async serverinfo(m) {
    const g = m.guild; m.reply({ embeds: [new EmbedBuilder().setColor(COLOR).setTitle(g.name).setThumbnail(g.iconURL()).addFields(
      { name: 'الأعضاء', value: String(g.memberCount), inline: true }, { name: 'الرومات', value: String(g.channels.cache.size), inline: true }, { name: 'الرتب', value: String(g.roles.cache.size), inline: true },
      { name: 'المالك', value: `<@${g.ownerId}>`, inline: true }, { name: 'أنشئ', value: `<t:${Math.floor(g.createdTimestamp / 1000)}:R>`, inline: true }, { name: 'بوست', value: String(g.premiumSubscriptionCount || 0), inline: true })] });
  },
  async avatar(m, a) { const t = (await member(m, a[0])) || m.member; m.reply({ embeds: [new EmbedBuilder().setColor(COLOR).setTitle(t.displayName).setImage(t.user.displayAvatarURL({ size: 1024 }))] }); },
  async rank(m, a) { const t = (await member(m, a[0])) || m.member; m.reply({ files: [await rankImage(t)] }); },
  async top(m) { m.reply({ embeds: [topEmbed()] }); },
  async help(m) {
    const p = S('prefix'), rows = db.prepare('SELECT * FROM cmds WHERE enabled=1').all();
    m.reply({ embeds: [new EmbedBuilder().setColor(COLOR).setTitle('📖 الأوامر').setDescription(rows.map(r => `\`${p}${r.name}\`${r.aliases ? ` — ${r.aliases.split(',').map(x => `\`${x}\``).join(' ')}` : ''}`).join('\n'))] });
  },
};
function allowed(m, c) {
  if (m.member.permissions.has(P.Administrator)) return true;
  if (c.role) return m.member.roles.cache.has(c.role);
  return !PERM[c.name] || m.member.permissions.has(PERM[c.name]);
}
function init(client) {
  client.on('messageCreate', async m => {
    if (!m.guild || m.author.bot) return;
    const p = S('prefix') || '!'; if (!m.content.startsWith(p)) return;
    const [w, ...args] = m.content.slice(p.length).trim().split(/\s+/); const word = (w || '').toLowerCase();
    const c = db.prepare('SELECT * FROM cmds').all().find(r => r.name === word || r.aliases.split(',').map(x => x.trim().toLowerCase()).includes(word));
    if (!c || !c.enabled || !H[c.name]) return;
    if (!allowed(m, c)) return m.reply({ embeds: [bad('ما عندك صلاحية لهذا الأمر')] });
    try { await H[c.name](m, args); } catch (e) { console.error(e); m.reply({ embeds: [bad('صار خطأ، تأكد من صلاحيات البوت وترتيب رتبته')] }).catch(() => {}); }
  });
}
module.exports = { init };
// تم صنع البوت بمتجر نوفا ستور • يوزر الاونر: .5yb.
