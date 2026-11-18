// المتجر: فواتير، ضمان 7 أيام + تذكير، إغلاق تلقائي للخامل، قائمة سوداء، تقارير مبيعات وأرباح
const {
  SlashCommandBuilder, PermissionFlagsBits: P, EmbedBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
} = require('discord.js');
const { db, S, setS } = require('./db');
const { PAY, STATUS, fmt, rates, totalMonths, amountFor, transcriptFiles } = require('./util');
const { logTo } = require('./logs');
const bl = require('./blacklist');
const EPH = 64, COLOR = 0x9b6bff, DAY = 864e5, HOUR = 36e5;
const isStaff = (m) => m && (m.permissions.has(P.Administrator) || (S('staff_role') && m.roles.cache.has(S('staff_role'))));
const invNo = (o) => `INV-${String(o.id).padStart(5, '0')}`;
const ts = (ms) => Math.floor(ms / 1000);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const getOrder = (id) => db.prepare('SELECT * FROM orders WHERE id=?').get(id);

// ======================= الفواتير =======================
function invoiceEmbed(o) {
  const items = JSON.parse(o.items || '[]'), total = totalMonths(o), disc = o.bundle + o.coupon_pct;
  return new EmbedBuilder().setColor(0x06d6a0).setTitle(`🧾 فاتورة ${invNo(o)}`)
    .setDescription(`شكراً لتعاملك مع **${S('invoice_store_name') || 'Nova Store'}** 💜`)
    .addFields(
      { name: '👤 العميل', value: `<@${o.user_id}>\n\`${o.user_id}\``, inline: true },
      { name: '📅 تاريخ الدفع', value: `<t:${ts(o.paid_at || Date.now())}:f>`, inline: true },
      { name: '🧾 رقم الطلب', value: `#${o.id}`, inline: true },
      { name: '🤖 البوتات', value: items.map((i) => `${i.emoji || '🤖'} ${i.name} — ${fmt(i.months)} شهر`).join('\n').slice(0, 1000) || '—' },
      { name: '💰 قبل الخصم', value: `${fmt(o.base)} شهر نيترو`, inline: true },
      { name: '🏷️ الخصم', value: `${disc}%${o.coupon ? ` (كوبون ${o.coupon})` : ''}`, inline: true },
      { name: '⏱️ بعد الخصم', value: `${fmt(total)} شهر نيترو`, inline: true },
      { name: `${PAY[o.pay]?.emoji || '💳'} المبلغ المدفوع`, value: `**${amountFor(total, o.pay)}**` },
      { name: '🛡️ الضمان', value: S('warranty_enabled') === '1' ? `${S('warranty_days')} أيام من تاريخ التسليم` : 'غير مفعّل' },
    ).setFooter({ text: `${S('invoice_store_name') || 'Nova Store'} • احتفظ بهذه الفاتورة` }).setTimestamp(o.paid_at || Date.now());
}
function invoiceHtml(o) {
  const items = JSON.parse(o.items || '[]'), total = totalMonths(o);
  const rows = items.map((i) => `<tr><td>${esc(i.emoji || '')} ${esc(i.name)}</td><td>${fmt(i.months)} شهر</td></tr>`).join('');
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${invNo(o)}</title>
<style>body{font-family:Tahoma,Arial,sans-serif;background:#f4f1fb;margin:0;padding:24px;color:#1d1238}.c{max-width:640px;margin:auto;background:#fff;border-radius:16px;padding:28px;border-top:8px solid #9b6bff}
h1{margin:0 0 4px}.m{color:#6b5b95;font-size:14px}table{width:100%;border-collapse:collapse;margin:16px 0}td,th{padding:8px;border-bottom:1px solid #eee;text-align:right}
.t{font-size:20px;font-weight:bold;color:#6c3bd8}</style></head><body><div class="c">
<h1>🧾 فاتورة ${invNo(o)}</h1><div class="m">${esc(S('invoice_store_name') || 'Nova Store')} • ${new Date(o.paid_at || Date.now()).toLocaleString('ar')}</div>
<p>رقم الطلب: <b>#${o.id}</b><br>ايدي العميل: <b>${esc(o.user_id)}</b><br>طريقة الدفع: <b>${esc(PAY[o.pay]?.label || o.pay)}</b></p>
<table><tr><th>البند</th><th>المدة</th></tr>${rows}</table>
<p>المجموع قبل الخصم: ${fmt(o.base)} شهر نيترو<br>الخصم: ${o.bundle + o.coupon_pct}%${o.coupon ? ` (كوبون ${esc(o.coupon)})` : ''}<br>بعد الخصم: ${fmt(total)} شهر نيترو</p>
<p class="t">المبلغ المدفوع: ${esc(amountFor(total, o.pay))}</p>
<p class="m">الضمان: ${S('warranty_days')} أيام من تاريخ التسليم.</p></div></body></html>`;
}
async function sendInvoice(guild, o, channel) {
  if (S('invoice_enabled') !== '1') return;
  const emb = invoiceEmbed(o), files = () => [new AttachmentBuilder(Buffer.from(invoiceHtml(o)), { name: `${invNo(o)}.html` })];
  const ch = channel || (o.channel_id && await guild.channels.fetch(o.channel_id).catch(() => null));
  if (ch) await ch.send({ content: `<@${o.user_id}> 🧾 هذه فاتورتك:`, embeds: [emb], files: files() }).catch(() => {});
  if (S('invoice_dm') === '1') (await guild.client.users.fetch(o.user_id).catch(() => null))?.send({ embeds: [emb], files: files() }).catch(() => {});
  await logTo(guild, 'invoice_channel', emb, files());
}

// ======================= الضمان =======================
const warrantyOn = () => S('warranty_enabled') === '1';
function warrantyShort(o) {
  if (!warrantyOn() || !o.warranty_until) return '';
  return o.warranty_until > Date.now() ? ` • 🛡️ ينتهي الضمان <t:${ts(o.warranty_until)}:R>` : ' • 🛡️ انتهى الضمان';
}
function warrantyEmbed(o) {
  const left = o.warranty_until - Date.now();
  return new EmbedBuilder().setColor(left > 0 ? 0x4cc9f0 : 0x8d99ae).setTitle(`🛡️ ضمان الطلب #${o.id}`)
    .setDescription(left > 0
      ? `ضمانك ساري حتى <t:${ts(o.warranty_until)}:F> (<t:${ts(o.warranty_until)}:R>).\nلو صار أي خلل برمجي افتح **تذكرة دعم فني** وأرفق رقم الطلب وسنصلحه مجاناً.`
      : `انتهى ضمان هذا الطلب في <t:${ts(o.warranty_until)}:F>.`);
}

// ======================= الحالة (دفع / تسليم) =======================
// تُستدعى بعد أي تغيير حالة (أزرار أو الداشبورد). آمنة للتكرار.
async function onStatus(guild, o, channel) {
  if (!o) return;
  const now = Date.now();
  if (['paid', 'working', 'delivered'].includes(o.status) && !o.paid_at) {
    db.prepare('UPDATE orders SET paid_at=? WHERE id=?').run(now, o.id);
    o = getOrder(o.id);
    await sendInvoice(guild, o, channel).catch(console.error);
    await require('./hosted/sales').onPaid(guild, o, channel).catch(console.error);   // «أضف بوتك»
  }
  if (o.status === 'delivered' && !o.delivered_at) {
    const until = warrantyOn() ? now + (+S('warranty_days') || 7) * DAY : 0;
    db.prepare('UPDATE orders SET delivered_at=?, warranty_until=?, warranty_warned=0, warranty_ended=0 WHERE id=?').run(now, until, o.id);
    o = getOrder(o.id);
    if (until) {
      const emb = warrantyEmbed(o);
      const ch = channel || (o.channel_id && await guild.channels.fetch(o.channel_id).catch(() => null));
      if (ch) await ch.send({ embeds: [emb] }).catch(() => {});
      (await guild.client.users.fetch(o.user_id).catch(() => null))?.send({ embeds: [emb] }).catch(() => {});
    }
  }
  return o;
}

async function warrantyTick(guild) {
  if (!warrantyOn()) return;
  const now = Date.now(), remind = (+S('warranty_remind_hours') || 24) * HOUR;
  for (const o of db.prepare("SELECT * FROM orders WHERE warranty_until>0 AND warranty_ended=0 AND status='delivered'").all()) {
    const left = o.warranty_until - now, user = await guild.client.users.fetch(o.user_id).catch(() => null);
    const ch = o.channel_id && !o.closed ? await guild.channels.fetch(o.channel_id).catch(() => null) : null;
    if (left <= 0) {
      db.prepare('UPDATE orders SET warranty_ended=1, warranty_warned=1 WHERE id=?').run(o.id);
      const e = new EmbedBuilder().setColor(0x8d99ae).setTitle(`🛡️ انتهى ضمان الطلب #${o.id}`).setDescription('انتهت فترة الضمان. تقدر تفتح تذكرة لأي استفسار، وشكراً لثقتك 💜');
      user?.send({ embeds: [e] }).catch(() => {}); ch?.send({ content: `<@${o.user_id}>`, embeds: [e] }).catch(() => {});
      logTo(guild, 'log_orders', new EmbedBuilder().setColor(0x8d99ae).setTitle(`🛡️ انتهى ضمان #${o.id}`).setDescription(`العميل <@${o.user_id}>`));
    } else if (left <= remind && !o.warranty_warned) {
      db.prepare('UPDATE orders SET warranty_warned=1 WHERE id=?').run(o.id);
      const e = new EmbedBuilder().setColor(0xffd166).setTitle(`⏰ ضمان طلبك #${o.id} قارب على الانتهاء`)
        .setDescription(`ينتهي الضمان <t:${ts(o.warranty_until)}:R> (<t:${ts(o.warranty_until)}:F>).\nلو عندك أي خلل أو ملاحظة على البوت افتح **تذكرة دعم فني** قبل انتهاء المدة.`);
      user?.send({ embeds: [e] }).catch(() => {}); ch?.send({ content: `<@${o.user_id}>`, embeds: [e] }).catch(() => {});
    }
  }
}

// ======================= الإغلاق التلقائي للخامل =======================
const keepRow = (kind, id) => new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`keep:${kind}:${id}`).setLabel('أبقِه مفتوحاً').setEmoji('🔓').setStyle(ButtonStyle.Success));
async function getCh(guild, id) { // {ch, gone}: gone فقط لو القناة محذوفة فعلاً (مو خطأ مؤقت)
  try { return { ch: await guild.channels.fetch(id), gone: false }; } catch (e) { return { ch: null, gone: e?.code === 10003 }; }
}
async function closeShopChannel(guild, kind, row, why) {
  const { ch, gone } = await getCh(guild, row.channel_id);
  if (!ch && !gone) return; // خطأ مؤقت، نعيد المحاولة لاحقاً
  const now = Date.now();
  if (kind === 'order') {
    if (row.status === 'pending') db.prepare("UPDATE orders SET status='cancelled' WHERE id=?").run(row.id);
    db.prepare('UPDATE orders SET closed=? WHERE id=?').run(now, row.id);
  } else db.prepare("UPDATE tickets SET status='closed', closed=? WHERE id=?").run(now, row.id);
  const tf = ch ? await transcriptFiles(ch, `${kind}-${row.id}`).catch(() => null) : null, buf = !!tf;
  const file = () => tf.files();
  const label = kind === 'order' ? 'طلب' : 'تذكرة';
  const e = new EmbedBuilder().setColor(0xef476f).setTitle(`⏰ إغلاق تلقائي — ${label} #${row.id}`).setDescription(`العميل: <@${row.user_id}>\nالسبب: ${why}`).setTimestamp();
  await logTo(guild, kind === 'order' ? 'log_orders' : 'tk_log_channel', e, buf ? file() : []);
  (await guild.client.users.fetch(row.user_id).catch(() => null))?.send({ content: `⏰ تم إغلاق ${label} #${row.id} تلقائياً (${why}). نسخة المحادثة مرفقة.`, files: buf ? file() : [] }).catch(() => {});
  if (ch) { await ch.send('🔒 تم إغلاق هذا الروم تلقائياً بسبب الخمول، وحُفظت نسخة المحادثة. سيُحذف بعد 5 ثواني...').catch(() => {}); setTimeout(() => ch.delete().catch(() => {}), 5000); }
}
async function idleTick(guild) {
  if (S('auto_close_enabled') !== '1') return;
  const now = Date.now(), warnH = +S('idle_warn_hours') || 24, closeH = Math.max(+S('idle_close_hours') || 48, warnH), delH = +S('delivered_close_hours') || 24;
  const check = async (kind, row, base, fast) => {
    const closeMs = (fast ? delH : closeH) * HOUR;
    let warnMs = fast ? Math.max(closeMs - HOUR, closeMs / 2) : warnH * HOUR; if (warnMs >= closeMs) warnMs = closeMs / 2;
    const idle = now - base;
    if (idle >= closeMs) return closeShopChannel(guild, kind, row, `خمول ${Math.floor(idle / HOUR)} ساعة`);
    if (idle >= warnMs && !row.idle_warned) {
      const { ch } = await getCh(guild, row.channel_id); if (!ch) return;
      db.prepare(`UPDATE ${kind === 'order' ? 'orders' : 'tickets'} SET idle_warned=1 WHERE id=?`).run(row.id);
      const leftH = Math.max(1, Math.round((closeMs - idle) / HOUR));
      await ch.send({ content: `<@${row.user_id}>`, embeds: [new EmbedBuilder().setColor(0xffd166).setTitle('⏰ تنبيه خمول')
        .setDescription(`ما فيه نشاط في هذا الروم من فترة.\nلو ما صار رد خلال **${leftH} ساعة تقريباً** سيُغلق تلقائياً وتُحفظ نسخة المحادثة.\nاكتب أي رسالة أو اضغط الزر للإبقاء عليه مفتوحاً.`)], components: [keepRow(kind, row.id)] }).catch(() => {});
    }
  };
  for (const o of db.prepare("SELECT * FROM orders WHERE closed IS NULL AND channel_id IS NOT NULL AND channel_id!=''").all()) {
    const fast = ['delivered', 'cancelled'].includes(o.status);
    await check('order', o, Math.max(o.last_activity || 0, fast ? o.delivered_at || 0 : 0, o.created || 0), fast).catch(console.error);
  }
  for (const t of db.prepare("SELECT * FROM tickets WHERE status='open' AND closed IS NULL AND channel_id IS NOT NULL AND channel_id!=''").all())
    await check('ticket', t, Math.max(t.last_activity || 0, t.created || 0), false).catch(console.error);

  // طلبات تذاكر معلّقة ما انقبلت ولا انرفضت
  const exp = (+S('request_expire_hours') || 72) * HOUR;
  for (const t of db.prepare("SELECT * FROM tickets WHERE status='requested' AND created<?").all(now - exp)) {
    db.prepare("UPDATE tickets SET status='expired', closed=? WHERE id=?").run(now, t.id);
    const rc = S('tk_requests_channel') && await guild.channels.fetch(S('tk_requests_channel')).catch(() => null);
    const msg = rc && t.req_msg && await rc.messages.fetch(t.req_msg).catch(() => null);
    if (msg?.embeds[0]) msg.edit({ embeds: [EmbedBuilder.from(msg.embeds[0]).setColor(0x8d99ae).addFields({ name: '⌛ انتهى الطلب', value: 'لم تتم معالجته في المدة المحددة' })], components: [] }).catch(() => {});
    (await guild.client.users.fetch(t.user_id).catch(() => null))?.send(`⌛ انتهت صلاحية طلب تذكرتك #${t.id} بدون معالجة. افتح تذكرة جديدة لو ما زلت تحتاج مساعدة.`).catch(() => {});
  }
}

// ======================= التقارير =======================
function range(p) {
  const off = (+S('tz_offset') || 0) * HOUR, now = Date.now(), sod = Math.floor((now + off) / DAY) * DAY - off;
  switch (p) {
    case 'today': return [sod, now, 'اليوم'];
    case 'yesterday': return [sod - DAY, sod, 'أمس'];
    case 'week': return [now - 7 * DAY, now, 'آخر 7 أيام'];
    case 'month': return [now - 30 * DAY, now, 'آخر 30 يوم'];
    case 'year': return [now - 365 * DAY, now, 'آخر سنة'];
    default: return [0, now, 'كل الفترات'];
  }
}
function reportData(from, to) {
  const orders = db.prepare('SELECT * FROM orders').all(), r = rates(), off = (+S('tz_offset') || 0) * HOUR;
  const doneAt = (o) => o.delivered_at || (o.status === 'delivered' ? o.closed || o.created : 0);
  const inR = (t) => t >= from && t <= to;
  const delivered = orders.filter((o) => o.status === 'delivered' && inR(doneAt(o)));
  const created = orders.filter((o) => inR(o.created));
  const months = delivered.reduce((s, o) => s + totalMonths(o), 0), base = delivered.reduce((s, o) => s + o.base, 0);
  const byPay = {}, products = {}, staff = {}, customers = {}, days = {};
  for (const o of delivered) {
    const m = totalMonths(o);
    byPay[o.pay] = byPay[o.pay] || { orders: 0, amount: 0 }; byPay[o.pay].orders++; byPay[o.pay].amount += m * (r[o.pay] || 0);
    for (const it of JSON.parse(o.items || '[]')) products[it.name] = (products[it.name] || 0) + 1;
    if (o.claimed_by) staff[o.claimed_by] = (staff[o.claimed_by] || 0) + 1;
    customers[o.user_id] = (customers[o.user_id] || 0) + m;
    const d = new Date(doneAt(o) + off).toISOString().slice(0, 10); days[d] = days[d] || { orders: 0, months: 0 }; days[d].orders++; days[d].months += m;
  }
  const rv = db.prepare('SELECT COUNT(*) c, AVG(stars) a FROM reviews WHERE created BETWEEN ? AND ?').get(from, to);
  const sale = +S('month_sale_value') || 0, cost = +S('month_cost') || 0;
  const top = (o, n = 5) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n);
  return {
    from, to, created: created.length, delivered: delivered.length, cancelled: created.filter((o) => o.status === 'cancelled').length,
    inProgress: orders.filter((o) => ['paid', 'working'].includes(o.status)).length, waiting: orders.filter((o) => o.status === 'pending' && !o.closed).length,
    months, discountMonths: base - months, byPay, revenue: months * sale, cost: months * cost, profit: months * (sale - cost), configured: sale > 0,
    reviews: rv.c, avgStars: rv.a ? +rv.a.toFixed(2) : 0, products: top(products, 8), staff: top(staff), customers: top(customers),
    days: Object.entries(days).sort((a, b) => a[0].localeCompare(b[0])).map(([d, v]) => ({ day: d, ...v })), orders: delivered,
  };
}
function reportEmbed(d, label) {
  const cur = S('currency_label') || '', money = (n) => `${fmt(n)} ${cur}`;
  const e = new EmbedBuilder().setColor(COLOR).setTitle(`📈 تقرير المبيعات — ${label}`).setTimestamp()
    .setDescription(`🧾 طلبات جديدة: **${d.created}** • ✅ مسلّمة: **${d.delivered}** • ❌ ملغية: **${d.cancelled}**\n🛠️ قيد التنفيذ الآن: **${d.inProgress}** • ⏳ بانتظار الدفع: **${d.waiting}**`)
    .addFields({ name: '⏱️ المبيعات (أشهر نيترو بعد الخصم)', value: `**${fmt(d.months)}** شهر\nخصومات ممنوحة: ${fmt(d.discountMonths)} شهر`, inline: true });
  if (d.configured) e.addFields({ name: '💰 الأرباح التقديرية', value: `الإيراد: **${money(d.revenue)}**\nالتكلفة: ${money(d.cost)}\nالصافي: **${money(d.profit)}**`, inline: true });
  else e.addFields({ name: '💰 الأرباح', value: 'حدد «قيمة شهر نيترو» من الداشبورد ← إعدادات الطلبات لحساب الأرباح', inline: true });
  const pay = Object.entries(d.byPay).map(([k, v]) => `${PAY[k]?.emoji || ''} ${PAY[k]?.label || k}: ${v.orders} طلب — ${fmt(v.amount)}`).join('\n');
  if (pay) e.addFields({ name: '💳 حسب طريقة الدفع', value: pay.slice(0, 1000) });
  if (d.products.length) e.addFields({ name: '🔥 الأكثر طلباً', value: d.products.map(([n, c], i) => `${i + 1}. ${n} — ${c}`).join('\n').slice(0, 1000), inline: true });
  if (d.staff.length) e.addFields({ name: '🛡️ أكثر الستاف تسليماً', value: d.staff.map(([id, c], i) => `${i + 1}. <@${id}> — ${c}`).join('\n'), inline: true });
  if (d.customers.length) e.addFields({ name: '👑 أفضل العملاء', value: d.customers.map(([id, m], i) => `${i + 1}. <@${id}> — ${fmt(m)} شهر`).join('\n'), inline: true });
  e.addFields({ name: '⭐ التقييم', value: d.reviews ? `${d.avgStars} / 5 (${d.reviews} تقييم)` : 'لا يوجد', inline: true });
  return e;
}
function reportCsv(d) {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [['order', 'user_id', 'claimed_by', 'pay', 'nitro_months', 'amount', 'coupon', 'created', 'delivered_at'].join(',')];
  for (const o of d.orders) rows.push([o.id, o.user_id, o.claimed_by || '', o.pay, fmt(totalMonths(o)), q(amountFor(totalMonths(o), o.pay)), o.coupon || '', new Date(o.created).toISOString(), o.delivered_at ? new Date(o.delivered_at).toISOString() : ''].join(','));
  return '﻿' + rows.join('\n');
}
async function weeklyReport(guild) {
  const days = +S('report_interval_days') || 0, chId = S('report_channel');
  if (!days || !chId) return;
  const last = +S('report_last') || 0, now = Date.now();
  if (!last) return setS('report_last', now);
  if (now - last < days * DAY) return;
  setS('report_last', now);
  const ch = await guild.channels.fetch(chId).catch(() => null); if (!ch) return;
  const d = reportData(last, now);
  await ch.send({ embeds: [reportEmbed(d, `آخر ${days} يوم`)], files: [new AttachmentBuilder(Buffer.from(reportCsv(d)), { name: 'report.csv' })] }).catch(() => {});
}

