'use client';
import {useInventoryCost} from '@/components/inventory-cost-access';
import {ProductPhoto} from './inventory-product-visual';
import {productCategories} from '@/lib/product-categories';
import {salePrice} from '@/lib/inventory-pricing';
import {ChoiceInput} from '@/components/ui/choice-input';
import {SelectControl,TextareaControl} from '@/components/ui/form-controls';
import {Alert,AutoComplete,InputNumber,Pagination,Steps} from 'antd';
import {useDebouncedValue} from '@/hooks/use-debounced-value';
import {toCsv} from '@/lib/inventory-csv';
import {OverlayFooter} from '@/components/ui/overlay';
import {useId,useRef,useState} from 'react';
import {Field} from '@/components/form-field';
import {GuardedForm,useUnsavedChanges} from '@/components/draft-guard';
import {AsyncStatus} from '@/components/async-status';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {useRemote,readJson} from '@/hooks/use-remote';
import {fromInput} from '@/lib/crm';
import {readInventoryFile,type ImportFile} from '@/lib/inventory-workbook';

export type Item={sku?:string;website_stock?:number;image_url?:string;product_key?:string;barcode?:string;unit_count?:number;single_item_id?:string|null;sale_price_max?:number;cash_price_max?:number;id:string;code:string;brand:string;supplier:string;category?:string;name:string;capacity:string;color:string;variant:string;imei:string|null;sale_price:number;cash_price?:number|null;min_stock:number;stock:number;value_cents:number;cost_estimated:number};
export type Warehouse={id:string;name:string};
export type Channel={name:string;commission_rate:number;account:string};
export type Options={warehouses:Warehouse[];brands:{brand:string}[];suppliers?:{supplier:string}[];categories?:{category:string}[];channels:Channel[]};
export type Detail={identifiers?:{id:string;serial:string;barcode:string;source:string;created_at:string}[];item:Item;byWarehouse:{warehouse_id:string;warehouse_name:string;qty:number;value_cents:number}[];moves:{id:string;kind:string;qty_delta:number;value_cents:number;warehouse_name:string;occurred_at:string;created_at:string;note:string}[]};
export type Post=(action:string,data:unknown,id?:string)=>Promise<Record<string,unknown>>;
const numeric=(f:FormData,k:string)=>Number(String(f.get(k)||0).replaceAll(',',''));
export const cash=(value:number)=>new Intl.NumberFormat('mn-MN',{maximumFractionDigits:2}).format(value)+' ₮';
const Price=({name,value=0,required=false}:{name:string;value?:number;required?:boolean})=><InputNumber name={name} aria-label={name==='sale_price'?'Үндсэн үнэ / зээл (₮)':'Татварын дүн (₮)'} min={0} max={1_000_000_000} precision={2} defaultValue={value} required={required} formatter={v=>String(v??'').replace(/\B(?=(\d{3})+(?!\d))/g,',')} parser={v=>parseFloat((v||'').replaceAll(',',''))} ref={instance=>{const input=instance?.nativeElement?.querySelector('input');if(input)input.required=required;}} style={{width:'100%'}}/>;
function Suggestion({name,value,options}:{name:string;value?:string;options:string[]}){
 const [text,setText]=useState(value||'');
 return <AutoComplete value={text} options={[...new Set(options)].filter(Boolean).map(value=>({value}))} filterOption={(input,option)=>String(option?.value).toLocaleLowerCase().includes(input.toLocaleLowerCase())} onChange={setText}><Input name={name} maxLength={120}/></AutoComplete>;
}

