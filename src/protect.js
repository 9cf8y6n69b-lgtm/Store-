const {
  EmbedBuilder, PermissionFlagsBits: P, AuditLogEvent: A, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle, AttachmentBuilder,
} = require('discord.js');
const { createCanvas } = require('@napi-rs/canvas');
const { db, S, setS } = require('./db');
const { asset } = require('./info');
const bl = require('./blacklist');
require('./canvas'); // تسجيل الخط
const EPH = 64;
const on = (k) => S(k) === '1';
const num = (k) => +S(k) || 0;
const list = (k) => (S(k) || '').split(/[,\n،]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);
const wl = () => (S('protect_whitelist') || '').split(/[,\s]+/).filter(Boolean);

// ---------- اللوق ----------
function plog(guild, title, desc, color = 0xef476f) {
  const id = S('protect_log') || S('log_mod');
  const ch = id && guild.channels.cache.get(id);
  ch?.send({ embeds: [new EmbedBuilder().setColor(color).setTitle(`🛡️ ${title}`).setDescription(String(desc).slice(0, 3800)).setTimestamp()] }).catch(() => {});
}

// ---------- الاستثناءات ----------
const isExempt = (m) => !m || m.id === m.guild.ownerId || wl().includes(m.id)
  || m.permissions.has(P.Administrator) || m.permissions.has(P.ManageMessages)
  || (S('staff_role') && m.roles.cache.has(S('staff_role')));
const inShop = (ch) => [S('order_category'), S('tk_category')].filter(Boolean).includes(ch.parentId);

// ---------- المخالفات ----------
const strikes = new Map();
async function strike(m, reason, ms = 0) {
  await m.delete().catch(() => {});
  const now = Date.now();
  const arr = (strikes.get(m.author.id) || []).filter((t) => now - t < 864e5); arr.push(now); strikes.set(m.author.id, arr);
  db.prepare('INSERT INTO warns(user_id,mod_id,reason,created) VALUES(?,?,?,?)').run(m.author.id, m.client.user.id, `[حماية] ${reason}`, now);
  if (!ms && arr.length >= (num('strikes_limit') || 3)) ms = 30 * 6e4;
  if (ms && m.member?.moderatable) await m.member.timeout(ms, `حماية: ${reason}`).catch(() => {});
  const note = await m.channel.send(`${m.author} ⚠️ ${reason}${ms ? ` — تم كتمك ${Math.round(ms / 6e4)} دقيقة` : ''}`).catch(() => null);
  if (note) setTimeout(() => note.delete().catch(() => {}), 6000);
  plog(m.guild, reason, `**العضو:** ${m.author} (\`${m.author.id}\`)\n**الروم:** ${m.channel}\n**العقوبة:** ${ms ? `كتم ${Math.round(ms / 6e4)} دقيقة` : 'حذف الرسالة + تحذير'}\n**الرسالة:** ${(m.content || '—').slice(0, 500)}`);
}

// ---------- السبام ----------
const hist = new Map();
async function spam(m) {
  const now = Date.now(), win = num('spam_seconds') * 1000, lim = num('spam_count');
  const arr = (hist.get(m.author.id) || []).filter((x) => now - x.t < Math.max(win, 15000));
  const c = (m.content || '').toLowerCase();
  arr.push({ t: now, c, id: m.id, ch: m.channelId }); hist.set(m.author.id, arr);
  const burst = arr.filter((x) => now - x.t < win).length >= lim;
  const dup = c.length > 3 && arr.filter((x) => x.c === c).length >= 3;
  if (!burst && !dup) return false;
  hist.delete(m.author.id);
  const byCh = {}; arr.forEach((x) => (byCh[x.ch] = byCh[x.ch] || []).push(x.id));
  for (const [cid, ids] of Object.entries(byCh)) await m.guild.channels.cache.get(cid)?.bulkDelete(ids, true).catch(() => {});
  const mins = num('spam_timeout') || 10;
  if (m.member?.moderatable) await m.member.timeout(mins * 6e4, 'حماية: سبام').catch(() => {});
  const note = await m.channel.send(`${m.author} ⚠️ سبام — تم كتمك ${mins} دقيقة`).catch(() => null);
  if (note) setTimeout(() => note.delete().catch(() => {}), 6000);
  plog(m.guild, 'سبام', `**العضو:** ${m.author} (\`${m.author.id}\`)\n**الروم:** ${m.channel}\n**العقوبة:** كتم ${mins} دقيقة + حذف رسائله`);
  return true;
}

