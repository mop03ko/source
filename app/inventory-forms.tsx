'use client';
import {ChoiceInput} from '@/components/ui/choice-input';
import {SelectControl,TextareaControl} from '@/components/ui/form-controls';
import {useRef,useState} from 'react';
import {Field} from '@/components/form-field';
import {GuardedForm,useUnsavedChanges} from '@/components/draft-guard';
import {AsyncStatus} from '@/components/async-status';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {useRemote} from '@/hooks/use-remote';
import {fromInput} from '@/lib/crm';
import {readInventoryFile,type ImportFile} from '@/lib/inventory-workbook';

export type Item={id:string;code:string;brand:string;supplier:string;name:string;capacity:string;color:string;variant:string;imei:string|null;sale_price:number;min_stock:number;stock:number;value_cents:number;cost_estimated:number};
export type Warehouse={id:string;name:string};
export type Channel={name:string;commission_rate:number;account:string};
export type Options={warehouses:Warehouse[];brands:{brand:string}[];channels:Channel[]};
export type Detail={item:Item;byWarehouse:{warehouse_id:string;warehouse_name:string;qty:number;value_cents:number}[];moves:{id:string;kind:string;qty_delta:number;value_cents:number;warehouse_name:string;occurred_at:string;created_at:string;note:string}[]};
export type Post=(action:string,data:unknown,id?:string)=>Promise<Record<string,unknown>>;
const numeric=(f:FormData,k:string)=>Number(f.get(k)||0);
export const cash=(value:number)=>new Intl.NumberFormat('mn-MN',{maximumFractionDigits:2}).format(value)+' ₮';
const Price=({name,value=0,required=false}:{name:string;value?:number;required?:boolean})=><Input name={name} type="number" min={0} max={1_000_000_000} step="0.01" defaultValue={value} required={required}/>;

export function ItemForm({item,busy,onSave}:{item?:Item;busy:boolean;onSave:(data:unknown)=>Promise<void>}){
 return <GuardedForm className="form-stack" onSubmit={async e=>{const f=new FormData(e.currentTarget);await onSave({...Object.fromEntries(f),sale_price:numeric(f,'sale_price'),min_stock:numeric(f,'min_stock')});return true;}}>
  <Field label="Барааны нэр *"><Input name="name" defaultValue={item?.name} required maxLength={300}/></Field>
  <div className="form-grid"><Field label="Код / SKU *"><Input name="code" defaultValue={item?.code} required maxLength={200}/></Field><Field label="IMEI / сериал"><Input name="imei" defaultValue={item?.imei||''} maxLength={80}/></Field></div>
  <div className="form-grid"><Field label="Брэнд"><Input name="brand" defaultValue={item?.brand} maxLength={120}/></Field><Field label="Нийлүүлэгч"><Input name="supplier" defaultValue={item?.supplier} maxLength={120}/></Field></div>
  <div className="form-grid"><Field label="Багтаамж / хэмжээ"><Input name="capacity" defaultValue={item?.capacity} placeholder="256GB" maxLength={80}/></Field><Field label="Өнгө"><Input name="color" defaultValue={item?.color} maxLength={80}/></Field></div>
  <Field label="Бусад хувилбар"><Input name="variant" defaultValue={item?.variant} maxLength={120}/></Field>
  <div className="form-grid"><Field label="Борлуулах нэгжийн үнэ"><Price name="sale_price" value={item?.sale_price}/></Field><Field label="Доод үлдэгдлийн сануулга"><Input name="min_stock" type="number" min={0} max={1_000_000} step={1} defaultValue={item?.min_stock||0}/></Field></div>
  <Button disabled={busy} type="submit">{busy?'Хадгалж байна…':'Бараа хадгалах'}</Button>
 </GuardedForm>;
}

