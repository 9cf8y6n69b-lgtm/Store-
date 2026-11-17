const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder,
  TextInputStyle, PermissionFlagsBits: P, ChannelType, AttachmentBuilder,
} = require('discord.js');
const { db, S } = require('./db');
const { image, imgUrl, imgFiles, transcriptFiles } = require('./util');
const { logTo } = require('./logs');
const bl = require('./blacklist');
const EPH = 64, COLOR = 0x9b6bff;
const get = id => db.prepare('SELECT * FROM tickets WHERE id=?').get(id);
const isStaff = m => m.permissions.has(P.Administrator) || (S('staff_role') && m.roles.cache.has(S('staff_role')));
const catName = id => { const c = db.prepare('SELECT * FROM tk_cats WHERE id=?').get(id); return c ? `${c.emoji} ${c.name}` : 'عام'; };

async function sendPanel(client, channelId) {
  const ch = await client.channels.fetch(channelId);
  const e = new EmbedBuilder().setColor(COLOR).setTitle(S('tk_panel_title')).setDescription(S('tk_panel_desc'));
  const files = image(e, 'tk_panel_image', 'tickets_banner.png');
  const cats = db.prepare('SELECT * FROM tk_cats LIMIT 25').all();
  const menu = new StringSelectMenuBuilder().setCustomId('tk_open').setPlaceholder('اختر نوع التذكرة')
    .addOptions(cats.map(c => ({ label: c.name, value: String(c.id), emoji: c.emoji, description: c.description || undefined })));
  return ch.send({ embeds: [e], files, components: [new ActionRowBuilder().addComponents(menu)] });
}
const reqButtons = id => [new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId(`tk_acc:${id}`).setLabel('قبول').setEmoji('✅').setStyle(ButtonStyle.Success),
  new ButtonBuilder().setCustomId(`tk_rej:${id}`).setLabel('رفض').setEmoji('❌').setStyle(ButtonStyle.Danger))];
const inButtons = id => [new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId(`tk_close:${id}`).setLabel('إغلاق').setEmoji('🔒').setStyle(ButtonStyle.Danger),
  new ButtonBuilder().setCustomId(`tk_sum:${id}`).setLabel('استدعاء العضو').setEmoji('📣').setStyle(ButtonStyle.Primary),
  new ButtonBuilder().setCustomId(`tk_tr:${id}`).setLabel('تحويل').setEmoji('🔁').setStyle(ButtonStyle.Secondary))];

