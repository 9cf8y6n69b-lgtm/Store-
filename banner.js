let CV = null;
try {
  CV = require('@napi-rs/canvas');
  try {
    CV.GlobalFonts.registerFromPath(require.resolve('@fontsource/cairo/files/cairo-arabic-700-normal.woff'), 'CairoAr');
    CV.GlobalFonts.registerFromPath(require.resolve('@fontsource/cairo/files/cairo-latin-700-normal.woff'), 'CairoLat');
  } catch (e) { console.log('الخط العربي مش متسجل:', e.message); }
} catch (e) { console.log('مكتبة الصور مش متثبتة — البنرات هتتعطل:', e.message); }

const fs = require('fs'), path = require('path');
const ASSETS = path.join(__dirname, 'assets');
const _cache = {};
// يقرأ صورة الهوية من مجلد assets مرة واحدة ويحتفظ بها في الذاكرة
function asset(name) {
  if (!(name in _cache)) { try { _cache[name] = fs.readFileSync(path.join(ASSETS, name)); } catch { _cache[name] = null; } }
  return _cache[name];
}

// ─────────────── تصميم البنر (قابل للتعديل كله من الداشبورد) ───────────────
// الإحداثيات بالبكسل على اللوحة. الإطار الافتراضي (assets/frame.png) مقاسه 1540x740 والدايرة في (649, 323)
const F = s => `700 ${s}px CairoAr, CairoLat, sans-serif`;
const DEFAULT_DESIGN = {
  bg: '#120b20', frame: 'default',                       // frame: default | custom | none
  avatar: { x: 400, y: 370, r: 235, shape: 'circle', radius: 60 },   // shape: circle | rounded | square
  ring: { on: false, color: '#b084ff', width: 10 },
  title: { on: true, x: 1470, y: 250, size: 84, color: '#ffffff', align: 'right', maxW: 860 },
  name: { on: true, x: 1470, y: 365, size: 56, color: '#d9c7ff', align: 'right', maxW: 860 },
  line: { on: true, x: 1470, y: 458, size: 34, color: '#a99bd0', align: 'right', maxW: 860 },
  stars: { x: 1465, y: 225, size: 26, gap: 62, on: '#ffc94d', off: '#6d5a9e' }
};
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const merge = (a, b) => { const o = { ...a }; for (const k in (b || {})) o[k] = isObj(a[k]) && isObj(b[k]) ? merge(a[k], b[k]) : b[k] ?? a[k]; return o; };
const num = (v, d, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const col = (v, d) => (/^#[0-9a-f]{3,8}$/i.test(String(v)) ? v : d);
// ينضف التصميم القادم من الداشبورد (أرقام ضمن حدود، ألوان صحيحة، قيم مسموحة بس)
function cleanDesign(raw) {
  const d = merge(DEFAULT_DESIGN, isObj(raw) ? raw : {}), D = DEFAULT_DESIGN;
  d.bg = col(d.bg, D.bg); d.frame = ['default', 'custom', 'none'].includes(d.frame) ? d.frame : 'default';
  d.avatar = { x: num(d.avatar.x, D.avatar.x, 0, 4000), y: num(d.avatar.y, D.avatar.y, 0, 4000), r: num(d.avatar.r, D.avatar.r, 20, 1500), radius: num(d.avatar.radius, 60, 0, 800), shape: ['circle', 'rounded', 'square'].includes(d.avatar.shape) ? d.avatar.shape : 'circle' };
  d.ring = { on: !!d.ring.on, color: col(d.ring.color, D.ring.color), width: num(d.ring.width, 10, 1, 60) };
  for (const k of ['title', 'name', 'line']) d[k] = { on: d[k].on !== false, x: num(d[k].x, D[k].x, 0, 4000), y: num(d[k].y, D[k].y, 0, 4000), size: num(d[k].size, D[k].size, 8, 240), color: col(d[k].color, D[k].color), align: ['left', 'center', 'right'].includes(d[k].align) ? d[k].align : 'right', maxW: num(d[k].maxW, D[k].maxW, 40, 4000) };
  d.stars = { x: num(d.stars.x, D.stars.x, 0, 4000), y: num(d.stars.y, D.stars.y, 0, 4000), size: num(d.stars.size, 26, 6, 120), gap: num(d.stars.gap, 62, 10, 300), on: col(d.stars.on, D.stars.on), off: col(d.stars.off, D.stars.off) };
  return d;
}
const available = () => !!CV;

async function loadAvatar(src) {
  try {
    const buf = Buffer.isBuffer(src) ? src : Buffer.from(await (await fetch(src)).arrayBuffer());
    return await CV.loadImage(buf);
  } catch { return null; }
}
function star(ctx, cx, cy, R) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? R * 0.45 : R, a = -Math.PI / 2 + i * Math.PI / 5;
    ctx[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  ctx.closePath();
}
function shapePath(ctx, av) {
  const { x, y, r, shape, radius } = av;
  ctx.beginPath();
  if (shape === 'circle') ctx.arc(x, y, r, 0, Math.PI * 2);
  else if (ctx.roundRect) ctx.roundRect(x - r, y - r, r * 2, r * 2, shape === 'square' ? 0 : Math.min(radius, r));
  else ctx.rect(x - r, y - r, r * 2, r * 2);
}
let _frame = null;
async function frameImage(d, frameBuf) {
  if (d.frame === 'none') return null;
  if (d.frame === 'custom' && frameBuf) { try { return await CV.loadImage(frameBuf); } catch { return null; } }
  const b = asset('frame.png');
  if (!b) return null;
  try { return _frame ||= await CV.loadImage(b); } catch { return null; }
}
async function base(avatar, design, frameBuf) {
  const d = cleanDesign(design), fr = await frameImage(d, frameBuf);
  let W = 1540, H = 740;
  if (fr && d.frame === 'custom') { const k = Math.min(1, 1600 / fr.width); W = Math.round(fr.width * k); H = Math.round(fr.height * k); }
  const c = CV.createCanvas(W, H), ctx = c.getContext('2d');
  ctx.fillStyle = d.bg; ctx.fillRect(0, 0, W, H);
  if (fr) ctx.drawImage(fr, 0, 0, W, H);
  if (d.ring.on) { ctx.save(); shapePath(ctx, d.avatar); ctx.lineWidth = d.ring.width * 2; ctx.strokeStyle = d.ring.color; ctx.stroke(); ctx.restore(); }
  // داخل الإطار الافتراضي أبيض غير شفاف، فالصورة الشخصية تنرسم فوقه داخل الشكل المختار
  ctx.save(); shapePath(ctx, d.avatar); ctx.clip();
  const A = d.avatar, img = await loadAvatar(avatar);
  if (img) ctx.drawImage(img, A.x - A.r, A.y - A.r, A.r * 2, A.r * 2); else { ctx.fillStyle = '#d9dce1'; ctx.fillRect(A.x - A.r, A.y - A.r, A.r * 2, A.r * 2); }
  ctx.restore();
  ctx.direction = 'rtl'; ctx.textBaseline = 'middle';
  return { c, ctx, d };
}
function put(ctx, t, o) {
  if (!o.on || !t) return;
  ctx.save(); ctx.font = F(o.size); ctx.fillStyle = o.color; ctx.textAlign = o.align;
  ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 8;
  ctx.fillText(t, o.x, o.y, o.maxW); ctx.restore();
}
async function welcomeBanner({ title, name, avatar, line, design, frameBuf }) {
  if (!CV) return null;
  const { c, ctx, d } = await base(avatar, design, frameBuf);
  put(ctx, title || 'أهلاً بيك', d.title); put(ctx, name, d.name); put(ctx, line || '', d.line);
  return c.toBuffer('image/png');
}
async function feedbackBanner({ name, avatar, stars, thanks, design, frameBuf }) {
  if (!CV) return null;
  const { c, ctx, d } = await base(avatar, design, frameBuf);
  put(ctx, thanks || 'شكرًا لتقييمك!', d.title); put(ctx, name, d.name);
  for (let i = 0; i < 5; i++) {
    const cx = d.stars.x - i * d.stars.gap, on = i < stars;
    ctx.save(); star(ctx, cx, d.stars.y, d.stars.size);
    if (on) { ctx.shadowColor = 'rgba(255,190,40,0.7)'; ctx.shadowBlur = 14; ctx.fillStyle = d.stars.on; ctx.fill(); }
    else { ctx.strokeStyle = d.stars.off; ctx.lineWidth = 3; ctx.stroke(); }
    ctx.restore();
  }
  return c.toBuffer('image/png');
}

// ─────────────── كرت التقييم: صورة العضو + اسمه + النجوم + كلام التقييم + صورة مرفقة (اختياري) ───────────────
let _bgImg = null;
async function bgImage() { if (_bgImg !== undefined && _bgImg) return _bgImg; const b = asset('nova_bg.png'); try { _bgImg = b ? await CV.loadImage(b) : null; } catch { _bgImg = null; } return _bgImg; }
function rrect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function panelBorder(ctx, W, H, r) {
  const g = ctx.createLinearGradient(0, 0, W, 0); g.addColorStop(0, '#9b6bff'); g.addColorStop(1, '#ff8fd8');
  rrect(ctx, 14, 14, W - 28, H - 28, r); ctx.lineWidth = 3; ctx.strokeStyle = g; ctx.stroke();
}
function headerNova(ctx, W, y) {
  ctx.save(); ctx.direction = 'ltr'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff';
  ctx.font = '700 30px CairoLat, sans-serif'; if ('letterSpacing' in ctx) ctx.letterSpacing = '12px'; ctx.fillText('NOVA STORE', W / 2, y);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  const g = ctx.createLinearGradient(W / 2 - 330, 0, W / 2 + 330, 0); g.addColorStop(0, 'rgba(176,132,255,0)'); g.addColorStop(0.5, '#b084ff'); g.addColorStop(1, 'rgba(176,132,255,0)');
  ctx.fillStyle = g; ctx.fillRect(W / 2 - 330, y + 36, 290, 2); ctx.fillRect(W / 2 + 40, y + 36, 290, 2);
  ctx.fillStyle = '#ff8fd8'; ctx.beginPath(); ctx.moveTo(W / 2, y + 27); ctx.lineTo(W / 2 + 11, y + 37); ctx.lineTo(W / 2, y + 47); ctx.lineTo(W / 2 - 11, y + 37); ctx.closePath(); ctx.fill();
  ctx.restore();
}
function wrapLines(ctx, text, maxW, maxLines) {
  const out = []; let cur = '';
  for (const para of String(text || '').split(/\r?\n/)) {
    cur = '';
    for (const w of para.split(/\s+/).filter(Boolean)) {
      const t = cur ? cur + ' ' + w : w;
      if (ctx.measureText(t).width > maxW && cur) { out.push(cur); cur = w; } else cur = t;
    }
    out.push(cur);
  }
  if (out.length > maxLines) { out.length = maxLines; out[maxLines - 1] = out[maxLines - 1].replace(/.{0,3}$/, '…'); }
  return out;
}
async function reviewCard({ name, avatar, stars, text, image }) {
  if (!CV) return null;
  const W = 1400, PAD = 80, TW = W - PAD * 2;
  const probe = CV.createCanvas(10, 10).getContext('2d'); probe.font = F(34); probe.direction = 'rtl';
  const lines = wrapLines(probe, text || '', TW, 9), LH = 52, textH = lines.length * LH;
  let img = null, iw = 0, ih = 0;
  if (image) { img = await loadAvatar(image); if (img) { const k = Math.min(TW / img.width, 560 / img.height, 1); iw = Math.round(img.width * k); ih = Math.round(img.height * k); } }
  const top = 330, H = top + textH + (img ? ih + 50 : 20) + 70;
  const c = CV.createCanvas(W, H), ctx = c.getContext('2d');
  ctx.fillStyle = '#120b20'; ctx.fillRect(0, 0, W, H);
  const bg = await bgImage(); if (bg) { const k = Math.max(W / bg.width, H / bg.height); ctx.drawImage(bg, (W - bg.width * k) / 2, (H - bg.height * k) / 2, bg.width * k, bg.height * k); }
  let g = ctx.createRadialGradient(W * 0.85, 0, 10, W * 0.85, 0, 700); g.addColorStop(0, 'rgba(160,100,255,0.28)'); g.addColorStop(1, 'rgba(160,100,255,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  panelBorder(ctx, W, H, 48); headerNova(ctx, W, 62);
  // الصورة الشخصية (يمين)
  const AX = W - PAD - 100, AY = 215, AR = 88;
  ctx.save(); ctx.shadowColor = 'rgba(176,132,255,0.7)'; ctx.shadowBlur = 30; ctx.beginPath(); ctx.arc(AX, AY, AR + 8, 0, Math.PI * 2); ctx.fillStyle = '#b084ff'; ctx.fill(); ctx.restore();
  ctx.save(); ctx.beginPath(); ctx.arc(AX, AY, AR, 0, Math.PI * 2); ctx.clip();
  const av = await loadAvatar(avatar); if (av) ctx.drawImage(av, AX - AR, AY - AR, AR * 2, AR * 2); else { ctx.fillStyle = '#2a1d4a'; ctx.fillRect(AX - AR, AY - AR, AR * 2, AR * 2); } ctx.restore();
  ctx.direction = 'rtl'; ctx.textBaseline = 'middle'; ctx.textAlign = 'right';
  ctx.fillStyle = '#ffffff'; ctx.font = F(52); ctx.fillText(String(name || '').slice(0, 28), AX - AR - 30, AY - 28, 760);
  // النجوم
  const n = Math.max(0, Math.min(5, Number(stars) || 0));
  for (let i = 0; i < 5; i++) {
    const cx = AX - AR - 50 - i * 62, cy = AY + 42; ctx.save(); star(ctx, cx, cy, 25);
    if (i < n) { ctx.shadowColor = 'rgba(255,190,40,0.7)'; ctx.shadowBlur = 14; ctx.fillStyle = '#ffc94d'; ctx.fill(); } else { ctx.strokeStyle = '#6d5a9e'; ctx.lineWidth = 3; ctx.stroke(); }
    ctx.restore();
  }
  ctx.fillStyle = '#a99bd0'; ctx.font = F(30); ctx.textAlign = 'left'; ctx.fillText(n + ' / 5', PAD + 10, AY + 42);
  // النص داخل لوح
  if (lines.length) { rrect(ctx, PAD - 20, top - 30, TW + 40, textH + 40, 28); ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fill(); ctx.strokeStyle = 'rgba(176,132,255,0.35)'; ctx.lineWidth = 2; ctx.stroke(); }
  ctx.fillStyle = '#efe7ff'; ctx.font = F(34); ctx.textAlign = 'right';
  lines.forEach((l, i) => ctx.fillText(l, W - PAD, top + 6 + i * LH + LH / 2, TW));
  if (img) { const y = top + textH + 30, x = Math.round((W - iw) / 2); ctx.save(); rrect(ctx, x, y, iw, ih, 24); ctx.clip(); ctx.drawImage(img, x, y, iw, ih); ctx.restore(); rrect(ctx, x, y, iw, ih, 24); ctx.strokeStyle = '#b084ff'; ctx.lineWidth = 3; ctx.stroke(); }
  return c.toBuffer('image/png');
}

// ─────────────── كرت اللوحات والإعلانات (عنوان + وصف + شعار NOVA) ───────────────
function star4(ctx, cx, cy, R, r) { ctx.beginPath(); for (let i = 0; i < 8; i++) { const a = -Math.PI / 2 + i * Math.PI / 4, d = i % 2 ? r : R; ctx[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * d, cy + Math.sin(a) * d); } ctx.closePath(); }
async function panelCard({ title, sub, chips }) {
  if (!CV) return null;
  const W = 1100, H = 440, c = CV.createCanvas(W, H), ctx = c.getContext('2d');
  ctx.fillStyle = '#120b20'; ctx.fillRect(0, 0, W, H);
  const bg = await bgImage(); if (bg) { const k = Math.max(W / bg.width, H / bg.height); ctx.drawImage(bg, (W - bg.width * k) / 2, (H - bg.height * k) / 2, bg.width * k, bg.height * k); }
  let g = ctx.createRadialGradient(230, 220, 10, 230, 220, 420); g.addColorStop(0, 'rgba(155,107,255,0.40)'); g.addColorStop(1, 'rgba(155,107,255,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  g = ctx.createRadialGradient(W, H, 10, W, H, 520); g.addColorStop(0, 'rgba(255,140,214,0.18)'); g.addColorStop(1, 'rgba(255,140,214,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  panelBorder(ctx, W, H, 40);
  // الشعار (يسار)
  ctx.save(); ctx.shadowColor = 'rgba(176,132,255,0.9)'; ctx.shadowBlur = 50;
  const sg = ctx.createLinearGradient(0, 80, 0, 360); sg.addColorStop(0, '#c9a8ff'); sg.addColorStop(1, '#ff9ee0'); ctx.fillStyle = sg; star4(ctx, 230, 220, 150, 40); ctx.fill(); ctx.restore();
  ctx.fillStyle = '#120b20'; ctx.beginPath(); ctx.arc(230, 220, 22, 0, Math.PI * 2); ctx.fill();
  for (const [x, y, r] of [[96, 96, 5], [372, 330, 4], [380, 120, 3], [110, 340, 3]]) { ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
  // خط NOVA الصغير
  ctx.save(); ctx.direction = 'ltr'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.font = '700 22px CairoLat, sans-serif';
  if ('letterSpacing' in ctx) ctx.letterSpacing = '9px'; ctx.fillText('NOVA STORE', W - 70, 62); if ('letterSpacing' in ctx) ctx.letterSpacing = '0px'; ctx.restore();
  // العنوان والوصف (يمين)
  ctx.direction = 'rtl'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  const X = W - 70, MW = 600; ctx.font = F(60); const tl = wrapLines(ctx, title || '', MW, 2);
  const tg = ctx.createLinearGradient(X - MW, 0, X, 0); tg.addColorStop(0, '#d9c7ff'); tg.addColorStop(1, '#ffffff'); ctx.fillStyle = tg;
  tl.forEach((l, i) => ctx.fillText(l, X, 150 + i * 72, MW));
  const y2 = 150 + tl.length * 72 + 10; ctx.fillStyle = '#b9a8e6'; ctx.font = F(27); wrapLines(ctx, sub || '', MW, 3).forEach((l, i) => ctx.fillText(l, X, y2 + 20 + i * 42, MW));
  // شرائح أسفل
  const cs = (chips || []).slice(0, 4); let cx = X; ctx.font = F(22);
  cs.forEach(t => { const w = ctx.measureText(t).width + 40; rrect(ctx, cx - w, 366, w, 44, 22); ctx.fillStyle = 'rgba(155,107,255,0.20)'; ctx.fill(); ctx.strokeStyle = 'rgba(176,132,255,0.6)'; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = '#efe7ff'; ctx.textAlign = 'center'; ctx.fillText(t, cx - w / 2, 389); ctx.textAlign = 'right'; cx -= w + 12; });
  return c.toBuffer('image/png');
}

// ─────────────── صور القوانين والسياسات: عنوان + بنود مرقمة ───────────────
async function infoCard({ title, sub, items, footer }) {
  if (!CV) return null;
  const W = 1100, PAD = 70, TW = W - PAD * 2 - 90, LH = 40;
  const probe = CV.createCanvas(10, 10).getContext('2d'); probe.direction = 'rtl';
  const rows = (items || []).map(it => { probe.font = F(32); const h = it.h ? [it.h] : []; probe.font = F(26); const t = wrapLines(probe, it.t || '', TW, 4); return { h: it.h || '', t, hh: (it.h ? 46 : 0) + t.length * LH + 30 }; });
  const top = 230, H = top + rows.reduce((s, r) => s + r.hh, 0) + 120;
  const c = CV.createCanvas(W, H), ctx = c.getContext('2d');
  ctx.fillStyle = '#120b20'; ctx.fillRect(0, 0, W, H);
  const bg = await bgImage(); if (bg) { const k = Math.max(W / bg.width, H / bg.height); ctx.drawImage(bg, (W - bg.width * k) / 2, (H - bg.height * k) / 2, bg.width * k, bg.height * k); }
  let g = ctx.createRadialGradient(W * 0.5, 0, 10, W * 0.5, 0, 700); g.addColorStop(0, 'rgba(160,100,255,0.32)'); g.addColorStop(1, 'rgba(160,100,255,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  panelBorder(ctx, W, H, 44); headerNova(ctx, W, 66);
  ctx.direction = 'rtl'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff'; ctx.font = F(64); ctx.fillText(String(title || ''), W / 2, 150, W - 160);
  ctx.direction = 'ltr'; ctx.fillStyle = '#b9a8e6'; ctx.font = '700 22px CairoLat, sans-serif'; if ('letterSpacing' in ctx) ctx.letterSpacing = '8px'; ctx.fillText(String(sub || ''), W / 2, 200); if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  let y = top; ctx.direction = 'rtl';
  rows.forEach((r, n) => {
    rrect(ctx, PAD, y, W - PAD * 2, r.hh - 12, 22); ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fill(); ctx.strokeStyle = 'rgba(176,132,255,0.35)'; ctx.lineWidth = 2; ctx.stroke();
    const cx = W - PAD - 42, cy = y + 38; const gg = ctx.createLinearGradient(cx - 24, cy - 24, cx + 24, cy + 24); gg.addColorStop(0, '#9b6bff'); gg.addColorStop(1, '#ff8fd8'); ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(cx, cy, 24, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#120b20'; ctx.font = F(26); ctx.textAlign = 'center'; ctx.fillText(String(n + 1), cx, cy + 1);
    ctx.textAlign = 'right'; let ty = y + 38; const tx = W - PAD - 90;
    if (r.h) { ctx.fillStyle = '#ffffff'; ctx.font = F(32); ctx.fillText(r.h, tx, ty, TW); ty += 46; }
    ctx.fillStyle = '#d9ccf5'; ctx.font = F(26); r.t.forEach((l, i) => ctx.fillText(l, tx, ty + (r.h ? 0 : 0) + i * LH, TW));
    y += r.hh;
  });
  ctx.textAlign = 'center'; ctx.fillStyle = '#c4a8ff'; ctx.font = F(26); ctx.fillText(String(footer || ''), W / 2, H - 56, W - 140);
  return c.toBuffer('image/png');
}
async function boostBanner(o) { return welcomeBanner(o); }

const ICONS = ['ico_play', 'ico_pause', 'ico_skip', 'ico_stop', 'ico_loop', 'ico_loop1', 'ico_vdn', 'ico_vup', 'ico_star'];
function icon(name) {
  if (!CV || !ICONS.includes(name)) return null;
  const c = CV.createCanvas(128, 128), x = c.getContext('2d');
  x.fillStyle = '#fff'; x.strokeStyle = '#fff'; x.lineCap = 'round'; x.lineJoin = 'round';
  const rr = (a, b, w, h, r) => { x.beginPath(); x.roundRect(a, b, w, h, r); x.fill(); };
  const poly = p => { x.beginPath(); p.forEach(([a, b], i) => x[i ? 'lineTo' : 'moveTo'](a, b)); x.closePath(); x.fill(); x.lineWidth = 8; x.stroke(); };
  if (name === 'ico_pause') { rr(28, 22, 28, 84, 9); rr(72, 22, 28, 84, 9); }
  else if (name === 'ico_play') poly([[38, 22], [102, 64], [38, 106]]);
  else if (name === 'ico_skip') { poly([[24, 26], [84, 64], [24, 102]]); rr(92, 24, 18, 80, 7); }
  else if (name === 'ico_stop') rr(24, 24, 80, 80, 16);
  else if (name === 'ico_loop' || name === 'ico_loop1') {
    x.lineWidth = 12;
    x.beginPath(); x.moveTo(26, 72); x.lineTo(26, 58); x.quadraticCurveTo(26, 40, 44, 40); x.lineTo(84, 40); x.stroke(); poly([[82, 20], [112, 40], [82, 60]]);
    x.beginPath(); x.moveTo(102, 56); x.lineTo(102, 70); x.quadraticCurveTo(102, 88, 84, 88); x.lineTo(44, 88); x.stroke(); poly([[46, 68], [16, 88], [46, 108]]);
    if (name === 'ico_loop1') { x.font = '700 40px CairoLat, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('1', 64, 66); }
  } else if (name === 'ico_vdn' || name === 'ico_vup') {
    poly([[18, 48], [40, 48], [66, 24], [66, 104], [40, 80], [18, 80]]);
    x.lineWidth = 10; x.beginPath(); x.arc(66, 64, 24, -0.7, 0.7); x.stroke();
    if (name === 'ico_vup') { x.beginPath(); x.arc(66, 64, 44, -0.7, 0.7); x.stroke(); }
  } else if (name === 'ico_star') {
    x.save(); star(x, 64, 66, 54); x.shadowColor = 'rgba(255,213,74,.9)'; x.shadowBlur = 10; x.fillStyle = '#ffd54a'; x.fill(); x.restore();
  }
  return c.toBuffer('image/png');
}
module.exports = { available, welcomeBanner, feedbackBanner, reviewCard, boostBanner, panelCard, infoCard, icon, ICONS, asset, cleanDesign, DEFAULT_DESIGN };
