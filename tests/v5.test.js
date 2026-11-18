process.env.DB_PATH='/tmp/novatest3/t.db'; process.env.DATA_DIR='/tmp/novatest3/data';
require('fs').mkdirSync('/tmp/novatest3/data',{recursive:true});
const assert=require('assert'), R=process.cwd();
const sec=require(R+'/src/secure'), {db,S}=require(R+'/src/db'), PK=require(R+'/src/hosted/packages');
// TOTP: متجه RFC 6238 (SHA1، سر ASCII 12345678901234567890، T=59 → 94287082 ← آخر 6 أرقام 287082)
const secret='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'; assert.strictEqual(sec.hotp(secret,1),'287082'); assert(sec.verifyTotp(secret,'287082',59000)); assert(!sec.verifyTotp(secret,'000000',59000));
// تشفير
const enc=sec.encrypt({a:1},'passphrase1'); assert.deepStrictEqual(sec.decrypt(enc,'passphrase1'),{a:1}); assert.throws(()=>sec.decrypt(enc,'wrongpass12'),/غلط/); assert.throws(()=>sec.encrypt({}, 'x'),/8/);
// مفاتيح
const k=sec.newKey(), salt='ab'.repeat(8), h=sec.hashKey(k,salt); assert(sec.checkKey(k,salt,h)); assert(!sec.checkKey(k+'x',salt,h)); assert(!sec.checkKey('',salt,h));
// باقات: كل باقة تحتوي اللي قبلها
const [b,g,d]=PK.list(); assert(b.templates.every(t=>g.templates.includes(t))&&g.templates.every(t=>d.templates.includes(t))); assert(b.rank<g.rank&&g.rank<d.rank&&b.days<g.days&&g.days<d.days&&b.price<g.price&&g.price<d.price);
// منتجات الباقات مزروعة + كل منتج له قالب
const prods=db.prepare("SELECT * FROM products").all(); assert.strictEqual(prods.filter(p=>p.category==='package').length,3);
for(const p of prods.filter(p=>p.category!=='package')) assert(PK.templateOf(p.name),'no template for '+p.name);
const T=require(R+'/src/hosted/templates'); for(const p of prods.filter(p=>p.category!=='package')){const t=PK.templateOf(p.name); assert(t==='panel'||T.get(t),'missing template '+t)}
assert.strictEqual(T.meta().length,16);
// planFor
db.prepare("INSERT INTO orders(user_id,items,base,pay,status,created) VALUES('u',?,1,'nitro','paid',1)").run(JSON.stringify([{id:1,name:'ترحيب / وداع',months:0.5},{id:2,name:'حماية',months:1}]));
let o=db.prepare('SELECT * FROM orders ORDER BY id DESC').get(), pl=PK.planFor(o); assert.strictEqual(pl.pkg.id,''); assert.strictEqual(pl.days,45); assert.deepStrictEqual(pl.templates.sort(),['protection','welcome']);
db.prepare("INSERT INTO orders(user_id,items,base,pay,status,created) VALUES('u',?,2,'nitro','paid',1)").run(JSON.stringify([{id:3,name:'ميوزك',months:2}])); const mo=db.prepare('SELECT * FROM orders ORDER BY id DESC').get(), mp=PK.planFor(mo); assert.deepStrictEqual(mp.templates,['music']); assert.strictEqual(mp.days,60);
db.prepare("INSERT INTO orders(user_id,items,base,pay,status,created) VALUES('u',?,1,'nitro','paid',1)").run(JSON.stringify([{id:9,name:'باقة دايموند',months:10,category:'package'}]));
o=db.prepare('SELECT * FROM orders ORDER BY id DESC').get(); pl=PK.planFor(o); assert.strictEqual(pl.pkg.id,'diamond'); assert(pl.templates.includes('music')&&pl.templates.includes('ai')); assert.strictEqual(pl.rights.portal,1);
db.prepare('INSERT INTO hosted_plans VALUES(?,?,?,?,?,?,?)').run(o.id,'bronze','بوتي','[]','{"presence":1}',45,1); pl=PK.planFor(o); assert.strictEqual(pl.name,'بوتي'); assert.strictEqual(pl.days,45); assert.strictEqual(pl.rights.presence,1);
assert(S('hosted_renew_link').includes('2HVpUpTtXY')); assert(S('hosted_expire_msg').includes('البوت الخاص فيك بيخلص اشتراكه'));
// كل ملف يحمل التوقيع
const fs=require('fs'),path=require('path'); (function walk(d){for(const f of fs.readdirSync(d)){const p=path.join(d,f); if(/node_modules|stubs|data|tests|assets/.test(p))continue; if(fs.statSync(p).isDirectory())walk(p); else if(/\.(js|py|html)$/.test(f)) assert(/5yb/.test(fs.readFileSync(p,'utf8').slice(-200)),'no signature: '+p)}})(R+'/src'); 
console.log('✔ v5 tests');
