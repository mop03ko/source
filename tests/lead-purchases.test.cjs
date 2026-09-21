const fs=require('fs');
const source=fs.readFileSync('tests/inventory.test.cjs','utf8');
const bootstrap=source.slice(0,source.indexOf('\n(async()=>{'));
const scenario=String.raw`
(async()=>{
 await crmGet();
 const sent=[];deps['@/lib/sms']={...sms,sendSms:async(...args)=>{sent.push(args);}};
 let purchaseRoute=load('app/api/lead-purchases/route.ts');
 const ownerUser={...user};
 async function purchase(data,origin='https://crm.test'){const r=await purchaseRoute.POST(new Request('https://crm.test/api/lead-purchases',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(data)}));return [r.status,await r.json()];}
 async function purchaseGet(id){const r=await purchaseRoute.GET(new Request('https://crm.test/api/lead-purchases?id='+id));return [r.status,await r.json()];}
 async function change(action,id,version,data){const r=await crmRoute.POST(new Request('https://crm.test/api/crm',{method:'POST',headers:{Origin:'https://crm.test','Content-Type':'application/json'},body:JSON.stringify({action,id,version,data})}));return [r.status,await r.json()];}
 let phone=99050000;
 const leadData=()=>({name:'Loan customer',phone:String(phone++),product:'Original requested product',source:'Facebook',owner:'owner@example.test',status:'pending',next_at:new Date().toISOString(),next_action:'Review'});
 async function newLead(overrides={}){const body={...leadData(),...overrides};const r=await crmPost('create',body);assert.equal(r[0],200,JSON.stringify(r));return sqlite.prepare('SELECT * FROM leads WHERE id=?').get(r[1].id);}
 const warehouse=(await invPost('create_warehouse',{name:'Loan warehouse'}))[1].id;
 const otherWarehouse=(await invPost('create_warehouse',{name:'Empty warehouse'}))[1].id;
 const item=(await invPost('create_item',{name:'Phone 256GB',code:'LOAN-256',imei:'350000000000001',sale_price:200}))[1].id;
 assert.equal((await invPost('record_purchase',{item_id:item,warehouse_id:warehouse,qty:5,unit_cost:100,additional_cost:0.01}))[0],200);
 const lead=await newLead();
 const request={lead_id:lead.id,version:lead.version,request_id:crypto.randomUUID(),item_id:item,warehouse_id:warehouse,qty:2,unit_price:200,platform:'STOREPAY',tax_amount:2.35,bill_number:'LOAN-1',customer_name:'Spoofed'};
 assert.equal((await purchaseGet(lead.id))[1].purchase,null);
 assert.equal((await purchase(request,'https://evil.test'))[0],403);
 assert.equal((await crmPost('create',{...leadData(),status:'won'}))[0],400);
 assert.equal((await crmPost('import',[{...leadData(),status:'won'}]))[0],400);
 assert.equal((await change('update',lead.id,lead.version,{...lead,status:'won'}))[0],409);
 let [status,result]=await purchase(request);assert.equal(status,200,JSON.stringify(result));const saleId=result.id;
 const confirmed=sqlite.prepare('SELECT * FROM leads WHERE id=?').get(lead.id);
 assert.equal(confirmed.status,'won');assert.equal(confirmed.next_at,null);assert.equal(confirmed.version,lead.version+1);assert.equal(confirmed.product,lead.product);
 const sale=sqlite.prepare('SELECT * FROM inventory_sales WHERE id=?').get(saleId);
 assert.equal(sale.lead_id,lead.id);assert.equal(sale.customer_name,lead.name);assert.equal(sale.customer_phone,lead.phone);assert.equal(sale.cost_cents,20000);assert.equal(sale.commission_cents,3200);assert.equal(sale.tax_cents,235);assert.equal(sale.total_price,400);
 assert.equal((await invGet('?view=items&id='+item))[1].item.stock,3);
 assert.equal((await invGet('?view=items&id='+item))[1].item.value_cents,30001);
 assert.equal((await purchaseGet(lead.id))[1].purchase.item_code,'LOAN-256');
 assert.ok((await crmGet('?id='+lead.id))[1].activities.some(a=>a.note.includes(saleId)));
 assert.equal(sent.length,1,'Status SMS fires after successful confirmation');
 assert.equal((await purchase(request))[1].id,saleId);assert.equal(sent.length,1,'Retry does not resend SMS');
 assert.equal((await purchase({...request,qty:1}))[0],409);
 assert.equal((await purchase({...request,request_id:crypto.randomUUID(),version:confirmed.version}))[0],409);
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM inventory_sales WHERE lead_id=?').get(lead.id).n,1);
 assert.equal((await change('update',lead.id,confirmed.version,{...confirmed,status:'pending',next_at:new Date().toISOString(),next_action:'Call'}))[0],409);
 assert.equal((await change('delete',lead.id,confirmed.version,{note:'Test delete'}))[0],200);
 assert.equal((await purchaseGet(lead.id))[0],404);
 const deleted=sqlite.prepare('SELECT * FROM leads WHERE id=?').get(lead.id);
 assert.equal((await change('restore',lead.id,deleted.version,{note:'Test restore'}))[0],200);
 assert.equal(sqlite.prepare('SELECT status FROM leads WHERE id=?').get(lead.id).status,'won');
 assert.equal((await purchaseGet(lead.id))[1].purchase.id,saleId);
 // Failed validations leave the lead, stock and sales unchanged.
 const next=await newLead();const nextRequest={...request,lead_id:next.id,version:next.version,request_id:crypto.randomUUID()};
 for(const patch of [{qty:4},{version:99},{warehouse_id:otherWarehouse},{item_id:'missing'},{warehouse_id:'missing'},{qty:0},{qty:1.5},{unit_price:-1},{unit_price:1.001}]){
  assert.ok([400,409].includes((await purchase({...nextRequest,...patch}))[0]));
  assert.deepEqual(sqlite.prepare('SELECT * FROM leads WHERE id=?').get(next.id),next);
  assert.equal((await invGet('?view=items&id='+item))[1].item.stock,3);
 }
 sqlite.prepare('UPDATE inventory_items SET active=0 WHERE id=?').run(item);
 assert.equal((await purchase(nextRequest))[0],400);
 sqlite.prepare('UPDATE inventory_items SET active=1 WHERE id=?').run(item);
 // Fail after lead/sale/movement writes: the whole transaction must roll back.
 sqlite.exec("CREATE TRIGGER reject_confirmation BEFORE INSERT ON inventory_requests WHEN NEW.action='confirm_lead_purchase' BEGIN SELECT RAISE(ABORT,'injected audit failure'); END");
 assert.equal((await purchase(nextRequest))[0],500);
 assert.deepEqual(sqlite.prepare('SELECT * FROM leads WHERE id=?').get(next.id),next);
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM inventory_sales WHERE lead_id=?').get(next.id).n,0);
 assert.equal((await invGet('?view=items&id='+item))[1].item.stock,3);
 sqlite.exec('DROP TRIGGER reject_confirmation');
 // Staff ownership and module isolation apply to both reads and confirmations.
 for(const role of ['agent','manager','director','marketing','it'])assert.equal((await crmPost('member',{email:role+'@example.test',name:role,role,active:true}))[0],200);
 user={userId:'agent',email:'agent@example.test',displayName:'Agent'};
 assert.equal((await purchaseGet(next.id))[0],404);assert.equal((await purchase(nextRequest))[0],404);
 const own=await newLead({owner:user.email});
 assert.equal((await purchase({...nextRequest,lead_id:own.id,version:own.version,request_id:crypto.randomUUID(),qty:1}))[0],200,'Agent can confirm own lead without permission to edit catalog');
 for(const role of ['marketing','it']){user={userId:role,email:role+'@example.test',displayName:role};assert.equal((await purchaseGet(next.id))[0],403);assert.equal((await purchase(nextRequest))[0],403);}
 user=null;assert.equal((await purchaseGet(next.id))[0],401);user=ownerUser;
 // Concurrent confirmations compete for the final unit; exactly one succeeds.
 const raceItem=(await invPost('create_item',{name:'Final phone',code:'FINAL'}))[1].id;
 await invPost('record_purchase',{item_id:raceItem,warehouse_id:warehouse,qty:1,unit_cost:10});
 const a=await newLead(),b=await newLead();
 let actor={email:ownerUser.email,role:'admin',active:1};
 deps['@/lib/access']={...access,member:async()=>actor};purchaseRoute=load('app/api/lead-purchases/route.ts');
 const results=await Promise.all([a,b].map(l=>purchase({...request,lead_id:l.id,version:l.version,request_id:crypto.randomUUID(),item_id:raceItem,qty:1})));
 assert.deepEqual(results.map(r=>r[0]).sort(),[200,409]);
 assert.equal(sqlite.prepare('SELECT SUM(qty_delta) qty FROM inventory_stock_moves WHERE item_id=?').get(raceItem).qty,0);
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM leads WHERE id IN (?,?) AND status=?').get(a.id,b.id,'won').n,1);
 const replayLead=await newLead();const replayRequest={...request,lead_id:replayLead.id,version:replayLead.version,request_id:crypto.randomUUID(),qty:1};
 const replay=await Promise.all([purchase(replayRequest),purchase(replayRequest)]);assert.deepEqual(replay.map(r=>r[0]),[200,200]);assert.equal(replay[0][1].id,replay[1][1].id);
 actor={...actor,role:'delivery'};assert.equal((await purchase(replayRequest))[0],403);
 actor={...actor,role:'unknown'};assert.equal((await purchase(replayRequest))[0],403);
 console.log('PASS: lead purchase selection, atomic stock/sale/status updates, scope/roles, input validation, exact costs/commission, audit rollback, idempotency, stock races, SMS, delete/restore and status-bypass prevention.');
})().catch(e=>{console.error(e);process.exit(1)});
`;
new Function('require',bootstrap+scenario)(require);
