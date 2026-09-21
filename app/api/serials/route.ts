import {env} from '@/lib/runtime';
import {member,Failure} from '@/lib/access';
import {z} from 'zod';
import {canSeeDeliveries,type Member} from '@/lib/crm';
export const dynamic='force-dynamic';
const db=()=>env.DB!;
// Баталгаат засвар, эргэлзээтэй нэгжийг тодруулахад хэрэгтэй тул хүргэгч хүртэл хайж чадна; зөвхөн
// маркетинг, IT хаагдана.
function assertAccess(m:Member){if(!canSeeDeliveries(m.role))throw new Failure('Энэ хэсэгт хандах эрхгүй.',403);}
export async function GET(req:Request){try{
 const m=await member();assertAccess(m);
 const url=new URL(req.url);
 const q=z.string().trim().min(2).max(120).parse(url.searchParams.get('q')||'');
 const like='%'+q+'%';
 // Сериал, баркод, харилцагчийн утсаар хайж, аль үйлдлээр гарсныг нь хамт буцаана.
 const rows=await db().prepare(
  `SELECT u.*,it.name item_name,it.code item_code,
   d.delivered_on,d.courier_name,d.status delivery_status,
   s.sold_at,s.qty sale_qty,s.total_price,
   l.name lead_name,l.phone lead_phone
   FROM inventory_units u
   JOIN inventory_items it ON it.id=u.item_id
   LEFT JOIN deliveries d ON u.source='delivery' AND d.id=u.ref_id
   LEFT JOIN inventory_sales s ON u.source IN ('sale','lead_purchase') AND s.id=u.ref_id
   LEFT JOIN leads l ON l.id=u.lead_id
   WHERE u.serial LIKE ? OR u.barcode LIKE ? OR u.customer_phone LIKE ?
   ORDER BY u.created_at DESC LIMIT 100`
 ).bind(like,like,like).all();
 return Response.json({items:rows.results,count:rows.results.length},{headers:{'Cache-Control':'no-store'}});
}catch(e){
 if(e instanceof Failure)return Response.json({error:e.message},{status:e.status});
 if(e instanceof z.ZodError)return Response.json({error:'Хайх дугаараа 2-оос дээш тэмдэгтээр бичнэ үү.'},{status:400});
 console.error('Serial lookup failed',e instanceof Error?e.message:'error');
 return Response.json({error:'Хайж чадсангүй. Дахин оролдоно уу.'},{status:500});
}}
