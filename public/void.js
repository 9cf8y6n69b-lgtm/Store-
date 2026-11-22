/* إضافات الداشبورد: مصمم الترحيب/التقييم + التكت المتقدم + اللوقات + الفلاتر + الأوامر + الخبرة */
(() => {
const E = (tag, p = {}, ...kids) => { const el = document.createElement(tag); for (const k in p) { if (k === 'class') el.className = p[k]; else if (k === 'html') el.innerHTML = p[k]; else if (k.startsWith('on')) el[k] = p[k]; else if (p[k] !== undefined && p[k] !== null) el.setAttribute(k, p[k]); } kids.flat().forEach(c => el.append(c?.nodeType ? c : document.createTextNode(c ?? ''))); return el; };
const post = (p, b) => api(p, b || {});
const dl = (btn, fn, ok) => run(btn, fn, ok);
const btn = (txt, icon, fn, cls) => { const b = E('button', { class: 'btn', type: 'button', html: (icon ? ic(icon) : '') + '' }); b.append(txt); if (cls) b.style.cssText = cls; b.onclick = () => dl(b, fn); return b; };
const ghost = 'background:var(--s3);color:#fff';
const field = (label, input) => E('label', { class: 'f' }, E('span', {}, label), input);
const sel = (items, value, onch, empty) => { const s = E('select'); if (empty !== undefined) s.append(E('option', { value: '' }, empty)); items.forEach(x => s.append(E('option', { value: x.id }, x.name))); s.value = value || ''; s.onchange = () => onch(s.value); return s; };
const toggle = (on, onch) => { const i = E('input', { type: 'checkbox' }); i.checked = !!on; i.onchange = () => onch(i.checked); return E('label', { class: 'sw' }, i, E('i')); };
const row = (icon, title, sub, right) => E('div', { class: 'row' }, E('div', { class: 'tile', html: ic(icon) }), E('div', {}, title, sub ? E('small', {}, sub) : ''), right);
const readFile = f => new Promise((ok, no) => { if (!f) return no(new Error('اختار صورة')); if (f.size > 3 * 1024 * 1024) return no(new Error('الصورة أكبر من 3MB')); const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => no(new Error('فشل قراءة الملف')); r.readAsDataURL(f); });
const pickFile = cb => { const i = E('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp' }); i.onchange = async () => { try { cb(await readFile(i.files[0])); } catch (e) { toast(e.message, true); } }; i.click(); };
const debounce = (f, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => f(...a), ms); }; };

let ST = null;
const state = async () => ST || (ST = await api('state'));
const chans = () => ST.text, roles = () => ST.roles, cats = () => ST.cats;

// ───────────────────────── CSS ─────────────────────────
document.head.append(E('style', {}, `
.dz{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:18px}@media(max-width:900px){.dz{grid-template-columns:1fr}}
.dz-prev{position:sticky;top:12px;align-self:start;background:#fff;border-radius:14px;overflow:hidden;border:1px solid var(--line);min-height:120px}
.dz-prev img{display:block;width:100%;height:auto;cursor:crosshair}.dz-prev small{display:block;padding:8px 12px;background:var(--s2);color:var(--mu);font-size:12px}
.grp{border:1px solid var(--line);border-radius:14px;padding:12px 14px;margin:10px 0;background:var(--s1)}.grp h4{margin:0 0 8px;font-size:14px}
.g3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.g3 label.f{margin:0}.g3 input,.g3 select{width:100%}
input[type=color]{height:42px;padding:3px;width:100%}input[type=range]{width:100%}
.chips2{display:flex;flex-wrap:wrap;gap:8px;margin:6px 0 12px}.chips2 button{background:var(--s3);border:1px solid var(--line);color:#fff;border-radius:999px;padding:6px 12px;cursor:pointer}.chips2 button.on{background:#fff;color:#000}
.vrow{display:grid;grid-template-columns:44px 1fr 1fr 150px 44px;gap:8px;margin-bottom:8px;align-items:center}@media(max-width:700px){.vrow{grid-template-columns:44px 1fr 44px}.vrow>:nth-child(3),.vrow>:nth-child(4){grid-column:1/-1}}
.warn{background:#2a1010;border:1px solid #5a1f1f;color:#ffb4b4;border-radius:14px;padding:12px 16px;margin-bottom:18px;font-size:14px}
.lg{display:grid;grid-template-columns:1fr 220px;gap:10px;align-items:center;padding:8px 0;border-bottom:1px solid var(--line)}
.cmdbox{border:1px solid var(--line);border-radius:12px;margin-bottom:8px;background:var(--s1)}.cmdbox>summary{cursor:pointer;padding:10px 14px;display:flex;gap:10px;align-items:center;list-style:none}.cmdbox>summary code{background:var(--s3);padding:2px 8px;border-radius:8px}.cmdbox>div{padding:10px 14px 14px;border-top:1px solid var(--line)}
.tag{font-size:11px;color:var(--mu);border:1px solid var(--line);border-radius:999px;padding:1px 8px}
`));

// ───────────────────────── مصمم البنر ─────────────────────────
const TXT = { title: 'العنوان', name: 'الاسم', line: 'السطر الصغير' };
async function designCard(kind, host) {
  const r = await api('design/' + kind); let D = r.design, hasFrame = r.hasFrame; const DEF = r.defaults;
  const img = E('img', { alt: '' }), note = E('small', {}, 'اضغط على المعاينة لنقل مركز الصورة الشخصية'), box = E('div', { class: 'dz-prev' }, img, note);
  let busy = false, again = false;
  const render = async () => {
    if (busy) { again = true; return; } busy = true;
    try {
      const res = await fetch('/api/preview/' + kind, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ design: D, sample: { stars: 4 } }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'فشلت المعاينة');
      const url = URL.createObjectURL(await res.blob()); const old = img.src; img.src = url; if (old.startsWith('blob:')) URL.revokeObjectURL(old);
    } catch (e) { note.textContent = e.message; }
    busy = false; if (again) { again = false; render(); }
  };
  const live = debounce(render, 300);
  const set = (path, v) => { const p = path.split('.'); let o = D; while (p.length > 1) o = o[p.shift()]; o[p[0]] = v; live(); };
  const get = path => path.split('.').reduce((o, k) => o?.[k], D);
  const num = (label, path, min, max, step = 1) => { const i = E('input', { type: 'number', min, max, step }); i.value = get(path); i.oninput = () => { if (i.value !== '') set(path, Number(i.value)); }; return field(label, i); };
  const colr = (label, path) => { const i = E('input', { type: 'color' }); i.value = get(path); i.oninput = () => set(path, i.value); return field(label, i); };
  const choose = (label, path, items) => { const s = E('select'); items.forEach(([v, n]) => s.append(E('option', { value: v }, n))); s.value = get(path); s.onchange = () => set(path, s.value); return field(label, s); };

  img.onclick = e => { const b = img.getBoundingClientRect(); const k = img.naturalWidth / b.width; set('avatar.x', Math.round((e.clientX - b.left) * k)); set('avatar.y', Math.round((e.clientY - b.top) * k)); sync(); };

  const frameSel = (() => { const s = E('select'); [['default', 'الإطار الافتراضي (NOVA STORE)'], ['custom', 'صورتي المرفوعة'], ['none', 'بدون إطار (لون فقط)']].forEach(([v, n]) => s.append(E('option', { value: v }, n))); s.value = D.frame; s.onchange = () => { if (s.value === 'custom' && !hasFrame) { toast('ارفع صورة أول', true); s.value = D.frame; return; } set('frame', s.value); }; return s; })();
  const controls = E('div', {});
  const groups = [];
  const g = (title, ...kids) => { const el = E('div', { class: 'grp' }, E('h4', {}, title), ...kids); controls.append(el); return el; };

  g('الخلفية والإطار', field('الإطار', frameSel), colr('لون الخلفية', 'bg'),
    E('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' },
      btn('رفع إطار مخصص', 'img', async () => { const data = await new Promise(ok => pickFile(ok)); await post('design/' + kind + '/frame', { data }); hasFrame = true; D.frame = 'custom'; frameSel.value = 'custom'; await render(); toast('انرفع الإطار'); }, ghost),
      btn('حذف المخصص', 'trash', async () => { await post('design/' + kind + '/frame', { clear: true }); hasFrame = false; D.frame = 'default'; frameSel.value = 'default'; await render(); }, ghost)));

  const av = g('الصورة الشخصية', E('div', { class: 'g3' }, choose('الشكل', 'avatar.shape', [['circle', 'دائرة'], ['rounded', 'مربع منحني'], ['square', 'مربع']]), num('الحجم (نص القطر)', 'avatar.r', 20, 1500), num('انحناء الزوايا', 'avatar.radius', 0, 800)),
    E('div', { class: 'g3' }, num('X', 'avatar.x', 0, 4000), num('Y', 'avatar.y', 0, 4000), E('div')),
    row('img', 'حلقة حول الصورة', 'مفيدة لو الإطار بدون دايرة', toggle(D.ring.on, v => set('ring.on', v))),
    E('div', { class: 'g3' }, colr('لون الحلقة', 'ring.color'), num('سماكتها', 'ring.width', 1, 60), E('div')));
  const sync = () => { av.querySelectorAll('input[type=number]').forEach(i => { /* يرجع القيم بعد الضغط على المعاينة */ }); [['avatar.x'], ['avatar.y']].forEach(([p]) => { const i = [...av.querySelectorAll('input[type=number]')].find(x => x.oninput && x.dataset.p === p); if (i) i.value = get(p); }); };
  av.querySelectorAll('input[type=number]').forEach((i, k) => { i.dataset.p = ['avatar.r', 'avatar.radius', 'avatar.x', 'avatar.y', 'ring.width'][k] || ''; });

  const blocks = kind === 'welcome' || kind === 'boost' ? ['title', 'name', 'line'] : ['title', 'name'];
  blocks.forEach(k => g('نص: ' + TXT[k] + (kind === 'feedback' && k === 'title' ? ' (الشكر)' : ''),
    row('msg', 'إظهاره', '', toggle(D[k].on, v => set(k + '.on', v))),
    E('div', { class: 'g3' }, num('X', k + '.x', 0, 4000), num('Y', k + '.y', 0, 4000), num('الحجم', k + '.size', 8, 240)),
    E('div', { class: 'g3' }, colr('اللون', k + '.color'), choose('المحاذاة', k + '.align', [['right', 'يمين'], ['center', 'وسط'], ['left', 'يسار']]), num('أقصى عرض', k + '.maxW', 40, 4000))));
  if (kind === 'feedback') g('النجوم', E('div', { class: 'g3' }, num('X (أول نجمة)', 'stars.x', 0, 4000), num('Y', 'stars.y', 0, 4000), num('الحجم', 'stars.size', 6, 120)),
    E('div', { class: 'g3' }, num('المسافة', 'stars.gap', 10, 300), colr('لون المفعلة', 'stars.on'), colr('لون الفاضية', 'stars.off')));

  const actions = E('div', { style: 'display:flex;gap:10px;flex-wrap:wrap;margin-top:12px' },
    btn('حفظ التصميم', 'save', async () => { await post('design/' + kind, { design: D }); toast('انحفظ التصميم'); }),
    btn('رجوع للافتراضي', 'x', async () => { if (!confirm('ترجع التصميم للافتراضي وتحذف الإطار المخصص؟')) return; await post('design/' + kind + '/reset'); const n = await api('design/' + kind); D = n.design; hasFrame = false; host.querySelector('.dz-ctl').replaceChildren(); host.replaceChildren(); designCard(kind, host); }, ghost));
  const card = E('div', { class: 'card', style: 'margin-top:16px' }, E('h3', { html: ic('img') + 'تصميم البنر (الدايرة والنصوص والألوان)' }), E('div', { class: 'dz' }, E('div', { class: 'dz-ctl' }, controls, actions), box));
  host.replaceChildren(card); render();
}

