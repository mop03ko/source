'use client';
import {MobileDisclosure,ResponsiveFilters} from '@/components/mobile-disclosure';
import {SelectControl,TextareaControl} from '@/components/ui/form-controls';
import {useRef,useState} from 'react';
import {Package,Truck,ShoppingCart,ClipboardList,Plus,Search,Download,Upload,ArrowLeftRight,Settings2,Warehouse as WarehouseIcon,ChartNoAxesCombined} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {Sheet,SheetContent,SheetHeader,SheetTitle,SheetDescription} from '@/components/ui/sheet';
import {Table,TableHeader,TableHead,TableBody,TableRow,TableCell} from '@/components/ui/table';
import {Field} from '@/components/form-field';
import {GuardedForm,useDraftGuard} from '@/components/draft-guard';
import {AsyncStatus} from '@/components/async-status';
import {useRemote,readJson} from '@/hooks/use-remote';
import {toCsv} from '@/lib/inventory-csv';
import {canEditInventoryItem,dateLabel,type Member} from '@/lib/crm';
import {toast} from '@/components/ui/sonner';
import InventoryCountsPanel from './inventory-counts-panel';
import {ItemForm,MovementForm,ImportForm,cash,type Item,type Options,type Detail,type Post} from './inventory-forms';

type Mode='items'|'balance'|'purchases'|'sales'|'moves'|'counts';
type Row=Item&{item_id:string;item_name:string;item_code:string;warehouse_name:string;qty:number;qty_delta:number;unit_cost:number;total_cost:number;total_price:number;cost_cents:number;commission_cents:number;tax_cents:number;profit_cents:number;status:string;returned_qty:number;order_number:string;bill_number:string;payment_status:string;platform:string;customer_name:string;customer_phone:string;account:string;vat_issued:number;created_at:string;occurred_at:string;received_at:string|null;sold_at:string|null;opening_qty:number;opening_cents:number;in_qty:number;in_cents:number;out_qty:number;out_cents:number;kind:string;note:string};
type List={items:Row[];count:number;summary:Record<string,number>;truncated?:boolean};
type Modal={kind:'item'|'warehouse'|'purchase'|'sale'|'transfer'|'return'|'import'|'settings';item?:Item;purchase?:Row}|null;
const modes:{id:Mode;label:string;icon:typeof Package}[]=[{id:'items',label:'Бараа, үлдэгдэл',icon:Package},{id:'balance',label:'Үлдэгдлийн тайлан',icon:ChartNoAxesCombined},{id:'purchases',label:'Худалдан авалт',icon:Truck},{id:'sales',label:'Борлуулалт',icon:ShoppingCart},{id:'moves',label:'Хөдөлгөөн',icon:ArrowLeftRight},{id:'counts',label:'Тооллого',icon:ClipboardList}];
const purchaseStatuses:Record<string,string>={ordered:'Захиалсан',received:'Хүлээн авсан',partial_return:'Хэсэгчилсэн буцаалт',returned:'Буцаасан'};
const kinds:Record<string,string>={opening:'Эхний үлдэгдэл',purchase:'Орлого',sale:'Борлуулалт',purchase_return:'Нийлүүлэгчид буцаасан',transfer_in:'Шилжүүлэг орсон',transfer_out:'Шилжүүлэг гарсан',count_adjustment:'Тооллогын тохируулга'};
const emptyOptions:Options={warehouses:[],brands:[],channels:[]};
const modalTitle={item:'Барааны бүртгэл',warehouse:'Агуулах / салбар нэмэх',purchase:'Худалдан авалт бүртгэх',sale:'Борлуулалт бүртгэх',transfer:'Агуулах хооронд шилжүүлэх',return:'Нийлүүлэгчид буцаах',import:'Excel-ээс эхний үлдэгдэл импортлох',settings:'Платформын шимтгэл, данс'};

