'use client';
import {Disclosure} from '@/components/disclosure';
import {useState,useRef,useEffect} from 'react';
import {useIsMobile} from '@/hooks/use-mobile';
import {CalendarDays,ChevronLeft,ChevronRight,Check,X,Loader2,Inbox,Plus,Users,Clock,CalendarPlus} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {Field} from '@/components/form-field';
import {SelectControl,TextareaControl} from '@/components/ui/form-controls';
import {GuardedForm,markFormSaved,markFormError} from '@/components/draft-guard';
import {AsyncStatus} from '@/components/async-status';
import {useCachedRemote} from '@/hooks/use-cached-remote';
import type {RequestCache} from '@/lib/request-cache';
import {toast} from '@/components/ui/sonner';
import {shiftAssignments,shiftOff,shiftIsWork,shiftRequestKinds,shiftRequestStatuses,requestDateLabel,type WorkShift,type ShiftRequest} from '@/lib/crm';
type Data={month:string;shifts:WorkShift[];requests:ShiftRequest[];people:{person_name:string;member_email:string|null;days:number}[];can_manage:boolean;scoped?:boolean;me:{name:string;email:string;names:string[]}};
const WEEKDAYS=['Ня','Да','Мя','Лх','Пү','Ба','Бя'];
// Нүдэнд багтахаар томилгоо бүрийг 2-4 тэмдэгтээр харуулна.
const SHORT:Record<string,string>={'Хүргэлт':'Хүр','Олимпик':'Оли','Юнион':'Юни','Түмэнмолл':'Түм','Gotomarket':'Goto','ИЦА':'ИЦА','Тооллого':'Тоо','Амралт':'а','Чөлөө':'Ч'};
const TINT:Record<string,string>={'Хүргэлт':'#e8f1ff','Олимпик':'#eafaf0','Юнион':'#fff4e5','Түмэнмолл':'#f3ecff','Gotomarket':'#e6faf8','ИЦА':'#fdeaf3','Тооллого':'#fff9d6','Амралт':'#f2f2f2','Чөлөө':'#ffe9e9'};
const todayUB=()=>new Date(Date.now()+8*3600000).toISOString().slice(0,10);
const shiftMonth=(m:string,delta:number)=>{const [y,mo]=m.split('-').map(Number);const d=new Date(Date.UTC(y,mo-1+delta,1));return d.getUTCFullYear()+'-'+String(d.getUTCMonth()+1).padStart(2,'0');};
function monthDays(month:string){const [y,mo]=month.split('-').map(Number);const out:string[]=[];const last=new Date(Date.UTC(y,mo,0)).getUTCDate();for(let d=1;d<=last;d++)out.push(`${month}-${String(d).padStart(2,'0')}`);return out;}
const weekdayOf=(day:string)=>WEEKDAYS[new Date(day+'T00:00:00Z').getUTCDay()];
const isWeekend=(day:string)=>[0,6].includes(new Date(day+'T00:00:00Z').getUTCDay());
export default function SchedulePanel({month,onMonthChange,cache,refresh=0}:{month:string;onMonthChange:(month:string)=>void;cache:RequestCache;refresh?:number}){
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
 const [busy,setBusy]=useState(false);
 const [cell,setCell]=useState<{person:string;day:string;email:string|null;assignment:string;note:string}|null>(null);
 const [addOpen,setAddOpen]=useState(false),[planOpen,setPlanOpen]=useState(false);
 const data=useCachedRemote<Data>('/api/schedule?'+new URLSearchParams({month}),cache,refresh);
 const d=data.data;
 const days=monthDays(month);
 useEffect(()=>{const grid=gridRef.current,header=grid?.querySelector('thead .schedule-selected');if(!daily&&grid&&header)grid.scrollLeft+=header.getBoundingClientRect().left-grid.getBoundingClientRect().left-grid.clientWidth/2+header.clientWidth/2;},[daily,selectedDay,data.loading]);
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
   markFormSaved(form);data.retry();toast.success('Амжилттай.');return j;
  }catch(e){toast.error((e as Error).message);return null;}finally{setBusy(false);}
 };
 // Тухайн өдрийн байршил тус бүрийн хүний тоо — доод мөрөнд хамралтыг харуулна.
 const coverage=(day:string)=>{const counts=new Map<string,number>();for(const p of people){const a=byPerson.get(p)?.get(day)?.assignment;if(a&&shiftIsWork(a))counts.set(a,(counts.get(a)||0)+1);}return counts;};
 const workDays=(p:string)=>days.filter(x=>{const a=byPerson.get(p)?.get(x)?.assignment;return a&&shiftIsWork(a);}).length;
 const offDays=(p:string)=>days.filter(x=>{const a=byPerson.get(p)?.get(x)?.assignment;return a&&shiftOff.includes(a);}).length;
 return <section className="table-panel schedule-panel" aria-label="Ажлын хуваарь">
 <div className="schedule-toolbar">
  <div className="schedule-month"><Button type="button" variant="outline" size="icon" aria-label="Өмнөх сар" onClick={()=>setMonth(shiftMonth(month,-1))}><ChevronLeft/></Button><h2 aria-live="polite">{month.slice(0,4)} оны {Number(month.slice(5))} сар</h2><Button type="button" variant="outline" size="icon" aria-label="Дараагийн сар" onClick={()=>setMonth(shiftMonth(month,1))}><ChevronRight/></Button></div>
  <div className="schedule-primary-actions"><Button variant="outline" onClick={goToday}>Өнөөдөр</Button>{d?.can_manage&&<><Button variant="outline" onClick={()=>setPlanOpen(true)}><CalendarPlus size={16}/>Сар төлөвлөх</Button><Button className="primary" onClick={()=>setAddOpen(true)}><Plus size={16}/>Томилгоо нэмэх</Button></>}</div>
 </div>
 <div className="schedule-navigation"><div className="view-toggle" aria-label="Хуваарийн хэсэг"><Button variant={mode==='grid'?'default':'outline'} aria-pressed={mode==='grid'} onClick={()=>setMode('grid')}><CalendarDays size={16}/>Хуваарь</Button><Button variant={mode==='requests'?'default':'outline'} aria-pressed={mode==='requests'} onClick={()=>setMode('requests')}><Inbox size={16}/>Хүсэлт {pending.length>0&&<span className="schedule-count">{pending.length}</span>}</Button></div><p>{d?.can_manage?'Томилгоог засахын тулд ажилтны өдрийг сонгоно уу.':'Өөрийн ажлын өдрийг сонгож чөлөө, өдөр шилжүүлэх хүсэлт гаргана.'}</p></div>
 <AsyncStatus error={data.error} loading={data.loading} retry={data.retry}/>
 {d?.scoped&&<p className="muted text-sm" style={{padding:'0 4px 8px'}}>Танд зөвхөн өөрийн хуваарь харагдана. Чөлөө авах, өдөр шилжүүлэх хүсэлтээ нүд дээрээ дарж гаргана уу.</p>}
 {d&&<>
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
 <Disclosure className="schedule-legend-collapse" label="Томилгооны өнгө, товчлол"><div className="schedule-legend-items">{Object.entries(SHORT).map(([k,v])=><span key={k}><b style={{background:TINT[k]}}>{v}</b>{k}</span>)}</div></Disclosure>
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
 {d?.can_manage&&<MonthPlanner open={planOpen} onClose={()=>setPlanOpen(false)} month={month} people={d.people} shifts={d.shifts}
   onDone={(written:number,skipped:number)=>{setPlanOpen(false);data.retry();toast.success(`${written} өдрийн томилгоо бүртгэв.`+(skipped?` ${skipped} нүд аль хэдийн томилгоотой тул хөндөөгүй.`:''));}}/>}
 </section>;
}
const PLAN_WEEKDAYS=['Ня','Да','Мя','Лх','Пү','Ба','Бя'];
type PlanRow={person:string;email:string|null;include:boolean;assignment:string;rest:string[]};
// Шинэ сарын хуваарь. Ажилчид тогтмол гарагаар амардаггүй (зарим нь Бя/Ня, зарим нь 5/2 мөчлөгөөр
// гарагаас хамаарахгүй шилждэг, зарим нь жигд бус) тул амрах өдрийг нүдэн дээр дарж шууд сонгоно.
// Түргэн товчнууд нь зөвхөн эхлэлийг тавина — дараа нь өдөр тус бүрийг дарж тааруулна.
function MonthPlanner({open,onClose,month,people,shifts,onDone}:{open:boolean;onClose:()=>void;month:string;people:{person_name:string;member_email:string|null}[];shifts:WorkShift[];onDone:(written:number,skipped:number)=>void}){
 const [target,setTarget]=useState(()=>shiftMonth(month,1));
 const [rows,setRows]=useState<PlanRow[]>([]);
 const [busy,setBusy]=useState(false),[loaded,setLoaded]=useState('');
 const days=monthDays(target);
 const weekday=(day:string)=>new Date(day+'T00:00:00Z').getUTCDay();
 const isWeekend=(day:string)=>[0,6].includes(weekday(day));
 useEffect(()=>{
  if(!open)return;
  const key=month+'|'+target;
  if(loaded===key)return;
  // Томилгоог одоогийн сард хамгийн олон тохиолдсоноор нь урьдчилж сонгоно.
  const seen=new Map<string,Map<string,number>>();
  for(const shift of shifts)if(shiftIsWork(shift.assignment)){
   if(!seen.has(shift.person_name))seen.set(shift.person_name,new Map());
   const tally=seen.get(shift.person_name)!;tally.set(shift.assignment,(tally.get(shift.assignment)||0)+1);
  }
  setRows(people.map(person=>{
   const tally=[...(seen.get(person.person_name)||new Map<string,number>()).entries()].sort((a,b)=>b[1]-a[1]);
   return {person:person.person_name,email:person.member_email,include:true,
    assignment:tally[0]?.[0]||shiftAssignments[0],rest:monthDays(target).filter(day=>[0,6].includes(new Date(day+'T00:00:00Z').getUTCDay()))};
  }));
  setLoaded(key);
 },[open,month,target,people,shifts,loaded]);
 const update=(person:string,patch:Partial<PlanRow>)=>setRows(list=>list.map(r=>r.person===person?{...r,...patch}:r));
 const toggleDay=(person:string,day:string)=>setRows(list=>list.map(r=>r.person!==person?r:{...r,rest:r.rest.includes(day)?r.rest.filter(v=>v!==day):[...r.rest,day]}));
 // Баганын толгойг дарахад тухайн өдөр бүх сонгосон ажилтанд ажил ↔ амралт болно (нийтийн амралт).
 const toggleColumn=(day:string)=>setRows(list=>{
  const active=list.filter(r=>r.include);
  const allRest=active.length>0&&active.every(r=>r.rest.includes(day));
  return list.map(r=>!r.include?r:{...r,rest:allRest?r.rest.filter(v=>v!==day):[...new Set([...r.rest,day])]});
 });
 // 5 ажил / 2 амралт мөчлөг: гарагаас хамаарахгүй, сарын эхний өдрөөс тоолно.
 const rotation=(person:string)=>update(person,{rest:days.filter((_,i)=>i%7>=5)});
 const chosen=rows.filter(r=>r.include);
 const save=async()=>{
  if(!chosen.length){toast.error('Дор хаяж нэг ажилтан сонгоно уу.');return;}
  setBusy(true);
  try{
   const entries=chosen.map(r=>({person_name:r.person,member_email:r.email,
    days:days.map(day=>({day,assignment:r.rest.includes(day)?'Амралт':r.assignment}))}));
   const res=await fetch('/api/schedule',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'plan_month',data:{month:target,entries}})});
   const value=await res.json() as {error?:string;written?:number;skipped?:number};
   if(!res.ok)throw new Error(value.error||'Хадгалж чадсангүй.');
   onDone(value.written||0,value.skipped||0);
  }catch(e){toast.error((e as Error).message);}finally{setBusy(false);}
 };
 return <Dialog open={open} onOpenChange={o=>{if(!o)onClose();}}><DialogContent className="schedule-planner" width="min(1500px, 96vw)" style={{maxHeight:'90dvh',overflowY:'auto',background:'#fff'}}>
  <DialogHeader><DialogTitle>Шинэ сарын хуваарь төлөвлөх</DialogTitle><DialogDescription>Амрах өдрийг нүдэн дээр дарж сонгоно — саарал нь амралт, цэнхэр нь ажлын өдөр. Баганын толгойг дарвал тэр өдөр бүх ажилтанд нэгэн зэрэг солигдоно. Аль хэдийн томилгоотой нүдийг хөндөхгүй.</DialogDescription></DialogHeader>
  <div className="form-stack">
   <div className="form-grid">
    <Field label="Төлөвлөх сар *"><Input type="month" value={target} onChange={e=>{setTarget(e.target.value||target);setLoaded('');}}/></Field>
    <Field label="Сонгосон ажилтан"><Input value={chosen.length+' / '+rows.length} disabled/></Field>
   </div>
   {!rows.length&&<p className="muted">Одоогийн сард хуваарьтай ажилтан байхгүй тул төлөвлөх хүн алга. "Томилгоо нэмэх"-ээр ажилтан бүртгэнэ үү.</p>}
   {!!rows.length&&<div style={{overflowX:'auto'}}>
    <table style={{borderCollapse:'collapse',fontSize:12,whiteSpace:'nowrap'}}>
     <thead><tr>
      <th style={{position:'sticky',left:0,top:0,background:'var(--background,#fff)',textAlign:'left',padding:'6px 8px',minWidth:150,zIndex:3}}>Ажилтан</th>
      <th style={{position:'sticky',top:0,background:'var(--background,#fff)',textAlign:'left',padding:'6px 8px',minWidth:130,zIndex:2}}>Томилгоо</th>
      <th style={{position:'sticky',top:0,background:'var(--background,#fff)',padding:'6px 8px',zIndex:2}}>Түргэн</th>
      {days.map(day=><th key={day} style={{position:'sticky',top:0,background:'var(--background,#fff)',padding:'2px 1px',minWidth:26,textAlign:'center',zIndex:2}}>
       <button type="button" onClick={()=>toggleColumn(day)} title={day+' — бүх ажилтанд солих'} style={{border:0,background:'transparent',font:'inherit',cursor:'pointer',padding:2,lineHeight:1.15,opacity:isWeekend(day)?0.6:1}}>
        <div>{PLAN_WEEKDAYS[weekday(day)]}</div><div>{Number(day.slice(8))}</div>
       </button></th>)}
      <th style={{position:'sticky',top:0,background:'var(--background,#fff)',padding:'6px 8px',zIndex:2}}>Ажил/Амр</th>
     </tr></thead>
     <tbody>{rows.map(r=>{
      const work=days.length-r.rest.length;
      return <tr key={r.person} style={{opacity:r.include?1:0.45}}>
       <td style={{position:'sticky',left:0,background:'var(--background,#fff)',padding:'4px 8px',zIndex:1}}><label className="row" style={{gap:6}}><input type="checkbox" checked={r.include} onChange={e=>update(r.person,{include:e.target.checked})} aria-label={r.person+' оруулах'}/><strong>{r.person}</strong></label></td>
       <td style={{padding:'4px 8px'}}><SelectControl aria-label={r.person+' томилгоо'} value={r.assignment} onChange={e=>update(r.person,{assignment:e.target.value})} disabled={!r.include}>{shiftAssignments.filter(a=>shiftIsWork(a)).map(a=><option key={a} value={a}>{a}</option>)}</SelectControl></td>
       <td style={{padding:'4px 6px'}}><div className="row" style={{gap:3}}>
        <Button type="button" size="sm" variant="outline" disabled={!r.include} onClick={()=>update(r.person,{rest:days.filter(isWeekend)})} title="Бямба, Ням амраах">Бя+Ня</Button>
        <Button type="button" size="sm" variant="outline" disabled={!r.include} onClick={()=>rotation(r.person)} title="5 ажил / 2 амралт мөчлөг, сарын эхнээс">5/2</Button>
        <Button type="button" size="sm" variant="ghost" disabled={!r.include} onClick={()=>update(r.person,{rest:[]})} title="Бүх өдөр ажил">Цэвэр</Button>
       </div></td>
       {days.map(day=>{const off=r.rest.includes(day);
        return <td key={day} style={{padding:0,border:'1px solid rgba(0,0,0,.08)'}}>
         <button type="button" disabled={!r.include} onClick={()=>toggleDay(r.person,day)}
          title={r.person+' · '+day+' · '+(off?'Амралт':r.assignment)}
          aria-label={r.person+' '+day+' '+(off?'амралт':'ажил')}
          style={{width:'100%',minHeight:24,border:0,cursor:r.include?'pointer':'default',font:'inherit',fontSize:11,
           background:off?'#eceff1':'#e8f1ff',color:off?'#78909c':'#1d4ed8'}}>{off?'а':'•'}</button>
        </td>;})}
       <td style={{padding:'4px 8px',textAlign:'center',whiteSpace:'nowrap'}}><strong>{work}</strong> / {r.rest.length}</td>
      </tr>;})}</tbody>
    </table>
   </div>}
   <Button className="primary full" disabled={busy||!chosen.length} onClick={save}>{busy?<Loader2 className="spin" size={16}/>:<CalendarPlus size={16}/>}{target+' сарын хуваарь бүртгэх'}</Button>
  </div>
 </DialogContent></Dialog>;
}
