const { SlashCommandBuilder, PermissionFlagsBits: P, EmbedBuilder } = require('discord.js');
const { S } = require('./db');
const { INFO, sendInfo, sendLine } = require('./info');
const protect = require('./protect');
const setup = require('./setup');
const EPH = 64;

const choices = [...Object.entries(INFO).map(([value, x]) => ({ name: x.label, value })), { name: 'التوثيق (بانل)', value: 'verify' }];
const commands = [
  new SlashCommandBuilder().setName('send-info').setDescription('إرسال صورة القوانين / السياسات / المعلومات').setDefaultMemberPermissions(P.Administrator)
    .addStringOption((o) => o.setName('type').setDescription('النوع').setRequired(true).addChoices(...choices))
    .addChannelOption((o) => o.setName('channel').setDescription('الروم (الافتراضي الروم الحالي)')),
  new SlashCommandBuilder().setName('line').setDescription('إرسال الخط').setDefaultMemberPermissions(P.ManageMessages),
  new SlashCommandBuilder().setName('setup-server').setDescription('ترتيب السيرفر كامل: رتب، رومات، صلاحيات، بانلات، إعدادات').setDefaultMemberPermissions(P.Administrator),
  new SlashCommandBuilder().setName('lockdown').setDescription('قفل/فتح الكتابة في السيرفر (طوارئ)').setDefaultMemberPermissions(P.Administrator)
    .addStringOption((o) => o.setName('action').setDescription('الإجراء').setRequired(true).addChoices({ name: 'قفل', value: 'on' }, { name: 'فتح', value: 'off' })),
  new SlashCommandBuilder().setName('protection').setDescription('حالة نظام الحماية').setDefaultMemberPermissions(P.Administrator),
].map((c) => c.toJSON());

async function onCommand(i, ctx) {
  switch (i.commandName) {
    case 'send-info': {
      const ch = i.options.getChannel('channel') || i.channel, t = i.options.getString('type');
      if (t === 'verify') await protect.sendVerify(ch); else await sendInfo(ch, t);
      await i.reply({ content: `✅ تم الإرسال في ${ch}`, flags: EPH }); return true;
    }
    case 'line':
      await i.reply({ content: '✅', flags: EPH }); await sendLine(i.channel); return true;
    case 'setup-server': {
      await i.deferReply({ flags: EPH });
      const r = await setup.setupServer(i.guild, ctx, (t) => i.editReply(t).catch(() => {}));
      await i.editReply(`✅ **تم تجهيز السيرفر**\n• أُنشئ: ${r.created.length} عنصر\n• أُعطي رتبة التوثيق: ${r.given} عضو${r.skipped ? `\n⚠️ ${r.skipped} عضو ما انعطوا الرتبة (العدد كبير)، أعطهم رتبة **Nova | Member** يدوياً` : ''}\n\nتأكد أن رتبة البوت أعلى من الرتب الجديدة، وراجع الإعدادات من الداشبورد.`);
      return true;
    }
    case 'lockdown': {
      const lock = i.options.getString('action') === 'on';
      await i.deferReply({ flags: EPH });
      const n = await protect.lockdown(i.guild, lock);
      await i.editReply(lock ? (n ? `🔒 تم قفل السيرفر (${n} صلاحية). افتحه بـ \`/lockdown فتح\`` : '⚠️ السيرفر مقفل أصلاً') : `🔓 تم فتح السيرفر (${n} صلاحية)`);
      return true;
    }
    case 'protection': {
      const f = (k) => (S(k) === '1' ? '✅' : '❌');
      await i.reply({ flags: EPH, embeds: [new EmbedBuilder().setColor(0x9b6bff).setTitle('🛡️ حالة الحماية').setDescription([
        `${f('protect_enabled')} الحماية العامة`, `${f('anti_invite')} منع الدعوات`, `${f('anti_link')} منع الروابط`, `${f('anti_spam')} منع السبام`,
        `${f('anti_mention')} منع المنشن الجماعي`, `${f('anti_caps')} منع الكابيتال`, `${f('anti_raid')} ضد الهجمات (Raid)`, `${f('anti_bot_add')} ضد البوتات الدخيلة`,
        `${f('anti_nuke')} ضد التخريب`, `${S('verify_role') ? '✅' : '❌'} التوثيق (كابتشا)`, `${+S('min_account_age_days') ? '✅' : '❌'} حد عمر الحساب (${S('min_account_age_days')} يوم)`,
      ].join('\n')).setFooter({ text: 'عدّل كل شيء من الداشبورد ← 🛡️ الحماية' })] });
      return true;
    }
  }
  return false;
}

// كتابة "خط" من الستاف في أي روم ترسل الخط وتحذف رسالتك
function init(client) {
  client.on('messageCreate', async (m) => {
    if (!m.guild || m.author.bot || m.content.trim() !== 'خط') return;
    const mem = m.member || await m.guild.members.fetch(m.author.id).catch(() => null);
    if (!mem || !(mem.permissions.has(P.ManageMessages) || (S('staff_role') && mem.roles.cache.has(S('staff_role'))))) return;
    m.delete().catch(() => {});
    sendLine(m.channel).catch(() => {});
  });
}

module.exports = { commands, onCommand, init };
