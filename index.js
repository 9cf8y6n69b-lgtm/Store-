require('dotenv').config();
const {
  Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits: P,
  ChannelType, SlashCommandBuilder, REST, Routes, AttachmentBuilder, Partials,
} = require('discord.js');
const { db, S } = require('./db');
const { PAY, CAT, STATUS, fmt, totalMonths, amountFor, price, payInfo, image, imgUrl, imgFiles, transcriptFiles } = require('./util');
const { logTo } = require('./logs');
const tickets = require('./tickets');
const protect = require('./protect');
const extras = require('./extras');
const shop = require('./shop');
const community = require('./community');
const backup = require('./backup');
const bl = require('./blacklist');
const botctl = require('./botctl');
backup.autoRestoreOnBoot(); // لو فيه ملف نسخة داخل data/restore يتم استرجاعه قبل التشغيل
process.on('unhandledRejection', (e) => console.error('[unhandledRejection]', e));
const { asset, sendLine } = require('./info');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildModeration, GatewayIntentBits.GuildWebhooks],
  partials: [Partials.Message, Partials.Channel, Partials.GuildMember],
});
const EPH = 64;
const COLOR = 0x9b6bff;
const notify = (c, id, t) => c.users.fetch(id).then(u => u.send(t)).catch(() => {});
const getOrder = id => db.prepare('SELECT * FROM orders WHERE id=?').get(id);
const isStaff = m => m.permissions.has(P.Administrator) || (S('staff_role') && m.roles.cache.has(S('staff_role')));

// ---------- Embeds ----------
function orderEmbed(o) {
  const items = JSON.parse(o.items);
  const total = totalMonths(o);
  const e = new EmbedBuilder().setColor(COLOR).setTitle(`🧾 طلب #${o.id}`).addFields(
    { name: '👤 العميل', value: `<@${o.user_id}>`, inline: true },
    { name: '📌 الحالة', value: STATUS[o.status], inline: true },
    { name: '🛡️ المستلم', value: o.claimed_by ? `<@${o.claimed_by}>` : 'لم يُستلم بعد', inline: true },
    { name: '🤖 البوتات', value: items.map(i => `${i.emoji || '🤖'} ${i.name} — ${fmt(i.months)} شهر`).join('\n') },
    ...(o.details ? [{ name: '📝 تفاصيل البوت المخصص', value: o.details.slice(0, 1000) }] : []),
    { name: '⏱️ المجموع', value: `${fmt(total)} شهر نيترو`, inline: true },
    { name: '🏷️ الخصم', value: `${o.bundle + o.coupon_pct}%${o.coupon ? ` (كوبون ${o.coupon})` : ''}`, inline: true },
    { name: `${PAY[o.pay].emoji} الدفع`, value: `**${amountFor(total, o.pay)}**` },
    ...(o.warranty_until ? [{ name: '🛡️ الضمان', value: shop.warrantyShort(o).replace(/^ • 🛡️ /, '') }] : []),
  ).setFooter({ text: 'Nova Store • الأسعار تقديرية وتُأكَّد من الإدارة' }).setTimestamp();
  e.setImage(imgUrl('ticket_image', 'store_ticket.png'));
  return e;
}
const orderButtons = o => {
  const done = ['delivered', 'cancelled'].includes(o.status);
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`claim:${o.id}`).setLabel('استلام').setEmoji('🙋').setStyle(ButtonStyle.Primary).setDisabled(done || !!o.claimed_by),
      new ButtonBuilder().setCustomId(`paid:${o.id}`).setLabel('تأكيد الدفع').setEmoji('💳').setStyle(ButtonStyle.Success).setDisabled(done || o.status !== 'pending'),
      new ButtonBuilder().setCustomId(`deliver:${o.id}`).setLabel('تم التسليم').setEmoji('✅').setStyle(ButtonStyle.Success).setDisabled(done || o.status === 'pending'),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`coupon:${o.id}`).setLabel('كوبون خصم').setEmoji('🎟️').setStyle(ButtonStyle.Secondary).setDisabled(done),
      new ButtonBuilder().setCustomId(`close:${o.id}`).setLabel('إغلاق').setEmoji('🔒').setStyle(ButtonStyle.Danger),
    ),
  ];
};
async function refreshTicket(guild, o) {
  const ch = await guild.channels.fetch(o.channel_id).catch(() => null);
  const msg = ch && (await ch.messages.fetch(o.msg_id).catch(() => null));
  if (msg) await msg.edit({ embeds: [orderEmbed(o)], components: orderButtons(o) });
}
const log = (guild, embed, files) => logTo(guild, 'log_orders', embed, files);
function pricesEmbed() {
  const e = new EmbedBuilder().setColor(COLOR).setTitle('💰 قائمة الأسعار — بنيترو ديسكورد');
  for (const [cat, name] of Object.entries(CAT)) {
    const rows = db.prepare('SELECT * FROM products WHERE category=? AND active=1').all(cat);
    if (rows.length) e.addFields({ name, value: rows.map(r => `${r.emoji} ${r.name} — **${fmt(r.months)} شهر**`).join('\n'), inline: true });
  }
  e.addFields({ name: '🎁 العروض', value: `• باقة ${S('bundle_min')} بوتات = خصم ${S('bundle_discount')}%\n• كل البوتات = نيترو ${S('all_bots_months')} شهر\n• بوت مخصص بالكامل من ${S('custom_min_months')} أشهر\n• ندعم عملات الألعاب والبوست (ماعدا Apple Pay والتحويلات البنكية)` });
  return e;
}
// الأسعار: صورة (الافتراضي) أو إيمبد يتحدّث من الداشبورد
function pricesReply() {
  if (S('prices_use_image') !== '1') return { embeds: [pricesEmbed()], flags: EPH };
  const u = S('prices_image');
  return {
    content: `💰 **قائمة الأسعار — Nova Store**\n🎁 باقة ${S('bundle_min')} بوتات = خصم ${S('bundle_discount')}% • كل البوتات = نيترو ${S('all_bots_months')} شهر • المخصص من ${S('custom_min_months')} أشهر`,
    files: u ? [] : [asset('prices.png')],
    embeds: u ? [new EmbedBuilder().setColor(COLOR).setImage(u)] : [],
    flags: EPH,
  };
}
async function sendPanel(channelId) {
  const ch = await client.channels.fetch(channelId);
  const e = new EmbedBuilder().setColor(COLOR).setTitle(S('panel_title')).setDescription(S('panel_desc'));
  const files = image(e, 'panel_image', 'store_banner.png');
  return ch.send({ embeds: [e], files, components: [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('order').setLabel('اطلب بوت').setEmoji('🛒').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('prices').setLabel('الأسعار').setEmoji('💰').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('myorders').setLabel('طلباتي').setEmoji('📦').setStyle(ButtonStyle.Secondary),
  )] });
}

