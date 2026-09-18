import {env} from '@/lib/runtime';
import {member,Failure,isSameOrigin} from '@/lib/access';
import {z} from 'zod';
import {inventoryStages,inventoryCategories,isIsolatedRole,type Member,type InventoryCount} from '@/lib/crm';
export const dynamic='force-dynamic';
const db=()=>env.DB!;
// Маркетинг, IT хоёул борлуулалтын багийн тооллоготой хамааралгүй тул хаана; Удирдлага, Ахлах, Админ,
// агент бүгд санхүүгийн тооллогод хамрагдана (Борлуулалт таб доtorх sub-tab тул тэдэнд л зориулагдсан).
function assertAccess(m:Member){if(isIsolatedRole(m.role))throw new Failure('Энэ хэсэгт хандах эрхгүй.',403);}
async function getCount(id:string){
 const t=await db().prepare('SELECT * FROM inventory_counts WHERE id=?').bind(id).first<InventoryCount>();
 if(!t)throw new Failure('Тооллого олдсонгүй.',404);
 return t;
}
const bodySchema=z.object({action:z.enum(['create','update','activity']),id:z.string().max(80).optional(),version:z.number().int().positive().optional(),data:z.unknown()});
const taskSchema=z.object({
 title:z.string().trim().min(1).max(160),
 category:z.string().refine(v=>inventoryCategories.includes(v)),
 owner:z.string().email(),
 status:z.string().refine(v=>Object.hasOwn(inventoryStages,v)),
 due_at:z.string().datetime().nullable(),
 expected_amount:z.number().int().min(0).max(1000000000000),
 actual_amount:z.number().int().min(0).max(1000000000000).nullable(),
 note:z.string().trim().max(2000).optional(),
});
async function validOwner(email:string){
 if(!await db().prepare('SELECT email FROM members WHERE email=? AND active=1').bind(email).first())throw new Failure('Идэвхтэй ажилтан сонгоно уу.');
}
function err(e:unknown){
 if(e instanceof Failure)return Response.json({error:e.message},{status:e.status});
 if(e instanceof z.ZodError)return Response.json({fieldErrors:Object.fromEntries(e.issues.map(i=>[String(i.path.at(-1)||''),i.message])),error:'Мэдээллээ шалгана уу: '+e.issues.map(i=>i.path.join('.')+' '+i.message).join('; ')},{status:400});
 console.error('Inventory count request failed',e instanceof Error?e.message:'error');
 return Response.json({error:'Хадгалж чадсангүй. Дахин оролдоно уу.'},{status:500});
}
export async function GET(req:Request){try{
 const m=await member();assertAccess(m);
 const url=new URL(req.url);
 const id=url.searchParams.get('id');
 if(id){
  const task=await getCount(id);
  const activities=await db().prepare('SELECT * FROM inventory_count_activities WHERE count_id=? ORDER BY created_at DESC LIMIT 100').bind(id).all();
  return Response.json({task,activities:activities.results},{headers:{'Cache-Control':'no-store'}});
 }
 const page=Math.max(1,Math.min(1000,Number(url.searchParams.get('page'))||1));
 const q=(url.searchParams.get('q')||'').slice(0,100),status=url.searchParams.get('status')||'',owner=(url.searchParams.get('owner')||'').trim().toLowerCase().slice(0,120);
 let where='1=1';const args:unknown[]=[];
 if(q){where+=' AND title LIKE ?';args.push('%'+q+'%');}
 if(status&&Object.hasOwn(inventoryStages,status)){where+=' AND status=?';args.push(status);}
 if(owner){where+=' AND owner=?';args.push(owner);}
 // Календарь горим: тухайн шүүлтүүрээр хязгаарлаад, зөвхөн сонгосон сард due_at тохирох хөнгөн мөрүүдийг буцаана.
 if(url.searchParams.get('calendar')==='1'){
  const monthParam=(url.searchParams.get('month')||'').slice(0,7);
  if(!/^\d{4}-\d{2}$/.test(monthParam))throw new Failure('Сар буруу.');
  const [my,mm]=monthParam.split('-').map(Number);
  const nextMonth=mm===12?`${my+1}-01`:`${my}-${String(mm+1).padStart(2,'0')}`;
  const monthStartIso=new Date(monthParam+'-01T00:00:00+08:00').toISOString();
  const monthEndIso=new Date(nextMonth+'-01T00:00:00+08:00').toISOString();
  const day=url.searchParams.get('day');
  if(day){
   if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!day.startsWith(monthParam+'-')||day.slice(8)<'01'||day.slice(8)>'31')throw new Failure('Өдөр буруу.');
   const dayWhere=where+" AND due_at>=? AND due_at<? AND date(due_at,'+8 hours')=?";
   const dayArgs=[...args,monthStartIso,monthEndIso,day];
   const count=await db().prepare(`SELECT COUNT(*) n FROM inventory_counts WHERE ${dayWhere}`).bind(...dayArgs).first<{n:number}>();
   const rows=await db().prepare(`SELECT id,title,due_at,status FROM inventory_counts WHERE ${dayWhere} ORDER BY due_at,id LIMIT 50 OFFSET ?`).bind(...dayArgs,(page-1)*50).all();
   return Response.json({items:rows.results,total:count?.n||0},{headers:{'Cache-Control':'no-store'}});
  }
  // Нэг өдөрт олон тооллого байсан ч бусад өдрүүд "LIMIT"-д шахагдаж алга болохгүйн тулд өдөр (УБ
  // цагийн бүсээр) тус бүрд хамгийн ихдээ 5-ийг сонгоно; day_count-оор "+N илүү" гэдгийг үнэн зөв харуулна.
  const cal=await db().prepare(`SELECT id,title,due_at,status,day_count FROM (SELECT id,title,due_at,status,COUNT(*) OVER (PARTITION BY date(due_at,'+8 hours')) day_count,ROW_NUMBER() OVER (PARTITION BY date(due_at,'+8 hours') ORDER BY due_at ASC) rn FROM inventory_counts WHERE ${where} AND due_at>=? AND due_at<?) WHERE rn<=5 ORDER BY due_at ASC`).bind(...args,monthStartIso,monthEndIso).all();
  return Response.json({items:cal.results},{headers:{'Cache-Control':'no-store'}});
 }
 // Тайлан горим: сонгосон хугацаанд (rfrom/rto, үүсгэсэн огноогоор) үндэслэсэн төлөв/ангилал/хариуцагч,
 // хүлээгдэж буй ба бодит дүнгийн задаргаа. rfrom/rto хоёул сонголттой, буруу форматтай ирвэл 400 биш зүгээр үл тоомсорлоно.
 if(url.searchParams.get('report')==='1'){
  const rFrom=(url.searchParams.get('rfrom')||'').slice(0,10),rTo=(url.searchParams.get('rto')||'').slice(0,10);
  let rFromIso='',rToIso='';
  if(/^\d{4}-\d{2}-\d{2}$/.test(rFrom)){const t=new Date(rFrom+'T00:00:00+08:00');if(!Number.isNaN(t.getTime()))rFromIso=t.toISOString();}
  if(/^\d{4}-\d{2}-\d{2}$/.test(rTo)){const t=new Date(rTo+'T23:59:59+08:00');if(!Number.isNaN(t.getTime()))rToIso=t.toISOString();}
  let rWhere='1=1';const rArgs:unknown[]=[];
  if(rFromIso){rWhere+=' AND created_at>=?';rArgs.push(rFromIso);}
  if(rToIso){rWhere+=' AND created_at<=?';rArgs.push(rToIso);}
  const [statusRows,categoryRows,ownerRows,amountRow]=await Promise.all([
   db().prepare(`SELECT status,COUNT(*) count FROM inventory_counts WHERE ${rWhere} GROUP BY status`).bind(...rArgs).all<{status:string;count:number}>(),
   db().prepare(`SELECT category,COUNT(*) count FROM inventory_counts WHERE ${rWhere} GROUP BY category`).bind(...rArgs).all<{category:string;count:number}>(),
   db().prepare(`SELECT owner,COUNT(*) total,COALESCE(SUM(status='done'),0) done FROM inventory_counts WHERE ${rWhere} GROUP BY owner`).bind(...rArgs).all<{owner:string;total:number;done:number}>(),
   db().prepare(`SELECT COALESCE(SUM(expected_amount),0) expected,COALESCE(SUM(actual_amount),0) actual,COALESCE(SUM(actual_amount IS NOT NULL),0) counted FROM inventory_counts WHERE ${rWhere}`).bind(...rArgs).first<{expected:number;actual:number;counted:number}>(),
  ]);
  const total=statusRows.results.reduce((n,r)=>n+r.count,0);
  const statusMap=new Map(statusRows.results.map(r=>[r.status,r.count]));
  const categoryMap=new Map(categoryRows.results.map(r=>[r.category,r.count]));
  return Response.json({
   total,
   byStatus:Object.keys(inventoryStages).map(k=>({status:k,count:statusMap.get(k)||0})),
   byCategory:inventoryCategories.map(c=>({category:c,count:categoryMap.get(c)||0})),
   byOwner:ownerRows.results,
   amounts:{expected:amountRow?.expected||0,actual:amountRow?.actual||0,counted:amountRow?.counted||0,discrepancy:(amountRow?.actual||0)-(amountRow?.expected||0)},
  },{headers:{'Cache-Control':'no-store'}});
 }
 const [rows,count,stats]=await Promise.all([
  db().prepare(`SELECT * FROM inventory_counts WHERE ${where} ORDER BY (due_at IS NULL),due_at ASC,created_at DESC LIMIT 50 OFFSET ?`).bind(...args,(page-1)*50).all(),
  db().prepare(`SELECT COUNT(*) count FROM inventory_counts WHERE ${where}`).bind(...args).first<{count:number}>(),
  db().prepare(`SELECT COUNT(*) total,COALESCE(SUM(status NOT IN ('done','cancelled')),0) active,COALESCE(SUM(status NOT IN ('done','cancelled') AND due_at IS NOT NULL AND due_at<?),0) overdue,COALESCE(SUM(status='done'),0) done FROM inventory_counts`).bind(new Date().toISOString()).first(),
 ]);
 return Response.json({items:rows.results,count:count?.count||0,page,stats},{headers:{'Cache-Control':'no-store'}});
}catch(e){return err(e);}}
export async function POST(req:Request){try{
 if(!isSameOrigin(req))throw new Failure('Хүсэлтийн эх сурвалж буруу.',403);
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
   db().prepare('INSERT INTO inventory_counts(id,title,category,owner,status,due_at,expected_amount,actual_amount,note,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,d.title,d.category,d.owner,d.status,d.due_at,d.expected_amount,d.actual_amount,d.note||'',m.email,now,now),
   db().prepare('INSERT INTO inventory_count_activities(id,count_id,note,actor,created_at) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),id,'Тооллого бүртгэв.',m.email,now),
  ]);
  return Response.json({ok:true,id});
 }
 if(!b.id||!b.version)throw new Failure('Тооллогын хувилбар дутуу.');
 const t=await getCount(b.id);
 if(t.version!==b.version)throw new Failure('Өөр хүн шинэчилсэн байна. Дахин нээнэ үү.',409);
 if(b.action==='update'){
  const d=taskSchema.parse(b.data);
  await validOwner(d.owner);
  // Бодит дүн шинээр бичигдэх/өөрчлөгдвөл (жишээ нь хоосноос дүн орох) идэвхийн явцад тэмдэглэнэ.
  const discrepancyNote=d.actual_amount!==null&&d.actual_amount!==t.actual_amount
   ?`Бодит дүн: ${d.actual_amount.toLocaleString()} (хүлээгдэж буй ${d.expected_amount.toLocaleString()}, зөрүү ${(d.actual_amount-d.expected_amount).toLocaleString()}).`
   :`Мэдээлэл шинэчилсэн: ${inventoryStages[d.status]||d.status}`;
  const r=await db().batch([
   db().prepare('UPDATE inventory_counts SET title=?,category=?,owner=?,status=?,due_at=?,expected_amount=?,actual_amount=?,note=?,updated_at=?,version=version+1 WHERE id=? AND version=?').bind(d.title,d.category,d.owner,d.status,d.due_at,d.expected_amount,d.actual_amount,d.note||'',now,t.id,b.version),
   db().prepare('INSERT INTO inventory_count_activities(id,count_id,note,actor,created_at) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),t.id,discrepancyNote,m.email,now),
  ]);
  if(!r[0].meta.changes)throw new Failure('Тооллого шинэчлэгдсэн байна. Дахин нээнэ үү.',409);
  return Response.json({ok:true});
 }
 if(b.action==='activity'){
  const a=z.object({note:z.string().trim().min(1).max(2000)}).parse(b.data);
  const r=await db().batch([
   db().prepare('UPDATE inventory_counts SET updated_at=?,version=version+1 WHERE id=? AND version=?').bind(now,t.id,b.version),
   db().prepare('INSERT INTO inventory_count_activities(id,count_id,note,actor,created_at) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),t.id,a.note,m.email,now),
  ]);
  if(!r[0].meta.changes)throw new Failure('Тооллого шинэчлэгдсэн байна. Дахин нээнэ үү.',409);
  return Response.json({ok:true});
 }
 throw new Failure('Тодорхойгүй үйлдэл.');
}catch(e){return err(e);}}
