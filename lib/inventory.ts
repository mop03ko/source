import {z} from 'zod';
import {Failure} from '@/lib/access';
import type {DatabaseSession} from '@/lib/database';

export const money=z.number().finite().min(0).max(1_000_000_000).refine(n=>Math.abs(n*100-Math.round(n*100))<0.0001,'Хоёр орны нарийвчлалтай дүн оруулна уу.');
export const quantity=z.number().int().min(1).max(1_000_000);
export const cents=(value:number)=>{const n=Math.round(value*100);if(!Number.isSafeInteger(n))throw new Failure('Мөнгөн дүн хэт их.');return n;};
export const safeTotal=(n:number)=>{if(!Number.isSafeInteger(n)||Math.abs(n)>9_000_000_000_000)throw new Failure('Нийт дүн зөвшөөрөгдөх хэмжээнээс их.');return n;};
export type Stock={qty:number;value_cents:number;cost_estimated:number};
export async function stockAt(db:DatabaseSession,item:string,warehouse:string):Promise<Stock>{
 return (await db.prepare('SELECT COALESCE(SUM(qty_delta),0) qty,COALESCE(SUM(value_cents),0) value_cents,COALESCE(MAX(cost_estimated),0) cost_estimated FROM inventory_stock_moves WHERE item_id=? AND warehouse_id=?').bind(item,warehouse).first<Stock>())!;
}
export function withdrawal(stock:Stock,qty:number){
 if(stock.qty<qty)throw new Failure(`Агуулахад ${stock.qty} ширхэг үлдэгдэлтэй. ${qty} ширхэг зарлагадах боломжгүй.`,409);
 return qty===stock.qty?stock.value_cents:Math.round(stock.value_cents/stock.qty*qty);
}
export async function movement(db:DatabaseSession,m:{item:string;warehouse:string;kind:string;qty:number;value:number;estimated?:number;ref:string;note?:string;actor:string;at:string}){
 safeTotal(m.value);
 await db.prepare('INSERT INTO inventory_stock_moves(id,item_id,warehouse_id,kind,qty_delta,unit_cost,value_cents,cost_estimated,occurred_at,ref_id,note,actor,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)')
  .bind(crypto.randomUUID(),m.item,m.warehouse,m.kind,m.qty,m.qty?m.value/m.qty/100:0,m.value,m.estimated||0,m.at,m.ref,m.note||'',m.actor,new Date().toISOString()).run();
}
export const imageUrlSchema=z.string().trim().max(2048).refine(v=>{if(!v)return true;try{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password;}catch{return false;}},'Зургийн HTTPS холбоос оруулна уу.');
export const itemSchema=z.object({image_url:imageUrlSchema.optional(),barcode:z.string().trim().max(120).optional(),code:z.string().trim().max(200).default(''),brand:z.string().trim().max(120).refine(v=>!/^(?:YUNA(?: DARAA)?|SOLAR(?:,\s*BELEG)?|MIKE|KHANGAI)$/i.test(v),'Энэ нь нийлүүлэгчийн нэр. Нийлүүлэгчийн талбарт оруулна уу.').default(''),supplier:z.string().trim().max(120).default(''),category:z.string().trim().max(80).optional(),name:z.string().trim().min(1).max(300),variant:z.string().trim().max(120).default(''),capacity:z.string().trim().max(80).default(''),color:z.string().trim().max(80).default(''),imei:z.string().trim().max(80).nullish(),sale_price:money.default(0),cash_price:money.nullable().optional(),min_stock:z.number().int().min(0).max(1_000_000).default(0)});
export const openingSchema=itemSchema.extend({code:z.string().trim().min(1).max(200),warehouse:z.string().trim().min(1).max(120),qty:z.number().int().min(0).max(1_000_000),unit_cost:money,total_cost:money.optional()});
export type OpeningRow=z.infer<typeof openingSchema>;
export function dayBounds(from:string,to:string){
 for(const d of [from,to])if(!/^\d{4}-\d{2}-\d{2}$/.test(d)||Number.isNaN(Date.parse(d))||new Date(d+'T00:00:00Z').toISOString().slice(0,10)!==d)throw new Failure('Огноо буруу.');
 if(from>to)throw new Failure('Эхлэх огноо дуусах огнооноос хойш байна.');
 return [new Date(from+'T00:00:00+08:00').toISOString(),new Date(Date.parse(to+'T00:00:00+08:00')+86400000).toISOString()];
}

// Product identity deliberately excludes supplier, price and per-unit identifiers.
// Condition markers are retained so display/used units do not merge with new stock.
export async function productKey(item:{name:string;brand?:string;capacity?:string;color?:string;variant?:string;code?:string;id?:string}){
 const normalize=(v:string|undefined)=>(v||'').normalize('NFKC').trim().replace(/\s+/g,' ').toUpperCase();
 const condition=normalize((item.name||'')+' '+(item.code||'')+' '+(item.variant||''));
 const flags=[/ҮЗҮҮЛЭН|UZUULEN|\bDISPLAY\b/.test(condition),/\bUSED\b|ХУУЧИН/.test(condition),/OPEN[ -]?BOX|ЗАДАЛСАН/.test(condition)];
 const unknownVariant=!normalize(item.color)||(/^(?:IPHONE|IPAD|MACBOOK|SAMSUNG GALAXY|GALAXY (?:S\d|TAB|Z ))/.test(normalize(item.name))&&!normalize(item.capacity));
 const identity=JSON.stringify([unknownVariant?normalize(item.code)||item.id||'unknown':'',...['name','brand','capacity','color','variant'].map(k=>normalize(item[k as keyof typeof item])),flags]);
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(identity));
 return 'p_'+Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
}

const bulkItemSchema=z.object({
 scope:z.enum(['products','items']),
 ids:z.array(z.string().min(1).max(100)).min(1).max(50).refine(ids=>new Set(ids).size===ids.length,'Сонголт давхардсан.'),
 patch:itemSchema.pick({category:true,brand:true,supplier:true}).partial().strict().refine(p=>Object.keys(p).length>0,'Өөрчлөх талбар сонгоно уу.'),
 preview_hash:z.string().optional(),
});
type BulkRow=z.infer<typeof itemSchema>&{id:string;product_key:string;updated_at:string;category:string};
export async function planInventoryBulkEdit(db:DatabaseSession,data:unknown){
 const input=bulkItemSchema.parse(data);
 const scope=input.scope==='products'?"COALESCE(NULLIF(product_key,''),id)":'id';
 const rows=(await db.prepare(`SELECT * FROM inventory_items WHERE ${scope} IN (${input.ids.map(()=>'?').join(',')}) ORDER BY id LIMIT 5001`).bind(...input.ids).all<BulkRow>()).results;
 if(rows.length>5000)throw new Failure('5,000-аас олон дугаар сонгосон байна. Сонголтоо багасгана уу.');
 if(input.ids.some(id=>!rows.some(row=>(input.scope==='products'?(row.product_key||row.id):row.id)===id)))throw new Failure('Сонгосон бараа өөрчлөгдсөн эсвэл олдсонгүй. Дахин сонгоно уу.',409);
 const changes=rows.map(row=>({id:row.id,code:row.code,name:row.name,before:{category:row.category,brand:row.brand,supplier:row.supplier},after:{category:input.patch.category??row.category,brand:input.patch.brand??row.brand,supplier:input.patch.supplier??row.supplier}}));
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify({actorScope:input.scope,rows,changes})));
 const hash=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
 return {input,rows,changes,hash};
}
