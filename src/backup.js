// النسخ الاحتياطي والاستعادة: /backup يرسل ملف فيه كل الأنظمة والإعدادات والداشبورد والصور، و/restore يرجعها.
// الملف مستقل عن الكود: لو أعدت كتابة البوت من جديد ارجع تستعيد منه (الأعمدة والجداول الجديدة تُطابق تلقائياً).
const fs = require('fs'), path = require('path'), zlib = require('zlib'), crypto = require('crypto');
const {
  SlashCommandBuilder, PermissionFlagsBits: P, EmbedBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
} = require('discord.js');
const { db, S, setS, SCHEMA, ensureDefaults } = require('./db');
const { dirs } = require('./files');
const EPH = 64, FORMAT = 'nova-store-backup', VERSION = 3;
const CONFIG_TABLES = ['settings', 'products', 'coupons', 'tk_cats', 'level_roles', 'cmds', 'autoreplies', 'role_panels', 'content', 'blacklist', 'dash_users', 'hosted_bots'];
const SKIP_TABLES = ['snapshot'];
const SKIP_SETTINGS = ['lockdown_prev', 'raid_unlock_at'];
const NAME_RE = /^[A-Za-z0-9_]+$/;
const TYPE_OF = Object.fromEntries(SCHEMA.map((s) => [s[1], s[3]]));
const TABLE_LABEL = {
  settings: 'الإعدادات', products: 'المنتجات والأسعار', coupons: 'الكوبونات', tk_cats: 'أنواع التذاكر', level_roles: 'رتب المستويات', cmds: 'أوامر الإدارة',
  autoreplies: 'الردود التلقائية', role_panels: 'رتب الأزرار', content: 'القوانين والسياسات', blacklist: 'القائمة السوداء', dash_users: 'حسابات الداشبورد', hosted_bots: 'البوتات المستضافة', hosted_users: 'بيانات أعضاء البوتات المستضافة', hosted_data: 'بيانات البوتات المستضافة', hosted_warns: 'تحذيرات البوتات المستضافة', orders: 'الطلبات', tickets: 'التذاكر',
  staff: 'نقاط الستاف', reviews: 'التقييمات', warns: 'التحذيرات', levels: 'المستويات (XP)', giveaways: 'القرعات', giveaway_entries: 'مشاركات القرعات',
  suggestions: 'الاقتراحات', suggestion_votes: 'تصويتات الاقتراحات',
};

// ---------- بناء النسخة ----------
const tableNames = () => db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map((r) => r.name);
function buildBackup({ scope = 'full', images = true, guild } = {}) {
  const tables = {};
  for (const t of tableNames()) {
    if (SKIP_TABLES.includes(t) || (scope === 'config' && !CONFIG_TABLES.includes(t))) continue;
    const columns = db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
    tables[t] = { columns, rows: db.prepare(`SELECT * FROM ${t}`).all() };
  }
  const files = {};
  if (images) for (const f of fs.readdirSync(dirs.overrides)) files[`overrides/${f}`] = fs.readFileSync(path.join(dirs.overrides, f)).toString('base64');
  return {
    format: FORMAT, version: VERSION, app: 'nova-store-bot', created: new Date().toISOString(), scope, includes_images: !!images, tables, files,
    guild: guild ? { id: guild.id, name: guild.name, channels: guild.channels.cache.map((c) => ({ id: c.id, name: c.name, type: c.type })), roles: guild.roles.cache.map((r) => ({ id: r.id, name: r.name })) } : null,
  };
}
const encode = (obj) => zlib.gzipSync(Buffer.from(JSON.stringify(obj)), { level: 9 });
function decode(buf) {
  if (buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b) buf = zlib.gunzipSync(buf);
  const obj = JSON.parse(buf.toString('utf8'));
  if (obj.format !== FORMAT || typeof obj.tables !== 'object') throw new Error('هذا الملف ليس نسخة احتياطية من Nova Store');
  return obj;
}
function createBackupFile({ scope = 'full', images = true, guild, maxBytes = 24 * 1024 * 1024 } = {}) {
  let obj = buildBackup({ scope, images, guild }), buf = encode(obj), dropped = false;
  if (buf.length > maxBytes && images) { obj = buildBackup({ scope, images: false, guild }); buf = encode(obj); dropped = true; }
  const d = new Date(Date.now() + (+S('tz_offset') || 0) * 36e5).toISOString().replace(/[:T]/g, '-').slice(0, 16);
  const name = `nova-backup-${scope}-${d}.json.gz`;
  fs.writeFileSync(path.join(dirs.backups, name), buf);
  const old = fs.readdirSync(dirs.backups).filter((f) => f.startsWith('nova-backup-')).map((f) => ({ f, t: fs.statSync(path.join(dirs.backups, f)).mtimeMs })).sort((a, b) => b.t - a.t);
  for (const o of old.slice(20)) fs.rmSync(path.join(dirs.backups, o.f), { force: true });
  return { buf, name, obj, dropped };
}
const listLocal = () => fs.readdirSync(dirs.backups).filter((f) => /\.json(\.gz)?$/.test(f)).map((f) => { const s = fs.statSync(path.join(dirs.backups, f)); return { name: f, size: s.size, time: s.mtimeMs }; }).sort((a, b) => b.time - a.time);

