import {encode} from 'next-auth/jwt';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
if(new URL(process.env.MYSQL_URL).pathname!=='/antmall_crm_stage'||process.env.CRM_OWNER_EMAIL!=='migration-test@example.test')throw Error('Isolated stage environment required');
const base='http://127.0.0.1:3002',email='migration-test@example.test';
const token=await encode({secret:process.env.AUTH_SECRET,salt:'authjs.session-token',token:{sub:'google:migration-test',email,name:'Migration fixture'},maxAge:3600});
let headers={cookie:'authjs.session-token='+token,Origin:base,'Content-Type':'application/json'};
async function request(path,body,expected=200){const r=await fetch(base+path,{headers,method:body?'POST':'GET',body:body?JSON.stringify(body):undefined});const value=await r.json();assert.equal(r.status,expected,path+' '+(body?.action||'GET'));return value;}
const paths=[
 '/api/crm?view=workspace','/api/crm?view=all','/api/crm?view=dashboard&dashboard_section=reports','/api/crm?view=today','/api/crm?view=candidates','/api/crm?view=recycle','/api/crm?view=duplicates','/api/crm?calendar=1&month=2026-09',
 ...['items','products','options','balance','purchases','sales','moves','sale_requests'].map(v=>'/api/inventory?view='+v),
 '/api/inventory?view=products&q=iphone','/api/inventory?view=items&q=IPHONE&match=exact',
 '/api/marketing','/api/marketing?calendar=1&month=2026-09','/api/marketing?report=1','/api/it','/api/it?calendar=1&month=2026-09','/api/it?report=1',
 '/api/inventory-counts','/api/inventory-counts?calendar=1&month=2026-09','/api/deliveries','/api/deliveries?report=1','/api/schedule?month=2026-09','/api/dashboard','/api/messages','/api/messages?summary=1','/api/messages?team=1&channel=all','/api/messages?team=1&channel=all&search=test','/api/notifications','/api/todos','/api/meetings','/api/settings',
];
let failures=0;for(const path of paths){try{await request(path);console.log('PASS',path);}catch(e){failures++;console.log('FAIL',e.message);}}
if(failures)process.exitCode=1;
const tag='MYSQL-'+randomUUID().slice(0,8);
const wh=(await request('/api/inventory',{action:'create_warehouse',data:{name:tag},request_id:randomUUID()})).id;
const itemInput={code:tag,name:tag,sale_price:1234.56};
const item=(await request('/api/inventory',{action:'create_item',data:itemInput,request_id:randomUUID()})).id;
await request('/api/inventory',{action:'record_purchase',data:{item_id:item,warehouse_id:wh,qty:2,unit_cost:100.25},request_id:randomUUID()});
const detail=await request('/api/inventory?view=items&id='+item);assert.ok(detail.item.sku?.startsWith('ANT-')||detail.item.product_key);
const update={action:'update_item',id:item,data:{...itemInput,name:tag+' updated'},expected_updated_at:detail.item.updated_at};
const concurrent=await Promise.all([fetch(base+'/api/inventory',{method:'POST',headers,body:JSON.stringify({...update,request_id:randomUUID()})}),fetch(base+'/api/inventory',{method:'POST',headers,body:JSON.stringify({...update,request_id:randomUUID()})})]);assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409]);
await request('/api/inventory',{action:'record_sale',data:{item_id:item,warehouse_id:wh,qty:1,unit_price:1234.56},request_id:randomUUID()});
await request('/api/inventory',{action:'record_sale',data:{item_id:item,warehouse_id:wh,qty:2,unit_price:1234.56},request_id:randomUUID()},409);
const todo=randomUUID();await request('/api/todos',{action:'create',id:todo,title:tag});await request('/api/todos',{action:'update',id:todo,version:1,title:tag,done:true});await request('/api/todos',{action:'update',id:todo,version:1,title:tag,done:false},409);
const meeting=randomUUID();await request('/api/meetings',{action:'create',id:meeting,data:{title:tag,starts_at:new Date(Date.now()+60000).toISOString(),ends_at:new Date(Date.now()+3600000).toISOString(),location:'',note:'',reminder_minutes:15,attendees:[email]}});await request('/api/meetings',{action:'reminders'});await request('/api/meetings',{action:'ack_reminder',id:meeting,version:1});
console.log('PASS MySQL stock, fractional prices, SKU, concurrent edit conflict, insufficient-stock rollback, todo versions, meeting reminder claim/ack');
for(const role of ['agent','operator','manager','director'])await request('/api/crm',{action:'member',data:{email:role+'-migration@example.test',name:'Migration '+role,role,active:true}});
async function as(role){const user=role?role+'-migration@example.test':email,sub=role?'google:'+role+'-migration':'google:migration-test';const value=await encode({secret:process.env.AUTH_SECRET,salt:'authjs.session-token',token:{sub,email:user,name:'Migration fixture'},maxAge:3600});headers={...headers,cookie:'authjs.session-token='+value};}
await as('operator');const lowPrivilege=await request('/api/inventory?view=items&id='+item);assert.ok(!('unit_cost' in lowPrivilege.item));assert.ok(!('value_cents' in lowPrivilege.item));
const pending=await request('/api/inventory',{action:'record_sale',data:{item_id:item,warehouse_id:wh,qty:1,unit_price:1234.56},request_id:randomUUID()});assert.equal(pending.status,'pending');
await request('/api/inventory',{action:'approve_sale',id:pending.id,data:{},request_id:randomUUID()},403);
await as('manager');const approvals=await Promise.all([1,2].map(()=>fetch(base+'/api/inventory',{headers,method:'POST',body:JSON.stringify({action:'approve_sale',id:pending.id,data:{},request_id:randomUUID()})})));assert.deepEqual(approvals.map(r=>r.status).sort(),[200,409]);
await as('director');assert.deepEqual((await request('/api/crm?view=dashboard&dashboard_section=reports')).distribution,[]);
await as('');await request('/api/crm',{action:'create',data:{name:tag,phone:'99'+String(Math.floor(Math.random()*1000000)).padStart(6,'0'),product:tag,source:'Facebook',owner:email,status:'new',next_at:new Date().toISOString(),next_action:'Migration fixture'}});
await request('/api/notifications',{action:'refresh'});const claims=await request('/api/notifications',{action:'claim'});assert.ok(claims.items.length);assert.equal((await request('/api/notifications',{action:'claim'})).items.length,0);
console.log('PASS MySQL role restrictions, pending sale, concurrent approval, director report exclusion and atomic notification claims');
