const fs=require('node:fs');const source=fs.readFileSync('tests/serials.test.cjs','utf8');
eval(source.slice(0,source.indexOf('\n(async()=>{'))+String.raw`
deps['@/lib/web-loans']=load('lib/web-loans.ts');
const route=load('app/api/integrations/web-loans/route.ts');
const call=(body,token=process.env.CRM_WEB_LOAN_TOKEN)=>route.POST(new Request('https://crm.test/api/integrations/web-loans',{method:'POST',headers:{'Content-Type':'application/json','x-web-loan-token':token||''},body:JSON.stringify(body)}));
(async()=>{
 process.env.CRM_WEB_LOAN_TOKEN='test-only-web-loan-token-at-least-32-characters';
 await crmRoute.GET(new Request('https://crm.test/api/crm'));
 const data={request_id:crypto.randomUUID(),name:'Web customer',phone:'99112233',registration:'АБ12345678',product:'Test phone'};
 assert.equal((await call(data,'bad-token')).status,401);
 assert.equal((await call({...data,owner:'injected@example.test'})).status,400);
 const results=await Promise.all([call(data),call(data)]);assert.deepEqual(results.map(r=>r.status).sort(),[200,201]);
 const first=await results[0].json();const row=sqlite.prepare('SELECT * FROM leads WHERE id=?').get(first.id);
 assert.equal(row.source,'Вэбсайт');assert.equal(row.registration,data.registration);assert.equal(row.owner,'__sheet_unassigned__');
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM web_loan_requests').get().n,1);
 assert.equal((await call({...data,product:'Changed'})).status,409);
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM activities WHERE lead_id=?').get(first.id).n,1);
 sqlite.prepare('INSERT INTO app_settings(key,value,updated_at) VALUES(?,?,?)').run('auto_assignment',JSON.stringify({enabled:true,automatic:true,days:7,assignments:[],excluded_emails:[]}),new Date().toISOString());
 for(const role of ['agent','operator']){
  await post(crmRoute,{action:'member',data:{email:role+'@example.test',name:role,role,active:true}});
  sqlite.prepare('INSERT INTO work_shifts(id,day,member_email,person_name,assignment,note,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').run(crypto.randomUUID(),deps['./assign'].ubDay(),role+'@example.test',role,'Sales','','test',new Date().toISOString(),new Date().toISOString());
 }
 const assigned=await (await call({...data,request_id:crypto.randomUUID()})).json();
 assert.equal(sqlite.prepare('SELECT owner FROM leads WHERE id=?').get(assigned.id).owner,'agent@example.test');
 sqlite.prepare('INSERT INTO suppressions(phone,reason,actor,created_at) VALUES(?,?,?,?)').run('99112234','test','test',new Date().toISOString());
 const suppressed=await (await call({...data,request_id:crypto.randomUUID(),phone:'99112234'})).json();
 assert.equal(sqlite.prepare('SELECT next_at FROM leads WHERE id=?').get(suppressed.id).next_at,null);
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM notifications WHERE lead_id=?').get(suppressed.id).n,0);
 console.log('PASS: web intake auth, strict validation, concurrent retry dedup, conflicts, source, audit and suppression');
})().catch(e=>{console.error(e);process.exit(1)});
`);
