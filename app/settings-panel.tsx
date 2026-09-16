'use client';
import {useEffect,useState,type FormEvent} from 'react';import {Volume2,Save,PlayCircle,Send,Loader2} from 'lucide-react';import {Button} from '@/components/ui/button';import {Input} from '@/components/ui/input';import {Switch} from '@/components/ui/switch';import {toast} from 'sonner';import {soundPresets,playNotificationSound} from '@/lib/sound';
type Settings={notification_sound:string;sms_enabled:string};
// Цаашид админд зориулсан шинэ тохиргоо нэмэхдээ энд шинэ <section className="panel"> нэмнэ;
// DB тал lib/settings.ts-ийн key/value хэлбэрээр өргөтгөгдөнө, схем өөрчлөгдөхгүй.
export default function SettingsPanel({initial,onSaved}:{initial:Settings;onSaved:(v:Settings)=>void}){
 const [sound,setSound]=useState(initial.notification_sound),[busy,setBusy]=useState(false),[error,setError]=useState(''),dirty=sound!==initial.notification_sound;
 const [smsEnabled,setSmsEnabled]=useState(initial.sms_enabled==='on'),[smsBusy,setSmsBusy]=useState(false);
 const [to,setTo]=useState(''),[message,setMessage]=useState(''),[sendBusy,setSendBusy]=useState(false),[sendError,setSendError]=useState('');
 useEffect(()=>{setSound(initial.notification_sound);setSmsEnabled(initial.sms_enabled==='on');},[initial.notification_sound,initial.sms_enabled]);
 const save=async()=>{setBusy(true);setError('');try{const r=await fetch('/api/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({notification_sound:sound})});const d=await r.json() as Settings&{error?:string};if(!r.ok)throw new Error(d.error||'Хадгалж чадсангүй.');onSaved(d);toast.success('Тохиргоо хадгалагдлаа.');}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 const toggleSms=async(checked:boolean)=>{setSmsEnabled(checked);setSmsBusy(true);try{const r=await fetch('/api/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sms_enabled:checked?'on':'off'})});const d=await r.json() as Settings&{error?:string};if(!r.ok)throw new Error(d.error||'Хадгалж чадсангүй.');onSaved(d);toast.success(checked?'Автомат SMS асаалттай боллоо.':'Автомат SMS унтраалттай боллоо.');}catch(e){setSmsEnabled(!checked);toast.error((e as Error).message);}finally{setSmsBusy(false);}};
 const sendManual=async(e:FormEvent)=>{e.preventDefault();setSendBusy(true);setSendError('');try{const r=await fetch('/api/sms',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({to,message})});const d=await r.json() as {error?:string};if(!r.ok)throw new Error(d.error||'Илгээж чадсангүй.');toast.success('SMS илгээгдлээ.');setTo('');setMessage('');}catch(e){setSendError((e as Error).message);}finally{setSendBusy(false);}};
 return <div className="sheet-settings">
 <section className="panel"><div className="section-heading"><div><div className="eyebrow">СИСТЕМИЙН ТОХИРГОО</div><h2>Мэдэгдлийн дуу</h2><p className="muted">Шинэ хүсэлт хуваарилагдах, холбоо барих тов болоход CRM нээлттэй бүх ажилтанд ижил дуугаар мэдэгдэнэ.</p></div></div>
 {error&&<div role="alert" className="error-box">{error}</div>}
 <div className="sound-options">{Object.entries(soundPresets).map(([k,v])=><label key={k} className={'sound-option'+(sound===k?' active':'')}><input type="radio" name="sound" value={k} checked={sound===k} onChange={()=>setSound(k)}/><Volume2 size={16}/><span>{v}</span><Button type="button" variant="ghost" size="icon" aria-label={v+' сонсох'} disabled={k==='none'} onClick={()=>playNotificationSound(k)}><PlayCircle size={17}/></Button></label>)}</div>
 <div className="row"><Button className="primary" disabled={busy||!dirty} onClick={save}><Save size={16}/>Хадгалах</Button>{dirty&&<Button variant="ghost" onClick={()=>setSound(initial.notification_sound)}>Цуцлах</Button>}</div>
 </section>
 <section className="panel"><div className="eyebrow">SMS ТОХИРГОО</div><h2>Автомат баталгаажуулах SMS</h2><p className="muted">Хүсэлтийн төлөв "Худалдан авсан" болоход харилцагч руу автоматаар баталгаажуулах SMS илгээх эсэхийг тохируулна.</p>
 <label className="sms-toggle"><Switch checked={smsEnabled} disabled={smsBusy} onCheckedChange={toggleSms}/><span>{smsEnabled?'Асаалттай — Худалдан авсан болоход SMS илгээнэ':'Унтраалттай — SMS илгээхгүй'}</span></label>
 </section>
 <section className="panel"><div className="eyebrow">ГАРААР SMS ИЛГЭЭХ</div><h2>Дурын дугаарт мессеж илгээх</h2><p className="muted">Утасны дугаар, мессежийг гараар оруулж шууд илгээнэ.</p>
 {sendError&&<div role="alert" className="error-box">{sendError}</div>}
 <form className="form-stack" onSubmit={sendManual}><label className="field"><span>Утасны дугаар</span><Input required value={to} onChange={e=>setTo(e.target.value)} placeholder="8 оронтой дугаар" inputMode="tel" maxLength={16}/></label><label className="field"><span>Мессеж</span><textarea required rows={4} maxLength={600} value={message} onChange={e=>setMessage(e.target.value)} placeholder="Илгээх мессежээ бичнэ үү…"/></label><Button className="primary" type="submit" disabled={sendBusy}>{sendBusy?<Loader2 className="spin" size={16}/>:<Send size={16}/>}Илгээх</Button></form>
 </section>
 </div>;
}
