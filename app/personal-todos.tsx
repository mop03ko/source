'use client';
import {useRef,useState} from 'react';
import {Alert,Button,Card,Checkbox,Empty,Input,Modal,Pagination,Popconfirm,Progress,Segmented,Space,Typography} from 'antd';
import {useRemote} from '@/hooks/use-remote';
type Todo={id:string;title:string;done:number;version:number};
type Data={items:Todo[];count:number;summary:{total:number;open:number;done:number}};
export default function PersonalTodos(){
 const [status,setStatus]=useState('open'),[page,setPage]=useState(1),[title,setTitle]=useState(''),[editing,setEditing]=useState<Todo|null>(null),[editTitle,setEditTitle]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const pending=useRef<{id:string;title:string}|null>(null),lock=useRef(false);
 const remote=useRemote<Data>(`/api/todos?status=${status}&page=${page}`);
 const summary=remote.data?.summary;
 async function mutate(body:unknown){if(lock.current)return false;lock.current=true;setBusy(true);setError('');try{
  const r=await fetch('/api/todos',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});const d=await r.json();if(!r.ok)throw Error(d.error||'Хадгалж чадсангүй.');
  if(page>1&&remote.data?.items.length===1)setPage(page-1);else remote.retry();return true;
 }catch(e){setError((e as Error).message);remote.retry();return false;}finally{lock.current=false;setBusy(false);}}
 async function add(){const value=title.trim();if(!value)return;if(!pending.current||pending.current.title!==value)pending.current={id:crypto.randomUUID(),title:value};if(await mutate({action:'create',...pending.current})){pending.current=null;setTitle('');setPage(1);setStatus('open');}}
 return <Card id="personal-todos" title="Миний хийх ажлууд" extra={<Typography.Text type="secondary">Зөвхөн надад</Typography.Text>} style={{marginBottom:20}}>
  <Space orientation="vertical" size="middle" style={{width:'100%'}}>
   <form onSubmit={e=>{e.preventDefault();void add();}} style={{display:'flex',gap:8,width:'100%'}}><Input aria-label="Шинэ хийх ажил" placeholder="Хийх ажлаа бичнэ үү…" maxLength={300} value={title} disabled={busy} onChange={e=>setTitle(e.target.value)}/><Button type="primary" htmlType="submit" loading={busy} disabled={!title.trim()}>Нэмэх</Button></form>
   <Segmented aria-label="Ажлын төлөв" value={status} disabled={busy} options={[{value:'open',label:'Хийх'},{value:'done',label:'Дууссан'},{value:'all',label:'Бүгд'}]} onChange={v=>{setStatus(v);setPage(1);}}/>
   {summary&&<div><Typography.Text>{summary.open} хийх · {summary.done} дууссан · {summary.total} нийт</Typography.Text><Progress aria-label="Ажлын гүйцэтгэл" percent={summary.total?Math.round(summary.done/summary.total*100):0} size="small"/></div>}
   {(error||remote.error)&&<Alert type="error" showIcon title={error||remote.error} action={<Button onClick={()=>{setError('');remote.retry();}}>Шинэчлэх</Button>}/>}
   {remote.loading?<div role="status">Ажлууд ачаалж байна…</div>:remote.data?.items.length?<ul style={{listStyle:'none',padding:0,margin:0}}>{remote.data.items.map(t=><li key={t.id} style={{display:'flex',gap:12,alignItems:'flex-start',padding:'12px 0',borderBottom:'1px solid #f0f0f0'}}>
    <Checkbox aria-label={t.title+' — дууссан'} checked={!!t.done} disabled={busy} onChange={e=>void mutate({action:'update',id:t.id,version:t.version,title:t.title,done:e.target.checked})}/>
    <div style={{flex:1,minWidth:0,overflowWrap:'anywhere'}}><Typography.Text delete={!!t.done}>{t.title}</Typography.Text><Space wrap><Button type="link" size="small" disabled={busy} onClick={()=>{setEditing(t);setEditTitle(t.title);}}>Засах</Button><Popconfirm title="Энэ ажлыг устгах уу?" okText="Устгах" cancelText="Болих" onConfirm={()=>mutate({action:'delete',id:t.id,version:t.version})}><Button type="link" danger size="small" disabled={busy}>Устгах</Button></Popconfirm></Space></div>
   </li>)}</ul>:!remote.error&&<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={status==='done'?'Дууссан ажил алга':'Энэ жагсаалтад ажил алга'}/>}
   {!!remote.data?.count&&remote.data.count>20&&<Pagination current={page} total={remote.data.count} pageSize={20} showSizeChanger={false} onChange={setPage} disabled={busy} size="small"/>}
  </Space>
  <Modal title="Хийх ажил засах" open={!!editing} confirmLoading={busy} okText="Хадгалах" cancelText="Болих" okButtonProps={{disabled:!editTitle.trim()}} onCancel={()=>{if(!busy)setEditing(null);}} onOk={async()=>{if(editing&&await mutate({action:'update',id:editing.id,version:editing.version,title:editTitle,done:!!editing.done}))setEditing(null);}}><Input.TextArea aria-label="Ажлын нэр засах" maxLength={300} value={editTitle} onChange={e=>setEditTitle(e.target.value)} autoSize={{minRows:2,maxRows:5}} disabled={busy}/>{error&&<Alert type="error" title={error}/>}</Modal>
 </Card>;
}
