import {member,Failure} from '@/lib/access';
import {env} from '@/lib/runtime';
import {conversations,thread,send,markRead,teamMessages,lastTeamMessage,sendTeam,markTeamRead,unreadTotal,teamUnread,teamReadState,messageSnapshot,toggleReaction} from '@/lib/messages';
import {teamChannels,channelsForRole} from '@/lib/crm';
import {z} from 'zod';
export const dynamic='force-dynamic';
const db=()=>env.DB!;
const respondError=(e:unknown)=>Response.json({error:e instanceof z.ZodError?'Мессежийн хүсэлт буруу.':(e as Error).message},{status:(e as {status?:number}).status||400});
const channelSchema=z.enum(Object.keys(teamChannels) as [string,...string[]]);
export async function GET(req:Request){try{
 const m=await member(),url=new URL(req.url),myChannels=channelsForRole(m.role);
 if(url.searchParams.get('summary')==='1'){
  const [dm,perChannel]=await Promise.all([
   unreadTotal(m.email),
   Promise.all(myChannels.map(async c=>({channel:c,label:teamChannels[c],unread:await teamUnread(m.email,c),last:await lastTeamMessage(c)||null}))),
  ]);
  const team=perChannel.reduce((n,c)=>n+c.unread,0);
  return Response.json({dm,team,total:dm+team,channels:perChannel},{headers:{'Cache-Control':'no-store'}});
 }
 if(url.searchParams.get('team')==='1'){
  const channel=channelSchema.safeParse(url.searchParams.get('channel')||'all');
  if(!channel.success||!myChannels.includes(channel.data))throw new Failure('Энэ сувагт хандах эрхгүй.',403);
  const [items,reads]=await Promise.all([teamMessages(m.email,channel.data),teamReadState(m.email,channel.data)]);
  return Response.json({items,reads},{headers:{'Cache-Control':'no-store'}});
 }
 const peer=(url.searchParams.get('peer')||'').trim().toLowerCase();
 if(peer)return Response.json({items:await thread(m.email,peer)},{headers:{'Cache-Control':'no-store'}});
 return Response.json({items:await conversations(m.email)},{headers:{'Cache-Control':'no-store'}});
}catch(e){return respondError(e);}}
export async function POST(req:Request){try{
 if(req.headers.get('origin')!==new URL(req.url).origin)return Response.json({error:'Зөвшөөрөгдөхгүй хүсэлт.'},{status:403});
 const m=await member();const text=await req.text();if(text.length>10000)return Response.json({error:'Хүсэлт хэт том.'},{status:413});
 const b=z.discriminatedUnion('action',[
  z.object({action:z.literal('send'),peer:z.string().email(),body:z.string().trim().min(1).max(2000),replyTo:z.string().max(80).optional()}),
  z.object({action:z.literal('read'),peer:z.string().email()}),
  z.object({action:z.literal('send_team'),channel:channelSchema,body:z.string().trim().min(1).max(2000),replyTo:z.string().max(80).optional()}),
  z.object({action:z.literal('read_team'),channel:channelSchema}),
  z.object({action:z.literal('react'),kind:z.enum(['dm','team']),messageId:z.string().max(80),emoji:z.string().trim().min(1).max(8)}),
 ]).parse(JSON.parse(text));
 const myChannels=channelsForRole(m.role);
 if(b.action==='send_team'){
  if(!myChannels.includes(b.channel))throw new Failure('Энэ сувагт бичих эрхгүй.',403);
  let replyTo=null;
  if(b.replyTo){replyTo=await messageSnapshot('team',b.replyTo,m);if(!replyTo)throw new Failure('Хариулах мессеж олдсонгүй.');}
  const r=await sendTeam(m.email,b.channel,b.body,replyTo);return Response.json({ok:true,...r});
 }
 if(b.action==='read_team'){
  if(!myChannels.includes(b.channel))throw new Failure('Энэ сувагт хандах эрхгүй.',403);
  await markTeamRead(m.email,b.channel);return Response.json({ok:true});
 }
 if(b.action==='react'){
  // Reaction зөвхөн харах эрхтэй мессежид л зөвшөөрнө (DM бол sender/recipient, суваг бол channelsForRole); messageSnapshot энэ шалгалтыг хийнэ.
  const snap=await messageSnapshot(b.kind,b.messageId,m);
  if(!snap)throw new Failure('Мессеж олдсонгүй эсвэл хандах эрхгүй.',404);
  const r=await toggleReaction(b.kind,b.messageId,b.emoji,m.email);
  return Response.json({ok:true,...r});
 }
 const peer=b.peer.toLowerCase();if(peer===m.email)throw new Failure('Өөртөө мессеж илгээх боломжгүй.');
 if(!await db().prepare('SELECT 1 FROM members WHERE email=? AND active=1').bind(peer).first())throw new Failure('Идэвхтэй ажилтан сонгоно уу.');
 if(b.action==='send'){
  let replyTo=null;
  if(b.replyTo){replyTo=await messageSnapshot('dm',b.replyTo,m);if(!replyTo)throw new Failure('Хариулах мессеж олдсонгүй.');}
  const r=await send(m.email,peer,b.body,replyTo);return Response.json({ok:true,...r});
 }
 await markRead(m.email,peer);return Response.json({ok:true});
}catch(e){return respondError(e);}}