const lineAfter = async (id) => { if (S('line_after_panels') === '1') await sendLine(await client.channels.fetch(id)); };
const ctx = {
  sendPanel: async (id) => { await sendPanel(id); await lineAfter(id); },
  ticketPanel: async (id) => { await tickets.sendPanel(client, id); await lineAfter(id); },
};

// ---------- Commands ----------
const commands = [
  new SlashCommandBuilder().setName('store-panel').setDescription('إرسال بانل المتجر').setDefaultMemberPermissions(P.Administrator)
    .addChannelOption(o => o.setName('channel').setDescription('الروم').setRequired(false)),
  new SlashCommandBuilder().setName('ticket-panel').setDescription('إرسال بانل التذاكر').setDefaultMemberPermissions(P.Administrator)
    .addChannelOption(o => o.setName('channel').setDescription('الروم').setRequired(false)),
  new SlashCommandBuilder().setName('prices').setDescription('عرض الأسعار'),
  new SlashCommandBuilder().setName('my-orders').setDescription('طلباتي'),
  new SlashCommandBuilder().setName('order').setDescription('معلومات طلب (ستاف)').addIntegerOption(o => o.setName('id').setDescription('رقم الطلب').setRequired(true)),
  new SlashCommandBuilder().setName('top-staff').setDescription('أفضل الستاف بالنقاط'),
].map(c => c.toJSON()).concat(extras.commands, shop.commands, community.commands, backup.commands, botctl.commands);

