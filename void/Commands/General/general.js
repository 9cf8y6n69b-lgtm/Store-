// أوامر عامة: معلومات، صور، أدوات، ذكاء اصطناعي، إيموجي، دعوات...
const K = require("../../utils/kit");
const { Pro } = K;
const XP = require("../../utils/xp");

const cmd = (name, perm, aliases, run, directory = "General") => ({ name, aliases, directory, run: async (client, m, a) => { if (perm && !K.has(m, perm)) return; return run(client, m, a); } });
const url = s => (/^https?:\/\/\S+$/i.test(s || "") ? s : null);
const imgOf = (m, a) => (m.attachments.first() || {}).url || url(a.find(x => url(x)));
const embedImg = (m, title, link, extra) => K.rep(m, { embeds: [new K.MessageEmbed().setColor("#2b2d31").setTitle(title).setImage(link).setDescription(extra || null)] });
const memberOrSelf = async (m, a) => (await K.getMember(m, a[0])) || m.member;
const ADVICE = ["ابتسم، لأن الحياة أقصر من إنك تكون عبوس.", "الصبر مفتاح الفرج.", "لا تأجل شغل اليوم لبكرة.", "اللي يزرع خير يحصد خير.", "اختر أصحابك بعناية، هم مرآتك.", "الكلمة الطيبة صدقة.", "تعلم شي جديد كل يوم.", "لا تقارن نفسك بأحد، قارن نفسك بنفسك أمس.", "الهدوء قوة.", "اشرب مويه واستغفر ربك."];
let CV = null; try { CV = require("@napi-rs/canvas"); } catch {}

async function aiAsk(system, text) {
    const key = process.env.ANTHROPIC_API_KEY; if (!key) throw new Error("ضيف ANTHROPIC_API_KEY في Environment لتفعيل الذكاء الاصطناعي.");
    const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: process.env.AI_MODEL || "claude-sonnet-5-5", max_tokens: 700, system, messages: [{ role: "user", content: text.slice(0, 4000) }] }) });
    const j = await r.json(); if (!r.ok) throw new Error(j.error?.message || "فشل الطلب");
    return (j.content || []).map(x => x.text || "").join("").trim() || "…";
}

