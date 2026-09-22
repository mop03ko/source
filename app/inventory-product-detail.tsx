'use client';
import {useInventoryCost} from '@/components/inventory-cost-access';
import {Descriptions,Pagination,Tag} from 'antd';
import {useDebouncedValue} from '@/hooks/use-debounced-value';
import {useIsMobile} from '@/hooks/use-mobile';
import {useEffect,useRef,useState} from 'react';
import {useRemote} from '@/hooks/use-remote';
import {AsyncStatus} from '@/components/async-status';
import {Input} from '@/components/ui/input';
import {Button} from '@/components/ui/button';
import {Sheet,SheetContent,SheetHeader,SheetTitle,SheetDescription} from '@/components/ui/sheet';
import {Table,TableHeader,TableHead,TableBody,TableRow,TableCell} from '@/components/ui/table';
import {cash,type Item} from './inventory-forms';
type ProductDetail={product:Item;items:Item[];count:number;history:{id:string;serial:string;barcode:string;source:string;created_at:string}[]};
export default function InventoryProductDetail({id,initialProduct,open=true,revision,warehouse,onClose,onOpenUnit,onAdd}:{id:string;initialProduct:Item;open?:boolean;revision:number;warehouse:string;onClose:()=>void;onOpenUnit:(id:string)=>void;onAdd:(item:Item)=>void}){
 const showCost=useInventoryCost();
 const [q,setQ]=useState(''),[page,setPage]=useState(1);
 const searchQ=useDebouncedValue(q),mobile=useIsMobile(),scroll=useRef(0);
 useEffect(()=>{if(open){const t=setTimeout(()=>{const body=document.querySelector('.inventory-product-detail')?.closest('.ant-drawer-body');if(body)body.scrollTop=scroll.current;},100);return()=>clearTimeout(t);}},[open]);
 const openUnit=(id:string)=>{scroll.current=document.querySelector('.inventory-product-detail')?.closest('.ant-drawer-body')?.scrollTop||0;onOpenUnit(id);};
 const result=useRemote<ProductDetail>('/api/inventory?'+new URLSearchParams({view:'products',id,unit_q:searchQ,page:String(page),warehouse_id:warehouse,revision:String(revision)}));
 const p=result.data?.product||initialProduct;
 return <Sheet open={open} onOpenChange={o=>{if(!o)onClose();}}><SheetContent className="detail-sheet inventory-product-detail"><SheetHeader><SheetTitle>{p?.name||'Барааны бүртгэл'}</SheetTitle><SheetDescription>Ижил загвар, багтаамж, өнгөтэй бараа · Доторх дугаарын бүртгэлүүд</SheetDescription></SheetHeader><div className="detail-body"><AsyncStatus error={result.error} loading={result.loading} retry={result.retry}/>{p&&<>
  <Descriptions bordered size="small" column={1} items={[
   {key:'brand',label:'Брэнд / ангилал',children:[p.brand,p.category].filter(Boolean).join(' / ')||'—'},
   {key:'variant',label:'Багтаамж / өнгө / хувилбар',children:[p.capacity,p.color,p.variant].filter(Boolean).join(' / ')||'—'},
   {key:'stock',label:warehouse?'Сонгосон агуулахын үлдэгдэл':'Нийт үлдэгдэл',children:`${p.stock} ш · ${p.unit_count} дугаарын бүртгэл`},
   {key:'price',label:'Үндсэн үнэ',children:cash(p.sale_price)+(p.sale_price_max!==p.sale_price?' — '+cash(p.sale_price_max||0):'')},
   ...(showCost?[{key:'value',label:'Үлдэгдлийн өртөг',children:cash(p.value_cents/100)}]:[]),
  ]}/>
  <div className="inventory-product-actions"><Button onClick={()=>onAdd(p)}>Энэ бараанд дугаар нэмэх</Button></div>
  <h3>Баркод / IMEI / сериал</h3><p className="muted">Дугаараа нээгээд тухайн бүртгэлийн агуулах, хөдөлгөөн, үнийг харж, орлого/зарлага бүртгэнэ. Нэг мөр олон ширхэгтэй бол тоо нь тусдаа харагдана.</p>
  <Input aria-label="Барааны дотор дугаар хайх" placeholder="IMEI, баркод, код, нийлүүлэгчээр хайх" value={q} onChange={e=>{setQ(e.target.value);setPage(1);}}/>
  {mobile?<div className="inventory-cards">{result.data?.items.map(it=><article className="inventory-product-card" key={it.id}><button className="inventory-unit-link" onClick={()=>openUnit(it.id)}><strong>{it.imei||it.barcode||it.code}</strong><small>Код: {it.code}</small></button><Descriptions size="small" column={1} items={[{key:'stock',label:'Үлдэгдэл',children:it.stock+' ш'},{key:'price',label:'Үндсэн / бэлэн',children:cash(it.sale_price)+' / '+cash(it.cash_price??it.sale_price)},{key:'supplier',label:'Нийлүүлэгч',children:it.supplier||'Тодорхойгүй'}]}/><Button variant="ghost" onClick={async()=>{try{await navigator.clipboard.writeText(it.imei||it.barcode||it.code);}catch{ /* Identifier remains selectable on clipboard failure. */ }}}>Дугаар хуулах</Button></article>)}</div>:<div className="table-scroll"><Table><TableHeader><TableRow>{['ДУГААР','НИЙЛҮҮЛЭГЧ','ҮЛДЭГДЭЛ','ҮНЭ'].map(h=><TableHead key={h}>{h}</TableHead>)}</TableRow></TableHeader><TableBody>{result.data?.items.map(it=><TableRow key={it.id}><TableCell><button className="inventory-unit-link" onClick={()=>openUnit(it.id)}><strong>{it.imei||it.barcode||it.code}</strong><small>IMEI/сериал: {it.imei||'—'}</small><small>Баркод: {it.barcode||'—'}</small><small>Код: {it.code||'—'}</small></button></TableCell><TableCell>{it.supplier||'Бүртгээгүй'}</TableCell><TableCell><Tag color={it.stock>0?'green':'default'}>{it.stock} ш</Tag></TableCell><TableCell>{cash(it.sale_price)}<small>Бэлэн: {cash(it.cash_price??it.sale_price)}</small></TableCell></TableRow>)}</TableBody></Table></div>}
  {!result.loading&&!result.error&&result.data&&!result.data.items.length&&<p className="muted">Тохирох дугаар олдсонгүй.</p>}<Pagination current={page} total={result.data?.count||0} pageSize={50} showSizeChanger={false} onChange={setPage} hideOnSinglePage/>
  {!!result.data?.history.length&&<details className="inventory-unit-history"><summary>Гарсан дугаарын сүүлийн {result.data.history.length} бүртгэл</summary>{result.data.history.map(u=><p key={u.id}>{u.serial||u.barcode} · {u.source==='delivery'?'Хүргэлт':u.source==='lead_purchase'?'Зээлийн худалдан авалт':'Борлуулалт'} · {new Date(u.created_at).toLocaleDateString('mn-MN',{timeZone:'Asia/Ulaanbaatar'})}</p>)}</details>}
 </>}</div></SheetContent></Sheet>;
}
