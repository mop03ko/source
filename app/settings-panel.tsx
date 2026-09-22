'use client';
import AssignmentSettingsPanel from './assignment-settings';
import {ChoiceInput} from '@/components/ui/choice-input';
import {TextareaControl} from '@/components/ui/form-controls';
import {useUnsavedChanges} from '@/components/draft-guard';
import AvatarImage from 'next/image';
import {useState,type FormEvent} from 'react';import {Volume2,Save,PlayCircle,Send,Loader2,Trash2} from 'lucide-react';import {Button} from '@/components/ui/button';import {Input} from '@/components/ui/input';import {Tabs,TabsList,TabsTrigger,TabsContent} from '@/components/ui/tabs';import {toast} from '@/components/ui/sonner';import {soundPresets,playNotificationSound} from '@/lib/sound';import {isAdminLike} from '@/lib/crm';import type {Member} from '@/lib/crm';import SheetsPanel from './sheets-panel';import SmsRulesPanel from './sms-rules-panel';
type Settings={notification_sound:string};
type Profile={phone?:string|null;avatar?:string|null};
// Зурган аватарыг 192x192 квадрат болгож шахна: DB-д base64 маягаар хадгалахад хэт том болохоос сэргийлнэ.
function resizeAvatar(file:File):Promise<string>{
 return new Promise((resolve,reject)=>{
 const reader=new FileReader();
 reader.onerror=()=>reject(new Error('Файл уншиж чадсангүй.'));
 reader.onload=()=>{
 const img=new Image();
 img.onerror=()=>reject(new Error('Зураг уншиж чадсангүй.'));
 img.onload=()=>{
 const size=192,canvas=document.createElement('canvas');canvas.width=size;canvas.height=size;
 const ctx=canvas.getContext('2d');if(!ctx){reject(new Error('Зураг боловсруулж чадсангүй.'));return;}
 const scale=Math.max(size/img.width,size/img.height),w=img.width*scale,h=img.height*scale;
 ctx.drawImage(img,(size-w)/2,(size-h)/2,w,h);
 resolve(canvas.toDataURL('image/jpeg',0.82));
 };
 img.src=reader.result as string;
 };
 reader.readAsDataURL(file);
 });
}
// Цаашид админд зориулсан шинэ тохиргоо нэмэхдээ энд шинэ <section className="panel"> нэмнэ;
// DB тал lib/settings.ts-ийн key/value хэлбэрээр өргөтгөгдөнө, схем өөрчлөгдөхгүй.
export default function SettingsPanel({me,members,initial,onSaved,onProfileSaved}:{me:Member;members:Member[];initial:Settings;onSaved:(v:Settings)=>void;onProfileSaved:(p:Profile)=>void}){
 const [sound,setSound]=useState(initial.notification_sound),[busy,setBusy]=useState(false),[error,setError]=useState(''),dirty=sound!==initial.notification_sound;
 const [to,setTo]=useState(''),[message,setMessage]=useState(''),[sendBusy,setSendBusy]=useState(false),[sendError,setSendError]=useState('');
 const [phone,setPhone]=useState(me.phone||''),[phoneBusy,setPhoneBusy]=useState(false),[avatarBusy,setAvatarBusy]=useState(false),[profileError,setProfileError]=useState('');
 const [tab,setTab]=useState('profile');
 const [previous,setPrevious]=useState({sound:initial.notification_sound,phone:me.phone});
 if(previous.sound!==initial.notification_sound||previous.phone!==me.phone){
 setPrevious({sound:initial.notification_sound,phone:me.phone});
 if(previous.sound!==initial.notification_sound)setSound(initial.notification_sound);
 if(previous.phone!==me.phone)setPhone(me.phone||'');
 }
 const save=async()=>{setBusy(true);setError('');try{const r=await fetch('/api/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({notification_sound:sound})});const d=await r.json() as Settings&{error?:string};if(!r.ok)throw new Error(d.error||'Хадгалж чадсангүй.');onSaved(d);toast.success('Тохиргоо хадгалагдлаа.');}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 const sendManual=async(e:FormEvent)=>{e.preventDefault();setSendBusy(true);setSendError('');try{const r=await fetch('/api/sms',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({to,message})});const d=await r.json() as {error?:string};if(!r.ok)throw new Error(d.error||'Илгээж чадсангүй.');toast.success('SMS илгээгдлээ.');setTo('');setMessage('');}catch(e){setSendError((e as Error).message);}finally{setSendBusy(false);}};
 const saveProfile=async(patch:Profile)=>{const r=await fetch('/api/profile',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(patch)});const d=await r.json() as Profile&{error?:string};if(!r.ok)throw new Error(d.error||'Хадгалж чадсангүй.');onProfileSaved(d);return d;};
 const savePhone=async()=>{setPhoneBusy(true);setProfileError('');try{await saveProfile({phone});toast.success('Утасны дугаар хадгалагдлаа.');}catch(e){setProfileError((e as Error).message);}finally{setPhoneBusy(false);}};
 const pickAvatar=async(e:React.ChangeEvent<HTMLInputElement>)=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;setProfileError('');if(file.size>8*1024*1024){setProfileError('Зургийн хэмжээ 8 MB-аас бага байна.');return;}setAvatarBusy(true);try{const data=await resizeAvatar(file);await saveProfile({avatar:data});toast.success('Аватар зураг хадгалагдлаа.');}catch(e){setProfileError((e as Error).message);}finally{setAvatarBusy(false);}};
 const removeAvatar=async()=>{setAvatarBusy(true);setProfileError('');try{await saveProfile({avatar:null});toast.success('Аватар зураг устгагдлаа.');}catch(e){setProfileError((e as Error).message);}finally{setAvatarBusy(false);}};
 useUnsavedChanges(dirty||phone!==(me.phone||'')||!!message||!!to);
 const changeTab=(v:string)=>{setTab(v);setPhone(me.phone||'');setSound(initial.notification_sound);setTo('');setMessage('');};
 const admin=isAdminLike(me.role);
 return <div className="sheet-settings">
 <Tabs value={tab} onValueChange={changeTab}><div className="settings-tabs"><TabsList aria-label="Тохиргооны хэсгүүд"><TabsTrigger value="profile">Профайл</TabsTrigger>{admin&&<TabsTrigger value="system">Системийн тохиргоо</TabsTrigger>}{admin&&<TabsTrigger value="sms">SMS тохиргоо</TabsTrigger>}{admin&&<TabsTrigger value="sheets">Google Sheets</TabsTrigger>}</TabsList></div>
 <TabsContent value="profile"><section className="panel"><div className="eyebrow">МИНИЙ ТОХИРГОО</div><h2>Профайл</h2><p className="muted">Аватар зураг, харилцах утасны дугаараа энд шинэчилнэ. Админ, удирдлага, борлуулалтын ажилтан бүр өөрийн профайлаа засна.</p>
 {profileError&&<div role="alert" className="error-box">{profileError}</div>}
 <div className="profile-row"><div className="profile-avatar">{me.avatar?<AvatarImage width={192} height={192} unoptimized src={me.avatar} alt=""/>:<span>{me.name.slice(0,1)}</span>}</div><div className="profile-avatar-actions"><label className="field"><span>Аватар зураг (PNG/JPEG/WEBP, 8MB хүртэл)</span><Input type="file" accept="image/png,image/jpeg,image/webp" disabled={avatarBusy} onChange={pickAvatar}/></label>{me.avatar&&<Button type="button" variant="ghost" size="sm" disabled={avatarBusy} onClick={removeAvatar}><Trash2 size={15}/>Аватар устгах</Button>}{avatarBusy&&<Loader2 className="spin" size={16}/>}</div></div>
 <div className="form-grid"><label className="field"><span>Утасны дугаар</span><Input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="8 оронтой дугаар" inputMode="tel" maxLength={16}/></label></div>
 <div className="row"><Button className="primary" disabled={phoneBusy||phone===(me.phone||'')} onClick={savePhone}>{phoneBusy?<Loader2 className="spin" size={16}/>:<Save size={16}/>}Хадгалах</Button></div>
 </section></TabsContent>
 {admin&&<TabsContent value="system"><AssignmentSettingsPanel members={members} onSaved={onSaved}/><section className="panel"><div className="section-heading"><div><div className="eyebrow">СИСТЕМИЙН ТОХИРГОО</div><h2>Мэдэгдлийн дуу</h2><p className="muted">Шинэ хүсэлт хуваарилагдах, холбоо барих тов болоход CRM нээлттэй бүх ажилтанд ижил дуугаар мэдэгдэнэ.</p></div></div>
 {error&&<div role="alert" className="error-box">{error}</div>}
 <div className="sound-options">{Object.entries(soundPresets).map(([k,v])=><div key={k} className={'sound-option'+(sound===k?' active':'')}><ChoiceInput type="radio" name="sound" value={k} checked={sound===k} onChange={()=>setSound(k)}><Volume2 size={16}/><span>{v}</span></ChoiceInput><Button type="button" variant="ghost" size="icon" aria-label={v+' сонсох'} disabled={k==='none'} onClick={()=>playNotificationSound(k)}><PlayCircle size={17}/></Button></div>)}</div>
 <div className="row"><Button className="primary" disabled={busy||!dirty} onClick={save}><Save size={16}/>Хадгалах</Button>{dirty&&<Button variant="ghost" onClick={()=>setSound(initial.notification_sound)}>Цуцлах</Button>}</div>
 </section></TabsContent>}
 {admin&&<TabsContent value="sms">
 <SmsRulesPanel/>
 <section className="panel"><div className="eyebrow">ГАРААР SMS ИЛГЭЭХ</div><h2>Дурын дугаарт мессеж илгээх</h2><p className="muted">Утасны дугаар, мессежийг гараар оруулж шууд илгээнэ.</p>
 {sendError&&<div role="alert" className="error-box">{sendError}</div>}
 <form className="form-stack" onSubmit={sendManual}><label className="field"><span>Утасны дугаар</span><Input required value={to} onChange={e=>setTo(e.target.value)} placeholder="8 оронтой дугаар" inputMode="tel" maxLength={16}/></label><label className="field"><span>Мессеж</span><TextareaControl required rows={4} maxLength={600} value={message} onChange={e=>setMessage(e.target.value)} placeholder="Илгээх мессежээ бичнэ үү…"/></label><Button className="primary" type="submit" disabled={sendBusy}>{sendBusy?<Loader2 className="spin" size={16}/>:<Send size={16}/>}Илгээх</Button></form>
 </section>
 </TabsContent>}
 {admin&&<TabsContent value="sheets"><SheetsPanel members={members}/></TabsContent>}</Tabs>
 </div>;
}
