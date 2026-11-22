// البوتات المستضافة: تضيف توكن بوت عميل، تختار له قوالب جاهزة، ويشتغل داخل نفس البرنامج (كل بوت Client مستقل)
const fs = require('fs'), path = require('path');
const { Client, GatewayIntentBits: I, Partials, REST, Routes, ActivityType } = require('discord.js');
const { db } = require('./hdb');
const { dirs } = require('./files');
const T = require('./templates');
const TOK = path.join(dirs.data, 'hosted_tokens.json'); // التوكنات خارج قاعدة البيانات (ما تدخل النسخ الاحتياطية)
const readTok = () => { try { return JSON.parse(fs.readFileSync(TOK, 'utf8')); } catch { return {}; } };
const writeTok = (o) => fs.writeFileSync(TOK, JSON.stringify(o), { mode: 0o600 });
const running = new Map(); // id -> { client, state, error, startedAt, logs, timers }
const j = (s, d) => { try { return JSON.parse(s); } catch { return d; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TOKEN_RE = /^[\w-]{20,}\.[\w-]{5,}\.[\w-]{20,}$/;
const clientIdOf = (t) => { try { return Buffer.from(t.split('.')[0], 'base64').toString(); } catch { return ''; } };
let hooks = { notify: async () => {}, mainToken: () => '' };

const get = (id) => db.prepare('SELECT * FROM hosted_bots WHERE id=?').get(id);
function explain(e) {
  const m = `${e?.code || ''} ${e?.message || e}`;
  if (/TokenInvalid|invalid token/i.test(m)) return 'التوكن غير صحيح';
  if (/DisallowedIntents|privileged intent/i.test(m)) return 'فعّل Server Members Intent و Message Content Intent لهذا البوت من Developer Portal';
  return String(e?.message || e).slice(0, 250);
}
const view = (r) => {
  const rt = running.get(r.id), tk = readTok()[r.id], c = rt?.client;
  return {
    ...r, rights: j(r.rights, {}), suspended: !!r.suspended, portal_salt: undefined, portal_hash: undefined, hasPortal: !!r.portal_hash, templates: j(r.templates, []), config: j(r.config, {}), presence: j(r.presence, {}), hasToken: !!tk, tokenTail: tk ? tk.slice(-4) : '',
    state: rt?.state || 'stopped', error: rt?.error || '', tag: c?.user?.tag || '', avatar: c?.user?.displayAvatarURL?.() || '', ping: rt?.state === 'online' ? c.ws.ping : null,
    uptime: rt?.startedAt ? Date.now() - rt.startedAt : 0, guilds: rt?.state === 'online' ? c.guilds.cache.size : 0, expired: !!(r.expires && r.expires < Date.now()),
    invite: r.client_id ? `https://discord.com/oauth2/authorize?client_id=${r.client_id}&permissions=8&scope=bot%20applications.commands` : '',
  };
};
const list = () => db.prepare('SELECT * FROM hosted_bots ORDER BY id DESC').all().map(view);

function validate(tpls) {
  if (!Array.isArray(tpls) || !tpls.length) throw new Error('اختر قالب واحد على الأقل');
  for (const t of tpls) if (!T.get(t)) throw new Error(`قالب غير معروف: ${t}`);
  return [...new Set(tpls)];
}
function checkToken(token, exceptId) {
  if (!TOKEN_RE.test(token || '')) throw new Error('شكل التوكن غير صحيح');
  if (token === hooks.mainToken()) throw new Error('هذا توكن بوت المتجر نفسه، استخدم توكن بوت ثاني');
  for (const [id, t] of Object.entries(readTok())) if (t === token && +id !== +exceptId) throw new Error('هذا التوكن مستخدم في بوت آخر');
}
function create({ name, token, templates, guildId, ownerId, orderId, days, note, pkg, rights, channelId }) {
  token = String(token || '').trim().replace(/^Bot\s+/i, ''); checkToken(token);
  const tpls = validate(templates);
  if (guildId && !/^\d{15,22}$/.test(guildId)) throw new Error('ايدي السيرفر غير صحيح');
  const r = db.prepare('INSERT INTO hosted_bots(name,client_id,guild_id,owner_id,order_id,templates,expires,note,created) VALUES(?,?,?,?,?,?,?,?,?)')
    .run(String(name || 'بوت عميل').slice(0, 60), clientIdOf(token), guildId || '', ownerId || '', +orderId || 0, JSON.stringify(tpls), +days > 0 ? Date.now() + days * 864e5 : 0, String(note || '').slice(0, 300), Date.now());
  const tk = readTok(); tk[r.lastInsertRowid] = token; writeTok(tk);
  db.prepare('UPDATE hosted_bots SET package=?, rights=?, channel_id=? WHERE id=?').run(pkg || '', JSON.stringify(rights || {}), channelId || '', r.lastInsertRowid);
  return get(r.lastInsertRowid);
}
function update(id, b) {
  const r = get(id); if (!r) throw new Error('البوت غير موجود');
  const v = { ...r };
  if (b.name !== undefined) v.name = String(b.name).slice(0, 60);
  if (b.templates !== undefined) v.templates = JSON.stringify(validate(b.templates));
  if (b.guildId !== undefined) { if (b.guildId && !/^\d{15,22}$/.test(b.guildId)) throw new Error('ايدي السيرفر غير صحيح'); v.guild_id = b.guildId; }
  if (b.ownerId !== undefined) v.owner_id = b.ownerId;
  if (b.orderId !== undefined) v.order_id = +b.orderId || 0;
  if (b.note !== undefined) v.note = String(b.note).slice(0, 300);
  if (b.autostart !== undefined) v.autostart = b.autostart ? 1 : 0;
  if (b.config !== undefined) v.config = JSON.stringify(b.config);
  if (b.presence !== undefined) v.presence = JSON.stringify(b.presence);
  if (b.addDays) v.expires = Math.max(Date.now(), r.expires || 0) + (+b.addDays) * 864e5; // تمديد الاشتراك
  if (b.noExpiry) v.expires = 0;
  if (b.package !== undefined) v.package = String(b.package);
  if (b.rights !== undefined) v.rights = JSON.stringify(b.rights);
  if (v.expires !== r.expires) v.remind_stage = 0;  // اشتراك جديد ← تنبيهات جديدة
  if (b.token) { const t = String(b.token).trim().replace(/^Bot\s+/i, ''); checkToken(t, id); const tk = readTok(); tk[id] = t; writeTok(tk); v.client_id = clientIdOf(t); }
  db.prepare('UPDATE hosted_bots SET name=?,client_id=?,guild_id=?,owner_id=?,order_id=?,templates=?,config=?,presence=?,autostart=?,expires=?,note=?,package=?,rights=?,remind_stage=? WHERE id=?')
    .run(v.name, v.client_id, v.guild_id, v.owner_id, v.order_id, v.templates, v.config, v.presence, v.autostart, v.expires, v.note, v.package, v.rights, v.remind_stage, id);
  if (b.presence !== undefined) applyPresence(id);
  return view(get(id));
}
async function remove(id) {
  await stop(id).catch(() => {});
  for (const t of ['hosted_bots WHERE id', 'hosted_users WHERE bot_id', 'hosted_data WHERE bot_id', 'hosted_warns WHERE bot_id']) db.prepare(`DELETE FROM ${t}=?`).run(id);
  const tk = readTok(); delete tk[id]; writeTok(tk);
}

function applyPresence(id) {
  const rt = running.get(id); if (!rt?.client?.user) return;
  const p = j(get(id)?.presence, {}), types = { Playing: 0, Listening: 2, Watching: 3, Competing: 5 };
  const text = (p.text || '').trim();
  try { rt.client.user.setPresence({ status: ['online', 'idle', 'dnd', 'invisible'].includes(p.status) ? p.status : 'online', activities: text ? [p.type === 'Custom' ? { name: 'Custom Status', state: text.slice(0, 128), type: ActivityType.Custom } : { name: text.slice(0, 128), type: types[p.type] ?? 0 }] : [] }); } catch {}
}

// سياق القالب: كل قالب يحصل على أدوات آمنة (أحداث بحماية أخطاء، مؤقتات تتنظف عند الإيقاف، تخزين، أعضاء)
function makeCtx(row, rt, tpl) {
  const id = row.id, log = (m) => { rt.logs.push(`[${new Date().toISOString().slice(11, 19)}] ${m}`); if (rt.logs.length > 200) rt.logs.shift(); };
  const defaults = Object.fromEntries((tpl.settings || []).map((s) => [s.key, s.def ?? '']));
  const ensure = (g, u) => db.prepare('INSERT OR IGNORE INTO hosted_users(bot_id,guild_id,user_id) VALUES(?,?,?)').run(id, g, u);
  const COLS = ['xp', 'balance', 'last_msg', 'last_daily', 'last_work'];
  return {
    id, tid: tpl.id, client: rt.client, log, onStop: (fn) => rt.stops.push(fn),
    bot: () => get(id) || row,
    cfg: () => ({ ...defaults, ...(j(get(id)?.config, {})[tpl.id] || {}) }),
    on: (ev, fn) => rt.client.on(ev, (...a) => Promise.resolve().then(() => fn(...a)).catch((e) => log(`⚠️ ${tpl.id}/${ev}: ${e.message}`))),
    every: (ms, fn) => { const t = setInterval(() => Promise.resolve().then(fn).catch((e) => log(`⚠️ ${tpl.id}: ${e.message}`)), ms); rt.timers.push(t); return t; },
    later: (ms, fn) => { const t = setTimeout(() => Promise.resolve().then(fn).catch((e) => log(`⚠️ ${tpl.id}: ${e.message}`)), ms); rt.timers.push(t); return t; },
    kv: { get: (k, d) => { const r = db.prepare('SELECT v FROM hosted_data WHERE bot_id=? AND k=?').get(id, `${tpl.id}:${k}`); return r ? j(r.v, d) : d; }, set: (k, v) => db.prepare('INSERT INTO hosted_data(bot_id,k,v) VALUES(?,?,?) ON CONFLICT(bot_id,k) DO UPDATE SET v=excluded.v').run(id, `${tpl.id}:${k}`, JSON.stringify(v)) },
    user: {
      get: (g, u) => { ensure(g, u); return db.prepare('SELECT * FROM hosted_users WHERE bot_id=? AND guild_id=? AND user_id=?').get(id, g, u); },
      add: (g, u, col, d) => { if (!COLS.includes(col)) throw new Error('bad col'); ensure(g, u); db.prepare(`UPDATE hosted_users SET ${col}=${col}+? WHERE bot_id=? AND guild_id=? AND user_id=?`).run(d, id, g, u); },
      set: (g, u, col, v) => { if (!COLS.includes(col)) throw new Error('bad col'); ensure(g, u); db.prepare(`UPDATE hosted_users SET ${col}=? WHERE bot_id=? AND guild_id=? AND user_id=?`).run(v, id, g, u); },
      top: (g, col, n = 10) => { if (!COLS.includes(col)) throw new Error('bad col'); return db.prepare(`SELECT user_id,${col} v FROM hosted_users WHERE bot_id=? AND guild_id=? AND ${col}>0 ORDER BY ${col} DESC LIMIT ?`).all(id, g, n); },
      rank: (g, col, v) => db.prepare(`SELECT COUNT(*)+1 r FROM hosted_users WHERE bot_id=? AND guild_id=? AND ${col}>?`).get(id, g, v).r,
      transfer: (g, from, to, amt) => db.transaction(() => { ensure(g, from); ensure(g, to); const b = db.prepare('SELECT balance FROM hosted_users WHERE bot_id=? AND guild_id=? AND user_id=?').get(id, g, from).balance; if (b < amt) return false; db.prepare('UPDATE hosted_users SET balance=balance-? WHERE bot_id=? AND guild_id=? AND user_id=?').run(amt, id, g, from); db.prepare('UPDATE hosted_users SET balance=balance+? WHERE bot_id=? AND guild_id=? AND user_id=?').run(amt, id, g, to); return true; })(),
    },
    warns: {
      add: (g, u, m, reason) => db.prepare('INSERT INTO hosted_warns(bot_id,guild_id,user_id,mod_id,reason,created) VALUES(?,?,?,?,?,?)').run(id, g, u, m, reason, Date.now()),
      list: (g, u) => db.prepare('SELECT * FROM hosted_warns WHERE bot_id=? AND guild_id=? AND user_id=? ORDER BY id DESC LIMIT 15').all(id, g, u),
      clear: (g, u) => db.prepare('DELETE FROM hosted_warns WHERE bot_id=? AND guild_id=? AND user_id=?').run(id, g, u).changes,
    },
  };
}

async function registerCommands(rt, row, tpls) {
  const body = [], seen = new Set();
  for (const t of tpls) for (const c of t.commands || []) { const json = c.toJSON(); if (!seen.has(json.name)) { seen.add(json.name); body.push(json); } }
  if (!body.length) return;
  const rest = new REST().setToken(readTok()[row.id]);
  for (const g of rt.client.guilds.cache.values()) {
    if (row.guild_id && g.id !== row.guild_id) continue;
    await rest.put(Routes.applicationGuildCommands(rt.client.user.id, g.id), { body }).then(() => rt.log(`✅ سُجّلت ${body.length} أوامر في ${g.name}`)).catch((e) => rt.log(`❌ تسجيل الأوامر في ${g.name}: ${e.message}`));
  }
}

async function start(id) {
  const row = get(id); if (!row) throw new Error('البوت غير موجود');
  const token = readTok()[id]; if (!token) throw new Error('ما فيه توكن لهذا البوت (أضفه من التعديل)');
  if (row.expires && row.expires < Date.now()) throw new Error('انتهى اشتراك هذا البوت — مدّد المدة أولاً');
  if (token === hooks.mainToken()) throw new Error('هذا توكن بوت المتجر نفسه');
  if (row.suspended) throw new Error('هذا البوت موقوف (مفصول) من الإدارة');
  const cur = running.get(id); if (cur && ['starting', 'online'].includes(cur.state)) return;
  if (!row.autostart) db.prepare('UPDATE hosted_bots SET autostart=1 WHERE id=?').run(id);
  const tpls = j(row.templates, []).map((t) => T.get(t)).filter(Boolean);
  if (!tpls.length) throw new Error('ما فيه قوالب مفعّلة');
  const intents = new Set([I.Guilds]); tpls.forEach((t) => (t.intents || []).forEach((n) => intents.add(I[n])));
  const client = new Client({ intents: [...intents], partials: [Partials.Message, Partials.Channel, Partials.GuildMember] });
  const rt = { client, state: 'starting', error: '', startedAt: 0, logs: [], timers: [], stops: [], log: null };
  rt.log = (m) => { rt.logs.push(`[${new Date().toISOString().slice(11, 19)}] ${m}`); if (rt.logs.length > 200) rt.logs.shift(); };
  running.set(id, rt);
  const ctxs = {};
  for (const t of tpls) { const c = ctxs[t.id] = makeCtx(row, rt, t); try { t.init?.(c); } catch (e) { rt.log(`❌ تهيئة ${t.id}: ${e.message}`); } }
  client.on('interactionCreate', async (i) => {
    try { for (const t of tpls) if (t.onInteraction && await t.onInteraction(i, ctxs[t.id])) return; }
    catch (e) { rt.log(`⚠️ تفاعل: ${e.message}`); const m = { content: '⚠️ صار خطأ، حاول مرة ثانية', flags: 64 }; (i.replied || i.deferred ? i.followUp(m) : i.reply(m)).catch(() => {}); }
  });
  client.on('error', (e) => rt.log(`client: ${e.message}`));
  client.on('guildCreate', () => registerCommands(rt, row, tpls));
  client.once('ready', async () => { rt.state = 'online'; rt.startedAt = Date.now(); rt.error = ''; rt.log(`✅ ${client.user.tag}`); applyPresence(id); await registerCommands(rt, row, tpls); });
  try { await client.login(token); }
  catch (e) { rt.state = 'error'; rt.error = explain(e); rt.log(`❌ ${rt.error}`); await teardown(id, true); throw new Error(rt.error); }
}
async function teardown(id, keepState) {
  const rt = running.get(id); if (!rt) return;
  rt.timers.forEach((t) => { clearInterval(t); clearTimeout(t); });
  for (const f of rt.stops || []) { try { f(); } catch {} }
  try { await rt.client.destroy(); } catch {}
  if (!keepState) running.delete(id);
}
async function stop(id) { db.prepare('UPDATE hosted_bots SET autostart=0 WHERE id=?').run(id); const rt = running.get(id); if (!rt) return; await teardown(id); }
// فصل: إيقاف + منع التشغيل حتى يرجّعه المالك
async function suspend(id, on = true) { db.prepare('UPDATE hosted_bots SET suspended=?, autostart=? WHERE id=?').run(on ? 1 : 0, on ? 0 : 1, id); if (on) await teardown(id).catch(() => {}); else await start(id); }
const clientOf = (id) => (running.get(id)?.state === 'online' ? running.get(id).client : null);
async function restart(id) { const rt = running.get(id); if (rt) await teardown(id); await sleep(1500); await start(id); }

const logsOf = (id) => running.get(id)?.logs || [];
// ايديات القنوات والرتب للقوائم المنسدلة في الداشبورد (من السيرفر المحدد أو أول سيرفر)
function guildInfo(id) {
  const rt = running.get(id), row = get(id); if (!rt || rt.state !== 'online') return null;
  const g = (row.guild_id && rt.client.guilds.cache.get(row.guild_id)) || rt.client.guilds.cache.first(); if (!g) return null;
  return { id: g.id, name: g.name, roles: g.roles.cache.filter((r) => r.name !== '@everyone').map((r) => ({ id: r.id, name: r.name })), channels: g.channels.cache.filter((c) => [0, 2, 4].includes(c.type)).map((c) => ({ id: c.id, name: ({ 0: '# ', 2: '🔊 ', 4: '📁 ' })[c.type] + c.name, type: c.type })) };
}

// تشغيل تلقائي + مراقب (يعيد تشغيل البوت لو وقع) + تنبيهات الاشتراك (تُرسل عبر hooks.remind)
const attempts = new Map();
function init(h) {
  hooks = { ...hooks, ...h };
  (async () => { for (const r of db.prepare('SELECT * FROM hosted_bots WHERE autostart=1 AND suspended=0').all()) { await start(r.id).catch((e) => console.error(`[hosted ${r.id}]`, e.message)); await sleep(2000); } })();
  const watchdog = async () => {
    for (const r of db.prepare('SELECT * FROM hosted_bots WHERE autostart=1 AND suspended=0').all()) {
      if (r.expires && r.expires < Date.now()) continue;
      const rt = running.get(r.id); if (rt && ['online', 'starting'].includes(rt.state)) { attempts.delete(r.id); continue; }
      const a = attempts.get(r.id) || { n: 0, at: 0 }; if (Date.now() - a.at < Math.min(30, 2 ** a.n * 2) * 6e4) continue;
      if (rt?.error && /التوكن غير صحيح/.test(rt.error)) continue;   // توكن خاطئ: لا فائدة من إعادة المحاولة
      attempts.set(r.id, { n: a.n + 1, at: Date.now() }); await teardown(r.id).catch(() => {});
      await start(r.id).then(() => hooks.registry?.(r.id)).catch((e) => console.error(`[hosted ${r.id}] watchdog:`, e.message));
    }
  };
  const subs = async () => {
    const days = String(hooks.remindDays?.() || '3,1').split(',').map((x) => +x.trim()).filter((x) => x > 0).sort((a, b) => b - a);
    for (const r of db.prepare('SELECT * FROM hosted_bots WHERE expires>0 AND suspended=0').all()) {
      const left = r.expires - Date.now(), total = days.length + 1;  // المراحل: كل يوم مذكور ثم مرحلة الانتهاء
      if (left <= 0) {
        if (r.remind_stage < total) { db.prepare('UPDATE hosted_bots SET remind_stage=? WHERE id=?').run(total, r.id); await hooks.remind?.(get(r.id), { kind: 'expired', left }); }   // قبل الإيقاف عشان البوت يقدر يرسل
        if (running.has(r.id)) await teardown(r.id).catch(() => {});
        hooks.registry?.(r.id);
        continue;
      }
      const due = days.filter((d) => left <= d * 864e5).length;   // كم مرحلة تنبيه استحقت
      if (due > r.remind_stage) { db.prepare('UPDATE hosted_bots SET remind_stage=? WHERE id=?').run(due, r.id); await hooks.remind?.(get(r.id), { kind: 'soon', left }); hooks.registry?.(r.id); }
    }
  };
  module.exports.checkSubs = subs;
  setInterval(() => watchdog().catch(console.error), 60e3); setInterval(() => subs().catch(console.error), 5 * 60e3); setTimeout(() => subs().catch(console.error), 30e3);
}

module.exports = { suspend, clientOf, init, list, view, get, create, update, remove, start, stop, restart, logsOf, guildInfo, templates: () => T.meta() };
// تم صنع البوت بمتجر نوفا ستور • يوزر الاونر: .5yb.
