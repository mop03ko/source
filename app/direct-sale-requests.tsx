'use client';
import {useState} from 'react';
import {Alert,Button,Card,Descriptions,Input,Modal,Segmented,Space,Table,Tag} from 'antd';
import {useRemote} from '@/hooks/use-remote';
import {canManageSchedule,dateLabel,type Member} from '@/lib/crm';
import {cash} from './inventory-forms';
type RequestRow={id:string;serialWarnings:string[];requester:string;requester_name:string;status:string;created_at:string;reviewed_by:string;reviewed_at:string;review_note:string;payload:{item_name:string;item_code:string;warehouse_name:string;qty:number;unit_price:number;customer_name:string;customer_phone:string;platform:string;bill_number:string;note:string;units:{serial:string;barcode:string}[]}};
export default function DirectSaleRequests({me,revision,onChange}:{me:Member;revision:number;onChange:()=>void}){
 const [status,setStatus]=useState('pending'),[page,setPage]=useState(1),[selected,setSelected]=useState<RequestRow|null>(null),[note,setNote]=useState(''),[busy,setBusy]=useState(''),[error,setError]=useState('');
 const list=useRemote<{items:RequestRow[];count:number}>(`/api/inventory?view=sale_requests&status=${status}&page=${page}&revision=${revision}`);
 const manage=canManageSchedule(me.role);
 async function review(action:'approve_sale'|'reject_sale'){
  if(!selected)return;setBusy(action);setError('');
  try{const r=await fetch('/api/inventory',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,id:selected.id,data:{note},request_id:crypto.randomUUID()})});const data=await r.json();if(!r.ok)throw Error(data.error||'Хадгалж чадсангүй.');setSelected(null);list.retry();onChange();}catch(e){setError((e as Error).message);}finally{setBusy('');}
 }
 return <Card title={manage?'Шууд борлуулалтын хүсэлтүүд':'Миний борлуулалтын хүсэлтүүд'} size="small" style={{marginBottom:20}}>
  <Space orientation="vertical" style={{width:'100%'}} size="middle">
   <Alert type="info" showIcon title="Батлагдсаны дараа борлуулалт бүртгэгдэж, үлдэгдэл хасагдана." description="Хүлээгдэж буй хүсэлт бараа нөөцлөхгүй. Батлах үед агуулахын үлдэгдлийг дахин шалгана."/>
   <Segmented value={status} options={[{value:'pending',label:'Хүлээгдэж буй'},{value:'approved',label:'Баталсан'},{value:'rejected',label:'Татгалзсан'}]} onChange={v=>{setStatus(v);setPage(1);}}/>
   {list.error&&<Alert type="error" title={list.error} action={<Button onClick={list.retry}>Дахин оролдох</Button>}/>}
   <Table<RequestRow> rowKey="id" size="small" loading={list.loading} dataSource={list.data?.items||[]} scroll={{x:700}} pagination={{current:page,pageSize:25,total:list.data?.count||0,onChange:setPage,showSizeChanger:false}} columns={[
    {title:'Илгээсэн',dataIndex:'created_at',render:dateLabel},{title:'Бараа',render:(_,r)=><>{r.payload.item_name}<br/><small>{r.payload.item_code}</small></>},{title:'Ажилтан',render:(_,r)=>r.requester_name||r.requester},{title:'Тоо',render:(_,r)=>r.payload.qty},{title:'Дүн',render:(_,r)=>cash(r.payload.qty*r.payload.unit_price)},{title:'Үйлдэл',render:(_,r)=><Button onClick={()=>{setSelected(r);setNote('');setError('');}}>{manage&&r.status==='pending'?'Хянах':'Дэлгэрэнгүй'}</Button>}
   ]}/>
  </Space>
  <Modal open={!!selected} title="Борлуулалтын хүсэлт" width={720} onCancel={()=>{if(!busy)setSelected(null);}} footer={selected?.status==='pending'&&manage?<Space wrap><Button disabled={!!busy||!note.trim()} danger loading={busy==='reject_sale'} onClick={()=>void review('reject_sale')}>Татгалзах</Button><Button type="primary" disabled={!!busy} loading={busy==='approve_sale'} onClick={()=>void review('approve_sale')}>Баталж борлуулалт бүртгэх</Button></Space>:null}>
   {selected&&<Space orientation="vertical" size="middle" style={{width:'100%'}}>
    {!!selected.serialWarnings?.length&&<Alert type="warning" showIcon title="Өмнө нь гарсан дугаар байна" description={selected.serialWarnings.join(', ')}/>}
    <Tag>{({pending:'Шийдвэр хүлээж байна',approved:'Баталсан',rejected:'Татгалзсан'})[selected.status]}</Tag>
    <Descriptions bordered column={1} size="small" items={[
     {key:'item',label:'Бараа',children:selected.payload.item_name+' · '+selected.payload.item_code},{key:'warehouse',label:'Агуулах',children:selected.payload.warehouse_name},{key:'seller',label:'Илгээсэн',children:selected.requester_name||selected.requester},{key:'qty',label:'Тоо / нэгжийн үнэ',children:`${selected.payload.qty} ш · ${cash(selected.payload.unit_price)}`},{key:'total',label:'Нийт',children:cash(selected.payload.qty*selected.payload.unit_price)},{key:'customer',label:'Харилцагч',children:[selected.payload.customer_name,selected.payload.customer_phone].filter(Boolean).join(' · ')||'—'},{key:'payment',label:'Төлбөр / баримт',children:[selected.payload.platform||'Бэлэн',selected.payload.bill_number].filter(Boolean).join(' · ')},{key:'units',label:'IMEI / баркод',children:(selected.payload.units||[]).map(u=>u.serial||u.barcode).join(', ')||'—'},{key:'note',label:'Тэмдэглэл',children:selected.payload.note||'—'},...(selected.status!=='pending'?[{key:'review',label:'Шийдвэр',children:`${selected.reviewed_by} · ${dateLabel(selected.reviewed_at)} · ${selected.review_note||''}`}]:[])
    ]}/>
    {selected.status==='pending'&&manage&&<Input.TextArea aria-label="Татгалзах шалтгаан" placeholder="Татгалзах бол шалтгаанаа бичнэ үү" maxLength={2000} value={note} onChange={e=>setNote(e.target.value)} disabled={!!busy}/>}
    {error&&<Alert type="error" showIcon title={error}/>}
   </Space>}
  </Modal>
 </Card>;
}
