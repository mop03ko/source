'use client';
import {useCallback,useEffect,useState,type FormEvent} from 'react';
import {Save,Trash2,Loader2,Plus} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Switch} from '@/components/ui/switch';
import {toast} from 'sonner';
import {stages} from '@/lib/crm';
type Rule={id:string;status:string;message:string;enabled:number;created_at:string;updated_at:string};
async function api(body:unknown){const r=await fetch('/api/sms-rules',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json() as {error?:string};if(!r.ok)throw new Error(d.error||'Хадгалж чадсангүй.');return d;}
function RuleRow({rule,onChanged}:{rule:Rule;onChanged:()=>void}){
 const [message,setMessage]=useState(rule.message),[enabled,setEnabled]=useState(!!rule.enabled),[busy,setBusy]=useState(false);
 const dirty=message!==rule.message;
 const save=async()=>{setBusy(true);try{await api({action:'save',status:rule.status,message,enabled});toast.success('Хадгалагдлаа.');onChanged();}catch(e){toast.error((e as Error).message);}finally{setBusy(false);}};
 const toggle=async(checked:boolean)=>{setEnabled(checked);setBusy(true);try{await api({action:'save',status:rule.status,message,enabled:checked});toast.success(checked?'Асаалттай боллоо.':'Унтраалттай боллоо.');onChanged();}catch(e){setEnabled(!checked);toast.error((e as Error).message);}finally{setBusy(false);}};
 const remove=async()=>{setBusy(true);try{await api({action:'delete',status:rule.status});toast.success('Устгагдлаа.');onChanged();}catch(e){toast.error((e as Error).message);}finally{setBusy(false);}};
 return <div className="sms-rule-row">
 <div className="sms-rule-head"><strong>{stages[rule.status]||rule.status}</strong><Switch checked={enabled} disabled={busy} onCheckedChange={toggle}/><Button type="button" variant="ghost" size="icon" aria-label="Дүрэм устгах" disabled={busy} onClick={remove}><Trash2 size={15}/></Button></div>
 <textarea rows={2} maxLength={600} value={message} onChange={e=>setMessage(e.target.value)} placeholder="Илгээх мессежээ бичнэ үү…"/>
 {dirty&&<div className="row"><Button size="sm" className="primary" disabled={busy||!message.trim()} onClick={save}>{busy?<Loader2 className="spin" size={14}/>:<Save size={14}/>}Хадгалах</Button><Button size="sm" variant="ghost" disabled={busy} onClick={()=>setMessage(rule.message)}>Цуцлах</Button></div>}
 </div>;
}
// Хүсэлтийн төлөв өөрчлөгдөх бүрд харилцагч руу илгээх автомат SMS-ийг статус тус бүрээр удирдана;
// статус нэг бүрт нэг л дүрэм байдаг тул тохируулаагүй статусуудаас л шинэ дүрэм нэмж болно.
export default function SmsRulesPanel(){
 const [rules,setRules]=useState<Rule[]|null>(null),[error,setError]=useState('');
 const [newStatus,setNewStatus]=useState(''),[newMessage,setNewMessage]=useState(''),[addBusy,setAddBusy]=useState(false);
 const load=useCallback(async()=>{try{const r=await fetch('/api/sms-rules',{cache:'no-store'});const d=await r.json() as {items?:Rule[];error?:string};if(!r.ok)throw new Error(d.error||'Уншиж чадсангүй.');setRules(d.items||[]);setError('');}catch(e){setError((e as Error).message);}},[]);
 useEffect(()=>{load();},[load]);
 const configured=new Set((rules||[]).map(r=>r.status));
 const available=Object.entries(stages).filter(([k])=>!configured.has(k));
 useEffect(()=>{if(available.length&&!available.some(([k])=>k===newStatus))setNewStatus(available[0][0]);if(!available.length)setNewStatus('');},[available,newStatus]);
 const addRule=async(e:FormEvent)=>{e.preventDefault();if(!newStatus||!newMessage.trim())return;setAddBusy(true);try{await api({action:'save',status:newStatus,message:newMessage.trim(),enabled:true});toast.success('Автомат SMS нэмэгдлээ.');setNewMessage('');await load();}catch(e){toast.error((e as Error).message);}finally{setAddBusy(false);}};
 if(rules===null)return <div className="loading"><Loader2 className="spin"/>Ачаалж байна…</div>;
 return <section className="panel"><div className="eyebrow">SMS ТОХИРГОО</div><h2>Автомат SMS дүрэм</h2><p className="muted">Хүсэлтийн төлөв өөрчлөгдөх бүрд харилцагч руу автоматаар илгээх мессежийг тохируулна. Төлөв тус бүрт өөрийн текст, асаах/унтраах switch-тэй.</p>
 {error&&<div role="alert" className="error-box">{error}</div>}
 <div className="sms-rules-list">{rules.map(r=><RuleRow key={r.status} rule={r} onChanged={load}/>)}{!rules.length&&<p className="muted">Автомат SMS дүрэм тохируулаагүй байна.</p>}</div>
 {available.length>0&&<form className="form-stack sms-rule-add" onSubmit={addRule}><h2>Шинэ автомат SMS нэмэх</h2><label className="field"><span>Төлөв</span><select value={newStatus} onChange={e=>setNewStatus(e.target.value)}>{available.map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label><label className="field"><span>Мессеж</span><textarea required rows={3} maxLength={600} value={newMessage} onChange={e=>setNewMessage(e.target.value)} placeholder="Илгээх мессежээ бичнэ үү…"/></label><Button type="submit" className="primary" disabled={addBusy||!newMessage.trim()}>{addBusy?<Loader2 className="spin" size={16}/>:<Plus size={16}/>}Нэмэх</Button></form>}
 </section>;
}
