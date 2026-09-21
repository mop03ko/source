'use client';
import {Descriptions,Empty,Pagination,Table,Tag} from 'antd';
import {useState} from 'react';
import {useRemote} from '@/hooks/use-remote';
import {useDebouncedValue} from '@/hooks/use-debounced-value';
import {useIsMobile} from '@/hooks/use-mobile';
import {AsyncStatus} from '@/components/async-status';
import {Input} from '@/components/ui/input';
import {Button} from '@/components/ui/button';
import {cash,type Detail,type Item} from './inventory-forms';
export type InventoryRowAction='sale'|'purchase'|'transfer'|'edit';
type WarehouseStock=Detail['byWarehouse'][number];
type Expanded={items:Item[];count:number;byWarehouse:WarehouseStock[]};
export function WarehouseBreakdown({item,catalog,revision}:{item:Item;catalog:boolean;revision:number}){
 const data=useRemote<Expanded|Detail>('/api/inventory?'+new URLSearchParams({view:catalog?'products':'items',id:item.id,revision:String(revision)}));
 return <div className="inventory-warehouse-popover">{catalog&&<p className="muted">Бүтээгдэхүүний бүх дугаар, бүх агуулах</p>}<AsyncStatus loading={data.loading} error={data.error} retry={data.retry}/>{data.data&&<Descriptions size="small" column={1} items={data.data.byWarehouse.map(w=>({key:w.warehouse_id,label:w.warehouse_name,children:<strong>{w.qty} ш</strong>}))}/>}</div>;
}
export default function InventoryRowDetail({item,warehouse,revision,canEdit,onOpen,onAction,chooseAction}:{item:Item;warehouse:string;revision:number;canEdit:boolean;chooseAction?:InventoryRowAction;onOpen:(id:string)=>void;onAction:(action:InventoryRowAction,item:Item)=>void}){
 const [q,setQ]=useState(''),[page,setPage]=useState(1),search=useDebouncedValue(q),mobile=useIsMobile();
 const result=useRemote<Expanded>('/api/inventory?'+new URLSearchParams({view:'products',id:item.id,unit_q:search,page:String(page),warehouse_id:warehouse,revision:String(revision)}));
 const actions=(row:Item)=>chooseAction?<Button type="button" disabled={(chooseAction==='sale'||chooseAction==='transfer')&&row.stock<=0} onClick={()=>onAction(chooseAction,row)}>{({sale:'Борлуулах',purchase:'Орлого нэмэх',transfer:'Шилжүүлэх',edit:'Засах'})[chooseAction]}</Button>:<div className="row"><Button type="button" size="sm" disabled={row.stock<=0} onClick={()=>onAction('sale',row)}>Борлуулах</Button>{canEdit&&<Button type="button" size="sm" variant="outline" onClick={()=>onAction('edit',row)}>Засах</Button>}</div>;
 const identifier=(row:Item)=><button className="inventory-unit-link" onClick={()=>onOpen(row.id)}><strong>{row.imei||row.barcode||row.code}</strong><small>IMEI: {row.imei||'—'} · Баркод: {row.barcode||'—'} · Код: {row.code}</small></button>;
 return <section className="inventory-expanded" aria-label={item.name+' дугаарууд'}><div className="row between"><strong>{item.name} · IMEI / баркод</strong><Input aria-label="Мөр дотор дугаар хайх" placeholder="IMEI, баркод, код, нийлүүлэгч" value={q} onChange={e=>{setQ(e.target.value);setPage(1);}}/></div><AsyncStatus loading={result.loading} error={result.error} retry={result.retry}/>{result.data&&<>{mobile?<div className="inventory-cards">{result.data.items.map(row=><article className="inventory-product-card" key={row.id}>{identifier(row)}<span>{row.supplier||'Нийлүүлэгч тодорхойгүй'}</span><Tag>{row.stock} ш</Tag><small>Зээл: {cash(row.sale_price)} · Бэлэн: {cash(row.cash_price??row.sale_price)}</small>{actions(row)}</article>)}</div>:<Table<Item> size="small" rowKey="id" dataSource={result.data.items} pagination={false} scroll={{x:780}} columns={[{title:'IMEI / баркод / код',key:'identifier',render:(_,row)=>identifier(row)},{title:'Нийлүүлэгч',dataIndex:'supplier'},{title:'Үлдэгдэл',dataIndex:'stock',render:v=>v+' ш'},{title:'Зээл / бэлэн',key:'prices',render:(_,row)=><>{cash(row.sale_price)}<small>{cash(row.cash_price??row.sale_price)}</small></>},{title:'Үйлдэл',key:'actions',render:(_,row)=>actions(row)}]}/>}<Pagination current={page} total={result.data.count} pageSize={50} showSizeChanger={false} hideOnSinglePage onChange={setPage}/>{!result.data.items.length&&<Empty description="Тохирох дугаар алга"/>}</>}</section>;
}
