// أدوات مشتركة لأوامر الرسائل (بدون بادئة): ردود، جلب الأعضاء/الرتب/الرومات، صلاحيات، مدد
const { MessageEmbed } = require("../compat");
const Pro = require("../prodb");
const CC = require("./cmdConfig");

const client = () => require("../../shared").client;
const idOf = s => (String(s || "").match(/\d{15,25}/) || [])[0] || null;

const rep = (m, p) => m.reply({ allowedMentions: { repliedUser: false, parse: [] }, ...(typeof p === "string" ? { content: p } : p) }).catch(() => null);
const emb = (color, text, title) => new MessageEmbed().setColor(color).setDescription(String(text).slice(0, 4000)).setTitle(title || null);
const ok = (m, t) => rep(m, { embeds: [emb("#2ecc71", "✅ " + t)] });
const bad = (m, t) => rep(m, { embeds: [emb("#e74c3c", "❌ " + t)] });
const info = (m, t, title) => rep(m, { embeds: [emb("#2b2d31", t, title)] });

const isOwner = m => CC.owners.includes(m.author.id) || m.guild.ownerId === m.author.id;
// الأوامر الإدارية: لو العضو ما عنده الصلاحية نتجاهل بصمت (عشان الكلام العادي ما يتحول لأخطاء)
const has = (m, perm) => isOwner(m) || m.member.permissions.has(perm);
const botHas = (m, perm) => m.guild.members.me.permissions.has(perm);

const getMember = async (m, arg) => {
    const id = idOf(arg) || (m.mentions.members.first() || {}).id;
    return id ? m.guild.members.fetch(id).catch(() => null) : null;
};
const getUser = async (m, arg) => { const id = idOf(arg); return id ? client().users.fetch(id).catch(() => null) : null; };
const find = (col, arg) => { if (!arg) return null; const id = idOf(arg); return (id && col.get(id)) || col.find(x => x.name.toLowerCase() === String(arg).toLowerCase()) || null; };
const getRole = (m, arg) => find(m.guild.roles.cache, arg);
const getChannel = (m, arg) => find(m.guild.channels.cache, arg) || (m.mentions.channels.first() || null);

// يمنع تنفيذ الأمر على من هو أعلى منك/من البوت أو على الأونر
function canTarget(m, t) {
    if (!t) return false;
    if (t.id === m.guild.ownerId || t.id === client().user.id) return false;
    const me = m.guild.members.me;
    if (t.roles.highest.position >= me.roles.highest.position) return false;
    return isOwner(m) || m.member.roles.highest.position > t.roles.highest.position;
}

const UNITS = { s: 1e3, m: 6e4, h: 36e5, d: 864e5, "ث": 1e3, "د": 6e4, "س": 36e5, "ي": 864e5 };
const dur = s => { const x = /^(\d+)\s*([smhdثدسي])?$/i.exec(String(s || "")); return x ? Number(x[1]) * (UNITS[(x[2] || "m").toLowerCase()] || 6e4) : null; };
const fmtDur = ms => { const s = Math.round(ms / 1000); return s < 60 ? `${s} ثانية` : s < 3600 ? `${Math.round(s / 60)} دقيقة` : s < 86400 ? `${Math.round(s / 3600)} ساعة` : `${Math.round(s / 86400)} يوم`; };
const unix = d => Math.floor(new Date(d).getTime() / 1000);
const tag = u => `${u.username}`;

// أرقام/نص من آخر الأرغمنتات بعد إزالة المنشن
const restText = (args, from = 1) => args.slice(from).join(" ").trim();

// سجل لكل عضو: تحذيرات، ميوت، سجن... (يظهر في records / check)
const recKey = (g, u) => `records_${g}_${u}`;
const addRecord = (g, u, type, by, reason) => { const a = Pro.get(recKey(g, u)) || []; a.unshift({ type, by, reason: reason || "—", at: Date.now() }); Pro.set(recKey(g, u), a.slice(0, 100)); };
const getRecords = (g, u) => Pro.get(recKey(g, u)) || [];

// آخر مدخل أوديت لوق لحدث معين (للحماية)
async function audit(guild, type, targetId, ms = 15000) {
    try {
        const { AL } = require("../compat");
        const logs = await guild.fetchAuditLogs({ type: AL(type), limit: 6 });
        return logs.entries.find(e => (!targetId || e.target?.id === targetId) && Date.now() - e.createdTimestamp < ms) || null;
    } catch { return null; }
}

const pages = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

module.exports = { Pro, CC, client, idOf, rep, emb, ok, bad, info, isOwner, has, botHas, getMember, getUser, getRole, getChannel, find, canTarget, dur, fmtDur, unix, tag, restText, addRecord, getRecords, audit, pages, sleep, MessageEmbed };
