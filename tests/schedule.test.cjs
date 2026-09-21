process.env.CRM_OWNER_EMAIL='owner@example.test';
const {DatabaseSync}=require('node:sqlite');
const ts=require('typescript');const fs=require('fs');const assert=require('node:assert/strict');
const sqlite=new DatabaseSync(':memory:');for(const p of fs.readdirSync('drizzle').filter(p=>p.endsWith('.sql')).sort())sqlite.exec(fs.readFileSync('drizzle/'+p,'utf8'));
class Statement{constructor(sql,args=[]){this.sql=sql;this.args=args;}bind(...a){return new Statement(this.sql,a)}async first(){return sqlite.prepare(this.sql).get(...this.args)||null}async all(){return {results:sqlite.prepare(this.sql).all(...this.args)}}async run(){const r=sqlite.prepare(this.sql).run(...this.args);return {meta:{changes:Number(r.changes)}}}}
const DB={prepare:s=>new Statement(s),batch:async statements=>{sqlite.exec('BEGIN');try{const r=[];for(const s of statements)r.push(await s.run());sqlite.exec('COMMIT');return r;}catch(e){sqlite.exec('ROLLBACK');throw e}}};
let user={userId:'owner-test',email:'owner@example.test',displayName:'Owner'};
const deps={'@/lib/runtime':{env:{DB}},'../app/session':{getCurrentUser:async()=>user}};
function load(path){const out=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const m={exports:{}};new Function('require','module','exports',out)(id=>deps[id]||require(id),m,m.exports);return m.exports;}
deps['./runtime']=deps['@/lib/runtime'];const access=load('lib/access.ts');deps['@/lib/access']=access;const notifications=load('lib/notifications.ts');deps['@/lib/notifications']=notifications;deps['./notifications']=notifications;const common=load('lib/crm.ts');deps['@/lib/crm']=common;const sound=load('lib/sound.ts');deps['./sound']=sound;deps['@/lib/sound']=sound;const settings=load('lib/settings.ts');deps['@/lib/settings']=settings;const sms=load('lib/sms.ts');deps['@/lib/sms']=sms;deps['./crm']=common;deps['@/lib/assign']=load('lib/assign.ts');deps['./assign']=deps['@/lib/assign'];const crmRoute=load('app/api/crm/route.ts');deps['../crm/route']=crmRoute;const route=load('app/api/schedule/route.ts');const delivRoute=load('app/api/deliveries/route.ts');
async function crmGet(q=''){const r=await crmRoute.GET(new Request('https://crm.test/api/crm'+q));return [r.status,await r.json()];}
async function crmPost(action,data){const r=await crmRoute.POST(new Request('https://crm.test/api/crm',{method:'POST',headers:{Origin:'https://crm.test','Content-Type':'application/json'},body:JSON.stringify({action,data})}));return [r.status,await r.json()];}
async function get(q=''){const r=await route.GET(new Request('https://crm.test/api/schedule'+q));return [r.status,await r.json()];}
async function post(action,data,id,version){const r=await route.POST(new Request('https://crm.test/api/schedule',{method:'POST',headers:{Origin:'https://crm.test','Content-Type':'application/json'},body:JSON.stringify({action,data,id,version})}));return [r.status,await r.json()];}
async function delivPost(action,data,id,version){const r=await delivRoute.POST(new Request('https://crm.test/api/deliveries',{method:'POST',headers:{Origin:'https://crm.test','Content-Type':'application/json'},body:JSON.stringify({action,data,id,version})}));return [r.status,await r.json()];}
const AS={userId:'a',email:'agent@example.test',displayName:'Сэлэнгэ'};
const MG={userId:'mg',email:'manager@example.test',displayName:'Manager'};
const DR={userId:'dr',email:'director@example.test',displayName:'Director'};
const OW={userId:'owner-test',email:'owner@example.test',displayName:'Owner'};
const shift=(day,person,assignment,email)=>({day,person_name:person,assignment,member_email:email??null});
(async()=>{
 await crmGet(); // owner → admin
 for(const m of [{email:'manager@example.test',name:'Manager',role:'manager'},{email:'director@example.test',name:'Director',role:'director'},{email:'agent@example.test',name:'Сэлэнгэ',role:'agent'},{email:'courier@example.test',name:'Энх Учрал',role:'delivery'}])
  assert.equal((await crmPost('member',{...m,active:true}))[0],200);
 // Хуваарь засах эрх: Админ, Удирдлага, Ахлах гурвуулаа засна; агент, хүргэгч засахгүй.
 user=AS;assert.equal((await post('set_shift',shift('2026-09-01','Б.Сэлэнгэ','Олимпик','agent@example.test')))[0],403);
 user={userId:'c',email:'courier@example.test',displayName:'Энх Учрал'};
 assert.equal((await post('set_shift',shift('2026-09-01','Б.Сэлэнгэ','Олимпик','agent@example.test')))[0],403);
 user=MG;assert.equal((await post('set_shift',shift('2026-09-01','Б.Сэлэнгэ','Олимпик','agent@example.test')))[0],200);
 user=DR;assert.equal((await post('set_shift',shift('2026-09-01','Б.Сэлэнгэ','Түмэнмолл','agent@example.test')))[0],200);
 assert.equal((await get('?month=2026-09'))[1].can_manage,true);
 user=AS;assert.equal((await get('?month=2026-09'))[1].can_manage,false);
 user=OW;assert.equal((await get('?month=2026-09'))[1].can_manage,true);
 assert.equal((await post('set_shift',shift('2026-09-01','О.Энх-Учрал','Хүргэлт','courier@example.test')))[0],200);
 assert.equal((await post('set_shift',shift('2026-09-02','О.Энх-Учрал','Хүргэлт','courier@example.test')))[0],200);
 assert.equal((await post('set_shift',shift('2026-09-03','О.Энх-Учрал','Амралт','courier@example.test')))[0],200);
 assert.equal((await post('set_shift',shift('2026-09-02','Б.Сэлэнгэ','Түмэнмолл','agent@example.test')))[0],200);
 // Буруу томилгоо, буруу огноо татгалзана.
 assert.equal((await post('set_shift',shift('2026-09-01','Б.Сэлэнгэ','Сарнай')))[0],400);
 assert.equal((await post('set_shift',shift('01/09/2026','Б.Сэлэнгэ','Олимпик')))[0],400);
 // Нэг өдөр нэг ажилтанд нэг бичлэг: дахин бичвэл шинэчлэгдэнэ, давхардахгүй.
 assert.equal((await post('set_shift',shift('2026-09-01','Б.Сэлэнгэ','Gotomarket','agent@example.test')))[0],200);
 let [status,d]=await get('?month=2026-09');assert.equal(status,200);
 assert.equal(d.shifts.filter(s=>s.day==='2026-09-01'&&s.person_name==='Б.Сэлэнгэ').length,1);
 assert.equal(d.shifts.find(s=>s.day==='2026-09-01'&&s.person_name==='Б.Сэлэнгэ').assignment,'Gotomarket');
 assert.equal(d.people.length,2);assert.equal(d.can_manage,true);
 assert.equal((await get('?month=2026'))[0],400);
 // Өдрийн харагдац: хүргэлтийн модуль ашигладаг "тэр өдрийн хүргэгчид".
 [status,d]=await get('?day=2026-09-02&assignment='+encodeURIComponent('Хүргэлт'));
 assert.equal(status,200);assert.equal(d.items.length,1);assert.equal(d.items[0].person_name,'О.Энх-Учрал');
 assert.equal((await get('?day=2026-09-03&assignment='+encodeURIComponent('Хүргэлт')))[1].items.length,0);
 // Ажилтан өөрийн нэрийг хуваарьт танина (хуваарьт "Б.Сэлэнгэ", CRM-д "Сэлэнгэ").
 user=AS;[status,d]=await get('?month=2026-09');
 assert.equal(status,200);assert.equal(d.can_manage,false);assert.deepEqual(d.me.names,['Б.Сэлэнгэ']);
 // Чөлөөний хүсэлт: зөвхөн өөрийнхөө талаар.
 assert.equal((await post('request',{kind:'leave',person_name:'О.Энх-Учрал',from_day:'2026-09-02'}))[0],403);
 assert.equal((await post('request',{kind:'leave',person_name:'Б.Сэлэнгэ',from_day:'2026-09-20'}))[0],404); // хуваарьгүй өдөр
 const leave=(await post('request',{kind:'leave',person_name:'Б.Сэлэнгэ',from_day:'2026-09-01',reason:'Эмчид'}))[1].id;
 assert.ok(leave);
 assert.equal((await post('request',{kind:'leave',person_name:'Б.Сэлэнгэ',from_day:'2026-09-01'}))[0],409); // давхар хүсэлт
 // Агент батлах эрхгүй.
 [status,d]=await get('?month=2026-09');
 let req=d.requests.find(r=>r.id===leave);
 assert.equal((await post('decide',{approve:true},leave,req.version))[0],403);
 // Удирдлага (director) батлана → тэр өдөр Чөлөө болно.
 user=DR;assert.equal((await post('decide',{approve:true},leave,req.version))[0],200);
 [status,d]=await get('?month=2026-09');
 assert.equal(d.shifts.find(s=>s.day==='2026-09-01'&&s.person_name==='Б.Сэлэнгэ').assignment,'Чөлөө');
 assert.equal(d.requests.find(r=>r.id===leave).status,'approved');
 // Шийдвэрлэгдсэн хүсэлтийг дахин шийдэхгүй.
 req=d.requests.find(r=>r.id===leave);
 assert.equal((await post('decide',{approve:false},leave,req.version))[0],409);
 // Өдөр шилжүүлэх: 09-02-ын Түмэнмолл → 09-05 (хоосон өдөр).
 user=AS;
 assert.equal((await post('request',{kind:'move',person_name:'Б.Сэлэнгэ',from_day:'2026-09-02'}))[0],400); // to_day дутуу
 assert.equal((await post('request',{kind:'move',person_name:'Б.Сэлэнгэ',from_day:'2026-09-02',to_day:'2026-09-02'}))[0],400); // ижил өдөр
 const move=(await post('request',{kind:'move',person_name:'Б.Сэлэнгэ',from_day:'2026-09-02',to_day:'2026-09-05',reason:'Гэрийн хэрэг'}))[1].id;
 [status,d]=await get('?month=2026-09');req=d.requests.find(r=>r.id===move);
 assert.equal(req.assignment,'Түмэнмолл');assert.equal(req.to_day,'2026-09-05');
 user=MG;assert.equal((await post('decide',{approve:true},move,req.version))[0],200);
 [status,d]=await get('?month=2026-09');
 assert.equal(d.shifts.find(s=>s.day==='2026-09-05'&&s.person_name==='Б.Сэлэнгэ').assignment,'Түмэнмолл');
 assert.equal(d.shifts.find(s=>s.day==='2026-09-02'&&s.person_name==='Б.Сэлэнгэ').assignment,'Чөлөө');
 // Чөлөөтэй өдрийн талаар дахин хүсэлт гаргахгүй.
 user=AS;assert.equal((await post('request',{kind:'leave',person_name:'Б.Сэлэнгэ',from_day:'2026-09-02'}))[0],400);
 // Аль хэдийн томилгоотой өдөр рүү шилжүүлэхгүй.
 user=OW;assert.equal((await post('set_shift',shift('2026-09-08','Б.Сэлэнгэ','Олимпик','agent@example.test')))[0],200);
 assert.equal((await post('set_shift',shift('2026-09-09','Б.Сэлэнгэ','Юнион','agent@example.test')))[0],200);
 user=AS;assert.equal((await post('request',{kind:'move',person_name:'Б.Сэлэнгэ',from_day:'2026-09-08',to_day:'2026-09-09'}))[0],400);
 // Хүсэлтээ өөрөө татах, бусдын хүсэлтийг татахгүй.
 const own=(await post('request',{kind:'leave',person_name:'Б.Сэлэнгэ',from_day:'2026-09-08'}))[1].id;
 [status,d]=await get('?month=2026-09');req=d.requests.find(r=>r.id===own);
 user={userId:'c',email:'courier@example.test',displayName:'Энх Учрал'};
 assert.equal((await post('cancel_request',{},own,req.version))[0],403);
 user=AS;assert.equal((await post('cancel_request',{},own,req.version))[0],200);
 assert.equal((await get('?month=2026-09'))[1].requests.find(r=>r.id===own).status,'rejected');
 // Хүргэлтийн бүртгэл хуваарьтай тулгаж анхааруулна (хоригложгүй).
 user=MG;
 const base=(o={})=>({delivered_on:'2026-09-02',kind:'24 цаг',item_info:'',customer_phone:'99112233',address:'ХУД',payment_channel:'Бэлэн',contents:'',courier_email:'courier@example.test',courier_name:'',status:'pending',note:'',...o});
 let [st,res]=await delivPost('create',base());
 assert.equal(st,200);assert.equal(res.warning||'','') ; // 09-02-нд Энх Учрал хуваарьт Хүргэлт
 [st,res]=await delivPost('create',base({delivered_on:'2026-09-03'}));
 assert.equal(st,200);assert.match(res.warning,/Амралт/); // амралттай өдөр → сануулга
 [st,res]=await delivPost('create',base({delivered_on:'2026-09-01'}));
 assert.equal(st,200);assert.equal(res.warning||'','');  // 09-01-д хуваарь байхгүй тул сануулахгүй
 user=OW;assert.equal((await post('set_shift',shift('2026-09-04','О.Энх-Учрал','Олимпик','courier@example.test')))[0],200);
 user=MG;[st,res]=await delivPost('create',base({delivered_on:'2026-09-04'}));
 assert.match(res.warning,/Олимпик/); // өөр салбарт томилогдсон → сануулга
 console.log('PASS: work schedule role permissions (admin, director and manager all edit and decide; agents and couriers read-only), one shift per person-day, assignment/month validation, self-only leave and move requests with duplicate and conflict guards, approval writing Чөлөө and moving the shift, decided-request immutability, requester-only cancellation, on-duty lookup, and delivery logging warnings when the courier is off or assigned elsewhere.');
})().catch(e=>{console.error(e);process.exit(1)});
