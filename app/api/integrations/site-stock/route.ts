import {createHash,timingSafeEqual} from 'node:crypto';
import {env} from '@/lib/runtime';

export const runtime='nodejs';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
// Verified warehouse IDs: Olympic Galleria, GOTO (Go.To Market), ТҮМЭН МОЛЛ.
// Use stable IDs so renaming a branch cannot silently change the website scope.
const websiteWarehouseIds=['ee540f17-f13e-4587-99cc-fca3fa31f083','ffe360f0-ee2b-415f-abe9-ee70113e5e89','26d60fd9-1308-4ea1-a9d2-d8af01155a97'];
const branchNames=['Olympic Galleria','Go.To Market','Tumen Mall'];
export async function GET(req:Request){
 const expected=process.env.CRM_SITE_STOCK_TOKEN||'', token=req.headers.get('X-Token')||'';
 if(expected.length<32||!token||token.length>256||!timingSafeEqual(createHash('sha256').update(expected).digest(),createHash('sha256').update(token).digest()))return Response.json({error:'UNAUTHORIZED'},{status:401,headers});
 const params=new URL(req.url).searchParams,ids=params.get('ids')?.split(',')||[];
 if([...params.keys()].some(k=>k!=='ids')||params.getAll('ids').length!==1||ids.length<1||ids.length>100||ids.some(id=>! /^[1-9]\d{0,14}$/.test(id)))return Response.json({error:'INVALID_IDS'},{status:400,headers});
 try{
  const unique=[...new Set(ids)];
  const rows=(await env.DB.prepare(`SELECT l.site_id,l.site_code,m.warehouse_id,COALESCE(SUM(m.qty_delta),0) quantity
   FROM site_stock_links l JOIN site_catalog c ON c.id=l.site_id AND c.code=l.site_code
   JOIN inventory_items i ON COALESCE(NULLIF(i.product_key,''),i.id)=l.product_key AND i.active=1
   LEFT JOIN inventory_stock_moves m ON m.item_id=i.id AND m.warehouse_id IN (${websiteWarehouseIds.map(()=>'?').join(',')})
   WHERE l.enabled=1 AND l.site_id IN (${unique.map(()=>'?').join(',')}) GROUP BY l.site_id,l.site_code,m.warehouse_id`).bind(...websiteWarehouseIds,...unique).all<{site_id:string;site_code:string;warehouse_id:string|null;quantity:number}>()).results;
  const products=new Map<string,{product_id:string;product_code:string;quantity:number;branches:{name:string;quantity:number}[]}>();
  for(const row of rows){
   let product=products.get(row.site_id);
   if(!product){product={product_id:row.site_id,product_code:row.site_code,quantity:0,branches:branchNames.map(name=>({name,quantity:0}))};products.set(row.site_id,product);}
   const index=websiteWarehouseIds.indexOf(row.warehouse_id||'');
   if(index>=0)product.branches[index].quantity=Math.max(0,Number(row.quantity));
  }
  for(const product of products.values())product.quantity=product.branches.reduce((sum,branch)=>sum+branch.quantity,0);
  return Response.json({data:[...products.values()],as_of:new Date().toISOString()},{headers});
 }catch{return Response.json({error:'STOCK_UNAVAILABLE'},{status:503,headers});}
}
