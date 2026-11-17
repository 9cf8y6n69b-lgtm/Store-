// تحرير القوانين والسياسات من الداشبورد (يولّد الصور من جديد) + رفع الصور بدل الافتراضية
const fs = require('fs'), path = require('path');
const { execFile } = require('child_process');
const { db, DEFAULT_CONTENT } = require('./db');
const { dirs } = require('./files');

const getAll = () => Object.fromEntries(db.prepare('SELECT key,data FROM content').all().map((r) => [r.key, JSON.parse(r.data)]));
const clean = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
function save(key, d) {
  const base = DEFAULT_CONTENT[key]; if (!base) throw new Error('نوع غير معروف');
  const items = (d.items || []).map((x) => ({ h: clean(x.h, 80), t: clean(x.t, 400) })).filter((x) => x.h || x.t).slice(0, 12);
  if (!items.length) throw new Error('لازم بند واحد على الأقل');
  const out = { file: base.file, title: clean(d.title, 40) || base.title, sub: clean(d.sub, 50) || base.sub, items, footer: clean(d.footer, 90) || base.footer };
  db.prepare('INSERT INTO content(key,data) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET data=excluded.data').run(key, JSON.stringify(out));
  return out;
}
function reset(key) {
  if (!DEFAULT_CONTENT[key]) throw new Error('نوع غير معروف');
  db.prepare('INSERT INTO content(key,data) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET data=excluded.data').run(key, JSON.stringify(DEFAULT_CONTENT[key]));
}

function runPython(args) {
  const bins = process.env.PYTHON_BIN ? [process.env.PYTHON_BIN] : ['python3', 'python'];
  return new Promise((resolve, reject) => {
    const attempt = (n) => execFile(bins[n], args, { timeout: 180000, cwd: dirs.root }, (err, out, errout) => {
      if (err && err.code === 'ENOENT' && n + 1 < bins.length) return attempt(n + 1);
      if (err) return reject(new Error(err.code === 'ENOENT' ? 'Python غير مثبّت على جهازك (ثبّته ثم: pip install pillow)' : (errout || err.message).split('\n').slice(-4).join(' ').slice(0, 400)));
      resolve(out);
    });
    attempt(0);
  });
}
// يولّد صور المحتوى (الكل أو مفاتيح محددة). صورة مرفوعة يدوياً لنفس الملف تُحذف عشان يظهر النص الجديد.
async function regenerate(keys) {
  const all = getAll(); keys = (keys && keys.length ? keys : Object.keys(all)).filter((k) => all[k]);
  const file = path.join(dirs.data, 'content.json');
  fs.writeFileSync(file, JSON.stringify(all, null, 1));
  for (const k of keys) fs.rmSync(path.join(dirs.overrides, all[k].file), { force: true });
  await runPython([path.join(dirs.root, 'tools/make_images.py'), '--content', file, '--out', dirs.generated, '--only', keys.join(',')]);
  return keys.map((k) => all[k].file);
}

// ---------- الصور ----------
const IMG_RE = /\.(png|jpe?g)$/i;
const slots = () => fs.readdirSync(dirs.assets).filter((f) => IMG_RE.test(f)).sort();
function listImages() {
  const gen = new Set(Object.values(DEFAULT_CONTENT).map((c) => c.file));
  return slots().map((f) => ({ file: f, uploaded: fs.existsSync(path.join(dirs.overrides, f)), generated: gen.has(f) && fs.existsSync(path.join(dirs.generated, f)), content: gen.has(f) }));
}
function saveUpload(file, buf) {
  file = path.basename(file);
  if (!slots().includes(file)) throw new Error('اسم الصورة غير مسموح');
  if (buf.length > 8 * 1024 * 1024) throw new Error('الحد الأقصى 8MB');
  const png = buf.slice(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])), jpg = buf.slice(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
  if (!png && !jpg) throw new Error('الملف لازم PNG أو JPG');
  fs.writeFileSync(path.join(dirs.overrides, file), buf);
}
const resetImage = (file) => fs.rmSync(path.join(dirs.overrides, path.basename(file)), { force: true });

module.exports = { getAll, save, reset, regenerate, listImages, saveUpload, resetImage, DEFAULT_CONTENT };