module.exports = [
    cmd("avatar", null, ["افتار", "صورة"], async (c, m, a) => { const t = await memberOrSelf(m, a); embedImg(m, t.displayName, t.displayAvatarURL({ size: 1024 })); }),
    cmd("savatar", null, ["صورة-السيرفر"], async (c, m) => { const u = m.guild.iconURL({ size: 1024 }); if (!u) return K.bad(m, "السيرفر بدون صورة."); embedImg(m, m.guild.name, u); }),
    cmd("banner", null, ["بنر"], async (c, m, a) => { const t = await memberOrSelf(m, a), u = await c.users.fetch(t.id, { force: true }).catch(() => null), b = u && u.bannerURL({ size: 1024 }); if (!b) return K.bad(m, "ما عنده بنر."); embedImg(m, t.displayName, b); }),
    cmd("id", null, ["ايدي"], async (c, m, a) => { const x = m.mentions.members.first() || m.mentions.channels.first() || m.mentions.roles.first() || (await K.getMember(m, a[0])) || m.member; K.info(m, `\`${x.id}\``, "🆔 الآيدي"); }),
    cmd("user", null, ["معلومات-العضو", "whois"], async (c, m, a) => {
        const t = await memberOrSelf(m, a);
        K.rep(m, { embeds: [new K.MessageEmbed().setColor(t.displayColor || "#2b2d31").setAuthor({ name: t.user.tag, iconURL: t.displayAvatarURL() }).setThumbnail(t.displayAvatarURL({ size: 256 }))
            .addFields({ name: "الآيدي", value: t.id, inline: true }, { name: "الحساب", value: `<t:${K.unix(t.user.createdAt)}:R>`, inline: true }, { name: "الدخول", value: `<t:${K.unix(t.joinedAt)}:R>`, inline: true }, { name: "أعلى رتبة", value: `${t.roles.highest}`, inline: true }, { name: "بوت؟", value: t.user.bot ? "نعم" : "لا", inline: true }, { name: "الرتب", value: String(t.roles.cache.size - 1), inline: true })] });
    }),
    cmd("profile", null, ["بروفايل", "ملفي"], async (c, m, a) => {
        const t = await memberOrSelf(m, a), x = XP.getUser(m.guild.id, t.id), rec = K.getRecords(m.guild.id, t.id), inv = (Pro.get(`invs_${m.guild.id}`) || {})[t.id] || { joins: 0 };
        K.rep(m, { embeds: [new K.MessageEmbed().setColor("#2b2d31").setAuthor({ name: t.displayName, iconURL: t.displayAvatarURL() }).setThumbnail(t.displayAvatarURL({ size: 256 }))
            .setDescription(`**اللفل:** ${x.level} • **XP:** ${x.xp}\n**الرسائل:** ${x.messages} • **الفويس:** ${Math.floor(x.voiceSeconds / 60)} دقيقة\n**الدعوات:** ${inv.joins}\n**التحذيرات:** ${rec.filter(r => r.type === "warn").length}\n**دخل:** <t:${K.unix(t.joinedAt)}:R>`)] });
    }),
    cmd("server", null, ["سيرفر", "معلومات-السيرفر"], async (c, m) => {
        const g = m.guild, o = await g.fetchOwner().catch(() => null);
        K.rep(m, { embeds: [new K.MessageEmbed().setColor("#2b2d31").setTitle(g.name).setThumbnail(g.iconURL({ size: 256 })).setImage(g.bannerURL({ size: 1024 }) || null)
            .addFields({ name: "الأونر", value: o ? `${o}` : "—", inline: true }, { name: "الأعضاء", value: String(g.memberCount), inline: true }, { name: "الرتب", value: String(g.roles.cache.size), inline: true }, { name: "الرومات", value: String(g.channels.cache.size), inline: true }, { name: "البوستات", value: String(g.premiumSubscriptionCount || 0), inline: true }, { name: "أُنشئ", value: `<t:${K.unix(g.createdAt)}:R>`, inline: true }, { name: "الآيدي", value: g.id, inline: false })] });
    }),
    cmd("stats", null, ["احصائيات"], async (c, m) => {
        const g = m.guild, mem = g.members.cache, on = mem.filter(x => x.presence && x.presence.status !== "offline").size;
        K.info(m, `👥 الأعضاء: **${g.memberCount}** (🤖 ${mem.filter(x => x.user.bot).size} بوت)\n🟢 المتصلين: **${on}**\n💬 نصية: **${g.channels.cache.filter(x => x.isTextBased() && !x.isVoiceBased() && !x.isThread()).size}** • 🔊 صوتية: **${g.channels.cache.filter(x => x.isVoiceBased()).size}**\n🎭 الرتب: **${g.roles.cache.size}** • 😀 الإيموجي: **${g.emojis.cache.size}**\n🚀 البوست: **${g.premiumSubscriptionCount || 0}** (لفل ${g.premiumTier})`, `📊 ${g.name}`);
    }),
    cmd("bots", null, ["البوتات"], async (c, m) => { await m.guild.members.fetch().catch(() => {}); const l = m.guild.members.cache.filter(x => x.user.bot); K.info(m, [...l.values()].slice(0, 50).map(b => `🤖 ${b} ${b.presence ? "🟢" : "⚫"}`).join("\n") || "ما فيه بوتات.", `البوتات (${l.size})`); }),
    cmd("ping", null, ["بنق", "سرعة"], async (c, m) => { const t = Date.now(), r = await K.rep(m, { embeds: [K.emb("#2b2d31", "🏓 ...")] }); r && r.edit({ embeds: [K.emb("#2b2d31", `🏓 البنق: **${Math.round(c.ws.ping)}ms**\n⏱ الرد: **${Date.now() - t}ms**`)] }).catch(() => {}); }),
    cmd("uptime", null, ["مدة-التشغيل"], async (c, m) => K.info(m, `⏱ البوت شغال من **${K.fmtDur(process.uptime() * 1000)}**`, "Uptime")),

    // ───── السيرفر ─────
    cmd("servername", "MANAGE_GUILD", ["اسم-السيرفر"], async (c, m, a) => { const n = a.join(" ").trim(); if (!n) return K.bad(m, "servername الاسم"); await m.guild.setName(n.slice(0, 100)).then(() => K.ok(m, "تم تغيير اسم السيرفر.")).catch(e => K.bad(m, e.message)); }),
    cmd("serveravatar", "MANAGE_GUILD", ["تغيير-صورة-السيرفر"], async (c, m, a) => { const u = imgOf(m, a); if (!u) return K.bad(m, "serveravatar رابط أو أرفق صورة"); await m.guild.setIcon(u).then(() => K.ok(m, "تم تغيير صورة السيرفر.")).catch(e => K.bad(m, e.message)); }),

    // ───── إيموجي وملصقات ─────
    cmd("semoji", null, ["ايموجيات-السيرفر"], async (c, m) => { const l = [...m.guild.emojis.cache.values()]; K.info(m, l.slice(0, 80).map(e => `${e}`).join(" ") || "ما فيه إيموجيات.", `😀 إيموجي السيرفر (${l.length})`); }),
    cmd("aemoji", null, ["ايموجي"], async (c, m, a) => { const x = /<(a?):(\w+):(\d+)>/.exec(a.join(" ")); if (!x) return K.bad(m, "aemoji <إيموجي مخصص>"); embedImg(m, x[2], `https://cdn.discordapp.com/emojis/${x[3]}.${x[1] ? "gif" : "png"}?size=256`); }),
    cmd("addemoji", "MANAGE_GUILD_EXPRESSIONS", ["اضافة-ايموجي"], async (c, m, a) => {
        const x = /<(a?):(\w+):(\d+)>/.exec(a.join(" ")), link = x ? `https://cdn.discordapp.com/emojis/${x[3]}.${x[1] ? "gif" : "png"}?size=128` : imgOf(m, a), name = (x ? x[2] : a.find(v => /^\w{2,32}$/.test(v) && !url(v))) || "emoji" + Math.floor(Math.random() * 999);
        if (!link) return K.bad(m, "addemoji <إيموجي مخصص | رابط> [الاسم]");
        await m.guild.emojis.create({ attachment: link, name: name.slice(0, 32) }).then(e => K.ok(m, `تم إضافة ${e}`)).catch(e => K.bad(m, e.message));
    }),
    cmd("emojilist", null, ["ايموجيات-البوت"], async (c, m) => { const l = await c.application.emojis.fetch().catch(() => null); K.info(m, l && l.size ? [...l.values()].map(e => `${e} \`${e.name}\``).join("\n").slice(0, 3900) : "ما فيه إيموجيات للبوت.", "إيموجيات البوت"); }),
    cmd("stickers", null, ["ملصقات"], async (c, m) => { const l = [...m.guild.stickers.cache.values()]; if (!l.length) return K.info(m, "ما فيه ملصقات."); K.info(m, l.slice(0, 40).map(s => `• [${s.name}](${s.url})`).join("\n"), `🏷 الملصقات (${l.length})`); }),

    // ───── أدوات ─────
    cmd("roll", null, ["قرعة", "رقم"], async (c, m, a) => {
        const items = a.join(" ").split(/[|،,]/).map(x => x.trim()).filter(Boolean);
        if (items.length > 1) return K.info(m, `🎲 **${items[Math.floor(Math.random() * items.length)]}**`, "القرعة");
        const n = Math.min(1e9, Math.max(2, parseInt(a[0]) || 100)); K.info(m, `🎲 **${1 + Math.floor(Math.random() * n)}** (من ${n})`, "رقم عشوائي");
    }),
    cmd("say", "MANAGE_MESSAGES", ["قول", "كرر"], async (c, m, a) => { const t = a.join(" ").trim(); if (!t) return; await m.channel.send({ content: t.slice(0, 1900), allowedMentions: { parse: [] } }); m.delete().catch(() => {}); }),
    cmd("msg", "MANAGE_MESSAGES", ["رسالة", "خاص"], async (c, m, a) => {
        const ch = m.mentions.channels.first(), t = await K.getMember(m, a[0]), text = a.slice(1).join(" ").trim(); if (!text) return K.bad(m, "msg @عضو|#روم النص");
        if (ch && /^<#/.test(a[0])) return ch.send({ content: text.slice(0, 1900), allowedMentions: { parse: [] } }).then(() => K.ok(m, "انرسلت.")).catch(e => K.bad(m, e.message));
        if (!t) return K.bad(m, "منشن عضو أو روم."); t.send({ content: text.slice(0, 1900) }).then(() => K.ok(m, `انرسلت لـ ${t}`)).catch(() => K.bad(m, "خاصه مقفول."));
    }),
    cmd("link", "CREATE_INSTANT_INVITE", ["رابط", "دعوة"], async (c, m) => { const inv = await m.channel.createInvite({ maxAge: 0, maxUses: 0, reason: m.author.tag }).catch(() => null); if (!inv) return K.bad(m, "ما أقدر أسوي رابط."); K.info(m, inv.url, "🔗 رابط السيرفر"); }),
    cmd("screen", null, ["سكرين", "لقطة"], async (c, m, a) => {
        const u = url(a[0]); if (!u) return K.bad(m, "screen https://example.com");
        try { const h = new URL(u).hostname; if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h)) return K.bad(m, "رابط غير مسموح."); } catch { return K.bad(m, "رابط غلط."); }
        embedImg(m, "📸 لقطة شاشة", `https://image.thum.io/get/width/1280/crop/720/${u}`, u);
    }),
    cmd("image", "MANAGE_MESSAGES", ["صورة-ارسال"], async (c, m, a) => { const u = imgOf(m, a); if (!u) return K.bad(m, "image رابط أو أرفق صورة"); await m.channel.send({ embeds: [new K.MessageEmbed().setColor("#2b2d31").setImage(u)] }); m.delete().catch(() => {}); }),
    cmd("circle", null, ["تدوير"], async (c, m, a) => {
        if (!CV) return K.bad(m, "مكتبة الصور غير متوفرة."); const t = m.mentions.members.first(), u = imgOf(m, a) || (t || m.member).displayAvatarURL({ extension: "png", size: 512 });
        try { const img = await CV.loadImage(Buffer.from(await (await fetch(u)).arrayBuffer())), S = 512, cv = CV.createCanvas(S, S), x = cv.getContext("2d"); x.beginPath(); x.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2); x.clip(); x.drawImage(img, 0, 0, S, S); K.rep(m, { files: [{ attachment: cv.toBuffer("image/png"), name: "circle.png" }] }); } catch (e) { K.bad(m, "فشل: " + e.message); }
    }),
    cmd("edit-image", null, ["تعديل-صورة"], async (c, m, a) => {
        if (!CV) return K.bad(m, "مكتبة الصور غير متوفرة."); const fx = (a[0] || "").toLowerCase(), list = ["gray", "invert", "blur", "flip", "sepia", "bright"]; if (!list.includes(fx)) return K.bad(m, `edit-image ${list.join("|")} [رابط/@عضو] (أو أرفق صورة)`);
        const t = m.mentions.members.first(), u = imgOf(m, a.slice(1)) || (t || m.member).displayAvatarURL({ extension: "png", size: 512 });
        try {
            const img = await CV.loadImage(Buffer.from(await (await fetch(u)).arrayBuffer())), k = Math.min(1, 800 / Math.max(img.width, img.height)), W = Math.round(img.width * k), H = Math.round(img.height * k), cv = CV.createCanvas(W, H), x = cv.getContext("2d");
            if (fx === "blur") x.filter = "blur(6px)"; if (fx === "bright") x.filter = "brightness(1.4)"; if (fx === "sepia") x.filter = "sepia(1)";
            if (fx === "flip") { x.translate(W, 0); x.scale(-1, 1); } x.drawImage(img, 0, 0, W, H);
            if (fx === "gray" || fx === "invert") { const d = x.getImageData(0, 0, W, H), p = d.data; for (let i = 0; i < p.length; i += 4) { if (fx === "gray") { const g = 0.3 * p[i] + 0.59 * p[i + 1] + 0.11 * p[i + 2]; p[i] = p[i + 1] = p[i + 2] = g; } else { p[i] = 255 - p[i]; p[i + 1] = 255 - p[i + 1]; p[i + 2] = 255 - p[i + 2]; } } x.putImageData(d, 0, 0); }
            K.rep(m, { files: [{ attachment: cv.toBuffer("image/png"), name: "edit.png" }] });
        } catch (e) { K.bad(m, "فشل: " + e.message); }
    }),
    cmd("advice", null, ["نصيحة", "نصائح"], async (c, m) => K.info(m, ADVICE[Math.floor(Math.random() * ADVICE.length)], "💡 نصيحة")),
    cmd("change", "MANAGE_NICKNAMES", ["تغيير"], async (c, m, a) => { const t = await K.getMember(m, a[0]); const n = a.slice(1).join(" ").trim(); if (!t || !K.canTarget(m, t) || !n) return K.bad(m, "change @عضو الاسم_الجديد"); await t.setNickname(n.slice(0, 32)).then(() => K.ok(m, "تم.")).catch(e => K.bad(m, e.message)); }),

    // ───── الدعوات ─────
    cmd("myinv", null, ["دعواتي"], async (c, m, a) => { const t = await memberOrSelf(m, a), x = (Pro.get(`invs_${m.guild.id}`) || {})[t.id] || { joins: 0, left: 0 }; K.info(m, `✅ دعوات: **${x.joins}**\n🚪 غادروا: **${x.left || 0}**\n📈 الصافي: **${x.joins - (x.left || 0)}**`, `📨 دعوات ${t.displayName}`); }),
    cmd("topinv", null, ["top-invites", "topinvites", "توب-الدعوات"], async (c, m) => {
        const l = Object.entries(Pro.get(`invs_${m.guild.id}`) || {}).map(([id, v]) => ({ id, n: v.joins - (v.left || 0) })).sort((a, b) => b.n - a.n).slice(0, 10);
        K.info(m, l.map((x, i) => `**${i + 1}.** <@${x.id}> — ${x.n}`).join("\n") || "ما فيه بيانات دعوات بعد.", "📨 توب الدعوات");
    }),

    // ───── الذكاء الاصطناعي ─────
    cmd("ai", null, ["ذكاء", "اسأل"], async (c, m, a) => {
        const q = a.join(" ").trim(); if (!q) return K.bad(m, "ai سؤالك"); const cfg = Pro.get(`ai_${m.guild.id}`) || {};
        await m.channel.sendTyping().catch(() => {});
        try { const r = await aiAsk(cfg.prompt || "أنت مساعد ودود في سيرفر ديسكورد. جاوب بالعربية باختصار.", q); K.rep(m, { content: r.slice(0, 1900) }); } catch (e) { K.bad(m, e.message); }
    }),
    cmd("aiset", "ADMINISTRATOR", ["اعدادات-الذكاء"], async (c, m, a) => {
        const k = `ai_${m.guild.id}`, cfg = Pro.get(k) || {}, sub = (a[0] || "").toLowerCase();
        if (sub === "channel") { const ch = K.getChannel(m, a[1]) || m.channel; cfg.channel = ch.id; Pro.set(k, cfg); return K.ok(m, `سيرد البوت بالذكاء الاصطناعي على كل رسالة في ${ch}`); }
        if (sub === "prompt") { cfg.prompt = a.slice(1).join(" ").slice(0, 1500); Pro.set(k, cfg); return K.ok(m, "تم تعيين شخصية البوت."); }
        if (sub === "off") { Pro.delete(k); return K.ok(m, "تم إيقاف الذكاء الاصطناعي التلقائي."); }
        K.info(m, `الروم: ${cfg.channel ? `<#${cfg.channel}>` : "—"}\nالشخصية: ${cfg.prompt || "افتراضية"}\nالمفتاح: ${process.env.ANTHROPIC_API_KEY ? "✅ موجود" : "❌ ضيف ANTHROPIC_API_KEY"}\n\n\`aiset channel #روم\` • \`aiset prompt النص\` • \`aiset off\``, "🤖 إعدادات الذكاء الاصطناعي");
    }),
    cmd("welcome", null, ["ترحيب"], async (c, m) => K.info(m, `إعداد الترحيب وتصميم البنر من الداشبورد:\n${process.env.RENDER_EXTERNAL_URL || "رابط الاستضافة"}\nقسم **الترحيب** ← **تصميم البنر**.`, "👋 الترحيب"))
];
module.exports.aiAsk = aiAsk;
