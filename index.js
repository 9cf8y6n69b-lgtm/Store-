require('dotenv').config();
const fs = require('fs'), path = require('path'), express = require('express');
const { spawn, spawnSync } = require('child_process');
const { Transform } = require('stream');
const banner = require('./banner');
const { Soundcloud } = require('soundcloud.ts');
const { getVoiceConnection, joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, VoiceConnectionStatus, entersState, StreamType, NoSubscriberBehavior, generateDependencyReport } = require('@discordjs/voice');
const {
  Client, GatewayIntentBits: I, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ChannelType, PermissionFlagsBits: P, SlashCommandBuilder, REST, Routes,
  ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, SectionBuilder, ThumbnailBuilder, FileBuilder, AttachmentBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, Partials, MessageFlags
} = require('discord.js');

const E = MessageFlags.Ephemeral;
// كل الـ Intents (نظام اللوقات والتكت والفلاتر يحتاجها). فعّل Presence + Server Members + Message Content من بوابة المطورين
const client = new Client({ intents: Object.values(I).filter(v => typeof v === 'number'), partials: [Partials.Message, Partials.Channel, Partials.GuildMember, Partials.User, Partials.Reaction] });
const voidLoader = require('./void/loader'); voidLoader.init(client); // نظام Void: تكت متقدم، لوقات، فلاتر، XP، هيلب
const dashApi = require('./void/dashboardApi');
const gld = () => client.guilds.cache.get(process.env.GUILD_ID);
const isStaff = m => !!m && (m.permissions.has(P.Administrator) || (db.admin.role && m.roles.cache.has(db.admin.role)));
const permOf = {};

const DB = path.join(process.env.DATA_DIR || __dirname, 'data.json'); // لو عندك Disk في Render حط DATA_DIR=/var/data عشان ما تضيع الإعدادات
const def = {
  protection: { invites: true, links: false, spam: true, badwords: false, raid: true, words: [], logChannel: '', spamLimit: 5, raidLimit: 6 },
  admin: { role: '' },
  welcome: { enabled: false, channel: '', role: '', banner: true, title: 'أهلاً بيك', line: 'أنت العضو رقم {count} في {server}', text: 'نورتنا يا {user} 🎉' },
  feedback: { enabled: false, channel: '', outChannel: '', thanks: 'شكرًا لتقييمك!' },
  boost: { enabled: false, channel: '', banner: true, title: 'شكراً على البوست', line: '{server} صار فيه {boosts} بوست', text: '{user} شكراً على البوست! 💜 دعمك يفرق معنا' },
  suggest: { enabled: false, channel: '', outChannel: '', dm: true, count: 0, panelTitle: '💡 اكتب اقتراحك', panelText: 'اضغط الزر واكتب اقتراحك، وبينرسل لروم الاقتراحات ويصوّت عليه الأعضاء.' },
  sugs: {},
  music: { volume: 60 },
  afk: { enabled: false, channel: '' },
  logs: { channel: '', events: { msgDelete: true, msgEdit: true, join: true, leave: true, ban: true, roles: true, channels: true, member: true, voice: false } },
  tickets: { style: 'buttons', types: [], category: '', role: '', logChannel: '', dm: true, count: 0, welcome: 'أهلاً بيك! اكتب مشكلتك وهيرد عليك الفريق في أقرب وقت.' },
  warns: {}
};
let db = structuredClone(def);
try { const s = JSON.parse(fs.readFileSync(DB, 'utf8')); for (const k in def) db[k] = { ...def[k], ...(s[k] || {}) }; } catch {}
const save = () => {
  if (global.__NOVA_RESTORING) return; // أثناء الاسترجاع ممنوع نكتب فوق النسخة المسترجعة
  fs.writeFileSync(DB, JSON.stringify(db, null, 1));
  try { require('./void/backup').notify('تعديل إعدادات البوت'); } catch {} // يرسل نسخة احتياطية للأونر
};

