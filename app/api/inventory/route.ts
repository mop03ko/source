import {env} from '@/lib/runtime';
import {member,Failure,isSameOrigin} from '@/lib/access';
import {canEditInventoryItem,isIsolatedRole,canManageSchedule,type Member} from '@/lib/crm';
import {z} from 'zod';
import {unitsSchema,saveUnits} from '@/lib/serials';
import {cents,safeTotal,stockAt,withdrawal,movement,itemSchema,openingSchema,money,quantity,dayBounds,productKey,planInventoryBulkEdit} from '@/lib/inventory';
import type {DatabaseSession} from '@/lib/database';
export const dynamic='force-dynamic';
export const maxDuration=60;
const db=()=>env.DB;
function access(m:Member){if(isIsolatedRole(m.role))throw new Failure('Энэ хэсэгт хандах эрхгүй.',403);}
function error(e:unknown){
 if(e instanceof Failure)return Response.json({error:e.message},{status:e.status});
 if(e instanceof z.ZodError)return Response.json({error:e.issues.map(i=>i.path.join('.')+': '+i.message).join('; ')},{status:400});
 if(e instanceof SyntaxError)return Response.json({error:'Хүсэлтийн бүтэц буруу.'},{status:400});
 console.error('Inventory request failed',e instanceof Error?e.message:'error');
 return Response.json({error:'Хадгалж чадсангүй. Дахин оролдоно уу.'},{status:500});
}
const json=(value:unknown)=>Response.json(value,{headers:{'Cache-Control':'no-store'}});
async function requireRow(d:DatabaseSession,table:'inventory_items'|'inventory_warehouses'|'inventory_purchases',id:string){
 const row=await d.prepare(`SELECT * FROM ${table} WHERE id=?`).bind(id).first();
 if(!row)throw new Failure('Бүртгэл олдсонгүй.',404);return row;
}
export async function GET(req:Request){try{
 access(await member());
 const p=new URL(req.url).searchParams,view=p.get('view')||'items';
 const page=Math.max(1,Math.min(10000,Math.floor(Number(p.get('page'))||1))),limit=p.get('export')==='1'?5000:50;
 const q=(p.get('q')||'').trim().slice(0,200),warehouse=p.get('warehouse_id')||'',brand=p.get('brand')||'',supplier=p.get('supplier')||'',category=p.get('category')||'';
 const group=p.get('group')==='brand'?'brand':p.get('group')==='supplier'?'supplier':p.get('group')==='category'?'category':null;
 if(view==='warehouses')return json({items:(await db().prepare('SELECT * FROM inventory_warehouses ORDER BY name').all()).results});
 if(view==='options'){
  const [warehouses,brands,channels,suppliers,categories]=await Promise.all([db().prepare('SELECT * FROM inventory_warehouses ORDER BY name').all(),db().prepare("SELECT DISTINCT brand FROM inventory_items WHERE brand!='' ORDER BY brand").all(),db().prepare('SELECT * FROM inventory_channels ORDER BY name').all(),db().prepare("SELECT DISTINCT supplier FROM inventory_items WHERE supplier!='' ORDER BY supplier").all(),db().prepare("SELECT DISTINCT category FROM inventory_items WHERE category!='' ORDER BY category").all()]);
  return json({warehouses:warehouses.results,brands:brands.results,channels:channels.results,suppliers:suppliers.results,categories:categories.results});
 }
 if(view==='products'){
  const args:unknown[]=[];let where='1=1';
  const productId=p.get('id');
  if(productId){where+=' AND it.group_id=?';args.push(productId);}
  if(q){if(p.get('match')==='exact'){where+=' AND (it.code=? COLLATE NOCASE OR it.imei=? COLLATE NOCASE OR it.barcode=? COLLATE NOCASE OR it.name=? COLLATE NOCASE)';args.push(...Array(4).fill(q));}else{where+=' AND (it.name LIKE ? OR it.code LIKE ? OR it.imei LIKE ? OR it.barcode LIKE ? OR it.brand LIKE ? OR it.supplier LIKE ? OR EXISTS(SELECT 1 FROM inventory_units u WHERE u.item_id=it.id AND (u.serial LIKE ? OR u.barcode LIKE ?)))';args.push(...Array(8).fill('%'+q+'%'));}}
  for(const [column,value] of [['brand',brand],['category',category],['supplier',supplier]])if(value){where+=` AND it.${column}=?`;args.push((column==='category'&&value==='__uncategorized__')||(column!=='category'&&value==='__unregistered__')?'':value);}
  const moveArgs=warehouse?[warehouse]:[];
  const rank=q?'CASE WHEN it.code=? COLLATE NOCASE OR it.imei=? COLLATE NOCASE OR it.barcode=? COLLATE NOCASE THEN 0 WHEN it.name=? COLLATE NOCASE THEN 1 ELSE 2 END':'2';
  const cte=`WITH totals AS (SELECT item_id,SUM(qty_delta) stock,SUM(value_cents) value_cents,MAX(cost_estimated) cost_estimated FROM inventory_stock_moves ${warehouse?'WHERE warehouse_id=?':''} GROUP BY item_id),base AS (SELECT it.*,COALESCE(NULLIF(it.product_key,''),it.id) group_id,COALESCE(t.stock,0) stock,COALESCE(t.value_cents,0) value_cents,COALESCE(t.cost_estimated,0) cost_estimated FROM inventory_items it LEFT JOIN totals t ON t.item_id=it.id),matched AS (SELECT *, ${rank} search_rank FROM base it WHERE ${where}),products AS (SELECT group_id id,group_id product_key,MIN(name) name,MIN(search_rank) search_rank,COALESCE(MIN(NULLIF(image_url,'')),'') image_url,MIN(brand) brand,CASE WHEN COUNT(DISTINCT category)>1 THEN 'Олон ангилал' ELSE MIN(category) END category,MIN(capacity) capacity,MIN(color) color,MIN(variant) variant,CASE WHEN COUNT(*)=1 THEN MIN(code) ELSE '' END code,CASE WHEN COUNT(*)=1 THEN MIN(imei) ELSE NULL END imei,CASE WHEN COUNT(*)=1 THEN MIN(barcode) ELSE '' END barcode,CASE WHEN COUNT(DISTINCT supplier)>1 THEN 'Олон нийлүүлэгч' ELSE MIN(supplier) END supplier,CASE WHEN COUNT(*)=1 THEN MIN(id) ELSE NULL END single_item_id,COUNT(*) unit_count,SUM(stock) stock,SUM(value_cents) value_cents,SUM(min_stock) min_stock,MAX(cost_estimated) cost_estimated,MIN(sale_price) sale_price,MAX(sale_price) sale_price_max,MIN(COALESCE(cash_price,sale_price)) cash_price,MAX(COALESCE(cash_price,sale_price)) cash_price_max FROM matched GROUP BY group_id)`;
  const bindArgs=[...moveArgs,...(q?Array(4).fill(q):[]),...args];
  if(productId){
   const product=await db().prepare(`${cte} SELECT * FROM products`).bind(...bindArgs).first();
   if(!product)throw new Failure('Бараа олдсонгүй.',404);
   const uq=(p.get('unit_q')||'').trim().slice(0,200),unitArgs=uq?Array(6).fill('%'+uq+'%'):[];
   const unitWhere=uq?'WHERE code LIKE ? OR imei LIKE ? OR barcode LIKE ? OR supplier LIKE ? OR EXISTS(SELECT 1 FROM inventory_units u WHERE u.item_id=matched.id AND (u.serial LIKE ? OR u.barcode LIKE ?))':'';
   const [units,count,history]=await Promise.all([
    db().prepare(`${cte} SELECT * FROM matched ${unitWhere} ORDER BY stock DESC,code,id LIMIT 50 OFFSET ?`).bind(...bindArgs,...unitArgs,(page-1)*50).all(),
    db().prepare(`${cte} SELECT COUNT(*) count FROM matched ${unitWhere}`).bind(...bindArgs,...unitArgs).first<{count:number}>(),
    db().prepare(`${cte} SELECT u.* FROM inventory_units u JOIN matched it ON it.id=u.item_id ORDER BY u.created_at DESC,u.id DESC LIMIT 100`).bind(...bindArgs).all(),
   ]);
   const byWarehouse=(await db().prepare("SELECT w.id warehouse_id,w.name warehouse_name,COALESCE(SUM(m.qty_delta),0) qty,COALESCE(SUM(m.value_cents),0) value_cents FROM inventory_warehouses w LEFT JOIN inventory_stock_moves m ON m.warehouse_id=w.id AND m.item_id IN (SELECT id FROM inventory_items WHERE COALESCE(NULLIF(product_key,''),id)=?) GROUP BY w.id ORDER BY w.name").bind(productId).all()).results;
   return json({product,items:units.results,count:count?.count||0,page,history:history.results,byWarehouse});
  }
  const stock=p.get('stock')||'';
  const order=(q?'search_rank,':'')+(p.get('sort')==='value_desc'?'value_cents DESC,name,id':p.get('sort')==='stock_asc'?'stock,name,id':p.get('sort')==='stock_desc'?'stock DESC,name,id':p.get('sort')==='price_asc'?'sale_price,name,id':p.get('sort')==='price_desc'?'sale_price DESC,name,id':p.get('sort')==='name_desc'?'name DESC,id':'name,id');
  const stockWhere=stock==='nonzero'?'stock!=0':stock==='positive'?'stock>0':stock==='negative'?'stock<0':stock==='empty'?'stock<=0':stock==='low'?'stock<=min_stock':stock==='reorder'?'stock>0 AND stock<=min_stock':'1=1';
  const [rows,summary]=await Promise.all([
   db().prepare(`${cte} SELECT * FROM products WHERE ${stockWhere} ORDER BY ${order} LIMIT ? OFFSET ?`).bind(...bindArgs,limit,limit===5000?0:(page-1)*50).all(),
   db().prepare(`${cte} SELECT COUNT(*) count,COALESCE(SUM(unit_count),0) unit_count,COALESCE(SUM(stock),0) units,COALESCE(SUM(value_cents),0) value_cents,COALESCE(SUM(stock<=min_stock),0) low_stock,COALESCE(SUM(stock<=0),0) empty_stock,COALESCE(SUM(stock>0 AND stock<=min_stock),0) reorder_stock,COALESCE(MAX(cost_estimated),0) cost_estimated FROM products WHERE ${stockWhere}`).bind(...bindArgs).first(),
  ]);
  return json({items:rows.results,count:summary?.count||0,summary,page,truncated:limit===5000&&Number(summary?.count)>limit});
 }
 if(view==='items'&&p.get('id')){
  const item=await requireRow(db(),'inventory_items',p.get('id')!);
  const [byWarehouse,moves,stock,identifiers]=await Promise.all([
   db().prepare('SELECT w.id warehouse_id,w.name warehouse_name,COALESCE(SUM(m.qty_delta),0) qty,COALESCE(SUM(m.value_cents),0) value_cents,COALESCE(MAX(m.cost_estimated),0) cost_estimated FROM inventory_warehouses w LEFT JOIN inventory_stock_moves m ON m.warehouse_id=w.id AND m.item_id=? GROUP BY w.id ORDER BY w.name').bind(item.id).all(),
   db().prepare('SELECT m.*,w.name warehouse_name FROM inventory_stock_moves m JOIN inventory_warehouses w ON w.id=m.warehouse_id WHERE m.item_id=? ORDER BY m.created_at DESC,m.rowid DESC LIMIT 100').bind(item.id).all(),
   db().prepare('SELECT COALESCE(SUM(qty_delta),0) stock,COALESCE(SUM(value_cents),0) value_cents,COALESCE(MAX(cost_estimated),0) cost_estimated FROM inventory_stock_moves WHERE item_id=?').bind(item.id).first(),
   db().prepare('SELECT * FROM inventory_units WHERE item_id=? ORDER BY created_at DESC LIMIT 100').bind(item.id).all(),
  ]);return json({item:{...item,...stock},byWarehouse:byWarehouse.results,moves:moves.results,identifiers:identifiers.results});
 }
 if(view==='items'||view==='balance'){
  const args:unknown[]=[];let where='1=1';
  if(q){where+=' AND (it.code LIKE ? OR it.name LIKE ? OR it.imei LIKE ? OR it.supplier LIKE ? OR it.brand LIKE ? OR it.capacity LIKE ? OR it.color LIKE ? OR it.variant LIKE ? OR it.barcode LIKE ?)';args.push(...Array(9).fill('%'+q+'%'));}
  if(brand){where+=' AND it.brand=?';args.push(brand==='__unregistered__'?'':brand);}
  if(supplier){where+=' AND it.supplier=?';args.push(supplier==='__unregistered__'?'':supplier);}
  if(category){where+=' AND it.category=?';args.push(category==='__uncategorized__'?'':category);}
  const moveArgs:unknown[]=warehouse?[warehouse]:[];let cte='';
  if(view==='balance'){
   const today=new Date(Date.now()+8*3600000).toISOString().slice(0,10);
   const [from,to]=dayBounds(p.get('from')||today.slice(0,7)+'-01',p.get('to')||today);
   cte=`WITH totals AS (SELECT item_id,SUM(CASE WHEN occurred_at<? THEN qty_delta ELSE 0 END) opening_qty,SUM(CASE WHEN occurred_at<? THEN value_cents ELSE 0 END) opening_cents,SUM(CASE WHEN occurred_at>=? AND qty_delta>0 THEN qty_delta ELSE 0 END) in_qty,SUM(CASE WHEN occurred_at>=? AND qty_delta>0 THEN value_cents ELSE 0 END) in_cents,SUM(CASE WHEN occurred_at>=? AND qty_delta<0 THEN -qty_delta ELSE 0 END) out_qty,SUM(CASE WHEN occurred_at>=? AND qty_delta<0 THEN -value_cents ELSE 0 END) out_cents,SUM(qty_delta) stock,SUM(value_cents) value_cents,MAX(cost_estimated) cost_estimated FROM inventory_stock_moves WHERE occurred_at<? ${warehouse?'AND warehouse_id=?':''} GROUP BY item_id)`;
   moveArgs.unshift(from,from,from,from,from,from,to);
  }else cte=`WITH totals AS (SELECT item_id,SUM(qty_delta) stock,SUM(value_cents) value_cents,MAX(cost_estimated) cost_estimated FROM inventory_stock_moves ${warehouse?'WHERE warehouse_id=?':''} GROUP BY item_id)`;
  const stock=p.get('stock')||'';
  if(stock==='nonzero')where+=' AND COALESCE(t.stock,0)!=0';
  if(stock==='positive')where+=' AND COALESCE(t.stock,0)>0';
  if(stock==='negative')where+=' AND COALESCE(t.stock,0)<0';
  if(stock==='empty')where+=' AND COALESCE(t.stock,0)<=0';
  if(stock==='low')where+=' AND COALESCE(t.stock,0)<=it.min_stock';
  if(stock==='reorder')where+=' AND COALESCE(t.stock,0)>0 AND t.stock<=it.min_stock';
  const extra=view==='balance'?',COALESCE(t.opening_qty,0) opening_qty,COALESCE(t.opening_cents,0) opening_cents,COALESCE(t.in_qty,0) in_qty,COALESCE(t.in_cents,0) in_cents,COALESCE(t.out_qty,0) out_qty,COALESCE(t.out_cents,0) out_cents':'';
  // Aggregate the whole filtered result, never only the current 50-row page.
  const flowSummary=view==='balance'?`,COALESCE(SUM(t.opening_qty),0) opening_qty,COALESCE(SUM(t.opening_cents),0) opening_cents,COALESCE(SUM(t.in_qty),0) in_qty,COALESCE(SUM(t.in_cents),0) in_cents,COALESCE(SUM(t.out_qty),0) out_qty,COALESCE(SUM(t.out_cents),0) out_cents,COALESCE(SUM(COALESCE(t.stock,0)<=0),0) empty_stock,COALESCE(SUM(t.stock>0 AND t.stock<=it.min_stock),0) reorder_stock,COALESCE(SUM(t.stock<0),0) negative_stock`:',COALESCE(SUM(COALESCE(t.stock,0)<=0),0) empty_stock,COALESCE(SUM(t.stock>0 AND t.stock<=it.min_stock),0) reorder_stock';
  const summaryQuery=()=>db().prepare(`${cte} SELECT COUNT(*) count,COALESCE(SUM(t.stock),0) units,COALESCE(SUM(t.value_cents),0) value_cents,COALESCE(SUM(COALESCE(t.stock,0)<=it.min_stock),0) low_stock,COALESCE(MAX(t.cost_estimated),0) cost_estimated${flowSummary} FROM inventory_items it LEFT JOIN totals t ON t.item_id=it.id WHERE ${where}`).bind(...moveArgs,...args).first();
  const balanceReport=view==='balance'?await Promise.all([
   summaryQuery(),
   db().prepare(`${cte} SELECT it.category label,COUNT(*) item_count,SUM(COALESCE(t.stock,0)) stock,SUM(COALESCE(t.value_cents,0)) value_cents FROM inventory_items it LEFT JOIN totals t ON t.item_id=it.id WHERE ${where} GROUP BY it.category ORDER BY value_cents DESC,it.category`).bind(...moveArgs,...args).all(),
  ]):null;
  const dimension=['brand','supplier','warehouse'].includes(p.get('breakdown')||'')?p.get('breakdown')!:'category';
  let breakdown=balanceReport?.[1].results;
  if(balanceReport&&dimension==='warehouse'){
   breakdown=(await db().prepare(`${cte} SELECT w.id key,w.name label,COUNT(DISTINCT it.id) item_count,SUM(m.qty_delta) stock,SUM(m.value_cents) value_cents FROM inventory_stock_moves m JOIN inventory_warehouses w ON w.id=m.warehouse_id JOIN inventory_items it ON it.id=m.item_id LEFT JOIN totals t ON t.item_id=it.id WHERE ${where} AND m.occurred_at<? ${warehouse?'AND m.warehouse_id=?':''} GROUP BY w.id,w.name ORDER BY value_cents DESC,w.name`).bind(...moveArgs,...args,moveArgs[6],...(warehouse?[warehouse]:[])).all()).results;
  }else if(balanceReport&&dimension!=='category'){
   breakdown=(await db().prepare(`${cte} SELECT it.${dimension} label,COUNT(*) item_count,SUM(COALESCE(t.stock,0)) stock,SUM(COALESCE(t.value_cents,0)) value_cents FROM inventory_items it LEFT JOIN totals t ON t.item_id=it.id WHERE ${where} GROUP BY it.${dimension} ORDER BY value_cents DESC,it.${dimension}`).bind(...moveArgs,...args).all()).results;
  }
  const report=balanceReport?{categories:balanceReport[1].results,breakdown,dimension}:undefined;
  const rankOrder=q&&view==='items'?'CASE WHEN it.code=? COLLATE NOCASE OR it.imei=? COLLATE NOCASE OR it.barcode=? COLLATE NOCASE THEN 0 WHEN it.name=? COLLATE NOCASE THEN 1 ELSE 2 END,':'';
  const order=rankOrder+(p.get('sort')==='value_desc'?'COALESCE(t.value_cents,0) DESC,it.name,it.id':p.get('sort')==='stock_asc'?'COALESCE(t.stock,0),it.name,it.id':p.get('sort')==='stock_desc'?'COALESCE(t.stock,0) DESC,it.name,it.id':p.get('sort')==='price_asc'?'it.sale_price,it.name,it.id':p.get('sort')==='price_desc'?'it.sale_price DESC,it.name,it.id':p.get('sort')==='name_desc'?'it.name DESC,it.id':p.get('sort')==='out_desc'&&view==='balance'?'COALESCE(t.out_qty,0) DESC,it.name,it.id':'it.name,it.id');
  if(group){
   const flow=view==='balance'?',SUM(COALESCE(t.opening_qty,0)) opening_qty,SUM(COALESCE(t.opening_cents,0)) opening_cents,SUM(COALESCE(t.in_qty,0)) in_qty,SUM(COALESCE(t.in_cents,0)) in_cents,SUM(COALESCE(t.out_qty,0)) out_qty,SUM(COALESCE(t.out_cents,0)) out_cents':'';
   const groups=await db().prepare(`${cte} SELECT it.${group} label,COUNT(*) item_count,SUM(COALESCE(t.stock,0)) stock,SUM(COALESCE(t.value_cents,0)) value_cents,MAX(COALESCE(t.cost_estimated,0)) cost_estimated${flow} FROM inventory_items it LEFT JOIN totals t ON t.item_id=it.id WHERE ${where} GROUP BY it.${group} ORDER BY it.${group} LIMIT 5001`).bind(...moveArgs,...args).all();
   return json({items:[],groups:groups.results.slice(0,5000),count:groups.results.length,summary:balanceReport?.[0]||{},report,truncated:groups.results.length>5000});
  }
  const [rows,summary]=await Promise.all([
   db().prepare(`${cte} SELECT it.*,COALESCE(t.stock,0) stock,COALESCE(t.value_cents,0) value_cents,COALESCE(t.cost_estimated,0) cost_estimated${extra} FROM inventory_items it LEFT JOIN totals t ON t.item_id=it.id WHERE ${where} ORDER BY ${order} LIMIT ? OFFSET ?`).bind(...moveArgs,...args,...(rankOrder?Array(4).fill(q):[]),limit,limit===5000?0:(page-1)*50).all(),
   balanceReport?Promise.resolve(balanceReport[0]):summaryQuery(),
  ]);return json({items:rows.results,count:summary?.count||0,page,summary,report,truncated:Number(summary?.count)>limit&&limit===5000});
 }
 if(view==='purchases'||view==='sales'||view==='moves'){
  const table=view==='purchases'?'inventory_purchases':view==='sales'?'inventory_sales':'inventory_stock_moves';
  const args:unknown[]=[];let where='1=1';
  if(warehouse){where+=' AND t.warehouse_id=?';args.push(warehouse);}
  if(q){where+=' AND (it.code LIKE ? OR it.name LIKE ?)';args.push('%'+q+'%','%'+q+'%');}
  if(view==='moves'&&p.get('ref_id')){where+=' AND t.ref_id=?';args.push(p.get('ref_id'));}
  if(view==='moves'&&p.get('kind')){where+=' AND t.kind=?';args.push(p.get('kind'));}
  if(view==='purchases'&&p.get('status')){where+=' AND t.status=?';args.push(p.get('status'));}
  if(brand){where+=' AND it.brand=?';args.push(brand==='__unregistered__'?'':brand);}
  if(supplier){where+=' AND it.supplier=?';args.push(supplier==='__unregistered__'?'':supplier);}
  if(category){where+=' AND it.category=?';args.push(category==='__uncategorized__'?'':category);}
  // Шууд бэлэн борлуулалт: зарсан ажилтан бүртгэгдсэн мөрүүд. "__direct__" нь зарагч тодорхой бүхнийг заана.
  if(view==='sales'&&p.get('seller')){const seller=p.get('seller')!;if(seller==='__direct__')where+=" AND t.seller!=''";else{where+=' AND t.seller=?';args.push(seller);}}
  const date=view==='purchases'?'COALESCE(t.received_at,t.ordered_at,t.created_at)':view==='sales'?'COALESCE(t.sold_at,t.created_at)':'t.occurred_at';
  if(p.get('from')&&p.get('to')){const [from,to]=dayBounds(p.get('from')!,p.get('to')!);where+=` AND ${date}>=? AND ${date}<?`;args.push(from,to);}
  if(view==='sales'&&group){
   const groups=await db().prepare(`SELECT it.${group} label,COUNT(DISTINCT it.id) item_count,SUM(t.qty) stock,SUM(ROUND(t.total_price*100)) revenue_cents,SUM(t.cost_cents) value_cents,SUM(t.commission_cents) commission_cents,SUM(t.tax_cents) tax_cents,SUM(ROUND(t.total_price*100)-t.cost_cents-t.commission_cents-t.tax_cents) profit_cents,MAX(t.cost_estimated) cost_estimated FROM inventory_sales t JOIN inventory_items it ON it.id=t.item_id WHERE ${where} GROUP BY it.${group} ORDER BY it.${group} LIMIT 5001`).bind(...args).all();
   return json({items:[],groups:groups.results.slice(0,5000),count:groups.results.length,summary:{},truncated:groups.results.length>5000});
  }
  const rows=await db().prepare(`SELECT t.*,it.name item_name,it.code item_code,w.name warehouse_name${view==='sales'?',(SELECT name FROM members WHERE email=t.seller) seller_name':''} ${view==='sales'?',CAST(ROUND(t.total_price*100) AS INTEGER)-t.cost_cents-t.commission_cents-t.tax_cents profit_cents':''} FROM ${table} t JOIN inventory_items it ON it.id=t.item_id JOIN inventory_warehouses w ON w.id=t.warehouse_id WHERE ${where} ORDER BY ${date} DESC,t.id DESC LIMIT ? OFFSET ?`).bind(...args,limit,limit===5000?0:(page-1)*50).all();
  const summary=await db().prepare(`SELECT COUNT(*) count ${view==='sales'?',COALESCE(SUM(ROUND(t.total_price*100)),0) revenue_cents,COALESCE(SUM(t.cost_cents),0) cost_cents,COALESCE(SUM(t.commission_cents),0) commission_cents,COALESCE(SUM(t.tax_cents),0) tax_cents,COALESCE(SUM(ROUND(t.total_price*100)-t.cost_cents-t.commission_cents-t.tax_cents),0) profit_cents,COALESCE(MAX(t.cost_estimated),0) cost_estimated':''} FROM ${table} t JOIN inventory_items it ON it.id=t.item_id WHERE ${where}`).bind(...args).first();
  return json({items:rows.results,count:summary?.count||0,summary,page,truncated:Number(summary?.count)>limit&&limit===5000});
 }
 throw new Failure('Тодорхойгүй харагдац.');
}catch(e){return error(e);}}

