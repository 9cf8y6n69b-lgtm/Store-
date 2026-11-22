// ربط المبيعات بالبوتات المستضافة: بعد الدفع ← «أضف بوتك» ← تشغيل ← سجل المشترين ← تنبيهات الاشتراك
const {
  SlashCommandBuilder, PermissionFlagsBits: P, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const { db, S, setS } = require('./hdb');
const hb = require('./manager');
const PK = require('./packages');
const T = require('./templates');
const sec = require('./secure');
const EPH = 64, COLOR = 0x9b6bff, SIGN = 'تم صنع البوت بمتجر نوفا ستور • .5yb.';
let main = null;
const ts = (ms) => Math.floor(ms / 1000);
const jp = (s, d) => { try { return JSON.parse(s); } catch { return d; } };
const TS = require('../void/utils/ticketSystem'), St = require('../void/utils/store');
const isStaff = (m) => !!m && (m.permissions.has(P.Administrator) || TS.isStaff(m, TS.getConfig(m.guild.id)) || (S('staff_role') && m.roles.cache.has(S('staff_role'))) || (S('hosted_review_role') && m.roles.cache.has(S('hosted_review_role'))));
const adapt = (o) => (o ? { id: o.id, user_id: o.userId, channel_id: o.channelId, items: JSON.stringify(o.items || []), status: o.status } : null);
const getOrder = (id) => adapt(St.getOrder(id));
const tLabel = (id) => { const t = T.get(id); return t ? `${t.emoji} ${t.label}` : id; };
const RIGHTS = { config: 'تعديل إعدادات الأنظمة', power: 'تشغيل/إيقاف البوت', presence: 'تغيير حالة البوت', logs: 'سجل أحداث البوت', portal: 'لوحة تحكم خاصة' };
const rightsText = (r) => Object.entries(RIGHTS).map(([k, v]) => `${r?.[k] ? '✅' : '❌'} ${v}`).join('\n');
const E = () => new EmbedBuilder().setColor(COLOR).setFooter({ text: SIGN });
const row = (...b) => new ActionRowBuilder().addComponents(...b);
const btn = (id, label, style, emoji) => new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style || ButtonStyle.Secondary).setEmoji(emoji || '🔹');

// ============ الأوامر ============
const commands = [
  new SlashCommandBuilder().setName('bots-panel').setDescription('تحديد روم سجل المشترين والبوتات المستضافة').setDefaultMemberPermissions(P.Administrator)
    .addChannelOption((o) => o.setName('channel').setDescription('الروم (الافتراضي الحالي)')),
  new SlashCommandBuilder().setName('bot-plan').setDescription('تحديد باقة المشتري واسم بوته وحقوقه (داخل تكت الطلب)').setDefaultMemberPermissions(P.ManageGuild)
    .addStringOption((o) => o.setName('package').setDescription('الباقة').setRequired(true).addChoices(...PK.list().map((p) => ({ name: `${p.emoji} ${p.label}`, value: p.id }))))
    .addStringOption((o) => o.setName('name').setDescription('اسم بوت المشتري'))
    .addIntegerOption((o) => o.setName('days').setDescription('مدة الاشتراك بالأيام').setMinValue(1).setMaxValue(3650))
    .addStringOption((o) => o.setName('extra').setDescription('أنظمة إضافية (ids مفصولة بفاصلة مثل music,ai)'))
    .addBooleanOption((o) => o.setName('can_config').setDescription('يعدّل إعدادات الأنظمة'))
    .addBooleanOption((o) => o.setName('can_power').setDescription('يشغّل ويوقف'))
    .addBooleanOption((o) => o.setName('can_presence').setDescription('يغيّر حالة البوت'))
    .addBooleanOption((o) => o.setName('can_logs').setDescription('يشوف سجل البوت'))
    .addBooleanOption((o) => o.setName('can_portal').setDescription('عنده لوحة تحكم خاصة'))
    .addIntegerOption((o) => o.setName('order').setDescription('رقم الطلب (الافتراضي طلب الروم الحالي)')),
  new SlashCommandBuilder().setName('my-bots').setDescription('بوتاتك واشتراكاتك'),
  new SlashCommandBuilder().setName('renew').setDescription('اطلب تجديد اشتراك بوتك'),
  new SlashCommandBuilder().setName('packages').setDescription('عرض الباقات'),
].map((c) => c.toJSON());

const orderOf = (i) => { const n = i.options.getInteger?.('order'); return n ? getOrder(n) : adapt(St.byChannel(i.channelId)[0]); };

