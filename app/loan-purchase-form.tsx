'use client';
import {useState} from 'react';
import {Alert,Checkbox,Radio,InputNumber} from 'antd';
import {ItemPicker,cash,type Item,type Options,Branch} from './inventory-forms';
import {GuardedForm} from '@/components/draft-guard';
import {Field} from '@/components/form-field';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {SelectControl,TextareaControl} from '@/components/ui/form-controls';
type Line={key:string;item:Item|null;qty:number;price:number;warehouse:string;kind:'gift'|'main'};
export default function LoanPurchaseForm({options,busy,onSave}:{options:Options;busy:boolean;onSave:(data:unknown)=>Promise<void>}){
 const empty=(kind:Line['kind']):Line=>({key:crypto.randomUUID(),item:null,qty:1,price:0,warehouse:'',kind});
 const [main,setMain]=useState<Line>({key:'main',item:null,qty:1,price:0,warehouse:'',kind:'main'}),[extras,setExtras]=useState<Line[]>([]);
 const [hasGift,setGift]=useState(false),[hasAccessories,setAccessories]=useState(false),[method,setMethod]=useState<'delivery'|'pickup'>('pickup'),[error,setError]=useState('');
 const change=(key:string,value:Partial<Line>)=>setExtras(rows=>rows.map(r=>r.key===key?{...r,...value}:r));
 const active=hasGift?extras:[];
 const total=main.qty*main.price;
 return <GuardedForm className="form-stack" onSubmit={async e=>{e.preventDefault();setError('');if(busy)return;if(!main.item||active.some(l=>!l.item)){setError('Үндсэн бараа болон бэлгийн сонголтоо гүйцээнэ үү.');return;}const f=new FormData(e.currentTarget);try{await onSave({item_id:main.item.id,warehouse_id:main.warehouse,qty:main.qty,unit_price:main.price,bill_number:f.get('contract')||'',platform:f.get('platform')||'',note:f.get('note')||'',units:main.qty===1&&(main.item.imei||main.item.barcode)?[{serial:main.item.imei||'',barcode:main.item.barcode||'',note:''}]:[],fulfillment:{method,has_accessories:hasAccessories,address:f.get('address')||'',gift_name:hasGift?f.get('gift_name')||'':'',extras:active.map(l=>({item_id:l.item!.id,warehouse_id:l.warehouse,qty:l.qty,unit_price:0,kind:'gift'}))}});}catch(err){setError((err as Error).message);}}}>
  <ItemPicker inStockOnly value={main.item} warehouse="" onChange={item=>setMain({...main,item,warehouse:'',price:item?.sale_price||0})} label="Худалдан авсан бараа *"/>
  <div className="form-grid"><Field label="Тоо ширхэг *"><InputNumber aria-label="Үндсэн барааны тоо" min={1} max={1000000} precision={0} value={main.qty} onChange={v=>setMain({...main,qty:v||1,warehouse:''})}/></Field><Field label="Зээлийн нэгж үнэ (₮) *"><InputNumber aria-label="Зээлийн нэгж үнэ" min={0} max={1000000000} precision={2} value={main.price} onChange={v=>setMain({...main,price:v||0})}/></Field></div>
  <Branch line={main} onChange={warehouse=>setMain({...main,warehouse})}/>
  <Field label="Зээлийн гэрээний дугаар"><Input name="contract" maxLength={120}/></Field>
  <Field label="Зээлийн суваг"><SelectControl name="platform"><option value="">Сонгох</option>{options.channels.map(c=><option key={c.name}>{c.name}</option>)}</SelectControl></Field>
  <Checkbox checked={hasGift} onChange={e=>{setGift(e.target.checked);if(e.target.checked&&!extras.some(l=>l.kind==='gift'))setExtras([...extras,empty('gift')]);}}>Бэлэгтэй</Checkbox>
  {hasGift&&<Field label="Бэлгийн нэр / урамшуулал"><Input name="gift_name" maxLength={120} placeholder="Жишээ: Утасны дагалдах бэлэг"/></Field>}
  <Checkbox checked={hasAccessories} onChange={e=>setAccessories(e.target.checked)}>Дагалдах бараатай</Checkbox>
  {active.map(line=><section key={line.key} className="next-box"><div className="form-stack" style={{width:'100%'}}><strong>Бэлэг</strong><ItemPicker inStockOnly value={line.item} warehouse="" onChange={item=>change(line.key,{item,warehouse:'',price:0})} label="Барааны код, нэрээр хайж сонгох *"/><Field label="Тоо ширхэг"><InputNumber min={1} max={1000000} precision={0} value={line.qty} onChange={v=>change(line.key,{qty:v||1,warehouse:''})}/></Field><Branch line={line} onChange={warehouse=>change(line.key,{warehouse})}/><Button type="button" variant="ghost" onClick={()=>{const rest=extras.filter(l=>l.key!==line.key);setExtras(rest);if(!rest.length)setGift(false);}}>Барааг хасах</Button></div></section>)}
  <div className="row">{hasGift&&<Button type="button" variant="outline" onClick={()=>setExtras([...extras,empty('gift')])}>Бэлэг нэмэх</Button>}</div>
  <Field label="Бараагаа авах хэлбэр *"><Radio.Group value={method} onChange={e=>setMethod(e.target.value)} options={[{value:'pickup',label:'Салбараас авах'},{value:'delivery',label:'Хүргэлт'}]}/></Field>
  {method==='delivery'&&<><Field label="Хүргэлтийн хаяг *"><TextareaControl name="address" required maxLength={500} rows={3}/></Field><p className="form-help">Өнөөдрийн хүргэлтийн хуваарьтай ажилтнаас хамгийн цөөн хүргэлттэйд автоматаар онооно.</p></>}
  <Field label="Тайлбар"><TextareaControl name="note" maxLength={2000}/></Field><strong>Нийт төлбөр: {cash(total)}</strong>
  {error&&<Alert type="error" title={error} showIcon/>}<Button type="submit" disabled={busy||!main.item}>{busy?'Баталгаажуулж байна…':'Худалдан авалтыг баталгаажуулах'}</Button>
 </GuardedForm>;
}
