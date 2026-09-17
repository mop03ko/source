import {env} from '@/lib/runtime';
import {member,Failure} from '@/lib/access';
import {z} from 'zod';
import {marketingStages,marketingChannels,type Member,type MarketingTask} from '@/lib/crm';
export const dynamic='force-dynamic';
const db=()=>env.DB!;
// Борлуулалтын ажилтан энэ модульд хамааралгүй тул бүрмөсөн хаана; Маркетинг эрхтэй хүн харин
// борлуулалтын хүсэлт (/api/crm) рүү огт хандахгүй (тэнд тусад нь хориглосон).
function assertAccess(m:Member){if(m.role==='agent')throw new Failure('Энэ хэсэгт хандах эрхгүй.',403);}
async function getTask(id:string){
 const t=await db().prepare('SELECT * FROM marketing_tasks WHERE id=?').bind(id).first<MarketingTask>();
 if(!t)throw new Failure('Ажил олдсонгүй.',404);
 return t;
}
const bodySchema=z.object({action:z.enum(['create','update','activity']),id:z.string().max(80).optional(),version:z.number().int().positive().optional(),data:z.unknown()});
const taskSchema=z.object({
 title:z.string().trim().min(1).max(160),
 channel:z.string().refine(v=>marketingChannels.includes(v)),
 budget:z.number().int().min(0).max(1000000000),
 owner:z.string().email(),
 status:z.string().refine(v=>Object.hasOwn(marketingStages,v)),
 due_at:z.string().datetime().nullable(),
 note:z.string().trim().max(2000).optional(),
});
async function validOwner(email:string){
 if(!await db().prepare('SELECT email FROM members WHERE email=? AND active=1').bind(email).first())throw new Failure('Идэвхтэй ажилтан сонгоно уу.');
}
function err(e:unknown){
 if(e instanceof Failure)return Response.json({error:e.message},{status:e.status});
 if(e instanceof z.ZodError)return Response.json({error:'Мэдээллээ шалгана уу: '+e.issues.map(i=>i.path.join('.')+' '+i.message).join('; ')},{status:400});
 console.error('Marketing request failed',e instanceof Error?e.message:'error');
 return Response.json({error:'Хадгалж чадсангүй. Дахин оролдоно уу.'},{status:500});
}
export async function GET(req:Request){try{
 const m=await member();assertAccess(m);
 const url=new URL(req.url);
 const id=url.searchParams.get('id');
 if(id){
  const task=await getTask(id);
  const activities=await db().prepare('SELECT * FROM marketing_activities WHERE task_id=? ORDER BY created_at DESC LIMIT 100').bind(id).all();
  return Response.json({task,activities:activities.results},{headers:{'Cache-Control':'no-store'}});
 }
 const page=Math.max(1,Math.min(1000,Number(url.searchParams.get('page'))||1));
 const q=(url.searchParams.get('q')||'').slice(0,100),status=url.searchParams.get('status')||'',owner=(url.searchParams.get('owner')||'').trim().toLowerCase().slice(0,120);
 let where='1=1',args:unknown[]=[];
 if(q){where+=' AND title LIKE ?';args.push('%'+q+'%');}
 if(status&&Object.hasOwn(marketingStages,status)){where+=' AND status=?';args.push(status);}
 if(owner){where+=' AND owner=?';args.push(owner);}
 // Календарь горим: тухайн шүүлтүүрээр хязгаарлаад, зөвхөн сонгосон сард due_at тохирох хөнгөн мөрүүдийг буцаана.
 if(url.searchParams.get('calendar')==='1'){
  const monthParam=(url.searchParams.get('month')||'').slice(0,7);
  if(!/^\d{4}-\d{2}$/.test(monthParam))throw new Failure('Сар буруу.');
  const [my,mm]=monthParam.split('-').map(Number);
  const nextMonth=mm===12?`${my+1}-01`:`${my}-${String(mm+1).padStart(2,'0')}`;
  const monthStartIso=new Date(monthParam+'-01T00:00:00+08:00').toISOString();
  const monthEndIso=new Date(nextMonth+'-01T00:00:00+08:00').toISOString();
  const cal=await db().prepare(`SELECT id,title,due_at,status FROM marketing_tasks WHERE ${where} AND due_at>=? AND due_at<? ORDER BY due_at ASC LIMIT 500`).bind(...args,monthStartIso,monthEndIso).all();
  return Response.json({items:cal.results},{headers:{'Cache-Control':'no-store'}});
 }
 const [rows,count,stats]=await Promise.all([
  db().prepare(`SELECT * FROM marketing_tasks WHERE ${where} ORDER BY (due_at IS NULL),due_at ASC,created_at DESC LIMIT 50 OFFSET ?`).bind(...args,(page-1)*50).all(),
  db().prepare(`SELECT COUNT(*) count FROM marketing_tasks WHERE ${where}`).bind(...args).first<{count:number}>(),
  db().prepare(`SELECT COUNT(*) total,COALESCE(SUM(status NOT IN ('done','cancelled')),0) active,COALESCE(SUM(status NOT IN ('done','cancelled') AND due_at IS NOT NULL AND due_at<?),0) overdue,COALESCE(SUM(status='done'),0) done FROM marketing_tasks`).bind(new Date().toISOString()).first(),
 ]);
 return Response.json({items:rows.results,count:count?.count||0,page,stats},{headers:{'Cache-Control':'no-store'}});
}catch(e){return err(e);}}
export async function POST(req:Request){try{
 if(req.headers.get('origin')!==new URL(req.url).origin)throw new Failure('Хүсэлтийн эх сурвалж буруу.',403);
 if(Number(req.headers.get('content-length')||0)>50000)throw new Failure('Файл хэт том.',413);
 const m=await member();assertAccess(m);
 const raw=await req.text();
 if(raw.length>50000)throw new Failure('Мэдээлэл хэт их.',413);
 const b=bodySchema.parse(JSON.parse(raw)),now=new Date().toISOString();
 if(b.action==='create'){
  const d=taskSchema.parse(b.data);
  await validOwner(d.owner);
  const id=crypto.randomUUID();
  await db().batch([
   db().prepare('INSERT INTO marketing_tasks(id,title,channel,budget,owner,status,due_at,note,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(id,d.title,d.channel,d.budget,d.owner,d.status,d.due_at,d.note||'',m.email,now,now),
   db().prepare('INSERT INTO marketing_activities(id,task_id,note,actor,created_at) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),id,'Ажил бүртгэв.',m.email,now),
  ]);
  return Response.json({ok:true,id});
 }
 if(!b.id||!b.version)throw new Failure('Ажлын хувилбар дутуу.');
 const t=await getTask(b.id);
 if(t.version!==b.version)throw new Failure('Өөр хүн шинэчилсэн байна. Ажлыг дахин нээнэ үү.',409);
 if(b.action==='update'){
  const d=taskSchema.parse(b.data);
  await validOwner(d.owner);
  const op=crypto.randomUUID();
  const r=await db().batch([
   db().prepare('UPDATE marketing_tasks SET title=?,channel=?,budget=?,owner=?,status=?,due_at=?,note=?,updated_at=?,version=version+1 WHERE id=? AND version=?').bind(d.title,d.channel,d.budget,d.owner,d.status,d.due_at,d.note||'',now,t.id,b.version),
   db().prepare('INSERT INTO marketing_activities(id,task_id,note,actor,created_at) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),t.id,'Мэдээлэл шинэчилсэн: '+(marketingStages[d.status]||d.status),m.email,now),
  ]);
  if(!r[0].meta.changes)throw new Failure('Ажил шинэчлэгдсэн байна. Дахин нээнэ үү.',409);
  return Response.json({ok:true});
 }
 if(b.action==='activity'){
  const a=z.object({note:z.string().trim().min(1).max(2000)}).parse(b.data);
  const r=await db().batch([
   db().prepare('UPDATE marketing_tasks SET updated_at=?,version=version+1 WHERE id=? AND version=?').bind(now,t.id,b.version),
   db().prepare('INSERT INTO marketing_activities(id,task_id,note,actor,created_at) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),t.id,a.note,m.email,now),
  ]);
  if(!r[0].meta.changes)throw new Failure('Ажил шинэчлэгдсэн байна. Дахин нээнэ үү.',409);
  return Response.json({ok:true});
 }
 throw new Failure('Тодорхойгүй үйлдэл.');
}catch(e){return err(e);}}