async function onCommand(i) {
  if (await extras.onCommand(i, ctx) || await shop.onCommand(i) || await community.onCommand(i) || await backup.onCommand(i) || await botctl.onCommand(i)) return;
  if (i.commandName === 'prices') return i.reply(pricesReply());
  if (i.commandName === 'store-panel') {
    const ch = i.options.getChannel('channel') || i.channel;
    await ctx.sendPanel(ch.id);
    return i.reply({ content: `✅ تم إرسال البانل في ${ch}`, flags: EPH });
  }
  if (i.commandName === 'ticket-panel') {
    const ch = i.options.getChannel('channel') || i.channel;
    await ctx.ticketPanel(ch.id);
    return i.reply({ content: `✅ تم إرسال بانل التذاكر في ${ch}`, flags: EPH });
  }
  if (i.commandName === 'my-orders') return myOrders(i);
  if (i.commandName === 'order') {
    if (!isStaff(i.member)) return i.reply({ content: '❌ للستاف فقط', flags: EPH });
    const o = getOrder(i.options.getInteger('id'));
    return o ? i.reply({ embeds: [orderEmbed(o)], flags: EPH }) : i.reply({ content: 'ما لقيت الطلب', flags: EPH });
  }
  if (i.commandName === 'top-staff') {
    if (!isStaff(i.member)) return i.reply({ content: '❌ للستاف فقط', flags: EPH });
    const rows = db.prepare('SELECT * FROM staff ORDER BY points DESC LIMIT 10').all();
    const medals = ['🥇', '🥈', '🥉'];
    return i.reply({ embeds: [new EmbedBuilder().setColor(COLOR).setTitle('🏆 أفضل الستاف').setDescription(
      rows.map((r, n) => `${medals[n] || `**${n + 1}.**`} <@${r.user_id}> — ${r.points} نقطة • استلم ${r.claimed} • سلّم ${r.delivered}`).join('\n') || 'لا يوجد بيانات بعد')] });
  }
}
function myOrders(i) {
  const rows = db.prepare('SELECT * FROM orders WHERE user_id=? ORDER BY id DESC LIMIT 10').all(i.user.id);
  return i.reply({ flags: EPH, content: rows.map(o => `**#${o.id}** — ${STATUS[o.status]} — ${fmt(totalMonths(o))} شهر${shop.warrantyShort(o)}`).join('\n') || 'ما عندك طلبات للحين' });
}

