// أنظمة السيرفر: قرعات، اقتراحات، ردود تلقائية، رتب بالأزرار، أمر الإعلانات
const {
  SlashCommandBuilder, PermissionFlagsBits: P, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle, ChannelType,
} = require('discord.js');
const { db, S, setS } = require('./db');
const bl = require('./blacklist');
const EPH = 64, COLOR = 0x9b6bff;
const ts = (ms) => Math.floor(ms / 1000);
const isStaff = (m) => m && (m.permissions.has(P.Administrator) || m.permissions.has(P.ManageGuild) || (S('staff_role') && m.roles.cache.has(S('staff_role'))));
const parseDur = (s) => { const m = /^(\d+)\s*(s|m|h|d|w)$/i.exec((s || '').trim()); return m ? +m[1] * { s: 1e3, m: 6e4, h: 36e5, d: 864e5, w: 6048e5 }[m[2].toLowerCase()] : null; };
const textChannels = [ChannelType.GuildText, ChannelType.GuildAnnouncement];
const DANGEROUS = [P.Administrator, P.ManageGuild, P.ManageRoles, P.ManageChannels, P.BanMembers, P.KickMembers, P.ManageWebhooks, P.ManageMessages, P.ModerateMembers];
const dangerous = (role) => DANGEROUS.some((p) => role.permissions.has(p)) || role.id === S('staff_role');
const shuffle = (a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// ============================= القرعات =============================
const gwGet = (id) => db.prepare('SELECT * FROM giveaways WHERE id=?').get(id);
const gwCount = (id) => db.prepare('SELECT COUNT(*) c FROM giveaway_entries WHERE gid=?').get(id).c;
function gwEmbed(g) {
  const ended = g.status !== 'active', n = gwCount(g.id);
  const lines = [
    ended ? '🔒 **انتهت القرعة**' : 'اضغط الزر بالأسفل للدخول في القرعة!',
    `⏰ ${ended ? 'انتهت' : 'تنتهي'}: <t:${ts(g.ends)}:R> (<t:${ts(g.ends)}:f>)`,
    `👑 المنظم: <@${g.host}>`, `🏆 عدد الفائزين: **${g.winners}**`,
    g.req_role ? `🔒 شرط المشاركة: <@&${g.req_role}>` : '', `👥 المشاركون: **${n}**`,
    ended ? `🎉 الفائزون: ${g.winner_ids ? g.winner_ids.split(',').map((x) => `<@${x}>`).join(' ') : 'لا يوجد'}` : '',
  ].filter(Boolean);
  return new EmbedBuilder().setColor(ended ? 0x8d99ae : 0xffd166).setTitle(`🎁 ${g.prize}`).setDescription(lines.join('\n')).setFooter({ text: `قرعة #${g.id}` });
}
const gwRow = (g) => new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`gw_join:${g.id}`).setLabel('شارك').setEmoji('🎉').setStyle(ButtonStyle.Success).setDisabled(g.status !== 'active'));
async function createGiveaway(guild, { channelId, prize, ms, winners = 1, host, reqRole = '' }) {
  const ch = await guild.channels.fetch(channelId || S('gw_channel')).catch(() => null);
  if (!ch) throw new Error('حدد روم القرعة (من الأمر أو الداشبورد ← أنظمة السيرفر)');
  if (!prize || !ms || ms < 5000) throw new Error('الجائزة أو المدة غير صحيحة');
  const r = db.prepare('INSERT INTO giveaways(channel_id,prize,winners,ends,host,req_role,created) VALUES(?,?,?,?,?,?,?)')
    .run(ch.id, prize.slice(0, 200), Math.min(Math.max(+winners || 1, 1), 50), Date.now() + ms, host || '', reqRole || '', Date.now());
  const g = gwGet(r.lastInsertRowid);
  const ping = S('gw_ping_role');
  const msg = await ch.send({ content: ping ? `<@&${ping}> 🎁 قرعة جديدة!` : '🎁 قرعة جديدة!', embeds: [gwEmbed(g)], components: [gwRow(g)], allowedMentions: { roles: ping ? [ping] : [] } });
  db.prepare('UPDATE giveaways SET msg_id=? WHERE id=?').run(msg.id, g.id);
  return gwGet(g.id);
}
async function pickWinners(guild, g, n, exclude = []) {
  const ids = shuffle(db.prepare('SELECT user_id FROM giveaway_entries WHERE gid=?').all(g.id).map((r) => r.user_id).filter((x) => !exclude.includes(x))), out = [];
  for (const id of ids) {
    if (out.length >= n) break;
    const m = await guild.members.fetch(id).catch(() => null);
    if (m && !m.user.bot && (!g.req_role || m.roles.cache.has(g.req_role))) out.push(id);
  }
  return out;
}
async function endGiveaway(guild, id, { reroll = false, count } = {}) {
  let g = gwGet(id); if (!g) throw new Error('القرعة غير موجودة');
  if (!reroll && g.status !== 'active') throw new Error('القرعة منتهية');
  if (reroll && g.status === 'active') throw new Error('القرعة ما انتهت بعد');
  const prev = g.winner_ids ? g.winner_ids.split(',') : [];
  const winners = await pickWinners(guild, g, reroll ? (count || g.winners) : g.winners, reroll ? prev : []);
  db.prepare("UPDATE giveaways SET status='ended', winner_ids=? WHERE id=?").run(winners.join(','), g.id);
  g = gwGet(g.id);
  const ch = await guild.channels.fetch(g.channel_id).catch(() => null);
  const msg = ch && g.msg_id && await ch.messages.fetch(g.msg_id).catch(() => null);
  if (msg) await msg.edit({ embeds: [gwEmbed(g)], components: [gwRow(g)] }).catch(() => {});
  if (ch) await ch.send({ content: winners.length ? `🎉 مبروك ${winners.map((x) => `<@${x}>`).join(' ')}! فزتم بـ **${g.prize}**` : `😔 انتهت قرعة **${g.prize}** بدون مشاركين مؤهلين.`,
    ...(msg ? { reply: { messageReference: msg.id, failIfNotExists: false } } : {}), allowedMentions: { users: winners } }).catch(() => {});
  for (const w of winners) (await guild.client.users.fetch(w).catch(() => null))?.send(`🎉 مبروك! فزت بـ **${g.prize}** في **${guild.name}**. تواصل مع الإدارة لاستلام جائزتك.`).catch(() => {});
  return { winners, giveaway: g };
}
async function editGiveaway(guild, id, { prize, winners, addMinutes }) {
  const g = gwGet(id); if (!g) throw new Error('القرعة غير موجودة');
  if (g.status !== 'active') throw new Error('القرعة منتهية');
  const ends = g.ends + (+addMinutes || 0) * 6e4;
  if (ends <= Date.now()) throw new Error('وقت الانتهاء لازم يكون بالمستقبل');
  db.prepare('UPDATE giveaways SET prize=?, winners=?, ends=? WHERE id=?').run((prize || g.prize).slice(0, 200), Math.min(Math.max(+winners || g.winners, 1), 50), ends, id);
  const n = gwGet(id), ch = await guild.channels.fetch(n.channel_id).catch(() => null), msg = ch && n.msg_id && await ch.messages.fetch(n.msg_id).catch(() => null);
  if (msg) await msg.edit({ embeds: [gwEmbed(n)], components: [gwRow(n)] }).catch(() => {});
  return n;
}
async function deleteGiveaway(guild, id) {
  const g = gwGet(id); if (!g) return;
  const ch = await guild.channels.fetch(g.channel_id).catch(() => null);
  (g.msg_id && ch && await ch.messages.fetch(g.msg_id).catch(() => null))?.delete().catch(() => {});
  db.prepare('DELETE FROM giveaway_entries WHERE gid=?').run(id); db.prepare('DELETE FROM giveaways WHERE id=?').run(id);
}
const gwTimers = new Map();
function gwTouch(g, message) { // تحديث عدد المشاركين بدون إغراق الـ API
  clearTimeout(gwTimers.get(g.id));
  gwTimers.set(g.id, setTimeout(() => { gwTimers.delete(g.id); message.edit({ embeds: [gwEmbed(gwGet(g.id))] }).catch(() => {}); }, 4000));
}
async function gwJoin(i) {
  const g = gwGet(i.customId.split(':')[1]);
  if (!g || g.status !== 'active' || g.ends <= Date.now()) return i.reply({ content: '⌛ هذي القرعة انتهت', flags: EPH });
  if (bl.get(i.user.id)) return i.reply({ content: bl.DENY, flags: EPH });
  if (g.req_role && !i.member.roles.cache.has(g.req_role)) return i.reply({ content: `🔒 لازم تملك رتبة <@&${g.req_role}> للمشاركة`, flags: EPH });
  const has = db.prepare('SELECT 1 FROM giveaway_entries WHERE gid=? AND user_id=?').get(g.id, i.user.id);
  if (has) db.prepare('DELETE FROM giveaway_entries WHERE gid=? AND user_id=?').run(g.id, i.user.id);
  else db.prepare('INSERT OR IGNORE INTO giveaway_entries(gid,user_id) VALUES(?,?)').run(g.id, i.user.id);
  gwTouch(g, i.message);
  return i.reply({ content: has ? '↩️ تم انسحابك من القرعة' : '✅ تم دخولك في القرعة، بالتوفيق! 🍀', flags: EPH });
}
async function gwTick(guild) {
  for (const g of db.prepare("SELECT id FROM giveaways WHERE status='active' AND ends<=?").all(Date.now())) await endGiveaway(guild, g.id).catch((e) => console.error('[giveaway]', e.message));
}

