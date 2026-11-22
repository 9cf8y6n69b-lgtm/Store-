// أوامر الرومات: قفل/إخفاء، سلو مود، إمبد، خط، ريأكشن، رد تلقائي، كت تويت، غياب، تقييم...
const path = require("path"), fs = require("fs");
const K = require("../../utils/kit");
const FT = require("../../utils/feat");
const { Pro } = K;
const { ActionRowBuilder, ButtonBuilder, AttachmentBuilder } = require("../../compat");

const cmd = (name, perm, aliases, run, directory = "Channels") => ({ name, aliases, directory, run: async (client, m, a) => { if (perm && !K.has(m, perm)) return; return run(client, m, a); } });
const chOf = (m, a) => K.getChannel(m, a[0]) || m.channel;
const everyone = m => m.guild.roles.everyone;
const textChannels = m => [...m.guild.channels.cache.filter(c => c.isTextBased() && !c.isThread() && c.permissionOverwrites).values()];
const setPerm = async (ch, m, perms) => ch.permissionOverwrites.edit(everyone(m), perms, { reason: m.author.tag });
const allChannels = async (m, perms, label) => { let n = 0; for (const ch of textChannels(m)) { await setPerm(ch, m, perms).then(() => n++).catch(() => {}); await K.sleep(250); } K.ok(m, `${label} ${n} روم.`); };
const multi = (m) => [...m.mentions.channels.values()];

// room-toggle helper: feat[key] array
const roomToggle = (name, aliases, key, onTxt, offTxt, perm = "MANAGE_CHANNELS") => cmd(name, perm, aliases, async (c, m, a) => {
    const ch = chOf(m, a); let on; FT.edit(m.guild.id, s => { on = FT.toggle(s[key], ch.id); }); K.ok(m, on ? `${onTxt} ${ch}` : `${offTxt} ${ch}`);
});