// ---------- Buttons ----------
async function onButton(i) {
  const [act, id, extra] = i.customId.split(':');
  if (act === 'prices') return i.reply(pricesReply());
  if (act === 'myorders') return myOrders(i);
  if (act === 'order') {
    if (bl.get(i.user.id)) return i.reply({ content: bl.DENY, flags: EPH });
    if (S('store_open') !== '1') return i.reply({ content: '🔒 المتجر مقفل حالياً عن استقبال الطلبات، ارجع لنا قريب.', flags: EPH });
    const open = db.prepare("SELECT COUNT(*) c FROM orders WHERE user_id=? AND status NOT IN ('delivered','cancelled')").get(i.user.id).c;
    if (open >= +S('max_open_orders')) return i.reply({ content: `❌ عندك ${open} طلبات مفتوحة، أكمل أو سكّر اللي قبل.`, flags: EPH });
    const prods = db.prepare('SELECT * FROM products WHERE active=1 LIMIT 24').all();
    const menu = new StringSelectMenuBuilder().setCustomId('pick').setPlaceholder('اختر البوتات اللي تبيها').setMinValues(1).setMaxValues(prods.length + 1)
      .addOptions([...prods.map(p => ({ label: `${p.name} (${fmt(p.months)} شهر)`.slice(0, 100), value: String(p.id), emoji: p.emoji, description: CAT[p.category]?.replace(/^\S+\s/, '') })),
        { label: `بوت مخصص (من ${S('custom_min_months')} أشهر)`, value: 'custom', emoji: '✨' }]);
    return i.reply({ content: '🛒 **اختر البوتات** (تقدر تختار أكثر من واحد):', components: [new ActionRowBuilder().addComponents(menu)], flags: EPH });
  }
  const o = getOrder(id);
  if (!o) return i.reply({ content: 'الطلب غير موجود', flags: EPH });
  const staff = isStaff(i.member);

  if (act === 'rate') {
    if (i.user.id !== o.user_id) return i.reply({ content: '❌ هذا مو طلبك', flags: EPH });
    db.prepare('INSERT INTO reviews(order_id,user_id,stars,created) VALUES(?,?,?,?)').run(o.id, i.user.id, +extra, Date.now());
    const ch = S('review_channel') && (await i.guild.channels.fetch(S('review_channel')).catch(() => null));
    if (ch) ch.send({ embeds: [new EmbedBuilder().setColor(0xffd166).setTitle('⭐ تقييم جديد').setDescription(`${'⭐'.repeat(+extra)}\nمن <@${i.user.id}> — طلب #${o.id}`)] });
    return i.update({ content: `شكرًا لتقييمك ${'⭐'.repeat(+extra)} 💜`, components: [] });
  }
  if (act === 'coupon') {
    if (i.user.id !== o.user_id && !staff) return i.reply({ content: '❌ ما تقدر', flags: EPH });
    return i.showModal(new ModalBuilder().setCustomId(`couponm:${o.id}`).setTitle('كوبون الخصم').addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('code').setLabel('الكود').setStyle(TextInputStyle.Short).setRequired(true))));
  }
  if (act === 'close') {
    if (!staff && i.user.id !== o.user_id) return i.reply({ content: '❌ ما تقدر', flags: EPH });
    if (o.status === 'pending') db.prepare("UPDATE orders SET status='cancelled' WHERE id=?").run(o.id);
    db.prepare('UPDATE orders SET closed=? WHERE id=?').run(Date.now(), o.id);
    await i.reply('🔒 جاري حفظ المحادثة وإغلاق التذكرة بعد 5 ثواني...');
    await log(i.guild, new EmbedBuilder().setColor(0xef476f).setTitle(`🔒 إغلاق طلب #${o.id}`).setDescription(`العميل: <@${o.user_id}>\nأغلقه: <@${i.user.id}>\nالحالة: ${STATUS[getOrder(o.id).status]}`),
      (await transcriptFiles(i.channel, `order-${o.id}`)).files());
    return setTimeout(() => i.channel.delete().catch(() => {}), 5000);
  }
  if (!staff) return i.reply({ content: '❌ للستاف فقط', flags: EPH });

  if (act === 'claim') {
    db.prepare('UPDATE orders SET claimed_by=? WHERE id=?').run(i.user.id, o.id);
    db.prepare('INSERT INTO staff(user_id) VALUES(?) ON CONFLICT DO NOTHING').run(i.user.id);
    db.prepare('UPDATE staff SET points=points+?, claimed=claimed+1 WHERE user_id=?').run(+S('points_claim'), i.user.id);
    await i.reply(`🙋 ${i.user} استلم الطلب`);
    notify(i.client, o.user_id, `🙋 تم استلام طلبك #${o.id} من الإدارة.`);
  } else if (act === 'paid') {
    db.prepare("UPDATE orders SET status='paid' WHERE id=?").run(o.id);
    await i.reply('💳 تم تأكيد الدفع، يبدأ التنفيذ 🛠️');
    notify(i.client, o.user_id, `💳 تم تأكيد الدفع لطلبك #${o.id}، بدأ التنفيذ 🛠️`);
    await log(i.guild, new EmbedBuilder().setColor(0x06d6a0).setTitle(`💳 دفع طلب #${o.id}`).setDescription(`<@${o.user_id}> — ${amountFor(totalMonths(o), o.pay)}\nأكده: ${i.user}`));
    await shop.onStatus(i.guild, getOrder(o.id), i.channel); // فاتورة للعميل
  } else if (act === 'deliver') {
    db.prepare("UPDATE orders SET status='delivered' WHERE id=?").run(o.id);
    db.prepare('INSERT INTO staff(user_id) VALUES(?) ON CONFLICT DO NOTHING').run(i.user.id);
    db.prepare('UPDATE staff SET points=points+?, delivered=delivered+1 WHERE user_id=?').run(+S('points_deliver'), i.user.id);
    if (S('customer_role')) (await i.guild.members.fetch(o.user_id).catch(() => null))?.roles.add(S('customer_role')).catch(() => {});
    await i.reply({ content: `✅ تم تسليم الطلب! <@${o.user_id}> قيّم تجربتك:`, components: [new ActionRowBuilder().addComponents(
      [1, 2, 3, 4, 5].map(n => new ButtonBuilder().setCustomId(`rate:${o.id}:${n}`).setLabel(`${n}`).setEmoji('⭐').setStyle(ButtonStyle.Secondary)))] });
    notify(i.client, o.user_id, `✅ تم تسليم طلبك #${o.id}! شكراً لثقتك في Nova Store 💜`);
    await log(i.guild, new EmbedBuilder().setColor(0x118ab2).setTitle(`✅ تسليم طلب #${o.id}`).setDescription(`العميل <@${o.user_id}>\nالمسلّم: ${i.user}`));
    await shop.onStatus(i.guild, getOrder(o.id), i.channel); // بدء الضمان
  }
  await refreshTicket(i.guild, getOrder(o.id));
}

