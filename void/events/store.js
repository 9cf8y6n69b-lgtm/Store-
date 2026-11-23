// ═══════════════════════════════════════════════
//  NOVA STORE • المتجر داخل التكت
//  زر 🛒 المتجر داخل التكت ← اختيار المنتجات ← طريقة الدفع ← طلب بداخل نفس التكت
//  الستاف: تأكيد الدفع / تم التسليم ← العميل: كوبون / تقييم بصورة وكلام
// ═══════════════════════════════════════════════
const path = require("path");
const fs = require("fs");
const client = require("../index");
const EmV = require("../utils/void"), em = (key, fb) => EmV.btnEmoji(client.guilds.cache.get(process.env.GUILD_ID) || { id: "0" }, key) || fb;
const {
    EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder,
    ModalBuilder, TextInputBuilder, TextInputStyle, AttachmentBuilder
} = require("discord.js");
const St = require("../utils/store");
const Subs = require("../utils/subs");
const Ex = () => require("./storeExtras");
const fsx = require("fs");
const TS = require("../utils/ticketSystem");

const EPH = 64;
const IMG = "store_ticket.png";
const imgPath = path.join(__dirname, "..", "..", "assets", IMG);
const orderFiles = () => (fs.existsSync(imgPath) ? [new AttachmentBuilder(imgPath, { name: IMG })] : []);

const pendingPick = new Map();   // userId → { ids, at }
const pendingRate = new Map();   // `${orderId}:${userId}` → { stars, text }

const isStaff = (member, guild) => TS.isStaff(member, TS.getConfig(guild.id));
const notify = (uid, text) => client.users.fetch(uid).then(u => u.send(text)).catch(() => {});

async function logStore(guild, embed) {
    const id = St.cfg().logChannel; if (!id) return;
    const ch = guild.channels.cache.get(id); if (ch) ch.send({ embeds: [embed] }).catch(() => {});
}

// ───────────── رسالة الطلب ─────────────
function orderEmbed(o, ticket) {
    const total = St.totalMonths(o), items = o.items;
    const e = new EmbedBuilder().setColor(St.COLOR).setTitle(`🧾 طلب #${o.id}`).addFields(
        { name: "👤 العميل", value: `<@${o.userId}>`, inline: true },
        { name: "📌 الحالة", value: St.STATUS[o.status], inline: true },
        { name: "🛡️ المستلم", value: ticket?.claimedBy ? `<@${ticket.claimedBy}>` : "لم يُستلم بعد", inline: true },
        { name: "🤖 المنتجات", value: items.map(i => `${i.emoji || "🤖"} ${i.name} — ${St.fmt(i.months)} شهر`).join("\n").slice(0, 1024) },
        ...(o.details ? [{ name: "📝 تفاصيل البوت المخصص", value: o.details.slice(0, 1000) }] : []),
        { name: "⏱️ المجموع", value: `${St.fmt(total)} شهر نيترو`, inline: true },
        { name: "🏷️ الخصم", value: `${Number(o.bundle) + Number(o.couponPct || 0)}%${o.coupon ? ` (كوبون ${o.coupon})` : ""}`, inline: true },
        { name: `${St.PAY[o.pay]?.emoji || "💳"} الدفع`, value: `**${St.amountFor(total, o.pay)}**` }
    ).setFooter({ text: "NOVA STORE • الأسعار تقديرية وتُأكَّد من الإدارة" }).setTimestamp(o.created);
    if (orderFiles().length) e.setImage("attachment://" + IMG);
    return e;
}
function orderRows(o) {
    const done = ["delivered", "cancelled"].includes(o.status);
    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`st:paid:${o.id}`).setLabel("تأكيد الدفع").setEmoji(em("coin", "💳")).setStyle(ButtonStyle.Success).setDisabled(done || o.status !== "pending"),
            new ButtonBuilder().setCustomId(`st:deliver:${o.id}`).setLabel("تم التسليم").setEmoji(em("verified", "✅")).setStyle(ButtonStyle.Success).setDisabled(done || o.status === "pending"),
            new ButtonBuilder().setCustomId(`st:coupon:${o.id}`).setLabel("كوبون خصم").setEmoji(em("percent", "🎟️")).setStyle(ButtonStyle.Secondary).setDisabled(done),
            new ButtonBuilder().setCustomId(`st:cancel:${o.id}`).setLabel("إلغاء الطلب").setEmoji(em("reject", "✖️")).setStyle(ButtonStyle.Danger).setDisabled(done)
        )
    ];
}
async function refreshOrder(guild, o) {
    const ch = await guild.channels.fetch(o.channelId).catch(() => null);
    const msg = ch && o.msgId && await ch.messages.fetch(o.msgId).catch(() => null);
    if (msg) await msg.edit({ embeds: [orderEmbed(o, TS.getTicket(o.channelId))], components: orderRows(o) }).catch(() => {});
}

