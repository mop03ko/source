const fs=require('node:fs');const source=fs.readFileSync('tests/serials.test.cjs','utf8');
eval(source.slice(0,source.indexOf('\n(async()=>{'))+String.raw`
(async()=>{
 await crmRoute.GET(new Request('https://crm.test/api/crm'));
 // Authorization must keep checking revocation without opening write transactions.
 let writes=0;const run=Statement.prototype.run;Statement.prototype.run=async function(){writes++;return run.call(this);};
 await access.member();await access.member();assert.equal(writes,0);
 const presence=load('app/api/presence/route.ts');
 assert.equal((await post(presence,{})).status,200);assert.equal(writes,1);
 assert.equal((await post(presence,{})).status,200);assert.equal(writes,1);
 sqlite.prepare('UPDATE members SET active=0 WHERE email=?').run(user.email);
 await assert.rejects(()=>access.member(),e=>e.status===403);
 sqlite.prepare('UPDATE members SET active=1 WHERE email=?').run(user.email);
 // Two editors load the same revision. Only one may save it, including requests without a revision.
 const input={code:'CONCURRENT',name:'Concurrent item',sale_price:1000};
 const created=await json(await post(stockRoute,{action:'create_item',data:input}));assert.equal(created[0],200);
 const id=created[1].id,revision=sqlite.prepare('SELECT updated_at FROM inventory_items WHERE id=?').get(id).updated_at;
 const update=(data,expected_updated_at)=>post(stockRoute,{action:'update_item',id,data,expected_updated_at,request_id:crypto.randomUUID()});
 const results=await Promise.all([update({...input,sale_price:1200},revision),update({...input,name:'Other editor'},revision)]);
 assert.deepEqual(results.map(r=>r.status),[200,409]);
 const conflict=await results[1].json();assert.equal(conflict.code,'ITEM_CONFLICT');assert.equal(conflict.current.sale_price,1200);assert.ok(!('value_cents' in conflict.current));
 assert.equal((await update(input)).status,409);
 assert.equal(sqlite.prepare('SELECT name FROM inventory_items WHERE id=?').get(id).name,input.name);
 // Dashboard aggregates are loaded only on the reports section; director is excluded there.
 await post(crmRoute,{action:'create',data:{name:'Report fixture',phone:'99112233',product:'Test',source:'Facebook',owner:user.email,status:'new',next_at:new Date().toISOString(),next_action:'Call'}});
 const dashboard=async(section)=>(await json(await crmRoute.GET(new Request('https://crm.test/api/crm?view=dashboard&dashboard_section='+section))))[1];
 assert.deepEqual((await dashboard('day')).distribution,[]);
 assert.ok((await dashboard('reports')).distribution.length);
 sqlite.prepare("UPDATE members SET role='director' WHERE email=?").run(user.email);
 assert.deepEqual((await dashboard('reports')).distribution,[]);
 assert.deepEqual((await dashboard('reports')).byMember,[]);
 console.log('PASS: read-only authorization, throttled presence, immediate revocation, concurrent item conflict, lazy dashboard reports and director exclusion.');
})().catch(e=>{console.error(e);process.exitCode=1;});
`);
