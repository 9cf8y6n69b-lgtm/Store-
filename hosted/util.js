const { AttachmentBuilder } = require('discord.js');
async function fetchAll(channel, max) {
  max = Math.min(Math.max(+max || 5000, 100), 20000);
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
module.exports = { transcript, transcriptFiles };