export function ItemPicker({value,onChange,warehouse,label='Бараа сонгох *'}:{value:Item|null;onChange:(item:Item|null)=>void;warehouse:string;label?:string}){
 const [q,setQ]=useState('');
 const search=useRemote<{items:Item[]}>(!value&&q.trim()?'/api/inventory?'+new URLSearchParams({view:'items',q,warehouse_id:warehouse}):null);
 return <div className="form-stack"><Field label={label}>{value?<div className="inventory-selection"><span><strong>{value.name}</strong><small>{value.code} · {value.imei||[value.capacity,value.color].filter(Boolean).join(' / ')}</small></span><Button type="button" variant="outline" onClick={()=>onChange(null)}>Солих</Button></div>:<Input value={q} onChange={e=>setQ(e.target.value)} placeholder="Код, IMEI эсвэл нэр бичнэ үү"/>}</Field>
  {!value&&<><AsyncStatus error={search.error} loading={search.loading} retry={search.retry}/><div className="inventory-picker">{search.data?.items.map(item=><button type="button" key={item.id} onClick={()=>onChange(item)}><span><strong>{item.name}</strong><small>{item.code}</small></span><span>{item.stock} ш</span></button>)}</div>{search.data&&!search.data.items.length&&<p className="muted">Тохирох бараа олдсонгүй.</p>}</>}
 </div>;
}