export function ItemForm({item,busy,onSave,options,template=false}:{item?:Item;options?:Options;template?:boolean;busy:boolean;onSave:(data:unknown)=>Promise<void>}){
 const formId=useId();
 const [imageUrl,setImageUrl]=useState(item?.image_url||'');
 const [identityChanged,setIdentityChanged]=useState(false);
 return <GuardedForm focusError id={formId} className="form-stack" onChange={e=>{const target=e.target;if(target instanceof HTMLInputElement&&['name','brand','capacity','color','variant'].includes(target.name))setIdentityChanged(true);}} onSubmit={async e=>{const f=new FormData(e.currentTarget);if(!String(f.get('name')||'').trim()||!String(f.get('code')||'').trim())throw new Error('Барааны нэр болон кодыг бөглөнө үү.');await onSave({...Object.fromEntries(f),sale_price:numeric(f,'sale_price'),cash_price:String(f.get('cash_price')||'').trim()===''?null:numeric(f,'cash_price'),min_stock:numeric(f,'min_stock')});return true;}}>
  {(template||item?.id)&&<p className="inventory-stock-note">{identityChanged?'Нэр, брэнд, багтаамж, өнгө эсвэл хувилбар өөрчлөгдвөл өөр бүтээгдэхүүнд нэгдэж болно.':!item?.color?'Өнгө тодорхойгүй тул шинэ дугаар тусдаа бүтээгдэхүүн болно.':template?'Энэ бүтээгдэхүүний нэр, багтаамж, өнгийг хадгалж шинэ дугаар нэмнэ.':'Шинж чанарыг өөрчлөхөд бүтээгдэхүүний нэгтгэл шинэчлэгдэнэ.'}</p>}
  <p className="form-help">* тэмдэгтэй талбаруудыг заавал бөглөнө үү.</p>
  <h3>Үндсэн мэдээлэл</h3>
  <Field label="Барааны нэр *"><Input name="name" defaultValue={item?.name} required maxLength={300}/></Field>
  <div className="form-grid"><Field label="Код / SKU *"><Input name="code" defaultValue={item?.code} required maxLength={200}/></Field><Field label="IMEI / сериал"><Input name="imei" defaultValue={item?.imei||''} maxLength={80}/></Field></div>
  <Field label="Барааны зургийн холбоос (HTTPS)"><Input name="image_url" type="url" value={imageUrl} onChange={e=>setImageUrl(e.target.value)} maxLength={2048} placeholder="https://…/product.jpg"/></Field><ProductPhoto url={imageUrl.startsWith('https://')?imageUrl:undefined} name={item?.name||'Барааны зураг'}/>
  <Field label="Баркод"><Input name="barcode" defaultValue={item?.barcode||''} maxLength={120} placeholder="Бүтээгдэхүүний баркод"/></Field>
  <div className="form-grid"><Field label="Брэнд"><Suggestion name="brand" value={item?.brand} options={options?.brands.map(b=>b.brand)||[]}/></Field><Field label="Нийлүүлэгч"><Suggestion name="supplier" value={item?.supplier} options={options?.suppliers?.map(b=>b.supplier)||[]}/></Field></div>
  <Field label="Барааны ангилал"><SelectControl name="category" defaultValue={item?.category||''}><option value="">Ангилаагүй</option>{[...new Set([...productCategories,...(item?.category?[item.category]:[])])].map(c=><option key={c}>{c}</option>)}</SelectControl></Field>
  <p className="form-help">Жишээ: ангилал — Гар утас; брэнд — Apple; нийлүүлэгч — Mike. Нийлүүлэгч тодорхойгүй бол хоосон үлдээнэ.</p>
  <h3>Барааны шинж чанар</h3><p className="form-help">Ижил загвар, багтаамж, өнгө автоматаар нэг бараанд орно. Өнгө тодорхойгүй бүртгэлийг тусад нь хадгална.</p>
  <div className="form-grid"><Field label="Багтаамж / хэмжээ"><Suggestion name="capacity" value={item?.capacity} options={['64GB','128GB','256GB','512GB','1TB','2TB']}/></Field><Field label="Өнгө"><Suggestion name="color" value={item?.color} options={['Black','White','Blue','Silver','Gray','Gold','Green','Pink']}/></Field></div>
  <Field label="Бусад хувилбар"><Input name="variant" defaultValue={item?.variant} maxLength={120}/></Field>
  <h3>Үнэ ба үлдэгдлийн сануулга</h3>
  <div className="form-grid"><Field label="Үндсэн үнэ / зээл (₮) *"><Price name="sale_price" value={item?.sale_price} required/></Field><Field label="Доод үлдэгдлийн сануулга (ш) *"><Input name="min_stock" type="number" min={0} max={1_000_000} step={1} required defaultValue={item?.min_stock||0}/></Field></div>
  <Field label="Бэлэн төлөлтийн хямдралтай үнэ (₮)"><Input name="cash_price" type="number" min={0} max={1_000_000_000} step="0.01" defaultValue={item?.cash_price??''} placeholder="Хоосон бол үндсэн үнийг ашиглана"/></Field>
  <p className="form-help">Доод босго нь энэ дугаарын бүртгэлд хамаарна; нэгтгэсэн бараанд бүртгэлүүдийн босгыг нэмж харуулна. Үлдэгдэл, өртөг нь орлого, зарлага, тооллогын хөдөлгөөнөөс тооцогдоно. Борлуулах үнийн өөрчлөлт өмнөх борлуулалтын дүнг өөрчлөхгүй.</p>
  <OverlayFooter><div className="inventory-form-actions"><Button type="button" variant="outline" disabled={busy} onClick={e=>e.currentTarget.closest('.ant-modal')?.querySelector<HTMLButtonElement>('.ant-modal-close')?.click()}>Цуцлах</Button><Button form={formId} disabled={busy} type="submit">{busy?'Хадгалж байна…':'Бараа хадгалах'}</Button></div></OverlayFooter>
 </GuardedForm>;
}