export default function InventoryPanel({me,members}:{me:Member;members:Member[]}){
 const [mode,setMode]=useState<Mode>('items'),[q,setQ]=useState(''),[warehouse,setWarehouse]=useState(''),[brand,setBrand]=useState(''),[stock,setStock]=useState(''),[status,setStatus]=useState(''),[page,setPage]=useState(1),[revision,setRevision]=useState(0);
 const [today]=useState(()=>new Date(Date.now()+8*3600000).toISOString().slice(0,10));
 const [from,setFrom]=useState(today.slice(0,7)+'-01'),[to,setTo]=useState(today);
 const [modal,setModal]=useState<Modal>(null),[detailId,setDetailId]=useState(''),[busy,setBusy]=useState(false),[exporting,setExporting]=useState(false),[channel,setChannel]=useState('');
 const busyRef=useRef(false),pending=useRef<{body:string;id:string}|null>(null),allow=useDraftGuard();
 const options=useRemote<Options>('/api/inventory?view=options&revision='+revision),opts=options.data||emptyOptions;
 const params=new URLSearchParams({view:mode,q,warehouse_id:warehouse,page:String(page),revision:String(revision)});
 if(mode==='items'||mode==='balance'){params.set('brand',brand);params.set('stock',stock);}
 if(mode==='purchases')params.set('status',status);
 if(mode!=='items'){params.set('from',from);params.set('to',to);}
 const url='/api/inventory?'+params,list=useRemote<List>(mode==='counts'?null:url);
 const detail=useRemote<Detail>(detailId?'/api/inventory?view=items&id='+encodeURIComponent(detailId)+'&revision='+revision:null);
 const summary=list.data?.summary,rows=list.data?.items||[],total=list.data?.count||0,totalPages=Math.max(1,Math.ceil(total/50));
 const canManage=['admin','director','manager'].includes(me.role);
 const canEditItem=canEditInventoryItem(me.role);
 const post:Post=async(action,data,id)=>{
  if(busyRef.current)throw new Error('Өмнөх хүсэлт дуусахыг хүлээнэ үү.');
  const body=JSON.stringify({action,data,id});
  if(pending.current?.body!==body)pending.current={body,id:crypto.randomUUID()};
  busyRef.current=true;setBusy(true);
  try{
   const r=await fetch('/api/inventory',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,data,id,request_id:pending.current.id})});
   const value=await r.json();if(!r.ok)throw new Error(value.error||'Хадгалж чадсангүй.');
   pending.current=null;if(action!=='preview_import')setRevision(v=>v+1);return value;
  }finally{busyRef.current=false;setBusy(false);}
 };
 const save=async(action:string,data:unknown,id?:string)=>{await post(action,data,id);toast.success('Амжилттай хадгаллаа.');setModal(null);};
 const setFilter=(setter:(value:string)=>void,value:string)=>{setter(value);setPage(1);};
 const openMovement=(kind:'purchase'|'sale'|'transfer',item?:Item)=>setModal({kind,item});
 const exportCsv=async()=>{
  setExporting(true);try{
   const d=await readJson<List>(url+'&export=1');if(d.truncated)throw new Error('5,000-аас олон мөр байна. Огноо, агуулахын шүүлтүүрээр багасгана уу.');
   let headers:string[],values:unknown[][];
   if(mode==='items'||mode==='balance'){
    headers=['Код','Нэр','Брэнд','Нийлүүлэгч','Багтаамж','Өнгө','IMEI',...(mode==='balance'?['Эхний тоо','Эхний өртөг','Орлого тоо','Орлого өртөг','Зарлага тоо','Зарлага өртөг']:[]),'Эцсийн тоо','Эцсийн өртөг','Борлуулах үнэ','Өртөг тооцоолсон'];
    values=d.items.map(i=>[i.code,i.name,i.brand,i.supplier,i.capacity,i.color,i.imei,...(mode==='balance'?[i.opening_qty,i.opening_cents/100,i.in_qty,i.in_cents/100,i.out_qty,i.out_cents/100]:[]),i.stock,i.value_cents/100,i.sale_price,i.cost_estimated?'Тийм':'Үгүй']);
   }else if(mode==='sales'){
    headers=['Огноо','Билл','Код','Бараа','Агуулах','Тоо','Борлуулалт','Өртөг','Шимтгэл','Татвар','Ашиг','Платформ','Данс','НӨАТ баримт','Харилцагч','Утас'];
    values=d.items.map(i=>[i.sold_at,i.bill_number,i.item_code,i.item_name,i.warehouse_name,i.qty,i.total_price,i.cost_cents/100,i.commission_cents/100,i.tax_cents/100,i.profit_cents/100,i.platform,i.account,i.vat_issued?'Тийм':'Үгүй',i.customer_name,i.customer_phone]);
   }else if(mode==='purchases'){
    headers=['Огноо','Захиалга','Код','Бараа','Агуулах','Тоо','Нэгж өртөг','Нийт өртөг','Төлөв','Буцаасан','Төлбөр'];values=d.items.map(i=>[i.received_at||i.created_at,i.order_number,i.item_code,i.item_name,i.warehouse_name,i.qty,i.unit_cost,i.total_cost,purchaseStatuses[i.status],i.returned_qty,i.payment_status]);
   }else{headers=['Огноо','Код','Бараа','Агуулах','Хөдөлгөөн','Тоо','Өртөг','Тайлбар'];values=d.items.map(i=>[i.occurred_at,i.item_code,i.item_name,i.warehouse_name,kinds[i.kind]||i.kind,i.qty_delta,i.value_cents/100,i.note]);}
   const blob=URL.createObjectURL(new Blob([toCsv(headers,values)],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=blob;a.download=`inventory-${mode}-${today}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(blob),1000);
  }catch(e){toast.error((e as Error).message);}finally{setExporting(false);}
 };
 return <section className="table-panel inventory-panel">
  <div className="table-toolbar"><div><h2>Агуулахын удирдлага</h2><p className="muted">Бараа, орлого, зарлага, өртгийг нэг дор хянана.</p></div><div className="row inventory-actions">{canManage&&<><Button variant="outline" size="sm" onClick={()=>setModal({kind:'import'})}><Upload size={16}/>Excel импорт</Button><Button variant="outline" size="icon" aria-label="Платформын тохиргоо" onClick={()=>setModal({kind:'settings'})}><Settings2 size={17}/></Button></>}</div></div>
  <div className="inventory-tabs" role="tablist" aria-label="Агуулахын хэсгүүд">{modes.map(({id,label,icon:Icon})=><Button key={id} role="tab" aria-selected={mode===id} variant={mode===id?'default':'ghost'} onClick={()=>{if(allow()){setMode(id);setPage(1);}}}><Icon size={16}/>{label}</Button>)}</div>
  {mode==='counts'?<InventoryCountsPanel me={me} members={members}/>:<>
   <AsyncStatus error={options.error} loading={options.loading} retry={options.retry}/>
   {summary&&(mode==='items'||mode==='balance')&&<MobileDisclosure label="Агуулахын үзүүлэлт"><div className="metrics inventory-metrics">{[['Барааны төрөл',summary.count],['Нийт үлдэгдэл',summary.units],['Үлдэгдлийн өртөг',cash(summary.value_cents/100)],['Доод үлдэгдэлд хүрсэн',summary.low_stock]].map(([label,value])=><div className="metric" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div></MobileDisclosure>}
   {summary&&mode==='sales'&&<MobileDisclosure label="Агуулахын үзүүлэлт"><div className="metrics inventory-metrics">{[['Борлуулалт',summary.revenue_cents],['Борлуулсан өртөг',summary.cost_cents],['Шимтгэл + татвар',summary.commission_cents+summary.tax_cents],['Ашиг',summary.profit_cents]].map(([label,value])=><div className="metric" key={label}><span>{label}</span><strong>{cash(Number(value)/100)}</strong></div>)}</div></MobileDisclosure>}
   {!!summary?.cost_estimated&&<p className="inventory-note">Хуучин хөдөлгөөний зарим өртгийг худалдан авалтын дундаж үнээр нөхөн тооцсон тул өртөг, ашиг ойролцоо дүнтэй.</p>}
   <ResponsiveFilters className="filters inventory-filters" active={[warehouse,brand,stock,status,...(mode!=='items'?[from,to]:[])].filter(Boolean).length}>
    <div className="search"><Search size={17}/><Input aria-label="Бараа хайх" placeholder="Код, IMEI, нэрээр хайх…" value={q} onChange={e=>setFilter(setQ,e.target.value)}/></div>
    <SelectControl aria-label="Агуулахаар шүүх" value={warehouse} onChange={e=>setFilter(setWarehouse,e.target.value)}><option value="">Бүх агуулах</option>{opts.warehouses.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</SelectControl>
    {(mode==='items'||mode==='balance')&&<><SelectControl aria-label="Брэндээр шүүх" value={brand} onChange={e=>setFilter(setBrand,e.target.value)}><option value="">Бүх брэнд</option>{opts.brands.map(b=><option key={b.brand}>{b.brand}</option>)}</SelectControl><SelectControl aria-label="Үлдэгдлээр шүүх" value={stock} onChange={e=>setFilter(setStock,e.target.value)}><option value="">Бүх үлдэгдэл</option><option value="positive">Үлдэгдэлтэй</option><option value="empty">Үлдэгдэлгүй</option><option value="low">Доод хэмжээнд хүрсэн</option></SelectControl></>}
    {mode==='purchases'&&<SelectControl aria-label="Худалдан авалтын төлөв" value={status} onChange={e=>setFilter(setStatus,e.target.value)}><option value="">Бүх төлөв</option>{Object.entries(purchaseStatuses).map(([k,v])=><option key={k} value={k}>{v}</option>)}</SelectControl>}
    {mode!=='items'&&<div className="row inventory-date-range"><Field label="Эхлэх"><Input type="date" value={from} onChange={e=>setFilter(setFrom,e.target.value)}/></Field><Field label="Дуусах"><Input type="date" value={to} onChange={e=>setFilter(setTo,e.target.value)}/></Field></div>}
    <Button variant="ghost" size="sm" onClick={()=>{setWarehouse('');setBrand('');setStock('');setStatus('');setFrom('');setTo('');setQ('');setPage(1);}}>Шүүлтүүр цэвэрлэх</Button>
   </ResponsiveFilters>
   <div className="inventory-commandbar"><div className="row inventory-actions">
    {mode==='items'&&<><Button onClick={()=>setModal({kind:'item'})}><Plus size={16}/>Бараа нэмэх</Button><Button variant="outline" onClick={()=>setModal({kind:'warehouse'})}><WarehouseIcon size={16}/>Агуулах нэмэх</Button></>}
    {mode==='purchases'&&<Button disabled={!opts.warehouses.length} onClick={()=>openMovement('purchase')}><Plus size={16}/>Худалдан авалт</Button>}
    {mode==='sales'&&<Button disabled={!opts.warehouses.length} onClick={()=>openMovement('sale')}><Plus size={16}/>Борлуулалт</Button>}
    {mode==='moves'&&<Button disabled={opts.warehouses.length<2} onClick={()=>openMovement('transfer')}><ArrowLeftRight size={16}/>Шилжүүлэх</Button>}
    <span className="muted">{list.loading?'Ачаалж байна…':`${total.toLocaleString()} бүртгэл`}</span></div>
    <Button variant="outline" disabled={exporting||list.loading||!total} onClick={exportCsv}><Download size={16}/>{exporting?'Бэлтгэж байна…':'CSV татах'}</Button>
   </div>
   <AsyncStatus error={list.error} loading={list.loading} retry={list.retry}/>
   {!list.loading&&!list.error&&!rows.length&&<div className="inventory-empty"><Package size={32}/><h3>Тохирох бүртгэл алга</h3><p>Шүүлтүүрээ өөрчлөх эсвэл шинэ бүртгэл нэмнэ үү.</p></div>}
   {!!rows.length&&<div className="table-scroll"><Table><TableHeader><TableRow>
    {(mode==='items'?['БАРАА / КОД','БРЭНД / НИЙЛҮҮЛЭГЧ','БАГТААМЖ / ӨНГӨ / IMEI','ҮЛДЭГДЭЛ','ӨРТӨГ','БОРЛУУЛАХ ҮНЭ']:mode==='balance'?['БАРАА / КОД','ЭХНИЙ ТОО / ӨРТӨГ','ОРЛОГО ТОО / ӨРТӨГ','ЗАРЛАГА ТОО / ӨРТӨГ','ЭЦСИЙН ТОО / ӨРТӨГ']:mode==='purchases'?['ОГНОО / ЗАХИАЛГА','БАРАА','АГУУЛАХ','ТОО / БУЦААЛТ','НИЙТ ӨРТӨГ','ТӨЛӨВ / ТӨЛБӨР','ҮЙЛДЭЛ']:mode==='sales'?['ОГНОО / БИЛЛ','БАРАА / АГУУЛАХ','ТОО','БОРЛУУЛАЛТ / ӨРТӨГ','ШИМТГЭЛ / ТАТВАР','АШИГ','ПЛАТФОРМ / ДАНС','ХАРИЛЦАГЧ']:['ОГНОО','БАРАА','АГУУЛАХ','ХӨДӨЛГӨӨН','ТОО','ӨРТӨГ','ТАЙЛБАР']).map(h=><TableHead key={h}>{h}</TableHead>)}
   </TableRow></TableHeader><TableBody>{rows.map(r=><TableRow key={r.id}>
    {(mode==='items'||mode==='balance')&&<><TableCell><button className="inventory-item-link" onClick={()=>setDetailId(r.id)}><strong>{r.name}</strong><small>{r.code}</small></button></TableCell>{mode==='items'?<><TableCell>{r.brand}<small>{r.supplier}</small></TableCell><TableCell>{[r.capacity,r.color,r.variant].filter(Boolean).join(' / ')||'—'}<small>{r.imei}</small></TableCell><TableCell><span className={r.stock<=r.min_stock?'inventory-low':''}>{r.stock.toLocaleString()} ш</span></TableCell><TableCell>{cash(r.value_cents/100)}<small>Нэгж: {cash(r.stock?r.value_cents/r.stock/100:0)}</small></TableCell><TableCell>{cash(r.sale_price)}</TableCell></>:<>{[[r.opening_qty,r.opening_cents],[r.in_qty,r.in_cents],[r.out_qty,r.out_cents],[r.stock,r.value_cents]].map(([qty,value],i)=><TableCell key={i}><strong>{qty.toLocaleString()} ш</strong><small>{cash(value/100)}</small></TableCell>)}</>}</>}
    {mode==='purchases'&&<><TableCell>{dateLabel(r.received_at||r.created_at)}<small>{r.order_number}</small></TableCell><TableCell><button className="inventory-item-link" onClick={()=>setDetailId(r.item_id)}>{r.item_name}<small>{r.item_code}</small></button></TableCell><TableCell>{r.warehouse_name}</TableCell><TableCell>{r.qty} ш{r.returned_qty>0&&<small>Буцаасан {r.returned_qty}</small>}</TableCell><TableCell>{cash(r.total_cost)}<small>Нэгж {cash(r.unit_cost)}</small></TableCell><TableCell>{purchaseStatuses[r.status]}<small>{r.payment_status}</small></TableCell><TableCell>{r.status==='ordered'?<Button size="sm" disabled={busy} onClick={async()=>{try{await post('receive_purchase',{},r.id);toast.success('Агуулахад хүлээн авлаа.');}catch(e){toast.error((e as Error).message);}}}>Хүлээн авах</Button>:r.returned_qty<r.qty&&<Button size="sm" variant="outline" onClick={()=>setModal({kind:'return',purchase:r})}>Буцаах</Button>}</TableCell></>}
    {mode==='sales'&&<><TableCell>{dateLabel(r.sold_at||r.created_at)}<small>{r.bill_number}</small></TableCell><TableCell><button className="inventory-item-link" onClick={()=>setDetailId(r.item_id)}>{r.item_name}<small>{r.item_code} · {r.warehouse_name}</small></button></TableCell><TableCell>{r.qty} ш</TableCell><TableCell>{cash(r.total_price)}<small>Өртөг {cash(r.cost_cents/100)}</small></TableCell><TableCell>{cash(r.commission_cents/100)}<small>Татвар {cash(r.tax_cents/100)}</small></TableCell><TableCell className={r.profit_cents<0?'inventory-negative':''}>{cash(r.profit_cents/100)}</TableCell><TableCell>{r.platform||'—'}<small>{r.account}{r.vat_issued?' · Баримт олгосон':''}</small></TableCell><TableCell>{r.customer_name||'—'}<small>{r.customer_phone}</small></TableCell></>}
    {mode==='moves'&&<><TableCell>{dateLabel(r.occurred_at||r.created_at)}</TableCell><TableCell>{r.item_name}<small>{r.item_code}</small></TableCell><TableCell>{r.warehouse_name}</TableCell><TableCell>{kinds[r.kind]||r.kind}</TableCell><TableCell className={r.qty_delta<0?'inventory-negative':''}>{r.qty_delta>0?'+':''}{r.qty_delta}</TableCell><TableCell>{cash(r.value_cents/100)}</TableCell><TableCell>{r.note||'—'}</TableCell></>}
   </TableRow>)}</TableBody></Table></div>}
   {totalPages>1&&<div className="table-footer"><span>{total} бүртгэл</span><div className="row"><Button variant="outline" disabled={page<=1||list.loading} onClick={()=>setPage(p=>p-1)}>Өмнөх</Button><span>{page} / {totalPages}</span><Button variant="outline" disabled={page>=totalPages||list.loading} onClick={()=>setPage(p=>p+1)}>Дараах</Button></div></div>}
  </>}
  <Sheet open={!!detailId} onOpenChange={o=>{if(!o)setDetailId('');}}><SheetContent className="detail-sheet"><SheetHeader><SheetTitle>{detail.data?.item.name||'Барааны дэлгэрэнгүй'}</SheetTitle><SheetDescription>Агуулах тус бүрийн үлдэгдэл, өртөг, сүүлийн 100 хөдөлгөөн</SheetDescription></SheetHeader><div className="detail-body"><AsyncStatus error={detail.error} loading={detail.loading} retry={detail.retry}/>{detail.data&&<>
   <p className="muted">{detail.data.item.code} · {detail.data.item.brand} · {[detail.data.item.capacity,detail.data.item.color,detail.data.item.imei].filter(Boolean).join(' / ')}</p>
   <div className="row inventory-actions">{canEditItem&&<Button size="sm" onClick={()=>setModal({kind:'item',item:detail.data!.item})}>Мэдээлэл засах</Button>}<Button size="sm" variant="outline" onClick={()=>openMovement('purchase',detail.data!.item)}>Орлого нэмэх</Button><Button size="sm" variant="outline" onClick={()=>openMovement('sale',detail.data!.item)}>Зарлага бүртгэх</Button><Button size="sm" variant="outline" disabled={opts.warehouses.length<2} onClick={()=>openMovement('transfer',detail.data!.item)}>Шилжүүлэх</Button></div>
   <div className="sync-summary">{detail.data.byWarehouse.map(w=><div key={w.warehouse_id}><span>{w.warehouse_name}</span><strong>{w.qty} ш</strong><small>{cash(w.value_cents/100)}</small></div>)}</div>
   <div className="timeline">{detail.data.moves.map(m=><article key={m.id}><span className="timeline-dot"/><div className="row between"><strong>{kinds[m.kind]||m.kind} · {m.qty_delta>0?'+':''}{m.qty_delta} ш</strong><time>{dateLabel(m.occurred_at||m.created_at)}</time></div><p>{m.warehouse_name} · {cash(m.value_cents/100)}</p>{m.note&&<small>{m.note}</small>}</article>)}</div>
  </>}</div></SheetContent></Sheet>
  <Dialog open={!!modal} onOpenChange={open=>{if(!open&&!busy)setModal(null);}}><DialogContent className="form-dialog inventory-dialog"><DialogHeader><DialogTitle>{modal?modalTitle[modal.kind]:''}</DialogTitle><DialogDescription>{modal?.kind==='import'?'Үлдэгдлийг импортлохоос өмнө файл, огноо болон зөрчлийг шалгана.':'Мэдээллээ бөглөөд хадгална уу.'}</DialogDescription></DialogHeader>
   {modal?.kind==='item'&&(!modal.item||canEditItem)&&<ItemForm item={modal.item} busy={busy} onSave={data=>save(modal.item?'update_item':'create_item',data,modal.item?.id)}/>}
   {modal&&['purchase','sale','transfer'].includes(modal.kind)&&<MovementForm kind={modal.kind as 'purchase'|'sale'|'transfer'} item={modal.item} options={opts} warehouse={warehouse} busy={busy} onSave={data=>save(modal.kind==='purchase'?'record_purchase':modal.kind==='sale'?'record_sale':'transfer',data)}/>}
   {modal?.kind==='warehouse'&&<GuardedForm className="form-stack" onSubmit={async e=>{await save('create_warehouse',{name:new FormData(e.currentTarget).get('name')});return true;}}><Field label="Агуулах / салбарын нэр *"><Input name="name" required maxLength={120}/></Field><Button disabled={busy}>Хадгалах</Button></GuardedForm>}
   {modal?.kind==='return'&&<GuardedForm className="form-stack" onSubmit={async e=>{const f=new FormData(e.currentTarget);await save('return_purchase',{qty:Number(f.get('qty')),note:f.get('note')},modal.purchase!.id);return true;}}><p>{modal.purchase!.item_name} · {modal.purchase!.warehouse_name}</p><Field label="Буцаах тоо *"><Input name="qty" type="number" min={1} max={modal.purchase!.qty-modal.purchase!.returned_qty} defaultValue={1} required/></Field><Field label="Буцаалтын шалтгаан *"><TextareaControl name="note" required maxLength={2000}/></Field><p className="muted">Буцаалтын өртгийг агуулахын одоогийн дундаж өртгөөр хасна.</p><Button disabled={busy} variant="destructive">Буцаалт бүртгэх</Button></GuardedForm>}
   {modal?.kind==='import'&&<ImportForm post={post} busy={busy} onDone={()=>{toast.success('Импорт амжилттай.');setModal(null);}}/>}
   {modal?.kind==='settings'&&<div className="form-stack"><p className="muted">Эхний утгууд AOM файлын Parameter sheet-ээс авсан. Шинэ борлуулалтад ашиглах хувийг энд өөрчилнө.</p><Field label="Платформ сонгох"><SelectControl value={channel} onChange={e=>{if(allow())setChannel(e.target.value);}}><option value="">Шинэ платформ</option>{opts.channels.map(c=><option key={c.name}>{c.name}</option>)}</SelectControl></Field><GuardedForm key={channel} className="form-stack" onSubmit={async e=>{const f=new FormData(e.currentTarget);await save('save_channel',{name:f.get('name'),commission_rate:Number(f.get('commission_rate')),account:f.get('account')});return true;}}><Field label="Платформын нэр *"><Input name="name" defaultValue={channel} required maxLength={80}/></Field><Field label="Шимтгэл (%)"><Input name="commission_rate" type="number" min={0} max={100} step="0.01" defaultValue={opts.channels.find(c=>c.name===channel)?.commission_rate||0}/></Field><Field label="Төлбөрийн данс"><Input name="account" defaultValue={opts.channels.find(c=>c.name===channel)?.account||''} maxLength={80}/></Field><Button disabled={busy}>Тохиргоо хадгалах</Button></GuardedForm></div>}
  </DialogContent></Dialog>
 </section>;
}
