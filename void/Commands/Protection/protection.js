// أوامر الحماية: anti*, حدود، قائمة الاستثناء، كلمات ممنوعة، نسخ احتياطي
const K = require("../../utils/kit");
const P = require("../../utils/prot");
const F = require("../../utils/filters");

const sec = (name, aliases, run) => ({ name, aliases, directory: "Protection", run: async (client, m, a) => { if (!K.has(m, "ADMINISTRATOR")) return; return run(client, m, a); } });
const line = (g, k) => { const s = P.get(g)[k]; return `${s.on ? "🟢" : "🔴"} **${k}** — ${P.NAMES[k]}${s.on ? ` (الحد ${s.limit}، العقوبة: ${P.PUNISH[s.punish]})` : ""}`; };
const statusText = g => {
    const s = P.get(g), r = s.rjoin;
    return Object.keys(P.NAMES).map(k => line(g, k)).concat([`${P.filterOn(g, "links") ? "🟢" : "🔴"} **antilink** — منع الروابط`, `${P.filterOn(g, "spam") ? "🟢" : "🔴"} **antispam** — منع السبام`, `${r.on ? "🟢" : "🔴"} **rjoin** — حماية الدخول الجماعي${r.on ? ` (${r.count} خلال ${r.seconds}ث)` : ""}`]).join("\n");
};
const setAll = (m, on, limit, punish) => { P.edit(m.guild.id, s => { for (const k of Object.keys(P.NAMES)) { s[k].on = on; if (limit) { s[k].limit = limit; s[k].punish = punish; } } s.rjoin.on = on; }); P.setFilter(m.guild.id, "links", on); P.setFilter(m.guild.id, "spam", on); };

const toggler = k => sec(k, [], async (c, m, a) => {
    const v = (a[0] || "").toLowerCase(), g = m.guild.id;
    const cur = k === "antilink" ? P.filterOn(g, "links") : k === "antispam" ? P.filterOn(g, "spam") : P.get(g)[k].on, on = v === "on" ? true : v === "off" ? false : !cur;
    if (k === "antilink") P.setFilter(g, "links", on); else if (k === "antispam") P.setFilter(g, "spam", on); else P.edit(g, s => { s[k].on = on; });
    K.ok(m, `${k} ${on ? "🟢 شغّال" : "🔴 متوقف"}`);
});

