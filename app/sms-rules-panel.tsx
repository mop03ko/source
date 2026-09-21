'use client';
import {SelectControl,TextareaControl} from '@/components/ui/form-controls';
import {useCallback,useEffect,useState,type FormEvent} from 'react';
import {Save,Trash2,Plus} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Switch} from '@/components/ui/switch';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {useUnsavedChanges} from '@/components/draft-guard';
import {AsyncStatus} from '@/components/async-status';
import {readJson} from '@/hooks/use-remote';
import {toast} from '@/components/ui/sonner';
import {stages} from '@/lib/crm';
type Rule={id:string;status:string;message:string;enabled:number;updated_at:string};
async function api(body:unknown){const r=await fetch('/api/sms-rules',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw new Error(d.error||'Хадгалж чадсангүй.');}
function RuleRow({rule,onChanged}:{rule:Rule;onChanged:()=>Promise<void>}){
 const [message,setMessage]=useState(rule.message),[enabled,setEnabled]=useState(!!rule.enabled),[busy,setBusy]=useState(false),[removeOpen,setRemoveOpen]=useState(false),[error,setError]=useState('');
 const dirty=message!==rule.message||enabled!==!!rule.enabled;
 useUnsavedChanges(dirty);
 const save=async()=>{setBusy(true);setError('');try{await api({action:'save',status:rule.status,message,enabled});await onChanged();toast.success('SMS дүрэм хадгалагдлаа.');}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 const remove=async()=>{setBusy(true);setError('');try{await api({action:'delete',status:rule.status});setRemoveOpen(false);await onChanged();toast.success('Дүрэм устгагдлаа.');}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 const label=stages[rule.status]||rule.status;
 return <div className="sms-rule-row">
 <div className="sms-rule-head"><strong>{label}</strong><Switch aria-label={label+' төлөвийн автомат SMS'} checked={enabled} disabled={busy} onCheckedChange={setEnabled}/><span>{enabled?'Асаалттай':'Унтраалттай'}</span><Button type="button" variant="ghost" size="icon" aria-label={label+' дүрэм устгах'} disabled={busy} onClick={()=>setRemoveOpen(true)}><Trash2 size={15}/></Button></div>
 <label className="field"><span>{label} · Илгээх мессеж</span><TextareaControl disabled={busy} rows={3} maxLength={600} value={message} onChange={e=>setMessage(e.target.value)}/></label>
 {error&&<p role="alert" className="error-box">{error}</p>}
 {dirty&&<><p className="draft-hint">Текст болон асаах/унтраах өөрчлөлт хадгалаагүй байна.</p><div className="row"><Button className="primary" disabled={busy||!message.trim()} onClick={save}><Save size={16}/>Хадгалах</Button><Button variant="ghost" disabled={busy} onClick={()=>{setMessage(rule.message);setEnabled(!!rule.enabled);}}>Цуцлах</Button></div></>}
 <Dialog open={removeOpen} onOpenChange={setRemoveOpen}><DialogContent><DialogHeader><DialogTitle>SMS дүрэм устгах уу?</DialogTitle><DialogDescription>{label} төлөвийн автомат SMS зогсоно. Дараа нь дүрмийг шинээр үүсгэж болно.</DialogDescription></DialogHeader><Button variant="destructive" disabled={busy} onClick={remove}>Тийм, дүрмийг устгах</Button><Button variant="outline" onClick={()=>setRemoveOpen(false)}>Цуцлах</Button></DialogContent></Dialog>
 </div>;
}
export default function SmsRulesPanel(){
 const [rules,setRules]=useState<Rule[]|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 const [newStatus,setNewStatus]=useState(''),[newMessage,setNewMessage]=useState(''),[addBusy,setAddBusy]=useState(false);
 useUnsavedChanges(!!newMessage.trim());
 const load=useCallback(async()=>{setLoading(true);setError('');try{const d=await readJson<{items:Rule[]}>('/api/sms-rules');setRules(d.items);}catch(e){setError((e as Error).message);}finally{setLoading(false);}},[]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[load]);
 const available=Object.entries(stages).filter(([k])=>!(rules||[]).some(r=>r.status===k));
 const selected=available.some(([k])=>k===newStatus)?newStatus:available[0]?.[0]||'';
 const addRule=async(e:FormEvent)=>{e.preventDefault();if(!selected||!newMessage.trim())return;setAddBusy(true);try{await api({action:'save',status:selected,message:newMessage.trim(),enabled:true});setNewMessage('');await load();toast.success('Дүрэм нэмэгдлээ.');}catch(e){setError((e as Error).message);}finally{setAddBusy(false);}};
 return <section className="panel"><div className="eyebrow">SMS ТОХИРГОО</div><h2>Автомат SMS дүрэм</h2><p className="muted">Төлөв өөрчлөгдөхөд илгээх мессеж. Текст болон асаах/унтраах өөрчлөлт зөвхөн Хадгалах дарахад үйлчилнэ.</p>
 <AsyncStatus error={error} loading={loading} retry={load}/>
 {rules&&<><div className="sms-rules-list">{rules.map(r=><RuleRow key={r.status+':'+r.updated_at} rule={r} onChanged={load}/>)}{!rules.length&&<p className="muted">Автомат SMS дүрэм тохируулаагүй байна.</p>}</div>
 {!!available.length&&<form className="form-stack sms-rule-add" onSubmit={addRule}><h2>Шинэ дүрэм</h2><label className="field"><span>Төлөв</span><SelectControl value={selected} onChange={e=>setNewStatus(e.target.value)}>{available.map(([k,v])=><option key={k} value={k}>{v}</option>)}</SelectControl></label><label className="field"><span>Мессеж</span><TextareaControl required rows={3} maxLength={600} value={newMessage} onChange={e=>setNewMessage(e.target.value)}/></label><Button className="primary" disabled={addBusy||!newMessage.trim()}><Plus size={16}/>Дүрэм нэмэх</Button></form>}</>}
 </section>;
}
