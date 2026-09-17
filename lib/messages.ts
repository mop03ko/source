import {env} from './runtime';
const db=()=>env.DB!;
export const pairKey=(a:string,b:string)=>[a,b].sort().join('|');
export type Message={id:string;pair_key:string;sender:string;recipient:string;body:string;created_at:string;read_at:string|null};
// Хамтрагч тус бүрийн сүүлийн мессеж, уншаагүй тоог нэг дороос гаргана (харилцан яриаг жагсаах жагсаалт).
export async function conversations(email:string){
 const [last,unread]=await Promise.all([
 db().prepare(`SELECT peer,body,created_at,sender FROM (SELECT CASE WHEN sender=? THEN recipient ELSE sender END peer,body,created_at,sender,ROW_NUMBER() OVER (PARTITION BY CASE WHEN sender=? THEN recipient ELSE sender END ORDER BY created_at DESC) rn FROM messages WHERE sender=? OR recipient=?) WHERE rn=1 ORDER BY created_at DESC`).bind(email,email,email,email).all<{peer:string;body:string;created_at:string;sender:string}>(),
 db().prepare('SELECT sender peer,COUNT(*) count FROM messages WHERE recipient=? AND read_at IS NULL GROUP BY sender').bind(email).all<{peer:string;count:number}>()]);
 const unreadMap=new Map(unread.results.map(r=>[r.peer,r.count]));
 return last.results.map(r=>({peer:r.peer,body:r.body,created_at:r.created_at,mine:r.sender===email,unread:unreadMap.get(r.peer)||0}));
}
export async function unreadTotal(email:string){
 const r=await db().prepare('SELECT COUNT(*) total FROM messages WHERE recipient=? AND read_at IS NULL').bind(email).first<{total:number}>();
 return r?.total||0;
}
export async function thread(email:string,peer:string){
 const r=await db().prepare('SELECT * FROM messages WHERE pair_key=? ORDER BY created_at ASC LIMIT 200').bind(pairKey(email,peer)).all<Message>();
 return r.results;
}
export async function send(sender:string,recipient:string,body:string){
 const id=crypto.randomUUID(),now=new Date().toISOString();
 await db().prepare('INSERT INTO messages(id,pair_key,sender,recipient,body,created_at) VALUES(?,?,?,?,?,?)').bind(id,pairKey(sender,recipient),sender,recipient,body,now).run();
 return {id,created_at:now};
}
export async function markRead(email:string,peer:string){
 await db().prepare('UPDATE messages SET read_at=? WHERE recipient=? AND sender=? AND read_at IS NULL').bind(new Date().toISOString(),email,peer).run();
}
export type TeamMessage={id:string;sender:string;body:string;created_at:string};
export async function teamMessages(){
 const r=await db().prepare('SELECT * FROM team_messages ORDER BY created_at ASC LIMIT 200').all<TeamMessage>();
 return r.results;
}
export async function lastTeamMessage(){
 return db().prepare('SELECT sender,body,created_at FROM team_messages ORDER BY created_at DESC LIMIT 1').first<{sender:string;body:string;created_at:string}>();
}
export async function sendTeam(sender:string,body:string){
 const id=crypto.randomUUID(),now=new Date().toISOString();
 await db().prepare('INSERT INTO team_messages(id,sender,body,created_at) VALUES(?,?,?,?)').bind(id,sender,body,now).run();
 return {id,created_at:now};
}
export async function markTeamRead(email:string){
 await db().prepare('INSERT INTO team_reads(email,last_read_at) VALUES(?,?) ON CONFLICT(email) DO UPDATE SET last_read_at=excluded.last_read_at').bind(email,new Date().toISOString()).run();
}
// Багийн мессеж бүрт хэн уншсаныг тус тусад нь хадгалдаггүй тул идэвхтэй гишүүн бүрийн сүүлд уншсан
// цагийг буцааж, клиент талд мессеж бүрийн "үзсэн" тоог тооцоолно.
export async function teamReadState(exclude:string){
 const r=await db().prepare('SELECT tr.email,tr.last_read_at FROM team_reads tr JOIN members m ON m.email=tr.email WHERE m.active=1 AND tr.email!=?').bind(exclude).all<{email:string;last_read_at:string}>();
 return r.results;
}
// Мессеж тус бүрээр уншсан тэмдэг хадгалахгүй тул илгээгч бус хүн бүрийн сүүлд уншсан цагаас хойшхи мессежийг тоолно.
export async function teamUnread(email:string){
 const r=await db().prepare(`SELECT COUNT(*) total FROM team_messages WHERE sender!=? AND created_at>COALESCE((SELECT last_read_at FROM team_reads WHERE email=?),'')`).bind(email,email).first<{total:number}>();
 return r?.total||0;
}
