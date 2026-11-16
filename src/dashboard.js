const express = require('express');
const session = require('express-session');
const path = require('path');
const { db, S, setS, DEFAULTS, SCHEMA } = require('./db');

module.exports = (client, fn) => {
  const app = express();
  app.use(express.json());
  app.use(session({ secret: process.env.SESSION_SECRET || 'nova', resave: false, saveUninitialized: false, cookie: { maxAge: 864e5 * 7 } }));
  app.post('/login', (req, res) => {
    if (req.body.password && req.body.password === process.env.DASH_PASSWORD) { req.session.ok = true; return res.json({ ok: true }); }
    res.status(401).json({ error: 'باسورد خطأ' });
  });
  app.use('/api', (req, res, next) => (req.session.ok ? next() : res.status(401).json({ error: 'auth' })));
  app.use(express.static(path.join(__dirname, '../public')));
  app.use('/assets', express.static(path.join(__dirname, '../assets')));

  const guild = () => client.guilds.cache.get(process.env.GUILD_ID);
  const names = async ids => {
    const g = guild(), out = {};
    await Promise.all([...new Set(ids.filter(Boolean))].map(async id => { const m = await g?.members.fetch(id).catch(() => null); out[id] = m ? m.displayName : id; }));
    return out;
  };
  const wrap = f => async (req, res) => { try { await f(req, res); } catch (e) { console.error(e); res.status(400).json({ error: e.message }); } };

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
    const o = db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id);
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
    else if (req.params.kind === 'welcome') await fn.welcomePreview(guild(), req.body.channel, req.body.user);
    res.json({ ok: true });
  }));
  app.listen(process.env.PORT || 3000, () => console.log('🖥️ Dashboard on port', process.env.PORT || 3000));
};
