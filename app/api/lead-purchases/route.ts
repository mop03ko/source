import {env} from '@/lib/runtime';
import {member,Failure,isSameOrigin} from '@/lib/access';
import {type Lead,type Member} from '@/lib/crm';
import {cents,safeTotal,stockAt,withdrawal,movement,money,quantity} from '@/lib/inventory';
import {sendSms} from '@/lib/sms';
import type {DatabaseSession} from '@/lib/database';
import {z} from 'zod';
import {unitsSchema,saveUnits} from '@/lib/serials';
export const dynamic='force-dynamic';
export const maxDuration=60;
const db=()=>env.DB;
function access(m:Member){if(!['admin','director','manager','agent'].includes(m.role))throw new Failure('Энэ эрхээр худалдан авалт баталгаажуулах боломжгүй.',403);}
async function leadFor(d:DatabaseSession,id:string,m:Member){
 const lead=await d.prepare(`SELECT l.* FROM leads l WHERE l.id=? AND l.deleted_at IS NULL ${m.role==='agent'?'AND l.owner=?':''}`).bind(id,...(m.role==='agent'?[m.email]:[])).first<Lead>();
 if(!lead)throw new Failure('Хүсэлт олдсонгүй эсвэл хандах эрхгүй.',404);
 return lead;
}
function error(e:unknown){
 if(e instanceof Failure)return Response.json({error:e.message},{status:e.status});
 if(e instanceof z.ZodError)return Response.json({error:e.issues.map(i=>i.message).join('; ')},{status:400});
 if(e instanceof SyntaxError)return Response.json({error:'Хүсэлтийн бүтэц буруу.'},{status:400});
 console.error('Lead purchase failed',e instanceof Error?e.message:'error');
 return Response.json({error:'Худалдан авалтыг хадгалж чадсангүй. Дахин оролдоно уу.'},{status:500});
}
const input=z.object({
 lead_id:z.string().min(1).max(80),version:z.number().int().positive(),request_id:z.string().uuid(),
 item_id:z.string().min(1).max(80),warehouse_id:z.string().min(1).max(80),qty:quantity,unit_price:money,
 platform:z.string().trim().max(80).default(''),bill_number:z.string().trim().max(120).default(''),account:z.string().trim().max(80).default(''),
 commission_rate:z.number().finite().min(0).max(100).optional(),tax_amount:money.default(0),vat_issued:z.boolean().default(false),
 sold_at:z.string().datetime().nullish(),note:z.string().trim().max(2000).default(''),units:unitsSchema,
});
export async function GET(req:Request){try{
 const m=await member();access(m);
 const id=z.string().min(1).max(80).parse(new URL(req.url).searchParams.get('id'));
 await leadFor(db(),id,m);
 const purchase=await db().prepare('SELECT s.id,s.lead_id,s.item_id,s.warehouse_id,s.qty,s.unit_price,s.total_price,s.sold_at,s.created_by,s.platform,s.bill_number,i.name item_name,i.code item_code,i.imei,w.name warehouse_name FROM inventory_sales s JOIN inventory_items i ON i.id=s.item_id JOIN inventory_warehouses w ON w.id=s.warehouse_id WHERE s.lead_id=?').bind(id).first();
 const units=purchase?await db().prepare("SELECT * FROM inventory_units WHERE source='lead_purchase' AND ref_id=? ORDER BY created_at").bind((purchase as {id:string}).id).all():null;
 return Response.json({purchase,units:units?.results||[]},{headers:{'Cache-Control':'no-store'}});
}catch(e){return error(e);}}
export async function POST(req:Request){try{
 if(!isSameOrigin(req))throw new Failure('Хүсэлтийн эх сурвалж буруу.',403);
 const m=await member();access(m);
 if(Number(req.headers.get('content-length')||0)>20000)throw new Failure('Хүсэлт хэт том.',413);
 const raw=await req.text();if(raw.length>20000)throw new Failure('Хүсэлт хэт том.',413);
 const b=input.parse(JSON.parse(raw)),{request_id,...data}=b,payload=JSON.stringify(data),now=new Date().toISOString();
 const result=await db().transaction(async d=>{
  const lead=await leadFor(d,b.lead_id,m);
  const previous=await d.prepare('SELECT action,payload,response FROM inventory_requests WHERE id=?').bind(request_id).first<{action:string;payload:string;response:string}>();
  if(previous){if(previous.action!=='confirm_lead_purchase'||previous.payload!==payload)throw new Failure('Давтан хүсэлтийн өгөгдөл өөрчлөгдсөн.',409);return {response:JSON.parse(previous.response),notify:false,lead};}
  if(lead.version!==b.version)throw new Failure('Хүсэлт өөрчлөгдсөн байна. Дахин нээнэ үү.',409);
  if(await d.prepare('SELECT 1 FROM inventory_sales WHERE lead_id=?').bind(lead.id).first())throw new Failure('Энэ хүсэлтийн худалдан авалт аль хэдийн баталгаажсан.',409);
  const item=await d.prepare('SELECT id,name,code,active FROM inventory_items WHERE id=?').bind(b.item_id).first<{id:string;name:string;code:string;active:number}>();
  if(!item||!item.active)throw new Failure('Идэвхтэй бараа сонгоно уу.',400);
  const warehouse=await d.prepare('SELECT name FROM inventory_warehouses WHERE id=?').bind(b.warehouse_id).first<{name:string}>();
  if(!warehouse)throw new Failure('Агуулах олдсонгүй.',400);
  const stock=await stockAt(d,item.id,b.warehouse_id);
  if(stock.value_cents<0)throw new Failure('Барааны өртгийн зөрчлийг эхлээд засна уу.',409);
  const cost=withdrawal(stock,b.qty),total=safeTotal(cents(b.unit_price)*b.qty);
  const channel=await d.prepare('SELECT commission_rate,account FROM inventory_channels WHERE name=?').bind(b.platform).first<{commission_rate:number;account:string}>();
  const rate=b.commission_rate??Number(channel?.commission_rate||0),commission=Math.round(total*rate/100),tax=cents(b.tax_amount);
  const saleId=crypto.randomUUID(),at=b.sold_at||now;
  const changed=await d.prepare("UPDATE leads SET status='won',next_at=NULL,next_action='Хаагдсан',updated_at=?,version=version+1,op=? WHERE id=? AND version=? AND deleted_at IS NULL").bind(now,request_id,lead.id,b.version).run();
  if(!changed.meta.changes)throw new Failure('Хүсэлт өөрчлөгдсөн байна. Дахин нээнэ үү.',409);
  await d.prepare('INSERT INTO inventory_sales(id,lead_id,item_id,warehouse_id,qty,unit_price,total_price,customer_name,customer_phone,platform,sold_at,note,created_by,created_at,bill_number,account,commission_rate,commission_cents,tax_cents,cost_cents,cost_estimated,vat_issued) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
   .bind(saleId,lead.id,item.id,b.warehouse_id,b.qty,b.unit_price,total/100,lead.name,lead.phone,b.platform,at,b.note,m.email,now,b.bill_number,b.account||channel?.account||'',rate,commission,tax,cost,stock.cost_estimated,b.vat_issued?1:0).run();
  await movement(d,{item:item.id,warehouse:b.warehouse_id,kind:'sale',qty:-b.qty,value:-cost,estimated:stock.cost_estimated,ref:saleId,actor:m.email,at,note:`Зээлийн хүсэлт ${lead.id}: ${b.note}`});
  await d.prepare('INSERT INTO activities(id,lead_id,phone,kind,note,actor,created_at) VALUES(?,?,?,?,?,?,?)').bind(crypto.randomUUID(),lead.id,lead.phone,'update',`Худалдан авалт баталгаажуулав: ${item.name} (${item.code}), ${warehouse.name}, ${b.qty} ш, нийт ${total/100} ₮. Борлуулалт: ${saleId}`,m.email,now).run();
  const response={ok:true,id:saleId,lead_id:lead.id};
  await saveUnits(d,{source:'lead_purchase',refId:saleId,itemId:item.id,leadId:lead.id,customerPhone:lead.phone,actor:m.email,at:now},b.units);
  await d.prepare('INSERT INTO inventory_requests(id,action,payload,response,created_at) VALUES(?,?,?,?,?)').bind(request_id,'confirm_lead_purchase',payload,JSON.stringify(response),now).run();
  return {response,notify:lead.status!=='won',lead};
 });
 // Preserve the existing status-triggered SMS workflow after the stock transaction commits.
 if(result.notify){try{
  const rule=await db().prepare("SELECT message FROM sms_rules WHERE status='won' AND enabled=1 AND NOT EXISTS(SELECT 1 FROM suppressions WHERE phone=?)").bind(result.lead.phone).first<{message:string}>();
  if(rule){let note='Төлөв Худалдан авсан болсон тул харилцагч руу автомат SMS илгээв.';
   try{await sendSms(result.lead.phone,rule.message);}catch(e){note='SMS илгээхэд алдаа гарлаа: '+(e as Error).message.slice(0,200);}
   await db().prepare('INSERT INTO activities(id,lead_id,phone,kind,note,actor,created_at) VALUES(?,?,?,?,?,?,?)').bind(crypto.randomUUID(),result.lead.id,result.lead.phone,'note',note,'AntMall SMS',now).run();
  }
 }catch(e){console.error('Purchase SMS audit failed',e instanceof Error?e.message:'error');}}
 return Response.json(result.response);
}catch(e){return error(e);}}