// ───────────── البدء من زر التكت ─────────────
async function openMenu(i) {
    const ticket = TS.getTicket(i.channel.id);
    if (!ticket) return i.reply({ content: "❌ زر المتجر يشتغل داخل التذاكر فقط.", flags: EPH });
    const staff = isStaff(i.member, i.guild);
    if (i.user.id !== ticket.userId && !staff) return i.reply({ content: "❌ هذا الزر لصاحب التذكرة والإدارة فقط.", flags: EPH });
    if (require("../utils/community").blGet(ticket.userId)) return i.reply({ content: require("../utils/community").DENY, flags: EPH });
    const c = St.cfg();
    if (!c.open) return i.reply({ content: "🔒 المتجر مقفل حالياً عن استقبال الطلبات، ارجع لنا قريب.", flags: EPH });
    const open = St.openOrdersOf(ticket.userId);
    if (open >= Number(c.maxOpen)) return i.reply({ content: `❌ عند العميل ${open} طلبات مفتوحة، يكملها أو يلغيها أولاً.`, flags: EPH });
    const prods = St.activeProducts().slice(0, 24);
    const menu = new StringSelectMenuBuilder().setCustomId("st:pick").setPlaceholder("اختر المنتجات اللي تبيها").setMinValues(1).setMaxValues(prods.length + 1)
        .addOptions([...prods.map(p => ({ label: `${p.name} (${St.fmt(p.months)} شهر)`.slice(0, 100), value: String(p.id), emoji: p.emoji || undefined, description: St.CAT[p.category]?.replace(/^\S+\s/, "") })),
            { label: `بوت مخصص (من ${c.customMin} أشهر)`, value: "custom", emoji: "✨" }]);
    return i.reply({ content: "🛒 **اختر المنتجات** (تقدر تختار أكثر من واحد):", embeds: [St.pricesEmbed()], components: [new ActionRowBuilder().addComponents(menu)], flags: EPH });
}

async function onPick(i) {
    pendingPick.set(i.user.id, { ids: i.values, at: Date.now() });
    const menu = new StringSelectMenuBuilder().setCustomId("st:pay").setPlaceholder("اختر طريقة الدفع")
        .addOptions(Object.entries(St.PAY).map(([k, v]) => ({ label: v.label, value: k, emoji: v.emoji })));
    return i.update({ content: "💳 **اختر طريقة الدفع** (ماعدا Apple Pay والتحويلات البنكية):", embeds: [], components: [new ActionRowBuilder().addComponents(menu)] });
}
async function onPay(i) {
    const p = pendingPick.get(i.user.id);
    if (!p || Date.now() - p.at > 15 * 60 * 1000) return i.update({ content: "⌛ انتهت الجلسة، اضغط زر المتجر من جديد.", components: [] });
    const pay = i.values[0];
    if (p.ids.includes("custom")) {
        return i.showModal(new ModalBuilder().setCustomId(`st:cm:${pay}`).setTitle("تفاصيل البوت المخصص").addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("details").setLabel("وش تبي البوت يسوي؟").setStyle(TextInputStyle.Paragraph).setMinLength(15).setMaxLength(1000).setRequired(true))));
    }
    await i.deferUpdate();
    return createOrder(i, p.ids, pay, "");
}

