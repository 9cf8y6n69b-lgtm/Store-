// نظام الخبرة: شات + فويس، لفلات، مكافآت رتب، وكرت لفل أب
const path = require("path");
const Pro = require("../prodb");

const CHAT_XP = { cooldownMs: 60 * 1000, min: 15, max: 25 };
const VOICE_XP_PER_MINUTE = 10;

const cfgKey = g => `xp_cfg_${g}`, usersKey = g => `xp_users_${g}`;
const getCfg = g => ({ enabled: true, levelChannelId: null, rewards: [], ...(Pro.get(cfgKey(g)) || {}) });
const setCfg = (g, patch) => Pro.set(cfgKey(g), { ...getCfg(g), ...patch });

// خبرة الوصول للفل n (تراكمي): 5n² + 50n + 100 لكل لفل
const need = l => 5 * l * l + 50 * l + 100;
function levelOf(xp) { let l = 0, left = xp; while (left >= need(l)) { left -= need(l); l++; } return { level: l, into: left, next: need(l) }; }

const isEnabled = g => getCfg(g).enabled !== false;
const getLevelChannelId = g => getCfg(g).levelChannelId || null;
const setLevelChannel = (g, id) => setCfg(g, { levelChannelId: id || null });
const setEnabled = (g, on) => setCfg(g, { enabled: !!on });
const getRoleRewards = g => (getCfg(g).rewards || []).map(r => ({ level: Number(r.level), roleId: r.roleId })).filter(r => r.level > 0 && r.roleId);
const setRoleRewards = (g, list) => setCfg(g, { rewards: list.slice(0, 25) });

const EMPTY = { xp: 0, chatXp: 0, voiceXp: 0, messages: 0, voiceSeconds: 0, lastMsg: 0 };
function getUser(g, u) {
    const rec = { ...EMPTY, ...((Pro.get(usersKey(g)) || {})[u] || {}) };
    return { ...rec, ...levelOf(rec.xp) };
}

function addXp(g, u, type, gain, extra = {}) {
    const all = Pro.get(usersKey(g)) || {};
    const rec = { ...EMPTY, ...(all[u] || {}), ...extra };
    const before = levelOf(rec.xp).level;
    rec.xp += gain;
    if (type === "chat") rec.chatXp += gain; else rec.voiceXp += gain;
    all[u] = rec;
    Pro.set(usersKey(g), all);
    const after = levelOf(rec.xp).level;
    return { leveledUp: after > before, before, after, xp: rec.xp };
}

function top(g, limit = 10) {
    const all = Pro.get(usersKey(g)) || {};
    return Object.entries(all).map(([id, r]) => ({ id, ...r, ...levelOf(r.xp || 0) })).sort((a, b) => b.xp - a.xp).slice(0, limit);
}

// ترتيب العضو في السيرفر (1 = الأول) وعدد الأعضاء اللي عندهم خبرة
function rankOf(g, u) {
    const all = Pro.get(usersKey(g)) || {};
    const list = Object.entries(all).map(([id, r]) => [id, r.xp || 0]).sort((a, b) => b[1] - a[1]);
    const i = list.findIndex(x => x[0] === u);
    return { rank: i < 0 ? list.length + 1 : i + 1, total: Math.max(list.length, 1) };
}

async function applyRoleRewards(member, level) {
    const given = [];
    for (const r of getRoleRewards(member.guild.id).filter(x => x.level <= level).sort((a, b) => a.level - b.level)) {
        const role = member.guild.roles.cache.get(r.roleId);
        if (!role || member.roles.cache.has(role.id)) continue;
        if (await member.roles.add(role, "مكافأة لفل").then(() => true).catch(() => false)) given.push(role);
    }
    return given;
}

