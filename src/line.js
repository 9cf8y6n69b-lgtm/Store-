// نظام الخط: أي رسالة/صورة/ملف في الرومات المحددة يجي بعدها الخط تلقائياً
const { SlashCommandBuilder, PermissionFlagsBits: P } = require('discord.js');
const { S, setS } = require('./db');
const { sendLine } = require('./info');
const EPH = 64;
const list = () => String(S('line_channels') || '').split(',').filter((x) => /^\d{15,22}$/.test(x));
const save = (a) => setS('line_channels', [...new Set(a)].join(','));
const last = new Map(), prev = new Map();

const commands = [new SlashCommandBuilder().setName('line-rooms').setDescription('رومات الخط التلقائي').setDefaultMemberPermissions(P.Administrator)
  .addSubcommand((s) => s.setName('add').setDescription('إضافة روم').addChannelOption((o) => o.setName('channel').setDescription('الروم (الافتراضي الحالي)')))
  .addSubcommand((s) => s.setName('remove').setDescription('إزالة روم').addChannelOption((o) => o.setName('channel').setDescription('الروم (الافتراضي الحالي)')))
  .addSubcommand((s) => s.setName('list').setDescription('عرض الرومات'))].map((c) => c.toJSON());

async function onCommand(i) {
  if (i.commandName !== 'line-rooms') return false;
  const sub = i.options.getSubcommand(), ch = i.options.getChannel?.('channel') || i.channel;
  if (sub === 'add') { save([...list(), ch.id]); return i.reply({ content: `✅ الخط التلقائي شغال في ${ch}`, flags: EPH }), true; }
  if (sub === 'remove') { save(list().filter((x) => x !== ch.id)); return i.reply({ content: `✅ أُزيل ${ch}`, flags: EPH }), true; }
  return i.reply({ content: list().length ? list().map((x) => `<#${x}>`).join('\n') : 'ما فيه رومات', flags: EPH }), true;
}

function init(client) {
  client.on('messageCreate', async (m) => {
    try {
      if (!m.guild || m.system || m.author?.id === client.user.id) return;   // رسائل البوت نفسه (والخط) تُتجاهل: ما يصير تكرار
      if (!list().includes(m.channelId)) return;
      if (S('line_ignore_bots') === '1' && m.author?.bot && m.author.id !== client.user.id) return;
      const now = Date.now(); if (now - (last.get(m.channelId) || 0) < (+S('line_cooldown') || 3) * 1000) return; last.set(m.channelId, now);
      if (S('line_delete_prev') === '1' && prev.get(m.channelId)) await m.channel.messages.delete(prev.get(m.channelId)).catch(() => {});
      const sent = await sendLine(m.channel); prev.set(m.channelId, sent.id);
    } catch (e) { console.error('line:', e.message); }
  });
}
module.exports = { commands, onCommand, init };
// تم صنع البوت بمتجر نوفا ستور • يوزر الاونر: .5yb.
