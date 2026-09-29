import {createHash,timingSafeEqual} from 'node:crypto';
import {env} from '@/lib/runtime';

export const runtime='nodejs';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
export async function GET(req:Request){
 const expected=process.env.CRM_SITE_STOCK_TOKEN||'', token=req.headers.get('X-Token')||'';
 if(expected.length<32||!token||token.length>256||!timingSafeEqual(createHash('sha256').update(expected).digest(),createHash('sha256').update(token).digest()))return Response.json({error:'UNAUTHORIZED'},{status:401,headers});
 const params=new URL(req.url).searchParams,ids=params.get('ids')?.split(',')||[];
 if([...params.keys()].some(k=>k!=='ids')||params.getAll('ids').length!==1||ids.length<1||ids.length>100||ids.some(id=>! /^[1-9]\d{0,14}$/.test(id)))return Response.json({error:'INVALID_IDS'},{status:400,headers});
 try{
  const unique=[...new Set(ids)];
  const rows=(await env.DB.prepare(`SELECT l.site_id,l.site_code,COALESCE(SUM(m.qty_delta),0) quantity
   FROM site_stock_links l JOIN site_catalog c ON c.id=l.site_id AND c.code=l.site_code
   JOIN inventory_items i ON COALESCE(NULLIF(i.product_key,''),i.id)=l.product_key AND i.active=1
   LEFT JOIN inventory_stock_moves m ON m.item_id=i.id
   WHERE l.enabled=1 AND l.site_id IN (${unique.map(()=>'?').join(',')}) GROUP BY l.site_id,l.site_code`).bind(...unique).all<{site_id:string;site_code:string;quantity:number}>()).results;
  return Response.json({data:rows.map(r=>({product_id:r.site_id,product_code:r.site_code,quantity:Math.max(0,Number(r.quantity))})),as_of:new Date().toISOString()},{headers});
 }catch{return Response.json({error:'STOCK_UNAVAILABLE'},{status:503,headers});}
}
