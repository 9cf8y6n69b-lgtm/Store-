const path = require('path');
const { AttachmentBuilder } = require('discord.js');
const { S, db } = require('./db');
const PAY = {
  nitro: { label: 'نيترو (أشهر)', emoji: '💎' }, boost: { label: 'بوست', emoji: '🚀' },
  robux: { label: 'روبوكس', emoji: '🟡' }, credit: { label: 'كردت', emoji: '🪙' },
  vbucks: { label: 'في بوكس', emoji: '🎮' }, uc: { label: 'شدات ببجي', emoji: '🔫' },
};
const CAT = { basic: '🟢 بوتات بسيطة', standard: '🔵 بوتات متوسطة', premium: '🟣 بوتات متقدمة' };
const STATUS = { pending: '⏳ بانتظار الدفع', paid: '💳 تم الدفع', working: '🛠️ قيد التنفيذ', delivered: '✅ تم التسليم', cancelled: '❌ ملغي' };
const fmt = n => (Math.round(n * 100) / 100).toLocaleString('en-US');
const rates = () => { try { return JSON.parse(S('rates')); } catch { return {}; } };
const payInfo = k => { try { return JSON.parse(S('pay_info'))[k] || ''; } catch { return ''; } };
const totalMonths = o => o.base * (1 - (o.bundle + o.coupon_pct) / 100);
const amountFor = (months, pay) => `${fmt(months * (rates()[pay] || 0))} ${PAY[pay].label}`;
function price(prods, couponPct = 0) {
  const all = db.prepare('SELECT COUNT(*) c FROM products WHERE active=1').get().c;
  let base = prods.reduce((s, p) => s + p.months, 0);
  if (all && prods.filter(p => p.id !== 'custom').length >= all) base = Math.min(base, +S('all_bots_months'));
  const bundle = prods.length >= +S('bundle_min') ? +S('bundle_discount') : 0;
  return { base, bundle, coupon_pct: couponPct };
}
// صورة من إعدادات الداشبورد أو الصورة الافتراضية (مرفق محلي)
function image(embed, key, file) {
  const u = S(key);
  if (u) { embed.setImage(u); return []; }
  embed.setImage('attachment://' + file);
  return [new AttachmentBuilder(path.join(__dirname, '../assets', file), { name: file })];
}
const imgUrl = (key, file) => S(key) || 'attachment://' + file;
const imgFiles = (key, file) => S(key) ? [] : [new AttachmentBuilder(path.join(__dirname, '../assets', file), { name: file })];
async function transcript(channel) {
  const msgs = [...(await channel.messages.fetch({ limit: 100 })).values()].reverse();
  return Buffer.from(msgs.map(m => `[${m.createdAt.toISOString()}] ${m.author.tag}: ${m.content}${m.attachments.size ? ' ' + [...m.attachments.values()].map(a => a.url).join(' ') : ''}`).join('\n') || 'empty');
}
const fill = (t, m, extra = {}) => t.replace(/\{user\}/g, `<@${m.id}>`).replace(/\{name\}/g, m.displayName || m.user?.username || '')
  .replace(/\{server\}/g, m.guild?.name || '').replace(/\{count\}/g, m.guild?.memberCount || '')
  .replace(/\{(\w+)\}/g, (x, k) => (k in extra ? extra[k] : x));
module.exports = { PAY, CAT, STATUS, fmt, rates, payInfo, totalMonths, amountFor, price, image, imgUrl, imgFiles, transcript, fill };