// ---------- Selects ----------
async function onSelect(i) {
  if (i.customId === 'pick') {
    const menu = new StringSelectMenuBuilder().setCustomId(`pay:${i.values.join(',')}`).setPlaceholder('اختر طريقة الدفع')
      .addOptions(Object.entries(PAY).map(([k, v]) => ({ label: v.label, value: k, emoji: v.emoji })));
    return i.update({ content: '💳 **اختر طريقة الدفع** (ماعدا Apple Pay والتحويلات البنكية):', components: [new ActionRowBuilder().addComponents(menu)] });
  }
  if (i.customId.startsWith('pay:')) {
    const ids = i.customId.slice(4).split(',');
    if (ids.includes('custom'))
      return i.showModal(new ModalBuilder().setCustomId(`cm:${ids.join(',')}:${i.values[0]}`).setTitle('تفاصيل البوت المخصص').addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('details').setLabel('وش تبي البوت يسوي؟').setStyle(TextInputStyle.Paragraph).setMinLength(15).setMaxLength(1000).setRequired(true))));
    await i.deferUpdate();
    return createOrder(i, ids, i.values[0], '');
  }
}
async function createOrder(i, ids, pay, details) {
  const prods = ids.map(x => x === 'custom'
    ? { id: 'custom', name: 'بوت مخصص (السعر يُتفق عليه)', months: +S('custom_min_months'), emoji: '✨' }
    : db.prepare('SELECT * FROM products WHERE id=?').get(x)).filter(Boolean);
  const pr = price(prods);
  const r = db.prepare('INSERT INTO orders(user_id,items,details,base,bundle,coupon_pct,pay,created,last_activity) VALUES(?,?,?,?,?,?,?,?,?)')
    .run(i.user.id, JSON.stringify(prods), details, pr.base, pr.bundle, 0, pay, Date.now(), Date.now());
  const oid = r.lastInsertRowid, staffRole = S('staff_role');
  const ow = [
    { id: i.guild.id, deny: [P.ViewChannel] },
    { id: i.user.id, allow: [P.ViewChannel, P.SendMessages, P.AttachFiles, P.ReadMessageHistory] },
    { id: client.user.id, allow: [P.ViewChannel, P.SendMessages, P.ManageChannels, P.EmbedLinks, P.AttachFiles] },
  ];
  if (staffRole) ow.push({ id: staffRole, allow: [P.ViewChannel, P.SendMessages, P.AttachFiles, P.ReadMessageHistory] });
  const ch = await i.guild.channels.create({ name: `order-${oid}`, type: ChannelType.GuildText, parent: S('order_category') || null, permissionOverwrites: ow });
  const o0 = getOrder(oid);
  const msg = await ch.send({ content: `${i.user} ${staffRole ? `<@&${staffRole}>` : ''}`, embeds: [orderEmbed(o0)], files: imgFiles('ticket_image', 'store_ticket.png'), components: orderButtons(o0) });
  const info = payInfo(pay);
  if (info) await ch.send({ embeds: [new EmbedBuilder().setColor(0xffd166).setTitle(`${PAY[pay].emoji} تعليمات الدفع — ${PAY[pay].label}`).setDescription(info)] });
  db.prepare('UPDATE orders SET channel_id=?, msg_id=? WHERE id=?').run(ch.id, msg.id, oid);
  await log(i.guild, new EmbedBuilder().setColor(COLOR).setTitle(`🆕 طلب جديد #${oid}`).setDescription(`العميل: ${i.user}\nالروم: ${ch}\nالمجموع: ${fmt(totalMonths(o0))} شهر`));
  return i.editReply({ content: `✅ تم فتح طلبك: ${ch}`, components: [] });
}

