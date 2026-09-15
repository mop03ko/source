'use client';
import {useEffect,useState} from 'react';import {Volume2,Save,PlayCircle} from 'lucide-react';import {Button} from '@/components/ui/button';import {toast} from 'sonner';import {soundPresets,playNotificationSound} from '@/lib/sound';
// Цаашид админд зориулсан шинэ тохиргоо нэмэхдээ энд шинэ <section className="panel"> нэмнэ;
// DB тал lib/settings.ts-ийн key/value хэлбэрээр өргөтгөгдөнө, схем өөрчлөгдөхгүй.
export default function SettingsPanel({initial,onSaved}:{initial:{notification_sound:string};onSaved:(v:{notification_sound:string})=>void}){
 const [sound,setSound]=useState(initial.notification_sound),[busy,setBusy]=useState(false),[error,setError]=useState(''),dirty=sound!==initial.notification_sound;
 useEffect(()=>{setSound(initial.notification_sound);},[initial.notification_sound]);
 const save=async()=>{setBusy(true);setError('');try{const r=await fetch('/api/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({notification_sound:sound})});const d=await r.json() as {error?:string;notification_sound?:string};if(!r.ok)throw new Error(d.error||'Хадгалж чадсангүй.');onSaved(d as {notification_sound:string});toast.success('Тохиргоо хадгалагдлаа.');}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 return <div className="sheet-settings"><section className="panel"><div className="section-heading"><div><div className="eyebrow">СИСТЕМИЙН ТОХИРГОО</div><h2>Мэдэгдлийн дуу</h2><p className="muted">Шинэ хүсэлт хуваарилагдах, холбоо барих тов болоход CRM нээлттэй бүх ажилтанд ижил дуугаар мэдэгдэнэ.</p></div></div>
 {error&&<div role="alert" className="error-box">{error}</div>}
 <div className="sound-options">{Object.entries(soundPresets).map(([k,v])=><label key={k} className={'sound-option'+(sound===k?' active':'')}><input type="radio" name="sound" value={k} checked={sound===k} onChange={()=>setSound(k)}/><Volume2 size={16}/><span>{v}</span><Button type="button" variant="ghost" size="icon" aria-label={v+' сонсох'} disabled={k==='none'} onClick={()=>playNotificationSound(k)}><PlayCircle size={17}/></Button></label>)}</div>
 <div className="row"><Button className="primary" disabled={busy||!dirty} onClick={save}><Save size={16}/>Хадгалах</Button>{dirty&&<Button variant="ghost" onClick={()=>setSound(initial.notification_sound)}>Цуцлах</Button>}</div>
 </section></div>;
}
