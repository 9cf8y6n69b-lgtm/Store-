// أوامر الإدارة: حظر، طرد، ميوت، تايم أوت، سجن، تحذيرات، مسح، نك نيم، تقديمات...
const K = require("../../utils/kit");
const LP = require("../../utils/logPanel");
const { Pro } = K;

const cmd = (name, perm, aliases, run) => ({ name, aliases, directory: "Admin", run: async (client, m, a) => { if (perm && !K.has(m, perm)) return; return run(client, m, a); } });
const reason = (a, from = 1) => K.restText(a, from) || "بدون سبب";
const tgt = async (m, a) => {
    const t = await K.getMember(m, a[0]);
    if (!t) { await K.bad(m, "منشن العضو أو اكتب الآيدي."); return null; }
    if (!K.canTarget(m, t)) { await K.bad(m, "ما أقدر أنفذ هذا الأمر على هذا العضو (رتبته أعلى منك أو من البوت)."); return null; }
    return t;
};

// ───── الميوت الكتابي (رتبة Muted) ─────
async function muteRole(guild) {
    let id = Pro.get(`mute_role_${guild.id}`), role = id && guild.roles.cache.get(id);
    if (role) return role;
    role = guild.roles.cache.find(r => r.name === "Muted") || await guild.roles.create({ name: "Muted", color: "#6b6b6b", permissions: [], reason: "ميوت كتابي" });
    Pro.set(`mute_role_${guild.id}`, role.id);
    for (const ch of guild.channels.cache.values()) await ch.permissionOverwrites?.edit(role, { SEND_MESSAGES: false, ADD_REACTIONS: false, SPEAK: false, SEND_MESSAGES_IN_THREADS: false }).catch(() => {});
    return role;
}
const mutesKey = g => `mutes_${g}`;
function setMuteUntil(g, u, until) { const x = Pro.get(mutesKey(g)) || {}; if (until === null) delete x[u]; else x[u] = until; Pro.set(mutesKey(g), x); }

