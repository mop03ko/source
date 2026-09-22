import {member,Failure,isSameOrigin} from '@/lib/access';
import {env} from '@/lib/runtime';
import {conversations,thread,send,markRead,teamMessages,lastTeamMessage,sendTeam,markTeamRead,unreadTotal,teamUnread,teamMentioned,teamReadState,messageSnapshot,toggleReaction,channelAccess,myGroupChats,groupChatRoster,createGroupChat} from '@/lib/messages';
import {teamChannels,channelsForRole,canDm,isAdminLike} from '@/lib/crm';
import {z} from 'zod';
export const dynamic='force-dynamic';
const db=()=>env.DB!;
// Keep each expression shallow enough for libSQL's parser while folding Cyrillic.
function searchSql(table:'messages'|'team_messages',scope:string,search:string){
 const letters=[...new Set(search.toUpperCase().match(/[А-ЯӨҮЁ]/g)||[])];
 const stages=[`s0 AS MATERIALIZED (SELECT id,sender,body,created_at,lower(body) folded FROM ${table} WHERE ${scope})`];
 for(let i=0;i<letters.length;i+=8){const expression=letters.slice(i,i+8).reduce((sql,c)=>`replace(${sql},'${c}','${c.toLowerCase()}')`,'folded');stages.push(`s${stages.length} AS MATERIALIZED (SELECT id,sender,body,created_at,${expression} folded FROM s${stages.length-1})`);}
 return `WITH ${stages.join(',')} SELECT id,sender,body,created_at FROM s${stages.length-1} WHERE instr(folded,?)>0 ORDER BY created_at DESC,id DESC LIMIT 50`;
}
const respondError=(e:unknown)=>Response.json({error:e instanceof z.ZodError?'Мессежийн хүсэлт буруу.':(e as Error).message},{status:(e as {status?:number}).status||400});
// Тогтмол 3 сувгаас гадна Ахлах, Админ үүсгэсэн групп чатын id (UUID) энд орох тул чөлөөт стринг болгосон;
// хандах эрхийг channelAccess() өөрөө (тогтмол бол channelsForRole, групп бол гишүүнчлэл) шалгана.
const channelSchema=z.string().min(1).max(80);
const canCreateGroup=(role:string)=>role==='manager'||isAdminLike(role);
// Тухайн сувагт харагдах бүх идэвхтэй гишүүд: тогтмол суваг бол role-оор шүүнэ, групп чат бол гишүүнчлэлээр.
// @дурдах (mention) сонголт болон "N/M үзсэн" тоо хоёулаа энэ жагсаалтыг ашиглана.
async function channelRoster(channel:string):Promise<{email:string;name:string}[]>{
 if(Object.hasOwn(teamChannels,channel)){
  const rows=await db().prepare('SELECT email,name,role FROM members WHERE active=1').all<{email:string;name:string;role:string}>();
  return rows.results.filter(r=>channelsForRole(r.role).includes(channel));
 }
 return groupChatRoster(channel);
}
// Мессежийн текстээс "@Нэр" хэлбэрийн дурдалтуудыг тухайн сувгийн гишүүдийн нэртэй тааруулж олно;
// клиентээс ирсэн mention-г итгэмжлэхгүй, серверт өөрөө дахин тооцоолж баталгаажуулна.
function parseMentions(body:string,roster:{email:string;name:string}[]){
 const mentionsAll=/(^|[^\p{L}\p{N}_])@(Бүгд|бүгд|all)(?![\p{L}\p{N}_])/u.test(' '+body);
 const mentions=roster.filter(r=>body.includes('@'+r.name)).map(r=>r.email);
 return {mentions,mentionsAll};
}
// base64-руу хөрвүүлэхэд эх файлын хэмжээ ойролцоогоор 4/3 дахин нэмэгддэг тул 5MB-ийн decode-той тааруулав.
const MAX_IMAGE_B64=Math.ceil(5*1024*1024/3)*4+64;
const imageSchema=z.string().refine(v=>/^data:image\/(png|jpeg|webp|gif);base64,/.test(v),'Зөвхөн PNG/JPEG/WEBP/GIF зураг оруулна уу.').refine(v=>v.length<=MAX_IMAGE_B64,'Зургийн хэмжээ 5MB-аас бага байна.');
export async function GET(req:Request){try{
 const m=await member(),url=new URL(req.url),myChannels=channelsForRole(m.role);
 const search=z.string().trim().max(100).parse(url.searchParams.get('search')||'');
 const imageId=url.searchParams.get('image');
 if(imageId){
  const id=z.string().min(1).max(80).parse(imageId),kind=z.enum(['dm','team']).parse(url.searchParams.get('kind'));
  if(!await messageSnapshot(kind,id,m))throw new Failure('Зураг олдсонгүй.',404);
  const row=await db().prepare(`SELECT image FROM ${kind==='dm'?'messages':'team_messages'} WHERE id=?`).bind(id).first<{image:string|null}>();
  const match=row?.image?.match(/^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/);
  if(!match)throw new Failure('Зураг олдсонгүй.',404);
  return new Response(Buffer.from(match[2],'base64'),{headers:{'Content-Type':match[1],'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 }
 const before=z.string().min(1).max(80).optional().parse(url.searchParams.get('before')||undefined);
 if(url.searchParams.get('summary')==='1'){
  const groups=await myGroupChats(m.email);
  const [dm,perChannel,perGroup]=await Promise.all([
   unreadTotal(m.email),
   Promise.all(myChannels.map(async c=>({channel:c,label:teamChannels[c],unread:await teamUnread(m.email,c),mentioned:await teamMentioned(m.email,c),last:await lastTeamMessage(c)||null,group:false}))),
   Promise.all(groups.map(async g=>({channel:g.id,label:g.name,unread:await teamUnread(m.email,g.id),mentioned:await teamMentioned(m.email,g.id),last:await lastTeamMessage(g.id)||null,group:true}))),
  ]);
  const all=[...perChannel,...perGroup];
  const team=all.reduce((n,c)=>n+c.unread,0);
  return Response.json({dm,team,total:dm+team,channels:all},{headers:{'Cache-Control':'no-store'}});
 }
 if(url.searchParams.get('team')==='1'){
  const channel=channelSchema.safeParse(url.searchParams.get('channel')||'all');
  if(!channel.success)throw new Failure('Энэ сувагт хандах эрхгүй.',403);
  const access=await channelAccess(m,channel.data);
  if(!access.ok)throw new Failure('Энэ сувагт хандах эрхгүй.',403);
  if(search){const items=await db().prepare(searchSql('team_messages','channel=?',search)).bind(channel.data,search.toLowerCase()).all();return Response.json({items:items.results},{headers:{'Cache-Control':'no-store'}});}
  const [items,reads,roster]=await Promise.all([teamMessages(m.email,channel.data,before),teamReadState(m.email,channel.data),channelRoster(channel.data)]);
  return Response.json({items,reads,members:roster.filter(r=>r.email!==m.email)},{headers:{'Cache-Control':'no-store'}});
 }
 const peer=(url.searchParams.get('peer')||'').trim().toLowerCase();
 if(peer&&search){const items=await db().prepare(searchSql('messages','pair_key=?',search)).bind([m.email,peer].sort().join('|'),search.toLowerCase()).all();return Response.json({items:items.results},{headers:{'Cache-Control':'no-store'}});}
 if(peer)return Response.json({items:await thread(m.email,peer,before)},{headers:{'Cache-Control':'no-store'}});
 return Response.json({items:await conversations(m.email)},{headers:{'Cache-Control':'no-store'}});
}catch(e){return respondError(e);}}
export async function POST(req:Request){try{
 if(!isSameOrigin(req))return Response.json({error:'Зөвшөөрөгдөхгүй хүсэлт.'},{status:403});
 if(Number(req.headers.get('content-length')||0)>MAX_IMAGE_B64+10000)return Response.json({error:'Файл хэт том.'},{status:413});
 const m=await member();const text=await req.text();if(text.length>MAX_IMAGE_B64+10000)return Response.json({error:'Хүсэлт хэт том.'},{status:413});
 const b=z.discriminatedUnion('action',[
  z.object({action:z.literal('send'),peer:z.string().email(),body:z.string().trim().max(2000).default(''),image:imageSchema.optional(),replyTo:z.string().max(80).optional()}),
  z.object({action:z.literal('read'),peer:z.string().email(),through:z.string().datetime().optional()}),
  z.object({action:z.literal('send_team'),channel:channelSchema,body:z.string().trim().max(2000).default(''),image:imageSchema.optional(),replyTo:z.string().max(80).optional()}),
  z.object({action:z.literal('read_team'),channel:channelSchema,through:z.string().datetime().optional()}),
  z.object({action:z.literal('react'),kind:z.enum(['dm','team']),messageId:z.string().max(80),emoji:z.string().trim().min(1).max(8)}),
  z.object({action:z.literal('create_group'),name:z.string().trim().min(1).max(80),members:z.array(z.string().email()).min(1).max(200)}),
 ]).parse(JSON.parse(text));
 if((b.action==='send'||b.action==='send_team')&&!b.body.trim()&&!b.image)throw new Failure('Мессеж эсвэл зураг оруулна уу.');
 if(b.action==='create_group'){
  // Зөвхөн Ахлах, Админ (Удирдлага орно) шинэ групп чат үүсгэнэ; идэвхтэй гишүүдийг л оруулна.
  if(!canCreateGroup(m.role))throw new Failure('Зөвхөн Ахлах, Админ групп чат үүсгэнэ.',403);
  const emails=Array.from(new Set(b.members.map(e=>e.toLowerCase()))).filter(e=>e!==m.email);
  if(!emails.length)throw new Failure('Дор хаяж нэг гишүүн сонгоно уу.');
  const rows=await db().prepare(`SELECT email FROM members WHERE active=1 AND email IN (${emails.map(()=>'?').join(',')})`).bind(...emails).all<{email:string}>();
  if(rows.results.length!==emails.length)throw new Failure('Идэвхтэй гишүүд сонгоно уу.');
  const r=await createGroupChat(b.name,m.email,emails);
  return Response.json({ok:true,...r});
 }
 if(b.action==='send_team'){
  const access=await channelAccess(m,b.channel);
  if(!access.ok)throw new Failure('Энэ сувагт бичих эрхгүй.',403);
  let replyTo=null;
  if(b.replyTo){replyTo=await messageSnapshot('team',b.replyTo,m);if(!replyTo)throw new Failure('Хариулах мессеж олдсонгүй.');}
  const roster=await channelRoster(b.channel);
  const {mentions,mentionsAll}=parseMentions(b.body,roster);
  const r=await sendTeam(m.email,b.channel,b.body,replyTo,b.image,mentions,mentionsAll);return Response.json({ok:true,...r});
 }
 if(b.action==='read_team'){
  const access=await channelAccess(m,b.channel);
  if(!access.ok)throw new Failure('Энэ сувагт хандах эрхгүй.',403);
  await markTeamRead(m.email,b.channel,b.through&&b.through<new Date().toISOString()?b.through:new Date().toISOString());return Response.json({ok:true});
 }
 if(b.action==='react'){
  // Reaction зөвхөн харах эрхтэй мессежид л зөвшөөрнө (DM бол sender/recipient, суваг бол channelsForRole); messageSnapshot энэ шалгалтыг хийнэ.
  const snap=await messageSnapshot(b.kind,b.messageId,m);
  if(!snap)throw new Failure('Мессеж олдсонгүй эсвэл хандах эрхгүй.',404);
  const r=await toggleReaction(b.kind,b.messageId,b.emoji,m.email);
  return Response.json({ok:true,...r});
 }
 const peer=b.peer.toLowerCase();if(peer===m.email)throw new Failure('Өөртөө мессеж илгээх боломжгүй.');
 const peerRow=await db().prepare('SELECT role FROM members WHERE email=? AND active=1').bind(peer).first<{role:string}>();
 if(!peerRow)throw new Failure('Идэвхтэй ажилтан сонгоно уу.');
 if(b.action==='send'){
  // Удирдлага зөвхөн Ахлах, Админтай хувийн чатаар харилцана (canDm нь channelsForRole-той адил
  // алдаагаа тусгаарлагдсан харилцааг хамгаалдаг дүрэм).
  if(!canDm(m.role,peerRow.role))throw new Failure('Энэ ажилтантай хувийн чатаар харилцах эрхгүй.',403);
  let replyTo=null;
  if(b.replyTo){replyTo=await messageSnapshot('dm',b.replyTo,m);if(!replyTo)throw new Failure('Хариулах мессеж олдсонгүй.');}
  const r=await send(m.email,peer,b.body,replyTo,b.image);return Response.json({ok:true,...r});
 }
 await markRead(m.email,peer,b.through&&b.through<new Date().toISOString()?b.through:new Date().toISOString());return Response.json({ok:true});
}catch(e){return respondError(e);}}
