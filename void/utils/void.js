// ═══════════════════════════════════════════════
//  Void • أدوات الهوية (الاسم، الصورة، الإيموجيات)
// ═══════════════════════════════════════════════
const fs = require("fs");
const path = require("path");
const { AsyncLocalStorage } = require("async_hooks");
const Discord = require("../compat");
const Pro = require("../prodb");

const ROOT = path.join(__dirname, "..");
const BRAND = "NOVA STORE";
const COLOR = "#2b2d31";

const BANNER_NAME = "brand-banner.jpg";
const BANNER_PATH = path.join(ROOT, "..", "assets", "banner.jpg");
const ICON_PATH = path.join(ROOT, "..", "assets", "logo.png");
const EMOJI_DIR = path.join(ROOT, "emojis");

// مفاتيح الإيموجيات = أسماء ملفات emojis/void_<key>.png
// كل ملف في void/emojis يصير إيموجي: void_<key>.png (ثابت) أو void_<key>.gif (متحرك) — المفتاح <key>
const EMOJI_ITEMS = (() => {
    try {
        return fs.readdirSync(EMOJI_DIR).filter(f => /^void_[\w]+\.(png|gif)$/.test(f)).sort()
            .map(f => ({ key: f.replace(/^void_/, "").replace(/\.(png|gif)$/, ""), name: f.replace(/\.(png|gif)$/, ""), file: path.join(EMOJI_DIR, f), animated: f.endsWith(".gif") }));
    } catch { return []; }
})();
const EMOJI_KEYS = EMOJI_ITEMS.map(x => x.key);
const EMOJI_DESIGN = "nova-store-2"; // غيّرها لو غيّرت تصميم الإيموجيات ليتم استبدالها تلقائياً  // حد ديسكورد 50 إيموجي للسيرفر بدون بوست


// رموز زخرفية (مو إيموجي) تظهر في النص لو الإيموجيات المخصصة ما انرفعت
const FALLBACK = {
    tkgold: "❖", tkcrown: "♛", lock: "⌂", adduser: "＋", rmuser: "－", rename: "✎", note: "▤", transcript: "▼", priority: "△", support: "◈", verified: "✔", panel: "▦", sparkle: "✦", save: "▣", void: "◉", claim: "❖", transfer: "⇄", call: "◈", close: "✕",
    accept: "✔", reject: "✖", ticket: "❖", user: "◈", type: "❖",
    clock: "◷", star: "✦", history: "❏",
    crown: "♛", heart: "♥", shield: "⛨", unlock: "◌", ban: "⦸", kick: "⇥", mic: "◖", micoff: "◗", speaker: "◁", chat: "▤", gear: "✲", link: "∞", warning: "△", info: "ⓘ", bolt: "ϟ", fire: "✺", gem: "◆", trophy: "♔", gift: "❀", flag: "⚑", pin: "⌖", search: "⌕", trash: "⌫", edit: "✎", image: "▣", folder: "▭", globe: "◍", calendar: "▦", eye: "◉", eyeoff: "◎", levelup: "⇧", plus: "＋", minus: "－", bot: "▣", medal: "✪"
};

// ───────────── الإيموجيات المخصصة ─────────────
const emojiKey = guildId => `void_emojis_${guildId}`;

function emojiMap(guildId) {
    return Pro.get(emojiKey(guildId)) || {};
}

// للنص داخل الإمبد (قيمة حقل / وصف)
function icon(guild, key) {
    const map = emojiMap(guild.id);
    return map[key] || FALLBACK[key] || "";
}

// للأزرار والقوائم: إيموجي مخصص فقط، وإلا بدون إيموجي
function btnEmoji(guild, key) {
    return emojiMap(guild.id)[key] || null;
}

// رفع الإيموجيات كإيموجيات للتطبيق (Application Emojis): ما تاخذ من خانات السيرفر (50) وتشتغل في الأزرار والرسائل،
// ثابتة ومتحركة. replace=true يحذف القديم ويرفع التصميم الجديد.
async function uploadEmojis(guild, { replace = false } = {}) {
    const map = { ...emojiMap(guild.id) };
    const report = { created: [], existed: [], failed: [] };
    const app = guild.client.application;
    await app.fetch().catch(() => {});
    const have = await app.emojis.fetch().catch(() => null);
    if (!have) { report.failed.push("تعذّر قراءة إيموجيات التطبيق"); return report; }

    for (const it of EMOJI_ITEMS) {
        let emoji = have.find(e => e.name === it.name);
        if (emoji && replace) { await emoji.delete().catch(() => {}); emoji = null; }
        if (emoji) { report.existed.push(it.name); }
        else {
            try { emoji = await app.emojis.create({ attachment: it.file, name: it.name }); report.created.push(it.name); }
            catch (error) { report.failed.push(`${it.name} (${String(error.message).slice(0, 60)})`); continue; }
        }
        map[it.key] = emoji.toString();
    }
    Pro.set(emojiKey(guild.id), map);
    return report;
}

