// ميزات الرومات والأعضاء: خط تلقائي، ريأكشن، صور فقط، رد تلقائي، غياب، كت، رتب تلقائية،
// ريأكشن رول، دعوات، تتبع الصوت، فك الميوت/السجن، نسخ احتياطي دوري، تقييم وألوان
const client = require("../index");
const K = require("../utils/kit");
const FT = require("../utils/feat");
const P = require("../utils/prot");
const { Pro } = K;
const { MessageEmbed } = require("../compat");

const aiCool = new Map();
const IMG = /\.(png|jpe?g|gif|webp|bmp)(\?|$)/i;
const hasImage = m => m.attachments.some(a => (a.contentType || "").startsWith("image/") || IMG.test(a.url)) || m.embeds.some(e => e.image || e.thumbnail || (e.type === "image")) || /https?:\/\/\S+\.(png|jpe?g|gif|webp)/i.test(m.content);
const isStaff = m => m.member && (m.member.permissions.has("MANAGE_MESSAGES") || K.CC.owners.includes(m.author.id));
const react = async (m, list) => { for (const e of list) { await m.react(e).catch(() => {}); } };

// ───── الخط التلقائي: أي رسالة في الروم (عضو، بوت، ويبهوك، صورة، إمبد، أي شي) ← يرسل الخط فوراً ─────
// الرومات والرابط من الداشبورد (تبويب الخط). الصورة المرفوعة تتخزن في Pro: line_img_<guild>
const lineQueue = new Map(), lineBuf = { src: null, buf: null };
const LINE_FALLBACK = "━━━━━━━━━━";
function linePayload(g, f) {
    const up = Pro.get(`line_img_${g}`);
    if (up && up.b64) {
        if (lineBuf.src !== up.b64) { lineBuf.src = up.b64; lineBuf.buf = Buffer.from(up.b64, "base64"); }
        return { files: [{ attachment: lineBuf.buf, name: `line.${up.ext || "png"}` }] };
    }
    if (f.lineUrl) return { content: f.lineUrl };
    const b = require("../../banner").asset("line.png");
    return b ? { files: [{ attachment: b, name: "line.png" }] } : { content: LINE_FALLBACK };
}
client.on("messageCreate", m => {
    try {
        if (!m.guild || m.system || !m.channel) return;
        const f = FT.get(m.guild.id);
        if (!f.autoline.includes(m.channel.id)) return;
        // لا نرد على خطنا نفسه (يمنع التكرار اللانهائي)
        if (m.author.id === client.user.id && (m.attachments.some(a => /^line\./.test(a.name || "")) || (m.content && (m.content === f.lineUrl || m.content === LINE_FALLBACK)))) return;
        const me = m.guild.members.me, perms = m.channel.permissionsFor(me);
        if (!perms || !perms.has(["SendMessages", "AttachFiles"])) return;
        const prev = lineQueue.get(m.channel.id) || Promise.resolve();
        const job = prev.then(() => m.channel.send({ ...linePayload(m.guild.id, f), allowedMentions: { parse: [] } })).catch(() => {});
        lineQueue.set(m.channel.id, job);
        job.then(() => { if (lineQueue.get(m.channel.id) === job) lineQueue.delete(m.channel.id); });
    } catch (e) { console.error("[features] autoline:", e.message); }
});

