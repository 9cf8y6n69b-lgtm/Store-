const { EmbedBuilder, AuditLogEvent } = require('discord.js');
const { S } = require('./db');

async function logTo(guild, key, embed, files = []) {
  const id = S(key); if (!id) return;
  const ch = guild.channels.cache.get(id) || await guild.channels.fetch(id).catch(() => null);
  if (ch) ch.send({ embeds: [embed], files }).catch(() => {});
}
const who = u => `${u.tag || u.username} (\`${u.id}\`)`;

// لوق الإدارة: اسم وايدي العضو والإداري + السبب + الصورة المرفقة
function modLog(guild, { action, color = 0xef476f, target, mod, reason, image, extra }) {
  const e = new EmbedBuilder().setColor(color).setTitle(`🔨 ${action}`).addFields(
    { name: '👤 العضو', value: who(target.user || target), inline: true },
    { name: '🛡️ الإداري', value: who(mod.user || mod), inline: true },
    { name: '📄 السبب', value: reason || 'بدون سبب' },
  ).setTimestamp();
  if (extra) e.addFields({ name: 'تفاصيل', value: extra });
  if (image) e.setImage(image);
  return logTo(guild, 'log_mod', e);
}

function init(client) {
  client.on('messageDelete', m => {
    if (!m.guild || m.author?.bot) return;
    logTo(m.guild, 'log_message', new EmbedBuilder().setColor(0xef476f).setTitle('🗑️ رسالة محذوفة')
      .setDescription(`**الكاتب:** ${m.author ? who(m.author) : 'غير معروف'}\n**الروم:** <#${m.channelId}>\n\n${(m.content || '*بدون نص*').slice(0, 1500)}`)
      .addFields(m.attachments?.size ? [{ name: 'مرفقات', value: [...m.attachments.values()].map(a => a.url).join('\n').slice(0, 1000) }] : []).setTimestamp());
  });
  client.on('messageUpdate', (a, b) => {
    if (!b.guild || b.author?.bot || a.content === b.content) return;
    logTo(b.guild, 'log_message', new EmbedBuilder().setColor(0xffd166).setTitle('✏️ رسالة معدّلة')
      .setDescription(`**الكاتب:** ${who(b.author)} • [انتقل للرسالة](${b.url})`)
      .addFields({ name: 'قبل', value: (a.content || '—').slice(0, 1000) }, { name: 'بعد', value: (b.content || '—').slice(0, 1000) }).setTimestamp());
  });
  client.on('guildMemberAdd', m => {
    const age = Math.floor(m.user.createdTimestamp / 1000);
    logTo(m.guild, 'log_member', new EmbedBuilder().setColor(0x06d6a0).setTitle('📥 عضو دخل').setThumbnail(m.user.displayAvatarURL())
      .setDescription(`${who(m.user)}\nالحساب أنشئ: <t:${age}:R>\nعدد الأعضاء: **${m.guild.memberCount}**`).setTimestamp());
  });
  client.on('guildMemberRemove', m => {
    logTo(m.guild, 'log_member', new EmbedBuilder().setColor(0xef476f).setTitle('📤 عضو خرج').setThumbnail(m.user.displayAvatarURL())
      .setDescription(`${who(m.user)}\nالرتب: ${m.roles?.cache.filter(r => r.name !== '@everyone').map(r => r.name).join('، ') || '—'}`).setTimestamp());
  });
  client.on('guildMemberUpdate', (a, b) => {
    const added = b.roles.cache.filter(r => !a.roles.cache.has(r.id)), removed = a.roles.cache.filter(r => !b.roles.cache.has(r.id));
    if (added.size || removed.size)
      logTo(b.guild, 'log_member', new EmbedBuilder().setColor(0x9b6bff).setTitle('🏷️ تغيير رتب').setDescription(`${who(b.user)}`)
        .addFields(added.size ? [{ name: '➕ أضيفت', value: added.map(r => `<@&${r.id}>`).join(' ') }] : [], removed.size ? [{ name: '➖ أزيلت', value: removed.map(r => `<@&${r.id}>`).join(' ') }] : []).setTimestamp());
    if (a.nickname !== b.nickname)
      logTo(b.guild, 'log_member', new EmbedBuilder().setColor(0x9b6bff).setTitle('📝 تغيير نك نيم').setDescription(`${who(b.user)}\n**قبل:** ${a.nickname || '—'}\n**بعد:** ${b.nickname || '—'}`).setTimestamp());
  });
  client.on('voiceStateUpdate', (a, b) => {
    const u = (b.member || a.member).user; let t;
    if (!a.channelId && b.channelId) t = `🎙️ دخل <#${b.channelId}>`;
    else if (a.channelId && !b.channelId) t = `🔇 خرج من <#${a.channelId}>`;
    else if (a.channelId !== b.channelId) t = `🔀 انتقل من <#${a.channelId}> إلى <#${b.channelId}>`;
    else return;
    logTo(b.guild, 'log_voice', new EmbedBuilder().setColor(0x4cc9f0).setTitle('🎧 لوق الفويس').setDescription(`${who(u)}\n${t}`).setTimestamp());
  });
  const banLog = (title, color) => async ban => {
    let mod = '';
    try { const l = await ban.guild.fetchAuditLogs({ limit: 1, type: title.includes('فك') ? AuditLogEvent.MemberBanRemove : AuditLogEvent.MemberBanAdd }); const en = l.entries.first(); if (en && en.targetId === ban.user.id) mod = `\n**الإداري:** ${who(en.executor)}`; } catch {}
    logTo(ban.guild, 'log_mod', new EmbedBuilder().setColor(color).setTitle(title).setDescription(`${who(ban.user)}${mod}\n**السبب:** ${ban.reason || '—'}`).setTimestamp());
  };
  client.on('guildBanAdd', banLog('⛔ حظر', 0xef476f)); client.on('guildBanRemove', banLog('✅ فك حظر', 0x06d6a0));
  client.on('channelCreate', c => c.guild && logTo(c.guild, 'log_server', new EmbedBuilder().setColor(0x06d6a0).setTitle('📁 روم جديد').setDescription(`${c.name} (\`${c.id}\`)`).setTimestamp()));
  client.on('channelDelete', c => c.guild && logTo(c.guild, 'log_server', new EmbedBuilder().setColor(0xef476f).setTitle('🗑️ روم محذوف').setDescription(`${c.name} (\`${c.id}\`)`).setTimestamp()));
}
module.exports = { init, logTo, modLog };
// تم صنع البوت بمتجر نوفا ستور • يوزر الاونر: .5yb.
