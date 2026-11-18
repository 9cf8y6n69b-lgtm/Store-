const path = require('path');
const { assetPath } = require('./files');
const { AttachmentBuilder } = require('discord.js');
const { S, db } = require('./db');
const PAY = {
  nitro: { label: 'نيترو (أشهر)', emoji: '💎' }, boost: { label: 'بوست', emoji: '🚀' },
  robux: { label: 'روبوكس', emoji: '🟡' }, credit: { label: 'كردت', emoji: '🪙' },
  vbucks: { label: 'في بوكس', emoji: '🎮' }, uc: { label: 'شدات ببجي', emoji: '🔫' },
};
const CAT = { basic: '🟢 بوتات بسيطة', standard: '🔵 بوتات متوسطة', premium: '🟣 بوتات متقدمة', package: '📦 الباقات (🥉 < 🥇 < 💎)' };
const STATUS = { pending: '⏳ بانتظار الدفع', paid: '💳 تم الدفع', working: '🛠️ قيد التنفيذ', delivered: '✅ تم التسليم', cancelled: '❌ ملغي' };
const fmt = n => (Math.round(n * 100) / 100).toLocaleString('en-US');
const rates = () => { try { return JSON.parse(S('rates')); } catch { return {}; } };
const payInfo = k => { try { return JSON.parse(S('pay_info'))[k] || ''; } catch { return ''; } };
const totalMonths = o => o.base * (1 - (o.bundle + o.coupon_pct) / 100);
const amountFor = (months, pay) => `${fmt(months * (rates()[pay] || 0))} ${PAY[pay].label}`;
function price(prods, couponPct = 0) {
  const all = db.prepare('SELECT COUNT(*) c FROM products WHERE active=1 AND category!=\'package\'').get().c;
  let base = prods.reduce((s, p) => s + p.months, 0);
  if (all && prods.filter(p => p.id !== 'custom' && p.category !== 'package').length >= all) base = Math.min(base, +S('all_bots_months'));
  const bundle = prods.filter(p => p.category !== 'package').length >= +S('bundle_min') ? +S('bundle_discount') : 0;
  return { base, bundle, coupon_pct: couponPct };
}
// صورة من إعدادات الداشبورد أو الصورة الافتراضية (مرفق محلي)
function image(embed, key, file) {
  const u = S(key);
  if (u) { embed.setImage(u); return []; }
  embed.setImage('attachment://' + file);
  return [new AttachmentBuilder(assetPath(file), { name: file })];
}
const imgUrl = (key, file) => S(key) || 'attachment://' + file;
const imgFiles = (key, file) => S(key) ? [] : [new AttachmentBuilder(assetPath(file), { name: file })];
// نسخة المحادثة كاملة (مو آخر 100 فقط): نسحب الرسائل على دفعات من الأحدث للأقدم حتى الحد الأقصى من الإعدادات
async function fetchAll(channel, max) {
  max = Math.min(Math.max(+max || +S('transcript_max') || 5000, 100), 20000);
  const all = []; let before;
  while (all.length < max) {
    const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) }).catch(() => null);
    if (!batch || !batch.size) break;
    all.push(...batch.values()); before = batch.last().id;
    if (batch.size < 100) break;
  }
  return { msgs: all.slice(0, max).reverse(), truncated: all.length >= max, max };
}
const embedText = (e) => [e.title, e.description].filter(Boolean).join(' — ').replace(/\n/g, ' ');
function toText(channel, { msgs, truncated, max }) {
  const lines = msgs.map((m) => {
    const extra = [...m.attachments.values()].map((a) => a.url);
    for (const e of m.embeds || []) { const t = embedText(e); if (t) extra.push(`[embed: ${t}]`); }
    return `[${m.createdAt.toISOString()}] ${m.author.tag}: ${m.content}${extra.length ? ' ' + extra.join(' ') : ''}`;
  });
  return Buffer.from(`# ${channel.name} — ${msgs.length} رسالة${truncated ? ` (آخر ${max} رسالة فقط حسب الإعدادات)` : ''}\n\n${lines.join('\n') || 'empty'}`);
}
const he = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function toHtml(channel, { msgs, truncated, max }) {
  const rows = msgs.map((m) => {
    const imgs = [...m.attachments.values()].map((a) => /\.(png|jpe?g|gif|webp)(\?|$)/i.test(a.url) ? `<a href="${he(a.url)}"><img src="${he(a.url)}"></a>` : `<a href="${he(a.url)}">📎 ${he(a.name || 'ملف')}</a>`).join('<br>');
    const emb = (m.embeds || []).map((e) => embedText(e)).filter(Boolean).map((t) => `<div class="emb">${he(t)}</div>`).join('');
    return `<div class="m"><img class="av" src="${he(m.author.displayAvatarURL?.() || '')}"><div><b>${he(m.author.tag)}</b>${m.author.bot ? ' <span class="bot">BOT</span>' : ''} <span class="t">${m.createdAt.toISOString().replace('T', ' ').slice(0, 19)}</span><div class="c">${he(m.content).replace(/\n/g, '<br>')}</div>${emb}${imgs}</div></div>`;
  }).join('');
  return Buffer.from(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${he(channel.name)}</title><style>
body{margin:0;background:#1e1f22;color:#dbdee1;font-family:Tahoma,Arial,sans-serif}.h{padding:16px 20px;background:#2b2d31;font-size:18px;font-weight:bold}
.m{display:flex;gap:12px;padding:10px 20px}.m:hover{background:#2a2b2f}.av{width:40px;height:40px;border-radius:50%}.t{color:#949ba4;font-size:12px}.c{margin-top:2px;white-space:pre-wrap;word-break:break-word}
.bot{background:#5865f2;color:#fff;border-radius:4px;padding:0 4px;font-size:11px}.emb{border-right:4px solid #9b6bff;background:#2b2d31;padding:6px 10px;margin-top:4px;border-radius:4px}img:not(.av){max-width:360px;border-radius:6px;margin-top:4px}a{color:#00a8fc}
</style></head><body><div class="h">#${he(channel.name)} — ${msgs.length} رسالة${truncated ? ` (آخر ${max} فقط)` : ''}</div>${rows || '<div class="m">لا توجد رسائل</div>'}</body></html>`);
}
async function transcript(channel, max) { return toText(channel, await fetchAll(channel, max)); }
// ملفات نسخة المحادثة: HTML للقراءة + TXT للأرشيف
async function transcriptFiles(channel, base, max) {
  const d = await fetchAll(channel, max), html = toHtml(channel, d), txt = toText(channel, d);
  return { files: () => [new AttachmentBuilder(html, { name: `${base}.html` }), new AttachmentBuilder(txt, { name: `${base}.txt` })] };
}
const fill = (t, m, extra = {}) => t.replace(/\{user\}/g, `<@${m.id}>`).replace(/\{name\}/g, m.displayName || m.user?.username || '')
  .replace(/\{server\}/g, m.guild?.name || '').replace(/\{count\}/g, m.guild?.memberCount || '')
  .replace(/\{(\w+)\}/g, (x, k) => (k in extra ? extra[k] : x));
module.exports = { PAY, CAT, STATUS, fmt, rates, payInfo, totalMonths, amountFor, price, image, imgUrl, imgFiles, transcript, transcriptFiles, fill };
// تم صنع البوت بمتجر نوفا ستور • يوزر الاونر: .5yb.
