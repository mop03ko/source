 'use client';
import {Alert,Button,Card,Form,InputNumber,Select,Space,Spin,Switch,Tag} from 'antd';
import {useState} from 'react';
import {useRemote} from '@/hooks/use-remote';
import {useUnsavedChanges} from '@/components/draft-guard';
import {defaultAssignmentSettings,shiftAssignments,shiftOff,type AssignmentSettings,type Member} from '@/lib/crm';
import {toast} from '@/components/ui/sonner';
function initialSettings(raw?:string):AssignmentSettings{try{return raw?{...defaultAssignmentSettings,...JSON.parse(raw)}:{...defaultAssignmentSettings};}catch{return {...defaultAssignmentSettings,enabled:false};}}
type SavedSettings={notification_sound:string;auto_assignment?:string};
function Editor({initial,members,onSaved}:{initial:AssignmentSettings;members:Member[];onSaved:(s:SavedSettings)=>void}){
 const [saved,setSaved]=useState(initial),[value,setValue]=useState(initial),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const dirty=JSON.stringify(saved)!==JSON.stringify(value);useUnsavedChanges(dirty);
 const update=(patch:Partial<AssignmentSettings>)=>setValue(v=>({...v,...patch}));
 const save=async()=>{setBusy(true);setError('');try{const response=await fetch('/api/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({auto_assignment:value}),signal:AbortSignal.timeout(20000)});const result=await response.json();if(!response.ok)throw new Error(result.error||'Хадгалж чадсангүй.');const next=initialSettings(result.auto_assignment);setSaved(next);setValue(next);onSaved(result);toast.success('Хуваарилалтын тохиргоо хадгалагдлаа.');}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 return <Card title="Зээлийн хүсэлтийн ухаалаг хуваарилалт" extra={<Tag>{saved.enabled?'Асаалттай':'Унтраалттай'}</Tag>}>
 <p>Өнөөдөр хамгийн бага хүсэлт авсан, ажлын хуваарьтай идэвхтэй борлуулалтын ажилтанд тэнцвэртэй онооно. Оператор болон бусад role-д автоматаар оноохгүй.</p>
 {error&&<Alert type="error" showIcon title={error}/>}
 <Form layout="vertical" onFinish={()=>void save()} disabled={busy}>
 <Form.Item label="Ухаалаг хуваарилалтыг идэвхжүүлэх"><Switch aria-label="Ухаалаг хуваарилалтыг идэвхжүүлэх" checked={value.enabled} onChange={enabled=>update({enabled})}/></Form.Item>
 <Alert type={value.enabled?'info':'warning'} showIcon title={value.enabled?'Тохиргоо хадгалсны дараа шинэ хуваарилалтад үйлчилнэ.':'Автомат болон «Ухаалгаар хуваарилах» үйлдэл зогсоно.'} description="Өмнө нь оноосон хүсэлтийг буцаахгүй. Ажилтан сонгож гараар оноох болон Sheet дээр нэрээр оноосон хариуцагчийг тулгах ажиллагаа хэвээр байна."/>
 <Form.Item label="Sheets-ээс ирсэн хариуцагчгүй шинэ хүсэлтийг автоматаар хуваарилах" style={{marginTop:20}}><Switch aria-label="Sheets автомат хуваарилалт" disabled={!value.enabled||busy} checked={value.automatic} onChange={automatic=>update({automatic})}/></Form.Item>
 <Form.Item label="Хүлээгдсэн хүсэлтийг хуваарилах хугацаа (хоног)" help="Борлуулалт дахь «Ухаалгаар хуваарилах» товч сүүлийн энэ хугацааны хүсэлтийг авна. Нэг удаад 200 хүртэл. Хаагдсан болон холбоо барихгүй хүсэлтийг алгасана."><InputNumber aria-label="Хуваарилах хүсэлтийн хоног" min={1} max={30} precision={0} value={value.days} disabled={!value.enabled||busy} onChange={days=>{if(days!==null)update({days});}}/></Form.Item>
 <Form.Item label="Хуваарилалтад хамруулах ажлын томилгоо" help="Хоосон бол бүх ажлын томилгоо. Амралт, чөлөө болон хуваарьгүй ажилтан үргэлж хасагдана."><Select mode="multiple" aria-label="Хамруулах ажлын томилгоо" value={value.assignments} disabled={!value.enabled||busy} allowClear placeholder="Бүх ажлын томилгоо" options={shiftAssignments.filter(a=>!shiftOff.includes(a)).map(value=>({value,label:value}))} onChange={assignments=>update({assignments})}/></Form.Item>
 <Form.Item label="Түр алгасах борлуулалтын ажилтан" help="Сонгосон ажилтны өмнөх хүсэлтүүд хэвээр; шинэ ухаалаг хуваарилалтаас хасна."><Select mode="multiple" aria-label="Түр алгасах ажилтан" showSearch={{optionFilterProp:'label'}} value={value.excluded_emails} disabled={!value.enabled||busy} allowClear placeholder="Алгасах ажилтан сонгох" options={members.filter(m=>m.role==='agent'||value.excluded_emails.includes(m.email)).map(m=>({value:m.email,label:m.name+' · '+m.email+(!m.active?' (идэвхгүй)':'')}))} onChange={excluded_emails=>update({excluded_emails})}/></Form.Item>
 <Space wrap><Button type="primary" htmlType="submit" loading={busy} disabled={!dirty}>Хуваарилалтын тохиргоо хадгалах</Button><Button disabled={!dirty||busy} onClick={()=>{setValue(saved);setError('');}}>Өөрчлөлт цуцлах</Button></Space>
 </Form></Card>;
}
export default function AssignmentSettingsPanel({members,onSaved}:{members:Member[];onSaved:(s:SavedSettings)=>void}){
 const state=useRemote<{auto_assignment?:string}>('/api/settings');
 if(state.loading)return <Spin aria-label="Хуваарилалтын тохиргоо ачаалж байна"/>;
 if(state.error)return <Alert type="error" title={state.error} action={<Button onClick={state.retry}>Дахин оролдох</Button>}/>;
 return state.data?<Editor initial={initialSettings(state.data.auto_assignment)} members={members} onSaved={onSaved}/>:null;
}
