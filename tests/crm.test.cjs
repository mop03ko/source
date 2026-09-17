process.env.CRM_OWNER_EMAIL='owner@example.test';
const {DatabaseSync}=require('node:sqlite');
const ts=require('typescript');const fs=require('fs');const assert=require('node:assert/strict');
const sqlite=new DatabaseSync(':memory:');for(const p of fs.readdirSync('drizzle').filter(p=>p.endsWith('.sql')))sqlite.exec(fs.readFileSync('drizzle/'+p,'utf8'));
class Statement{constructor(sql,args=[]){this.sql=sql;this.args=args;}bind(...a){return new Statement(this.sql,a)}async first(){return sqlite.prepare(this.sql).get(...this.args)||null}async all(){return {results:sqlite.prepare(this.sql).all(...this.args)}}async run(){const r=sqlite.prepare(this.sql).run(...this.args);return {meta:{changes:Number(r.changes)}}}}
const DB={prepare:s=>new Statement(s),batch:async statements=>{sqlite.exec('BEGIN');try{const r=[];for(const s of statements)r.push(await s.run());sqlite.exec('COMMIT');return r;}catch(e){sqlite.exec('ROLLBACK');throw e}}};
let user={userId:'owner-test',email:'owner@example.test',displayName:'Owner'};
const deps={'@/lib/runtime':{env:{DB}},'../app/session':{getCurrentUser:async()=>user}};
function load(path){const out=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const m={exports:{}};new Function('require','module','exports',out)(id=>deps[id]||require(id),m,m.exports);return m.exports;}
deps['./runtime']=deps['@/lib/runtime'];const access=load('lib/access.ts');deps['@/lib/access']=access;const notifications=load('lib/notifications.ts');deps['@/lib/notifications']=notifications;deps['./notifications']=notifications;const common=load('lib/crm.ts');deps['@/lib/crm']=common;const sound=load('lib/sound.ts');deps['./sound']=sound;deps['@/lib/sound']=sound;const settings=load('lib/settings.ts');deps['@/lib/settings']=settings;const sms=load('lib/sms.ts');deps['@/lib/sms']=sms;const route=load('app/api/crm/route.ts');deps['../crm/route']=route;const noticesRoute=load('app/api/notifications/route.ts');
async function notice(action,ids,origin='https://crm.test'){const r=await noticesRoute.POST(new Request('https://crm.test/api/notifications',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({action,ids})}));return [r.status,await r.json()];}
async function get(query=''){const r=await route.GET(new Request('https://crm.test/api/crm'+query));return [r.status,await r.json()]}
async function post(action,data,id,version,origin='https://crm.test'){const r=await route.POST(new Request('https://crm.test/api/crm',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({action,data,id,version})}));return [r.status,await r.json()]}
const leadData=(phone='99112233',owner='owner@example.test')=>({name:'Test only',phone,product:'Laptop',source:'Facebook',owner,status:'new',next_at:new Date().toISOString(),next_action:'Call'});
(async()=>{
 user=null;assert.equal((await get())[0],401);user={userId:'owner-test',email:'owner@example.test',displayName:'Owner'};
 let [status,d]=await get();assert.equal(status,200);assert.equal(d.me.role,'admin');assert.equal(d.stats.total,0);
 assert.equal((await post('create',leadData(),null,null,'https://evil.test'))[0],403);
 assert.equal((await post('create',{...leadData(),phone:'x'}))[0],400);
 assert.equal((await post('create',{...leadData(),registration:'invalid'}))[0],400);
 [status,d]=await post('create',{...leadData(),registration:'аб99112233'});assert.equal(status,200);const id=d.id;assert.equal(d.added,1);assert.equal((await get('?id='+id))[1].lead.registration,'АБ99112233');
 assert.equal((await post('create',leadData()))[0],409);
 assert.equal((await get('?view=today'))[1].count,1);assert.ok(!(await get('?id='+id))[1].activities.some(a=>a.note.includes('АБ99112233')));
 assert.equal((await post('member',{email:'agent@example.test',name:'Agent',role:'agent',active:true}))[0],200);
 user={userId:'stranger',email:'stranger@example.test',displayName:'Stranger'};assert.equal((await get())[0],403);
 user={userId:'agent',email:'agent@example.test',displayName:'Agent'};assert.equal((await get())[1].stats.total,0);assert.equal((await get('?id='+id))[0],404);assert.equal((await post('member',{email:'third@example.test',name:'Third',role:'admin',active:true}))[0],403);assert.equal((await post('create',leadData('88112233')))[0],403);
 user={userId:'owner-test',email:'owner@example.test',displayName:'Owner'};
 assert.equal((await post('recycle',undefined,id,1))[0],200);
 assert.equal((await post('update',leadData(),id,1))[0],409);
 for(let i=0;i<3;i++){let detail=(await get('?id='+id))[1];assert.equal(detail.lead.attempts,i);const res=await post('activity',{kind:'no_answer',note:'Attempt',next_at:new Date(Date.now()+86400000).toISOString(),next_action:'Callback'},id,detail.lead.version);assert.equal(res[0],200,JSON.stringify(res));}
 let detail=(await get('?id='+id))[1];assert.equal(detail.lead.attempts,3);assert.equal(detail.lead.next_at,null);assert.equal((await get('?view=recycle'))[1].count,0);
 assert.equal((await post('activity',{kind:'no_answer',note:'Fourth',next_at:null,next_action:''},id,detail.lead.version))[0],400);
 assert.equal((await post('activity',{kind:'message',note:'Blocked',next_at:null,next_action:''},id,detail.lead.version))[0],400);
 [status,d]=await post('create',leadData('88112233'));const second=d.id;
 detail=(await get('?id='+second))[1];const staleVersion=detail.lead.version;
 assert.equal((await post('optout',{note:'Customer opted out'},second,staleVersion))[0],200);
 assert.equal((await post('activity',{kind:'connected',note:'Stale',next_at:new Date(Date.now()+86400000).toISOString(),next_action:'Call'},second,staleVersion))[0],409);
 detail=(await get('?id='+second))[1];assert.equal(detail.lead.blocked,1);
 assert.equal((await post('activity',{kind:'message',note:'Cannot',next_at:null,next_action:''},second,detail.lead.version))[0],400);
 assert.equal((await post('activity',{kind:'note',note:'Internal',next_at:null,next_action:''},second,detail.lead.version))[0],200);
 assert.equal((await post('member',{email:'owner@example.test',name:'Owner',role:'agent',active:false}))[0],400);
 const imported=(await post('import',[leadData(),leadData('88112233'),leadData('77112233'),leadData('77112233')]))[1];assert.equal(imported.added,1);assert.equal(imported.skipped,3);
 assert.equal((await get())[1].stats.total,3);
 assert.equal(common.normalizePhone('+976 9911-2233'),'99112233');assert.throws(()=>common.normalizePhone('1234'));
 assert.deepEqual(common.parseCSV('name,phone\r\n"A,B",99112233\r\n'),[['name','phone'],['A,B','99112233']]);assert.throws(()=>common.parseCSV('"unfinished'));assert.ok(common.csvCell('=SUM(1)').startsWith('"\''));assert.equal(common.fromInput('2026-09-15T10:00'),'2026-09-15T02:00:00.000Z');
 // An old, unconnected cycle cannot be silently kept active.
 sqlite.prepare("UPDATE leads SET recycle_at='2020-01-01T00:00:00.000Z',next_at='2020-01-01T00:00:00.000Z' WHERE id=?").run(id);
 assert.equal((await get('?view=recycle'))[1].count,0);
 // Durable notices: recipient scope, idempotency, reassignment and read/alert isolation.
 const ownerUser=user;
 [status,d]=await post('create',leadData('66112233'));assert.equal(status,200);const notificationLead=d.id;
 let feed=await notifications.listNotices(user.email);assert.equal(feed.items.filter(n=>n.lead_id===notificationLead&&n.kind==='assignment').length,1);
 await notifications.refreshNotices(user.email);await notifications.refreshNotices(user.email);
 feed=await notifications.listNotices(user.email);let due=feed.items.filter(n=>n.lead_id===notificationLead&&n.kind==='due');assert.equal(due.length,1);
 assert.equal((await notice('read',[due[0].id]))[0],200);await notifications.refreshNotices(user.email);
 assert.ok((await notifications.listNotices(user.email)).items.find(n=>n.id===due[0].id).read_at);
 const before=sqlite.prepare('SELECT COUNT(*) c FROM notifications').get().c;
 assert.equal((await post('update',leadData('66112233','agent@example.test'),notificationLead,999))[0],409);
 assert.equal(sqlite.prepare('SELECT COUNT(*) c FROM notifications').get().c,before);
 detail=(await get('?id='+notificationLead))[1];
 assert.equal((await post('update',leadData('66112233','agent@example.test'),notificationLead,detail.lead.version))[0],200);
 // new_lead мэдэгдэл нь эзэмшигч (admin) рүү лидийн хариуцагчаас үл хамааран очдог тул энэ шалгалтад тооцохгүй.
 assert.equal((await notifications.listNotices(user.email)).items.filter(n=>n.lead_id===notificationLead&&n.kind!=='new_lead').length,0);
 const agentFeed=await notifications.listNotices('agent@example.test');assert.equal(agentFeed.items.length,1);const assignment=agentFeed.items[0];
 await notice('read',[assignment.id]);assert.equal((await notifications.listNotices('agent@example.test')).items[0].read_at,null);
 user={userId:'agent',email:'agent@example.test',displayName:'Agent'};
 assert.equal((await notice('refresh',undefined,'https://evil.test'))[0],403);
 const claim=(await notice('claim'))[1];assert.equal(claim.items.length,1);assert.equal((await notice('claim'))[1].items.length,0);
 assert.equal((await notifications.listNotices(user.email)).unread,1);
 await notice('refresh');assert.equal((await notifications.listNotices(user.email)).items.filter(n=>n.kind==='due').length,1);
 detail=(await get('?id='+notificationLead))[1];
 assert.equal((await post('update',{...leadData('66112233',user.email),next_at:new Date(Date.now()+86400000).toISOString()},notificationLead,detail.lead.version))[0],200);
 assert.equal((await notifications.listNotices(user.email)).items.filter(n=>n.kind==='due').length,0);
 detail=(await get('?id='+notificationLead))[1];assert.equal((await post('optout',{note:'Stop'},notificationLead,detail.lead.version))[0],200);
 assert.equal((await notifications.listNotices(user.email)).items.length,0);assert.equal((await notice('claim'))[1].items.length,0);
 user=null;assert.equal((await notice('refresh'))[0],401);user={userId:'stranger',email:'stranger@example.test',displayName:'Stranger'};assert.equal((await notice('refresh'))[0],403);user=ownerUser;
 // Зөвхөн админ хүсэлт устгана; устгасны дараа хэн ч (админ ч) дахин олж хардаггүй, статистикт орохгүй.
 const totalBefore=(await get())[1].stats.total;
 const [, deletedCreate]=await post('create',leadData('55112233'));const deletedId=deletedCreate.id;
 assert.equal((await get())[1].stats.total,totalBefore+1);
 user={userId:'agent',email:'agent@example.test',displayName:'Agent'};
 assert.equal((await post('delete',{note:'Turul'},deletedId,1))[0],404);
 const [, ownLeadCreate]=await post('create',leadData('44112233','agent@example.test'));
 assert.equal((await post('delete',{note:'Not admin'},ownLeadCreate.id,1))[0],403);
 user=ownerUser;
 assert.equal((await post('delete',{note:'cleanup'},ownLeadCreate.id,1))[0],200);
 assert.equal((await post('delete',{note:''},deletedId,1))[0],400);
 assert.equal((await post('delete',{note:'Test lead'},deletedId,999))[0],409);
 assert.equal((await post('delete',{note:'Test lead, remove'},deletedId,1))[0],200);
 assert.equal((await get('?id='+deletedId))[0],404);
 assert.equal((await get())[1].stats.total,totalBefore);
 assert.equal((await get())[1].leads.some(l=>l.id===deletedId),false);
 assert.equal((await post('delete',{note:'Again'},deletedId,2))[0],404);
 console.log('PASS: authentication, roles, ownership, origin, input validation, duplicates, optimistic locking, recycle stop, opt-out, admin-only soft delete, imports, CSV safety, timezone, expired cycles, notification ownership, durable deduplication, stale writes, reassignment, read isolation, alert claims, rescheduling and opt-out.');
})().catch(e=>{console.error(e);process.exit(1)});
