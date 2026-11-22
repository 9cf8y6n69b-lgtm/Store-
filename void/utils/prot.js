// إعدادات الحماية (anti) + النسخ الاحتياطي للسيرفر
const Pro = require("../prodb");
const F = require("./filters");

const NAMES = { anticreate: "منع إنشاء الرومات/الرتب", antidelete: "منع حذف الرومات/الرتب/الحظر الجماعي", antiperms: "منع إعطاء صلاحيات خطيرة", antiwebhook: "منع الويب هوك", antibots: "منع إضافة البوتات", antijoin: "قفل الدخول (طرد أي داخل جديد)", sloprot: "حماية السلو مود" };
const PUNISH = { ban: "حظر", kick: "طرد", strip: "سحب كل الرتب", timeout: "تايم أوت يوم" };
const DEF = () => ({ ...Object.fromEntries(Object.keys(NAMES).map(k => [k, { on: false, limit: 2, punish: "strip" }])), rjoin: { on: false, count: 6, seconds: 10, punish: "kick" }, wl: [] });
const key = g => `prot_${g}`;
const get = g => { const s = Pro.get(key(g)) || {}, d = DEF(); for (const k in d) if (!s[k]) s[k] = d[k]; return s; };
const save = (g, s) => Pro.set(key(g), s);
const edit = (g, fn) => { const s = get(g); fn(s); save(g, s); return s; };

// antilink / antispam مربوطين بنظام الفلاتر
const filterOn = (g, k) => !!F.get(g)[k].enabled;
const setFilter = (g, k, on) => { const f = F.get(g); f[k].enabled = !!on; F.save(g, f); };

// ───── النسخة الاحتياطية ─────
const bkKey = g => `backup_${g}`;
const getBackup = g => Pro.get(bkKey(g));
async function takeBackup(guild, { emojis = false } = {}) {
    const old = getBackup(guild.id) || {};
    const roles = [...guild.roles.cache.filter(r => !r.managed && r.id !== guild.id).values()].map(r => ({ name: r.name, color: r.color, hoist: r.hoist, mentionable: r.mentionable, permissions: r.permissions.bitfield.toString(), position: r.position }));
    const channels = [...guild.channels.cache.filter(c => !c.isThread()).values()].map(c => ({ name: c.name, type: c.type, parent: c.parent ? c.parent.name : null, topic: c.topic || null, nsfw: !!c.nsfw, slowmode: c.rateLimitPerUser || 0, position: c.rawPosition, bitrate: c.bitrate || null, userLimit: c.userLimit || null }));
    let em = old.emojis || [];
    if (emojis) {
        em = [];
        for (const e of [...guild.emojis.cache.values()].slice(0, 50)) {
            try { const buf = Buffer.from(await (await fetch(e.imageURL({ size: 128 }))).arrayBuffer()); if (buf.length < 256 * 1024) em.push({ name: e.name, b64: buf.toString("base64") }); } catch {}
        }
    }
    Pro.set(bkKey(guild.id), { at: Date.now(), roles, channels, emojis: em });
    return { roles: roles.length, channels: channels.length, emojis: em.length };
}
async function restoreBackup(guild) {
    const b = getBackup(guild.id); if (!b) throw new Error("ما فيه نسخة احتياطية. اعمل: backup");
    const have = new Set(guild.roles.cache.map(r => r.name)); let roles = 0, chans = 0;
    for (const r of b.roles) if (!have.has(r.name)) { await guild.roles.create({ name: r.name, color: r.color, hoist: r.hoist, mentionable: r.mentionable, permissions: BigInt(r.permissions), reason: "restbackup" }).then(() => roles++).catch(() => {}); await new Promise(x => setTimeout(x, 400)); }
    const cats = new Map(guild.channels.cache.filter(c => c.type === 4).map(c => [c.name, c]));
    for (const c of b.channels.filter(x => x.type === 4)) if (!cats.has(c.name)) { const n = await guild.channels.create({ name: c.name, type: 4, reason: "restbackup" }).catch(() => null); if (n) { cats.set(c.name, n); chans++; } await new Promise(x => setTimeout(x, 400)); }
    const names = new Set(guild.channels.cache.map(c => c.type + ":" + c.name));
    for (const c of b.channels.filter(x => x.type !== 4)) if (!names.has(c.type + ":" + c.name)) { await guild.channels.create({ name: c.name, type: c.type, topic: c.topic || undefined, nsfw: c.nsfw, rateLimitPerUser: c.slowmode || undefined, parent: c.parent && cats.get(c.parent) ? cats.get(c.parent).id : undefined, reason: "restbackup" }).then(() => chans++).catch(() => {}); await new Promise(x => setTimeout(x, 400)); }
    return { roles, chans };
}
async function restoreEmojis(guild) {
    const b = getBackup(guild.id); if (!b || !(b.emojis || []).length) throw new Error("ما فيه إيموجيات محفوظة. اعمل: backup emojis");
    const have = new Set(guild.emojis.cache.map(e => e.name)); let n = 0;
    for (const e of b.emojis) if (!have.has(e.name)) { await guild.emojis.create({ attachment: Buffer.from(e.b64, "base64"), name: e.name }).then(() => n++).catch(() => {}); await new Promise(x => setTimeout(x, 800)); }
    return n;
}
module.exports = { NAMES, PUNISH, get, save, edit, filterOn, setFilter, getBackup, takeBackup, restoreBackup, restoreEmojis };