// ======================= الأوامر =======================
const commands = [
  new SlashCommandBuilder().setName('report').setDescription('تقرير المبيعات والأرباح').setDefaultMemberPermissions(P.Administrator)
    .addStringOption((o) => o.setName('period').setDescription('الفترة').setRequired(true).addChoices(
      { name: 'اليوم', value: 'today' }, { name: 'أمس', value: 'yesterday' }, { name: 'آخر 7 أيام', value: 'week' },
      { name: 'آخر 30 يوم', value: 'month' }, { name: 'آخر سنة', value: 'year' }, { name: 'الكل', value: 'all' })),
  new SlashCommandBuilder().setName('blacklist').setDescription('القائمة السوداء للمحتالين').setDefaultMemberPermissions(P.ModerateMembers)
    .addSubcommand((s) => s.setName('add').setDescription('إضافة محتال').addUserOption((o) => o.setName('user').setDescription('العضو').setRequired(true))
      .addStringOption((o) => o.setName('reason').setDescription('السبب')).addBooleanOption((o) => o.setName('ban').setDescription('حظره من السيرفر الآن')))
    .addSubcommand((s) => s.setName('remove').setDescription('إزالة من القائمة').addUserOption((o) => o.setName('user').setDescription('العضو').setRequired(true)))
    .addSubcommand((s) => s.setName('check').setDescription('فحص عضو').addUserOption((o) => o.setName('user').setDescription('العضو').setRequired(true)))
    .addSubcommand((s) => s.setName('list').setDescription('عرض القائمة')),
  new SlashCommandBuilder().setName('warranty').setDescription('حالة الضمان لطلباتك').addIntegerOption((o) => o.setName('order').setDescription('رقم الطلب (اختياري)')),
  new SlashCommandBuilder().setName('invoice').setDescription('إعادة إرسال فاتورة طلب').addIntegerOption((o) => o.setName('order').setDescription('رقم الطلب').setRequired(true)),
].map((c) => c.toJSON());

