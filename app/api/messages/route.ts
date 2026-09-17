import {member,Failure} from '@/lib/access';
import {env} from '@/lib/runtime';
import {conversations,thread,send,markRead,teamMessages,lastTeamMessage,sendTeam,markTeamRead,unreadTotal,teamUnread,teamReadState} from '@/lib/messages';
import {z} from 'zod';
export const dynamic='force-dynamic';
const db=()=>env.DB!;
const respondError=(e:unknown)=>Response.json({error:e instanceof z.ZodError?'Мессежийн хүсэлт буруу.':(e as Error).message},{status:(e as {status?:number}).status||400});
export async function GET(req:Request){try{
 const m=await member(),url=new URL(req.url);
 if(url.searchParams.get('summary')==='1'){const [dm,team,last]=await Promise.all([unreadTotal(m.email),teamUnread(m.email),lastTeamMessage()]);return Response.json({dm,team,total:dm+team,lastTeam:last||null},{headers:{'Cache-Control':'no-store'}});}
 if(url.searchParams.get('team')==='1'){const [items,reads]=await Promise.all([teamMessages(),teamReadState(m.email)]);return Response.json({items,reads},{headers:{'Cache-Control':'no-store'}});}
 const peer=(url.searchParams.get('peer')||'').trim().toLowerCase();
 if(peer)return Response.json({items:await thread(m.email,peer)},{headers:{'Cache-Control':'no-store'}});
 return Response.json({items:await conversations(m.email)},{headers:{'Cache-Control':'no-store'}});
}catch(e){return respondError(e);}}
export async function POST(req:Request){try{
 if(req.headers.get('origin')!==new URL(req.url).origin)return Response.json({error:'Зөвшөөрөгдөхгүй хүсэлт.'},{status:403});
 const m=await member();const text=await req.text();if(text.length>10000)return Response.json({error:'Хүсэлт хэт том.'},{status:413});
 const b=z.discriminatedUnion('action',[z.object({action:z.literal('send'),peer:z.string().email(),body:z.string().trim().min(1).max(2000)}),z.object({action:z.literal('read'),peer:z.string().email()}),z.object({action:z.literal('send_team'),body:z.string().trim().min(1).max(2000)}),z.object({action:z.literal('read_team')})]).parse(JSON.parse(text));
 if(b.action==='send_team'){const r=await sendTeam(m.email,b.body);return Response.json({ok:true,...r});}
 if(b.action==='read_team'){await markTeamRead(m.email);return Response.json({ok:true});}
 const peer=b.peer.toLowerCase();if(peer===m.email)throw new Failure('Өөртөө мессеж илгээх боломжгүй.');
 if(!await db().prepare('SELECT 1 FROM members WHERE email=? AND active=1').bind(peer).first())throw new Failure('Идэвхтэй ажилтан сонгоно уу.');
 if(b.action==='send'){const r=await send(m.email,peer,b.body);return Response.json({ok:true,...r});}
 await markRead(m.email,peer);return Response.json({ok:true});
}catch(e){return respondError(e);}}