// صور الهوية (assets/): بانر + خط فاصل + لوجو. تتعطل كلها لو حطيت NO_BRAND_IMAGES=1 في Environment
const BRAND_ON = !process.env.NO_BRAND_IMAGES;
const BR = { banner: ['banner.jpg', 'brand-banner.jpg'], line: ['line.png', 'brand-line.png'], logo: ['logo.png', 'brand-logo.png'] };
const brandImg = (k, files) => {
  if (!BRAND_ON) return null;
  const [file, name] = BR[k], buf = banner.asset(file);
  if (!buf) return null;
  files.push(new AttachmentBuilder(buf, { name }));
  return 'attachment://' + name;
};
const gallery = url => new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(url));
// o.brand: 'banner' | 'line' | 'both'  (بانر فوق / خط فاصل تحت النص)   o.thumb: لوجو صغير جنب العنوان
const V = (title, desc, o = {}) => {
  const bf = [], c = new ContainerBuilder().setAccentColor(o.color ?? 0xffffff);
  const wantBanner = (o.brand === 'banner' || o.brand === 'both') && !(o.image && o.top);
  const wantLine = o.brand === 'line' || o.brand === 'both';
  const bUrl = wantBanner ? brandImg('banner', bf) : null;
  if (bUrl) c.addMediaGalleryComponents(gallery(bUrl));
  if (o.image && o.top) c.addMediaGalleryComponents(gallery(o.image));
  const logo = o.thumb && (title || desc) ? brandImg('logo', bf) : null;
  if (logo) {
    const sec = new SectionBuilder().setThumbnailAccessory(new ThumbnailBuilder().setURL(logo));
    if (title) sec.addTextDisplayComponents(new TextDisplayBuilder().setContent('## ' + title));
    if (desc) sec.addTextDisplayComponents(new TextDisplayBuilder().setContent(desc));
    c.addSectionComponents(sec);
  } else {
    if (title) c.addTextDisplayComponents(new TextDisplayBuilder().setContent('## ' + title));
    if (title && desc) c.addSeparatorComponents(new SeparatorBuilder());
    if (desc) c.addTextDisplayComponents(new TextDisplayBuilder().setContent(desc));
  }
  if (o.image && !o.top) c.addMediaGalleryComponents(gallery(o.image));
  if (o.footer) c.addTextDisplayComponents(new TextDisplayBuilder().setContent('-# ' + o.footer));
  if (o.file) c.addFileComponents(new FileBuilder().setURL('attachment://' + o.file));
  const lUrl = wantLine ? brandImg('line', bf) : null;
  if (lUrl) c.addMediaGalleryComponents(gallery(lUrl));
  if (o.row) c.addActionRowComponents(o.row);
  (o.rows || []).forEach(r => c.addActionRowComponents(r));
  const files = [...(o.files || []), ...bf];
  return { components: [c], flags: MessageFlags.IsComponentsV2 | (o.eph ? E : 0), files: files.length ? files : undefined };
};
const hex = x => parseInt((x || '#ffffff').replace('#', ''), 16) || 0xffffff;
function build(b) {
  if (!b.desc) throw new Error('اكتب نص الرسالة');
  const color = hex(b.color);
  if (b.mode === 'text') return { content: b.desc };
  if (b.mode === 'v2') {
    let row;
    if (b.btnLabel && /^https?:\/\//.test(b.btnUrl || '')) row = new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel(b.btnLabel).setURL(b.btnUrl).setStyle(ButtonStyle.Link));
    return V(b.title, b.desc, { color, image: b.image, footer: b.footer, row, brand: b.image ? 'line' : 'both' });
  }
  const e = new EmbedBuilder().setColor(color).setDescription(b.desc);
  if (b.title) e.setTitle(b.title);
  const files = [];
  const img = b.image || brandImg('banner', files);
  if (img) e.setImage(img);
  if (b.footer) e.setFooter({ text: b.footer });
  return { embeds: [e], files: files.length ? files : undefined };
}

let bc = { running: false, sent: 0, failed: 0, total: 0 };
async function broadcast(b) {
  if (bc.running) throw new Error('في برودكاست شغال دلوقتي');
  const msg = build(b);
  const ms = (await gld().members.fetch()).filter(m => !m.user.bot && (!b.role || m.roles.cache.has(b.role)));
  bc = { running: true, sent: 0, failed: 0, total: ms.size };
  (async () => {
    for (const m of ms.values()) {
      try { await m.send(msg); bc.sent++; } catch { bc.failed++; }
      await new Promise(r => setTimeout(r, 1200));
    }
    bc.running = false;
  })();
}

const closeRow = () => new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('tk_close').setLabel('إغلاق التذكرة').setStyle(ButtonStyle.Secondary));
const parseEmoji = e => { if (!e) return undefined; const m = /^<(a?):(\w+):(\d+)>$/.exec(e); return m ? { animated: !!m[1], name: m[2], id: m[3] } : e; };
function panelRows() {
  const t = db.tickets, types = (t.types || []).filter(x => x.label).slice(0, 25);
  if (!types.length) types.push({ id: 'default', label: 'فتح تذكرة' });
  if (t.style === 'menu') {
    const menu = new StringSelectMenuBuilder().setCustomId('tk_menu').setPlaceholder('اختار نوع التذكرة').addOptions(types.map(x => {
      const o = { label: x.label.slice(0, 100), value: x.id, emoji: parseEmoji(x.emoji) };
      if (x.desc) o.description = x.desc.slice(0, 100);
      if (!o.emoji) delete o.emoji;
      return o;
    }));
    return [new ActionRowBuilder().addComponents(menu)];
  }
  const rows = [];
  for (let k = 0; k < types.length; k += 5) rows.push(new ActionRowBuilder().addComponents(types.slice(k, k + 5).map(x => {
    const b = new ButtonBuilder().setCustomId('tk_open:' + x.id).setLabel(x.label.slice(0, 80)).setStyle(ButtonStyle.Secondary), em = parseEmoji(x.emoji);
    if (em) b.setEmoji(em);
    return b;
  })));
  return rows;
}
async function sendPanel(chId, b) {
  const ch = gld().channels.cache.get(chId);
  if (!ch) throw new Error('اختار روم');
  await ch.send(V(b.title || 'الدعم الفني', b.desc || 'اختار نوع التذكرة من تحت.', { color: hex(b.color), rows: panelRows(), brand: 'both' }));
}
const esc = x => String(x ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const walk = c => [c.content, ...(c.components || []).flatMap(walk)].filter(Boolean);
async function transcript(ch) {
  let all = [], last;
  while (all.length < 3000) {
    const b = await ch.messages.fetch({ limit: 100, ...(last && { before: last }) });
    if (!b.size) break; all.push(...b.values()); last = b.last().id;
  }
  all.reverse();
  const rows = all.map(m => {
    const body = [m.cleanContent, ...m.embeds.map(e => [e.title, e.description].filter(Boolean).join(' — ')), ...m.components.flatMap(walk)].filter(Boolean).join('\n');
    const files = m.attachments.map(a => `<a href="${esc(a.url)}">${esc(a.name)}</a>`).join(' ');
    return `<div class="m"><img src="${esc(m.author.displayAvatarURL({ size: 64 }))}"><div><b>${esc(m.author.tag)}</b>${m.author.bot ? '<i>BOT</i>' : ''}<time>${m.createdAt.toISOString().replace('T', ' ').slice(0, 19)}</time><p>${esc(body)}</p>${files}</div></div>`;
  }).join('');
  const html = `<!DOCTYPE html><html dir="rtl" lang="ar"><meta charset="utf-8"><title>${esc(ch.name)}</title><style>body{background:#000;color:#eee;font-family:system-ui,sans-serif;max-width:860px;margin:30px auto;padding:0 16px}h1{font-size:20px}.m{display:flex;gap:12px;padding:12px 0;border-bottom:1px solid #1f1f1f}.m img{width:38px;height:38px;border-radius:50%}p{white-space:pre-wrap;margin:4px 0;word-break:break-word}time{color:#777;font-size:12px;margin-right:8px}i{background:#444;font-size:10px;padding:1px 5px;border-radius:4px;margin-right:6px;font-style:normal}a{color:#aaa}</style><h1>#${esc(ch.name)} — ${all.length} رسالة</h1>${rows}</html>`;
  return { buf: Buffer.from(html, 'utf8'), count: all.length, name: ch.name + '.html' };
}
async function saveTranscript(ch, by) {
  const t = db.tickets, tr = await transcript(ch);
  const opener = /^\d+$/.test(ch.topic || '') ? await client.users.fetch(ch.topic).catch(() => null) : null;
  const msg = () => V('ترانسكربت ' + ch.name, `**صاحب التذكرة:** ${opener ?? 'غير معروف'}\n**أغلقها:** ${by}\n**عدد الرسائل:** ${tr.count}`, { file: tr.name, files: [new AttachmentBuilder(tr.buf, { name: tr.name })] });
  await ch.guild.channels.cache.get(t.logChannel)?.send(msg()).catch(() => {});
  if (t.dm && opener) await opener.send(msg()).catch(() => {});
  return tr;
}

const EMO = {};
const em = (n, fb) => EMO[n] || fb;
async function setupEmojis() {
  if (!banner.available()) return;
  const have = await client.application.emojis.fetch();
  for (const n of banner.ICONS) {
    let e = have.find(x => x.name === n);
    if (!e) e = await client.application.emojis.create({ attachment: banner.icon(n), name: n }).catch(err => { console.log('emoji upload:', n, err.message); return null; });
    if (e) EMO[n] = { id: e.id, name: e.name, animated: false };
  }
  console.log('emojis ready:', Object.keys(EMO).length + '/' + banner.ICONS.length);
}

function findFfmpeg() {
  const c = [];
  try { c.push(require('ffmpeg-static')); } catch {}
  try { c.push(require('@ffmpeg-installer/ffmpeg').path); } catch {}
  c.push('ffmpeg');
  for (const p of c) {
    if (!p) continue;
    try { try { fs.chmodSync(p, 0o755); } catch {} if (spawnSync(p, ['-version']).status === 0) return p; } catch {}
  }
  return null;
}
const FF = findFfmpeg();
console.log(FF ? 'ffmpeg: ' + FF : '⚠ ffmpeg مش موجود — الأغاني مش هتشتغل (شغّل npm install تاني)');
console.log(generateDependencyReport());
// ───── أغاني الملفات: مجلد songs (داخل المشروع) + مجلد الرفع من الداشبورد (DATA_DIR/songs) ─────
const SONG_EXT = /\.(mp3|wav|ogg|m4a|flac|opus|aac)$/i;
const SONG_DIRS = [...new Set([path.join(__dirname, 'songs'), path.join(process.env.DATA_DIR || __dirname, 'songs')])];
function listSongs() {
  const out = [];
  for (const dir of SONG_DIRS) { try { for (const f of fs.readdirSync(dir)) if (SONG_EXT.test(f)) out.push({ name: f.replace(SONG_EXT, ''), file: path.join(dir, f) }); } catch {} }
  return out.sort((a, b) => a.name.localeCompare(b.name, 'ar'));
}
const normS = s => String(s).toLowerCase().replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim();
function findSong(q) {
  const n = normS(String(q).replace(/^local:/i, '')); if (!n) return null;
  const all = listSongs();
  return all.find(s => normS(s.name) === n) || all.find(s => n.split(' ').every(w => normS(s.name).includes(w))) || null;
}
let sc = new Soundcloud();
const M = { logs: [], conn: null, player: null, voice: null, text: null, queue: [], cur: null, res: null, proc: null, loop: 'off', idleT: null };
const killProc = () => { try { M.proc?.kill('SIGKILL'); } catch {} M.proc = null; };
const toTrack = r => ({
  title: r.title || 'بدون اسم', author: r.user?.username || '', dur: r.duration || 0,
  art: (r.artwork_url || r.user?.avatar_url || '').replace('-large', '-t500x500') || undefined, raw: r
});
async function sct(fn) { try { return await fn(); } catch (e) { if (/client ?id/i.test(String(e?.message))) { sc = new Soundcloud(); return fn(); } throw e; } }
async function resolve(q) {
  if (!/^https?:\/\//i.test(q)) { const s = findSong(q); if (s) return [{ title: s.name, author: 'ملف محلي', dur: 0, local: s.file }]; }
  if (/^https?:\/\/(www\.|m\.|on\.)?soundcloud\.com\//i.test(q)) {
    if (/\/sets\//.test(q)) {
      const pl = await sct(() => sc.playlists.get(q));
      const full = await sct(() => sc.tracks.getArray(pl.tracks.map(t => t.id).slice(0, 50), true));
      if (!full.length) throw new Error('القايمة فاضية');
      return full.map(toTrack);
    }
    return [toTrack(await sct(() => sc.tracks.get(q)))];
  }
  if (/^https?:\/\//i.test(q)) throw new Error('الروابط المدعومة: SoundCloud بس');
  const r = await sct(() => sc.tracks.search({ q }));
  let list = r.collection.filter(x => x.policy !== 'BLOCK');
  const BAD = /instrumental|karaoke|backing|minus|no vocals?|type beat|اينسترومنتال|كاريوكي|موسيقى فقط|بدون (غنا|كلمات|صوت)/i;
  if (!BAD.test(q)) { const clean = list.filter(x => !BAD.test((x.title || '') + ' ' + (x.genre || ''))); if (clean.length) list = clean; }
  const score = x => (x.policy === 'ALLOW' ? 1e12 : 0) + ((x.duration || 0) > 90000 ? 5e11 : 0) + (x.playback_count || 0);
  list.sort((a, b) => score(b) - score(a));
  const t = list[0];
  if (!t) throw new Error('مفيش نتايج');
  mlog('اخترت: ' + t.title + ' — ' + (t.permalink_url || ''));
  return [toTrack(t)];
}
const mlog = t => { M.logs.push(new Date().toLocaleTimeString('en-GB') + ' ' + t); M.logs = M.logs.slice(-40); console.log(t); };
function checkVoice(voice) {
  const g = gld(), ch = g.channels.cache.get(voice), me = g.members.me;
  if (!ch) throw new Error('الروم الصوتي مش موجود');
  const p = ch.permissionsFor(me);
  if (!p.has(P.Connect)) throw new Error('البوت معندوش صلاحية Connect في الروم ده');
  if (!p.has(P.Speak)) throw new Error('البوت معندوش صلاحية Speak في الروم ده — ده سبب إن مفيش صوت');
  if (ch.userLimit && ch.members.size >= ch.userLimit && !ch.members.has(me.id)) throw new Error('الروم ممتلي');
}
function diag() {
  const rep = generateDependencyReport(), pick = r => { const m = r.exec(rep); return m && !/not found/i.test(m[1]) ? m[1].trim() : null; };
  const g = gld(), me = g?.members.me, ch = M.voice && g?.channels.cache.get(M.voice), pm = ch && ch.permissionsFor(me);
  const items = [
    { name: 'ffmpeg', ok: !!FF, note: FF ? 'شغال' : 'مش موجود — شغّل npm install' },
    { name: 'مكتبة الأوبس (opus)', ok: !!(pick(/opusscript: (.+)/) || pick(/@discordjs\/opus: (.+)/)), note: pick(/opusscript: (.+)/) || pick(/@discordjs\/opus: (.+)/) || 'مش موجودة' },
    { name: 'تشفير DAVE', ok: !!pick(/davey: (.+)/), note: pick(/davey: (.+)/) || 'مش موجود — لازم @snazzah/davey' },
    { name: 'تشفير الصوت', ok: /native crypto support for aes-256-gcm: yes/.test(rep) || /(sodium|noble)[^\n]*: [\d]/.test(rep), note: '' },
    { name: 'الاتصال بالروم', ok: M.conn?.state.status === 'ready', note: M.conn ? M.conn.state.status : 'مش متصل' },
    { name: 'صلاحية Speak', ok: ch ? pm.has(P.Speak) : null, note: ch ? '' : 'اتفحص لما البوت يدخل روم' },
    { name: 'البوت متكتم (Mute)', ok: me?.voice?.channelId ? !(me.voice.serverMute || me.voice.suppress) : null, note: me?.voice?.channelId ? (me.voice.serverMute ? 'Server Mute' : me.voice.suppress ? 'Suppressed' : '') : '' },
    { name: 'المشغل', ok: M.player ? M.player.state.status !== 'autopaused' : null, note: M.player ? M.player.state.status : 'لسه' },
    { name: 'Node', ok: true, note: process.version }
  ];
  return { items, logs: M.logs.slice(-15) };
}
async function testTone(voice, text) {
  if (!FF) throw new Error('ffmpeg مش موجود');
  if (!voice) throw new Error('اختار روم صوتي');
  checkVoice(voice); await join(voice); M.text = text || M.text;
  M.queue = []; M.cur = null; killProc(); clearTimeout(M.idleT);
  const proc = spawn(FF, ['-f', 'lavfi', '-i', 'sine=frequency=523:duration=3', '-af', 'volume=0.6', '-loglevel', 'error', '-f', 's16le', '-ar', '48000', '-ac', '2', 'pipe:1'], { stdio: ['ignore', 'pipe', 'ignore'] });
  M.proc = proc; proc.stdout.on('error', () => {});
  const res = createAudioResource(proc.stdout, { inputType: StreamType.Raw, inlineVolume: true });
  res.volume.setVolume(db.music.volume / 100); M.res = res; ensurePlayer().play(res);
  mlog('اختبار الصوت: نغمة 3 ثواني');
}
function ensurePlayer() {
  if (M.player) return M.player;
  M.player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Pause } });
  M.player.on(AudioPlayerStatus.Idle, () => next().catch(console.error));
  M.player.on('stateChange', (o, n) => { if (o.status !== n.status) mlog('player: ' + o.status + ' → ' + n.status); });
  M.player.on('error', e => mlog('Audio error: ' + e.message));
  return M.player;
}
async function join(voice) {
  if (M.conn && M.voice === voice && M.conn.state.status !== VoiceConnectionStatus.Destroyed) return;
  M.conn?.destroy();
  const g = gld();
  const conn = joinVoiceChannel({ channelId: voice, guildId: g.id, adapterCreator: g.voiceAdapterCreator, selfDeaf: true });
  M.conn = conn; M.voice = voice;
  conn.on('error', e => mlog('voice error: ' + e.message));
  conn.on('debug', m => { if (!/heartbeat/i.test(m)) mlog('[voice] ' + m.slice(0, 160)); });
  conn.on('stateChange', (o, n) => { if (o.status !== n.status) mlog('voice: ' + o.status + ' → ' + n.status); });
  try { await entersState(conn, VoiceConnectionStatus.Ready, 20000); }
  catch { conn.destroy(); M.conn = null; M.voice = null; throw new Error('مقدرتش أدخل الروم الصوتي (اتأكد من صلاحيات Connect و Speak)'); }
  conn.subscribe(ensurePlayer());
  try { const g2 = gld(), me2 = g2.members.me, ch2 = g2.channels.cache.get(voice); if (ch2?.type === ChannelType.GuildStageVoice) { await me2.voice.setSuppressed(false).catch(async () => { await me2.voice.setRequestToSpeak(true).catch(() => {}); mlog('⚠ روم Stage: اعمل للبوت Invite to speak أو اديله Mute Members'); }); } } catch {}
  conn.on(VoiceConnectionStatus.Disconnected, async () => {
    try { await Promise.race([entersState(conn, VoiceConnectionStatus.Signalling, 5000), entersState(conn, VoiceConnectionStatus.Connecting, 5000)]); }
    catch { if (M.conn === conn) stopAll(); }
  });
}
function stopAll() {
  clearTimeout(M.idleT); killProc();
  M.queue = []; M.cur = null; M.res = null;
  const c = M.conn; M.conn = null; M.voice = null;
  M.player?.stop(true); try { c?.destroy(); } catch {}
  setTimeout(() => afkEnsure().catch(() => {}), 1500); // يرجع لروم الـ AFK بعد ما تخلص الموسيقى
}
const mmss = ms => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
const LOOP = { off: 'مقفول', track: 'الأغنية', queue: 'القايمة' };
function npMsg(t) {
  const paused = M.player?.state.status === AudioPlayerStatus.Paused, S = ButtonStyle.Secondary;
  const b = (id, emoji, st = S) => new ButtonBuilder().setCustomId(id).setEmoji(emoji).setStyle(st);
  const rows = [
    new ActionRowBuilder().addComponents(b('mu_pause', paused ? em('ico_play', '▶️') : em('ico_pause', '⏸️')), b('mu_skip', em('ico_skip', '⏭️')), b('mu_stop', em('ico_stop', '⏹️')), b('mu_loop', M.loop === 'track' ? em('ico_loop1', '🔂') : em('ico_loop', '🔁'), M.loop !== 'off' ? ButtonStyle.Primary : S)),
    new ActionRowBuilder().addComponents(b('mu_vdn', em('ico_vdn', '🔉')), new ButtonBuilder().setCustomId('mu_vl').setLabel(`${db.music.volume}%`).setStyle(S).setDisabled(true), b('mu_vup', em('ico_vup', '🔊')))
  ];
  return V(t.title, `${t.author}\n-# ⏱ ${mmss(t.dur)} • التكرار: ${LOOP[M.loop]}${t.by ? ' • طلبه ' + t.by : ''}`, { image: t.art, top: true, rows });
}
async function musicButton(i) {
  const a = i.customId.slice(3);
  if (!M.conn) return i.update(V(null, 'الموسيقى اتوقفت.'));
  if (!(isStaff(i.member) || (M.voice && i.member.voice.channelId === M.voice))) return i.reply(V(null, 'ادخل نفس الروم الصوتي الأول.', { eph: 1 }));
  if (a === 'skip') { await i.update(V(null, `⏭️ ${i.user} عدّى الأغنية`)); return ctl('skip'); }
  if (a === 'stop') { await i.update(V(null, `⏹️ ${i.user} وقّف الموسيقى`)); return ctl('stop'); }
  if (a === 'pause' || a === 'loop') await ctl(a);
  if (a === 'vup' || a === 'vdn') await ctl('volume', db.music.volume + (a === 'vup' ? 10 : -10));
  return i.update(npMsg(M.cur || { title: '—', author: '', dur: 0 }));
}

