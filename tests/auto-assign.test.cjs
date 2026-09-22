process.env.CRM_OWNER_EMAIL='owner@example.test';
const {DatabaseSync}=require('node:sqlite');
const ts=require('typescript');const fs=require('fs');const assert=require('node:assert/strict');
const sqlite=new DatabaseSync(':memory:');for(const p of fs.readdirSync('drizzle').filter(p=>p.endsWith('.sql')).sort())sqlite.exec(fs.readFileSync('drizzle/'+p,'utf8'));
class Statement{constructor(sql,args=[]){this.sql=sql;this.args=args;}bind(...a){return new Statement(this.sql,a)}async first(){return sqlite.prepare(this.sql).get(...this.args)||null}async all(){return {results:sqlite.prepare(this.sql).all(...this.args)}}async run(){const r=sqlite.prepare(this.sql).run(...this.args);return {meta:{changes:Number(r.changes)}}}}
const DB={prepare:s=>new Statement(s),batch:async statements=>{sqlite.exec('BEGIN');try{const r=[];for(const s of statements)r.push(await s.run());sqlite.exec('COMMIT');return r;}catch(e){sqlite.exec('ROLLBACK');throw e}}};
let user={userId:'owner-test',email:'owner@example.test',displayName:'Owner'};
const deps={'@/lib/runtime':{env:{DB}},'../app/session':{getCurrentUser:async()=>user}};
function load(path){const out=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const m={exports:{}};new Function('require','module','exports',out)(id=>deps[id]||require(id),m,m.exports);return m.exports;}
deps['./runtime']=deps['@/lib/runtime'];const access=load('lib/access.ts');deps['@/lib/access']=access;const notifications=load('lib/notifications.ts');deps['@/lib/notifications']=notifications;deps['./notifications']=notifications;const common=load('lib/crm.ts');deps['@/lib/crm']=common;deps['./crm']=common;const assign=load('lib/assign.ts');deps['@/lib/assign']=assign;deps['./assign']=assign;const sound=load('lib/sound.ts');deps['./sound']=sound;deps['@/lib/sound']=sound;const settings=load('lib/settings.ts');deps['@/lib/settings']=settings;const sms=load('lib/sms.ts');deps['@/lib/sms']=sms;const model=load('lib/sheet-model.ts');deps['./sheet-model']=model;const sheets=load('lib/sheets.ts');const crmRoute=load('app/api/crm/route.ts');
async function crmGet(q=''){const r=await crmRoute.GET(new Request('https://crm.test/api/crm'+q));return [r.status,await r.json()];}
async function crmPost(action,data,id,version){const r=await crmRoute.POST(new Request('https://crm.test/api/crm',{method:'POST',headers:{Origin:'https://crm.test','Content-Type':'application/json'},body:JSON.stringify({action,data,id,version})}));return [r.status,await r.json()];}
const today=assign.ubDay();
const shiftRow=(email,person,a)=>sqlite.prepare('INSERT INTO work_shifts(id,day,member_email,person_name,assignment,note,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)')
 .run(crypto.randomUUID(),today,email,person,a,'','test',new Date().toISOString(),new Date().toISOString());
// Хариуцагч хүлээж буй хүсэлтийг шууд базад бичнэ (Sheets-ээс ирсэнтэй ижил хэлбэр).
let seq=0;
const waitingLead=(createdAt)=>{const id='sheet-w'+(++seq);sqlite.prepare("INSERT INTO leads(id,name,phone,product,source,owner,status,next_at,next_action,created_at,updated_at,op) VALUES(?,?,?,?,?,'__sheet_unassigned__','new',NULL,'Ажилтантай холбох хүлээлт',?,?,?)")
 .run(id,'Зээлийн хүсэлт','99'+String(100000+seq),'Хүсэлт','Google Sheets',createdAt,createdAt,crypto.randomUUID());
 sqlite.prepare('INSERT INTO sheet_links(external_key,lead_id,row_number,owner_label,owner_email,updated_at) VALUES(?,?,?,?,?,?)').run('k'+seq,id,seq,'',' __sheet_unassigned__',createdAt);
 return id;};