export function ItemPicker({value,onChange,warehouse,label='Бараа сонгох *'}:{value:Item|null;onChange:(item:Item|null)=>void;warehouse:string;label?:string}){
 const [q,setQ]=useState(''),[product,setProduct]=useState<Item|null>(null),[page,setPage]=useState(1),[selecting,setSelecting]=useState(false),[selectionError,setSelectionError]=useState('');
 const searchQ=useDebouncedValue(q);
 const search=useRemote<{items:Item[];count:number}>(!value&&q.trim()&&!product?'/api/inventory?'+new URLSearchParams({view:'products',q:searchQ,warehouse_id:warehouse,page:String(page)}):null);
 const units=useRemote<{items:Item[];count:number}>(!value&&product?'/api/inventory?'+new URLSearchParams({view:'products',id:product.id,q:searchQ,warehouse_id:warehouse,page:String(page)}):null);
 const choose=async(it:Item)=>{
  setSelectionError('');
  if(!it.single_item_id){setProduct(it);setPage(1);return;}
  setSelecting(true);try{const detail=await readJson<Detail>('/api/inventory?view=items&id='+encodeURIComponent(it.single_item_id));onChange(detail.item);}catch(e){setSelectionError((e as Error).message);}finally{setSelecting(false);}
 };
 const current=product?units:search;
 return <div className="form-stack"><Field label={label}>{value?<div className="inventory-selection"><span><strong>{value.name}</strong><small>Код: {value.code} · IMEI/сериал: {value.imei||'—'} · Баркод: {value.barcode||'—'}</small></span><Button type="button" variant="outline" onClick={()=>{onChange(null);setProduct(null);setPage(1);}}>Солих</Button></div>:<Input value={q} onChange={e=>{setQ(e.target.value);setProduct(null);setPage(1);}} placeholder="Код, IMEI эсвэл нэр бичнэ үү"/>}</Field>
  {!value&&<>{product&&<div className="inventory-selection"><strong>{product.name} · Дугаараа сонгоно уу</strong><Button type="button" variant="ghost" onClick={()=>{setProduct(null);setPage(1);}}>Бараа солих</Button></div>}<AsyncStatus error={current.error||selectionError} loading={current.loading||selecting} retry={current.retry}/><div className="inventory-picker">{current.data?.items.map(it=><button disabled={selecting} type="button" key={it.id} onClick={()=>product?onChange(it):void choose(it)}><span><strong>{it.name}</strong><small>{product?`IMEI: ${it.imei||'—'} · Баркод: ${it.barcode||'—'} · Код: ${it.code} · ${it.supplier||'Нийлүүлэгч бүртгээгүй'}`:`${it.unit_count} дугаарын бүртгэл · ${[it.capacity,it.color].filter(Boolean).join(' / ')}`}</small></span><span>{it.stock} ш</span></button>)}</div>{current.data&&!current.data.items.length&&<p className="muted">Тохирох бараа олдсонгүй.</p>}{current.data&&current.data.count>50&&<Pagination current={page} total={current.data.count} pageSize={50} showSizeChanger={false} onChange={setPage}/>}</>}
 </div>;
}