// ───────────────────────── صفحات جديدة ─────────────────────────
const loaders = {};
const mkTab = (id, title, sub, icon, loader) => {
  tabs.push([id, title, icon]);
  const b = E('button', { html: ic(icon) + '<span>' + title + '</span>' }); b.dataset.t = id; b.onclick = () => show(id); $('#nav').append(b);
  const s = E('section', { id }, E('div', { class: 'head' }, E('div', { class: 'tile', html: ic(icon) }), E('div', {}, E('h1', {}, title), E('div', { class: 'sub' }, sub))), E('div', { class: 'body' }));
  $('main').append(s); loaders[id] = loader;
  return s.querySelector('.body');
};
const chipsPick = (list, chosen, onch) => { const set = new Set(chosen); const w = E('div', { class: 'chips2' }); list.forEach(x => { const b = E('button', { type: 'button', class: set.has(x.id) ? 'on' : '' }, x.name); b.onclick = () => { set.has(x.id) ? set.delete(x.id) : set.add(x.id); b.classList.toggle('on'); onch([...set]); }; w.append(b); }); return w; };

// ── التكت المتقدم
mkTab('vtickets', 'التكت المتقدم', 'طلب ← قبول/رفض ← تكت (استلام، تحويل، استدعاء، إغلاق) مع صور وأقسام', 'ticket', async function load() {
  const body = $('#vtickets .body'); await state();
  const r = await api('v/tickets'); const c = r.cfg; const hasImg = r.hasImg;
  const area = (k, label) => { const t = E('textarea', { style: 'min-height:70px' }); t.value = c[k] || ''; t.oninput = () => c[k] = t.value; return field(label, t); };
  const catsBox = E('div'); const drawCats = () => { catsBox.replaceChildren(); c.categories.forEach((x, k) => {
    const em = E('input', { type: 'text', placeholder: '😀', maxlength: 60 }); em.value = x.emoji || ''; em.oninput = () => x.emoji = em.value;
    const nm = E('input', { type: 'text', placeholder: 'اسم القسم' }); nm.value = x.name; nm.oninput = () => x.name = nm.value;
    const ds = E('input', { type: 'text', placeholder: 'وصف' }); ds.value = x.description || ''; ds.oninput = () => x.description = ds.value;
    const rl = sel(roles(), x.roleId, v => x.roleId = v || null, 'بدون رتبة خاصة');
    const del = E('button', { class: 'ib', type: 'button', html: ic('trash') }); del.onclick = () => { c.categories.splice(k, 1); drawCats(); };
    catsBox.append(E('div', { class: 'vrow' }, em, nm, ds, rl, del)); }); };
  drawCats();
  const imgCard = (kind, label) => E('div', { class: 'grp' }, E('h4', {}, label), E('div', { class: 'sub', style: 'margin-bottom:8px' }, hasImg[kind] ? 'صورة مخصصة مرفوعة' : 'الصورة الافتراضية (NOVA STORE)'),
    E('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, btn('رفع صورة', 'img', async () => { const data = await new Promise(ok => pickFile(ok)); await post('v/tickets/image', { kind, data }); hasImg[kind] = true; toast('انرفعت الصورة'); load(); }, ghost), btn('حذف المخصصة', 'trash', async () => { await post('v/tickets/image', { kind, clear: true }); hasImg[kind] = false; toast('رجعت للافتراضية'); load(); }, ghost)));
  const emo = E('pre', { class: 'sub', style: 'white-space:pre-wrap' });
  body.replaceChildren(
    E('div', { class: 'two' },
      E('div', { class: 'card' }, E('h3', { html: ic('panel') + 'الرومات والرتب' }),
        field('روم اللوحة', sel(chans(), c.panelChannelId, v => c.panelChannelId = v || null, 'غير محدد')),
        field('روم الطلبات (ريكوست)', sel(chans(), c.requestChannelId, v => c.requestChannelId = v || null, 'غير محدد')),
        field('كاتيغوري التكتات', sel(cats(), c.ticketCategoryId, v => c.ticketCategoryId = v || null, 'غير محدد')),
        E('div', { class: 'sub', style: 'margin:8px 0 2px' }, 'رتب الدعم (تقبل/ترفض وتشوف التكتات)'), chipsPick(roles(), c.reviewerRoleIds || [], v => c.reviewerRoleIds = v),
        E('div', { class: 'sub', style: 'margin:14px 0 2px' }, 'رتب التحويل (الرتب اللي يقدر التكت ينحول لها بزر تحويل)'), chipsPick(roles(), c.transferRoleIds || [], v => c.transferRoleIds = v),
        E('div', { class: 'hint' }, 'لو ما اخترت أي رتبة، التحويل يستخدم رتب الأقسام.')),
      E('div', { class: 'card' }, E('h3', { html: ic('img') + 'الصور' }), imgCard('panel', 'صورة اللوحة'), imgCard('request', 'صورة الطلب'))),
    E('div', { class: 'card', style: 'margin-top:16px' }, E('h3', { html: ic('ticket') + 'الأقسام (حد أقصى 24)' }), catsBox,
      btn('إضافة قسم', 'plus', async () => { if (c.categories.length >= 24) throw new Error('وصلت الحد'); c.categories.push({ id: '', name: '', description: '', emoji: '', roleId: null }); drawCats(); }, ghost)),
    E('div', { class: 'card', style: 'margin-top:16px' }, E('h3', { html: ic('msg') + 'النصوص' }), E('div', { class: 'hint' }, 'المتغيرات: {user} {number} {category} {staff} {ticket} {admin} — اتركها فاضية للنص الافتراضي'),
      area('panelText', 'نص اللوحة'), area('requestText', 'نص الطلب'), area('ticketText', 'نص داخل التكت'), area('acceptedText', 'رسالة الخاص عند القبول'), area('pointText', 'رسالة الخاص عند النقطة')),
    E('div', { style: 'display:flex;gap:10px;flex-wrap:wrap;margin-top:16px' },
      btn('حفظ', 'save', async () => { await post('v/tickets', c); toast('انحفظت الإعدادات'); }),
      btn('إرسال اللوحة', 'send', async () => { await post('v/tickets', c); await post('v/tickets/send', { channelId: c.panelChannelId }); toast('انرسلت اللوحة'); }, ghost),
      btn('رفع إيموجيات التكت للسيرفر', 'plus', async () => { const rep = await post('v/emojis'); emo.textContent = `انضاف: ${rep.created.length} • موجود: ${rep.existed.length} • فشل: ${rep.failed.length}\n` + rep.failed.slice(0, 5).join('\n'); }, ghost)), emo);
});

// ── اللوقات
mkTab('vlogs', 'لوقات', 'لكل نوع لوق روم خاص (دخول/خروج/حذف/صوت/أوامر...) — الصور فقط للوقات الفويس', 'logs', async function load() {
  const body = $('#vlogs .body'); await state(); const r = await api('v/logs');
  const all = sel(chans(), '', () => {}, 'اختار روم'); const list = E('div', { class: 'card', style: 'margin-top:16px' });
  r.types.forEach(t => list.append(E('div', { class: 'lg' }, E('div', {}, `${t.emoji} ${t.label}`), sel(chans(), r.map[t.key], async v => { try { await post('v/logs', { key: t.key, channelId: v || null }); toast('تم'); } catch (e) { toast(e.message, true); } }, '— غير مفعل —'))));
  body.replaceChildren(E('div', { class: 'card' }, E('h3', { html: ic('logs') + 'كل اللوقات في روم واحد' }), field('الروم', all), E('div', { style: 'display:flex;gap:10px;flex-wrap:wrap' }, btn('تطبيق', 'check', async () => { await post('v/logs/all', { channelId: all.value }); toast('تم'); load(); }), btn('مسح كل الإعدادات', 'trash', async () => { if (confirm('تمسح كل إعدادات اللوقات؟')) { await post('v/logs/clear'); load(); } }, ghost)),
    E('div', { class: 'hint', style: 'margin-top:10px' }, 'لإنشاء رومات اللوق تلقائياً اكتب في ديسكورد: لوقات')), list);
});

// ── الفلاتر
mkTab('vfilters', 'الفلاتر', 'كلمات ممنوعة، سبام، دعوات، روابط — مع عقوبات تتدرج', 'shield', async function load() {
  const body = $('#vfilters .body'); await state(); const r = await api('v/filters'); const f = r.filters;
  const P = Object.entries(r.punish).map(([id, name]) => ({ id, name }));
  const lines = (v, onch, ph) => { const t = E('textarea', { style: 'min-height:90px', placeholder: ph }); t.value = (v || []).join('\n'); t.oninput = () => onch(t.value.split('\n').map(x => x.trim()).filter(Boolean)); return t; };
  const sw = (label, sub, k) => row('shield', label, sub, toggle(f[k].enabled, v => f[k].enabled = v));
  const num = (label, obj, k, min, max) => { const i = E('input', { type: 'number', min, max }); i.value = obj[k]; i.oninput = () => obj[k] = Number(i.value); return field(label, i); };
  body.replaceChildren(E('div', { class: 'two' },
    E('div', { class: 'card' }, E('h3', { html: ic('ban') + 'الكلمات الممنوعة' }), sw('تفعيل', 'العقوبة تتدرج مع التكرار', 'words'),
      E('div', { class: 'g3' }, ...[0, 1, 2].map(i => field('عقوبة ' + (i + 1), sel(P, f.words.punish[i], v => f.words.punish[i] = v)))), field('الكلمات (كلمة بكل سطر)', lines(f.words.list, v => f.words.list = v, 'كلمة'))),
    E('div', { class: 'card' }, E('h3', { html: ic('zap') + 'السبام' }), sw('تفعيل', 'رسائل متكررة بوقت قصير', 'spam'), field('العقوبة', sel(P, f.spam.punish, v => f.spam.punish = v)), E('div', { class: 'g3' }, num('عدد الرسائل', f.spam, 'count', 2, 10), num('خلال (ثواني)', f.spam, 'seconds', 5, 120), E('div')))),
    E('div', { class: 'two', style: 'margin-top:16px' },
      E('div', { class: 'card' }, E('h3', { html: ic('mail') + 'روابط الدعوات' }), sw('تفعيل', 'يمنع روابط سيرفرات ديسكورد', 'invites'), field('العقوبة', sel(P, f.invites.punish, v => f.invites.punish = v))),
      E('div', { class: 'card' }, E('h3', { html: ic('link') + 'الروابط' }), sw('تفعيل', 'يمنع أي رابط غير المسموح', 'links'), field('العقوبة', sel(P, f.links.punish, v => f.links.punish = v)), field('نطاقات مسموحة (نطاق بكل سطر)', lines(f.links.allow, v => f.links.allow = v, 'tenor.com')))),
    E('div', { class: 'card', style: 'margin-top:16px' }, E('h3', { html: ic('key') + 'رتب مستثناة' }), chipsPick(roles(), f.exemptRoles || [], v => f.exemptRoles = v)),
    E('div', { style: 'margin-top:16px' }, btn('حفظ', 'save', async () => { await post('v/filters', f); toast('انحفظت الفلاتر'); })));
});

// ── الأوامر والاختصارات
mkTab('vcmds', 'الأوامر', 'كل الأوامر: تعطيل، اختصارات، تحديد الرتب اللي تستخدمها أو الروم', 'term', async function load() {
  const body = $('#vcmds .body'); await state(); const r = await api('v/commands');
  const q = E('input', { type: 'text', placeholder: 'ابحث عن أمر...' }); const list = E('div');
  const draw = () => { list.replaceChildren(); r.commands.filter(c => !q.value || (c.name + c.desc + c.aliases.join(' ')).toLowerCase().includes(q.value.toLowerCase())).forEach(c => {
    const cfg = c.cfg; if (!(cfg.roleIds && cfg.roleIds.length) && cfg.roleId) cfg.roleIds = [cfg.roleId]; const al = E('input', { type: 'text', placeholder: 'اختصارات مفصولة بفاصلة' }); al.value = (cfg.aliases || []).join(', ');
    const d = E('details', { class: 'cmdbox' }, E('summary', {}, E('code', {}, c.name), E('span', { class: 'tag' }, c.dir), cfg.disabled ? E('span', { class: 'tag' }, 'معطّل') : '', E('span', { class: 'sub' }, c.desc)),
      E('div', {}, row('x', 'تعطيل الأمر', '', toggle(cfg.disabled, v => cfg.disabled = v)), E('div', { class: 'sub' }, 'اختصارات مدمجة: ' + (c.aliases.join('، ') || '—')), field('اختصارات إضافية', al),
        E('div', { class: 'sub', style: 'margin:8px 0 2px' }, 'الرتب اللي تستخدم الأمر (بدون اختيار = للجميع)'), chipsPick(roles(), (cfg.roleIds && cfg.roleIds.length) ? cfg.roleIds : (cfg.roleId ? [cfg.roleId] : []), v => cfg.roleIds = v), field('روم محدد', sel(chans(), cfg.channelId, v => cfg.channelId = v || null, 'أي روم')),
        btn('حفظ', 'save', async () => { await post('v/command', { name: c.name, disabled: cfg.disabled, aliases: al.value.split(/[,،]/).map(x => x.trim()).filter(Boolean), roleIds: (cfg.roleIds && cfg.roleIds.length) ? cfg.roleIds : (cfg.roleId && !cfg.roleIds ? [cfg.roleId] : []), channelId: cfg.channelId }); toast('انحفظ'); })));
    list.append(d); }); };
  q.oninput = draw; draw();
  const w = E('input', { type: 'text', placeholder: 'الكلمة (مثال: ب)' }), full = E('input', { type: 'text', placeholder: 'الأمر الكامل (مثال: ban)' }), sc = E('div');
  const drawSc = () => { sc.replaceChildren(); Object.entries(r.shortcuts).forEach(([k, v]) => { const x = E('button', { class: 'ib', type: 'button', html: ic('trash') }); x.onclick = () => dl(x, async () => { await post('v/shortcut', { word: k, remove: true }); delete r.shortcuts[k]; drawSc(); }); sc.append(E('div', { class: 'row' }, E('div', {}, E('code', {}, k), ' ← ', E('code', {}, v)), x)); }); if (!Object.keys(r.shortcuts).length) sc.append(E('div', { class: 'sub' }, 'ما فيه اختصارات')); }; drawSc();
  body.replaceChildren(E('div', { class: 'card' }, E('h3', { html: ic('zap') + 'اختصارات كاملة' }), E('div', { class: 'two' }, field('الكلمة', w), field('الأمر', full)),
    btn('إضافة', 'plus', async () => { await post('v/shortcut', { word: w.value, full: full.value }); r.shortcuts[w.value.toLowerCase().trim()] = full.value; w.value = full.value = ''; drawSc(); toast('انضاف'); }), sc),
    E('div', { class: 'card', style: 'margin-top:16px' }, E('h3', { html: ic('term') + 'كل الأوامر (' + r.commands.length + ')' }), field('بحث', q), list));
});

// ── AFK: البوت يقعد في روم صوتي
mkTab('vafk', 'AFK', 'البوت يدخل روم صوتي محدد ويفضل فيه، ويرجع له لو انطرد أو بعد الموسيقى', 'vol', async function load() {
  const body = $('#vafk .body'); const s = await api('state'); const a = s.db.afk || { enabled: false, channel: '' };
  const ch = sel(s.voice, a.channel, v => a.channel = v, 'اختار روم صوتي');
  body.replaceChildren(E('div', { class: 'card' }, E('h3', { html: ic('vol') + 'روم الـ AFK' }),
    row('vol', 'تفعيل الـ AFK', 'البوت يقعد في الروم (مكتوم وديفن) على طول', toggle(a.enabled, v => a.enabled = v)),
    field('الروم الصوتي', ch),
    E('div', { class: 'hint' }, 'لو شغّلت أغنية بروم ثاني البوت ينتقل لها، وبعد ما تخلص أو توقفها يرجع لروم الـ AFK.'),
    btn('حفظ', 'save', async () => { if (a.enabled && !a.channel) throw new Error('اختار الروم الصوتي أول'); await post('config', { section: 'afk', data: { enabled: a.enabled, channel: a.channel } }); toast('انحفظ'); })));
});

// ── الخط التلقائي
mkTab('vline', 'الخط', 'أي رسالة في الرومات المحددة (عضو، بوت، صورة، أي شي) يرسل البوت الخط بعدها فوراً', 'layers', async function load() {
  const body = $('#vline .body'); await state(); const r = await api('v/line');
  const nameOf = id => (chans().find(c => c.id === id) || {}).name || id;
  const save = async msg => { await post('v/line', { rooms: r.rooms, lineUrl: r.lineUrl }); if (msg) toast(msg); };
  const pickSel = sel(chans().filter(c => !r.rooms.includes(c.id)), '', () => {}, 'اختار روم'), list = E('div');
  const draw = () => { list.replaceChildren(); r.rooms.forEach(id => {
    const x = E('button', { class: 'ib', type: 'button', html: ic('trash') }); x.onclick = () => dl(x, async () => { r.rooms = r.rooms.filter(i => i !== id); await save('انحذف الروم'); load(); });
    list.append(E('div', { class: 'row' }, E('div', { class: 'tile', html: ic('hash') }), E('div', {}, '#' + nameOf(id)), x)); });
    if (!r.rooms.length) list.append(E('div', { class: 'sub' }, 'ما فيه رومات للخط لسه')); };
  draw();
  const url = E('input', { type: 'text', dir: 'ltr', placeholder: 'رابط صورة الخط (اختياري)' }); url.value = r.lineUrl || ''; url.oninput = () => r.lineUrl = url.value;
  body.replaceChildren(
    E('div', { class: 'card' }, E('h3', { html: ic('hash') + 'رومات الخط' }),
      E('div', { class: 'hint' }, 'أي رسالة تنرسل في هذي الرومات (من عضو، بوت، صورة، أي شي) البوت يرسل الخط بعدها مباشرة.'),
      E('div', { style: 'display:flex;gap:10px;align-items:end;flex-wrap:wrap;margin:10px 0 14px' }, E('div', { style: 'flex:1;min-width:200px' }, field('الروم', pickSel)),
        btn('إضافة روم', 'plus', async () => { if (!pickSel.value) throw new Error('اختار روم أول'); r.rooms.push(pickSel.value); await save('انضاف الروم'); load(); })), list),
    E('div', { class: 'card', style: 'margin-top:16px' }, E('h3', { html: ic('img') + 'صورة الخط' }),
      E('div', { class: 'sub', style: 'margin-bottom:10px' }, r.hasImg ? 'صورة مخصصة مرفوعة (لها أولوية)' : (r.lineUrl ? 'يستخدم الرابط' : 'الخط الافتراضي (assets/line.png)')),
      E('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px' },
        btn('رفع صورة', 'img', () => { pickFile(async data => { try { await post('v/line/image', { data }); toast('انرفعت الصورة'); load(); } catch (e) { toast(e.message, true); } }); }, ghost),
        btn('حذف المخصصة', 'trash', async () => { await post('v/line/image', { clear: true }); toast('رجع للافتراضي'); load(); }, ghost)),
      field('أو رابط صورة', url), btn('حفظ', 'save', () => save('انحفظ'))));
});

// ── الخبرة
mkTab('vxp', 'الخبرة والمستويات', 'خبرة من الشات والفويس، ورتب مكافأة عند اللفلات', 'star', async function load() {
  const body = $('#vxp .body'); await state(); const r = await api('v/xp'); const c = r.cfg; c.rewards = c.rewards || [];
  const box = E('div'); const draw = () => { box.replaceChildren(); c.rewards.forEach((x, k) => { const lv = E('input', { type: 'number', min: 1, max: 500, placeholder: 'اللفل' }); lv.value = x.level; lv.oninput = () => x.level = Number(lv.value); const del = E('button', { class: 'ib', type: 'button', html: ic('trash') }); del.onclick = () => { c.rewards.splice(k, 1); draw(); }; box.append(E('div', { class: 'vrow', style: 'grid-template-columns:110px 1fr 44px' }, lv, sel(roles(), x.roleId, v => x.roleId = v, 'اختار رتبة'), del)); }); }; draw();
  body.replaceChildren(E('div', { class: 'two' }, E('div', { class: 'card' }, E('h3', { html: ic('star') + 'الإعدادات' }), row('star', 'تفعيل الخبرة', 'رسالة = 15-25 XP كل دقيقة، فويس = 10 XP/دقيقة', toggle(c.enabled !== false, v => c.enabled = v)),
      field('روم إعلان اللفل (فاضي = نفس روم الرسالة)', sel(chans(), c.levelChannelId, v => c.levelChannelId = v || null, 'نفس الروم')), E('div', { class: 'sub', style: 'margin:10px 0 6px' }, 'مكافآت الرتب'), box,
      E('div', { style: 'display:flex;gap:10px;flex-wrap:wrap' }, btn('إضافة مكافأة', 'plus', async () => { c.rewards.push({ level: 5, roleId: '' }); draw(); }, ghost), btn('حفظ', 'save', async () => { await post('v/xp', { enabled: c.enabled !== false, levelChannelId: c.levelChannelId, rewards: c.rewards }); toast('انحفظ'); }))),
    E('div', { class: 'card' }, E('h3', { html: ic('user') + 'أعلى 10' }), ...(r.top.length ? r.top.map((t, i) => E('div', { class: 'row' }, E('div', {}, `${i + 1}. ${t.name}`, E('small', {}, `${t.xp} XP`)), E('span', { class: 'tag' }, 'لفل ' + t.level))) : [E('div', { class: 'sub' }, 'لسه ما فيه أحد')]))));
});

// ── أغاني الملفات (داخل صفحة الأغاني): رفع، تشغيل، حذف
(() => {
  const list = E('div'), fi = E('input', { type: 'file', accept: '.mp3,.wav,.ogg,.m4a,.flac,.opus,.aac,audio/*', multiple: true, style: 'display:none' });
  const draw = async () => {
    try {
      const r = await api('songs');
      list.replaceChildren(...(r.songs.length ? r.songs.map(s => {
        const play = E('button', { class: 'ib', type: 'button', title: 'تشغيل', html: ic('music') }); play.onclick = () => dl(play, async () => { const x = await post('music/play', { voice: $('#m_vc').value, query: s.name }); toast('تمت الإضافة: ' + x.title); });
        const del = E('button', { class: 'ib', type: 'button', title: 'حذف', html: ic('trash') }); del.onclick = () => dl(del, async () => { if (!confirm('تحذف "' + s.name + '"؟')) return; await post('songs/delete', { name: s.name }); draw(); });
        return E('div', { class: 'row' }, E('div', { class: 'tile', html: ic('music') }), E('div', {}, s.name, E('small', {}, 'ملف محلي')), E('div', { style: 'display:flex;gap:6px' }, play, del));
      }) : [E('div', { class: 'sub' }, 'ما فيه أغاني بعد — ارفع ملفات mp3 أو حطها في مجلد songs')]));
    } catch {}
  };
  const upload = btn('رفع أغاني', 'plus', async () => {
    fi.value = ''; fi.click();
    await new Promise(ok => { fi.onchange = ok; });
    for (const f of fi.files) {
      if (f.size > 30 * 1024 * 1024) { toast(f.name + ': أكبر من 30MB', true); continue; }
      const res = await fetch('/api/songs/upload?name=' + encodeURIComponent(f.name), { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: f });
      if (!res.ok) { toast(f.name + ': ' + ((await res.json().catch(() => ({}))).error || 'فشل الرفع'), true); continue; }
      toast('انرفعت: ' + f.name);
    }
    draw();
  });
  const card = E('div', { class: 'card', style: 'margin-top:16px' }, E('h3', { html: ic('music') + 'أغاني الملفات' }), E('div', { class: 'hint' }, 'الأغاني اللي ترفعها هنا تنحفظ في DATA_DIR/songs. التشغيل بالروم الصوتي المختار فوق. ولو تبي ملفات ثابتة حطها في مجلد songs على GitHub.'), upload, E('div', { style: 'margin-top:12px' }, list));
  $('#music').append(card, fi); draw();
})();

// ── المتجر (يشتغل داخل التكت: زر 🛒 المتجر والشراء)
document.head.append(E('style', {}, `
.srow{display:grid;grid-template-columns:54px minmax(0,1.4fr) 88px 150px 64px 44px;gap:8px;margin-bottom:8px;align-items:center}
.crow{display:grid;grid-template-columns:minmax(0,1.2fr) 90px 90px 70px 44px;gap:8px;margin-bottom:8px;align-items:center}
@media(max-width:760px){.srow{grid-template-columns:54px 1fr 44px}.srow>:nth-child(3),.srow>:nth-child(4),.srow>:nth-child(5){grid-column:1/-1}.crow{grid-template-columns:1fr 1fr 44px}}
.g4{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}@media(max-width:700px){.g4{grid-template-columns:1fr 1fr}}
.ord{display:grid;grid-template-columns:70px minmax(0,1fr) auto;gap:10px;align-items:center;padding:10px 0;border-bottom:1px solid var(--line)}.ord small{display:block;color:var(--mu);font-size:12px}
`));
mkTab('vstore', 'المتجر', 'المنتجات والأسعار والكوبونات والطلبات — الشراء يتم من زر 🛒 داخل التكت', 'tag', async function load() {
  const body = $('#vstore .body'); await state();
  const r = await api('v/store'), c = r.cfg, P = r.products, CP = r.coupons;
  const nin = (k, label, min = 0, max = 100000, step = 'any') => { const i = E('input', { type: 'number', min, max, step }); i.value = c[k]; i.oninput = () => { if (i.value !== '') c[k] = Number(i.value); }; return field(label, i); };
  const stat = (n, label, icon) => E('div', { class: 'stat' }, E('div', { class: 'tile', html: ic(icon) }), E('div', {}, E('b', {}, String(n)), E('span', {}, label)));

  // الإعدادات العامة
  const open = row('tag', 'المتجر مفتوح', 'لو قفلته، زر الشراء داخل التكت يرفض الطلبات الجديدة', toggle(c.open, v => c.open = v));
  const cfgCard = E('div', { class: 'card' }, E('h3', { html: ic('info') + 'إعدادات المتجر' }), open,
    E('div', { class: 'g4', style: 'margin-top:12px' }, nin('bundleMin', 'أقل عدد للباقة', 1, 50), nin('bundleDiscount', 'خصم الباقة %', 0, 90), nin('allBotsMonths', 'سعر كل البوتات (أشهر)', 0, 1000), nin('customMin', 'أقل سعر للمخصص (أشهر)', 0, 1000)),
    E('div', { class: 'g4' }, nin('maxOpen', 'أقصى طلبات مفتوحة للعضو', 1, 20, 1), nin('pointsPaid', 'نقاط تأكيد الدفع', 0, 100, 1), nin('pointsDeliver', 'نقاط التسليم', 0, 100, 1), E('div')),
    E('div', { class: 'two' }, field('رتبة العميل (بعد التسليم)', sel(roles(), c.customerRole, v => c.customerRole = v, 'بدون')), field('روم لوق الطلبات', sel(chans(), c.logChannel, v => c.logChannel = v, 'بدون'))));

  // الفواتير والضمان والتقارير
  const tin = (k, label, ph = '') => { const i = E('input', { type: 'text', placeholder: ph }); i.value = c[k] || ''; i.oninput = () => c[k] = i.value; return field(label, i); };
  const exCard = E('div', { class: 'card' }, E('h3', { html: ic('file') + 'الفواتير والضمان والتقارير' }),
    row('file', 'إرسال فاتورة عند تأكيد الدفع', 'داخل التكت + ملف HTML + لوق الطلبات', toggle(c.invoiceEnabled, v => c.invoiceEnabled = v)),
    row('mail', 'إرسال الفاتورة في الخاص', 'نسخة للعميل في الخاص', toggle(c.invoiceDm, v => c.invoiceDm = v)),
    row('shield', 'الضمان بعد التسليم', 'العميل يشوفه من /warranty ويوصله تنبيه قبل الانتهاء', toggle(c.warrantyEnabled, v => c.warrantyEnabled = v)),
    E('div', { class: 'g4', style: 'margin-top:12px' }, tin('storeName', 'اسم المتجر في الفاتورة'), nin('warrantyDays', 'أيام الضمان', 1, 365, 1), nin('warrantyRemindHours', 'تنبيه قبل الانتهاء (ساعات)', 1, 720, 1), tin('currency', 'رمز العملة للأرباح', 'ر.س')),
    E('div', { class: 'g4' }, nin('saleValue', 'سعر بيع شهر نيترو', 0), nin('costValue', 'تكلفة شهر نيترو', 0), nin('reportIntervalDays', 'تقرير تلقائي كل (أيام، 0 = إيقاف)', 0, 90, 1), E('div')),
    field('روم التقرير التلقائي', sel(chans(), c.reportChannel, v => c.reportChannel = v, 'بدون')), E('div', { class: 'hint' }, 'تقرير يدوي: /report — وفاتورة: /invoice — وضمانك: /warranty'));

  // معدلات الدفع
  const payBox = E('div');
  Object.entries(r.pay).forEach(([k, v]) => {
    const rate = E('input', { type: 'number', min: 0, step: 'any' }); rate.value = c.rates[k]; rate.oninput = () => { if (rate.value !== '') c.rates[k] = Number(rate.value); };
    const info = E('textarea', { style: 'min-height:90px' }); info.value = c.payInfo[k] || ''; info.oninput = () => c.payInfo[k] = info.value;
    payBox.append(E('div', { class: 'grp' }, E('h4', {}, v.emoji + ' ' + v.label), field('المعدل لكل شهر نيترو', rate), field('تعليمات الدفع (تظهر للعميل بعد الطلب)', info)));
  });
  const payCard = E('div', { class: 'card' }, E('h3', { html: ic('key') + 'الدفع والمعدلات' }), payBox);
  const saveCfg = btn('حفظ الإعدادات والدفع', 'save', async () => { await post('v/store/cfg', { cfg: c }); toast('انحفظت إعدادات المتجر'); });

  // المنتجات
  const pBox = E('div'), drawP = () => {
    pBox.replaceChildren(...P.map((x, k) => {
      const em = E('input', { type: 'text', maxlength: 60 }); em.value = x.emoji || ''; em.oninput = () => x.emoji = em.value;
      const nm = E('input', { type: 'text', placeholder: 'اسم المنتج' }); nm.value = x.name; nm.oninput = () => x.name = nm.value;
      const mo = E('input', { type: 'number', min: 0, step: 'any' }); mo.value = x.months; mo.oninput = () => x.months = Number(mo.value) || 0;
      const ct = E('select'); Object.entries(r.cats).forEach(([v, n]) => ct.append(E('option', { value: v }, n))); ct.value = x.category; ct.onchange = () => x.category = ct.value;
      const del = E('button', { class: 'ib', type: 'button', html: ic('trash') }); del.onclick = () => { P.splice(k, 1); drawP(); };
      return E('div', { class: 'srow' }, em, nm, mo, ct, toggle(x.active !== false, v => x.active = v), del);
    }));
  }; drawP();
  const pCard = E('div', { class: 'card' }, E('h3', { html: ic('panel') + 'المنتجات والأسعار (بأشهر النيترو)' }),
    E('div', { class: 'hint' }, 'الإيموجي · الاسم · عدد الأشهر · القسم · مفعّل. الباقات اختر لها قسم "الباقات".'), pBox,
    E('div', { style: 'display:flex;gap:10px;flex-wrap:wrap' }, btn('إضافة منتج', 'plus', async () => { P.push({ id: 0, category: 'basic', name: '', months: 1, emoji: '🤖', active: true }); drawP(); }, ghost),
      btn('حفظ المنتجات', 'save', async () => { await post('v/store/products', { list: P }); toast('انحفظت المنتجات'); })));

  // الكوبونات
  const cBox = E('div'), drawC = () => {
    cBox.replaceChildren(...(CP.length ? CP.map((x, k) => {
      const cd = E('input', { type: 'text', placeholder: 'CODE', dir: 'ltr' }); cd.value = x.code; cd.oninput = () => x.code = cd.value.toUpperCase();
      const pc = E('input', { type: 'number', min: 1, max: 100, placeholder: '%' }); pc.value = x.percent; pc.oninput = () => x.percent = Number(pc.value) || 0;
      const mu = E('input', { type: 'number', min: 0, placeholder: 'أقصى استخدام (0 = بلا حد)' }); mu.value = x.maxUses; mu.oninput = () => x.maxUses = Number(mu.value) || 0;
      const del = E('button', { class: 'ib', type: 'button', html: ic('trash') }); del.onclick = () => { CP.splice(k, 1); drawC(); };
      return E('div', { class: 'crow' }, cd, pc, mu, E('span', { class: 'tag' }, 'مستخدم ' + (x.uses || 0)), del);
    }) : [E('div', { class: 'sub' }, 'ما فيه كوبونات')]));
  }; drawC();
  const cCard = E('div', { class: 'card' }, E('h3', { html: ic('tag') + 'كوبونات الخصم' }), E('div', { class: 'hint' }, 'الكود · نسبة الخصم % · أقصى استخدام. العميل يكتب الكود من زر 🎟️ داخل الطلب.'), cBox,
    E('div', { style: 'display:flex;gap:10px;flex-wrap:wrap' }, btn('إضافة كوبون', 'plus', async () => { CP.push({ code: '', percent: 10, maxUses: 0, uses: 0 }); drawC(); }, ghost),
      btn('حفظ الكوبونات', 'save', async () => { await post('v/store/coupons', { list: CP.filter(x => x.code) }); toast('انحفظت الكوبونات'); })));

  // الطلبات
  const oCard = E('div', { class: 'card' }, E('h3', { html: ic('logs') + 'آخر الطلبات' }),
    ...(r.orders.length ? r.orders.map(o => E('div', { class: 'ord' }, E('b', {}, '#' + o.id), E('div', {}, o.user + ' — ' + o.items, E('small', {}, o.statusText + ' • ' + o.months + ' شهر • ' + o.amount + (o.stars ? ' • ' + '⭐'.repeat(o.stars) : ''))), E('small', {}, new Date(o.created).toLocaleDateString('ar')))) : [E('div', { class: 'sub' }, 'ما فيه طلبات لسه — العميل يفتح تكت ويضغط زر 🛒 المتجر والشراء')]));
  const tCard = r.staff.length ? E('div', { class: 'card' }, E('h3', { html: ic('user') + 'أفضل الستاف' }), ...r.staff.map((t, i) => E('div', { class: 'row' }, E('div', {}, `${i + 1}. ${t.name}`, E('small', {}, `أكّد دفع ${t.paid} • سلّم ${t.delivered}`)), E('span', { class: 'tag' }, t.points + ' نقطة')))) : '';

  body.replaceChildren(
    E('div', { class: 'grid', style: 'margin-bottom:16px' }, stat(r.stats.total, 'كل الطلبات', 'ticket'), stat(r.stats.pending, 'بانتظار الدفع', 'clock'), stat(r.stats.delivered, 'تم التسليم', 'check'), stat(r.stats.months, 'أشهر نيترو مباعة', 'zap')),
    cfgCard, exCard, payCard, saveCfg, E('div', { style: 'height:16px' }), pCard, cCard, oCard, tCard);
});

// ── الاشتراكات (لوحة «اشتراكاتي» + إدارة اشتراكات الأعضاء)
mkTab('vsubs', 'الاشتراكات', 'لوحة «اشتراكاتي» بصورة وزر، والعضو يشوف اشتراكاته ويتحكم فيها', 'clock', async function load() {
  const body = $('#vsubs .body'); await state();
  const r = await api('v/subs'), c = r.cfg;
  const txt = (k, label, area) => { const i = E(area ? 'textarea' : 'input', area ? { style: 'min-height:70px' } : { type: 'text' }); i.value = c[k] || ''; i.oninput = () => { c[k] = i.value; pv(); }; return field(label, i); };
  const img = E('img', { class: 'banner', alt: '' }); let tm; const pv = () => { clearTimeout(tm); tm = setTimeout(() => { img.src = '/api/v/subs/preview?title=' + encodeURIComponent(c.title || '') + '&sub=' + encodeURIComponent(c.sub || '') + '&t=' + Date.now(); }, 300); }; pv();
  const days = E('input', { type: 'text', placeholder: '3, 1' }); days.value = (c.remindDays || []).join(', '); days.oninput = () => c.remindDays = days.value;
  let panelCh = '';
  const stat = (n, label, icon) => E('div', { class: 'stat' }, E('div', { class: 'tile', html: ic(icon) }), E('div', {}, E('b', {}, String(n)), E('span', {}, label)));
  const set = E('div', { class: 'two' },
    E('div', { class: 'card' }, E('h3', { html: ic('panel') + 'اللوحة' }), txt('title', 'العنوان في الصورة'), txt('sub', 'الوصف', true), row('img', 'إرسال الصورة', 'صورة مصممة فوق اللوحة', toggle(c.banner !== false, v => c.banner = v)),
      E('div', { style: 'display:flex;gap:10px;flex-wrap:wrap;margin-top:12px' }, btn('حفظ', 'save', async () => { await post('v/subs/cfg', { cfg: c }); toast('انحفظت'); }))),
    E('div', { class: 'card' }, E('h3', { html: ic('send') + 'إرسال اللوحة' }), field('الروم', sel(chans(), panelCh, v => panelCh = v, 'اختار روم')),
      E('div', { class: 'hint' }, 'أو اكتب /subspanel في أي روم. العضو يكتب /mysubs لو يبي يشوف اشتراكاته سريع.'),
      btn('إرسال اللوحة', 'send', async () => { if (!panelCh) throw new Error('اختار روم'); await post('v/subs/cfg', { cfg: c }); await post('v/subs/panel', { channel: panelCh }); toast('اتبعتت اللوحة'); }),
      field('التذكير في الخاص قبل الانتهاء بكم يوم', days), field('رتبة تتنبّه لطلبات التجديد والإلغاء (في روم لوق المتجر)', sel(roles(), c.pingRole, v => c.pingRole = v, 'بدون'))));
  // إضافة يدوية
  const f = { userId: '', name: '', emoji: '🤖', days: 30 };
  const inp = (k, ph, type = 'text') => { const i = E('input', { type, placeholder: ph }); i.value = f[k]; i.oninput = () => f[k] = type === 'number' ? Number(i.value) : i.value; return i; };
  const addCard = E('div', { class: 'card' }, E('h3', { html: ic('plus') + 'إضافة اشتراك يدوي' }), E('div', { class: 'hint' }, 'للعملاء القدامى: ايدي العضو · الاسم · الإيموجي · المدة بالأيام.'),
    E('div', { class: 'g4' }, inp('userId', 'ايدي العضو'), inp('name', 'اسم الاشتراك'), inp('emoji', '🤖'), inp('days', 'أيام', 'number')),
    btn('إضافة', 'plus', async () => { await post('v/subs/add', f); toast('انضاف الاشتراك'); load(); }));
  const listCard = E('div', { class: 'card' }, E('h3', { html: ic('users') + 'كل الاشتراكات' }),
    ...(r.list.length ? r.list.map(s => {
      const plus = E('button', { class: 'ib', type: 'button', title: '+30 يوم', html: ic('plus') }); plus.onclick = async () => { try { await post('v/subs/extend', { id: s.id, days: 30 }); toast('تم التمديد 30 يوم'); load(); } catch (e) { toast(e.message, true); } };
      const del = E('button', { class: 'ib', type: 'button', title: 'حذف', html: ic('trash') }); del.onclick = async () => { if (!confirm('تحذف الاشتراك؟')) return; await post('v/subs/delete', { id: s.id }); load(); };
      return E('div', { class: 'row' }, E('div', {}, `${s.emoji} ${s.name} — ${s.user}`, E('small', {}, `${s.stateText} • ينتهي ${new Date(s.expires).toLocaleDateString('ar')}${s.renewReq ? ' • طلب تجديد 🔄' : ''}${s.reminders ? '' : ' • التذكير متوقف'}`)), E('div', { style: 'display:flex;gap:6px' }, plus, del));
    }) : [E('div', { class: 'sub' }, 'ما فيه اشتراكات — تنضاف تلقائي لما تسلّم طلب من المتجر داخل التكت')]));
  body.replaceChildren(E('div', { class: 'grid', style: 'margin-bottom:16px' }, stat(r.stats.total, 'كل الاشتراكات', 'layers'), stat(r.stats.active, 'فعّالة', 'check'), stat(r.stats.soon, 'قاربت تنتهي', 'alert'), stat(r.stats.expired, 'منتهية', 'x')), img, set, addCard, listCard);
});

// ── الإعلانات (صورة مصممة + إمبيد + منشن)
mkTab('vannounce', 'الإعلانات', 'إعلان بصورة NOVA STORE مصممة تلقائي مع منشن رتبة أو everyone', 'mega', async function load() {
  const body = $('#vannounce .body'); await state();
  const f = { channel: '', mention: '', title: '', sub: '', text: '', color: '#9b6bff', imageUrl: '', banner: true, btnLabel: '', btnUrl: '' };
  const inp = (k, label, ph = '', area = false) => { const i = E(area ? 'textarea' : 'input', area ? { style: 'min-height:110px' } : { type: 'text', placeholder: ph }); i.value = f[k]; i.oninput = () => { f[k] = i.value; if (k === 'title' || k === 'sub') pv(); }; return field(label, i); };
  const img = E('img', { class: 'banner', alt: '' }); let tm; const pv = () => { clearTimeout(tm); tm = setTimeout(() => { img.src = '/api/announce/preview?title=' + encodeURIComponent(f.title || 'عنوان الإعلان') + '&sub=' + encodeURIComponent(f.sub || '') + '&t=' + Date.now(); }, 300); }; pv();
  const ment = [{ id: 'everyone', name: '@everyone' }, { id: 'here', name: '@here' }, ...roles()];
  body.replaceChildren(img, E('div', { class: 'two' },
    E('div', { class: 'card' }, field('الروم', sel(chans(), f.channel, v => f.channel = v, 'اختار روم')), field('منشن', sel(ment, f.mention, v => f.mention = v, 'بدون منشن')),
      inp('title', 'العنوان (يظهر في الصورة)'), inp('sub', 'سطر صغير في الصورة (اختياري)'), row('img', 'صورة مصممة تلقائي', 'لو طفيتها أو حطيت رابط صورة تستخدم الرابط', toggle(true, v => f.banner = v))),
    E('div', { class: 'card' }, inp('text', 'نص الإعلان', '', true), inp('imageUrl', 'رابط صورة بدل المصممة (اختياري)', 'https://...'), inp('color', 'لون الإمبيد', '#9b6bff'),
      E('div', { class: 'two' }, inp('btnLabel', 'نص الزر (اختياري)'), inp('btnUrl', 'رابط الزر', 'https://...')),
      btn('نشر الإعلان', 'send', async () => { await post('announce', f); toast('تم نشر الإعلان'); }))));
});

// ── القرعات
mkTab('vgw', 'القرعات', 'قرعات بزر مشاركة، مع شرط رتبة، وسحب تلقائي وإعادة سحب', 'zap', async function load() {
  const body = $('#vgw .body'); await state();
  const r = await api('v/community'), c = r.cfg, f = { prize: '', duration: '1d', winners: 1, channel: c.gwChannel, role: '' };
  const inp = (k, label, ph = '', type = 'text') => { const i = E('input', { type, placeholder: ph }); i.value = f[k]; i.oninput = () => f[k] = type === 'number' ? Number(i.value) : i.value; return field(label, i); };
  const make = E('div', { class: 'card' }, E('h3', { html: ic('plus') + 'قرعة جديدة' }), inp('prize', 'الجائزة'),
    E('div', { class: 'two' }, inp('duration', 'المدة (30m / 2h / 1d)', '1d'), inp('winners', 'عدد الفائزين', '', 'number')),
    E('div', { class: 'two' }, field('الروم', sel(chans(), f.channel, v => f.channel = v, 'اختار روم')), field('رتبة مطلوبة (اختياري)', sel(roles(), f.role, v => f.role = v, 'بدون'))),
    btn('بدء القرعة', 'send', async () => { await post('v/gw/create', f); toast('بدأت القرعة'); load(); }));
  const cfg = E('div', { class: 'card' }, E('h3', { html: ic('info') + 'إعدادات القرعات' }), field('روم القرعات الافتراضي', sel(chans(), c.gwChannel, v => c.gwChannel = v, 'بدون')), field('رتبة تتنبّه للقرعات الجديدة', sel(roles(), c.gwPing, v => c.gwPing = v, 'بدون')),
    btn('حفظ', 'save', async () => { await post('v/community/cfg', { cfg: c, blBan: r.blBan }); toast('انحفظت'); }));
  const list = E('div', { class: 'card' }, E('h3', { html: ic('logs') + 'القرعات' }), ...(r.giveaways.length ? r.giveaways.map(g => {
    const act = (txt, path, danger) => { const b = E('button', { class: 'btn', type: 'button', style: ghost + (danger ? ';color:#ff6b6b' : '') }, txt); b.onclick = async () => { try { await post(path, { id: g.id }); toast('تم'); load(); } catch (e) { toast(e.message, true); } }; return b; };
    return E('div', { class: 'row' }, E('div', {}, `#${g.id} 🎁 ${g.prize}`, E('small', {}, `${g.status === 'active' ? 'جارية • تنتهي ' + new Date(g.ends).toLocaleString('ar') : 'منتهية • الفائزون: ' + (g.winnerIds.join('، ') || 'لا أحد')} • 👥 ${g.entries} • #${g.channel}`)),
      E('div', { style: 'display:flex;gap:6px;flex-wrap:wrap' }, ...(g.status === 'active' ? [act('إنهاء الآن', 'v/gw/end')] : [act('سحب جديد', 'v/gw/reroll')]), act('حذف', 'v/gw/delete', true)));
  }) : [E('div', { class: 'sub' }, 'ما فيه قرعات')]));
  body.replaceChildren(make, cfg, list);
});

// ── الردود التلقائية
mkTab('var', 'الردود التلقائية', 'البوت يرد تلقائي لما أحد يكتب كلمة معيّنة', 'bulb', async function load() {
  const body = $('#var .body'); await state();
  const r = await api('v/community'), c = r.cfg, L = r.autoreplies;
  const box = E('div'), draw = () => box.replaceChildren(...(L.length ? L.map((x, k) => {
    const tr = E('input', { type: 'text', placeholder: 'الكلمات (افصل بـ |) مثل: السعر|كم سعر' }); tr.value = x.trigger; tr.oninput = () => x.trigger = tr.value;
    const rs = E('textarea', { style: 'min-height:70px', placeholder: 'الرد — المتغيرات: {user} {name} {server} {channel}' }); rs.value = x.response; rs.oninput = () => x.response = rs.value;
    const mt = E('select'); [['contains', 'يحتوي'], ['word', 'كلمة كاملة'], ['starts', 'يبدأ بـ'], ['exact', 'مطابق تماماً']].forEach(([v, n]) => mt.append(E('option', { value: v }, n))); mt.value = x.match; mt.onchange = () => x.match = mt.value;
    const cd = E('input', { type: 'number', min: 0, placeholder: 'كولداون بالثواني' }); cd.value = x.cooldown; cd.oninput = () => x.cooldown = Number(cd.value) || 0;
    const del = E('button', { class: 'ib', type: 'button', html: ic('trash') }); del.onclick = () => { L.splice(k, 1); draw(); };
    return E('div', { class: 'grp' }, tr, rs, E('div', { class: 'two' }, field('طريقة المطابقة', mt), field('كولداون', cd)), field('الروم (فاضي = كل الرومات ما عدا التكتات)', sel(chans(), x.channel, v => x.channel = v, 'كل الرومات')),
      E('div', { style: 'display:flex;gap:14px;align-items:center;flex-wrap:wrap' }, E('span', {}, 'مفعّل'), toggle(x.enabled !== false, v => x.enabled = v), E('span', {}, 'رد بـ Reply'), toggle(x.reply !== false, v => x.reply = v), del));
  }) : [E('div', { class: 'sub' }, 'ما فيه ردود')]));
  draw();
  body.replaceChildren(E('div', { class: 'card' }, row('bulb', 'تفعيل الردود التلقائية', 'يوقفها كلها لو طفيتها', toggle(c.autoreply !== false, v => c.autoreply = v))), E('div', { class: 'card' }, E('h3', { html: ic('panel') + 'الردود' }), box,
    E('div', { style: 'display:flex;gap:10px;flex-wrap:wrap' }, btn('إضافة رد', 'plus', async () => { L.push({ id: 0, trigger: '', response: '', match: 'contains', channel: '', cooldown: 30, reply: true, enabled: true }); draw(); }, ghost),
      btn('حفظ', 'save', async () => { await post('v/community/cfg', { cfg: c, blBan: r.blBan }); await post('v/ar/save', { list: L.filter(x => x.trigger && x.response) }); toast('انحفظت الردود'); }))));
});

// ── رتب الأزرار
mkTab('vrp', 'رتب الأزرار', 'لوحة أزرار: العضو يضغط ياخذ الرتبة ويضغط تاني يشيلها', 'tag', async function load() {
  const body = $('#vrp .body'); await state();
  const r = await api('v/community'), f = { channel: '', title: '🏷️ اختر رتبك', description: '', mode: 'toggle', roles: [{ roleId: '', label: '', emoji: '' }] };
  const box = E('div'), draw = () => box.replaceChildren(...f.roles.map((x, k) => {
    const lb = E('input', { type: 'text', placeholder: 'نص الزر (اختياري)' }); lb.value = x.label; lb.oninput = () => x.label = lb.value;
    const em = E('input', { type: 'text', placeholder: '🎮' }); em.value = x.emoji; em.oninput = () => x.emoji = em.value;
    const del = E('button', { class: 'ib', type: 'button', html: ic('trash') }); del.onclick = () => { f.roles.splice(k, 1); draw(); };
    return E('div', { class: 'srow' }, em, sel(roles(), x.roleId, v => x.roleId = v, 'اختار رتبة'), lb, E('span'), E('span'), del);
  }));
  draw();
  const t = E('input', { type: 'text' }); t.value = f.title; t.oninput = () => f.title = t.value;
  const d = E('textarea', { style: 'min-height:60px' }); d.oninput = () => f.description = d.value;
  const make = E('div', { class: 'card' }, E('h3', { html: ic('plus') + 'لوحة جديدة' }), field('الروم', sel(chans(), f.channel, v => f.channel = v, 'اختار روم')), field('العنوان', t), field('وصف (اختياري)', d),
    field('طريقة الاختيار', sel([{ id: 'toggle', name: 'أي عدد من الرتب' }, { id: 'single', name: 'رتبة وحدة فقط' }], f.mode, v => f.mode = v)), box,
    E('div', { class: 'hint' }, 'ممنوع توزيع رتب فيها صلاحيات إدارية.'),
    E('div', { style: 'display:flex;gap:10px;flex-wrap:wrap' }, btn('إضافة رتبة', 'plus', async () => { if (f.roles.length < 25) { f.roles.push({ roleId: '', label: '', emoji: '' }); draw(); } }, ghost),
      btn('إرسال اللوحة', 'send', async () => { await post('v/rp/create', { ...f, roles: f.roles.filter(x => x.roleId) }); toast('اتبعتت اللوحة'); load(); })));
  const list = E('div', { class: 'card' }, E('h3', { html: ic('logs') + 'اللوحات المرسلة' }), ...(r.panels.length ? r.panels.map(p => {
    const rs = E('button', { class: 'btn', type: 'button', style: ghost }, 'تحديث'); rs.onclick = async () => { try { await post('v/rp/resend', { id: p.id }); toast('تم'); } catch (e) { toast(e.message, true); } };
    const dl = E('button', { class: 'btn', type: 'button', style: ghost + ';color:#ff6b6b' }, 'حذف'); dl.onclick = async () => { if (!confirm('تحذف اللوحة؟')) return; await post('v/rp/delete', { id: p.id }); load(); };
    return E('div', { class: 'row' }, E('div', {}, `#${p.id} ${p.title}`, E('small', {}, `#${p.channel} • ${p.roles.join('، ')}`)), E('div', { style: 'display:flex;gap:6px' }, rs, dl));
  }) : [E('div', { class: 'sub' }, 'ما فيه لوحات')]));
  body.replaceChildren(make, list);
});

// ── القائمة السوداء
mkTab('vbl', 'القائمة السوداء', 'ممنوع من المتجر والقرعات، وتقدر تحظره تلقائي لو رجع', 'ban', async function load() {
  const body = $('#vbl .body'); await state();
  const r = await api('v/community'), f = { id: '', reason: '' };
  const id = E('input', { type: 'text', placeholder: 'ايدي العضو' }); id.oninput = () => f.id = id.value.trim();
  const rs = E('input', { type: 'text', placeholder: 'السبب' }); rs.oninput = () => f.reason = rs.value;
  let ban = r.blBan;
  body.replaceChildren(E('div', { class: 'card' }, E('h3', { html: ic('plus') + 'إضافة محتال' }), E('div', { class: 'two' }, id, rs), btn('إضافة', 'plus', async () => { await post('v/bl/add', f); toast('انضاف'); load(); })),
    E('div', { class: 'card' }, row('ban', 'حظر تلقائي لو رجع للسيرفر', 'يتحظر أول ما يدخل', toggle(ban, v => ban = v)), btn('حفظ', 'save', async () => { await post('v/community/cfg', { cfg: r.cfg, blBan: ban }); toast('انحفظت'); })),
    E('div', { class: 'card' }, E('h3', { html: ic('logs') + 'القائمة' }), ...(r.blacklist.length ? r.blacklist.map(x => { const d = E('button', { class: 'ib', type: 'button', html: ic('trash') }); d.onclick = async () => { await post('v/bl/remove', { id: x.id }); load(); }; return E('div', { class: 'row' }, E('div', {}, '🚫 ' + x.name, E('small', {}, `${x.id} • ${x.reason || 'بدون سبب'}`)), d); }) : [E('div', { class: 'sub' }, 'القائمة فاضية')])));
});

// ── القوانين والسياسات (صور NOVA STORE)
mkTab('vinfo', 'القوانين والسياسات', 'عدّل البنود وتتولد صورة مرتبة بتصميم NOVA STORE وترسلها لأي روم', 'file', async function load() {
  const body = $('#vinfo .body'); await state();
  const r = await api('v/info'); let key = Object.keys(r.labels)[0], ch = '';
  const host = E('div'), draw = () => {
    const d = JSON.parse(JSON.stringify(r.content[key]));
    const img = E('img', { class: 'banner', alt: '', src: '/api/v/info/preview?key=' + key + '&t=' + Date.now() });
    const tx = (k, label) => { const i = E('input', { type: 'text' }); i.value = d[k] || ''; i.oninput = () => d[k] = i.value; return field(label, i); };
    const items = E('div'), drawI = () => items.replaceChildren(...d.items.map((x, n) => {
      const h = E('input', { type: 'text', placeholder: 'العنوان' }); h.value = x.h; h.oninput = () => x.h = h.value;
      const t = E('textarea', { style: 'min-height:64px', placeholder: 'النص' }); t.value = x.t; t.oninput = () => x.t = t.value;
      const del = E('button', { class: 'ib', type: 'button', html: ic('trash') }); del.onclick = () => { d.items.splice(n, 1); drawI(); };
      return E('div', { class: 'grp' }, h, t, del);
    })); drawI();
    host.replaceChildren(img, E('div', { class: 'card' }, E('div', { class: 'two' }, tx('title', 'العنوان'), tx('sub', 'السطر الإنجليزي الصغير')), tx('footer', 'السطر الأخير'), items,
      E('div', { style: 'display:flex;gap:10px;flex-wrap:wrap' },
        btn('إضافة بند', 'plus', async () => { if (d.items.length < 12) { d.items.push({ h: '', t: '' }); drawI(); } }, ghost),
        btn('حفظ وتحديث الصورة', 'save', async () => { await post('v/info/save', { key, data: d }); r.content[key] = d; toast('انحفظ'); draw(); }),
        btn('رجوع للافتراضي', 'x', async () => { if (!confirm('ترجع النص الافتراضي؟')) return; await post('v/info/reset', { key }); const n = await api('v/info'); r.content = n.content; draw(); }, ghost))),
      E('div', { class: 'card' }, field('إرسال الصورة في روم', sel(chans(), ch, v => ch = v, 'اختار روم')), btn('إرسال', 'send', async () => { if (!ch) throw new Error('اختار روم'); await post('v/info/send', { key, channel: ch }); toast('اتبعتت'); })));
  };
  body.replaceChildren(field('النوع', sel(Object.entries(r.labels).map(([id, name]) => ({ id, name })), key, v => { key = v; draw(); })), host); draw();
});

// ── الاستضافة: بوتات العملاء (توكن + أنظمة جاهزة + باقات + بوابة خاصة)
mkTab('vhost', 'الاستضافة', 'شغّل بوتات العملاء بأنظمة جاهزة من نفس البرنامج، مع باقات واشتراكات وبوابة تحكم لكل عميل', 'bot', async function load() {
  const body = $('#vhost .body'); await state();
  const r = await api('v/hosted'), c = r.cfg, T = r.templates, PKG = r.packages;
  const st = (n, label, icon) => E('div', { class: 'stat' }, E('div', { class: 'tile', html: ic(icon) }), E('div', {}, E('b', {}, String(n)), E('span', {}, label)));
  const BADGE = { online: '🟢 شغّال', starting: '🟡 يبدأ', stopped: '⚪ متوقف', error: '🔴 خطأ' };
  const copy = async t => { try { await navigator.clipboard.writeText(t); } catch {} };
  const tx = (k, label, area) => { const i = E(area ? 'textarea' : 'input', area ? { style: 'min-height:80px' } : { type: 'text' }); i.value = c[k] || ''; i.oninput = () => c[k] = i.value; return field(label, i); };

  const settings = E('div', { class: 'card' }, E('h3', { html: ic('info') + 'إعدادات الاستضافة' }),
    E('div', { class: 'two' }, field('روم سجل المشترين والبوتات', sel(chans(), c.hosted_registry_channel, v => c.hosted_registry_channel = v, 'بدون')), field('رتبة الستاف (تتنبّه وتدير)', sel(roles(), c.staff_role, v => c.staff_role = v, 'بدون'))),
    E('div', { class: 'two' }, field('رتبة مسموح لها بإدارة البوتات', sel(roles(), c.hosted_review_role, v => c.hosted_review_role = v, 'بدون')), tx('hosted_renew_link', 'رابط التجديد')),
    tx('hosted_remind_days', 'تنبيه قبل الانتهاء بكم يوم (مفصولة بفاصلة)'), tx('hosted_addbot_msg', 'رسالة «أضف بوتك» بعد الدفع', true), tx('hosted_expire_msg', 'رسالة تنبيه الانتهاء ({owner} {bot} {link})', true),
    btn('حفظ', 'save', async () => { await post('v/hosted/cfg', { cfg: c }); toast('انحفظت إعدادات الاستضافة'); }));

  // إضافة بوت
  const f = { name: '', token: '', guildId: '', ownerId: '', package: '', days: '', note: '', templates: [], start: true };
  const tplBox = E('div', { class: 'g4' }), drawT = () => tplBox.replaceChildren(...T.map(t => { const cb = E('input', { type: 'checkbox' }); cb.checked = f.templates.includes(t.id); cb.onchange = () => { f.templates = cb.checked ? [...f.templates, t.id] : f.templates.filter(x => x !== t.id); }; return E('label', { class: 'f', style: 'flex-direction:row;gap:8px;align-items:center' }, cb, E('span', { title: t.desc }, `${t.emoji} ${t.label}`)); }));
  drawT();
  const inp = (k, label, ph = '', type = 'text') => { const i = E('input', { type, placeholder: ph }); i.value = f[k]; i.oninput = () => f[k] = i.value; return field(label, i); };
  const pk = sel(PKG.map(p => ({ id: p.id, name: `${p.emoji} ${p.label} — ${p.days} يوم` })), f.package, v => { f.package = v; const p = PKG.find(x => x.id === v); f.templates = p ? [...p.templates] : []; drawT(); }, 'بدون باقة (اختر الأنظمة يدوي)');
  const add = E('div', { class: 'card' }, E('h3', { html: ic('plus') + 'إضافة بوت عميل' }), E('div', { class: 'two' }, inp('name', 'اسم البوت'), inp('token', 'توكن البوت', 'من Developer Portal', 'password')),
    E('div', { class: 'two' }, inp('guildId', 'ايدي سيرفر العميل (اختياري)'), inp('ownerId', 'ايدي صاحب البوت (للتنبيهات)')), E('div', { class: 'two' }, field('الباقة', pk), inp('days', 'مدة الاشتراك بالأيام (فاضي = حسب الباقة)', '', 'number')),
    field('الأنظمة', tplBox), inp('note', 'ملاحظة'), row('bot', 'تشغيل مباشرة', 'يشتغل البوت بعد الإضافة', toggle(true, v => f.start = v)),
    btn('إضافة البوت', 'plus', async () => { await post('v/hosted/create', { ...f, days: Number(f.days) || 0 }); toast('انضاف البوت'); load(); }));

  // قائمة البوتات
  const list = E('div');
  const card = b => {
    const act = (txt, action, extra = {}, danger) => { const x = E('button', { class: 'btn', type: 'button', style: ghost + (danger ? ';color:#ff6b6b' : '') }, txt); x.onclick = async () => { if (action === 'remove' && !confirm('تحذف البوت نهائياً؟')) return; try { const res = await post('v/hosted/action', { id: b.id, action, ...extra }); if (res.key) { await copy(res.key); prompt(`مفتاح البوابة (انسخه الحين، ما يظهر مرة ثانية)\nالرابط: ${location.origin}/portal\nرقم البوت: ${b.id}`, res.key); } toast('تم'); load(); } catch (e) { toast(e.message, true); } }; return x; };
    const exp = b.expires ? `${b.expired ? '⛔ انتهى' : 'ينتهي'} ${new Date(b.expires).toLocaleDateString('ar')}` : 'بدون انتهاء';
    const edit = E('div', { style: 'display:none;margin-top:12px' }), logs = E('pre', { style: 'display:none;max-height:240px;overflow:auto;background:var(--s2);padding:10px;border-radius:12px;font-size:12px;direction:ltr;white-space:pre-wrap' });
    const eBtn = E('button', { class: 'btn', type: 'button', style: ghost }, 'تعديل الأنظمة والإعدادات');
    eBtn.onclick = async () => {
      if (edit.style.display === 'block') { edit.style.display = 'none'; return; }
      let gi = {}; try { gi = await post('v/hosted/guild', { id: b.id }); } catch {}
      const cfg = JSON.parse(JSON.stringify(b.config || {})), tpls = [...b.templates], pres = { status: 'online', type: 'Playing', text: '', ...(b.presence || {}) };
      const roleOpts = gi.roles || [], chOpts = (gi.channels || []).filter(x => x.type === 0), voice = (gi.channels || []).filter(x => x.type === 2), cat = (gi.channels || []).filter(x => x.type === 4);
      const box = E('div'), draw = () => box.replaceChildren(...T.filter(t => tpls.includes(t.id)).map(t => E('div', { class: 'grp' }, E('h4', {}, `${t.emoji} ${t.label}`), ...(t.settings || []).map(sf => {
        const cur = (cfg[t.id] || {})[sf.key] ?? sf.def ?? '', set = v => { cfg[t.id] = { ...(cfg[t.id] || {}), [sf.key]: v }; };
        if (sf.type === 'bool') return row('check', sf.label, '', toggle(cur === '1' || cur === true, v => set(v ? '1' : '0')));
        if (['channel', 'role', 'category'].includes(sf.type)) { const items = sf.type === 'role' ? roleOpts : sf.type === 'category' ? cat : [...chOpts, ...voice]; if (items.length) return field(sf.label, sel(items, cur, set, 'بدون')); }
        const i = E(sf.type === 'textarea' ? 'textarea' : 'input', sf.type === 'textarea' ? { style: 'min-height:70px' } : { type: sf.type === 'number' ? 'number' : 'text' }); i.value = cur; i.oninput = () => set(i.value); return field(sf.label, i);
      }))));
      const pick = E('div', { class: 'g4' }, ...T.map(t => { const cb = E('input', { type: 'checkbox' }); cb.checked = tpls.includes(t.id); cb.onchange = () => { if (cb.checked) tpls.push(t.id); else tpls.splice(tpls.indexOf(t.id), 1); draw(); }; return E('label', { class: 'f', style: 'flex-direction:row;gap:8px;align-items:center' }, cb, E('span', {}, `${t.emoji} ${t.label}`)); }));
      draw();
      const ps = sel(['online', 'idle', 'dnd', 'invisible'].map(x => ({ id: x, name: x })), pres.status, v => pres.status = v), pt = sel(['Playing', 'Watching', 'Listening', 'Competing', 'Custom'].map(x => ({ id: x, name: x })), pres.type, v => pres.type = v), px = E('input', { type: 'text', placeholder: 'نص الحالة' }); px.value = pres.text; px.oninput = () => pres.text = px.value;
      edit.replaceChildren(field('الأنظمة المفعّلة', pick), box, E('div', { class: 'g4' }, field('الحالة', ps), field('النشاط', pt), field('النص', px)),
        btn('حفظ التعديلات', 'save', async () => { await post('v/hosted/update', { id: b.id, data: { templates: tpls, config: cfg, presence: pres } }); toast('انحفظت — أعد تشغيل البوت لتطبيق الأنظمة الجديدة'); }));
      edit.style.display = 'block';
    };
    const lBtn = E('button', { class: 'btn', type: 'button', style: ghost }, 'السجل');
    lBtn.onclick = async () => { if (logs.style.display === 'block') { logs.style.display = 'none'; return; } const l = await post('v/hosted/logs', { id: b.id }); logs.textContent = (l.logs || []).join('\n') || 'لا يوجد سجل'; logs.style.display = 'block'; };
    return E('div', { class: 'card' }, E('div', { class: 'row', style: 'padding-top:0' }, E('div', {}, `${BADGE[b.state] || b.state} • #${b.id} ${b.name}${b.suspended ? ' • ⛔ معلّق' : ''}`, E('small', {}, `${b.tag || 'لم يتصل'} • ${exp} • المالك: ${b.owner_id || '—'}${b.package ? ' • ' + b.package : ''}${b.error ? ' • ' + b.error : ''}`)), E('span', { class: 'tag' }, `${b.templates.length} نظام`)),
      E('div', { style: 'display:flex;gap:6px;flex-wrap:wrap;margin-top:8px' }, act('▶️ تشغيل', 'start'), act('⏹️ إيقاف', 'stop'), act('🔄 إعادة', 'restart'), act(b.suspended ? '✅ فك التعليق' : '⛔ تعليق', b.suspended ? 'resume' : 'suspend'), act('⏳ +30 يوم', 'extend', { days: 30 }), act(b.hasPortal ? '🔑 مفتاح جديد' : '🔑 بوابة العميل', 'portal-key'), ...(b.hasPortal ? [act('إلغاء البوابة', 'portal-key-delete')] : []), ...(b.invite ? [E('a', { class: 'btn', style: ghost + ';text-decoration:none', href: b.invite, target: '_blank' }, '🔗 دعوة')] : []), eBtn, lBtn, act('🗑️ حذف', 'remove', {}, true)), logs, edit);
  };
  list.replaceChildren(...(r.bots.length ? r.bots.map(card) : [E('div', { class: 'card sub' }, 'ما فيه بوتات مستضافة — أضف بوت من الفوق، أو بعد دفع طلب فيه بوتات يظهر للعميل زر «أضف بوتك» في التكت')]));
  const on = r.bots.filter(b => b.state === 'online').length;
  body.replaceChildren(E('div', { class: 'grid', style: 'margin-bottom:16px' }, st(r.bots.length, 'كل البوتات', 'bot'), st(on, 'شغّالة', 'check'), st(r.bots.filter(b => b.expired).length, 'منتهية', 'alert'), st(T.length, 'أنظمة جاهزة', 'layers')),
    E('div', { class: 'hint', style: 'margin-bottom:12px' }, `بوابة العميل: ${location.origin}/portal (رقم البوت + المفتاح)`), settings, add, list);
});

// ───────────────────────── ربط ─────────────────────────
const _show = show;
window.show = function (id) { _show(id); if (loaders[id]) loaders[id]().catch(e => toast(e.message, true)); };
const designHosts = {};
['welcome', 'boost'].forEach(k => { const host = E('div'); $('#' + k).append(host); designHosts[k] = host; });
const prevShow = window.show;
window.show = function (id) { prevShow(id); if ((id === 'welcome' || id === 'boost') && !designHosts[id].dataset.ok) { designHosts[id].dataset.ok = 1; designCard(id, designHosts[id]).catch(e => { designHosts[id].dataset.ok = ''; toast(e.message, true); }); } };

api('auth').then(a => {
  if (!a.protected) $('main').prepend(E('div', { class: 'warn' }, '⚠️ الداشبورد مو محمي بكلمة سر — أي أحد يعرف الرابط يتحكم بالبوت. ضيف DASH_PASSWORD في Environment على Render.'));
  else $('aside').append(E('a', { href: '/logout', style: 'margin-top:auto;padding:10px 14px;color:var(--mu);font-size:13px' }, 'تسجيل الخروج'));
}).catch(() => {});
const h0 = location.hash.slice(1); if (h0 && (loaders[h0] || h0 === 'welcome' || h0 === 'feedback' || h0 === 'boost')) window.show(h0);
})();
