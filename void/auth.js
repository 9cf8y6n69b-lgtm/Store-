// حماية الداشبورد بكلمة سر: ضيف DASH_PASSWORD في Environment. بدونها الداشبورد مفتوح (ويطلع تحذير فيه)
const crypto = require("crypto");
const express = require("express");

const PASSWORD = process.env.DASH_PASSWORD || "";
const SECRET = crypto.createHash("sha256").update(`${PASSWORD}|${process.env.TOKEN || ""}|nova`).digest();
const TTL = 12 * 3600 * 1000, attempts = new Map();

const sign = v => crypto.createHmac("sha256", SECRET).update(v).digest("hex");
const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const session = () => { const exp = Date.now() + TTL; return `${exp}.${sign(String(exp))}`; };
const valid = cookie => {
    const m = /(?:^|;\s*)nova_sess=([^;]+)/.exec(cookie || "");
    if (!m) return false;
    const [exp, sig] = m[1].split(".");
    return Number(exp) > Date.now() && same(sig || "", sign(String(exp)));
};

const page = err => `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>تسجيل الدخول</title>
<style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#000;color:#f0f0f0;font-family:Cairo,system-ui,sans-serif}
form{width:min(360px,90vw);background:#0b0b0b;border:1px solid #1f1f1f;border-radius:18px;padding:28px;display:flex;flex-direction:column;gap:14px}
h1{margin:0 0 6px;font-size:20px}input,button{font:inherit;border-radius:12px;border:1px solid #2a2a2a;padding:12px 14px;background:#131313;color:#fff}
button{background:#fff;color:#000;font-weight:700;border:0;cursor:pointer}.e{color:#ff6b6b;font-size:14px}</style></head>
<body><form method="post" action="/login"><h1>لوحة التحكم</h1>${err ? '<div class="e">كلمة السر غلط</div>' : ""}<input type="password" name="password" placeholder="كلمة السر" autofocus required><button>دخول</button></form></body></html>`;

function mount(app) {
    app.get("/health", (q, r) => r.send("ok"));
    if (!PASSWORD) { app.get("/api/auth", (q, r) => r.json({ protected: false })); return; }

    app.post("/login", express.urlencoded({ extended: false }), (q, r) => {
        const ip = String(q.headers["x-forwarded-for"] || q.socket.remoteAddress || "").split(",")[0].trim();
        const a = attempts.get(ip) || { n: 0, t: Date.now() };
        if (Date.now() - a.t > 10 * 60 * 1000) { a.n = 0; a.t = Date.now(); }
        if (a.n >= 5) return r.status(429).send("محاولات كثيرة، جرب بعد 10 دقايق");
        if (same(String(q.body.password || ""), PASSWORD)) {
            attempts.delete(ip);
            const secure = q.secure || q.headers["x-forwarded-proto"] === "https";
            r.setHeader("Set-Cookie", `nova_sess=${session()}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${TTL / 1000}${secure ? "; Secure" : ""}`);
            return r.redirect("/");
        }
        a.n++; attempts.set(ip, a);
        r.redirect("/?e=1");
    });
    app.get("/logout", (q, r) => { r.setHeader("Set-Cookie", "nova_sess=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0"); r.redirect("/"); });
    app.use((q, r, next) => {
        if (valid(q.headers.cookie) || q.path === "/portal" || q.path === "/portal.html" || q.path.startsWith("/portal/")) return next();
        if (q.path.startsWith("/api/")) return r.status(401).json({ error: "سجّل الدخول أول" });
        r.status(200).type("html").send(page(q.query.e));
    });
    app.get("/api/auth", (q, r) => r.json({ protected: true }));
}

module.exports = { mount, PASSWORD };
