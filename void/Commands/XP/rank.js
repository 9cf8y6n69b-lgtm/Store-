// rank / رانك — كرت صورة: شريط XP + الاسم + الصورة + نقاط الفويس والشات + ترتيبه في السيرفر
const { MessageEmbed } = require("../../compat");
const XP = require("../../utils/xp");
module.exports = {
    name: "rank",
    aliases: ["رانك", "لفل", "مستواي", "level", "xp"],
    description: "عرض المستوى والخبرة",
    run: async (client, message) => {
        if (!message.guild) return;
        const target = message.mentions.members.first() || message.member;
        const u = XP.getUser(message.guild.id, target.id), pos = XP.rankOf(message.guild.id, target.id);
        try {
            const card = await XP.renderRankCard(target, u, pos);
            return message.reply({ files: [{ attachment: card, name: "rank.png" }], allowedMentions: { repliedUser: false } });
        } catch (e) {
            console.error("[XP] rank card:", e.message);
            const pct = Math.min(10, Math.round((u.into / u.next) * 10));
            const embed = new MessageEmbed().setColor("#2b2d31")
                .setAuthor({ name: target.displayName, iconURL: target.displayAvatarURL() })
                .setDescription(`**الترتيب:** #${pos.rank}\n**المستوى:** ${u.level}\n\`${"█".repeat(pct)}${"░".repeat(10 - pct)}\` ${u.into}/${u.next} XP\n**نقاط الشات:** ${u.chatXp} • **نقاط الفويس:** ${u.voiceXp}\n**الرسائل:** ${u.messages} • **الفويس:** ${Math.floor(u.voiceSeconds / 60)} دقيقة`);
            return message.reply({ embeds: [embed], allowedMentions: { repliedUser: false } });
        }
    }
};
