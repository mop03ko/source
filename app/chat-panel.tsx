'use client';
import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import {Send,MessageSquare,Loader2,Users,Smile,Reply,X,SmilePlus} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Popover,PopoverContent,PopoverTrigger} from '@/components/ui/popover';
import {dateLabel} from '@/lib/crm';
import type {Member} from '@/lib/crm';
const TEAM='__team__';
// Идэвхтэй ажилтан бүр 30 секунд тутамд ямар нэг API-г polling хийдэг тул 90 секундийн цонх л хангалттай.
const ONLINE_MS=90000;
const EMOJIS=['😀','😁','😂','🤣','😊','🙂','😉','😍','😘','😎','🤔','😅','😢','😭','😡','😱','👍','👎','👏','🙏','💪','🔥','🎉','✅','❌','❤️','💯','🙌','👌','🤝','📌','⏰','📞','💬','😴','🥳','🤗','😐','🙄','🤩'];
const REACT_EMOJIS=['👍','❤️','😂','😮','😢','🙏'];
type Conversation={peer:string;body:string;created_at:string;mine:boolean;unread:number};
type Reaction={emoji:string;count:number;mine:boolean;actors:string[]};
type Msg={id:string;sender:string;recipient?:string;body:string;created_at:string;read_at?:string|null;reply_to_id?:string|null;reply_to_sender?:string|null;reply_to_body?:string|null;reactions?:Reaction[]};
type TeamRead={email:string;last_read_at:string};
type Summary={dm:number;team:number;total:number;lastTeam:{sender:string;body:string;created_at:string}|null};
type ReplyTarget={id:string;sender:string;body:string};
const snippet=(s:string,n=120)=>s.length>n?s.slice(0,n)+'…':s;
async function request(body?:unknown,query=''){const r=await fetch('/api/messages'+query,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{cache:'no-store'});const d=await r.json() as {error?:string};if(!r.ok)throw new Error(d.error||'Мессеж ачаалахад алдаа гарлаа.');return d;}
function EmojiPicker({onPick}:{onPick:(e:string)=>void}){
 const [open,setOpen]=useState(false);
 return <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><Button type="button" variant="ghost" size="icon" aria-label="Emoji нэмэх"><Smile size={18}/></Button></PopoverTrigger><PopoverContent align="end" className="emoji-picker">{EMOJIS.map(e=><button type="button" key={e} onClick={()=>{onPick(e);setOpen(false);}}>{e}</button>)}</PopoverContent></Popover>;
}
function ReactionPicker({onPick}:{onPick:(e:string)=>void}){
 const [open,setOpen]=useState(false);
 return <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><button type="button" className="bubble-action" aria-label="Reaction нэмэх"><SmilePlus size={13}/></button></PopoverTrigger><PopoverContent align="start" className="reaction-picker">{REACT_EMOJIS.map(e=><button type="button" key={e} onClick={()=>{onPick(e);setOpen(false);}}>{e}</button>)}</PopoverContent></Popover>;
}
export default function ChatPanel({me,members,onRead}:{me:Member;members:Member[];onRead:()=>void}){
 const [peer,setPeer]=useState(''),[conversations,setConversations]=useState<Conversation[]>([]),[summary,setSummary]=useState<Summary|null>(null),[thread,setThread]=useState<Msg[]>([]),[teamReads,setTeamReads]=useState<TeamRead[]>([]),[body,setBody]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[loading,setLoading]=useState(true),[replyTarget,setReplyTarget]=useState<ReplyTarget|null>(null);
 const bottomRef=useRef<HTMLDivElement>(null);
 const peers=members.filter(p=>p.email!==me.email&&p.active);
 const loadConversations=useCallback(async()=>{try{const [c,s]=await Promise.all([request() as Promise<{items:Conversation[]}>,request(undefined,'?summary=1') as Promise<Summary>]);setConversations(c.items);setSummary(s);}catch(e){setError((e as Error).message);}},[]);
 const loadThread=useCallback(async(p:string)=>{try{if(p===TEAM){const d=await request(undefined,'?team=1') as {items:Msg[];reads:TeamRead[]};setThread(d.items);setTeamReads(d.reads);}else{const d=await request(undefined,'?peer='+encodeURIComponent(p)) as {items:Msg[]};setThread(d.items);}}catch(e){setError((e as Error).message);}},[]);
 const seenCount=(createdAt:string)=>teamReads.filter(r=>r.last_read_at>=createdAt).length;
 const seenBy=(createdAt:string)=>teamReads.filter(r=>r.last_read_at>=createdAt).map(r=>r.email);
 // Идэвхгүй tab дээр polling зогсоож сервер рүү дэмий хүсэлт явуулахгүй.
 useEffect(()=>{let stopped=false;const run=()=>{if(document.visibilityState==='visible')void loadConversations();};void loadConversations().finally(()=>{if(!stopped)setLoading(false);});const timer=setInterval(run,8000);document.addEventListener('visibilitychange',run);return()=>{stopped=true;clearInterval(timer);document.removeEventListener('visibilitychange',run);};},[loadConversations]);
 useEffect(()=>{setThread([]);setReplyTarget(null);},[peer]);
 // Нээлттэй харилцан яриаг зэрэгцүүлж (thread ачаалах, уншсан гэж тэмдэглэх, жагсаалт шинэчлэх) 3 секунд
 // тутам хийснээр дараалсан 3 хүсэлтийн хүлээлтийг арилгаж, чат хурдан мэдрэгддэг болно.
 useEffect(()=>{if(!peer)return;let first=true;const tick=async()=>{if(document.visibilityState!=='visible')return;try{await Promise.all([loadThread(peer),request(peer===TEAM?{action:'read_team'}:{action:'read',peer}),loadConversations()]);}catch{}if(first){first=false;onRead();}};const onVisible=()=>void tick();void tick();const timer=setInterval(onVisible,3000);document.addEventListener('visibilitychange',onVisible);return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',onVisible);};},[peer,loadThread,loadConversations,onRead]);
 useEffect(()=>{bottomRef.current?.scrollIntoView({block:'nearest'});},[thread]);
 // Илгээх дарангуутаа мессежийг шууд бөмбөлөгт харуулж (optimistic), дараа нь бодит хариугаар баталгаажуулна.
 const submit=async(e:FormEvent)=>{e.preventDefault();const text=body.trim();if(!text||!peer)return;const tempId='tmp-'+Date.now();const replying=replyTarget;setThread(t=>[...t,{id:tempId,sender:me.email,body:text,created_at:new Date().toISOString(),reply_to_id:replying?.id||null,reply_to_sender:replying?.sender||null,reply_to_body:replying?.body||null}]);setBody('');setReplyTarget(null);setBusy(true);try{await request(peer===TEAM?{action:'send_team',body:text,replyTo:replying?.id}:{action:'send',peer,body:text,replyTo:replying?.id});await Promise.all([loadThread(peer),loadConversations()]);}catch(e){setThread(t=>t.filter(m=>m.id!==tempId));setError((e as Error).message);setBody(text);setReplyTarget(replying);}finally{setBusy(false);}};
 // Дарахад шууд орон нутагт тэмдэглээд, серверт мэдэгдэнэ; алдаа гарвал бодит thread-ээр солино.
 const react=async(msg:Msg,emoji:string)=>{
  const kind=peer===TEAM?'team':'dm';
  setThread(t=>t.map(m=>{
   if(m.id!==msg.id)return m;
   const list=m.reactions?[...m.reactions]:[];
   const idx=list.findIndex(r=>r.emoji===emoji);
   if(idx>=0){const cur=list[idx];if(cur.mine){if(cur.count<=1)list.splice(idx,1);else list[idx]={...cur,count:cur.count-1,mine:false,actors:cur.actors.filter(a=>a!==me.email)};}else list[idx]={...cur,count:cur.count+1,mine:true,actors:[...cur.actors,me.email]};}
   else list.push({emoji,count:1,mine:true,actors:[me.email]});
   return {...m,reactions:list};
  }));
  try{await request({action:'react',kind,messageId:msg.id,emoji});}catch(e){setError((e as Error).message);void loadThread(peer);}
 };
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
 <div className="chat-messages">{!thread.length&&<p className="muted chat-empty-list">Мессеж алга. Эхний мессежээ бичээрэй.</p>}{thread.map((msg,i)=>{const isLast=i===thread.length-1,mine=msg.sender===me.email;return <div key={msg.id} className={'chat-bubble'+(mine?' mine':'')}>
 {peer===TEAM&&!mine&&<small><span className="chat-avatar chat-avatar-tiny">{avatarOf(msg.sender)?<img src={avatarOf(msg.sender)!} alt=""/>:name(msg.sender).slice(0,1)}</span>{name(msg.sender)}</small>}
 {msg.reply_to_id&&<div className="chat-reply-quote"><strong>{name(msg.reply_to_sender||'')}</strong><span>{snippet(msg.reply_to_body||'')}</span></div>}
 <p>{msg.body}</p>
 {!!msg.reactions?.length&&<div className="chat-reactions">{msg.reactions.map(r=><button type="button" key={r.emoji} className={'reaction-pill'+(r.mine?' mine':'')} title={r.actors.length?r.actors.map(name).join(', '):undefined} onClick={()=>react(msg,r.emoji)}>{r.emoji} {r.count}</button>)}</div>}
 <time>{dateLabel(msg.created_at)}</time>
 <div className="bubble-actions"><ReactionPicker onPick={e=>react(msg,e)}/><button type="button" className="bubble-action" aria-label="Хариулах" onClick={()=>setReplyTarget({id:msg.id,sender:msg.sender,body:msg.body})}><Reply size={13}/></button></div>
 {isLast&&mine&&peer!==TEAM&&<small className="seen-tag">{msg.read_at?'Үзсэн':'Илгээсэн'}</small>}
 {peer===TEAM&&peers.length>0&&<small className="seen-tag" title={seenCount(msg.created_at)?seenBy(msg.created_at).map(name).join(', '):undefined}>{seenCount(msg.created_at)}/{peers.length} үзсэн</small>}
 </div>;})}<div ref={bottomRef}/></div>
 {replyTarget&&<div className="chat-reply-banner"><Reply size={14}/><div><strong>{name(replyTarget.sender)}</strong><span>{snippet(replyTarget.body)}</span></div><button type="button" aria-label="Хариулахыг цуцлах" onClick={()=>setReplyTarget(null)}><X size={14}/></button></div>}
 <form className="chat-composer" onSubmit={submit}><EmojiPicker onPick={e=>setBody(b=>b+e)}/><Input aria-label="Мессеж бичих" value={body} maxLength={2000} placeholder="Мессежээ бичнэ үү…" onChange={e=>setBody(e.target.value)}/><Button className="primary" type="submit" disabled={busy||!body.trim()}>{busy?<Loader2 size={16} className="spin"/>:<Send size={16}/>}</Button></form>
 </>}</section>
 </div>;
}
