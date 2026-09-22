'use client';
import {salePrice} from '@/lib/inventory-pricing';
import {MobileDisclosure,ResponsiveFilters} from '@/components/mobile-disclosure';
import {useState} from 'react';
import {Pagination} from 'antd';
import {ShoppingCart,Plus,Search,Users,CircleDollarSign} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {Table,TableHeader,TableHead,TableBody,TableRow,TableCell} from '@/components/ui/table';
import {Field} from '@/components/form-field';
import {SelectControl,TextareaControl} from '@/components/ui/form-controls';
import {GuardedForm,markFormSaved,markFormError} from '@/components/draft-guard';
import {AsyncStatus} from '@/components/async-status';
import {useRemote} from '@/hooks/use-remote';
import {toast} from '@/components/ui/sonner';
import {ItemPicker,cash,type Item,type Options} from './inventory-forms';
import {canViewInventoryCost,dateLabel,canManageSchedule,isIsolatedRole,type Member} from '@/lib/crm';
type Row={id:string;item_name:string;item_code:string;warehouse_name:string;qty:number;unit_price:number;total_price:number;seller:string;seller_name:string|null;customer_name:string;customer_phone:string;platform:string;sold_at:string|null;created_at:string;profit_cents:number};
type List={items:Row[];count:number;summary:{revenue_cents:number;profit_cents:number}};
type Unit={serial:string;barcode:string;note:string};
const todayUB=()=>new Date(Date.now()+8*3600000).toISOString().slice(0,10);
export default function DirectSalesPanel({me,members}:{me:Member;members:Member[]}){
 const showCost=canViewInventoryCost(me.role);
 const canPickSeller=canManageSchedule(me.role);
 const [page,setPage]=useState(1);
 const [seller,setSeller]=useState(canPickSeller?'__direct__':me.email);
 const [from,setFrom]=useState(()=>todayUB().slice(0,7)+'-01'),[to,setTo]=useState(todayUB);
 const [q,setQ]=useState(''),[open,setOpen]=useState(false),[busy,setBusy]=useState(false),[revision,setRevision]=useState(0);
 // Зарагч бүртгэгдсэн борлуулалт = шууд бэлэн борлуулалт. Агент өөрийнхөө л жагсаалтыг хардаг.
 const list=useRemote<List>('/api/inventory?'+new URLSearchParams({view:'sales',seller,from,to,q,page:String(page),revision:String(revision)}));
 const options=useRemote<Options>('/api/inventory?view=options');
 const sellers=members.filter(m=>m.active&&!isIsolatedRole(m.role));
 const rows=list.data?.items||[];
 const post=async(data:unknown)=>{
  setBusy(true);
  try{
   const r=await fetch('/api/inventory',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'record_sale',data,request_id:crypto.randomUUID()})});
   const d=await r.json() as {error?:string;fieldErrors?:Record<string,string>};
   const form=document.activeElement?.closest('form')||null;
   if(!r.ok){markFormError(form,d.error||'Хадгалж чадсангүй.',d.fieldErrors);throw new Error(d.error||'Хадгалж чадсангүй.');}
   markFormSaved(form);setPage(1);setRevision(v=>v+1);toast.success('Борлуулалт бүртгэгдлээ.');return d;
  }catch(e){toast.error((e as Error).message);return null;}finally{setBusy(false);}
 };
 return <section className="table-panel">
 <div className="table-toolbar"><h2>Шууд бэлэн борлуулалт<span>{list.data?.count||0}</span></h2><div className="row">
  <Button className="primary" size="sm" onClick={()=>setOpen(true)}><Plus size={16}/>Борлуулалт бүртгэх</Button>
 </div></div>
 {list.data?.summary&&<MobileDisclosure label="Борлуулалтын үзүүлэлт"><div className="metrics"><div className="metric"><div><span>Борлуулалт</span><ShoppingCart size={19}/></div><strong>{(list.data.count||0).toLocaleString()}</strong><small>Сонгосон хугацаанд</small></div><div className="metric metric-focus"><div><span>Нийт орлого</span><CircleDollarSign size={19}/></div><strong>{cash(list.data.summary.revenue_cents/100)}</strong><small>Бэлнээр гарсан</small></div>{showCost&&<div className="metric"><div><span>Ашиг</span><CircleDollarSign size={19}/></div><strong>{cash(list.data.summary.profit_cents/100)}</strong><small>Өртөг, шимтгэл хассан</small></div>}</div></MobileDisclosure>}
 <ResponsiveFilters active={[seller!=='__direct__'&&canPickSeller,from,to].filter(Boolean).length}>
  <div className="search"><Search size={17}/><Input aria-label="Бараагаар хайх" placeholder="Бараа, кодоор хайх…" value={q} onChange={e=>{setQ(e.target.value);setPage(1);}}/></div>
  {canPickSeller&&<SelectControl aria-label="Зарсан ажилтнаар шүүх" value={seller} onChange={e=>{setSeller(e.target.value);setPage(1);}}><option value="__direct__">Бүх ажилтан</option>{sellers.map(m=><option key={m.email} value={m.email}>{m.name}</option>)}</SelectControl>}
  <Input aria-label="Огноо: эхлэх" type="date" value={from} max={to} onChange={e=>{setFrom(e.target.value);setPage(1);}}/><span className="muted">—</span><Input aria-label="Огноо: дуусах" type="date" value={to} min={from} onChange={e=>{setTo(e.target.value);setPage(1);}}/>
 </ResponsiveFilters>
 <AsyncStatus error={list.error} loading={list.loading} retry={list.retry}/>
 {!list.error&&(rows.length?<div className="table-scroll"><Table><TableHeader><TableRow><TableHead>ОГНОО</TableHead><TableHead>БАРАА</TableHead><TableHead>АГУУЛАХ</TableHead><TableHead>ТОО</TableHead><TableHead>ДҮН</TableHead>{showCost&&<TableHead>АШИГ</TableHead>}<TableHead>ЗАРСАН</TableHead><TableHead>ХАРИЛЦАГЧ</TableHead></TableRow></TableHeader><TableBody>
  {rows.map(r=><TableRow key={r.id}>
   <TableCell>{dateLabel(r.sold_at||r.created_at)}</TableCell>
   <TableCell><strong>{r.item_name}</strong><small>{r.item_code}</small></TableCell>
   <TableCell>{r.warehouse_name}</TableCell>
   <TableCell>{r.qty}</TableCell>
   <TableCell>{cash(r.total_price)}</TableCell>
   {showCost&&<TableCell>{cash(r.profit_cents/100)}</TableCell>}
   <TableCell><span className="owner-label">{r.seller_name||r.seller||'—'}</span></TableCell>
   <TableCell>{r.customer_name||'—'}<small>{r.customer_phone||''}</small></TableCell>
  </TableRow>)}
 </TableBody></Table></div>:!list.loading&&<p className="muted chat-empty-list">Сонгосон хугацаанд шууд борлуулалт бүртгэгдээгүй байна.</p>)}
 {!!list.data?.count&&<div className="table-footer"><Pagination current={page} pageSize={50} total={list.data.count} onChange={setPage} disabled={list.loading} showSizeChanger={false} showTotal={(total,range)=>`${range[0]}–${range[1]} / ${total} борлуулалт`} responsive/></div>}
 <Dialog open={open} onOpenChange={setOpen}><DialogContent className="form-dialog">
  <DialogHeader><DialogTitle>Шууд бэлэн борлуулалт</DialogTitle><DialogDescription>Хүсэлтээр ирээгүй, шууд ирж худалдан авсан борлуулалтыг бүртгэнэ. Агуулахын үлдэгдлээс хасагдана.</DialogDescription></DialogHeader>
  <SaleForm me={me} sellers={sellers} canPickSeller={canPickSeller} options={options.data||undefined} busy={busy} onSubmit={async v=>{if(await post(v))setOpen(false);}}/>
 </DialogContent></Dialog>
 </section>;
}
function SaleForm({me,sellers,canPickSeller,options,busy,onSubmit}:{me:Member;sellers:Member[];canPickSeller:boolean;options?:Options;busy:boolean;onSubmit:(d:unknown)=>unknown}){
 const [item,setItem]=useState<Item|null>(null),[warehouse,setWarehouse]=useState('');
 const [qty,setQty]=useState(1),[price,setPrice]=useState(0),[platform,setPlatform]=useState('');
 const [units,setUnits]=useState<Unit[]>([]);
 const stock=useRemote<{byWarehouse:{warehouse_id:string;qty:number}[]}>(item?'/api/inventory?view=items&id='+encodeURIComponent(item.id):null);
 const available=stock.data?.byWarehouse.find(w=>w.warehouse_id===warehouse)?.qty??null;
 const choose=(it:Item|null)=>{setItem(it);setQty(1);setUnits(it&&(it.imei||it.barcode)?[{serial:it.imei||'',barcode:it.barcode||'',note:''}]:[]);setPrice(salePrice(it,platform?'credit':'cash'));};
 return <GuardedForm className="form-stack" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);
  if(!item||!warehouse){toast.error('Бараа болон агуулах сонгоно уу.');return;}
  onSubmit({item_id:item.id,warehouse_id:warehouse,qty,unit_price:price,seller:canPickSeller?f.get('seller'):me.email,
   customer_name:f.get('customer_name'),customer_phone:f.get('customer_phone'),platform:f.get('platform'),bill_number:f.get('bill_number'),
   sold_at:null,note:f.get('note'),units:units.filter(u=>u.serial.trim()||u.barcode.trim())});}}>
 <ItemPicker value={item} onChange={choose} warehouse={warehouse} label="Бараа сонгох *"/>
 <div className="form-grid">
  <Field label="Агуулах *"><SelectControl name="warehouse_id" required value={warehouse} onChange={e=>setWarehouse(e.target.value)}>{[<option key="" value="" disabled>Сонгох…</option>,...(options?.warehouses||[]).map(w=><option key={w.id} value={w.id}>{w.name}</option>)]}</SelectControl></Field>
  <Field label="Зарсан ажилтан *">{canPickSeller?<SelectControl name="seller" required defaultValue={me.email}>{sellers.map(m=><option key={m.email} value={m.email}>{m.name}</option>)}</SelectControl>:<Input value={me.name} disabled/>}</Field>
 </div>
 {item&&warehouse&&available!==null&&<p className="form-help">Энэ агуулахад <strong>{available} ш</strong> үлдэгдэлтэй.</p>}
 <div className="form-grid">
  <Field label="Тоо ширхэг *"><Input type="number" min={1} max={available??undefined} required value={qty} onChange={e=>setQty(Math.max(1,Number(e.target.value)||1))}/></Field>
  <Field label="Нэгжийн үнэ *"><Input type="number" min={0} step="0.01" required value={price} onChange={e=>setPrice(Number(e.target.value)||0)}/></Field>
 </div>
 <p className="form-help">{platform?'Үндсэн үнэ / зээл':'Бэлэн төлөлтийн үнэ'} · Төлбөрийн хэлбэр солиход нэгжийн үнэ шинэчлэгдэнэ.</p>
 <p className="form-help">Нийт: <strong>{cash(price*qty)}</strong></p>
 <div className="form-grid">
  <Field label="Төлбөрийн хэлбэр"><SelectControl name="platform" value={platform} onChange={e=>{setPlatform(e.target.value);setPrice(salePrice(item,e.target.value?'credit':'cash'));}}>{[<option key="" value="">Бэлэн</option>,...(options?.channels||[]).map(c=><option key={c.name} value={c.name}>{c.name}</option>)]}</SelectControl></Field>
  <Field label="Билл / баримтын дугаар"><Input name="bill_number" maxLength={120}/></Field>
 </div>
 <div className="form-grid">
  <Field label="Харилцагчийн нэр"><Input name="customer_name" maxLength={160}/></Field>
  <Field label="Утас"><Input name="customer_phone" maxLength={40} placeholder="99112233"/></Field>
 </div>
 {!!item&&<div className="form-stack">
  <div className="row between"><strong className="text-sm">Гарсан нэгжийн сериал / баркод</strong><Button type="button" variant="outline" size="sm" onClick={()=>setUnits(u=>[...u,{serial:'',barcode:'',note:''}])}><Plus size={14}/>Нэгж нэмэх</Button></div>
  {units.map((u,i)=><div className="form-grid" key={i}>
   <Field label={'Сериал / IMEI '+(i+1)}><Input value={u.serial} maxLength={120} placeholder={item.imei||'351234567890123'} onChange={e=>setUnits(l=>l.map((x,j)=>j===i?{...x,serial:e.target.value}:x))}/></Field>
   <Field label="Баркод (сериалгүй бол)"><Input value={u.barcode} maxLength={120} onChange={e=>setUnits(l=>l.map((x,j)=>j===i?{...x,barcode:e.target.value}:x))}/></Field>
   <Button type="button" variant="ghost" size="sm" onClick={()=>setUnits(l=>l.filter((_,j)=>j!==i))}>Хасах</Button>
  </div>)}
 </div>}
 <Field label="Тэмдэглэл"><TextareaControl name="note" rows={2} maxLength={2000}/></Field>
 <Button type="submit" className="primary full" disabled={busy}><Users size={16}/>{busy?'Хадгалж байна…':'Борлуулалт бүртгэх'}</Button>
 </GuardedForm>;
}