// ============================= الاقتراحات =============================
const sgGet = (id) => db.prepare('SELECT * FROM suggestions WHERE id=?').get(id);
const votes = (id) => ({ up: db.prepare('SELECT COUNT(*) c FROM suggestion_votes WHERE sid=? AND vote=1').get(id).c, down: db.prepare('SELECT COUNT(*) c FROM suggestion_votes WHERE sid=? AND vote=-1').get(id).c });
const SG = { pending: ['⏳ قيد المراجعة', COLOR], accepted: ['✅ تم القبول', 0x06d6a0], rejected: ['❌ تم الرفض', 0xef476f] };
function sgEmbed(s, user) {
  const e = new EmbedBuilder().setColor(SG[s.status][1]).setTitle(`💡 اقتراح #${s.id}`).setDescription(s.text.slice(0, 3900))
    .addFields({ name: 'الحالة', value: SG[s.status][0], inline: true }, { name: 'المقترح', value: `<@${s.user_id}>`, inline: true }).setTimestamp(s.created);
  if (user) e.setThumbnail(user.displayAvatarURL());
  if (s.staff_note) e.addFields({ name: '📝 رد الإدارة', value: s.staff_note.slice(0, 1000) });
  return e;
}
function sgRows(s) {
  const v = votes(s.id), done = s.status !== 'pending';
  const rows = [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`sg_up:${s.id}`).setLabel(String(v.up)).setEmoji('👍').setStyle(ButtonStyle.Success).setDisabled(done),
    new ButtonBuilder().setCustomId(`sg_down:${s.id}`).setLabel(String(v.down)).setEmoji('👎').setStyle(ButtonStyle.Danger).setDisabled(done))];
  if (!done) rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`sg_acc:${s.id}`).setLabel('قبول').setEmoji('✅').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`sg_rej:${s.id}`).setLabel('رفض').setEmoji('❌').setStyle(ButtonStyle.Secondary)));
  return rows;
}
const sgCool = new Map();
function sgCooldown(uid) { const left = (sgCool.get(uid) || 0) + (+S('suggest_cooldown') || 0) * 1000 - Date.now(); if (left > 0) return Math.ceil(left / 1000); sgCool.set(uid, Date.now()); return 0; }
async function postSuggestion(guild, user, text) {
  const ch = S('suggest_channel') && await guild.channels.fetch(S('suggest_channel')).catch(() => null);
  if (!ch) throw new Error('روم الاقتراحات غير محدد (الداشبورد ← أنظمة السيرفر)');
  const r = db.prepare('INSERT INTO suggestions(user_id,text,channel_id,created) VALUES(?,?,?,?)').run(user.id, text, ch.id, Date.now());
  const s = sgGet(r.lastInsertRowid);
  const msg = await ch.send({ embeds: [sgEmbed(s, user)], components: sgRows(s) });
  db.prepare('UPDATE suggestions SET msg_id=? WHERE id=?').run(msg.id, s.id);
  return { s: sgGet(s.id), msg };
}
async function decideSuggestion(guild, id, status, note, by) {
  const s = sgGet(id); if (!s) throw new Error('الاقتراح غير موجود');
  db.prepare('UPDATE suggestions SET status=?, staff_note=? WHERE id=?').run(status, note || '', id);
  const n = sgGet(id), ch = await guild.channels.fetch(n.channel_id).catch(() => null), msg = ch && await ch.messages.fetch(n.msg_id).catch(() => null);
  const user = await guild.client.users.fetch(n.user_id).catch(() => null);
  if (msg) await msg.edit({ embeds: [sgEmbed(n, user)], components: sgRows(n) }).catch(() => {});
  user?.send(`${status === 'accepted' ? '✅ تم قبول' : '❌ تم رفض'} اقتراحك #${n.id} في **${guild.name}**${note ? `\n📝 ${note}` : ''}`).catch(() => {});
  return n;
}
async function editSuggestion(guild, id, text) {
  const s = sgGet(id); if (!s) throw new Error('الاقتراح غير موجود');
  if (!text || text.trim().length < 3) throw new Error('النص قصير');
  db.prepare('UPDATE suggestions SET text=? WHERE id=?').run(text.trim().slice(0, 1000), id);
  const n = sgGet(id), ch = await guild.channels.fetch(n.channel_id).catch(() => null), msg = ch && n.msg_id && await ch.messages.fetch(n.msg_id).catch(() => null);
  if (msg) await msg.edit({ embeds: [sgEmbed(n, await guild.client.users.fetch(n.user_id).catch(() => null))], components: sgRows(n) }).catch(() => {});
  return n;
}
async function deleteSuggestion(guild, id) {
  const s = sgGet(id); if (!s) return;
  const ch = await guild.channels.fetch(s.channel_id).catch(() => null);
  (s.msg_id && ch && await ch.messages.fetch(s.msg_id).catch(() => null))?.delete().catch(() => {});
  db.prepare('DELETE FROM suggestion_votes WHERE sid=?').run(id); db.prepare('DELETE FROM suggestions WHERE id=?').run(id);
}
async function sgButton(i) {
  const [act, id] = i.customId.split(':'), s = sgGet(id);
  if (!s) return i.reply({ content: 'الاقتراح غير موجود', flags: EPH });
  if (act === 'sg_up' || act === 'sg_down') {
    if (s.status !== 'pending') return i.reply({ content: 'تم البت في هذا الاقتراح', flags: EPH });
    const v = act === 'sg_up' ? 1 : -1, cur = db.prepare('SELECT vote FROM suggestion_votes WHERE sid=? AND user_id=?').get(s.id, i.user.id);
    if (cur && cur.vote === v) db.prepare('DELETE FROM suggestion_votes WHERE sid=? AND user_id=?').run(s.id, i.user.id);
    else db.prepare('INSERT INTO suggestion_votes(sid,user_id,vote) VALUES(?,?,?) ON CONFLICT(sid,user_id) DO UPDATE SET vote=excluded.vote').run(s.id, i.user.id, v);
    return i.update({ components: sgRows(s) });
  }
  if (!isStaff(i.member)) return i.reply({ content: '❌ للستاف فقط', flags: EPH });
  return i.showModal(new ModalBuilder().setCustomId(`sg_note:${act === 'sg_acc' ? 'accepted' : 'rejected'}:${s.id}`).setTitle(act === 'sg_acc' ? 'قبول الاقتراح' : 'رفض الاقتراح').addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('note').setLabel('ملاحظة للعضو (اختياري)').setStyle(TextInputStyle.Paragraph).setMaxLength(500).setRequired(false))));
}

