import {env} from '@/lib/runtime';
import {member,Failure} from '@/lib/access';
import {z} from 'zod';
import {marketingStages,marketingChannels,isAdminLike,type Member,type MarketingTask} from '@/lib/crm';
export const dynamic='force-dynamic';
const db=()=>env.DB!;
// Борлуулалтын ажилтан, IT ажилтан хоёул энэ модульд хамааралгүй тул бүрмөсөн хаана; Маркетинг эрхтэй
// хүн харин борлуулалтын хүсэлт (/api/crm) рүү огт хандахгүй (тэнд тусад нь хориглосон).
function assertAccess(m:Member){if(m.role==='agent'||m.role==='it')throw new Failure('Энэ хэсэгт хандах эрхгүй.',403);}
async function getTask(id:string){
 const t=await db().prepare('SELECT * FROM marketing_tasks WHERE id=?').bind(id).first<MarketingTask>();
 if(!t)throw new Failure('Ажил олдсонгүй.',404);
 return t;
}
const bodySchema=z.object({action:z.enum(['create','update','activity','approve','unapprove']),id:z.string().max(80).optional(),version:z.number().int().positive().optional(),data:z.unknown()});
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
 // Удирдлагын хяналтын самбар: төсөв нь одоог хүртэл баталгаажаагүй, цуцлагдаагүй бүх ажлын жагсаалт.
 if(url.searchParams.get('pending_approvals')==='1'){
  if(!isAdminLike(m.role))throw new Failure('Зөвхөн админ, удирдлага харна.',403);
  const [rows,sum]=await Promise.all([
   db().prepare(`SELECT id,title,channel,budget,owner,status,due_at,version FROM marketing_tasks WHERE approved_at IS NULL AND status!='cancelled' ORDER BY (due_at IS NULL),due_at ASC,created_at ASC LIMIT 50`).all(),
   db().prepare(`SELECT COUNT(*) count,COALESCE(SUM(budget),0) budget FROM marketing_tasks WHERE approved_at IS NULL AND status!='cancelled'`).first<{count:number;budget:number}>(),
  ]);
  return Response.json({items:rows.results,count:sum?.count||0,budget:sum?.budget||0},{headers:{'Cache-Control':'no-store'}});
 }
 // Календарь горим: тухайн шүүлтүүрээр хязгаарлаад, зөвхөн сонгосон сард due_at тохирох хөнгөн мөрүүдийг буцаана.
 if(url.searchParams.get('calendar')==='1'){
  const monthParam=(url.searchParams.get('month')||'').slice(0,7);
  if(!/^\d{4}-\d{2}$/.test(monthParam))throw new Failure('Сар буруу.');
  const [my,mm]=monthParam.split('-').map(Number);
  const nextMonth=mm===12?`${my+1}-01`:`${my}-${String(mm+1).padStart(2,'0')}`;
  const monthStartIso=new Date(monthParam+'-01T00:00:00+08:00').toISOString();
  const monthEndIso=new Date(nextMonth+'-01T00:00:00+08:00').toISOString();
  // Нэг өдөрт олон ажил байсан ч бусад өдрүүд "LIMIT"-д шахагдаж алга болохгүйн тулд өдөр (УБ цагийн
  // бүсээр) тус бүрд хамгийн ихдээ 5-ийг сонгоно; day_count-оор клиент "+N илүү" гэдгийг үнэн зөв харуулна.
  const cal=await db().prepare(`SELECT id,title,due_at,status,day_count FROM (SELECT id,title,due_at,status,COUNT(*) OVER (PARTITION BY date(due_at,'+8 hours')) day_count,ROW_NUMBER() OVER (PARTITION BY date(due_at,'+8 hours') ORDER BY due_at ASC) rn FROM marketing_tasks WHERE ${where} AND due_at>=? AND due_at<?) WHERE rn<=5 ORDER BY due_at ASC`).bind(...args,monthStartIso,monthEndIso).all();
  return Response.json({items:cal.results},{headers:{'Cache-Control':'no-store'}});
 }
 // Тайлан горим: сонгосон хугацаанд (rfrom/rto, ирсэн огноогоор) үндэслэсэн төлөв/суваг/хариуцагч/төсвийн задаргаа.
 // rfrom/rto хоёул сонголттой бөгөөд буруу форматтай ирвэл (Календарь горимоос ялгаатай) 400 биш зүгээр үл тоомсорлоно.
 if(url.searchParams.get('report')==='1'){
  const rFrom=(url.searchParams.get('rfrom')||'').slice(0,10),rTo=(url.searchParams.get('rto')||'').slice(0,10);
  let rFromIso='',rToIso='';
  if(/^\d{4}-\d{2}-\d{2}$/.test(rFrom)){const t=new Date(rFrom+'T00:00:00+08:00');if(!Number.isNaN(t.getTime()))rFromIso=t.toISOString();}
  if(/^\d{4}-\d{2}-\d{2}$/.test(rTo)){const t=new Date(rTo+'T23:59:59+08:00');if(!Number.isNaN(t.getTime()))rToIso=t.toISOString();}
  let rWhere='1=1',rArgs:unknown[]=[];
  if(rFromIso){rWhere+=' AND created_at>=?';rArgs.push(rFromIso);}
  if(rToIso){rWhere+=' AND created_at<=?';rArgs.push(rToIso);}
  const [statusRows,channelRows,ownerRows,budgetRow]=await Promise.all([
   db().prepare(`SELECT status,COUNT(*) count FROM marketing_tasks WHERE ${rWhere} GROUP BY status`).bind(...rArgs).all<{status:string;count:number}>(),
   db().prepare(`SELECT channel,COUNT(*) count,COALESCE(SUM(budget),0) budget FROM marketing_tasks WHERE ${rWhere} GROUP BY channel`).bind(...rArgs).all<{channel:string;count:number;budget:number}>(),
   db().prepare(`SELECT owner,COUNT(*) total,COALESCE(SUM(status='done'),0) done FROM marketing_tasks WHERE ${rWhere} GROUP BY owner`).bind(...rArgs).all<{owner:string;total:number;done:number}>(),
   db().prepare(`SELECT COALESCE(SUM(budget),0) total,COALESCE(SUM(CASE WHEN approved_at IS NOT NULL THEN budget ELSE 0 END),0) approved FROM marketing_tasks WHERE ${rWhere}`).bind(...rArgs).first<{total:number;approved:number}>(),
  ]);
  const total=statusRows.results.reduce((n,r)=>n+r.count,0);
  const statusMap=new Map(statusRows.results.map(r=>[r.status,r.count]));
  const channelMap=new Map(channelRows.results.map(r=>[r.channel,r]));
  const budgetTotal=budgetRow?.total||0,budgetApproved=budgetRow?.approved||0;
  return Response.json({
   total,
   byStatus:Object.keys(marketingStages).map(k=>({status:k,count:statusMap.get(k)||0})),
   byChannel:marketingChannels.map(c=>({channel:c,count:channelMap.get(c)?.count||0})),
   byOwner:ownerRows.results,
   budget:{total:budgetTotal,approved:budgetApproved,unapproved:budgetTotal-budgetApproved,byChannel:marketingChannels.map(c=>({channel:c,budget:channelMap.get(c)?.budget||0}))},
  },{headers:{'Cache-Control':'no-store'}});
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
  // Ажлыг засварласны дараа өмнөх төсвийн баталгаажуулалт хүчингүй болно; өөрчлөгдсөн дүнг дахин батлуулна.
  const r=await db().batch([
   db().prepare('UPDATE marketing_tasks SET title=?,channel=?,budget=?,owner=?,status=?,due_at=?,note=?,updated_at=?,version=version+1,approved_at=NULL,approved_by=NULL WHERE id=? AND version=?').bind(d.title,d.channel,d.budget,d.owner,d.status,d.due_at,d.note||'',now,t.id,b.version),
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
 if(b.action==='approve'||b.action==='unapprove'){
  // Зөвхөн Админ, Удирдлага (director) ажлын төсвийг батлах/буцаах эрхтэй; батлах, буцаах хоёулаа шалтгаанаа бичнэ.
  if(!isAdminLike(m.role))throw new Failure('Зөвхөн админ, удирдлага төсвийн шийдвэр гаргана.',403);
  const a=z.object({note:z.string().trim().min(1).max(2000)}).parse(b.data);
  if(b.action==='approve'){
   const r=await db().batch([
    db().prepare('UPDATE marketing_tasks SET approved_at=?,approved_by=?,updated_at=?,version=version+1 WHERE id=? AND version=? AND approved_at IS NULL').bind(now,m.email,now,t.id,b.version),
    db().prepare('INSERT INTO marketing_activities(id,task_id,note,actor,created_at) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),t.id,'Төсөв баталгаажлаа: '+a.note,m.email,now),
   ]);
   if(!r[0].meta.changes)throw new Failure('Ажил шинэчлэгдсэн эсвэл аль хэдийн баталгаажсан байна. Дахин нээнэ үү.',409);
   return Response.json({ok:true});
  }
  const r=await db().batch([
   db().prepare('UPDATE marketing_tasks SET approved_at=NULL,approved_by=NULL,updated_at=?,version=version+1 WHERE id=? AND version=? AND approved_at IS NOT NULL').bind(now,t.id,b.version),
   db().prepare('INSERT INTO marketing_activities(id,task_id,note,actor,created_at) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),t.id,'Төсвийн баталгаажилтыг буцаав: '+a.note,m.email,now),
  ]);
  if(!r[0].meta.changes)throw new Failure('Ажил шинэчлэгдсэн эсвэл төсөв баталгаажаагүй байна. Дахин нээнэ үү.',409);
  return Response.json({ok:true});
 }
 throw new Failure('Тодорхойгүй үйлдэл.');
}catch(e){return err(e);}}
