const Database = require('better-sqlite3');
const db = new Database(process.env.DB_PATH || 'nova.db');
db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS products(id INTEGER PRIMARY KEY AUTOINCREMENT, category TEXT, name TEXT, months REAL, emoji TEXT DEFAULT '🤖', active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS orders(id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, channel_id TEXT, msg_id TEXT, items TEXT, details TEXT, base REAL, bundle REAL DEFAULT 0, coupon TEXT, coupon_pct REAL DEFAULT 0, pay TEXT, status TEXT DEFAULT 'pending', claimed_by TEXT, created INTEGER, closed INTEGER);
CREATE TABLE IF NOT EXISTS coupons(code TEXT PRIMARY KEY, percent REAL, uses INTEGER DEFAULT 0, max_uses INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS staff(user_id TEXT PRIMARY KEY, points INTEGER DEFAULT 0, claimed INTEGER DEFAULT 0, delivered INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS reviews(id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER, user_id TEXT, stars INTEGER, created INTEGER);
CREATE TABLE IF NOT EXISTS warns(id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, mod_id TEXT, reason TEXT, created INTEGER);
CREATE TABLE IF NOT EXISTS tk_cats(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, emoji TEXT DEFAULT '🎫', description TEXT DEFAULT '');
CREATE TABLE IF NOT EXISTS tickets(id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, cat TEXT, problem TEXT, channel_id TEXT, req_msg TEXT, status TEXT DEFAULT 'requested', claimed_by TEXT, created INTEGER, closed INTEGER);
CREATE TABLE IF NOT EXISTS levels(user_id TEXT PRIMARY KEY, chat_xp INTEGER DEFAULT 0, voice_xp INTEGER DEFAULT 0, last_msg INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS level_roles(id INTEGER PRIMARY KEY AUTOINCREMENT, level INTEGER, role_id TEXT, kind TEXT DEFAULT 'member');
CREATE TABLE IF NOT EXISTS cmds(name TEXT PRIMARY KEY, aliases TEXT DEFAULT '', role TEXT DEFAULT '', enabled INTEGER DEFAULT 1);
`);

// [المجموعة, المفتاح, الوصف, النوع, الافتراضي]  الأنواع: text textarea number bool role roles channel category json
const SCHEMA = [
  ['general', 'prefix', 'بادئة أوامر الإدارة', 'text', '!'],
  ['general', 'staff_role', 'رتبة الستاف', 'role', ''],
  ['general', 'customer_role', 'رتبة العميل (بعد التسليم)', 'role', ''],

  ['store', 'store_open', 'المتجر مفتوح لاستقبال الطلبات', 'bool', '1'],
  ['store', 'order_category', 'كاتيجوري رومات الطلبات', 'category', ''],
  ['store', 'review_channel', 'روم التقييمات', 'channel', ''],
  ['store', 'panel_title', 'عنوان بانل المتجر', 'text', '🌌 Nova Store | متجر بوتات ديسكورد'],
  ['store', 'panel_desc', 'وصف بانل المتجر', 'textarea', 'اختر البوتات اللي تبيها واطلب مباشرة، وفريقنا يخدمك داخل روم خاص.\nباقة 3 بوتات = خصم 10%'],
  ['store', 'panel_image', 'صورة البانل (رابط، فاضي = الصورة الافتراضية)', 'text', ''],
  ['store', 'ticket_image', 'صورة داخل الطلب (رابط، فاضي = الافتراضية)', 'text', ''],
  ['store', 'bundle_min', 'أقل عدد بوتات للباقة', 'number', '3'],
  ['store', 'bundle_discount', 'خصم الباقة %', 'number', '10'],
  ['store', 'all_bots_months', 'سعر كل البوتات (أشهر نيترو)', 'number', '12'],
  ['store', 'custom_min_months', 'أقل سعر للبوت المخصص (أشهر)', 'number', '6'],
  ['store', 'max_open_orders', 'أقصى طلبات مفتوحة للعضو', 'number', '2'],
  ['store', 'points_claim', 'نقاط استلام الطلب', 'number', '1'],
  ['store', 'points_deliver', 'نقاط تسليم الطلب', 'number', '2'],
  ['store', 'rates', 'معدلات التحويل لكل شهر نيترو (JSON)', 'json', JSON.stringify({ nitro: 1, boost: 2, robux: 400, credit: 100000, vbucks: 1000, uc: 660 })],
  ['store', 'pay_info', 'تعليمات الدفع لكل طريقة (JSON)', 'json', JSON.stringify({ nitro: 'اكتب هنا تعليمات الدفع بالنيترو', boost: 'اكتب هنا تعليمات البوست', robux: 'اكتب هنا تعليمات الروبوكس', credit: 'اكتب هنا تعليمات الكردت', vbucks: 'اكتب هنا تعليمات الفي بوكس', uc: 'اكتب هنا تعليمات شدات ببجي' }, null, 1)],

  ['welcome', 'welcome_enabled', 'تفعيل الترحيب', 'bool', '1'],
  ['welcome', 'welcome_channel', 'روم الترحيب', 'channel', ''],
  ['welcome', 'welcome_title', 'العنوان على الصورة (إنجليزي أفضل)', 'text', 'WELCOME'],
  ['welcome', 'welcome_sub', 'السطر الصغير على الصورة', 'text', 'to Nova Store'],
  ['welcome', 'welcome_bg', 'خلفية الترحيب (رابط، فاضي = صورة NOVA)', 'text', ''],
  ['welcome', 'welcome_msg', 'رسالة الترحيب ({user} {name} {server} {count})', 'textarea', 'أهلاً بك {user} في **{server}** 💜\nأنت العضو رقم **{count}**'],
  ['welcome', 'welcome_role', 'رتبة تنعطى تلقائياً للعضو الجديد', 'role', ''],
  ['welcome', 'welcome_dm', 'إرسال رسالة خاصة للعضو', 'bool', '0'],
  ['welcome', 'welcome_dm_msg', 'نص الرسالة الخاصة', 'textarea', 'أهلاً {name} في {server} 💜 لو تحتاج شيء افتح تذكرة.'],
  ['welcome', 'leave_channel', 'روم المغادرة', 'channel', ''],
  ['welcome', 'leave_msg', 'رسالة المغادرة', 'textarea', '👋 **{name}** غادر السيرفر.'],

  ['tickets', 'tk_enabled', 'تفعيل التذاكر', 'bool', '1'],
  ['tickets', 'tk_category', 'كاتيجوري التذاكر المقبولة', 'category', ''],
  ['tickets', 'tk_requests_channel', 'روم الطلبات (قبول/رفض)', 'channel', ''],
  ['tickets', 'tk_log_channel', 'روم لوق التذاكر', 'channel', ''],
  ['tickets', 'tk_panel_title', 'عنوان بانل التذاكر', 'text', '🎫 الدعم الفني | Nova Store'],
  ['tickets', 'tk_panel_desc', 'وصف بانل التذاكر', 'textarea', 'اختر نوع التذكرة من القائمة واكتب مشكلتك، وبيرد عليك أحد الإدارة.'],
  ['tickets', 'tk_panel_image', 'صورة البانل (رابط، فاضي = الافتراضية)', 'text', ''],
  ['tickets', 'tk_embed_image', 'صورة داخل التذكرة (رابط، فاضي = الافتراضية)', 'text', ''],
  ['tickets', 'tk_embed_text', 'رسالة داخل التذكرة', 'textarea', 'أهلاً بك، تم قبول تذكرتك. اكتب أي تفاصيل إضافية وبنخدمك بأسرع وقت.'],
  ['tickets', 'tk_transfer_roles', 'الرتب المسموح التحويل لها', 'roles', ''],
  ['tickets', 'tk_max_open', 'أقصى تذاكر مفتوحة للعضو', 'number', '1'],
  ['tickets', 'tk_points', 'نقاط الستاف لكل تذكرة يستلمها', 'number', '1'],

  ['logs', 'log_orders', 'لوق الطلبات', 'channel', ''],
  ['logs', 'log_mod', 'لوق الإدارة (تحذير/حظر/تايم أوت...)', 'channel', ''],
  ['logs', 'log_member', 'لوق الأعضاء (دخول/خروج/رتب/نك نيم)', 'channel', ''],
  ['logs', 'log_message', 'لوق الرسائل (حذف/تعديل)', 'channel', ''],
  ['logs', 'log_voice', 'لوق الفويس', 'channel', ''],
  ['logs', 'log_server', 'لوق السيرفر (رومات)', 'channel', ''],

  ['levels', 'xp_enabled', 'تفعيل نظام المستويات', 'bool', '1'],
  ['levels', 'xp_min', 'أقل XP للرسالة', 'number', '10'],
  ['levels', 'xp_max', 'أعلى XP للرسالة', 'number', '20'],
  ['levels', 'xp_cooldown', 'كولداون الرسائل (ثواني)', 'number', '60'],
  ['levels', 'voice_xp', 'XP الفويس لكل دقيقة', 'number', '10'],
  ['levels', 'levelup_channel', 'روم إشعار رفع المستوى (فاضي = نفس الروم)', 'channel', ''],
  ['levels', 'levelup_msg', 'رسالة رفع المستوى ({user} {level} {type})', 'text', '🎉 {user} وصلت لفل **{level}** في {type}!'],
];
const DEFAULTS = Object.fromEntries(SCHEMA.map(s => [s[1], s[4]]));
for (const [k, v] of Object.entries(DEFAULTS)) db.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)').run(k, v);

if (!db.prepare('SELECT COUNT(*) c FROM products').get().c) {
  const seed = [
    ['basic', 'ترحيب / وداع', 0.5, '👋'], ['basic', 'ردود تلقائية', 0.5, '💬'], ['basic', 'رتب تلقائية', 1, '🏷️'], ['basic', 'إحصائيات السيرفر', 1, '📊'],
    ['standard', 'حماية', 1, '🛡️'], ['standard', 'لوق (سجلات)', 1, '📜'], ['standard', 'قرعات', 1, '🎁'], ['standard', 'اقتراحات / تصويت', 1, '🗳️'],
    ['standard', 'ميوزك', 2, '🎵'], ['standard', 'ليفل ونقاط', 2, '⭐'],
    ['premium', 'تذاكر (Tickets)', 2, '🎫'], ['premium', 'إدارة (بان، ميوت)', 2, '🔨'], ['premium', 'اقتصاد وألعاب', 3, '💰'],
    ['premium', 'تقديم وظائف', 3, '📝'], ['premium', 'ذكاء اصطناعي', 4, '🧠'], ['premium', 'لوحة تحكم', 4, '🖥️'],
  ];
  const ins = db.prepare('INSERT INTO products(category,name,months,emoji) VALUES(?,?,?,?)'); seed.forEach(s => ins.run(...s));
}
if (!db.prepare('SELECT COUNT(*) c FROM tk_cats').get().c) {
  const ins = db.prepare('INSERT INTO tk_cats(name,emoji,description) VALUES(?,?,?)');
  [['دعم فني', '🛠️', 'مشكلة في بوت أو خدمة'], ['استفسار', '❓', 'سؤال قبل الشراء'], ['شكوى', '📢', 'ملاحظة أو شكوى'], ['طلب مخصص', '✨', 'بوت مخصص بالكامل']].forEach(r => ins.run(...r));
}
// الأوامر: اسم، اختصارات، صلاحية ديسكورد الافتراضية
const CMD_SEED = {
  ban: 'حظر,باند', unban: 'فك_حظر', kick: 'طرد', mute: 'ميوت,تايم', unmute: 'فك_ميوت', warn: 'تحذير', warns: 'تحذيرات', clearwarns: 'مسح_تحذيرات',
  clear: 'مسح,clean', lock: 'قفل', unlock: 'فتح', slowmode: 'بطيء', say: 'قل', nick: 'نك', role: 'رتبة',
  userinfo: 'user,معلومات', serverinfo: 'server,سيرفر', avatar: 'av,افتار', rank: 'لفل,رانك', top: 'توب', help: 'مساعدة',
};
for (const [n, a] of Object.entries(CMD_SEED)) db.prepare('INSERT OR IGNORE INTO cmds(name,aliases) VALUES(?,?)').run(n, a);

const S = k => { const r = db.prepare('SELECT value FROM settings WHERE key=?').get(k); return r ? r.value : ''; };
const setS = (k, v) => db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k, String(v));
module.exports = { db, S, setS, DEFAULTS, SCHEMA };
