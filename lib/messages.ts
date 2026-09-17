import {env} from './runtime';
import {channelsForRole} from './crm';
const db=()=>env.DB!;
export const pairKey=(a:string,b:string)=>[a,b].sort().join('|');
export type Reaction={emoji:string;count:number;mine:boolean;actors:string[]};
export type ReplySnapshot={id:string;sender:string;body:string};
export type Message={id:string;pair_key:string;sender:string;recipient:string;body:string;created_at:string;read_at:string|null;reply_to_id:string|null;reply_to_sender:string|null;reply_to_body:string|null;image:string|null;reactions:Reaction[]};
// DM болон багийн мессеж хоёуланд нь ашиглагдана; message_id-уудыг багцаар нэг query-ээр татаж
// (N+1 хийхгүй) мессеж бүрд нь хавсаргана.
async function attachReactions<T extends {id:string}>(kind:'dm'|'team',rows:T[],viewer:string):Promise<(T&{reactions:Reaction[]})[]>{
 if(!rows.length)return [];
 const ids=rows.map(r=>r.id);
 // group_concat-аар тухайн (мессеж,emoji) хосын reaction хийсэн бүх хүний имэйлийг нэг мөрөнд авчирна (хэн гэдгийг харуулах tooltip-д ашиглана).
 const r=await db().prepare(`SELECT message_id,emoji,COUNT(*) count,COALESCE(SUM(actor=?),0) mine,group_concat(actor) actors FROM message_reactions WHERE message_kind=? AND message_id IN (${ids.map(()=>'?').join(',')}) GROUP BY message_id,emoji`).bind(viewer,kind,...ids).all<{message_id:string;emoji:string;count:number;mine:number;actors:string}>();
 const map=new Map<string,Reaction[]>();
 for(const row of r.results){const list=map.get(row.message_id)||[];list.push({emoji:row.emoji,count:row.count,mine:!!row.mine,actors:row.actors?row.actors.split(','):[]});map.set(row.message_id,list);}
 return rows.map(row=>({...row,reactions:map.get(row.id)||[]}));
}
// Reply болон reaction хоёулаа зөвхөн жинхэнэ оршдог, харах эрхтэй мессеж рүү л заана; клиентээс
// ирсэн санамсаргүй snapshot текстийг итгэмжлэхгүй, сервэр өөрөө бодит мөрөөс уншиж баталгаажуулна.
// DM-д sender/recipient байхыг, багийн сувагт тухайн хэрэглэгчийн эрх (channelsForRole) уг мессежийн
// сувгийг агуулж байгааг шалгана.
export async function messageSnapshot(kind:'dm'|'team',messageId:string,viewer:{email:string;role:string}):Promise<ReplySnapshot|null>{
 if(kind==='team'){
  const t=await db().prepare('SELECT id,sender,body,channel FROM team_messages WHERE id=?').bind(messageId).first<ReplySnapshot&{channel:string}>();
  if(!t||!channelsForRole(viewer.role).includes(t.channel))return null;
  return {id:t.id,sender:t.sender,body:t.body};
 }
 const m=await db().prepare('SELECT id,sender,recipient,body FROM messages WHERE id=?').bind(messageId).first<ReplySnapshot&{recipient:string}>();
 if(!m||(m.sender!==viewer.email&&m.recipient!==viewer.email))return null;
 return {id:m.id,sender:m.sender,body:m.body};
}
export async function toggleReaction(kind:'dm'|'team',messageId:string,emoji:string,actor:string){
 const existing=await db().prepare('SELECT id FROM message_reactions WHERE message_kind=? AND message_id=? AND emoji=? AND actor=?').bind(kind,messageId,emoji,actor).first<{id:string}>();
 if(existing){await db().prepare('DELETE FROM message_reactions WHERE id=?').bind(existing.id).run();return {reacted:false};}
 await db().prepare('INSERT INTO message_reactions(id,message_kind,message_id,emoji,actor,created_at) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),kind,messageId,emoji,actor,new Date().toISOString()).run();
 return {reacted:true};
}
// Хамтрагч тус бүрийн сүүлийн мессеж, уншаагүй тоог нэг дороос гаргана (харилцан яриаг жагсаах жагсаалт).
export async function conversations(email:string){
 const [last,unread]=await Promise.all([
 db().prepare(`SELECT peer,body,created_at,sender,image FROM (SELECT CASE WHEN sender=? THEN recipient ELSE sender END peer,body,created_at,sender,image,ROW_NUMBER() OVER (PARTITION BY CASE WHEN sender=? THEN recipient ELSE sender END ORDER BY created_at DESC) rn FROM messages WHERE sender=? OR recipient=?) WHERE rn=1 ORDER BY created_at DESC`).bind(email,email,email,email).all<{peer:string;body:string;created_at:string;sender:string;image:string|null}>(),
 db().prepare('SELECT sender peer,COUNT(*) count FROM messages WHERE recipient=? AND read_at IS NULL GROUP BY sender').bind(email).all<{peer:string;count:number}>()]);
 const unreadMap=new Map(unread.results.map(r=>[r.peer,r.count]));
 return last.results.map(r=>({peer:r.peer,body:r.body,created_at:r.created_at,mine:r.sender===email,unread:unreadMap.get(r.peer)||0,image:r.image}));
}
export async function unreadTotal(email:string){
 const r=await db().prepare('SELECT COUNT(*) total FROM messages WHERE recipient=? AND read_at IS NULL').bind(email).first<{total:number}>();
 return r?.total||0;
}
export async function thread(email:string,peer:string){
 const r=await db().prepare('SELECT * FROM messages WHERE pair_key=? ORDER BY created_at ASC LIMIT 200').bind(pairKey(email,peer)).all<Message>();
 return attachReactions('dm',r.results,email);
}
export async function send(sender:string,recipient:string,body:string,replyTo?:ReplySnapshot|null,image?:string|null){
 const id=crypto.randomUUID(),now=new Date().toISOString();
 await db().prepare('INSERT INTO messages(id,pair_key,sender,recipient,body,created_at,reply_to_id,reply_to_sender,reply_to_body,image) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(id,pairKey(sender,recipient),sender,recipient,body,now,replyTo?.id||null,replyTo?.sender||null,replyTo?.body.slice(0,300)||null,image||null).run();
 return {id,created_at:now};
}
export async function markRead(email:string,peer:string){
 await db().prepare('UPDATE messages SET read_at=? WHERE recipient=? AND sender=? AND read_at IS NULL').bind(new Date().toISOString(),email,peer).run();
}
export type TeamMessage={id:string;channel:string;sender:string;body:string;created_at:string;reply_to_id:string|null;reply_to_sender:string|null;reply_to_body:string|null;image:string|null;reactions:Reaction[]};
export async function teamMessages(viewer:string,channel:string){
 const r=await db().prepare('SELECT * FROM team_messages WHERE channel=? ORDER BY created_at ASC LIMIT 200').bind(channel).all<TeamMessage>();
 return attachReactions('team',r.results,viewer);
}
export async function lastTeamMessage(channel:string){
 return db().prepare('SELECT sender,body,created_at,image FROM team_messages WHERE channel=? ORDER BY created_at DESC LIMIT 1').bind(channel).first<{sender:string;body:string;created_at:string;image:string|null}>();
}
export async function sendTeam(sender:string,channel:string,body:string,replyTo?:ReplySnapshot|null,image?:string|null){
 const id=crypto.randomUUID(),now=new Date().toISOString();
 await db().prepare('INSERT INTO team_messages(id,channel,sender,body,created_at,reply_to_id,reply_to_sender,reply_to_body,image) VALUES(?,?,?,?,?,?,?,?,?)').bind(id,channel,sender,body,now,replyTo?.id||null,replyTo?.sender||null,replyTo?.body.slice(0,300)||null,image||null).run();
 return {id,created_at:now};
}
export async function markTeamRead(email:string,channel:string){
 await db().prepare('INSERT INTO team_reads(email,channel,last_read_at) VALUES(?,?,?) ON CONFLICT(email,channel) DO UPDATE SET last_read_at=excluded.last_read_at').bind(email,channel,new Date().toISOString()).run();
}
// Багийн мессеж бүрт хэн уншсаныг тус тусад нь хадгалдаггүй тул тухайн сувгийн идэвхтэй гишүүн бүрийн
// сүүлд уншсан цагийг буцааж, клиент талд мессеж бүрийн "үзсэн" тоог тооцоолно.
export async function teamReadState(exclude:string,channel:string){
 const r=await db().prepare('SELECT tr.email,tr.last_read_at FROM team_reads tr JOIN members m ON m.email=tr.email WHERE m.active=1 AND tr.email!=? AND tr.channel=?').bind(exclude,channel).all<{email:string;last_read_at:string}>();
 return r.results;
}
// Мессеж тус бүрээр уншсан тэмдэг хадгалахгүй тул илгээгч бус хүн бүрийн сүүлд уншсан цагаас хойшхи мессежийг тоолно.
export async function teamUnread(email:string,channel:string){
 const r=await db().prepare(`SELECT COUNT(*) total FROM team_messages WHERE channel=? AND sender!=? AND created_at>COALESCE((SELECT last_read_at FROM team_reads WHERE email=? AND channel=?),'')`).bind(channel,email,email,channel).first<{total:number}>();
 return r?.total||0;
}
