const { MessageEmbed, MessageActionRow, MessageSelectMenu } = require("../../compat");
const db = require("../../prodb");
const LOG_TYPES = require("../../Extras/logTypes");

const getCfg = (gid) => {
    const c = db.get(`lg_cfg_${gid}`) || {};
    return { types: c.types || {}, prisonRole: c.prisonRole || null };
};
const saveCfg = (gid, c) => db.set(`lg_cfg_${gid}`, c);

// قائمتين منسدلتين (كل واحدة حدها 25 خيار)
function menus(prefix, arg, placeholder) {
    const half = Math.ceil(LOG_TYPES.length / 2);
    return [LOG_TYPES.slice(0, half), LOG_TYPES.slice(half)].map((group, i) =>
        new MessageActionRow().addComponents(
            new MessageSelectMenu()
                .setCustomId(`${prefix}${i + 1}:${arg}`)
                .setPlaceholder(`${placeholder} (${i + 1}/2)`)
                .setMinValues(1)
                .setMaxValues(group.length)
                .addOptions(group.map((t) => ({ label: t.label, value: t.key, emoji: t.emoji })))
        )
    );
}

const box = (title, desc, color = "#2b2d31") => new MessageEmbed().setColor(color).setTitle(title).setDescription(desc);

module.exports = {
    name: "log",
    description: "إعدادات اللوقات (كل الردود مخفية)",
    type: "CHAT_INPUT",
    options: [
        {
            name: "all",
            description: "كل اللوقات في روم واحد",
            type: "SUB_COMMAND",
            options: [{ name: "channel", description: "الروم", type: "CHANNEL", channelTypes: [0], required: true }],
        },
        {
            name: "set",
            description: "اختيار لوقات معينة لروم معين",
            type: "SUB_COMMAND",
            options: [{ name: "channel", description: "الروم", type: "CHANNEL", channelTypes: [0], required: true }],
        },
        { name: "disable", description: "إيقاف لوقات معينة", type: "SUB_COMMAND" },
        { name: "status", description: "عرض إعدادات اللوقات", type: "SUB_COMMAND" },
        {
            name: "prison-role",
            description: "رول السجن (لتسجيل السجن وفك السجن). بدون رول = حذفه",
            type: "SUB_COMMAND",
            options: [{ name: "role", description: "رول السجن", type: "ROLE", required: false }],
        },
        { name: "reset", description: "حذف كل إعدادات اللوقات", type: "SUB_COMMAND" },
    ],

    run: async (client, interaction, args = []) => {
        // لو انكتب بالبريفكس (مو سلاش)
        if (!interaction.options || typeof interaction.options.getSubcommand !== "function") {
            if (!interaction.member.permissions.has("ADMINISTRATOR")) return interaction.react("❌").catch(() => {});
            const LPx = require("../../utils/logPanel"), TYPES = require("../../Extras/logTypes"), sub = String(args[0] || "").toLowerCase(), gid = interaction.guild.id;
            const ch = interaction.mentions.channels.first() || (sub === "all" || sub === "set" ? interaction.channel : null);
            const keys = args.slice(1).map(x => x.toLowerCase()).filter(x => TYPES.some(t => t.key === x));
            const say = t => interaction.reply({ content: t, allowedMentions: { repliedUser: false } }).catch(() => {});
            if (sub === "all" && ch) { LPx.setAll(gid, ch.id); return say(`✅ كل اللوقات في ${ch}`); }
            if (sub === "set" && ch && keys.length) { keys.forEach(k => LPx.setRoom(gid, k, ch.id)); return say(`✅ ${keys.join("، ")} ← ${ch}`); }
            if (sub === "disable") { if (keys.length) keys.forEach(k => LPx.setRoom(gid, k, null)); else { const c = LPx.getCfg(gid); c.types = {}; LPx.saveCfg(gid, c); } return say("✅ تم إيقاف اللوقات."); }
            if (sub === "prison-role") { const r = interaction.mentions.roles.first(); if (!r) return say("log prison-role @رتبة"); const c = LPx.getCfg(gid); c.prisonRole = r.id; LPx.saveCfg(gid, c); return say(`✅ رتبة السجن: ${r}`); }
            if (sub === "reset") { const c = LPx.getCfg(gid); c.types = {}; c.prisonRole = null; LPx.saveCfg(gid, c); return say("✅ تم حذف كل إعدادات اللوقات."); }
            return interaction.reply({ ...require("../../utils/logPanel").home(interaction.guild), allowedMentions: { repliedUser: false } }).catch(() => {});
        }
        if (!interaction.member.permissions.has("ADMINISTRATOR")) {
            return interaction.reply({ content: "**❌ هذا الأمر للإدارة فقط**", ephemeral: true }).catch(() => {});
        }

        const guild = interaction.guild;
        const sub = interaction.options.getSubcommand();
        const cfg = getCfg(guild.id);
        const reply = (data) => interaction.reply({ ...data, ephemeral: true }).catch(() => {});
        const botCanSend = (ch) =>
            ch.permissionsFor(guild.me).has(["VIEW_CHANNEL", "SEND_MESSAGES", "EMBED_LINKS"]);

        if (sub === "all") {
            const channel = interaction.options.getChannel("channel");
            if (!botCanSend(channel)) {
                return reply({ embeds: [box("❌ خطأ", `ما عندي صلاحية الإرسال في ${channel}`, "#e74c3c")] });
            }
            LOG_TYPES.forEach((t) => (cfg.types[t.key] = channel.id));
            saveCfg(guild.id, cfg);
            return reply({ embeds: [box("✅ تم", `كل اللوقات (${LOG_TYPES.length}) صارت في ${channel}`, "#2ecc71")] });
        }

        if (sub === "set") {
            const channel = interaction.options.getChannel("channel");
            if (!botCanSend(channel)) {
                return reply({ embeds: [box("❌ خطأ", `ما عندي صلاحية الإرسال في ${channel}`, "#e74c3c")] });
            }
            return reply({
                embeds: [box("📋 اختيار اللوقات", `اختر اللوقات اللي تبيها تروح إلى ${channel}\nتقدر تختار من القائمتين وتختار أكثر من خيار.`)],
                components: menus("lg_pick", channel.id, "اختر اللوقات"),
            });
        }

        if (sub === "disable") {
            return reply({
                embeds: [box("🛑 إيقاف اللوقات", "اختر اللوقات اللي تبي توقفها.", "#e67e22")],
                components: menus("lg_off", "x", "اختر للإيقاف"),
            });
        }

        if (sub === "status") {
            const lines = LOG_TYPES.map((t) => `${t.emoji} **${t.label}** ← ${cfg.types[t.key] ? `<#${cfg.types[t.key]}>` : "❌"}`);
            const embed = box("⚙ إعدادات اللوقات", lines.join("\n"));
            embed.addFields({ name: "🚔 رول السجن", value: cfg.prisonRole ? `<@&${cfg.prisonRole}>` : "غير محدد", inline: false });
            return reply({ embeds: [embed] });
        }

        if (sub === "prison-role") {
            const role = interaction.options.getRole("role");
            cfg.prisonRole = role ? role.id : null;
            saveCfg(guild.id, cfg);
            return reply({
                embeds: [box("✅ تم", role ? `رول السجن: ${role}\nأي عضو ياخذه أو يُسحب منه يتسجل في لوق السجن.` : "تم حذف رول السجن", "#2ecc71")],
            });
        }

        if (sub === "reset") {
            db.delete(`lg_cfg_${guild.id}`);
            return reply({ embeds: [box("✅ تم", "تم حذف كل إعدادات اللوقات", "#2ecc71")] });
        }
    },
};