async function createOrder(i, ids, pay, details) {
    const ticket = TS.getTicket(i.channel.id);
    if (!ticket) return i.editReply({ content: "❌ هذا مو روم تذكرة.", components: [], embeds: [] });
    const c = St.cfg(), all = St.products();
    const prods = ids.map(x => x === "custom"
        ? { id: "custom", name: "بوت مخصص (السعر يُتفق عليه)", months: Number(c.customMin), emoji: "✨", category: "custom" }
        : all.find(p => String(p.id) === String(x))).filter(Boolean);
    if (!prods.length || !St.PAY[pay]) return i.editReply({ content: "❌ اختيار غير صالح.", components: [], embeds: [] });
    const pr = St.price(prods);
    const o = St.newOrder({ userId: ticket.userId, channelId: i.channel.id, items: prods.map(p => ({ id: p.id, name: p.name, months: p.months, emoji: p.emoji, category: p.category })), details, base: pr.base, bundle: pr.bundle, couponPct: 0, coupon: "", pay, by: i.user.id });
    const msg = await i.channel.send({ content: `<@${ticket.userId}>`, embeds: [orderEmbed(o, ticket)], files: orderFiles(), components: orderRows(o) });
    o.msgId = msg.id; St.saveOrder(o);
    const info = St.payInfo(pay);
    if (info) await i.channel.send({ embeds: [new EmbedBuilder().setColor(0xffd166).setTitle(`${St.PAY[pay].emoji} تعليمات الدفع — ${St.PAY[pay].label}`).setDescription(info.slice(0, 4000))] });
    pendingPick.delete(i.user.id);
    logStore(i.guild, new EmbedBuilder().setColor(St.COLOR).setTitle(`🆕 طلب جديد #${o.id}`).setDescription(`العميل: <@${ticket.userId}>\nالتكت: ${i.channel}\nالمجموع: ${St.fmt(St.totalMonths(o))} شهر`));
    return i.editReply({ content: `✅ تم إنشاء الطلب #${o.id} في التكت.`, components: [], embeds: [] });
}