// ============================= الردود التلقائية =============================
const norm = (t) => String(t || '').toLowerCase().replace(/[ً-ٟـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').trim();
let arCache = null; const arCool = new Map();
const invalidateAuto = () => { arCache = null; };
function arRules() {
  if (!arCache) arCache = db.prepare('SELECT * FROM autoreplies WHERE enabled=1').all().map((r) => ({ ...r, trig: String(r.trigger).split(/[|\n]/).map(norm).filter(Boolean) }));
  return arCache;
}
function arMatch(r, text) {
  const t = norm(text), padded = ` ${t.replace(/[^\p{L}\p{N}]+/gu, ' ')} `;
  return r.trig.some((x) => r.match === 'exact' ? t === x : r.match === 'starts' ? t.startsWith(x) : r.match === 'word' ? padded.includes(` ${x} `) : t.includes(x));
}
async function arMessage(m) {
  if (!m.guild || m.author.bot || m.webhookId || S('autoreply_enabled') !== '1' || !m.content) return;
  if (m.content.startsWith(S('prefix') || '!')) return;
  const shop = /^(order|ticket)-\d+$/.test(m.channel.name || '');
  for (const r of arRules()) {
    if (r.channel_id ? r.channel_id !== m.channelId : shop) continue;
    if (!arMatch(r, m.content)) continue;
    const key = `${r.id}:${m.channelId}`, now = Date.now();
    if (now - (arCool.get(key) || 0) < (r.cooldown || 0) * 1000) return;
    arCool.set(key, now);
    const out = String(r.response).replace(/\{user\}/g, `<@${m.author.id}>`).replace(/\{name\}/g, m.member?.displayName || m.author.username).replace(/\{server\}/g, m.guild.name).replace(/\{channel\}/g, `<#${m.channelId}>`).slice(0, 2000);
    const opts = { content: out, allowedMentions: { parse: [], users: [m.author.id], repliedUser: false } };
    return r.reply ? m.reply(opts).catch(() => {}) : m.channel.send(opts).catch(() => {});
  }
}

// ============================= رتب الأزرار =============================
const rpGet = (id) => db.prepare('SELECT * FROM role_panels WHERE id=?').get(id);
const rpRoles = (p) => { try { return JSON.parse(p.roles); } catch { return []; } };
function rpMessage(guild, p) {
  const roles = rpRoles(p).filter((r) => guild.roles.cache.has(r.role_id));
  const e = new EmbedBuilder().setColor(COLOR).setTitle(p.title || '🏷️ اختر رتبك').setDescription(`${p.description ? p.description + '\n\n' : ''}${roles.map((r) => `${r.emoji || '▫️'} <@&${r.role_id}>`).join('\n')}\n\n*اضغط الزر لأخذ الرتبة، واضغطه مرة ثانية لإزالتها.*`);
  const rows = [];
  roles.slice(0, 25).forEach((r, n) => {
    if (n % 5 === 0) rows.push(new ActionRowBuilder());
    const b = new ButtonBuilder().setCustomId(`br:${p.id}:${r.role_id}`).setLabel((r.label || guild.roles.cache.get(r.role_id).name).slice(0, 80)).setStyle(ButtonStyle.Secondary);
    if (r.emoji) b.setEmoji(r.emoji);
    rows[rows.length - 1].addComponents(b);
  });
  return { embeds: [e], components: rows };
}
async function sendRolePanel(guild, { channelId, title, description, roles, mode = 'toggle' }) {
  const ch = await guild.channels.fetch(channelId).catch(() => null); if (!ch) throw new Error('الروم غير موجود');
  const clean = (roles || []).filter((r) => guild.roles.cache.has(r.role_id));
  if (!clean.length) throw new Error('اختر رتبة واحدة على الأقل');
  const bad = clean.find((r) => dangerous(guild.roles.cache.get(r.role_id)));
  if (bad) throw new Error(`الرتبة «${guild.roles.cache.get(bad.role_id).name}» فيها صلاحيات إدارية، ممنوع توزيعها بالأزرار`);
  const r = db.prepare('INSERT INTO role_panels(channel_id,title,description,roles,mode) VALUES(?,?,?,?,?)').run(ch.id, title || '', description || '', JSON.stringify(clean.slice(0, 25)), mode === 'single' ? 'single' : 'toggle');
  const p = rpGet(r.lastInsertRowid), msg = await ch.send(rpMessage(guild, p));
  db.prepare('UPDATE role_panels SET msg_id=? WHERE id=?').run(msg.id, p.id);
  return rpGet(p.id);
}
async function resendRolePanel(guild, id) {
  const p = rpGet(id); if (!p) throw new Error('غير موجود');
  const ch = await guild.channels.fetch(p.channel_id).catch(() => null); if (!ch) throw new Error('الروم محذوف');
  const old = p.msg_id && await ch.messages.fetch(p.msg_id).catch(() => null);
  if (old) { await old.edit(rpMessage(guild, p)); return p; }
  const msg = await ch.send(rpMessage(guild, p)); db.prepare('UPDATE role_panels SET msg_id=? WHERE id=?').run(msg.id, p.id); return rpGet(p.id);
}
async function deleteRolePanel(guild, id) {
  const p = rpGet(id); if (!p) return;
  const ch = await guild.channels.fetch(p.channel_id).catch(() => null);
  (p.msg_id && ch && await ch.messages.fetch(p.msg_id).catch(() => null))?.delete().catch(() => {});
  db.prepare('DELETE FROM role_panels WHERE id=?').run(id);
}
async function rpClick(i) {
  const [, pid, rid] = i.customId.split(':'), p = rpGet(pid);
  if (!p || !rpRoles(p).some((r) => r.role_id === rid)) return i.reply({ content: '⚠️ هذا البانل غير موجود أو تم تعديله', flags: EPH });
  const role = i.guild.roles.cache.get(rid);
  if (!role) return i.reply({ content: '⚠️ الرتبة محذوفة', flags: EPH });
  if (dangerous(role) || role.managed || role.position >= i.guild.members.me.roles.highest.position) return i.reply({ content: '❌ ما أقدر أعطيك هذي الرتبة', flags: EPH });
  await i.deferReply({ flags: EPH });
  if (i.member.roles.cache.has(rid)) { await i.member.roles.remove(rid).catch(() => {}); return i.editReply(`➖ تمت إزالة <@&${rid}>`); }
  if (p.mode === 'single') for (const r of rpRoles(p)) if (r.role_id !== rid && i.member.roles.cache.has(r.role_id)) await i.member.roles.remove(r.role_id).catch(() => {});
  await i.member.roles.add(rid).catch(() => {});
  return i.editReply(`➕ تم إعطاؤك <@&${rid}>`);
}

// ============================= الإعلانات =============================
const TEMPLATES = {
  custom: { title: '📢 إعلان', body: '' },
  offer: { title: '🎁 عرض خاص', body: 'عرض لفترة محدودة على بوتات المتجر!\n\n• اكتب تفاصيل العرض هنا\n• ينتهي العرض: ...\n\nاطلب الآن من روم **اطلب-بوت** 🛒' },
  new_bot: { title: '🆕 بوت جديد في المتجر', body: 'أضفنا بوت جديد: **اسم البوت**\n\n✨ المميزات:\n• ...\n• ...\n\nاطلبه الآن من روم الطلبات.' },
  store_open: { title: '🟢 المتجر مفتوح', body: 'تم فتح المتجر لاستقبال الطلبات، اطلب بوتك الآن من روم **اطلب-بوت** 🛒', action: () => setS('store_open', '1') },
  store_closed: { title: '🔴 المتجر مغلق مؤقتاً', body: 'المتجر مغلق مؤقتاً عن استقبال الطلبات، وسنعود قريباً. شكراً لتفهمكم 💜', action: () => setS('store_open', '0') },
  maintenance: { title: '🛠️ صيانة', body: 'سيكون السيرفر/الخدمات تحت الصيانة لفترة قصيرة. نعتذر عن أي إزعاج.' },
  update: { title: '✨ تحديث جديد', body: 'تم تحديث السيرفر/المتجر:\n\n• ...\n• ...' },
};
const annPending = new Map();
async function sendAnnouncement(guild, { channelId, title, body, color, image, ping = 'none', roleId, plain = false, by }) {
  const ch = await guild.channels.fetch(channelId || S('announce_channel')).catch(() => null);
  if (!ch) throw new Error('حدد روم الإعلان');
  const role = roleId || (ping === 'role' ? S('announce_ping_role') : '');
  const content = ping === 'everyone' ? '@everyone' : ping === 'here' ? '@here' : ping === 'role' && role ? `<@&${role}>` : '';
  const allowed = { parse: ping === 'everyone' || ping === 'here' ? ['everyone'] : [], roles: ping === 'role' && role ? [role] : [] };
  const text = String(body || '').replace(/\{server\}/g, guild.name);
  if (plain) return ch.send({ content: [content, title ? `**${title}**` : '', text].filter(Boolean).join('\n').slice(0, 2000), allowedMentions: allowed });
  const c = /^#?[0-9a-f]{6}$/i.test(color || '') ? parseInt(color.replace('#', ''), 16) : COLOR;
  const e = new EmbedBuilder().setColor(c).setTitle(title || '📢 إعلان').setDescription(text.slice(0, 4000)).setFooter({ text: guild.name, iconURL: guild.iconURL() || undefined }).setTimestamp();
  if (image) e.setImage(image);
  return ch.send({ content: content || undefined, embeds: [e], allowedMentions: allowed });
}

// ============================= الأوامر =============================
const chOpt = (o, d = 'الروم') => o.setName('channel').setDescription(d).addChannelTypes(...textChannels);
const commands = [
  new SlashCommandBuilder().setName('giveaway').setDescription('نظام القرعات').setDefaultMemberPermissions(P.ManageGuild)
    .addSubcommand((s) => s.setName('start').setDescription('بدء قرعة')
      .addStringOption((o) => o.setName('prize').setDescription('الجائزة').setRequired(true))
      .addStringOption((o) => o.setName('duration').setDescription('المدة: 30m أو 2h أو 1d').setRequired(true))
      .addIntegerOption((o) => o.setName('winners').setDescription('عدد الفائزين').setMinValue(1).setMaxValue(50))
      .addChannelOption((o) => chOpt(o)).addRoleOption((o) => o.setName('role').setDescription('رتبة مطلوبة للمشاركة')))
    .addSubcommand((s) => s.setName('end').setDescription('إنهاء قرعة الآن').addIntegerOption((o) => o.setName('id').setDescription('رقم القرعة').setRequired(true)))
    .addSubcommand((s) => s.setName('reroll').setDescription('إعادة سحب فائز جديد').addIntegerOption((o) => o.setName('id').setDescription('رقم القرعة').setRequired(true)).addIntegerOption((o) => o.setName('count').setDescription('عدد الفائزين الجدد').setMinValue(1)))
    .addSubcommand((s) => s.setName('list').setDescription('القرعات الجارية')),
  new SlashCommandBuilder().setName('suggest').setDescription('أرسل اقتراح للسيرفر'),
  new SlashCommandBuilder().setName('role-panel').setDescription('إنشاء بانل رتب بالأزرار').setDefaultMemberPermissions(P.Administrator)
    .addStringOption((o) => o.setName('title').setDescription('عنوان البانل').setRequired(true))
    .addRoleOption((o) => o.setName('role1').setDescription('رتبة 1').setRequired(true))
    .addRoleOption((o) => o.setName('role2').setDescription('رتبة 2')).addRoleOption((o) => o.setName('role3').setDescription('رتبة 3'))
    .addRoleOption((o) => o.setName('role4').setDescription('رتبة 4')).addRoleOption((o) => o.setName('role5').setDescription('رتبة 5'))
    .addStringOption((o) => o.setName('mode').setDescription('طريقة الاختيار').addChoices({ name: 'أي عدد من الرتب', value: 'toggle' }, { name: 'رتبة وحدة فقط', value: 'single' }))
    .addChannelOption((o) => chOpt(o)),
  new SlashCommandBuilder().setName('announce').setDescription('إرسال إعلان جاهز (قوالب)').setDefaultMemberPermissions(P.ManageMessages)
    .addStringOption((o) => o.setName('template').setDescription('القالب').addChoices(
      { name: 'إعلان حر', value: 'custom' }, { name: 'عرض خاص', value: 'offer' }, { name: 'بوت جديد', value: 'new_bot' },
      { name: 'فتح المتجر (يفتحه تلقائياً)', value: 'store_open' }, { name: 'إغلاق المتجر (يقفله تلقائياً)', value: 'store_closed' },
      { name: 'صيانة', value: 'maintenance' }, { name: 'تحديث', value: 'update' }))
    .addChannelOption((o) => chOpt(o, 'روم الإعلان'))
    .addStringOption((o) => o.setName('ping').setDescription('المنشن').addChoices({ name: 'بدون', value: 'none' }, { name: '@everyone', value: 'everyone' }, { name: '@here', value: 'here' }, { name: 'رتبة الإعلانات', value: 'role' }))
    .addRoleOption((o) => o.setName('role').setDescription('رتبة منشن مخصصة'))
    .addAttachmentOption((o) => o.setName('image').setDescription('صورة للإعلان'))
    .addStringOption((o) => o.setName('color').setDescription('لون الإيمبد HEX مثل #9b6bff'))
    .addBooleanOption((o) => o.setName('plain').setDescription('إرسال كنص عادي بدل إيمبد')),
].map((c) => c.toJSON());

async function onCommand(i) {
  switch (i.commandName) {
    case 'giveaway': {
      if (!isStaff(i.member)) return i.reply({ content: '❌ للإدارة فقط', flags: EPH }), true;
      const sub = i.options.getSubcommand();
      try {
        if (sub === 'start') {
          const ms = parseDur(i.options.getString('duration')); if (!ms) return i.reply({ content: '❌ مدة غير صحيحة (مثال: 30m, 2h, 1d)', flags: EPH }), true;
          await i.deferReply({ flags: EPH });
          const g = await createGiveaway(i.guild, { channelId: (i.options.getChannel('channel') || { id: S('gw_channel') || i.channelId }).id, prize: i.options.getString('prize'), ms, winners: i.options.getInteger('winners') || 1, host: i.user.id, reqRole: i.options.getRole('role')?.id });
          return i.editReply(`✅ بدأت القرعة #${g.id} في <#${g.channel_id}>`), true;
        }
        if (sub === 'end') { await i.deferReply({ flags: EPH }); const r = await endGiveaway(i.guild, i.options.getInteger('id')); return i.editReply(`✅ انتهت القرعة — الفائزون: ${r.winners.map((x) => `<@${x}>`).join(' ') || 'لا أحد'}`), true; }
        if (sub === 'reroll') { await i.deferReply({ flags: EPH }); const r = await endGiveaway(i.guild, i.options.getInteger('id'), { reroll: true, count: i.options.getInteger('count') || undefined }); return i.editReply(`🔁 الفائزون الجدد: ${r.winners.map((x) => `<@${x}>`).join(' ') || 'لا أحد'}`), true; }
        const rows = db.prepare("SELECT * FROM giveaways WHERE status='active' ORDER BY ends").all();
        return i.reply({ flags: EPH, content: rows.map((g) => `**#${g.id}** ${g.prize} — تنتهي <t:${ts(g.ends)}:R> — ${gwCount(g.id)} مشارك`).join('\n') || 'ما فيه قرعات جارية' }), true;
      } catch (e) { return (i.deferred ? i.editReply(`❌ ${e.message}`) : i.reply({ content: `❌ ${e.message}`, flags: EPH })), true; }
    }
    case 'suggest': {
      if (!S('suggest_channel')) return i.reply({ content: '❌ نظام الاقتراحات غير مفعّل بعد', flags: EPH }), true;
      if (bl.get(i.user.id)) return i.reply({ content: bl.DENY, flags: EPH }), true;
      await i.showModal(new ModalBuilder().setCustomId('sg_modal').setTitle('اقتراح جديد').addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('text').setLabel('اكتب اقتراحك').setStyle(TextInputStyle.Paragraph).setMinLength(8).setMaxLength(1000).setRequired(true))));
      return true;
    }
    case 'role-panel': {
      await i.deferReply({ flags: EPH });
      try {
        const roles = [1, 2, 3, 4, 5].map((n) => i.options.getRole(`role${n}`)).filter(Boolean).map((r) => ({ role_id: r.id, label: r.name, emoji: '' }));
        await sendRolePanel(i.guild, { channelId: (i.options.getChannel('channel') || i.channel).id, title: i.options.getString('title'), roles, mode: i.options.getString('mode') || 'toggle' });
        await i.editReply('✅ تم إرسال البانل. للتخصيص (إيموجي/أسماء/وصف) استخدم الداشبورد ← 🏷️ رتب الأزرار');
      } catch (e) { await i.editReply(`❌ ${e.message}`); }
      return true;
    }
    case 'announce': {
      if (!isStaff(i.member) && !i.memberPermissions.has(P.ManageMessages)) return i.reply({ content: '❌ للإدارة فقط', flags: EPH }), true;
      const key = `${i.user.id}:${Date.now()}`, tpl = TEMPLATES[i.options.getString('template') || 'custom'] || TEMPLATES.custom;
      annPending.set(key, {
        exp: Date.now() + 15 * 6e4, template: i.options.getString('template') || 'custom', channelId: i.options.getChannel('channel')?.id || S('announce_channel') || i.channelId,
        ping: i.options.getString('ping') || 'none', roleId: i.options.getRole('role')?.id, image: i.options.getAttachment('image')?.url, color: i.options.getString('color'), plain: !!i.options.getBoolean('plain'),
      });
      for (const [k, v] of annPending) if (v.exp < Date.now()) annPending.delete(k);
      await i.showModal(new ModalBuilder().setCustomId(`an_modal:${key}`).setTitle('نص الإعلان').addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('title').setLabel('العنوان').setStyle(TextInputStyle.Short).setMaxLength(200).setValue(tpl.title).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('body').setLabel('النص (اكتب {server} لاسم السيرفر)').setStyle(TextInputStyle.Paragraph).setMaxLength(3900).setValue(tpl.body || ' ').setRequired(true))));
      return true;
    }
  }
  return false;
}

