import {z} from 'zod';
import {Failure} from './access';
import type {DatabaseSession} from './database';
import {money,quantity,stockAt,withdrawal,movement,cents,safeTotal} from './inventory';
import {personKey,type Member} from './crm';
import {ubDay} from './assign';
export const extraLineSchema=z.object({item_id:z.string().min(1).max(80),warehouse_id:z.string().max(80).default(''),qty:quantity,unit_price:money.default(0),kind:z.enum(['gift','accessory'])});
export const fulfillmentSchema=z.object({method:z.enum(['delivery','pickup']),address:z.string().trim().max(500).default(''),gift_name:z.string().trim().max(120).default(''),extras:z.array(extraLineSchema).max(20).default([])}).superRefine((v,c)=>{if(v.method==='delivery'&&!v.address)c.addIssue({code:'custom',path:['address'],message:'Хүргэлтийн хаяг оруулна уу.'});if(v.extras.some(l=>l.kind==='gift'&&l.unit_price!==0))c.addIssue({code:'custom',path:['extras'],message:'Бэлгийн үнэ 0 байна.'});});
export async function purchaseWarehouse(d:DatabaseSession,itemId:string,qty:number,selected=''){
 const rows=(await d.prepare('SELECT w.id,w.name,SUM(s.qty_delta) qty FROM inventory_stock_moves s JOIN inventory_warehouses w ON w.id=s.warehouse_id WHERE s.item_id=? GROUP BY w.id,w.name HAVING SUM(s.qty_delta)>=? ORDER BY w.name').bind(itemId,qty).all<{id:string;name:string;qty:number}>()).results;
 if(selected){const row=rows.find(w=>w.id===selected);if(!row)throw new Failure('Сонгосон салбарын үлдэгдэл хүрэлцэхгүй.',409);return row;}
 if(rows.length!==1)throw new Failure(rows.length?'Бараа олон салбарт байна. Авах салбараа сонгоно уу.':'Барааны үлдэгдэл хүрэлцэхгүй.',409);
 return rows[0];
}
export async function deliveryCourier(d:DatabaseSession,day=ubDay()){
 const shifts=(await d.prepare("SELECT member_email,person_name FROM work_shifts WHERE day=? AND assignment='Хүргэлт'").bind(day).all<{member_email:string|null;person_name:string}>()).results;
 const members=(await d.prepare("SELECT m.email,m.name,(SELECT COUNT(*) FROM deliveries x WHERE x.courier_email=m.email AND x.delivered_on=? AND x.status!='cancelled') total FROM members m WHERE m.active=1 AND m.role='delivery' ORDER BY total,m.email").bind(day).all<{email:string;name:string;total:number}>()).results;
 const eligible=members.filter(m=>shifts.some(s=>s.member_email?s.member_email===m.email:personKey(s.person_name)===personKey(m.name)));
 if(!eligible.length)throw new Failure('Өнөөдрийн хуваарьт идэвхтэй хүргэлтийн ажилтан алга. Баг ба хуваарь хэсэгт хүргэгчийг тохируулна уу.',409);
 return eligible[0];
}
export async function completeFulfillment(d:DatabaseSession,args:{lead:{id:string;name:string;phone:string};saleId:string;item:{id:string;name:string;code:string};warehouseId:string;qty:number;unitPrice:number;contract:string;platform:string;fulfillment:z.infer<typeof fulfillmentSchema>;actor:Member;at:string;now:string}){
 const a=args,f=a.fulfillment,day=ubDay(),courier=f.method==='delivery'?await deliveryCourier(d,day):null;
 const lines=[{item_id:a.item.id,warehouse_id:a.warehouseId,kind:'main',qty:a.qty,unit_price:a.unitPrice,sale_id:a.saleId}];
 for(const line of f.extras){
  const item=await d.prepare('SELECT id,name,code FROM inventory_items WHERE id=? AND active=1').bind(line.item_id).first<{id:string;name:string;code:string}>();if(!item)throw new Failure('Бэлэг эсвэл дагалдах бараа идэвхгүй байна.',409);
  const w=await purchaseWarehouse(d,item.id,line.qty,line.warehouse_id),stock=await stockAt(d,item.id,w.id);if(stock.value_cents<0)throw new Failure('Барааны өртгийн зөрчлийг засна уу.',409);
  const cost=withdrawal(stock,line.qty),price=line.kind==='gift'?0:line.unit_price,total=safeTotal(cents(price)*line.qty),saleId=crypto.randomUUID();
  await d.prepare('INSERT INTO inventory_sales(id,item_id,warehouse_id,qty,unit_price,total_price,customer_name,customer_phone,platform,sold_at,note,created_by,created_at,bill_number,cost_cents,cost_estimated,seller) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(saleId,item.id,w.id,line.qty,price,total/100,a.lead.name,a.lead.phone,a.platform,a.at,`${line.kind==='gift'?'Бэлэг '+f.gift_name:'Дагалдах бараа'} · хүсэлт ${a.lead.id}`,a.actor.email,a.now,a.contract,cost,stock.cost_estimated,a.actor.email).run();
  await movement(d,{item:item.id,warehouse:w.id,kind:'sale',qty:-line.qty,value:-cost,estimated:stock.cost_estimated,ref:saleId,actor:a.actor.email,at:a.at,note:`${line.kind==='gift'?'Бэлэг':'Дагалдах'} · ${a.lead.id}`});
  lines.push({...line,warehouse_id:w.id,unit_price:price,sale_id:saleId});
 }
 for(const line of lines)await d.prepare('INSERT INTO lead_purchase_lines(id,lead_id,sale_id,item_id,warehouse_id,kind,qty,unit_price,created_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),a.lead.id,line.sale_id,line.item_id,line.warehouse_id,line.kind,line.qty,line.unit_price,a.now).run();
 let deliveryId:string|null=null;
 if(courier){deliveryId=crypto.randomUUID();await d.prepare('INSERT INTO deliveries(id,delivered_on,kind,item_id,item_info,customer_phone,address,payment_channel,contents,courier_email,courier_name,entered_by_email,entered_by_name,status,sale_id,lead_id,note,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(deliveryId,day,'24 цаг',a.item.id,a.item.name.slice(0,400),a.lead.phone,f.address,a.platform,'Бараа, бэлэг, дагалдах барааны жагсаалтыг дэлгэрэнгүйгээс харна.',courier.email,courier.name,a.actor.email,a.actor.name,'pending',a.saleId,a.lead.id,`Зээлийн гэрээ: ${a.contract}${f.gift_name?' · Бэлэг: '+f.gift_name:''}`,a.actor.email,a.now,a.now).run();}
 await d.prepare('INSERT INTO lead_purchase_fulfillment(lead_id,method,delivery_id,created_at) VALUES(?,?,?,?)').bind(a.lead.id,f.method,deliveryId,a.now).run();
 return {delivery_id:deliveryId,courier_name:courier?.name||null};
}