// ───────────── أزرار الطلب ─────────────
async function onOrderButton(i, act, id, extra) {
    const o = St.getOrder(id);
    if (!o) return i.reply({ content: "الطلب غير موجود", flags: EPH });
    const staff = isStaff(i.member, i.guild), owner = i.user.id === o.userId;

    if (act === "rate") {
        if (!owner) return i.reply({ content: "❌ هذا مو طلبك", flags: EPH });
        if (o.rated) return i.reply({ content: "✅ قيّمت هذا الطلب من قبل، شكراً لك 💜", flags: EPH });
        return i.showModal(new ModalBuilder().setCustomId(`st:rm:${o.id}:${extra}`).setTitle(`تقييمك ${"⭐".repeat(Number(extra))}`).addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("text").setLabel("اكتب رأيك في التجربة").setStyle(TextInputStyle.Paragraph).setRequired(true).setMinLength(3).setMaxLength(700))));
    }
    if (act === "rimg" || act === "rskip") return onRateImage(i, o, act);
    if (act === "coupon") {
        if (!owner && !staff) return i.reply({ content: "❌ ما تقدر", flags: EPH });
        return i.showModal(new ModalBuilder().setCustomId(`st:cpm:${o.id}`).setTitle("كوبون الخصم").addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("code").setLabel("الكود").setStyle(TextInputStyle.Short).setRequired(true))));
    }
    if (act === "cancel") {
        if (!staff && !(owner && o.status === "pending")) return i.reply({ content: "❌ ما تقدر تلغي الطلب", flags: EPH });
        o.status = "cancelled"; St.saveOrder(o);
        await i.reply(`✖️ تم إلغاء الطلب #${o.id} بواسطة ${i.user}`);
        logStore(i.guild, new EmbedBuilder().setColor(0xef476f).setTitle(`✖️ إلغاء طلب #${o.id}`).setDescription(`العميل: <@${o.userId}>\nبواسطة: ${i.user}`));
        return refreshOrder(i.guild, o);
    }
    if (!staff) return i.reply({ content: "❌ للستاف فقط", flags: EPH });
    const c = St.cfg();
    if (act === "paid") {
        if (o.status !== "pending") return i.reply({ content: "الطلب مو بانتظار الدفع", flags: EPH });
        o.status = "paid"; o.paidAt = Date.now(); o.paidBy = i.user.id; St.saveOrder(o);
        Ex().sendInvoice(i.guild, o, i.channel).catch(() => {});
        require("./hosted").onPaid(i.guild, o, i.channel).catch(e => console.error("[hosted] onPaid:", e.message)); // لو الطلب فيه بوتات/باقة يظهر زر «أضف بوتك»
        await sendBotFiles(i.guild, i.channel, o, i.user.id).catch(e => console.error("[store] botfiles:", e.message)); // ملف البوت المرفوع للمنتج
        St.addStaffPoints(i.user.id, "paid", c.pointsPaid);
        await i.reply("💳 تم تأكيد الدفع، يبدأ التنفيذ 🛠️");
        notify(o.userId, `💳 تم تأكيد الدفع لطلبك #${o.id}، بدأ التنفيذ 🛠️`);
        logStore(i.guild, new EmbedBuilder().setColor(0x06d6a0).setTitle(`💳 دفع طلب #${o.id}`).setDescription(`<@${o.userId}> — ${St.amountFor(St.totalMonths(o), o.pay)}\nأكده: ${i.user}`));
    } else if (act === "deliver") {
        if (o.status !== "paid") return i.reply({ content: "أكّد الدفع أولاً", flags: EPH });
        o.status = "delivered"; o.deliveredAt = Date.now(); o.deliveredBy = i.user.id; St.saveOrder(o);
        St.addStaffPoints(i.user.id, "delivered", c.pointsDeliver);
        Ex().onDelivered(i.guild, o); // بداية الضمان
        Subs.fromOrder(o); // كل منتج مسلَّم = اشتراك يظهر للعميل في «اشتراكاتي»
        if (c.customerRole) (await i.guild.members.fetch(o.userId).catch(() => null))?.roles.add(c.customerRole).catch(() => {});
        await i.reply({
            content: `✅ تم تسليم الطلب! اشتراكاتك صارت في «اشتراكاتي» 🧩\n<@${o.userId}> قيّم تجربتك (نجوم + رأيك + صورة اختيارية):`,
            components: [new ActionRowBuilder().addComponents([1, 2, 3, 4, 5].map(n => new ButtonBuilder().setCustomId(`st:rate:${o.id}:${n}`).setLabel(`${n}`).setEmoji(em("star", "⭐")).setStyle(ButtonStyle.Secondary)))]
        });
        notify(o.userId, `✅ تم تسليم طلبك #${o.id}! شكراً لثقتك في NOVA STORE 💜`);
        logStore(i.guild, new EmbedBuilder().setColor(0x118ab2).setTitle(`✅ تسليم طلب #${o.id}`).setDescription(`العميل <@${o.userId}>\nالمسلّم: ${i.user}`));
    }
    return refreshOrder(i.guild, o);
}