async function* hlsChunks(url, ctl) {
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
  const get = async u => { const r = await fetch(u, { headers: { 'User-Agent': UA }, signal: ctl.signal }); if (!r.ok) throw new Error('HLS HTTP ' + r.status); return r; };
  let txt = await (await get(url)).text(), base = url;
  if (/#EXT-X-STREAM-INF/.test(txt)) {
    const ln = txt.split(/\r?\n/); const i = ln.findIndex(l => l.startsWith('#EXT-X-STREAM-INF'));
    base = new URL(ln.slice(i + 1).find(l => l && !l.startsWith('#')), url).href;
    txt = await (await get(base)).text();
  }
  if (/#EXT-X-KEY:(?!METHOD=NONE)/.test(txt)) throw new Error('الأغنية مشفرة (HLS) ومش مدعومة');
  const map = /#EXT-X-MAP:.*URI="([^"]+)"/.exec(txt);
  if (map) yield Buffer.from(await (await get(new URL(map[1], base).href)).arrayBuffer());
  const segs = txt.split(/\r?\n/).filter(l => l && !l.startsWith('#')).map(l => new URL(l, base).href);
  if (!segs.length) throw new Error('قايمة HLS فاضية');
  for (const sg of segs) {
    if (ctl.signal.aborted) return;
    const r = await get(sg);
    for await (const c of r.body) { if (ctl.signal.aborted) return; yield Buffer.from(c); }
  }
}
async function startTrack(t, announce) {
  killProc();
  let reported = false;
  const report = why => {
    if (reported) return; reported = true; mlog('Play error: ' + why);
    client.channels.cache.get(M.text)?.send(V(null, `مقدرتش أشغل **${t.title}**\n${why}`)).catch(() => {});
  };
  try {
    if (!FF) throw new Error('ffmpeg مش موجود على السيرفر');
    let url, proto2 = 'local';
    if (!t.local) {
      for (const proto of ['progressive', 'hls']) { try { url = await sct(() => sc.util.streamLink(t.raw, proto)); if (url) { proto2 = proto; break; } } catch {} }
      if (!url) throw new Error('مفيش رابط تشغيل للأغنية دي');
      mlog('stream: ' + proto2 + ' ' + String(url).slice(0, 70));
    } else mlog('ملف محلي: ' + t.title);
    const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
    let err = '';
    const ctl = new AbortController();
    const feed = t.local ? null : (proto2 === 'progressive'
      ? require('stream').Readable.fromWeb((await (async () => { const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: ctl.signal }); if (!r.ok || !r.body) throw new Error('تحميل الأغنية فشل: HTTP ' + r.status); return r; })()).body)
      : require('stream').Readable.from(hlsChunks(url, ctl)));
    const args = ['-i', t.local || 'pipe:0', '-vn', '-loglevel', 'error', '-f', 's16le', '-ar', '48000', '-ac', '2', 'pipe:1'];
    const proc = spawn(FF, args, { stdio: [t.local ? 'ignore' : 'pipe', 'pipe', 'pipe'] });
    proc.on('close', () => { try { ctl.abort(); } catch {} });
    proc.stdin?.on('error', () => {});
    if (feed) { feed.on('error', e => { err = (err + ' ' + e.message).slice(-500); try { proc.stdin.end(); } catch {} }); feed.pipe(proc.stdin); }
    M.proc = proc;
    let got = false;
    const to = setTimeout(() => { if (!got && M.proc === proc) { report('انتهت مهلة تحميل الصوت'); killProc(); tap.end(); } }, 20000);
    let bytes = 0;
    const tap = new Transform({ transform(c, e, cb) { bytes += c.length; if (!got) { got = true; clearTimeout(to); } cb(null, c); } });
    setTimeout(() => { if (M.proc === proc) mlog(`audio: ${(bytes / 192000).toFixed(1)}s اتفك | المشغل: ${M.player?.state.status} | الاتصال: ${M.conn?.state.status} | الصوت: ${db.music.volume}%`); }, 6000);
    proc.stderr.on('data', d => { err = (err + d).slice(-500); });
    proc.stdout.on('error', () => {}); proc.stdout.pipe(tap);
    proc.on('error', e => { clearTimeout(to); if (M.proc === proc) { report('ffmpeg: ' + e.message); tap.end(); } });
    proc.on('close', code => { clearTimeout(to); if (!got && M.proc === proc) { report(err.trim().split('\n').slice(-3).join(' | ') || `ffmpeg خرج بكود ${code}`); tap.end(); } });
    const res = createAudioResource(tap, { inputType: StreamType.Raw, inlineVolume: true });
    res.volume.setVolume(db.music.volume / 100);
    M.res = res; ensurePlayer().play(res);
    if (announce) { M.np?.delete().catch(() => {}); client.channels.cache.get(M.text)?.send(npMsg(t)).then(m => { M.np = m; }).catch(() => {}); }
  } catch (e) {
    report(e.message);
    M.cur = null; await next(true);
  }
}
async function next(skip) {
  if (M.cur && M.loop === 'track' && !skip) return startTrack(M.cur, false);
  if (M.cur && M.loop === 'queue') M.queue.push(M.cur);
  M.cur = M.queue.shift() || null;
  if (!M.cur) { M.res = null; clearTimeout(M.idleT); if (M.conn) M.idleT = setTimeout(stopAll, 60000); return; }
  await startTrack(M.cur, true);
}
async function play({ voice, text, query, user }) {
  if (!voice) throw new Error('ادخل روم صوتي الأول');
  checkVoice(voice);
  const tracks = await resolve(query);
  await join(voice);
  M.text = text || M.text; tracks.forEach(t => { t.by = user; });
  M.queue.push(...tracks); clearTimeout(M.idleT);
  if (!M.cur) await next();
  const me = gld().members.me, warn = me.voice.serverMute || me.voice.suppress ? '\n⚠️ البوت متكتم في الروم ده' : '';
  return (tracks.length > 1 ? `${tracks.length} أغنية` : tracks[0].title) + warn;
}
async function ctl(a, v) {
  if (a === 'volume') { const n = Math.max(0, Math.min(150, +v || 0)); db.music.volume = n; save(); M.res?.volume?.setVolume(n / 100); return; }
  if (!M.conn) throw new Error('مفيش مشغل شغال');
  if (a === 'pause') { M.player.state.status === AudioPlayerStatus.Paused ? M.player.unpause() : M.player.pause(); }
  else if (a === 'skip') { if (M.queue.length || M.loop !== 'off') await next(true); else { M.cur = null; M.res = null; killProc(); M.player.stop(true); } }
  else if (a === 'stop') stopAll();
  else if (a === 'loop') M.loop = { off: 'track', track: 'queue', queue: 'off' }[M.loop];
}
function musicState() {
  const f = t => ({ title: t.title, author: t.author, dur: t.dur, art: t.art });
  return { node: !!FF, playing: !!M.cur, paused: M.player?.state.status === AudioPlayerStatus.Paused, volume: db.music.volume, loop: M.loop, pos: M.res?.playbackDuration || 0, cur: M.cur ? f(M.cur) : null, queue: M.queue.slice(0, 15).map(f) };
}

