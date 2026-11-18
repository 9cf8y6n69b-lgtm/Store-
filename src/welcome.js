const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { S } = require('./db');
const { fill } = require('./util');
const { welcomeCard } = require('./canvas');

const chan = (g, id) => id && (g.channels.cache.get(id) || g.channels.fetch(id).catch(() => null));
function init(client) {
  client.on('guildMemberAdd', async m => {
    if (S('welcome_role') && !m.user.bot) m.roles.add(S('welcome_role')).catch(() => {});
    if (S('welcome_enabled') !== '1') return;
    const ch = await chan(m.guild, S('welcome_channel'));
    if (ch) {
      try {
        const buf = await welcomeCard({ name: m.displayName, avatarURL: m.user.displayAvatarURL({ extension: 'png', size: 256 }), count: m.guild.memberCount, title: S('welcome_title'), sub: S('welcome_sub'), bgUrl: S('welcome_bg') });
        const e = new EmbedBuilder().setColor(0x9b6bff).setDescription(fill(S('welcome_msg'), m)).setImage('attachment://welcome.png').setTimestamp();
        await ch.send({ content: `${m}`, embeds: [e], files: [new AttachmentBuilder(buf, { name: 'welcome.png' })] });
      } catch (e) { console.error('welcome', e); }
    }
    if (S('welcome_dm') === '1') m.send(fill(S('welcome_dm_msg'), m)).catch(() => {});
  });
  client.on('guildMemberRemove', async m => {
    const ch = await chan(m.guild, S('leave_channel'));
    if (ch) ch.send({ embeds: [new EmbedBuilder().setColor(0xef476f).setDescription(fill(S('leave_msg'), m)).setThumbnail(m.user.displayAvatarURL())] }).catch(() => {});
  });
}
// معاينة من الداشبورد
async function preview(guild, channelId, user) {
  const m = await guild.members.fetch(user).catch(() => null); if (!m) throw new Error('ما لقيت العضو');
  const ch = await guild.channels.fetch(channelId);
  const buf = await welcomeCard({ name: m.displayName, avatarURL: m.user.displayAvatarURL({ extension: 'png', size: 256 }), count: guild.memberCount, title: S('welcome_title'), sub: S('welcome_sub'), bgUrl: S('welcome_bg') });
  await ch.send({ content: `${m}`, embeds: [new EmbedBuilder().setColor(0x9b6bff).setDescription(fill(S('welcome_msg'), m)).setImage('attachment://welcome.png')], files: [new AttachmentBuilder(buf, { name: 'welcome.png' })] });
}
module.exports = { init, preview };
// تم صنع البوت بمتجر نوفا ستور • يوزر الاونر: .5yb.
