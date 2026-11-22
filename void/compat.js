// طبقة توافق: تخلي كود Void (discord.js v13) يشتغل على discord.js v14 بدون تعديل كل ملف
const D = require("discord.js");
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, StringSelectMenuBuilder, ButtonStyle, PermissionsBitField, AuditLogEvent } = D;

// ── الصلاحيات: ADMINISTRATOR / VIEW_CHANNEL ... ← الأسماء الجديدة
const snake = k => k.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase();
const LEG = {};
for (const k of Object.keys(PermissionsBitField.Flags)) LEG[snake(k)] = k;
Object.assign(LEG, {
    MANAGE_EMOJIS_AND_STICKERS: "ManageGuildExpressions", MANAGE_EMOJIS: "ManageGuildExpressions",
    USE_PUBLIC_THREADS: "CreatePublicThreads", USE_PRIVATE_THREADS: "CreatePrivateThreads"
});
const fixPerm = b => (typeof b === "string" && LEG[b] ? LEG[b] : b);
const baseResolve = Object.getPrototypeOf(PermissionsBitField).resolve;
PermissionsBitField.resolve = function (bit) { return baseResolve.call(this, Array.isArray(bit) ? bit.map(fixPerm) : fixPerm(bit)); };

// ── الإمبد
class MessageEmbed extends EmbedBuilder {
    setColor(c) { return super.setColor(c == null ? null : c); }
    setTitle(t) { return super.setTitle(t == null || t === "" ? null : String(t)); }
    setDescription(d) { return super.setDescription(d == null || d === "" ? null : String(d)); }
    setThumbnail(u) { return super.setThumbnail(u || null); }
    setImage(u) { return super.setImage(u || null); }
    setFooter(a, b) { if (a == null || (typeof a === "object")) return super.setFooter(a); return super.setFooter({ text: String(a), iconURL: b || undefined }); }
    setAuthor(a, b, c) { if (a == null || (typeof a === "object")) return super.setAuthor(a); return super.setAuthor({ name: String(a), iconURL: b || undefined, url: c || undefined }); }
    addField(name, value, inline) { return this.addFields({ name: String(name), value: String(value), inline: !!inline }); }
    get fields() { return this.data.fields || []; }
    get description() { return this.data.description; }
    get title() { return this.data.title; }
}

// ── الأزرار والقوائم
const BS = { PRIMARY: 1, SECONDARY: 2, SUCCESS: 3, DANGER: 4, LINK: 5 };
class MessageButton extends ButtonBuilder {
    setStyle(s) { return super.setStyle(typeof s === "string" ? (BS[s.toUpperCase()] ?? ButtonStyle[s] ?? 2) : s); }
}
const parseEmoji = e => {
    if (!e) return undefined;
    if (typeof e === "object") return e;
    const m = /^<(a?):(\w+):(\d+)>$/.exec(e);
    return m ? { animated: !!m[1], name: m[2], id: m[3] } : { name: e };
};
const fixOpts = list => list.flat().map(o => {
    if (o && typeof o === "object" && !o.toJSON && "emoji" in o) { const y = { ...o }, em = parseEmoji(y.emoji); if (em) y.emoji = em; else delete y.emoji; return y; }
    return o;
});
class MessageSelectMenu extends StringSelectMenuBuilder {
    addOptions(...o) { return super.addOptions(fixOpts(o)); }
    setOptions(...o) { return super.setOptions(fixOpts(o)); }
}

// ── دوال قديمة على الكلاسات
const proto = (C, name, fn) => { if (C && !C.prototype[name]) C.prototype[name] = fn; };
proto(D.BaseInteraction, "isSelectMenu", function () { return this.isStringSelectMenu(); });
proto(D.BaseInteraction, "isContextMenu", function () { return this.isContextMenuCommand(); });
proto(D.BaseChannel, "isText", function () { return this.isTextBased(); });
proto(D.BaseChannel, "isVoice", function () { return this.isVoiceBased(); });
if (!("me" in D.Guild.prototype)) Object.defineProperty(D.Guild.prototype, "me", { get() { return this.members.me; }, configurable: true });

// channels.create("name", {...}) القديمة + أسماء الأنواع القديمة
const CT = { GUILD_TEXT: 0, GUILD_VOICE: 2, GUILD_CATEGORY: 4, GUILD_NEWS: 5, GUILD_STAGE_VOICE: 13, GUILD_FORUM: 15 };
const chCreate = D.GuildChannelManager.prototype.create;
D.GuildChannelManager.prototype.create = function (a, b) {
    const o = typeof a === "string" ? { name: a, ...(b || {}) } : { ...a };
    if (typeof o.type === "string") o.type = CT[o.type] ?? o.type;
    return chCreate.call(this, o);
};
// emojis.create(attachment, name) القديمة
const emCreate = D.GuildEmojiManager.prototype.create;
D.GuildEmojiManager.prototype.create = function (a, b, c) {
    if (a && typeof a === "object" && !Buffer.isBuffer(a) && "attachment" in a) return emCreate.call(this, a);
    return emCreate.call(this, { attachment: a, name: b, ...(c || {}) });
};

// ── الأوديت لوق: "MEMBER_BAN_ADD" ← AuditLogEvent.MemberBanAdd
const AL = n => (typeof n === "number" ? n : AuditLogEvent[String(n).toLowerCase().split("_").map(w => w[0].toUpperCase() + w.slice(1)).join("")]);

module.exports = {
    ...D, MessageEmbed, MessageActionRow: ActionRowBuilder, MessageButton, MessageSelectMenu, AL,
    MessageAttachment: D.AttachmentBuilder,
    Permissions: { FLAGS: PermissionsBitField.Flags },
    Intents: { FLAGS: D.GatewayIntentBits }
};
