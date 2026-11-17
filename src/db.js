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
CREATE TABLE IF NOT EXISTS blacklist(user_id TEXT PRIMARY KEY, reason TEXT DEFAULT '', by TEXT DEFAULT '', created INTEGER);
CREATE TABLE IF NOT EXISTS giveaways(id INTEGER PRIMARY KEY AUTOINCREMENT, channel_id TEXT, msg_id TEXT, prize TEXT, winners INTEGER DEFAULT 1, ends INTEGER, host TEXT, req_role TEXT DEFAULT '', status TEXT DEFAULT 'active', winner_ids TEXT DEFAULT '', created INTEGER);
CREATE TABLE IF NOT EXISTS giveaway_entries(gid INTEGER, user_id TEXT, PRIMARY KEY(gid, user_id));
CREATE TABLE IF NOT EXISTS suggestions(id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, text TEXT, msg_id TEXT, channel_id TEXT, status TEXT DEFAULT 'pending', staff_note TEXT DEFAULT '', created INTEGER);
CREATE TABLE IF NOT EXISTS suggestion_votes(sid INTEGER, user_id TEXT, vote INTEGER, PRIMARY KEY(sid, user_id));
CREATE TABLE IF NOT EXISTS autoreplies(id INTEGER PRIMARY KEY AUTOINCREMENT, trigger TEXT, response TEXT, match TEXT DEFAULT 'contains', channel_id TEXT DEFAULT '', reply INTEGER DEFAULT 1, enabled INTEGER DEFAULT 1, cooldown INTEGER DEFAULT 10);
CREATE TABLE IF NOT EXISTS role_panels(id INTEGER PRIMARY KEY AUTOINCREMENT, channel_id TEXT, msg_id TEXT, title TEXT, description TEXT DEFAULT '', roles TEXT DEFAULT '[]', mode TEXT DEFAULT 'toggle');
CREATE TABLE IF NOT EXISTS content(key TEXT PRIMARY KEY, data TEXT);
CREATE TABLE IF NOT EXISTS snapshot(kind TEXT, id TEXT, data TEXT, PRIMARY KEY(kind, id));
CREATE TABLE IF NOT EXISTS hosted_bots(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, client_id TEXT DEFAULT '', guild_id TEXT DEFAULT '', owner_id TEXT DEFAULT '', order_id INTEGER DEFAULT 0, templates TEXT DEFAULT '[]', config TEXT DEFAULT '{}', presence TEXT DEFAULT '{}', autostart INTEGER DEFAULT 1, expires INTEGER DEFAULT 0, note TEXT DEFAULT '', created INTEGER);
CREATE TABLE IF NOT EXISTS hosted_users(bot_id INTEGER, guild_id TEXT, user_id TEXT, xp INTEGER DEFAULT 0, balance INTEGER DEFAULT 0, last_msg INTEGER DEFAULT 0, last_daily INTEGER DEFAULT 0, last_work INTEGER DEFAULT 0, PRIMARY KEY(bot_id, guild_id, user_id));
CREATE TABLE IF NOT EXISTS hosted_data(bot_id INTEGER, k TEXT, v TEXT, PRIMARY KEY(bot_id, k));
CREATE TABLE IF NOT EXISTS hosted_warns(id INTEGER PRIMARY KEY AUTOINCREMENT, bot_id INTEGER, guild_id TEXT, user_id TEXT, mod_id TEXT, reason TEXT, created INTEGER);
CREATE TABLE IF NOT EXISTS dash_users(name TEXT PRIMARY KEY, salt TEXT, hash TEXT, role TEXT DEFAULT 'staff', created INTEGER);
`);
// أعمدة جديدة (آمنة للتكرار، تضاف لقواعد البيانات القديمة)
const addCol = (t, c, def) => { if (!db.prepare(`PRAGMA table_info(${t})`).all().some(x => x.name === c)) db.exec(`ALTER TABLE ${t} ADD COLUMN ${c} ${def}`); };
addCol('orders', 'paid_at', 'INTEGER DEFAULT 0');
addCol('orders', 'delivered_at', 'INTEGER DEFAULT 0');
addCol('orders', 'warranty_until', 'INTEGER DEFAULT 0');
addCol('orders', 'warranty_warned', 'INTEGER DEFAULT 0');
addCol('orders', 'warranty_ended', 'INTEGER DEFAULT 0');
addCol('orders', 'last_activity', 'INTEGER DEFAULT 0');
addCol('orders', 'idle_warned', 'INTEGER DEFAULT 0');
addCol('tickets', 'last_activity', 'INTEGER DEFAULT 0');
addCol('tickets', 'idle_warned', 'INTEGER DEFAULT 0');

// [المجموعة, المفتاح, الوصف, النوع, الافتراضي]  الأنواع: text textarea number bool role roles channel category json
const SCHEMA = [
  ['general', 'prefix', 'بادئة أوامر الإدارة', 'text', '!'],
  ['general', 'staff_role', 'رتبة الستاف', 'role', ''],
  ['general', 'customer_role', 'رتبة العميل (بعد التسليم)', 'role', ''],
  ['general', 'line_image', 'رابط صورة الخط (فاضي = الصورة الافتراضية)', 'text', ''],
  ['general', 'line_after_panels', 'إرسال الخط بعد البانلات والصور', 'bool', '1'],

  ['store', 'store_open', 'المتجر مفتوح لاستقبال الطلبات', 'bool', '1'],
  ['store', 'order_category', 'كاتيجوري رومات الطلبات', 'category', ''],
  ['store', 'review_channel', 'روم التقييمات', 'channel', ''],
  ['store', 'prices_use_image', 'عرض الأسعار كصورة (عطّلها لو عدّلت الأسعار من الداشبورد ليظهر إيمبد محدّث)', 'bool', '1'],
  ['store', 'prices_image', 'رابط صورة الأسعار (فاضي = الصورة الافتراضية)', 'text', ''],
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
  ['store', 'pay_info', 'تعليمات الدفع لكل طريقة (JSON)', 'json', JSON.stringify({
    nitro: '1️⃣ انتظر استلام أحد الستاف لطلبك.\n2️⃣ أرسل هنا **رابط هدية نيترو** بعدد الأشهر الموضح في الطلب.\n3️⃣ لا تستلم الرابط بنفسك ولا تحذفه بعد الإرسال.\n4️⃣ انتظر ضغط **تأكيد الدفع** من الستاف ثم يبدأ التنفيذ.\n⚠️ لا ترسل أي شيء بالخاص ولا لأي شخص خارج هذا الروم.',
    boost: '1️⃣ انتظر استلام أحد الستاف لطلبك.\n2️⃣ سوّ **بوست** لسيرفر المتجر بالعدد الموضح في الطلب.\n3️⃣ أرسل هنا لقطة شاشة تثبت البوست.\n4️⃣ لا تسحب البوست قبل مرور **30 يوم**، وسحبه قبلها يلغي الطلب والضمان.\n⚠️ الدفع داخل هذا الروم فقط.',
    robux: '1️⃣ انتظر استلام أحد الستاف لطلبك.\n2️⃣ أنشئ **Game Pass** في تجربتك على روبلوكس.\n3️⃣ حدد سعره = **المبلغ الموضح في الطلب ÷ 0.7** (روبلوكس تخصم 30% ضريبة).\n4️⃣ أرسل رابط الـ Game Pass هنا وانتظر الشراء والتأكيد.\n⚠️ لا ترسل حسابك ولا كلمة المرور لأي أحد.',
    credit: '1️⃣ انتظر الستاف يرسل لك ايدي حساب الاستلام.\n2️⃣ حوّل الكردت عبر **بروبوت (ProBot)** بالمبلغ الموضح في الطلب شاملاً ضريبة التحويل.\n3️⃣ أرسل هنا لقطة شاشة التحويل.\n4️⃣ انتظر **تأكيد الدفع** ثم يبدأ التنفيذ.\n⚠️ لا تحوّل قبل ما يعطيك الستاف الايدي داخل هذا الروم.',
    vbucks: '1️⃣ انتظر استلام أحد الستاف لطلبك.\n2️⃣ الستاف يحدد لك طريقة استلام الفي بوكس، نفّذها كما يطلب بالضبط.\n3️⃣ أرسل هنا لقطة شاشة تثبت العملية.\n4️⃣ انتظر **تأكيد الدفع** ثم يبدأ التنفيذ.\n⚠️ لا ترسل أي شيء قبل تأكيد الستاف.',
    uc: '1️⃣ انتظر الستاف يرسل لك ID الشحن.\n2️⃣ اشحن شدات ببجي بالقيمة الموضحة في الطلب على الايدي المعطى.\n3️⃣ أرسل هنا إيصال أو لقطة الشحن.\n4️⃣ انتظر **تأكيد الدفع** ثم يبدأ التنفيذ.\n⚠️ تأكد من الايدي من الستاف داخل هذا الروم فقط.',
  }, null, 1)],

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
  ['protect', 'protect_enabled', 'تفعيل الحماية', 'bool', '1'],
  ['protect', 'protect_log', 'روم لوق الحماية', 'channel', ''],
  ['protect', 'protect_whitelist', 'ايديات مستثناة من الحماية (مفصولة بفاصلة)', 'text', ''],
  ['protect', 'verify_role', 'رتبة التوثيق (الأعضاء الموثقين)', 'role', ''],
  ['protect', 'verify_channel', 'روم التوثيق', 'channel', ''],
  ['protect', 'anti_invite', 'منع روابط دعوات السيرفرات', 'bool', '1'],
  ['protect', 'anti_link', 'منع الروابط (يستثني الستاف وروم الطلبات والتذاكر)', 'bool', '1'],
  ['protect', 'link_whitelist', 'دومينات مسموحة (مفصولة بفاصلة)', 'text', 'tenor.com,giphy.com,youtube.com,youtu.be,cdn.discordapp.com,media.discordapp.net'],
  ['protect', 'anti_spam', 'منع السبام والتكرار', 'bool', '1'],
  ['protect', 'spam_count', 'عدد الرسائل التي تعتبر سبام', 'number', '5'],
  ['protect', 'spam_seconds', 'خلال كم ثانية', 'number', '5'],
  ['protect', 'spam_timeout', 'مدة الكتم للسبام (دقائق)', 'number', '10'],
  ['protect', 'anti_mention', 'منع المنشن الجماعي', 'bool', '1'],
  ['protect', 'mention_limit', 'أقصى عدد منشنات في الرسالة', 'number', '5'],
  ['protect', 'anti_caps', 'منع الحروف الكبيرة المبالغ فيها', 'bool', '1'],
  ['protect', 'bad_words', 'كلمات ممنوعة (مفصولة بفاصلة)', 'textarea', ''],
  ['protect', 'strikes_limit', 'عدد المخالفات خلال 24 ساعة قبل الكتم 30 دقيقة', 'number', '3'],
  ['protect', 'anti_raid', 'حماية من الهجمات الجماعية (Raid)', 'bool', '1'],
  ['protect', 'raid_joins', 'عدد الدخول المشبوه', 'number', '8'],
  ['protect', 'raid_seconds', 'خلال كم ثانية', 'number', '10'],
  ['protect', 'min_account_age_days', 'أقل عمر حساب بالأيام (0 = معطل)', 'number', '0'],
  ['protect', 'anti_bot_add', 'منع إضافة بوتات غير مصرح بها', 'bool', '1'],
  ['protect', 'anti_nuke', 'حماية من التخريب (حذف رومات/رتب، باند وطرد جماعي)', 'bool', '1'],
  ['protect', 'nuke_limit', 'عدد العمليات خلال 10 ثواني قبل معاقبة المنفّذ', 'number', '3'],
  ['protect', 'restore_deleted', 'استرجاع الرومات والرتب المحذوفة تلقائياً (لو حذفها غير مستثنى)', 'bool', '1'],
  ['protect', 'anti_webhook', 'حماية من الويب هوكس (منع إنشاء ويب هوك والرسائل الخطرة منه)', 'bool', '1'],
  ['protect', 'raid_autolock', 'قفل السيرفر تلقائياً عند رصد Raid', 'bool', '1'],
  ['protect', 'raid_lock_minutes', 'مدة القفل التلقائي (دقائق) ثم يُفتح تلقائياً', 'number', '15'],

  ['orders', 'invoice_enabled', 'إرسال فاتورة للعميل بعد تأكيد الدفع', 'bool', '1'],
  ['orders', 'invoice_store_name', 'اسم المتجر في الفاتورة', 'text', 'Nova Store'],
  ['orders', 'invoice_dm', 'إرسال الفاتورة للعميل بالخاص أيضاً', 'bool', '1'],
  ['orders', 'invoice_channel', 'روم الفواتير (نسخة للإدارة)', 'channel', ''],
  ['orders', 'warranty_enabled', 'تفعيل متابعة الضمان', 'bool', '1'],
  ['orders', 'warranty_days', 'مدة الضمان (أيام من التسليم)', 'number', '7'],
  ['orders', 'warranty_remind_hours', 'التذكير قبل انتهاء الضمان بـ (ساعات)', 'number', '24'],
  ['orders', 'auto_close_enabled', 'إغلاق الطلبات والتذاكر الخاملة تلقائياً', 'bool', '1'],
  ['orders', 'idle_warn_hours', 'تحذير بعد خمول (ساعات)', 'number', '24'],
  ['orders', 'idle_close_hours', 'إغلاق بعد خمول (ساعات)', 'number', '48'],
  ['orders', 'delivered_close_hours', 'إغلاق روم الطلب بعد التسليم والخمول (ساعات)', 'number', '24'],
  ['orders', 'request_expire_hours', 'انتهاء طلبات التذاكر اللي ما انقبلت (ساعات)', 'number', '72'],
  ['orders', 'transcript_max', 'أقصى عدد رسائل تحفظ في نسخة المحادثة (حتى 20000)', 'number', '5000'],
  ['orders', 'blacklist_ban_on_join', 'حظر المحتالين (القائمة السوداء) تلقائياً عند دخولهم', 'bool', '1'],
  ['orders', 'currency_label', 'رمز عملتك في التقارير', 'text', 'ر.س'],
  ['orders', 'month_sale_value', 'قيمة شهر نيترو بعملتك (سعر البيع) — لحساب الأرباح', 'number', '0'],
  ['orders', 'month_cost', 'تكلفتك لكل شهر نيترو بعملتك (اختياري)', 'number', '0'],
  ['orders', 'tz_offset', 'فرق التوقيت عن UTC (الرياض = 3)', 'number', '3'],
  ['orders', 'report_channel', 'روم التقرير الدوري', 'channel', ''],
  ['orders', 'report_interval_days', 'إرسال تقرير تلقائي كل كم يوم (0 = معطل)', 'number', '7'],

  ['server', 'gw_channel', 'روم القرعات الافتراضي', 'channel', ''],
  ['server', 'gw_ping_role', 'رتبة تتمنشن عند بدء قرعة', 'role', ''],
  ['server', 'suggest_channel', 'روم الاقتراحات', 'channel', ''],
  ['server', 'suggest_auto', 'تحويل أي رسالة في روم الاقتراحات إلى اقتراح تلقائياً', 'bool', '1'],
  ['server', 'suggest_cooldown', 'كولداون الاقتراحات (ثواني)', 'number', '60'],
  ['server', 'autoreply_enabled', 'تفعيل الردود التلقائية', 'bool', '1'],
  ['server', 'announce_channel', 'روم الإعلانات الافتراضي', 'channel', ''],
  ['server', 'announce_ping_role', 'رتبة المنشن الافتراضية للإعلانات', 'role', ''],

  ['botctl', 'bot_autostart', 'تشغيل البوت تلقائياً عند فتح التطبيق', 'bool', '1'],
  ['botctl', 'bot_status', 'حالة البوت (online / idle / dnd / invisible)', 'text', 'online'],
  ['botctl', 'bot_activity_type', 'نوع النشاط', 'text', 'Playing'],
  ['botctl', 'bot_activity_text', 'نص النشاط', 'text', 'Nova Store 🌌'],
  ['backup', 'backup_channel', 'روم النسخ الاحتياطية التلقائية (خاص بالإدارة)', 'channel', ''],
  ['backup', 'auto_backup_hours', 'نسخة احتياطية تلقائية كل كم ساعة (0 = معطل)', 'number', '24'],
  ['backup', 'backup_admins', 'ايديات مسموح لها بالنسخ والاستعادة غير المالك (مفصولة بفاصلة)', 'text', ''],
];
const DEFAULTS = Object.fromEntries(SCHEMA.map(s => [s[1], s[4]]));
const ensureDefaults = () => { for (const [k, v] of Object.entries(DEFAULTS)) db.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)').run(k, v); };
ensureDefaults();

// قائمة كلمات ممنوعة مبدئية (تتعبّى مرة وحدة فقط، وتعدّلها من الداشبورد ← الحماية)
const BAD_WORDS_DEFAULT = [
  // شتائم عربية صريحة
  'كس امك', 'كسمك', 'كس اختك', 'كسختك', 'ابن الكلب', 'ابن الحرام', 'ابن الشرموطه', 'ابن القحبه', 'شرموطه', 'شرموط', 'قحبه', 'قحبة', 'عرص', 'عرصه', 'منيوك', 'منيوكه',
  'متناك', 'متناكه', 'نيك امك', 'نيكمك', 'ينعل ابوك', 'ينعل دينك', 'ديوث', 'عاهره', 'زانيه', 'زب', 'طيزك', 'خرا عليك',
  // إنجليزي
  'fuck', 'fucking', 'fucker', 'motherfucker', 'shit', 'bitch', 'asshole', 'pussy', 'cunt', 'whore', 'slut', 'nigger', 'nigga', 'faggot', 'retard',
  // روابط احتيال شائعة
  'free nitro', 'nitro for free', 'claim your nitro', 'discord nitro gift', 'steam gift', 'airdrop nitro',
].join(', ');
if (!S0('bad_words') && S0('bad_words_seeded') !== '1') {
  db.prepare("INSERT INTO settings(key,value) VALUES('bad_words',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(BAD_WORDS_DEFAULT);
  db.prepare("INSERT OR REPLACE INTO settings(key,value) VALUES('bad_words_seeded','1')").run();
}
function S0(k) { const r = db.prepare('SELECT value FROM settings WHERE key=?').get(k); return r ? r.value : ''; }

// محتوى القوانين والسياسات (يُعدّل من الداشبورد وتتولد منه الصور)
const DEFAULT_CONTENT = (() => { try { return JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '../tools/default_content.json'), 'utf8')); } catch { return {}; } })();
for (const [k, v] of Object.entries(DEFAULT_CONTENT)) db.prepare('INSERT OR IGNORE INTO content(key,data) VALUES(?,?)').run(k, JSON.stringify(v));

{ // تحديث تعليمات الدفع القديمة الفاضية
  const r = db.prepare("SELECT value FROM settings WHERE key='pay_info'").get();
  if (r && r.value.includes('اكتب هنا')) db.prepare("UPDATE settings SET value=? WHERE key='pay_info'").run(DEFAULTS.pay_info);
}

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
module.exports = { db, S, setS, DEFAULTS, SCHEMA, ensureDefaults, DEFAULT_CONTENT };
