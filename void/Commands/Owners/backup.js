// backup / نسخة  — يرسل نسخة احتياطية كاملة للأونر في الخاص
// restore / استرجاع — يسترجع نسخة: من ملف zip مرفق، أو من قائمة النسخ المحفوظة
// (وبدون أوامر: أي ملف nova-backup-*.zip يرسله الأونر للبوت ينسترجع تلقائيا)
const Backup = require("../../backup");
const { MessageActionRow, MessageSelectMenu } = require("../../compat");

const isSlash = ctx => typeof ctx.isChatInputCommand === "function" && ctx.isChatInputCommand();
const uid = ctx => (isSlash(ctx) ? ctx.user.id : ctx.author.id);
const say = (ctx, payload) => {
    const p = typeof payload === "string" ? { content: payload } : payload;
    if (isSlash(ctx)) return (ctx.deferred || ctx.replied ? ctx.editReply(p) : ctx.reply({ ...p, ephemeral: true })).catch(() => null);
    return ctx.reply({ ...p, allowedMentions: { repliedUser: false, parse: [] } }).catch(() => null);
};
const ago = ms => { const s = Math.round((Date.now() - ms) / 1000); return s < 60 ? `قبل ${s}ث` : s < 3600 ? `قبل ${Math.round(s / 60)}د` : s < 86400 ? `قبل ${Math.round(s / 3600)}س` : `قبل ${Math.round(s / 86400)}ي`; };

module.exports = [
    {
        name: "backup",
        aliases: ["نسخة", "نسخه", "نسخة-احتياطية", "نسخه-احتياطيه"],
        description: "إرسال نسخة احتياطية كاملة للأونر في الخاص",
        directory: "Owners",
        run: async (client, ctx) => {
            if (!ctx.guild || !Backup.isAllowed(uid(ctx))) return isSlash(ctx) ? say(ctx, "⛔ هذا الأمر للأونر فقط.") : undefined;
            if (isSlash(ctx)) await ctx.deferReply({ ephemeral: true }).catch(() => {});
            try {
                const b = await Backup.send("طلب يدوي (أمر backup)", { to: uid(ctx) });
                return say(ctx, `✅ انرسلت النسخة لك في الخاص (${b.count} ملف).`);
            } catch (e) {
                return say(ctx, `❌ ما قدرت أرسلها: ${e.message}\nتأكد إن الخاص مفتوح للبوت.`);
            }
        }
    },
    {
        name: "restore",
        aliases: ["استرجاع", "ارجاع", "رجوع-نسخة", "ارجاع-النسخة"],
        description: "استرجاع نسخة احتياطية (ملف zip أو من النسخ المحفوظة)",
        directory: "Owners",
        options: [{ name: "file", description: "ملف النسخة nova-backup-*.zip (اتركه فاضي لاختيار نسخة محفوظة)", type: "ATTACHMENT", required: false }],
        run: async (client, ctx) => {
            if (!ctx.guild || !Backup.isAllowed(uid(ctx))) return isSlash(ctx) ? say(ctx, "⛔ هذا الأمر للأونر فقط.") : undefined;
            const att = isSlash(ctx) ? ctx.options.getAttachment("file") : ctx.attachments && ctx.attachments.first();
            // رسالة عادية فيها ملف باسم nova-backup يتولاه الاسترجاع التلقائي
            if (!isSlash(ctx) && att && /^nova-backup.*\.zip$/i.test(att.name || "")) return;

            if (att) {
                if (isSlash(ctx)) await ctx.deferReply({ ephemeral: true }).catch(() => {});
                try {
                    const r = await Backup.restoreFromBuffer(await Backup.download(att), uid(ctx));
                    await say(ctx, Backup.doneText(r)); return Backup.restartSoon();
                } catch (e) { return say(ctx, "❌ " + e.message); }
            }

            const list = Backup.listLocal().slice(0, 25);
            if (!list.length) return say(ctx, "ما فيه نسخ محفوظة. أرفق ملف النسخة مع الأمر: `/restore file:` أو أرسله للبوت مباشرة.");
            const menu = new MessageSelectMenu().setCustomId("bk_pick").setPlaceholder("اختر النسخة اللي تبي ترجع لها")
                .addOptions(list.map(x => ({ label: x.name.replace(/^nova-backup-|\.zip$/g, "").slice(0, 100), description: `${ago(x.at)} • ${x.reason || "—"}`.slice(0, 100), value: x.name })));
            return say(ctx, { content: "🗂️ **النسخ المحفوظة** (الأحدث أول). اختر وحدة للاسترجاع — البوت يحفظ نسخة من وضعه الحالي قبل الرجوع.", components: [new MessageActionRow().addComponents(menu)] });
        }
    }
];
