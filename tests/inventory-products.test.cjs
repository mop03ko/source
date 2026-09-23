const fs=require('node:fs');
const source=fs.readFileSync('tests/inventory.test.cjs','utf8');
const bootstrap=source.slice(0,source.indexOf('\n(async()=>{'));
const scenario=String.raw`
(async()=>{
 await crmGet();
 const warehouse=(await invPost('create_warehouse',{name:'Test'}))[1].id;
 const input={name:'iPhone 17 Pro',brand:'Apple',category:'Phone',capacity:'256GB',color:'Blue',variant:'New',sale_price:1000,cash_price:900};
 const first=(await invPost('create_item',{...input,code:'UNIT-A',imei:'111111111111111',barcode:'8800000000001',supplier:'Mike'}))[1].id;
 const second=(await invPost('create_item',{...input,name:' IPHONE   17 PRO ',code:'UNIT-B',imei:'222222222222222',barcode:'8800000000001',supplier:'Yuna',sale_price:1100}))[1].id;
 for(const [code,change] of [['COLOR',{color:'Silver'}],['CAPACITY',{capacity:'512GB'}],['CONDITION',{code:'UNIT-DISPLAY'}]])assert.equal((await invPost('create_item',{...input,code,...change}))[0],200);
 for(const id of [first,second])assert.equal((await invPost('record_purchase',{item_id:id,warehouse_id:warehouse,qty:1,unit_cost:500}))[0],200);
 let [status,d]=await invGet('?view=products');assert.equal(status,200);assert.equal(d.count,4);assert.equal(d.summary.unit_count,5);assert.equal(d.summary.units,2);
 const product=d.items.find(p=>p.unit_count===2);assert.ok(product);assert.equal(product.stock,2);assert.equal(product.value_cents,100000);assert.equal(product.sale_price,1000);assert.equal(product.sale_price_max,1100);assert.equal(product.single_item_id,null);
 assert.match(product.sku,/^ANT-\d{6,}$/);assert.equal(product.website_stock,2);
 assert.equal((await invGet('?view=products&q='+product.sku))[1].items[0].id,product.id);
 assert.equal((await invGet('?view=products&match=exact&q='+product.sku))[1].items[0].id,product.id);
 const productUrl='?view=products&id='+product.id;
 const filteredProduct=(await invGet(productUrl+'&warehouse_id=missing'))[1];assert.equal(filteredProduct.product.stock,0);assert.equal(filteredProduct.product.website_stock,2);assert.equal(filteredProduct.product.sku,product.sku);assert.equal(filteredProduct.website,null);
 [status,d]=await invGet(productUrl);assert.equal(d.count,2);assert.deepEqual(new Set(d.items.map(i=>i.id)),new Set([first,second]));assert.ok(d.items.every(i=>i.barcode==='8800000000001'));
 [status,d]=await invGet(productUrl+'&unit_q=222222');assert.equal(d.count,1);assert.equal(d.items[0].id,second);assert.equal(d.product.stock,2);
 [status,d]=await invGet('?view=products&q=222222');assert.equal(d.count,1);assert.equal(d.items[0].single_item_id,second);
 [status,d]=await invGet('?view=items&q=8800000000001');assert.equal(d.count,2);
 [status,d]=await invGet('?view=products&warehouse_id=missing');assert.equal(d.summary.units,0);
 [status,d]=await invGet('?view=products&stock=positive');assert.equal(d.count,1);
 for(const view of ['products','items']){[status,d]=await invGet('?view='+view+'&stock=nonzero');assert.equal(status,200);assert.ok(d.items.length>0);assert.ok(d.items.every(i=>i.stock!==0));[status,d]=await invGet('?view='+view+'&stock=nonzero&warehouse_id=missing');assert.equal(d.count,0);}
 assert.equal((await invPost('record_sale',{item_id:second,warehouse_id:warehouse,qty:1,unit_price:1100,units:[{serial:'222222222222222',barcode:'HISTORICAL-B',note:''}]}))[0],200);
 [status,d]=await invGet(productUrl);assert.equal(d.product.stock,1);assert.equal(d.history[0].item_id,second);assert.equal(d.items.find(i=>i.id===first).stock,1);assert.equal(d.items.find(i=>i.id===second).stock,0);
 assert.equal(d.product.website_stock,1);assert.equal(d.product.sku,product.sku);assert.ok(d.items.every(i=>i.sku===product.sku));
 [status,d]=await invGet(productUrl+'&unit_q=HISTORICAL-B');assert.equal(d.count,1);assert.equal(d.items[0].id,second);
 assert.equal((await invPost('record_sale',{item_id:second,warehouse_id:warehouse,qty:1,unit_price:1100}))[0],409,'Sold unit cannot be sold twice');
 assert.equal((await invPost('update_item',{...input,code:'UNIT-A',imei:'111111111111111'},first))[0],200);
 [status,d]=await invGet('?view=items&id='+first);assert.equal(d.item.barcode,'8800000000001','Older clients preserve barcode');assert.equal(d.item.product_key,product.id);
 assert.equal((await invPost('update_item',{...input,code:'UNIT-A',imei:'111111111111111',color:'Black'},first))[0],200);
 [status,d]=await invGet(productUrl);assert.equal(d.count,1);assert.equal(d.items[0].id,second);assert.equal(d.product.stock,0);
 [status,d]=await invGet('?view=items&id='+first);assert.equal(d.item.stock,1);assert.notEqual(d.item.product_key,product.id,'Editing variant regroups without moving ledger');
 assert.equal((await invGet('?view=products&id=missing'))[0],404);
 const blank=(await invPost('create_item',{code:'UNCATEGORIZED',name:'No category',sale_price:100}))[1].id;
 for(const view of ['products','items','balance']){[status,d]=await invGet('?view='+view+'&category=__uncategorized__');assert.equal(status,200);assert.equal(d.count,1);if(view==='items')assert.equal(d.items[0].id,blank);}
 [status,d]=await invGet('?view=products');assert.equal(d.summary.reorder_stock,0);assert.ok(d.summary.empty_stock>0,'Empty stock is distinct from positive reorder stock');
 [status,d]=await invGet('?view=moves&kind=sale');assert.equal(status,200);assert.equal(d.count,1);assert.ok(d.items.every(m=>m.kind==='sale'));assert.equal(d.items[0].item_id,second);
 [status,d]=await invGet('?view=moves&kind=missing');assert.equal(d.count,0);
 const otherWarehouse=(await invPost('create_warehouse',{name:'Other warehouse'}))[1].id;
 const transfer=(await invPost('transfer',{item_id:first,warehouse_id:warehouse,to_warehouse_id:otherWarehouse,qty:1}));assert.equal(transfer[0],200);
 [status,d]=await invGet('?view=moves&ref_id='+transfer[1].id);assert.equal(d.count,2);assert.equal(d.items.reduce((n,m)=>n+m.qty_delta,0),0);assert.equal(new Set(d.items.map(m=>m.warehouse_id)).size,2);
 [status,d]=await invGet('?view=products&sort=stock_asc');assert.ok(d.items.every((item,i)=>i===0||d.items[i-1].stock<=item.stock));
 [status,d]=await invGet('?view=products&sort=value_desc');assert.ok(d.items.every((item,i)=>i===0||d.items[i-1].value_cents>=item.value_cents));
 const pk=deps['@/lib/inventory'].productKey;assert.equal(await pk(input),await pk({...input,name:' IPHONE 17 PRO '}));assert.notEqual(await pk(input),await pk({...input,code:'DISPLAY'}));assert.notEqual(await pk(input),await pk({...input,color:''}));assert.notEqual(await pk({...input,color:'',code:'A'}),await pk({...input,color:'',code:'B'}));

 // Metadata edits preserve ledger identities, prices and omitted fields.
 const before=(await invGet('?view=items&id='+first))[1].item;
 const editInput={...input,code:before.code,color:before.color,imei:before.imei,image_url:'https://example.test/phone.png'};
 assert.equal((await invPost('update_item',editInput,first))[0],200);
 assert.equal((await invPost('update_item',{...editInput,image_url:'javascript:alert(1)'},first))[0],400);
 const {image_url,...legacy}=editInput;assert.equal((await invPost('update_item',legacy,first))[0],200);
 assert.equal((await invGet('?view=items&id='+first))[1].item.image_url,image_url);
 for(const view of ['items','products']){const found=(await invGet('?view='+view+'&q=UNIT-A'))[1];assert.equal(found.items[0].code,'UNIT-A');}
 assert.equal((await invGet('?view=products&match=exact&q=UNIT'))[1].count,0);
 assert.equal((await invGet('?view=products&match=exact&q=UNIT-A'))[1].count,1);
 const current=(await invGet('?view=items&id='+first))[1];
 const breakdown=(await invGet('?view=products&id='+current.item.product_key))[1].byWarehouse;
 assert.equal(breakdown.find(w=>w.warehouse_id===otherWarehouse).qty,1);
 const request={scope:'items',ids:[first,second],patch:{category:'Accessories'}};
 let preview=await invPost('preview_bulk_items',request);assert.equal(preview[0],200);assert.equal(preview[1].count,2);
 assert.ok(preview[1].changes.every(c=>c.before.brand===c.after.brand&&c.before.supplier===c.after.supplier));
 const ledger=sqlite.prepare('SELECT * FROM inventory_stock_moves ORDER BY id').all();
 assert.equal((await invPost('bulk_update_items',request))[0],409);
 const key=crypto.randomUUID(),apply={...request,preview_hash:preview[1].preview_hash};
 assert.equal((await invPost('bulk_update_items',apply,undefined,key))[0],200);
 assert.equal((await invPost('bulk_update_items',apply,undefined,key))[0],200);
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM inventory_bulk_edits').get().n,1);
 assert.deepEqual(sqlite.prepare('SELECT * FROM inventory_stock_moves ORDER BY id').all(),ledger);
 assert.equal((await invGet('?view=items&id='+first))[1].item.sale_price,current.item.sale_price);
 preview=await invPost('preview_bulk_items',{...request,patch:{supplier:'Solar'}});
 sqlite.prepare("UPDATE inventory_items SET supplier='Changed' WHERE id=?").run(second);
 assert.equal((await invPost('bulk_update_items',{...request,patch:{supplier:'Solar'},preview_hash:preview[1].preview_hash}))[0],409);
 assert.equal((await invPost('preview_bulk_items',{...request,patch:{sale_price:1}}))[0],400);
 assert.equal((await invPost('preview_bulk_items',{...request,patch:{}}))[0],400);
 for(const role of ['director','agent','manager']){
  await crmPost('member',{email:role+'@example.test',name:role,role,active:true});
  user={userId:role,email:role+'@example.test',displayName:role};
  assert.equal((await invPost('preview_bulk_items',request))[0],role==='manager'?200:403);
  user={userId:'owner-test',email:'owner@example.test',displayName:'Owner'};
 }

 for(const dimension of ['category','brand','supplier','warehouse']){
  for(const extra of ['', '&warehouse_id='+otherWarehouse,'&stock=positive','&brand=Apple','&from=2000-01-01&to=2000-01-02']){
   const report=(await invGet('?view=balance&breakdown='+dimension+extra))[1];
   assert.ok(report.report,JSON.stringify(report));
   assert.equal(report.report.breakdown.reduce((n,r)=>n+r.stock,0),report.summary.units,dimension+extra+' quantity');
   assert.equal(report.report.breakdown.reduce((n,r)=>n+r.value_cents,0),report.summary.value_cents,dimension+extra+' value');
   if(dimension==='warehouse')assert.ok(report.report.breakdown.every(r=>r.key));
  }
 }
 const unknown=(await invGet('?view=balance&brand=__unregistered__'))[1];assert.ok(unknown.items.every(r=>r.brand===''));

 const historical=sqlite.prepare('SELECT id FROM inventory_purchases LIMIT 1').get();
 sqlite.prepare("UPDATE inventory_purchases SET created_by='user-approved:excel-purchase-history' WHERE id=?").run(historical.id);
 const stockBefore=sqlite.prepare('SELECT * FROM inventory_stock_moves ORDER BY id').all();
 for(const action of ['return_purchase','receive_purchase'])assert.equal((await invPost(action,{qty:1,note:'test'},historical.id))[0],409);
 assert.deepEqual(sqlite.prepare('SELECT * FROM inventory_stock_moves ORDER BY id').all(),stockBefore);
 console.log('PASS: product identity, variant/condition separation, supplier/price preservation, barcode search, exact unit sale, historical links, stock safety and edit regrouping.');
})().catch(e=>{console.error(e);process.exit(1)});`;
eval(bootstrap+scenario);
