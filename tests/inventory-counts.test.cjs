process.env.CRM_OWNER_EMAIL='owner@example.test';
const {DatabaseSync}=require('node:sqlite');
const ts=require('typescript');const fs=require('fs');const assert=require('node:assert/strict');
const sqlite=new DatabaseSync(':memory:');for(const p of fs.readdirSync('drizzle').filter(p=>p.endsWith('.sql')).sort())sqlite.exec(fs.readFileSync('drizzle/'+p,'utf8'));
class Statement{constructor(sql,args=[]){this.sql=sql;this.args=args;}bind(...a){return new Statement(this.sql,a)}async first(){return sqlite.prepare(this.sql).get(...this.args)||null}async all(){return {results:sqlite.prepare(this.sql).all(...this.args)}}async run(){const r=sqlite.prepare(this.sql).run(...this.args);return {meta:{changes:Number(r.changes)}}}}
const DB={prepare:s=>new Statement(s),batch:async statements=>{sqlite.exec('BEGIN');try{const r=[];for(const s of statements)r.push(await s.run());sqlite.exec('COMMIT');return r;}catch(e){sqlite.exec('ROLLBACK');throw e}}};
let transactionQueue=Promise.resolve();
DB.transaction=work=>{const result=transactionQueue.then(async()=>{sqlite.exec('BEGIN IMMEDIATE');try{const value=await work({prepare:DB.prepare,batch:async statements=>{const results=[];for(const stmt of statements)results.push(await stmt.run());return results;}});sqlite.exec('COMMIT');return value;}catch(e){sqlite.exec('ROLLBACK');throw e;}});transactionQueue=result.catch(()=>{});return result;};
let user={userId:'owner-test',email:'owner@example.test',displayName:'Owner'};
const deps={'@/lib/runtime':{env:{DB}},'../app/session':{getCurrentUser:async()=>user}};
function load(path){const out=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const m={exports:{}};new Function('require','module','exports',out)(id=>deps[id]||require(id),m,m.exports);return m.exports;}
deps['./runtime']=deps['@/lib/runtime'];const access=load('lib/access.ts');deps['@/lib/access']=access;const notifications=load('lib/notifications.ts');deps['@/lib/notifications']=notifications;deps['./notifications']=notifications;const common=load('lib/crm.ts');deps['@/lib/serials']=load('lib/serials.ts');deps['./serials']=deps['@/lib/serials'];deps['@/lib/crm']=common;const sound=load('lib/sound.ts');deps['./sound']=sound;deps['@/lib/sound']=sound;const settings=load('lib/settings.ts');deps['@/lib/settings']=settings;const sms=load('lib/sms.ts');deps['@/lib/sms']=sms;deps['./crm']=common;deps['@/lib/assign']=load('lib/assign.ts');deps['./assign']=deps['@/lib/assign'];const crmRoute=load('app/api/crm/route.ts');deps['../crm/route']=crmRoute;deps['@/lib/inventory']=load('lib/inventory.ts');const stockRoute=(deps['@/lib/inventory-visibility']=load('lib/inventory-visibility.ts'),load('app/api/inventory/route.ts'));const invRoute=load('app/api/inventory-counts/route.ts');
async function crmGet(query=''){const r=await crmRoute.GET(new Request('https://crm.test/api/crm'+query));return [r.status,await r.json()];}
async function crmPost(action,data,id,version){const r=await crmRoute.POST(new Request('https://crm.test/api/crm',{method:'POST',headers:{Origin:'https://crm.test','Content-Type':'application/json'},body:JSON.stringify({action,data,id,version})}));return [r.status,await r.json()];}
async function stockGet(query=''){const r=await stockRoute.GET(new Request('https://crm.test/api/inventory'+query));return [r.status,await r.json()];}
async function stockPost(action,data,id){const r=await stockRoute.POST(new Request('https://crm.test/api/inventory',{method:'POST',headers:{Origin:'https://crm.test','Content-Type':'application/json'},body:JSON.stringify({action,data,id})}));return [r.status,await r.json()];}
async function invGet(query=''){const r=await invRoute.GET(new Request('https://crm.test/api/inventory-counts'+query));return [r.status,await r.json()];}
async function invPost(action,data,id,version){const r=await invRoute.POST(new Request('https://crm.test/api/inventory-counts',{method:'POST',headers:{Origin:'https://crm.test','Content-Type':'application/json'},body:JSON.stringify({action,data,id,version})}));return [r.status,await r.json()];}
const stockOf=async itemId=>{const [,d]=await stockGet('?view=items&id='+itemId);return d.byWarehouse.reduce((n,w)=>n+w.qty,0);};
(async()=>{
 await crmGet(); // bootstrap owner as admin
 assert.equal((await crmPost('member',{email:'agent@example.test',name:'Agent',role:'agent',active:true}))[0],200);
 assert.equal((await crmPost('member',{email:'manager@example.test',name:'Manager',role:'manager',active:true}))[0],200);
 assert.equal((await crmPost('member',{email:'director@example.test',name:'Director',role:'director',active:true}))[0],200);
 assert.equal((await crmPost('member',{email:'marketing@example.test',name:'Marketing',role:'marketing',active:true}))[0],200);
 assert.equal((await crmPost('member',{email:'it@example.test',name:'IT',role:'it',active:true}))[0],200);
 // Агуулах, бараа, эхний үлдэгдлийг бэлдэнэ: item1=5ш, item2=3ш, item3=0ш (тооллогод орохгүй).
 user={userId:'a',email:'agent@example.test',displayName:'Agent'};
 const whId=(await stockPost('create_warehouse',{name:'Урд агуулах'}))[1].id;
 const otherWh=(await stockPost('create_warehouse',{name:'Заал'}))[1].id;
 const item1=(await stockPost('create_item',{code:'A1',brand:'CUCKOO',name:'Бариу',variant:'',sale_price:900000}))[1].id;
 const item2=(await stockPost('create_item',{code:'A2',brand:'CUCKOO',name:'Тогоо',variant:'',sale_price:500000}))[1].id;
 const item3=(await stockPost('create_item',{code:'A3',brand:'CUCKOO',name:'Халбага',variant:'',sale_price:20000}))[1].id;
 user={userId:'owner-test',email:'owner@example.test',displayName:'Owner'};
 assert.equal((await stockPost('record_purchase',{item_id:item1,warehouse_id:whId,qty:5,unit_cost:800000,payment_status:'Төлөгдсөн'}))[0],200);
 assert.equal((await stockPost('record_purchase',{item_id:item2,warehouse_id:whId,qty:3,unit_cost:400000,payment_status:'Төлөгдсөн'}))[0],200);
 assert.equal((await stockPost('record_purchase',{item_id:item3,warehouse_id:otherWh,qty:7,unit_cost:15000,payment_status:'Төлөгдсөн'}))[0],200);
 const countData=(overrides={})=>({title:'9-р сарын агуулахын тооллого',warehouse_id:whId,owner:'agent@example.test',status:'planned',due_at:new Date(Date.now()+86400000).toISOString(),note:'Сар бүрийн шалгалт',...overrides});
 // Маркетинг, IT хоёул агуулахын тооллогод хамааралгүй тул огт хандахгүй.
 user={userId:'m',email:'marketing@example.test',displayName:'Marketing'};
 assert.equal((await invGet())[0],403);assert.equal((await invPost('create',countData()))[0],403);
 user={userId:'it',email:'it@example.test',displayName:'IT'};
 assert.equal((await invGet())[0],403);assert.equal((await invPost('create',countData()))[0],403);
 // Агент, ахлах, удирдлага, админ дөрвүүлээ тооллогыг бүрэн ашиглана.
 user={userId:'a',email:'agent@example.test',displayName:'Agent'};
 assert.equal((await invPost('create',countData({warehouse_id:'no-such-warehouse'})))[0],404);
 assert.equal((await invPost('create',countData({owner:'nobody@example.test'})))[0],400);
 let [status,d]=await invPost('create',countData());assert.equal(status,200);const id=d.id;
 // Тухайн агуулахын үлдэгдэлтэй бараа бүрт мөр автоматаар үүсэж, хүлээгдэж буй тоо нь ledger-ийн дүнтэй тэнцэнэ.
 [status,d]=await invGet('?id='+id);assert.equal(status,200);
 assert.equal(d.warehouse_name,'Урд агуулах');assert.equal(d.lines.length,2);
 assert.equal(d.lines.find(l=>l.item_id===item1).expected_qty,5);
 assert.equal(d.lines.find(l=>l.item_id===item2).expected_qty,3);
 assert.equal(d.lines.some(l=>l.item_id===item3),false); // өөр агуулахын бараа орохгүй
 assert.ok(d.activities[0].note.includes('2 бараа'));
 [status,d]=await invGet();assert.equal(d.count,1);assert.equal(d.items[0].warehouse_name,'Урд агуулах');assert.equal(d.items[0].line_count,2);assert.equal(d.items[0].discrepancy_count,0);
 // Optimistic locking: хуучин хувилбараар шинэчлэхэд 409.
 assert.equal((await invPost('update',countData({status:'in_progress'}),id,999))[0],409);
 // Тоолсон дүн хадгалах: item1 дээр -1 зөрүү, item2 таарсан.
 [status,d]=await invGet('?id='+id);
 const l1=d.lines.find(l=>l.item_id===item1),l2=d.lines.find(l=>l.item_id===item2);
 user={userId:'manager',email:'manager@example.test',displayName:'Manager'};
 [status]=await invPost('save_lines',{lines:[{line_id:l1.id,counted_qty:4},{line_id:l2.id,counted_qty:3}]},id,d.task.version);
 assert.equal(status,200);
 [status,d]=await invGet('?id='+id);assert.equal(d.lines.find(l=>l.item_id===item1).counted_qty,4);
 [status,d]=await invGet();assert.equal(d.items[0].discrepancy_count,1);
 user={userId:'director',email:'director@example.test',displayName:'Director'};
 [status,d]=await invGet('?id='+id);
 [status]=await invPost('activity',{note:'Зөрүүг агуулахын менежертэй тулгав.'},id,d.task.version);assert.equal(status,200);
 [status,d]=await invGet('?id='+id);assert.equal(d.activities[0].note,'Зөрүүг агуулахын менежертэй тулгав.');
 // Тооллого дуусгах: зөрүүтэй мөр бүрт count_adjustment хөдөлгөөн бичигдэж, үлдэгдэл тоолсон тоотой тэнцэнэ.
 assert.equal(await stockOf(item1),5);
 let [finStatus,fin]=await invPost('finalize',{},id,d.task.version);
 assert.equal(finStatus,200);assert.equal(fin.adjusted,1);
 assert.equal(await stockOf(item1),4);assert.equal(await stockOf(item2),3);
 [status,d]=await invGet('?id='+id);assert.equal(d.task.status,'done');
 assert.ok(d.activities[0].note.includes('Тооллого дуусгав'));
 [status,d]=await stockGet('?view=items&id='+item1);
 assert.equal(d.moves.filter(mv=>mv.kind==='count_adjustment').length,1);
 assert.equal(d.moves.find(mv=>mv.kind==='count_adjustment').qty_delta,-1);
 [status,d]=await invGet();assert.equal(d.stats.done,1);assert.equal(d.stats.active,0);
 // Календарь горим: сонгосон сард due_at тохирох мөрүүд, өдрийн задаргаа, буруу сарын формат.
 user={userId:'owner-test',email:'owner@example.test',displayName:'Owner'};
 const [,calCreate]=await invPost('create',countData({title:'Заалны тооллого',warehouse_id:otherWh}));
 const dueUB=new Date(Date.now()+86400000+8*3600000),thisMonth=dueUB.toISOString().slice(0,7),thisDay=dueUB.toISOString().slice(0,10);
 const nextMonthDate=new Date(Date.UTC(dueUB.getUTCFullYear(),dueUB.getUTCMonth()+1,1));
 const nextMonth=nextMonthDate.getUTCFullYear()+'-'+String(nextMonthDate.getUTCMonth()+1).padStart(2,'0');
 let [calStatus,calData]=await invGet('?calendar=1&month='+thisMonth);
 assert.equal(calStatus,200);assert.ok(calData.items.some(i=>i.id===calCreate.id));
 [calStatus,calData]=await invGet('?calendar=1&month='+thisMonth+'&day='+thisDay);
 assert.equal(calStatus,200);assert.ok(calData.total>=1);assert.ok(calData.items.some(i=>i.id===calCreate.id));
 [calStatus,calData]=await invGet('?calendar=1&month='+nextMonth);
 assert.equal(calStatus,200);assert.equal(calData.items.some(i=>i.id===calCreate.id),false);
 assert.equal((await invGet('?calendar=1&month=bad'))[0],400);
 assert.equal((await invGet('?calendar=1&month='+thisMonth+'&day=bad'))[0],400);
 console.log('PASS: inventory-count (тооллого) role isolation from marketing/IT, per-warehouse line generation from the stock ledger, optimistic locking, counted-quantity saving with discrepancy tallies, finalize writing count_adjustment moves that reconcile item stock, and calendar month/day filtering.');
})().catch(e=>{console.error(e);process.exit(1)});
