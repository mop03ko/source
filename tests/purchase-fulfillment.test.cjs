const fs=require('node:fs');const bootstrap=fs.readFileSync('tests/serials.test.cjs','utf8').split('\n(async()=>{')[0];
eval(bootstrap+String.raw`
(async()=>{
 await crmRoute.GET(new Request('https://crm.test/api/crm'));
 const wh=(await stock('create_warehouse',{name:'Branch A'}))[1].id;
 const wh2=(await stock('create_warehouse',{name:'Branch B'}))[1].id;
 async function item(code){const [status,r]=await stock('create_item',{code,name:code,brand:'Brand',sale_price:100});assert.equal(status,200);await stock('record_purchase',{item_id:r.id,warehouse_id:wh,qty:10,unit_cost:20});return r.id;}
 const main=await item('MAIN'),gift=await item('GIFT'),extra=await item('EXTRA');
 let n=0;
 async function lead(){const id='purchase-test-'+(++n),at=new Date().toISOString();sqlite.prepare("INSERT INTO leads(id,name,phone,product,source,owner,status,next_action,created_at,updated_at,op) VALUES(?,?,?,?,?,?,'new','Call',?,?,?)").run(id,'Customer','99110000','Phone','test','owner@example.test',at,at,crypto.randomUUID());return id;}
 const request=async(fulfillment,overrides={})=>({lead_id:await lead(),version:1,request_id:crypto.randomUUID(),item_id:main,warehouse_id:'',qty:1,unit_price:100,bill_number:'CONTRACT-1',fulfillment,...overrides});
 const stockQty=id=>sqlite.prepare('SELECT SUM(qty_delta) qty FROM inventory_stock_moves WHERE item_id=?').get(id).qty;
 const pickup=await request({method:'pickup',has_accessories:true,extras:[{kind:'gift',item_id:gift,qty:1},{kind:'gift',item_id:extra,qty:2}]});
 const [status,r]=await json(await post(leadBuy,pickup));assert.equal(status,200,JSON.stringify(r));assert.equal(stockQty(main),9);assert.equal(stockQty(gift),9);assert.equal(stockQty(extra),8);
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM lead_purchase_lines WHERE lead_id=?').get(pickup.lead_id).n,3);
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM deliveries WHERE lead_id=?').get(pickup.lead_id).n,0);
 assert.equal((await json(await post(leadBuy,pickup)))[0],200);assert.equal(stockQty(main),9);
 assert.equal(sqlite.prepare('SELECT has_accessories FROM lead_purchase_fulfillment WHERE lead_id=?').get(pickup.lead_id).has_accessories,1);
 const flagOnly=await request({method:'pickup',has_accessories:true});const beforeGift=stockQty(gift);assert.equal((await json(await post(leadBuy,flagOnly)))[0],200);assert.equal(stockQty(gift),beforeGift);assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM lead_purchase_lines WHERE lead_id=?').get(flagOnly.lead_id).n,1);
 assert.equal((await json(await post(leadBuy,await request({method:'pickup',extras:[{kind:'accessory',item_id:extra,qty:1}]}))))[0],400);
 const before=stockQty(main),noCourier=await request({method:'delivery',address:'Test address'});
 assert.equal((await json(await post(leadBuy,noCourier)))[0],409);assert.equal(stockQty(main),before);assert.equal(sqlite.prepare('SELECT status FROM leads WHERE id=?').get(noCourier.lead_id).status,'new');
 assert.equal((await json(await post(leadBuy,await request({method:'delivery'}))))[0],400);
 assert.equal((await json(await post(leadBuy,await request({method:'pickup',extras:[{kind:'gift',item_id:gift,qty:1,unit_price:50}]}))))[0],400);
 const now=new Date().toISOString(),day=deps['./assign'].ubDay();
 for(const [email,name] of [['courier1@example.test','Courier One'],['courier2@example.test','Courier Two']]){
  await post(crmRoute,{action:'member',data:{email,name,role:'delivery',active:true}});
  sqlite.prepare('INSERT INTO work_shifts(id,day,member_email,person_name,assignment,note,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').run(crypto.randomUUID(),day,email,name,'Хүргэлт','','test',now,now);
 }
 const delivery=await request({method:'delivery',has_accessories:true,address:'Test address',gift_name:'Promotion',extras:[{kind:'gift',item_id:gift,qty:1}]});
 const [ds,dr]=await json(await post(leadBuy,delivery));assert.equal(ds,200,JSON.stringify(dr));assert.ok(dr.delivery_id);
 assert.equal(sqlite.prepare('SELECT courier_email FROM deliveries WHERE id=?').get(dr.delivery_id).courier_email,'courier1@example.test');
 const next=await request({method:'delivery',address:'Next address'});const [,nr]=await json(await post(leadBuy,next));assert.equal(sqlite.prepare('SELECT courier_email FROM deliveries WHERE id=?').get(nr.delivery_id).courier_email,'courier2@example.test');
 const detail=await (await delivRoute.GET(new Request('https://crm.test/api/deliveries?id='+dr.delivery_id))).json();assert.equal(detail.fulfillment.has_accessories,1);assert.equal(detail.lines.length,2);assert.ok(detail.lines.some(l=>l.kind==='gift'&&l.code==='GIFT'));
 await stock('record_purchase',{item_id:main,warehouse_id:wh2,qty:2,unit_cost:20});
 assert.equal((await json(await post(leadBuy,await request({method:'pickup'}))))[0],409);
 assert.equal((await json(await post(leadBuy,await request({method:'pickup'},{warehouse_id:wh2}))))[0],200);
 const beforeExtra=stockQty(main);assert.equal((await json(await post(leadBuy,await request({method:'pickup',extras:[{kind:'gift',item_id:gift,qty:100}]},{warehouse_id:wh}))))[0],409);assert.equal(stockQty(main),beforeExtra);
 console.log('PASS: automatic branch, multi-branch selection, multiple gift stock, accessory flag without stock deduction, atomic rollback, pickup, scheduled courier balancing and delivery contents');
})().catch(e=>{console.error(e);process.exit(1)});
`);