function packagesEmbed() {
  const e = E().setTitle('📦 باقات Nova Store').setDescription('كل باقة تحتوي اللي قبلها وزيادة 👇');
  for (const p of PK.list()) e.addFields({ name: `${p.emoji} باقة ${p.label}`, value: `${p.perks.map((x) => `• ${x}`).join('\n')}\n**الأنظمة:** ${p.templates.map(tLabel).join('، ')}` });
  return e;
}

async function onCommand(i) {
  const n = i.commandName;
  if (n === 'packages') return i.reply({ embeds: [packagesEmbed()] }), true;
  if (n === 'renew') {
    const mine = hb.list().filter((b) => b.owner_id === i.user.id); if (!mine.length) return i.reply({ content: 'ما عندك بوتات مستضافة', flags: EPH }), true;
    const room = S('hosted_registry_channel') && await i.client.channels.fetch(S('hosted_registry_channel')).catch(() => null);
    if (room) await room.send({ content: S('staff_role') ? `<@&${S('staff_role')}>` : undefined, embeds: [E().setColor(0x06d6a0).setTitle('🔁 طلب تجديد').setDescription(mine.map((b) => `**${b.name}** #${b.id} — ينتهي ${b.expires ? `<t:${ts(b.expires)}:R>` : 'مفتوح'}`).join('\n') + `\nالعميل: ${i.user} (\`${i.user.id}\`)\nبعد التأكد من الدفع اضغط **+30 يوم** في بطاقة البوت.`)], allowedMentions: { roles: S('staff_role') ? [S('staff_role')] : [] } }).catch(() => {});
    return i.reply({ content: `🔁 وصل طلب تجديدك للإدارة. أو ادخل ${S('hosted_renew_link') || ''} وافتح طلب جديد.`, flags: EPH }), true;
  }
  if (n === 'my-bots') {
    const rows = hb.list().filter((b) => b.owner_id === i.user.id);
    if (!rows.length) return i.reply({ content: 'ما عندك بوتات مستضافة للحين 🤖', flags: EPH }), true;
    return i.reply({ flags: EPH, embeds: rows.map((b) => E().setTitle(`${PK.get(b.package)?.emoji || '🤖'} ${b.name}`).setDescription(`${b.state === 'online' ? '🟢 شغال' : '⚪ متوقف'}${b.suspended ? ' • ⛔ موقوف من الإدارة' : ''}\n**ينتهي:** ${b.expires ? `<t:${ts(b.expires)}:R>` : 'مفتوح'}\n**الأنظمة:** ${b.templates.map(tLabel).join('، ')}\n${b.rights?.portal ? '🖥️ لوحة تحكمك: `/portal` على رابط الداشبورد برقم البوت **' + b.id + '** ومفتاحك' : ''}`)) }), true;
  }
  if (!isStaff(i.member)) return i.reply({ content: '❌ للستاف فقط', flags: EPH }), true;
  if (n === 'bots-panel') {
    const ch = i.options.getChannel('channel') || i.channel; setS('hosted_registry_channel', ch.id);
    await i.deferReply({ flags: EPH }); db.prepare("UPDATE hosted_bots SET registry_msg=''").run(); await refreshAll();
    return i.editReply(`✅ سجل المشترين والبوتات صار في ${ch}`), true;
  }
  if (n === 'bot-plan') {
    const o = orderOf(i); if (!o) return i.reply({ content: '❌ استخدم الأمر داخل روم طلب أو حدد رقم الطلب', flags: EPH }), true;
    const g = (k) => i.options.getBoolean(k); const pkg = PK.get(i.options.getString('package'));
    const extra = (i.options.getString('extra') || '').split(/[,\s]+/).filter((x) => T.get(x)), prev = db.prepare('SELECT * FROM hosted_plans WHERE order_id=?').get(o.id);
    const rights = { ...pkg.rights, ...(prev ? jp(prev.rights, {}) : {}) };
    for (const [opt, k] of [['can_config', 'config'], ['can_power', 'power'], ['can_presence', 'presence'], ['can_logs', 'logs'], ['can_portal', 'portal']]) if (g(opt) !== null) rights[k] = g(opt) ? 1 : 0;
    const name = i.options.getString('name') || prev?.name || '', days = i.options.getInteger('days') || prev?.days || pkg.days;
    const tpls = [...new Set([...pkg.templates, ...extra])];
    db.prepare('INSERT OR REPLACE INTO hosted_plans(order_id,package,name,templates,rights,days,updated) VALUES(?,?,?,?,?,?,?)').run(o.id, pkg.id, name, JSON.stringify(tpls), JSON.stringify(rights), days, Date.now());
    const bot = hb.list().find((b) => b.order_id === o.id);
    if (bot) hb.update(bot.id, { package: pkg.id, rights, ...(name ? { name } : {}) });
    const e = E().setColor(pkg.color).setTitle(`${pkg.emoji} خطة الطلب #${o.id}`).addFields(
      { name: 'المشتري', value: `<@${o.user_id}> (\`${o.user_id}\`)`, inline: true }, { name: 'الباقة', value: `${pkg.emoji} ${pkg.label}`, inline: true }, { name: 'المدة', value: `${days} يوم`, inline: true },
      { name: 'اسم البوت', value: name || '— (يختاره المشتري)' }, { name: 'الأنظمة', value: tpls.map(tLabel).join('، ') }, { name: 'حقوق المشتري', value: rightsText(rights) });
    await i.reply({ embeds: [e] }); if (bot) refreshOne(bot.id); return true;
  }
  return false;
}

