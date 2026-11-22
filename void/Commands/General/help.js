// help / هيلب — قائمة الأوامر مع بحث وتعديل (تعطيل، اختصارات، رتبة، روم)
const HP = require("../../utils/helpPanel");
module.exports = {
    name: "help",
    aliases: ["هيلب", "مساعدة", "الاوامر", "اوامر"],
    description: "قائمة كل الأوامر مع البحث والتعديل",
    run: async (client, ctx) => {
        const isSlash = typeof ctx.isCommand === "function" && ctx.isCommand();
        const payload = HP.home(client, ctx.guild);
        return isSlash ? ctx.reply({ ...payload, ephemeral: true }) : ctx.reply({ ...payload, allowedMentions: { repliedUser: false } });
    }
};
