const { AttachmentBuilder, EmbedBuilder, PermissionFlagsBits: P } = require('discord.js');
const { db, S } = require('./db');
const { rankCard } = require('./canvas');
const lvl = xp => Math.floor(Math.sqrt(xp / 100));
const rnd = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const isStaff = m => m.permissions.has(P.Administrator) || (S('staff_role') && m.roles.cache.has(S('staff_role')));

function ensure(id) { db.prepare('INSERT INTO levels(user_id) VALUES(?) ON CONFLICT DO NOTHING').run(id); return db.prepare('SELECT * FROM levels WHERE user_id=?').get(id); }
async function giveRoles(member, level) {
  const kind = isStaff(member) ? 'staff' : 'member';
  for (const r of db.prepare('SELECT * FROM level_roles WHERE kind=? AND level<=?').all(kind, level)) if (!member.roles.cache.has(r.role_id)) await member.roles.add(r.role_id).catch(() => {});
}
async function announce(member, level, type, fallback) {
  const id = S('levelup_channel'); const ch = (id && await member.guild.channels.fetch(id).catch(() => null)) || fallback;
  if (ch) ch.send(S('levelup_msg').replace('{user}', `${member}`).replace('{level}', level).replace('{type}', type)).catch(() => {});
}
function init(client) {
  client.on('messageCreate', async m => {
    if (!m.guild || m.author.bot || S('xp_enabled') !== '1') return;
    const row = ensure(m.author.id), now = Date.now();
    if (now - row.last_msg < +S('xp_cooldown') * 1000) return;
    const before = lvl(row.chat_xp), gain = rnd(+S('xp_min'), +S('xp_max'));
    db.prepare('UPDATE levels SET chat_xp=chat_xp+?, last_msg=? WHERE user_id=?').run(gain, now, m.author.id);
    const after = lvl(row.chat_xp + gain);
    if (after > before) { await announce(m.member, after, 'الشات', m.channel); giveRoles(m.member, after); }
  });
  setInterval(async () => {
    if (S('xp_enabled') !== '1') return;
    for (const g of client.guilds.cache.values())
      for (const vs of g.voiceStates.cache.values()) {
        if (!vs.channelId || !vs.member || vs.member.user.bot || vs.selfDeaf || vs.serverDeaf) continue;
        const row = ensure(vs.id), before = lvl(row.voice_xp), gain = +S('voice_xp');
        db.prepare('UPDATE levels SET voice_xp=voice_xp+? WHERE user_id=?').run(gain, vs.id);
        const after = lvl(row.voice_xp + gain);
        if (after > before) announce(vs.member, after, 'الفويس', null);
      }
  }, 60000);
}
const rankOf = r => db.prepare('SELECT COUNT(*)+1 c FROM levels WHERE chat_xp+voice_xp > ?').get(r.chat_xp + r.voice_xp).c;
async function rankImage(member) {
  const r = ensure(member.id);
  return new AttachmentBuilder(await rankCard({ name: member.displayName, avatarURL: member.user.displayAvatarURL({ extension: 'png', size: 256 }),
    chatLevel: lvl(r.chat_xp), voiceLevel: lvl(r.voice_xp), rank: rankOf(r), chatXp: r.chat_xp, voiceXp: r.voice_xp }), { name: 'rank.png' });
}
function topEmbed() {
  const rows = db.prepare('SELECT *, chat_xp+voice_xp t FROM levels ORDER BY t DESC LIMIT 10').all(), medals = ['🥇', '🥈', '🥉'];
  return new EmbedBuilder().setColor(0x9b6bff).setTitle('🏆 المتصدرين').setDescription(
    rows.map((r, n) => `${medals[n] || `**${n + 1}.**`} <@${r.user_id}> — 💬 فل ${lvl(r.chat_xp)} • 🎙️ فل ${lvl(r.voice_xp)}`).join('\n') || 'لا يوجد بيانات');
}
module.exports = { init, rankImage, topEmbed };
// تم صنع البوت بمتجر نوفا ستور • يوزر الاونر: .5yb.