function summary(obj) {
  const lines = Object.entries(obj.tables).filter(([, v]) => v.rows.length).map(([t, v]) => `• ${TABLE_LABEL[t] || t}: **${v.rows.length}**`);
  return lines.join('\n') || '—';
}

// ---------- مطابقة الايديات بالأسماء (لو السيرفر انحذف وانعمل من جديد) ----------
function buildRemap(bg, guild) {
  const m = new Map();
  if (!bg || !guild) return m;
  const chBy = new Map(); guild.channels.cache.forEach((c) => chBy.set(`${c.type}:${c.name}`, c.id));
  const roleBy = new Map(); guild.roles.cache.forEach((r) => roleBy.set(r.name, r.id));
  for (const c of bg.channels || []) if (!guild.channels.cache.has(c.id) && chBy.has(`${c.type}:${c.name}`)) m.set(c.id, chBy.get(`${c.type}:${c.name}`));
  for (const r of bg.roles || []) if (!guild.roles.cache.has(r.id) && roleBy.has(r.name)) m.set(r.id, roleBy.get(r.name));
  return m;
}
function remapRow(t, row, map) {
  const f = (v) => map.get(v) || v;
  if (!map.size) return row;
  row = { ...row };
  if (t === 'settings') { const ty = TYPE_OF[row.key]; if (['role', 'channel', 'category'].includes(ty)) row.value = f(row.value); else if (ty === 'roles') row.value = String(row.value || '').split(',').map(f).join(','); }
  else if (t === 'level_roles') row.role_id = f(row.role_id);
  else if (t === 'cmds') row.role = f(row.role);
  else if (t === 'autoreplies') row.channel_id = f(row.channel_id);
  else if (t === 'role_panels') { row.channel_id = f(row.channel_id); try { row.roles = JSON.stringify(JSON.parse(row.roles).map((r) => ({ ...r, role_id: f(r.role_id) }))); } catch {} }
  return row;
}

// ---------- الاستعادة ----------
function applyBackup(obj, { mode = 'replace', guild } = {}) {
  const map = guild ? buildRemap(obj.guild, guild) : new Map(), report = { tables: {}, skipped: [], remapped: map.size, files: 0 };
  db.transaction(() => {
    for (const [t, def] of Object.entries(obj.tables)) {
      if (!NAME_RE.test(t) || SKIP_TABLES.includes(t)) continue;
      const cols = db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
      if (!cols.length) { report.skipped.push(t); continue; }
      const use = (def.columns || Object.keys(def.rows[0] || {})).filter((c) => NAME_RE.test(c) && cols.includes(c));
      if (!use.length) continue;
      if (mode === 'replace' && t !== 'settings') db.prepare(`DELETE FROM ${t}`).run();
      const st = db.prepare(`INSERT OR REPLACE INTO ${t}(${use.join(',')}) VALUES(${use.map(() => '?').join(',')})`);
      let n = 0;
      for (let row of def.rows) {
        if (t === 'settings' && SKIP_SETTINGS.includes(row.key)) continue;
        row = remapRow(t, row, map); st.run(...use.map((c) => row[c] ?? null)); n++;
      }
      report.tables[t] = n;
    }
  })();
  if (obj.files && Object.keys(obj.files).length) {
    if (mode === 'replace') for (const f of fs.readdirSync(dirs.overrides)) fs.rmSync(path.join(dirs.overrides, f), { force: true });
    for (const [rel, b64] of Object.entries(obj.files)) {
      const name = path.basename(rel);
      if (!rel.startsWith('overrides/') || !/^[\w.-]+\.(png|jpe?g)$/i.test(name)) continue;
      fs.writeFileSync(path.join(dirs.overrides, name), Buffer.from(b64, 'base64')); report.files++;
    }
  }
  ensureDefaults();
  return report;
}
async function afterRestore() {
  try { require('./community').invalidateAuto(); } catch {}
  try { await require('./content').regenerate(); } catch (e) { console.warn('[backup] تعذر توليد صور القوانين بعد الاستعادة:', e.message); }
}

