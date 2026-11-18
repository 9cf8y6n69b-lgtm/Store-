// حماية السيرفر المتقدمة: استرجاع الرومات والرتب المحذوفة + حماية الويب هوكس
const { AuditLogEvent: A, ChannelType: T, OverwriteType } = require('discord.js');
const { db, S, setS, SCHEMA } = require('./db');
const protect = require('./protect');
const on = (k) => S(k) === '1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const idMap = new Map();
const KINDS = [T.GuildText, T.GuildVoice, T.GuildCategory, T.GuildAnnouncement, T.GuildStageVoice, T.GuildForum];
const shopChannel = (c) => /^(order|ticket)-\d+$/.test(c.name || '') || [S('order_category'), S('tk_category')].filter(Boolean).includes(c.parentId);

// ---------- اللقطات (Snapshots) ----------
const putSnap = (kind, id, data) => db.prepare('INSERT OR REPLACE INTO snapshot(kind,id,data) VALUES(?,?,?)').run(kind, id, JSON.stringify(data));
const getSnap = (kind, id) => { const r = db.prepare('SELECT data FROM snapshot WHERE kind=? AND id=?').get(kind, id); return r ? JSON.parse(r.data) : null; };
const delSnap = (kind, id) => db.prepare('DELETE FROM snapshot WHERE kind=? AND id=?').run(kind, id);
const snapChannel = (c) => ({
  id: c.id, name: c.name, type: c.type, parentId: c.parentId || null, position: c.rawPosition, topic: c.topic || null, nsfw: !!c.nsfw, rateLimitPerUser: c.rateLimitPerUser || 0,
  bitrate: c.bitrate || null, userLimit: c.userLimit || 0,
  overwrites: [...c.permissionOverwrites.cache.values()].map((o) => ({ id: o.id, type: o.type, allow: o.allow.bitfield.toString(), deny: o.deny.bitfield.toString() })),
});
const snapRole = (r) => ({ id: r.id, name: r.name, color: r.color, hoist: r.hoist, mentionable: r.mentionable, permissions: r.permissions.bitfield.toString(), position: r.position, members: [...r.members.keys()].slice(0, 3000) });
function keepChannel(c) { if (KINDS.includes(c.type) && !shopChannel(c)) putSnap('channel', c.id, snapChannel(c)); }
function keepRole(r) { if (r.id !== r.guild.id && !r.managed) putSnap('role', r.id, snapRole(r)); }
function fullSnapshot(guild) {
  const chs = new Set(), roles = new Set();
  guild.channels.cache.forEach((c) => { if (KINDS.includes(c.type) && !shopChannel(c)) { chs.add(c.id); putSnap('channel', c.id, snapChannel(c)); } });
  guild.roles.cache.forEach((r) => { if (r.id !== guild.id && !r.managed) { roles.add(r.id); putSnap('role', r.id, snapRole(r)); } });
  for (const r of db.prepare('SELECT kind,id FROM snapshot').all()) if (!(r.kind === 'channel' ? chs : roles).has(r.id)) delSnap(r.kind, r.id);
}

// ---------- تحديث الايديات القديمة بالجديدة ----------
function replaceIds(oldId, newId) {
  for (const [, key, , type] of SCHEMA) {
    if (!['role', 'roles', 'channel', 'category'].includes(type)) continue;
    const cur = S(key); if (!cur) continue;
    if (type === 'roles') { if (cur.split(',').includes(oldId)) setS(key, cur.split(',').map((x) => (x === oldId ? newId : x)).join(',')); }
    else if (cur === oldId) setS(key, newId);
  }
  const q = (sql, ...a) => { try { db.prepare(sql).run(...a); } catch {} };
  q('UPDATE autoreplies SET channel_id=? WHERE channel_id=?', newId, oldId); q('UPDATE level_roles SET role_id=? WHERE role_id=?', newId, oldId);
  q('UPDATE cmds SET role=? WHERE role=?', newId, oldId); q('UPDATE role_panels SET channel_id=? WHERE channel_id=?', newId, oldId);
  q('UPDATE role_panels SET roles=replace(roles,?,?)', oldId, newId); q('UPDATE giveaways SET req_role=? WHERE req_role=?', newId, oldId);
  q('UPDATE giveaways SET channel_id=? WHERE channel_id=?', newId, oldId); q('UPDATE suggestions SET channel_id=? WHERE channel_id=?', newId, oldId);
}

