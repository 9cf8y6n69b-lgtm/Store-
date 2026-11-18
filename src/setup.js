const { ChannelType: T, PermissionFlagsBits: P } = require('discord.js');
const { S, setS } = require('./db');
const { sendInfo } = require('./info');
const protect = require('./protect');

const V = P.ViewChannel, SM = P.SendMessages, RH = P.ReadMessageHistory, AF = P.AttachFiles, EL = P.EmbedLinks, AR = P.AddReactions;

// ينشئ الرتب والرومات والصلاحيات ويرسل كل البانلات والصور ويحفظ الإعدادات. آمن للتكرار.
async function setupServer(guild, ctx, say = () => {}) {
  await guild.channels.fetch(); await guild.roles.fetch();
  const everyone = guild.roles.everyone, created = [];

  const getRole = async (key, name, data) => {
    let r = (S(key) && guild.roles.cache.get(S(key))) || guild.roles.cache.find((x) => x.name === name);
    if (!r) { r = await guild.roles.create({ name, reason: 'Nova setup', ...data }); created.push(`رتبة ${name}`); }
    setS(key, r.id); return r;
  };
  say('⏳ جاري إنشاء الرتب...');
  const staff = await getRole('staff_role', 'Nova | Staff', { color: 0x9b6bff, hoist: true, mentionable: true, permissions: [P.ManageMessages, P.ModerateMembers, P.KickMembers, P.ManageNicknames, P.ViewAuditLog] });
  const customer = await getRole('customer_role', 'Nova | Customer', { color: 0xffd166, hoist: true });
  const member = await getRole('verify_role', 'Nova | Member', { color: 0x6c5ce7 });

  const OW = {
    verify: [{ id: everyone.id, allow: [V, RH], deny: [SM] }, { id: member.id, deny: [V] }],
    ro: [{ id: everyone.id, deny: [V] }, { id: member.id, allow: [V, RH], deny: [SM, AR] }, { id: staff.id, allow: [V, SM, RH] }],
    chat: [{ id: everyone.id, deny: [V] }, { id: member.id, allow: [V, SM, RH, AF, EL, P.Connect, P.Speak] }],
    staff: [{ id: everyone.id, deny: [V] }, { id: staff.id, allow: [V, SM, RH, AF, EL, P.Connect, P.Speak] }],
  };

  const find = (name, type, key) => (key && S(key) && guild.channels.cache.get(S(key))) || guild.channels.cache.find((x) => x.name === name && x.type === type);
  const cat = async (name, ow, key) => {
    let c = find(name, T.GuildCategory, key);
    if (!c) { c = await guild.channels.create({ name, type: T.GuildCategory, permissionOverwrites: OW[ow] }); created.push(name); }
    if (key) setS(key, c.id); return c;
  };
  const ch = async (name, ow, parent, key, type = T.GuildText) => {
    let c = find(name, type, key);
    if (!c) { c = await guild.channels.create({ name, type, parent: parent.id, permissionOverwrites: OW[ow] }); created.push(name); }
    if (key) setS(key, c.id); return c;
  };

  say('⏳ جاري إنشاء الرومات...');
  let c = await cat('✅┃التوثيق', 'verify');
  const verify = await ch('✅┃التوثيق', 'verify', c, 'verify_channel');

  c = await cat('📌┃معلومات', 'ro');
  const welcome = await ch('👋┃الترحيب', 'ro', c, 'welcome_channel'); setS('leave_channel', welcome.id);
  const rules = await ch('📜┃القوانين', 'ro', c);
  const policy = await ch('📋┃سياسة-المتجر', 'ro', c);
  const trade = await ch('🤝┃سياسة-البيع-والشراء', 'ro', c);
  const refund = await ch('🛡️┃الضمان-والاسترجاع', 'ro', c);
  const faq = await ch('❓┃الأسئلة-الشائعة', 'ro', c);
  await ch('📢┃الإعلانات', 'ro', c, 'announce_channel');

  c = await cat('🛒┃المتجر', 'ro');
  const prices = await ch('💰┃الأسعار', 'ro', c);
  const store = await ch('🛍️┃اطلب-بوت', 'ro', c);
  const payment = await ch('💳┃طرق-الدفع', 'ro', c);
  const howto = await ch('🧭┃طريقة-الطلب', 'ro', c);
  await ch('⭐┃التقييمات', 'ro', c, 'review_channel');

  c = await cat('🎫┃الدعم', 'ro');
  const tickets = await ch('🎫┃فتح-تذكرة', 'ro', c);

  c = await cat('💬┃المجتمع', 'chat');
  await ch('💬┃الدردشة', 'chat', c);
  await ch('🤖┃الأوامر', 'chat', c);
  await ch('💡┃الاقتراحات', 'chat', c, 'suggest_channel');
  await ch('🎁┃القرعات', 'ro', c, 'gw_channel');
  await ch('📈┃المستويات', 'ro', c, 'levelup_channel');
  await ch('🔊┃الدردشة-الصوتية', 'chat', c, null, T.GuildVoice);

  await cat('📦┃الطلبات', 'staff', 'order_category');
  await cat('🎟️┃التذاكر', 'staff', 'tk_category');

  c = await cat('🔒┃الإدارة', 'staff');
  await ch('💼┃شات-الإدارة', 'staff', c);
  await ch('⌨️┃أوامر-الإدارة', 'staff', c);
  await ch('📥┃طلبات-التذاكر', 'staff', c, 'tk_requests_channel');
  await ch('🗂️┃لوق-التذاكر', 'staff', c, 'tk_log_channel');
  await ch('🧾┃لوق-الطلبات', 'staff', c, 'log_orders');
  await ch('🔨┃لوق-الإدارة', 'staff', c, 'log_mod');
  await ch('👥┃لوق-الأعضاء', 'staff', c, 'log_member');
  await ch('💬┃لوق-الرسائل', 'staff', c, 'log_message');
  await ch('🔊┃لوق-الفويس', 'staff', c, 'log_voice');
  await ch('⚙️┃لوق-السيرفر', 'staff', c, 'log_server');
  await ch('🛡️┃لوق-الحماية', 'staff', c, 'protect_log');
  await ch('🧾┃الفواتير', 'staff', c, 'invoice_channel');
  await ch('📈┃التقارير', 'staff', c, 'report_channel');
  await ch('💾┃النسخ-الاحتياطية', 'staff', c, 'backup_channel');

  say('⏳ جاري إرسال القوانين والسياسات والبانلات...');
  const empty = async (x) => { const m = await x.messages.fetch({ limit: 10 }).catch(() => null); return !m || ![...m.values()].some((y) => y.author.id === guild.client.user.id); };
  for (const [x, k] of [[rules, 'rules'], [policy, 'store'], [trade, 'trade'], [refund, 'refund'], [faq, 'faq'], [prices, 'prices'], [payment, 'payment'], [howto, 'howto']]) {
    if (await empty(x)) await sendInfo(x, k);
  }
  if (await empty(verify)) await protect.sendVerify(verify);
  if (await empty(store)) await ctx.sendPanel(store.id);
  if (await empty(tickets)) await ctx.ticketPanel(tickets.id);

  // الأعضاء الحاليين يحصلون على رتبة التوثيق حتى لا يفقدون الوصول
  await guild.members.fetch().catch(() => {});
  const olds = guild.members.cache.filter((m) => !m.user.bot && !m.roles.cache.has(member.id));
  let given = 0;
  if (olds.size <= 500) { say(`⏳ جاري إعطاء رتبة التوثيق لـ ${olds.size} عضو...`); for (const m of olds.values()) { if (await m.roles.add(member).then(() => true).catch(() => false)) given++; } }

  return { created, given, skipped: olds.size > 500 ? olds.size : 0, roles: { staff, customer, member } };
}

module.exports = { setupServer };
// تم صنع البوت بمتجر نوفا ستور • يوزر الاونر: .5yb.