async function handle(i) {
  const id = i.customId || '';
  if (i.isButton()) {
    if (id.startsWith('gw_join:')) return await gwJoin(i), true;
    if (/^sg_(up|down|acc|rej):/.test(id)) return await sgButton(i), true;
    if (id.startsWith('br:')) return await rpClick(i), true;
    return false;
  }
  if (i.isModalSubmit()) {
    if (id === 'sg_modal') {
      const wait = sgCooldown(i.user.id); if (wait) return await i.reply({ content: `⏳ انتظر ${wait} ثانية قبل اقتراح جديد`, flags: EPH }), true;
      try { const { s } = await postSuggestion(i.guild, i.user, i.fields.getTextInputValue('text')); await i.reply({ content: `✅ تم إرسال اقتراحك #${s.id} <#${s.channel_id}>`, flags: EPH }); }
      catch (e) { await i.reply({ content: `❌ ${e.message}`, flags: EPH }); }
      return true;
    }
    if (id.startsWith('sg_note:')) {
      const [, status, sid] = id.split(':');
      if (!isStaff(i.member)) return await i.reply({ content: '❌ للستاف فقط', flags: EPH }), true;
      await decideSuggestion(i.guild, sid, status, i.fields.getTextInputValue('note'), i.user.id).catch((e) => console.error(e));
      await i.reply({ content: status === 'accepted' ? '✅ تم قبول الاقتراح' : '❌ تم رفض الاقتراح', flags: EPH }); return true;
    }
    if (id.startsWith('an_modal:')) {
      const key = id.slice(9), a = annPending.get(key); annPending.delete(key);
      if (!a) return await i.reply({ content: '⌛ انتهت الجلسة، أعد كتابة الأمر', flags: EPH }), true;
      await i.deferReply({ flags: EPH });
      try {
        const m = await sendAnnouncement(i.guild, { ...a, title: i.fields.getTextInputValue('title'), body: i.fields.getTextInputValue('body').trim() });
        TEMPLATES[a.template]?.action?.();
        await i.editReply(`✅ تم إرسال الإعلان ${m.url}${TEMPLATES[a.template]?.action ? '\n(تم تحديث حالة المتجر تلقائياً)' : ''}`);
      } catch (e) { await i.editReply(`❌ ${e.message}`); }
      return true;
    }
  }
  return false;
}