module.exports = [
    ...Object.keys(P.NAMES).concat(["antilink", "antispam"]).map(toggler),
    sec("unanti", ["ايقاف-حماية"], async (c, m, a) => { const k = (a[0] || "").toLowerCase(); if (k === "antilink") P.setFilter(m.guild.id, "links", false); else if (k === "antispam") P.setFilter(m.guild.id, "spam", false); else if (k === "rjoin") P.edit(m.guild.id, s => { s.rjoin.on = false; }); else if (P.NAMES[k]) P.edit(m.guild.id, s => { s[k].on = false; }); else return K.bad(m, "unanti <اسم الحماية>"); K.ok(m, `تم إيقاف ${k}`); }),
    sec("anti", ["الانتي"], async (c, m) => K.info(m, statusText(m.guild.id) + "\n\nللتبديل: اكتب اسم الحماية (مثل `anticreate`) أو `anticreate off`", "🛡 الحماية")),
    sec("status", ["حالة-الحماية"], async (c, m) => K.info(m, statusText(m.guild.id), "🛡 حالة الحماية")),
    sec("pslist", ["قائمة-الحماية"], async (c, m) => K.info(m, statusText(m.guild.id), "🛡 قائمة الحماية")),
    sec("protect", ["الحماية"], async (c, m) => K.info(m, statusText(m.guild.id) + "\n\n`aprot` تفعيل الكل • `dprot` إيقاف الكل\n`maxsec` أقصى حماية • `sechard` حماية قوية\n`setlimit <اسم> <عدد>` • `setrjoin <عدد> <ثواني>`\n`wantilist @عضو` استثناء • `word add كلمة`\nالإعدادات الكاملة من الداشبورد ← الفلاتر", "🛡 لوحة الحماية")),
    sec("setsecurity", ["اعداد-الحماية"], async (c, m, a) => { const k = (a[0] || "").toLowerCase(), p = (a[1] || "").toLowerCase(); if (!P.NAMES[k] || !P.PUNISH[p]) return K.info(m, `setsecurity <حماية> <عقوبة>\nالحمايات: ${Object.keys(P.NAMES).join("، ")}\nالعقوبات: ${Object.keys(P.PUNISH).join("، ")}`, "إعداد الحماية"); P.edit(m.guild.id, s => { s[k].punish = p; s[k].on = true; }); K.ok(m, `${k} ← ${P.PUNISH[p]} (مفعّلة)`); }),
    sec("setlimit", ["تعيين-الحد"], async (c, m, a) => { const k = (a[0] || "").toLowerCase(), n = parseInt(a[1]); if (!P.NAMES[k] || !(n >= 1 && n <= 20)) return K.bad(m, "setlimit <حماية> <1-20>"); P.edit(m.guild.id, s => { s[k].limit = n; }); K.ok(m, `حد ${k} = ${n} خلال دقيقة.`); }),
    sec("setrjoin", ["حماية-الدخول"], async (c, m, a) => {
        if (a[0] === "off") { P.edit(m.guild.id, s => { s.rjoin.on = false; }); return K.ok(m, "تم إيقاف حماية الدخول الجماعي."); }
        const n = parseInt(a[0]), sc = parseInt(a[1]); if (!(n >= 2 && sc >= 3)) return K.bad(m, "setrjoin <عدد> <ثواني>  |  setrjoin off"); P.edit(m.guild.id, s => { s.rjoin = { ...s.rjoin, on: true, count: n, seconds: sc }; }); K.ok(m, `إذا دخل ${n} خلال ${sc} ثانية يتم طردهم.`);
    }),
    sec("sloprot", ["حماية-السلو"], async (c, m, a) => { const on = a[0] === "off" ? false : true; P.edit(m.guild.id, s => { s.sloprot.on = on; }); K.ok(m, `حماية السلو مود ${on ? "🟢 شغّالة" : "🔴 متوقفة"}`); }),
    sec("aprot", ["تفعيل-الحماية"], async (c, m) => { setAll(m, true); K.ok(m, "تم تفعيل كل أنواع الحماية.\n" + statusText(m.guild.id)); }),
    sec("dprot", ["ايقاف-الحماية"], async (c, m) => { setAll(m, false); K.ok(m, "تم إيقاف كل أنواع الحماية."); }),
    sec("maxsec", ["اقصى-حماية"], async (c, m) => { setAll(m, true, 1, "ban"); K.ok(m, "🔒 أقصى حماية: كل الحمايات شغّالة بحد 1 وعقوبة الحظر."); }),
    sec("sechard", ["حماية-قوية"], async (c, m) => { setAll(m, true, 2, "strip"); K.ok(m, "🔒 حماية قوية: حد 2 وعقوبة سحب الرتب."); }),
    sec("wantilist", ["المستثنين"], async (c, m, a) => {
        const id = K.idOf(a[0]); const s = P.get(m.guild.id);
        if (!id) return K.info(m, s.wl.map(x => `<@${x}>`).join("\n") || "ما فيه مستثنين.\nللإضافة: `wantilist @عضو` (مرة ثانية للإزالة)", "قائمة المستثنين من الحماية");
        P.edit(m.guild.id, x => { const i = x.wl.indexOf(id); i >= 0 ? x.wl.splice(i, 1) : x.wl.push(id); }); K.ok(m, s.wl.includes(id) ? "تمت الإزالة." : `<@${id}> مستثنى من الحماية.`);
    }),

    // ───── كلمات ممنوعة (تربط بنظام الفلاتر) ─────
    { name: "word", aliases: ["كلمة"], directory: "Protection", run: async (c, m, a) => {
        if (!K.has(m, "MANAGE_MESSAGES")) return; const f = F.get(m.guild.id), sub = (a[0] || "").toLowerCase(), w = a.slice(1).join(" ").trim().toLowerCase();
        if (sub === "add" && w) { if (!f.words.list.includes(w)) f.words.list.push(w); f.words.enabled = true; F.save(m.guild.id, f); return K.ok(m, `تمت إضافة **${w}** (الفلتر شغّال).`); }
        if (sub === "remove" && w) { f.words.list = f.words.list.filter(x => x !== w); F.save(m.guild.id, f); return K.ok(m, "تم الحذف."); }
        K.info(m, "`word add كلمة` • `word remove كلمة` • `wordlist`", "الكلمات الممنوعة");
    } },
    { name: "wordlist", aliases: ["الكلمات-الممنوعة"], directory: "Protection", run: async (c, m) => { if (!K.has(m, "MANAGE_MESSAGES")) return; const f = F.get(m.guild.id); K.info(m, f.words.list.map(x => `• ${x}`).join("\n").slice(0, 3900) || "ما فيه كلمات.", `🚫 الكلمات الممنوعة (${f.words.list.length}) — الفلتر ${f.words.enabled ? "🟢" : "🔴"}`); } },

    // ───── نسخ احتياطي ─────
    sec("backup", ["نسخة-احتياطية"], async (c, m, a) => { const wait = await K.rep(m, { embeds: [K.emb("#f1c40f", "⏳ جاري أخذ النسخة...")] }); const r = await P.takeBackup(m.guild, { emojis: a[0] === "emojis" }).catch(e => K.bad(m, e.message)); wait && wait.delete().catch(() => {}); if (r) K.ok(m, `تم حفظ النسخة: ${r.roles} رتبة • ${r.channels} روم • ${r.emojis} إيموجي${a[0] === "emojis" ? "" : "\n(للإيموجيات اكتب: backup emojis)"}`); }),
    sec("restbackup", ["استرجاع-نسخة"], async (c, m, a) => {
        if (a[0] !== "confirm") { const b = P.getBackup(m.guild.id); return K.info(m, b ? `آخر نسخة: <t:${Math.floor(b.at / 1000)}:R>\nيسترجع الرتب والرومات المحذوفة (اللي مو موجودة بنفس الاسم).\nللتأكيد: \`restbackup confirm\`` : "ما فيه نسخة. اكتب `backup` أول.", "♻️ استرجاع نسخة"); }
        const wait = await K.rep(m, { embeds: [K.emb("#f1c40f", "⏳ جاري الاسترجاع...")] }); try { const r = await P.restoreBackup(m.guild); K.ok(m, `تم استرجاع ${r.roles} رتبة و ${r.chans} روم.`); } catch (e) { K.bad(m, e.message); } wait && wait.delete().catch(() => {});
    }),
    sec("restemoji", ["استرجاع-ايموجي"], async (c, m) => { const wait = await K.rep(m, { embeds: [K.emb("#f1c40f", "⏳ جاري الاسترجاع...")] }); try { K.ok(m, `تم استرجاع ${await P.restoreEmojis(m.guild)} إيموجي.`); } catch (e) { K.bad(m, e.message); } wait && wait.delete().catch(() => {}); })
];
