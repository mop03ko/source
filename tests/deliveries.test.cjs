process.env.CRM_OWNER_EMAIL='owner@example.test';
const {DatabaseSync}=require('node:sqlite');
const ts=require('typescript');const fs=require('fs');const assert=require('node:assert/strict');
const sqlite=new DatabaseSync(':memory:');for(const p of fs.readdirSync('drizzle').filter(p=>p.endsWith('.sql')).sort())sqlite.exec(fs.readFileSync('drizzle/'+p,'utf8'));
class Statement{constructor(sql,args=[]){this.sql=sql;this.args=args;}bind(...a){return new Statement(this.sql,a)}async first(){return sqlite.prepare(this.sql).get(...this.args)||null}async all(){return {results:sqlite.prepare(this.sql).all(...this.args)}}async run(){const r=sqlite.prepare(this.sql).run(...this.args);return {meta:{changes:Number(r.changes)}}}}
const DB={prepare:s=>new Statement(s),batch:async statements=>{sqlite.exec('BEGIN');try{const r=[];for(const s of statements)r.push(await s.run());sqlite.exec('COMMIT');return r;}catch(e){sqlite.exec('ROLLBACK');throw e}}};
let transactionQueue=Promise.resolve();
DB.transaction=work=>{const result=transactionQueue.then(async()=>{sqlite.exec('BEGIN IMMEDIATE');try{const value=await work({prepare:DB.prepare,batch:async statements=>{const out=[];for(const stmt of statements)out.push(await stmt.run());return out;}});sqlite.exec('COMMIT');return value;}catch(e){sqlite.exec('ROLLBACK');throw e;}});transactionQueue=result.catch(()=>{});return result;};
let user={userId:'owner-test',email:'owner@example.test',displayName:'Owner'};
const deps={'@/lib/runtime':{env:{DB}},'../app/session':{getCurrentUser:async()=>user}};
function load(path){const out=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const m={exports:{}};new Function('require','module','exports',out)(id=>deps[id]||require(id),m,m.exports);return m.exports;}
deps['./runtime']=deps['@/lib/runtime'];const access=load('lib/access.ts');deps['@/lib/access']=access;const notifications=load('lib/notifications.ts');deps['@/lib/notifications']=notifications;deps['./notifications']=notifications;const common=load('lib/crm.ts');deps['@/lib/serials']=load('lib/serials.ts');deps['./serials']=deps['@/lib/serials'];deps['@/lib/crm']=common;const sound=load('lib/sound.ts');deps['./sound']=sound;deps['@/lib/sound']=sound;const settings=load('lib/settings.ts');deps['@/lib/settings']=settings;const sms=load('lib/sms.ts');deps['@/lib/sms']=sms;deps['./crm']=common;deps['@/lib/assign']=load('lib/assign.ts');deps['./assign']=deps['@/lib/assign'];const crmRoute=load('app/api/crm/route.ts');deps['../crm/route']=crmRoute;deps['@/lib/inventory']=load('lib/inventory.ts');const stockRoute=load('app/api/inventory/route.ts');const route=load('app/api/deliveries/route.ts');
async function crmGet(query=''){const r=await crmRoute.GET(new Request('https://crm.test/api/crm'+query));return [r.status,await r.json()];}
async function crmPost(action,data){const r=await crmRoute.POST(new Request('https://crm.test/api/crm',{method:'POST',headers:{Origin:'https://crm.test','Content-Type':'application/json'},body:JSON.stringify({action,data})}));return [r.status,await r.json()];}
async function stockPost(action,data){const r=await stockRoute.POST(new Request('https://crm.test/api/inventory',{method:'POST',headers:{Origin:'https://crm.test','Content-Type':'application/json'},body:JSON.stringify({action,data})}));return [r.status,await r.json()];}
async function get(query=''){const r=await route.GET(new Request('https://crm.test/api/deliveries'+query));return [r.status,await r.json()];}
async function post(action,data,id,version){const r=await route.POST(new Request('https://crm.test/api/deliveries',{method:'POST',headers:{Origin:'https://crm.test','Content-Type':'application/json'},body:JSON.stringify({action,data,id,version})}));return [r.status,await r.json()];}
const COURIER='courier@example.test';
const base=(o={})=>({delivered_on:'2026-09-10',kind:'24 цаг',item_info:'Dyson V15s',customer_phone:'99112233',address:'ХУД 11-р хороо',payment_channel:'Зөгий',contents:'Бараа, гэрээ',courier_email:COURIER,courier_name:'',status:'pending',note:'',...o});
(async()=>{
 await crmGet(); // owner bootstrap → admin
 for(const m of [{email:'manager@example.test',name:'Manager',role:'manager'},{email:COURIER,name:'Идэрчулуун',role:'delivery'},{email:'marketing@example.test',name:'Marketing',role:'marketing'},{email:'it@example.test',name:'IT',role:'it'}])
  assert.equal((await crmPost('member',{...m,active:true}))[0],200);
 // Маркетинг, IT хоёул хүргэлтэд хамааралгүй тул огт хандахгүй.
 for(const u of [{userId:'m',email:'marketing@example.test',displayName:'Marketing'},{userId:'i',email:'it@example.test',displayName:'IT'}]){
  user=u;assert.equal((await get())[0],403);assert.equal((await post('create',base()))[0],403);
 }
 // Ахлах хүргэлт бүртгэнэ; огноо, хүргэгчийн шалгалт ажиллана.
 user={userId:'mg',email:'manager@example.test',displayName:'Manager'};
 assert.equal((await post('create',base({delivered_on:'10/09/2026'})))[0],400); // огнооны формат
 assert.equal((await post('create',base({courier_email:'nobody@example.test'})))[0],400); // идэвхгүй хүргэгч
 assert.equal((await post('create',base({courier_email:null,courier_name:''})))[0],400); // хүргэгч дутуу
 assert.equal((await post('create',base({status:'teeneg'})))[0],400); // төлөв буруу
 const a=(await post('create',base()))[1].id;
 const b=(await post('create',base({delivered_on:'2026-09-11',status:'delivered',payment_channel:'Гэгээн'})))[1].id;
 const c=(await post('create',base({delivered_on:'2026-08-05',status:'delivered',courier_email:null,courier_name:'Баярхүү',payment_channel:'Storepay',kind:'Яаралтай'})))[1].id;
 assert.ok(a&&b&&c);
 // Хүргэгчийн нэр и-мэйлээс автоматаар бөглөгдөнө (тайлан нэрээр бүлэглэдэг тул хоосон байж болохгүй).
 let [status,d]=await get();assert.equal(status,200);assert.equal(d.count,3);
 assert.equal(d.items.find(i=>i.id===a).courier_name,'Идэрчулуун');
 assert.equal(d.items.find(i=>i.id===a).entered_by_name,'Manager');
 assert.equal(d.stats.total,3);assert.equal(d.stats.done,2);assert.equal(d.stats.pending,1);
 assert.equal(d.items[0].delivered_on,'2026-09-11'); // шинэ огноо эхэлж харагдана
 // Шүүлтүүрүүд
 assert.equal((await get('?courier='+encodeURIComponent('Баярхүү')))[1].count,1);
 assert.equal((await get('?channel='+encodeURIComponent('Зөгий')))[1].count,1);
 assert.equal((await get('?status=delivered'))[1].count,2);
 assert.equal((await get('?kind='+encodeURIComponent('Яаралтай')))[1].count,1);
 assert.equal((await get('?from=2026-09-01&to=2026-09-30'))[1].count,2);
 assert.equal((await get('?q=99112233'))[1].count,3);
 assert.equal((await get('?q='+encodeURIComponent('ХУД')))[1].count,3);
 assert.equal((await get('?from=huurhun'))[0],400);
 // Optimistic locking
 assert.equal((await post('update',base({item_info:'Өөр бараа'}),a,99))[0],409);
 [status,d]=await get('?id='+a);assert.equal(status,200);
 assert.equal((await post('update',base({item_info:'Dyson V15s Absolute'}),a,d.delivery.version))[0],200);
 assert.equal((await get('?id='+a))[1].delivery.item_info,'Dyson V15s Absolute');
 // Хүргэгч: зөвхөн өөрийн хүргэлтээ хардаг, бүртгэж/зассахгүй, төлөвөө л шинэчилнэ.
 user={userId:'c',email:COURIER,displayName:'Идэрчулуун'};
 [status,d]=await get();assert.equal(status,200);assert.equal(d.count,2);
 assert.equal(d.items.some(i=>i.id===c),false); // өөр хүргэгчийн мөр
 assert.equal((await post('create',base()))[0],403);
 assert.equal((await get('?id='+c))[0],403);
 let ver=(await get('?id='+a))[1].delivery.version;
 assert.equal((await post('update',base(),a,ver))[0],403);
 assert.equal((await post('set_status',{status:'delivered',note:'Хүлээлгэж өглөө'},a,ver))[0],200);
 [status,d]=await get('?id='+a);assert.equal(d.delivery.status,'delivered');assert.equal(d.delivery.note,'Хүлээлгэж өглөө');
 // Бусдын хүргэлтийн төлөвийг хүргэгч солихгүй.
 user={userId:'mg',email:'manager@example.test',displayName:'Manager'};
 const cver=(await get('?id='+c))[1].delivery.version;
 user={userId:'c',email:COURIER,displayName:'Идэрчулуун'};
 assert.equal((await post('set_status',{status:'failed'},c,cver))[0],403);
 // Хүргэж буй барааг агуулахын бүртгэлтэй холбоно.
 user={userId:'owner-test',email:'owner@example.test',displayName:'Owner'};
 const itemId=(await stockPost('create_item',{code:'DY-V15S',brand:'Dyson',name:'Dyson V15s Detect',sale_price:2500000}))[1].id;
 assert.ok(itemId);
 user={userId:'mg',email:'manager@example.test',displayName:'Manager'};
 assert.equal((await post('create',base({item_id:'no-such-item'})))[0],404); // бүртгэлд байхгүй бараа
 const linkedId=(await post('create',base({delivered_on:'2026-09-12',item_id:itemId,item_info:''})))[1].id;
 [status,d]=await get('?id='+linkedId);assert.equal(status,200);
 assert.equal(d.delivery.item_id,itemId);assert.equal(d.delivery.item_code,'DY-V15S');
 assert.equal(d.delivery.item_name,'Dyson V15s Detect');assert.equal(d.delivery.item_brand,'Dyson');
 // Барааны код/нэрээр хүргэлтийг хайж олно.
 assert.equal((await get('?q=DY-V15S'))[1].count,1);
 assert.equal((await get('?q='+encodeURIComponent('Detect')))[1].count,1);
 // Холбоогүй хүргэлт хэвээр ажиллана (гэрээ, баримт хүргэх мөрүүд).
 [status,d]=await get();assert.equal(d.stats.linked,1);assert.ok(d.stats.total>1);
 assert.equal(d.items.find(i=>i.id===linkedId).item_name,'Dyson V15s Detect');
 assert.equal(d.items.find(i=>i.id===a).item_name,null);
 // Холбоосыг салгаж, дахин холбож болно.
 let lver=(await get('?id='+linkedId))[1].delivery.version;
 assert.equal((await post('update',base({delivered_on:'2026-09-12',item_id:null}),linkedId,lver))[0],200);
 assert.equal((await get('?id='+linkedId))[1].delivery.item_id,null);
 lver=(await get('?id='+linkedId))[1].delivery.version;
 assert.equal((await post('update',base({delivered_on:'2026-09-12',item_id:itemId}),linkedId,lver))[0],200);
 // Excel-ээс импортолсон и-мэйлгүй мөрийг хүргэгч нэрээрээ хардаг.
 user={userId:'mg',email:'manager@example.test',displayName:'Manager'};
 const legacy=(await post('create',base({delivered_on:'2026-07-02',courier_email:null,courier_name:'Идэрчулуун',payment_channel:'Бэлэн'})))[1].id;
 user={userId:'c',email:COURIER,displayName:'Идэрчулуун'};
 [status,d]=await get();assert.equal(d.count,4);assert.ok(d.items.some(i=>i.id===legacy));
 // Хүргэгчийн тайлан зөвхөн өөрийн мөрөөр хязгаарлагдана.
 [status,d]=await get('?report=1');assert.equal(status,200);assert.equal(d.total,4);
 assert.equal(d.byCourier.length,1);assert.equal(d.byCourier[0].name,'Идэрчулуун');
 // Ахлахын дашбоард: ажилтан тус бүрийн гүйцэтгэл, сар, суваг, төрлийн задаргаа.
 user={userId:'mg',email:'manager@example.test',displayName:'Manager'};
 [status,d]=await get('?report=1');assert.equal(status,200);assert.equal(d.total,5);
 const ider=d.byCourier.find(r=>r.name==='Идэрчулуун'),bayar=d.byCourier.find(r=>r.name==='Баярхүү');
 assert.equal(ider.total,4);assert.equal(ider.done,2);assert.equal(ider.pending,2);assert.equal(ider.active_days,4);
 assert.equal(ider.last_day,'2026-09-12');
 assert.equal(bayar.total,1);assert.equal(bayar.done,1);
 assert.equal(d.byCourier[0].name,'Идэрчулуун'); // хамгийн их хүргэлттэй нь эхэлнэ
 assert.deepEqual(d.byMonth.map(m=>m.month),['2026-07','2026-08','2026-09']);
 assert.equal(d.byMonth.find(m=>m.month==='2026-09').total,3);
 assert.equal(d.byChannel.find(c=>c.channel==='Зөгий').total,2);
 assert.equal(d.byKind.find(k=>k.kind==='Яаралтай').total,1);
 assert.equal(d.byStatus.find(s=>s.status==='delivered').total,3);
 assert.equal(d.byItem.length,1);assert.equal(d.byItem[0].code,'DY-V15S');assert.equal(d.byItem[0].total,1);
 // Тайлангийн хугацааны шүүлт
 [status,d]=await get('?report=1&rfrom=2026-09-01&rto=2026-09-30');
 assert.equal(d.total,3);assert.equal(d.byCourier.length,1);
 assert.equal((await get('?report=1&rfrom=2026'))[0],400);
 console.log('PASS: delivery journal role isolation (marketing/IT blocked), courier self-scoping by email and legacy name, courier status-only permissions, manager CRUD with optimistic locking, date/status/courier validation, list filters, warehouse-item linking (validated, searchable by code/name, unlinkable) and per-courier dashboard aggregation (performance, months, channels, kinds, top items).');
})().catch(e=>{console.error(e);process.exit(1)});
