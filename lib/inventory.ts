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
export const itemSchema=z.object({code:z.string().trim().max(200).default(''),brand:z.string().trim().max(120).default(''),supplier:z.string().trim().max(120).default(''),name:z.string().trim().min(1).max(300),variant:z.string().trim().max(120).default(''),capacity:z.string().trim().max(80).default(''),color:z.string().trim().max(80).default(''),imei:z.string().trim().max(80).nullish(),sale_price:money.default(0),cash_price:money.nullable().optional(),min_stock:z.number().int().min(0).max(1_000_000).default(0)});
export const openingSchema=itemSchema.extend({code:z.string().trim().min(1).max(200),warehouse:z.string().trim().min(1).max(120),qty:z.number().int().min(0).max(1_000_000),unit_cost:money,total_cost:money.optional()});
export type OpeningRow=z.infer<typeof openingSchema>;
export function dayBounds(from:string,to:string){
 for(const d of [from,to])if(!/^\d{4}-\d{2}-\d{2}$/.test(d)||Number.isNaN(Date.parse(d))||new Date(d+'T00:00:00Z').toISOString().slice(0,10)!==d)throw new Failure('Огноо буруу.');
 if(from>to)throw new Failure('Эхлэх огноо дуусах огнооноос хойш байна.');
 return [new Date(from+'T00:00:00+08:00').toISOString(),new Date(Date.parse(to+'T00:00:00+08:00')+86400000).toISOString()];
}
