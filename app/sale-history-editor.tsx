'use client';
import {useState,useRef} from 'react';
import {Alert,Button,Checkbox,Modal,Space,Timeline} from 'antd';
import {useRemote} from '@/hooks/use-remote';
import {ItemPicker,DirectSaleExtras,cash,type Item,type Options,type SaleGift} from './inventory-forms';
import {Field} from '@/components/form-field';
import {Input} from '@/components/ui/input';
import {SelectControl,TextareaControl} from '@/components/ui/form-controls';
import {GuardedForm} from '@/components/draft-guard';
import {AsyncStatus} from '@/components/async-status';
import {toast} from '@/components/ui/sonner';
import {dateLabel,fromInput} from '@/lib/crm';
type Sale={id:string;revision:number;item_id:string;warehouse_id:string;qty:number;unit_price:number;seller:string;customer_name:string;customer_phone:string;platform:string;bill_number:string;account:string;commission_rate:number;tax_cents:number;vat_issued:number;sold_at:string|null;created_at:string;note:string;has_accessories:number;gift_name:string};
type Detail={sale:Sale;item:Item;gifts:{item:Item;item_id:string;warehouse_id:string;qty:number}[];units:{serial:string;barcode:string;note:string}[];history:{id:string;action:string;note:string;actor:string;created_at:string}[]};
export default function SaleHistoryEditor({id,onClose,onSaved}:{id:string;onClose:()=>void;onSaved:()=>void}){
 const detail=useRemote<Detail>('/api/inventory?view=sale_detail&id='+encodeURIComponent(id));
 const options=useRemote<Options>('/api/inventory?view=options');
 const [busy,setBusy]=useState(false);
 return <Modal open title="Батлагдсан борлуулалт засах" width={760} onCancel={()=>{if(!busy)onClose();}} maskClosable={false} footer={null}>
  <AsyncStatus error={detail.error||options.error} loading={detail.loading||options.loading} retry={()=>{detail.retry();options.retry();}}/>
  {detail.data&&options.data&&<Editor key={id+':'+detail.data.sale.revision} detail={detail.data} options={options.data} busy={busy} setBusy={setBusy} onSaved={onSaved}/>}
 </Modal>;
}
function Editor({detail,options,busy,setBusy,onSaved}:{detail:Detail;options:Options;busy:boolean;setBusy:(v:boolean)=>void;onSaved:()=>void}){
 const {sale}=detail;
 const [item,setItem]=useState<Item|null>(detail.item),[warehouse,setWarehouse]=useState(sale.warehouse_id),[qty,setQty]=useState(sale.qty),[price,setPrice]=useState(sale.unit_price);
 const [gifts,setGifts]=useState<SaleGift[]>(()=>detail.gifts.map(g=>({key:crypto.randomUUID(),item:g.item,warehouse:g.warehouse_id,qty:g.qty})));
 const [hasGift,setHasGift]=useState(!!gifts.length),[accessories,setAccessories]=useState(!!sale.has_accessories),[error,setError]=useState(''),[reason,setReason]=useState(''),[confirmDelete,setConfirmDelete]=useState(false);
 const pending=useRef<{body:string;id:string}|null>(null);
 const credits=[{item_id:sale.item_id,warehouse_id:sale.warehouse_id,qty:sale.qty},...detail.gifts];
 async function save(action:'update_sale'|'delete_sale',data?:unknown){
  if(busy)return;setBusy(true);setError('');
  const body=JSON.stringify({action,id:sale.id,data:{revision:sale.revision,reason,sale:data}});
  if(!pending.current||pending.current.body!==body)pending.current={body,id:crypto.randomUUID()};
  try{const r=await fetch('/api/inventory',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...JSON.parse(body),request_id:pending.current.id})});const d=await r.json();if(!r.ok)throw Error(d.error||'Хадгалж чадсангүй.');pending.current=null;toast.success(action==='delete_sale'?'Борлуулалтыг устгаж, үлдэгдлийг буцаалаа.':'Борлуулалтын засвар хадгалагдлаа.');onSaved();return true;}catch(e){setError((e as Error).message);return false;}finally{setBusy(false);}
 }
 return <GuardedForm className="form-stack" onSubmit={async e=>{
  if(!item||!warehouse||hasGift&&(!gifts.length||gifts.some(g=>!g.item)))throw Error('Бараа, салбар, бэлгийн сонголтоо гүйцээнэ үү.');
  const f=new FormData(e.currentTarget);
  return await save('update_sale',{...sale,seller:sale.seller||undefined,item_id:item.id,warehouse_id:warehouse,qty,unit_price:price,customer_name:f.get('customer_name'),customer_phone:f.get('customer_phone'),bill_number:f.get('bill_number'),platform:f.get('platform'),commission_rate:f.get('platform')===sale.platform?sale.commission_rate:undefined,account:f.get('platform')===sale.platform?sale.account:'',sold_at:fromInput(String(f.get('sold_at')||'')),note:f.get('note'),tax_amount:sale.tax_cents/100,vat_issued:!!sale.vat_issued,has_accessories:accessories,gift_name:hasGift?f.get('gift_name')||'':'',gifts:hasGift?gifts.map(g=>({item_id:g.item!.id,warehouse_id:g.warehouse,qty:g.qty})):[],units:item.id===sale.item_id?detail.units:item.imei||item.barcode?[{serial:item.imei||'',barcode:item.barcode||'',note:''}]:[]});
 }}>
  <Alert type="info" showIcon title="Өмнөх зарлагыг буцааж, шинэ мэдээллээр бүртгэнэ." description="Үлдэгдэл хүрэлцэхгүй бол засвар хадгалагдахгүй. Хуучин бүртгэл хэвээр үлдэнэ."/>
  <ItemPicker value={item} onChange={setItem} warehouse="" inStockOnly label="Борлуулсан бараа"/>
  <Field label="Салбар"><SelectControl required value={warehouse} onChange={e=>setWarehouse(e.target.value)}>{options.warehouses.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</SelectControl></Field>
  <div className="form-grid"><Field label="Тоо ширхэг"><Input required type="number" min={1} max={1000000} step={1} value={qty} onChange={e=>setQty(Number(e.target.value))}/></Field><Field label="Нэгжийн үнэ"><Input required type="number" min={0} max={1000000000} step="0.01" value={price} onChange={e=>setPrice(Number(e.target.value))}/></Field></div>
  <strong>Нийт: {cash(qty*price)}</strong>
  <div className="form-grid"><Field label="Харилцагч"><Input name="customer_name" maxLength={160} defaultValue={sale.customer_name}/></Field><Field label="Утас"><Input name="customer_phone" maxLength={40} defaultValue={sale.customer_phone}/></Field></div>
  <div className="form-grid"><Field label="Баримт / гэрээний дугаар"><Input name="bill_number" maxLength={120} defaultValue={sale.bill_number}/></Field><Field label="Борлуулсан огноо"><Input required name="sold_at" type="datetime-local" defaultValue={new Date(Date.parse(sale.sold_at||sale.created_at)+8*3600000).toISOString().slice(0,16)}/></Field></div>
  <Field label="Төлбөрийн хэлбэр"><SelectControl name="platform" defaultValue={sale.platform}><option value="">Бэлэн</option>{[...new Set([...options.channels.map(c=>c.name),sale.platform].filter(Boolean))].map(c=><option key={c}>{c}</option>)}</SelectControl></Field>
  <Checkbox checked={accessories} onChange={e=>setAccessories(e.target.checked)}>Дагалдах бараатай</Checkbox>
  <DirectSaleExtras gifts={gifts} onChange={setGifts} enabled={hasGift} onEnabled={setHasGift} initialName={sale.gift_name} credits={credits}/>
  <Field label="Тэмдэглэл"><TextareaControl name="note" maxLength={2000} defaultValue={sale.note}/></Field>
  <Field label="Засах / устгах шалтгаан *"><TextareaControl required value={reason} maxLength={1000} onChange={e=>setReason(e.target.value)} placeholder="Ямар мэдээлэл өөрчлөгдсөн, яагаад устгаж байгааг бичнэ үү."/></Field>
  {error&&<Alert type="error" showIcon title={error}/>}
  <Space wrap><Button type="primary" htmlType="submit" loading={busy} disabled={busy||!reason.trim()}>Засварыг хадгалах</Button><Button danger disabled={busy||!reason.trim()} onClick={()=>setConfirmDelete(true)}>Борлуулалтыг устгах</Button></Space>
  {!!detail.history.length&&<details><summary>Өөрчлөлтийн түүх ({detail.history.length})</summary><Timeline items={detail.history.map(h=>({key:h.id,content:<>{dateLabel(h.created_at)} · {h.actor}<br/>{h.note}</>}))}/></details>}
  <Modal open={confirmDelete} title="Батлагдсан борлуулалтыг устгах уу?" okText="Устгаж, үлдэгдлийг буцаах" cancelText="Болих" okButtonProps={{danger:true,loading:busy}} cancelButtonProps={{disabled:busy}} closable={!busy} maskClosable={false} onCancel={()=>{if(!busy)setConfirmDelete(false);}} onOk={()=>void save('delete_sale')}>
   <p>{detail.item.name} · {sale.qty} ш · {cash(sale.qty*sale.unit_price)}</p><p>Үндсэн бараа, бэлгийн үлдэгдлийг буцааж нэмнэ. Борлуулалтын дүн тайлангаас хасагдаж, устгасан түүх хадгалагдана.</p>{error&&<Alert type="error" title={error}/>}
  </Modal>
 </GuardedForm>;
}
