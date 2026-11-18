// مسارات الملفات: الصور الافتراضية في assets/، وصور الداشبورد في data/overrides، والمولّدة في data/generated
const path = require('path'), fs = require('fs');
const ROOT = path.join(__dirname, '..');
const DATA = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');
const dirs = {
  root: ROOT, data: DATA, assets: path.join(ROOT, 'assets'),
  overrides: path.join(DATA, 'overrides'), generated: path.join(DATA, 'generated'),
  restore: path.join(DATA, 'restore'), backups: path.join(DATA, 'backups'),
};
for (const d of [dirs.overrides, dirs.generated, dirs.restore, dirs.backups]) fs.mkdirSync(d, { recursive: true });

// الأولوية: صورة مرفوعة من الداشبورد ← صورة مولّدة من المحتوى ← الصورة الافتراضية
function assetPath(file) {
  file = path.basename(file);
  for (const d of [dirs.overrides, dirs.generated]) { const p = path.join(d, file); if (fs.existsSync(p)) return p; }
  return path.join(dirs.assets, file);
}
module.exports = { dirs, assetPath };
// تم صنع البوت بمتجر نوفا ستور • يوزر الاونر: .5yb.
