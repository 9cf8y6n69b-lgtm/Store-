const express = require('express');
const session = require('express-session');
const path = require('path');
const crypto = require('crypto');
const { db, S, setS, DEFAULTS, SCHEMA } = require('./db');
const { assetPath } = require('./files');
const shop = require('./shop');
const community = require('./community');
const backup = require('./backup');
const content = require('./content');
const bl = require('./blacklist');

module.exports = (client, fn) => {
  const app = express();
  const wrap = f => async (req, res) => { try { await f(req, res); } catch (e) { console.error(e); res.status(400).json({ error: e.message }); } };
  app.use(express.json({ limit: '40mb' }));
  app.use(session({ secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'), resave: false, saveUninitialized: false, cookie: { maxAge: 864e5 * 7, httpOnly: true, sameSite: 'lax' } }));
  // الداشبورد صار يتحكم بالتوكن، فنحدّ محاولات الدخول الخاطئة: 8 محاولات كل 10 دقائق لكل IP
  const tries = new Map();
  app.post('/login', (req, res) => {
    const ip = req.ip, now = Date.now(), arr = (tries.get(ip) || []).filter((t) => now - t < 6e5);
    if (arr.length >= 8) return res.status(429).json({ error: 'محاولات كثيرة، انتظر 10 دقائق' });
    const user = String(req.body.user || '').trim(), pw = String(req.body.password || '');
    if (!user || user === 'owner') {
      if (process.env.DASH_PASSWORD && pw && pw === process.env.DASH_PASSWORD) { req.session.ok = true; req.session.role = 'owner'; req.session.name = 'owner'; return res.json({ ok: true }); }
    } else {
      const u = db.prepare('SELECT * FROM dash_users WHERE name=?').get(user);
      if (u && pw && crypto.timingSafeEqual(crypto.scryptSync(pw, u.salt, 32), Buffer.from(u.hash, 'hex'))) { req.session.ok = true; req.session.role = u.role; req.session.name = u.name; return res.json({ ok: true }); }
    }
    arr.push(now); tries.set(ip, arr);
    res.status(401).json({ error: process.env.DASH_PASSWORD ? 'باسورد خطأ' : 'DASH_PASSWORD غير محدد في ملف .env' });
  });
  // الصلاحيات: owner كل شيء • admin كل شيء ما عدا (البوت، النسخ الاحتياطي، الحسابات، البوتات المستضافة) • staff الطلبات والقرعات والاقتراحات والقائمة السوداء والتقارير
  const ADMIN_DENY = ['/bot', '/backup', '/users', '/hosted'], STAFF_OK = ['/stats', '/guild', '/schema', '/orders', '/blacklist', '/giveaways', '/suggestions', '/warns', '/report'];
  const under = (u, x) => u === x || u.startsWith(x + '/') || u.startsWith(x + '.');
  const allowed = (role, method, url) => {
    const u = url.split('?')[0];
    if (u === '/me' || role === 'owner') return true;
    if (role === 'admin') return !ADMIN_DENY.some((x) => under(u, x));
    if (role === 'staff') return (u === '/settings' && method === 'GET') || STAFF_OK.some((x) => under(u, x));
    return false;
  };
  app.use('/api', (req, res, next) => {
    if (!req.session.ok) return res.status(401).json({ error: 'auth' });
    if (!allowed(req.session.role || 'owner', req.method, req.url)) return res.status(403).json({ error: 'ما عندك صلاحية لهذا القسم' });
    next();
  });
  app.get('/api/me', (req, res) => res.json({ role: req.session.role || 'owner', name: req.session.name || 'owner' }));
  app.get('/api/users', (_, res) => res.json(db.prepare('SELECT name,role,created FROM dash_users ORDER BY created').all()));
  app.post('/api/users', wrap(async (req, res) => {
    const { name, password, role } = req.body;
    if (!/^[\w.-]{3,32}$/.test(name || '') || name === 'owner') throw new Error('اسم المستخدم 3-32 حرف إنجليزي/أرقام');
    if ((password || '').length < 8) throw new Error('الباسورد 8 أحرف على الأقل');
    if (!['admin', 'staff'].includes(role)) throw new Error('صلاحية غير صحيحة');
    const salt = crypto.randomBytes(16).toString('hex');
    db.prepare('INSERT INTO dash_users(name,salt,hash,role,created) VALUES(?,?,?,?,?) ON CONFLICT(name) DO UPDATE SET salt=excluded.salt, hash=excluded.hash, role=excluded.role')
      .run(name, salt, crypto.scryptSync(password, salt, 32).toString('hex'), role, Date.now());
    res.json({ ok: true });
  }));
  app.delete('/api/users/:name', (req, res) => { db.prepare('DELETE FROM dash_users WHERE name=?').run(req.params.name); res.json({ ok: true }); });
  app.use(express.static(path.join(__dirname, '../public')));
  // الصور: المرفوعة من الداشبورد ثم المولّدة ثم الافتراضية
  app.get('/assets/:f', (req, res) => { const f = path.basename(req.params.f); if (!/\.(png|jpe?g)$/i.test(f)) return res.sendStatus(404); res.set('Cache-Control', 'no-store').sendFile(assetPath(f)); });

  const guild = () => client.guilds.cache.get(process.env.GUILD_ID);
  const needGuild = () => { const g = guild(); if (!g) throw new Error('البوت غير متصل — شغّله من تبويب 🤖 البوت'); return g; };
  const names = async ids => {
    const g = guild(), out = {};
    await Promise.all([...new Set(ids.filter(Boolean))].map(async id => { const m = await g?.members.fetch(id).catch(() => null); out[id] = m ? m.displayName : id; }));
    return out;
  };

  app.get('/api/stats', wrap(async (_, res) => {
    const q = s => db.prepare(s).get(), top = db.prepare('SELECT * FROM staff ORDER BY points DESC LIMIT 10').all(), n = await names(top.map(t => t.user_id));
    res.json({
      orders: q('SELECT COUNT(*) c FROM orders').c, open: q("SELECT COUNT(*) c FROM orders WHERE status NOT IN ('delivered','cancelled')").c,
      delivered: q("SELECT COUNT(*) c FROM orders WHERE status='delivered'").c, avgStars: q('SELECT ROUND(AVG(stars),2) a FROM reviews').a || 0,
      tickets: q("SELECT COUNT(*) c FROM tickets WHERE status IN ('requested','open')").c, warns: q('SELECT COUNT(*) c FROM warns').c,
      members: guild()?.memberCount || 0, topStaff: top.map(t => ({ ...t, name: n[t.user_id] })),
    });
  }));
  app.get('/api/guild', (_, res) => {
    const g = guild(); if (!g) return res.json({ roles: [], channels: [] });
    res.json({ roles: g.roles.cache.filter(r => r.name !== '@everyone').map(r => ({ id: r.id, name: r.name })),
      channels: g.channels.cache.filter(c => [0, 4].includes(c.type)).map(c => ({ id: c.id, name: (c.type === 4 ? '📁 ' : '# ') + c.name, type: c.type })) });
  });
  app.get('/api/schema', (_, res) => res.json(SCHEMA.map(([group, key, label, type]) => ({ group, key, label, type }))));
  app.get('/api/settings', (_, res) => res.json(Object.fromEntries(Object.keys(DEFAULTS).map(k => [k, S(k)]))));
  app.put('/api/settings', (req, res) => { for (const [k, v] of Object.entries(req.body)) if (k in DEFAULTS) setS(k, v); res.json({ ok: true }); });

  app.get('/api/products', (_, res) => res.json(db.prepare('SELECT * FROM products ORDER BY category,id').all()));
  app.post('/api/products', (req, res) => { const b = req.body; db.prepare('INSERT INTO products(category,name,months,emoji) VALUES(?,?,?,?)').run(b.category, b.name, +b.months, b.emoji || '🤖'); res.json({ ok: true }); });
  app.put('/api/products/:id', (req, res) => { const b = req.body; db.prepare('UPDATE products SET category=?,name=?,months=?,emoji=?,active=? WHERE id=?').run(b.category, b.name, +b.months, b.emoji, b.active ? 1 : 0, req.params.id); res.json({ ok: true }); });
  app.delete('/api/products/:id', (req, res) => { db.prepare('DELETE FROM products WHERE id=?').run(req.params.id); res.json({ ok: true }); });

  app.get('/api/orders', wrap(async (_, res) => {
    const o = db.prepare('SELECT * FROM orders ORDER BY id DESC LIMIT 200').all(), n = await names(o.flatMap(x => [x.user_id, x.claimed_by]));
    res.json(o.map(x => ({ ...x, user_name: n[x.user_id], claimed_name: x.claimed_by ? n[x.claimed_by] : '' })));
  }));
  app.patch('/api/orders/:id', wrap(async (req, res) => {
    db.prepare('UPDATE orders SET status=? WHERE id=?').run(req.body.status, req.params.id);
    let o = db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id);
    if (guild()) await fn.onStatus(o).catch(console.error); // فاتورة/ضمان لو صارت مدفوع أو مسلّم
    const ch = o?.channel_id && await client.channels.fetch(o.channel_id).catch(() => null);
    if (ch) ch.send(`📌 تم تحديث حالة الطلب من الداشبورد: **${req.body.status}**`).catch(() => {});
    (await client.users.fetch(o.user_id).catch(() => null))?.send(`📌 تحديث على طلبك #${o.id}: ${req.body.status}`).catch(() => {});
    res.json({ ok: true });
  }));

  app.get('/api/coupons', (_, res) => res.json(db.prepare('SELECT * FROM coupons').all()));
  app.post('/api/coupons', (req, res) => { db.prepare('INSERT OR REPLACE INTO coupons(code,percent,max_uses) VALUES(?,?,?)').run(req.body.code.toUpperCase(), +req.body.percent, +req.body.max_uses || 0); res.json({ ok: true }); });
  app.delete('/api/coupons/:code', (req, res) => { db.prepare('DELETE FROM coupons WHERE code=?').run(req.params.code); res.json({ ok: true }); });

  app.get('/api/tkcats', (_, res) => res.json(db.prepare('SELECT * FROM tk_cats').all()));
  app.post('/api/tkcats', (req, res) => { const b = req.body; db.prepare('INSERT INTO tk_cats(name,emoji,description) VALUES(?,?,?)').run(b.name, b.emoji || '🎫', b.description || ''); res.json({ ok: true }); });
  app.put('/api/tkcats/:id', (req, res) => { const b = req.body; db.prepare('UPDATE tk_cats SET name=?,emoji=?,description=? WHERE id=?').run(b.name, b.emoji, b.description, req.params.id); res.json({ ok: true }); });
  app.delete('/api/tkcats/:id', (req, res) => { db.prepare('DELETE FROM tk_cats WHERE id=?').run(req.params.id); res.json({ ok: true }); });

  app.get('/api/levelroles', (_, res) => res.json(db.prepare('SELECT * FROM level_roles ORDER BY kind,level').all()));
  app.post('/api/levelroles', (req, res) => { db.prepare('INSERT INTO level_roles(level,role_id,kind) VALUES(?,?,?)').run(+req.body.level, req.body.role_id, req.body.kind); res.json({ ok: true }); });
  app.delete('/api/levelroles/:id', (req, res) => { db.prepare('DELETE FROM level_roles WHERE id=?').run(req.params.id); res.json({ ok: true }); });

  app.get('/api/cmds', (_, res) => res.json(db.prepare('SELECT * FROM cmds').all()));
  app.put('/api/cmds/:name', (req, res) => { const b = req.body; db.prepare('UPDATE cmds SET aliases=?,role=?,enabled=? WHERE name=?').run(b.aliases || '', b.role || '', b.enabled ? 1 : 0, req.params.name); res.json({ ok: true }); });

  app.get('/api/warns', wrap(async (_, res) => {
    const w = db.prepare('SELECT * FROM warns ORDER BY id DESC LIMIT 100').all(), n = await names(w.flatMap(x => [x.user_id, x.mod_id]));
    res.json(w.map(x => ({ ...x, user_name: n[x.user_id], mod_name: n[x.mod_id] })));
  }));
  app.delete('/api/warns/:id', (req, res) => { db.prepare('DELETE FROM warns WHERE id=?').run(req.params.id); res.json({ ok: true }); });

  app.post('/api/panel/:kind', wrap(async (req, res) => {
    if (req.params.kind === 'store') await fn.sendPanel(req.body.channel);
    else if (req.params.kind === 'tickets') await fn.ticketPanel(req.body.channel);
    else if (req.params.kind.startsWith('info:')) await fn.sendInfo(req.params.kind.slice(5), req.body.channel);
    else if (req.params.kind === 'welcome') await fn.welcomePreview(guild(), req.body.channel, req.body.user);
    res.json({ ok: true });
  }));
  app.post('/api/setup-server', wrap(async (_, res) => { fn.setupServer().then((r) => console.log('✅ تم تجهيز السيرفر', r.created.length)).catch(console.error); res.json({ ok: true }); }));
  // ================= البوتات المستضافة =================
  const hb = require('./hosted/manager');
  app.get('/api/hosted', (_, res) => res.json({ bots: hb.list(), templates: hb.templates() }));
  app.post('/api/hosted', wrap(async (req, res) => { const b = hb.create(req.body); if (req.body.start) hb.start(b.id).catch(() => {}); res.json({ ok: true, bot: hb.view(b) }); }));
  app.put('/api/hosted/:id', wrap(async (req, res) => res.json({ ok: true, bot: hb.update(+req.params.id, req.body) })));
  app.delete('/api/hosted/:id', wrap(async (req, res) => { await hb.remove(+req.params.id); res.json({ ok: true }); }));
  for (const act of ['start', 'stop', 'restart']) app.post(`/api/hosted/:id/${act}`, wrap(async (req, res) => { if (!hb.get(+req.params.id)) throw new Error('غير موجود'); await hb[act](+req.params.id); res.json({ ok: true, bot: hb.view(hb.get(+req.params.id)) }); }));
  app.get('/api/hosted/:id/logs', (req, res) => res.json(hb.logsOf(+req.params.id)));
  app.get('/api/hosted/:id/guild', (req, res) => res.json(hb.guildInfo(+req.params.id)));
  // ================= التحكم بالبوت =================
  const bc = fn.botctl;
  app.get('/api/bot', (_, res) => res.json(bc.status()));
  app.post('/api/bot/credentials', wrap(async (req, res) => {
    bc.saveCreds({ token: req.body.token, clientId: req.body.clientId, guildId: req.body.guildId });
    if (req.body.autostart !== undefined) setS('bot_autostart', req.body.autostart ? '1' : '0');
    if (req.body.start) { const st = bc.status().state; if (['online', 'starting'].includes(st)) await bc.restart(); else await bc.start(); }
    res.json({ ok: true, status: bc.status() });
  }));
  for (const act of ['start', 'stop', 'restart']) app.post(`/api/bot/${act}`, wrap(async (_, res) => { await bc[act](); res.json({ ok: true, status: bc.status() }); }));
  app.post('/api/bot/presence', wrap(async (req, res) => { bc.setPresence({ status: req.body.status, type: req.body.type, text: req.body.text }); res.json({ ok: true }); }));

  // ================= التقارير =================
  const reportQuery = (q) => { if (q.from && q.to) return [Date.parse(q.from), Date.parse(q.to) + 864e5 - 1, 'مخصص']; return shop.range(q.period || 'month'); };
  app.get('/api/report', wrap(async (req, res) => {
    const [from, to, label] = reportQuery(req.query), d = shop.reportData(from, to), n = await names([...d.staff.map((x) => x[0]), ...d.customers.map((x) => x[0])]);
    const { orders, ...rest } = d;
    res.json({ ...rest, label, currency: S('currency_label'), staff: d.staff.map(([id, c]) => [n[id] || id, c]), customers: d.customers.map(([id, c]) => [n[id] || id, c]) });
  }));
  app.get('/api/report.csv', wrap(async (req, res) => { const [from, to] = reportQuery(req.query); res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename=report.csv' }).send(shop.reportCsv(shop.reportData(from, to))); }));

  // ================= القائمة السوداء =================
  app.get('/api/blacklist', wrap(async (_, res) => { const l = bl.list(), n = await names(l.map((x) => x.user_id)); res.json(l.map((x) => ({ ...x, name: n[x.user_id] }))); }));
  app.post('/api/blacklist', wrap(async (req, res) => {
    if (!/^\d{15,22}$/.test(req.body.user_id || '')) throw new Error('ايدي غير صحيح');
    bl.add(req.body.user_id, req.body.reason, 'dashboard');
    if (req.body.ban && guild()) await guild().members.ban(req.body.user_id, { reason: `قائمة سوداء: ${req.body.reason || ''}` }).catch(() => {});
    res.json({ ok: true });
  }));
  app.delete('/api/blacklist/:id', (req, res) => { bl.remove(req.params.id); res.json({ ok: true }); });

  // ================= القرعات =================
  app.get('/api/giveaways', (_, res) => res.json(db.prepare('SELECT * FROM giveaways ORDER BY id DESC LIMIT 50').all().map((g) => ({ ...g, entries: community.gwCount(g.id) }))));
  app.post('/api/giveaways', wrap(async (req, res) => {
    const b = req.body, g = await community.createGiveaway(needGuild(), { channelId: b.channel, prize: b.prize, ms: (+b.minutes || 0) * 6e4, winners: +b.winners || 1, host: 'dashboard', reqRole: b.role });
    res.json({ ok: true, id: g.id });
  }));
  app.patch('/api/giveaways/:id', wrap(async (req, res) => { await community.editGiveaway(needGuild(), +req.params.id, req.body); res.json({ ok: true }); }));
  app.delete('/api/giveaways/:id', wrap(async (req, res) => { await community.deleteGiveaway(needGuild(), +req.params.id); res.json({ ok: true }); }));
  app.post('/api/giveaways/:id/end', wrap(async (req, res) => { const r = await community.endGiveaway(needGuild(), +req.params.id); res.json({ ok: true, winners: r.winners }); }));
  app.post('/api/giveaways/:id/reroll', wrap(async (req, res) => { const r = await community.endGiveaway(needGuild(), +req.params.id, { reroll: true }); res.json({ ok: true, winners: r.winners }); }));

  // ================= الاقتراحات =================
  app.get('/api/suggestions', wrap(async (_, res) => { const l = db.prepare('SELECT * FROM suggestions ORDER BY id DESC LIMIT 100').all(), n = await names(l.map((x) => x.user_id)); res.json(l.map((x) => ({ ...x, name: n[x.user_id] }))); }));
  app.patch('/api/suggestions/:id', wrap(async (req, res) => { await community.editSuggestion(needGuild(), +req.params.id, req.body.text); res.json({ ok: true }); }));
  app.delete('/api/suggestions/:id', wrap(async (req, res) => { await community.deleteSuggestion(needGuild(), +req.params.id); res.json({ ok: true }); }));
  app.post('/api/suggestions/:id/decide', wrap(async (req, res) => { await community.decideSuggestion(needGuild(), +req.params.id, req.body.status === 'accepted' ? 'accepted' : 'rejected', req.body.note, 'dashboard'); res.json({ ok: true }); }));

  // ================= الردود التلقائية =================
  app.get('/api/autoreplies', (_, res) => res.json(db.prepare('SELECT * FROM autoreplies ORDER BY id DESC').all()));
  app.post('/api/autoreplies', wrap(async (req, res) => {
    const b = req.body; if (!b.trigger?.trim() || !b.response?.trim()) throw new Error('اكتب الكلمة والرد');
    const v = [b.trigger.trim(), b.response.trim(), ['contains', 'exact', 'starts', 'word'].includes(b.match) ? b.match : 'contains', b.channel_id || '', b.reply ? 1 : 0, b.enabled === false ? 0 : 1, Math.max(0, +b.cooldown || 0)];
    if (b.id) db.prepare('UPDATE autoreplies SET trigger=?,response=?,match=?,channel_id=?,reply=?,enabled=?,cooldown=? WHERE id=?').run(...v, b.id);
    else db.prepare('INSERT INTO autoreplies(trigger,response,match,channel_id,reply,enabled,cooldown) VALUES(?,?,?,?,?,?,?)').run(...v);
    community.invalidateAuto(); res.json({ ok: true });
  }));
  app.delete('/api/autoreplies/:id', (req, res) => { db.prepare('DELETE FROM autoreplies WHERE id=?').run(req.params.id); community.invalidateAuto(); res.json({ ok: true }); });

  // ================= رتب الأزرار =================
  app.get('/api/rolepanels', (_, res) => res.json(db.prepare('SELECT * FROM role_panels ORDER BY id DESC').all().map((p) => ({ ...p, roles: community.rpRoles(p) }))));
  app.post('/api/rolepanels', wrap(async (req, res) => { const p = await community.sendRolePanel(needGuild(), { channelId: req.body.channel, title: req.body.title, description: req.body.description, roles: req.body.roles, mode: req.body.mode }); res.json({ ok: true, id: p.id }); }));
  app.post('/api/rolepanels/:id/resend', wrap(async (req, res) => { await community.resendRolePanel(needGuild(), +req.params.id); res.json({ ok: true }); }));
  app.delete('/api/rolepanels/:id', wrap(async (req, res) => { await community.deleteRolePanel(needGuild(), +req.params.id); res.json({ ok: true }); }));

  // ================= الإعلانات =================
  app.get('/api/announce/templates', (_, res) => res.json(Object.fromEntries(Object.entries(community.TEMPLATES).map(([k, v]) => [k, { title: v.title, body: v.body, action: !!v.action }]))));
  app.post('/api/announce', wrap(async (req, res) => {
    const b = req.body, m = await community.sendAnnouncement(needGuild(), { channelId: b.channel, title: b.title, body: b.body, color: b.color, image: b.image, ping: b.ping, roleId: b.role, plain: !!b.plain });
    community.TEMPLATES[b.template]?.action?.(); res.json({ ok: true, url: m.url });
  }));

  // ================= القوانين والسياسات (توليد الصور) =================
  app.get('/api/content', (_, res) => res.json(content.getAll()));
  app.put('/api/content/:key', wrap(async (req, res) => { content.save(req.params.key, req.body); const files = await content.regenerate([req.params.key]); res.json({ ok: true, files }); }));
  app.post('/api/content/:key/reset', wrap(async (req, res) => { content.reset(req.params.key); await content.regenerate([req.params.key]); res.json({ ok: true }); }));
  app.post('/api/content/:key/send', wrap(async (req, res) => { needGuild(); await fn.sendInfo(req.params.key, req.body.channel); res.json({ ok: true }); }));

  // ================= رفع الصور =================
  app.get('/api/images', (_, res) => res.json(content.listImages()));
  app.post('/api/images/:file', wrap(async (req, res) => { content.saveUpload(req.params.file, Buffer.from(String(req.body.data || '').replace(/^data:[^,]+,/, ''), 'base64')); res.json({ ok: true }); }));
  app.delete('/api/images/:file', (req, res) => { content.resetImage(req.params.file); res.json({ ok: true }); });

  // ================= النسخ الاحتياطي =================
  app.get('/api/backup/download', wrap(async (req, res) => {
    const { buf, name } = backup.createBackupFile({ scope: req.query.scope === 'config' ? 'config' : 'full', images: req.query.images !== '0', guild: guild(), maxBytes: 1e12 });
    res.set({ 'Content-Type': 'application/gzip', 'Content-Disposition': `attachment; filename=${name}` }).send(buf);
  }));
  app.get('/api/backup/list', (_, res) => res.json(backup.listLocal()));
  app.get('/api/backup/file/:name', (req, res) => { const f = path.join(require('./files').dirs.backups, path.basename(req.params.name)); require('fs').existsSync(f) ? res.download(f) : res.sendStatus(404); });
  app.post('/api/backup/restore', wrap(async (req, res) => {
    const obj = backup.decode(Buffer.from(String(req.body.data || '').replace(/^data:[^,]+,/, ''), 'base64'));
    backup.createBackupFile({ scope: 'full', images: true, guild: guild(), maxBytes: 1e12 }); // نسخة أمان قبل الاستبدال
    const r = backup.applyBackup(obj, { mode: req.body.mode === 'merge' ? 'merge' : 'replace', guild: guild() });
    backup.afterRestore(); res.json({ ok: true, report: r });
  }));
  app.post('/api/backup/summary', wrap(async (req, res) => { const o = backup.decode(Buffer.from(String(req.body.data || '').replace(/^data:[^,]+,/, ''), 'base64')); res.json({ ok: true, created: o.created, scope: o.scope, text: backup.summary(o), images: Object.keys(o.files || {}).length }); }));

  app.listen(process.env.PORT || 3000, () => console.log('🖥️ Dashboard on port', process.env.PORT || 3000));
};
