import {env} from '@/lib/runtime';
import {member,Failure,isSameOrigin} from '@/lib/access';
import {z} from 'zod';
import {inventoryStages,isIsolatedRole,type Member,type InventoryCount} from '@/lib/crm';
export const dynamic='force-dynamic';
const db=()=>env.DB!;
// Маркетинг, IT хоёул агуулахын үйл ажиллагаатай хамааралгүй тул хаана; Удирдлага, Ахлах, Админ,
// агент бүгд агуулахын тооллогод хамрагдана.
function assertAccess(m:Member){if(isIsolatedRole(m.role))throw new Failure('Энэ хэсэгт хандах эрхгүй.',403);}
async function getCount(id:string){
 const t=await db().prepare('SELECT * FROM inventory_counts WHERE id=?').bind(id).first<InventoryCount>();
 if(!t)throw new Failure('Тооллого олдсонгүй.',404);
 return t;
}
async function warehouseName(id:string){
 const w=await db().prepare('SELECT name FROM inventory_warehouses WHERE id=?').bind(id).first<{name:string}>();
 if(!w)throw new Failure('Агуулах олдсонгүй.',404);
 return w.name;
}
const bodySchema=z.object({action:z.enum(['create','update','activity','save_lines','finalize']),id:z.string().max(80).optional(),version:z.number().int().positive().optional(),data:z.unknown()});
const taskSchema=z.object({
 title:z.string().trim().min(1).max(160),
 warehouse_id:z.string().min(1),
 owner:z.string().email(),
 status:z.string().refine(v=>Object.hasOwn(inventoryStages,v)),
 due_at:z.string().datetime().nullable(),
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
  const [activities,lines,warehouse]=await Promise.all([
   db().prepare('SELECT * FROM inventory_count_activities WHERE count_id=? ORDER BY created_at DESC LIMIT 100').bind(id).all(),
   db().prepare('SELECT l.*,it.name item_name,it.code item_code FROM inventory_count_lines l JOIN inventory_items it ON it.id=l.item_id WHERE l.count_id=? ORDER BY it.name').bind(id).all(),
   task.warehouse_id?db().prepare('SELECT name FROM inventory_warehouses WHERE id=?').bind(task.warehouse_id).first<{name:string}>():Promise.resolve(null),
  ]);
  return Response.json({task,activities:activities.results,lines:lines.results,warehouse_name:warehouse?.name||''},{headers:{'Cache-Control':'no-store'}});
 }
 const page=Math.max(1,Math.min(1000,Number(url.searchParams.get('page'))||1));
 const q=(url.searchParams.get('q')||'').slice(0,100),status=url.searchParams.get('status')||'',owner=(url.searchParams.get('owner')||'').trim().toLowerCase().slice(0,120);
 let where='1=1';const args:unknown[]=[];
 if(q){where+=' AND c.title LIKE ?';args.push('%'+q+'%');}
 if(status&&Object.hasOwn(inventoryStages,status)){where+=' AND c.status=?';args.push(status);}
 if(owner){where+=' AND c.owner=?';args.push(owner);}
 // Календарь горим: тухайн шүүлтүүрээр хязгаарлаад, зөвхөн сонгосон сард due_at тохирох хөнгөн мөрүүдийг буцаана.
 if(url.searchParams.get('calendar')==='1'){
  const monthParam=(url.searchParams.get('month')||'').slice(0,7);
  if(!/^\d{4}-\d{2}$/.test(monthParam))throw new Failure('Сар буруу.');
  const [my,mm]=monthParam.split('-').map(Number);
  const nextMonth=mm===12?`${my+1}-01`:`${my}-${String(mm+1).padStart(2,'0')}`;
  const monthStartIso=new Date(monthParam+'-01T00:00:00+08:00').toISOString();
  const monthEndIso=new Date(nextMonth+'-01T00:00:00+08:00').toISOString();
  const cWhere=where.replaceAll('c.','');
  const day=url.searchParams.get('day');
  if(day){
   if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!day.startsWith(monthParam+'-')||day.slice(8)<'01'||day.slice(8)>'31')throw new Failure('Өдөр буруу.');
   const dayWhere=cWhere+" AND due_at>=? AND due_at<? AND date(due_at,'+8 hours')=?";
   const dayArgs=[...args,monthStartIso,monthEndIso,day];
   const [count,rows]=await Promise.all([
    db().prepare(`SELECT COUNT(*) n FROM inventory_counts WHERE ${dayWhere}`).bind(...dayArgs).first<{n:number}>(),
    db().prepare(`SELECT id,title,due_at,status FROM inventory_counts WHERE ${dayWhere} ORDER BY due_at,id LIMIT 50 OFFSET ?`).bind(...dayArgs,(page-1)*50).all(),
   ]);
   return Response.json({items:rows.results,total:count?.n||0},{headers:{'Cache-Control':'no-store'}});
  }
  const cal=await db().prepare(`SELECT id,title,due_at,status,day_count FROM (SELECT id,title,due_at,status,COUNT(*) OVER (PARTITION BY date(due_at,'+8 hours')) day_count,ROW_NUMBER() OVER (PARTITION BY date(due_at,'+8 hours') ORDER BY due_at ASC) rn FROM inventory_counts WHERE ${cWhere} AND due_at>=? AND due_at<?) WHERE rn<=5 ORDER BY due_at ASC`).bind(...args,monthStartIso,monthEndIso).all();
  return Response.json({items:cal.results},{headers:{'Cache-Control':'no-store'}});
 }
 const [rows,count,stats]=await Promise.all([
  db().prepare(`SELECT c.*,w.name warehouse_name,(SELECT COUNT(*) FROM inventory_count_lines l WHERE l.count_id=c.id) line_count,(SELECT COUNT(*) FROM inventory_count_lines l WHERE l.count_id=c.id AND l.counted_qty IS NOT NULL AND l.counted_qty!=l.expected_qty) discrepancy_count FROM inventory_counts c LEFT JOIN inventory_warehouses w ON w.id=c.warehouse_id WHERE ${where} ORDER BY (c.due_at IS NULL),c.due_at ASC,c.created_at DESC LIMIT 50 OFFSET ?`).bind(...args,(page-1)*50).all(),
  db().prepare(`SELECT COUNT(*) count FROM inventory_counts c WHERE ${where}`).bind(...args).first<{count:number}>(),
  db().prepare(`SELECT COUNT(*) total,COALESCE(SUM(status NOT IN ('done','cancelled')),0) active,COALESCE(SUM(status NOT IN ('done','cancelled') AND due_at IS NOT NULL AND due_at<?),0) overdue,COALESCE(SUM(status='done'),0) done FROM inventory_counts`).bind(new Date().toISOString()).first(),
 ]);
 return Response.json({items:rows.results,count:count?.count||0,page,stats},{headers:{'Cache-Control':'no-store'}});
}catch(e){return err(e);}}
export async function POST(req:Request){try{
 if(!isSameOrigin(req))throw new Failure('Хүсэлтийн эх сурвалж буруу.',403);
 if(Number(req.headers.get('content-length')||0)>200000)throw new Failure('Файл хэт том.',413);
 const m=await member();assertAccess(m);
 const raw=await req.text();
 if(raw.length>200000)throw new Failure('Мэдээлэл хэт их.',413);
 const b=bodySchema.parse(JSON.parse(raw)),now=new Date().toISOString();
 if(b.action==='create'){
  const d=taskSchema.parse(b.data);
  await validOwner(d.owner);
  await warehouseName(d.warehouse_id);
  const id=crypto.randomUUID();
  // Тухайн агуулахад одоогоор тэг биш үлдэгдэлтэй бүх барааг тооллогын мөр болгож урьдчилж үүсгэнэ.
  const stockRows=await db().prepare(`SELECT item_id,COALESCE(SUM(qty_delta),0) qty FROM inventory_stock_moves WHERE warehouse_id=? GROUP BY item_id HAVING qty!=0`).bind(d.warehouse_id).all<{item_id:string;qty:number}>();
  await db().batch([
   db().prepare('INSERT INTO inventory_counts(id,title,category,owner,status,due_at,note,created_by,created_at,updated_at,warehouse_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(id,d.title,'',d.owner,d.status,d.due_at,d.note||'',m.email,now,now,d.warehouse_id),
   db().prepare('INSERT INTO inventory_count_activities(id,count_id,note,actor,created_at) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),id,`Тооллого бүртгэж, ${stockRows.results.length} бараа мөр үүсгэв.`,m.email,now),
   ...stockRows.results.map(r=>db().prepare('INSERT INTO inventory_count_lines(id,count_id,item_id,expected_qty) VALUES(?,?,?,?)').bind(crypto.randomUUID(),id,r.item_id,r.qty)),
  ]);
  return Response.json({ok:true,id});
 }
 if(!b.id||!b.version)throw new Failure('Тооллогын хувилбар дутуу.');
 const t=await getCount(b.id);
 if(t.version!==b.version)throw new Failure('Өөр хүн шинэчилсэн байна. Дахин нээнэ үү.',409);
 if(b.action==='update'){
  const d=taskSchema.parse(b.data);
  await validOwner(d.owner);
  // Тооллого үүссэний дараа агуулахыг өөрчилвөл мөрүүд буруу болох тул зөвхөн бусад талбарыг шинэчилнэ.
  const r=await db().batch([
   db().prepare('UPDATE inventory_counts SET title=?,owner=?,status=?,due_at=?,note=?,updated_at=?,version=version+1 WHERE id=? AND version=?').bind(d.title,d.owner,d.status,d.due_at,d.note||'',now,t.id,b.version),
   db().prepare('INSERT INTO inventory_count_activities(id,count_id,note,actor,created_at) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),t.id,'Мэдээлэл шинэчилсэн: '+(inventoryStages[d.status]||d.status),m.email,now),
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
 if(b.action==='save_lines'){
  const d=z.object({lines:z.array(z.object({line_id:z.string().min(1),counted_qty:z.number().int().min(0).max(1000000).nullable()})).min(1).max(5000)}).parse(b.data);
  const r=await db().batch([
   db().prepare('UPDATE inventory_counts SET updated_at=?,version=version+1 WHERE id=? AND version=?').bind(now,t.id,b.version),
   ...d.lines.map(l=>db().prepare('UPDATE inventory_count_lines SET counted_qty=? WHERE id=? AND count_id=?').bind(l.counted_qty,l.line_id,t.id)),
  ]);
  if(!r[0].meta.changes)throw new Failure('Тооллого шинэчлэгдсэн байна. Дахин нээнэ үү.',409);
  return Response.json({ok:true});
 }
 if(b.action==='finalize'){
  // Тоолсон бүх мөрийн зөрүүг агуулахын үлдэгдэлд шууд тохируулж, тооллогыг "Дууссан" болгоно.
  const lines=await db().prepare('SELECT item_id,expected_qty,counted_qty FROM inventory_count_lines WHERE count_id=? AND counted_qty IS NOT NULL').bind(t.id).all<{item_id:string;expected_qty:number;counted_qty:number}>();
  const adjustments=lines.results.filter(l=>l.counted_qty!==l.expected_qty);
  const r=await db().batch([
   db().prepare('UPDATE inventory_counts SET status=?,updated_at=?,version=version+1 WHERE id=? AND version=?').bind('done',now,t.id,b.version),
   db().prepare('INSERT INTO inventory_count_activities(id,count_id,note,actor,created_at) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),t.id,`Тооллого дуусгав: ${lines.results.length} бараа тоологдож, ${adjustments.length} зөрүү илэрсэн тул үлдэгдэлд тохируулав.`,m.email,now),
   ...adjustments.map(l=>db().prepare('INSERT INTO inventory_stock_moves(id,item_id,warehouse_id,kind,qty_delta,unit_cost,ref_id,note,actor,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),l.item_id,t.warehouse_id,'count_adjustment',l.counted_qty-l.expected_qty,null,t.id,'Тооллогоор тохируулав: '+t.title,m.email,now)),
  ]);
  if(!r[0].meta.changes)throw new Failure('Тооллого шинэчлэгдсэн байна. Дахин нээнэ үү.',409);
  return Response.json({ok:true,adjusted:adjustments.length});
 }
 throw new Failure('Тодорхойгүй үйлдэл.');
}catch(e){return err(e);}}
