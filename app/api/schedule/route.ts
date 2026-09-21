import {env} from '@/lib/runtime';
import {member,Failure,isSameOrigin} from '@/lib/access';
import {z} from 'zod';
import {shiftAssignments,shiftIsWork,canManageSchedule,shiftRequestKinds,personKey,type Member,type WorkShift,type ShiftRequest} from '@/lib/crm';
export const dynamic='force-dynamic';
const db=()=>env.DB!;
const day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/,'Огноо YYYY-MM-DD хэлбэртэй байна.');
const month=z.string().regex(/^\d{4}-\d{2}$/,'Сар YYYY-MM хэлбэртэй байна.');
const assignment=z.string().refine(v=>shiftAssignments.includes(v),'Томилгоо буруу.');
function assertManage(m:Member){if(!canManageSchedule(m.role))throw new Failure('Хуваарь засах эрхгүй.',403);}
async function myNames(m:Member){
 const rows=await db().prepare('SELECT DISTINCT person_name FROM work_shifts').all<{person_name:string}>();
 return rows.results.filter(r=>personKey(r.person_name)===personKey(m.name)).map(r=>r.person_name);
}
// Ажилтан зөвхөн өөрийнхөө талаар хүсэлт гаргана; Ахлах/Удирдлага/Админ хэн нэрийн өмнөөс ч гаргана.
async function assertOwnPerson(m:Member,person:string){
 if(canManageSchedule(m.role))return;
 if(personKey(person)!==personKey(m.name))throw new Failure('Зөвхөн өөрийн хуваарийн талаар хүсэлт гаргана.',403);
}
async function getRequest(id:string){
 const row=await db().prepare('SELECT * FROM shift_requests WHERE id=?').bind(id).first<ShiftRequest>();
 if(!row)throw new Failure('Хүсэлт олдсонгүй.',404);
 return row;
}
function err(e:unknown){
 if(e instanceof Failure)return Response.json({error:e.message},{status:e.status});
 if(e instanceof z.ZodError)return Response.json({fieldErrors:Object.fromEntries(e.issues.map(i=>[String(i.path.at(-1)||''),i.message])),error:'Мэдээллээ шалгана уу: '+e.issues.map(i=>i.path.join('.')+' '+i.message).join('; ')},{status:400});
 console.error('Schedule request failed',e instanceof Error?e.message:'error');
 return Response.json({error:'Хадгалж чадсангүй. Дахин оролдоно уу.'},{status:500});
}
const bodySchema=z.object({action:z.enum(['set_shift','plan_month','request','decide','cancel_request']),id:z.string().max(80).optional(),version:z.number().int().positive().optional(),data:z.unknown()});
export async function GET(req:Request){try{
 const m=await member();
 const url=new URL(req.url);
 // Хүргэлтийн модуль ашигладаг: тухайн өдөр "Хүргэлт"-эд томилогдсон ажилтнууд.
 const onDay=url.searchParams.get('day');
 if(onDay){
  day.parse(onDay);
  const want=url.searchParams.get('assignment')||'';
  let sql='SELECT person_name,member_email,assignment FROM work_shifts WHERE day=?';const args:unknown[]=[onDay];
  if(want){assignment.parse(want);sql+=' AND assignment=?';args.push(want);}
  const rows=await db().prepare(sql+' ORDER BY person_name').bind(...args).all();
  return Response.json({items:rows.results},{headers:{'Cache-Control':'no-store'}});
 }
 const mon=url.searchParams.get('month')||new Date(Date.now()+8*3600000).toISOString().slice(0,7);
 month.parse(mon);
 const from=mon+'-01',to=mon+'-31';
 const mine=await myNames(m);
 // Хуваарь удирдах эрхтэй (Ахлах, Удирдлага, Админ) бүх хуваарийг хардаг; борлуулалтын ажилтан,
 // хүргэгч зэрэг бусад нь зөвхөн өөрийнхөө мөрийг авна — шүүлт серверт хийгдэж, бусдын хуваарь
 // клиент рүү огт дамжихгүй.
 const all=canManageSchedule(m.role);
 const marks=mine.map(()=>'?').join(',');
 const scope=all?'':` AND (member_email=?${mine.length?` OR person_name IN (${marks})`:''})`;
 const scopeArgs=all?[]:[m.email,...mine];
 const [shifts,requests,people]=await Promise.all([
  db().prepare(`SELECT * FROM work_shifts WHERE day>=? AND day<=?${scope} ORDER BY person_name,day`).bind(from,to,...scopeArgs).all(),
  db().prepare(`SELECT * FROM shift_requests WHERE ((from_day>=? AND from_day<=?) OR status=?)${scope} ORDER BY (status=?) DESC,created_at DESC LIMIT 200`).bind(from,to,'pending',...scopeArgs,'pending').all(),
  db().prepare(`SELECT person_name,member_email,COUNT(*) days FROM work_shifts WHERE day>=? AND day<=?${scope} GROUP BY person_name ORDER BY person_name`).bind(from,to,...scopeArgs).all(),
 ]);
 return Response.json({
  month:mon,shifts:shifts.results,requests:requests.results,people:people.results,
  can_manage:all,scoped:!all,me:{name:m.name,email:m.email,names:mine},
 },{headers:{'Cache-Control':'no-store'}});
}catch(e){return err(e);}}
// Томилгоог бичих/шинэчлэх: (өдөр, ажилтан) хос дээр нэг л бичлэг байна.
async function writeShift(d:{day:string;person_name:string;member_email:string|null;assignment:string;note?:string},actor:string){
 const now=new Date().toISOString();
 const existing=await db().prepare('SELECT id FROM work_shifts WHERE day=? AND person_name=?').bind(d.day,d.person_name).first<{id:string}>();
 if(existing){
  await db().prepare('UPDATE work_shifts SET assignment=?,member_email=?,note=?,updated_at=?,version=version+1 WHERE id=?').bind(d.assignment,d.member_email,d.note??'',now,existing.id).run();
  return existing.id;
 }
 const id=crypto.randomUUID();
 await db().prepare('INSERT INTO work_shifts(id,day,member_email,person_name,assignment,note,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)')
  .bind(id,d.day,d.member_email,d.person_name,d.assignment,d.note??'',actor,now,now).run();
 return id;
}
export async function POST(req:Request){try{
 if(!isSameOrigin(req))throw new Failure('Хүсэлтийн эх сурвалж буруу.',403);
 if(Number(req.headers.get('content-length')||0)>100000)throw new Failure('Мэдээлэл хэт их.',413);
 const m=await member();
 const raw=await req.text();
 if(raw.length>100000)throw new Failure('Мэдээлэл хэт их.',413);
 const b=bodySchema.parse(JSON.parse(raw)),now=new Date().toISOString();
 // Хуваарийн нүдийг гараар засах (зөвхөн Ахлах/Удирдлага/Админ).
 if(b.action==='set_shift'){
  assertManage(m);
  const d=z.object({day,person_name:z.string().trim().min(1).max(120),member_email:z.string().email().nullish(),assignment,note:z.string().trim().max(400).optional()}).parse(b.data);
  const id=await writeShift({...d,member_email:d.member_email||null},m.email);
  return Response.json({ok:true,id});
 }
 // Шинэ сарын хуваарийг багцаар тавина: ажилтан тус бүрийн өдөр бүрийн томилгоог нэг хүсэлтээр бичнэ.
 // Аль хэдийн томилгоотой нүдийг хөнддөггүй — гараар зассан, батлагдсан чөлөөг дарж бичихгүй.
 if(b.action==='plan_month'){
  assertManage(m);
  const d=z.object({
   month,
   entries:z.array(z.object({
    person_name:z.string().trim().min(1).max(120),
    member_email:z.string().email().nullish(),
    days:z.array(z.object({day,assignment})).min(1).max(31),
   })).min(1).max(100),
  }).parse(b.data);
  let written=0,skipped=0;
  for(const entry of d.entries){
   for(const cell of entry.days){
    if(!cell.day.startsWith(d.month+'-'))throw new Failure(`${cell.day} нь ${d.month} сард хамаарахгүй.`);
    const existing=await db().prepare('SELECT id FROM work_shifts WHERE day=? AND person_name=?').bind(cell.day,entry.person_name).first();
    if(existing){skipped++;continue;}
    await writeShift({day:cell.day,person_name:entry.person_name,member_email:entry.member_email||null,assignment:cell.assignment,note:'Сарын хуваарь төлөвлөлтөөр бүртгэв.'},m.email);
    written++;
   }
  }
  return Response.json({ok:true,written,skipped});
 }
 // Чөлөө авах / өдөр шилжүүлэх хүсэлт гаргах.
 if(b.action==='request'){
  const d=z.object({
   kind:z.string().refine(v=>Object.hasOwn(shiftRequestKinds,v),'Хүсэлтийн төрөл буруу.'),
   person_name:z.string().trim().min(1).max(120),
   from_day:day,
   to_day:day.nullish(),
   reason:z.string().trim().max(1000).optional(),
  }).parse(b.data);
  await assertOwnPerson(m,d.person_name);
  const shift=await db().prepare('SELECT * FROM work_shifts WHERE day=? AND person_name=?').bind(d.from_day,d.person_name).first<WorkShift>();
  if(!shift)throw new Failure('Тэр өдөрт таны хуваарь бүртгэгдээгүй байна.',404);
  if(!shiftIsWork(shift.assignment))throw new Failure(`Тэр өдөр аль хэдийн ${shift.assignment} байна.`);
  if(d.kind==='move'){
   if(!d.to_day)throw new Failure('Шилжүүлэх өдрийг сонгоно уу.');
   if(d.to_day===d.from_day)throw new Failure('Ижил өдөр рүү шилжүүлэх боломжгүй.');
   const target=await db().prepare('SELECT assignment FROM work_shifts WHERE day=? AND person_name=?').bind(d.to_day,d.person_name).first<{assignment:string}>();
   if(target&&shiftIsWork(target.assignment))throw new Failure(`${d.to_day}-нд аль хэдийн ${target.assignment} томилгоотой байна.`);
  }
  const dup=await db().prepare("SELECT id FROM shift_requests WHERE person_name=? AND from_day=? AND status='pending'").bind(d.person_name,d.from_day).first();
  if(dup)throw new Failure('Тэр өдөрт шийдвэрлэгдээгүй хүсэлт бүртгэгдсэн байна.',409);
  const id=crypto.randomUUID();
  await db().prepare('INSERT INTO shift_requests(id,kind,person_name,member_email,from_day,to_day,assignment,reason,status,requested_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
   .bind(id,d.kind,d.person_name,shift.member_email,d.from_day,d.kind==='move'?d.to_day!:null,shift.assignment,d.reason||'','pending',m.email,now,now).run();
  return Response.json({ok:true,id});
 }
 if(!b.id||!b.version)throw new Failure('Хүсэлтийн хувилбар дутуу.');
 const r=await getRequest(b.id);
 if(r.version!==b.version)throw new Failure('Өөр хүн шинэчилсэн байна. Дахин нээнэ үү.',409);
 if(r.status!=='pending')throw new Failure('Хүсэлт аль хэдийн шийдвэрлэгдсэн.',409);
 // Хүсэлтээ өөрөө татах (шийдвэрлэгдээгүй байхад).
 if(b.action==='cancel_request'){
  if(!canManageSchedule(m.role)&&r.requested_by!==m.email)throw new Failure('Зөвхөн өөрийн хүсэлтээ татна.',403);
  const res=await db().prepare("UPDATE shift_requests SET status='rejected',decided_by=?,decided_at=?,decision_note=?,updated_at=?,version=version+1 WHERE id=? AND version=?").bind(m.email,now,'Хүсэлт гаргагч татсан.',now,r.id,b.version).run();
  if(!res.meta.changes)throw new Failure('Хүсэлт шинэчлэгдсэн байна. Дахин нээнэ үү.',409);
  return Response.json({ok:true});
 }
 // Батлах / татгалзах: батлагдвал хуваарь дээр шууд өөрчлөлт бичнэ.
 if(b.action==='decide'){
  assertManage(m);
  const d=z.object({approve:z.boolean(),note:z.string().trim().max(1000).optional()}).parse(b.data);
  if(d.approve){
   const shift=await db().prepare('SELECT * FROM work_shifts WHERE day=? AND person_name=?').bind(r.from_day,r.person_name).first<WorkShift>();
   if(!shift)throw new Failure('Хуваарийн бичлэг олдсонгүй. Хүсэлтийг татгалзана уу.',404);
   if(r.kind==='move'){
    if(!r.to_day)throw new Failure('Шилжүүлэх өдөр дутуу.');
    const target=await db().prepare('SELECT assignment FROM work_shifts WHERE day=? AND person_name=?').bind(r.to_day,r.person_name).first<{assignment:string}>();
    if(target&&shiftIsWork(target.assignment))throw new Failure(`${r.to_day}-нд аль хэдийн ${target.assignment} томилгоотой тул батлах боломжгүй.`,409);
    await writeShift({day:r.to_day,person_name:r.person_name,member_email:shift.member_email,assignment:shift.assignment,note:`${r.from_day}-ээс шилжүүлэв.`},m.email);
   }
   await writeShift({day:r.from_day,person_name:r.person_name,member_email:shift.member_email,assignment:'Чөлөө',note:r.kind==='move'&&r.to_day?`${r.to_day} рүү шилжүүлэв.`:'Чөлөө батлагдсан.'},m.email);
  }
  const res=await db().prepare('UPDATE shift_requests SET status=?,decided_by=?,decided_at=?,decision_note=?,updated_at=?,version=version+1 WHERE id=? AND version=?').bind(d.approve?'approved':'rejected',m.email,now,d.note||'',now,r.id,b.version).run();
  if(!res.meta.changes)throw new Failure('Хүсэлт шинэчлэгдсэн байна. Дахин нээнэ үү.',409);
  return Response.json({ok:true});
 }
 throw new Failure('Тодорхойгүй үйлдэл.');
}catch(e){return err(e);}}
