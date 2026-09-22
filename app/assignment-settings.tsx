 'use client';
import {Alert,Button,Card,ConfigProvider,Empty,Form,Input,InputNumber,Pagination,Progress,Segmented,Select,Skeleton,Space,Spin,Statistic,Switch,Tag} from 'antd';
import {useEffect,useState} from 'react';
import {useRemote} from '@/hooks/use-remote';
import {useUnsavedChanges} from '@/components/draft-guard';
import {defaultAssignmentSettings,shiftAssignments,shiftOff,type AssignmentSettings,type Member} from '@/lib/crm';
import {toast} from '@/components/ui/sonner';
type Preview={day:string;since:string;generated_at:string;waiting:number;batch:number;eligible:number;assigned:number;staff:{email:string;name:string;active:boolean;assignments:string[];eligible:boolean;reason:string;today:number|null;planned:number}[]};
function AssignmentPreview({value,busy,onChange}:{value:AssignmentSettings;busy:boolean;onChange:(patch:Partial<AssignmentSettings>)=>void}){
 const key=JSON.stringify(value),[revision,setRevision]=useState(0),[state,setState]=useState<{key:string;data?:Preview;error?:string}>({key:''});
 const [query,setQuery]=useState(''),[filter,setFilter]=useState('all'),[page,setPage]=useState(1);
 useEffect(()=>{
  const controller=new AbortController();
  const timer=setTimeout(()=>{
   setState({key});
   void fetch('/api/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({preview_assignment:JSON.parse(key)}),signal:AbortSignal.any([controller.signal,AbortSignal.timeout(20000)])}).then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error||'Тооцоолж чадсангүй.');if(!controller.signal.aborted)setState({key,data});}).catch(error=>{if(!controller.signal.aborted)setState({key,error:error instanceof Error?error.message:'Тооцоолж чадсангүй.'});});
  },350);
  return()=>{clearTimeout(timer);controller.abort();};
 },[key,revision]);
 const current=state.key===key?state:undefined,data=current?.data;
 const people=(data?.staff||[]).filter(p=>(filter==='all'||(filter==='eligible'?p.eligible:!p.eligible))&&(p.name+' '+p.email).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
 const currentPage=Math.min(page,Math.max(1,Math.ceil(people.length/8))),max=Math.max(1,...(data?.staff||[]).map(p=>(p.today||0)+p.planned));
 return <Card className="assignment-preview" title="Хуваарилалтын урьдчилсан тооцоо" extra={<Button size="small" aria-label="Хуваарилалтын тооцоо шинэчлэх" onClick={()=>{setState({key});setRevision(v=>v+1);}}>Шинэчлэх</Button>}>
 <p className="muted">Сонголтоо өөрчлөхөд тооцоо шинэчлэгдэнэ. Хүсэлт оноохгүй, тохиргоо хадгалахгүй.</p>
 {current?.error?<Alert type="error" showIcon title={current.error}/>:!data?<div role="status" aria-label="Хуваарилалт тооцоолж байна"><Skeleton active paragraph={{rows:6}}/></div>:<>
 <div className="assignment-metrics" aria-live="polite"><Statistic title="Хамрагдах ажилтан" value={data.eligible}/><Statistic title="Хүлээгдсэн хүсэлт" value={data.waiting}/><Statistic title="Энэ багцаар оноох" value={data.assigned}/></div>
 {!value.enabled?<Alert type="warning" showIcon title="Хуваарилалт унтраалттай" description="Асаах горим сонгож боломжит хуваарилалтыг үзээрэй."/>:!data.eligible?<Alert type="warning" showIcon title="Хамрагдах ажилтан алга" description="Өнөөдрийн хуваарь, томилгоо болон түр алгассан ажилтнуудаа шалгана уу."/>:!data.waiting?<Alert type="success" showIcon title="Хуваарилах хүсэлт алга" description="Сонгосон хугацаанд тохирох хариуцагчгүй нээлттэй хүсэлт байхгүй."/>:<Alert type="info" showIcon title={`${data.assigned} хүсэлтийг ${data.eligible} ажилтанд тэнцвэржүүлнэ`} description={data.waiting>200?`${data.waiting-200} хүсэлт дараагийн багцад үлдэнэ.`:'Өнөөдөр үүссэн хүсэлтийн тоогоор ачааллыг тэнцвэржүүлнэ.'}/>}
 <p className="muted">{data.day} · УБ · Сүүлийн {value.days} хоног · Хаагдсан, холбоо барихгүй хүсэлтийг хассан. Sheets-ийн ирээдүйд ирэх хүсэлт энэ тооцоонд орохгүй.</p>
 <div className="assignment-staff-tools"><Input.Search aria-label="Хуваарилах ажилтан хайх" placeholder="Ажилтны нэр, и-мэйл…" value={query} onChange={e=>{setQuery(e.target.value);setPage(1);}} allowClear/><Segmented aria-label="Хамрагдах ажилтны шүүлтүүр" value={filter} onChange={v=>{setFilter(v);setPage(1);}} options={[{value:'all',label:'Бүгд'},{value:'eligible',label:'Хамрагдах'},{value:'excluded',label:'Алгасах'}]}/></div>
 {!people.length&&<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Тохирох ажилтан алга"/>}
 <div className="assignment-staff-list">{people.slice((currentPage-1)*8,currentPage*8).map(person=><article key={person.email} className="assignment-person" data-email={person.email}><div className="assignment-person-heading"><div><strong>{person.name}</strong><small>{person.assignments.join(', ')||'Хуваарьгүй'}</small></div><Tag color={person.eligible?'green':'default'}>{person.reason}</Tag></div>{person.eligible&&<><div className="assignment-person-numbers"><span>Өнөөдөр үүссэн: {person.today}</span><strong>Нэмж оноох: +{person.planned}</strong></div><Progress aria-label={`${person.name}: одоо ${person.today}, нэмж ${person.planned} хүсэлт`} percent={((person.today||0)+person.planned)/max*100} success={{percent:(person.today||0)/max*100,strokeColor:'#697b96'}} strokeColor="#a94706" showInfo={false}/></>}<Button size="small" disabled={busy||!value.enabled} aria-label={person.name+(value.excluded_emails.includes(person.email)?' ажилтныг буцааж хамруулах':' ажилтныг түр алгасах')} onClick={()=>onChange({excluded_emails:value.excluded_emails.includes(person.email)?value.excluded_emails.filter(email=>email!==person.email):[...value.excluded_emails,person.email]})}>{value.excluded_emails.includes(person.email)?'Буцааж хамруулах':'Түр алгасах'}</Button></article>)}</div>
 {people.length>8&&<Pagination size="small" current={currentPage} pageSize={8} total={people.length} showSizeChanger={false} onChange={setPage}/>}
 <small className="muted">Бодит хуваарилалт хийх хүртэл хүсэлт, хуваарь өөрчлөгдөж болно. Тооцсон цаг: {new Date(data.generated_at).toLocaleTimeString('mn-MN',{timeZone:'Asia/Ulaanbaatar',hour:'2-digit',minute:'2-digit'})} · УБ</small>
 </>}
 </Card>;
}
function initialSettings(raw?:string):AssignmentSettings{try{return raw?{...defaultAssignmentSettings,...JSON.parse(raw)}:{...defaultAssignmentSettings};}catch{return {...defaultAssignmentSettings,enabled:false};}}
type SavedSettings={notification_sound:string;auto_assignment?:string};
function Editor({initial,members,onSaved}:{initial:AssignmentSettings;members:Member[];onSaved:(s:SavedSettings)=>void}){
 const [saved,setSaved]=useState(initial),[value,setValue]=useState(initial),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const dirty=JSON.stringify(saved)!==JSON.stringify(value);useUnsavedChanges(dirty);
 const update=(patch:Partial<AssignmentSettings>)=>setValue(v=>({...v,...patch}));
 const save=async()=>{setBusy(true);setError('');try{const response=await fetch('/api/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({auto_assignment:value}),signal:AbortSignal.timeout(20000)});const result=await response.json();if(!response.ok)throw new Error(result.error||'Хадгалж чадсангүй.');const next=initialSettings(result.auto_assignment);setSaved(next);setValue(next);onSaved(result);toast.success('Хуваарилалтын тохиргоо хадгалагдлаа.');}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 return <ConfigProvider theme={{token:{colorTextPlaceholder:'#65566f'}}}><Card className="assignment-settings" title="Зээлийн хүсэлтийн ухаалаг хуваарилалт" extra={<Tag>{saved.enabled?'Асаалттай':'Унтраалттай'}</Tag>}>
 <p>Өнөөдөр хамгийн бага хүсэлт авсан, ажлын хуваарьтай идэвхтэй борлуулалтын ажилтанд тэнцвэртэй онооно. Оператор болон бусад role-д автоматаар оноохгүй.</p>
 {error&&<Alert type="error" showIcon title={error}/>}
 <div className="assignment-workspace"><Form layout="vertical" onFinish={()=>void save()} disabled={busy}>
 <Form.Item label="Ажиллах горим"><Segmented block aria-label="Хуваарилалтын горим" disabled={busy} value={!value.enabled?'off':value.automatic?'auto':'manual'} options={[{value:'off',label:'Унтраах'},{value:'manual',label:'Товчоор'},{value:'auto',label:'Автомат'}]} onChange={mode=>update(mode==='off'?{enabled:false}:{enabled:true,automatic:mode==='auto'})}/><p className="muted">Товчоор: Борлуулалт цэснээс эхлүүлнэ. Автомат: Sheets-ийн шинэ хүсэлтийг мөн онооно.</p></Form.Item>
 <Form.Item label="Ухаалаг хуваарилалтыг идэвхжүүлэх"><Switch aria-label="Ухаалаг хуваарилалтыг идэвхжүүлэх" checked={value.enabled} onChange={enabled=>update({enabled})}/></Form.Item>
 <Alert type={value.enabled?'info':'warning'} showIcon title={value.enabled?'Тохиргоо хадгалсны дараа шинэ хуваарилалтад үйлчилнэ.':'Автомат болон «Ухаалгаар хуваарилах» үйлдэл зогсоно.'} description="Өмнө нь оноосон хүсэлтийг буцаахгүй. Ажилтан сонгож гараар оноох болон Sheet дээр нэрээр оноосон хариуцагчийг тулгах ажиллагаа хэвээр байна."/>
 <Form.Item label="Sheets-ээс ирсэн хариуцагчгүй шинэ хүсэлтийг автоматаар хуваарилах" style={{marginTop:20}}><Switch aria-label="Sheets автомат хуваарилалт" disabled={!value.enabled||busy} checked={value.automatic} onChange={automatic=>update({automatic})}/></Form.Item>
 <Form.Item label="Хүлээгдсэн хүсэлтийг хуваарилах хугацаа (хоног)" help="Борлуулалт дахь «Ухаалгаар хуваарилах» товч сүүлийн энэ хугацааны хүсэлтийг авна. Нэг удаад 200 хүртэл. Хаагдсан болон холбоо барихгүй хүсэлтийг алгасана."><Space wrap>{[1,3,7,14,30].map(days=><Button key={days} disabled={!value.enabled||busy} type={value.days===days?'primary':'default'} aria-pressed={value.days===days} onClick={()=>update({days})}>{days} хоног</Button>)}<InputNumber aria-label="Хуваарилах хүсэлтийн хоног" min={1} max={30} precision={0} value={value.days} disabled={!value.enabled||busy} onChange={days=>{if(days!==null)update({days});}}/></Space></Form.Item>
 <Form.Item label="Хуваарилалтад хамруулах ажлын томилгоо" help="Хоосон бол бүх ажлын томилгоо. Амралт, чөлөө болон хуваарьгүй ажилтан үргэлж хасагдана."><Select mode="multiple" aria-label="Хамруулах ажлын томилгоо" value={value.assignments} disabled={!value.enabled||busy} allowClear placeholder="Бүх ажлын томилгоо" options={shiftAssignments.filter(a=>!shiftOff.includes(a)).map(value=>({value,label:value}))} onChange={assignments=>update({assignments})}/></Form.Item>
 <Form.Item label="Түр алгасах борлуулалтын ажилтан" help="Сонгосон ажилтны өмнөх хүсэлтүүд хэвээр; шинэ ухаалаг хуваарилалтаас хасна."><Select mode="multiple" aria-label="Түр алгасах ажилтан" showSearch={{optionFilterProp:'label'}} value={value.excluded_emails} disabled={!value.enabled||busy} allowClear placeholder="Алгасах ажилтан сонгох" options={members.filter(m=>m.role==='agent'||value.excluded_emails.includes(m.email)).map(m=>({value:m.email,label:m.name+' · '+m.email+(!m.active?' (идэвхгүй)':'')}))} onChange={excluded_emails=>update({excluded_emails})}/></Form.Item>
 <div className="assignment-savebar"><div role="status">{dirty?<Tag color="orange">Хадгалаагүй өөрчлөлттэй</Tag>:<Tag>Тохиргоо хадгалагдсан</Tag>}<small>Урьдчилсан тооцоо нь таны одоогийн сонголтыг ашиглана.</small></div><Space wrap><Button type="primary" htmlType="submit" loading={busy} disabled={!dirty}>Хуваарилалтын тохиргоо хадгалах</Button><Button disabled={!dirty||busy} onClick={()=>{setValue(saved);setError('');}}>Өөрчлөлт цуцлах</Button></Space></div>
 </Form><AssignmentPreview value={value} busy={busy} onChange={update}/></div></Card></ConfigProvider>;
}
export default function AssignmentSettingsPanel({members,onSaved}:{members:Member[];onSaved:(s:SavedSettings)=>void}){
 const state=useRemote<{auto_assignment?:string}>('/api/settings');
 if(state.loading)return <Spin aria-label="Хуваарилалтын тохиргоо ачаалж байна"/>;
 if(state.error)return <Alert type="error" title={state.error} action={<Button onClick={state.retry}>Дахин оролдох</Button>}/>;
 return state.data?<Editor initial={initialSettings(state.data.auto_assignment)} members={members} onSaved={onSaved}/>:null;
}