// ============ بعد الدفع ============
async function onPaid(guild, o, channel) {
  const plan = PK.planFor(o); if (!plan.templates.length) return;                // بوت مخصص بالكامل ← يدوي
  if (S(`hbp_${o.id}`)) return; setS(`hbp_${o.id}`, '1');
  const ch = channel || (o.channel_id && await guild.channels.fetch(o.channel_id).catch(() => null)); if (!ch) return;
  const e = E().setColor(plan.pkg.color).setTitle(`${plan.pkg.emoji} باقة ${plan.pkg.label} — جاهزة للتشغيل`)
    .setDescription(`${S('hosted_addbot_msg')}\n\n**المشتري:** <@${o.user_id}>`)
    .addFields({ name: '🧩 أنظمة بوتك', value: plan.templates.map(tLabel).join('\n') || '—', inline: true }, { name: '🔐 حقوقك', value: rightsText(plan.rights), inline: true }, { name: '⏳ مدة الاشتراك', value: `${plan.days} يوم`, inline: true });
  const staff = S('staff_role') ? `<@&${S('staff_role')}> ` : '';
  await ch.send({ content: `<@${o.user_id}> ${staff}`, embeds: [e], components: [row(btn(`hbs_add:${o.id}`, 'أضف بوتك', ButtonStyle.Success, '🤖'))], allowedMentions: { users: [o.user_id], roles: S('staff_role') ? [S('staff_role')] : [] } });
}

