process.env.CRM_OWNER_EMAIL='owner@example.test';
const {DatabaseSync}=require('node:sqlite');
const ts=require('typescript');const fs=require('fs');const assert=require('node:assert/strict');
const sqlite=new DatabaseSync(':memory:');for(const p of fs.readdirSync('drizzle').filter(p=>p.endsWith('.sql')).sort())sqlite.exec(fs.readFileSync('drizzle/'+p,'utf8'));
class Statement{constructor(sql,args=[]){this.sql=sql;this.args=args;}bind(...a){return new Statement(this.sql,a)}async first(){return sqlite.prepare(this.sql).get(...this.args)||null}async all(){return {results:sqlite.prepare(this.sql).all(...this.args)}}async run(){const r=sqlite.prepare(this.sql).run(...this.args);return {meta:{changes:Number(r.changes)}}}}
const DB={prepare:s=>new Statement(s),batch:async statements=>{sqlite.exec('BEGIN');try{const r=[];for(const s of statements)r.push(await s.run());sqlite.exec('COMMIT');return r;}catch(e){sqlite.exec('ROLLBACK');throw e}}};
let user={userId:'owner-test',email:'owner@example.test',displayName:'Owner'};
const deps={'@/lib/runtime':{env:{DB}},'../app/session':{getCurrentUser:async()=>user}};
function load(path){const out=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const m={exports:{}};new Function('require','module','exports',out)(id=>deps[id]||require(id),m,m.exports);return m.exports;}
deps['./runtime']=deps['@/lib/runtime'];const access=load('lib/access.ts');deps['@/lib/access']=access;const notifications=load('lib/notifications.ts');deps['@/lib/notifications']=notifications;deps['./notifications']=notifications;const common=load('lib/crm.ts');deps['@/lib/crm']=common;const sound=load('lib/sound.ts');deps['./sound']=sound;deps['@/lib/sound']=sound;const settings=load('lib/settings.ts');deps['@/lib/settings']=settings;const sms=load('lib/sms.ts');deps['@/lib/sms']=sms;const crmRoute=load('app/api/crm/route.ts');deps['../crm/route']=crmRoute;const invRoute=load('app/api/inventory-counts/route.ts');
async function crmGet(query=''){const r=await crmRoute.GET(new Request('https://crm.test/api/crm'+query));return [r.status,await r.json()];}
async function crmPost(action,data,id,version){const r=await crmRoute.POST(new Request('https://crm.test/api/crm',{method:'POST',headers:{Origin:'https://crm.test','Content-Type':'application/json'},body:JSON.stringify({action,data,id,version})}));return [r.status,await r.json()];}
async function invGet(query=''){const r=await invRoute.GET(new Request('https://crm.test/api/inventory-counts'+query));return [r.status,await r.json()];}
async function invPost(action,data,id,version){const r=await invRoute.POST(new Request('https://crm.test/api/inventory-counts',{method:'POST',headers:{Origin:'https://crm.test','Content-Type':'application/json'},body:JSON.stringify({action,data,id,version})}));return [r.status,await r.json()];}
const countData=(overrides={})=>({title:'9-р сарын кассын тооллого',category:'Мөнгө',owner:'agent@example.test',status:'planned',due_at:new Date(Date.now()+86400000).toISOString(),expected_amount:5000000,actual_amount:null,note:'Сар бүрийн шалгалт',...overrides});
(async()=>{
 await crmGet(); // bootstrap owner as admin
 assert.equal((await crmPost('member',{email:'agent@example.test',name:'Agent',role:'agent',active:true}))[0],200);
 assert.equal((await crmPost('member',{email:'manager@example.test',name:'Manager',role:'manager',active:true}))[0],200);
 assert.equal((await crmPost('member',{email:'director@example.test',name:'Director',role:'director',active:true}))[0],200);
 assert.equal((await crmPost('member',{email:'marketing@example.test',name:'Marketing',role:'marketing',active:true}))[0],200);
 assert.equal((await crmPost('member',{email:'it@example.test',name:'IT',role:'it',active:true}))[0],200);
 // Маркетинг, IT хоёул борлуулалтын тооллогод хамааралгүй тул огт хандахгүй.
 user={userId:'m',email:'marketing@example.test',displayName:'Marketing'};
 assert.equal((await invGet())[0],403);assert.equal((await invPost('create',countData()))[0],403);
 user={userId:'it',email:'it@example.test',displayName:'IT'};
 assert.equal((await invGet())[0],403);assert.equal((await invPost('create',countData()))[0],403);
 // Агент, ахлах, удирдлага, админ дөрвүүлээ санхүүгийн тооллогын жагсаалтыг бүрэн ашиглана.
 user={userId:'a',email:'agent@example.test',displayName:'Agent'};
 assert.equal((await invPost('create',countData({category:'Тодорхойгүй'})))[0],400);
 let [status,d]=await invPost('create',countData());assert.equal(status,200);const id=d.id;
 [status,d]=await invGet();assert.equal(status,200);assert.equal(d.count,1);assert.equal(d.items[0].id,id);assert.equal(d.stats.total,1);assert.equal(d.stats.active,1);
 [status,d]=await invGet('?id='+id);assert.equal(status,200);assert.equal(d.task.title,'9-р сарын кассын тооллого');assert.equal(d.task.actual_amount,null);assert.equal(d.activities.length,1);assert.ok(d.activities[0].note.includes('бүртгэв'));
 // Optimistic locking: хуучин хувилбараар шинэчлэхэд 409.
 assert.equal((await invPost('update',countData({status:'done'}),id,999))[0],409);
 // Бодит дүн бөглөхөд зөрүүг идэвхийн түүхэнд тэмдэглэнэ.
 user={userId:'manager',email:'manager@example.test',displayName:'Manager'};
 [status]=await invPost('update',countData({actual_amount:4990000}),id,d.task.version);assert.equal(status,200);
 [status,d]=await invGet('?id='+id);assert.equal(d.task.actual_amount,4990000);assert.equal(d.activities.length,2);
 assert.ok(d.activities[0].note.includes('Бодит дүн'));assert.ok(d.activities[0].note.includes('-10,000')||d.activities[0].note.includes('-10000'));
 user={userId:'director',email:'director@example.test',displayName:'Director'};
 [status]=await invPost('activity',{note:'Зөрүүг агуулахын менежертэй тулгав.'},id,d.task.version);assert.equal(status,200);
 [status,d]=await invGet('?id='+id);assert.equal(d.activities.length,3);assert.equal(d.activities[0].note,'Зөрүүг агуулахын менежертэй тулгав.');
 user={userId:'owner-test',email:'owner@example.test',displayName:'Owner'};
 assert.equal((await invPost('create',countData({owner:'nobody@example.test'})))[0],400);
 // Календарь горим: сонгосон сард due_at тохирох мөрүүдийг буцаана, буруу сарын формат татгалзана.
 const [, calCreate]=await invPost('create',countData({title:'Барааны тооллого',category:'Бараа'}));
 const dueUB=new Date(Date.now()+86400000+8*3600000),thisMonth=dueUB.toISOString().slice(0,7);
 const nextMonthDate=new Date(Date.UTC(dueUB.getUTCFullYear(),dueUB.getUTCMonth()+1,1));
 const nextMonth=nextMonthDate.getUTCFullYear()+'-'+String(nextMonthDate.getUTCMonth()+1).padStart(2,'0');
 let [calStatus,calData]=await invGet('?calendar=1&month='+thisMonth);
 assert.equal(calStatus,200);assert.ok(calData.items.some(i=>i.id===calCreate.id));
 [calStatus,calData]=await invGet('?calendar=1&month='+nextMonth);
 assert.equal(calStatus,200);assert.equal(calData.items.some(i=>i.id===calCreate.id),false);
 assert.equal((await invGet('?calendar=1&month=bad'))[0],400);
 // Тайлан горим: статус/ангилал/хариуцагч, хүлээгдэж буй ба бодит дүнгийн задаргаа зөв тооцоологдоно.
 await invPost('create',countData({title:'Баримтын тооллого',category:'Баримт',owner:'director@example.test',status:'cancelled',expected_amount:0,actual_amount:null}));
 let [repStatus,rep]=await invGet('?report=1');
 assert.equal(repStatus,200);assert.equal(rep.total,3);
 assert.equal(rep.byStatus.find(s=>s.status==='planned').count,2); // id (бодит дүн бөглөсөн ч төлөв planned хэвээр) + calCreate
 assert.equal(rep.byStatus.find(s=>s.status==='cancelled').count,1);
 assert.equal(rep.byCategory.find(c=>c.category==='Мөнгө').count,1);
 assert.equal(rep.byCategory.find(c=>c.category==='Бараа').count,1);
 assert.equal(rep.amounts.expected,10000000);assert.equal(rep.amounts.actual,4990000);assert.equal(rep.amounts.counted,1);
 assert.equal(rep.amounts.discrepancy,4990000-10000000);
 const future=new Date(Date.now()+365*86400000).toISOString().slice(0,10);
 let [futStatus,futRep]=await invGet('?report=1&rfrom='+future);
 assert.equal(futStatus,200);assert.equal(futRep.total,0);
 console.log('PASS: inventory-count (тооллого) role isolation from marketing/IT, cross-role sales access, task CRUD, optimistic locking, actual-vs-expected discrepancy logging, calendar filtering and report breakdown (status/category/owner/amounts).');
})().catch(e=>{console.error(e);process.exit(1)});