const lineAttachment = (g) => { const f = FT.get(g); if (f.lineUrl) return { content: f.lineUrl }; const b = require("../../../banner").asset("line.png"); return b ? { files: [new AttachmentBuilder(b, { name: "line.png" })] } : null; };
module.exports = [
    cmd("lock", "MANAGE_CHANNELS", ["قفل"], async (c, m, a) => { const ch = chOf(m, a); await setPerm(ch, m, { SEND_MESSAGES: false }).then(() => K.ok(m, `🔒 تم قفل ${ch}`)).catch(e => K.bad(m, e.message)); }),
    cmd("unlock", "MANAGE_CHANNELS", ["فتح"], async (c, m, a) => { const ch = chOf(m, a); await setPerm(ch, m, { SEND_MESSAGES: null }).then(() => K.ok(m, `🔓 تم فتح ${ch}`)).catch(e => K.bad(m, e.message)); }),
    cmd("hide", "MANAGE_CHANNELS", ["اخفاء"], async (c, m, a) => { const ch = chOf(m, a); await setPerm(ch, m, { VIEW_CHANNEL: false }).then(() => K.ok(m, `🙈 تم إخفاء ${ch}`)).catch(e => K.bad(m, e.message)); }),
    cmd("show", "MANAGE_CHANNELS", ["اظهار", "unhide"], async (c, m, a) => { const ch = chOf(m, a); await setPerm(ch, m, { VIEW_CHANNEL: null }).then(() => K.ok(m, `👁 تم إظهار ${ch}`)).catch(e => K.bad(m, e.message)); }),
    cmd("ochat", "MANAGE_CHANNELS", ["فتح-شات"], async (c, m, a) => { const ch = chOf(m, a); await setPerm(ch, m, { VIEW_CHANNEL: true, SEND_MESSAGES: true }).then(() => K.ok(m, `✅ تم فتح الشات ${ch} للجميع`)).catch(e => K.bad(m, e.message)); }),
    cmd("hideall", "ADMINISTRATOR", ["اخفاء-الكل"], async (c, m) => allChannels(m, { VIEW_CHANNEL: false }, "🙈 تم إخفاء")),
    cmd("unhideall", "ADMINISTRATOR", ["اظهار-الكل"], async (c, m) => allChannels(m, { VIEW_CHANNEL: null }, "👁 تم إظهار")),
    cmd("mhide", "MANAGE_CHANNELS", ["اخفاء-عدة"], async (c, m) => { const l = multi(m); if (!l.length) return K.bad(m, "منشن الرومات."); for (const ch of l) await setPerm(ch, m, { VIEW_CHANNEL: false }).catch(() => {}); K.ok(m, `تم إخفاء ${l.length} روم.`); }),
    cmd("mshow", "MANAGE_CHANNELS", ["اظهار-عدة"], async (c, m) => { const l = multi(m); if (!l.length) return K.bad(m, "منشن الرومات."); for (const ch of l) await setPerm(ch, m, { VIEW_CHANNEL: null }).catch(() => {}); K.ok(m, `تم إظهار ${l.length} روم.`); }),
    cmd("slowmode", "MANAGE_CHANNELS", ["سلو", "سلو-مود"], async (c, m, a) => {
        const ms = a[0] === "off" || a[0] === "0" ? 0 : K.dur(a[0]); if (ms === null || ms > 6 * 3600e3) return K.bad(m, "slowmode 10s | 5m | off");
        await m.channel.setRateLimitPerUser(Math.round(ms / 1000)).then(() => K.ok(m, ms ? `🐢 سلو مود ${K.fmtDur(ms)}` : "تم إيقاف السلو مود")).catch(e => K.bad(m, e.message));
    }),
    cmd("setecolor", "ADMINISTRATOR", ["لون-الامبد"], async (c, m, a) => { if (!/^#?[0-9a-f]{6}$/i.test(a[0] || "")) return K.bad(m, "setecolor #ff0000"); FT.edit(m.guild.id, s => s.ecolor = "#" + a[0].replace("#", "")); K.ok(m, "تم تعيين لون الإمبد."); }),
    cmd("embed", "MANAGE_MESSAGES", ["امبد", "ايمبد"], async (c, m, a) => {
        const t = a.join(" ").trim(); if (!t && !m.attachments.size) return K.bad(m, "embed العنوان | الوصف");
        const [title, ...rest] = t.split("|"), e = new K.MessageEmbed().setColor(FT.get(m.guild.id).ecolor);
        if (rest.length) { e.setTitle(title.trim()); e.setDescription(rest.join("|").trim()); } else e.setDescription(t);
        const img = m.attachments.first(); if (img) e.setImage(img.url);
        await m.channel.send({ embeds: [e] }); m.delete().catch(() => {});
    }),

    // ───── الخط ─────
    cmd("line", "MANAGE_MESSAGES", ["خط"], async (c, m) => { const p = lineAttachment(m.guild.id); if (p) await m.channel.send(p); m.delete().catch(() => {}); }),
    cmd("setline", "ADMINISTRATOR", ["تعيين-الخط"], async (c, m, a) => {
        const url = (m.attachments.first() || {}).url || a[0]; if (!/^https?:\/\//.test(url || "")) return K.bad(m, "setline رابط الصورة (أو أرفق صورة)");
        FT.edit(m.guild.id, s => s.lineUrl = url); K.ok(m, "تم تعيين الخط.");
    }),
    cmd("cline", "ADMINISTRATOR", ["مسح-الخط"], async (c, m) => { FT.edit(m.guild.id, s => s.lineUrl = ""); K.ok(m, "رجع الخط الافتراضي (NOVA STORE)."); }),
    roomToggle("autoline", ["خط-تلقائي"], "autoline", "✅ الخط التلقائي شغال في", "⛔ تم إيقاف الخط التلقائي في"),
    cmd("unline", "MANAGE_CHANNELS", ["ايقاف-الخط"], async (c, m, a) => { const ch = chOf(m, a); FT.edit(m.guild.id, s => s.autoline = s.autoline.filter(x => x !== ch.id)); K.ok(m, `تم إيقاف الخط التلقائي في ${ch}`); }),

    // ───── ريأكشن تلقائي ─────
    cmd("autoreact", "MANAGE_CHANNELS", ["setreact", "ريأكشن"], async (c, m, a) => {
        const ch = K.getChannel(m, a[0]) || m.channel, em = a.filter(x => !/^<#|^\d{15,}$/.test(x)).slice(0, 5); if (!em.length) return K.bad(m, "autoreact #روم 😀 ❤️");
        FT.edit(m.guild.id, s => s.react[ch.id] = em); K.ok(m, `سيتم وضع ${em.join(" ")} على كل رسالة في ${ch}`);
    }),
    cmd("unreact", "MANAGE_CHANNELS", ["الغاء-ريأكشن"], async (c, m, a) => { const ch = chOf(m, a); FT.edit(m.guild.id, s => delete s.react[ch.id]); K.ok(m, `تم إيقاف الريأكشن في ${ch}`); }),

    // ───── رومات خاصة ─────
    roomToggle("setpic", ["شات-الصور"], "pic", "🖼 صار شات صور فقط:", "تم إلغاء شات الصور:"),
    roomToggle("unpic", ["الغاء-شات-الصور"], "pic", "🖼 صار شات صور فقط:", "تم إلغاء شات الصور:"),
    roomToggle("avtchats", ["شات-الافتارات"], "avt", "🖼 شات أفتارات (صور فقط + ريأكشن):", "تم إلغاء شات الأفتارات:"),
    cmd("avtclear", "MANAGE_CHANNELS", ["مسح-شات-الافتارات"], async (c, m, a) => { const ch = chOf(m, a); FT.edit(m.guild.id, s => s.avt = s.avt.filter(x => x !== ch.id)); K.ok(m, `تم إلغاء شات الأفتارات في ${ch}`); }),
    roomToggle("feel", ["شات-المشاعر"], "feel", "😊 شات المشاعر شغال في", "تم إيقاف شات المشاعر في"),
    roomToggle("feedrate", ["شات-التقييم"], "feedrate", "⭐ شات التقييم شغال في", "تم إيقاف شات التقييم في"),
    cmd("absrooms", "MANAGE_CHANNELS", ["رومات-الغياب"], async (c, m, a) => {
        if (!a[0]) { const l = FT.get(m.guild.id).absence; return K.info(m, l.length ? l.map(x => `<#${x}>`).join("\n") : "ما فيه رومات غياب. استخدم: absrooms #روم", "رومات الغياب"); }
        const ch = chOf(m, a); let on; FT.edit(m.guild.id, s => { on = FT.toggle(s.absence, ch.id); }); K.ok(m, on ? `📝 ${ch} صار روم غياب` : `تم إلغاء روم الغياب ${ch}`);
    }),
    cmd("setclear", "MANAGE_CHANNELS", ["مسح-تلقائي"], async (c, m, a) => {
        const ch = K.getChannel(m, a.find(x => /^<#|^\d{15,}$/.test(x))) || m.channel, t = a.find(x => /^\d+[smhdثدسي]?$/i.test(x));
        if (a.includes("off")) { FT.edit(m.guild.id, s => delete s.clear[ch.id]); return K.ok(m, `تم إيقاف المسح التلقائي في ${ch}`); }
        const ms = K.dur(t); if (!ms || ms > 864e5) return K.bad(m, "setclear #روم 30s  |  setclear off #روم");
        FT.edit(m.guild.id, s => s.clear[ch.id] = ms); K.ok(m, `🧹 رسائل ${ch} تنمسح بعد ${K.fmtDur(ms)}`);
    }),

    // ───── شات الرد ─────
    cmd("setrchat", "MANAGE_CHANNELS", ["شات-الرد"], async (c, m, a) => {
        const ch = K.getChannel(m, a[0]) || m.channel, txt = a.filter(x => !/^<#/.test(x) && x !== ch.id).join(" ").trim();
        FT.edit(m.guild.id, s => { if (!s.rchat.rooms.includes(ch.id)) s.rchat.rooms.push(ch.id); if (txt) s.rchat.text = txt.slice(0, 1500); }); K.ok(m, `سيرد البوت على كل رسالة في ${ch}${txt ? "" : " (حدد نص الرد: setrchat #روم النص)"}`);
    }),
    cmd("dltrchat", "MANAGE_CHANNELS", ["حذف-شات-الرد"], async (c, m, a) => { const ch = chOf(m, a); FT.edit(m.guild.id, s => s.rchat.rooms = s.rchat.rooms.filter(x => x !== ch.id)); K.ok(m, `تم حذف شات الرد ${ch}`); }),
    cmd("dreply", "MANAGE_CHANNELS", ["حذف-رد"], async (c, m) => { FT.edit(m.guild.id, s => { s.rchat.text = ""; s.rchat.image = ""; }); K.ok(m, "تم حذف نص وصورة الرد."); }),
    cmd("setrcolor", "MANAGE_CHANNELS", ["لون-الرد"], async (c, m, a) => { if (!/^#?[0-9a-f]{6}$/i.test(a[0] || "")) return K.bad(m, "setrcolor #ff0000"); FT.edit(m.guild.id, s => s.rchat.color = "#" + a[0].replace("#", "")); K.ok(m, "تم."); }),
    cmd("setrimage", "MANAGE_CHANNELS", ["صورة-الرد"], async (c, m, a) => { const url = (m.attachments.first() || {}).url || a[0]; if (!/^https?:\/\//.test(url || "")) return K.bad(m, "setrimage رابط أو أرفق صورة"); FT.edit(m.guild.id, s => s.rchat.image = url); K.ok(m, "تم."); }),

    // ───── رد تلقائي ─────
    cmd("autoreply", "MANAGE_GUILD", ["رد-تلقائي"], async (c, m, a) => {
        const [t, ...r] = a.join(" ").split("|"), trig = (t || "").trim().toLowerCase(), reply = r.join("|").trim();
        if (!trig || !reply) return K.bad(m, "autoreply الكلمة | الرد");
        FT.edit(m.guild.id, s => { s.autoreply = s.autoreply.filter(x => x.trigger !== trig); s.autoreply.push({ trigger: trig.slice(0, 100), reply: reply.slice(0, 1500) }); s.autoreply = s.autoreply.slice(-100); }); K.ok(m, `إذا أحد كتب **${trig}** بيرد البوت.`);
    }),
    cmd("dautoreply", "MANAGE_GUILD", ["حذف-رد-تلقائي"], async (c, m, a) => {
        const trig = a.join(" ").trim().toLowerCase(); if (!trig) { const l = FT.get(m.guild.id).autoreply; return K.info(m, l.length ? l.map(x => `• ${x.trigger}`).join("\n") : "ما فيه ردود.", "الردود التلقائية"); }
        FT.edit(m.guild.id, s => s.autoreply = s.autoreply.filter(x => x.trigger !== trig)); K.ok(m, "تم الحذف.");
    }),

    // ───── كت تويت ─────
    cmd("chat-cut", "MANAGE_CHANNELS", ["شات-الكت"], async (c, m, a) => { const ch = chOf(m, a); FT.edit(m.guild.id, s => s.cut.room = ch.id); K.ok(m, `صار ${ch} شات الكت — اكتب فيه **كت** يجيك سؤال.`); }, "Tweets"),
    cmd("cut-tweets", null, ["كت", "كت-تويت"], async (c, m, a) => {
        const s = FT.get(m.guild.id), sub = a[0];
        if (sub === "add" && K.has(m, "MANAGE_CHANNELS")) { const q = a.slice(1).join(" ").trim(); if (!q) return K.bad(m, "cut-tweets add السؤال"); FT.edit(m.guild.id, x => x.cut.questions.push(q.slice(0, 300))); return K.ok(m, "انضاف السؤال."); }
        if (sub === "remove" && K.has(m, "MANAGE_CHANNELS")) { const n = parseInt(a[1]); if (!s.cut.questions[n - 1]) return K.bad(m, "رقم غلط."); FT.edit(m.guild.id, x => x.cut.questions.splice(n - 1, 1)); return K.ok(m, "تم الحذف."); }
        if (sub === "list" && K.has(m, "MANAGE_CHANNELS")) return K.info(m, s.cut.questions.map((q, i) => `${i + 1}. ${q}`).join("\n").slice(0, 3900) || "ما فيه أسئلة مخصصة (يستخدم الأسئلة الافتراضية).", "أسئلة الكت");
        const pool = s.cut.questions.length ? s.cut.questions : FT.QUESTIONS, q = pool[Math.floor(Math.random() * pool.length)];
        const room = (s.cut.room && m.guild.channels.cache.get(s.cut.room)) || m.channel;
        room.send({ embeds: [K.emb(s.ecolor, q, "🎲 كت تويت")] }).catch(() => {});
    }, "Tweets"),
    cmd("image-cut", null, ["صور-الكت"], async (c, m, a) => {
        const s = FT.get(m.guild.id);
        if (a[0] === "add" && K.has(m, "MANAGE_CHANNELS")) { const url = (m.attachments.first() || {}).url || a[1]; if (!/^https?:\/\//.test(url || "")) return K.bad(m, "image-cut add رابط أو أرفق صورة"); FT.edit(m.guild.id, x => x.cut.images.push(url)); return K.ok(m, "انضافت الصورة."); }
        if (a[0] === "remove" && K.has(m, "MANAGE_CHANNELS")) { const n = parseInt(a[1]); if (!s.cut.images[n - 1]) return K.bad(m, "رقم غلط."); FT.edit(m.guild.id, x => x.cut.images.splice(n - 1, 1)); return K.ok(m, "تم الحذف."); }
        if (!s.cut.images.length) return K.bad(m, "ما فيه صور. أضف: image-cut add رابط");
        const room = (s.cut.room && m.guild.channels.cache.get(s.cut.room)) || m.channel;
        room.send({ embeds: [new K.MessageEmbed().setColor(s.ecolor).setImage(s.cut.images[Math.floor(Math.random() * s.cut.images.length)])] }).catch(() => {});
    }, "Tweets"),

    // ───── تقييم بالأزرار ─────
    cmd("rate", null, ["evaluation", "تقييم"], async (c, m, a) => {
        const t = a.join(" ").trim() || "قيّم تجربتك"; const row = new ActionRowBuilder().addComponents([1, 2, 3, 4, 5].map(n => new ButtonBuilder().setCustomId(`rate:${n}`).setLabel("⭐".repeat(n)).setStyle(2)));
        const e = K.emb(FT.get(m.guild.id).ecolor, `${t}\n\nالتقييمات: **0** • المتوسط: **—**`, "⭐ تقييم");
        await m.channel.send({ embeds: [e], components: [row] });
    }, "General")
];
