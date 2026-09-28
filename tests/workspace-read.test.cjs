const fs=require('node:fs');const source=fs.readFileSync('tests/serials.test.cjs','utf8');
eval(source.slice(0,source.indexOf('\n(async()=>{'))+String.raw`
(async()=>{
 user={userId:'owner-test',email:'owner@example.test',displayName:'Owner'};
 await crmRoute.GET(new Request('https://crm.test/api/crm'));
 const created=await post(crmRoute,{action:'create',data:{name:'Workspace privacy test',phone:'99112233',product:'Test item',source:'Facebook',owner:user.email,status:'new',next_at:new Date().toISOString(),next_action:'Call'}});
 assert.equal(created.status,200);
 assert.equal((await json(await crmRoute.GET(new Request('https://crm.test/api/crm?view=all'))))[1].count,1);
 const [status,data]=await json(await crmRoute.GET(new Request('https://crm.test/api/crm?view=workspace')));
 assert.equal(status,200);assert.equal(data.me.email,user.email);assert.deepEqual(data.leads,[]);assert.equal(data.count,0);
 assert.deepEqual(data.distribution,[]);assert.deepEqual(data.byMember,[]);assert.ok(Array.isArray(data.directory));assert.ok(data.settings);assert.ok(data.stats);
 user=null;assert.equal((await crmRoute.GET(new Request('https://crm.test/api/crm?view=workspace'))).status,401);
 console.log('PASS: workspace shell returns authenticated directory/settings without lead rows or reports.');
})().catch(e=>{console.error(e);process.exitCode=1;});
`);
