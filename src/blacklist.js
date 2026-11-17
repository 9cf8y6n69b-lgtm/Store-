// القائمة السوداء للمحتالين
const { db } = require('./db');
const get = (id) => db.prepare('SELECT * FROM blacklist WHERE user_id=?').get(String(id));
const add = (id, reason, by) => db.prepare('INSERT INTO blacklist(user_id,reason,by,created) VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET reason=excluded.reason, by=excluded.by')
  .run(String(id), reason || '', String(by || ''), Date.now());
const remove = (id) => db.prepare('DELETE FROM blacklist WHERE user_id=?').run(String(id)).changes;
const list = () => db.prepare('SELECT * FROM blacklist ORDER BY created DESC').all();
const DENY = '🚫 حسابك ضمن **القائمة السوداء** لدى المتجر ولا يمكنك استخدام هذه الخدمة. للاعتراض تواصل مع الإدارة.';
module.exports = { get, add, remove, list, DENY };
