// أوامر الصوت: نقل، متواجدين، بث، إداريين، فحص، آخر تواجد، ومخالفات
const K = require("../../utils/kit");
const { Pro } = K;
const cmd = (name, perm, aliases, run) => ({ name, aliases, directory: "Voice", run: async (client, m, a) => { if (perm && !K.has(m, perm)) return; return run(client, m, a); } });
const vcs = m => [...m.guild.channels.cache.filter(c => c.isVoiceBased()).values()].sort((a, b) => a.rawPosition - b.rawPosition);
const vchan = (m, arg) => { const c = K.getChannel(m, arg); return c && c.isVoiceBased() ? c : null; };

module.exports = [
    cmd("move", "MOVE_MEMBERS", ["نقل"], async (c, m, a) => {
        if (a[0] === "all") { const from = m.member.voice.channel, to = vchan(m, a[1]); if (!from || !to) return K.bad(m, "move all #روم_صوتي (وأنت داخل روم صوتي)"); let n = 0; for (const mem of [...from.members.values()]) { await mem.voice.setChannel(to).then(() => n++).catch(() => {}); await K.sleep(250); } return K.ok(m, `تم نقل ${n} عضو إلى ${to}`); }
        const t = await K.getMember(m, a[0]), to = vchan(m, a[1]) || m.member.voice.channel; if (!t || !t.voice.channel || !to) return K.bad(m, "move @عضو #روم_صوتي  |  move all #روم_صوتي");
        await t.voice.setChannel(to).then(() => K.ok(m, `تم نقل ${t} إلى ${to}`)).catch(e => K.bad(m, e.message));
    }),
    cmd("moveme", "MOVE_MEMBERS", ["انقلني"], async (c, m, a) => {
        const t = await K.getMember(m, a[0]); if (!t || !t.voice.channel) return K.bad(m, "moveme @عضو (لازم يكون في روم صوتي)"); if (!m.member.voice.channel) return K.bad(m, "ادخل روم صوتي أول.");
        await m.member.voice.setChannel(t.voice.channel).then(() => K.ok(m, `تم نقلك إلى ${t.voice.channel}`)).catch(e => K.bad(m, e.message));
    }),
    cmd("voiceroom", null, ["rooms", "الرومات-الصوتية"], async (c, m) => {
        const l = vcs(m); K.info(m, l.map(v => `🔊 ${v} — **${v.members.size}**`).join("\n").slice(0, 3900) || "ما فيه رومات صوتية.", `الرومات الصوتية (${l.length})`);
    }),
    cmd("here", null, ["المتواجدين"], async (c, m) => {
        const inV = vcs(m).reduce((n, v) => n + v.members.size, 0), on = m.guild.members.cache.filter(x => x.presence && x.presence.status !== "offline" && !x.user.bot).size;
        K.info(m, `🟢 المتصلين: **${on}**\n🔊 في الصوت: **${inV}**\n👥 الأعضاء: **${m.guild.memberCount}**`, "📊 المتواجدين");
    }),
    cmd("live", null, ["البث"], async (c, m) => {
        const l = []; for (const v of vcs(m)) for (const x of v.members.values()) if (x.voice.streaming || x.voice.selfVideo) l.push(`${x.voice.streaming ? "🔴 بث" : "📷 كاميرا"} — ${x} في ${v}`);
        K.info(m, l.join("\n") || "ما فيه أحد يبث الحين.", "🔴 البث");
    }),
    cmd("adminlist", "MANAGE_MESSAGES", ["الاداريين-في-الصوت"], async (c, m) => {
        const l = []; for (const v of vcs(m)) for (const x of v.members.values()) if (x.permissions.has("MANAGE_MESSAGES") && !x.user.bot) l.push(`${x} في ${v}`);
        K.info(m, l.join("\n") || "ما فيه إداريين في الصوت.", "🛡 إداريين في الصوت");
    }),
    cmd("checkvc", "MOVE_MEMBERS", ["فحص-الصوت"], async (c, m, a) => {
        const t = await K.getMember(m, a[0]) || m.member, v = t.voice; if (!v.channel) return K.info(m, `${t} مو في روم صوتي.`);
        K.info(m, [`الروم: ${v.channel}`, `ميوت سيرفر: ${v.serverMute ? "✅" : "❌"} • ديفن سيرفر: ${v.serverDeaf ? "✅" : "❌"}`, `ميوت ذاتي: ${v.selfMute ? "✅" : "❌"} • ديفن ذاتي: ${v.selfDeaf ? "✅" : "❌"}`, `بث: ${v.streaming ? "✅" : "❌"} • كاميرا: ${v.selfVideo ? "✅" : "❌"}`].join("\n"), `🔎 ${t.displayName}`);
    }),
    cmd("lastvoice", null, ["اخر-تواجد-صوتي"], async (c, m, a) => {
        const t = await K.getMember(m, a[0]) || m.member, x = Pro.get(`lastvoice_${m.guild.id}_${t.id}`);
        K.info(m, x ? `آخر مرة كان في **${x.name}**\n<t:${Math.floor(x.at / 1000)}:R> (مدة الجلسة: ${K.fmtDur(x.dur || 0)})` : "ما عندي سجل صوتي له.", `🎙 ${t.displayName}`);
    }),
    cmd("infractions", "MODERATE_MEMBERS", ["المخالفات-الصوتية"], async (c, m, a) => {
        const t = await K.getMember(m, a[0]) || m.member, r = K.getRecords(m.guild.id, t.id).filter(x => ["vmute", "vkick"].includes(x.type));
        K.info(m, r.length ? r.slice(0, 15).map(x => `• **${x.type}** — ${x.reason.slice(0, 50)} <t:${Math.floor(x.at / 1000)}:R>`).join("\n") : "ما عليه مخالفات صوتية.", `🎙 مخالفات ${t.displayName}`);
    }),
    cmd("movelink", null, ["رابط-النقل"], async (c, m) => {
        const v = m.member.voice.channel; if (!v) return K.bad(m, "ادخل روم صوتي أول.");
        const inv = await v.createInvite({ maxAge: 3600, maxUses: 0, reason: "movelink" }).catch(() => null); if (!inv) return K.bad(m, "ما أقدر أسوي رابط (أحتاج Create Invite).");
        K.info(m, `رابط دخول ${v}:\n${inv.url}\n(ساري ساعة)`, "🔗 رابط النقل");
    }),
    cmd("join", "MOVE_MEMBERS", ["ادخل"], async (c, m, a) => {
        const v = vchan(m, a[0]) || m.member.voice.channel; if (!v) return K.bad(m, "ادخل روم صوتي أو حدد: join #روم");
        try { const { joinVoiceChannel } = require("@discordjs/voice"); joinVoiceChannel({ channelId: v.id, guildId: m.guild.id, adapterCreator: m.guild.voiceAdapterCreator, selfDeaf: true }); K.ok(m, `دخلت ${v}`); } catch (e) { K.bad(m, "فشل الدخول: " + e.message); }
    })
];
