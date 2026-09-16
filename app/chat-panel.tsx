'use client';
import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import {Send,MessageSquare,Loader2,Users,Smile} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Popover,PopoverContent,PopoverTrigger} from '@/components/ui/popover';
import {dateLabel} from '@/lib/crm';
import type {Member} from '@/lib/crm';
const TEAM='__team__';
// Идэвхтэй ажилтан бүр 30 секунд тутамд ямар нэг API-г polling хийдэг тул 90 секундийн цонх л хангалттай.
const ONLINE_MS=90000;
const EMOJIS=['😀','😁','😂','🤣','😊','🙂','😉','😍','😘','😎','🤔','😅','😢','😭','😡','😱','👍','👎','👏','🙏','💪','🔥','🎉','✅','❌','❤️','💯','🙌','👌','🤝','📌','⏰','📞','💬','😴','🥳','🤗','😐','🙄','🤩'];
type Conversation={peer:string;body:string;created_at:string;mine:boolean;unread:number};
type Msg={id:string;sender:string;recipient?:string;body:string;created_at:string};
type Summary={dm:number;team:number;total:number;lastTeam:{sender:string;body:string;created_at:string}|null};
async function request(body?:unknown,query=''){const r=await fetch('/api/messages'+query,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{cache:'no-store'});const d=await r.json() as {error?:string};if(!r.ok)throw new Error(d.error||'Мессеж ачаалахад алдаа гарлаа.');return d;}
function EmojiPicker({onPick}:{onPick:(e:string)=>void}){
 const [open,setOpen]=useState(false);
 return <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><Button type="button" variant="ghost" size="icon" aria-label="Emoji нэмэх"><Smile size={18}/></Button></PopoverTrigger><PopoverContent align="end" className="emoji-picker">{EMOJIS.map(e=><button type="button" key={e} onClick={()=>{onPick(e);setOpen(false);}}>{e}</button>)}</PopoverContent></Popover>;
}
export default function ChatPanel({me,members,onRead}:{me:Member;members:Member[];onRead:()=>void}){
 const [peer,setPeer]=useState(''),[conversations,setConversations]=useState<Conversation[]>([]),[summary,setSummary]=useState<Summary|null>(null),[thread,setThread]=useState<Msg[]>([]),[body,setBody]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 const bottomRef=useRef<HTMLDivElement>(null);
 const peers=members.filter(p=>p.email!==me.email&&p.active);
 const loadConversations=useCallback(async()=>{try{const [c,s]=await Promise.all([request() as Promise<{items:Conversation[]}>,request(undefined,'?summary=1') as Promise<Summary>]);setConversations(c.items);setSummary(s);}catch(e){setError((e as Error).message);}},[]);
 const loadThread=useCallback(async(p:string)=>{try{const d=await request(undefined,p===TEAM?'?team=1':'?peer='+encodeURIComponent(p)) as {items:Msg[]};setThread(d.items);}catch(e){setError((e as Error).message);}},[]);
 useEffect(()=>{void loadConversations().finally(()=>setLoading(false));const timer=setInterval(loadConversations,8000);return()=>clearInterval(timer);},[loadConversations]);
 // Нээлттэй харилцан яриаг л 4 секунд тутам дахин уншсан гэж тэмдэглэнэ; эс бөгөөс дараа ирсэн мессеж
 // уншаагүй хэвээр үлдэж, хонх (bell) харсан мессежид дахин дахин дуугарах алдаа гарна.
 useEffect(()=>{if(!peer)return;let first=true;const tick=async()=>{await loadThread(peer);try{await request(peer===TEAM?{action:'read_team'}:{action:'read',peer});await loadConversations();if(first){first=false;onRead();}}catch{}};void tick();const timer=setInterval(()=>void tick(),4000);return()=>clearInterval(timer);},[peer,loadThread,loadConversations,onRead]);
 useEffect(()=>{bottomRef.current?.scrollIntoView({block:'nearest'});},[thread]);
 const submit=async(e:FormEvent)=>{e.preventDefault();const text=body.trim();if(!text||!peer)return;setBusy(true);setBody('');try{await request(peer===TEAM?{action:'send_team',body:text}:{action:'send',peer,body:text});await Promise.all([loadThread(peer),loadConversations()]);}catch(e){setError((e as Error).message);setBody(text);}finally{setBusy(false);}};
 const name=(email:string)=>email===TEAM?'Бүх ажилчид':members.find(p=>p.email===email)?.name||email;
 const avatarOf=(email:string)=>members.find(p=>p.email===email)?.avatar||null;
 const online=(email:string)=>{const p=members.find(x=>x.email===email);return !!p?.last_seen&&Date.now()-new Date(p.last_seen).getTime()<ONLINE_MS;};
 return <div className="chat-layout">
 <aside className="chat-list"><div className="chat-list-head"><h2>Чат</h2>{loading&&<Loader2 size={15} className="spin muted"/>}</div>
 <div className="chat-list-scroll">
 <button className={'chat-peer'+(peer===TEAM?' active':'')} onClick={()=>setPeer(TEAM)}><span className="chat-avatar chat-avatar-team"><Users size={16}/></span><span className="chat-peer-info"><strong>Бүх ажилчид</strong>{summary?.lastTeam&&<small>{summary.lastTeam.sender===me.email?'Та: ':''}{summary.lastTeam.body}</small>}</span>{!!summary?.team&&<b className="chat-unread">{summary.team}</b>}</button>
 {peers.map(p=>{const c=conversations.find(x=>x.peer===p.email);return <button key={p.email} className={'chat-peer'+(peer===p.email?' active':'')} onClick={()=>setPeer(p.email)}><span className="chat-avatar">{p.avatar?<img src={p.avatar} alt=""/>:p.name.slice(0,1)}<i className={'chat-status'+(online(p.email)?' online':'')}/></span><span className="chat-peer-info"><strong>{p.name}</strong>{c&&<small>{c.mine?'Та: ':''}{c.body}</small>}</span>{!!c?.unread&&<b className="chat-unread">{c.unread}</b>}</button>;})}
 {!peers.length&&<p className="muted chat-empty-list">Идэвхтэй бусад ажилтан алга.</p>}</div></aside>
 <section className="chat-thread">{!peer?<div className="chat-empty"><MessageSquare size={28}/><strong>Ажилтан сонгоно уу</strong><p>Зүүн талаас ажилтнаа эсвэл "Бүх ажилчид" сувгийг сонгоод чат эхлүүлээрэй.</p></div>:<>
 <div className="chat-thread-head">{peer!==TEAM&&<span className="chat-avatar">{avatarOf(peer)?<img src={avatarOf(peer)!} alt=""/>:name(peer).slice(0,1)}<i className={'chat-status'+(online(peer)?' online':'')}/></span>}<span><strong>{name(peer)}</strong>{peer!==TEAM&&<small>{online(peer)?'Онлайн':'Идэвхгүй'}</small>}</span></div>
 {error&&<div role="alert" className="error-box">{error}</div>}
 <div className="chat-messages">{!thread.length&&<p className="muted chat-empty-list">Мессеж алга. Эхний мессежээ бичээрэй.</p>}{thread.map(msg=><div key={msg.id} className={'chat-bubble'+(msg.sender===me.email?' mine':'')}>{peer===TEAM&&msg.sender!==me.email&&<small><span className="chat-avatar chat-avatar-tiny">{avatarOf(msg.sender)?<img src={avatarOf(msg.sender)!} alt=""/>:name(msg.sender).slice(0,1)}</span>{name(msg.sender)}</small>}<p>{msg.body}</p><time>{dateLabel(msg.created_at)}</time></div>)}<div ref={bottomRef}/></div>
 <form className="chat-composer" onSubmit={submit}><EmojiPicker onPick={e=>setBody(b=>b+e)}/><Input aria-label="Мессеж бичих" value={body} maxLength={2000} placeholder="Мессежээ бичнэ үү…" onChange={e=>setBody(e.target.value)}/><Button className="primary" type="submit" disabled={busy||!body.trim()}>{busy?<Loader2 size={16} className="spin"/>:<Send size={16}/>}</Button></form>
 </>}</section>
 </div>;
}
