// قراءة/كتابة ملفات zip بدون أي مكتبة خارجية (zlib الجاهز في Node فقط)
const zlib = require("zlib");

const TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = TABLE[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };

function dosStamp(d = new Date()) {
    return {
        time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
        date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
    };
}

// entries: [{ name: "a/b.js", data: Buffer }]
function write(entries) {
    const { time, date } = dosStamp(), parts = [], central = [];
    let offset = 0;
    for (const e of entries) {
        const name = Buffer.from(e.name, "utf8"), data = Buffer.isBuffer(e.data) ? e.data : Buffer.from(e.data);
        let comp = zlib.deflateRawSync(data, { level: 9 }), method = 8;
        if (comp.length >= data.length) { comp = data; method = 0; }
        const crc = crc32(data);

        const lh = Buffer.alloc(30);
        lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(method, 8);
        lh.writeUInt16LE(time, 10); lh.writeUInt16LE(date, 12); lh.writeUInt32LE(crc, 14);
        lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(name.length, 26); lh.writeUInt16LE(0, 28);
        parts.push(lh, name, comp);

        const ch = Buffer.alloc(46);
        ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE((3 << 8) | 20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(method, 10);
        ch.writeUInt16LE(time, 12); ch.writeUInt16LE(date, 14); ch.writeUInt32LE(crc, 16);
        ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(name.length, 28);
        ch.writeUInt32LE(((0o100644 << 16) >>> 0), 38); ch.writeUInt32LE(offset, 42);
        central.push(ch, name);
        offset += lh.length + name.length + comp.length;
    }
    const cd = Buffer.concat(central), end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
    return Buffer.concat([...parts, cd, end]);
}

// يرجع [{ name, data }] — يرفض الأسماء الخطرة (.. أو مسار مطلق) وملفات zip64 والحجم الكبير
function read(buf, { maxEntries = 5000, maxTotal = 200 * 1024 * 1024 } = {}) {
    if (!Buffer.isBuffer(buf) || buf.length < 22) throw new Error("الملف مو zip صحيح");
    let eocd = -1;
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error("الملف مو zip صحيح");
    const count = buf.readUInt16LE(eocd + 10), cdOff = buf.readUInt32LE(eocd + 16);
    if (count === 0xFFFF || cdOff === 0xFFFFFFFF) throw new Error("zip64 غير مدعوم");
    if (count > maxEntries) throw new Error("عدد الملفات كبير");

    const out = []; let p = cdOff, total = 0;
    for (let n = 0; n < count; n++) {
        if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("zip تالف");
        const method = buf.readUInt16LE(p + 10), crc = buf.readUInt32LE(p + 16), csize = buf.readUInt32LE(p + 20), usize = buf.readUInt32LE(p + 24);
        const nlen = buf.readUInt16LE(p + 28), elen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32), lho = buf.readUInt32LE(p + 42);
        const name = buf.slice(p + 46, p + 46 + nlen).toString("utf8");
        p += 46 + nlen + elen + clen;
        if (name.endsWith("/")) continue;
        if (/^([a-zA-Z]:)?[\\/]/.test(name) || name.includes("\\") || name.split("/").some(s => s === ".." || s === "")) throw new Error("اسم ملف غير آمن داخل الأرشيف: " + name.slice(0, 60));
        total += usize; if (total > maxTotal) throw new Error("حجم الأرشيف كبير");
        if (buf.readUInt32LE(lho) !== 0x04034b50) throw new Error("zip تالف");
        const start = lho + 30 + buf.readUInt16LE(lho + 26) + buf.readUInt16LE(lho + 28), raw = buf.slice(start, start + csize);
        const data = method === 0 ? raw : method === 8 ? zlib.inflateRawSync(raw, { maxOutputLength: usize + 1 }) : null;
        if (!data) throw new Error("طريقة ضغط غير مدعومة");
        if (data.length !== usize || crc32(data) !== crc) throw new Error("الملف تالف: " + name.slice(0, 60));
        out.push({ name, data });
    }
    return out;
}

module.exports = { write, read, crc32 };