client.on("messageCreate", async m => {
    try {
        if (!m.guild || m.author.bot || !m.member) return;
        const g = m.guild.id, ch = m.channel.id, f = FT.get(g);

        // منع الصور للأعضاء الممنوعين
        if ((Pro.get(`blockpic_${g}`) || []).includes(m.author.id) && hasImage(m)) { m.delete().catch(() => {}); return; }

        // شات صور / أفتارات: صور فقط
        if (f.pic.includes(ch) || f.avt.includes(ch)) {
            if (!hasImage(m) && !isStaff(m)) return void m.delete().catch(() => {});
            if (f.avt.includes(ch) && hasImage(m)) react(m, ["❤️", "🔥"]);
        }
        if (f.react[ch]) react(m, f.react[ch]);
        if (f.feel.includes(ch)) react(m, ["❤️", "😂", "😮", "😢", "😡"]);
        if (f.feedrate.includes(ch)) react(m, ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣"]);

        // غياب
        if (f.absence.includes(ch)) { m.react("✅").catch(() => {}); const k = `abs_${g}`, l = Pro.get(k) || []; l.unshift({ user: m.author.id, text: m.content.slice(0, 300), at: Date.now() }); Pro.set(k, l.slice(0, 200)); }

        // شات الرد
        if (f.rchat.rooms.includes(ch) && f.rchat.text) {
            const e = new MessageEmbed().setColor(f.rchat.color).setDescription(f.rchat.text.replace(/\{user\}/g, `<@${m.author.id}>`)); if (f.rchat.image) e.setImage(f.rchat.image);
            m.reply({ embeds: [e], allowedMentions: { repliedUser: false } }).catch(() => {});
        }
        // مسح تلقائي
        if (f.clear[ch]) setTimeout(() => m.delete().catch(() => {}), f.clear[ch]);
        // كت تويت: اكتب "كت" في شات الكت
        if (f.cut.room === ch && m.content.trim() === "كت") { const pool = f.cut.questions.length ? f.cut.questions : FT.QUESTIONS; m.channel.send({ embeds: [K.emb(f.ecolor, pool[Math.floor(Math.random() * pool.length)], "🎲 كت تويت")] }).catch(() => {}); }
        // رد تلقائي
        const txt = m.content.trim().toLowerCase(), ar = f.autoreply.find(x => x.trigger === txt);
        if (ar) m.reply({ content: ar.reply.replace(/\{user\}/g, `<@${m.author.id}>`), allowedMentions: { repliedUser: false, parse: [] } }).catch(() => {});

        // ذكاء اصطناعي تلقائي
        const ai = Pro.get(`ai_${g}`);
        if (ai && ai.channel === ch && m.content.trim() && Date.now() - (aiCool.get(m.author.id) || 0) > 5000) {
            aiCool.set(m.author.id, Date.now()); m.channel.sendTyping().catch(() => {});
            require("../Commands/General/general").aiAsk(ai.prompt || "أنت مساعد ودود في سيرفر ديسكورد. جاوب بالعربية باختصار.", m.content).then(r => m.reply({ content: r.slice(0, 1900), allowedMentions: { repliedUser: false, parse: [] } })).catch(() => {});
        }
    } catch (e) { console.error("[features] messageCreate:", e.message); }
});

// ───── الدخول: رتب تلقائية، قائمة سوداء، تتبع الدعوات ─────
const inviteCache = new Map();
async function cacheInvites(guild) { try { const inv = await guild.invites.fetch(); inviteCache.set(guild.id, new Map(inv.map(i => [i.code, i.uses]))); } catch {} }
client.on("inviteCreate", i => { const c = inviteCache.get(i.guild.id) || new Map(); c.set(i.code, i.uses || 0); inviteCache.set(i.guild.id, c); });
client.on("inviteDelete", i => { const c = inviteCache.get(i.guild.id); c && c.delete(i.code); });

client.on("guildMemberAdd", async member => {
    try {
        const g = member.guild;
        if ((Pro.get(`blacklist_${g.id}`) || []).includes(member.id)) {
            await member.ban({ reason: "القائمة السوداء" }).catch(() => {});
            const chId = Pro.get(`blacklist_chat_${g.id}`), ch = chId && g.channels.cache.get(chId); ch && ch.send({ embeds: [K.emb("#e74c3c", `🚫 <@${member.id}> من القائمة السوداء حاول يدخل وتم حظره.`)] }).catch(() => {}); return;
        }
        const ar = Pro.get(`autorole_${g.id}`) || { humans: [], bots: [] };
        for (const id of member.user.bot ? ar.bots : ar.humans) await member.roles.add(id, "رتبة تلقائية").catch(() => {});
        // تتبع الدعوة
        const old = inviteCache.get(g.id) || new Map(); let inv = null;
        try { const now = await g.invites.fetch(); inv = now.find(i => i.uses > (old.get(i.code) || 0)); inviteCache.set(g.id, new Map(now.map(i => [i.code, i.uses]))); } catch {}
        if (inv && inv.inviter) { const k = `invs_${g.id}`, all = Pro.get(k) || {}, x = all[inv.inviter.id] || { joins: 0, left: 0 }; x.joins++; all[inv.inviter.id] = x; Pro.set(k, all); Pro.set(`invby_${g.id}_${member.id}`, inv.inviter.id); }
    } catch (e) { console.error("[features] memberAdd:", e.message); }
});
client.on("guildMemberRemove", member => {
    const by = Pro.get(`invby_${member.guild.id}_${member.id}`); if (!by) return;
    const k = `invs_${member.guild.id}`, all = Pro.get(k) || {}; if (all[by]) { all[by].left = (all[by].left || 0) + 1; Pro.set(k, all); } Pro.delete(`invby_${member.guild.id}_${member.id}`);
});

// ───── ريأكشن رول ─────
async function rr(reaction, user, add) {
    try {
        if (user.bot) return; if (reaction.partial) await reaction.fetch(); const msg = reaction.message, g = msg.guild; if (!g) return;
        const key = reaction.emoji.id || reaction.emoji.name, hit = (Pro.get(`rr_${g.id}`) || []).find(x => x.msg === msg.id && x.emoji === key); if (!hit) return;
        const mem = await g.members.fetch(user.id); await (add ? mem.roles.add(hit.role) : mem.roles.remove(hit.role)).catch(() => {});
    } catch {}
}
client.on("messageReactionAdd", (r, u) => rr(r, u, true));
client.on("messageReactionRemove", (r, u) => rr(r, u, false));

// ───── أزرار التقييم وقائمة الألوان ─────
client.on("interactionCreate", async i => {
    try {
        if (!i.guild) return;
        if (i.isButton() && i.customId.startsWith("rate:")) {
            const n = Number(i.customId.split(":")[1]), k = `rate_${i.message.id}`, v = Pro.get(k) || {}; v[i.user.id] = n; Pro.set(k, v);
            const vals = Object.values(v), avg = (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1), e = i.message.embeds[0], base = (e.description || "").split("\n\nالتقييمات:")[0];
            return void i.update({ embeds: [K.emb("#2b2d31", `${base}\n\nالتقييمات: **${vals.length}** • المتوسط: **${avg}** ⭐`, e.title)], components: i.message.components }).catch(() => {});
        }
        if (i.isStringSelectMenu() && i.customId === "colorpick") {
            const list = Pro.get(`colors_${i.guild.id}`) || [], v = i.values[0];
            for (const id of list) if (i.member.roles.cache.has(id)) await i.member.roles.remove(id).catch(() => {});
            if (v === "off") return void i.reply({ content: "تم إزالة لونك.", ephemeral: true }).catch(() => {});
            if (!list.includes(v)) return void i.reply({ content: "هذا اللون ما عاد متوفر.", ephemeral: true }).catch(() => {});
            await i.member.roles.add(v).catch(() => {}); i.reply({ content: `صار لونك <@&${v}>`, ephemeral: true }).catch(() => {});
        }
    } catch (e) { console.error("[features] interaction:", e.message); }
});

// ───── تتبع الصوت ─────
const joinedAt = new Map();
client.on("voiceStateUpdate", (o, n) => {
    const id = n.id || o.id, k = `${(n.guild || o.guild).id}_${id}`;
    if (o.channel && (!n.channel || n.channel.id !== o.channel.id)) { const dur = Date.now() - (joinedAt.get(k) || Date.now()); Pro.set(`lastvoice_${k}`, { name: o.channel.name, at: Date.now(), dur }); joinedAt.delete(k); }
    if (n.channel && (!o.channel || n.channel.id !== o.channel.id)) joinedAt.set(k, Date.now());
});

// ───── مؤقتات: فك الميوت والسجن، نسخ احتياطي دوري ─────
async function tick() {
    for (const guild of client.guilds.cache.values()) {
        try {
            const mk = `mutes_${guild.id}`, mutes = Pro.get(mk) || {}, rid = Pro.get(`mute_role_${guild.id}`); let changed = false;
            for (const [uid, until] of Object.entries(mutes)) if (until <= Date.now()) { const mem = await guild.members.fetch(uid).catch(() => null); if (mem && rid) await mem.roles.remove(rid, "انتهى الميوت").catch(() => {}); delete mutes[uid]; changed = true; }
            if (changed) Pro.set(mk, mutes);
            for (const { ID, data } of Pro.startsWith(`prison_${guild.id}_`)) if (data && data.until && data.until <= Date.now()) { const mem = await guild.members.fetch(ID.split("_").pop()).catch(() => null); if (mem) await require("../Commands/Moderation/moderation").releasePrison(guild, mem); else Pro.delete(ID); }
        } catch {}
    }
}
client.once("clientReady", () => {
    require("../Commands/Owners/owners").applyStatus(client);
    for (const g of client.guilds.cache.values()) cacheInvites(g);
    setInterval(tick, 30 * 1000);
    setTimeout(() => client.guilds.cache.forEach(g => P.takeBackup(g).catch(() => {})), 60 * 1000);
    setInterval(() => client.guilds.cache.forEach(g => P.takeBackup(g).catch(() => {})), 6 * 3600 * 1000);
});
