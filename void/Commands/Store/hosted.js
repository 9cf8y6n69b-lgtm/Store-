// أوامر الاستضافة: /bots-panel /bot-plan /my-bots /renew /packages
const sales = require("../../../hosted/sales");
const isCmd = c => typeof c.isChatInputCommand === "function" && c.isChatInputCommand();
module.exports = sales.commands.map(b => {
    const j = b.toJSON();
    return { name: j.name, description: j.description, options: j.options || [], run: async (client, i) => { if (!isCmd(i)) return; await sales.onCommand(i); } };
});