export function MovementForm({kind,item,options,warehouse,busy,onSave,customer,submitLabel,creditOnly=false}:{creditOnly?:boolean;kind:'purchase'|'sale'|'transfer';item?:Item;options:Options;warehouse:string;busy:boolean;onSave:(data:unknown)=>Promise<void>;customer?:{name:string;phone:string};submitLabel?:string}){
 const showCost=useInventoryCost();
 const formId=useId();
 const [destination,setDestination]=useState('');
 const [picked,setPicked]=useState<Item|null>(item||null),[source,setSource]=useState(warehouse),[channel,setChannel]=useState(''),[qty,setQty]=useState(1),[purchaseStatus,setPurchaseStatus]=useState('received');
 const [unit,setUnit]=useState(kind==='sale'?salePrice(item,creditOnly?'credit':'cash'):0),[extra,setExtra]=useState(0);
 const stock=useRemote<Detail>(picked?'/api/inventory?view=items&id='+encodeURIComponent(picked.id):null);
 const available=stock.data?.byWarehouse.find(w=>w.warehouse_id===source);
 const selectedChannel=options.channels.find(c=>c.name===channel);
 const chooseItem=(it:Item|null)=>{setPicked(it);setQty(1);if(kind==='sale')setUnit(salePrice(it,creditOnly||channel?'credit':'cash'));};
 const blocked=kind!=='purchase'&&(!available||available.qty<qty);
 return <GuardedForm focusError id={formId} className="form-stack" onSubmit={async e=>{
  if(!picked||!source)throw new Error('Бараа болон агуулах сонгоно уу.');
  const f=new FormData(e.currentTarget),data={...Object.fromEntries(f),item_id:picked.id,warehouse_id:source,qty,unit_cost:unit,unit_price:unit,additional_cost:extra,commission_rate:numeric(f,'commission_rate'),tax_amount:numeric(f,'tax_amount'),vat_issued:f.get('vat_issued')==='on',ordered_at:fromInput(String(f.get('ordered_at')||'')),received_at:fromInput(String(f.get('received_at')||'')),sold_at:fromInput(String(f.get('sold_at')||''))};
  await onSave({...data,...(kind==='sale'&&qty===1&&(picked.imei||picked.barcode)?{units:[{serial:picked.imei||'',barcode:picked.barcode||'',note:''}]}:{})});return true;
 }}>
  <ItemPicker value={picked} onChange={chooseItem} warehouse={source}/>
  <Field label={kind==='purchase'?'Хүлээн авах агуулах *':'Зарлагадах агуулах *'}><SelectControl name="warehouse_id" value={source} onChange={e=>{setSource(e.target.value);if(destination===e.target.value)setDestination('');}} required><option value="">Сонгох…</option>{options.warehouses.map(w=><option value={w.id} key={w.id}>{w.name}</option>)}</SelectControl></Field>
  {picked&&source&&<><AsyncStatus error={stock.error} loading={stock.loading} retry={stock.retry}/>{available&&<p className="inventory-stock-note">Энэ агуулахад <strong>{available.qty} ш</strong>{showCost&&<> · Өртөг {cash(available.value_cents/100)}</>}</p>}</>}
  {kind==='transfer'&&<Field label="Очих агуулах *"><SelectControl name="to_warehouse_id" required value={destination} onChange={e=>setDestination(e.target.value)}><option value="">Сонгох…</option>{options.warehouses.filter(w=>w.id!==source).map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</SelectControl></Field>}
  <div className="form-grid"><Field label="Тоо ширхэг *"><Input name="qty" type="number" min={1} max={kind==='purchase'?1_000_000:available?.qty||1} step={1} required value={qty} onChange={e=>setQty(Number(e.target.value))}/></Field>{kind!=='transfer'&&<Field label={kind==='purchase'?'Худалдан авах нэгжийн үнэ':'Борлуулах нэгжийн үнэ'}><Input name="unit" type="number" min={0} max={1_000_000_000} step="0.01" required value={unit} onChange={e=>setUnit(Number(e.target.value))}/></Field>}</div>
  {kind==='purchase'&&<>
   <div className="form-grid"><Field label="Захиалгын дугаар"><Input name="order_number" maxLength={120}/></Field><Field label="Төлөв"><SelectControl name="status" value={purchaseStatus} onChange={e=>setPurchaseStatus(e.target.value)}><option value="received">Хүлээн авсан</option><option value="ordered">Захиалсан · хүлээгдэж буй</option></SelectControl></Field></div>
   <div className="form-grid"><Field label="Захиалсан огноо"><Input name="ordered_at" type="datetime-local"/></Field>{purchaseStatus==='received'&&<Field label="Хүлээн авсан огноо"><Input name="received_at" type="datetime-local"/></Field>}</div>
   <div className="form-grid"><Field label="Нийт нэмэлт зардал (тээвэр, бэлтгэл)"><Input name="additional_cost" type="number" min={0} step="0.01" value={extra} onChange={e=>setExtra(Number(e.target.value))}/></Field><Field label="Төлбөр"><SelectControl name="payment_status"><option>Төлбөр төлөгдсөн</option><option>Дараа тооцоо</option><option>Хэсэгчлэн төлсөн</option></SelectControl></Field></div>
   <p className="inventory-stock-note">Нийт өртөг: <strong>{cash(unit*qty+extra)}</strong> · Нэгжид {cash(qty?(unit*qty+extra)/qty:0)}{purchaseStatus==='ordered'&&<small>Хүлээн авах хүртэл агуулахын үлдэгдэл нэмэгдэхгүй.</small>}</p>
  </>}
  {kind==='sale'&&<>
   {picked&&<p className="inventory-stock-note">Үндсэн / зээл: {cash(picked.sale_price)} · Бэлэн: {cash(picked.cash_price??picked.sale_price)}</p>}
   <p className="form-help" aria-live="polite">{creditOnly||channel?'Үндсэн үнэ сонгогдсон.':'Бэлэн төлөлтийн үнэ сонгогдсон; хямдралгүй бол үндсэн үнэ хэрэглэнэ.'} Төлбөрийн хэлбэр солиход нэгжийн үнэ шинэчлэгдэнэ.</p>
   <div className="form-grid"><Field label="Билл дугаар"><Input name="bill_number" maxLength={120}/></Field><Field label="Борлуулсан огноо"><Input name="sold_at" type="datetime-local"/></Field></div>
   <div className="form-grid"><Field label="Харилцагч"><Input name="customer_name" maxLength={160} defaultValue={customer?.name} readOnly={!!customer}/></Field><Field label="Утас"><Input name="customer_phone" type="tel" maxLength={40} defaultValue={customer?.phone} readOnly={!!customer}/></Field></div>
   <Field label="Төлбөрийн хэлбэр / платформ"><SelectControl name="platform" value={channel} onChange={e=>{setChannel(e.target.value);setUnit(salePrice(picked,creditOnly||e.target.value?'credit':'cash'));}}><option value="">{creditOnly?'Зээл / үндсэн үнэ':'Бэлэн төлөлт'}</option>{options.channels.map(c=><option key={c.name}>{c.name}</option>)}</SelectControl></Field>
   <div className="form-grid" key={channel}><Field label="Шимтгэл (%)"><Input name="commission_rate" type="number" min={0} max={100} step="0.01" defaultValue={selectedChannel?.commission_rate||0}/></Field><Field label="Төлбөр орсон данс"><Input name="account" defaultValue={selectedChannel?.account||''} maxLength={80}/></Field></div>
   <div className="form-grid"><Field label="Татварын бүртгэх дүн (₮)"><Price name="tax_amount"/></Field><div className="field"><span>НӨАТ баримт</span><span className="row inventory-checkbox"><ChoiceInput type="checkbox" name="vat_issued">Олгосон</ChoiceInput></span></div></div>
   <p className="muted">Татварын дүнг баримтаас оруулна. Борлуулалтын дүнгээс өртөг, шимтгэл, оруулсан татварыг хасаж ашиг тооцно.</p>
   <p className="inventory-stock-note">Нийт борлуулалт: <strong>{cash(unit*qty)}</strong></p>
  </>}
  {kind==='transfer'&&<p className="inventory-stock-note">{options.warehouses.find(w=>w.id===source)?.name||'Эхлэх агуулах'} → {options.warehouses.find(w=>w.id===destination)?.name||'Очих агуулах'} · {qty} ш шилжинэ</p>}
  <Field label="Тайлбар"><TextareaControl name="note" maxLength={2000} rows={2}/></Field>
  {blocked&&picked&&source&&!stock.loading&&<p className="error-box" role="alert">Сонгосон агуулахын үлдэгдэл хүрэлцэхгүй.</p>}
  <OverlayFooter><div className="inventory-form-actions"><Button type="button" variant="outline" disabled={busy} onClick={e=>e.currentTarget.closest('.ant-modal')?.querySelector<HTMLButtonElement>('.ant-modal-close')?.click()}>Цуцлах</Button><Button form={formId} disabled={busy||!picked||!source||blocked||stock.loading} type="submit">{busy?'Хадгалж байна…':submitLabel||(kind==='transfer'?'Шилжүүлэх':'Бүртгэх')}</Button></div></OverlayFooter>
 </GuardedForm>;
}

export function ImportForm({post,busy,onDone}:{post:Post;busy:boolean;onDone:()=>void}){
 const [file,setFile]=useState<ImportFile|null>(null),[name,setName]=useState(''),[asOf,setAsOf]=useState(''),[reading,setReading]=useState(false),[error,setError]=useState(''),[ack,setAck]=useState(false);
 const [preview,setPreview]=useState<{rows:number;units:number;warehouses:number;issues:string[];issue_count:number}|null>(null);
 const [completed,setCompleted]=useState<{rows:number;units:number;warehouses:number}|null>(null);
 const [issueQuery,setIssueQuery]=useState(''),[issuePage,setIssuePage]=useState(1);
 const seq=useRef(0);useUnsavedChanges(!!file);
 const warnings=(file?.warnings||[]).filter(w=>w.toLocaleLowerCase().includes(issueQuery.toLocaleLowerCase()));
 const downloadIssues=()=>{const url=URL.createObjectURL(new Blob([toCsv(['Зөрчил'],[...(file?.warnings||[]),...(preview?.issues||[])].map(w=>[w]))],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='inventory-import-issues.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 return <div className="form-stack">
  <Steps size="small" current={completed?3:!file?0:!preview?1:2} items={[{title:'Файл'},{title:'Шалгах'},{title:'Баталгаажуулах'},{title:'Үр дүн'}]}/>
  {completed?<><Alert type="success" showIcon title="Эхний үлдэгдэл импортлогдлоо" description={completed.rows+' бараа · '+completed.units+' ширхэг · '+completed.warehouses+' агуулах'}/><Button onClick={onDone}>Дуусгах</Button></>:<>
  <p className="muted">AOM Excel-ийн Balance sheet-ээс бараа, байршил, эцсийн үлдэгдэл, өртгийг уншина. Эхлээд зөрчил болон дүнг шалгана.</p>
  <Field label="Excel эсвэл CSV файл"><Input type="file" accept=".xlsx,.csv" disabled={reading||busy} onChange={async e=>{const selected=e.target.files?.[0],n=++seq.current;setFile(null);setPreview(null);setError('');setAck(false);if(!selected)return;setReading(true);try{const result=await readInventoryFile(selected);if(n===seq.current){setFile(result);setName(selected.name);setAsOf(result.asOf||'');}}catch(e){if(n===seq.current)setError((e as Error).message);}finally{if(n===seq.current)setReading(false);}}}/></Field>
  {reading&&<p role="status">Файл уншиж байна…</p>}
  {file&&<>
   <p><strong>{name}</strong> · {file.sourceRows} мөрөөс {file.rows.length} мөр импортод бэлэн.</p>
   <Field label="Эхний үлдэгдлийн огноо, цаг (УБ) *"><Input type="datetime-local" value={asOf} onChange={e=>{setAsOf(e.target.value);setPreview(null);}} required disabled={busy}/></Field>
   {file.warnings.length>0&&<div className="inventory-import-warnings"><strong>{file.warnings.length} мөр импортод орохгүй</strong><Input aria-label="Импортын зөрчил хайх" placeholder="Код, зөрчлийн тайлбараар хайх" value={issueQuery} onChange={e=>{setIssueQuery(e.target.value);setIssuePage(1);}}/><ul>{warnings.slice((issuePage-1)*10,issuePage*10).map((w,i)=><li key={i}>{w}</li>)}</ul><Pagination size="small" current={issuePage} pageSize={10} total={warnings.length} showSizeChanger={false} onChange={setIssuePage}/><Button variant="outline" onClick={downloadIssues}>Зөрчлийн CSV татах</Button><div className="row"><ChoiceInput type="checkbox" checked={ack} onChange={e=>{setAck(e.target.checked);setPreview(null);}}>Эдгээр мөрийг алгасаж, үлдсэн мөрүүдийг шалгана</ChoiceInput></div></div>}
   <div className="table-scroll"><table className="inventory-preview"><thead><tr><th>Код</th><th>Нэр</th><th>Агуулах</th><th>Тоо</th></tr></thead><tbody>{file.rows.slice(0,5).map((r,i)=><tr key={i}><td>{String(r.code)}</td><td>{String(r.name)}</td><td>{String(r.warehouse)}</td><td>{String(r.qty)}</td></tr>)}</tbody></table></div>
   <Button variant="outline" disabled={busy||!asOf||!!file.warnings.length&&!ack} onClick={async()=>{setError('');try{const r=await post('preview_import',{rows:file.rows,as_of:fromInput(asOf)});setPreview(r as typeof preview);}catch(e){setError((e as Error).message);}}}>Импортын зөрчил шалгах</Button>
   {preview&&<><p className="inventory-stock-note">{preview.rows} бараа · {preview.units} ширхэг · {preview.warehouses} агуулах</p>{preview.issue_count>0?<div className="error-box" role="alert"><strong>{preview.issue_count} зөрчил байна</strong><ul>{preview.issues.slice(0,10).map((v,i)=><li key={i}>{v}</li>)}</ul><Button variant="outline" onClick={downloadIssues}>Зөрчлийн CSV татах</Button></div>:<Button disabled={busy} onClick={async()=>{setError('');try{await post('import_opening',{rows:file.rows,as_of:fromInput(asOf)});setCompleted(preview);setFile(null);}catch(e){setError((e as Error).message);}}}>{busy?'Импортолж байна…':`${preview.rows} бараа импортлох`}</Button>}</>}
  </>}
  {error&&<p className="error-box" role="alert">{error}</p>}</>}
 </div>;
}
