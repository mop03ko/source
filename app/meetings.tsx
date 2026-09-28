'use client';
import {useEffect,useRef,useState} from 'react';
import {Alert,Button,Card,Checkbox,Empty,Input,Modal,Pagination,Popconfirm,Segmented,Space,Tag,Typography} from 'antd';
import {useRemote} from '@/hooks/use-remote';
import {toast} from '@/components/ui/sonner';
import {playNotificationSound} from '@/lib/sound';
type Person={email:string;name:string;active?:boolean|number};
type Meeting={id:string;title:string;organizer:string;organizer_name:string;starts_at:string;ends_at:string;location:string;note:string;reminder_minutes:number;version:number;status:string;attendees:Person[]};
const time=(v:string)=>local(v).replace('T',' ');
const local=(v:string)=>new Date(Date.parse(v)+8*3600000).toISOString().slice(0,16);
async function send(body:unknown){const r=await fetch('/api/meetings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});const d=await r.json();if(!r.ok)throw Error(d.error||'Уулзалтыг хадгалж чадсангүй.');return d;}
export function MeetingReminders({sound,onOpen}:{sound:string;onOpen:()=>void}){
 const callback=useRef(onOpen);useEffect(()=>{callback.current=onOpen;},[onOpen]);
 const [disconnected,setDisconnected]=useState(false),shown=useRef(new Set<string>());
 useEffect(()=>{
  let stopped=false,busy=false;
  async function poll(){
   if(stopped||busy||document.visibilityState!=='visible')return;
   busy=true;
   try{
    const d=await send({action:'reminders'});
    for(const m of d.items as Meeting[]){
     if(stopped||document.visibilityState!=='visible')break;
     const key=`meeting-${m.id}-${m.version}`;
     if(!shown.current.has(key)){
      playNotificationSound(sound);
      toast.info(<span><strong>{m.title}</strong><br/>{time(m.starts_at)} · УБ{m.location&&' · '+m.location}</span>,{id:key,duration:15000,action:{label:'Уулзалтууд',onClick:()=>callback.current()}});
      shown.current.add(key);
      if(shown.current.size>200)shown.current.delete(shown.current.values().next().value!);
     }
     await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
     if(!stopped&&document.visibilityState==='visible')await send({action:'ack_reminder',id:m.id,version:m.version});
    }
    if(!stopped)setDisconnected(false);
   }catch{if(!stopped)setDisconnected(true);}finally{busy=false;}
  }
  void poll();const timer=setInterval(()=>void poll(),30000);const focus=()=>void poll();
  window.addEventListener('focus',focus);document.addEventListener('visibilitychange',focus);
  return()=>{stopped=true;clearInterval(timer);window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',focus);};
 },[sound]);
 return disconnected?<Alert type="warning" showIcon title="Уулзалтын сануулгын холболт тасарсан. Автоматаар дахин холбогдоно."/>:null;
}
export default function Meetings({email,members}:{email:string;members:Person[]}){
 const [status,setStatus]=useState('upcoming'),[page,setPage]=useState(1),[open,setOpen]=useState(false),[editing,setEditing]=useState<Meeting|null>(null),[detail,setDetail]=useState<Meeting|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[search,setSearch]=useState('');
 const [title,setTitle]=useState(''),[start,setStart]=useState(''),[end,setEnd]=useState(''),[location,setLocation]=useState(''),[note,setNote]=useState(''),[reminder,setReminder]=useState(15),[attendees,setAttendees]=useState<string[]>([]);
 const [now,setNow]=useState(()=>Date.now());
 const id=useRef(''),lock=useRef(false);const remote=useRemote<{items:Meeting[];count:number}>(`/api/meetings?status=${status}&page=${page}`);
 const retry=remote.retry;
 useEffect(()=>{const refresh=()=>{setNow(Date.now());if(document.visibilityState==='visible')retry();};const timer=setInterval(refresh,60000);window.addEventListener('focus',refresh);return()=>{clearInterval(timer);window.removeEventListener('focus',refresh);};},[retry]);
 function edit(m:Meeting|null){setEditing(m);id.current=m?.id||crypto.randomUUID();setTitle(m?.title||'');setStart(local(m?.starts_at||new Date(Date.now()+3600000).toISOString()));setEnd(local(m?.ends_at||new Date(Date.now()+7200000).toISOString()));setLocation(m?.location||'');setNote(m?.note||'');setReminder(m?.reminder_minutes??15);setAttendees(m?.attendees.map(p=>p.email).filter(v=>v!==email)||[]);setSearch('');setError('');setOpen(true);}
 async function mutate(body:unknown){if(lock.current)return false;lock.current=true;setBusy(true);setError('');try{await send(body);remote.retry();return true;}catch(e){setError((e as Error).message);return false;}finally{lock.current=false;setBusy(false);}}
 async function save(){if(!start||!end){setError('Эхлэх, дуусах цагийг оруулна уу.');return;}const data={title,starts_at:new Date(start+':00+08:00').toISOString(),ends_at:new Date(end+':00+08:00').toISOString(),location,note,reminder_minutes:reminder,attendees};if(await mutate({action:editing?'update':'create',id:id.current,...(editing?{version:editing.version}:{}),data})){setOpen(false);setStatus('upcoming');setPage(1);toast.success(editing?'Уулзалтыг шинэчиллээ.':'Уулзалт товлолоо.');}}
 return <Card id="meetings" title="Хурал, уулзалт" extra={<Button type="primary" onClick={()=>edit(null)}>Товлох</Button>} style={{marginBottom:20}}>
  <Space orientation="vertical" style={{width:'100%'}} size="middle">
   <Typography.Text type="secondary">Таны оролцох уулзалтууд · Улаанбаатарын цаг. CRM нээлттэй үед сануулна.</Typography.Text>
   <Segmented value={status} options={[{value:'upcoming',label:'Удахгүй'},{value:'past',label:'Өнгөрсөн'},{value:'cancelled',label:'Цуцалсан'}]} onChange={v=>{setStatus(v);setPage(1);}}/>
   {(error||remote.error)&&!open&&<Alert type="error" title={error||remote.error} action={<Button onClick={()=>remote.retry()}>Дахин ачаалах</Button>}/>}
   {remote.loading?<div role="status">Уулзалтууд ачаалж байна…</div>:remote.data?.items.length?<div>{remote.data.items.map(m=><div key={m.id} style={{padding:'16px 0',borderBottom:'1px solid #eee',overflowWrap:'anywhere'}}>
    <Space wrap><Typography.Text strong>{m.title}</Typography.Text>{m.status==='cancelled'?<Tag color="default">Цуцалсан</Tag>:Date.parse(m.starts_at)<=now&&Date.parse(m.ends_at)>now?<Tag color="green">Одоо үргэлжилж байна</Tag>:null}</Space>
    <div>{time(m.starts_at)} — {time(m.ends_at)} · УБ</div><Typography.Text type="secondary">{m.location||'Байршил оруулаагүй'} · {m.attendees.length} оролцогч</Typography.Text>
    <div><Space wrap><Button size="small" onClick={()=>setDetail(m)}>Дэлгэрэнгүй</Button>{m.organizer===email&&m.status==='scheduled'&&Date.parse(m.ends_at)>now&&<><Button size="small" disabled={busy} onClick={()=>edit(m)}>Засах</Button><Popconfirm title="Уулзалтыг цуцлах уу?" okText="Цуцлах" cancelText="Буцах" onConfirm={()=>mutate({action:'cancel',id:m.id,version:m.version})}><Button size="small" danger disabled={busy}>Цуцлах</Button></Popconfirm></>}</Space></div>
   </div>)}</div>:!remote.error&&<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Энэ жагсаалтад уулзалт алга"/>}
   {(remote.data?.count||0)>20&&<Pagination current={page} pageSize={20} total={remote.data?.count} onChange={setPage} showSizeChanger={false} size="small"/>}
  </Space>
  <Modal title={editing?'Уулзалт засах':'Хурал, уулзалт товлох'} open={open} okText="Хадгалах" cancelText="Болих" confirmLoading={busy} onOk={()=>void save()} onCancel={()=>{if(!busy)setOpen(false);}} okButtonProps={{disabled:!title.trim()}}>
   <Space orientation="vertical" style={{width:'100%'}} size="middle">
    <label>Уулзалтын нэр<Input value={title} maxLength={200} onChange={e=>setTitle(e.target.value)} disabled={busy}/></label>
    <label>Эхлэх · УБ<Input type="datetime-local" value={start} onChange={e=>setStart(e.target.value)} disabled={busy}/></label>
    <label>Дуусах · УБ<Input type="datetime-local" value={end} onChange={e=>setEnd(e.target.value)} disabled={busy}/></label>
    <label>Байршил / цахим уулзалтын холбоос<Input value={location} maxLength={500} onChange={e=>setLocation(e.target.value)} disabled={busy}/></label>
    <label>Хэлэлцэх зүйл<Input.TextArea value={note} maxLength={2000} onChange={e=>setNote(e.target.value)} disabled={busy} autoSize={{minRows:2,maxRows:5}}/></label>
    <label>Сануулах хугацаа<select aria-label="Сануулах хугацаа" value={reminder} onChange={e=>setReminder(Number(e.target.value))} disabled={busy} style={{display:'block',width:'100%',padding:8,border:'1px solid #ddd',borderRadius:6}}>{[0,5,15,30,60].map(v=><option key={v} value={v}>{v?`${v} минутын өмнө`:'Эхлэх үед'}</option>)}</select></label>
    <div><Typography.Text strong>Оролцогчид ({attendees.length+1})</Typography.Text><div><Typography.Text type="secondary">Та автоматаар оролцоно.</Typography.Text></div><Input placeholder="Ажилтан хайх" aria-label="Оролцогч хайх" value={search} onChange={e=>setSearch(e.target.value)}/><div style={{maxHeight:180,overflowY:'auto',paddingTop:8}}>{members.filter(p=>p.active&&p.email!==email&&(p.name+' '+p.email).toLowerCase().includes(search.toLowerCase())).map(p=><div key={p.email}><Checkbox checked={attendees.includes(p.email)} disabled={busy} onChange={e=>setAttendees(v=>e.target.checked?[...v,p.email]:v.filter(x=>x!==p.email))}>{p.name||p.email}</Checkbox></div>)}</div></div>
    <Typography.Text type="secondary">Сануулга CRM дотор гарна. Дуу нь таны мэдэгдлийн дууны тохиргоог дагана.</Typography.Text>
    {error&&<Alert type="error" title={error}/>}
   </Space>
  </Modal>
  <Modal title={detail?.title} open={!!detail} onCancel={()=>setDetail(null)} footer={<Button onClick={()=>setDetail(null)}>Хаах</Button>}><Space orientation="vertical" style={{width:'100%',overflowWrap:'anywhere'}}>{detail&&<><Typography.Text>{time(detail.starts_at)} — {time(detail.ends_at)} · УБ</Typography.Text><Typography.Text>Байршил: {/^https?:\/\//i.test(detail.location)?<a href={detail.location} target="_blank" rel="noopener noreferrer">{detail.location}</a>:detail.location||'—'}</Typography.Text><Typography.Text>Зохион байгуулагч: {detail.organizer_name||detail.organizer}</Typography.Text><Typography.Text>Оролцогчид: {detail.attendees.map(p=>p.name||p.email).join(', ')}</Typography.Text><Typography.Text>Сануулга: {detail.reminder_minutes?`${detail.reminder_minutes} минутын өмнө`:'Эхлэх үед'}</Typography.Text><Typography.Paragraph style={{whiteSpace:'pre-wrap'}}>{detail.note||'Хэлэлцэх зүйл оруулаагүй.'}</Typography.Paragraph></>}</Space></Modal>
 </Card>;
}
