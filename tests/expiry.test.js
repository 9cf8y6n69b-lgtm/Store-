process.env.DB_PATH='/tmp/novatest4/t.db'; process.env.DATA_DIR='/tmp/novatest4/data'; require('fs').mkdirSync('/tmp/novatest4/data',{recursive:true});
const assert=require('assert'), R=process.cwd(), hb=require(R+'/src/hosted/manager'), {db}=require(R+'/src/db');
const tok='MTIzNDU2Nzg5MDEyMzQ1Njc4.abcdef.abcdefghijklmnopqrstuvwxyz1', got=[];
hb.init({remind:async(r,k)=>got.push(k.kind),registry:()=>{},remindDays:()=>'3,1',mainToken:()=>'x'});
(async()=>{
  const b=hb.create({name:'x',token:tok,templates:['welcome'],days:10}), set=(ms)=>db.prepare('UPDATE hosted_bots SET expires=? WHERE id=?').run(Date.now()+ms,b.id), D=864e5;
  await hb.checkSubs(); assert.deepStrictEqual(got,[]);           // بعيد
  set(2.5*D); await hb.checkSubs(); assert.deepStrictEqual(got,['soon']);   // دخل نطاق 3 أيام
  await hb.checkSubs(); assert.deepStrictEqual(got,['soon']);     // ما يتكرر
  set(0.9*D); await hb.checkSubs(); assert.deepStrictEqual(got,['soon','soon']);  // نطاق يوم
  set(-1000); await hb.checkSubs(); assert.deepStrictEqual(got,['soon','soon','expired']);
  await hb.checkSubs(); assert.strictEqual(got.length,3);         // مرة وحدة
  hb.update(b.id,{addDays:10}); assert.strictEqual(db.prepare('SELECT remind_stage s FROM hosted_bots WHERE id=?').get(b.id).s,0); // تمديد يصفّر التنبيهات
  console.log('✔ expiry reminders'); process.exit(0);
})().catch(e=>{console.error(e);process.exit(1)});
