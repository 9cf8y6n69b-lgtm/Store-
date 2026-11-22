// قاعدة بيانات الاستضافة (sqlite) + الإعدادات (S / setS) محفوظة في prodb الخاص بـ Nova
const Database = require("better-sqlite3");
const path = require("path");
const { dirs } = require("./files");
const Pro = require("../void/prodb");

const db = new Database(path.join(dirs.data, "hosted.sqlite"));
db.pragma("journal_mode = WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS hosted_bots(
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, client_id TEXT DEFAULT '', guild_id TEXT DEFAULT '', owner_id TEXT DEFAULT '', order_id INTEGER DEFAULT 0,
  templates TEXT DEFAULT '[]', config TEXT DEFAULT '{}', presence TEXT DEFAULT '{}', autostart INTEGER DEFAULT 1, expires INTEGER DEFAULT 0, note TEXT DEFAULT '', created INTEGER,
  package TEXT DEFAULT '', rights TEXT DEFAULT '{}', channel_id TEXT DEFAULT '', suspended INTEGER DEFAULT 0, registry_msg TEXT DEFAULT '', remind_stage INTEGER DEFAULT 0,
  portal_salt TEXT DEFAULT '', portal_hash TEXT DEFAULT '');
CREATE TABLE IF NOT EXISTS hosted_users(bot_id INTEGER, guild_id TEXT, user_id TEXT, xp INTEGER DEFAULT 0, balance INTEGER DEFAULT 0, last_msg INTEGER DEFAULT 0, last_daily INTEGER DEFAULT 0, last_work INTEGER DEFAULT 0, PRIMARY KEY(bot_id, guild_id, user_id));
CREATE TABLE IF NOT EXISTS hosted_data(bot_id INTEGER, k TEXT, v TEXT, PRIMARY KEY(bot_id, k));
CREATE TABLE IF NOT EXISTS hosted_warns(id INTEGER PRIMARY KEY AUTOINCREMENT, bot_id INTEGER, guild_id TEXT, user_id TEXT, mod_id TEXT, reason TEXT, created INTEGER);
CREATE TABLE IF NOT EXISTS hosted_plans(order_id INTEGER PRIMARY KEY, package TEXT, name TEXT, templates TEXT, rights TEXT, days INTEGER, updated INTEGER);
`);

const DEFAULTS = {
    staff_role: "", hosted_registry_channel: "", hosted_review_role: "", hosted_renew_link: "", hosted_remind_days: "3,1",
    hosted_addbot_msg: "✅ تم تأكيد دفعك! الحين وقت تشغيل بوتك:\n1️⃣ سوّ بوت من Discord Developer Portal وانسخ **التوكن**\n2️⃣ اضغط الزر وحط التوكن وايدي سيرفرك\n3️⃣ البوت يشتغل مع كل الأوامر اللي طلبتها فوراً 🚀",
    hosted_expire_msg: "{owner}\n## البوت الخاص فيك بيخلص اشتراكه !\nوش تنتظر اشترك\nخذ رابط السيرفر وجدد اشتراكك !\n{link}"
};
const KEYS = Object.keys(DEFAULTS);
const S = k => { const v = Pro.get("hs_" + k); return v === undefined || v === null ? (DEFAULTS[k] ?? "") : String(v); };
const setS = (k, v) => Pro.set("hs_" + k, String(v ?? ""));
module.exports = { db, S, setS, DEFAULTS, KEYS };
