'use client';
import {useUnsavedChanges} from '@/components/draft-guard';
import AvatarImage from 'next/image';
import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import {ArrowLeft,Send,MessageSquare,Loader2,Users,Smile,Reply,X,SmilePlus,ImagePlus,Pin,Plus} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Popover,PopoverContent,PopoverTrigger} from '@/components/ui/popover';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {dateLabel,canDm,isAdminLike} from '@/lib/crm';
import type {Member} from '@/lib/crm';
import {useClock} from '@/hooks/use-clock';
const canCreateGroup=(role:string)=>role==='manager'||isAdminLike(role);
// Идэвхтэй ажилтан бүр 30 секунд тутамд ямар нэг API-г polling хийдэг тул 90 секундийн цонх л хангалттай.
const ONLINE_MS=90000;
const EMOJIS=['😀','😁','😂','🤣','😊','🙂','😉','😍','😘','😎','🤔','😅','😢','😭','😡','😱','👍','👎','👏','🙏','💪','🔥','🎉','✅','❌','❤️','💯','🙌','👌','🤝','📌','⏰','📞','💬','😴','🥳','🤗','😐','🙄','🤩'];
const REACT_EMOJIS=['👍','❤️','😂','😮','😢','🙏'];
type Conversation={peer:string;body:string;created_at:string;mine:boolean;unread:number;image?:string|null};
type Reaction={emoji:string;count:number;mine:boolean;actors:string[]};
type Msg={id:string;sender:string;recipient?:string;body:string;created_at:string;read_at?:string|null;reply_to_id?:string|null;reply_to_sender?:string|null;reply_to_body?:string|null;image?:string|null;mentions?:string[];mentions_all?:boolean;reactions?:Reaction[]};
type TeamRead={email:string;last_read_at:string};
type ChannelSummary={channel:string;label:string;unread:number;mentioned?:boolean;last:{sender:string;body:string;created_at:string;image?:string|null}|null;group?:boolean};
type ChannelMember={email:string;name:string};
// Мессежийн текстийг "@Нэр" хэлбэрийн дурдалт тус бүрээр нь салгаж, тусад нь өнгөөр ялгаж харуулна.
function renderBody(text:string){
 const parts=text.split(/(@[\p{L}\p{N}_]+)/gu);
 return parts.map((p,i)=>p.startsWith('@')?<span key={i} className="mention">{p}</span>:p);
}
type Summary={dm:number;team:number;total:number;channels:ChannelSummary[]};
type ReplyTarget={id:string;sender:string;body:string};
const snippet=(s:string,n=120)=>s.length>n?s.slice(0,n)+'…':s;
// Мессежийн урьдчилан харуулах текст: зөвхөн зурагтай, текстгүй мессежийг тэмдэгээр ялгана.
const previewText=(m:{body:string;image?:string|null}|null|undefined)=>m?m.body||(m.image?'📷 Зураг':''):'';
const MAX_IMAGE=5*1024*1024;
async function request(body?:unknown,query=''){const r=await fetch('/api/messages'+query,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)}:{cache:'no-store',signal:AbortSignal.timeout(20000)});const d=await r.json() as {error?:string};if(!r.ok)throw new Error(d.error||'Мессеж ачаалахад алдаа гарлаа.');return d;}
function EmojiPicker({onPick}:{onPick:(e:string)=>void}){
 const [open,setOpen]=useState(false);
 return <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><Button type="button" variant="ghost" size="icon" aria-label="Эможи нэмэх"><Smile size={18}/></Button></PopoverTrigger><PopoverContent align="end" className="emoji-picker">{EMOJIS.map(e=><button type="button" key={e} onClick={()=>{onPick(e);setOpen(false);}}>{e}</button>)}</PopoverContent></Popover>;
}
function ReactionPicker({onPick}:{onPick:(e:string)=>void}){
 const [open,setOpen]=useState(false);
 return <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><button type="button" className="bubble-action" aria-label="Сэтгэгдэл нэмэх"><SmilePlus size={13}/></button></PopoverTrigger><PopoverContent align="start" className="reaction-picker">{REACT_EMOJIS.map(e=><button type="button" key={e} onClick={()=>{onPick(e);setOpen(false);}}>{e}</button>)}</PopoverContent></Popover>;
}
export default function ChatPanel({me,members,onRead}:{me:Member;members:Member[];onRead:()=>void}){
 const [peer,setPeer]=useState(''),[conversations,setConversations]=useState<Conversation[]>([]),[summary,setSummary]=useState<Summary|null>(null),[thread,setThread]=useState<Msg[]>([]),[teamReads,setTeamReads]=useState<TeamRead[]>([]),[body,setBody]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[loading,setLoading]=useState(true),[replyTarget,setReplyTarget]=useState<ReplyTarget|null>(null);
 const [image,setImage]=useState<string|null>(null),[imageError,setImageError]=useState('');
 const now=useClock();
 const selectedPeer=useRef('');
 const [drafts,setDrafts]=useState<Record<string,{body:string;image:string|null;reply:ReplyTarget|null}>>({});
 useUnsavedChanges(!!body||!!image||!!replyTarget||busy||Object.values(drafts).some(d=>!!d.body||!!d.image||!!d.reply));
 const selectPeer=(value:string)=>{if(value===peer||busy)return;setDrafts(d=>{const next={...d};if(peer)next[peer]={body,image,reply:replyTarget};delete next[value];return next;});const draft=drafts[value];selectedPeer.current=value;setStickToBottom(true);setPeer(value);setThread([]);setTeamReads([]);setChannelMembers([]);setMentionQuery(null);setBody(draft?.body||'');setReplyTarget(draft?.reply||null);setImage(draft?.image||null);setImageError('');setError('');};
 const bottomRef=useRef<HTMLDivElement>(null);
 const messagesRef=useRef<HTMLDivElement>(null);
 // Хэрэглэгч дээшээ гүйлгээд хуучин мессежээ уншиж байгаа бол poll бүрд доошоо шидэхгүй байхын тулд
 // хамгийн доод хэсэгт байгаа эсэхийг хянана; шинэ чат сонгох бүрд дахин доошоо очно.
 const [stickToBottom,setStickToBottom]=useState(true);
 const onMessagesScroll=()=>{const el=messagesRef.current;if(!el)return;setStickToBottom(el.scrollHeight-el.scrollTop-el.clientHeight<80);};
 const fileInputRef=useRef<HTMLInputElement>(null);
 const bodyRef=useRef<HTMLInputElement>(null);
 const [channelMembers,setChannelMembers]=useState<ChannelMember[]>([]);
 const [mentionQuery,setMentionQuery]=useState<string|null>(null);
 const [groupOpen,setGroupOpen]=useState(false),[groupName,setGroupName]=useState(''),[groupMembers,setGroupMembers]=useState<string[]>([]),[groupBusy,setGroupBusy]=useState(false),[groupError,setGroupError]=useState('');
 const peers=members.filter(p=>p.email!==me.email&&p.active&&canDm(me.role,p.role));
 // Тогтмол 3 суваг болон Ахлах/Админ үүсгэсэн групп чат хоёулаа "channel" тул summary-д байгаа
 // эсэхээр нь ялгана (teamChannels-ийн статик жагсаалтаас гадна групп чат динамикаар нэмэгддэг).
 const channelIds=new Set((summary?.channels||[]).map(c=>c.channel));
 const isChannel=(id:string)=>channelIds.has(id);
 const channelIdsRef=useRef(channelIds);
 useEffect(()=>{channelIdsRef.current=channelIds;});
 // Тухайн (сонгосон) сувагт эрхтэй бусад идэвхтэй гишүүд; "N/M үзсэн" тоо болон @дурдах жагсаалт
 // хоёулаа сервэрээс ирсэн бодит гишүүдийн жагсаалтыг ашиглана (тогтмол суваг, групп чат хоёуланд адил).
 const seenDenominator=channelMembers.length;
 const mentionCandidates:ChannelMember[]=isChannel(peer)?[{email:'all',name:'Бүгд'},...channelMembers]:[];
 const mentionMatches=mentionQuery===null?[]:mentionCandidates.filter(c=>c.name.toLowerCase().startsWith(mentionQuery.toLowerCase()));
 // Групп чат (суваг)-ууд байнга дээд талд бэхлэгдэнэ; хувийн харилцан яриа доор нь хамгийн сүүлд
 // ирсэн мессежээр эрэмбэлэгдэнэ.
 const listItems=[
  ...(summary?.channels||[]).map(c=>({kind:'channel' as const,id:c.channel,label:c.label,last:c.last,unread:c.unread,mentioned:!!c.mentioned,member:null as Member|null})),
  ...peers.map(p=>{const c=conversations.find(x=>x.peer===p.email);return {kind:'peer' as const,id:p.email,label:p.name,last:c||null,unread:c?.unread||0,mentioned:false,member:p};}),
 ].sort((a,b)=>{
  if(a.kind!==b.kind)return a.kind==='channel'?-1:1;
  return (b.last?.created_at||'').localeCompare(a.last?.created_at||'');
 });
 // Мессежийн төгсгөлд "@үг" бичиж байгаа эсэхийг шалгаж, @дурдах санал болгох жагсаалтыг харуулна.
 const onBodyChange=(v:string)=>{setBody(v);const trailing=v.match(/(?:^|\s)@([\p{L}\p{N}_]*)$/u);setMentionQuery(peerIsChannel&&trailing?trailing[1]:null);};
 const pickMention=(c:ChannelMember)=>{const insertText=c.email==='all'?'Бүгд':c.name;setBody(b=>b.replace(/@[\p{L}\p{N}_]*$/u,'@'+insertText+' '));setMentionQuery(null);bodyRef.current?.focus();};
 const pickImage=async(e:React.ChangeEvent<HTMLInputElement>)=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;setImageError('');if(!file.type.startsWith('image/')){setImageError('Зөвхөн зураг сонгоно уу.');return;}if(file.size>MAX_IMAGE){setImageError('Зургийн хэмжээ 5MB-аас бага байна.');return;}try{const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(new Error('Файл уншиж чадсангүй.'));reader.onload=()=>resolve(reader.result as string);reader.readAsDataURL(file);});setImage(data);}catch(e){setImageError((e as Error).message);}};
 const loadConversations=useCallback(async()=>{try{const [c,s]=await Promise.all([request() as Promise<{items:Conversation[]}>,request(undefined,'?summary=1') as Promise<Summary>]);setConversations(c.items);setSummary(s);}catch(e){setError((e as Error).message);}},[]);
 const createGroup=async(e:FormEvent)=>{e.preventDefault();if(!groupName.trim()||!groupMembers.length)return;setGroupBusy(true);setGroupError('');try{const d=await request({action:'create_group',name:groupName.trim(),members:groupMembers}) as {id:string};setGroupOpen(false);await loadConversations();selectPeer(d.id);}catch(e){setGroupError((e as Error).message);}finally{setGroupBusy(false);}};
 const loadThread=useCallback(async(p:string)=>{try{if(channelIdsRef.current.has(p)){const d=await request(undefined,'?team=1&channel='+p) as {items:Msg[];reads:TeamRead[];members:ChannelMember[]};if(selectedPeer.current===p){setThread(d.items);setTeamReads(d.reads);setChannelMembers(d.members);setError('');}}else{const d=await request(undefined,'?peer='+encodeURIComponent(p)) as {items:Msg[]};if(selectedPeer.current===p){setThread(d.items);setError('');}}}catch(e){if(selectedPeer.current===p)setError((e as Error).message);}},[]);
 const seenCount=(createdAt:string)=>teamReads.filter(r=>r.last_read_at>=createdAt).length;
 const seenBy=(createdAt:string)=>teamReads.filter(r=>r.last_read_at>=createdAt).map(r=>r.email);
 // Идэвхгүй tab дээр polling зогсоож сервер рүү дэмий хүсэлт явуулахгүй.
 useEffect(()=>{let stopped=false;const run=()=>{if(document.visibilityState==='visible')void loadConversations();};const initial=setTimeout(()=>{void loadConversations().finally(()=>{if(!stopped)setLoading(false);});},0);const timer=setInterval(run,8000);document.addEventListener('visibilitychange',run);return()=>{stopped=true;clearTimeout(initial);clearInterval(timer);document.removeEventListener('visibilitychange',run);};},[loadConversations]);
 // Нээлттэй харилцан яриаг зэрэгцүүлж (thread ачаалах, уншсан гэж тэмдэглэх, жагсаалт шинэчлэх) 3 секунд
 // тутам хийснээр дараалсан 3 хүсэлтийн хүлээлтийг арилгаж, чат хурдан мэдрэгддэг болно.
 useEffect(()=>{if(!peer)return;let first=true;const tick=async()=>{if(document.visibilityState!=='visible')return;try{await Promise.all([loadThread(peer),request(channelIdsRef.current.has(peer)?{action:'read_team',channel:peer}:{action:'read',peer}),loadConversations()]);}catch{}if(first){first=false;onRead();}};const onVisible=()=>void tick();void tick();const timer=setInterval(onVisible,3000);document.addEventListener('visibilitychange',onVisible);return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',onVisible);};},[peer,loadThread,loadConversations,onRead]);
 // Илгээх дарангуутаа мессежийг шууд бөмбөлөгт харуулж (optimistic), дараа нь бодит хариугаар баталгаажуулна.
 const submit=async(e:FormEvent)=>{e.preventDefault();const text=body.trim();if((!text&&!image)||!peer)return;const tempId='tmp-'+crypto.randomUUID();const replying=replyTarget,pendingImage=image;setStickToBottom(true);setThread(t=>[...t,{id:tempId,sender:me.email,body:text,created_at:new Date().toISOString(),reply_to_id:replying?.id||null,reply_to_sender:replying?.sender||null,reply_to_body:replying?.body||null,image:pendingImage}]);setBody('');setReplyTarget(null);setImage(null);setImageError('');setBusy(true);try{await request(isChannel(peer)?{action:'send_team',channel:peer,body:text,image:pendingImage||undefined,replyTo:replying?.id}:{action:'send',peer,body:text,image:pendingImage||undefined,replyTo:replying?.id});await Promise.all([loadThread(peer),loadConversations()]);}catch(e){setThread(t=>t.filter(m=>m.id!==tempId));setError((e as Error).message);setBody(text);setReplyTarget(replying);setImage(pendingImage);}finally{setBusy(false);}};
 // Дарахад шууд орон нутагт тэмдэглээд, серверт мэдэгдэнэ; алдаа гарвал бодит thread-ээр солино.
 useEffect(()=>{if(stickToBottom)bottomRef.current?.scrollIntoView({block:'nearest'});},[thread,stickToBottom]);
 const react=async(msg:Msg,emoji:string)=>{
  const kind=isChannel(peer)?'team':'dm';
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
 const name=(email:string)=>isChannel(email)?(summary?.channels.find(c=>c.channel===email)?.label||email):members.find(p=>p.email===email)?.name||email;
 const avatarOf=(email:string)=>members.find(p=>p.email===email)?.avatar||null;
 const online=(email:string)=>{const p=members.find(x=>x.email===email);return !!p?.last_seen&&now-new Date(p.last_seen).getTime()<ONLINE_MS;};
 const peerIsChannel=isChannel(peer);
 return <div className={"chat-layout"+(peer?" has-peer":"")}>
 <aside className="chat-list"><div className="chat-list-head"><h2>Чат</h2><div className="row">{loading&&<Loader2 size={15} className="spin muted"/>}{canCreateGroup(me.role)&&<Button type="button" variant="ghost" size="icon" aria-label="Групп чат үүсгэх" onClick={()=>{setGroupOpen(true);setGroupName('');setGroupMembers([]);setGroupError('');}}><Plus size={18}/></Button>}</div></div>
 {!peer&&error&&<div className="error-box" role="alert">{error}<Button onClick={()=>void loadConversations()}>Дахин оролдох</Button></div>}<div className="chat-list-scroll">
 {listItems.map(item=>item.kind==='channel'?<button key={'c-'+item.id} className={'chat-peer chat-peer-pinned'+(peer===item.id?' active':'')+(item.mentioned?' chat-peer-mentioned':'')} onClick={()=>selectPeer(item.id)}><span className="chat-avatar chat-avatar-team"><Users size={16}/></span><span className="chat-peer-info"><strong>{item.label}<Pin size={11} className="pin-icon"/></strong>{item.last&&<small>{item.last.sender===me.email?'Та: ':''}{previewText(item.last)}</small>}</span>{item.mentioned&&<b className="chat-unread chat-mention-badge">@</b>}{!item.mentioned&&!!item.unread&&<b className="chat-unread">{item.unread}</b>}</button>:<button key={'p-'+item.id} className={'chat-peer'+(peer===item.id?' active':'')} onClick={()=>selectPeer(item.id)}><span className="chat-avatar">{item.member!.avatar?<AvatarImage width={192} height={192} unoptimized src={item.member!.avatar} alt=""/>:item.member!.name.slice(0,1)}<i className={'chat-status'+(online(item.id)?' online':'')}/></span><span className="chat-peer-info"><strong>{item.label}</strong>{item.last&&<small>{item.last.mine?'Та: ':''}{previewText(item.last)}</small>}</span>{!!item.unread&&<b className="chat-unread">{item.unread}</b>}</button>)}
 {!peers.length&&<p className="muted chat-empty-list">Идэвхтэй бусад ажилтан алга.</p>}</div></aside>
 <section className="chat-thread">{!peer?<div className="chat-empty"><MessageSquare size={28}/><strong>Ажилтан эсвэл суваг сонгоно уу</strong><p>Жагсаалтаас ажилтан эсвэл суваг сонгоод чат эхлүүлээрэй.</p></div>:<>
 <div className="chat-thread-head"><Button className="chat-back" variant="ghost" size="icon" disabled={busy} aria-label="Чатын жагсаалт руу буцах" onClick={()=>selectPeer('')}><ArrowLeft size={18}/></Button>{!peerIsChannel&&<span className="chat-avatar">{avatarOf(peer)?<AvatarImage width={192} height={192} unoptimized src={avatarOf(peer)!} alt=""/>:name(peer).slice(0,1)}<i className={'chat-status'+(online(peer)?' online':'')}/></span>}<span><strong>{name(peer)}</strong>{!peerIsChannel&&<small>{online(peer)?'Онлайн':'Идэвхгүй'}</small>}</span></div>
 {error&&<div role="alert" className="error-box">{error}</div>}
 <div className="chat-messages" ref={messagesRef} onScroll={onMessagesScroll}>{!thread.length&&<p className="muted chat-empty-list">Мессеж алга. Эхний мессежээ бичээрэй.</p>}{thread.map((msg,i)=>{const isLast=i===thread.length-1,mine=msg.sender===me.email,mentionsMe=!mine&&(msg.mentions_all||!!msg.mentions?.includes(me.email));return <div key={msg.id} className={'chat-bubble'+(mine?' mine':'')+(mentionsMe?' mentioned':'')}>
 {peerIsChannel&&!mine&&<small><span className="chat-avatar chat-avatar-tiny">{avatarOf(msg.sender)?<AvatarImage width={192} height={192} unoptimized src={avatarOf(msg.sender)!} alt=""/>:name(msg.sender).slice(0,1)}</span>{name(msg.sender)}</small>}
 {msg.reply_to_id&&<div className="chat-reply-quote"><strong>{name(msg.reply_to_sender||'')}</strong><span>{snippet(msg.reply_to_body||'')}</span></div>}
 {msg.body&&<p>{renderBody(msg.body)}</p>}
 {msg.image&&<a href={msg.image} target="_blank" rel="noreferrer"><AvatarImage className="chat-image" width={400} height={400} unoptimized src={msg.image} alt=""/></a>}
 {!!msg.reactions?.length&&<div className="chat-reactions">{msg.reactions.map(r=><button type="button" key={r.emoji} className={'reaction-pill'+(r.mine?' mine':'')} onClick={()=>react(msg,r.emoji)} title={r.actors.length?r.actors.map(name).join(', '):undefined}>{r.emoji} {r.count}</button>)}</div>}
 <time>{dateLabel(msg.created_at)}</time>
 <div className="bubble-actions"><ReactionPicker onPick={e=>react(msg,e)}/><button type="button" className="bubble-action" aria-label="Хариулах" onClick={()=>setReplyTarget({id:msg.id,sender:msg.sender,body:msg.body})}><Reply size={13}/></button></div>
 {isLast&&mine&&!peerIsChannel&&<small className="seen-tag">{msg.read_at?'Үзсэн':'Илгээсэн'}</small>}
 {peerIsChannel&&seenDenominator>0&&<small className="seen-tag" title={seenCount(msg.created_at)?seenBy(msg.created_at).map(name).join(', '):undefined}>{seenCount(msg.created_at)}/{seenDenominator} үзсэн</small>}
 </div>;})}<div ref={bottomRef}/></div>
 {replyTarget&&<div className="chat-reply-banner"><Reply size={14}/><div><strong>{name(replyTarget.sender)}</strong><span>{snippet(replyTarget.body)}</span></div><button type="button" aria-label="Хариулахыг цуцлах" onClick={()=>setReplyTarget(null)}><X size={14}/></button></div>}
 {imageError&&<div role="alert" className="error-box">{imageError}</div>}
 {image&&<div className="chat-image-preview"><AvatarImage width={80} height={80} unoptimized src={image} alt=""/><button type="button" aria-label="Зураг хасах" onClick={()=>setImage(null)}><X size={14}/></button></div>}
 <div className="chat-composer-wrap">
 {mentionQuery!==null&&!!mentionMatches.length&&<div className="mention-list">{mentionMatches.map(c=><button type="button" key={c.email} onClick={()=>pickMention(c)}>{c.name}</button>)}</div>}
 <form className="chat-composer" onSubmit={submit}><EmojiPicker onPick={e=>setBody(b=>b+e)}/><Button type="button" variant="ghost" size="icon" aria-label="Зураг хавсаргах" onClick={()=>fileInputRef.current?.click()}><ImagePlus size={18}/></Button><input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={pickImage}/><Input ref={bodyRef} aria-label="Мессеж бичих" value={body} maxLength={2000} placeholder={peerIsChannel?'Мессежээ бичнэ үү… (@ дараад дурдах гишүүнээ сонго)':'Мессежээ бичнэ үү…'} onChange={e=>onBodyChange(e.target.value)}/><Button className="primary" type="submit" aria-label="Мессеж илгээх" disabled={busy||(!body.trim()&&!image)}>{busy?<Loader2 size={16} className="spin"/>:<Send size={16}/>}</Button></form>
 </div>
 </>}</section>
 <Dialog open={groupOpen} onOpenChange={setGroupOpen}><DialogContent><DialogHeader><DialogTitle>Шинэ групп чат</DialogTitle><DialogDescription>Нэр өгөөд, оруулах гишүүдээ сонгоно уу.</DialogDescription></DialogHeader><form className="form-stack" onSubmit={createGroup}>
 {groupError&&<div role="alert" className="error-box">{groupError}</div>}
 <label className="field"><span>Чатын нэр *</span><Input required maxLength={80} value={groupName} onChange={e=>setGroupName(e.target.value)} placeholder="Жишээ: Борлуулалтын төслийн баг"/></label>
 <label className="field"><span>Гишүүд *</span><div className="group-member-list">{members.filter(p=>p.email!==me.email&&p.active).map(p=><label key={p.email} className="group-member-row"><input type="checkbox" checked={groupMembers.includes(p.email)} onChange={e=>setGroupMembers(g=>e.target.checked?[...g,p.email]:g.filter(x=>x!==p.email))}/><span>{p.name}</span><small>{p.email}</small></label>)}</div></label>
 <Button type="submit" className="primary full" disabled={groupBusy||!groupName.trim()||!groupMembers.length}>{groupBusy?<Loader2 className="spin" size={16}/>:<Plus size={16}/>}Үүсгэх</Button>
 </form></DialogContent></Dialog>
 </div>;
}
