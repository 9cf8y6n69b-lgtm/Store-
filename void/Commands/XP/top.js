// top / توب — أعلى 10 في الخبرة
const { MessageEmbed } = require("../../compat");
const XP = require("../../utils/xp");
module.exports = {
    name: "top",
    aliases: ["توب", "المتصدرين", "leaderboard", "xptop"],
    description: "أعلى الأعضاء في الخبرة",
    run: async (client, message) => {
        if (!message.guild) return;
        const rows = XP.top(message.guild.id, 10);
        const medals = ["🥇", "🥈", "🥉"];
        const embed = new MessageEmbed().setColor("#2b2d31").setTitle(`🏆 متصدرين ${message.guild.name}`)
            .setDescription(rows.map((r, i) => `${medals[i] || `**${i + 1}.**`} <@${r.id}> — لفل **${r.level}** • ${r.xp} XP`).join("\n") || "ما فيه أحد لسه.");
        return message.reply({ embeds: [embed], allowedMentions: { repliedUser: false, users: [] } });
    }
};