const bodySchema=z.object({action:z.enum(['create_item','update_item','preview_bulk_items','bulk_update_items','create_warehouse','record_purchase','receive_purchase','return_purchase','record_sale','transfer','save_channel','preview_import','import_opening']),id:z.string().max(100).optional(),request_id:z.string().uuid().optional(),data:z.unknown()});
const purchaseSchema=z.object({item_id:z.string().min(1),warehouse_id:z.string().min(1),qty:quantity,unit_cost:money.default(0),additional_cost:money.default(0),order_number:z.string().trim().max(120).default(''),status:z.enum(['ordered','received']).default('received'),ordered_at:z.string().datetime().nullish(),received_at:z.string().datetime().nullish(),payment_status:z.string().trim().max(60).default(''),note:z.string().trim().max(2000).default('')});
export async function POST(req:Request){try{
 if(!isSameOrigin(req))throw new Failure('Хүсэлтийн эх сурвалж буруу.',403);
 const m=await member();access(m);
 if(Number(req.headers.get('content-length')||0)>5_000_000)throw new Failure('Файл хэт том.',413);
 const raw=await req.text();if(raw.length>5_000_000)throw new Failure('Файл хэт том.',413);
 const b=bodySchema.parse(JSON.parse(raw)),now=new Date().toISOString();
 if(['update_item','preview_bulk_items','bulk_update_items'].includes(b.action)&&!canEditInventoryItem(m.role))throw new Failure('Барааны мэдээллийг зөвхөн админ болон ахлах засах эрхтэй.',403);
 const result=await db().transaction(async d=>{
  const payload=JSON.stringify({action:b.action,id:b.id,data:b.data});
  if(b.request_id){const prev=await d.prepare('SELECT * FROM inventory_requests WHERE id=?').bind(b.request_id).first();if(prev){if(prev.payload!==payload)throw new Failure('Давтан хүсэлтийн өгөгдөл өөрчлөгдсөн.',409);return JSON.parse(String(prev.response));}}
  const run=async()=>{
   if(b.action==='preview_bulk_items'||b.action==='bulk_update_items'){
    const plan=await planInventoryBulkEdit(d,b.data);
    if(b.action==='preview_bulk_items')return {ok:true,preview_hash:plan.hash,count:plan.rows.length,changes:plan.changes};
    if(plan.input.preview_hash!==plan.hash)throw new Failure('Урьдчилсан хяналтаас хойш бараа эсвэл сонголт өөрчлөгдсөн. Дахин хянана уу.',409);
    const changed=plan.changes.filter(c=>JSON.stringify(c.before)!==JSON.stringify(c.after));
    for(const change of changed){
     const row=plan.rows.find(r=>r.id===change.id)!;
     const key=await productKey({...row,...change.after});
     await d.prepare('UPDATE inventory_items SET category=?,brand=?,supplier=?,product_key=?,updated_at=? WHERE id=?').bind(change.after.category,change.after.brand,change.after.supplier,key,now,row.id).run();
    }
    const id=crypto.randomUUID();
    if(changed.length)await d.prepare('INSERT INTO inventory_bulk_edits(id,actor,changes,created_at) VALUES(?,?,?,?)').bind(id,m.email,JSON.stringify(changed),now).run();
    return {ok:true,id,updated:changed.length};
   }
   if(b.action==='create_warehouse'){
    const input=z.object({name:z.string().trim().min(1).max(120)}).parse(b.data);
    if(await d.prepare('SELECT 1 FROM inventory_warehouses WHERE name=?').bind(input.name).first())throw new Failure('Ийм нэртэй агуулах бүртгэлтэй.');
    const id=crypto.randomUUID();await d.prepare('INSERT INTO inventory_warehouses(id,name,created_at) VALUES(?,?,?)').bind(id,input.name,now).run();return {ok:true,id};
   }
   if(b.action==='create_item'||b.action==='update_item'){
    const input=itemSchema.parse(b.data),id=b.action==='create_item'?crypto.randomUUID():b.id!;
    if(!id)throw new Failure('Барааны ID дутуу.');
    if(input.code&&await d.prepare('SELECT 1 FROM inventory_items WHERE code=? AND id!=?').bind(input.code,id).first())throw new Failure('Барааны код давхардсан.',409);
    if(input.imei&&await d.prepare('SELECT 1 FROM inventory_items WHERE imei=? AND id!=?').bind(input.imei,id).first())throw new Failure('IMEI / сериал давхардсан.',409);
    const previous=b.action==='update_item'?await requireRow(d,'inventory_items',id):null;
    const categoryValue=input.category===undefined?(previous?.category??''):input.category;
    const cashPrice=input.cash_price===undefined?(previous?.cash_price??null):input.cash_price;
    if(cashPrice!==null&&Number(cashPrice)>input.sale_price)throw new Failure('Бэлэн төлөлтийн үнэ үндсэн үнээс их байж болохгүй.');
    const imageUrl=input.image_url===undefined?(previous?.image_url??''):input.image_url;
    const barcode=input.barcode===undefined?(previous?.barcode??''):input.barcode;
    const key=await productKey({...input,id});
    const values=[input.code,input.brand,input.name,input.variant,input.imei||null,input.sale_price,input.capacity,input.color,input.supplier,input.min_stock,cashPrice,categoryValue,barcode,key,imageUrl];
    if(b.action==='create_item')await d.prepare('INSERT INTO inventory_items(code,brand,name,variant,imei,sale_price,capacity,color,supplier,min_stock,cash_price,category,barcode,product_key,image_url,id,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(...values,id,m.email,now,now).run();
    else{await requireRow(d,'inventory_items',id);await d.prepare('UPDATE inventory_items SET code=?,brand=?,name=?,variant=?,imei=?,sale_price=?,capacity=?,color=?,supplier=?,min_stock=?,cash_price=?,category=?,barcode=?,product_key=?,image_url=?,updated_at=? WHERE id=?').bind(...values,now,id).run();}
    return {ok:true,id};
   }
   if(b.action==='save_channel'){
    if(!['admin','director','manager'].includes(m.role))throw new Failure('Тохиргоо өөрчлөх эрхгүй.',403);
    const c=z.object({name:z.string().trim().min(1).max(80),commission_rate:z.number().min(0).max(100),account:z.string().trim().max(80).default('')}).parse(b.data);
    await d.prepare('INSERT INTO inventory_channels(name,commission_rate,account) VALUES(?,?,?) ON CONFLICT(name) DO UPDATE SET commission_rate=excluded.commission_rate,account=excluded.account').bind(c.name,c.commission_rate,c.account).run();return {ok:true};
   }
   if(b.action==='record_purchase'){
    const input=purchaseSchema.parse(b.data),id=crypto.randomUUID();
    await requireRow(d,'inventory_items',input.item_id);await requireRow(d,'inventory_warehouses',input.warehouse_id);
    const total=safeTotal(cents(input.unit_cost)*input.qty+cents(input.additional_cost));
    await d.prepare('INSERT INTO inventory_purchases(id,item_id,warehouse_id,qty,unit_cost,total_cost,ordered_at,received_at,payment_status,note,created_by,created_at,order_number,status,base_unit_cost,additional_cost) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,input.item_id,input.warehouse_id,input.qty,total/input.qty/100,total/100,input.ordered_at||null,input.status==='received'?(input.received_at||now):null,input.payment_status,input.note,m.email,now,input.order_number,input.status,input.unit_cost,input.additional_cost).run();
    if(input.status==='received')await movement(d,{item:input.item_id,warehouse:input.warehouse_id,kind:'purchase',qty:input.qty,value:total,ref:id,actor:m.email,at:input.received_at||now,note:input.note});
    return {ok:true,id};
   }
   if(b.action==='receive_purchase'||b.action==='return_purchase'){
    if(!b.id)throw new Failure('Орлогын ID дутуу.');
    const purchase=await requireRow(d,'inventory_purchases',b.id),item=String(purchase.item_id),warehouse=String(purchase.warehouse_id);
    if(purchase.created_by==='user-approved:excel-purchase-history')throw new Failure('Түүхэн импортын бүртгэлээс үлдэгдлийн хөдөлгөөн үүсгэхгүй.',409);
    if(b.action==='receive_purchase'){
     if(purchase.status!=='ordered')throw new Failure('Зөвхөн хүлээгдэж буй захиалгыг хүлээн авна.',409);
     await d.prepare("UPDATE inventory_purchases SET status='received',received_at=? WHERE id=?").bind(now,b.id).run();
     await movement(d,{item,warehouse,kind:'purchase',qty:Number(purchase.qty),value:cents(Number(purchase.total_cost)),ref:b.id,actor:m.email,at:now});
    }else{
     const input=z.object({qty:quantity,note:z.string().trim().min(1).max(2000)}).parse(b.data);
     if(purchase.status==='ordered'||Number(purchase.qty)-Number(purchase.returned_qty)<input.qty)throw new Failure('Буцаах боломжтой тооноос их байна.',409);
     const stock=await stockAt(d,item,warehouse),value=withdrawal(stock,input.qty);
     await d.prepare("UPDATE inventory_purchases SET returned_qty=returned_qty+?,status=CASE WHEN returned_qty+?=qty THEN 'returned' ELSE 'partial_return' END WHERE id=?").bind(input.qty,input.qty,b.id).run();
     await movement(d,{item,warehouse,kind:'purchase_return',qty:-input.qty,value:-value,estimated:stock.cost_estimated,ref:b.id,actor:m.email,at:now,note:input.note});
    }return {ok:true,id:b.id};
   }
   if(b.action==='record_sale'||b.action==='transfer'){
    const input=z.object({item_id:z.string().min(1),warehouse_id:z.string().min(1),qty:quantity,units:unitsSchema,seller:z.string().email().optional(),unit_price:money.default(0),to_warehouse_id:z.string().optional(),customer_name:z.string().trim().max(160).default(''),customer_phone:z.string().trim().max(40).default(''),platform:z.string().trim().max(80).default(''),bill_number:z.string().trim().max(120).default(''),account:z.string().trim().max(80).default(''),commission_rate:z.number().min(0).max(100).optional(),tax_amount:money.default(0),vat_issued:z.boolean().default(false),sold_at:z.string().datetime().nullish(),note:z.string().trim().max(2000).default('')}).parse(b.data);
    await requireRow(d,'inventory_items',input.item_id);await requireRow(d,'inventory_warehouses',input.warehouse_id);
    const stock=await stockAt(d,input.item_id,input.warehouse_id),cost=withdrawal(stock,input.qty),id=crypto.randomUUID();
    // Шууд борлуулалтыг ажилтны үзүүлэлтэд тооцох тул зарагчийг тодорхой хөтөлнө. Агент зөвхөн өөрийн
    // нэр дээр бүртгэнэ; Ахлах, Удирдлага, Админ өөр ажилтны өмнөөс бүртгэж болно.
    let seller='';
    if(b.action==='record_sale'&&input.seller){
     seller=input.seller;
     if(!canManageSchedule(m.role)&&seller!==m.email)throw new Failure('Зөвхөн өөрийн борлуулалтаа бүртгэнэ.',403);
     const who=await d.prepare('SELECT role FROM members WHERE email=? AND active=1').bind(seller).first<{role:string}>();
     if(!who||isIsolatedRole(who.role))throw new Failure('Идэвхтэй борлуулалтын ажилтан сонгоно уу.');
    }
    if(b.action==='transfer'){
     if(!input.to_warehouse_id||input.to_warehouse_id===input.warehouse_id)throw new Failure('Өөр хүлээн авах агуулах сонгоно уу.');
     await requireRow(d,'inventory_warehouses',input.to_warehouse_id);
     for(const [warehouse,sign] of [[input.warehouse_id,-1],[input.to_warehouse_id,1]] as const)await movement(d,{item:input.item_id,warehouse,kind:sign<0?'transfer_out':'transfer_in',qty:sign*input.qty,value:sign*cost,estimated:stock.cost_estimated,ref:id,actor:m.email,at:now,note:input.note});
    }else{
     const channel=await d.prepare('SELECT * FROM inventory_channels WHERE name=?').bind(input.platform).first();
     const rate=input.commission_rate??Number(channel?.commission_rate||0),total=safeTotal(cents(input.unit_price)*input.qty),commission=Math.round(total*rate/100),tax=cents(input.tax_amount);
     await d.prepare('INSERT INTO inventory_sales(id,item_id,warehouse_id,qty,unit_price,total_price,customer_name,customer_phone,platform,sold_at,note,created_by,created_at,bill_number,account,commission_rate,commission_cents,tax_cents,cost_cents,cost_estimated,vat_issued) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,input.item_id,input.warehouse_id,input.qty,input.unit_price,total/100,input.customer_name,input.customer_phone,input.platform,input.sold_at||now,input.note,m.email,now,input.bill_number,input.account||String(channel?.account||''),rate,commission,tax,cost,stock.cost_estimated,input.vat_issued?1:0).run();
     await movement(d,{item:input.item_id,warehouse:input.warehouse_id,kind:'sale',qty:-input.qty,value:-cost,estimated:stock.cost_estimated,ref:id,actor:m.email,at:input.sold_at||now,note:input.note});
     await saveUnits(d,{source:'sale',refId:id,itemId:input.item_id,customerPhone:input.customer_phone,actor:m.email,at:input.sold_at||now},input.units);
     if(seller)await d.prepare('UPDATE inventory_sales SET seller=? WHERE id=?').bind(seller,id).run();
    }return {ok:true,id};
   }
   if(b.action==='preview_import'||b.action==='import_opening'){
    if(!['admin','director','manager'].includes(m.role))throw new Failure('Импорт хийх эрхгүй.',403);
    const input=z.object({rows:z.array(openingSchema).min(1).max(5000),as_of:z.string().datetime()}).parse(b.data);
    const existing=(await d.prepare('SELECT code FROM inventory_items').all<{code:string}>()).results;
    const codes=new Set(existing.map(i=>i.code)),seen=new Set<string>(),issues:string[]=[];
    for(const [i,row] of input.rows.entries()){
     if(codes.has(row.code)||seen.has(row.code))issues.push(`${i+2}-р мөр: код давхардсан (${row.code}).`);
     if(row.qty===0&&(row.total_cost||0)!==0)issues.push(`${i+2}-р мөр: үлдэгдэлгүй барааны өртөг тэг байх ёстой.`);
     safeTotal(row.total_cost!==undefined?cents(row.total_cost):cents(row.unit_cost)*row.qty);seen.add(row.code);
    }
    const summary={rows:input.rows.length,units:input.rows.reduce((n,r)=>n+r.qty,0),warehouses:new Set(input.rows.map(r=>r.warehouse)).size,issues:issues.slice(0,100),issue_count:issues.length};
    if(b.action==='preview_import')return {ok:true,...summary};
    if(issues.length)throw new Failure('Импортын зөрчлийг эхлээд засна уу. '+issues[0],409);
    const warehouses=new Map((await d.prepare('SELECT id,name FROM inventory_warehouses').all<{id:string;name:string}>()).results.map(w=>[w.name,w.id]));
    const statements:ReturnType<DatabaseSession['prepare']>[]=[];
    for(const row of input.rows){
     if(!warehouses.has(row.warehouse)){const id=crypto.randomUUID();warehouses.set(row.warehouse,id);statements.push(d.prepare('INSERT INTO inventory_warehouses(id,name,created_at) VALUES(?,?,?)').bind(id,row.warehouse,now));}
     const id=crypto.randomUUID(),value=row.total_cost!==undefined?cents(row.total_cost):safeTotal(cents(row.unit_cost)*row.qty);
     statements.push(d.prepare('INSERT INTO inventory_items(id,code,brand,name,variant,imei,sale_price,capacity,color,supplier,min_stock,barcode,product_key,category,cash_price,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,row.code,row.brand,row.name,row.variant,row.imei||null,row.sale_price,row.capacity,row.color,row.supplier,row.min_stock,row.barcode||'',await productKey({...row,id}),row.category||'',row.cash_price??null,m.email,now,now));
     if(row.qty)statements.push(d.prepare('INSERT INTO inventory_stock_moves(id,item_id,warehouse_id,kind,qty_delta,unit_cost,value_cents,cost_estimated,occurred_at,ref_id,note,actor,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),id,warehouses.get(row.warehouse)!,'opening',row.qty,value/row.qty/100,value,0,input.as_of,b.request_id||id,'Excel Balance эхний үлдэгдэл',m.email,now));
    }
    for(let i=0;i<statements.length;i+=150)await d.batch(statements.slice(i,i+150));
    return {ok:true,...summary};
   }
   throw new Failure('Тодорхойгүй үйлдэл.');
  };
  const value=await run();
  if(b.request_id&&!['preview_import','preview_bulk_items'].includes(b.action))await d.prepare('INSERT INTO inventory_requests(id,action,payload,response,created_at) VALUES(?,?,?,?,?)').bind(b.request_id,b.action,payload,JSON.stringify(value),now).run();
  return value;
 });return json(result);
}catch(e){return error(e);}}