// ───────────── تسليم ملفات البوتات تلقائياً ─────────────
// المنتج اللي له ملف بوت (من الداشبورد ← المتجر) يتسلّم للعميل في التكت والخاص بعد تأكيد الدفع،
// ولو كل منتجات الطلب لها ملفات يتحول الطلب «تم التسليم» تلقائي
async function sendBotFiles(guild, channel, o, by) {
    const c = St.cfg(), all = St.products();
    const found = o.items.map(it => ({ it, p: all.find(x => String(x.id) === String(it.id)) })).filter(x => x.p?.file && fsx.existsSync(St.filePath(x.p.file)));
    if (!found.length || !channel) return false;
    const user = await client.users.fetch(o.userId).catch(() => null);
    for (const { it, p } of found) {
        const title = p.botName || p.name, att = () => new AttachmentBuilder(St.filePath(p.file), { name: p.file.name });
        const e = new EmbedBuilder().setColor(0x06d6a0).setTitle(`📦 ${title}`).setDescription(`${c.botFileMsg || ""}\n\n**الطلب:** #${o.id} • **الملف:** \`${p.file.name}\``.slice(0, 3500)).setFooter({ text: `${c.storeName || "NOVA STORE"}` });
        await channel.send({ content: `<@${o.userId}>`, embeds: [e], files: [att()], allowedMentions: { users: [o.userId] } })
            .catch(err => channel.send(`⚠️ تعذّر رفع **${title}** (${err.message}) — الملف أكبر من حد السيرفر؟ سلّمه يدوياً.`).catch(() => {}));
        user?.send({ embeds: [e], files: [att()] }).catch(() => {});
    }
    if (c.autoDeliverFiles && found.length === o.items.length) await autoDeliver(guild, channel, o, by);
    return true;
}
async function autoDeliver(guild, channel, o, by) {
    const c = St.cfg();
    o.status = "delivered"; o.deliveredAt = Date.now(); o.deliveredBy = by; St.saveOrder(o);
    St.addStaffPoints(by, "delivered", c.pointsDeliver);
    if (c.customerRole) (await guild.members.fetch(o.userId).catch(() => null))?.roles.add(c.customerRole).catch(() => {});
    Ex().onDelivered(guild, o); Subs.fromOrder(o);
    await channel.send({
        content: `✅ تم تسليم الطلب تلقائياً! اشتراكاتك صارت في «اشتراكاتي» 🧩\n<@${o.userId}> قيّم تجربتك (نجوم + رأيك + صورة اختيارية):`,
        components: [new ActionRowBuilder().addComponents([1, 2, 3, 4, 5].map(n => new ButtonBuilder().setCustomId(`st:rate:${o.id}:${n}`).setLabel(`${n}`).setEmoji(em("star", "⭐")).setStyle(ButtonStyle.Secondary)))]
    }).catch(() => {});
    logStore(guild, new EmbedBuilder().setColor(0x118ab2).setTitle(`✅ تسليم تلقائي طلب #${o.id}`).setDescription(`العميل <@${o.userId}>\nملفات البوتات أُرسلت تلقائياً`));
}

// ───────────── المودالات ─────────────
async function onModal(i, parts) {
    const [, act, a, b] = parts;
    if (act === "cm") {
        await i.deferReply({ flags: EPH });
        const p = pendingPick.get(i.user.id);
        if (!p) return i.editReply({ content: "⌛ انتهت الجلسة، اضغط زر المتجر من جديد." });
        return createOrder(i, p.ids, a, i.fields.getTextInputValue("details"));
    }
    if (act === "cpm") {
        const o = St.getOrder(a); if (!o) return i.reply({ content: "الطلب غير موجود", flags: EPH });
        const code = i.fields.getTextInputValue("code").trim().toUpperCase();
        if (o.coupon) return i.reply({ content: "❌ تم استخدام كوبون على هذا الطلب", flags: EPH });
        const c = St.useCoupon(code);
        if (!c) return i.reply({ content: "❌ كوبون غير صالح", flags: EPH });
        o.coupon = code; o.couponPct = c.percent; St.saveOrder(o);
        await i.reply(`🎟️ تم تطبيق الكوبون **${code}** (-${c.percent}%)`);
        return refreshOrder(i.guild, o);
    }
    if (act === "rm") {
        const o = St.getOrder(a); if (!o) return i.reply({ content: "الطلب غير موجود", flags: EPH });
        if (i.user.id !== o.userId) return i.reply({ content: "❌ هذا مو طلبك", flags: EPH });
        pendingRate.set(`${o.id}:${i.user.id}`, { stars: Number(b), text: i.fields.getTextInputValue("text") });
        return i.reply({
            content: "📷 تبي تضيف **صورة** مع تقييمك؟ (مثلاً صورة البوت أو لقطة من التجربة)",
            components: [new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`st:rimg:${o.id}`).setLabel("إضافة صورة").setEmoji(em("image", "📷")).setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(`st:rskip:${o.id}`).setLabel("نشر بدون صورة").setEmoji("✅").setStyle(ButtonStyle.Secondary))],
            flags: EPH
        });
    }
}