// ───── AFK: البوت يقعد دايم في روم صوتي محدد (من الداشبورد ← AFK) ─────
const AFK = { busy: false };
async function afkEnsure() {
  if (AFK.busy) return; AFK.busy = true;
  try {
    const g = gld(); if (!g) return;
    const cfg = db.afk, me = g.members.me, conn0 = getVoiceConnection(g.id);
    if (!cfg.enabled || !cfg.channel) { if (AFK.joined && conn0 && !M.conn && !M.cur) conn0.destroy(); AFK.joined = false; return; }
    if (M.conn || M.cur) return; // الموسيقى شغالة: ما نزاحمها
    const ch = g.channels.cache.get(cfg.channel);
    if (!ch || !ch.isVoiceBased()) return;
    if (me?.voice?.channelId === ch.id && conn0 && conn0.state.status === VoiceConnectionStatus.Ready) return;
    const p = ch.permissionsFor(me);
    if (!p.has(P.ViewChannel) || !p.has(P.Connect)) { console.log('afk: البوت معندوش صلاحية Connect في الروم'); return; }
    const conn = joinVoiceChannel({ channelId: ch.id, guildId: g.id, adapterCreator: g.voiceAdapterCreator, selfDeaf: true, selfMute: true });
    try { await entersState(conn, VoiceConnectionStatus.Ready, 20000); }
    catch { try { conn.destroy(); } catch {} console.log('afk: مقدرتش أدخل الروم'); return; }
    AFK.joined = true;
    if (!conn.__afk) {
      conn.__afk = true;
      conn.on(VoiceConnectionStatus.Disconnected, async () => {
        try { await Promise.race([entersState(conn, VoiceConnectionStatus.Signalling, 5000), entersState(conn, VoiceConnectionStatus.Connecting, 5000)]); }
        catch { try { conn.destroy(); } catch {} setTimeout(() => afkEnsure().catch(() => {}), 3000); }
      });
    }
    if (ch.type === ChannelType.GuildStageVoice) await g.members.me.voice.setSuppressed(false).catch(() => {});
  } catch (e) { console.log('afk:', e.message); }
  finally { AFK.busy = false; }
}
client.on('voiceStateUpdate', (a, b) => { if (b.id === client.user?.id) setTimeout(() => afkEnsure().catch(() => {}), 2000); });

async function openTicket(i, typeId) {
  const ty = (db.tickets.types || []).find(x => x.id === typeId);
  const old = i.guild.channels.cache.find(c => c.topic === i.user.id && c.name.startsWith('ticket-'));
  if (old) return i.reply(V(null, `عندك تذكرة مفتوحة: ${old}`, { eph: 1 }));
  const t = db.tickets; t.count++; save();
  const allow = [P.ViewChannel, P.SendMessages, P.ReadMessageHistory];
  const ow = [{ id: i.guild.id, deny: [P.ViewChannel] }, { id: i.user.id, allow }, { id: client.user.id, allow: [...allow, P.ManageChannels] }];
  if (t.role) ow.push({ id: t.role, allow });
  if (db.admin.role) ow.push({ id: db.admin.role, allow });
  const ch = await i.guild.channels.create({ name: 'ticket-' + String(t.count).padStart(4, '0'), type: ChannelType.GuildText, parent: t.category || null, topic: i.user.id, permissionOverwrites: ow });
  await ch.send(V(ty ? `${ty.emoji ? ty.emoji + ' ' : ''}${ty.label}` : 'تذكرة جديدة', `${i.user} ${t.role ? `<@&${t.role}>` : ''}\n\n${t.welcome}`, { row: closeRow(), brand: 'line', thumb: true }));
  i.reply(V(null, `تم فتح تذكرتك: ${ch}`, { eph: 1 }));
}