const ownerOf=(id)=>sqlite.prepare('SELECT owner FROM leads WHERE id=?').get(id).owner;
(async()=>{
 await crmGet(); // owner → admin
 for(const m of [{email:'op@example.test',name:'Operator',role:'operator'},{email:'m1@example.test',name:'Manager',role:'manager'},{email:'a1@example.test',name:'Агент Нэг',role:'agent'},{email:'a2@example.test',name:'Агент Хоёр',role:'agent'},{email:'a3@example.test',name:'Агент Гурав',role:'agent'},{email:'c1@example.test',name:'Хүргэгч',role:'delivery'}])
  assert.equal((await crmPost('member',{...m,active:true}))[0],200);

 // Хуваарьт хэн ч байхгүй үед хуваарилахгүй — хүсэлт хүлээсэн хэвээр.
 shiftRow('op@example.test','Operator','Олимпик');
 const first=waitingLead(new Date().toISOString());
 assert.equal((await crmPost('assign',{owner:'op@example.test'},first,1))[0],400);
 assert.equal(ownerOf(first),'__sheet_unassigned__');
 let [status,d]=await crmPost('auto_assign',{});
 assert.equal(status,400);assert.match(d.error,/хуваарьт байгаа борлуулалтын ажилтан байхгүй/);
 assert.equal(ownerOf(first),'__sheet_unassigned__');

 // Өнөөдрийн хуваарь: a1, a2 ажиллаж байна; a3 амарч, хүргэгч Хүргэлтэд, ахлах Олимпикт.
 shiftRow('a1@example.test','Агент Нэг','Түмэнмолл');
 shiftRow('a2@example.test','Агент Хоёр','Олимпик');
 shiftRow('a3@example.test','Агент Гурав','Амралт');
 shiftRow('c1@example.test','Хүргэгч','Хүргэлт');
 shiftRow('m1@example.test','Manager','Олимпик');
 const roster=await assign.dutyRoster(today);
 assert.deepEqual(roster.map(r=>r.email).sort(),['a1@example.test','a2@example.test']); // амралттай, хүргэгч, ахлах орохгүй

 // Агент, хүргэгч хуваарилах эрхгүй; ахлах, админ эрхтэй.
 user={userId:'a1',email:'a1@example.test',displayName:'Агент Нэг'};
 assert.equal((await crmPost('auto_assign',{}))[0],403);
 user={userId:'c1',email:'c1@example.test',displayName:'Хүргэгч'};
 assert.equal((await crmPost('auto_assign',{}))[0],403);

 // Ахлах дарахад ажиллаж байгаа хоёр агентад тэнцвэртэй тарна.
 for(let i=0;i<5;i++)waitingLead(new Date().toISOString());
 user={userId:'m1',email:'m1@example.test',displayName:'Manager'};
 [status,d]=await crmPost('auto_assign',{});
 assert.equal(status,200);assert.equal(d.assigned,6);assert.equal(d.roster,2);
 assert.deepEqual(Object.keys(d.byOwner).sort(),['a1@example.test','a2@example.test']);
 assert.equal(d.byOwner['a1@example.test'],3);assert.equal(d.byOwner['a2@example.test'],3); // тэгш хуваагдав
 assert.equal(ownerOf(first),'a1@example.test'); // хамгийн эртний нь эхэлж хуваарилагдана

 // Хуваарилагдсан хүсэлт ажиллах төлөвт орж, аудит бичлэг үлдэнэ.
 const lead=sqlite.prepare('SELECT * FROM leads WHERE id=?').get(first);
 assert.ok(lead.next_at);assert.equal(lead.next_action,'Хуваарилагдсан • Эхний дуудлага');
 assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM activities WHERE lead_id=? AND kind='auto_assign'").get(first).n,1);
 assert.match(sqlite.prepare("SELECT note FROM activities WHERE lead_id=? AND kind='auto_assign'").get(first).note,/Агент Нэг/);
 // Sheet холбоос ч шинэчлэгдэнэ — дараагийн sync буцааж хуваарилаагүй болгохгүй.
 assert.equal(sqlite.prepare('SELECT owner_email FROM sheet_links WHERE lead_id=?').get(first).owner_email,'a1@example.test');

 // Дахин дарахад хуваарилах зүйл алга.
 [status,d]=await crmPost('auto_assign',{});
 assert.equal(status,200);assert.equal(d.assigned,0);

 // Өнөөдөр аль хэдийн ачаалалтай агент дараалалд хойш тавигдана.
 const before=await assign.dutyRoster(today);
 assert.equal(before.find(r=>r.email==='a1@example.test').today,3);
 sqlite.prepare("INSERT INTO leads(id,name,phone,product,source,owner,status,next_action,created_at,updated_at,op) VALUES('extra','x','99000001','p','s','a1@example.test','new','',?,?,?)").run(new Date().toISOString(),new Date().toISOString(),crypto.randomUUID());
 const after=await assign.dutyRoster(today);
 assert.equal(after[0].email,'a2@example.test'); // бага ачаалалтай нь дараалалд тэргүүлнэ
 const one=waitingLead(new Date().toISOString());
 [status,d]=await crmPost('auto_assign',{});
 assert.equal(d.assigned,1);assert.equal(ownerOf(one),'a2@example.test');

 // Хуучин овоог хөдөлгөхгүй: 7 хоногийн цонхноос гадуурх хүсэлт хүлээсэн хэвээр.
 const old=waitingLead(new Date(Date.now()-20*86400000).toISOString());
 [status,d]=await crmPost('auto_assign',{});
 assert.equal(d.assigned,0);assert.equal(ownerOf(old),'__sheet_unassigned__');
 // Хугацааны цонхыг өргөтгөвөл тэр хүсэлт ч хуваарилагдана.
 [status,d]=await crmPost('auto_assign',{days:30});
 assert.equal(d.assigned,1);assert.notEqual(ownerOf(old),'__sheet_unassigned__');
 assert.equal((await crmPost('auto_assign',{days:99}))[0],400); // цонх 30 хоногоор хязгаарлагдана

 // Дахин холбогдохгүй (suppression) дугаарыг хуваарилахгүй.
 const blocked=waitingLead(new Date().toISOString());
 const phone=sqlite.prepare('SELECT phone FROM leads WHERE id=?').get(blocked).phone;
 sqlite.prepare("INSERT INTO suppressions(phone,reason,actor,created_at) VALUES(?,'test','test',?)").run(phone,new Date().toISOString());
 [status,d]=await crmPost('auto_assign',{});
 assert.equal(d.assigned,0);assert.equal(ownerOf(blocked),'__sheet_unassigned__');
 // РЕГРЕССИ: Sheets sync ухаалгаар оноосон хариуцагчийг буцааж "хуваарилаагүй" болгохгүй, харин
 // Sheet-д бодит ажилтны нэр байсаад таарахаа болих юм бол хуучин зан төлөвөөр хуваарилалт цуцлагдана.
 sqlite.prepare('INSERT INTO sheet_connection(id,config,enabled,lease,lease_until) VALUES(1,?,1,?,?)')
  .run(JSON.stringify(model.defaults),'L',Date.now()+600000);
 const row=(owner,ownerEmail)=>({identity:'row-1',phone:'99887766',product:'Зээл',status:'new',owner,ownerEmail,created:new Date().toISOString(),registration:'',row:2});
 // 1. Sheet-д ажилтан заагаагүй → ухаалгаар оноогдоно.
 let out=await sheets.applyRows([row('','')],[],'L',1);
 assert.equal(out.added,1);
 const synced=sqlite.prepare("SELECT * FROM leads WHERE phone='99887766'").get();
 assert.ok(['a1@example.test','a2@example.test'].includes(synced.owner),'ухаалгаар оноох');
 assert.equal(sqlite.prepare('SELECT auto_assigned FROM sheet_links WHERE lead_id=?').get(synced.id).auto_assigned,1);
 const autoOwner=synced.owner;
 // 2. Дахин sync — Sheet хоосон хэвээр ч хариуцагч хадгалагдана.
 sqlite.prepare('UPDATE sheet_connection SET last_at=NULL').run();
 await sheets.applyRows([row('','')],[],'L',1);
 assert.equal(sqlite.prepare('SELECT owner FROM leads WHERE id=?').get(synced.id).owner,autoOwner,'sync буцаахгүй');
 // 3. Sheet-д бодит ажилтан бичигдвэл түүнд шилжиж, ухаалаг тэмдэг арилна.
 await sheets.applyRows([row('Агент Гурав','a3@example.test')],[],'L',1);
 assert.equal(sqlite.prepare('SELECT owner FROM leads WHERE id=?').get(synced.id).owner,'a3@example.test');
 assert.equal(sqlite.prepare('SELECT auto_assigned FROM sheet_links WHERE lead_id=?').get(synced.id).auto_assigned,0);
 // 4. Дараа нь нэр танихгүй болбол хуучин зан төлөвөөр хуваарилалт цуцлагдана.
 await sheets.applyRows([row('Тодорхойгүй хүн','')],[],'L',1);
 assert.equal(sqlite.prepare('SELECT owner FROM leads WHERE id=?').get(synced.id).owner,'__sheet_unassigned__');
 // Explicit Sheets mappings to an operator must also be rejected at sync time.
 await sheets.applyRows([row('Operator','op@example.test')],[],'L',1);
 assert.equal(sqlite.prepare('SELECT owner FROM leads WHERE id=?').get(synced.id).owner,'__sheet_unassigned__');
 user={userId:'op',email:'op@example.test',displayName:'Operator'};
 assert.equal((await crmGet('?id='+first))[0],200);
 assert.equal((await crmPost('auto_assign',{}))[0],403);
 assert.equal((await crmPost('bulk_recycle',{}))[0],403);
 assert.equal((await crmPost('member',{email:'op@example.test',name:'Operator',role:'admin',active:true}))[0],403);

 const settingsRoute=load('app/api/settings/route.ts');
 const saveConfig=async config=>{const response=await settingsRoute.POST(new Request('https://crm.test/api/settings',{method:'POST',headers:{Origin:'https://crm.test','Content-Type':'application/json'},body:JSON.stringify({auto_assignment:config})}));return [response.status,await response.json()];};
 const defaults=common.defaultAssignmentSettings;
 assert.equal((await saveConfig({...defaults,enabled:false}))[0],403,'operator cannot configure');
 user={userId:'owner-test',email:'owner@example.test',displayName:'Owner'};
 assert.equal((await saveConfig({...defaults,days:31}))[0],400);
 assert.equal((await saveConfig({...defaults,assignments:['Амралт']}))[0],400);
 assert.equal((await saveConfig({...defaults,enabled:false}))[0],200);
 const disabled=waitingLead(new Date().toISOString());assert.equal((await crmPost('auto_assign',{}))[0],409);assert.equal(ownerOf(disabled),'__sheet_unassigned__');
 const offRow={...row('',''),identity:'off-import',phone:'99119911'};
 await sheets.applyRows([offRow],[],'L',1);assert.equal(sqlite.prepare('SELECT owner FROM leads WHERE phone=?').get(offRow.phone).owner,'__sheet_unassigned__');
 assert.equal((await saveConfig({...defaults,automatic:false,assignments:['Олимпик']}))[0],200);
 assert.deepEqual((await assign.dutyRoster(today)).map(r=>r.email),['a2@example.test']);
 const manualOnly={...row('',''),identity:'manual-only',phone:'99119912'};await sheets.applyRows([manualOnly],[],'L',1);assert.equal(sqlite.prepare('SELECT owner FROM leads WHERE phone=?').get(manualOnly.phone).owner,'__sheet_unassigned__');
 assert.equal((await crmPost('auto_assign',{}))[0],200);assert.equal(ownerOf(disabled),'a2@example.test');
 assert.equal((await saveConfig({...defaults,excluded_emails:['a2@example.test']}))[0],200);
 assert.deepEqual((await assign.dutyRoster(today)).map(r=>r.email),['a1@example.test']);
 const newAuto={...row('',''),identity:'enabled-import',phone:'99119913'};await sheets.applyRows([newAuto],[],'L',1);assert.equal(sqlite.prepare('SELECT owner FROM leads WHERE phone=?').get(newAuto.phone).owner,'a1@example.test');
 await saveConfig({...defaults,enabled:false});await sheets.applyRows([newAuto],[],'L',1);assert.equal(sqlite.prepare('SELECT owner FROM leads WHERE phone=?').get(newAuto.phone).owner,'a1@example.test','disable preserves ownership');
 await saveConfig({...defaults,days:1});const pastLead=waitingLead(new Date(Date.now()-3*86400000).toISOString());const closedLead=waitingLead(new Date().toISOString());sqlite.prepare("UPDATE leads SET status='won' WHERE id=?").run(closedLead);
 await crmPost('auto_assign',{});assert.equal(ownerOf(pastLead),'__sheet_unassigned__');assert.equal(ownerOf(closedLead),'__sheet_unassigned__');
 await saveConfig({...defaults,days:7});await crmPost('auto_assign',{});assert.notEqual(ownerOf(pastLead),'__sheet_unassigned__');assert.equal(ownerOf(closedLead),'__sheet_unassigned__');

 // Draft previews are read-only, share actual waiting scope, and respect access controls.
 for(let i=0;i<5;i++)waitingLead(new Date().toISOString());
 const settingBefore=sqlite.prepare("SELECT value FROM app_settings WHERE key='auto_assignment'").get().value;
 const ownersBefore=sqlite.prepare('SELECT id,owner,version FROM leads ORDER BY id').all();
 const previewRequest=async(config,extra={})=>{const response=await settingsRoute.POST(new Request('https://crm.test/api/settings',{method:'POST',headers:{Origin:'https://crm.test','Content-Type':'application/json'},body:JSON.stringify({preview_assignment:config,...extra})}));return [response.status,await response.json()];};
 const [previewStatus,preview]=await previewRequest(defaults);assert.equal(previewStatus,200);assert.equal(preview.eligible,2);assert.ok(preview.waiting>=5);assert.equal(preview.assigned,Math.min(preview.waiting,200));assert.equal(preview.staff.reduce((n,p)=>n+p.planned,0),preview.assigned);
 assert.ok(preview.staff.find(p=>p.email==='a3@example.test').reason.includes('Амралт'));assert.ok(!preview.staff.some(p=>p.email==='op@example.test'));
 const excludedPreview=(await previewRequest({...defaults,excluded_emails:['a1@example.test']}))[1];assert.equal(excludedPreview.eligible,1);assert.equal(excludedPreview.staff.find(p=>p.email==='a2@example.test').planned,excludedPreview.assigned);
 assert.equal((await previewRequest({...defaults,enabled:false}))[1].assigned,0);
 assert.equal((await previewRequest({...defaults,assignments:['Gotomarket']}))[1].eligible,0);
 assert.equal((await previewRequest(defaults,{auto_assignment:{...defaults,enabled:false}}))[0],400,'preview cannot also save');
 assert.equal(sqlite.prepare("SELECT value FROM app_settings WHERE key='auto_assignment'").get().value,settingBefore);assert.deepEqual(sqlite.prepare('SELECT id,owner,version FROM leads ORDER BY id').all(),ownersBefore);
 user={userId:'op',email:'op@example.test',displayName:'Operator'};assert.equal((await previewRequest(defaults))[0],403);
 console.log('PASS: smart lead assignment — duty roster limited to active sales agents scheduled to work that day (days off, couriers and managers excluded), even round-robin weighted by leads already received today, manager/director/admin-only trigger, assigned leads becoming actionable with an auto_assign audit trail, sheet_links kept in step so a later sync cannot revert the owner, the recent-only window protecting the historical backlog, suppressed numbers skipped, and a sync round-trip that keeps an auto-assigned owner while still unassigning a lead whose named sheet owner stops matching an employee.');
})().catch(e=>{console.error(e);process.exit(1)});
