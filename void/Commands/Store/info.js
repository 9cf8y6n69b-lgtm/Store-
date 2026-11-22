// /send-info: يرسل صورة القوانين أو السياسات بتصميم NOVA STORE
const { AttachmentBuilder } = require("discord.js");
const Info = require("../../utils/info");
const banner = require("../../../banner");
const TS = require("../../utils/ticketSystem");

async function sendInfo(ch, key) {
    const c = Info.get(key); if (!c) throw new Error("نوع غير معروف");
    const img = await banner.infoCard(c); if (!img) throw new Error("الصور تحتاج مكتبة canvas");
    return ch.send({ files: [new AttachmentBuilder(img, { name: c.file })] });
}
module.exports = [{
    name: "send-info", aliases: ["sendinfo", "ارسال-معلومات"], description: "إرسال صورة القوانين / السياسات / طريقة الطلب",
    options: [
        { name: "type", description: "النوع", type: "STRING", required: true, choices: Object.entries(Info.LABEL).map(([value, name]) => ({ name, value })) },
        { name: "channel", description: "الروم (الافتراضي الروم الحالي)", type: "CHANNEL", channelTypes: [0, 5], required: false }],
    run: async (client, i) => {
        if (typeof i.isChatInputCommand !== "function" || !i.isChatInputCommand()) return;
        if (!TS.isStaff(i.member, TS.getConfig(i.guild.id))) return i.reply({ content: "❌ للإدارة فقط", ephemeral: true });
        await i.deferReply({ ephemeral: true });
        const ch = i.options.getChannel("channel") || i.channel;
        try { await sendInfo(ch, i.options.getString("type")); await i.editReply(`✅ تم الإرسال في ${ch}`); } catch (e) { await i.editReply("❌ " + e.message); }
    },
    sendInfo
}];