async function onCommand(i) {
  switch (i.commandName) {
    case 'report': {
      if (!i.memberPermissions.has(P.Administrator)) return i.reply({ content: '❌ للإدارة العليا فقط', flags: EPH }), true;
      await i.deferReply({ flags: EPH });
      const [from, to, label] = range(i.options.getString('period')), d = reportData(from, to);
      await i.editReply({ embeds: [reportEmbed(d, label)], files: [new AttachmentBuilder(Buffer.from(reportCsv(d)), { name: 'report.csv' })] });
      return true;
    }
    case 'blacklist': {
      if (!isStaff(i.member)) return i.reply({ content: '❌ للستاف فقط', flags: EPH }), true;
      const sub = i.options.getSubcommand();
      if (sub === 'list') {
        const rows = bl.list();
        return i.reply({ flags: EPH, embeds: [new EmbedBuilder().setColor(0xef476f).setTitle(`🚫 القائمة السوداء (${rows.length})`)
          .setDescription(rows.slice(0, 40).map((r) => `<@${r.user_id}> (\`${r.user_id}\`) — ${r.reason || 'بدون سبب'}`).join('\n') || 'فاضية')] }), true;
      }
      const u = i.options.getUser('user');
      if (sub === 'check') { const r = bl.get(u.id); return i.reply({ content: r ? `🚫 ${u} في القائمة السوداء — ${r.reason || 'بدون سبب'}` : `✅ ${u} غير موجود في القائمة`, flags: EPH }), true; }
      if (sub === 'remove') return i.reply({ content: bl.remove(u.id) ? `✅ تمت إزالة ${u}` : 'مو موجود في القائمة', flags: EPH }), true;
      const reason = i.options.getString('reason') || '';
      bl.add(u.id, reason, i.user.id);
      let extra = '';
      if (i.options.getBoolean('ban')) { const ok = await i.guild.members.ban(u.id, { reason: `قائمة سوداء: ${reason}` }).then(() => true).catch(() => false); extra = ok ? ' + تم حظره' : ' (ما قدرت أحظره)'; }
      logTo(i.guild, 'log_mod', new EmbedBuilder().setColor(0xef476f).setTitle('🚫 إضافة للقائمة السوداء').setDescription(`${u} (\`${u.id}\`)\nبواسطة ${i.user}\nالسبب: ${reason || '—'}`).setTimestamp());
      return i.reply({ content: `🚫 تمت إضافة ${u} للقائمة السوداء${extra}. ما يقدر يطلب ولا يفتح تذاكر.`, flags: EPH }), true;
    }
    case 'warranty': {
      const id = i.options.getInteger('order');
      const rows = id ? [getOrder(id)].filter(Boolean) : db.prepare("SELECT * FROM orders WHERE user_id=? AND status='delivered' ORDER BY id DESC LIMIT 10").all(i.user.id);
      if (id && rows[0] && rows[0].user_id !== i.user.id && !isStaff(i.member)) return i.reply({ content: '❌ هذا مو طلبك', flags: EPH }), true;
      if (!rows.length) return i.reply({ content: 'ما لقيت طلبات مسلّمة عليها ضمان', flags: EPH }), true;
      return i.reply({ flags: EPH, embeds: rows.slice(0, 5).map((o) => o.warranty_until ? warrantyEmbed(o) : new EmbedBuilder().setColor(0x8d99ae).setDescription(`طلب #${o.id}: لا يوجد ضمان مسجّل (${STATUS[o.status]})`)) }), true;
    }
    case 'invoice': {
      const o = getOrder(i.options.getInteger('order'));
      if (!o) return i.reply({ content: 'ما لقيت الطلب', flags: EPH }), true;
      if (o.user_id !== i.user.id && !isStaff(i.member)) return i.reply({ content: '❌ هذا مو طلبك', flags: EPH }), true;
      if (!o.paid_at) return i.reply({ content: '⏳ ما تم تأكيد الدفع لهذا الطلب بعد', flags: EPH }), true;
      return i.reply({ flags: EPH, embeds: [invoiceEmbed(o)], files: [new AttachmentBuilder(Buffer.from(invoiceHtml(o)), { name: `${invNo(o)}.html` })] }), true;
    }
  }
  return false;
}