// ---------- فحص الرسائل ----------
const INVITE = /(?:discord\.gg|dsc\.gg|discord\.me|discord(?:app)?\.com\/invite)\/[\w-]+/i;
const LINK = /(?:https?:\/\/|www\.)[^\s<>]+/gi;
const norm = (t) => t.toLowerCase().replace(/[\u064B-\u065F\u0640]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
const host = (u) => { try { return new URL(/^https?:/i.test(u) ? u : `http://${u}`).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; } };

// رسائل الويب هوك: دعوات أو منشن @everyone من ويب هوك غير موثوق = حذف الرسالة والويب هوك
async function webhookMessage(m) {
  const text = m.content || '';
  if (!(INVITE.test(text) || /@(everyone|here)/.test(text))) return;
  const hook = await m.fetchWebhook().catch(() => null);
  if (hook && hook.type === 2) return; // متابعة قنوات رسمية
  if (hook?.owner && authorized(m.guild, hook.owner)) return;
  await m.delete().catch(() => {});
  await hook?.delete('حماية: رسالة خطرة من ويب هوك').catch(() => {});
  plog(m.guild, '🪝 رسالة خطرة من ويب هوك', `**الروم:** ${m.channel}\n**الويب هوك:** ${hook ? `${hook.name} (\`${hook.id}\`)` : 'غير معروف'}\n**المالك:** ${hook?.owner ? `${hook.owner} (\`${hook.owner.id}\`)` : 'غير معروف'}\n**الإجراء:** حذف الرسالة + حذف الويب هوك\n**الرسالة:** ${text.slice(0, 400)}`);
}

async function onMessage(m) {
  if (m.guild && m.webhookId && on('protect_enabled') && on('anti_webhook')) return webhookMessage(m);
  if (!m.guild || m.author.bot || m.webhookId || !on('protect_enabled')) return;
  const member = m.member || await m.guild.members.fetch(m.author.id).catch(() => null);
  if (isExempt(member)) return;
  const text = m.content || '';

  if (on('anti_spam') && await spam(m)) return;
  if (on('anti_invite') && INVITE.test(text)) return strike(m, 'نشر روابط دعوات');
  if (on('anti_link') && !inShop(m.channel)) {
    const ok = list('link_whitelist');
    const bad = (text.match(LINK) || []).some((u) => { const h = host(u); return !ok.some((w) => h === w || h.endsWith(`.${w}`)); });
    if (bad) return strike(m, 'ممنوع نشر الروابط');
  }
  if (on('anti_mention')) {
    const n = new Set([...m.mentions.users.keys(), ...m.mentions.roles.keys()]).size;
    if (n >= (num('mention_limit') || 5)) return strike(m, 'منشن جماعي', 10 * 6e4);
  }
  const words = list('bad_words');
  if (words.length) {
    const padded = ` ${norm(text).replace(/[^\p{L}\p{N}]+/gu, ' ')} `;
    if (words.some((w) => padded.includes(` ${norm(w)} `))) return strike(m, 'كلمات ممنوعة');
  }
  if (on('anti_caps') && !inShop(m.channel)) {
    const l = text.replace(/[^A-Za-z]/g, '');
    if (l.length >= 12 && l.replace(/[^A-Z]/g, '').length / l.length > 0.7) return strike(m, 'كتابة بحروف كبيرة مبالغ فيها');
  }
}

// ---------- Audit ----------
async function lastAudit(guild, type, targetId) {
  await new Promise((r) => setTimeout(r, 1200));
  const logs = await guild.fetchAuditLogs({ type, limit: 5 }).catch(() => null);
  return logs?.entries.find((e) => (!targetId || e.targetId === targetId) && Date.now() - e.createdTimestamp < 15000);
}

// ---------- ضد التخريب ----------
const acts = new Map();
const authorized = (guild, user) => !user || user.id === guild.client.user.id || user.id === guild.ownerId || wl().includes(user.id);
async function nukeCheck(guild, type, targetId, label) {
  if (!on('protect_enabled') || !on('anti_nuke')) return;
  const e = await lastAudit(guild, type, targetId);
  const by = e?.executor;
  if (!by || authorized(guild, by)) return;
  return countAction(guild, by, label);
}
async function countAction(guild, by, label) {
  const now = Date.now(), arr = (acts.get(by.id) || []).filter((t) => now - t < 10000); arr.push(now); acts.set(by.id, arr);
  if (arr.length < (num('nuke_limit') || 3)) return;
  acts.delete(by.id);
  const mem = await guild.members.fetch(by.id).catch(() => null);
  let result = 'لم أتمكن من معاقبته (رتبته أعلى مني)';
  if (mem?.bannable) { await mem.ban({ reason: `حماية: تخريب (${label})` }).catch(() => {}); result = 'تم حظره'; }
  else if (mem?.manageable) { await mem.roles.set([], 'حماية: تخريب').catch(() => {}); result = 'تم سحب كل رتبه'; }
  plog(guild, '🚨 محاولة تخريب', `**المنفّذ:** ${by} (\`${by.id}\`)\n**العملية:** ${label} (${arr.length}+ خلال 10 ثواني)\n**الإجراء:** ${result}`);
}

// ---------- الهجمات والبوتات ----------
const joins = []; let raidUntil = 0;
async function onJoin(m) {
  if (!on('protect_enabled')) return;
  const g = m.guild;
  if (m.user.bot) {
    if (!on('anti_bot_add')) return;
    const e = await lastAudit(g, A.BotAdd, m.id), by = e?.executor;
    if (!by || (by.id !== g.ownerId && !wl().includes(by.id))) {
      await m.kick('حماية: بوت غير مصرح').catch(() => {});
      plog(g, 'بوت غير مصرح', `تم طرد البوت **${m.user.tag}**\nأضافه: ${by ? `${by} (\`${by.id}\`)` : 'غير معروف'}`);
    }
    return;
  }
  const days = num('min_account_age_days');
  if (days && Date.now() - m.user.createdTimestamp < days * 864e5) {
    await m.send(`⛔ حسابك جديد، يلزم أن يكون عمره ${days} أيام على الأقل للدخول.`).catch(() => {});
    await m.kick('حماية: حساب جديد').catch(() => {});
    return plog(g, 'حساب جديد', `تم طرد ${m.user} (\`${m.id}\`) — عمر الحساب أقل من ${days} أيام`, 0xffd166);
  }
  if (!on('anti_raid')) return;
  const now = Date.now(); joins.push(now);
  while (joins.length && now - joins[0] > num('raid_seconds') * 1000) joins.shift();
  if (now < raidUntil || joins.length >= (num('raid_joins') || 8)) {
    if (now >= raidUntil) {
      const auto = on('raid_autolock') && !S('lockdown_prev');
      plog(g, '🚨 رصد هجوم (Raid)', `${joins.length} دخول خلال ${num('raid_seconds')} ثانية.\nسيتم طرد كل الداخلين الجدد لمدة 10 دقائق.${auto ? `\n🔒 تم **قفل السيرفر تلقائياً** وسيُفتح بعد ${num('raid_lock_minutes') || 15} دقيقة (أو افتحه بـ \`/lockdown فتح\`).` : '\nاستخدم `/lockdown` لقفل السيرفر عند الحاجة.'}`);
      if (auto) {
        setS('raid_unlock_at', Date.now() + (num('raid_lock_minutes') || 15) * 6e4);
        lockdown(g, true).catch(console.error);
      }
    }
    raidUntil = now + 10 * 6e4;
    await m.send('⛔ السيرفر تحت الحماية حالياً، حاول الدخول بعد قليل.').catch(() => {});
    await m.kick('حماية: Raid').catch(() => {});
  }
}

// ---------- قفل الطوارئ ----------
async function lockdown(guild, lock) {
  const ids = [guild.roles.everyone.id, S('verify_role')].filter(Boolean);
  const skip = [S('order_category'), S('tk_category')].filter(Boolean);
  let prev = {}; try { prev = JSON.parse(S('lockdown_prev') || '{}'); } catch {}
  const state = (ow) => (ow?.allow.has(P.SendMessages) ? true : ow?.deny.has(P.SendMessages) ? false : null);
  if (lock && Object.keys(prev).length) return 0;
  let n = 0;
  for (const ch of guild.channels.cache.values()) {
    if (ch.type !== ChannelType.GuildText || skip.includes(ch.parentId)) continue;
    for (const id of ids) {
      const key = `${ch.id}:${id}`;
      if (lock) {
        const st = state(ch.permissionOverwrites.cache.get(id));
        if (st === false) continue;
        prev[key] = st;
        await ch.permissionOverwrites.edit(id, { SendMessages: false }).then(() => n++).catch(() => { delete prev[key]; });
      } else if (key in prev) {
        await ch.permissionOverwrites.edit(id, { SendMessages: prev[key] }).then(() => n++).catch(() => {});
      }
    }
  }
  setS('lockdown_prev', lock ? JSON.stringify(prev) : '');
  if (!lock) setS('raid_unlock_at', '');
  plog(guild, lock ? '🔒 قفل الطوارئ' : '🔓 فتح السيرفر', `تم ${lock ? 'قفل' : 'فتح'} ${n} صلاحية.`, lock ? 0xef476f : 0x06d6a0);
  return n;
}

// ---------- التوثيق (كابتشا) ----------
const pending = new Map();
const CH = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function captcha(code) {
  const c = createCanvas(420, 150), x = c.getContext('2d');
  x.fillStyle = '#1a0d3a'; x.fillRect(0, 0, 420, 150);
  for (let i = 0; i < 9; i++) {
    x.strokeStyle = `hsla(${Math.random() * 360},70%,65%,.55)`; x.lineWidth = 2; x.beginPath();
    x.moveTo(Math.random() * 420, Math.random() * 150);
    x.bezierCurveTo(Math.random() * 420, Math.random() * 150, Math.random() * 420, Math.random() * 150, Math.random() * 420, Math.random() * 150); x.stroke();
  }
  x.font = 'bold 72px NovaFont, sans-serif'; x.textBaseline = 'middle'; x.textAlign = 'center';
  [...code].forEach((ch, i) => {
    x.save(); x.translate(55 + i * 78, 75 + Math.random() * 20 - 10); x.rotate((Math.random() - 0.5) * 0.6);
    x.fillStyle = `hsl(${250 + Math.random() * 60},80%,85%)`; x.fillText(ch, 0, 0); x.restore();
  });
  for (let i = 0; i < 70; i++) { x.fillStyle = 'rgba(255,255,255,.35)'; x.fillRect(Math.random() * 420, Math.random() * 150, 2, 2); }
  return new AttachmentBuilder(c.toBuffer('image/png'), { name: 'captcha.png' });
}

function sendVerify(ch) {
  const e = new EmbedBuilder().setColor(0x9b6bff).setTitle('✅ التوثيق | Nova Store')
    .setDescription('اضغط الزر بالأسفل وحل الكابتشا عشان تنفتح لك كل رومات السيرفر.\n\n🔒 هذا الإجراء يحمي السيرفر من الحسابات الوهمية والهجمات.')
    .setImage('attachment://banner.png');
  return ch.send({ embeds: [e], files: [asset('banner.png')], components: [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('vf_start').setLabel('وثّق نفسك').setEmoji('✅').setStyle(ButtonStyle.Success))] });
}

async function handle(i) {
  const role = S('verify_role');
  if (i.customId === 'vf_start') {
    if (bl.get(i.user.id)) { await i.reply({ content: bl.DENY, flags: EPH }); return true; }
    if (!role) { await i.reply({ content: '❌ رتبة التوثيق غير محددة، كلم الإدارة.', flags: EPH }); return true; }
    if (i.member.roles.cache.has(role)) { await i.reply({ content: '✅ أنت موثّق من قبل.', flags: EPH }); return true; }
    const code = Array.from({ length: 5 }, () => CH[Math.floor(Math.random() * CH.length)]).join('');
    pending.set(i.user.id, { code, tries: 0, exp: Date.now() + 18e4 });
    await i.reply({ content: '🔐 اضغط الزر واكتب الرمز الظاهر في الصورة:', files: [captcha(code)], flags: EPH,
      components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('vf_enter').setLabel('أدخل الرمز').setEmoji('⌨️').setStyle(ButtonStyle.Primary))] });
    return true;
  }
  if (i.customId === 'vf_enter') {
    await i.showModal(new ModalBuilder().setCustomId('vf_modal').setTitle('التوثيق').addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('code').setLabel('الرمز الظاهر بالصورة').setStyle(TextInputStyle.Short).setMinLength(5).setMaxLength(5).setRequired(true))));
    return true;
  }
  if (i.customId === 'vf_modal') {
    const p = pending.get(i.user.id);
    if (!p || Date.now() > p.exp) { await i.reply({ content: '⌛ انتهت الجلسة، اضغط زر التوثيق من جديد.', flags: EPH }); return true; }
    if (i.fields.getTextInputValue('code').trim().toUpperCase() !== p.code) {
      p.tries++;
      if (p.tries >= 3) { pending.delete(i.user.id); await i.reply({ content: '❌ رمز خاطئ 3 مرات، اضغط زر التوثيق من جديد.', flags: EPH }); }
      else await i.reply({ content: `❌ رمز خاطئ، باقي لك ${3 - p.tries} محاولات.`, flags: EPH });
      return true;
    }
    pending.delete(i.user.id);
    await i.member.roles.add(role).catch(() => {});
    await i.reply({ content: '✅ تم توثيقك، نورت المتجر! 💜', flags: EPH });
    plog(i.guild, 'توثيق عضو', `${i.user} (\`${i.user.id}\`) اجتاز التوثيق.`, 0x06d6a0);
    return true;
  }
  return false;
}

function init(client) {
  client.on('messageCreate', (m) => onMessage(m).catch(console.error));
  client.on('guildMemberAdd', (m) => onJoin(m).catch(console.error));
  client.on('channelDelete', (c) => c.guild && nukeCheck(c.guild, A.ChannelDelete, c.id, 'حذف روم').catch(() => {}));
  client.on('roleDelete', (r) => nukeCheck(r.guild, A.RoleDelete, r.id, 'حذف رتبة').catch(() => {}));
  client.on('guildBanAdd', (b) => nukeCheck(b.guild, A.MemberBanAdd, b.user.id, 'حظر أعضاء').catch(() => {}));
  client.on('guildMemberRemove', (m) => nukeCheck(m.guild, A.MemberKick, m.id, 'طرد أعضاء').catch(() => {}));
  // فتح القفل التلقائي بعد انتهاء مدة الـ Raid
  setInterval(() => {
    const at = +S('raid_unlock_at'); if (!at || Date.now() < at) return;
    setS('raid_unlock_at', '');
    const g = client.guilds.cache.get(process.env.GUILD_ID);
    if (g) lockdown(g, false).then(() => plog(g, '🔓 فتح تلقائي', 'انتهت مدة القفل بعد الـ Raid.', 0x06d6a0)).catch(console.error);
  }, 30e3);
  require('./guard').init(client);
}

module.exports = { init, handle, sendVerify, lockdown, plog, lastAudit, authorized, countAction };
