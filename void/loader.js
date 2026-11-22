// يشغّل نظام Void كامل داخل البوت: الأوامر، الأحداث، السلاش، والحماية من تعليق الأزرار
const fs = require("fs"), path = require("path");
const { Collection } = require("discord.js");

const DESC = require("./utils/cmdDescriptions");
const OPT_TYPES = { SUB_COMMAND: 1, SUB_COMMAND_GROUP: 2, STRING: 3, INTEGER: 4, BOOLEAN: 5, USER: 6, CHANNEL: 7, ROLE: 8, MENTIONABLE: 9, NUMBER: 10, ATTACHMENT: 11 };
const fixOpt = o => {
    const x = { ...o };
    if (typeof x.type === "string") x.type = OPT_TYPES[x.type] || 3;
    if (x.channelTypes) { x.channel_types = x.channelTypes; delete x.channelTypes; }
    if (x.options) x.options = x.options.map(fixOpt);
    return x;
};

// أوامر تنسجل كسلاش (الباقي يشتغل بالاسم بدون بادئة أو بـ ! )
const SLASH = { ticket: true, filters: true, log: true, backup: true, restore: true, help: false, prices: false, myorders: false, mysubs: false, subspanel: true, giveaway: true, blacklist: true, warranty: false, invoice: false, report: true, "send-info": true, "bots-panel": true, "bot-plan": true, "my-bots": false, renew: false, packages: false };
const ADMIN_ONLY = "8"; // Administrator

const EVENTS = ["logSystem", "logPanel", "ticketInteractions", "ticketAdmin", "helpInteractions", "filters", "xp", "features", "protection", "messageCreate", "store", "subs", "community", "storeExtras", "hosted"];
const OWN_ID = /^(help$|tk[:_]|tkc[:_]|lg_|lgp:|hp_|pr_|flt:|st:|sb:|gw_join:|br:|hbs_|hbr:)/;

function loadCommands(client) {
    const root = path.join(__dirname, "Commands");
    for (const dir of fs.readdirSync(root)) {
        const full = path.join(root, dir);
        if (!fs.statSync(full).isDirectory()) continue;
        for (const file of fs.readdirSync(full).filter(f => f.endsWith(".js"))) {
            try {
                const mod = require(path.join(full, file));
                for (const cmd of (Array.isArray(mod) ? mod : [mod])) {
                    if (!cmd || !cmd.name) continue;
                    cmd.directory = cmd.directory || dir;
                    cmd.description = cmd.description || DESC[cmd.name];
                    client.commands.set(cmd.name, cmd);
                    if (cmd.name in SLASH) client.slashCommands.set(cmd.name, cmd);
                }
            } catch (e) { console.error(`[void] فشل تحميل الأمر ${dir}/${file}:`, e.message); }
        }
    }
}

function slashJSON(client) {
    return [...client.slashCommands.values()].map(c => ({
        name: c.name,
        description: String(c.description || c.name).slice(0, 100),
        options: (c.options || []).map(fixOpt),
        ...(SLASH[c.name] ? { default_member_permissions: ADMIN_ONLY } : {}),
        dm_permission: false
    }));
}

function init(client) {
    require("../shared").client = client;
    client.commands = new Collection();
    client.slashCommands = new Collection();
    loadCommands(client);
    try { require("./backup").init(client); } catch (e) { console.error("[void] backup:", e.message); } // نسخ احتياطي واسترجاع

    for (const ev of EVENTS) {
        try { require(`./events/${ev}`); } catch (e) { console.error(`[void] فشل تحميل الحدث ${ev}:`, e); }
    }

    const CC = require("./utils/cmdConfig");
    client.on("interactionCreate", async interaction => {
        try {
            if (!interaction.guild) return;

            // لو ما أحد رد على الزر/القائمة خلال 2.5 ثانية نسوي deferUpdate (يمنع "فشل التفاعل")
            if ((interaction.isButton() || interaction.isStringSelectMenu()) && OWN_ID.test(String(interaction.customId))) {
                setTimeout(() => { if (!interaction.deferred && !interaction.replied) interaction.deferUpdate().catch(() => {}); }, 2500);
                return;
            }

            if (!interaction.isChatInputCommand()) return;
            const cmd = client.slashCommands.get(interaction.commandName);
            if (!cmd) return;

            const args = [];
            for (const o of interaction.options.data) {
                if (o.type === 1) { args.push(o.name); (o.options || []).forEach(x => { if (x.value != null) args.push(x.value); }); }
                else if (o.value != null) args.push(o.value);
            }
            const blocked = CC.blockReason(interaction.guild, interaction.member, interaction.channel, cmd.name);
            if (blocked) return interaction.reply({ content: `⛔ ${blocked}`, ephemeral: true }).catch(() => {});

            await cmd.run(client, interaction, args);
            if (client.logCommand) client.logCommand(interaction.guild, interaction.member, interaction.channel, cmd, args, true);
        } catch (error) {
            console.error(`[void] slash /${interaction.commandName}:`, error);
            const msg = { content: `❌ صار خطأ: ${String(error.message).slice(0, 150)}`, ephemeral: true };
            (interaction.deferred || interaction.replied ? interaction.followUp(msg) : interaction.reply(msg)).catch(() => {});
        }
    });

    client.once("clientReady", () => {
        try { require("./utils/ticketAdmin").restoreImages(client); } catch (e) { console.error("[void] restoreImages:", e.message); }
    });
    console.log(`[void] جاهز — ${client.commands.size} أمر، ${client.slashCommands.size} سلاش`);
}

module.exports = { init, slashJSON };
