'use client';
import {Alert,Button,Checkbox,Modal,Table} from 'antd';
import {useState} from 'react';
import {Input} from '@/components/ui/input';
import {SelectControl} from '@/components/ui/form-controls';
import {useDraftGuard,useUnsavedChanges} from '@/components/draft-guard';
import {productCategories} from '@/lib/product-categories';
import type {Post} from './inventory-forms';
type Fields={category:string;brand:string;supplier:string};
type Preview={preview_hash:string;count:number;changes:{id:string;code:string;name:string;before:Fields;after:Fields}[]};
export default function InventoryBulkEdit({scope,ids,post,busy,onClose,onDone}:{scope:'products'|'items';ids:string[];post:Post;busy:boolean;onClose:()=>void;onDone:(updated:number)=>void}){
 const [enabled,setEnabled]=useState<string[]>([]),[fields,setFields]=useState<Fields>({category:'',brand:'',supplier:''}),[preview,setPreview]=useState<Preview|null>(null),[error,setError]=useState('');
 const allow=useDraftGuard();useUnsavedChanges(enabled.length>0);
 const patch=Object.fromEntries(enabled.map(key=>[key,fields[key as keyof Fields]]));
 const submit=async()=>{setError('');try{if(preview){const result=await post('bulk_update_items',{scope,ids,patch,preview_hash:preview.preview_hash});onDone(Number(result.updated));}else{setPreview(await post('preview_bulk_items',{scope,ids,patch}) as unknown as Preview);}}catch(e){setError((e as Error).message);setPreview(null);}};
 const describe=(value:Fields)=><div className="inventory-bulk-values"><span>Ангилал: {value.category||'Ангилаагүй'}</span><span>Брэнд: {value.brand||'Тодорхойгүй'}</span><span>Нийлүүлэгч: {value.supplier||'Тодорхойгүй'}</span></div>;
 return <Modal open title="Сонгосон барааг бөөнөөр засах" width={920} className="inventory-bulk-modal" onCancel={()=>{if(!busy&&allow())onClose();}} maskClosable={!busy} keyboard={!busy} onOk={submit} confirmLoading={busy} okButtonProps={{disabled:!enabled.length}} cancelButtonProps={{disabled:busy}} okText={preview?preview.count+' дугаарын өөрчлөлтийг хадгалах':'Өөрчлөлт хянах'} cancelText="Цуцлах">
  <p>{ids.length} {scope==='products'?'бүтээгдэхүүн сонгосон. Бүтээгдэхүүн тус бүрийн бүх дугаарын бүртгэлд үйлчилнэ.':'дугаарын бүртгэл сонгосон.'}</p>
  <Alert type="info" showIcon title="Зөвхөн сонгосон талбарууд өөрчлөгдөнө. Брэнд өөрчлөхөд бүтээгдэхүүний нэгтгэл шинэчлэгдэнэ."/>
  {error&&<Alert type="error" showIcon title={error}/>}
  {!preview?<div className="inventory-bulk-fields">{(['category','brand','supplier'] as const).map(key=><div key={key}><Checkbox checked={enabled.includes(key)} onChange={e=>setEnabled(e.target.checked?[...enabled,key]:enabled.filter(k=>k!==key))}>{({category:'Ангилал',brand:'Брэнд',supplier:'Нийлүүлэгч'})[key]} өөрчлөх</Checkbox>{enabled.includes(key)&&(key==='category'?<SelectControl aria-label="Бөөн засварын ангилал" value={fields.category} onChange={e=>setFields({...fields,category:e.target.value})}><option value="">Ангилаагүй</option>{productCategories.map(c=><option key={c}>{c}</option>)}</SelectControl>:<Input aria-label={key==='brand'?'Бөөн засварын брэнд':'Бөөн засварын нийлүүлэгч'} value={fields[key]} maxLength={120} onChange={e=>setFields({...fields,[key]:e.target.value})} placeholder="Хоосон хадгалбал одоогийн утгыг арилгана"/>)}</div>)}</div>:<><p><strong>{preview.count} дугаарын бүртгэлд хийх өөрчлөлт</strong></p><Button onClick={()=>setPreview(null)} disabled={busy}>Талбарууд засах</Button><Table size="small" rowKey="id" dataSource={preview.changes} pagination={{pageSize:10,showSizeChanger:false}} scroll={{x:650}} columns={[{title:'Бараа / код',key:'item',render:(_,row)=><>{row.name}<small>{row.code}</small></>},{title:'Өмнө',key:'before',render:(_,row)=>describe(row.before)},{title:'Дараа',key:'after',render:(_,row)=>describe(row.after)}]}/></>}
 </Modal>;
}
