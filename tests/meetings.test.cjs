const fs=require('node:fs');const source=fs.readFileSync('tests/serials.test.cjs','utf8');
eval(source.slice(0,source.indexOf('\n(async()=>{'))+String.raw`
const route=load('app/api/meetings/route.ts');
(async()=>{
 user=null;assert.equal((await route.GET(new Request('https://crm.test/api/meetings'))).status,401);
 const owner={userId:'owner-test',email:'owner@example.test',displayName:'Owner'};user=owner;await crmRoute.GET(new Request('https://crm.test/api/crm'));
 for(const role of ['agent','operator','manager','director','marketing','it','delivery'])await post(crmRoute,{action:'member',data:{email:role+'@example.test',name:role,role,active:true}});
 const data={title:'Team meeting',starts_at:new Date(Date.now()+10*60000).toISOString(),ends_at:new Date(Date.now()+70*60000).toISOString(),attendees:['agent@example.test'],reminder_minutes:15};
 const id=crypto.randomUUID(),body={action:'create',id,data};assert.equal((await post(route,body)).status,200);assert.equal((await post(route,body)).status,200);
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM meetings').get().n,1);
 const list=async()=> (await json(await route.GET(new Request('https://crm.test/api/meetings'))))[1];
 assert.equal((await list()).count,1);assert.equal((await list()).items[0].attendees.length,2);
 let attendeeQueries=0;const originalAll=Statement.prototype.all;
 Statement.prototype.all=async function(){if(this.sql.includes('SELECT a.meeting_id,a.email'))attendeeQueries++;return originalAll.call(this);};
 await list();assert.equal(attendeeQueries,1,'Attendees should use a single batched query');
 Statement.prototype.all=originalAll;
 user={userId:'agent',email:'agent@example.test',displayName:'Agent'};assert.equal((await list()).count,1);
 assert.equal((await post(route,{action:'update',id,version:1,data})).status,403);
 assert.equal((await post(route,{action:'cancel',id,version:1})).status,403);
 assert.equal((await json(await post(route,{action:'reminders'})))[1].items.length,1);
 assert.equal((await json(await post(route,{action:'reminders'})))[1].items.length,0);
 // Lost response: an expired claim must be delivered again until this recipient acknowledges it.
 sqlite.prepare('UPDATE meeting_reminders SET alerted_at=? WHERE meeting_id=?').run(new Date(Date.now()-61000).toISOString(),id);
 assert.equal((await json(await post(route,{action:'reminders'})))[1].items.length,1);
 assert.equal((await post(route,{action:'ack_reminder',id,version:1})).status,200);
 assert.equal((await post(route,{action:'ack_reminder',id,version:1})).status,200);
 sqlite.prepare('UPDATE meeting_reminders SET alerted_at=? WHERE meeting_id=?').run(new Date(Date.now()-61000).toISOString(),id);
 assert.equal((await json(await post(route,{action:'reminders'})))[1].items.length,0);
 for(const role of ['operator','manager','director','marketing','it','delivery']){user={userId:role,email:role+'@example.test',displayName:role};assert.equal((await list()).count,0);assert.equal((await json(await post(route,{action:'reminders'})))[1].items.length,0);assert.equal((await post(route,{action:'create',id:crypto.randomUUID(),data:{...data,attendees:[]}})).status,200);}
 user=owner;assert.equal((await list()).count,1);
 assert.equal((await post(route,{action:'update',id,version:1,data:{...data,title:'Rescheduled'}})).status,200);
 assert.equal((await post(route,{action:'update',id,version:1,data})).status,409);
 user={userId:'agent',email:'agent@example.test',displayName:'Agent'};assert.equal((await json(await post(route,{action:'reminders'})))[1].items.length,1);
 user=owner;assert.equal((await post(route,{action:'cancel',id,version:2})).status,200);assert.equal((await list()).count,0);assert.equal((await json(await post(route,{action:'reminders'})))[1].items.length,0);
 assert.equal((await json(await route.GET(new Request('https://crm.test/api/meetings?status=cancelled'))))[1].count,1);
 for(const bad of [{...data,ends_at:data.starts_at},{...data,attendees:['unknown@example.test']},{...data,starts_at:new Date(0).toISOString()},{...data,reminder_minutes:17}])assert.equal((await post(route,{action:'create',id:crypto.randomUUID(),data:bad})).status,400);
 assert.equal((await route.POST(new Request('https://crm.test/api/meetings',{method:'POST',body:JSON.stringify(body)}))).status,403);
 const later=crypto.randomUUID();assert.equal((await post(route,{action:'create',id:later,data:{...data,starts_at:new Date(Date.now()+3600000).toISOString(),ends_at:new Date(Date.now()+7200000).toISOString()}})).status,200);
 assert.equal((await json(await post(route,{action:'reminders'})))[1].items.length,0);
 sqlite.prepare('UPDATE meetings SET starts_at=?,ends_at=? WHERE id=?').run(new Date(Date.now()-3600000).toISOString(),new Date(Date.now()-1000).toISOString(),later);
 assert.equal((await json(await post(route,{action:'reminders'})))[1].items.length,0);
 console.log('PASS: meetings participant privacy, all roles, organizer permissions, duplicate creation, reminder timing/dedup/rescheduling/cancellation, validation and CSRF.');
})().catch(e=>{console.error(e);process.exitCode=1;});
`);
