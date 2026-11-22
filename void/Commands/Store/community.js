// أوامر المجتمع (سلاش): /giveaway  /blacklist  /role-panel
const { EmbedBuilder } = require("discord.js");
const Cm = require("../../utils/community");
const ev = () => require("../../events/community");
const EPH = 64;
const slash = c => typeof c.isChatInputCommand === "function" && c.isChatInputCommand();

const giveaway = {
    name: "giveaway", description: "نظام القرعات",
    options: [
        { name: "start", description: "بدء قرعة", type: "SUB_COMMAND", options: [
            { name: "prize", description: "الجائزة", type: "STRING", required: true },
            { name: "duration", description: "المدة: 30m أو 2h أو 1d", type: "STRING", required: true },
            { name: "winners", description: "عدد الفائزين", type: "INTEGER", required: false },
            { name: "channel", description: "الروم", type: "CHANNEL", channelTypes: [0, 5], required: false },
            { name: "role", description: "رتبة مطلوبة للمشاركة", type: "ROLE", required: false }] },
        { name: "end", description: "إنهاء قرعة الآن", type: "SUB_COMMAND", options: [{ name: "id", description: "رقم القرعة", type: "INTEGER", required: true }] },
        { name: "reroll", description: "إعادة سحب فائز جديد", type: "SUB_COMMAND", options: [{ name: "id", description: "رقم القرعة", type: "INTEGER", required: true }] },
        { name: "list", description: "القرعات الجارية", type: "SUB_COMMAND" }],
    run: async (client, i) => {
        if (!slash(i)) return;
        const sub = i.options.getSubcommand();
        if (sub === "list") {
            const rows = Cm.gwList().filter(g => g.status === "active");
            return i.reply({ flags: EPH, embeds: [new EmbedBuilder().setColor(0xffd166).setTitle("🎁 القرعات الجارية").setDescription(rows.map(g => `**#${g.id}** ${g.prize} — ينتهي <t:${Math.floor(g.ends / 1000)}:R> — 👥 ${g.entries.length}`).join("\n") || "ما فيه قرعات جارية")] });
        }
        await i.deferReply({ flags: EPH });
        try {
            if (sub === "start") {
                const ms = Cm.parseDur(i.options.getString("duration")); if (!ms) throw new Error("المدة غلط: اكتب مثل 30m أو 2h أو 1d");
                const g = await ev().createGiveaway(i.guild, { channelId: i.options.getChannel("channel")?.id || i.channelId, prize: i.options.getString("prize"), ms, winners: i.options.getInteger("winners") || 1, host: i.user.id, reqRole: i.options.getRole("role")?.id || "" });
                return i.editReply(`✅ بدأت القرعة #${g.id}`);
            }
            const r = await ev().endGiveaway(i.guild, i.options.getInteger("id"), { reroll: sub === "reroll" });
            return i.editReply(`✅ ${r.winners.length ? "الفائزون: " + r.winners.map(x => `<@${x}>`).join(" ") : "ما فيه مشاركين مؤهلين"}`);
        } catch (e) { return i.editReply("❌ " + e.message); }
    }
};

const blacklist = {
    name: "blacklist", description: "القائمة السوداء للمحتالين",
    options: [
        { name: "add", description: "إضافة محتال", type: "SUB_COMMAND", options: [{ name: "user", description: "العضو", type: "USER", required: true }, { name: "reason", description: "السبب", type: "STRING", required: false }] },
        { name: "remove", description: "إزالة من القائمة", type: "SUB_COMMAND", options: [{ name: "user", description: "العضو", type: "USER", required: true }] },
        { name: "check", description: "فحص عضو", type: "SUB_COMMAND", options: [{ name: "user", description: "العضو", type: "USER", required: true }] },
        { name: "list", description: "عرض القائمة", type: "SUB_COMMAND" }],
    run: async (client, i) => {
        if (!slash(i)) return;
        const sub = i.options.getSubcommand();
        if (sub === "list") { const rows = Cm.blList(); return i.reply({ flags: EPH, content: rows.map(r => `🚫 <@${r.id}> — ${r.reason || "بدون سبب"}`).join("\n").slice(0, 1900) || "القائمة فاضية" }); }
        const u = i.options.getUser("user");
        if (sub === "check") { const r = Cm.blGet(u.id); return i.reply({ flags: EPH, content: r ? `🚫 ${u} في القائمة السوداء — ${r.reason || "بدون سبب"}` : `✅ ${u} نظيف` }); }
        if (sub === "remove") return i.reply({ flags: EPH, content: Cm.blRemove(u.id) ? `✅ تمت إزالة ${u}` : "مو موجود في القائمة" });
        Cm.blAdd(u.id, i.options.getString("reason"), i.user.id);
        return i.reply({ flags: EPH, content: `🚫 تمت إضافة ${u} للقائمة السوداء` });
    }
};
module.exports = [giveaway, blacklist];
