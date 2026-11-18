// فحص النظام: يكشف المشاكل الشائعة قبل ما تظهر (مكتبات، ملفات، صلاحيات البوت، البوتات المستضافة)
const fs = require('fs'), path = require('path'), cp = require('child_process');
const has = (m) => { try { require.resolve(m); return true; } catch { return false; } };
const cmd = (c) => { try { return cp.execSync(c, { stdio: 'pipe', timeout: 5000 }).toString().trim(); } catch { return ''; } };

function run(client) {
  const out = [], add = (level, title, fix = '') => out.push({ level, title, fix }); // level: ok | warn | bad
  const node = +process.versions.node.split('.')[0];
  node >= 18 ? add('ok', `Node ${process.versions.node}`) : add('bad', `Node ${process.versions.node} قديم`, 'استخدم Node 18 أو أحدث');
  for (const m of ['discord.js', 'better-sqlite3', 'express', 'express-session', 'dotenv', '@napi-rs/canvas']) has(m) ? add('ok', `مكتبة ${m}`) : add('bad', `مكتبة ${m} غير مثبتة`, 'شغّل: npm install');
  const voice = ['@discordjs/voice', 'play-dl'].every(has), codec = has('opusscript') || has('@discordjs/opus'), sodium = has('libsodium-wrappers') || has('sodium-native'), ff = has('ffmpeg-static') || !!cmd('ffmpeg -version');
  voice && codec && sodium && ff ? add('ok', 'مكتبات الميوزك كاملة') : add('warn', 'قالب الميوزك ناقص مكتبات', `ناقص: ${[!voice && '@discordjs/voice/play-dl', !codec && 'opusscript', !sodium && 'libsodium-wrappers', !ff && 'ffmpeg'].filter(Boolean).join(' ، ')} — شغّل npm install (الاختياريات)`);
  cmd('python3 -c "import PIL;print(1)"') ? add('ok', 'Python + Pillow (توليد صور القوانين)') : add('warn', 'Python/Pillow غير متوفر', 'ما راح تتولد صور القوانين من الداشبورد: pip install pillow');
  process.env.DASH_PASSWORD ? (process.env.DASH_PASSWORD.length >= 10 ? add('ok', 'باسورد الداشبورد قوي') : add('warn', 'باسورد الداشبورد قصير', 'استخدم 10 أحرف+')) : add('bad', 'DASH_PASSWORD غير محدد', 'أضفه في .env');
  process.env.SESSION_SECRET ? add('ok', 'SESSION_SECRET محدد') : add('warn', 'SESSION_SECRET غير محدد', 'بدونه تنتهي جلسات الداشبورد مع كل إعادة تشغيل');
  try { const { dirs } = require('./files'), t = path.join(dirs.data, '.w'); fs.writeFileSync(t, '1'); fs.rmSync(t); add('ok', 'مجلد data قابل للكتابة'); } catch { add('bad', 'مجلد data غير قابل للكتابة', 'عدّل الصلاحيات أو DATA_DIR'); }
  if (!process.env.DATA_DIR && process.env.RAILWAY_ENVIRONMENT) add('warn', 'ما فيه DATA_DIR على استضافة سحابية', 'اربط وحدة تخزين دائمة وحط DATA_DIR عليها، وإلا تضيع قاعدة البيانات مع كل نشر');
  if (client?.isReady?.()) {
    const g = client.guilds.cache.get(process.env.GUILD_ID) || client.guilds.cache.first(), me = g?.members.me;
    if (!g) add('bad', 'البوت الرئيسي مو داخل أي سيرفر');
    else {
      const need = ['Administrator'], p = me?.permissions;
      p?.has('Administrator') ? add('ok', 'البوت عنده صلاحية Administrator') : add('warn', 'البوت بدون Administrator', 'الحماية والاستعادة وإنشاء الرومات تحتاجها (أو الصلاحيات الفردية)');
      const hi = me?.roles.highest.position, rolesAbove = g.roles.cache.filter((r) => r.position > hi && !r.managed && r.id !== g.id).size;
      rolesAbove ? add('warn', `${rolesAbove} رتبة أعلى من رتبة البوت`, 'ارفع رتبة البوت فوق الرتب اللي يديرها') : add('ok', 'رتبة البوت في الأعلى');
    }
    const { S } = require('./db');
    ['staff_role'].forEach((k) => S(k) ? add('ok', `الإعداد ${k} محدد`) : add('warn', `الإعداد ${k} فاضي`, 'حدده من الداشبورد'));
    S('hosted_registry_channel') ? add('ok', 'روم سجل المشترين محدد') : add('warn', 'روم سجل المشترين غير محدد', 'استخدم /bots-panel');
  } else add('warn', 'البوت الرئيسي غير متصل', 'شغّله من تبويب 🔌 تشغيل البوت لفحص الصلاحيات');
  try {
    for (const b of require('./hosted/manager').list()) {
      if (!b.hasToken) add('bad', `بوت مستضاف #${b.id} بدون توكن`, 'أضف التوكن من ✏️ تعديل');
      else if (b.state === 'error') add('bad', `بوت مستضاف #${b.id} (${b.name}): ${b.error}`, /Intent/.test(b.error) ? 'فعّل Intents من Developer Portal' : '');
      else if (b.expired) add('warn', `بوت #${b.id} (${b.name}) منتهي الاشتراك`, 'مدّد المدة');
      else if (!b.guild_id) add('warn', `بوت #${b.id} بدون ايدي سيرفر`, 'الأوامر تتسجل على كل سيرفراته');
    }
  } catch {}
  return out;
}
module.exports = { run };
if (require.main === module) { require('dotenv').config?.(); const r = run(null); for (const x of r) console.log({ ok: '✅', warn: '⚠️ ', bad: '❌' }[x.level], x.title, x.fix ? `← ${x.fix}` : ''); process.exit(r.some((x) => x.level === 'bad') ? 1 : 0); }
// تم صنع البوت بمتجر نوفا ستور • يوزر الاونر: .5yb.
