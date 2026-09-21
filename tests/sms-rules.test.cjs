process.env.CRM_OWNER_EMAIL='owner@example.test';
const {DatabaseSync}=require('node:sqlite');
const ts=require('typescript');const fs=require('fs');const assert=require('node:assert/strict');
const sqlite=new DatabaseSync(':memory:');for(const p of fs.readdirSync('drizzle').filter(p=>p.endsWith('.sql')).sort())sqlite.exec(fs.readFileSync('drizzle/'+p,'utf8'));
class Statement{constructor(sql,args=[]){this.sql=sql;this.args=args;}bind(...a){return new Statement(this.sql,a)}async first(){return sqlite.prepare(this.sql).get(...this.args)||null}async all(){return {results:sqlite.prepare(this.sql).all(...this.args)}}async run(){const r=sqlite.prepare(this.sql).run(...this.args);return {meta:{changes:Number(r.changes)}}}}
const DB={prepare:s=>new Statement(s),batch:async statements=>{sqlite.exec('BEGIN');try{const r=[];for(const s of statements)r.push(await s.run());sqlite.exec('COMMIT');return r;}catch(e){sqlite.exec('ROLLBACK');throw e}}};
let user={userId:'owner-test',email:'owner@example.test',displayName:'Owner'};
const deps={'@/lib/runtime':{env:{DB}},'../app/session':{getCurrentUser:async()=>user}};
function load(path){const out=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const m={exports:{}};new Function('require','module','exports',out)(id=>deps[id]||require(id),m,m.exports);return m.exports;}
deps['./runtime']=deps['@/lib/runtime'];const access=load('lib/access.ts');deps['@/lib/access']=access;const notifications=load('lib/notifications.ts');deps['@/lib/notifications']=notifications;deps['./notifications']=notifications;const common=load('lib/crm.ts');deps['@/lib/crm']=common;const sound=load('lib/sound.ts');deps['./sound']=sound;deps['@/lib/sound']=sound;const settings=load('lib/settings.ts');deps['@/lib/settings']=settings;const sms=load('lib/sms.ts');deps['@/lib/sms']=sms;deps['./crm']=common;deps['@/lib/assign']=load('lib/assign.ts');deps['./assign']=deps['@/lib/assign'];const crmRoute=load('app/api/crm/route.ts');deps['../crm/route']=crmRoute;const rulesRoute=load('app/api/sms-rules/route.ts');
async function crmGet(query=''){const r=await crmRoute.GET(new Request('https://crm.test/api/crm'+query));return [r.status,await r.json()];}
async function crmPost(action,data,id,version){const r=await crmRoute.POST(new Request('https://crm.test/api/crm',{method:'POST',headers:{Origin:'https://crm.test','Content-Type':'application/json'},body:JSON.stringify({action,data,id,version})}));return [r.status,await r.json()];}
async function rulesGet(){const r=await rulesRoute.GET();return [r.status,await r.json()];}
async function rulesPost(body){const r=await rulesRoute.POST(new Request('https://crm.test/api/sms-rules',{method:'POST',headers:{Origin:'https://crm.test','Content-Type':'application/json'},body:JSON.stringify(body)}));return [r.status,await r.json()];}
const leadData=(phone,owner='owner@example.test',status='new')=>({name:'Test lead',phone,product:'Laptop',source:'Facebook',owner,status,next_at:new Date().toISOString(),next_action:'Call'});
(async()=>{
 await crmGet(); // bootstrap owner as admin
 assert.equal((await crmPost('member',{email:'agent@example.test',name:'Agent',role:'agent',active:true}))[0],200);
 // Migration 0017 нь "won" төлөвт зориулсан анхны дүрмийг seed хийдэг тул эхэндээ 1 дүрэмтэй эхэлнэ.
 let [status,d]=await rulesGet();assert.equal(status,200);assert.equal(d.items.length,1);assert.equal(d.items[0].status,'won');assert.equal(d.items[0].enabled,1);
 // Зөвхөн Админ, Удирдлага удирдана.
 user={userId:'a',email:'agent@example.test',displayName:'Agent'};
 assert.equal((await rulesGet())[0],403);
 assert.equal((await rulesPost({action:'save',status:'lost',message:'x',enabled:true}))[0],403);
 user={userId:'owner-test',email:'owner@example.test',displayName:'Owner'};
 // Буруу статус, хоосон мессеж татгалзана.
 assert.equal((await rulesPost({action:'save',status:'bad-status',message:'x',enabled:true}))[0],400);
 assert.equal((await rulesPost({action:'save',status:'lost',message:'',enabled:true}))[0],400);
 // Шинэ автомат SMS нэмэх (upsert): статус тус бүрт нэг дүрэм байх тул дахин хадгалахад шинэчилнэ, шинээр нэмэгдэхгүй.
 assert.equal((await rulesPost({action:'save',status:'lost',message:'Уучлаарай, таны хүсэлтийг цуцаллаа.',enabled:true}))[0],200);
 [status,d]=await rulesGet();assert.equal(d.items.length,2);
 assert.equal((await rulesPost({action:'save',status:'lost',message:'Шинэчилсэн текст.',enabled:false}))[0],200);
 [status,d]=await rulesGet();assert.equal(d.items.length,2);
 const lostRule=d.items.find(r=>r.status==='lost');assert.equal(lostRule.message,'Шинэчилсэн текст.');assert.equal(lostRule.enabled,0);
 // Автомат SMS триггер: төлөв өөрчлөгдөхөд тохирсон, асаалттай дүрэм байвал л оролдлого хийж, түүхэнд тэмдэглэнэ.
 // Тест орчинд ANTMALL_SMS_API_KEY тохируулаагүй тул илгээлт амжилтгүй болох ч хүсэлт өөрөө 200 буцна.
 [,d]=await crmPost('create',leadData('99011001'));const leadNoRule=d.id;
 let [,detail]=await crmGet('?id='+leadNoRule);
 assert.equal((await crmPost('update',leadData('99011001',undefined,'lost'),leadNoRule,detail.lead.version))[0],200);
 [,detail]=await crmGet('?id='+leadNoRule);
 assert.ok(!detail.activities.some(a=>a.actor==='AntMall SMS'),'lost дүрэм унтраалттай үед SMS оролдохгүй');
 assert.equal((await rulesPost({action:'save',status:'lost',message:'Уучлаарай, таны хүсэлтийг цуцаллаа.',enabled:true}))[0],200);
 [,d]=await crmPost('create',leadData('99011002'));const leadWithRule=d.id;
 [,detail]=await crmGet('?id='+leadWithRule);
 assert.equal((await crmPost('update',leadData('99011002',undefined,'lost'),leadWithRule,detail.lead.version))[0],200);
 [,detail]=await crmGet('?id='+leadWithRule);
 assert.ok(detail.activities.some(a=>a.actor==='AntMall SMS'),'lost дүрэм асаалттай үед SMS илгээхийг оролдоно');
 // Won now requires the inventory confirmation flow; its SMS is covered in lead-purchases.test.cjs.
 [,d]=await crmPost('create',leadData('99011003'));const leadWon=d.id;
 [,detail]=await crmGet('?id='+leadWon);
 assert.equal((await crmPost('update',leadData('99011003',undefined,'won'),leadWon,detail.lead.version))[0],409);
 [,detail]=await crmGet('?id='+leadWon);
 assert.ok(!detail.activities.some(a=>a.actor==='AntMall SMS'),'Rejected status change must not send SMS');
 // Дүрэм устгах: цаашид тухайн статуст автомат SMS ажиллахгүй болно.
 assert.equal((await rulesPost({action:'delete',status:'lost'}))[0],200);
 [status,d]=await rulesGet();assert.equal(d.items.length,1);assert.equal(d.items[0].status,'won');
 console.log('PASS: SMS rule CRUD (admin-only, per-status upsert, enable/disable, delete), status validation, and the generic status-change auto-SMS trigger (attempted only when an enabled rule matches).');
})().catch(e=>{console.error(e);process.exit(1)});
