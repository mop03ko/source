import {z} from 'zod';
import {env} from '@/lib/runtime';
import {member,Failure,isSameOrigin} from '@/lib/access';
export const dynamic='force-dynamic';
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
function error(e:unknown){return json({error:e instanceof Failure?e.message:e instanceof z.ZodError||e instanceof SyntaxError?'Уулзалтын мэдээлэл, эхлэх болон дуусах цагаа шалгана уу.':'Уулзалтын үйлдэл амжилтгүй. Дахин оролдоно уу.'},e instanceof Failure?e.status:e instanceof z.ZodError||e instanceof SyntaxError?400:500);}
const fields=z.object({title:z.string().trim().min(1).max(200),starts_at:z.string().datetime(),ends_at:z.string().datetime(),location:z.string().trim().max(500).default(''),note:z.string().trim().max(2000).default(''),reminder_minutes:z.union([z.literal(0),z.literal(5),z.literal(15),z.literal(30),z.literal(60)]).default(15),attendees:z.array(z.string().email()).max(50)}).strict().refine(v=>Date.parse(v.ends_at)>Date.parse(v.starts_at)&&Date.parse(v.ends_at)-Date.parse(v.starts_at)<=86400000);
const input=z.discriminatedUnion('action',[
 z.object({action:z.literal('create'),id:z.string().uuid(),data:fields}).strict(),
 z.object({action:z.literal('update'),id:z.string().uuid(),version:z.number().int().positive(),data:fields}).strict(),
 z.object({action:z.literal('cancel'),id:z.string().uuid(),version:z.number().int().positive()}).strict(),
 z.object({action:z.literal('reminders')}).strict(),
 z.object({action:z.literal('ack_reminder'),id:z.string().uuid(),version:z.number().int().positive()}).strict()
]);
export async function GET(req:Request){try{
 const me=await member(),p=new URL(req.url).searchParams,status=z.enum(['upcoming','past','cancelled']).parse(p.get('status')||'upcoming');
 const page=z.coerce.number().int().min(1).max(10000).parse(p.get('page')||1),now=new Date().toISOString();
 const condition=status==='cancelled'?"m.status='cancelled'":status==='past'?"m.status='scheduled' AND m.ends_at<=?":"m.status='scheduled' AND m.ends_at>?";
 const args=status==='cancelled'?[me.email]:[me.email,now];
 const where=`EXISTS(SELECT 1 FROM meeting_attendees a WHERE a.meeting_id=m.id AND a.email=?) AND ${condition}`;
 const items=await env.DB.prepare(`SELECT m.*,(SELECT name FROM members WHERE email=m.organizer) organizer_name FROM meetings m WHERE ${where} ORDER BY starts_at ${status==='upcoming'?'ASC':'DESC'},id LIMIT 20 OFFSET ?`).bind(...args,(page-1)*20).all<{id:string}>();
 const attendees=items.results.length?(await env.DB.prepare(`SELECT a.meeting_id,a.email,mb.name FROM meeting_attendees a LEFT JOIN members mb ON mb.email=a.email WHERE a.meeting_id IN (${items.results.map(()=>'?').join(',')}) ORDER BY a.email`).bind(...items.results.map(m=>m.id)).all<{meeting_id:string;email:string;name:string}>()).results:[];
 const rows=items.results.map(m=>({...m,attendees:attendees.filter(a=>a.meeting_id===m.id).map(({email,name})=>({email,name}))}));
 const count=await env.DB.prepare(`SELECT COUNT(*) n FROM meetings m WHERE ${where}`).bind(...args).first<{n:number}>();
 return json({items:rows,count:count?.n||0});
}catch(e){return error(e);}}
export async function POST(req:Request){try{
 if(!isSameOrigin(req))throw new Failure('Хүсэлт зөвшөөрөгдөхгүй.',403);
 const me=await member(),raw=await req.text();if(raw.length>20000)throw new Failure('Мэдээлэл хэт том.',413);
 const b=input.parse(JSON.parse(raw)),now=new Date().toISOString();
 return json(await env.DB.transaction(async db=>{
  if(b.action==='ack_reminder'){
   await db.prepare('UPDATE meeting_reminders SET acknowledged_at=? WHERE meeting_id=? AND version=? AND recipient=? AND acknowledged_at IS NULL').bind(now,b.id,b.version,me.email).run();
   return {ok:true};
  }
  if(b.action==='reminders'){
   const due=await db.prepare(`SELECT m.id,m.version,m.title,m.starts_at,m.ends_at,m.location FROM meetings m JOIN meeting_attendees a ON a.meeting_id=m.id AND a.email=? WHERE m.status='scheduled' AND m.ends_at>? AND julianday(m.starts_at)-m.reminder_minutes/1440.0<=julianday(?) AND NOT EXISTS(SELECT 1 FROM meeting_reminders r WHERE r.meeting_id=m.id AND r.version=m.version AND r.recipient=? AND (r.acknowledged_at IS NOT NULL OR r.alerted_at>?)) ORDER BY m.starts_at LIMIT 10`).bind(me.email,now,now,me.email,new Date(Date.now()-60000).toISOString()).all<{id:string;version:number}>();
   for(const m of due.results)await db.prepare('INSERT INTO meeting_reminders(meeting_id,version,recipient,alerted_at) VALUES(?,?,?,?) ON CONFLICT(meeting_id,version,recipient) DO UPDATE SET alerted_at=excluded.alerted_at WHERE meeting_reminders.acknowledged_at IS NULL').bind(m.id,m.version,me.email,now).run();
   return {items:due.results};
  }
  const old=await db.prepare('SELECT organizer,version,status FROM meetings WHERE id=?').bind(b.id).first<{organizer:string;version:number;status:string}>();
  if(b.action==='create'&&old){if(old.organizer!==me.email)throw new Failure('Уулзалт олдсонгүй.',404);return {ok:true,id:b.id};}
  if(b.action!=='create'){
   if(!old||old.organizer!==me.email)throw new Failure('Зөвхөн уулзалт зохион байгуулагч өөрчилнө.',403);
   if(old.version!==b.version||old.status!=='scheduled')throw new Failure('Уулзалт өөрчлөгдсөн. Дахин нээнэ үү.',409);
  }
  if(b.action==='cancel'){await db.prepare("UPDATE meetings SET status='cancelled',version=version+1,updated_at=? WHERE id=?").bind(now,b.id).run();return {ok:true};}
  const d={...b.data,starts_at:new Date(b.data.starts_at).toISOString(),ends_at:new Date(b.data.ends_at).toISOString()};if(Date.parse(d.starts_at)<=Date.now())throw new Failure('Уулзалтыг ирээдүйн цагт товлоно уу.');
  const attendees=[...new Set([me.email,...d.attendees.map(v=>v.toLowerCase())])];
  const active=await db.prepare(`SELECT email FROM members WHERE active=1 AND email IN (${attendees.map(()=>'?').join(',')})`).bind(...attendees).all();
  if(active.results.length!==attendees.length)throw new Failure('Идэвхтэй ажилтнууд сонгоно уу.');
  if(b.action==='create')await db.prepare('INSERT INTO meetings(id,title,organizer,starts_at,ends_at,location,note,reminder_minutes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(b.id,d.title,me.email,d.starts_at,d.ends_at,d.location,d.note,d.reminder_minutes,now,now).run();
  else await db.prepare('UPDATE meetings SET title=?,starts_at=?,ends_at=?,location=?,note=?,reminder_minutes=?,version=version+1,updated_at=? WHERE id=?').bind(d.title,d.starts_at,d.ends_at,d.location,d.note,d.reminder_minutes,now,b.id).run();
  await db.prepare('DELETE FROM meeting_attendees WHERE meeting_id=?').bind(b.id).run();
  for(const email of attendees)await db.prepare('INSERT INTO meeting_attendees(meeting_id,email) VALUES(?,?)').bind(b.id,email).run();
  return {ok:true,id:b.id};
 }));
}catch(e){return error(e);}}
