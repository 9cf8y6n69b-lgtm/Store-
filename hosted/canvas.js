const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path'), fs = require('fs');
const fp = path.join(__dirname, '../assets/fonts/font-bold.ttf');
if (fs.existsSync(fp)) GlobalFonts.registerFromPath(fp, 'NovaFont');
const FONT = 'NovaFont, sans-serif';
const { assetPath } = require('./files');

async function safeLoad(src) { try { return await loadImage(src); } catch { return null; } }
function cover(ctx, img, w, h) { const s = Math.max(w / img.width, h / img.height); ctx.drawImage(img, (w - img.width * s) / 2, (h - img.height * s) / 2, img.width * s, img.height * s); }
function cut(t, n) { t = String(t); return t.length > n ? t.slice(0, n - 1) + '…' : t; }
function center(ctx, text, y, size, color = '#fff', w = 1024) { ctx.font = `${size}px ${FONT}`; ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.fillText(text, w / 2, y); }
async function avatar(ctx, url, cx, cy, r) {
  ctx.save(); ctx.shadowColor = '#9b6bff'; ctx.shadowBlur = 30; ctx.beginPath(); ctx.arc(cx, cy, r + 6, 0, Math.PI * 2); ctx.fillStyle = '#9b6bff'; ctx.fill(); ctx.restore();
  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
  const a = await safeLoad(url); if (a) ctx.drawImage(a, cx - r, cy - r, r * 2, r * 2); else { ctx.fillStyle = '#3b2a6b'; ctx.fillRect(cx - r, cy - r, r * 2, r * 2); } ctx.restore();
}
async function base(w, h, bgUrl) {
  const c = createCanvas(w, h), ctx = c.getContext('2d');
  const bg = (bgUrl && await safeLoad(bgUrl)) || await safeLoad(assetPath('nova_bg.png'));
  if (bg) cover(ctx, bg, w, h); else { ctx.fillStyle = '#1a0d3a'; ctx.fillRect(0, 0, w, h); }
  const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(12,5,35,.35)'); g.addColorStop(1, 'rgba(12,5,35,.75)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#9b6bff'; ctx.lineWidth = 5; ctx.beginPath(); ctx.roundRect(6, 6, w - 12, h - 12, 26); ctx.stroke();
  return { c, ctx };
}
async function welcomeCard({ name, avatarURL, count, title, sub, bgUrl }) {
  const { c, ctx } = await base(1024, 450, bgUrl);
  await avatar(ctx, avatarURL, 512, 130, 82);
  ctx.save(); ctx.shadowColor = '#b48cff'; ctx.shadowBlur = 25; center(ctx, cut(title || 'WELCOME', 18), 280, 62); ctx.restore();
  center(ctx, cut(name, 22), 335, 40, '#e6d8ff');
  center(ctx, `${sub || ''}  •  Member #${count}`, 385, 26, '#bda4f5');
  return c.toBuffer('image/png');
}
async function rankCard({ name, avatarURL, chatLevel, voiceLevel, rank, chatXp, voiceXp }) {
  const W = 934, H = 282, { c, ctx } = await base(W, H);
  await avatar(ctx, avatarURL, 120, 141, 78);
  ctx.textAlign = 'left'; ctx.font = `44px ${FONT}`; ctx.fillStyle = '#fff'; ctx.fillText(cut(name, 20), 230, 80);
  ctx.textAlign = 'right'; ctx.font = `40px ${FONT}`; ctx.fillStyle = '#c9a8ff'; ctx.fillText(`RANK #${rank}`, W - 40, 80);
  const bar = (label, level, xp, y, col) => {
    const cur = 100 * level * level, nxt = 100 * (level + 1) * (level + 1), p = Math.min(1, (xp - cur) / (nxt - cur));
    ctx.textAlign = 'left'; ctx.font = `26px ${FONT}`; ctx.fillStyle = '#e6d8ff'; ctx.fillText(`${label}  LVL ${level}`, 230, y);
    ctx.textAlign = 'right'; ctx.font = `22px ${FONT}`; ctx.fillStyle = '#bda4f5'; ctx.fillText(`${xp - cur} / ${nxt - cur} XP`, W - 40, y);
    ctx.fillStyle = 'rgba(255,255,255,.15)'; ctx.beginPath(); ctx.roundRect(230, y + 12, W - 270, 24, 12); ctx.fill();
    ctx.fillStyle = col; ctx.beginPath(); ctx.roundRect(230, y + 12, Math.max(24, (W - 270) * p), 24, 12); ctx.fill();
  };
  bar('💬 CHAT', chatLevel, chatXp, 142, '#9b6bff'); bar('🎙 VOICE', voiceLevel, voiceXp, 218, '#4cc9f0');
  return c.toBuffer('image/png');
}
module.exports = { welcomeCard, rankCard };
// تم صنع البوت بمتجر نوفا ستور • يوزر الاونر: .5yb.