// ============ التفاعلات ============
async function handle(i) {
  if (i.isButton() && i.customId.startsWith('hbs_add:')) {
    const o = getOrder(+i.customId.split(':')[1]); if (!o) return i.reply({ content: 'الطلب غير موجود', flags: EPH }), true;
    if (i.user.id !== o.user_id && !isStaff(i.member)) return i.reply({ content: '❌ هذا الزر للمشتري فقط', flags: EPH }), true;
    if (hb.list().some((b) => b.order_id === o.id)) return i.reply({ content: '✅ تم إضافة بوت لهذا الطلب من قبل. تقدر تدير بوتك من `/my-bots`.', flags: EPH }), true;
    const plan = PK.planFor(o), inp = (id, label, ph, req = true, style = TextInputStyle.Short) => new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(id).setLabel(label).setPlaceholder(ph).setStyle(style).setRequired(req));
    await i.showModal(new ModalBuilder().setCustomId(`hbs_modal:${o.id}`).setTitle('🤖 أضف بوتك').addComponents(
      inp('token', 'توكن البوت (Bot Token)', 'من Developer Portal ← Bot ← Reset Token'), inp('guild', 'ايدي السيرفر', 'كليك يمين على السيرفر ← Copy Server ID'),
      inp('name', 'اسم البوت (اختياري)', plan.name || 'مثال: بوت سيرفر أحمد', false)));
    return true;
  }
  if (i.isModalSubmit() && i.customId.startsWith('hbs_modal:')) {
    const o = getOrder(+i.customId.split(':')[1]); if (!o) return i.reply({ content: 'الطلب غير موجود', flags: EPH }), true;
    if (i.user.id !== o.user_id && !isStaff(i.member)) return i.reply({ content: '❌', flags: EPH }), true;
    await i.deferReply({ flags: EPH });
    try {
      if (hb.list().some((b) => b.order_id === o.id)) throw new Error('تم إضافة بوت لهذا الطلب من قبل');
      const plan = PK.planFor(o), name = i.fields.getTextInputValue('name').trim() || plan.name || `بوت ${i.user.username}`;
      const bot = hb.create({ name, token: i.fields.getTextInputValue('token'), templates: plan.templates, guildId: i.fields.getTextInputValue('guild').trim(), ownerId: o.user_id, orderId: o.id, days: plan.days, pkg: plan.pkg.id, rights: plan.rights, channelId: o.channel_id });
      let key = ''; if (plan.rights.portal) { key = sec.newKey(); const salt = require('crypto').randomBytes(16).toString('hex'); db.prepare('UPDATE hosted_bots SET portal_salt=?, portal_hash=? WHERE id=?').run(salt, sec.hashKey(key, salt), bot.id); }
      const start = await hb.start(bot.id).then(() => '', (e) => `\n⚠️ ما قدر يشتغل: ${e.message}`);
      const v = hb.view(hb.get(bot.id));
      await i.editReply({ embeds: [E().setColor(plan.pkg.color).setTitle('✅ تم إضافة بوتك').setDescription(`${v.invite ? `**1.** [اضغط هنا لدعوة البوت لسيرفرك](${v.invite})\n` : ''}**2.** البوت يسجّل أوامره تلقائياً بمجرد دخوله\n**3.** جرّب الأوامر في سيرفرك 🚀${start}${key ? `\n\n🖥️ **لوحة التحكم:** افتح \`/portal\` على رابط الداشبورد\nرقم البوت: \`${bot.id}\`\nمفتاحك: \`${key}\`\n*احفظه، ما يظهر مرة ثانية.*` : ''}`)] });
      if (i.channel) await i.channel.send({ embeds: [E().setColor(plan.pkg.color).setTitle('🤖 تم تشغيل بوت المشتري').setDescription(`${plan.pkg.emoji} **${v.name}** — <@${o.user_id}>\nالسيرفر: \`${v.guild_id}\`\nينتهي: ${v.expires ? `<t:${ts(v.expires)}:D>` : 'مفتوح'}`)] }).catch(() => {});
      refreshOne(bot.id);
    } catch (e) { await i.editReply(`❌ ${e.message}`); }
    return true;
  }
  if (i.isButton() && i.customId.startsWith('hbr:')) {
    if (!isStaff(i.member)) return i.reply({ content: '❌ للستاف فقط', flags: EPH }), true;
    const [, act, id] = i.customId.split(':'), b = hb.get(+id); if (!b) return i.reply({ content: 'البوت محذوف', flags: EPH }), true;
    await i.deferReply({ flags: EPH });
    try {
      if (act === 'off') await hb.suspend(b.id, true); else if (act === 'on') await hb.suspend(b.id, false);
      else if (act === 'restart') await hb.restart(b.id);
      else if (act === 'ext') hb.update(b.id, { addDays: 30 });
      else if (act === 'del') { await hb.remove(b.id); await i.message.delete().catch(() => {}); return i.editReply('🗑️ تم حذف البوت'), true; }
      await i.editReply({ off: '⛔ تم فصل البوت', on: '✅ تم تشغيل البوت', restart: '🔄 تمت إعادة التشغيل', ext: '⏳ تم تمديد 30 يوم' }[act]); refreshOne(b.id);
    } catch (e) { await i.editReply(`❌ ${e.message}`); }
    return true;
  }
  return false;
}

// ============ سجل المشترين ============
function registryEmbed(b) {
  const p = PK.get(b.package), st = b.suspended ? '⛔ مفصول' : b.state === 'online' ? '🟢 شغال' : b.state === 'error' ? `🔴 خطأ` : '⚪ متوقف', g = hb.clientOf(b.id)?.guilds.cache.get(b.guild_id);
  return E().setColor(b.suspended ? 0x8d99ae : p?.color || COLOR).setTitle(`${p?.emoji || '🤖'} ${b.name} #${b.id}`)
    .addFields(
      { name: '👤 المشتري', value: b.owner_id ? `<@${b.owner_id}>\n\`${b.owner_id}\`` : '—', inline: true },
      { name: '🏠 السيرفر', value: `${g ? g.name + '\n' : ''}\`${b.guild_id || 'غير محدد'}\``, inline: true },
      { name: '📦 الباقة', value: p ? `${p.emoji} ${p.label}` : '—', inline: true },
      { name: '📡 الحالة', value: `${st}${b.tag ? `\n${b.tag}` : ''}${b.error ? `\n${b.error.slice(0, 80)}` : ''}`, inline: true },
      { name: '⏳ الاشتراك', value: b.expires ? `<t:${ts(b.expires)}:R>${b.expired ? ' (منتهي)' : ''}` : 'مفتوح', inline: true },
      { name: '🧾 الطلب', value: b.order_id ? `#${b.order_id}` : '—', inline: true },
      { name: '🧩 الأنظمة', value: b.templates.map(tLabel).join('، ').slice(0, 1000) || '—' },
      { name: '🔗 رابط البوت', value: b.invite ? `[دعوة البوت](${b.invite})` : '—' }).setTimestamp();
}
const registryRow = (b) => [row(
  b.suspended ? btn(`hbr:on:${b.id}`, 'تشغيل', ButtonStyle.Success, '✅') : btn(`hbr:off:${b.id}`, 'فصل البوت', ButtonStyle.Danger, '⛔'),
  btn(`hbr:restart:${b.id}`, 'إعادة', ButtonStyle.Secondary, '🔄'), btn(`hbr:ext:${b.id}`, '+30 يوم', ButtonStyle.Primary, '⏳'), btn(`hbr:del:${b.id}`, 'حذف', ButtonStyle.Secondary, '🗑️'))];
