const {DatabaseSync}=require('node:sqlite');
const ts=require('typescript'),fs=require('node:fs'),assert=require('node:assert/strict');
const sqlite=new DatabaseSync(':memory:');
for(const file of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sqlite.exec(fs.readFileSync('drizzle/'+file,'utf8'));
class Statement{constructor(sql,args=[]){this.sql=sql;this.args=args;}bind(...args){return new Statement(this.sql,args);}async first(){return sqlite.prepare(this.sql).get(...this.args)||null;}async all(){return {results:sqlite.prepare(this.sql).all(...this.args)};}}
class Failure extends Error{constructor(message,status){super(message);this.status=status;}}
let current;
const deps={'@/lib/runtime':{env:{DB:{prepare:sql=>new Statement(sql)}}},'@/lib/access':{Failure,member:async()=>{if(!current)throw new Failure('Sign in',401);return current;}}};
function load(path){const code=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;const m={exports:{}};new Function('require','module','exports',code)(id=>deps[id]||require(id),m,m.exports);return m.exports;}
deps['@/lib/crm']=load('lib/crm.ts');const route=load('app/api/dashboard/route.ts');
async function get(query=''){const r=await route.GET(new Request('https://crm.test/api/dashboard'+query));return [r.status,await r.json()];}
const day=new Date(Date.now()+8*3600000).toISOString().slice(0,10),start=new Date(day+'T00:00:00+08:00').toISOString(),tomorrow=new Date(Date.parse(start)+86400000).toISOString(),yesterday=new Date(Date.parse(start)-86400000).toISOString();
function task(role,id,owner,due,status='planned'){const table=role==='it'?'it_tasks':'marketing_tasks',field=role==='it'?'system_area':'channel';sqlite.prepare(`INSERT INTO ${table}(id,title,${field},owner,status,due_at,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)`).run(id,id,'Test',owner,status,due,'admin',start,start);}
(async()=>{
 assert.equal((await get())[0],401);
 for(const role of ['it','marketing']){
  const email=role+'@test.mn';current={email,name:role,role};
  for(let i=0;i<21;i++)task(role,role+'-'+i,email,start);
  task(role,role+'-late',email,yesterday);task(role,role+'-future',email,tomorrow);task(role,role+'-done',email,start,'done');task(role,role+'-cancel',email,start,'cancelled');task(role,role+'-undated',email,null);task(role,role+'-other','other@test.mn',start);
  sqlite.prepare('INSERT INTO work_shifts(id,day,member_email,person_name,assignment,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(role,day,email,role,'Test shift','admin',start,start);
  const [status,d]=await get('?owner=other@test.mn&role=admin');assert.equal(status,200);assert.equal(d.count,22);assert.equal(d.summary.overdue,1);assert.equal(d.summary.unscheduled,1);assert.equal(d.items.length,20);assert.equal(d.items[0].id,role+'-late');assert.equal(d.shift.length,1);
  const second=(await get('?page=2'))[1];assert.equal(second.items.length,2);assert.equal(new Set([...d.items,...second.items].map(r=>r.id)).size,22);assert.ok(!JSON.stringify(d).includes(role+'-other'));
 }
 const courier='delivery@test.mn';current={email:courier,name:'Courier',role:'delivery'};
 const insert=sqlite.prepare('INSERT INTO deliveries(id,delivered_on,courier_email,courier_name,status,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)');
 for(const [id,email,name,status,date] of [['mine',courier,'Courier','pending',day],['legacy',null,'Courier','pending',day],['other','other@test.mn','Other','pending',day],['closed',courier,'Courier','delivered',day],['future',courier,'Courier','pending',tomorrow.slice(0,10)==day?new Date(Date.parse(tomorrow)+8*3600000).toISOString().slice(0,10):tomorrow.slice(0,10)]])insert.run(id,date,email,name,status,'admin',start,start);
 const d=(await get())[1];assert.equal(d.count,2);assert.deepEqual(d.items.map(t=>t.id).sort(),['legacy','mine']);assert.equal(d.shift.length,0);
 for(const role of ['agent','manager','admin','director']){current={email:role+'@test.mn',name:role,role};const d=(await get())[1];assert.deepEqual(d.items,[]);assert.equal(d.summary,null);}
 console.log('PASS: dashboard authentication, own-task and courier isolation, ignored role/owner spoofing, UB day boundaries, overdue/open work, unscheduled count, pagination and shift privacy.');
})().catch(e=>{console.error(e);process.exit(1);});