const spam = new Map(); let joins = [];
const feed = [];
const logCh = () => db.logs.channel || db.protection.logChannel;
const log = async (t, title = 'الإدارة والحماية') => {
  feed.unshift({ at: Date.now(), title, text: t }); feed.length = Math.min(feed.length, 60);
  gld()?.channels.cache.get(logCh())?.send(V(title, t, { color: 0x888888 })).catch(() => {});
};
client.on('messageCreate', async m => {
  if (!m.guild || m.author.bot || m.guild.id !== process.env.GUILD_ID) return;
  if (m.member?.permissions.has(P.ManageMessages) || isStaff(m.member)) return;
  const p = db.protection, txt = m.content || '';
  let why = '';
  if (p.invites && /discord(\.gg|app\.com\/invite|\.com\/invite)\//i.test(txt)) why = 'إرسال رابط دعوة';
  else if (p.links && /https?:\/\/|www\./i.test(txt)) why = 'إرسال رابط';
  else if (p.badwords && p.words.some(w => w && txt.toLowerCase().includes(w.toLowerCase()))) why = 'كلمة ممنوعة';
  if (why) {
    await m.delete().catch(() => {});
    m.channel.send(V(null, `${m.author} ممنوع: ${why}`)).then(x => setTimeout(() => x.delete().catch(() => {}), 4000));
    return log(`حذف رسالة من ${m.author} — ${why}`);
  }
  if (p.spam) {
    const now = Date.now(), a = (spam.get(m.author.id) || []).filter(t => now - t < 5000); a.push(now); spam.set(m.author.id, a);
    if (a.length >= p.spamLimit) {
      spam.delete(m.author.id);
      m.member?.timeout(60000, 'سبام').catch(() => {});
      m.channel.send(V(null, `${m.author} تم إسكاتك دقيقة بسبب السبام.`)).then(x => setTimeout(() => x.delete().catch(() => {}), 4000));
      log(`إسكات ${m.author} دقيقة — سبام`);
    }
  }
});
const fill = (t, m) => String(t || '').replace(/\{user\}/g, `${m}`).replace(/\{name\}/g, m.displayName).replace(/\{server\}/g, m.guild.name).replace(/\{count\}/g, m.guild.memberCount).replace(/\{boosts\}/g, m.guild.premiumSubscriptionCount || 0);
async function sendWelcome(m, ch) {
  const W = db.welcome;
  const img = W.banner ? await banner.welcomeBanner({ title: W.title, name: m.displayName, avatar: m.user.displayAvatarURL({ extension: 'png', size: 256 }), line: fill(W.line, m), design: W.design, frameBuf: dashApi.frameOf('welcome') }).catch(() => null) : null;
  await ch.send({ ...V(null, fill(W.text, m), { image: img ? 'attachment://welcome.png' : undefined, top: true, brand: 'line', files: img ? [new AttachmentBuilder(img, { name: 'welcome.png' })] : undefined }), allowedMentions: { users: [m.id] } });
}
client.on('guildMemberAdd', async m => {
  if (m.guild.id !== process.env.GUILD_ID) return;
  const W = db.welcome;
  if (W.role) m.roles.add(W.role).catch(() => {});
  if (W.enabled) { const ch = m.guild.channels.cache.get(W.channel); if (ch) sendWelcome(m, ch).catch(e => console.log('welcome:', e.message)); }
});

const imgOf = m => { const a = [...(m.attachments?.values?.() || [])].find(x => /^image\//.test(x.contentType || '') || /\.(png|jpe?g|webp|gif)(\?|$)/i.test(x.url)); return a?.url || null; };
// ينشر كرت التقييم: صورة العضو + اسمه + النجوم + كلام التقييم + صورة مرفقة (اختياري)
async function publishReview({ guild, user, member, stars, text, imageUrl, fallback, extra }) {
  const F = db.feedback, out = guild.channels.cache.get(F.outChannel) || fallback;
  if (!out) throw new Error('حدد روم نشر التقييم من الداشبورد');
  stars = Math.max(1, Math.min(5, Number(stars) || 5)); text = String(text || '').trim().slice(0, 900);
  const img = await banner.reviewCard({ name: member?.displayName || user.username, avatar: user.displayAvatarURL({ extension: 'png', size: 256 }), stars, text, image: imageUrl }).catch(e => { console.log('review card:', e.message); return null; });
  const head = `${'⭐'.repeat(stars)}${F.thanks ? ' — ' + F.thanks : ''}${extra ? '\n' + extra : ''}`;
  return out.send({ ...V(null, img ? head : `${head}\n${text}`, { image: img ? 'attachment://feedback.png' : undefined, top: true, brand: 'line', files: img ? [new AttachmentBuilder(img, { name: 'feedback.png' })] : undefined, footer: `من ${user.tag}` }), allowedMentions: { parse: [] } });
}
client.novaReview = publishReview; // يستخدمه المتجر (تقييم بعد التسليم)
client.on('messageCreate', async m => {
  const F = db.feedback;
  if (!F.enabled || !m.guild || m.author.bot || m.guild.id !== process.env.GUILD_ID || m.channelId !== F.channel || (!m.content.trim() && !imgOf(m))) return;
  const row = new ActionRowBuilder().addComponents([1, 2, 3, 4, 5].map(n => new ButtonBuilder().setCustomId('fb:' + n).setEmoji(em('ico_star', '⭐')).setLabel(String(n)).setStyle(ButtonStyle.Secondary)));
  const p = await m.reply({ ...V('قيّم تجربتك', `${m.author} اختار عدد النجوم من تحت ⭐\n-# رأيك وصورتك (لو أرفقت) بينزلون في كرت التقييم`, { rows: [row] }), allowedMentions: { users: [m.author.id] } }).catch(() => null);
  if (p) setTimeout(() => p.delete().catch(() => {}), 180000);
});
async function feedbackStars(i) {
  const n = +i.customId.split(':')[1];
  const ref = i.message.reference?.messageId && await i.channel.messages.fetch(i.message.reference.messageId).catch(() => null);
  if (!ref) return i.reply(V(null, 'رسالتك الأصلية اتمسحت، ابعتها تاني.', { eph: 1 }));
  if (ref.author.id !== i.user.id) return i.reply(V(null, 'التقييم ده مش بتاعك.', { eph: 1 }));
  await i.deferUpdate();
  await publishReview({ guild: i.guild, user: i.user, member: i.member, stars: n, text: ref.content, imageUrl: imgOf(ref), fallback: i.channel });
  await ref.delete().catch(() => {}); await i.message.delete().catch(() => {});
}

const sugCool = new Map();
const SG = { pending: ['اقتراح', 0xffffff], accepted: ['تم قبول الاقتراح', 0x3ba55d], rejected: ['تم رفض الاقتراح', 0xed4245] };
const canReview = m => isStaff(m) || !!m?.permissions.has(P.ManageMessages);
function sugMsg(s) {
  const [st, color] = SG[s.status], closed = s.status !== 'pending';
  const vote = (id, emoji, n) => new ButtonBuilder().setCustomId(id).setEmoji(emoji).setLabel(String(n)).setStyle(ButtonStyle.Secondary).setDisabled(closed);
  const rows = [new ActionRowBuilder().addComponents(vote('sg_up', '👍', s.up.length), vote('sg_dn', '👎', s.down.length))];
  if (!closed) rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('sg_ok').setLabel('قبول').setEmoji('✅').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('sg_no').setLabel('رفض').setEmoji('❌').setStyle(ButtonStyle.Secondary)));
  const e = new EmbedBuilder().setColor(color).setTitle(`${st} #${s.n}`).setDescription(s.text)
    .setAuthor({ name: s.name || 'عضو', iconURL: s.avatar || undefined }).setTimestamp(s.at || Date.now()).setFooter({ text: 'NOVA STORE' });
  if (closed) e.addFields({ name: s.status === 'accepted' ? '✅ مقبول' : '❌ مرفوض', value: `بواسطة <@${s.by}>${s.reason ? '\n' + s.reason : ''}` });
  return { embeds: [e], components: rows, allowedMentions: { parse: [] } };
}
async function sendSuggestPanel(chId) {
  const ch = gld().channels.cache.get(chId); if (!ch) throw new Error('اختار روم');
  const e = new EmbedBuilder().setColor(0x9b6bff).setTitle(db.suggest.panelTitle || '💡 اكتب اقتراحك').setDescription(db.suggest.panelText || 'اضغط الزر واكتب اقتراحك.').setFooter({ text: 'NOVA STORE' });
  await ch.send({ embeds: [e], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('sg_new').setLabel('اكتب اقتراحك').setEmoji('💡').setStyle(ButtonStyle.Primary))] });
}
async function postSuggestion(user, text, srcCh) {
  const SU = db.suggest, out = gld().channels.cache.get(SU.outChannel) || srcCh;
  text = String(text || '').trim().slice(0, 1800);
  if (!text) throw new Error('اكتب اقتراحك');
  const left = (sugCool.get(user.id) || 0) + 30000 - Date.now();
  if (left > 0) throw new Error(`استنى ${Math.ceil(left / 1000)} ثانية قبل اقتراح جديد`);
  const s = { n: SU.count + 1, user: user.id, name: user.displayName || user.globalName || user.username, avatar: user.displayAvatarURL({ extension: 'png', size: 128 }), text, up: [], down: [], status: 'pending', at: Date.now() };
  const m = await out.send(sugMsg(s));
  sugCool.set(user.id, Date.now()); SU.count++; s.ch = out.id; db.sugs[m.id] = s;
  const ids = Object.keys(db.sugs); if (ids.length > 500) ids.slice(0, ids.length - 500).forEach(k => delete db.sugs[k]);
  save(); return m;
}
client.on('messageCreate', async m => {
  const SU = db.suggest;
  if (!SU.enabled || !m.guild || m.author.bot || m.guild.id !== process.env.GUILD_ID || m.channelId !== SU.channel || !m.content.trim()) return;
  try { await postSuggestion(m.author, m.content, m.channel); m.delete().catch(() => {}); }
  catch (e) { m.reply(V(null, e.message)).then(x => setTimeout(() => { x.delete().catch(() => {}); m.delete().catch(() => {}); }, 5000)).catch(() => {}); }
});
async function suggestButton(i) {
  const a = i.customId.slice(3);
  if (a === 'new') {
    if (!db.suggest.enabled) return i.reply(V(null, 'نظام الاقتراحات مقفول.', { eph: 1 }));
    return i.showModal(new ModalBuilder().setCustomId('sg_nm').setTitle('اقتراح جديد').addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('text').setLabel('اكتب اقتراحك').setStyle(TextInputStyle.Paragraph).setRequired(true).setMinLength(5).setMaxLength(1500))));
  }
  const s = db.sugs[i.message.id];
  if (!s) return i.reply(V(null, 'الاقتراح ده مش موجود في البيانات.', { eph: 1 }));
  if (a === 'up' || a === 'dn') {
    if (s.status !== 'pending') return i.reply(V(null, 'الاقتراح اتقفل.', { eph: 1 }));
    if (s.user === i.user.id) return i.reply(V(null, 'مينفعش تصوّت على اقتراحك.', { eph: 1 }));
    const mine = a === 'up' ? s.up : s.down, other = a === 'up' ? s.down : s.up;
    const k = other.indexOf(i.user.id); if (k >= 0) other.splice(k, 1);
    const j = mine.indexOf(i.user.id); j >= 0 ? mine.splice(j, 1) : mine.push(i.user.id);
    save(); return i.update(sugMsg(s));
  }
  if (!canReview(i.member)) return i.reply(V(null, 'القبول والرفض للإدارة بس.', { eph: 1 }));
  return i.showModal(new ModalBuilder().setCustomId(`sg_m:${a}:${i.message.id}`).setTitle(a === 'ok' ? 'قبول الاقتراح' : 'رفض الاقتراح')
    .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reason').setLabel('السبب أو ملاحظة (اختياري)').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(500))));
}
async function suggestNew(i) {
  try { const m = await postSuggestion(i.user, i.fields.getTextInputValue('text'), i.channel); return i.reply(V(null, 'تم نشر اقتراحك: ' + m.url, { eph: 1 })); }
  catch (e) { return i.reply(V(null, e.message, { eph: 1 })); }
}
async function suggestDecide(i) {
  const [, a, id] = i.customId.split(':'), s = db.sugs[id];
  if (!s) return i.reply(V(null, 'الاقتراح مش موجود.', { eph: 1 }));
  if (!canReview(i.member)) return i.reply(V(null, 'القبول والرفض للإدارة بس.', { eph: 1 }));
  if (s.status !== 'pending') return i.reply(V(null, 'الاقتراح اتحسم قبل كده.', { eph: 1 }));
  s.status = a === 'ok' ? 'accepted' : 'rejected'; s.by = i.user.id; s.reason = i.fields.getTextInputValue('reason').trim(); save();
  const ch = i.guild.channels.cache.get(s.ch), msg = ch && await ch.messages.fetch(id).catch(() => null);
  if (msg) await msg.edit(sugMsg(s)).catch(e => console.log('suggest edit:', e.message));
  if (db.suggest.dm) client.users.fetch(s.user).then(u => u.send(V(s.status === 'accepted' ? 'اقتراحك اتقبل ✅' : 'اقتراحك اترفض ❌', `اقتراح #${s.n} في ${i.guild.name}\n${s.text}${s.reason ? '\n\n**ملاحظة الإدارة:** ' + s.reason : ''}`))).catch(() => {});
  log(`${i.user} ${s.status === 'accepted' ? 'قبل' : 'رفض'} اقتراح #${s.n}`, 'الاقتراحات');
  return i.reply(V(null, 'تم.', { eph: 1 }));
}

