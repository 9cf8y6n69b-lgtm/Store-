// أدوات أمان: تشفير بباسفريز (للتوكنات)، TOTP (2FA)، تجزئة مفاتيح البوابة
const crypto = require('crypto'), fs = require('fs'), path = require('path');
const { dirs } = require('./files');

// ---- تشفير ----
function encrypt(obj, pass) {
  if (!pass || pass.length < 8) throw new Error('الباسفريز 8 أحرف على الأقل');
  const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12), key = crypto.scryptSync(pass, salt, 32);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv), data = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return Buffer.from(JSON.stringify({ format: 'nova-secrets', v: 1, salt: salt.toString('base64'), iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), data: data.toString('base64') }));
}
function decrypt(buf, pass) {
  let o; try { o = JSON.parse(buf.toString('utf8')); } catch { throw new Error('الملف غير صالح'); }
  if (o.format !== 'nova-secrets') throw new Error('هذا ليس ملف أسرار Nova');
  try {
    const key = crypto.scryptSync(String(pass || ''), Buffer.from(o.salt, 'base64'), 32), d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(o.iv, 'base64'));
    d.setAuthTag(Buffer.from(o.tag, 'base64'));
    return JSON.parse(Buffer.concat([d.update(Buffer.from(o.data, 'base64')), d.final()]).toString('utf8'));
  } catch { throw new Error('الباسفريز غلط أو الملف تالف'); }
}

// ---- TOTP (RFC 6238) ----
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const b32enc = (b) => { let bits = '', out = ''; for (const x of b) bits += x.toString(2).padStart(8, '0'); for (let i = 0; i < bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)]; return out; };
const b32dec = (s) => { let bits = ''; for (const ch of s.replace(/=+$/, '').toUpperCase()) { const v = B32.indexOf(ch); if (v < 0) throw new Error('bad b32'); bits += v.toString(2).padStart(5, '0'); } const out = []; for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2)); return Buffer.from(out); };
const newSecret = () => b32enc(crypto.randomBytes(20));
function hotp(secret, counter) {
  const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', b32dec(secret)).update(b).digest(), o = h[19] & 15;
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1e6)).padStart(6, '0');
}
function verifyTotp(secret, code, now = Date.now()) {
  code = String(code || '').replace(/\s/g, ''); if (!/^\d{6}$/.test(code) || !secret) return false;
  const step = Math.floor(now / 30000);
  for (let d = -1; d <= 1; d++) if (crypto.timingSafeEqual(Buffer.from(hotp(secret, step + d)), Buffer.from(code))) return true;
  return false;
}
const otpauth = (secret, name) => `otpauth://totp/NovaStore:${encodeURIComponent(name)}?secret=${secret}&issuer=NovaStore`;

// سر المالك (خارج قاعدة البيانات)
const OWNER = path.join(dirs.data, 'owner_totp.json');
const ownerSecret = () => { try { return JSON.parse(fs.readFileSync(OWNER, 'utf8')).secret || ''; } catch { return ''; } };
const setOwnerSecret = (s) => { if (s) fs.writeFileSync(OWNER, JSON.stringify({ secret: s }), { mode: 0o600 }); else fs.rmSync(OWNER, { force: true }); };

// ---- مفاتيح بوابة العميل ----
const hashKey = (key, salt) => crypto.scryptSync(key, salt, 32).toString('hex');
const newKey = () => crypto.randomBytes(18).toString('base64url');
const checkKey = (key, salt, hash) => { if (!key || !salt || !hash) return false; const a = Buffer.from(hashKey(String(key), salt), 'hex'), b = Buffer.from(hash, 'hex'); return a.length === b.length && crypto.timingSafeEqual(a, b); };

module.exports = { encrypt, decrypt, newSecret, verifyTotp, hotp, otpauth, ownerSecret, setOwnerSecret, hashKey, newKey, checkKey };
// تم صنع البوت بمتجر نوفا ستور • يوزر الاونر: .5yb.
