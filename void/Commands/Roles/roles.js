// أوامر الرتب: إنشاء/إعطاء/سحب، رتب تلقائية، رياكشن رول، رتب شخصية، ولوحة الألوان
const K = require("../../utils/kit");
const { Pro } = K;
const { ActionRowBuilder, StringSelectMenuBuilder } = require("../../compat");

const cmd = (name, perm, aliases, run, directory = "Roles") => ({ name, aliases, directory, run: async (client, m, a) => { if (perm && !K.has(m, perm)) return; return run(client, m, a); } });
const canGive = (m, role) => role && !role.managed && role.id !== m.guild.id && (K.isOwner(m) || m.member.roles.highest.position > role.position) && role.position < m.guild.members.me.roles.highest.position;
const noRole = m => K.bad(m, "ما أقدر أتعامل مع هذي الرتبة (أعلى منك أو من البوت، أو رتبة بوت).");
const hex = s => (/^#?[0-9a-f]{6}$/i.test(s || "") ? "#" + s.replace("#", "") : null);
const eachMember = async (m, role, fn, filter = x => !x.user.bot) => {
    const all = await m.guild.members.fetch(); let n = 0;
    for (const mem of all.filter(filter).values()) { if (await fn(mem).then(() => true).catch(() => false)) n++; await K.sleep(350); }
    return n;
};

// ───── رتب الألوان ─────
const colorsKey = g => `colors_${g}`;
const getColors = g => (Pro.get(colorsKey(g)) || []);
const PALETTE = ["#e74c3c", "#e67e22", "#f1c40f", "#2ecc71", "#1abc9c", "#3498db", "#9b59b6", "#e91e63", "#ff7675", "#fdcb6e", "#55efc4", "#74b9ff", "#a29bfe", "#fd79a8", "#ffffff", "#b2bec3", "#636e72", "#2d3436", "#00cec9", "#6c5ce7"];
async function paletteImage(guild) {
    let CV; try { CV = require("@napi-rs/canvas"); } catch { return null; }
    const list = getColors(guild.id).map(id => guild.roles.cache.get(id)).filter(Boolean); if (!list.length) return null;
    const cols = 5, rows = Math.ceil(list.length / cols), w = 170, h = 90, c = CV.createCanvas(cols * w + 20, rows * h + 20), x = c.getContext("2d");
    x.fillStyle = "#111214"; x.fillRect(0, 0, c.width, c.height);
    list.forEach((r, i) => { const px = 10 + (i % cols) * w, py = 10 + Math.floor(i / cols) * h; x.fillStyle = r.hexColor === "#000000" ? "#555" : r.hexColor; x.beginPath(); x.roundRect ? x.roundRect(px, py, w - 10, h - 10, 14) : x.rect(px, py, w - 10, h - 10); x.fill(); x.fillStyle = "#fff"; x.shadowColor = "#000"; x.shadowBlur = 6; x.font = "bold 30px Cairo, CairoLat, sans-serif"; x.fillText(String(i + 1), px + 14, py + 40); x.font = "16px Cairo, CairoAr, sans-serif"; x.fillText(r.name.slice(0, 16), px + 14, py + 64); x.shadowBlur = 0; });
    return c.toBuffer("image/png");
}
async function showColors(m) {
    const list = getColors(m.guild.id).map(id => m.guild.roles.cache.get(id)).filter(Boolean);
    if (!list.length) return K.bad(m, "ما فيه رتب ألوان. أنشئها بـ: creatcolors");
    const img = await paletteImage(m.guild).catch(() => null);
    const e = K.emb("#2b2d31", "اكتب `color رقم` لاختيار لون، أو `color off` لإزالته.\n\n" + list.map((r, i) => `**${i + 1}.** ${r} \`${r.hexColor}\``).join("\n"), "🎨 الألوان");
    if (img) { e.setImage("attachment://colors.png"); return K.rep(m, { embeds: [e], files: [{ attachment: img, name: "colors.png" }] }); }
    K.rep(m, { embeds: [e] });
}

module.exports = [
    cmd("addrole", "MANAGE_ROLES", ["انشاء-رول"], async (c, m, a) => {
        const col = hex(a[a.length - 1]), name = (col ? a.slice(0, -1) : a).join(" ").trim(); if (!name) return K.bad(m, "addrole الاسم [#لون]");
        const r = await m.guild.roles.create({ name: name.slice(0, 100), color: col || undefined, reason: m.author.tag }).catch(e => K.bad(m, e.message)); if (r) K.ok(m, `تم إنشاء ${r}`);
    }),
    cmd("role", "MANAGE_ROLES", ["رول", "اعطاء-رول"], async (c, m, a) => {
        const t = await K.getMember(m, a[0]), r = K.getRole(m, a.slice(1).join(" ")) || m.mentions.roles.first(); if (!t || !r) return K.bad(m, "role @عضو @رتبة");
        if (!canGive(m, r)) return noRole(m);
        const has = t.roles.cache.has(r.id); await (has ? t.roles.remove(r) : t.roles.add(r)).then(() => K.ok(m, has ? `تم سحب ${r} من ${t}` : `تم إعطاء ${r} لـ ${t}`)).catch(e => K.bad(m, e.message));
    }),
    cmd("roleremove", "MANAGE_ROLES", ["سحب-رول"], async (c, m, a) => {
        const t = await K.getMember(m, a[0]), r = K.getRole(m, a.slice(1).join(" ")) || m.mentions.roles.first(); if (!t || !r) return K.bad(m, "roleremove @عضو @رتبة");
        if (!canGive(m, r)) return noRole(m); await t.roles.remove(r).then(() => K.ok(m, `تم سحب ${r} من ${t}`)).catch(e => K.bad(m, e.message));
    }),
    cmd("roleall", "ADMINISTRATOR", ["allrole", "رول-للكل"], async (c, m, a) => {
        const r = m.mentions.roles.first() || K.getRole(m, a.filter(x => !["add", "remove", "bots", "humans"].includes(x)).join(" ")); if (!r || !canGive(m, r)) return K.bad(m, "roleall @رتبة [add|remove] [bots|humans]");
        const remove = a.includes("remove"), only = a.includes("bots") ? x => x.user.bot : a.includes("humans") ? x => !x.user.bot : () => true;
        const wait = await K.rep(m, { embeds: [K.emb("#f1c40f", "⏳ جاري التنفيذ... (قد ياخذ وقت)")] });
        const n = await eachMember(m, r, mem => (remove ? (mem.roles.cache.has(r.id) ? mem.roles.remove(r) : Promise.reject()) : (!mem.roles.cache.has(r.id) ? mem.roles.add(r) : Promise.reject())), only);
        K.ok(m, `${remove ? "تم سحب" : "تم إعطاء"} ${r} ${remove ? "من" : "لـ"} ${n} عضو.`); wait && wait.delete().catch(() => {});
    }),
    cmd("srole", null, ["معلومات-رول"], async (c, m, a) => {
        const r = m.mentions.roles.first() || K.getRole(m, a.join(" ")); if (!r) return K.bad(m, "srole @رتبة");
        K.rep(m, { embeds: [new K.MessageEmbed().setColor(r.color || "#2b2d31").setTitle(r.name).addFields({ name: "الآيدي", value: r.id, inline: true }, { name: "اللون", value: r.hexColor, inline: true }, { name: "الأعضاء", value: String(r.members.size), inline: true }, { name: "أُنشئت", value: `<t:${K.unix(r.createdAt)}:R>`, inline: true }, { name: "منفصلة", value: r.hoist ? "نعم" : "لا", inline: true }, { name: "منشن", value: r.mentionable ? "نعم" : "لا", inline: true })] });
    }),
    cmd("showmembers", null, ["اعضاء-الرول"], async (c, m, a) => {
        const r = m.mentions.roles.first() || K.getRole(m, a.join(" ")); if (!r) return K.bad(m, "showmembers @رتبة"); await m.guild.members.fetch().catch(() => {});
        const l = [...r.members.values()]; K.info(m, l.slice(0, 60).map(x => `• ${x}`).join("\n") || "ما فيه أعضاء.", `👥 ${r.name} (${l.length})`);
    }),
    cmd("dsrole", "MANAGE_ROLES", ["حذف-رول"], async (c, m, a) => {
        const r = m.mentions.roles.first() || K.getRole(m, a.join(" ")); if (!r) return K.bad(m, "dsrole @رتبة"); if (!canGive(m, r)) return noRole(m);
        await r.delete(m.author.tag).then(() => K.ok(m, `تم حذف الرتبة **${r.name}**`)).catch(e => K.bad(m, e.message));
    }),
    cmd("editrole", "MANAGE_ROLES", ["تعديل-رول"], async (c, m, a) => {
        const r = m.mentions.roles.first() || K.getRole(m, a[0]); if (!r || !canGive(m, r)) return K.bad(m, "editrole @رتبة name الاسم | color #لون | hoist | mention");
        const sub = a.find((x, i) => i > 0 && ["name", "color", "hoist", "mention"].includes(x)), rest = a.slice(a.indexOf(sub) + 1).join(" ");
        if (sub === "name" && rest) await r.setName(rest.slice(0, 100)); else if (sub === "color" && hex(rest)) await r.setColor(hex(rest)); else if (sub === "hoist") await r.setHoist(!r.hoist); else if (sub === "mention") await r.setMentionable(!r.mentionable); else return K.bad(m, "editrole @رتبة name الاسم | color #لون | hoist | mention");
        K.ok(m, "تم التعديل.");
    }),
    cmd("aremove", "ADMINISTRATOR", ["ازالة-كل-الرتب"], async (c, m, a) => {
        const t = await K.getMember(m, a[0]); if (!t || !K.canTarget(m, t)) return K.bad(m, "aremove @عضو");
        await t.roles.set(t.roles.cache.filter(r => r.managed).map(r => r.id)).then(() => K.ok(m, `تم سحب كل رتب ${t}`)).catch(e => K.bad(m, e.message));
    }),

    // ───── رتبة تلقائية ─────
    cmd("autorole", "MANAGE_ROLES", ["رول-تلقائي"], async (c, m, a) => {
        const r = m.mentions.roles.first() || K.getRole(m, a.filter(x => x !== "bots" && x !== "humans").join(" ")); const k = `autorole_${m.guild.id}`, cfg = Pro.get(k) || { humans: [], bots: [] };
        if (!r) return K.info(m, `**للأعضاء:** ${cfg.humans.map(x => `<@&${x}>`).join(" ") || "—"}\n**للبوتات:** ${cfg.bots.map(x => `<@&${x}>`).join(" ") || "—"}\n\nلإضافة: autorole @رتبة [bots]`, "الرتب التلقائية");
        if (!canGive(m, r)) return noRole(m); const list = a.includes("bots") ? cfg.bots : cfg.humans; if (!list.includes(r.id)) list.push(r.id); Pro.set(k, cfg); K.ok(m, `سيتم إعطاء ${r} ${a.includes("bots") ? "للبوتات" : "للأعضاء"} الجدد.`);
    }),
    cmd("daorole", "MANAGE_ROLES", ["حذف-رول-تلقائي"], async (c, m, a) => {
        const r = m.mentions.roles.first() || K.getRole(m, a.join(" ")), k = `autorole_${m.guild.id}`, cfg = Pro.get(k) || { humans: [], bots: [] };
        if (!r) { Pro.delete(k); return K.ok(m, "تم حذف كل الرتب التلقائية."); } cfg.humans = cfg.humans.filter(x => x !== r.id); cfg.bots = cfg.bots.filter(x => x !== r.id); Pro.set(k, cfg); K.ok(m, "تم الحذف.");
    }),

    // ───── رياكشن رول ─────
    cmd("setreactionrole", "MANAGE_ROLES", ["رياكشن-رول"], async (c, m, a) => {
        const ch = m.mentions.channels.first() || m.channel, id = a.find(x => /^\d{15,25}$/.test(x)), em = a.find(x => !/^\d{15,25}$/.test(x) && !/^<[#@]/.test(x)), r = m.mentions.roles.first();
        if (!id || !em || !r) return K.bad(m, "setreactionrole آيدي_الرسالة 😀 @رتبة  (نفس الروم، أو منشن الروم)");
        if (!canGive(m, r)) return noRole(m); const msg = await ch.messages.fetch(id).catch(() => null); if (!msg) return K.bad(m, "ما لقيت الرسالة.");
        const k = `rr_${m.guild.id}`, all = Pro.get(k) || []; const key = (em.match(/\d{15,25}/) || [em])[0];
        all.push({ ch: ch.id, msg: id, emoji: key, role: r.id }); Pro.set(k, all.filter((x, i, arr) => arr.findIndex(y => y.msg === x.msg && y.emoji === x.emoji) === i).slice(-200));
        await msg.react(em).catch(() => {}); K.ok(m, `من يضغط ${em} ياخذ ${r}`);
    }),
    cmd("rereactrole", "MANAGE_ROLES", ["اعادة-رياكشن-رول"], async (c, m) => {
        let n = 0; for (const x of Pro.get(`rr_${m.guild.id}`) || []) { const ch = m.guild.channels.cache.get(x.ch), msg = ch && await ch.messages.fetch(x.msg).catch(() => null); if (msg) { await msg.react(x.emoji).then(() => n++).catch(() => {}); await K.sleep(300); } }
        K.ok(m, `تمت إعادة ${n} رياكشن.`);
    }),

    // ───── رتب شخصية ─────
    cmd("r", "MANAGE_ROLES", ["رول-شخصي"], async (c, m, a) => {
        const k = `personal_${m.guild.id}`, map = Pro.get(k) || {};
        if (a[0] === "all") { let n = 0; for (const [uid, rid] of Object.entries(map)) { const r = m.guild.roles.cache.get(rid); if (r) await r.delete("r all").then(() => n++).catch(() => {}); } Pro.delete(k); return K.ok(m, `تم حذف ${n} رتبة شخصية.`); }
        const t = await K.getMember(m, a[0]); if (!t) return K.bad(m, "r @عضو [الاسم] [#لون]  |  r all");
        if (map[t.id] && m.guild.roles.cache.has(map[t.id])) { await m.guild.roles.cache.get(map[t.id]).delete().catch(() => {}); delete map[t.id]; Pro.set(k, map); return K.ok(m, `تم حذف الرتبة الشخصية لـ ${t}`); }
        const col = hex(a[a.length - 1]), name = (col ? a.slice(1, -1) : a.slice(1)).join(" ").trim() || t.displayName;
        const r = await m.guild.roles.create({ name: name.slice(0, 100), color: col || undefined, reason: "رتبة شخصية" }).catch(e => K.bad(m, e.message)); if (!r) return;
        await t.roles.add(r).catch(() => {}); map[t.id] = r.id; Pro.set(k, map); K.ok(m, `تم إنشاء ${r} لـ ${t}`);
    }),
    cmd("myrole", null, ["رتبتي"], async (c, m, a) => {
        const k = `personal_${m.guild.id}`, map = Pro.get(k) || {}, r = m.guild.roles.cache.get(map[m.author.id]);
        if (!r) return K.bad(m, "ما عندك رتبة شخصية. اطلبها من الإدارة.");
        if (a[0] === "name" && a[1]) { await r.setName(a.slice(1).join(" ").slice(0, 100)); return K.ok(m, "تم تغيير الاسم."); }
        if (a[0] === "color" && hex(a[1])) { await r.setColor(hex(a[1])); return K.ok(m, "تم تغيير اللون."); }
        K.info(m, `رتبتك: ${r}\nالاسم: \`myrole name الاسم\`\nاللون: \`myrole color #ff0000\``, "🎭 رتبتك الشخصية");
    }),

    // ───── الألوان ─────
    cmd("creatcolors", "MANAGE_ROLES", ["انشاء-الوان"], async (c, m, a) => {
        const n = Math.min(20, Math.max(1, parseInt(a[0]) || 10)), list = getColors(m.guild.id);
        const wait = await K.rep(m, { embeds: [K.emb("#f1c40f", "⏳ جاري إنشاء الألوان...")] });
        for (let i = 0; i < n; i++) { const r = await m.guild.roles.create({ name: `${list.length + 1}`, color: PALETTE[i % PALETTE.length], reason: "رتب الألوان" }).catch(() => null); if (r) list.push(r.id); await K.sleep(400); }
        Pro.set(colorsKey(m.guild.id), list); wait && wait.delete().catch(() => {}); K.ok(m, `تم إنشاء ${n} لون. اكتب \`colors\` لعرضها.`);
    }),
    cmd("setcolors", "MANAGE_ROLES", ["تعيين-الالوان"], async (c, m) => { const l = [...m.mentions.roles.values()].map(r => r.id); if (!l.length) return K.bad(m, "setcolors @رتبة1 @رتبة2 ..."); Pro.set(colorsKey(m.guild.id), l); K.ok(m, `تم تعيين ${l.length} رتبة ألوان.`); }),
    cmd("colors", null, ["cols", "mcolors", "الالوان"], async (c, m) => showColors(m)),
    cmd("ctcolors", "MANAGE_ROLES", ["قائمة-الالوان-الدائمة"], async (c, m) => {
        const list = getColors(m.guild.id).map(id => m.guild.roles.cache.get(id)).filter(Boolean).slice(0, 25); if (!list.length) return K.bad(m, "ما فيه رتب ألوان.");
        const menu = new StringSelectMenuBuilder().setCustomId("colorpick").setPlaceholder("🎨 اختر لونك").addOptions([{ label: "إزالة اللون", value: "off", emoji: "❌" }, ...list.slice(0, 24).map((r, i) => ({ label: `${i + 1}. ${r.name}`.slice(0, 100), value: r.id, description: r.hexColor }))]);
        const img = await paletteImage(m.guild).catch(() => null);
        await m.channel.send({ embeds: [K.emb("#2b2d31", "اختر لونك من القائمة تحت.", "🎨 الألوان")], components: [new ActionRowBuilder().addComponents(menu)], ...(img ? { files: [{ attachment: img, name: "colors.png" }] } : {}) }); m.delete().catch(() => {});
    }),
    cmd("color", null, ["لون"], async (c, m, a) => {
        const list = getColors(m.guild.id); if (!list.length) return K.bad(m, "ما فيه رتب ألوان.");
        if (!a[0]) return showColors(m);
        for (const id of list) if (m.member.roles.cache.has(id)) await m.member.roles.remove(id).catch(() => {});
        if (a[0] === "off") return K.ok(m, "تم إزالة لونك.");
        const r = m.guild.roles.cache.get(list[parseInt(a[0]) - 1]); if (!r) return K.bad(m, "رقم لون غلط.");
        await m.member.roles.add(r).then(() => K.ok(m, `صار لونك ${r}`)).catch(e => K.bad(m, e.message));
    })
];
