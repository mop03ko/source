'use client';
import {useState} from 'react';
import {Alert,Checkbox,Radio,InputNumber} from 'antd';
import {ItemPicker,cash,type Item,type Options,type Detail} from './inventory-forms';
import {useRemote} from '@/hooks/use-remote';
import {GuardedForm} from '@/components/draft-guard';
import {Field} from '@/components/form-field';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {SelectControl,TextareaControl} from '@/components/ui/form-controls';
type Line={key:string;item:Item|null;qty:number;price:number;warehouse:string;kind:'gift'|'accessory'};
function Branch({line,onChange}:{line:Line;onChange:(warehouse:string)=>void}){
 const detail=useRemote<Detail>(line.item?'/api/inventory?view=items&id='+encodeURIComponent(line.item.id):null);
 if(!line.item)return null;
 if(detail.error)return <Alert type="error" title="Салбарын үлдэгдлийг уншиж чадсангүй" action={<Button type="button" onClick={detail.retry}>Дахин оролдох</Button>}/>;
 if(!detail.data)return <p role="status">Үлдэгдэл шалгаж байна…</p>;
 const branches=detail.data.byWarehouse.filter(w=>w.qty>=line.qty);
 if(branches.length===1)return <p className="form-help">Авах салбар: <strong>{branches[0].warehouse_name}</strong> · {branches[0].qty} ш бэлэн</p>;
 if(!branches.length)return <Alert type="warning" title="Тоо ширхэгт хүрэлцэх үлдэгдэлтэй салбар алга."/>;
 return <Field label="Авах салбар *"><SelectControl required value={line.warehouse} onChange={e=>onChange(e.target.value)}><option value="">Салбар сонгох</option>{branches.map(w=><option key={w.warehouse_id} value={w.warehouse_id}>{w.warehouse_name} · {w.qty} ш</option>)}</SelectControl></Field>;
}
export default function LoanPurchaseForm({options,busy,onSave}:{options:Options;busy:boolean;onSave:(data:unknown)=>Promise<void>}){
 const empty=(kind:Line['kind']):Line=>({key:crypto.randomUUID(),item:null,qty:1,price:0,warehouse:'',kind});
 const [main,setMain]=useState<Line>({key:'main',item:null,qty:1,price:0,warehouse:'',kind:'accessory'}),[extras,setExtras]=useState<Line[]>([]);
 const [hasGift,setGift]=useState(false),[hasAccessories,setAccessories]=useState(false),[method,setMethod]=useState<'delivery'|'pickup'>('pickup'),[error,setError]=useState('');
 const change=(key:string,value:Partial<Line>)=>setExtras(rows=>rows.map(r=>r.key===key?{...r,...value}:r));
 const active=extras.filter(l=>l.kind==='gift'?hasGift:hasAccessories);
 const total=main.qty*main.price+active.filter(l=>l.kind==='accessory').reduce((sum,l)=>sum+l.qty*l.price,0);
 return <GuardedForm className="form-stack" onSubmit={async e=>{e.preventDefault();setError('');if(busy)return;if(!main.item||active.some(l=>!l.item)){setError('Үндсэн бараа, бэлэг, дагалдах барааны сонголтоо гүйцээнэ үү.');return;}const f=new FormData(e.currentTarget);try{await onSave({item_id:main.item.id,warehouse_id:main.warehouse,qty:main.qty,unit_price:main.price,bill_number:f.get('contract')||'',platform:f.get('platform')||'',note:f.get('note')||'',units:main.qty===1&&(main.item.imei||main.item.barcode)?[{serial:main.item.imei||'',barcode:main.item.barcode||'',note:''}]:[],fulfillment:{method,address:f.get('address')||'',gift_name:hasGift?f.get('gift_name')||'':'',extras:active.map(l=>({item_id:l.item!.id,warehouse_id:l.warehouse,qty:l.qty,unit_price:l.kind==='gift'?0:l.price,kind:l.kind}))}});}catch(err){setError((err as Error).message);}}}>
  <ItemPicker inStockOnly value={main.item} warehouse="" onChange={item=>setMain({...main,item,warehouse:'',price:item?.sale_price||0})} label="Худалдан авсан бараа *"/>
  <div className="form-grid"><Field label="Тоо ширхэг *"><InputNumber aria-label="Үндсэн барааны тоо" min={1} max={1000000} precision={0} value={main.qty} onChange={v=>setMain({...main,qty:v||1,warehouse:''})}/></Field><Field label="Зээлийн нэгж үнэ (₮) *"><InputNumber aria-label="Зээлийн нэгж үнэ" min={0} max={1000000000} precision={2} value={main.price} onChange={v=>setMain({...main,price:v||0})}/></Field></div>
  <Branch line={main} onChange={warehouse=>setMain({...main,warehouse})}/>
  <Field label="Зээлийн гэрээний дугаар"><Input name="contract" maxLength={120}/></Field>
  <Field label="Зээлийн суваг"><SelectControl name="platform"><option value="">Сонгох</option>{options.channels.map(c=><option key={c.name}>{c.name}</option>)}</SelectControl></Field>
  <Checkbox checked={hasGift} onChange={e=>{setGift(e.target.checked);if(e.target.checked&&!extras.some(l=>l.kind==='gift'))setExtras([...extras,empty('gift')]);}}>Бэлэгтэй</Checkbox>
  {hasGift&&<Field label="Бэлгийн нэр / урамшуулал"><Input name="gift_name" maxLength={120} placeholder="Жишээ: Утасны дагалдах бэлэг"/></Field>}
  <Checkbox checked={hasAccessories} onChange={e=>{setAccessories(e.target.checked);if(e.target.checked&&!extras.some(l=>l.kind==='accessory'))setExtras([...extras,empty('accessory')]);}}>Дагалдах бараатай</Checkbox>
  {active.map(line=><section key={line.key} className="next-box"><div className="form-stack" style={{width:'100%'}}><strong>{line.kind==='gift'?'Бэлэг':'Дагалдах бараа'}</strong><ItemPicker inStockOnly value={line.item} warehouse="" onChange={item=>change(line.key,{item,warehouse:'',price:line.kind==='gift'?0:item?.sale_price||0})} label="Барааны код, нэрээр хайж сонгох *"/><Field label="Тоо ширхэг"><InputNumber min={1} max={1000000} precision={0} value={line.qty} onChange={v=>change(line.key,{qty:v||1,warehouse:''})}/></Field>{line.kind==='accessory'&&<Field label="Нэгж үнэ (₮)"><InputNumber min={0} max={1000000000} precision={2} value={line.price} onChange={v=>change(line.key,{price:v||0})}/></Field>}<Branch line={line} onChange={warehouse=>change(line.key,{warehouse})}/><Button type="button" variant="ghost" onClick={()=>{const rest=extras.filter(l=>l.key!==line.key);setExtras(rest);if(!rest.some(l=>l.kind===line.kind)){if(line.kind==='gift')setGift(false);else setAccessories(false);}}}>Барааг хасах</Button></div></section>)}
  <div className="row">{hasGift&&<Button type="button" variant="outline" onClick={()=>setExtras([...extras,empty('gift')])}>Бэлэг нэмэх</Button>}{hasAccessories&&<Button type="button" variant="outline" onClick={()=>setExtras([...extras,empty('accessory')])}>Дагалдах бараа нэмэх</Button>}</div>
  <Field label="Бараагаа авах хэлбэр *"><Radio.Group value={method} onChange={e=>setMethod(e.target.value)} options={[{value:'pickup',label:'Салбараас авах'},{value:'delivery',label:'Хүргэлт'}]}/></Field>
  {method==='delivery'&&<><Field label="Хүргэлтийн хаяг *"><TextareaControl name="address" required maxLength={500} rows={3}/></Field><p className="form-help">Өнөөдрийн хүргэлтийн хуваарьтай ажилтнаас хамгийн цөөн хүргэлттэйд автоматаар онооно.</p></>}
  <Field label="Тайлбар"><TextareaControl name="note" maxLength={2000}/></Field><strong>Нийт төлбөр: {cash(total)}</strong>
  {error&&<Alert type="error" title={error} showIcon/>}<Button type="submit" disabled={busy||!main.item}>{busy?'Баталгаажуулж байна…':'Худалдан авалтыг баталгаажуулах'}</Button>
 </GuardedForm>;
}
