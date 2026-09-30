'use client';
export type SavedGift={item_name:string;item_code:string;warehouse_name:string;qty:number};
export function GiftSummary({gifts,hasAccessories,name,empty=false}:{gifts?:string|SavedGift[];hasAccessories:boolean;name?:string;empty?:boolean}){
 let rows:SavedGift[]=[];
 try{rows=typeof gifts==='string'?JSON.parse(gifts):gifts||[];}catch{/* Historical rows without gift metadata. */}
 if(!rows.length&&!hasAccessories)return empty?<span>Бэлэг, дагалдахгүй</span>:null;
 return <div className="form-help">{hasAccessories&&<div>✓ Дагалдах бараатай</div>}{rows.length>0&&<><strong>{name||'Бэлэг'}</strong>{rows.map((g,i)=><div key={i}>{g.item_name} · {g.item_code} × {g.qty} · {g.warehouse_name}</div>)}</>}</div>;
}