// ───────────── الإعلانات: صورة مصممة + إمبيد + منشن (رتبة / everyone / here) + زر رابط ─────────────
async function sendAnnounce(g, b) {
  const ch = g.channels.cache.get(b.channel); if (!ch || !ch.isTextBased() || ch.isVoiceBased()) throw new Error('اختار روم نصي');
  const title = String(b.title || '').trim().slice(0, 100), text = String(b.text || '').trim().slice(0, 3500);
  if (!title && !text) throw new Error('اكتب عنوان أو نص الإعلان');
  const custom = /^https?:\/\/\S+$/.test(String(b.imageUrl || '')) ? b.imageUrl : '';
  const img = !custom && b.banner !== false && title ? await banner.panelCard({ title, sub: String(b.sub || '').slice(0, 140), chips: ['إعلان', 'NOVA STORE'] }).catch(() => null) : null;
  const e = new EmbedBuilder().setColor(/^#?[0-9a-f]{6}$/i.test(b.color || '') ? parseInt(String(b.color).replace('#', ''), 16) : 0x9b6bff).setFooter({ text: 'NOVA STORE' }).setTimestamp();
  if (text) e.setDescription(text); if (!img && title) e.setTitle(title);
  if (img) e.setImage('attachment://announce.png'); else if (custom) e.setImage(custom);
  const mention = String(b.mention || ''), role = /^\d{15,25}$/.test(mention) && g.roles.cache.has(mention) ? mention : '';
  const content = mention === 'everyone' ? '@everyone' : mention === 'here' ? '@here' : role ? `<@&${role}>` : undefined;
  const comps = b.btnLabel && /^https?:\/\/\S+$/.test(String(b.btnUrl || '')) ? [new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel(String(b.btnLabel).slice(0, 80)).setStyle(ButtonStyle.Link).setURL(b.btnUrl))] : [];
  return ch.send({ content, embeds: [e], files: img ? [new AttachmentBuilder(img, { name: 'announce.png' })] : [], components: comps, allowedMentions: { parse: mention === 'everyone' || mention === 'here' ? ['everyone'] : [], roles: role ? [role] : [] } });
}
async function sendBoost(m, chOverride) {
  const B = db.boost, ch = chOverride || m.guild.channels.cache.get(B.channel); if (!ch) throw new Error('حدد روم البوست من الداشبورد');
  const img = B.banner ? await banner.boostBanner({ title: fill(B.title, m), name: m.displayName, avatar: m.user.displayAvatarURL({ extension: 'png', size: 256 }), line: fill(B.line, m), design: B.design, frameBuf: dashApi.frameOf('boost') }).catch(() => null) : null;
  await ch.send({ ...V(null, fill(B.text, m), { image: img ? 'attachment://boost.png' : undefined, top: true, brand: 'line', color: 0xff8fd8, files: img ? [new AttachmentBuilder(img, { name: 'boost.png' })] : undefined }), allowedMentions: { users: [m.id] } });
}
client.on('guildMemberUpdate', (a, b) => {
  if (b.guild.id !== process.env.GUILD_ID || !db.boost.enabled) return;
  if (!a.premiumSinceTimestamp && b.premiumSinceTimestamp) sendBoost(b).catch(e => console.log('boost:', e.message));
});

const D = t => (t ? (t.length > 900 ? t.slice(0, 900) + '…' : t) : '*(فاضي)*');
const ok = (k, g) => g?.id === process.env.GUILD_ID && db.logs.events[k];
client.on('messageDelete', m => { if (!ok('msgDelete', m.guild) || m.author?.bot || m.channelId === logCh()) return; log(`**الكاتب:** ${m.author ?? 'غير معروف'}\n**الروم:** ${m.channel}\n**الرسالة:** ${D(m.content)}`, 'رسالة اتمسحت'); });
client.on('messageUpdate', (a, b) => { if (!ok('msgEdit', b.guild) || b.author?.bot || a.content == null || a.content === b.content) return; log(`**الكاتب:** ${b.author}\n**الروم:** ${b.channel}\n**قبل:** ${D(a.content)}\n**بعد:** ${D(b.content)}`, 'رسالة اتعدلت'); });
client.on('guildMemberAdd', m => ok('join', m.guild) && log(`${m} (${m.user.tag})\n**الحساب اتعمل:** <t:${Math.floor(m.user.createdTimestamp / 1000)}:R>`, 'عضو دخل'));
client.on('guildMemberRemove', m => ok('leave', m.guild) && log(`${m.user?.tag ?? m.id}`, 'عضو خرج'));
client.on('guildBanAdd', b => ok('ban', b.guild) && log(`${b.user.tag}\n**السبب:** ${b.reason || 'بدون'}`, 'حظر'));
client.on('guildBanRemove', b => ok('ban', b.guild) && log(`${b.user.tag}`, 'فك حظر'));
client.on('roleCreate', r => ok('roles', r.guild) && log(`${r}`, 'رتبة جديدة'));
client.on('roleDelete', r => ok('roles', r.guild) && log(`**${r.name}**`, 'رتبة اتمسحت'));
client.on('channelCreate', c => ok('channels', c.guild) && log(`${c} (${c.name})`, 'روم جديد'));
client.on('channelDelete', c => ok('channels', c.guild) && log(`**${c.name}**`, 'روم اتمسح'));
client.on('guildMemberUpdate', (a, b) => {
  if (!ok('member', b.guild)) return;
  const add = b.roles.cache.filter(r => !a.roles.cache.has(r.id)), rem = a.roles.cache.filter(r => !b.roles.cache.has(r.id));
  if (add.size || rem.size) log(`${b}\n${add.size ? '**اتضاف:** ' + add.map(r => `${r}`).join(' ') + '\n' : ''}${rem.size ? '**اتشال:** ' + rem.map(r => `${r}`).join(' ') : ''}`, 'تغيير رتب');
  if (a.nickname !== b.nickname) log(`${b}\n**قبل:** ${a.nickname || '-'}\n**بعد:** ${b.nickname || '-'}`, 'تغيير اسم');
});
client.on('voiceStateUpdate', (a, b) => {
  if (!ok('voice', b.guild) || a.channelId === b.channelId || b.member?.user.bot) return;
  log(`${b.member} ${!a.channelId ? `دخل ${b.channel}` : !b.channelId ? `خرج من ${a.channel}` : `انتقل من ${a.channel} إلى ${b.channel}`}`, 'الصوت');
});

client.on('guildMemberAdd', async mem => {
  if (!db.protection.raid || mem.guild.id !== process.env.GUILD_ID) return;
  const now = Date.now(); joins = joins.filter(t => now - t < 10000); joins.push(now);
  if (joins.length >= db.protection.raidLimit) { mem.kick('حماية من الريد').catch(() => {}); log(`حماية الريد: تم طرد ${mem.user.tag}`); }
});

