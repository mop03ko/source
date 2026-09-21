import {env} from '@/lib/runtime';
import {member,Failure,isSameOrigin} from '@/lib/access';
import {z} from 'zod';
import {deliveryStatuses,deliveryDone,canSeeDeliveries,isCourierOnly,type Member,type Delivery} from '@/lib/crm';
export const dynamic='force-dynamic';
const db=()=>env.DB!;
// Маркетинг, IT хоёул хүргэлтэд хамааралгүй тул хаана. Хүргэгч (delivery) зөвхөн өөрийн хүргэлтээ
// хардаг, төлөвөө л шинэчилнэ; бусад бүх эрх бүх хүргэлтийг харж, бүртгэж, засна.
function assertAccess(m:Member){if(!canSeeDeliveries(m.role))throw new Failure('Энэ хэсэгт хандах эрхгүй.',403);}
const day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/,'Огноо YYYY-MM-DD хэлбэртэй байна.');
const bodySchema=z.object({action:z.enum(['create','update','set_status']),id:z.string().max(80).optional(),version:z.number().int().positive().optional(),data:z.unknown()});
const deliverySchema=z.object({
 delivered_on:day,
 kind:z.string().trim().max(60).default(''),
 item_id:z.string().trim().max(80).nullish(),
 item_info:z.string().trim().max(400).default(''),
 customer_phone:z.string().trim().max(120).default(''),
 address:z.string().trim().max(500).default(''),
 payment_channel:z.string().trim().max(60).default(''),
 contents:z.string().trim().max(200).default(''),
 courier_email:z.string().email().nullish(),
 courier_name:z.string().trim().max(120).default(''),
 status:z.string().refine(v=>Object.hasOwn(deliveryStatuses,v),'Төлөв буруу.'),
 sale_id:z.string().trim().max(80).nullish(),
 lead_id:z.string().trim().max(80).nullish(),
 note:z.string().trim().max(2000).default(''),
});
// Хүргэгчийг и-мэйлээр сонгосон бол нэрийг гишүүний бүртгэлээс авна (тайлан нэрээр бүлэглэдэг тул
// нэр үргэлж бөглөгдсөн байх ёстой); и-мэйлгүй бол гараар бичсэн нэрийг шаардна.
async function resolveCourier(d:{courier_email?:string|null;courier_name:string}){
 if(d.courier_email){
  const row=await db().prepare('SELECT name FROM members WHERE email=? AND active=1').bind(d.courier_email).first<{name:string}>();
  if(!row)throw new Failure('Идэвхтэй хүргэлтийн ажилтан сонгоно уу.');
  return {email:d.courier_email,name:row.name};
 }
 if(!d.courier_name)throw new Failure('Хүргэлтийн ажилтныг сонгоно уу.');
 return {email:null,name:d.courier_name};
}
// Хүргэлтийг агуулахын бараатай холбоход тэр бараа бүртгэлд байгааг батална; холбоогүй ч байж болно
// (гэрээ, баримт хүргэх эсвэл Excel-ээс импортолсон хуучин мөрүүд).
async function resolveItem(id?:string|null){
 if(!id)return null;
 if(!await db().prepare('SELECT id FROM inventory_items WHERE id=?').bind(id).first())throw new Failure('Агуулахад тохирох бараа олдсонгүй.',404);
 return id;
}
async function getDelivery(id:string){
 const row=await db().prepare('SELECT * FROM deliveries WHERE id=?').bind(id).first<Delivery>();
 if(!row)throw new Failure('Хүргэлт олдсонгүй.',404);
 return row;
}
function err(e:unknown){
 if(e instanceof Failure)return Response.json({error:e.message},{status:e.status});
 if(e instanceof z.ZodError)return Response.json({fieldErrors:Object.fromEntries(e.issues.map(i=>[String(i.path.at(-1)||''),i.message])),error:'Мэдээллээ шалгана уу: '+e.issues.map(i=>i.path.join('.')+' '+i.message).join('; ')},{status:400});
 console.error('Delivery request failed',e instanceof Error?e.message:'error');
 return Response.json({error:'Хадгалж чадсангүй. Дахин оролдоно уу.'},{status:500});
}
// Хүргэгчийн эрхээр зөвхөн өөрт хуваарилагдсан мөр (и-мэйлээр, эсвэл Excel-ээс импортолсон и-мэйлгүй
// мөрүүдийн хувьд нэрээр) харагдана.
function mineOnly(m:Member,where:string,args:unknown[]){
 if(!isCourierOnly(m.role))return where;
 args.push(m.email,m.name);
 return where+' AND (courier_email=? OR (courier_email IS NULL AND courier_name=?))';
}
export async function GET(req:Request){try{
 const m=await member();assertAccess(m);
 const url=new URL(req.url);
 const id=url.searchParams.get('id');
 if(id){
  const row=await db().prepare('SELECT d.*,it.code item_code,it.name item_name,it.brand item_brand FROM deliveries d LEFT JOIN inventory_items it ON it.id=d.item_id WHERE d.id=?').bind(id).first<Delivery&{item_code:string|null;item_name:string|null}>();
  if(!row)throw new Failure('Хүргэлт олдсонгүй.',404);
  if(isCourierOnly(m.role)&&!(row.courier_email===m.email||(!row.courier_email&&row.courier_name===m.name)))throw new Failure('Энэ хүргэлтийг харах эрхгүй.',403);
  return Response.json({delivery:row},{headers:{'Cache-Control':'no-store'}});
 }
 if(url.searchParams.get('report')==='1'){
  const rfrom=url.searchParams.get('rfrom')||'',rto=url.searchParams.get('rto')||'';
  let where='1=1';const args:unknown[]=[];
  if(rfrom){day.parse(rfrom);where+=' AND delivered_on>=?';args.push(rfrom);}
  if(rto){day.parse(rto);where+=' AND delivered_on<=?';args.push(rto);}
  where=mineOnly(m,where,args);
  const done=deliveryDone.map(s=>`'${s}'`).join(',');
  const [total,byCourier,byMonth,byChannel,byKind,byStatus,byItem]=await Promise.all([
   db().prepare(`SELECT COUNT(*) n FROM deliveries WHERE ${where}`).bind(...args).first<{n:number}>(),
   db().prepare(`SELECT courier_name name,COUNT(*) total,COALESCE(SUM(status IN (${done})),0) done,COALESCE(SUM(status='failed'),0) failed,COALESCE(SUM(status='cancelled'),0) cancelled,COALESCE(SUM(status='pending'),0) pending,MAX(delivered_on) last_day,COUNT(DISTINCT delivered_on) active_days FROM deliveries WHERE ${where} GROUP BY courier_name ORDER BY total DESC`).bind(...args).all(),
   db().prepare(`SELECT substr(delivered_on,1,7) month,COUNT(*) total,COALESCE(SUM(status IN (${done})),0) done FROM deliveries WHERE ${where} GROUP BY month ORDER BY month`).bind(...args).all(),
   db().prepare(`SELECT CASE WHEN payment_channel='' THEN 'Тодорхойгүй' ELSE payment_channel END channel,COUNT(*) total FROM deliveries WHERE ${where} GROUP BY channel ORDER BY total DESC LIMIT 20`).bind(...args).all(),
   db().prepare(`SELECT CASE WHEN kind='' THEN 'Тодорхойгүй' ELSE kind END kind,COUNT(*) total FROM deliveries WHERE ${where} GROUP BY kind ORDER BY total DESC LIMIT 20`).bind(...args).all(),
   db().prepare(`SELECT status,COUNT(*) total FROM deliveries WHERE ${where} GROUP BY status`).bind(...args).all(),
   db().prepare(`SELECT it.name,it.code,COUNT(*) total FROM deliveries d JOIN inventory_items it ON it.id=d.item_id WHERE ${where.replaceAll('courier_email','d.courier_email').replaceAll('courier_name','d.courier_name')} AND d.item_id IS NOT NULL GROUP BY d.item_id ORDER BY total DESC LIMIT 15`).bind(...args).all(),
  ]);
  return Response.json({total:total?.n||0,byCourier:byCourier.results,byMonth:byMonth.results,byChannel:byChannel.results,byKind:byKind.results,byStatus:byStatus.results,byItem:byItem.results},{headers:{'Cache-Control':'no-store'}});
 }
 const page=Math.max(1,Math.min(1000,Number(url.searchParams.get('page'))||1));
 const q=(url.searchParams.get('q')||'').slice(0,100);
 const status=url.searchParams.get('status')||'',courier=(url.searchParams.get('courier')||'').slice(0,120);
 const channel=(url.searchParams.get('channel')||'').slice(0,60),kind=(url.searchParams.get('kind')||'').slice(0,60);
 const from=url.searchParams.get('from')||'',to=url.searchParams.get('to')||'';
 let where='1=1';const args:unknown[]=[];
 if(q){where+=' AND (d.customer_phone LIKE ? OR d.address LIKE ? OR d.item_info LIKE ? OR it.code LIKE ? OR it.name LIKE ?)';args.push(...Array(5).fill('%'+q+'%'));}
 if(status&&Object.hasOwn(deliveryStatuses,status)){where+=' AND status=?';args.push(status);}
 if(courier){where+=' AND courier_name=?';args.push(courier);}
 if(channel){where+=' AND payment_channel=?';args.push(channel);}
 if(kind){where+=' AND kind=?';args.push(kind);}
 if(from){day.parse(from);where+=' AND delivered_on>=?';args.push(from);}
 if(to){day.parse(to);where+=' AND delivered_on<=?';args.push(to);}
 where=mineOnly(m,where,args);
 const done=deliveryDone.map(s=>`'${s}'`).join(',');
 const [rows,count,stats,couriers,channels]=await Promise.all([
  db().prepare(`SELECT d.*,it.code item_code,it.name item_name,it.brand item_brand FROM deliveries d LEFT JOIN inventory_items it ON it.id=d.item_id WHERE ${where} ORDER BY d.delivered_on DESC,d.created_at DESC LIMIT 50 OFFSET ?`).bind(...args,(page-1)*50).all(),
  db().prepare(`SELECT COUNT(*) count FROM deliveries d LEFT JOIN inventory_items it ON it.id=d.item_id WHERE ${where}`).bind(...args).first<{count:number}>(),
  db().prepare(`SELECT COUNT(*) total,COALESCE(SUM(d.status IN (${done})),0) done,COALESCE(SUM(d.status='pending'),0) pending,COALESCE(SUM(d.status='failed' OR d.status='cancelled'),0) failed,COALESCE(SUM(d.item_id IS NOT NULL),0) linked FROM deliveries d LEFT JOIN inventory_items it ON it.id=d.item_id WHERE ${where}`).bind(...args).first(),
  db().prepare('SELECT courier_name name,COUNT(*) total FROM deliveries GROUP BY courier_name ORDER BY total DESC LIMIT 100').all(),
  db().prepare("SELECT payment_channel name FROM deliveries WHERE payment_channel!='' GROUP BY payment_channel ORDER BY COUNT(*) DESC LIMIT 60").all(),
 ]);
 return Response.json({items:rows.results,count:count?.count||0,page,stats,couriers:couriers.results,channels:channels.results},{headers:{'Cache-Control':'no-store'}});
}catch(e){return err(e);}}
export async function POST(req:Request){try{
 if(!isSameOrigin(req))throw new Failure('Хүсэлтийн эх сурвалж буруу.',403);
 if(Number(req.headers.get('content-length')||0)>100000)throw new Failure('Мэдээлэл хэт их.',413);
 const m=await member();assertAccess(m);
 const raw=await req.text();
 if(raw.length>100000)throw new Failure('Мэдээлэл хэт их.',413);
 const b=bodySchema.parse(JSON.parse(raw)),now=new Date().toISOString();
 if(b.action==='create'){
  if(isCourierOnly(m.role))throw new Failure('Хүргэлт бүртгэх эрхгүй.',403);
  const d=deliverySchema.parse(b.data);
  const courier=await resolveCourier(d);
  const id=crypto.randomUUID();
  await db().prepare('INSERT INTO deliveries(id,delivered_on,kind,item_id,item_info,customer_phone,address,payment_channel,contents,courier_email,courier_name,entered_by_email,entered_by_name,status,sale_id,lead_id,note,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
   .bind(id,d.delivered_on,d.kind,await resolveItem(d.item_id),d.item_info,d.customer_phone,d.address,d.payment_channel,d.contents,courier.email,courier.name,m.email,m.name,d.status,d.sale_id||null,d.lead_id||null,d.note,m.email,now,now).run();
  return Response.json({ok:true,id});
 }
 if(!b.id||!b.version)throw new Failure('Хүргэлтийн хувилбар дутуу.');
 const row=await getDelivery(b.id);
 if(row.version!==b.version)throw new Failure('Өөр хүн шинэчилсэн байна. Дахин нээнэ үү.',409);
 if(b.action==='set_status'){
  // Хүргэгч зөвхөн өөрийн хүргэлтийн төлөвийг л шинэчилнэ.
  if(isCourierOnly(m.role)&&!(row.courier_email===m.email||(!row.courier_email&&row.courier_name===m.name)))throw new Failure('Энэ хүргэлтийг шинэчлэх эрхгүй.',403);
  const d=z.object({status:z.string().refine(v=>Object.hasOwn(deliveryStatuses,v),'Төлөв буруу.'),note:z.string().trim().max(2000).optional()}).parse(b.data);
  const r=await db().prepare('UPDATE deliveries SET status=?,note=COALESCE(?,note),updated_at=?,version=version+1 WHERE id=? AND version=?').bind(d.status,d.note??null,now,row.id,b.version).run();
  if(!r.meta.changes)throw new Failure('Хүргэлт шинэчлэгдсэн байна. Дахин нээнэ үү.',409);
  return Response.json({ok:true});
 }
 if(b.action==='update'){
  if(isCourierOnly(m.role))throw new Failure('Хүргэлтийн мэдээллийг засах эрхгүй.',403);
  const d=deliverySchema.parse(b.data);
  const courier=await resolveCourier(d);
  const r=await db().prepare('UPDATE deliveries SET delivered_on=?,kind=?,item_id=?,item_info=?,customer_phone=?,address=?,payment_channel=?,contents=?,courier_email=?,courier_name=?,status=?,sale_id=?,lead_id=?,note=?,updated_at=?,version=version+1 WHERE id=? AND version=?')
   .bind(d.delivered_on,d.kind,await resolveItem(d.item_id),d.item_info,d.customer_phone,d.address,d.payment_channel,d.contents,courier.email,courier.name,d.status,d.sale_id||null,d.lead_id||null,d.note,now,row.id,b.version).run();
  if(!r.meta.changes)throw new Failure('Хүргэлт шинэчлэгдсэн байна. Дахин нээнэ үү.',409);
  return Response.json({ok:true});
 }
 throw new Failure('Тодорхойгүй үйлдэл.');
}catch(e){return err(e);}}