let CV = null;
try { CV = require("@napi-rs/canvas"); } catch {}
const FONT = (w, size) => `${w} ${size}px CairoAr, CairoLat, sans-serif`;
const nf = n => Number(n || 0).toLocaleString("en-US");
const fmtMin = sec => { const m = Math.floor((sec || 0) / 60); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`; };

let _bg;
async function loadBg() {
    if (_bg !== undefined) return _bg;
    for (const f of ["nova_bg.png", "rank_bg.jpg"]) {
        try { _bg = await CV.loadImage(path.join(__dirname, "..", "..", "assets", f)); return _bg; } catch {}
    }
    return (_bg = null);
}
function rr(x, X, Y, W, H, R) { x.beginPath(); x.moveTo(X + R, Y); x.arcTo(X + W, Y, X + W, Y + H, R); x.arcTo(X + W, Y + H, X, Y + H, R); x.arcTo(X, Y + H, X, Y, R); x.arcTo(X, Y, X + W, Y, R); x.closePath(); }
// خلفية الكرت: صورة NOVA البنفسجية + إضاءة خفيفة + إطار متدرج
async function drawBg(x, W, H) {
    x.save(); rr(x, 0, 0, W, H, 28); x.clip();
    x.fillStyle = "#120b20"; x.fillRect(0, 0, W, H);
    const bg = await loadBg();
    if (bg) { const k = Math.max(W / bg.width, H / bg.height), w = bg.width * k, h = bg.height * k; x.drawImage(bg, (W - w) / 2, (H - h) / 2, w, h); }
    let g = x.createRadialGradient(W * 0.9, 0, 10, W * 0.9, 0, W * 0.7); g.addColorStop(0, "rgba(160,100,255,0.30)"); g.addColorStop(1, "rgba(160,100,255,0)"); x.fillStyle = g; x.fillRect(0, 0, W, H);
    g = x.createRadialGradient(0, H, 10, 0, H, W * 0.5); g.addColorStop(0, "rgba(255,140,214,0.14)"); g.addColorStop(1, "rgba(255,140,214,0)"); x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.restore();
    const bd = x.createLinearGradient(0, 0, W, 0); bd.addColorStop(0, "#9b6bff"); bd.addColorStop(1, "#ff8fd8");
    rr(x, 5, 5, W - 10, H - 10, 24); x.lineWidth = 3; x.strokeStyle = bd; x.stroke();
}
function tag(x, W, y) {
    x.save(); x.textAlign = "center"; x.textBaseline = "alphabetic"; x.fillStyle = "rgba(255,255,255,0.9)"; x.font = FONT("700", 16);
    if ("letterSpacing" in x) x.letterSpacing = "8px"; x.fillText("NOVA STORE", W / 2, y); if ("letterSpacing" in x) x.letterSpacing = "0px"; x.restore();
}
async function drawAvatar(x, member, cx, cy, r) {
    const av = await CV.loadImage(member.displayAvatarURL({ extension: "png", size: 256 })).catch(() => null);
    x.save(); x.shadowColor = "rgba(176,132,255,0.8)"; x.shadowBlur = 26; x.beginPath(); x.arc(cx, cy, r + 5, 0, Math.PI * 2); x.fillStyle = "#b084ff"; x.fill(); x.restore();
    x.save(); x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.clip();
    if (av) x.drawImage(av, cx - r, cy - r, r * 2, r * 2); else { x.fillStyle = "#2a1d4a"; x.fillRect(cx - r, cy - r, r * 2, r * 2); }
    x.restore();
    x.lineWidth = 3; x.strokeStyle = "#ff8fd8"; x.beginPath(); x.arc(cx, cy, r + 11, 0, Math.PI * 2); x.stroke();
}
function fit(x, text, font, maxW) { let t = String(text); x.font = font; while (t.length > 1 && x.measureText(t).width > maxW) t = t.slice(0, -1); return t === String(text) ? t : t + "…"; }

// كرت الرانك: شريط XP + الاسم + الصورة + نقاط الفويس والشات + ترتيبه في السيرفر
async function renderRankCard(member, u, pos) {
    if (!CV) throw new Error("canvas غير متوفر");
    const W = 1000, H = 330, c = CV.createCanvas(W, H), x = c.getContext("2d");
    await drawBg(x, W, H);
    rr(x, 18, 18, W - 36, H - 36, 22); x.fillStyle = "rgba(10,5,24,0.42)"; x.fill();
    x.lineWidth = 2; x.strokeStyle = "rgba(176,132,255,0.35)"; x.stroke();
    tag(x, W, 44);

    await drawAvatar(x, member, 135, 175, 80);

    x.fillStyle = "#ffffff"; x.textAlign = "left"; x.textBaseline = "alphabetic";
    const nameFont = FONT("700", 40);
    x.font = nameFont; x.fillText(fit(x, member.displayName, nameFont, 430), 250, 100);

    x.textAlign = "right";
    x.font = FONT("700", 22); x.fillStyle = "#c4a8ff"; x.fillText("TOP", 955, 78);
    x.font = FONT("700", 58); x.fillStyle = "#ffffff"; x.fillText("#" + pos.rank, 955, 128);
    x.textAlign = "left"; x.font = FONT("700", 24); x.fillStyle = "#ff9ee0";
    x.fillText(`LEVEL ${u.level}`, 250, 136);

    const box = (X, label, big, small) => {
        rr(x, X, 154, 330, 66, 16); x.fillStyle = "rgba(155,107,255,0.16)"; x.fill();
        x.lineWidth = 1.5; x.strokeStyle = "rgba(176,132,255,0.5)"; x.stroke();
        x.textAlign = "right"; x.fillStyle = "#cdb8ff"; x.font = FONT("700", 22); x.fillText(label, X + 314, 182);
        x.textAlign = "left"; x.fillStyle = "#fff"; x.font = FONT("700", 30); x.fillText(big, X + 18, 193);
        x.fillStyle = "rgba(205,184,255,0.75)"; x.font = FONT("700", 18); x.fillText(small, X + 18, 213);
    };
    box(250, "نقاط الشات", nf(u.chatXp) + " XP", nf(u.messages) + " msg");
    box(620, "نقاط الفويس", nf(u.voiceXp) + " XP", fmtMin(u.voiceSeconds));

    const BX = 250, BY = 258, BW = 705, BH = 34, pct = Math.max(0, Math.min(1, u.next ? u.into / u.next : 0));
    x.textAlign = "right"; x.fillStyle = "#fff"; x.font = FONT("700", 20); x.fillText(`${nf(u.into)} / ${nf(u.next)} XP`, BX + BW, BY - 10);
    x.textAlign = "left"; x.fillStyle = "#cdb8ff"; x.fillText(`${Math.round(pct * 100)}%`, BX, BY - 10);
    rr(x, BX, BY, BW, BH, BH / 2); x.fillStyle = "rgba(155,107,255,0.18)"; x.fill();
    x.lineWidth = 2; x.strokeStyle = "rgba(176,132,255,0.55)"; x.stroke();
    const fw = Math.max(BH, BW * pct);
    if (pct > 0) {
        x.save(); rr(x, BX, BY, BW, BH, BH / 2); x.clip();
        const g = x.createLinearGradient(BX, 0, BX + fw, 0); g.addColorStop(0, "#9b6bff"); g.addColorStop(1, "#ff8fd8");
        rr(x, BX, BY, fw, BH, BH / 2); x.fillStyle = g; x.fill(); x.restore();
    }
    return c.toBuffer("image/png");
}

async function renderLevelUpCard(member, level, role) {
    if (!CV) throw new Error("canvas غير متوفر");
    const W = 900, H = 280, c = CV.createCanvas(W, H), x = c.getContext("2d");
    await drawBg(x, W, H);
    rr(x, 16, 16, W - 32, H - 32, 20); x.fillStyle = "rgba(10,5,24,0.38)"; x.fill();
    tag(x, W, 42);
    await drawAvatar(x, member, 140, 150, 82);
    x.fillStyle = "#c4a8ff"; x.textAlign = "left"; x.textBaseline = "alphabetic";
    x.font = FONT("700", 30); if ("letterSpacing" in x) x.letterSpacing = "6px"; x.fillText("LEVEL UP", 270, 98); if ("letterSpacing" in x) x.letterSpacing = "0px";
    const g = x.createLinearGradient(270, 0, 470, 0); g.addColorStop(0, "#ffffff"); g.addColorStop(1, "#ff9ee0");
    x.fillStyle = g; x.font = FONT("700", 96); x.fillText(String(level), 270, 188);
    x.fillStyle = "#ffffff"; const nf2 = FONT("700", 28); x.font = nf2; x.fillText(fit(x, member.displayName, nf2, 560), 270, 232);
    if (role) { x.fillStyle = "rgba(205,184,255,0.85)"; x.font = FONT("700", 22); x.fillText(String(role.name).slice(0, 40), 270, 262); }
    return c.toBuffer("image/png");
}

module.exports = {
    CHAT_XP, VOICE_XP_PER_MINUTE, need, levelOf, isEnabled, setEnabled, getLevelChannelId, setLevelChannel, getRoleRewards, setRoleRewards,
    getUser, addXp, top, rankOf, applyRoleRewards, renderLevelUpCard, renderRankCard, getCfg
};
