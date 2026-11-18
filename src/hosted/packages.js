// الباقات: برونزي < ذهبي < دايموند (كل باقة تحتوي اللي قبلها وزيادة)
const { db } = require('../db');
const BASE = ['welcome', 'autoreply', 'autorole', 'serverstats'];
const GOLD = [...BASE, 'protection', 'logs', 'giveaway', 'suggestions', 'levels', 'line'];
const DIAMOND = [...GOLD, 'tickets', 'moderation', 'economy', 'applications', 'music', 'ai'];
const PACKAGES = {
  bronze: { id: 'bronze', rank: 1, label: 'برونزي', emoji: '🥉', color: 0xcd7f32, templates: BASE, days: 30, price: 3,
    rights: { config: 1, power: 1, presence: 0, logs: 0, portal: 0 }, aiDaily: 0, support: 'دعم عادي',
    perks: ['4 أنظمة أساسية', 'اشتراك شهر', 'تشغيل وإيقاف من لوحتك'] },
  gold: { id: 'gold', rank: 2, label: 'ذهبي', emoji: '🥇', color: 0xffd166, templates: GOLD, days: 90, price: 6,
    rights: { config: 1, power: 1, presence: 1, logs: 1, portal: 1 }, aiDaily: 0, support: 'دعم سريع',
    perks: ['11 نظام (حماية، لوق، قرعات، ليفل، خط تلقائي...)', 'اشتراك 3 أشهر', 'لوحة تحكم خاصة فيك', 'تغيير حالة البوت', 'سجل أحداث البوت'] },
  diamond: { id: 'diamond', rank: 3, label: 'دايموند', emoji: '💎', color: 0x4cc9f0, templates: DIAMOND, days: 180, price: 10,
    rights: { config: 1, power: 1, presence: 1, logs: 1, portal: 1 }, aiDaily: 200, support: 'دعم VIP أولوية',
    perks: ['كل الأنظمة (ميوزك، ذكاء اصطناعي، تذاكر، اقتصاد، إدارة...)', 'اشتراك 6 أشهر', 'لوحة تحكم كاملة', 'أولوية بالدعم وإعادة تشغيل تلقائية', 'ذكاء اصطناعي 200 رسالة/يوم'] },
};
const order = ['bronze', 'gold', 'diamond'];
const get = (id) => PACKAGES[id];
const list = () => order.map((k) => PACKAGES[k]);

// اسم المنتج → القالب (بالكلمات المفتاحية عشان تتحمل تغيير الأسماء من الداشبورد)
const KEYS = [['ترحيب', 'welcome'], ['ردود', 'autoreply'], ['رتب', 'autorole'], ['إحصائيات', 'serverstats'], ['حماية', 'protection'], ['لوق', 'logs'], ['قرعات', 'giveaway'],
  ['اقتراحات', 'suggestions'], ['ميوزك', 'music'], ['ليفل', 'levels'], ['تذاكر', 'tickets'], ['إدارة', 'moderation'], ['اقتصاد', 'economy'], ['تقديم', 'applications'],
  ['ذكاء', 'ai'], ['لوحة', 'panel'], ['خط', 'line']];
const templateOf = (name) => (KEYS.find(([k]) => String(name).includes(k)) || [])[1] || null;

// يحدد الباقة والقوالب لطلب: باقة مختارة من المنتجات ← أو أقل باقة تغطي القوالب المطلوبة ← أو باقة محددة بـ /bot-plan
function planFor(order_) {
  const items = (() => { try { return JSON.parse(order_.items); } catch { return []; } })();
  const saved = db.prepare('SELECT * FROM hosted_plans WHERE order_id=?').get(order_.id);
  let pkgId = saved?.package || '', tpls = new Set();
  for (const it of items) {
    if (it.category === 'package' || /^باقة/.test(it.name || '')) { const p = list().find((x) => it.name.includes(x.label)); if (p && !pkgId) pkgId = p.id; continue; }
    const t = templateOf(it.name); if (t) tpls.add(t);
  }
  if (saved?.templates) for (const t of JSON.parse(saved.templates || '[]')) tpls.add(t);
  let pkg = PACKAGES[pkgId];
  if (pkg && !saved?.templates) pkg.templates.forEach((t) => tpls.add(t));   // الباقة تعطي كل قوالبها
  const months = items.reduce((s, i) => s + (i.category === 'package' ? 0 : +i.months || 0), 0);
  // منتجات منفردة (بدون باقة): مدة الاشتراك = أشهر الطلب، وبدون ربط بباقة
  const custom = !pkg; if (custom) pkg = { id: '', label: 'مخصص', emoji: '🤖', color: 0x9b6bff, templates: [...tpls], days: Math.max(30, Math.round(months * 30)), rights: { config: 1, power: 1, presence: 1, logs: 1, portal: 0 }, aiDaily: 100 };
  const rights = { ...pkg.rights, ...(saved ? JSON.parse(saved.rights || '{}') : {}) };
  if ([...tpls].includes('panel') || items.some((i) => templateOf(i.name) === 'panel')) rights.portal = 1;
  tpls.delete('panel');
  return { pkg, templates: [...tpls].filter((t) => t), name: saved?.name || '', days: saved?.days || pkg.days, rights };
}

module.exports = { PACKAGES, get, list, templateOf, planFor };
// تم صنع البوت بمتجر نوفا ستور • يوزر الاونر: .5yb.
