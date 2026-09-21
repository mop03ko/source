'use client';
import {useState,useRef,useEffect} from 'react';
import {useIsMobile} from '@/hooks/use-mobile';
import {CalendarDays,ChevronLeft,ChevronRight,Check,X,Loader2,Inbox,Plus,Users,Clock} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {Field} from '@/components/form-field';
import {SelectControl,TextareaControl} from '@/components/ui/form-controls';
import {GuardedForm,markFormSaved,markFormError} from '@/components/draft-guard';
import {AsyncStatus} from '@/components/async-status';
import {useRemote} from '@/hooks/use-remote';
import {toast} from '@/components/ui/sonner';
import {shiftAssignments,shiftOff,shiftIsWork,shiftRequestKinds,shiftRequestStatuses,requestDateLabel,type WorkShift,type ShiftRequest} from '@/lib/crm';
type Data={month:string;shifts:WorkShift[];requests:ShiftRequest[];people:{person_name:string;member_email:string|null;days:number}[];can_manage:boolean;me:{name:string;email:string;names:string[]}};
const WEEKDAYS=['Ня','Да','Мя','Лх','Пү','Ба','Бя'];
// Нүдэнд багтахаар томилгоо бүрийг 2-4 тэмдэгтээр харуулна.
const SHORT:Record<string,string>={'Хүргэлт':'Хүр','Олимпик':'Оли','Юнион':'Юни','Түмэнмолл':'Түм','Gotomarket':'Goto','ИЦА':'ИЦА','Тооллого':'Тоо','Амралт':'а','Чөлөө':'Ч'};
const TINT:Record<string,string>={'Хүргэлт':'#e8f1ff','Олимпик':'#eafaf0','Юнион':'#fff4e5','Түмэнмолл':'#f3ecff','Gotomarket':'#e6faf8','ИЦА':'#fdeaf3','Тооллого':'#fff9d6','Амралт':'#f2f2f2','Чөлөө':'#ffe9e9'};
const todayUB=()=>new Date(Date.now()+8*3600000).toISOString().slice(0,10);
const shiftMonth=(m:string,delta:number)=>{const [y,mo]=m.split('-').map(Number);const d=new Date(Date.UTC(y,mo-1+delta,1));return d.getUTCFullYear()+'-'+String(d.getUTCMonth()+1).padStart(2,'0');};
function monthDays(month:string){const [y,mo]=month.split('-').map(Number);const out:string[]=[];const last=new Date(Date.UTC(y,mo,0)).getUTCDate();for(let d=1;d<=last;d++)out.push(`${month}-${String(d).padStart(2,'0')}`);return out;}
const weekdayOf=(day:string)=>WEEKDAYS[new Date(day+'T00:00:00Z').getUTCDay()];
const isWeekend=(day:string)=>[0,6].includes(new Date(day+'T00:00:00Z').getUTCDay());
export default function SchedulePanel({month,onMonthChange,refresh=0}:{month:string;onMonthChange:(month:string)=>void;refresh?:number}){
 const setMonth=onMonthChange;
 const mobile=useIsMobile(),gridRef=useRef<HTMLDivElement>(null);
 const [layout,setLayout]=useState<'auto'|'month'|'day'>('auto');
 const daily=layout==='day'||(layout==='auto'&&mobile);
 const [query,setQuery]=useState(''),[location,setLocation]=useState(''),[onlyMine,setOnlyMine]=useState(false);
 const [selected,setSelected]=useState(todayUB());
 const selectedDay=selected.startsWith(month+'-')?selected:month+'-01';
 const [requestStatus,setRequestStatus]=useState('pending'),[requestKind,setRequestKind]=useState('leave');
 const [decision,setDecision]=useState<{request:ShiftRequest;approve:boolean}|null>(null);
 const [mode,setMode]=useState<'grid'|'requests'>('grid');
 const [revision,setRevision]=useState(0),[busy,setBusy]=useState(false);
 const [cell,setCell]=useState<{person:string;day:string;email:string|null;assignment:string;note:string}|null>(null);
 const [addOpen,setAddOpen]=useState(false);
 const data=useRemote<Data>('/api/schedule?'+new URLSearchParams({month,revision:String(revision),refresh:String(refresh)}));
 const d=data.data;
 const days=monthDays(month);
 useEffect(()=>{const grid=gridRef.current,header=grid?.querySelector('thead .schedule-selected');if(!daily&&d&&grid&&header)grid.scrollLeft+=header.getBoundingClientRect().left-grid.getBoundingClientRect().left-grid.clientWidth/2+header.clientWidth/2;},[daily,selectedDay,d]);
 const byPerson=new Map<string,Map<string,WorkShift>>();
 for(const s of d?.shifts||[]){if(!byPerson.has(s.person_name))byPerson.set(s.person_name,new Map());byPerson.get(s.person_name)!.set(s.day,s);}
 const people=[...byPerson.keys()].sort((a,b)=>a.localeCompare(b,'mn'));
 const mine=new Set(d?.me.names||[]);
 const pending=(d?.requests||[]).filter(r=>r.status==='pending');
 const visiblePeople=people.filter(p=>(!onlyMine||mine.has(p))&&p.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())&&(!location||(daily?byPerson.get(p)?.get(selectedDay)?.assignment===location:days.some(day=>byPerson.get(p)?.get(day)?.assignment===location))));
 const requests=(d?.requests||[]).filter(r=>(!requestStatus||r.status===requestStatus)&&(!onlyMine||mine.has(r.person_name))&&r.person_name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
 const openCell=(person:string,day:string)=>{const shift=byPerson.get(person)?.get(day);setRequestKind('leave');setCell({person,day,email:shift?.member_email||[...(byPerson.get(person)?.values()||[])].find(s=>s.member_email)?.member_email||null,assignment:shift?.assignment||'',note:shift?.note||''});};
 const chooseDay=(day:string)=>{setSelected(day);};
 const goToday=()=>{setMonth(todayUB().slice(0,7));setSelected(todayUB());};
 const post=async(action:string,payload:unknown,id?:string,version?:number)=>{
  setBusy(true);
  try{
   const r=await fetch('/api/schedule',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,data:payload,id,version})});
   const j=await r.json() as {error?:string;fieldErrors?:Record<string,string>};
   const form=document.activeElement?.closest('form')||null;
   if(!r.ok){markFormError(form,j.error||'Хүсэлт амжилтгүй.',j.fieldErrors);throw new Error(j.error||'Хүсэлт амжилтгүй.');}
   markFormSaved(form);setRevision(v=>v+1);toast.success('Амжилттай.');return j;
  }catch(e){toast.error((e as Error).message);return null;}finally{setBusy(false);}
 };
 // Тухайн өдрийн байршил тус бүрийн хүний тоо — доод мөрөнд хамралтыг харуулна.
 const coverage=(day:string)=>{const counts=new Map<string,number>();for(const p of people){const a=byPerson.get(p)?.get(day)?.assignment;if(a&&shiftIsWork(a))counts.set(a,(counts.get(a)||0)+1);}return counts;};
 const workDays=(p:string)=>days.filter(x=>{const a=byPerson.get(p)?.get(x)?.assignment;return a&&shiftIsWork(a);}).length;
 const offDays=(p:string)=>days.filter(x=>{const a=byPerson.get(p)?.get(x)?.assignment;return a&&shiftOff.includes(a);}).length;
 return <section className="table-panel schedule-panel" aria-label="Ажлын хуваарь">
 <div className="schedule-toolbar">
  <div className="schedule-month"><Button type="button" variant="outline" size="icon" aria-label="Өмнөх сар" onClick={()=>setMonth(shiftMonth(month,-1))}><ChevronLeft/></Button><h2 aria-live="polite">{month.slice(0,4)} оны {Number(month.slice(5))} сар</h2><Button type="button" variant="outline" size="icon" aria-label="Дараагийн сар" onClick={()=>setMonth(shiftMonth(month,1))}><ChevronRight/></Button></div>
  <div className="schedule-primary-actions"><Button variant="outline" onClick={goToday}>Өнөөдөр</Button>{d?.can_manage&&<Button className="primary" onClick={()=>setAddOpen(true)}><Plus size={16}/>Томилгоо нэмэх</Button>}</div>
 </div>
 <div className="schedule-navigation"><div className="view-toggle" aria-label="Хуваарийн хэсэг"><Button variant={mode==='grid'?'default':'outline'} aria-pressed={mode==='grid'} onClick={()=>setMode('grid')}><CalendarDays size={16}/>Хуваарь</Button><Button variant={mode==='requests'?'default':'outline'} aria-pressed={mode==='requests'} onClick={()=>setMode('requests')}><Inbox size={16}/>Хүсэлт {pending.length>0&&<span className="schedule-count">{pending.length}</span>}</Button></div><p>{d?.can_manage?'Томилгоог засахын тулд ажилтны өдрийг сонгоно уу.':'Өөрийн ажлын өдрийг сонгож чөлөө, өдөр шилжүүлэх хүсэлт гаргана.'}</p></div>
 <AsyncStatus error={data.error} loading={data.loading} retry={data.retry}/>
 {d&&!data.error&&<>
 <div className="schedule-filters"><Input aria-label="Хуваарьт ажилтан хайх" placeholder="Ажилтны нэрээр хайх…" value={query} onChange={e=>setQuery(e.target.value)}/><Button variant={onlyMine?'default':'outline'} aria-pressed={onlyMine} onClick={()=>setOnlyMine(v=>!v)}><Users size={16}/>Миний хуваарь</Button>
 {mode==='grid'?<><SelectControl aria-label="Томилгоогоор шүүх" value={location} onChange={e=>setLocation(e.target.value)}><option value="">Бүх томилгоо</option>{shiftAssignments.map(a=><option key={a}>{a}</option>)}</SelectControl><div className="view-toggle schedule-layout"><Button variant={!daily?'default':'outline'} aria-pressed={!daily} onClick={()=>setLayout('month')}>Сараар</Button><Button variant={daily?'default':'outline'} aria-pressed={daily} onClick={()=>setLayout('day')}>Өдрөөр</Button></div></>:<SelectControl aria-label="Хүсэлтийн төлөв" value={requestStatus} onChange={e=>setRequestStatus(e.target.value)}><option value="">Бүх хүсэлт</option>{Object.entries(shiftRequestStatuses).map(([k,v])=><option key={k} value={k}>{v}</option>)}</SelectControl>}
 {(query||onlyMine||location)&&<Button variant="link" onClick={()=>{setQuery('');setOnlyMine(false);setLocation('');}}>Шүүлтүүр цэвэрлэх</Button>}</div>
 {mode==='grid'?<>
 <div className="schedule-daybar"><div><span className="schedule-eyebrow">СОНГОСОН ӨДӨР · УБ ЦАГ</span><div className="schedule-date"><Input type="date" aria-label="Хуваарийн өдөр" value={selectedDay} min={month+'-01'} max={days.at(-1)} onChange={e=>{if(e.target.value)chooseDay(e.target.value);}}/><span>{weekdayOf(selectedDay)} гараг</span></div></div><div className="schedule-day-stats" aria-live="polite"><span><b>{people.filter(p=>{const a=byPerson.get(p)?.get(selectedDay)?.assignment;return a&&shiftIsWork(a);}).length}</b> ажиллах</span><span><b>{people.filter(p=>shiftOff.includes(byPerson.get(p)?.get(selectedDay)?.assignment||'')).length}</b> амрах / чөлөөтэй</span><span><b>{people.filter(p=>!byPerson.get(p)?.has(selectedDay)).length}</b> томилоогүй</span></div></div>
 {pending.length>0&&<div className="schedule-pending"><Clock size={18}/><span><strong>{pending.length} хүсэлт</strong> шийдвэр хүлээж байна</span><Button variant="link" onClick={()=>{setMode('requests');setRequestStatus('pending');setQuery('');setOnlyMine(false);}}>Хүсэлт харах</Button></div>}
 {!visiblePeople.length?<div className="schedule-empty"><CalendarDays size={32}/><h3>{people.length?'Шүүлтүүрт тохирох ажилтан алга':'Энэ сарын хуваарь хараахан бүртгэгдээгүй'}</h3><p>{people.length?'Нэр, томилгооны шүүлтүүрээ өөрчилнө үү.':'Эхний томилгоог нэмснээр ажилтан сарын хуваарьт харагдана.'}</p>{!people.length&&d.can_manage&&<Button onClick={()=>setAddOpen(true)}><Plus size={16}/>Эхний томилгоо нэмэх</Button>}</div>:daily?<div className="schedule-day-list">
 {visiblePeople.map(p=>{const s=byPerson.get(p)?.get(selectedDay);const editable=d.can_manage||(mine.has(p)&&!!s?.assignment&&shiftIsWork(s.assignment));return <article key={p} className="schedule-person-card"><div className="schedule-person"><span className="schedule-avatar">{p.slice(0,1)}</span><div><strong>{p}</strong>{mine.has(p)&&<small>Таны хуваарь</small>}</div></div><span className="schedule-assignment" style={{background:TINT[s?.assignment||'']||'#f5f5f5'}}>{s?.assignment||'Томилоогүй'}</span>{s?.note&&<p>{s.note}</p>}{editable&&<Button variant="outline" onClick={()=>openCell(p,selectedDay)}>{d.can_manage?'Томилгоо засах':'Хүсэлт гаргах'}</Button>}</article>;})}
 </div>:<><p className="schedule-grid-hint">{visiblePeople.length} / {people.length} ажилтан · Бүх өдрийг харахын тулд хүснэгтийг хөндлөн гүйлгэнэ үү.</p><div className="schedule-grid-scroll" ref={gridRef} tabIndex={0} role="region" aria-label="Сарын хуваарь, хөндлөн гүйлгэх боломжтой">
 <table className="schedule-grid"><caption className="sr-only">{month} сарын ажилтнуудын томилгоо</caption><thead><tr><th scope="col" className="schedule-person-head">Ажилтан</th>{days.map(day=><th scope="col" key={day} className={(isWeekend(day)?'schedule-weekend ':'')+(day===selectedDay?'schedule-selected':'')} data-today={day===todayUB()}><button type="button" aria-label={day+' өдрийг сонгох'} aria-pressed={day===selectedDay} onClick={()=>chooseDay(day)}><small>{weekdayOf(day)}</small><strong>{Number(day.slice(8))}</strong>{day===todayUB()&&<i aria-label="Өнөөдөр"/>}</button></th>)}<th scope="col">Ажил</th><th scope="col">Амралт</th></tr></thead><tbody>
 {visiblePeople.map(p=><tr key={p} className={mine.has(p)?'schedule-mine':''}><th scope="row" className="schedule-person-head"><strong>{p}</strong>{mine.has(p)&&<small>Та</small>}</th>{days.map(day=>{const s=byPerson.get(p)?.get(day),a=s?.assignment||'',editable=d.can_manage||(mine.has(p)&&!!a&&shiftIsWork(a));return <td key={day} className={day===selectedDay?'schedule-selected':''}><button type="button" disabled={!editable} className="schedule-cell" style={{background:TINT[a]||undefined}} aria-label={`${p} · ${day} · ${a||'Томилоогүй'}${s?.note?' · '+s.note:''}`} title={`${p} · ${day} · ${a||'Томилоогүй'}${s?.note?' · '+s.note:''}`} onClick={()=>openCell(p,day)}>{SHORT[a]||a||'—'}{s?.note&&<i className="schedule-note-dot"/>}</button></td>;})}<td className="schedule-total">{workDays(p)}</td><td className="schedule-total">{offDays(p)}</td></tr>)}
 <tr className="schedule-coverage"><th scope="row" className="schedule-person-head">Хүргэлтэд ажиллах</th>{days.map(day=><td key={day} className={day===selectedDay?'schedule-selected':''}>{coverage(day).get('Хүргэлт')||0}</td>)}<td/><td/></tr></tbody></table></div></>}
 <details className="schedule-legend"><summary>Томилгооны өнгө, товчлол</summary><div>{Object.entries(SHORT).map(([k,v])=><span key={k}><b style={{background:TINT[k]}}>{v}</b>{k}</span>)}</div></details>
 </>:<div className="schedule-requests" aria-live="polite"><p className="schedule-request-count">{requests.length} хүсэлт · Хүлээгдэж буй хүсэлтэд бусад сарын хүсэлтүүд багтана.</p>{!requests.length?<div className="schedule-empty"><Inbox size={32}/><h3>Энэ төлөвт хүсэлт алга</h3><p>Өөр төлөв сонгож өмнөх хүсэлтүүдийг хараарай.</p>{requestStatus&&<Button variant="outline" onClick={()=>setRequestStatus('')}>Бүх хүсэлт харах</Button>}</div>:requests.map(r=><article className="schedule-request-card" key={r.id}><div className="schedule-request-heading"><div><strong>{r.person_name}</strong><small>{shiftRequestKinds[r.kind]||r.kind} · {requestDateLabel(r.created_at)}</small></div><span className={'stage '+(r.status==='approved'?'stage-won':r.status==='pending'?'stage-pending':'stage-lost')}>{shiftRequestStatuses[r.status]||r.status}</span></div><div className="schedule-request-dates"><CalendarDays size={16}/><strong>{r.from_day}{r.to_day?' → '+r.to_day:''}</strong><span>{r.assignment}</span></div><p>{r.reason||'Шалтгаан бичээгүй'}</p>{r.decision_note&&<p className="schedule-decision-note">Шийдвэр: {r.decision_note}</p>}{r.status==='pending'&&<div className="schedule-request-actions">{d.can_manage&&<><Button disabled={busy} onClick={()=>setDecision({request:r,approve:true})}><Check size={16}/>Батлах</Button><Button variant="outline" disabled={busy} onClick={()=>setDecision({request:r,approve:false})}><X size={16}/>Татгалзах</Button></>}{r.requested_by===d.me.email&&<Button variant="ghost" disabled={busy} onClick={()=>post('cancel_request',{},r.id,r.version)}>Хүсэлтээ татах</Button>}</div>}</article>)}</div>}
 </>}
 <Dialog open={!!decision} onOpenChange={open=>{if(!open&&!busy)setDecision(null);}}><DialogContent><DialogHeader><DialogTitle>{decision?.approve?'Хүсэлт батлах':'Хүсэлтэд татгалзах'}</DialogTitle><DialogDescription>{decision&&`${decision.request.person_name} · ${decision.request.from_day}${decision.request.to_day?' → '+decision.request.to_day:''}`}</DialogDescription></DialogHeader>{decision&&<GuardedForm className="form-stack" onSubmit={async e=>{const f=new FormData(e.currentTarget);if(await post('decide',{approve:decision.approve,note:f.get('note')},decision.request.id,decision.request.version))setDecision(null);}}><p>{decision.approve?'Баталсны дараа ажилтны хуваарь автоматаар шинэчлэгдэнэ.':'Татгалзсан шалтгааныг ажилтан хүсэлтээсээ харна.'}</p><Field label={decision.approve?'Шийдвэрийн тайлбар':'Татгалзах шалтгаан *'}><TextareaControl name="note" required={!decision.approve} rows={3} maxLength={1000}/></Field><Button type="submit" disabled={busy} variant={decision.approve?'default':'destructive'}>{busy?'Хадгалж байна…':decision.approve?'Тийм, батлах':'Татгалзах шийдвэр хадгалах'}</Button></GuardedForm>}</DialogContent></Dialog>
 <Dialog open={!!cell} onOpenChange={o=>{if(!o)setCell(null);}}><DialogContent className="form-dialog">
  <DialogHeader><DialogTitle>{cell?`${cell.person} · ${cell.day}`:''}</DialogTitle><DialogDescription>{cell?.assignment?`Одоогийн томилгоо: ${cell.assignment}`:'Томилгоо бүртгээгүй'}</DialogDescription></DialogHeader>
  {cell&&d&&<div className="form-stack">
   {d.can_manage&&<GuardedForm className="form-stack" onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);
    if(await post('set_shift',{day:cell.day,person_name:cell.person,member_email:cell.email,assignment:f.get('assignment'),note:f.get('note')}))setCell(null);}}>
    <Field label="Томилгоо *"><SelectControl name="assignment" required defaultValue={cell.assignment||'Хүргэлт'}>{shiftAssignments.map(a=><option key={a} value={a}>{a}</option>)}</SelectControl></Field>
    <Field label="Тэмдэглэл"><Input name="note" defaultValue={cell.note} maxLength={400} placeholder="Шалтгаан, нэмэлт заавар"/></Field>
    <Button type="submit" className="primary full" disabled={busy}>{busy?<Loader2 className="spin" size={16}/>:<Check size={16}/>}Хуваарь хадгалах</Button>
   </GuardedForm>}
   {mine.has(cell.person)&&!!cell.assignment&&shiftIsWork(cell.assignment)&&<>
    {d.can_manage&&<hr/>}
    <GuardedForm className="form-stack" onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);const kind=String(f.get('kind'));
     if(await post('request',{kind,person_name:cell.person,from_day:cell.day,to_day:kind==='move'?f.get('to_day'):null,reason:f.get('reason')}))setCell(null);}}>
     <Field label="Хүсэлтийн төрөл *"><SelectControl name="kind" required value={requestKind} onChange={e=>setRequestKind(e.target.value)}>{Object.entries(shiftRequestKinds).map(([k,v])=><option key={k} value={k}>{v}</option>)}</SelectControl></Field>
     {requestKind==='move'&&<Field label="Шилжүүлэх өдөр *"><Input name="to_day" type="date" required min={month+'-01'}/></Field>}
     <Field label="Шалтгаан"><TextareaControl name="reason" rows={2} maxLength={1000} placeholder="Яагаад чөлөө/шилжүүлэлт хэрэгтэйг бичнэ үү"/></Field>
     <Button type="submit" className="primary full" disabled={busy}>{busy?<Loader2 className="spin" size={16}/>:<Inbox size={16}/>}Хүсэлт гаргах</Button>
    </GuardedForm>
   </>}
   {!d.can_manage&&!mine.has(cell.person)&&<p className="muted">Зөвхөн өөрийн хуваарийн талаар хүсэлт гаргана.</p>}
  </div>}
 </DialogContent></Dialog>
 <Dialog open={addOpen} onOpenChange={setAddOpen}><DialogContent className="form-dialog">
  <DialogHeader><DialogTitle>Хуваарьт ажилтан нэмэх</DialogTitle><DialogDescription>Нэг өдрийн томилгоо бүртгэхэд тэр ажилтан хуваарьт гарч ирнэ.</DialogDescription></DialogHeader>
  <GuardedForm className="form-stack" onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);
   if(await post('set_shift',{day:f.get('day'),person_name:f.get('person_name'),member_email:String(f.get('member_email')||'')||null,assignment:f.get('assignment')}))setAddOpen(false);}}>
   <Field label="Ажилтны нэр *"><Input name="person_name" required maxLength={120} placeholder="Жишээ: О.Энх-Учрал"/></Field>
   <Field label="CRM и-мэйл (сонголттой)"><Input name="member_email" type="email" maxLength={120} placeholder="ажилтны@антмалл.mn"/></Field>
   <div className="form-grid"><Field label="Өдөр *"><Input name="day" type="date" required defaultValue={selectedDay}/></Field><Field label="Томилгоо *"><SelectControl name="assignment" required defaultValue="Хүргэлт">{shiftAssignments.map(a=><option key={a} value={a}>{a}</option>)}</SelectControl></Field></div>
   <Button type="submit" className="primary full" disabled={busy}>{busy?<Loader2 className="spin" size={16}/>:<Users size={16}/>}Нэмэх</Button>
  </GuardedForm>
 </DialogContent></Dialog>
 </section>;
}
