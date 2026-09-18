process.env.CRM_OWNER_EMAIL='owner@example.test';
const {DatabaseSync}=require('node:sqlite');
const ts=require('typescript');const fs=require('fs');const assert=require('node:assert/strict');
const sqlite=new DatabaseSync(':memory:');for(const p of fs.readdirSync('drizzle').filter(p=>p.endsWith('.sql')).sort())sqlite.exec(fs.readFileSync('drizzle/'+p,'utf8'));
class Statement{constructor(sql,args=[]){this.sql=sql;this.args=args;}bind(...a){return new Statement(this.sql,a)}async first(){return sqlite.prepare(this.sql).get(...this.args)||null}async all(){return {results:sqlite.prepare(this.sql).all(...this.args)}}async run(){const r=sqlite.prepare(this.sql).run(...this.args);return {meta:{changes:Number(r.changes)}}}}
const DB={prepare:s=>new Statement(s),batch:async statements=>{sqlite.exec('BEGIN');try{const r=[];for(const s of statements)r.push(await s.run());sqlite.exec('COMMIT');return r;}catch(e){sqlite.exec('ROLLBACK');throw e}}};
let user={userId:'owner-test',email:'owner@example.test',displayName:'Owner'};
const deps={'@/lib/runtime':{env:{DB}},'../app/session':{getCurrentUser:async()=>user}};
function load(path){const out=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const m={exports:{}};new Function('require','module','exports',out)(id=>deps[id]||require(id),m,m.exports);return m.exports;}
deps['./runtime']=deps['@/lib/runtime'];const access=load('lib/access.ts');deps['@/lib/access']=access;const notifications=load('lib/notifications.ts');deps['@/lib/notifications']=notifications;deps['./notifications']=notifications;const common=load('lib/crm.ts');deps['@/lib/crm']=common;const sound=load('lib/sound.ts');deps['./sound']=sound;deps['@/lib/sound']=sound;const settings=load('lib/settings.ts');deps['@/lib/settings']=settings;const sms=load('lib/sms.ts');deps['@/lib/sms']=sms;const crmRoute=load('app/api/crm/route.ts');deps['../crm/route']=crmRoute;const invRoute=load('app/api/inventory/route.ts');
async function crmGet(query=''){const r=await crmRoute.GET(new Request('https://crm.test/api/crm'+query));return [r.status,await r.json()];}
async function crmPost(action,data){const r=await crmRoute.POST(new Request('https://crm.test/api/crm',{method:'POST',headers:{Origin:'https://crm.test','Content-Type':'application/json'},body:JSON.stringify({action,data})}));return [r.status,await r.json()];}
async function invGet(query=''){const r=await invRoute.GET(new Request('https://crm.test/api/inventory'+query));return [r.status,await r.json()];}
async function invPost(action,data,id){const r=await invRoute.POST(new Request('https://crm.test/api/inventory',{method:'POST',headers:{Origin:'https://crm.test','Content-Type':'application/json'},body:JSON.stringify({action,data,id})}));return [r.status,await r.json()];}
(async()=>{
 await crmGet(); // bootstrap owner as admin
 assert.equal((await crmPost('member',{email:'agent@example.test',name:'Agent',role:'agent',active:true}))[0],200);
 assert.equal((await crmPost('member',{email:'marketing@example.test',name:'Marketing',role:'marketing',active:true}))[0],200);
 assert.equal((await crmPost('member',{email:'it@example.test',name:'IT',role:'it',active:true}))[0],200);
 // Маркетинг, IT хоёул бараа материалын системд хамааралгүй тул огт хандахгүй.
 user={userId:'m',email:'marketing@example.test',displayName:'Marketing'};
 assert.equal((await invGet())[0],403);
 user={userId:'it',email:'it@example.test',displayName:'IT'};
 assert.equal((await invGet())[0],403);
 // Агент, админ хоёул агуулах, бараа үүсгэж, орлого/зарлагыг бүрэн ашиглана.
 user={userId:'a',email:'agent@example.test',displayName:'Agent'};
 let [status,d]=await invGet('?view=warehouses');assert.equal(status,200);assert.deepEqual(d.items,[]);
 [status,d]=await invPost('create_warehouse',{name:'Урд агуулах'});assert.equal(status,200);const whId=d.id;
 assert.equal((await invPost('create_warehouse',{name:'Урд агуулах'}))[0],400); // давхардсан нэр
 [status,d]=await invPost('create_item',{code:'AME1410NW',brand:'CUCKOO',name:'CUCKOO STICK GUN',variant:'',sale_price:900000});
 assert.equal(status,200);const itemId=d.id;
 [status,d]=await invGet('?view=items&q=CUCKOO');assert.equal(status,200);assert.equal(d.count,1);assert.equal(d.items[0].id,itemId);assert.equal(d.items[0].stock,0);
 // Зарлага: үлдэгдэлгүй үед зарж болохгүй.
 assert.equal((await invPost('record_sale',{item_id:itemId,warehouse_id:whId,qty:1,unit_price:900000}))[0],400);
 // Орлого бүртгэхэд үлдэгдэл нэмэгдэнэ.
 user={userId:'owner-test',email:'owner@example.test',displayName:'Owner'};
 [status,d]=await invPost('record_purchase',{item_id:itemId,warehouse_id:whId,qty:5,unit_cost:800000,payment_status:'Төлөгдсөн'});
 assert.equal(status,200);
 [status,d]=await invGet('?view=items&id='+itemId);assert.equal(status,200);
 assert.equal(d.byWarehouse.find(w=>w.warehouse_id===whId).qty,5);assert.equal(d.moves.length,1);assert.equal(d.moves[0].qty_delta,5);
 // Одоо зарж болно, гэхдээ үлдэгдлээс их тоог зарж болохгүй.
 user={userId:'a',email:'agent@example.test',displayName:'Agent'};
 assert.equal((await invPost('record_sale',{item_id:itemId,warehouse_id:whId,qty:6,unit_price:1000000}))[0],400);
 [status,d]=await invPost('record_sale',{item_id:itemId,warehouse_id:whId,qty:2,unit_price:1000000,customer_name:'Бат',customer_phone:'99001122'});
 assert.equal(status,200);
 [status,d]=await invGet('?view=items&id='+itemId);assert.equal(d.byWarehouse.find(w=>w.warehouse_id===whId).qty,3);assert.equal(d.moves.length,2);
 [status,d]=await invGet('?view=purchases');assert.equal(status,200);assert.equal(d.count,1);assert.equal(d.items[0].item_name,'CUCKOO STICK GUN');
 [status,d]=await invGet('?view=sales');assert.equal(status,200);assert.equal(d.count,1);assert.equal(d.items[0].customer_name,'Бат');
 // Бараа мэдээлэл шинэчлэх (нэр/үнэ засах).
 [status]=await invPost('update_item',{code:'AME1410NW',brand:'CUCKOO',name:'CUCKOO STICK GUN v2',variant:'',sale_price:950000},itemId);
 assert.equal(status,200);
 [status,d]=await invGet('?view=items&id='+itemId);assert.equal(d.item.name,'CUCKOO STICK GUN v2');assert.equal(d.item.sale_price,950000);
 console.log('PASS: inventory (SKU/warehouse/stock) role isolation from marketing/IT, item CRUD, warehouse creation, purchase/sale recording with stock-level enforcement, and stock-move ledger derived balances.');
})().catch(e=>{console.error(e);process.exit(1)});
