process.env.CRM_OWNER_EMAIL='owner@example.test';
const {DatabaseSync}=require('node:sqlite');
const ts=require('typescript');const fs=require('fs');const assert=require('node:assert/strict');
const sqlite=new DatabaseSync(':memory:');for(const p of fs.readdirSync('drizzle').filter(p=>p.endsWith('.sql')).sort())sqlite.exec(fs.readFileSync('drizzle/'+p,'utf8'));
class Statement{constructor(sql,args=[]){this.sql=sql;this.args=args;}bind(...a){return new Statement(this.sql,a)}async first(){return sqlite.prepare(this.sql).get(...this.args)||null}async all(){return {results:sqlite.prepare(this.sql).all(...this.args)}}async run(){const r=sqlite.prepare(this.sql).run(...this.args);return {meta:{changes:Number(r.changes)}}}}
const DB={prepare:s=>new Statement(s),batch:async statements=>{sqlite.exec('BEGIN');try{const r=[];for(const s of statements)r.push(await s.run());sqlite.exec('COMMIT');return r;}catch(e){sqlite.exec('ROLLBACK');throw e}}};
let transactionQueue=Promise.resolve();
DB.transaction=work=>{const result=transactionQueue.then(async()=>{sqlite.exec('BEGIN IMMEDIATE');try{const value=await work({prepare:DB.prepare,batch:async statements=>{const out=[];for(const stmt of statements)out.push(await stmt.run());return out;}});sqlite.exec('COMMIT');return value;}catch(e){sqlite.exec('ROLLBACK');throw e;}});transactionQueue=result.catch(()=>{});return result;};
let user={userId:'owner-test',email:'owner@example.test',displayName:'Owner'};
const deps={'@/lib/runtime':{env:{DB}},'../app/session':{getCurrentUser:async()=>user}};
function load(path){const out=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const m={exports:{}};new Function('require','module','exports',out)(id=>deps[id]||require(id),m,m.exports);return m.exports;}
deps['./runtime']=deps['@/lib/runtime'];const access=load('lib/access.ts');deps['@/lib/access']=access;const notifications=load('lib/notifications.ts');deps['@/lib/notifications']=notifications;deps['./notifications']=notifications;const common=load('lib/crm.ts');deps['@/lib/crm']=common;deps['./crm']=common;deps['@/lib/assign']=load('lib/assign.ts');deps['./assign']=deps['@/lib/assign'];const serials=load('lib/serials.ts');deps['@/lib/serials']=serials;deps['./serials']=serials;const sound=load('lib/sound.ts');deps['./sound']=sound;deps['@/lib/sound']=sound;const settings=load('lib/settings.ts');deps['@/lib/settings']=settings;const sms=load('lib/sms.ts');deps['@/lib/sms']=sms;deps['@/lib/inventory']=load('lib/inventory.ts');const crmRoute=load('app/api/crm/route.ts');deps['../crm/route']=crmRoute;const stockRoute=load('app/api/inventory/route.ts');const delivRoute=load('app/api/deliveries/route.ts');const leadBuy=load('app/api/lead-purchases/route.ts');const lookup=load('app/api/serials/route.ts');
const post=(route,body)=>route.POST(new Request('https://crm.test/api',{method:'POST',headers:{Origin:'https://crm.test','Content-Type':'application/json'},body:JSON.stringify(body)}));
const json=async(r)=>[r.status,await r.json()];
async function stock(action,data,id){return json(await post(stockRoute,{action,data,id,request_id:crypto.randomUUID()}));}
async function deliv(action,data,id,version){return json(await post(delivRoute,{action,data,id,version}));}
async function search(q){const r=await lookup.GET(new Request('https://crm.test/api/serials?q='+encodeURIComponent(q)));return json(r);}
const UNITS=(...u)=>u.map(x=>typeof x==='string'?{serial:x,barcode:'',note:''}:x);
(async()=>{
 await crmRoute.GET(new Request('https://crm.test/api/crm')); // owner → admin
 for(const m of [{email:'agent@example.test',name:'Агент',role:'agent'},{email:'mk@example.test',name:'Marketing',role:'marketing'}])
  assert.equal((await json(await post(crmRoute,{action:'member',data:{...m,active:true}})))[0],200);
 // Агуулах, бараа, үлдэгдэл бэлдэнэ.
 const wh=(await stock('create_warehouse',{name:'Урд агуулах'}))[1].id;
 const item=(await stock('create_item',{code:'IP17',brand:'Apple',name:'iPhone 17 Pro',sale_price:5000000}))[1].id;
 assert.equal((await stock('record_purchase',{item_id:item,warehouse_id:wh,qty:5,unit_cost:4000000,payment_status:'Төлөгдсөн'}))[0],200);

 // 1) Агуулахын борлуулалтад сериал бүртгэнэ.
 let [status,d]=await stock('record_sale',{item_id:item,warehouse_id:wh,qty:2,unit_price:5000000,customer_phone:'99112233',units:UNITS('351111111111111','352222222222222')});
 assert.equal(status,200);const saleId=d.id;
 assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM inventory_units WHERE source='sale' AND ref_id=?").get(saleId).n,2);
 // Сериал, баркод хоёулаа хоосон бол татгалзана.
 assert.equal((await stock('record_sale',{item_id:item,warehouse_id:wh,qty:1,unit_price:5000000,units:[{serial:'',barcode:'',note:'хоосон'}]}))[0],400);
 // Сериалгүй бараанд баркодоор бүртгэж болно.
 [status,d]=await stock('record_sale',{item_id:item,warehouse_id:wh,qty:1,unit_price:5000000,units:[{serial:'',barcode:'BC-0001',note:'сериалгүй'}]});
 assert.equal(status,200);
 assert.equal(sqlite.prepare("SELECT barcode FROM inventory_units WHERE source='sale' AND ref_id=?").get(d.id).barcode,'BC-0001');

 // 2) Хүргэлтэд сериал бүртгэнэ; агуулахын бараа сонгоогүй бол татгалзана.
 const base=(o={})=>({delivered_on:'2026-09-21',kind:'24 цаг',item_id:item,item_info:'',customer_phone:'99887766',address:'ХУД',payment_channel:'Бэлэн',contents:'',courier_email:null,courier_name:'Идэрчулуун',status:'pending',note:'',...o});
 assert.equal((await deliv('create',base({item_id:null,units:UNITS('353333333333333')})))[0],400);
 [status,d]=await deliv('create',base({units:UNITS('353333333333333')}));
 assert.equal(status,200);const delivId=d.id;
 assert.equal(sqlite.prepare("SELECT serial FROM inventory_units WHERE source='delivery' AND ref_id=?").get(delivId).serial,'353333333333333');
 // Дэлгэрэнгүйд нэгжүүд хамт харагдана.
 let det=await json(await delivRoute.GET(new Request('https://crm.test/api/deliveries?id='+delivId)));
 assert.equal(det[1].units.length,1);
 // Засахад хуучин мөр хоцрохгүй — дахин бичигдэнэ.
 [status,d]=await deliv('update',base({units:UNITS('353333333333333','354444444444444')}),delivId,det[1].delivery.version);
 assert.equal(status,200);
 assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM inventory_units WHERE source='delivery' AND ref_id=?").get(delivId).n,2);

 // 3) Давхардсан дугаар — хориглохгүй, харин сануулна.
 [status,d]=await deliv('create',base({customer_phone:'99000111',units:UNITS('351111111111111')}));
 assert.equal(status,200);assert.match(d.warning,/351111111111111/);
 assert.match(d.warning,/өмнө нь гарсан/);

 // 4) Зээлийн хүсэлт баталгаажуулахад сериал бүртгэнэ.
 const lead=(await json(await post(crmRoute,{action:'create',data:{name:'Бат',phone:'99554433',product:'iPhone 17 Pro',source:'Facebook',owner:'agent@example.test',status:'new',next_at:new Date(Date.now()+3600000).toISOString(),next_action:'Дуудлага'}})))[1].id;
 const leadRow=sqlite.prepare('SELECT version FROM leads WHERE id=?').get(lead);
 [status,d]=await json(await post(leadBuy,{lead_id:lead,version:leadRow.version,request_id:crypto.randomUUID(),item_id:item,warehouse_id:wh,qty:1,unit_price:5000000,units:UNITS('355555555555555')}));
 assert.equal(status,200,JSON.stringify(d));
 const leadUnit=sqlite.prepare("SELECT * FROM inventory_units WHERE source='lead_purchase' AND ref_id=?").get(d.id);
 assert.equal(leadUnit.serial,'355555555555555');
 assert.equal(leadUnit.lead_id,lead);assert.equal(leadUnit.customer_phone,'99554433');
 // Зээлийн худалдан авалтын дэлгэрэнгүйд нэгж хамт гарна.
 const buy=await json(await leadBuy.GET(new Request('https://crm.test/api/lead-purchases?id='+lead)));
 assert.equal(buy[1].units.length,1);assert.equal(buy[1].units[0].serial,'355555555555555');

 // 5) Хайлт: сериал, баркод, харилцагчийн утсаар.
 [status,d]=await search('355555555555555');
 assert.equal(status,200);assert.equal(d.count,1);
 assert.equal(d.items[0].source,'lead_purchase');assert.equal(d.items[0].item_name,'iPhone 17 Pro');
 assert.equal(d.items[0].lead_name,'Бат');assert.equal(d.items[0].lead_phone,'99554433');
 [status,d]=await search('BC-0001');assert.equal(d.count,1);assert.equal(d.items[0].source,'sale');
 [status,d]=await search('353333333333333');
 assert.equal(d.count,1);assert.equal(d.items[0].source,'delivery');
 assert.equal(d.items[0].courier_name,'Идэрчулуун');assert.equal(d.items[0].delivered_on,'2026-09-21');
 [status,d]=await search('99887766');assert.equal(d.count,2); // утсаар хоёр нэгж
 [status,d]=await search('351111111111111');assert.equal(d.count,2); // борлуулалт + давхардсан хүргэлт
 assert.equal((await search('x'))[0],400); // хэт богино
 assert.equal((await search('байхгүй-дугаар'))[1].count,0);
 // Маркетинг хайж чадахгүй.
 user={userId:'mk',email:'mk@example.test',displayName:'Marketing'};
 assert.equal((await search('355555555555555'))[0],403);
 console.log('PASS: unit identifier registry — serial-or-barcode validation with barcode fallback, capture on warehouse sales, deliveries (requiring a linked warehouse item) and loan-request confirmations, re-saving a record replacing its units instead of duplicating them, a non-blocking warning when an identifier already went out, units returned with delivery and purchase details, searchable by serial, barcode or customer phone across all three sources, and marketing locked out.');
})().catch(e=>{console.error(e);process.exit(1)});
