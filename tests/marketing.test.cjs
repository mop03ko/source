process.env.CRM_OWNER_EMAIL='owner@example.test';
const {DatabaseSync}=require('node:sqlite');
const ts=require('typescript');const fs=require('fs');const assert=require('node:assert/strict');
const sqlite=new DatabaseSync(':memory:');for(const p of fs.readdirSync('drizzle').filter(p=>p.endsWith('.sql')).sort())sqlite.exec(fs.readFileSync('drizzle/'+p,'utf8'));
class Statement{constructor(sql,args=[]){this.sql=sql;this.args=args;}bind(...a){return new Statement(this.sql,a)}async first(){return sqlite.prepare(this.sql).get(...this.args)||null}async all(){return {results:sqlite.prepare(this.sql).all(...this.args)}}async run(){const r=sqlite.prepare(this.sql).run(...this.args);return {meta:{changes:Number(r.changes)}}}}
const DB={prepare:s=>new Statement(s),batch:async statements=>{sqlite.exec('BEGIN');try{const r=[];for(const s of statements)r.push(await s.run());sqlite.exec('COMMIT');return r;}catch(e){sqlite.exec('ROLLBACK');throw e}}};
let user={userId:'owner-test',email:'owner@example.test',displayName:'Owner'};
const deps={'@/lib/runtime':{env:{DB}},'../app/session':{getCurrentUser:async()=>user}};
function load(path){const out=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const m={exports:{}};new Function('require','module','exports',out)(id=>deps[id]||require(id),m,m.exports);return m.exports;}
deps['./runtime']=deps['@/lib/runtime'];const access=load('lib/access.ts');deps['@/lib/access']=access;const notifications=load('lib/notifications.ts');deps['@/lib/notifications']=notifications;deps['./notifications']=notifications;const common=load('lib/crm.ts');deps['@/lib/crm']=common;const sound=load('lib/sound.ts');deps['./sound']=sound;deps['@/lib/sound']=sound;const settings=load('lib/settings.ts');deps['@/lib/settings']=settings;const sms=load('lib/sms.ts');deps['@/lib/sms']=sms;const crmRoute=load('app/api/crm/route.ts');deps['../crm/route']=crmRoute;const marketingRoute=load('app/api/marketing/route.ts');
async function crmGet(query=''){const r=await crmRoute.GET(new Request('https://crm.test/api/crm'+query));return [r.status,await r.json()];}
async function crmPost(action,data,id,version){const r=await crmRoute.POST(new Request('https://crm.test/api/crm',{method:'POST',headers:{Origin:'https://crm.test','Content-Type':'application/json'},body:JSON.stringify({action,data,id,version})}));return [r.status,await r.json()];}
async function mGet(query=''){const r=await marketingRoute.GET(new Request('https://crm.test/api/marketing'+query));return [r.status,await r.json()];}
async function mPost(action,data,id,version){const r=await marketingRoute.POST(new Request('https://crm.test/api/marketing',{method:'POST',headers:{Origin:'https://crm.test','Content-Type':'application/json'},body:JSON.stringify({action,data,id,version})}));return [r.status,await r.json()];}
const taskData=(overrides={})=>({title:'Facebook сурталчилгаа',channel:'Facebook',budget:150000,owner:'marketing@example.test',status:'planned',due_at:new Date(Date.now()+86400000).toISOString(),note:'Шинэ кампанит ажил',...overrides});
(async()=>{
 await crmGet(); // bootstrap owner as admin
 assert.equal((await crmPost('member',{email:'agent@example.test',name:'Agent',role:'agent',active:true}))[0],200);
 assert.equal((await crmPost('member',{email:'marketing@example.test',name:'Marketing',role:'marketing',active:true}))[0],200);
 // Marketing-ийн эрхтэй ажилтан борлуулалтын /api/crm-ийг зөвхөн хоосон "shell" мэдээллээр уншиж чадна, бичиж чадахгүй.
 user={userId:'m',email:'marketing@example.test',displayName:'Marketing'};
 let [status,d]=await crmGet();assert.equal(status,200);assert.equal(d.me.role,'marketing');assert.equal(d.stats.total,0);assert.equal(d.leads.length,0);
 assert.equal((await crmPost('create',{name:'x',phone:'99112233',product:'p',source:'Facebook',owner:'marketing@example.test',status:'new',next_at:new Date(Date.now()+60000).toISOString(),next_action:'Call'}))[0],403);
 assert.equal((await crmGet('?view=duplicates'))[0],403);
 // Борлуулалтын лид рүү маркетинг эрхтэй хүнийг хариуцагчаар оноож болохгүй (гацсан лид үүсэхээс сэргийлнэ).
 user={userId:'owner-test',email:'owner@example.test',displayName:'Owner'};
 assert.equal((await crmPost('create',{name:'x',phone:'99112233',product:'p',source:'Facebook',owner:'marketing@example.test',status:'new',next_at:new Date(Date.now()+60000).toISOString(),next_action:'Call'}))[0],400);
 // Агент маркетингийн модульд огт хандахгүй.
 user={userId:'a',email:'agent@example.test',displayName:'Agent'};
 assert.equal((await mGet())[0],403);
 assert.equal((await mPost('create',taskData()))[0],403);
 // Маркетингийн эрхтэй ажилтан өөрийн ажлын жагсаалтаа бүрэн ашиглана: үүсгэх, унших, шинэчлэх, тэмдэглэл нэмэх.
 user={userId:'m',email:'marketing@example.test',displayName:'Marketing'};
 assert.equal((await mPost('create',taskData({channel:'Bad channel'})))[0],400);
 [status,d]=await mPost('create',taskData());assert.equal(status,200);const id=d.id;
 [status,d]=await mGet();assert.equal(status,200);assert.equal(d.count,1);assert.equal(d.items[0].id,id);assert.equal(d.stats.total,1);assert.equal(d.stats.active,1);
 [status,d]=await mGet('?id='+id);assert.equal(status,200);assert.equal(d.task.title,'Facebook сурталчилгаа');assert.equal(d.activities.length,1);assert.ok(d.activities[0].note.includes('бүртгэв'));
 assert.equal((await mPost('update',taskData({status:'done'}),id,999))[0],409);
 [status]=await mPost('update',taskData({status:'done'}),id,d.task.version);assert.equal(status,200);
 [status,d]=await mGet('?id='+id);assert.equal(d.task.status,'done');assert.equal(d.activities.length,2);
 [status]=await mPost('activity',{note:'Кампанит ажил дууслаа, 500 click'},id,d.task.version);assert.equal(status,200);
 [status,d]=await mGet('?id='+id);assert.equal(d.activities.length,3);assert.equal(d.activities[0].note,'Кампанит ажил дууслаа, 500 click');
 assert.equal((await mPost('create',taskData({owner:'nobody@example.test'})))[0],400);
 // Календарь горим: сонгосон сард due_at тохирох мөрүүдийг буцаана, буруу сарын формат татгалзана.
 const [, calCreate]=await mPost('create',taskData({title:'Календарийн туршилт'}));
 const dueUB=new Date(Date.now()+86400000+8*3600000),thisMonth=dueUB.toISOString().slice(0,7);
 const nextMonthDate=new Date(Date.UTC(dueUB.getUTCFullYear(),dueUB.getUTCMonth()+1,1));
 const nextMonth=nextMonthDate.getUTCFullYear()+'-'+String(nextMonthDate.getUTCMonth()+1).padStart(2,'0');
 let [calStatus,calData]=await mGet('?calendar=1&month='+thisMonth);
 assert.equal(calStatus,200);assert.ok(calData.items.some(i=>i.id===calCreate.id));
 [calStatus,calData]=await mGet('?calendar=1&month='+nextMonth);
 assert.equal(calStatus,200);assert.equal(calData.items.some(i=>i.id===calCreate.id),false);
 assert.equal((await mGet('?calendar=1&month=bad'))[0],400);
 // Тайлан горим: статус/суваг/хариуцагчийн задаргаа, төсвийн баталгаажилтын нийлбэр зөв тооцоологдоно.
 // Одоогийн байдал: id (done,Facebook,150000), calCreate (planned,Facebook,150000) хоёул owner=marketing@example.test.
 const [,tApproved]=await mPost('create',taskData({title:'Батлагдсан төсөвтэй',channel:'Google хайлтын сурталчилгаа',budget:200000,owner:'agent@example.test',status:'in_progress'}));
 user={userId:'owner-test',email:'owner@example.test',displayName:'Owner'};
 assert.equal((await mPost('approve',undefined,tApproved.id,1))[0],400); // тайлбар заавал шаардана
 assert.equal((await mPost('approve',{note:'Төсөв тохиролцсон.'},tApproved.id,1))[0],200);
 // Батлагдсан төсвийг буцаах: зөвхөн admin/director, шалтгаан заавал бичнэ, дараа нь дахин батлах боломжтой.
 user={userId:'m',email:'marketing@example.test',displayName:'Marketing'};
 assert.equal((await mPost('unapprove',{note:'x'},tApproved.id,2))[0],403);
 user={userId:'owner-test',email:'owner@example.test',displayName:'Owner'};
 assert.equal((await mPost('unapprove',undefined,tApproved.id,2))[0],400);
 assert.equal((await mPost('unapprove',{note:'Төсөв дахин хянана.'},tApproved.id,2))[0],200);
 let [,tUnapproved]=await mGet('?id='+tApproved.id);
 assert.equal(tUnapproved.task.approved_at,null);
 assert.ok(tUnapproved.activities[0].note.includes('буцаав'));
 assert.equal((await mPost('unapprove',{note:'дахин'},tApproved.id,tUnapproved.task.version))[0],409); // аль хэдийн буцаагдсан
 assert.equal((await mPost('approve',{note:'Дахин батлав.'},tApproved.id,tUnapproved.task.version))[0],200); // дахин батлах боломжтой
 user={userId:'m',email:'marketing@example.test',displayName:'Marketing'};
 await mPost('create',taskData({title:'Батлагдаагүй төсөвтэй',channel:'Google хайлтын сурталчилгаа',budget:50000,owner:'agent@example.test',status:'cancelled'}));
 let [repStatus,rep]=await mGet('?report=1');
 assert.equal(repStatus,200);
 assert.equal(rep.total,4);
 assert.equal(rep.byStatus.length,Object.keys(common.marketingStages).length);
 assert.equal(rep.byStatus.find(s=>s.status==='done').count,1);
 assert.equal(rep.byStatus.find(s=>s.status==='planned').count,1);
 assert.equal(rep.byStatus.find(s=>s.status==='in_progress').count,1);
 assert.equal(rep.byStatus.find(s=>s.status==='cancelled').count,1);
 assert.equal(rep.byChannel.find(c=>c.channel==='Facebook').count,2);
 assert.equal(rep.byChannel.find(c=>c.channel==='Google хайлтын сурталчилгаа').count,2);
 const ownerMarketing=rep.byOwner.find(o=>o.owner==='marketing@example.test');
 assert.equal(ownerMarketing.total,2);assert.equal(ownerMarketing.done,1);
 const ownerAgent=rep.byOwner.find(o=>o.owner==='agent@example.test');
 assert.equal(ownerAgent.total,2);assert.equal(ownerAgent.done,0);
 assert.equal(rep.budget.total,550000);
 assert.equal(rep.budget.approved,200000);
 assert.equal(rep.budget.unapproved,350000);
 assert.equal(rep.budget.byChannel.find(c=>c.channel==='Facebook').budget,300000);
 assert.equal(rep.budget.byChannel.find(c=>c.channel==='Google хайлтын сурталчилгаа').budget,250000);
 // Удирдлагын хяналтын самбар: батлагдаагүй бөгөөд цуцлагдаагүй ажлуудын жагсаалт, зөвхөн admin/director харна.
 assert.equal((await mGet('?pending_approvals=1'))[0],403);
 user={userId:'owner-test',email:'owner@example.test',displayName:'Owner'};
 let [paStatus,pa]=await mGet('?pending_approvals=1');
 assert.equal(paStatus,200);assert.equal(pa.count,2);assert.equal(pa.budget,300000);assert.equal(pa.items.length,2);
 assert.ok(pa.items.every(t=>t.status!=='cancelled'));
 assert.ok(!pa.items.some(t=>t.id===tApproved.id));
 user={userId:'m',email:'marketing@example.test',displayName:'Marketing'};
 // Ирээдүйн rfrom-той бол хоосон тайлан буцна; буруу форматтай rfrom/rto-г Календарь горимоос ялгаатай, 400 биш зүгээр үл тоомсорлоно.
 const future=new Date(Date.now()+365*86400000).toISOString().slice(0,10);
 let [futStatus,futRep]=await mGet('?report=1&rfrom='+future);
 assert.equal(futStatus,200);assert.equal(futRep.total,0);assert.equal(futRep.budget.total,0);
 let [badStatus,badRep]=await mGet('?report=1&rfrom=not-a-date&rto=also-bad');
 assert.equal(badStatus,200);assert.equal(badRep.total,4);
 console.log('PASS: marketing role isolation from sales leads, cross-module access control, task CRUD, optimistic locking, activity logging, calendar filtering, report breakdown (status/channel/owner/budget), budget approve/unapprove with mandatory notes and admin dashboard pending-approvals access control.');
})().catch(e=>{console.error(e);process.exit(1)});