export function MovementForm({kind,item,options,warehouse,busy,onSave,customer,submitLabel}:{kind:'purchase'|'sale'|'transfer';item?:Item;options:Options;warehouse:string;busy:boolean;onSave:(data:unknown)=>Promise<void>;customer?:{name:string;phone:string};submitLabel?:string}){
 const [picked,setPicked]=useState<Item|null>(item||null),[source,setSource]=useState(warehouse),[channel,setChannel]=useState(''),[qty,setQty]=useState(1),[purchaseStatus,setPurchaseStatus]=useState('received');
 const [unit,setUnit]=useState(kind==='sale'?item?.sale_price||0:0),[extra,setExtra]=useState(0);
 const stock=useRemote<Detail>(picked?'/api/inventory?view=items&id='+encodeURIComponent(picked.id):null);
 const available=stock.data?.byWarehouse.find(w=>w.warehouse_id===source);
 const selectedChannel=options.channels.find(c=>c.name===channel);
 const chooseItem=(it:Item|null)=>{setPicked(it);if(kind==='sale')setUnit(it?.sale_price||0);};
 const blocked=kind!=='purchase'&&(!available||available.qty<qty);
 return <GuardedForm className="form-stack" onSubmit={async e=>{
  if(!picked||!source)throw new Error('Бараа болон агуулах сонгоно уу.');
  const f=new FormData(e.currentTarget),data={...Object.fromEntries(f),item_id:picked.id,warehouse_id:source,qty,unit_cost:unit,unit_price:unit,additional_cost:extra,commission_rate:numeric(f,'commission_rate'),tax_amount:numeric(f,'tax_amount'),vat_issued:f.get('vat_issued')==='on',ordered_at:fromInput(String(f.get('ordered_at')||'')),received_at:fromInput(String(f.get('received_at')||'')),sold_at:fromInput(String(f.get('sold_at')||''))};
  await onSave(data);return true;
 }}>
  <ItemPicker value={picked} onChange={chooseItem} warehouse={source}/>
  <Field label={kind==='purchase'?'Хүлээн авах агуулах *':'Зарлагадах агуулах *'}><SelectControl name="warehouse_id" value={source} onChange={e=>setSource(e.target.value)} required><option value="">Сонгох…</option>{options.warehouses.map(w=><option value={w.id} key={w.id}>{w.name}</option>)}</SelectControl></Field>
  {picked&&source&&<><AsyncStatus error={stock.error} loading={stock.loading} retry={stock.retry}/>{available&&<p className="inventory-stock-note">Энэ агуулахад <strong>{available.qty} ш</strong> · Өртөг {cash(available.value_cents/100)}</p>}</>}
  {kind==='transfer'&&<Field label="Очих агуулах *"><SelectControl name="to_warehouse_id" required defaultValue=""><option value="">Сонгох…</option>{options.warehouses.filter(w=>w.id!==source).map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</SelectControl></Field>}
  <div className="form-grid"><Field label="Тоо ширхэг *"><Input name="qty" type="number" min={1} max={kind==='purchase'?1_000_000:available?.qty||1} step={1} required value={qty} onChange={e=>setQty(Number(e.target.value))}/></Field>{kind!=='transfer'&&<Field label={kind==='purchase'?'Худалдан авах нэгжийн үнэ':'Борлуулах нэгжийн үнэ'}><Input name="unit" type="number" min={0} max={1_000_000_000} step="0.01" required value={unit} onChange={e=>setUnit(Number(e.target.value))}/></Field>}</div>
  {kind==='purchase'&&<>
   <div className="form-grid"><Field label="Захиалгын дугаар"><Input name="order_number" maxLength={120}/></Field><Field label="Төлөв"><SelectControl name="status" value={purchaseStatus} onChange={e=>setPurchaseStatus(e.target.value)}><option value="received">Хүлээн авсан</option><option value="ordered">Захиалсан · хүлээгдэж буй</option></SelectControl></Field></div>
   <div className="form-grid"><Field label="Захиалсан огноо"><Input name="ordered_at" type="datetime-local"/></Field>{purchaseStatus==='received'&&<Field label="Хүлээн авсан огноо"><Input name="received_at" type="datetime-local"/></Field>}</div>
   <div className="form-grid"><Field label="Нийт нэмэлт зардал (тээвэр, бэлтгэл)"><Input name="additional_cost" type="number" min={0} step="0.01" value={extra} onChange={e=>setExtra(Number(e.target.value))}/></Field><Field label="Төлбөр"><SelectControl name="payment_status"><option>Төлбөр төлөгдсөн</option><option>Дараа тооцоо</option><option>Хэсэгчлэн төлсөн</option></SelectControl></Field></div>
   <p className="inventory-stock-note">Нийт өртөг: <strong>{cash(unit*qty+extra)}</strong> · Нэгжид {cash(qty?(unit*qty+extra)/qty:0)}{purchaseStatus==='ordered'&&<small>Хүлээн авах хүртэл агуулахын үлдэгдэл нэмэгдэхгүй.</small>}</p>
  </>}
  {kind==='sale'&&<>
   <div className="form-grid"><Field label="Билл дугаар"><Input name="bill_number" maxLength={120}/></Field><Field label="Борлуулсан огноо"><Input name="sold_at" type="datetime-local"/></Field></div>
   <div className="form-grid"><Field label="Харилцагч"><Input name="customer_name" maxLength={160} defaultValue={customer?.name} readOnly={!!customer}/></Field><Field label="Утас"><Input name="customer_phone" type="tel" maxLength={40} defaultValue={customer?.phone} readOnly={!!customer}/></Field></div>
   <Field label="Борлуулалтын платформ"><SelectControl name="platform" value={channel} onChange={e=>setChannel(e.target.value)}><option value="">Сонгох…</option>{options.channels.map(c=><option key={c.name}>{c.name}</option>)}</SelectControl></Field>
   <div className="form-grid" key={channel}><Field label="Шимтгэл (%)"><Input name="commission_rate" type="number" min={0} max={100} step="0.01" defaultValue={selectedChannel?.commission_rate||0}/></Field><Field label="Төлбөр орсон данс"><Input name="account" defaultValue={selectedChannel?.account||''} maxLength={80}/></Field></div>
   <div className="form-grid"><Field label="Татварын бүртгэх дүн (₮)"><Price name="tax_amount"/></Field><Field label="НӨАТ баримт"><span className="row inventory-checkbox"><ChoiceInput type="checkbox" name="vat_issued"/>Олгосон</span></Field></div>
   <p className="muted">Татварын дүнг баримтаас оруулна. Борлуулалтын дүнгээс өртөг, шимтгэл, оруулсан татварыг хасаж ашиг тооцно.</p>
   <p className="inventory-stock-note">Нийт борлуулалт: <strong>{cash(unit*qty)}</strong></p>
  </>}
  <Field label="Тайлбар"><TextareaControl name="note" maxLength={2000} rows={2}/></Field>
  {blocked&&picked&&source&&!stock.loading&&<p className="error-box" role="alert">Сонгосон агуулахын үлдэгдэл хүрэлцэхгүй.</p>}
  <Button disabled={busy||!picked||!source||blocked||stock.loading} type="submit">{busy?'Хадгалж байна…':submitLabel||(kind==='transfer'?'Шилжүүлэх':'Бүртгэх')}</Button>
 </GuardedForm>;
}

export function ImportForm({post,busy,onDone}:{post:Post;busy:boolean;onDone:()=>void}){
 const [file,setFile]=useState<ImportFile|null>(null),[name,setName]=useState(''),[asOf,setAsOf]=useState(''),[reading,setReading]=useState(false),[error,setError]=useState(''),[ack,setAck]=useState(false);
 const [preview,setPreview]=useState<{rows:number;units:number;warehouses:number;issues:string[];issue_count:number}|null>(null);
 const seq=useRef(0);useUnsavedChanges(!!file);
 return <div className="form-stack">
  <p className="muted">AOM Excel-ийн Balance sheet-ээс бараа, байршил, эцсийн үлдэгдэл, өртгийг уншина. Эхлээд зөрчил болон дүнг шалгана.</p>
  <Field label="Excel эсвэл CSV файл"><Input type="file" accept=".xlsx,.csv" disabled={reading||busy} onChange={async e=>{const selected=e.target.files?.[0],n=++seq.current;setFile(null);setPreview(null);setError('');setAck(false);if(!selected)return;setReading(true);try{const result=await readInventoryFile(selected);if(n===seq.current){setFile(result);setName(selected.name);setAsOf(result.asOf||'');}}catch(e){if(n===seq.current)setError((e as Error).message);}finally{if(n===seq.current)setReading(false);}}}/></Field>
  {reading&&<p role="status">Файл уншиж байна…</p>}
  {file&&<>
   <p><strong>{name}</strong> · {file.sourceRows} мөрөөс {file.rows.length} мөр импортод бэлэн.</p>
   <Field label="Эхний үлдэгдлийн огноо, цаг (УБ) *"><Input type="datetime-local" value={asOf} onChange={e=>{setAsOf(e.target.value);setPreview(null);}} required disabled={busy}/></Field>
   {file.warnings.length>0&&<div className="inventory-import-warnings"><strong>{file.warnings.length} мөр импортод орохгүй</strong><ul>{file.warnings.map((w,i)=><li key={i}>{w}</li>)}</ul><label className="row"><ChoiceInput type="checkbox" checked={ack} onChange={e=>{setAck(e.target.checked);setPreview(null);}}/>Эдгээр мөрийг алгасаж, үлдсэн мөрүүдийг шалгана</label></div>}
   <div className="table-scroll"><table className="inventory-preview"><thead><tr><th>Код</th><th>Нэр</th><th>Агуулах</th><th>Тоо</th></tr></thead><tbody>{file.rows.slice(0,5).map((r,i)=><tr key={i}><td>{String(r.code)}</td><td>{String(r.name)}</td><td>{String(r.warehouse)}</td><td>{String(r.qty)}</td></tr>)}</tbody></table></div>
   <Button variant="outline" disabled={busy||!asOf||!!file.warnings.length&&!ack} onClick={async()=>{setError('');try{const r=await post('preview_import',{rows:file.rows,as_of:fromInput(asOf)});setPreview(r as typeof preview);}catch(e){setError((e as Error).message);}}}>Импортын зөрчил шалгах</Button>
   {preview&&<><p className="inventory-stock-note">{preview.rows} бараа · {preview.units} ширхэг · {preview.warehouses} агуулах</p>{preview.issue_count>0?<div className="error-box" role="alert"><strong>{preview.issue_count} зөрчил байна</strong><ul>{preview.issues.map((v,i)=><li key={i}>{v}</li>)}</ul></div>:<Button disabled={busy} onClick={async()=>{setError('');try{await post('import_opening',{rows:file.rows,as_of:fromInput(asOf)});setFile(null);onDone();}catch(e){setError((e as Error).message);}}}>{busy?'Импортолж байна…':`${preview.rows} бараа импортлох`}</Button>}</>}
  </>}
  {error&&<p className="error-box" role="alert">{error}</p>}
 </div>;
}
