process.env.CRM_OWNER_EMAIL='owner@example.test';
const {DatabaseSync}=require('node:sqlite');
const ts=require('typescript');const fs=require('fs');const assert=require('node:assert/strict');
const sqlite=new DatabaseSync(':memory:');for(const p of fs.readdirSync('drizzle').filter(p=>p.endsWith('.sql')).sort())sqlite.exec(fs.readFileSync('drizzle/'+p,'utf8'));
class Statement{constructor(sql,args=[]){this.sql=sql;this.args=args;}bind(...a){return new Statement(this.sql,a)}async first(){return sqlite.prepare(this.sql).get(...this.args)||null}async all(){return {results:sqlite.prepare(this.sql).all(...this.args)}}async run(){const r=sqlite.prepare(this.sql).run(...this.args);return {meta:{changes:Number(r.changes)}}}}
const DB={prepare:s=>new Statement(s),batch:async statements=>{sqlite.exec('BEGIN');try{const r=[];for(const s of statements)r.push(await s.run());sqlite.exec('COMMIT');return r;}catch(e){sqlite.exec('ROLLBACK');throw e}}};
let user={userId:'owner-test',email:'owner@example.test',displayName:'Owner'};
const deps={'@/lib/runtime':{env:{DB}},'../app/session':{getCurrentUser:async()=>user}};
function load(path){const out=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const m={exports:{}};new Function('require','module','exports',out)(id=>deps[id]||require(id),m,m.exports);return m.exports;}
deps['./runtime']=deps['@/lib/runtime'];const access=load('lib/access.ts');deps['@/lib/access']=access;const notifications=load('lib/notifications.ts');deps['@/lib/notifications']=notifications;deps['./notifications']=notifications;const common=load('lib/crm.ts');deps['@/lib/crm']=common;deps['./crm']=common;const sound=load('lib/sound.ts');deps['./sound']=sound;deps['@/lib/sound']=sound;const settings=load('lib/settings.ts');deps['@/lib/settings']=settings;const sms=load('lib/sms.ts');deps['@/lib/sms']=sms;deps['./crm']=common;deps['@/lib/assign']=load('lib/assign.ts');deps['./assign']=deps['@/lib/assign'];const crmRoute=load('app/api/crm/route.ts');deps['../crm/route']=crmRoute;const msgLib=load('lib/messages.ts');deps['@/lib/messages']=msgLib;deps['./messages']=msgLib;const route=load('app/api/messages/route.ts');
async function crmPost(action,data){const r=await crmRoute.POST(new Request('https://crm.test/api/crm',{method:'POST',headers:{Origin:'https://crm.test','Content-Type':'application/json'},body:JSON.stringify({action,data})}));return [r.status,await r.json()];}
async function get(query=''){const r=await route.GET(new Request('https://crm.test/api/messages'+query));return [r.status,await r.json()];}
async function post(body){const r=await route.POST(new Request('https://crm.test/api/messages',{method:'POST',headers:{Origin:'https://crm.test','Content-Type':'application/json'},body:JSON.stringify(body)}));return [r.status,await r.json()];}
(async()=>{
 assert.equal((await crmPost('member',{email:'agent@example.test',name:'Agent',role:'agent',active:true}))[0],200);
 assert.equal((await crmPost('member',{email:'second@example.test',name:'Second',role:'agent',active:true}))[0],200);
 // DM: илгээх, унших, thread ачаалах.
 let [status,d]=await post({action:'send',peer:'agent@example.test',body:'Сайн байна уу'});assert.equal(status,200);const msgId=d.id;
 assert.equal((await post({action:'send',peer:'owner@example.test'}))[0],400); // missing body
 user={userId:'a',email:'agent@example.test',displayName:'Agent'};
 [status,d]=await get('?peer=owner@example.test');assert.equal(status,200);assert.equal(d.items.length,1);assert.equal(d.items[0].read_at,null);
 assert.equal((await post({action:'read',peer:'owner@example.test'}))[0],200);
 [status,d]=await get('?peer=owner@example.test');assert.ok(d.items[0].read_at);
 // Зураг илгээх: 5MB хүртэл, зөвшөөрөгдсөн MIME төрлийн base64 dataURL зөвшөөрнө; текстгүй (зурагтай ганцаараа) ч болно.
 const tinyPng='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
 [status,d]=await post({action:'send',peer:'owner@example.test',image:tinyPng});assert.equal(status,200);const imgMsgId=d.id;
 [status,d]=await get('?peer=owner@example.test');const imgMsg=d.items.find(m=>m.id===imgMsgId);assert.equal(imgMsg.image,tinyPng);assert.equal(imgMsg.body,'');
 assert.equal((await post({action:'send',peer:'owner@example.test',image:'data:text/plain;base64,aGk='}))[0],400); // зурагны бус MIME
 assert.equal((await post({action:'send',peer:'owner@example.test',image:'data:image/png;base64,'+'A'.repeat(7000000)}))[0],400); // 5MB-аас том
 // Reply: зөвхөн харилцан ярианы жинхэнэ оролцогч мессежийг эх сурвалж болгож чадна; сервэр өөрөө snapshot-ыг уншина.
 [status,d]=await post({action:'send',peer:'owner@example.test',body:'Тийм ээ',replyTo:msgId});assert.equal(status,200);
 [status,d]=await get('?peer=owner@example.test');const replied=d.items.find(m=>m.body==='Тийм ээ');
 assert.equal(replied.reply_to_id,msgId);assert.equal(replied.reply_to_sender,'owner@example.test');assert.equal(replied.reply_to_body,'Сайн байна уу');
 // Гуравдагч этгээдийн харилцан ярианы мессежийг хариулах эх сурвалж болгож чадахгүй.
 user={userId:'s',email:'second@example.test',displayName:'Second'};
 assert.equal((await post({action:'send',peer:'agent@example.test',body:'x',replyTo:msgId}))[0],400);
 // Reaction: нэмэх, дахин дарвал хасах (toggle); гуравдагч этгээдийн DM-д reaction нэмэх боломжгүй.
 assert.equal((await post({action:'react',kind:'dm',messageId:msgId,emoji:'👍'}))[0],404);
 user={userId:'a',email:'agent@example.test',displayName:'Agent'};
 [status,d]=await post({action:'react',kind:'dm',messageId:msgId,emoji:'👍'});assert.equal(status,200);assert.equal(d.reacted,true);
 [status,d]=await get('?peer=owner@example.test');assert.deepEqual(d.items.find(m=>m.id===msgId).reactions,[{emoji:'👍',count:1,mine:true,actors:['agent@example.test']}]);
 [status,d]=await post({action:'react',kind:'dm',messageId:msgId,emoji:'👍'});assert.equal(d.reacted,false);
 [status,d]=await get('?peer=owner@example.test');assert.deepEqual(d.items.find(m=>m.id===msgId).reactions,[]);
 // Багийн "all" суваг: бүх идэвхтэй ажилтан унших, хариулах, reaction нэмэх боломжтой.
 [status,d]=await post({action:'send_team',channel:'all',body:'Team hello'});assert.equal(status,200);const teamId=d.id;
 [status,d]=await post({action:'send_team',channel:'all',body:'reply',replyTo:teamId});assert.equal(status,200);
 [status,d]=await get('?team=1&channel=all');const teamReply=d.items.find(m=>m.body==='reply');assert.equal(teamReply.reply_to_id,teamId);assert.equal(teamReply.reply_to_sender,'agent@example.test');
 // @дурдах (mention): текстээс тухайн сувгийн гишүүдийн нэрийг серверт өөрөө тааруулж олно;
 // дурдагдсан хүний summary-д тухайн суваг "mentioned" гэж тэмдэглэгдэнэ, уншсаны дараа арилна.
 [status,d]=await post({action:'send_team',channel:'all',body:'@Second сайн уу'});assert.equal(status,200);
 [status,d]=await get('?team=1&channel=all');const mentionMsg=d.items.find(m=>m.body==='@Second сайн уу');
 assert.deepEqual(mentionMsg.mentions,['second@example.test']);assert.equal(mentionMsg.mentions_all,false);
 user={userId:'s',email:'second@example.test',displayName:'Second'};
 [status,d]=await get('?summary=1');assert.ok(d.channels.find(c=>c.channel==='all').mentioned);
 assert.equal((await post({action:'read_team',channel:'all'}))[0],200);
 [status,d]=await get('?summary=1');assert.ok(!d.channels.find(c=>c.channel==='all').mentioned);
 user={userId:'a',email:'agent@example.test',displayName:'Agent'};
 [status,d]=await post({action:'send_team',channel:'all',body:'@Бүгд анхаарна уу'});assert.equal(status,200);
 [status,d]=await get('?team=1&channel=all');const allMentionMsg=d.items.find(m=>m.body==='@Бүгд анхаарна уу');
 assert.equal(allMentionMsg.mentions_all,true);
 user={userId:'owner-test',email:'owner@example.test',displayName:'Owner'};
 [status,d]=await get('?summary=1');assert.ok(d.channels.find(c=>c.channel==='all').mentioned);
 assert.equal((await post({action:'react',kind:'team',messageId:teamId,emoji:'🔥'}))[0],200);
 [status,d]=await get('?team=1&channel=all');assert.deepEqual(d.items.find(m=>m.id===teamId).reactions,[{emoji:'🔥',count:1,mine:true,actors:['owner@example.test']}]);
 // Reaction actors: хэд хэдэн хүн ижил emoji-гоор reaction хийхэд бүгд actors жагсаалтад орно (хэн реакц хийснийг харуулах tooltip-д ашиглана).
 user={userId:'a',email:'agent@example.test',displayName:'Agent'};
 assert.equal((await post({action:'react',kind:'team',messageId:teamId,emoji:'🔥'}))[0],200);
 [status,d]=await get('?team=1&channel=all');const fireReaction=d.items.find(m=>m.id===teamId).reactions.find(r=>r.emoji==='🔥');
 assert.equal(fireReaction.count,2);assert.deepEqual(fireReaction.actors.slice().sort(),['agent@example.test','owner@example.test']);
 user={userId:'owner-test',email:'owner@example.test',displayName:'Owner'};
 assert.equal((await post({action:'react',kind:'team',messageId:'missing',emoji:'🔥'}))[0],404);
 assert.equal((await post({action:'react',kind:'dm',messageId:msgId,emoji:'toolongemoji123'}))[0],400);
 // Сувгийн эрх: Удирдлага (director) "Бүх ажилчид"-д огт ордоггүй, харин Маркетинг/Борлуулалт хоёуланд нь
 // хяналтын үүднээс хандана; Маркетинг эрхтэй хүн зөвхөн Маркетинг сувагт, агент зөвхөн Борлуулалт сувагт.
 assert.equal((await crmPost('member',{email:'director@example.test',name:'Director',role:'director',active:true}))[0],200);
 assert.equal((await crmPost('member',{email:'marketer@example.test',name:'Marketer',role:'marketing',active:true}))[0],200);
 user={userId:'d',email:'director@example.test',displayName:'Director'};
 assert.equal((await post({action:'send_team',channel:'all',body:'x'}))[0],403);
 assert.equal((await get('?team=1&channel=all'))[0],403);
 assert.equal((await post({action:'send_team',channel:'marketing',body:'Director in marketing'}))[0],200);
 assert.equal((await post({action:'send_team',channel:'sales',body:'Director in sales'}))[0],200);
 user={userId:'mk',email:'marketer@example.test',displayName:'Marketer'};
 assert.equal((await post({action:'send_team',channel:'all',body:'ok'}))[0],200);
 assert.equal((await post({action:'send_team',channel:'marketing',body:'ok'}))[0],200);
 assert.equal((await post({action:'send_team',channel:'sales',body:'nope'}))[0],403);
 assert.equal((await get('?team=1&channel=sales'))[0],403);
 user={userId:'a',email:'agent@example.test',displayName:'Agent'};
 assert.equal((await post({action:'send_team',channel:'sales',body:'ok'}))[0],200);
 assert.equal((await post({action:'send_team',channel:'marketing',body:'nope'}))[0],403);
 assert.equal((await post({action:'read_team',channel:'marketing'}))[0],403);
 // Суваг руу хариулах (reply) зөвхөн тухайн сувагт эрхтэй хүнд л ажиллана.
 user={userId:'mk',email:'marketer@example.test',displayName:'Marketer'};
 [status,d]=await get('?team=1&channel=marketing');const marketingMsgId=d.items[0].id;
 user={userId:'a',email:'agent@example.test',displayName:'Agent'};
 assert.equal((await post({action:'send_team',channel:'sales',body:'stolen quote',replyTo:marketingMsgId}))[0],400);
 // Хувийн чат (DM): Удирдлага зөвхөн Ахлах, Админтай харилцана; агент, маркетингийн ажилтантай хоёр
 // чиглэлд аль алинд нь DM бичих боломжгүй.
 user={userId:'owner-test',email:'owner@example.test',displayName:'Owner'};
 assert.equal((await crmPost('member',{email:'manager@example.test',name:'Manager',role:'manager',active:true}))[0],200);
 user={userId:'d',email:'director@example.test',displayName:'Director'};
 assert.equal((await post({action:'send',peer:'agent@example.test',body:'hi'}))[0],403);
 assert.equal((await post({action:'send',peer:'marketer@example.test',body:'hi'}))[0],403);
 assert.equal((await post({action:'send',peer:'owner@example.test',body:'hi admin'}))[0],200);
 assert.equal((await post({action:'send',peer:'manager@example.test',body:'hi manager'}))[0],200);
 user={userId:'a',email:'agent@example.test',displayName:'Agent'};
 assert.equal((await post({action:'send',peer:'director@example.test',body:'hi director'}))[0],403);
 user={userId:'mgr',email:'manager@example.test',displayName:'Manager'};
 assert.equal((await post({action:'send',peer:'director@example.test',body:'hi back'}))[0],200);
 // Хураангуй (summary): хүн бүр зөвхөн channelsForRole-оороо тодорхойлогдсон сувгуудын мэдээллийг л авна.
 user={userId:'d',email:'director@example.test',displayName:'Director'};
 [status,d]=await get('?summary=1');assert.equal(status,200);
 assert.deepEqual(d.channels.map(c=>c.channel).sort(),['marketing','sales']);
 user={userId:'owner-test',email:'owner@example.test',displayName:'Owner'};
 [status,d]=await get('?summary=1');assert.deepEqual(d.channels.map(c=>c.channel).sort(),['all','marketing','sales']);
 // Групп чат: зөвхөн Ахлах, Админ (isAdminLike) үүсгэнэ; идэвхтэй гишүүд л оруулж болно, сонгосон
 // гишүүд л уг сувагт унших/бичих боломжтой (тогтмол сувгуудтай адил channelAccess-ээр шалгагдана).
 user={userId:'a',email:'agent@example.test',displayName:'Agent'};
 assert.equal((await post({action:'create_group',name:'Project X',members:['manager@example.test']}))[0],403);
 user={userId:'mgr',email:'manager@example.test',displayName:'Manager'};
 assert.equal((await post({action:'create_group',name:'',members:['agent@example.test']}))[0],400); // хоосон нэр
 assert.equal((await post({action:'create_group',name:'Project X',members:['nobody@example.test']}))[0],400); // байхгүй гишүүн
 [status,d]=await post({action:'create_group',name:'Project X',members:['agent@example.test','second@example.test']});
 assert.equal(status,200);const groupId=d.id;
 assert.equal((await post({action:'send_team',channel:groupId,body:'Тавтай морил'}))[0],200);
 [status,d]=await get('?team=1&channel='+groupId);assert.equal(status,200);assert.equal(d.items.length,1);assert.equal(d.members.length,2);
 assert.deepEqual(d.members.map(x=>x.email).sort(),['agent@example.test','second@example.test']);
 user={userId:'mk',email:'marketer@example.test',displayName:'Marketer'};
 assert.equal((await get('?team=1&channel='+groupId))[0],403);
 assert.equal((await post({action:'send_team',channel:groupId,body:'x'}))[0],403);
 user={userId:'a',email:'agent@example.test',displayName:'Agent'};
 [status,d]=await get('?team=1&channel='+groupId);assert.equal(status,200);const welcomeId=d.items[0].id;
 assert.equal((await post({action:'send_team',channel:groupId,body:'Баярлалаа',replyTo:welcomeId}))[0],200);
 assert.equal((await post({action:'react',kind:'team',messageId:welcomeId,emoji:'👍'}))[0],200);
 assert.equal((await post({action:'read_team',channel:groupId}))[0],200);
 [status,d]=await get('?summary=1');assert.ok(d.channels.some(c=>c.channel===groupId&&c.label==='Project X'));
 user={userId:'mk',email:'marketer@example.test',displayName:'Marketer'};
 [status,d]=await get('?summary=1');assert.ok(!d.channels.some(c=>c.channel===groupId));
 // Sidebar totals must agree with chat summary, including membership and per-channel reads.
 const sidebar=async()=>{const r=await crmRoute.GET(new Request('https://crm.test/api/crm'));assert.equal(r.status,200);return r.json();};
 user={userId:'d',email:'director@example.test',displayName:'Director'};
 const before=(await sidebar()).unreadTeam;
 await msgLib.sendTeam('agent@example.test','all','Hidden all-staff message');
 await msgLib.sendTeam('agent@example.test',groupId,'Hidden private group message');
 assert.equal((await sidebar()).unreadTeam,before,'director badge must ignore inaccessible channels');
 await msgLib.sendTeam('agent@example.test','sales','Visible sales message');
 assert.equal((await sidebar()).unreadTeam,before+1);
 assert.equal((await sidebar()).unreadTeam,(await get('?summary=1'))[1].team);
 // Reading sales must not accidentally mark marketing or a private group as read.
 sqlite.prepare("INSERT INTO team_reads(email,channel,last_read_at) VALUES(?,'sales','9999-01-01') ON CONFLICT(email,channel) DO UPDATE SET last_read_at=excluded.last_read_at").run(user.email);
 await msgLib.sendTeam('marketer@example.test','marketing','Unread marketing message');
 assert.equal((await sidebar()).unreadTeam,(await get('?summary=1'))[1].team);
 assert.ok((await sidebar()).unreadTeam>0);
 // Joining/leaving a group immediately updates the sidebar scope.
 sqlite.prepare('INSERT INTO group_chat_members(channel_id,email) VALUES(?,?)').run(groupId,user.email);
 const joined=(await sidebar()).unreadTeam;
 assert.equal(joined,(await get('?summary=1'))[1].team);
 assert.ok(joined>before);
 sqlite.prepare('DELETE FROM group_chat_members WHERE channel_id=? AND email=?').run(groupId,user.email);
 assert.ok((await sidebar()).unreadTeam<joined);
 user={userId:'a',email:'agent@example.test',displayName:'Agent'};
 assert.equal((await sidebar()).unreadTeam,(await get('?summary=1'))[1].team);
 // Long conversations return the newest page and stable cursor pages, even with equal timestamps.
 const pageGroup=(await msgLib.createGroupChat('Pagination','owner@example.test',['agent@example.test'])).id;
 const pageStamp='2026-01-01T00:00:00.000Z';
 for(let i=0;i<205;i++){
  const id='page-'+String(i).padStart(3,'0');
  sqlite.prepare('INSERT INTO team_messages(id,channel,sender,body,created_at) VALUES(?,?,?,?,?)').run(id,pageGroup,'owner@example.test',id,pageStamp);
  sqlite.prepare('INSERT INTO messages(id,pair_key,sender,recipient,body,created_at) VALUES(?,?,?,?,?,?)').run(id,'agent@example.test|second@example.test','second@example.test','agent@example.test',id,pageStamp);
 }
 const newest=await msgLib.teamMessages('agent@example.test',pageGroup);
 assert.equal(newest.length,200);assert.equal(newest[0].id,'page-005');assert.equal(newest.at(-1).id,'page-204');
 const older=await msgLib.teamMessages('agent@example.test',pageGroup,newest[0].id);
 assert.equal(older.length,5);assert.equal(older[0].id,'page-000');
 assert.equal((await msgLib.teamMessages('agent@example.test','all',newest[0].id)).length,0,'cursor cannot escape channel');
 const dmNewest=await msgLib.thread('agent@example.test','second@example.test');
 assert.equal(dmNewest.length,200);assert.ok(dmNewest.some(m=>m.id==='page-204'));
 const dmOlder=await msgLib.thread('agent@example.test','second@example.test','page-005');assert.equal(dmOlder.length,5);
 await msgLib.markTeamRead('agent@example.test',pageGroup,pageStamp);
 await msgLib.sendTeam('owner@example.test',pageGroup,'Arrived after loaded snapshot');
 assert.equal(await msgLib.teamUnread('agent@example.test',pageGroup),1);
 await msgLib.markTeamRead('agent@example.test',pageGroup,'2025-01-01T00:00:00.000Z');
 assert.equal(await msgLib.teamUnread('agent@example.test',pageGroup),1,'stale reads cannot move the cursor backwards');
 await msgLib.markRead('agent@example.test','second@example.test',pageStamp);
 assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM messages WHERE id LIKE 'page-%' AND read_at IS NULL").get().n,0);
 console.log('PASS: latest chat pages, stable history cursors, cross-channel cursor isolation and bounded read receipts.');
 console.log('PASS: sidebar unread count respects director channel isolation, group membership and per-channel read timestamps.');
 console.log('PASS: DM send/read/thread, image attachments (size/MIME validation, image-only messages), reply snapshot integrity and cross-conversation rejection, reaction toggling and cross-user access control, team channel reply/react, per-role channel access control, director DM isolation (manager/admin only), manager/admin-created group chats with membership-based access control, and @mention/@all detection with per-channel "mentioned" summary flag.');
})().catch(e=>{console.error(e);process.exit(1)});
