import {z} from 'zod';
import {env} from './runtime';

// Public DTOs are explicit. Never serialize inventory rows or stock-move rows.
export const publicProductQuery=z.object({
 page:z.coerce.number().int().min(1).max(10000).default(1),
 limit:z.coerce.number().int().min(1).max(100).default(25),
 q:z.string().trim().max(150).default(''),
 brand:z.string().trim().max(120).default(''),
 category:z.string().trim().max(80).default(''),
 in_stock:z.enum(['true','false']).optional(),
 site_product_id:z.string().regex(/^[1-9]\d{0,14}$/).optional(),
}).strict();
export type PublicProductQuery=z.infer<typeof publicProductQuery>;
export const publicProductId=z.string().min(1).max(200).regex(/^[A-Za-z0-9_-]+$/);
type Row={id:string;sku:string;name:string;brand:string;category:string;capacity:string;color:string;variant:string;image_url:string;stock:number;price_min:number|null;price_max:number|null;cash_min:number|null;cash_max:number|null;site_id:string|null;site_code:string|null};
const cte=`WITH quantities AS (
 SELECT item_id,SUM(qty_delta) qty FROM inventory_stock_moves GROUP BY item_id
), products AS (
 SELECT COALESCE(NULLIF(i.product_key,''),i.id) id,MIN(i.name) name,
 CASE WHEN COUNT(DISTINCT i.brand)=1 THEN MIN(i.brand) ELSE '' END brand,
 CASE WHEN COUNT(DISTINCT i.category)=1 THEN MIN(i.category) ELSE '' END category,
 MIN(i.capacity) capacity,MIN(i.color) color,MIN(i.variant) variant,
 COALESCE(MIN(NULLIF(i.image_url,'')),'') image_url,MAX(0,SUM(COALESCE(q.qty,0))) stock,
 CASE WHEN MIN(i.sale_price)>0 THEN MIN(i.sale_price) END price_min,
 CASE WHEN MIN(i.sale_price)>0 THEN MAX(i.sale_price) END price_max,
 CASE WHEN COUNT(i.cash_price)=COUNT(*) AND MIN(i.cash_price)>0 THEN MIN(i.cash_price) END cash_min,
 CASE WHEN COUNT(i.cash_price)=COUNT(*) AND MIN(i.cash_price)>0 THEN MAX(i.cash_price) END cash_max
 FROM inventory_items i LEFT JOIN quantities q ON q.item_id=i.id WHERE i.active=1
 GROUP BY COALESCE(NULLIF(i.product_key,''),i.id)
), public_products AS (
 SELECT p.*,printf('ANT-%06d',pc.id) sku,c.id site_id,c.code site_code FROM products p
 JOIN inventory_product_codes pc ON pc.product_key=p.id
 LEFT JOIN site_stock_links l ON l.product_key=p.id AND l.enabled=1
 LEFT JOIN site_catalog c ON c.id=l.site_id AND c.code=l.site_code
)`;
function imageUrl(raw:string){try{const u=new URL(raw);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.href:null;}catch{return null;}}
function dto(r:Row){return {
 id:r.id,sku:r.sku,name:r.name,brand:r.brand||null,category:r.category||null,
 capacity:r.capacity||null,color:r.color||null,variant:r.variant||null,image_url:imageUrl(r.image_url),
 stock:{quantity:Number(r.stock),in_stock:r.stock>0,scope:'all_warehouses'},
 prices:{currency:'MNT',credit:r.price_min===null?null:{min:r.price_min,max:r.price_max},cash:r.cash_min===null?null:{min:r.cash_min,max:r.cash_max}},
 site:r.site_id?{product_id:r.site_id,product_code:r.site_code}:null,
};}
export async function listPublicProducts(query:PublicProductQuery){
 const conditions:string[]=[],args:(string|number)[]=[];
 // Filtering after grouping avoids returning only part of a product's stock.
 if(query.q){conditions.push("(name LIKE ? ESCAPE '\\' OR id=? OR site_code=? OR sku=?)");args.push('%'+query.q.replace(/[\\%_]/g,'\\$&')+'%',query.q.startsWith('CRM-')?query.q.slice(4):query.q,query.q,query.q);}
 if(query.brand){conditions.push('brand=?');args.push(query.brand);}
 if(query.category){conditions.push('category=?');args.push(query.category);}
 if(query.in_stock)conditions.push(query.in_stock==='true'?'stock>0':'stock=0');
 if(query.site_product_id){conditions.push('site_id=?');args.push(query.site_product_id);}
 const where=conditions.length?'WHERE '+conditions.join(' AND '):'';
 // One read transaction keeps totals and pages consistent within a response.
 const client=(await import('./database')).getClient(),tx=await client.transaction('read');
 try{
  const count=await tx.execute({sql:`${cte} SELECT COUNT(*) total FROM public_products ${where}`,args});
  const result=await tx.execute({sql:`${cte} SELECT * FROM public_products ${where} ORDER BY id LIMIT ? OFFSET ?`,args:[...args,query.limit,(query.page-1)*query.limit]});
  await tx.commit();
  const total=Number(count.rows[0].total),data=result.rows.map(row=>dto(row as unknown as Row));
  return {data,pagination:{page:query.page,limit:query.limit,total,total_pages:Math.ceil(total/query.limit),has_more:query.page*query.limit<total},as_of:new Date().toISOString()};
 }catch(e){if(!tx.closed)await tx.rollback();throw e;}finally{tx.close();}
}
export async function getPublicProduct(id:string){
 const key=id.startsWith('CRM-')?id.slice(4):id;
 const row=await env.DB.prepare(`${cte} SELECT * FROM public_products WHERE id=? OR sku=?`).bind(key,id).first<Row>();
 return row?{data:dto(row),as_of:new Date().toISOString()}:null;
}
export function publicHeaders(){return {
 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, HEAD, OPTIONS',
 'Access-Control-Allow-Headers':'Accept, Content-Type, X-Token','Access-Control-Max-Age':'86400',
 'Cache-Control':'private, no-store',
 'CDN-Cache-Control':'no-store','Vercel-CDN-Cache-Control':'no-store',
 'Vary':'X-Token',
 'X-Content-Type-Options':'nosniff',
};}
export function publicError(status:number,code:string,message:string){return Response.json({error:{code,message}},{status,headers:publicHeaders()});}
