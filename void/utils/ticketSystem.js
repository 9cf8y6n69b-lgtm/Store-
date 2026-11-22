// تخزين نظام التكت: الإعدادات، الطلبات المعلقة، التذاكر المفتوحة، السجل، النقاط
const Pro = require("../prodb");

const K = {
    cfg: g => `ticket_cfg_${g}`, num: g => `ticket_num_${g}`, pend: g => `ticket_pending_${g}`,
    chan: id => `ticket_chan_${id}`, hist: (g, u) => `ticket_hist_${g}_${u}`, pts: g => `ticket_points_${g}`
};

const getConfig = g => Pro.get(K.cfg(g)) || null;
const setConfig = (g, cfg) => Pro.set(K.cfg(g), cfg);

const getTicket = id => Pro.get(K.chan(id)) || null;
const setTicket = (id, t) => Pro.set(K.chan(id), t);
const deleteTicket = id => Pro.delete(K.chan(id));

const nextNumber = g => Pro.add(K.num(g), 1);

const getPending = (g, n) => (Pro.get(K.pend(g)) || {})[n] || null;
function setPending(g, n, req) { const m = Pro.get(K.pend(g)) || {}; m[n] = req; Pro.set(K.pend(g), m); }
function deletePending(g, n) { const m = Pro.get(K.pend(g)) || {}; delete m[n]; Pro.set(K.pend(g), m); }

const getHistory = (g, u) => Pro.get(K.hist(g, u)) || [];
function addHistory(g, u, entry) { const h = getHistory(g, u); h.unshift(entry); Pro.set(K.hist(g, u), h.slice(0, 100)); }
function patchHistory(g, u, match, patch) {
    const h = getHistory(g, u), e = h.find(match);
    if (e) { Object.assign(e, patch); Pro.set(K.hist(g, u), h); }
    return !!e;
}
const updateHistory = (g, u, channelId, patch) => patchHistory(g, u, x => x.channelId === channelId, patch);
const updateHistoryByNumber = (g, u, number, patch) => patchHistory(g, u, x => x.number === number, patch);

function addPoint(g, staffId) {
    const m = Pro.get(K.pts(g)) || {};
    m[staffId] = (m[staffId] || 0) + 1;
    Pro.set(K.pts(g), m);
    return m[staffId];
}

// يبدل {user} {number} {category}... في النصوص المخصصة
const renderText = (tpl, vars = {}) => String(tpl || "").replace(/\{(\w+)\}/g, (m, k) => (k in vars && vars[k] != null ? String(vars[k]) : m));

// الإداري = أدمن، أو عنده رتبة من رتب الدعم
const isStaff = (member, config) => !!member && (member.permissions.has("ADMINISTRATOR") || (config?.reviewerRoleIds || []).some(r => member.roles.cache.has(r)));

module.exports = {
    getConfig, setConfig, getTicket, setTicket, deleteTicket, nextNumber, getPending, setPending, deletePending,
    getHistory, addHistory, updateHistory, updateHistoryByNumber, addPoint, renderText, isStaff,
    allPoints: g => Pro.get(K.pts(g)) || {}
};
