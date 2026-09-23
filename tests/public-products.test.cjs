const fs=require('node:fs'),assert=require('node:assert/strict'),ts=require('typescript');
const {DatabaseSync}=require('node:sqlite');const sqlite=new DatabaseSync(':memory:');
for(const p of fs.readdirSync('drizzle').filter(p=>p.endsWith('.sql')).sort())sqlite.exec(fs.readFileSync('drizzle/'+p,'utf8'));
let failed=false,readTransactions=0;
class Statement{constructor(sql,args=[]){this.sql=sql;this.args=args;}bind(...args){return new Statement(this.sql,args);}async first(){if(failed)throw Error('private SQL and token');return sqlite.prepare(this.sql).get(...this.args)||null;}}
const DB={prepare:s=>new Statement(s)};
const deps={'./runtime':{env:{DB}},'./database':{getClient:()=>({transaction:async mode=>{assert.equal(mode,'read');readTransactions++;return {execute:async({sql,args})=>{if(failed)throw Error('private SQL and token');return {rows:sqlite.prepare(sql).all(...args)};},commit:async()=>{},rollback:async()=>{},close:()=>{},closed:false};}})}};
function load(p){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(id=>{if(deps[id])return deps[id];assert.ok(!/session|access/.test(id),'public endpoint must not load sessions');return require(id);},m,m.exports);return m.exports;}
const lib=load('lib/public-products.ts');deps['@/lib/public-products']=lib;
const list=load('app/api/public/v1/products/route.ts'),detail=load('app/api/public/v1/products/[id]/route.ts'),spec=load('app/api/public/v1/openapi.json/route.ts');
const insert=sqlite.prepare("INSERT INTO inventory_items(id,code,name,brand,category,capacity,color,variant,imei,barcode,supplier,product_key,sale_price,cash_price,image_url,active,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'now','now')");
function item(id,key,name,active=1,price=1000,cash=900){insert.run(id,'PRIVATE-CODE-'+id,name,'APPLE','Phone','256GB','Blue','New','PRIVATE-IMEI-'+id,'PRIVATE-BARCODE','PRIVATE-SUPPLIER',key,price,cash,'https://cdn.example.test/a.jpg',active,'PRIVATE-EMAIL');}
function move(id,item,qty){sqlite.prepare("INSERT INTO inventory_stock_moves(id,item_id,warehouse_id,kind,qty_delta,unit_cost,value_cents,note,actor,created_at) VALUES(?,?,?,'opening',?,123,12300,'PRIVATE-NOTE','PRIVATE-ACTOR','now')").run(id,item,'warehouse-'+id,qty);}
async function get(query=''){const r=await list.GET(new Request('https://crm.test/api/public/v1/products'+query));return [r,await r.json()];}
async function one(id){const r=await detail.GET(new Request('https://crm.test/api/public/v1/products/'+id),{params:Promise.resolve({id})});return [r,await r.json()];}
(async()=>{
 item('a','p_group','iPhone');item('b','p_group','iPhone extra');item('inactive','p_group','PRIVATE-INACTIVE',0);move('m1','a',3);move('m2','b',2);move('m3','inactive',20);
 item('zero','p_zero','Zero');item('negative','p_negative','Negative');move('m4','negative',-1);
 item('hidden','p_hidden','Hidden',0);move('m5','hidden',9);
 item('missing-price','p_missing','Incomplete',1,0,null);item('escaped','p_escaped','100% test');
 for(let i=0;i<101;i++)item('extra-'+i,'x_'+String(i).padStart(3,'0'),'Other');
 let [r,d]=await get();assert.equal(r.status,200);assert.equal(d.pagination.total,106);assert.equal(d.data.length,25);assert.equal(d.pagination.has_more,true);assert.equal(readTransactions,1);
 assert.equal(r.headers.get('access-control-allow-origin'),'*');assert.equal(r.headers.get('access-control-allow-credentials'),null);assert.equal(r.headers.get('cache-control'),'public, max-age=0, s-maxage=15');
 [r,d]=await one('p_group');assert.equal(r.status,200);assert.equal(d.data.stock.quantity,5);assert.equal(d.data.sku,'CRM-p_group');assert.equal(d.data.prices.credit.min,1000);assert.equal(d.data.site,null);
 assert.deepEqual(Object.keys(d.data).sort(),['id','sku','name','brand','category','capacity','color','variant','image_url','stock','prices','site'].sort());
 assert.doesNotMatch(JSON.stringify(d),/PRIVATE|supplier|imei|barcode|unit_cost|value_cents|created_by|actor|warehouse-/i);
 assert.deepEqual((await one('CRM-p_group'))[1].data,d.data);
 [r,d]=await get('?q=iPhone&in_stock=true');assert.equal(d.data.length,1);assert.equal(d.data[0].stock.quantity,5,'search must not truncate group stock');
 [r,d]=await get('?q=100%25');assert.equal(d.data.length,1,'LIKE percent is literal');assert.equal(d.data[0].id,'p_escaped');
 [r,d]=await get('?q=CRM-p_group');assert.equal(d.data[0].id,'p_group');
 assert.equal((await one('p_negative'))[1].data.stock.quantity,0);assert.equal((await one('p_zero'))[1].data.stock.in_stock,false);
 assert.equal((await one('p_missing'))[1].data.prices.credit,null);assert.equal((await one('p_missing'))[1].data.prices.cash,null);
 assert.equal((await one('p_hidden'))[0].status,404);assert.equal((await one('missing'))[0].status,404);
 assert.equal((await one("bad' OR 1=1"))[0].status,400);
 for(const query of ['?limit=101','?limit=0','?page=1.5','?page=-1','?page=NaN','?in_stock=1','?secret=true','?q=a&q=b','?site_product_id=abc'])assert.equal((await get(query))[0].status,400,query);
 [r,d]=await get('?limit=100&page=2');assert.equal(d.data.length,6);assert.equal(d.pagination.has_more,false);
 [r,d]=await get('?q=not-found');assert.deepEqual(d.data,[]);assert.equal(d.pagination.total_pages,0);
 [r,d]=await get('?in_stock=false&limit=100');assert.ok(d.data.every(p=>p.stock.quantity===0));
 sqlite.exec("INSERT INTO site_catalog(id,code,name,capacity,color,variant,imported_at) VALUES('7','ANTM-7','Phone','256GB','Blue','New','now');INSERT INTO site_stock_links(product_key,site_id,site_code,enabled,confirmed_by,confirmed_at) VALUES('p_group','7','ANTM-7',0,'private','now');");
 assert.equal((await get('?site_product_id=7'))[1].data.length,0,'unapproved link stays private');
 sqlite.exec('UPDATE site_stock_links SET enabled=1');assert.equal((await get('?site_product_id=7'))[1].data[0].stock.quantity,5);assert.equal((await get('?q=ANTM-7'))[1].data[0].site.product_id,'7');
 sqlite.exec("UPDATE site_catalog SET code='CHANGED'");assert.equal((await get('?site_product_id=7'))[1].data.length,0);
 sqlite.exec("UPDATE inventory_items SET image_url='javascript:alert(1)' WHERE product_key='p_group'");assert.equal((await one('p_group'))[1].data.image_url,null);
 move('sale','a',-3);move('sale2','b',-2);assert.equal((await one('p_group'))[1].data.stock.quantity,0,'new stock moves visible immediately in origin');
 const before=sqlite.prepare('SELECT total_changes() n').get().n;await get();await one('p_group');assert.equal(sqlite.prepare('SELECT total_changes() n').get().n,before,'public reads must not mutate');
 failed=true;[r,d]=await get();assert.equal(r.status,503);assert.equal(r.headers.get('cache-control'),'no-store');assert.doesNotMatch(JSON.stringify(d),/private SQL|token/);assert.equal((await one('p_group'))[0].status,503);failed=false;
 assert.equal(list.OPTIONS().status,204);assert.equal(detail.OPTIONS().headers.get('access-control-allow-origin'),'*');
 const openapi=await spec.GET().json();assert.equal(openapi.openapi,'3.1.0');assert.deepEqual(openapi.security,[]);assert.ok(openapi.paths['/api/public/v1/products/{id}']);
 console.log('PASS: public no-auth read-only catalog, exact DTO privacy, grouped stock, zero/inactive products, SKU, site links, pagination, filters, input validation, CORS, cache and sanitized errors.');
})().catch(e=>{console.error(e);process.exitCode=1;});
