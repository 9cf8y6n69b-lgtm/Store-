// ═══════════════════════════════════════════════
//  NOVA STORE • الاستضافة: بوتات العملاء داخل نفس البرنامج
//  بعد تأكيد الدفع يظهر زر «أضف بوتك» (توكن + سيرفر) ← يشتغل بوت العميل بالأنظمة اللي اشتراها
// ═══════════════════════════════════════════════
const client = require("../index");
const sales = require("../../hosted/sales");
const hb = require("../../hosted/manager");

const boot = () => {
    try {
        sales.init(client);
        hb.init({ ...sales.hooks, notify: (uid, txt) => client.users.fetch(uid).then(u => u.send(txt)), mainToken: () => process.env.TOKEN || "" });
    } catch (e) { console.error("[hosted] init:", e); }
};
if (client.isReady()) boot(); else client.once("ready", boot);

client.on("interactionCreate", async i => {
    try {
        if (!i.guild || !(i.isButton() || i.isModalSubmit())) return;
        const id = String(i.customId || "");
        if (!/^(hbs_add:|hbs_modal:|hbr:)/.test(id)) return;
        await sales.handle(i);
    } catch (e) {
        console.error("[hosted]", e);
        const m = { content: "⚠️ صار خطأ، حاول مرة ثانية", flags: 64 };
        (i.replied || i.deferred ? i.followUp(m) : i.reply(m)).catch(() => {});
    }
});

// يُستدعى من المتجر بعد تأكيد الدفع
const onPaid = (guild, order, channel) => sales.onPaid(guild, sales.adapt(order), channel);
module.exports = { onPaid };