async function handle(i) {
  const id = i.customId; if (!id.startsWith('tk_')) return false;
  const [act, tid, extra] = id.split(':');

  if (act === 'tk_open') {
    if (S('tk_enabled') !== '1') return i.reply({ content: '❌ التذاكر مقفلة حالياً', flags: EPH }), true;
    if (bl.get(i.user.id)) return i.reply({ content: bl.DENY, flags: EPH }), true;
    const open = db.prepare("SELECT COUNT(*) c FROM tickets WHERE user_id=? AND status IN ('requested','open')").get(i.user.id).c;
    if (open >= +S('tk_max_open')) return i.reply({ content: `❌ عندك ${open} تذكرة مفتوحة/معلقة، انتظر أو سكّرها.`, flags: EPH }), true;
    await i.showModal(new ModalBuilder().setCustomId(`tk_m:${i.values[0]}`).setTitle('تذكرة جديدة').addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('problem').setLabel('اكتب مشكلتك أو طلبك').setStyle(TextInputStyle.Paragraph).setMinLength(10).setMaxLength(1000).setRequired(true))));
    return true;
  }
  if (act === 'tk_m') {
    const rc = S('tk_requests_channel') && await i.guild.channels.fetch(S('tk_requests_channel')).catch(() => null);
    if (!rc) return i.reply({ content: '❌ روم الطلبات غير محدد من الداشبورد', flags: EPH }), true;
    const problem = i.fields.getTextInputValue('problem');
    const r = db.prepare('INSERT INTO tickets(user_id,cat,problem,created) VALUES(?,?,?,?)').run(i.user.id, tid, problem, Date.now());
    const e = new EmbedBuilder().setColor(0xffd166).setTitle(`📥 طلب تذكرة #${r.lastInsertRowid}`).setThumbnail(i.user.displayAvatarURL())
      .addFields({ name: '👤 العضو', value: `${i.user} (\`${i.user.id}\`)`, inline: true }, { name: '📂 النوع', value: catName(tid), inline: true }, { name: '📝 المشكلة', value: problem }).setTimestamp();
    const m = await rc.send({ content: S('staff_role') ? `<@&${S('staff_role')}>` : '', embeds: [e], components: reqButtons(r.lastInsertRowid) });
    db.prepare('UPDATE tickets SET req_msg=? WHERE id=?').run(m.id, r.lastInsertRowid);
    return i.reply({ content: '✅ تم إرسال طلبك للإدارة، بيوصلك إشعار عند القبول.', flags: EPH }), true;
  }
  const t = get(tid); if (!t) return i.reply({ content: 'التذكرة غير موجودة', flags: EPH }), true;
  const staff = isStaff(i.member);

  if (act === 'tk_acc') {
    if (!staff) return i.reply({ content: '❌ للستاف فقط', flags: EPH }), true;
    if (t.status !== 'requested') return i.reply({ content: 'التذكرة تمت معالجتها', flags: EPH }), true;
    await i.deferUpdate();
    const ow = [{ id: i.guild.id, deny: [P.ViewChannel] },
      { id: t.user_id, allow: [P.ViewChannel, P.SendMessages, P.AttachFiles, P.ReadMessageHistory] },
      { id: i.user.id, allow: [P.ViewChannel, P.SendMessages, P.AttachFiles, P.ReadMessageHistory, P.ManageMessages] },
      { id: i.client.user.id, allow: [P.ViewChannel, P.SendMessages, P.ManageChannels, P.EmbedLinks, P.AttachFiles] }];
    const ch = await i.guild.channels.create({ name: `ticket-${t.id}`, type: ChannelType.GuildText, parent: S('tk_category') || null, topic: `ticket:${t.id} user:${t.user_id}`, permissionOverwrites: ow });
    const e = new EmbedBuilder().setColor(COLOR).setTitle(`🎫 تذكرة #${t.id} — ${catName(t.cat)}`).setDescription(S('tk_embed_text'))
      .addFields({ name: '👤 العضو', value: `<@${t.user_id}>`, inline: true }, { name: '🛡️ المستلم', value: `${i.user}`, inline: true }, { name: '📝 المشكلة', value: t.problem }).setTimestamp();
    e.setImage(imgUrl('tk_embed_image', 'ticket_inside.png'));
    await ch.send({ content: `<@${t.user_id}> ${i.user}`, embeds: [e], files: imgFiles('tk_embed_image', 'ticket_inside.png'), components: inButtons(t.id) });
    db.prepare("UPDATE tickets SET status='open', claimed_by=?, channel_id=?, last_activity=?, idle_warned=0 WHERE id=?").run(i.user.id, ch.id, Date.now(), t.id);
    db.prepare('INSERT INTO staff(user_id) VALUES(?) ON CONFLICT DO NOTHING').run(i.user.id);
    db.prepare('UPDATE staff SET points=points+?, claimed=claimed+1 WHERE user_id=?').run(+S('tk_points'), i.user.id);
    const pts = db.prepare('SELECT points FROM staff WHERE user_id=?').get(i.user.id).points;
    i.user.send(`🏅 استلمت تذكرة #${t.id} وحصلت على **${S('tk_points')}** نقطة. مجموع نقاطك: **${pts}**`).catch(() => {});
    (await i.client.users.fetch(t.user_id).catch(() => null))?.send(`✅ تم قبول تذكرتك #${t.id}: ${ch}`).catch(() => {});
    const old = EmbedBuilder.from(i.message.embeds[0]).setColor(0x06d6a0).addFields({ name: '✅ تم القبول', value: `بواسطة ${i.user} → ${ch}` });
    await i.message.edit({ embeds: [old], components: [] });
    return true;
  }
  if (act === 'tk_rej') {
    if (!staff) return i.reply({ content: '❌ للستاف فقط', flags: EPH }), true;
    if (t.status !== 'requested') return i.reply({ content: 'التذكرة تمت معالجتها', flags: EPH }), true;
    db.prepare("UPDATE tickets SET status='rejected', claimed_by=? WHERE id=?").run(i.user.id, t.id);
    (await i.client.users.fetch(t.user_id).catch(() => null))?.send(`❌ تم رفض طلب تذكرتك #${t.id}.`).catch(() => {});
    await i.update({ embeds: [EmbedBuilder.from(i.message.embeds[0]).setColor(0xef476f).addFields({ name: '❌ تم الرفض', value: `بواسطة ${i.user}` })], components: [] });
    return true;
  }
  if (act === 'tk_sum') {
    if (!staff) return i.reply({ content: '❌ للستاف فقط', flags: EPH }), true;
    const u = await i.client.users.fetch(t.user_id).catch(() => null);
    const ok = u && await u.send(`📣 الإدارة تناديك في تذكرتك: <#${t.channel_id}>`).then(() => true).catch(() => false);
    await i.channel.send(`📣 <@${t.user_id}> الإدارة تنتظرك هنا!`);
    return i.reply({ content: ok ? '✅ تم استدعاء العضو بالخاص والمنشن' : '⚠️ تم المنشن (خاصه مقفل)', flags: EPH }), true;
  }
  if (act === 'tk_tr') {
    if (!staff) return i.reply({ content: '❌ للستاف فقط', flags: EPH }), true;
    const ids = S('tk_transfer_roles').split(',').filter(Boolean).filter(r => i.guild.roles.cache.has(r));
    if (!ids.length) return i.reply({ content: '❌ ما فيه رتب تحويل محددة من الداشبورد', flags: EPH }), true;
    const menu = new StringSelectMenuBuilder().setCustomId(`tk_trs:${t.id}`).setPlaceholder('حوّل التذكرة إلى رتبة')
      .addOptions(ids.slice(0, 25).map(r => ({ label: i.guild.roles.cache.get(r).name.slice(0, 100), value: r })));
    return i.reply({ content: '🔁 اختر الرتبة:', components: [new ActionRowBuilder().addComponents(menu)], flags: EPH }), true;
  }
  if (act === 'tk_trs') {
    if (!staff) return i.reply({ content: '❌ للستاف فقط', flags: EPH }), true;
    const role = i.values[0];
    await i.channel.permissionOverwrites.edit(role, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true });
    await i.channel.send(`🔁 تم تحويل التذكرة إلى <@&${role}> بواسطة ${i.user}`);
    return i.update({ content: '✅ تم التحويل', components: [] }), true;
  }
  if (act === 'tk_close') {
    if (!staff && i.user.id !== t.user_id) return i.reply({ content: '❌ ما تقدر', flags: EPH }), true;
    db.prepare("UPDATE tickets SET status='closed', closed=? WHERE id=?").run(Date.now(), t.id);
    await i.reply('🔒 جاري حفظ المحادثة وإغلاق التذكرة بعد 5 ثواني...');
    const tf = await transcriptFiles(i.channel, `ticket-${t.id}`), file = () => tf.files();
    await logTo(i.guild, 'tk_log_channel', new EmbedBuilder().setColor(0xef476f).setTitle(`🔒 إغلاق تذكرة #${t.id}`)
      .setDescription(`العضو: <@${t.user_id}>\nالمستلم: ${t.claimed_by ? `<@${t.claimed_by}>` : '—'}\nأغلقها: ${i.user}\nالنوع: ${catName(t.cat)}`), file());
    (await i.client.users.fetch(t.user_id).catch(() => null))?.send({ content: `🔒 تم إغلاق تذكرتك #${t.id}. نسخة المحادثة مرفقة.`, files: file() }).catch(() => {});
    setTimeout(() => i.channel.delete().catch(() => {}), 5000);
    return true;
  }
  return false;
}
module.exports = { sendPanel, handle };