// أزرار «أبقِه مفتوحاً»
async function handle(i) {
  if (!i.isButton() || !i.customId.startsWith('keep:')) return false;
  const [, kind, id] = i.customId.split(':');
  const row = kind === 'order' ? getOrder(id) : db.prepare('SELECT * FROM tickets WHERE id=?').get(id);
  if (!row) return i.reply({ content: 'غير موجود', flags: EPH }), true;
  if (i.user.id !== row.user_id && !isStaff(i.member)) return i.reply({ content: '❌ ما تقدر', flags: EPH }), true;
  db.prepare(`UPDATE ${kind === 'order' ? 'orders' : 'tickets'} SET last_activity=?, idle_warned=0 WHERE id=?`).run(Date.now(), row.id);
  await i.update({ content: `🔓 تم إبقاء الروم مفتوحاً بواسطة ${i.user}`, embeds: [], components: [] });
  return true;
}

function init(client) {
  // تتبع النشاط داخل رومات الطلبات والتذاكر
  client.on('messageCreate', (m) => {
    if (!m.guild || m.author.bot || !/^(order|ticket)-\d+$/.test(m.channel.name || '')) return;
    const t = m.channel.name.startsWith('order') ? 'orders' : 'tickets';
    db.prepare(`UPDATE ${t} SET last_activity=?, idle_warned=0 WHERE channel_id=?`).run(Date.now(), m.channelId);
  });
  // المحتال اللي يرجع للسيرفر يتحظر
  client.on('guildMemberAdd', async (m) => {
    if (S('blacklist_ban_on_join') !== '1') return;
    const r = bl.get(m.id); if (!r) return;
    const ok = await m.ban({ reason: `قائمة سوداء: ${r.reason || '—'}` }).then(() => true).catch(() => false);
    logTo(m.guild, 'log_mod', new EmbedBuilder().setColor(0xef476f).setTitle('🚫 محتال حاول الدخول').setDescription(`${m.user} (\`${m.id}\`)\nالسبب: ${r.reason || '—'}\n${ok ? 'تم حظره تلقائياً' : 'ما قدرت أحظره'}`).setTimestamp());
  });
  let busy = false;
  const tick = async () => {
    if (busy) return; busy = true;
    try {
      const g = client.guilds.cache.get(process.env.GUILD_ID); if (!g) return;
      for (const f of [warrantyTick, idleTick, weeklyReport]) await f(g).catch((e) => console.error('[shop]', e));
    } finally { busy = false; }
  };
  setTimeout(tick, 20e3); setInterval(tick, 5 * 60e3);
}

module.exports = { commands, onCommand, handle, init, onStatus, sendInvoice, invoiceEmbed, warrantyShort, reportData, reportEmbed, reportCsv, range, closeShopChannel };
// تم صنع البوت بمتجر نوفا ستور • يوزر الاونر: .5yb.
