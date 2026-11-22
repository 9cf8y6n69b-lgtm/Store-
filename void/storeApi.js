// واجهة الداشبورد للمتجر: الإعدادات، المنتجات، الكوبونات، الطلبات
const St = require("./utils/store");
const express = require("express"), fs = require("fs"), path = require("path");
const idOk = v => /^\d{15,25}$/.test(String(v || ""));

function mount(app, { client, gld, h }) {
    const need = () => { const g = gld(); if (!g) throw new Error("البوت مش موجود في السيرفر — اتأكد من GUILD_ID"); return g; };
    app.get("/api/v/store", h(async () => {
        const g = need();
        const name = id => g.members.cache.get(id)?.displayName || id;
        return {
            cfg: St.cfg(), products: St.products(), cats: St.CAT, pay: St.PAY, stats: St.stats(),
            coupons: Object.entries(St.coupons()).map(([code, c]) => ({ code, ...c })),
            orders: St.listOrders(60).map(o => ({ id: o.id, user: name(o.userId), status: o.status, statusText: St.STATUS[o.status], items: o.items.map(i => i.name).join("، "), months: St.fmt(St.totalMonths(o)), amount: St.amountFor(St.totalMonths(o), o.pay), created: o.created, channelId: o.channelId, stars: o.stars || 0 })),
            staff: St.topStaff(5).map(r => ({ name: name(r.id), points: r.points, paid: r.paid || 0, delivered: r.delivered || 0 }))
        };
    }));
    app.post("/api/v/store/cfg", h(async b => {
        const g = need(), c = b.cfg || {}, num = (v, d, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
        const old = St.cfg(), rates = {}, payInfo = {};
        for (const k of Object.keys(St.PAY)) { rates[k] = num(c.rates?.[k], old.rates[k], 0, 1e9); payInfo[k] = String(c.payInfo?.[k] ?? old.payInfo[k] ?? "").slice(0, 1800); }
        St.setCfg({
            open: !!c.open, bundleMin: num(c.bundleMin, old.bundleMin, 1, 50), bundleDiscount: num(c.bundleDiscount, old.bundleDiscount, 0, 90),
            allBotsMonths: num(c.allBotsMonths, old.allBotsMonths, 0, 1000), customMin: num(c.customMin, old.customMin, 0, 1000), maxOpen: num(c.maxOpen, old.maxOpen, 1, 20),
            pointsPaid: num(c.pointsPaid, old.pointsPaid, 0, 100), pointsDeliver: num(c.pointsDeliver, old.pointsDeliver, 0, 100),
            customerRole: idOk(c.customerRole) && g.roles.cache.has(c.customerRole) ? c.customerRole : "",
            logChannel: idOk(c.logChannel) && g.channels.cache.has(c.logChannel) ? c.logChannel : "", rates, payInfo,
            autoDeliverFiles: !!c.autoDeliverFiles, botFileMsg: String(c.botFileMsg || old.botFileMsg).slice(0, 800),
            storeName: String(c.storeName || "NOVA STORE").slice(0, 40), invoiceEnabled: !!c.invoiceEnabled, invoiceDm: !!c.invoiceDm, warrantyEnabled: !!c.warrantyEnabled,
            warrantyDays: num(c.warrantyDays, old.warrantyDays, 1, 365), warrantyRemindHours: num(c.warrantyRemindHours, old.warrantyRemindHours, 1, 720),
            reportChannel: idOk(c.reportChannel) && g.channels.cache.has(c.reportChannel) ? c.reportChannel : "", reportIntervalDays: num(c.reportIntervalDays, 0, 0, 90),
            saleValue: num(c.saleValue, 0, 0, 1e9), costValue: num(c.costValue, 0, 0, 1e9), currency: String(c.currency || "").slice(0, 12)
        });
    }));
    // رفع ملف البوت للمنتج (يتسلّم للعميل تلقائياً مع الطلب)
    app.post("/api/v/store/botfile", express.raw({ type: "*/*", limit: "25mb" }), async (q, r) => {
        try {
            const id = Number(q.query.id), list = St.products(), p = list.find(x => x.id === id);
            if (!p) throw new Error("احفظ المنتجات أولاً ثم ارفع الملف");
            if (!Buffer.isBuffer(q.body) || !q.body.length) throw new Error("الملف فاضي");
            let name = String(q.query.name || "bot.zip"); try { name = decodeURIComponent(name); } catch {}
            name = path.basename(name).replace(/[^\w.\-\u0600-\u06FF ]/g, "_").slice(0, 100) || "bot.zip";
            const stored = `${id}-${Date.now()}${path.extname(name).replace(/[^\w.]/g, "").slice(0, 10)}`;
            fs.mkdirSync(St.FILES_DIR, { recursive: true });
            if (p.file?.stored) fs.rmSync(St.filePath(p.file), { force: true });
            fs.writeFileSync(path.join(St.FILES_DIR, stored), q.body);
            p.file = { name, stored, size: q.body.length };
            St.saveProducts(list);
            r.json({ ok: true, file: p.file });
        } catch (e) { r.status(400).json({ error: e.message }); }
    });
    app.post("/api/v/store/botfile/delete", h(async b => {
        const list = St.products(), p = list.find(x => x.id === Number(b.id)); if (!p) throw new Error("المنتج غير موجود");
        if (p.file?.stored) fs.rmSync(St.filePath(p.file), { force: true }); p.file = null; St.saveProducts(list);
    }));
    app.post("/api/v/store/products", h(async b => { if (!Array.isArray(b.list)) throw new Error("قائمة غلط"); St.saveProducts(b.list); }));
    app.post("/api/v/store/coupons", h(async b => { if (!Array.isArray(b.list)) throw new Error("قائمة غلط"); St.saveCoupons(b.list); }));
}

function mountSubs(app, { client, gld, h }) {
    const Subs = require("./utils/subs");
    const need = () => { const g = gld(); if (!g) throw new Error("البوت مش موجود في السيرفر — اتأكد من GUILD_ID"); return g; };
    app.get("/api/v/subs", h(async () => {
        const g = need(), name = id => g.members.cache.get(id)?.displayName || id;
        return { cfg: Subs.cfg(), stats: Subs.stats(), list: Subs.all().sort((a, b) => a.expires - b.expires).slice(0, 300).map(s => ({ id: s.id, userId: s.userId, user: name(s.userId), name: s.name, emoji: s.emoji, expires: s.expires, state: Subs.state(s), stateText: Subs.TXT[Subs.state(s)], reminders: s.reminders, renewReq: s.renewReq, orderId: s.orderId })) };
    }));
    app.post("/api/v/subs/cfg", h(async b => {
        const g = need(), c = b.cfg || {};
        const days = [...new Set(String(c.remindDays ?? "").split(/[ ,،]+/).map(Number).filter(n => n > 0 && n <= 60))].slice(0, 4);
        Subs.setCfg({ title: String(c.title || "").slice(0, 80) || undefined, sub: String(c.sub || "").slice(0, 300) || undefined, banner: c.banner !== false, remindDays: days.length ? days : [3, 1], pingRole: idOk(c.pingRole) && g.roles.cache.has(c.pingRole) ? c.pingRole : "" });
    }));
    app.get("/api/v/subs/preview", async (q, r) => {
        try { const c = Subs.cfg(), buf = await require("../banner").panelCard({ title: String(q.query.title || c.title).slice(0, 80), sub: String(q.query.sub || c.sub).slice(0, 300), chips: ["المدة", "التذكير", "التجديد"] }); buf ? r.type("png").send(buf) : r.status(404).end(); } catch { r.status(500).end(); }
    });
    app.post("/api/v/subs/panel", h(async b => {
        const g = need(), ch = g.channels.cache.get(b.channel); if (!ch || !ch.isTextBased()) throw new Error("اختار روم نصي");
        await require("./events/subs").sendPanel(ch);
    }));
    app.post("/api/v/subs/add", h(async b => {
        const g = need(); if (!idOk(b.userId)) throw new Error("ايدي العضو غلط");
        const days = Number(b.days); if (!(days > 0 && days <= 3650)) throw new Error("المدة بالأيام من 1 إلى 3650");
        Subs.add({ userId: b.userId, name: b.name || "اشتراك", emoji: b.emoji, days, note: b.note });
    }));
    app.post("/api/v/subs/extend", h(async b => { if (!Subs.extend(b.id, Math.max(1, Math.min(3650, Number(b.days) || 30)))) throw new Error("الاشتراك غير موجود"); }));
    app.post("/api/v/subs/delete", h(async b => { Subs.remove(b.id); }));
}
module.exports = { mount: (app, ctx) => { mount(app, ctx); mountSubs(app, ctx); require("./communityApi").mount(app, ctx); require("./hostedApi").mount(app, ctx); } };