const mk = (n, d, perm, f) => { const c = new SlashCommandBuilder().setName(n).setDescription(d); if (perm) permOf[n] = perm; f && f(c); return c; };
const U = (c, req = true) => c.addUserOption(o => o.setName('user').setDescription('العضو').setRequired(req));
const S = (c, n, d, req = true) => c.addStringOption(o => o.setName(n).setDescription(d).setRequired(req));
const N = (c, n, d, min, max) => c.addIntegerOption(o => o.setName(n).setDescription(d).setRequired(true).setMinValue(min).setMaxValue(max));
const cmds = [
  mk('ping', 'سرعة البوت'),
  mk('suggest', 'إرسال اقتراح', 0, c => S(c, 'text', 'اقتراحك')),
  mk('announce', 'إرسال إعلان بصورة مصممة', P.ManageGuild, c => S(c, 'title', 'عنوان الإعلان').addStringOption(o => o.setName('text').setDescription('نص الإعلان').setRequired(true)).addChannelOption(o => o.setName('channel').setDescription('الروم (الحالي لو تركته)').setRequired(false)).addRoleOption(o => o.setName('role').setDescription('رتبة للمنشن').setRequired(false)).addAttachmentOption(o => o.setName('image').setDescription('صورة بدل المصممة').setRequired(false))),
  mk('rate', 'تقييم السيرفر بصورة واسم وعدد نجوم', 0, c => N(c, 'stars', 'عدد النجوم من 1 إلى 5', 1, 5).addStringOption(o => o.setName('text').setDescription('كلام تقييمك').setRequired(true)).addAttachmentOption(o => o.setName('image').setDescription('صورة (اختياري)').setRequired(false))),
  mk('avatar', 'صورة عضو', 0, c => U(c, false)),
  mk('userinfo', 'معلومات عضو', 0, c => U(c, false)),
  mk('serverinfo', 'معلومات السيرفر'),
  mk('ban', 'حظر عضو', P.BanMembers, c => { U(c); S(c, 'reason', 'السبب', false); }),
  mk('kick', 'طرد عضو', P.KickMembers, c => { U(c); S(c, 'reason', 'السبب', false); }),
  mk('timeout', 'إسكات عضو', P.ModerateMembers, c => { U(c); N(c, 'minutes', 'الدقائق', 1, 40320); }),
  mk('warn', 'تحذير عضو', P.ModerateMembers, c => { U(c); S(c, 'reason', 'السبب', false); }),
  mk('clear', 'مسح رسائل', P.ManageMessages, c => N(c, 'amount', 'العدد', 1, 100)),
  mk('lock', 'قفل الروم', P.ManageChannels),
  mk('unlock', 'فتح الروم', P.ManageChannels),
  mk('slowmode', 'سلو مود', P.ManageChannels, c => N(c, 'seconds', 'الثواني (0 للإلغاء)', 0, 21600)),
  mk('say', 'البوت يكتب رسالة', P.ManageMessages, c => S(c, 'text', 'النص')),
  mk('broadcast', 'برودكاست للخاص', P.Administrator, c => S(c, 'text', 'الرسالة')),
  mk('transcript', 'ترانسكربت للروم الحالي', P.ManageChannels),
  mk('play', 'تشغيل أغنية من SoundCloud', 0, c => S(c, 'query', 'الاسم أو الرابط')),
  mk('testsound', 'اختبار الصوت (نغمة 3 ثواني)'),
  mk('songs', 'قائمة الأغاني اللي في ملفات البوت'),
  mk('skip', 'تخطي الأغنية'), mk('stop', 'إيقاف الموسيقى'), mk('pause', 'إيقاف مؤقت / استكمال'),
  mk('queue', 'قائمة التشغيل'), mk('nowplaying', 'الأغنية الحالية'),
  mk('volume', 'مستوى الصوت', 0, c => N(c, 'level', 'من 0 إلى 150', 0, 150)),
  mk('loop', 'تكرار (إيقاف ← أغنية ← قائمة)')
].map(c => c.toJSON());
cmds.push(...voidLoader.slashJSON(client));