// ---------- Modals ----------
async function onModal(i) {
  if (i.customId.startsWith('cm:')) {
    const [, ids, pay] = i.customId.split(':');
    await i.deferReply({ flags: EPH });
    return createOrder(i, ids.split(','), pay, i.fields.getTextInputValue('details'));
  }
  if (!i.customId.startsWith('couponm:')) return;
  const o = getOrder(i.customId.split(':')[1]);
  const code = i.fields.getTextInputValue('code').trim().toUpperCase();
  const c = db.prepare('SELECT * FROM coupons WHERE code=?').get(code);
  if (!c || (c.max_uses && c.uses >= c.max_uses)) return i.reply({ content: '❌ كوبون غير صالح', flags: EPH });
  if (o.coupon) return i.reply({ content: '❌ تم استخدام كوبون على هذا الطلب', flags: EPH });
  db.prepare('UPDATE coupons SET uses=uses+1 WHERE code=?').run(code);
  db.prepare('UPDATE orders SET coupon=?, coupon_pct=? WHERE id=?').run(code, c.percent, o.id);
  await i.reply(`🎟️ تم تطبيق الكوبون **${code}** (-${c.percent}%)`);
  await refreshTicket(i.guild, getOrder(o.id));
}

client.on('interactionCreate', async i => {
  try {
    if ((i.isButton() || i.isStringSelectMenu() || i.isModalSubmit()) && i.customId.startsWith('tk_') && await tickets.handle(i)) return;
    if ((i.isButton() || i.isModalSubmit()) && i.customId.startsWith('vf_') && await protect.handle(i)) return;
    if (!i.isChatInputCommand() && !i.isAutocomplete?.() && (await shop.handle(i) || await community.handle(i) || await backup.handle(i))) return;
    if (i.isChatInputCommand()) await onCommand(i);
    else if (i.isButton()) await onButton(i);
    else if (i.isStringSelectMenu()) await onSelect(i);
    else if (i.isModalSubmit()) await onModal(i);
  } catch (e) {
    console.error(e);
    const m = { content: '⚠️ صار خطأ، حاول مرة ثانية', flags: EPH };
    (i.replied || i.deferred ? i.followUp(m) : i.reply(m)).catch(() => {});
  }
});

// ---------- التشغيل ----------
// الداشبورد يشتغل دايماً، والبوت يتحكم فيه من الداشبورد (توكن، تشغيل، إيقاف). التجهيز الثقيل يتم مرة وحدة فقط.
let booted = false;
botctl.attach(client, async () => {
  console.log(`✅ ${client.user.tag}`);
  const c = botctl.creds();
  try { await new REST().setToken(c.token).put(Routes.applicationGuildCommands(client.user.id, c.guildId), { body: commands }); }
  catch (e) { console.error('❌ تسجيل الأوامر فشل (تأكد أن البوت داخل السيرفر وايدي السيرفر صحيح):', e.message); throw e; }
  if (booted) return;
  booted = true;
  for (const m of ['logs', 'welcome', 'levels', 'mod', 'protect', 'extras', 'shop', 'community', 'backup']) require('./' + m).init(client);
});
require('./dashboard')(client, {
  botctl,
  sendPanel: ctx.sendPanel, ticketPanel: ctx.ticketPanel, welcomePreview: require('./welcome').preview,
  sendInfo: async (k, id) => { const ch = await client.channels.fetch(id); return k === 'verify' ? protect.sendVerify(ch) : require('./info').sendInfo(ch, k); },
  setupServer: () => require('./setup').setupServer(client.guilds.cache.get(process.env.GUILD_ID), ctx),
  onStatus: (o) => shop.onStatus(client.guilds.cache.get(process.env.GUILD_ID), o),
});
require('./hosted/manager').init({ notify: (uid, txt) => client.users.fetch(uid).then((u) => u.send(txt)), mainToken: () => botctl.creds().token });
if (botctl.canAutostart()) botctl.start().catch((e) => console.error('❌ تعذر تشغيل البوت:', e.message));
else console.log('⚠️ البوت متوقف. افتح الداشبورد (http://localhost:' + (process.env.PORT || 3000) + ') ← 🤖 البوت، وحط التوكن وايدي السيرفر ثم اضغط تشغيل.');
