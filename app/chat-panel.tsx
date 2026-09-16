'use client';
import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import {Send,MessageSquare,Loader2} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {dateLabel} from '@/lib/crm';
import type {Member} from '@/lib/crm';
type Conversation={peer:string;body:string;created_at:string;mine:boolean;unread:number};
type Msg={id:string;sender:string;recipient:string;body:string;created_at:string;read_at:string|null};
async function request(body?:unknown,query=''){const r=await fetch('/api/messages'+query,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{cache:'no-store'});const d=await r.json() as {error?:string};if(!r.ok)throw new Error(d.error||'Мессеж ачаалахад алдаа гарлаа.');return d;}
export default function ChatPanel({me,members,onRead}:{me:Member;members:Member[];onRead:()=>void}){
 const [peer,setPeer]=useState(''),[conversations,setConversations]=useState<Conversation[]>([]),[thread,setThread]=useState<Msg[]>([]),[body,setBody]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 const bottomRef=useRef<HTMLDivElement>(null);
 const peers=members.filter(p=>p.email!==me.email&&p.active);
 const loadConversations=useCallback(async()=>{try{const d=await request() as {items:Conversation[]};setConversations(d.items);}catch(e){setError((e as Error).message);}},[]);
 const loadThread=useCallback(async(p:string)=>{try{const d=await request(undefined,'?peer='+encodeURIComponent(p)) as {items:Msg[]};setThread(d.items);}catch(e){setError((e as Error).message);}},[]);
 useEffect(()=>{void loadConversations().finally(()=>setLoading(false));const timer=setInterval(loadConversations,8000);return()=>clearInterval(timer);},[loadConversations]);
 useEffect(()=>{if(!peer)return;void loadThread(peer);request({action:'read',peer}).then(()=>{void loadConversations();onRead();}).catch(()=>{});const timer=setInterval(()=>void loadThread(peer),4000);return()=>clearInterval(timer);},[peer,loadThread,loadConversations,onRead]);
 useEffect(()=>{bottomRef.current?.scrollIntoView({block:'nearest'});},[thread]);
 const submit=async(e:FormEvent)=>{e.preventDefault();const text=body.trim();if(!text||!peer)return;setBusy(true);setBody('');try{await request({action:'send',peer,body:text});await Promise.all([loadThread(peer),loadConversations()]);}catch(e){setError((e as Error).message);setBody(text);}finally{setBusy(false);}};
 const name=(email:string)=>members.find(p=>p.email===email)?.name||email;
 return <div className="chat-layout">
 <aside className="chat-list"><div className="chat-list-head"><h2>Ажилтнууд</h2>{loading&&<Loader2 size={15} className="spin muted"/>}</div>
 <div className="chat-list-scroll">{peers.map(p=>{const c=conversations.find(x=>x.peer===p.email);return <button key={p.email} className={'chat-peer'+(peer===p.email?' active':'')} onClick={()=>setPeer(p.email)}><span className="chat-avatar">{p.name.slice(0,1)}</span><span className="chat-peer-info"><strong>{p.name}</strong>{c&&<small>{c.mine?'Та: ':''}{c.body}</small>}</span>{!!c?.unread&&<b className="chat-unread">{c.unread}</b>}</button>;})}
 {!peers.length&&<p className="muted chat-empty-list">Идэвхтэй бусад ажилтан алга.</p>}</div></aside>
 <section className="chat-thread">{!peer?<div className="chat-empty"><MessageSquare size={28}/><strong>Ажилтан сонгоно уу</strong><p>Зүүн талаас ажилтнаа сонгоод чат эхлүүлээрэй.</p></div>:<>
 <div className="chat-thread-head"><strong>{name(peer)}</strong></div>
 {error&&<div role="alert" className="error-box">{error}</div>}
 <div className="chat-messages">{!thread.length&&<p className="muted chat-empty-list">Мессеж алга. Эхний мессежээ бичээрэй.</p>}{thread.map(msg=><div key={msg.id} className={'chat-bubble'+(msg.sender===me.email?' mine':'')}><p>{msg.body}</p><time>{dateLabel(msg.created_at)}</time></div>)}<div ref={bottomRef}/></div>
 <form className="chat-composer" onSubmit={submit}><Input aria-label="Мессеж бичих" value={body} maxLength={2000} placeholder="Мессежээ бичнэ үү…" onChange={e=>setBody(e.target.value)}/><Button className="primary" type="submit" disabled={busy||!body.trim()}>{busy?<Loader2 size={16} className="spin"/>:<Send size={16}/>}</Button></form>
 </>}</section>
 </div>;
}
