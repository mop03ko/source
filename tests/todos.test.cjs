const fs=require('node:fs');const source=fs.readFileSync('tests/serials.test.cjs','utf8');
eval(source.slice(0,source.indexOf('\n(async()=>{'))+String.raw`
const route=load('app/api/todos/route.ts');
(async()=>{
 user=null;assert.equal((await route.GET(new Request('https://crm.test/api/todos'))).status,401);
 user={userId:'owner-test',email:'owner@example.test',displayName:'Owner'};await crmRoute.GET(new Request('https://crm.test/api/crm'));
 for(const role of ['agent','operator','manager','director','marketing','it','delivery'])await post(crmRoute,{action:'member',data:{email:role+'@example.test',name:role,role,active:true}});
 const id=crypto.randomUUID(),body={action:'create',id,title:'Personal task'};
 assert.equal((await post(route,body)).status,200);assert.equal((await post(route,body)).status,200);
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM personal_todos').get().n,1);
 for(const role of ['agent','operator','manager','director','marketing','it','delivery']){
  user={userId:role,email:role+'@example.test',displayName:role};
  assert.equal((await json(await route.GET(new Request('https://crm.test/api/todos?owner=owner@example.test'))))[1].count,0);
  assert.equal((await post(route,{action:'update',id,version:1,title:'stolen',done:true})).status,404);
  assert.equal((await post(route,{action:'delete',id,version:1})).status,404);
  assert.equal((await post(route,{action:'create',id:crypto.randomUUID(),title:role+' task'})).status,200);
 }
 user={userId:'owner-test',email:'owner@example.test',displayName:'Owner'};
 assert.equal((await json(await route.GET(new Request('https://crm.test/api/todos?status=all'))))[1].count,1);
 assert.equal((await post(route,{action:'update',id,version:1,title:'Changed',done:true})).status,200);
 assert.equal((await post(route,{action:'update',id,version:1,title:'stale',done:false})).status,409);
 const complete=(await json(await route.GET(new Request('https://crm.test/api/todos?status=done'))))[1];assert.equal(complete.summary.done,1);assert.equal(complete.items[0].title,'Changed');
 assert.equal((await post(route,{action:'update',id,version:2,title:'Changed',done:false})).status,200);
 assert.equal((await post(route,{action:'create',id:crypto.randomUUID(),title:' '})).status,400);
 assert.equal((await post(route,{...body,owner:'agent@example.test'})).status,400);
 assert.equal((await route.POST(new Request('https://crm.test/api/todos',{method:'POST',body:JSON.stringify(body)}))).status,403);
 assert.equal((await post(route,{action:'delete',id,version:3})).status,200);
 assert.equal((await json(await route.GET(new Request('https://crm.test/api/todos'))))[1].count,0);
 console.log('PASS: To-Do all roles, own-only including admin, CRUD, completion/reopen, idempotent create, version conflicts, owner spoofing and CSRF.');
})().catch(e=>{console.error(e);process.exitCode=1;});
`);