// استعادة تلقائية عند التشغيل: حط ملف النسخة داخل data/restore/ وشغّل البوت
function autoRestoreOnBoot() {
  const files = fs.readdirSync(dirs.restore).filter((f) => /\.json(\.gz)?$/.test(f)).map((f) => ({ f, t: fs.statSync(path.join(dirs.restore, f)).mtimeMs })).sort((a, b) => b.t - a.t);
  if (!files.length) return;
  const done = path.join(dirs.restore, 'done'); fs.mkdirSync(done, { recursive: true });
  try {
    const obj = decode(fs.readFileSync(path.join(dirs.restore, files[0].f)));
    const r = applyBackup(obj, { mode: 'replace' });
    console.log(`♻️ تمت استعادة النسخة ${files[0].f}:`, r.tables, `صور: ${r.files}`);
    afterRestore();
  } catch (e) { console.error('❌ فشلت استعادة النسخة التلقائية:', e.message); }
  for (const { f } of files) fs.renameSync(path.join(dirs.restore, f), path.join(done, `${Date.now()}-${f}`));
}

// ---------- الصلاحيات ----------
async function allowed(i) {
  if (i.user.id === i.guild.ownerId) return true;
  if ((S('backup_admins') || '').split(/[,\s]+/).includes(i.user.id)) return true;
  const o = (await i.client.application.fetch().catch(() => null))?.owner;
  return !!o && (o.id === i.user.id || o.ownerId === i.user.id || !!o.members?.has?.(i.user.id));
}
const maxUpload = (g) => Math.max(8 * 1024 * 1024, (g?.maximumUploadLimit || 25 * 1024 * 1024) - 600 * 1024);

// ---------- الأوامر ----------
const commands = [
  new SlashCommandBuilder().setName('backup').setDescription('إرسال نسخة احتياطية كاملة (أنظمة، داشبورد، طلبات، صور) بالخاص').setDefaultMemberPermissions(P.Administrator)
    .addStringOption((o) => o.setName('type').setDescription('نوع النسخة').addChoices({ name: 'كاملة (كل شيء)', value: 'full' }, { name: 'إعدادات وأنظمة فقط (بدون طلبات وعملاء)', value: 'config' }))
    .addBooleanOption((o) => o.setName('images').setDescription('تضمين الصور المرفوعة (الافتراضي نعم)')),
  new SlashCommandBuilder().setName('restore').setDescription('استعادة نسخة احتياطية').setDefaultMemberPermissions(P.Administrator)
    .addAttachmentOption((o) => o.setName('file').setDescription('ملف النسخة (.json.gz)').setRequired(true))
    .addStringOption((o) => o.setName('mode').setDescription('طريقة الاستعادة').addChoices({ name: 'استبدال (الافتراضي)', value: 'replace' }, { name: 'دمج (يحافظ على الموجود)', value: 'merge' })),
].map((c) => c.toJSON());

