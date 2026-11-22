// ═══════════════════════════════════════════════
//  NOVA STORE • إضافات المتجر: فواتير + ضمان + تقارير مبيعات (مدمج من مشروع Store)
// ═══════════════════════════════════════════════
const client = require("../index");
const { EmbedBuilder, AttachmentBuilder } = require("discord.js");
const St = require("../utils/store");
const Pro = require("../prodb");

const DAY = 864e5, HOUR = 36e5, ts = ms => Math.floor(ms / 1000);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const invNo = o => `INV-${String(o.id).padStart(5, "0")}`;
const gld = () => client.guilds.cache.get(process.env.GUILD_ID);

// ───────── الفواتير ─────────
function invoiceEmbed(o) {
    const c = St.cfg(), total = St.totalMonths(o), disc = Number(o.bundle) + Number(o.couponPct || 0);
    return new EmbedBuilder().setColor(0x06d6a0).setTitle(`🧾 فاتورة ${invNo(o)}`).setDescription(`شكراً لتعاملك مع **${c.storeName}** 💜`).addFields(
        { name: "👤 العميل", value: `<@${o.userId}>\n\`${o.userId}\``, inline: true },
        { name: "📅 تاريخ الدفع", value: `<t:${ts(o.paidAt || Date.now())}:f>`, inline: true },
        { name: "🧾 رقم الطلب", value: `#${o.id}`, inline: true },
        { name: "🤖 المنتجات", value: o.items.map(i => `${i.emoji || "🤖"} ${i.name} — ${St.fmt(i.months)} شهر`).join("\n").slice(0, 1000) || "—" },
        { name: "💰 قبل الخصم", value: `${St.fmt(o.base)} شهر نيترو`, inline: true },
        { name: "🏷️ الخصم", value: `${disc}%${o.coupon ? ` (كوبون ${o.coupon})` : ""}`, inline: true },
        { name: "⏱️ بعد الخصم", value: `${St.fmt(total)} شهر نيترو`, inline: true },
        { name: `${St.PAY[o.pay]?.emoji || "💳"} المبلغ المدفوع`, value: `**${St.amountFor(total, o.pay)}**` },
        { name: "🛡️ الضمان", value: c.warrantyEnabled ? `${c.warrantyDays} أيام من تاريخ التسليم` : "غير مفعّل" }
    ).setFooter({ text: `${c.storeName} • احتفظ بهذه الفاتورة` }).setTimestamp(o.paidAt || Date.now());
}
function invoiceHtml(o) {
    const c = St.cfg(), total = St.totalMonths(o), rows = o.items.map(i => `<tr><td>${esc(i.emoji || "")} ${esc(i.name)}</td><td>${St.fmt(i.months)} شهر</td></tr>`).join("");
    return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${invNo(o)}</title>
<style>body{font-family:Tahoma,Arial,sans-serif;background:#120b20;margin:0;padding:24px;color:#efe7ff}.c{max-width:640px;margin:auto;background:#1c1233;border-radius:16px;padding:28px;border-top:8px solid #9b6bff}
h1{margin:0 0 4px}.m{color:#b9a8e6;font-size:14px}table{width:100%;border-collapse:collapse;margin:16px 0}td,th{padding:8px;border-bottom:1px solid #3a2a63;text-align:right}.t{font-size:20px;font-weight:bold;color:#ff9ee0}</style></head><body><div class="c">
<h1>🧾 فاتورة ${invNo(o)}</h1><div class="m">${esc(c.storeName)} • ${new Date(o.paidAt || Date.now()).toLocaleString("ar")}</div>
<p>رقم الطلب: <b>#${o.id}</b><br>ايدي العميل: <b>${esc(o.userId)}</b><br>طريقة الدفع: <b>${esc(St.PAY[o.pay]?.label || o.pay)}</b></p>
<table><tr><th>البند</th><th>المدة</th></tr>${rows}</table>
<p>المجموع قبل الخصم: ${St.fmt(o.base)} شهر نيترو<br>الخصم: ${Number(o.bundle) + Number(o.couponPct || 0)}%${o.coupon ? ` (كوبون ${esc(o.coupon)})` : ""}<br>بعد الخصم: ${St.fmt(total)} شهر نيترو</p>
<p class="t">المبلغ المدفوع: ${esc(St.amountFor(total, o.pay))}</p><p class="m">الضمان: ${c.warrantyEnabled ? c.warrantyDays + " أيام من تاريخ التسليم" : "غير مفعّل"}.</p></div></body></html>`;
}
async function sendInvoice(guild, o, channel) {
    const c = St.cfg(); if (!c.invoiceEnabled) return;
    const emb = invoiceEmbed(o), files = () => [new AttachmentBuilder(Buffer.from(invoiceHtml(o)), { name: `${invNo(o)}.html` })];
    const ch = channel || (o.channelId && await guild.channels.fetch(o.channelId).catch(() => null));
    if (ch) await ch.send({ content: `<@${o.userId}> 🧾 هذه فاتورتك:`, embeds: [emb], files: files() }).catch(() => {});
    if (c.invoiceDm) client.users.fetch(o.userId).then(u => u.send({ embeds: [emb], files: files() })).catch(() => {});
    const log = c.logChannel && guild.channels.cache.get(c.logChannel); if (log) log.send({ embeds: [emb], files: files() }).catch(() => {});
}

// ───────── الضمان ─────────
function onDelivered(guild, o) {
    const c = St.cfg(); if (!c.warrantyEnabled) return o;
    o.warrantyUntil = Date.now() + Number(c.warrantyDays) * DAY; o.warrantyWarned = false; o.warrantyEnded = false; return St.saveOrder(o);
}
function warrantyEmbed(o) {
    const left = o.warrantyUntil - Date.now();
    return new EmbedBuilder().setColor(left > 0 ? 0x4cc9f0 : 0x8d99ae).setTitle(`🛡️ ضمان الطلب #${o.id}`).setDescription(left > 0
        ? `ضمانك ساري حتى <t:${ts(o.warrantyUntil)}:F> (<t:${ts(o.warrantyUntil)}:R>).\nلو صار أي خلل برمجي افتح **تكت دعم فني** وأرفق رقم الطلب وسنصلحه مجاناً.`
        : `انتهى ضمان هذا الطلب في <t:${ts(o.warrantyUntil)}:F>.`);
}
async function warrantyTick(guild) {
    const c = St.cfg(); if (!c.warrantyEnabled) return;
    const now = Date.now(), remind = Number(c.warrantyRemindHours) * HOUR;
    for (const o of St.listOrders(500)) {
        if (!o.warrantyUntil || o.warrantyEnded || o.status !== "delivered") continue;
        const left = o.warrantyUntil - now, user = await client.users.fetch(o.userId).catch(() => null);
        if (left <= 0) { o.warrantyEnded = true; o.warrantyWarned = true; St.saveOrder(o); user?.send({ embeds: [warrantyEmbed(o)] }).catch(() => {}); }
        else if (left <= remind && !o.warrantyWarned) { o.warrantyWarned = true; St.saveOrder(o); user?.send({ content: `⏰ ضمان طلبك #${o.id} على وشك الانتهاء`, embeds: [warrantyEmbed(o)] }).catch(() => {}); }
    }
}

// ───────── التقارير ─────────
function range(p) {
    const now = Date.now();
    return { today: [new Date().setHours(0, 0, 0, 0), now, "اليوم"], week: [now - 7 * DAY, now, "آخر 7 أيام"], month: [now - 30 * DAY, now, "آخر 30 يوم"], year: [now - 365 * DAY, now, "آخر سنة"] }[p] || [0, now, "كل الفترات"];
}
function reportData(from, to) {
    const c = St.cfg(), orders = Object.values(St.listOrders(100000)), inR = t => t >= from && t <= to;
    const delivered = orders.filter(o => o.status === "delivered" && inR(o.deliveredAt || o.created)), created = orders.filter(o => inR(o.created));
    const months = delivered.reduce((s, o) => s + St.totalMonths(o), 0), base = delivered.reduce((s, o) => s + Number(o.base), 0);
    const byPay = {}, products = {}, staff = {}, customers = {};
    for (const o of delivered) {
        const m = St.totalMonths(o); byPay[o.pay] = byPay[o.pay] || { orders: 0, amount: 0 }; byPay[o.pay].orders++; byPay[o.pay].amount += m * (c.rates[o.pay] || 0);
        for (const it of o.items) products[it.name] = (products[it.name] || 0) + 1;
        if (o.deliveredBy) staff[o.deliveredBy] = (staff[o.deliveredBy] || 0) + 1; customers[o.userId] = (customers[o.userId] || 0) + m;
    }
    const top = (o, n = 5) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n), rated = delivered.filter(o => o.stars);
    return { created: created.length, delivered: delivered.length, cancelled: created.filter(o => o.status === "cancelled").length, inProgress: orders.filter(o => o.status === "paid").length, waiting: orders.filter(o => o.status === "pending").length,
        months, discountMonths: base - months, byPay, revenue: months * c.saleValue, cost: months * c.costValue, profit: months * (c.saleValue - c.costValue), configured: c.saleValue > 0,
        reviews: rated.length, avgStars: rated.length ? +(rated.reduce((s, o) => s + o.stars, 0) / rated.length).toFixed(2) : 0, products: top(products, 8), staff: top(staff), customers: top(customers), orders: delivered };
}
function reportEmbed(d, label) {
    const c = St.cfg(), money = n => `${St.fmt(n)} ${c.currency || ""}`.trim();
    const e = new EmbedBuilder().setColor(St.COLOR).setTitle(`📈 تقرير المبيعات — ${label}`).setTimestamp()
        .setDescription(`🧾 طلبات جديدة: **${d.created}** • ✅ مسلّمة: **${d.delivered}** • ❌ ملغية: **${d.cancelled}**\n🛠️ قيد التنفيذ الآن: **${d.inProgress}** • ⏳ بانتظار الدفع: **${d.waiting}**`)
        .addFields({ name: "⏱️ المبيعات (أشهر نيترو بعد الخصم)", value: `**${St.fmt(d.months)}** شهر\nخصومات ممنوحة: ${St.fmt(d.discountMonths)} شهر`, inline: true });
    e.addFields(d.configured ? { name: "💰 الأرباح التقديرية", value: `الإيراد: **${money(d.revenue)}**\nالتكلفة: ${money(d.cost)}\nالصافي: **${money(d.profit)}**`, inline: true } : { name: "💰 الأرباح", value: "حدد «قيمة شهر نيترو» من الداشبورد ← المتجر لحساب الأرباح", inline: true });
    const pay = Object.entries(d.byPay).map(([k, v]) => `${St.PAY[k]?.emoji || ""} ${St.PAY[k]?.label || k}: ${v.orders} طلب — ${St.fmt(v.amount)}`).join("\n");
    if (pay) e.addFields({ name: "💳 حسب طريقة الدفع", value: pay.slice(0, 1000) });
    if (d.products.length) e.addFields({ name: "🔥 الأكثر طلباً", value: d.products.map(([n, k], i) => `${i + 1}. ${n} — ${k}`).join("\n").slice(0, 1000), inline: true });
    if (d.staff.length) e.addFields({ name: "🛡️ أكثر الستاف تسليماً", value: d.staff.map(([id, k], i) => `${i + 1}. <@${id}> — ${k}`).join("\n"), inline: true });
    if (d.customers.length) e.addFields({ name: "👑 أفضل العملاء", value: d.customers.map(([id, m], i) => `${i + 1}. <@${id}> — ${St.fmt(m)} شهر`).join("\n"), inline: true });
    e.addFields({ name: "⭐ التقييم", value: d.reviews ? `${d.avgStars} / 5 (${d.reviews} تقييم)` : "لا يوجد", inline: true });
    return e;
}
function reportCsv(d) {
    const q = v => `"${String(v ?? "").replace(/"/g, '""')}"`, rows = [["order", "user_id", "delivered_by", "pay", "nitro_months", "amount", "coupon", "created", "delivered_at"].join(",")];
    for (const o of d.orders) rows.push([o.id, o.userId, o.deliveredBy || "", o.pay, St.fmt(St.totalMonths(o)), q(St.amountFor(St.totalMonths(o), o.pay)), o.coupon || "", new Date(o.created).toISOString(), o.deliveredAt ? new Date(o.deliveredAt).toISOString() : ""].join(","));
    return "\uFEFF" + rows.join("\n");
}
async function weeklyReport(guild) {
    const c = St.cfg(), days = Number(c.reportIntervalDays) || 0; if (!days || !c.reportChannel) return;
    const last = Number(Pro.get("store_report_last")) || 0, now = Date.now();
    if (!last) return Pro.set("store_report_last", now);
    if (now - last < days * DAY) return;
    Pro.set("store_report_last", now);
    const ch = await guild.channels.fetch(c.reportChannel).catch(() => null); if (!ch) return;
    const d = reportData(last, now);
    await ch.send({ embeds: [reportEmbed(d, `آخر ${days} يوم`)], files: [new AttachmentBuilder(Buffer.from(reportCsv(d)), { name: "report.csv" })] }).catch(() => {});
}
const tick = async () => { const g = gld(); if (!g || !client.isReady()) return; for (const f of [warrantyTick, weeklyReport]) await f(g).catch(e => console.error("[storeExtras]", e.message)); };
setInterval(tick, 30 * 60 * 1000); setTimeout(tick, 90 * 1000);

module.exports = { sendInvoice, invoiceEmbed, onDelivered, warrantyEmbed, reportData, reportEmbed, reportCsv, range };
