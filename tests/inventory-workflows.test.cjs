// API scenarios use a fresh in-memory database with the real migrations and serialized writes.
const fs=require('fs');
const source=fs.readFileSync('tests/inventory.test.cjs','utf8');
const bootstrap=source.slice(0,source.indexOf('\n(async()=>{'));
const scenario=String.raw`
(async()=>{
 await crmGet();
 deps['@/lib/access']={...access,member:async()=>({email:'owner@example.test',name:'Owner',role:'admin',active:1,user_id:'owner-test'})};
 const inventory=load('app/api/inventory/route.ts'),counts=load('app/api/inventory-counts/route.ts');
 async function post(route,action,data,id,version,request_id){const r=await route.POST(new Request('https://crm.test/api/inventory',{method:'POST',headers:{Origin:'https://crm.test','Content-Type':'application/json'},body:JSON.stringify({action,data,id,version,request_id})}));return [r.status,await r.json()];}
 async function get(route,q=''){const r=await route.GET(new Request('https://crm.test/api/inventory'+q));return [r.status,await r.json()];}
 const inv=(...args)=>post(inventory,...args),cnt=(...args)=>post(counts,...args);
 const warehouse=(await inv('create_warehouse',{name:'Test warehouse'}))[1].id,other=(await inv('create_warehouse',{name:'Other'}))[1].id;
 const item=(await inv('create_item',{name:'Phone',code:'TEST-256',capacity:'256GB',color:'Silver',imei:'352406913775162',sale_price:199.99,min_stock:2}))[1].id;
 assert.equal((await inv('create_item',{name:'Duplicate',code:'TEST-256'}))[0],409);
 const purchase=(await inv('record_purchase',{item_id:item,warehouse_id:warehouse,qty:3,unit_cost:100.25,additional_cost:10.01,status:'ordered'}))[1].id;
 const stock=async()=>get(inventory,'?view=items&id='+item);
 assert.equal((await stock())[1].item.stock,0,'Pending purchase must not add stock');
 assert.equal((await inv('receive_purchase',{},purchase))[0],200);
 assert.equal((await inv('receive_purchase',{},purchase))[0],409);
 let detail=(await stock())[1];assert.equal(detail.item.stock,3);assert.equal(detail.item.value_cents,31076);
 assert.equal(detail.item.capacity,'256GB');assert.equal(detail.item.imei,'352406913775162');
 const transfer=await inv('transfer',{item_id:item,warehouse_id:warehouse,to_warehouse_id:other,qty:1});assert.equal(transfer[0],200);
 detail=(await stock())[1];assert.equal(detail.item.stock,3);assert.equal(detail.item.value_cents,31076);
 assert.equal(detail.byWarehouse.find(w=>w.warehouse_id===other).value_cents,10359);
 const request=crypto.randomUUID(),saleData={item_id:item,warehouse_id:other,qty:1,unit_price:199.99,platform:'STOREPAY',tax_amount:2.35,bill_number:'INV-1',vat_issued:true};
 const sale=await inv('record_sale',saleData,undefined,undefined,request);assert.equal(sale[0],200);
 const retry=await inv('record_sale',saleData,undefined,undefined,request);assert.equal(retry[1].id,sale[1].id);
 assert.equal((await inv('record_sale',{...saleData,unit_price:200},undefined,undefined,request))[0],409);
 const saleRow=(await get(inventory,'?view=sales'))[1].items[0];
 assert.equal(saleRow.cost_cents,10359);assert.equal(saleRow.commission_cents,1600);assert.equal(saleRow.tax_cents,235);assert.equal(saleRow.profit_cents,7805);assert.equal(saleRow.account,'BHD');
 assert.equal((await inv('return_purchase',{qty:1,note:'Damaged'},purchase))[0],200);
 assert.equal((await stock())[1].item.stock,1);
 // Two sales of the final unit: only one succeeds, and the balance stays nonnegative.
 const race=await Promise.all([inv('record_sale',{item_id:item,warehouse_id:warehouse,qty:1,unit_price:200}),inv('record_sale',{item_id:item,warehouse_id:warehouse,qty:1,unit_price:200})]);
 assert.deepEqual(race.map(r=>r[0]).sort(),[200,409]);detail=(await stock())[1];assert.equal(detail.item.stock,0);assert.equal(detail.item.value_cents,0);
 assert.equal((await inv('return_purchase',{qty:1,note:'No stock'},purchase))[0],409);
 assert.equal((await inv('transfer',{item_id:item,warehouse_id:warehouse,to_warehouse_id:warehouse,qty:1}))[0],409);
 // Import preview, exact closing valuation, idempotency, duplicates, no partial imports.
 const data={as_of:'2026-09-17T15:59:00.000Z',rows:[{code:'OPEN-1',name:'Imported',warehouse:'Test warehouse',qty:3,unit_cost:10.33,total_cost:31,sale_price:20,imei:'350230979310108'}]};
 assert.equal((await inv('preview_import',data))[1].issues.length,0);
 const importKey=crypto.randomUUID();assert.equal((await inv('import_opening',data,undefined,undefined,importKey))[0],200);
 assert.equal((await inv('import_opening',data,undefined,undefined,importKey))[0],200);
 assert.equal((await inv('preview_import',data))[1].issue_count,1);
 assert.equal((await inv('import_opening',{...data,rows:[{...data.rows[0],code:'NEW-UNIQUE'},data.rows[0]]}))[0],409);
 assert.equal((await get(inventory,'?view=items&q=NEW-UNIQUE'))[1].count,0);
 const report=(await get(inventory,'?view=balance&q=OPEN-1&from=2026-09-18&to=2026-09-18'))[1].items[0];assert.equal(report.opening_qty,3);assert.equal(report.stock,3);assert.equal(report.value_cents,3100);assert.equal(report.in_qty,0);
 assert.equal((await get(inventory,'?view=balance&from=2026-02-30&to=2026-03-01'))[0],400);
 // Count race, lifecycle, completeness and repeat finalization.
 const task={title:'Count',warehouse_id:warehouse,owner:'owner@example.test',status:'planned',due_at:null};
 const id=(await cnt('create',task))[1].id;
 assert.equal((await cnt('create',{...task,status:'done'}))[0],400);
 assert.equal((await cnt('finalize',{},id,1))[0],400);
 let count=(await get(counts,'?id='+id))[1];const line=count.lines[0];
 const saves=await Promise.all([cnt('save_lines',{lines:[{line_id:line.id,counted_qty:2}]},id,1),cnt('save_lines',{lines:[{line_id:line.id,counted_qty:9}]},id,1)]);
 assert.deepEqual(saves.map(r=>r[0]),[200,409]);count=(await get(counts,'?id='+id))[1];assert.equal(count.lines[0].counted_qty,2);
 assert.equal((await cnt('update',{...task,status:'done'},id,2))[0],400);
 assert.equal((await cnt('finalize',{},id,2))[0],200);
 assert.equal((await cnt('finalize',{},id,2))[1].already_finalized,true);
 assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM inventory_stock_moves WHERE ref_id=? AND kind='count_adjustment'").get(id).n,1);
 assert.equal((await cnt('save_lines',{lines:[{line_id:line.id,counted_qty:0}]},id,3))[0],409);
 const changed=(await cnt('create',task))[1].id;
 count=(await get(counts,'?id='+changed))[1];
 assert.equal((await cnt('save_lines',{lines:count.lines.map(l=>({line_id:l.id,counted_qty:l.expected_qty}))},changed,1))[0],200);
 await inv('record_purchase',{item_id:item,warehouse_id:warehouse,qty:1,unit_cost:100});
 assert.equal((await cnt('finalize',{},changed,2))[0],409,'Stock movements since snapshot require a fresh count');
 // CSV and workbook mapping protect identifiers, multiline values, closing cost and problematic rows.
 const csv=load('lib/inventory-csv.ts');deps['./inventory-csv']=csv;const workbook=load('lib/inventory-workbook.ts');
 assert.equal(csv.parseCsv('code,name,warehouse,qty,unit_cost\r\n"A","Two, lines\nname",WH,1,10')[0].name,'Two, lines\nname');
 assert.match(csv.toCsv(['name'],[['=1+1']]),/"'=1\+1"/);
 const parsed=workbook.balanceRows([{number:1,cells:{R:'46284'}},{number:3,cells:{B:'3.52406913775162E14',D:'Phone',H:'WH',P:'1',Q:'10.33',R:'10.33'}},{number:4,cells:{B:' 352406913775162 ',D:'Phone',H:'WH',P:'1',Q:'10.33',R:'10.33'}}]);
 assert.equal(parsed.rows.length,1);assert.equal(parsed.rows[0].code,'352406913775162');assert.equal(parsed.warnings.length,1);assert.equal(parsed.asOf,'2026-09-18T23:59');
 console.log('PASS: inventory receipt/return, landed-cost cents, transfers, commission/profit, negative-stock race, idempotency, import preview/atomicity, date balances, count races/lifecycle and workbook/CSV mapping.');
})().catch(e=>{console.error(e);process.exit(1)});
`;
new Function('require',bootstrap+scenario)(require);
