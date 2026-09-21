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
deps['./runtime']=deps['@/lib/runtime'];const access=load('lib/access.ts');deps['@/lib/access']=access;const notifications=load('lib/notifications.ts');deps['@/lib/notifications']=notifications;deps['./notifications']=notifications;const common=load('lib/crm.ts');deps['@/lib/serials']=load('lib/serials.ts');deps['./serials']=deps['@/lib/serials'];deps['@/lib/crm']=common;const sound=load('lib/sound.ts');deps['./sound']=sound;deps['@/lib/sound']=sound;const settings=load('lib/settings.ts');deps['@/lib/settings']=settings;const sms=load('lib/sms.ts');deps['@/lib/sms']=sms;deps['./crm']=common;deps['@/lib/assign']=load('lib/assign.ts');deps['./assign']=deps['@/lib/assign'];const crmRoute=load('app/api/crm/route.ts');deps['../crm/route']=crmRoute;deps['@/lib/inventory']=load('lib/inventory.ts');const invRoute=load('app/api/inventory/route.ts');
async function crmGet(query=''){const r=await crmRoute.GET(new Request('https://crm.test/api/crm'+query));return [r.status,await r.json()];}
async function crmPost(action,data){const r=await crmRoute.POST(new Request('https://crm.test/api/crm',{method:'POST',headers:{Origin:'https://crm.test','Content-Type':'application/json'},body:JSON.stringify({action,data})}));return [r.status,await r.json()];}
async function invGet(query=''){const r=await invRoute.GET(new Request('https://crm.test/api/inventory'+query));return [r.status,await r.json()];}
async function invPost(action,data,id,request_id){const r=await invRoute.POST(new Request('https://crm.test/api/inventory',{method:'POST',headers:{Origin:'https://crm.test','Content-Type':'application/json'},body:JSON.stringify({action,data,id,request_id})}));return [r.status,await r.json()];}
(async()=>{
 await crmGet(); // bootstrap owner as admin
 assert.equal((await crmPost('member',{email:'agent@example.test',name:'Agent',role:'agent',active:true}))[0],200);
 assert.equal((await crmPost('member',{email:'marketing@example.test',name:'Marketing',role:'marketing',active:true}))[0],200);
 assert.equal((await crmPost('member',{email:'it@example.test',name:'IT',role:'it',active:true}))[0],200);
 for(const role of ['manager','director'])assert.equal((await crmPost('member',{email:role+'@example.test',name:role,role,active:true}))[0],200);
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
 assert.equal((await invPost('record_sale',{item_id:itemId,warehouse_id:whId,qty:1,unit_price:900000}))[0],409);
 // Орлого бүртгэхэд үлдэгдэл нэмэгдэнэ.
 user={userId:'owner-test',email:'owner@example.test',displayName:'Owner'};
 [status,d]=await invPost('record_purchase',{item_id:itemId,warehouse_id:whId,qty:5,unit_cost:800000,payment_status:'Төлөгдсөн'});
 assert.equal(status,200);
 [status,d]=await invGet('?view=items&id='+itemId);assert.equal(status,200);
 assert.equal(d.byWarehouse.find(w=>w.warehouse_id===whId).qty,5);assert.equal(d.moves.length,1);assert.equal(d.moves[0].qty_delta,5);
 // Одоо зарж болно, гэхдээ үлдэгдлээс их тоог зарж болохгүй.
 user={userId:'a',email:'agent@example.test',displayName:'Agent'};
 assert.equal((await invPost('record_sale',{item_id:itemId,warehouse_id:whId,qty:6,unit_price:1000000}))[0],409);
 [status,d]=await invPost('record_sale',{item_id:itemId,warehouse_id:whId,qty:2,unit_price:1000000,customer_name:'Бат',customer_phone:'99001122'});
 assert.equal(status,200);
 [status,d]=await invGet('?view=items&id='+itemId);assert.equal(d.byWarehouse.find(w=>w.warehouse_id===whId).qty,3);assert.equal(d.moves.length,2);
 [status,d]=await invGet('?view=purchases');assert.equal(status,200);assert.equal(d.count,1);assert.equal(d.items[0].item_name,'CUCKOO STICK GUN');
 [status,d]=await invGet('?view=sales');assert.equal(status,200);assert.equal(d.count,1);assert.equal(d.items[0].customer_name,'Бат');
 // Only admin and manager may edit existing items, including direct API requests.
 const edit={code:'AME1410NW',brand:'CUCKOO',name:'CUCKOO STICK GUN v2',variant:'',sale_price:950000};
 for(const role of ['admin','manager','director','agent','marketing','it']){
  user=role==='admin'?{userId:'owner-test',email:'owner@example.test',displayName:'Owner'}:{userId:({agent:'a',marketing:'m',it:'it'})[role]||role,email:role+'@example.test',displayName:role};
  const before=sqlite.prepare('SELECT * FROM inventory_items WHERE id=?').get(itemId);
  const requestsBefore=sqlite.prepare('SELECT COUNT(*) n FROM inventory_requests').get().n;
  const allowed=role==='admin'||role==='manager';
  assert.equal(common.canEditInventoryItem(role),allowed);
  [status]=await invPost('update_item',{...edit,name:edit.name+' '+role},itemId,crypto.randomUUID());
  assert.equal(status,allowed?200:403,role+' edit permission');
  const after=sqlite.prepare('SELECT * FROM inventory_items WHERE id=?').get(itemId);
  if(allowed){assert.equal(after.name,edit.name+' '+role);assert.equal(after.sale_price,950000);}
  else{assert.deepEqual(after,before,'Denied edit must not change the item');assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM inventory_requests').get().n,requestsBefore);}
 }
 assert.equal(common.canEditInventoryItem('unknown'),false);
 // A role downgrade must be checked before returning a cached successful request.
 user={userId:'manager',email:'manager@example.test',displayName:'Manager'};
 const editRequest=crypto.randomUUID();
 assert.equal((await invPost('update_item',edit,itemId,editRequest))[0],200);
 sqlite.prepare("UPDATE members SET role='agent' WHERE email=?").run(user.email);
 const beforeReplay=sqlite.prepare('SELECT * FROM inventory_items WHERE id=?').get(itemId);
 assert.equal((await invPost('update_item',edit,itemId,editRequest))[0],403);
 assert.deepEqual(sqlite.prepare('SELECT * FROM inventory_items WHERE id=?').get(itemId),beforeReplay);
 assert.equal((await invGet('?view=items&id='+itemId))[0],200,'Agent may still view inventory');
 // Reports aggregate all matching rows, independently of the product list page.
 user={userId:'owner-test',email:'owner@example.test',displayName:'Owner'};
 for(let i=0;i<51;i++){
  const created=await invPost('create_item',{code:'REPORT-'+i,name:'Report item '+i,brand:i%2?'Brand B':'Brand A',supplier:'Report Vendor',category:i%2?'Чихэвч':'Гар утас'});
  assert.equal(created[0],200);
  assert.equal((await invPost('record_purchase',{item_id:created[1].id,warehouse_id:whId,qty:2,unit_cost:10,status:'received',received_at:'2026-09-21T01:00:00.000Z'}))[0],200);
  if(i===0)assert.equal((await invPost('record_sale',{item_id:created[1].id,warehouse_id:whId,qty:1,unit_price:20,sold_at:'2026-09-21T02:00:00.000Z'}))[0],200);
 }
 const vendor='supplier=Report%20Vendor';
 [status,d]=await invGet('?view=items&'+vendor);assert.equal(status,200);assert.equal(d.items.length,50);assert.equal(d.count,51);
 [status,d]=await invGet('?view=items&group=supplier&'+vendor+'&page=2');assert.equal(status,200);assert.equal(d.groups.length,1);assert.equal(d.groups[0].item_count,51);assert.equal(d.groups[0].stock,101);assert.equal(d.groups[0].value_cents,101000);
 [status,d]=await invGet('?view=items&group=brand&'+vendor+'&brand=Brand%20A');assert.equal(d.groups.length,1);assert.equal(d.groups[0].item_count,26);assert.equal(d.groups[0].stock,51);
 [status,d]=await invGet('?view=balance&group=supplier&'+vendor+'&from=2026-09-21&to=2026-09-21');assert.equal(d.groups[0].opening_qty,0);assert.equal(d.groups[0].in_qty,102);assert.equal(d.groups[0].out_qty,1);assert.equal(d.groups[0].stock,101);
 [status,d]=await invGet('?view=sales&group=supplier&'+vendor+'&from=2026-09-21&to=2026-09-21');assert.equal(d.groups.length,1);assert.equal(d.groups[0].revenue_cents,2000);assert.equal(d.groups[0].value_cents,1000);assert.equal(d.groups[0].profit_cents,1000);
 [status,d]=await invGet('?view=sales&group=brand&'+vendor+'&from=2026-09-22&to=2026-09-22');assert.equal(d.groups.length,0);
 [status,d]=await invGet('?view=items&group=supplier&'+vendor+'&warehouse_id=missing');assert.equal(d.groups[0].stock,0);
 [status,d]=await invGet('?view=options');assert.ok(d.suppliers.some(s=>s.supplier==='Report Vendor'));assert.ok(d.brands.some(b=>b.brand==='Brand A'));
 [status,d]=await invGet('?view=items&group=category&'+vendor);assert.equal(status,200);assert.equal(d.groups.length,2);assert.equal(d.groups.reduce((n,g)=>n+g.item_count,0),51);
 const phoneCategory='&category='+encodeURIComponent('Гар утас');
 [status,d]=await invGet('?view=items&'+vendor+phoneCategory);assert.equal(d.count,26);assert.ok(d.items.every(i=>i.category==='Гар утас'));
 [status,d]=await invGet('?view=balance&group=category&'+vendor+phoneCategory+'&from=2026-09-21&to=2026-09-21');assert.equal(d.groups[0].stock,51);
 [status,d]=await invGet('?view=sales&group=category&'+vendor+phoneCategory);assert.equal(d.groups[0].revenue_cents,2000);
 [status,d]=await invGet('?view=options');assert.ok(d.categories.some(c=>c.category==='Гар утас'));
 for(const supplier of ['Yuna','solar','mike','khangai'])assert.equal((await invPost('create_item',{code:'BAD-'+supplier,name:'Invalid brand',brand:supplier}))[0],400);
 const categorized=await invPost('create_item',{code:'CATEGORY',name:'Test phone',brand:'Apple',supplier:'Mike',category:'Гар утас'});assert.equal(categorized[0],200);
 assert.equal((await invPost('update_item',{code:'CATEGORY',name:'Test phone',brand:'Apple',supplier:'Mike'},categorized[1].id))[0],200);
 assert.equal((await invGet('?view=items&id='+categorized[1].id))[1].item.category,'Гар утас','Old clients preserve category');
 assert.equal((await invPost('update_item',{code:'CATEGORY',name:'Test phone',brand:'Apple',supplier:'Mike',category:''},categorized[1].id))[0],200);
 assert.equal((await invGet('?view=items&id='+categorized[1].id))[1].item.category,'');
 console.log('PASS: separate supplier/brand filters; grouped stock, date balances and sales cents aggregate across all pages.');
 const priced=await invPost('create_item',{code:'DUAL-PRICE',name:'Dual price',sale_price:1000,cash_price:800});assert.equal(priced[0],200);
 assert.equal((await invGet('?view=items&id='+priced[1].id))[1].item.cash_price,800);
 assert.equal((await invPost('update_item',{code:'DUAL-PRICE',name:'Dual price',sale_price:1100},priced[1].id))[0],200);
 assert.equal((await invGet('?view=items&id='+priced[1].id))[1].item.cash_price,800,'Old clients must preserve cash price');
 assert.equal((await invPost('update_item',{code:'DUAL-PRICE',name:'Dual price',sale_price:700},priced[1].id))[0],400);
 assert.equal((await invPost('update_item',{code:'DUAL-PRICE',name:'Dual price',sale_price:1100,cash_price:1200},priced[1].id))[0],400);
 assert.equal((await invPost('update_item',{code:'DUAL-PRICE',name:'Dual price',sale_price:1100,cash_price:null},priced[1].id))[0],200);
 assert.equal((await invGet('?view=items&id='+priced[1].id))[1].item.cash_price,null);
 console.log('PASS: inventory role isolation, admin/manager-only item edits, denied-edit immutability, revoked-role request replay, item creation, purchases/sales and stock enforcement.');
})().catch(e=>{console.error(e);process.exit(1)});