function init(client) {
  client.on('messageCreate', async (m) => {
    try {
      await arMessage(m);
      // تحويل رسائل روم الاقتراحات إلى اقتراحات منظمة
      if (m.guild && !m.author.bot && S('suggest_auto') === '1' && S('suggest_channel') && m.channelId === S('suggest_channel')) {
        const mem = m.member || await m.guild.members.fetch(m.author.id).catch(() => null);
        if (isStaff(mem) || m.content.trim().length < 5) return;
        const text = m.content.trim(); await m.delete().catch(() => {});
        const wait = sgCooldown(m.author.id);
        if (wait) return m.author.send(`⏳ انتظر ${wait} ثانية قبل اقتراح جديد.`).catch(() => {});
        await postSuggestion(m.guild, m.author, text).catch(() => {});
      }
    } catch (e) { console.error('[community]', e); }
  });
  const tick = () => { const g = client.guilds.cache.get(process.env.GUILD_ID); if (g) gwTick(g).catch(console.error); };
  setTimeout(tick, 10e3); setInterval(tick, 15e3);
}

module.exports = {
  commands, onCommand, handle, init, invalidateAuto, TEMPLATES, dangerous,
  createGiveaway, endGiveaway, editGiveaway, deleteGiveaway, gwCount, decideSuggestion, editSuggestion, deleteSuggestion, sendRolePanel, resendRolePanel, deleteRolePanel, rpGet, rpRoles, sendAnnouncement,
};
// تم صنع البوت بمتجر نوفا ستور • يوزر الاونر: .5yb.