module.exports = [
    cmd("ban", "BAN_MEMBERS", ["حظر", "باند"], async (c, m, a) => {
        const id = K.idOf(a[0]); if (!id) return K.bad(m, "اكتب: ban @عضو [السبب]");
        const mem = await m.guild.members.fetch(id).catch(() => null);
        if (mem && !K.canTarget(m, mem)) return K.bad(m, "ما أقدر أحظر هذا العضو.");
        await m.guild.members.ban(id, { reason: `${m.author.tag}: ${reason(a)}`, deleteMessageSeconds: 0 }).then(() => { K.addRecord(m.guild.id, id, "ban", m.author.id, reason(a)); return K.ok(m, `تم حظر <@${id}>`); }).catch(e => K.bad(m, "فشل الحظر: " + e.message));
    }),
    cmd("unban", "BAN_MEMBERS", ["فك-حظر"], async (c, m, a) => {
        const id = K.idOf(a[0]); if (!id) return K.bad(m, "اكتب: unban آيدي");
        await m.guild.members.unban(id, `${m.author.tag}`).then(() => K.ok(m, `تم فك الحظر عن <@${id}>`)).catch(() => K.bad(m, "هذا الشخص مو محظور."));
    }),
    cmd("unban-all", "ADMINISTRATOR", ["unbanal", "فك-الحظر-عن-الكل"], async (c, m) => {
        const bans = await m.guild.bans.fetch().catch(() => null); if (!bans || !bans.size) return K.bad(m, "ما فيه محظورين.");
        let n = 0; for (const b of bans.values()) { await m.guild.members.unban(b.user.id, "unban-all").then(() => n++).catch(() => {}); await K.sleep(400); }
        K.ok(m, `انفك الحظر عن ${n} عضو.`);
    }),
    cmd("allbans", "BAN_MEMBERS", ["المحظورين"], async (c, m) => {
        const bans = await m.guild.bans.fetch().catch(() => null); if (!bans || !bans.size) return K.info(m, "ما فيه محظورين.");
        K.info(m, [...bans.values()].slice(0, 40).map((b, i) => `${i + 1}. **${b.user.tag}** (\`${b.user.id}\`) — ${(b.reason || "—").slice(0, 40)}`).join("\n"), `🔨 المحظورين (${bans.size})`);
    }),
    cmd("kick", "KICK_MEMBERS", ["طرد", "كيك"], async (c, m, a) => {
        const t = await tgt(m, a); if (!t) return;
        await t.kick(`${m.author.tag}: ${reason(a)}`).then(() => { K.addRecord(m.guild.id, t.id, "kick", m.author.id, reason(a)); K.ok(m, `تم طرد ${t}`); }).catch(e => K.bad(m, "فشل الطرد: " + e.message));
    }),
    cmd("kickofflinebots", "ADMINISTRATOR", ["طرد-البوتات-الاوفلاين"], async (c, m) => {
        const all = await m.guild.members.fetch(); let n = 0;
        for (const b of all.filter(x => x.user.bot && x.id !== c.user.id && !x.presence).values()) if (K.canTarget(m, b)) { await b.kick("بوت أوفلاين").then(() => n++).catch(() => {}); await K.sleep(400); }
        K.ok(m, `تم طرد ${n} بوت أوفلاين.`);
    }),

    cmd("mute", "MODERATE_MEMBERS", ["ميوت", "اسكت"], async (c, m, a) => {
        const t = await tgt(m, a); if (!t) return;
        const ms = K.dur(a[1]), rs = reason(a, ms ? 2 : 1);
        const role = await muteRole(m.guild).catch(() => null); if (!role) return K.bad(m, "ما قدرت أجهز رتبة الميوت (أحتاج Manage Roles).");
        await t.roles.add(role, rs).catch(() => {});
        if (ms) setMuteUntil(m.guild.id, t.id, Date.now() + ms);
        K.addRecord(m.guild.id, t.id, "mute", m.author.id, rs);
        K.ok(m, `تم ميوت ${t} ${ms ? "لمدة " + K.fmtDur(ms) : "بشكل دائم"}`);
    }),
    cmd("unmute", "MODERATE_MEMBERS", ["فك-ميوت"], async (c, m, a) => {
        const t = await K.getMember(m, a[0]); if (!t) return K.bad(m, "منشن العضو.");
        const role = m.guild.roles.cache.get(Pro.get(`mute_role_${m.guild.id}`)); if (role) await t.roles.remove(role).catch(() => {});
        setMuteUntil(m.guild.id, t.id, null); K.ok(m, `تم فك الميوت عن ${t}`);
    }),
    cmd("mymute", null, ["ميوتي"], async (c, m) => {
        const until = (Pro.get(mutesKey(m.guild.id)) || {})[m.author.id], role = Pro.get(`mute_role_${m.guild.id}`);
        if (!role || !m.member.roles.cache.has(role)) return K.ok(m, "أنت مو ميوت.");
        K.info(m, until ? `🔇 أنت ميوت لين <t:${Math.floor(until / 1000)}:R>` : "🔇 أنت ميوت بشكل دائم.");
    }),
    cmd("vmute", "MUTE_MEMBERS", ["ميوت-صوتي"], async (c, m, a) => {
        const t = await tgt(m, a); if (!t) return; if (!t.voice.channel) return K.bad(m, "العضو مو في روم صوتي.");
        await t.voice.setMute(true, reason(a)).then(() => { K.addRecord(m.guild.id, t.id, "vmute", m.author.id, reason(a)); K.ok(m, `تم ميوت ${t} صوتياً`); }).catch(e => K.bad(m, e.message));
    }),
    cmd("unvmute", "MUTE_MEMBERS", ["vunmute", "فك-ميوت-صوتي"], async (c, m, a) => {
        const t = await K.getMember(m, a[0]); if (!t || !t.voice.channel) return K.bad(m, "العضو مو في روم صوتي.");
        await t.voice.setMute(false).then(() => K.ok(m, `تم فك الميوت الصوتي عن ${t}`)).catch(e => K.bad(m, e.message));
    }),
    cmd("vkick", "MOVE_MEMBERS", ["طرد-صوتي"], async (c, m, a) => {
        const t = await tgt(m, a); if (!t) return; if (!t.voice.channel) return K.bad(m, "العضو مو في روم صوتي.");
        await t.voice.disconnect(reason(a)).then(() => { K.addRecord(m.guild.id, t.id, "vkick", m.author.id, reason(a)); K.ok(m, `تم طرد ${t} من الروم الصوتي`); }).catch(e => K.bad(m, e.message));
    }),
    cmd("timeout", "MODERATE_MEMBERS", ["تايم-اوت", "تايم"], async (c, m, a) => {
        const t = await tgt(m, a); const ms = K.dur(a[1]); if (!t) return;
        if (!ms || ms > 28 * 864e5) return K.bad(m, "اكتب المدة: timeout @عضو 10m [السبب] (الحد الأقصى 28 يوم)");
        await t.timeout(ms, reason(a, 2)).then(() => { K.addRecord(m.guild.id, t.id, "timeout", m.author.id, reason(a, 2)); K.ok(m, `تم تايم أوت لـ ${t} لمدة ${K.fmtDur(ms)}`); }).catch(e => K.bad(m, e.message));
    }),
    cmd("untimeout", "MODERATE_MEMBERS", ["فك-تايم-اوت"], async (c, m, a) => {
        const t = await K.getMember(m, a[0]); if (!t) return K.bad(m, "منشن العضو.");
        await t.timeout(null).then(() => K.ok(m, `تم فك التايم أوت عن ${t}`)).catch(e => K.bad(m, e.message));
    }),

    // ───── السجن (يسحب الرتب ويحط رتبة السجن، وترجع لما يطلع) ─────
    cmd("prison", "MODERATE_MEMBERS", ["سجن"], async (c, m, a) => {
        const rid = LP.getCfg(m.guild.id).prisonRole, role = rid && m.guild.roles.cache.get(rid);
        if (!role) return K.bad(m, "حدد رتبة السجن أول: log prison-role @رتبة");
        const t = await tgt(m, a); if (!t) return;
        const ms = K.dur(a[1]), rs = reason(a, ms ? 2 : 1);
        const keep = t.roles.cache.filter(r => r.id !== m.guild.id && !r.managed && r.id !== role.id).map(r => r.id);
        Pro.set(`prison_${m.guild.id}_${t.id}`, { roles: keep, until: ms ? Date.now() + ms : null });
        await t.roles.set([...t.roles.cache.filter(r => r.managed).map(r => r.id), role.id], rs).catch(e => K.bad(m, e.message));
        if (t.voice.channel) t.voice.disconnect().catch(() => {});
        K.addRecord(m.guild.id, t.id, "prison", m.author.id, rs); K.ok(m, `تم سجن ${t} ${ms ? "لمدة " + K.fmtDur(ms) : ""}`);
    }),
    cmd("unprison", "MODERATE_MEMBERS", ["اخراج-من-السجن"], async (c, m, a) => {
        const t = await K.getMember(m, a[0]); if (!t) return K.bad(m, "منشن العضو.");
        await releasePrison(m.guild, t); K.ok(m, `تم إخراج ${t} من السجن`);
    }),
    cmd("myprison", null, ["سجني"], async (c, m) => {
        const p = Pro.get(`prison_${m.guild.id}_${m.author.id}`); if (!p) return K.ok(m, "أنت مو مسجون.");
        K.info(m, p.until ? `⛓ أنت مسجون لين <t:${Math.floor(p.until / 1000)}:R>` : "⛓ أنت مسجون بشكل دائم.");
    }),

    // ───── التحذيرات ─────
    cmd("warn", "MODERATE_MEMBERS", ["تحذير", "انذار"], async (c, m, a) => {
        const t = await tgt(m, a); if (!t) return;
        K.addRecord(m.guild.id, t.id, "warn", m.author.id, reason(a));
        const n = K.getRecords(m.guild.id, t.id).filter(r => r.type === "warn").length;
        t.send({ embeds: [K.emb("#f1c40f", `تم تحذيرك في **${m.guild.name}**\nالسبب: ${reason(a)}\nتحذيراتك: ${n}`, "⚠️ تحذير")] }).catch(() => {});
        K.ok(m, `تم تحذير ${t} (تحذيراته: ${n})`);
    }),
    cmd("warnings", "MODERATE_MEMBERS", ["تحذيرات"], async (c, m, a) => {
        const t = await K.getMember(m, a[0]) || m.member, w = K.getRecords(m.guild.id, t.id).filter(r => r.type === "warn");
        K.info(m, w.length ? w.slice(0, 15).map((r, i) => `**${i + 1}.** ${r.reason} — <@${r.by}> <t:${Math.floor(r.at / 1000)}:R>`).join("\n") : "ما عليه تحذيرات.", `⚠️ تحذيرات ${t.displayName}`);
    }),
    cmd("remove-warn", "MODERATE_MEMBERS", ["حذف-تحذير"], async (c, m, a) => {
        const t = await K.getMember(m, a[0]); if (!t) return K.bad(m, "remove-warn @عضو رقم");
        const all = K.getRecords(m.guild.id, t.id), warns = all.filter(r => r.type === "warn"), n = parseInt(a[1]) || 1, w = warns[n - 1];
        if (!w) return K.bad(m, "رقم التحذير غلط."); all.splice(all.indexOf(w), 1); Pro.set(`records_${m.guild.id}_${t.id}`, all); K.ok(m, "تم حذف التحذير.");
    }),
    cmd("records", "MODERATE_MEMBERS", ["سجلات"], async (c, m, a) => {
        const t = await K.getMember(m, a[0]) || m.member, r = K.getRecords(m.guild.id, t.id);
        K.info(m, r.length ? r.slice(0, 20).map(x => `• **${x.type}** — ${x.reason.slice(0, 50)} — <@${x.by}> <t:${Math.floor(x.at / 1000)}:R>`).join("\n") : "السجل نظيف.", `📋 سجلات ${t.displayName}`);
    }),
    cmd("check", "MODERATE_MEMBERS", ["فحص"], async (c, m, a) => {
        const t = await K.getMember(m, a[0]) || m.member, rec = K.getRecords(m.guild.id, t.id), mr = Pro.get(`mute_role_${m.guild.id}`);
        const e = new K.MessageEmbed().setColor("#2b2d31").setAuthor({ name: t.user.tag, iconURL: t.displayAvatarURL() }).setThumbnail(t.displayAvatarURL())
            .addFields({ name: "الحساب", value: `<t:${K.unix(t.user.createdAt)}:R>`, inline: true }, { name: "دخل السيرفر", value: `<t:${K.unix(t.joinedAt)}:R>`, inline: true },
                { name: "الحالة", value: [t.isCommunicationDisabled() ? "⏳ تايم أوت" : null, mr && t.roles.cache.has(mr) ? "🔇 ميوت" : null, Pro.get(`prison_${m.guild.id}_${t.id}`) ? "⛓ مسجون" : null, t.voice.channel ? `🔊 ${t.voice.channel.name}` : null].filter(Boolean).join(" • ") || "طبيعي", inline: false },
                { name: "السجل", value: `تحذيرات: ${rec.filter(x => x.type === "warn").length} • عقوبات: ${rec.length}`, inline: false },
                { name: "الرتب", value: t.roles.cache.filter(r => r.id !== m.guild.id).map(r => r.toString()).slice(0, 15).join(" ") || "—", inline: false });
        K.rep(m, { embeds: [e] });
    }),

    // ───── مسح / نك نيم ─────
    cmd("clear", "MANAGE_MESSAGES", ["مسح", "امسح"], async (c, m, a) => {
        const n = Math.min(100, parseInt(a.find(x => /^\d{1,3}$/.test(x))) || 0); if (!n) return K.bad(m, "اكتب العدد: clear 50 [@عضو]");
        const who = K.idOf(a.find(x => /\d{15,}/.test(x)));
        let msgs = await m.channel.messages.fetch({ limit: 100 }); if (who) msgs = msgs.filter(x => x.author.id === who);
        const del = await m.channel.bulkDelete([...msgs.values()].slice(0, n), true).catch(() => null);
        const r = await m.channel.send({ embeds: [K.emb("#2ecc71", `🧹 تم مسح ${del ? del.size : 0} رسالة`)] }).catch(() => null); setTimeout(() => r && r.delete().catch(() => {}), 3000);
    }),
    cmd("nick", "MANAGE_NICKNAMES", ["نك"], async (c, m, a) => {
        const t = await tgt(m, a); if (!t) return; const nn = K.restText(a, 1) || null;
        await t.setNickname(nn, m.author.tag).then(() => K.ok(m, nn ? `تم تغيير اسم ${t} إلى **${nn}**` : `تم إرجاع اسم ${t}`)).catch(e => K.bad(m, e.message));
    }),
    cmd("setnick", "MANAGE_NICKNAMES", ["تعيين-نك"], async (c, m, a) => {
        const t = await tgt(m, a); if (!t) return; const nn = K.restText(a, 1); if (!nn) return K.bad(m, "setnick @عضو الاسم");
        await t.setNickname(nn.slice(0, 32)).then(() => K.ok(m, "تم.")).catch(e => K.bad(m, e.message));
    }),

    // ───── القائمة السوداء ومنع الصور ─────
    cmd("blacklist", "BAN_MEMBERS", ["بلاك-ليست", "قائمة-سوداء"], async (c, m, a) => {
        const id = K.idOf(a[0]); if (!id) return K.bad(m, "blacklist @عضو|آيدي [السبب]");
        const k = `blacklist_${m.guild.id}`, l = Pro.get(k) || []; if (!l.includes(id)) l.push(id); Pro.set(k, l);
        K.addRecord(m.guild.id, id, "blacklist", m.author.id, reason(a));
        await m.guild.members.ban(id, { reason: "القائمة السوداء: " + reason(a) }).catch(() => {});
        K.ok(m, `تمت إضافة <@${id}> للقائمة السوداء (يتحظر تلقائياً لو دخل).`);
    }),
    cmd("unblacklist", "BAN_MEMBERS", ["ازالة-من-القائمة-السوداء"], async (c, m, a) => {
        const id = K.idOf(a[0]); if (!id) return K.bad(m, "unblacklist آيدي"); const k = `blacklist_${m.guild.id}`;
        Pro.set(k, (Pro.get(k) || []).filter(x => x !== id)); await m.guild.members.unban(id).catch(() => {}); K.ok(m, "تمت الإزالة.");
    }),
    cmd("setupblchat", "ADMINISTRATOR", ["شات-القائمة-السوداء"], async (c, m, a) => {
        const ch = K.getChannel(m, a[0]) || m.channel; Pro.set(`blacklist_chat_${m.guild.id}`, ch.id); K.ok(m, `سيتم إشعارك بمحاولات دخول المحظورين في ${ch}`);
    }),
    cmd("blockpic", "MANAGE_MESSAGES", ["منع-الصور"], async (c, m, a) => {
        const id = K.idOf(a[0]); if (!id) return K.bad(m, "blockpic @عضو"); const k = `blockpic_${m.guild.id}`, l = Pro.get(k) || [];
        if (!l.includes(id)) l.push(id); Pro.set(k, l); K.ok(m, `تم منع <@${id}> من إرسال الصور.`);
    }),
    cmd("removeblockpic", "MANAGE_MESSAGES", ["الغاء-منع-الصور"], async (c, m, a) => {
        const id = K.idOf(a[0]); if (!id) return K.bad(m, "removeblockpic @عضو"); const k = `blockpic_${m.guild.id}`;
        Pro.set(k, (Pro.get(k) || []).filter(x => x !== id)); K.ok(m, "تمت الإزالة.");
    }),
    cmd("showblockpic", "MANAGE_MESSAGES", ["الممنوعين-من-الصور"], async (c, m) => { const l = Pro.get(`blockpic_${m.guild.id}`) || []; K.info(m, l.length ? l.map(x => `<@${x}>`).join("\n") : "ما فيه أحد.", "🚫 ممنوعين من الصور"); }),
    cmd("pic", "MANAGE_ROLES", ["صور"], async (c, m, a) => {
        const t = await K.getMember(m, a[0]); if (!t) return K.bad(m, "pic @عضو");
        await m.channel.permissionOverwrites.edit(t, { ATTACH_FILES: true, EMBED_LINKS: true }).then(() => K.ok(m, `${t} يقدر يرسل صور هنا.`)).catch(e => K.bad(m, e.message));
    }),

    // ───── تقديمات ─────
    cmd("applay", "MANAGE_ROLES", ["قبول-تقديم", "accept"], async (c, m, a) => {
        const t = await K.getMember(m, a[0]); if (!t) return K.bad(m, "applay @عضو [@رتبة]");
        const role = K.getRole(m, a[1]) || m.mentions.roles.first(); if (role) await t.roles.add(role).catch(() => {});
        t.send({ embeds: [K.emb("#2ecc71", `تم قبول تقديمك في **${m.guild.name}** ${role ? `وإعطاؤك رتبة **${role.name}**` : ""} 🎉`, "✅ مبروك")] }).catch(() => {}); K.ok(m, `تم قبول ${t}`);
    }),
    cmd("disapplay", "MANAGE_ROLES", ["رفض-تقديم", "reject"], async (c, m, a) => {
        const t = await K.getMember(m, a[0]); if (!t) return K.bad(m, "disapplay @عضو [السبب]");
        t.send({ embeds: [K.emb("#e74c3c", `نعتذر، تم رفض تقديمك في **${m.guild.name}**\nالسبب: ${reason(a)}`, "❌ رفض")] }).catch(() => {}); K.ok(m, `تم رفض ${t}`);
    })
];

async function releasePrison(guild, member) {
    const p = Pro.get(`prison_${guild.id}_${member.id}`), rid = LP.getCfg(guild.id).prisonRole;
    if (rid) await member.roles.remove(rid).catch(() => {});
    if (p) { for (const r of p.roles) await member.roles.add(r).catch(() => {}); Pro.delete(`prison_${guild.id}_${member.id}`); }
}
module.exports.releasePrison = releasePrison;