const imgOf = m => { const a = [...(m.attachments?.values?.() || [])].find(x => /^image\//.test(x.contentType || "") || /\.(png|jpe?g|webp|gif)(\?|$)/i.test(x.url)); return a?.url || null; };

async function publish(i, o, imageUrl) {
    const key = `${o.id}:${i.user.id}`, r = pendingRate.get(key);
    if (!r) return false;
    pendingRate.delete(key);
    if (!client.novaReview) throw new Error("نظام التقييم غير جاهز");
    await client.novaReview({ guild: i.guild, user: i.user, member: i.member, stars: r.stars, text: r.text, imageUrl, fallback: i.channel, extra: `طلب #${o.id}` });
    o.rated = true; o.stars = r.stars; St.saveOrder(o);
    return true;
}
async function onRateImage(i, o, act) {
    if (i.user.id !== o.userId) return i.reply({ content: "❌ هذا مو طلبك", flags: EPH });
    if (!pendingRate.has(`${o.id}:${i.user.id}`)) return i.update({ content: "⌛ انتهت الجلسة، اضغط نجوم التقييم من جديد.", components: [] });
    if (act === "rskip") {
        await i.update({ content: "⏳ جاري نشر تقييمك...", components: [] });
        await publish(i, o, null);
        return i.editReply({ content: "شكراً لتقييمك 💜 تم النشر!" });
    }
    await i.update({ content: "📷 أرسل الصورة الآن في هذا الروم خلال **60 ثانية**...", components: [] });
    const got = await i.channel.awaitMessages({ filter: m => m.author.id === i.user.id && !!imgOf(m), max: 1, time: 60000 }).catch(() => null);
    const m = got?.first();
    await publish(i, o, m ? imgOf(m) : null);
    if (m) m.delete().catch(() => {});
    return i.editReply({ content: m ? "شكراً لتقييمك 💜 تم النشر مع صورتك!" : "⌛ ما وصلت صورة، نُشر تقييمك بدون صورة 💜" });
}

// ───────────── التوجيه ─────────────
client.on("interactionCreate", async i => {
    try {
        if (!i.guild || !(i.isButton() || i.isStringSelectMenu() || i.isModalSubmit())) return;
        const id = String(i.customId || "");
        if (!id.startsWith("st:")) return;
        const parts = id.split(":"), act = parts[1];
        if (i.isModalSubmit()) return await onModal(i, parts);
        if (i.isStringSelectMenu()) { if (act === "pick") return await onPick(i); if (act === "pay") return await onPay(i); return; }
        if (act === "menu") return await openMenu(i);
        return await onOrderButton(i, act, parts[2], parts[3]);
    } catch (e) {
        console.error("[STORE]", e);
        const m = { content: "⚠️ صار خطأ في المتجر، حاول مرة ثانية", flags: EPH };
        (i.replied || i.deferred ? i.followUp(m) : i.reply(m)).catch(() => {});
    }
});

module.exports = { orderEmbed };