const pending = new Map();
async function onCommand(i) {
  if (i.commandName === 'backup') {
    if (!(await allowed(i))) return i.reply({ content: '❌ النسخ الاحتياطي لمالك السيرفر/البوت فقط (أو الايديات المسموحة من الداشبورد ← النسخ الاحتياطي)', flags: EPH }), true;
    await i.deferReply({ flags: EPH });
    const { buf, name, obj, dropped } = createBackupFile({ scope: i.options.getString('type') || 'full', images: i.options.getBoolean('images') !== false, guild: i.guild, maxBytes: maxUpload(i.guild) });
    const e = new EmbedBuilder().setColor(0x06d6a0).setTitle('💾 نسخة احتياطية جاهزة').setDescription(summary(obj) + `\n\n🖼️ صور مرفوعة: **${Object.keys(obj.files).length}**${dropped ? '\n⚠️ الصور استُبعدت بسبب حجم الملف' : ''}`)
      .setFooter({ text: 'احتفظ بالملف في مكان آمن — فيه بيانات العملاء' });
    const file = () => new AttachmentBuilder(buf, { name });
    const dmOk = await i.user.send({ embeds: [e], files: [file()], content: 'للاستعادة: `/restore` وأرفق هذا الملف. أو حطه داخل مجلد `data/restore` وشغّل البوت.' }).then(() => true).catch(() => false);
    await i.editReply(dmOk ? { content: '✅ أرسلت لك النسخة بالخاص.' } : { content: '⚠️ ما قدرت أرسلها بالخاص (الخاص مقفل)، هذي نسختك:', embeds: [e], files: [file()] });
    return true;
  }
  if (i.commandName === 'restore') {
    if (!(await allowed(i))) return i.reply({ content: '❌ الاستعادة لمالك السيرفر/البوت فقط', flags: EPH }), true;
    const att = i.options.getAttachment('file');
    if (att.size > 40 * 1024 * 1024) return i.reply({ content: '❌ الملف كبير جداً', flags: EPH }), true;
    await i.deferReply({ flags: EPH });
    let obj;
    try { obj = decode(Buffer.from(await (await fetch(att.url)).arrayBuffer())); } catch (e) { return i.editReply(`❌ ملف غير صالح: ${e.message}`), true; }
    const mode = i.options.getString('mode') || 'replace', token = crypto.randomBytes(6).toString('hex');
    pending.set(token, { obj, mode, user: i.user.id, exp: Date.now() + 10 * 6e4 });
    const same = obj.guild?.id === i.guild.id;
    await i.editReply({
      embeds: [new EmbedBuilder().setColor(0xffd166).setTitle('♻️ تأكيد الاستعادة').setDescription(`${summary(obj)}\n\n📅 تاريخ النسخة: <t:${Math.floor(Date.parse(obj.created) / 1000)}:f>\n🖼️ صور: **${Object.keys(obj.files || {}).length}**\n⚙️ الطريقة: **${mode === 'replace' ? 'استبدال' : 'دمج'}**${same || !obj.guild ? '' : `\n⚠️ النسخة من سيرفر مختلف (${obj.guild.name}) — سأحاول مطابقة الرومات والرتب بالأسماء.`}\n\nسيتم حفظ نسخة أمان من وضعك الحالي أولاً.`)],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`bk_ok:${token}`).setLabel('استعادة الآن').setEmoji('♻️').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`bk_no:${token}`).setLabel('إلغاء').setStyle(ButtonStyle.Secondary))],
    });
    return true;
  }
  return false;
}
async function handle(i) {
  if (!i.isButton() || !/^bk_(ok|no):/.test(i.customId)) return false;
  const [act, token] = i.customId.split(':'), p = pending.get(token);
  if (!p || p.user !== i.user.id || p.exp < Date.now()) return await i.update({ content: '⌛ انتهت الجلسة', embeds: [], components: [] }), true;
  pending.delete(token);
  if (act === 'bk_no') return await i.update({ content: 'تم الإلغاء', embeds: [], components: [] }), true;
  await i.update({ content: '⏳ جاري الاستعادة...', embeds: [], components: [] });
  try {
    createBackupFile({ scope: 'full', images: true, guild: i.guild, maxBytes: 1e9 }); // نسخة أمان محلية في data/backups
    const r = applyBackup(p.obj, { mode: p.mode, guild: i.guild });
    afterRestore();
    const lines = Object.entries(r.tables).map(([t, n]) => `• ${TABLE_LABEL[t] || t}: ${n}`).join('\n');
    await i.editReply({ content: `✅ **تمت الاستعادة**\n${lines}\n🖼️ صور: ${r.files}${r.remapped ? `\n🔗 تمت مطابقة ${r.remapped} روم/رتبة بالأسماء` : ''}${r.skipped.length ? `\n⚠️ جداول غير موجودة بالنسخة الحالية: ${r.skipped.join(', ')}` : ''}\n\nلو الرومات أو البانلات ناقصة اكتب \`/setup-server\` (آمن للتكرار).` });
  } catch (e) { console.error(e); await i.editReply(`❌ فشلت الاستعادة: ${e.message}\n(تم حفظ نسخة أمان في data/backups)`); }
  return true;
}

// ---------- النسخ التلقائي ----------
async function autoTick(client) {
  const hrs = +S('auto_backup_hours') || 0, chId = S('backup_channel');
  if (!hrs || !chId || Date.now() - (+S('backup_last') || 0) < hrs * 36e5) return;
  const g = client.guilds.cache.get(process.env.GUILD_ID), ch = g && await g.channels.fetch(chId).catch(() => null); if (!ch) return;
  setS('backup_last', Date.now());
  const { buf, name, obj, dropped } = createBackupFile({ scope: 'full', images: true, guild: g, maxBytes: maxUpload(g) });
  await ch.send({ content: `💾 نسخة احتياطية تلقائية${dropped ? ' (بدون الصور بسبب الحجم)' : ''}\n${summary(obj).split('\n').slice(0, 6).join(' | ')}`, files: [new AttachmentBuilder(buf, { name })] }).catch((e) => console.error('[backup]', e.message));
}
function init(client) { setTimeout(() => autoTick(client).catch(console.error), 30e3); setInterval(() => autoTick(client).catch(console.error), 30 * 60e3); }

module.exports = { commands, onCommand, handle, init, autoRestoreOnBoot, createBackupFile, buildBackup, decode, applyBackup, afterRestore, summary, listLocal, allowed };
// تم صنع البوت بمتجر نوفا ستور • يوزر الاونر: .5yb.