// ---------- الاسترجاع ----------
async function restoreChannel(guild, s) {
  const parent = s.parentId && guild.channels.cache.get(idMap.get(s.parentId) || s.parentId);
  const ow = s.overwrites.map((o) => ({ id: idMap.get(o.id) || o.id, type: o.type, allow: BigInt(o.allow), deny: BigInt(o.deny) }))
    .filter((o) => (o.type === OverwriteType.Role ? guild.roles.cache.has(o.id) : guild.members.cache.has(o.id)));
  const opts = { name: s.name, type: s.type, permissionOverwrites: ow, reason: 'حماية: استرجاع روم محذوف' };
  if (s.type !== T.GuildCategory && parent) opts.parent = parent.id;
  if ([T.GuildText, T.GuildAnnouncement, T.GuildForum].includes(s.type)) Object.assign(opts, { topic: s.topic || undefined, nsfw: s.nsfw, rateLimitPerUser: s.rateLimitPerUser });
  if ([T.GuildVoice, T.GuildStageVoice].includes(s.type)) Object.assign(opts, { bitrate: s.bitrate || undefined, userLimit: s.userLimit });
  const c = await guild.channels.create(opts).catch(() => guild.channels.create({ ...opts, bitrate: undefined }));
  idMap.set(s.id, c.id);
  await c.setPosition(s.position).catch(() => {});
  replaceIds(s.id, c.id);
  delSnap('channel', s.id); keepChannel(c);
  if (s.type === T.GuildCategory) // أبناء الكاتيجوري المحذوفة يرجعون لها
    for (const r of db.prepare("SELECT data FROM snapshot WHERE kind='channel'").all()) {
      const k = JSON.parse(r.data); if (k.parentId !== s.id) continue;
      const kid = guild.channels.cache.get(k.id); if (kid && !kid.parentId) await kid.setParent(c.id, { lockPermissions: false }).catch(() => {});
    }
  return c;
}
async function restoreRole(guild, s) {
  const role = await guild.roles.create({ name: s.name, color: s.color, hoist: s.hoist, mentionable: s.mentionable, permissions: BigInt(s.permissions), reason: 'حماية: استرجاع رتبة محذوفة' });
  idMap.set(s.id, role.id);
  await role.setPosition(Math.max(1, Math.min(s.position, guild.members.me.roles.highest.position - 1))).catch(() => {});
  replaceIds(s.id, role.id);
  delSnap('role', s.id);
  // صلاحيات الرومات اللي كانت فيها هذي الرتبة
  for (const r of db.prepare("SELECT data FROM snapshot WHERE kind='channel'").all()) {
    const k = JSON.parse(r.data), o = k.overwrites.find((x) => x.id === s.id); if (!o) continue;
    const ch = guild.channels.cache.get(idMap.get(k.id) || k.id); if (!ch) continue;
    const cur = [...ch.permissionOverwrites.cache.values()].map((x) => ({ id: x.id, type: x.type, allow: x.allow.bitfield, deny: x.deny.bitfield }));
    cur.push({ id: role.id, type: OverwriteType.Role, allow: BigInt(o.allow), deny: BigInt(o.deny) });
    await ch.permissionOverwrites.set(cur).catch(() => {});
    o.id = role.id; putSnap('channel', k.id, k);
  }
  keepRole(role);
  // إرجاع الرتبة للأعضاء في الخلفية
  (async () => {
    let n = 0;
    for (const uid of s.members) { const m = guild.members.cache.get(uid) || await guild.members.fetch(uid).catch(() => null); if (m && !m.roles.cache.has(role.id) && await m.roles.add(role).then(() => true).catch(() => false)) { n++; await sleep(300); } }
    protect.plog(guild, '♻️ إرجاع الرتبة للأعضاء', `تم إرجاع <@&${role.id}> لـ **${n}** عضو.`, 0x06d6a0);
  })();
  return role;
}
async function onDeleted(guild, kind, id, label) {
  const snap = getSnap(kind, id); // نقرأها فوراً قبل أي انتظار
  if (!snap || !on('protect_enabled') || !on('restore_deleted')) return;
  if (kind === 'channel' && shopChannel(snap)) return delSnap(kind, id);
  const e = await protect.lastAudit(guild, kind === 'channel' ? A.ChannelDelete : A.RoleDelete, id);
  if (!e?.executor) { delSnap(kind, id); return protect.plog(guild, `⚠️ ${label} انحذف`, `**${snap.name}** انحذف وما قدرت أعرف مين حذفه (تأكد أن البوت عنده صلاحية *عرض سجل التدقيق*). ما استرجعته.`, 0xffd166); }
  if (protect.authorized(guild, e.executor)) return delSnap(kind, id);
  try {
    const x = kind === 'channel' ? await restoreChannel(guild, snap) : await restoreRole(guild, snap);
    protect.plog(guild, `♻️ استرجاع ${label} محذوف`, `**${snap.name}** حذفه ${e.executor} (\`${e.executor.id}\`)\nتم استرجاعه: ${kind === 'channel' ? `<#${x.id}>` : `<@&${x.id}>`}\n${kind === 'channel' ? '⚠️ الرسائل ما ترجع. لو كان فيه بانلات اكتب `/setup-server` لإعادة إرسالها.' : 'وتم إرجاعه للأعضاء وصلاحيات الرومات.'}`, 0x06d6a0);
  } catch (err) { protect.plog(guild, `❌ تعذر استرجاع ${label}`, `**${snap.name}** — ${err.message}`); }
}

// ---------- الويب هوكس ----------
const seen = new Set();
async function webhookGuard(ch) {
  const g = ch.guild; if (!g || !on('protect_enabled') || !on('anti_webhook')) return;
  await sleep(1200);
  const logs = await g.fetchAuditLogs({ type: A.WebhookCreate, limit: 5 }).catch(() => null); if (!logs) return;
  for (const e of logs.entries.values()) {
    if (Date.now() - e.createdTimestamp > 20000 || seen.has(e.id)) continue;
    seen.add(e.id); if (seen.size > 200) seen.delete(seen.values().next().value);
    const by = e.executor; if (!by || protect.authorized(g, by)) continue;
    const hook = (await ch.fetchWebhooks().catch(() => null))?.get(e.targetId);
    if (hook) await hook.delete('حماية: ويب هوك غير مصرح').catch(() => {});
    protect.plog(g, '🪝 ويب هوك غير مصرح', `**المنشئ:** ${by} (\`${by.id}\`)\n**الروم:** ${ch}\n**الإجراء:** ${hook ? 'تم حذف الويب هوك' : 'ما لقيت الويب هوك لحذفه'}\nاستثنِ الشخص من الإعدادات (ايديات مستثناة) لو كان موثوقاً.`);
    await protect.countAction(g, by, 'إنشاء ويب هوكس');
  }
}

function init(client) {
  const guild = () => client.guilds.cache.get(process.env.GUILD_ID);
  const snapNow = () => { const g = guild(); if (g) try { fullSnapshot(g); } catch (e) { console.error('[guard]', e.message); } };
  setTimeout(async () => { const g = guild(); if (g) { await g.members.fetch().catch(() => {}); snapNow(); } }, 8e3);
  setInterval(snapNow, 10 * 6e4);
  client.on('channelCreate', (c) => c.guild && keepChannel(c));
  client.on('channelUpdate', (_, c) => c.guild && keepChannel(c));
  client.on('roleCreate', (r) => keepRole(r));
  client.on('roleUpdate', (_, r) => keepRole(r));
  client.on('channelDelete', (c) => c.guild && onDeleted(c.guild, 'channel', c.id, 'روم').catch(console.error));
  client.on('roleDelete', (r) => onDeleted(r.guild, 'role', r.id, 'رتبة').catch(console.error));
  client.on('webhooksUpdate', (ch) => webhookGuard(ch).catch(console.error));
}
module.exports = { init, fullSnapshot };
// تم صنع البوت بمتجر نوفا ستور • يوزر الاونر: .5yb.