// عند التشغيل: لو تصميم الإيموجيات تغيّر أو فيه إيموجي ناقص نرفعها تلقائي
async function ensureEmojis(client) {
    const g = client.guilds.cache.get(process.env.GUILD_ID); if (!g) return;
    const replace = Pro.get("void_emoji_design") !== EMOJI_DESIGN, map = emojiMap(g.id);
    if (!replace && EMOJI_ITEMS.every(x => map[x.key])) return;
    console.log(`[void] ${replace ? "استبدال" : "رفع"} الإيموجيات (${EMOJI_ITEMS.length})...`);
    const r = await uploadEmojis(g, { replace });
    if (!r.failed.length) Pro.set("void_emoji_design", EMOJI_DESIGN);
    console.log(`[void] إيموجيات: انضاف ${r.created.length} • موجود ${r.existed.length} • فشل ${r.failed.length}${r.failed.length ? " — " + r.failed.slice(0, 3).join(" | ") : ""}`);
}

// ───────────── البانر ─────────────
function bannerFile() {
    return fs.existsSync(BANNER_PATH)
        ? { attachment: BANNER_PATH, name: BANNER_NAME }
        : null;
}

// يجهز صورة (مسار مخصص أو البانر الافتراضي) → { file, url }
function pickImage(customPath) {
    if (customPath && fs.existsSync(customPath)) {
        const name = path.basename(customPath);
        return { file: { attachment: customPath, name }, url: `attachment://${name}` };
    }

    const file = bannerFile();
    return file ? { file, url: `attachment://${BANNER_NAME}` } : { file: null, url: null };
}

// ───────────── بانر تلقائي على إمبدات بعض الأوامر ─────────────
const als = new AsyncLocalStorage();

let bannerCommands = new Set();
try {
    const info = require(path.join(ROOT, "botinfo.json"));
    if (info.voidBanner && info.voidBanner.enabled !== false) {
        bannerCommands = new Set((info.voidBanner.commands || []).map(c => String(c).toLowerCase()));
    }
} catch {}

function injectBanner(payload) {
    if (!als.getStore()) return payload;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;

    const embeds = payload.embeds;
    if (!Array.isArray(embeds) || !embeds.length) return payload;

    const first = embeds[0];
    if (!first || first.image || (first.data && first.data.image)) return payload;
    if (!fs.existsSync(BANNER_PATH)) return payload;

    const url = `attachment://${BANNER_NAME}`;

    if (typeof first.setImage === "function") first.setImage(url);
    else first.image = { url };

    const files = Array.isArray(payload.files) ? payload.files.slice() : [];
    files.push({ attachment: BANNER_PATH, name: BANNER_NAME });

    return { ...payload, files };
}

let installed = false;

function installBannerPatch() {
    if (installed) return;
    installed = true;

    const patch = (proto, name) => {
        if (!proto || typeof proto[name] !== "function") return;
        const original = proto[name];

        proto[name] = function (options, ...rest) {
            return original.call(this, injectBanner(options), ...rest);
        };
    };

    patch(Discord.Message && Discord.Message.prototype, "reply");

    for (const key of ["TextChannel", "NewsChannel", "ThreadChannel"]) {
        if (Discord[key]) patch(Discord[key].prototype, "send");
    }
}

// يشغّل الأمر، ولو اسمه بالقائمة تنضاف له صورة Void تلقائياً
function runWithBanner(commandName, fn) {
    if (bannerCommands.has(String(commandName).toLowerCase())) {
        return als.run({ command: commandName }, fn);
    }
    return fn();
}

module.exports = {
    BRAND,
    COLOR,
    BANNER_NAME,
    BANNER_PATH,
    ICON_PATH,
    EMOJI_KEYS,
    ensureEmojis,
    icon,
    btnEmoji,
    uploadEmojis,
    bannerFile,
    pickImage,
    installBannerPatch,
    runWithBanner
};