async function refreshOne(id) {
  try {
    const roomId = S('hosted_registry_channel'), b = hb.list().find((x) => x.id === id); if (!roomId || !b || !main) return;
    const room = await main.channels.fetch(roomId).catch(() => null); if (!room) return;
    const data = { embeds: [registryEmbed(b)], components: registryRow(b) };
    const msg = b.registry_msg && await room.messages.fetch(b.registry_msg).catch(() => null);
    if (msg) await msg.edit(data); else { const m = await room.send(data); db.prepare('UPDATE hosted_bots SET registry_msg=? WHERE id=?').run(m.id, id); }
  } catch (e) { console.error('registry:', e.message); }
}
async function refreshAll() { for (const b of hb.list()) { await refreshOne(b.id); await new Promise((r) => setTimeout(r, 600)); } }

// ============ تنبيه الانتهاء ============
async function remind(b, { kind, left }) {
  const link = S('hosted_renew_link') || 'https://discord.gg/2HVpUpTtXY', cli = hb.clientOf(b.id), ownerMention = (id) => `<@${id}>`;
  let sentTo = [];
  try {
    const g = cli && (cli.guilds.cache.get(b.guild_id) || cli.guilds.cache.first());
    if (g) {
      const owner = await g.fetchOwner().catch(() => null), oid = owner?.id || b.owner_id;
      const text = String(S('hosted_expire_msg')).replace(/\{owner\}/g, ownerMention(oid)).replace(/\{bot\}/g, b.name).replace(/\{link\}/g, link);
      const room = (g.systemChannel?.permissionsFor(cli.user)?.has(P.SendMessages) && g.systemChannel) || g.channels.cache.find((c) => c.type === 0 && c.permissionsFor(cli.user)?.has(P.SendMessages));
      if (room) { await room.send({ content: text.slice(0, 1990), allowedMentions: { users: [oid] } }); sentTo.push('السيرفر'); }
      if (owner) { await owner.send(text.replace(/<@\d+>\n?/, '').slice(0, 1990)).then(() => sentTo.push('خاص الأونر')).catch(() => {}); }
    }
  } catch (e) { console.error('remind:', e.message); }
  if (b.owner_id && main) {
    const text = String(S('hosted_expire_msg')).replace(/\{owner\}/g, ownerMention(b.owner_id)).replace(/\{bot\}/g, b.name).replace(/\{link\}/g, link);
    await (await main.users.fetch(b.owner_id).catch(() => null))?.send(text.replace(/<@\d+>\n?/, '').slice(0, 1990)).then(() => sentTo.push('خاص المشتري')).catch(() => {});
  }
  const room = main && S('hosted_registry_channel') && await main.channels.fetch(S('hosted_registry_channel')).catch(() => null);
  if (room) await room.send({ content: S('staff_role') ? `<@&${S('staff_role')}>` : undefined, embeds: [E().setColor(kind === 'expired' ? 0xef476f : 0xffd166).setTitle(kind === 'expired' ? '⛔ انتهى اشتراك بوت' : '⏰ اشتراك قارب على الانتهاء').setDescription(`**${b.name}** #${b.id} • <@${b.owner_id}>\nينتهي: <t:${ts(b.expires)}:R>\nأُرسل التنبيه إلى: ${sentTo.join('، ') || 'لا أحد (تعذر الإرسال)'}`)], allowedMentions: { roles: S('staff_role') ? [S('staff_role')] : [] } }).catch(() => {});
}

function init(client) {
  main = client;
  setInterval(() => refreshAll().catch(() => {}), 10 * 60e3);
  setTimeout(() => refreshAll().catch(() => {}), 20e3);
}

module.exports = { adapt, commands, onCommand, handle, onPaid, init, remind, refreshOne, refreshAll, packagesEmbed, hooks: { remind, registry: (id) => refreshOne(id), remindDays: () => S('hosted_remind_days') } };
// تم صنع البوت بمتجر نوفا ستور • يوزر الاونر: .5yb.
