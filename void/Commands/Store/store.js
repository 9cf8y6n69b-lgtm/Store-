// أوامر المتجر: prices / أسعار — طلباتي / myorders — توب-ستاف / topstaff
const { EmbedBuilder } = require("discord.js");
const St = require("../../utils/store");
const TS = require("../../utils/ticketSystem");
const mute = { allowedMentions: { repliedUser: false, users: [] } };

const prices = {
    name: "prices", aliases: ["أسعار", "الاسعار", "اسعار"], description: "قائمة أسعار المتجر",
    run: async (client, ctx) => { if (!ctx.guild) return; return ctx.reply({ embeds: [St.pricesEmbed()], ...mute }); }
};
const myorders = {
    name: "myorders", aliases: ["طلباتي", "my-orders"], description: "طلباتك في المتجر",
    run: async (client, ctx) => {
        if (!ctx.guild) return;
        const uid = (ctx.author || ctx.user).id, rows = St.userOrders(uid);
        const text = rows.map(o => `**#${o.id}** — ${St.STATUS[o.status]} — ${St.fmt(St.totalMonths(o))} شهر`).join("\n") || "ما عندك طلبات للحين";
        const payload = { embeds: [new EmbedBuilder().setColor(St.COLOR).setTitle("📦 طلباتي").setDescription(text)], ...mute };
        return typeof ctx.isCommand === "function" && ctx.isCommand() ? ctx.reply({ ...payload, ephemeral: true }) : ctx.reply(payload);
    }
};
const topstaff = {
    name: "topstaff", aliases: ["توب-ستاف", "top-staff"], description: "أفضل الستاف بنقاط المتجر",
    run: async (client, ctx) => {
        if (!ctx.guild) return;
        if (!TS.isStaff(ctx.member, TS.getConfig(ctx.guild.id))) return ctx.reply({ content: "❌ للستاف فقط", ...mute });
        const medals = ["🥇", "🥈", "🥉"], rows = St.topStaff(10);
        const text = rows.map((r, n) => `${medals[n] || `**${n + 1}.**`} <@${r.id}> — ${r.points} نقطة • أكّد دفع ${r.paid || 0} • سلّم ${r.delivered || 0}`).join("\n") || "لا يوجد بيانات بعد";
        return ctx.reply({ embeds: [new EmbedBuilder().setColor(St.COLOR).setTitle("🏆 أفضل الستاف").setDescription(text)], ...mute });
    }
};
const subspanel = {
    name: "subspanel", aliases: ["لوحة-اشتراكاتي", "subs-panel"], description: "يرسل لوحة «اشتراكاتي» بصورة وزر في الروم الحالي",
    run: async (client, ctx) => {
        if (!ctx.guild) return;
        const slash = typeof ctx.isChatInputCommand === "function" && ctx.isChatInputCommand();
        if (!TS.isStaff(ctx.member, TS.getConfig(ctx.guild.id))) return ctx.reply({ content: "❌ للإدارة فقط", ...(slash ? { ephemeral: true } : mute) });
        if (slash) await ctx.deferReply({ ephemeral: true });
        try {
            const { sendPanel } = require("../../events/subs");
            await sendPanel(ctx.channel);
            return slash ? ctx.editReply("✅ تم إرسال اللوحة") : ctx.delete?.().catch(() => {});
        } catch (e) {
            console.error("[subspanel]", e);
            const msg = `❌ ما انرسلت اللوحة: ${String(e.message).slice(0, 300)}`;
            return slash ? ctx.editReply(msg) : ctx.reply({ content: msg, ...mute });
        }
    }
};
const mysubs = {
    name: "mysubs", aliases: ["اشتراكاتي", "my-subs"], description: "اشتراكاتك والتحكم فيها",
    run: async (client, ctx) => {
        if (!ctx.guild) return;
        const slash = typeof ctx.isCommand === "function" && ctx.isCommand();
        const Sb = require("../../utils/subs"), uid = (ctx.author || ctx.user).id;
        const subs = Sb.ofUser(uid);
        const e = new EmbedBuilder().setColor(St.COLOR).setTitle("🧩 اشتراكاتك").setDescription(subs.length ? subs.slice(0, 25).map(s => `${Sb.ICON[Sb.state(s)]} ${s.emoji} **${s.name}** — ${s.status === "cancelled" ? "ملغي" : `${Sb.left(s) <= 0 ? "انتهى" : "ينتهي"} <t:${Sb.ts(s.expires)}:R>`}`).join("\n") + "\n\nللتحكم (تجديد/تذكير/إلغاء) اضغط زر **اشتراكاتي** في لوحة الاشتراكات." : "ما عندك اشتراكات للحين.");
        return slash ? ctx.reply({ embeds: [e], ephemeral: true }) : ctx.reply({ embeds: [e], ...mute });
    }
};
const warranty = {
    name: "warranty", aliases: ["ضمان", "الضمان"], description: "حالة الضمان لطلباتك",
    run: async (client, ctx) => {
        if (!ctx.guild) return;
        const Ex = require("../../events/storeExtras"), uid = (ctx.author || ctx.user).id, slash = typeof ctx.isCommand === "function" && ctx.isCommand();
        const rows = St.userOrders(uid, 10).filter(o => o.warrantyUntil);
        const payload = rows.length ? { embeds: rows.slice(0, 5).map(Ex.warrantyEmbed), ...mute } : { content: "ما عندك طلبات عليها ضمان", ...mute };
        return slash ? ctx.reply({ ...payload, ephemeral: true }) : ctx.reply(payload);
    }
};
const invoice = {
    name: "invoice", aliases: ["فاتورة", "الفاتورة"], description: "إعادة إرسال فاتورة آخر طلب مدفوع لك",
    options: [{ name: "order", description: "رقم الطلب (اتركه فاضي لآخر طلب)", type: "INTEGER", required: false }],
    run: async (client, ctx, args) => {
        if (!ctx.guild) return;
        const Ex = require("../../events/storeExtras"), uid = (ctx.author || ctx.user).id, id = Number(args?.[0]);
        const staff = TS.isStaff(ctx.member, TS.getConfig(ctx.guild.id));
        const o = id ? St.getOrder(id) : St.userOrders(uid, 20).find(x => x.paidAt);
        if (!o || !o.paidAt || (o.userId !== uid && !staff)) return ctx.reply({ content: "ما لقيت طلب مدفوع", ...mute });
        await ctx.reply({ content: "🧾 جاري إرسال الفاتورة...", ...mute }); return Ex.sendInvoice(ctx.guild, o, ctx.channel);
    }
};
const report = {
    name: "report", aliases: ["تقرير"], description: "تقرير المبيعات والأرباح",
    options: [{ name: "period", description: "الفترة", type: "STRING", required: true, choices: [{ name: "اليوم", value: "today" }, { name: "7 أيام", value: "week" }, { name: "30 يوم", value: "month" }, { name: "سنة", value: "year" }, { name: "الكل", value: "all" }] }],
    run: async (client, ctx, args) => {
        if (!ctx.guild) return;
        if (!TS.isStaff(ctx.member, TS.getConfig(ctx.guild.id))) return ctx.reply({ content: "❌ للإدارة فقط", ...mute });
        const Ex = require("../../events/storeExtras"), { AttachmentBuilder } = require("discord.js");
        const [from, to, label] = Ex.range(args?.[0] || "week"), d = Ex.reportData(from, to);
        return ctx.reply({ embeds: [Ex.reportEmbed(d, label)], files: [new AttachmentBuilder(Buffer.from(Ex.reportCsv(d)), { name: "report.csv" })], ...mute });
    }
};
module.exports = [prices, myorders, topstaff, subspanel, mysubs, warranty, invoice, report];
