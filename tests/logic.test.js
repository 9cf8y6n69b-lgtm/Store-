process.env.DB_PATH='/tmp/novatest/t.db'; process.env.DATA_DIR='/tmp/novatest/data';
const assert=require('assert'); const R=process.cwd();
const { db, S, setS } = require(R+'/src/db'); const fs=require('fs'), path=require('path'), zlib=require('zlib');
const { dirs }=require(R+'/src/files');
// 1) seeds
assert(S('bad_words').includes('fuck') && S('bad_words').includes('شرموط'), 'bad words seeded');
assert.strictEqual(db.prepare('SELECT COUNT(*) c FROM content').get().c, 7, 'content seeded');
setS('bad_words','mine'); require(R+'/src/db'); assert.strictEqual(S('bad_words'),'mine','no reseed'); console.log('✔ seeds');
// 2) data
setS('staff_role','111111111111111111'); setS('warranty_days','7'); setS('month_sale_value','10'); setS('month_cost','4');
db.prepare("INSERT INTO coupons(code,percent) VALUES('VIP',20)").run();
db.prepare("INSERT INTO autoreplies(trigger,response) VALUES('سعر|price','رد')").run();
db.prepare("INSERT INTO blacklist(user_id,reason,created) VALUES('999','scam',1)").run();
const now=Date.now(), items=JSON.stringify([{id:1,name:'حماية',months:1,emoji:'🛡️'},{id:2,name:'لوق',months:2,emoji:'📜'}]);
db.prepare("INSERT INTO orders(user_id,items,base,bundle,coupon_pct,pay,status,claimed_by,created,delivered_at,paid_at) VALUES('u1',?,3,0,0,'nitro','delivered','s1',?,?,?)").run(items,now-1000,now-500,now-800);
db.prepare("INSERT INTO orders(user_id,items,base,bundle,coupon_pct,pay,status,created) VALUES('u2',?,4,0,50,'robux','pending',?)").run(items,now-100);
fs.writeFileSync(path.join(dirs.overrides,'logo.png'), Buffer.from([0x89,0x50,0x4e,0x47,1,2,3]));
// 3) report
const shop=require(R+'/src/shop'); const [f,t]=shop.range('all'); const d=shop.reportData(f,t);
assert.strictEqual(d.delivered,1); assert.strictEqual(d.months,3); assert.strictEqual(d.profit,18); assert.strictEqual(d.byPay.nitro.amount,3);
assert(shop.reportCsv(d).includes('u1')); console.log('✔ report', d.revenue, d.profit);
// 4) backup roundtrip
const backup=require(R+'/src/backup'); const { buf, obj }=backup.createBackupFile({scope:'full',images:true});
const dec=backup.decode(buf); assert.strictEqual(dec.tables.orders.rows.length,2); assert(dec.files['overrides/logo.png']);
assert(!JSON.stringify(dec).includes('credentials'), 'no creds');
db.prepare('DELETE FROM orders').run(); db.prepare('DELETE FROM coupons').run(); db.prepare('DELETE FROM autoreplies').run(); setS('staff_role',''); fs.rmSync(path.join(dirs.overrides,'logo.png'));
const rep=backup.applyBackup(dec,{mode:'replace'});
assert.strictEqual(db.prepare('SELECT COUNT(*) c FROM orders').get().c,2); assert.strictEqual(S('staff_role'),'111111111111111111');
assert.strictEqual(db.prepare('SELECT code FROM coupons').get().code,'VIP'); assert(fs.existsSync(path.join(dirs.overrides,'logo.png')));
assert.strictEqual(db.prepare('SELECT trigger FROM autoreplies').get().trigger,'سعر|price'); console.log('✔ backup roundtrip', rep.tables.orders, 'orders,', rep.files,'img');
// 5) forward-compat: backup from "old code" with extra column/table, missing column
const old={format:'nova-store-backup',version:1,created:new Date().toISOString(),tables:{coupons:{columns:['code','percent','legacy_col'],rows:[{code:'OLD',percent:5,legacy_col:'x'}]},ghost_table:{columns:['a'],rows:[{a:1}]},'bad;DROP TABLE orders':{columns:['a'],rows:[{a:1}]}},files:{'../../evil.png':'AAAA','overrides/ok.png':Buffer.from([0x89,0x50]).toString('base64')}};
const r2=backup.applyBackup(backup.decode(zlib.gzipSync(Buffer.from(JSON.stringify(old)))),{mode:'merge'});
assert(db.prepare("SELECT 1 FROM coupons WHERE code='OLD'").get()); assert(db.prepare("SELECT 1 FROM coupons WHERE code='VIP'").get(),'merge keeps'); assert(r2.skipped.includes('ghost_table'));
assert(!fs.existsSync(path.join(dirs.data,'..','evil.png'))); assert.strictEqual(db.prepare('SELECT COUNT(*) c FROM orders').get().c,2); console.log('✔ forward-compat + path safety');
assert.throws(()=>backup.decode(Buffer.from('{"hello":1}')),/ليس نسخة/); console.log('✔ rejects foreign files');
// 6) remap by names
const fakeGuild={channels:{cache:new Map([['500',{id:'500',name:'log',type:0}]])},roles:{cache:new Map([['600',{id:'600',name:'Nova | Staff'}]])}};
fakeGuild.channels.cache.forEach=function(f){for(const v of this.values())f(v)}; fakeGuild.roles.cache.forEach=fakeGuild.channels.cache.forEach;
const bk={format:'nova-store-backup',version:3,created:new Date().toISOString(),guild:{id:'1',channels:[{id:'400',name:'log',type:0}],roles:[{id:'300',name:'Nova | Staff'}]},tables:{settings:{columns:['key','value'],rows:[{key:'staff_role',value:'300'},{key:'log_mod',value:'400'}]}},files:{}};
backup.applyBackup(bk,{mode:'replace',guild:fakeGuild}); assert.strictEqual(S('staff_role'),'600'); assert.strictEqual(S('log_mod'),'500'); console.log('✔ id remap by name');
// 7) invoice
const o=db.prepare('SELECT * FROM orders WHERE user_id=?').get('u1'); const inv=shop.invoiceEmbed(o); console.log('✔ invoice built');
// 8) botctl creds
const bc=require(R+'/src/botctl');
assert.throws(()=>bc.saveCreds({guildId:'abc'}),/ايدي السيرفر/); assert.throws(()=>bc.saveCreds({token:'bad'}),/التوكن/);
const tok='MTIzNDU2Nzg5MDEyMzQ1Njc4.GabcDE.'+'x'.repeat(30);
bc.saveCreds({token:'Bot '+tok,guildId:'123456789012345678',clientId:'223456789012345678'});
const st=bc.status(); assert(st.hasToken && st.tokenTail===tok.slice(-4) && !JSON.stringify(st).includes(tok)); assert.strictEqual(process.env.GUILD_ID,'123456789012345678');
const mode=fs.statSync(path.join(dirs.data,'credentials.json')).mode&0o777; console.log('✔ creds saved, never exposed; file mode',mode.toString(8));
assert(!JSON.stringify(backup.buildBackup({})).includes(tok)); console.log('✔ token not in backups');
assert.throws(()=>bc.setPresence({status:'bogus'}),/حالة/); bc.setPresence({status:'dnd',type:'Watching',text:'المتجر'}); assert.strictEqual(S('bot_status'),'dnd'); console.log('✔ presence settings');
console.log('ALL OK');
// تم صنع البوت بمتجر نوفا ستور • يوزر الاونر: .5yb.
