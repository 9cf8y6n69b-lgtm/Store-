// Void • اختصارات الأوامر الكاملة + بادئة اختيارية (! أو -)
const Pro = require("../prodb");

const key = g => `shortcuts_${g}`;
const all = g => Pro.get(key(g)) || {};
const PREFIX = /^[!\-.]+(?=\S)/;

function set(g, word, full) {
    const map = all(g);
    map[String(word).toLowerCase()] = String(full).trim();
    Pro.set(key(g), map);
}

function remove(g, word) {
    const map = all(g);
    const had = delete map[String(word).toLowerCase()];
    Pro.set(key(g), map);
    return had;
}

// يشيل البادئة ويفك الاختصار: "!ب @x سبام" -> "ban @x سبام"
function normalize(guildId, text) {
    let t = String(text || "").trim().replace(PREFIX, "");
    const cp = require("../prodb").get("bot_prefix");
    if (cp && t.startsWith(cp)) t = t.slice(cp.length).trim();
    const [first, ...rest] = t.split(/\s+/);
    const hit = first && all(guildId)[first.toLowerCase()];
    if (hit) t = `${hit} ${rest.join(" ")}`.trim();
    return t;
}

module.exports = { all, set, remove, normalize, PREFIX };
