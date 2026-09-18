process.env.CRM_OWNER_EMAIL='owner@example.test';
const {DatabaseSync}=require('node:sqlite');
const ts=require('typescript');const fs=require('fs');const assert=require('node:assert/strict');
const sqlite=new DatabaseSync(':memory:');for(const p of fs.readdirSync('drizzle').filter(p=>p.endsWith('.sql')).sort())sqlite.exec(fs.readFileSync('drizzle/'+p,'utf8'));
class Statement{constructor(sql,args=[]){this.sql=sql;this.args=args;}bind(...a){return new Statement(this.sql,a)}async first(){return sqlite.prepare(this.sql).get(...this.args)||null}async all(){return {results:sqlite.prepare(this.sql).all(...this.args)}}async run(){const r=sqlite.prepare(this.sql).run(...this.args);return {meta:{changes:Number(r.changes)}}}}
const DB={prepare:s=>new Statement(s),batch:async statements=>{sqlite.exec('BEGIN');try{const r=[];for(const s of statements)r.push(await s.run());sqlite.exec('COMMIT');return r;}catch(e){sqlite.exec('ROLLBACK');throw e}}};
let user={userId:'owner-test',email:'owner@example.test',displayName:'Owner'};
const deps={'@/lib/runtime':{env:{DB}},'../app/session':{getCurrentUser:async()=>user}};
function load(path){const out=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const m={exports:{}};new Function('require','module','exports',out)(id=>deps[id]||require(id),m,m.exports);return m.exports;}
deps['./runtime']=deps['@/lib/runtime'];const access=load('lib/access.ts');deps['@/lib/access']=access;const notifications=load('lib/notifications.ts');deps['@/lib/notifications']=notifications;deps['./notifications']=notifications;const common=load('lib/crm.ts');deps['@/lib/crm']=common;const sound=load('lib/sound.ts');deps['./sound']=sound;deps['@/lib/sound']=sound;const settings=load('lib/settings.ts');deps['@/lib/settings']=settings;const sms=load('lib/sms.ts');deps['@/lib/sms']=sms;const crmRoute=load('app/api/crm/route.ts');deps['../crm/route']=crmRoute;const itRoute=load('app/api/it/route.ts');
async function crmGet(query=''){const r=await crmRoute.GET(new Request('https://crm.test/api/crm'+query));return [r.status,await r.json()];}
async function crmPost(action,data,id,version){const r=await crmRoute.POST(new Request('https://crm.test/api/crm',{method:'POST',headers:{Origin:'https://crm.test','Content-Type':'application/json'},body:JSON.stringify({action,data,id,version})}));return [r.status,await r.json()];}
async function iGet(query=''){const r=await itRoute.GET(new Request('https://crm.test/api/it'+query));return [r.status,await r.json()];}
async function iPost(action,data,id,version){const r=await itRoute.POST(new Request('https://crm.test/api/it',{method:'POST',headers:{Origin:'https://crm.test','Content-Type':'application/json'},body:JSON.stringify({action,data,id,version})}));return [r.status,await r.json()];}
const taskData=(overrides={})=>({title:'Нэвтрэх хуудасны алдаа засах',system_area:'Вэбсайт / Frontend',owner:'it@example.test',status:'planned',due_at:new Date(Date.now()+86400000).toISOString(),note:'Шинэ IT ажил',...overrides});
(async()=>{
 await crmGet(); // bootstrap owner as admin
 assert.equal((await crmPost('member',{email:'agent@example.test',name:'Agent',role:'agent',active:true}))[0],200);
 assert.equal((await crmPost('member',{email:'marketing@example.test',name:'Marketing',role:'marketing',active:true}))[0],200);
 assert.equal((await crmPost('member',{email:'it@example.test',name:'IT',role:'it',active:true}))[0],200);
 assert.equal((await crmPost('member',{email:'director@example.test',name:'Director',role:'director',active:true}))[0],200);
 assert.equal((await crmPost('member',{email:'manager@example.test',name:'Manager',role:'manager',active:true}))[0],200);
 // IT эрхтэй ажилтан борлуулалтын хүсэлт (/api/crm) рүү огт хандахгүй (тусад нь isIsolatedRole-оор хориглосон).
 user={userId:'it',email:'it@example.test',displayName:'IT'};
 let [status,d]=await crmGet();assert.equal(status,200);assert.equal(d.me.role,'it');assert.equal(d.stats.total,0);assert.equal(d.leads.length,0);
 assert.equal((await crmPost('create',{name:'x',phone:'99112233',product:'p',source:'Facebook',owner:'it@example.test',status:'new',next_at:new Date(Date.now()+60000).toISOString(),next_action:'Call'}))[0],403);
 // Агент болон Маркетингийн эрхтэй хүн IT модульд огт хандахгүй.
 user={userId:'a',email:'agent@example.test',displayName:'Agent'};
 assert.equal((await iGet())[0],403);
 assert.equal((await iPost('create',taskData()))[0],403);
 user={userId:'m',email:'marketing@example.test',displayName:'Marketing'};
 assert.equal((await iGet())[0],403);
 assert.equal((await iPost('create',taskData()))[0],403);
 // Админ, удирдлага (director), ахлах (manager), IT дөрвүүлээ IT-ийн ажлын жагсаалтыг бүрэн ашиглана.
 user={userId:'owner-test',email:'owner@example.test',displayName:'Owner'};
 assert.equal((await iPost('create',taskData({system_area:'Тодорхойгүй систем'})))[0],400);
 [status,d]=await iPost('create',taskData());assert.equal(status,200);const id=d.id;
 [status,d]=await iGet();assert.equal(status,200);assert.equal(d.count,1);assert.equal(d.items[0].id,id);assert.equal(d.stats.total,1);assert.equal(d.stats.active,1);
 [status,d]=await iGet('?id='+id);assert.equal(status,200);assert.equal(d.task.title,'Нэвтрэх хуудасны алдаа засах');assert.equal(d.activities.length,1);assert.ok(d.activities[0].note.includes('бүртгэв'));
 user={userId:'director',email:'director@example.test',displayName:'Director'};
 assert.equal((await iPost('update',taskData({status:'done'}),id,999))[0],409);
 [status]=await iPost('update',taskData({status:'done'}),id,d.task.version);assert.equal(status,200);
 [status,d]=await iGet('?id='+id);assert.equal(d.task.status,'done');assert.equal(d.activities.length,2);
 user={userId:'manager',email:'manager@example.test',displayName:'Manager'};
 [status]=await iPost('activity',{note:'Алдаа шалгагдаж дууслаа, deploy хийсэн'},id,d.task.version);assert.equal(status,200);
 [status,d]=await iGet('?id='+id);assert.equal(d.activities.length,3);assert.equal(d.activities[0].note,'Алдаа шалгагдаж дууслаа, deploy хийсэн');
 user={userId:'it',email:'it@example.test',displayName:'IT'};
 assert.equal((await iPost('create',taskData({owner:'nobody@example.test'})))[0],400);
 // Календарь горим: сонгосон сард due_at тохирох мөрүүдийг буцаана, буруу сарын формат татгалзана.
 const [, calCreate]=await iPost('create',taskData({title:'Календарийн туршилт'}));
 const dueUB=new Date(Date.now()+86400000+8*3600000),thisMonth=dueUB.toISOString().slice(0,7);
 const nextMonthDate=new Date(Date.UTC(dueUB.getUTCFullYear(),dueUB.getUTCMonth()+1,1));
 const nextMonth=nextMonthDate.getUTCFullYear()+'-'+String(nextMonthDate.getUTCMonth()+1).padStart(2,'0');
 let [calStatus,calData]=await iGet('?calendar=1&month='+thisMonth);
 assert.equal(calStatus,200);assert.ok(calData.items.some(i=>i.id===calCreate.id));
 [calStatus,calData]=await iGet('?calendar=1&month='+nextMonth);
 assert.equal(calStatus,200);assert.equal(calData.items.some(i=>i.id===calCreate.id),false);
 assert.equal((await iGet('?calendar=1&month=bad'))[0],400);
 // day_count регресс: нэг өдөрт 6 ажил байвал хамгийн ихдээ 5-ыг буцаах ба day_count бүрэн тоог заана; бусад өдөр алга болохгүй.
 const skewDay=new Date(Date.now()+2*86400000);
 const skewDayIso=skewDay.toISOString();
 for(let i=0;i<6;i++)await iPost('create',taskData({title:'Skew '+i,due_at:new Date(skewDay.getTime()+i*60000).toISOString()}));
 const otherDay=new Date(Date.now()+3*86400000);
 const [, otherCreate]=await iPost('create',taskData({title:'Өдрийн тухай',due_at:otherDay.toISOString()}));
 const skewMonth=new Date(skewDayIso.slice(0,10)+'T00:00:00+08:00').toISOString().slice(0,7);
 const otherMonth=new Date(otherDay.getTime()+8*3600000).toISOString().slice(0,7);
 [calStatus,calData]=await iGet('?calendar=1&month='+skewMonth);
 assert.equal(calStatus,200);
 const skewDateKey=new Date(skewDay.getTime()+8*3600000).toISOString().slice(0,10);
 const skewItems=calData.items.filter(i=>new Date(new Date(i.due_at).getTime()+8*3600000).toISOString().slice(0,10)===skewDateKey);
 assert.equal(skewItems.length,5);assert.ok(skewItems.every(i=>i.day_count===6));
 if(otherMonth===skewMonth)assert.ok(calData.items.some(i=>i.id===otherCreate.id));
 // Тайлан горим: статус/систем/хариуцагчийн задаргаа зөв тооцоологдоно. Одоогийн (report-affecting) бүртгэл:
 // id (done,Вэбсайт/Frontend,owner=it@example.test) + 8 ширхэг календарийн туршилт (бүгд planned,Вэбсайт/Frontend,owner=it@example.test).
 await iPost('create',taskData({title:'Backend ажил',system_area:'Backend / Server',owner:'director@example.test',status:'in_progress'}));
 await iPost('create',taskData({title:'Цуцалсан ажил',system_area:'Backend / Server',owner:'director@example.test',status:'cancelled'}));
 let [repStatus,rep]=await iGet('?report=1');
 assert.equal(repStatus,200);
 assert.equal(rep.total,11);
 assert.equal(rep.byStatus.length,Object.keys(common.itStages).length);
 assert.equal(rep.byStatus.find(s=>s.status==='done').count,1);
 assert.equal(rep.byStatus.find(s=>s.status==='planned').count,8);
 assert.equal(rep.byStatus.find(s=>s.status==='in_progress').count,1);
 assert.equal(rep.byStatus.find(s=>s.status==='cancelled').count,1);
 assert.equal(rep.bySystemArea.find(a=>a.system_area==='Вэбсайт / Frontend').count,9);
 assert.equal(rep.bySystemArea.find(a=>a.system_area==='Backend / Server').count,2);
 const ownerIt=rep.byOwner.find(o=>o.owner==='it@example.test');
 assert.equal(ownerIt.total,9);assert.equal(ownerIt.done,1);
 const ownerDirector=rep.byOwner.find(o=>o.owner==='director@example.test');
 assert.equal(ownerDirector.total,2);assert.equal(ownerDirector.done,0);
 // Ирээдүйн rfrom-той бол хоосон тайлан буцна; буруу форматтай rfrom/rto-г Календарь горимоос ялгаатай, 400 биш зүгээр үл тоомсорлоно.
 const future=new Date(Date.now()+365*86400000).toISOString().slice(0,10);
 let [futStatus,futRep]=await iGet('?report=1&rfrom='+future);
 assert.equal(futStatus,200);assert.equal(futRep.total,0);
 let [badStatus,badRep]=await iGet('?report=1&rfrom=not-a-date&rto=also-bad');
 assert.equal(badStatus,200);assert.equal(badRep.total,11);
 const fullDay=(await iGet('?calendar=1&month='+skewDateKey.slice(0,7)+'&day='+skewDateKey))[1];assert.equal(fullDay.total,6);assert.equal(fullDay.items.length,6);
 assert.equal((await iGet('?calendar=1&month='+skewDateKey.slice(0,7)+'&day='+skewDateKey+'&page=2'))[1].items.length,0);
 console.log('PASS: IT role isolation from sales leads, cross-module access control, task CRUD, optimistic locking, activity logging, calendar filtering (incl. per-day cap regression) and report breakdown (status/system area/owner).');
})().catch(e=>{console.error(e);process.exit(1)});
