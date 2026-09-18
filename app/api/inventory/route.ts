import {env} from '@/lib/runtime';
import {member,Failure,isSameOrigin} from '@/lib/access';
import {z} from 'zod';
import {isIsolatedRole,type Member} from '@/lib/crm';
export const dynamic='force-dynamic';
const db=()=>env.DB!;
// Маркетинг, IT хоёул борлуулалтын барааны нөөцтэй хамааралгүй тул хаана; агент, ахлах, удирдлага,
// админ дөрвүүлээ бараа, орлого, зарлагыг бүрэн ашиглана (Борлуулалт таб доторх Тооллого sub-tab).
function assertAccess(m:Member){if(isIsolatedRole(m.role))throw new Failure('Энэ хэсэгт хандах эрхгүй.',403);}
function err(e:unknown){
 if(e instanceof Failure)return Response.json({error:e.message},{status:e.status});
 if(e instanceof z.ZodError)return Response.json({error:'Мэдээллээ шалгана уу: '+e.issues.map(i=>i.path.join('.')+' '+i.message).join('; ')},{status:400});
 console.error('Inventory request failed',e instanceof Error?e.message:'error');
 return Response.json({error:'Хадгалж чадсангүй. Дахин оролдоно уу.'},{status:500});
}
async function warehouseName(id:string){
 const w=await db().prepare('SELECT name FROM inventory_warehouses WHERE id=?').bind(id).first<{name:string}>();
 if(!w)throw new Failure('Агуулах олдсонгүй.',404);
 return w.name;
}
async function itemRow(id:string){
 const it=await db().prepare('SELECT * FROM inventory_items WHERE id=?').bind(id).first();
 if(!it)throw new Failure('Бараа олдсонгүй.',404);
 return it;
}
// Тухайн барааны нийт үлдэгдэл (бүх агуулахаар) эсвэл нэг агуулахын үлдэгдлийг stock_moves-ийн
// нийлбэрээр тооцоолно; тусдаа "одоогийн тоо" багана байхгүй тул дандаа бодит зөрөхгүй тоо гарна.
async function itemStock(itemId:string,warehouseId?:string){
 const r=warehouseId
  ?await db().prepare('SELECT COALESCE(SUM(qty_delta),0) qty FROM inventory_stock_moves WHERE item_id=? AND warehouse_id=?').bind(itemId,warehouseId).first<{qty:number}>()
  :await db().prepare('SELECT COALESCE(SUM(qty_delta),0) qty FROM inventory_stock_moves WHERE item_id=?').bind(itemId).first<{qty:number}>();
 return r?.qty||0;
}
const itemSchema=z.object({code:z.string().trim().max(80).optional(),brand:z.string().trim().max(120).optional(),name:z.string().trim().min(1).max(200),variant:z.string().trim().max(120).optional(),imei:z.string().trim().max(80).optional(),sale_price:z.number().int().min(0).max(1000000000000).optional()});
const purchaseSchema=z.object({item_id:z.string().min(1),warehouse_id:z.string().min(1),qty:z.number().int().min(1).max(1000000),unit_cost:z.number().int().min(0).max(1000000000000).optional(),ordered_at:z.string().datetime().nullable().optional(),received_at:z.string().datetime().nullable().optional(),payment_status:z.string().trim().max(60).optional(),note:z.string().trim().max(2000).optional()});
const saleSchema=z.object({item_id:z.string().min(1),warehouse_id:z.string().min(1),qty:z.number().int().min(1).max(1000000),unit_price:z.number().int().min(0).max(1000000000000).optional(),customer_name:z.string().trim().max(160).optional(),customer_phone:z.string().trim().max(40).optional(),platform:z.string().trim().max(80).optional(),sold_at:z.string().datetime().nullable().optional(),note:z.string().trim().max(2000).optional()});
export async function GET(req:Request){try{
 const m=await member();assertAccess(m);
 const url=new URL(req.url);
 const view=url.searchParams.get('view')||'items';
 if(view==='warehouses'){
  const rows=await db().prepare('SELECT * FROM inventory_warehouses ORDER BY name').all();
  return Response.json({items:rows.results},{headers:{'Cache-Control':'no-store'}});
 }
 const id=url.searchParams.get('id');
 if(view==='items'&&id){
  const it=await itemRow(id);
  const [byWarehouse,moves]=await Promise.all([
   db().prepare('SELECT w.id warehouse_id,w.name warehouse_name,COALESCE(SUM(sm.qty_delta),0) qty FROM inventory_warehouses w LEFT JOIN inventory_stock_moves sm ON sm.warehouse_id=w.id AND sm.item_id=? GROUP BY w.id HAVING qty!=0 ORDER BY w.name').bind(id).all(),
   db().prepare('SELECT * FROM inventory_stock_moves WHERE item_id=? ORDER BY created_at DESC LIMIT 50').bind(id).all(),
  ]);
  return Response.json({item:it,byWarehouse:byWarehouse.results,moves:moves.results},{headers:{'Cache-Control':'no-store'}});
 }
 if(view==='items'){
  const page=Math.max(1,Math.min(1000,Number(url.searchParams.get('page'))||1));
  const q=(url.searchParams.get('q')||'').slice(0,100);
  let where='1=1';const args:unknown[]=[];
  if(q){where+=' AND (code LIKE ? OR brand LIKE ? OR name LIKE ? OR variant LIKE ? OR imei LIKE ?)';args.push(...Array(5).fill('%'+q+'%'));}
  const [rows,count]=await Promise.all([
   db().prepare(`SELECT it.*,COALESCE((SELECT SUM(qty_delta) FROM inventory_stock_moves sm WHERE sm.item_id=it.id),0) stock FROM inventory_items it WHERE ${where} ORDER BY it.name LIMIT 50 OFFSET ?`).bind(...args,(page-1)*50).all(),
   db().prepare(`SELECT COUNT(*) count FROM inventory_items WHERE ${where}`).bind(...args).first<{count:number}>(),
  ]);
  return Response.json({items:rows.results,count:count?.count||0,page},{headers:{'Cache-Control':'no-store'}});
 }
 if(view==='purchases'||view==='sales'){
  const table=view==='purchases'?'inventory_purchases':'inventory_sales';
  const page=Math.max(1,Math.min(1000,Number(url.searchParams.get('page'))||1));
  const q=(url.searchParams.get('q')||'').slice(0,100);
  let where='1=1';const args:unknown[]=[];
  if(q){where+=' AND EXISTS(SELECT 1 FROM inventory_items it WHERE it.id=t.item_id AND (it.name LIKE ? OR it.code LIKE ?))';args.push('%'+q+'%','%'+q+'%');}
  const [rows,count]=await Promise.all([
   db().prepare(`SELECT t.*,it.name item_name,it.code item_code,w.name warehouse_name FROM ${table} t JOIN inventory_items it ON it.id=t.item_id JOIN inventory_warehouses w ON w.id=t.warehouse_id WHERE ${where} ORDER BY t.created_at DESC LIMIT 50 OFFSET ?`).bind(...args,(page-1)*50).all(),
   db().prepare(`SELECT COUNT(*) count FROM ${table} t WHERE ${where}`).bind(...args).first<{count:number}>(),
  ]);
  return Response.json({items:rows.results,count:count?.count||0,page},{headers:{'Cache-Control':'no-store'}});
 }
 throw new Failure('Тодорхойгүй харагдац.');
}catch(e){return err(e);}}
export async function POST(req:Request){try{
 if(!isSameOrigin(req))throw new Failure('Хүсэлтийн эх сурвалж буруу.',403);
 if(Number(req.headers.get('content-length')||0)>50000)throw new Failure('Файл хэт том.',413);
 const m=await member();assertAccess(m);
 const raw=await req.text();
 if(raw.length>50000)throw new Failure('Мэдээлэл хэт их.',413);
 const b=z.object({action:z.enum(['create_item','update_item','create_warehouse','record_purchase','record_sale']),id:z.string().max(80).optional(),data:z.unknown()}).parse(JSON.parse(raw));
 const now=new Date().toISOString();
 if(b.action==='create_warehouse'){
  const d=z.object({name:z.string().trim().min(1).max(120)}).parse(b.data);
  if(await db().prepare('SELECT 1 FROM inventory_warehouses WHERE name=?').bind(d.name).first())throw new Failure('Ийм нэртэй агуулах аль хэдийн бүртгэлтэй байна.');
  const id=crypto.randomUUID();
  await db().prepare('INSERT INTO inventory_warehouses(id,name,created_at) VALUES(?,?,?)').bind(id,d.name,now).run();
  return Response.json({ok:true,id});
 }
 if(b.action==='create_item'){
  const d=itemSchema.parse(b.data);
  const id=crypto.randomUUID();
  await db().prepare('INSERT INTO inventory_items(id,code,brand,name,variant,imei,sale_price,active,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,1,?,?,?)').bind(id,d.code||'',d.brand||'',d.name,d.variant||'',d.imei||null,d.sale_price||0,m.email,now,now).run();
  return Response.json({ok:true,id});
 }
 if(b.action==='update_item'){
  if(!b.id)throw new Failure('Барааны ID дутуу.');
  const d=itemSchema.parse(b.data);
  await itemRow(b.id);
  await db().prepare('UPDATE inventory_items SET code=?,brand=?,name=?,variant=?,imei=?,sale_price=?,updated_at=? WHERE id=?').bind(d.code||'',d.brand||'',d.name,d.variant||'',d.imei||null,d.sale_price||0,now,b.id).run();
  return Response.json({ok:true});
 }
 if(b.action==='record_purchase'){
  const d=purchaseSchema.parse(b.data);
  await itemRow(d.item_id);await warehouseName(d.warehouse_id);
  const totalCost=(d.unit_cost||0)*d.qty;
  const id=crypto.randomUUID();
  await db().batch([
   db().prepare('INSERT INTO inventory_purchases(id,item_id,warehouse_id,qty,unit_cost,total_cost,ordered_at,received_at,payment_status,note,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,d.item_id,d.warehouse_id,d.qty,d.unit_cost||0,totalCost,d.ordered_at||null,d.received_at||null,d.payment_status||'',d.note||'',m.email,now),
   db().prepare('INSERT INTO inventory_stock_moves(id,item_id,warehouse_id,kind,qty_delta,unit_cost,ref_id,note,actor,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),d.item_id,d.warehouse_id,'purchase',d.qty,d.unit_cost||0,id,d.note||'',m.email,now),
  ]);
  return Response.json({ok:true,id});
 }
 if(b.action==='record_sale'){
  const d=saleSchema.parse(b.data);
  await itemRow(d.item_id);await warehouseName(d.warehouse_id);
  const current=await itemStock(d.item_id,d.warehouse_id);
  if(current<d.qty)throw new Failure(`Тухайн агуулахад ${current.toLocaleString()} үлдэгдэлтэй байхад ${d.qty.toLocaleString()} зарах боломжгүй.`);
  const totalPrice=(d.unit_price||0)*d.qty;
  const id=crypto.randomUUID();
  await db().batch([
   db().prepare('INSERT INTO inventory_sales(id,item_id,warehouse_id,qty,unit_price,total_price,customer_name,customer_phone,platform,sold_at,note,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,d.item_id,d.warehouse_id,d.qty,d.unit_price||0,totalPrice,d.customer_name||'',d.customer_phone||'',d.platform||'',d.sold_at||null,d.note||'',m.email,now),
   db().prepare('INSERT INTO inventory_stock_moves(id,item_id,warehouse_id,kind,qty_delta,unit_cost,ref_id,note,actor,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),d.item_id,d.warehouse_id,'sale',-d.qty,null,id,d.note||'',m.email,now),
  ]);
  return Response.json({ok:true,id});
 }
 throw new Failure('Тодорхойгүй үйлдэл.');
}catch(e){return err(e);}}