client.on('interactionCreate', async i => {
  try {
    if (i.isButton()) {
      if (i.customId.startsWith('mu_')) return musicButton(i);
      if (i.customId.startsWith('fb:')) return feedbackStars(i);
      if (i.customId.startsWith('sg_')) return suggestButton(i);
      if (i.customId.startsWith('tk_open')) return openTicket(i, i.customId.split(':')[1]);
      if (i.customId === 'tk_close') {
        const ok = i.channel.topic === i.user.id || isStaff(i.member) || i.member.permissions.has(P.ManageChannels) || (db.tickets.role && i.member.roles.cache.has(db.tickets.role));
        if (!ok) return i.reply(V(null, 'مش مسموحلك تقفل التذكرة.', { eph: 1 }));
        await i.reply(V(null, 'بيتم حفظ الترانسكربت وقفل التذكرة...')); await saveTranscript(i.channel, i.user); return setTimeout(() => i.channel.delete().catch(() => {}), 3000);
      }
      return;
    }
    if (i.isStringSelectMenu() && i.customId === 'tk_menu') return openTicket(i, i.values[0]);
    if (i.isModalSubmit() && i.customId === 'sg_nm') return suggestNew(i);
    if (i.isModalSubmit() && i.customId.startsWith('sg_m:')) return suggestDecide(i);
    if (!i.isChatInputCommand()) return;
    const n = i.commandName, u = i.options.getUser('user'), mem = u && i.options.getMember('user'), why = i.options.getString('reason') || 'بدون سبب';
    const say = t => i.reply(V(null, t, { eph: 1 }));
    if (permOf[n] && !isStaff(i.member) && !i.memberPermissions.has(permOf[n])) return say('مش معاك صلاحية لاستخدام الأمر ده.');
    if (n === 'transcript') { await i.deferReply({ flags: E }); const tr = await transcript(i.channel); return i.editReply({ content: `تم — ${tr.count} رسالة`, files: [new AttachmentBuilder(tr.buf, { name: tr.name })] }); }
    if (n === 'songs') { const l = listSongs(); return i.reply(V('🎵 أغاني الملفات', l.length ? l.slice(0, 60).map((x, k) => `${k + 1}. ${x.name}`).join('\n') + '\n\nشغّل بـ /play واكتب الاسم' : 'ما فيه أغاني. حط ملفات mp3 في مجلد songs أو ارفعها من الداشبورد.', { brand: 'line' })); }
    if (n === 'testsound') { await testTone(i.member.voice.channelId, i.channelId); return say('شغّلت نغمة 3 ثواني. سمعتها؟ لو لأ شوف التشخيص في الداشبورد.'); }
    if (n === 'play') { await i.deferReply(); const t = await play({ voice: i.member.voice.channelId, text: i.channelId, query: i.options.getString('query'), user: i.user.tag }); return i.editReply({ content: `تمت الإضافة: **${t}**` }); }
    if (['skip', 'stop', 'pause', 'volume', 'loop'].includes(n)) { await ctl(n, i.options.getInteger('level')); return say('تم'); }
    if (n === 'queue' || n === 'nowplaying') { const m = musicState(); if (!m.cur) return say('مفيش حاجة شغالة.'); return i.reply(V(n === 'queue' ? 'قائمة التشغيل' : 'الأغنية الحالية', `**الآن:** ${m.cur.title}\n` + (n === 'queue' ? m.queue.map((t, k) => `${k + 1}. ${t.title}`).join('\n') : m.cur.author), { image: m.cur.art })); }
    if (n === 'suggest') { if (!db.suggest.enabled) return say('نظام الاقتراحات مقفول.'); const m = await postSuggestion(i.user, i.options.getString('text'), i.channel); return say('تم نشر اقتراحك: ' + m.url); }
    if (n === 'announce') {
      const att = i.options.getAttachment('image'), role = i.options.getRole('role'), chn = i.options.getChannel('channel') || i.channel;
      await i.deferReply({ flags: E });
      const m = await sendAnnounce(i.guild, { channel: chn.id, title: i.options.getString('title'), text: i.options.getString('text'), mention: role?.id, imageUrl: att && /^image\//.test(att.contentType || '') ? att.url : '' });
      return i.editReply(V(null, 'تم نشر الإعلان: ' + m.url, { eph: 1 }));
    }
    if (n === 'rate') {
      if (!db.feedback.enabled) return say('نظام التقييم مقفول.');
      const att = i.options.getAttachment('image'); await i.deferReply({ flags: E });
      const m = await publishReview({ guild: i.guild, user: i.user, member: i.member, stars: i.options.getInteger('stars'), text: i.options.getString('text'), imageUrl: att && /^image\//.test(att.contentType || '') ? att.url : null, fallback: i.channel });
      return i.editReply(V(null, 'تم نشر تقييمك: ' + m.url, { eph: 1 }));
    }
    if (n === 'ping') return say(`${client.ws.ping}ms`);
    if (n === 'avatar') { const t = u || i.user; return i.reply(V('صورة ' + t.username, null, { image: t.displayAvatarURL({ size: 512 }) })); }
    if (n === 'userinfo') { const t = u || i.user; return i.reply(V(t.tag, `**الايدي:** ${t.id}\n**تاريخ الحساب:** <t:${Math.floor(t.createdTimestamp / 1000)}:R>`, { image: t.displayAvatarURL({ size: 256 }) })); }
    if (n === 'serverinfo') { const g = i.guild; return i.reply(V(g.name, `**الأعضاء:** ${g.memberCount}\n**الرومات:** ${g.channels.cache.size}\n**الرتب:** ${g.roles.cache.size}`, { image: g.iconURL({ size: 256 }) })); }
    if (['ban', 'kick', 'timeout', 'warn'].includes(n)) {
      if (!mem && n !== 'ban') return say('العضو مش موجود.');
      if (mem && !mem.manageable && n !== 'warn') return say('مقدرش أتعامل مع العضو ده.');
      if (n === 'ban') await i.guild.members.ban(u, { reason: why });
      if (n === 'kick') await mem.kick(why);
      if (n === 'timeout') await mem.timeout(i.options.getInteger('minutes') * 60000, 'timeout');
      if (n === 'warn') { (db.warns[u.id] ||= []).push({ why, by: i.user.id, at: Date.now() }); save(); u.send(V('تحذير', `تم تحذيرك في ${i.guild.name}\n${why}`)).catch(() => {}); }
      log(`${n} على ${u} بواسطة ${i.user} — ${why}`);
      return say(`تم تنفيذ ${n} على ${u.tag}`);
    }
    if (n === 'clear') { const d = await i.channel.bulkDelete(i.options.getInteger('amount'), true); return say(`تم مسح ${d.size} رسالة`); }
    if (n === 'lock' || n === 'unlock') { await i.channel.permissionOverwrites.edit(i.guild.id, { SendMessages: n === 'unlock' ? null : false }); return say(n === 'lock' ? 'تم قفل الروم' : 'تم فتح الروم'); }
    if (n === 'slowmode') { await i.channel.setRateLimitPerUser(i.options.getInteger('seconds')); return say('تم'); }
    if (n === 'say') { await i.channel.send(i.options.getString('text')); return say('تم'); }
    if (n === 'ticketpanel') { await sendPanel(i.channel.id, {}); return say('تم إرسال البانل'); }
    if (n === 'broadcast') { await broadcast({ mode: 'embed', desc: i.options.getString('text') }); return say('بدأ البرودكاست، تابعه من الداشبورد.'); }
  } catch (e) {
    console.error(e);
    const o = V(null, 'حصل خطأ: ' + e.message, { eph: 1 });
    (i.replied || i.deferred) ? i.followUp(o).catch(() => {}) : i.reply(o).catch(() => {});
  }
});

const app = express();
require('./void/auth').mount(app); // كلمة سر الداشبورد (DASH_PASSWORD)
app.use(express.json({ limit: '6mb' })); app.use(express.static(path.join(__dirname, 'public')));
const h = f => async (q, r) => { try { r.json((await f(q.body, q)) || { ok: 1 }); } catch (e) { r.status(400).json({ error: e.message }); } };
const lst = (g, t) => g.channels.cache.filter(c => c.type === t).map(c => ({ id: c.id, name: c.name }));
app.get('/api/state', h(async () => {
  const g = gld(); if (!g) throw new Error('البوت مش موجود في السيرفر — اتأكد من GUILD_ID');
  return {
    guild: { name: g.name, icon: g.iconURL(), members: g.memberCount, channels: g.channels.cache.size, roles: g.roles.cache.size, ping: client.ws.ping },
    text: lst(g, ChannelType.GuildText), voice: lst(g, ChannelType.GuildVoice), emojis: g.emojis.cache.map(e => ({ id: e.id, name: e.name, animated: e.animated })), cats: lst(g, ChannelType.GuildCategory),
    roles: g.roles.cache.filter(r => r.id !== g.id && !r.managed).map(r => ({ id: r.id, name: r.name })),
    db: { protection: db.protection, tickets: db.tickets, admin: db.admin, logs: db.logs, welcome: db.welcome, feedback: db.feedback, boost: db.boost, suggest: db.suggest, afk: db.afk }, bc
  };
}));
app.get('/api/preview/:kind', async (q, r) => {
  try {
    const m = gld().members.me, name = m?.displayName || client.user.username, avatar = client.user.displayAvatarURL({ extension: 'png', size: 256 }), k = q.params.kind;
    const buf = k === 'welcome' ? await banner.welcomeBanner({ title: db.welcome.title, name, avatar, line: fill(db.welcome.line, m), design: db.welcome.design, frameBuf: dashApi.frameOf('welcome') })
      : k === 'boost' ? await banner.boostBanner({ title: fill(db.boost.title, m), name, avatar, line: fill(db.boost.line, m), design: db.boost.design, frameBuf: dashApi.frameOf('boost') })
      : await banner.reviewCard({ name, avatar, stars: 4, text: 'خدمة ممتازة وسرعة في التسليم، أنصح فيهم بقوة! 💜\nشكراً NOVA STORE على التعامل الراقي.' });
    if (!buf) return r.status(404).end();
    r.type('png').send(buf);
  } catch { r.status(500).end(); }
});
app.post('/api/boost/test', h(async () => { const ch = gld().channels.cache.get(db.boost.channel); if (!ch) throw new Error('اختار روم البوست واحفظ الأول'); await sendBoost(gld().members.me, ch); }));
app.post('/api/announce', h(async b => { await sendAnnounce(gld(), b); }));
app.get('/api/announce/preview', async (q, r) => { try { const buf = await banner.panelCard({ title: String(q.query.title || 'عنوان الإعلان').slice(0, 100), sub: String(q.query.sub || '').slice(0, 140), chips: ['إعلان', 'NOVA STORE'] }); buf ? r.type('png').send(buf) : r.status(404).end(); } catch { r.status(500).end(); } });
app.post('/api/suggest/panel', h(async b => { await sendSuggestPanel(b.channel); }));
app.post('/api/welcome/test', h(async () => { const ch = gld().channels.cache.get(db.welcome.channel); if (!ch) throw new Error('اختار روم الترحيب واحفظ الأول'); await sendWelcome(gld().members.me, ch); }));
app.get('/api/music/diag', h(async () => diag()));
app.post('/api/music/test', h(async b => { await testTone(b.voice); }));
app.get('/api/emojis', h(async () => banner.ICONS.map(n => ({ name: n, uploaded: !!EMO[n] }))));
app.get('/emoji/:n.png', (q, r) => { const b = banner.icon(q.params.n); b ? r.type('png').send(b) : r.status(404).end(); });
app.get('/api/suggestions', h(async () => Object.entries(db.sugs).reverse().slice(0, 30).map(([id, x]) => ({ id, n: x.n, text: x.text.slice(0, 200), status: x.status, up: x.up.length, down: x.down.length, user: gld()?.members.cache.get(x.user)?.displayName || x.user }))));
app.get('/api/logs', h(async () => feed));
app.get('/api/bc', h(async () => bc));
app.post('/api/config', h(async b => {
  if (b.section === 'tickets' && b.data.types) b.data.types = b.data.types.slice(0, 25).map(x => ({ id: String(x.id).replace(/\W/g, '').slice(0, 20) || 'x' + Math.random().toString(36).slice(2, 8), label: String(x.label || '').slice(0, 80), emoji: String(x.emoji || '').slice(0, 60), desc: String(x.desc || '').slice(0, 100) }));
  if (!db[b.section] || b.section === 'warns' || b.section === 'sugs') throw new Error('قسم غلط');
  if (b.section === 'afk') { const c = String(b.data.channel || ''); b.data = { enabled: !!b.data.enabled, channel: /^\d{15,25}$/.test(c) && gld()?.channels.cache.get(c)?.isVoiceBased() ? c : '' }; }
  db[b.section] = { ...db[b.section], ...b.data }; save();
  if (b.section === 'afk') setTimeout(() => afkEnsure().catch(() => {}), 300); }));
app.post('/api/send', h(async b => { const ch = gld().channels.cache.get(b.channel); if (!ch) throw new Error('اختار روم'); await ch.send(build(b)); }));
app.post('/api/broadcast', h(b => broadcast(b)));
app.get('/api/songs', h(async () => ({ songs: listSongs().map(x => ({ name: x.name })) })));
app.post('/api/songs/upload', express.raw({ type: '*/*', limit: '30mb' }), h(async (b, q) => {
  const name = path.basename(decodeURIComponent(String(q.query.name || ''))).replace(/[^\w\u0600-\u06FF .()\-]/g, '_').slice(0, 120);
  if (!SONG_EXT.test(name)) throw new Error('الصيغ المدعومة: mp3 wav ogg m4a flac opus aac');
  const buf = q.body; if (!Buffer.isBuffer(buf) || buf.length < 1024) throw new Error('الملف فاضي أو غلط');
  const head = buf.slice(0, 12).toString('latin1');
  if (!(/^ID3/.test(head) || buf[0] === 0xff || /^(RIFF|OggS|fLaC)/.test(head) || head.slice(4, 8) === 'ftyp' || buf[0] === 0x4f)) throw new Error('الملف مو ملف صوت صحيح');
  const dir = SONG_DIRS[SONG_DIRS.length - 1]; fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), buf);
}));
app.post('/api/songs/delete', h(async b => {
  const s = listSongs().find(x => x.name === b.name); if (!s) throw new Error('الأغنية مش موجودة');
  if (!SONG_DIRS.some(d => path.dirname(s.file) === d)) throw new Error('غير مسموح');
  fs.rmSync(s.file, { force: true });
}));
app.get('/api/music', h(async () => musicState()));
app.post('/api/music/play', h(async b => ({ title: await play({ voice: b.voice, query: b.query, user: 'dashboard' }) })));
app.post('/api/music/ctl', h(b => ctl(b.action, b.value)));
app.post('/api/panel', h(b => sendPanel(b.channel, b)));

dashApi.mount(app, { client, gld, db, save, h });

client.once('clientReady', async () => {
  console.log('البوت شغال:', client.user.tag);
  setupEmojis().catch(e => console.log('emojis:', e.message));
  setTimeout(() => afkEnsure().catch(() => {}), 5000); setInterval(() => afkEnsure().catch(() => {}), 30000);
  await new REST().setToken(process.env.TOKEN).put(Routes.applicationGuildCommands(client.user.id, process.env.GUILD_ID), { body: cmds });
});
client.login(process.env.TOKEN);
const port = process.env.PORT || 3000, host = process.env.HOST || '0.0.0.0';
app.listen(port, host, () => console.log(`الداشبورد: http://0.0.0.0:${port}`));
