// مسارات الاستضافة: البيانات في DATA_DIR (نفس مجلد Nova) والصور في assets/
const path = require("path"), fs = require("fs");
const ROOT = path.join(__dirname, "..");
const DATA = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, "data");
const dirs = { root: ROOT, data: DATA, assets: path.join(ROOT, "assets") };
fs.mkdirSync(DATA, { recursive: true });
const assetPath = f => path.join(dirs.assets, path.basename(f));
module.exports = { dirs, assetPath };
