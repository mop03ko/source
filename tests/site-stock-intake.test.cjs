const fs=require('node:fs'),assert=require('node:assert/strict'),ts=require('typescript');
const {DatabaseSync}=require('node:sqlite');
const sqlite=new DatabaseSync(':memory:');
sqlite.exec(`CREATE TABLE site_catalog(id TEXT,code TEXT); CREATE TABLE site_stock_links(site_id TEXT,site_code TEXT,product_key TEXT,enabled INTEGER); CREATE TABLE inventory_items(id TEXT,product_key TEXT,active INTEGER); CREATE TABLE inventory_stock_moves(item_id TEXT,qty_delta INTEGER,warehouse_id TEXT DEFAULT 'ee540f17-f13e-4587-99cc-fca3fa31f083');
INSERT INTO site_catalog VALUES('1','a'),('2','b'),('3','changed'),('4','d');
INSERT INTO site_stock_links VALUES('1','a','p1',1),('2','b','p2',1),('3','old','p3',1),('4','d','p4',0);
INSERT INTO inventory_items VALUES('a','p1',1),('b','p1',1),('c','p1',0),('d','p2',1),('e','p3',1),('f','p4',1);
INSERT INTO inventory_stock_moves(item_id,qty_delta) VALUES('a',5),('a',-2),('b',1),('c',100),('d',-2),('e',10),('f',20);
INSERT INTO inventory_stock_moves VALUES('a',100,'union'),('a',200,'songsoglon'),('a',300,'display'),('a',2,'ffe360f0-ee2b-415f-abe9-ee70113e5e89'),('b',3,'26d60fd9-1308-4ea1-a9d2-d8af01155a97');`);
let calls=0,failed=false;
const DB={prepare(sql){return {bind(...args){return {async all(){calls++;if(failed)throw Error('secret');return {results:sqlite.prepare(sql).all(...args)};}};}};}};
const moduleObject={exports:{}};
new Function('require','module','exports',ts.transpileModule(fs.readFileSync('app/api/integrations/site-stock/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(id=>id==='@/lib/runtime'?{env:{DB}}:require(id),moduleObject,moduleObject.exports);
const token='test-'.repeat(10);process.env.CRM_SITE_STOCK_TOKEN=token;
const get=(ids,auth=token)=>moduleObject.exports.GET(new Request('https://crm.test/api/integrations/site-stock?'+ids,{headers:{'X-Token':auth}}));
(async()=>{
 assert.equal((await get('ids=1','bad')).status,401);assert.equal(calls,0);
 for(const q of ['ids=0','ids=1&ids=2','ids=1&x=2','ids='+Array(101).fill('1').join(','),'ids=1%27'])assert.equal((await get(q)).status,400);
 const res=await get('ids=1,2,3,4,5');assert.equal(res.status,200);assert.equal(res.headers.get('cache-control'),'private, no-store');
 const data=(await res.json()).data; assert.deepEqual(data[0].branches,[{name:'Olympic Galleria',quantity:4},{name:'Go.To Market',quantity:2},{name:'Tumen Mall',quantity:3}]); assert.deepEqual(data.map(({branches,...row})=>row),[{product_id:'1',product_code:'a',quantity:9},{product_id:'2',product_code:'b',quantity:0}]);
 // Stock only in excluded warehouses still returns a mapped zero, not unknown.
 sqlite.exec("DELETE FROM inventory_stock_moves WHERE item_id='d'; INSERT INTO inventory_stock_moves VALUES('d',50,'union');");
 assert.equal((await (await get('ids=2')).json()).data[0].quantity,0);
 // Moving stock out of a selected branch reduces the website quantity.
 sqlite.exec("INSERT INTO inventory_stock_moves VALUES('a',-2,'ee540f17-f13e-4587-99cc-fca3fa31f083'),('a',2,'union');");
 assert.equal((await (await get('ids=1')).json()).data[0].quantity,7);
 failed=true;const failure=await get('ids=1');assert.equal(failure.status,503);assert.equal((await failure.json()).error,'STOCK_UNAVAILABLE');
 console.log('Stock integration: auth, bounds, active items, aggregation, zero, missing links and errors passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
