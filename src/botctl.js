// التحكم بالبوت من الداشبورد: التوكن وايدي السيرفر، تشغيل/إيقاف/إعادة تشغيل، حالة البوت ونشاطه
const fs = require('fs'), path = require('path');
const { ActivityType, SlashCommandBuilder, PermissionFlagsBits: P } = require('discord.js');
const { S, setS } = require('./db');
const { dirs } = require('./files');
const EPH = 64;
const FILE = path.join(dirs.data, 'credentials.json'); // خارج قاعدة البيانات عشان التوكن ما يدخل في النسخ الاحتياطية
const STATUSES = { online: '🟢 متصل', idle: '🌙 خامل', dnd: '⛔ مشغول', invisible: '⚫ غير مرئي' };
const ACTIVITIES = { Playing: 'يلعب', Watching: 'يشاهد', Listening: 'يستمع إلى', Competing: 'يتنافس في', Custom: 'حالة مخصصة' };

function load() {
  let f = {}; try { f = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch {}
  return { token: f.token || process.env.DISCORD_TOKEN || '', clientId: f.clientId || process.env.CLIENT_ID || '', guildId: f.guildId || process.env.GUILD_ID || '' };
}
let creds = load();
const syncEnv = () => { process.env.GUILD_ID = creds.guildId; process.env.CLIENT_ID = creds.clientId; };
syncEnv();
function saveCreds({ token, clientId, guildId }) {
  const next = { ...creds };
  if (token && token.trim()) next.token = token.trim().replace(/^Bot\s+/i, '');
  if (clientId !== undefined) next.clientId = String(clientId).trim();
  if (guildId !== undefined) next.guildId = String(guildId).trim();
  if (next.guildId && !/^\d{15,22}$/.test(next.guildId)) throw new Error('ايدي السيرفر غير صحيح (أرقام فقط)');
  if (next.clientId && !/^\d{15,22}$/.test(next.clientId)) throw new Error('ايدي البوت (Client ID) غير صحيح');
  if (next.token && !/^[\w-]{20,}\.[\w-]{5,}\.[\w-]{20,}$/.test(next.token)) throw new Error('شكل التوكن غير صحيح');
  creds = next; syncEnv();
  fs.writeFileSync(FILE, JSON.stringify(creds), { mode: 0o600 });
}

let client, state = 'stopped', lastError = '', startedAt = 0, busy = false, onReadyFn = async () => {};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function explain(e) {
  const m = `${e?.code || ''} ${e?.message || e}`;
  if (/TokenInvalid|invalid token/i.test(m)) return 'التوكن غير صحيح';
  if (/DisallowedIntents|disallowed intents|privileged intent/i.test(m)) return 'فعّل Server Members Intent و Message Content Intent من Developer Portal ← Bot ← Privileged Gateway Intents';
  return String(e?.message || e).slice(0, 300);
}

function presence() {
  const status = STATUSES[S('bot_status')] ? S('bot_status') : 'online', text = (S('bot_activity_text') || '').trim(), type = ACTIVITIES[S('bot_activity_type')] ? S('bot_activity_type') : 'Playing';
  const activities = !text ? [] : type === 'Custom' ? [{ name: 'Custom Status', state: text.slice(0, 128), type: ActivityType.Custom }] : [{ name: text.slice(0, 128), type: ActivityType[type] }];
  return { status, activities };
}
function applyPresence() { try { client?.user?.setPresence(presence()); } catch (e) { console.error('[presence]', e.message); } }
function setPresence({ status, type, text }) {
  if (status !== undefined) { if (!STATUSES[status]) throw new Error('حالة غير صحيحة'); setS('bot_status', status); }
  if (type !== undefined) { if (!ACTIVITIES[type]) throw new Error('نوع النشاط غير صحيح'); setS('bot_activity_type', type); }
  if (text !== undefined) setS('bot_activity_text', String(text).slice(0, 128));
  applyPresence();
}

function attach(c, onReady) {
  client = c; onReadyFn = onReady;
  c.on('ready', async () => {
    state = 'online'; startedAt = Date.now(); lastError = '';
    applyPresence();
    try { await onReadyFn(c); } catch (e) { lastError = `البوت اشتغل لكن حصل خطأ بالتجهيز: ${explain(e)}`; console.error(e); }
  });
  c.on('shardReady', applyPresence); c.on('shardResume', applyPresence);
  c.on('error', (e) => console.error('[client]', e.message));
  c.on('invalidated', () => { state = 'error'; lastError = 'الجلسة انتهت (التوكن اتغيّر أو انرسل ريست)'; });
}
async function start() {
  if (busy || ['starting', 'online'].includes(state)) return;
  if (!creds.token) throw new Error('حط توكن البوت أولاً');
  if (!creds.guildId) throw new Error('حط ايدي السيرفر أولاً');
  busy = true; state = 'starting'; lastError = '';
  try { await client.login(creds.token); }
  catch (e) { state = 'error'; lastError = explain(e); try { await client.destroy(); } catch {} throw new Error(lastError); }
  finally { busy = false; }
}
async function stop() {
  if (busy) return; busy = true;
  try { await client.destroy(); client.guilds.cache.clear(); state = 'stopped'; startedAt = 0; lastError = ''; }
  finally { busy = false; }
}
async function restart() { await stop(); await sleep(1500); await start(); }
const canAutostart = () => !!(creds.token && creds.guildId && S('bot_autostart') === '1');

function status() {
  const g = client?.guilds.cache.get(creds.guildId);
  return {
    state, lastError, hasToken: !!creds.token, tokenTail: creds.token ? creds.token.slice(-4) : '', clientId: creds.clientId || client?.user?.id || '', guildId: creds.guildId,
    tag: client?.user?.tag || '', avatar: client?.user?.displayAvatarURL?.() || '', ping: state === 'online' ? client.ws.ping : null, uptime: startedAt ? Date.now() - startedAt : 0,
    guilds: state === 'online' ? client.guilds.cache.size : 0, guildFound: !!g, guildName: g?.name || '', members: g?.memberCount || 0,
    presence: { status: S('bot_status') || 'online', type: S('bot_activity_type') || 'Playing', text: S('bot_activity_text') || '' }, autostart: S('bot_autostart') === '1',
  };
}

// أمر ديسكورد لتغيير الحالة (المالك فقط)
const commands = [
  new SlashCommandBuilder().setName('bot-status').setDescription('تغيير حالة البوت ونشاطه').setDefaultMemberPermissions(P.Administrator)
    .addStringOption((o) => o.setName('status').setDescription('الحالة').addChoices(...Object.entries(STATUSES).map(([value, name]) => ({ name, value }))))
    .addStringOption((o) => o.setName('type').setDescription('نوع النشاط').addChoices(...Object.entries(ACTIVITIES).map(([value, name]) => ({ name, value }))))
    .addStringOption((o) => o.setName('text').setDescription('نص النشاط (فاضي = بدون نشاط)')),
].map((c) => c.toJSON());
async function onCommand(i) {
  if (i.commandName !== 'bot-status') return false;
  if (!(await require('./backup').allowed(i))) return i.reply({ content: '❌ لمالك السيرفر/البوت فقط', flags: EPH }), true;
  const st = i.options.getString('status'), ty = i.options.getString('type'), tx = i.options.getString('text');
  setPresence({ status: st ?? undefined, type: ty ?? undefined, text: tx ?? undefined });
  const p = presence();
  return i.reply({ content: `✅ الحالة: ${STATUSES[p.status]}${p.activities.length ? ` • ${ACTIVITIES[S('bot_activity_type')]} ${S('bot_activity_text')}` : ''}`, flags: EPH }), true;
}

module.exports = { attach, start, stop, restart, status, saveCreds, setPresence, canAutostart, creds: () => creds, commands, onCommand, STATUSES, ACTIVITIES };
