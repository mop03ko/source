'use client';
import {ListPagination} from '@/components/list-pagination';
import {SelectControl,TextareaControl} from '@/components/ui/form-controls';
import {Field} from '@/components/form-field';
import {GuardedForm,markFormSaved,markFormError} from '@/components/draft-guard';
import {useRemote} from '@/hooks/use-remote';
import {ReportExport} from '@/components/report-export';
import type {ReportDoc} from '@/lib/report-export';
import {AsyncStatus} from '@/components/async-status';
import {useCallback,useEffect,useRef,useState} from 'react';
import {Plus,Search,Loader2,ArrowUpRight,Wrench,Clock,CheckCircle2,CalendarDays,List,ChartNoAxesCombined} from 'lucide-react';
import MonthCalendar, {type CalEvent} from './month-calendar';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {Sheet,SheetContent,SheetHeader,SheetTitle,SheetDescription} from '@/components/ui/sheet';
import {Table,TableHeader,TableHead,TableBody,TableRow,TableCell} from '@/components/ui/table';
import {toast} from '@/components/ui/sonner';
import {itStages,itClosed,itSystemAreas,dateLabel,localInput,fromInput,type Member,type ItTask,type ItActivity} from '@/lib/crm';
type Stats={total:number;active:number;overdue:number;done:number};
type ItReport={total:number;byStatus:{status:string;count:number}[];bySystemArea:{system_area:string;count:number}[];byOwner:{owner:string;total:number;done:number}[]};
const todayUB=()=>new Date(Date.now()+8*3600000).toISOString().slice(0,10);
const ubDay=(iso:string)=>new Date(new Date(iso).getTime()+8*3600000).toISOString().slice(0,10);
async function api(body:unknown){const form=document.activeElement?.closest('form')||null;const r=await fetch('/api/it',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json() as {fieldErrors?:Record<string,string>;error?:string;id?:string};if(!r.ok){markFormError(form,d.error||'Хүсэлт амжилтгүй.',d.fieldErrors);throw new Error(d.error||'Хүсэлт амжилтгүй.');}markFormSaved(form);return d;}

function TaskForm({task,members,busy,onSubmit}:{task?:ItTask;members:Member[];busy:boolean;onSubmit:(d:unknown)=>unknown}){
 return <GuardedForm className="form-stack" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);onSubmit({title:f.get('title'),system_area:f.get('system_area'),owner:f.get('owner'),status:f.get('status'),due_at:fromInput(String(f.get('due_at')||'')),note:f.get('note')});}}>
 <Field label="Ажлын гарчиг *"><Input name="title" required maxLength={160} defaultValue={task?.title} placeholder="Жишээ: Нэвтрэх хуудасны алдаа засах"/></Field>
 <div className="form-grid"><Field label="Систем/чиглэл"><SelectControl name="system_area" defaultValue={task?.system_area||itSystemAreas[0]}>{itSystemAreas.map(c=><option key={c}>{c}</option>)}</SelectControl></Field><Field label="Хариуцагч"><SelectControl name="owner" defaultValue={task?.owner||members[0]?.email}>{members.map(m=><option key={m.email} value={m.email} disabled={!m.active}>{m.name}{!m.active?' (идэвхгүй)':''}</option>)}</SelectControl></Field></div>
 <Field label="Төлөв"><SelectControl name="status" defaultValue={task?.status||'planned'}>{Object.entries(itStages).map(([k,v])=><option key={k} value={k}>{v}</option>)}</SelectControl></Field>
 <Field label="Дуусах хугацаа (УБ цаг)"><Input name="due_at" type="datetime-local" defaultValue={localInput(task?task.due_at:null)}/></Field>
 <Field label="Тайлбар"><TextareaControl name="note" rows={3} maxLength={2000} defaultValue={task?.note||''} placeholder="Ажлын дэлгэрэнгүй, шалтгаан, шаардлага…"/></Field>
 <Button type="submit" className="primary full" disabled={busy}>{busy?<Loader2 className="spin" size={16}/>:<Plus size={16}/>}Хадгалах</Button>
 </GuardedForm>;
}
export default function ItPanel({me,members,initialTaskId}:{me:Member;members:Member[];initialTaskId?:string}){
 const [items,setItems]=useState<ItTask[]>([]),[count,setCount]=useState(0),[page,setPage]=useState(1),[status,setStatus]=useState(''),[q,setQ]=useState(''),[loading,setLoading]=useState(true),[error,setError]=useState(''),[stats,setStats]=useState<Stats|null>(null);
 const [create,setCreate]=useState(false),[busy,setBusy]=useState(false);
 const [detailId,setDetailId]=useState(''),[detail,setDetail]=useState<{task:ItTask;activities:ItActivity[]}|null>(null),[detailError,setDetailError]=useState('');
 const [mode,setMode]=useState<'list'|'calendar'|'report'>('list'),[calMonth,setCalMonth]=useState(()=>todayUB().slice(0,7));
 const [reportFrom,setReportFrom]=useState(''),[reportTo,setReportTo]=useState(''),[retryReport,setRetryReport]=useState(0);
 const seq=useRef(0),detailSeq=useRef(0);
 const activeMembers=members.filter(m=>m.active);
 const load=useCallback(async()=>{const n=++seq.current;setLoading(true);try{const r=await fetch('/api/it?'+new URLSearchParams({status,q,page:String(page)}),{cache:'no-store'});const d=await r.json() as {items?:ItTask[];count?:number;stats?:Stats;error?:string};if(!r.ok)throw new Error(d.error);if(n===seq.current){setItems(d.items||[]);setCount(d.count||0);setStats(d.stats||null);setError('');}}catch(e){if(n===seq.current)setError((e as Error).message);}finally{if(n===seq.current)setLoading(false);}},[status,q,page]);
 useEffect(()=>{const t=setTimeout(load,q?250:0);return()=>clearTimeout(t);},[load,q]);
 // Календарь горим: тухайн сард due_at тохирох хөнгөн жагсаалт (одоогийн шүүлтүүрээр хязгаарлагдсан).
 const calUrl='/api/it?'+new URLSearchParams({calendar:'1',month:calMonth,q,status});
 const calendar=useRemote<{items:{id:string;title:string;due_at:string;status:string;day_count:number}[]}>(mode==='calendar'?calUrl:null);
 const calLoading=calendar.loading;
 const calEvents:CalEvent[]=(calendar.data?.items||[]).map(t=>({id:t.id,date:ubDay(t.due_at),label:t.title,dayCount:t.day_count}));
 // Тайлан горим: сонгосон хугацааны (rfrom/rto) төлөв/систем/хариуцагчийн задаргаа.
 const reportState=useRemote<ItReport>(mode==='report'?'/api/it?'+new URLSearchParams({report:'1',rfrom:reportFrom,rto:reportTo,retry:String(retryReport)}):null);
 const report=reportState.data,reportLoading=reportState.loading;
 const openTask=useCallback(async(id:string)=>{const n=++detailSeq.current;setDetailId(id);setDetail(null);setDetailError('');try{const r=await fetch('/api/it?id='+encodeURIComponent(id),{cache:'no-store'});const d=await r.json() as {task?:ItTask;activities?:ItActivity[];error?:string};if(!r.ok)throw new Error(d.error);if(n===detailSeq.current)setDetail(d as {task:ItTask;activities:ItActivity[]});}catch(e){if(n===detailSeq.current)setDetailError((e as Error).message);}},[]);
 useEffect(()=>{if(!initialTaskId)return;const timer=setTimeout(()=>void openTask(initialTaskId),0);return()=>clearTimeout(timer);},[initialTaskId,openTask]);
 const mutate=async(body:unknown)=>{setBusy(true);try{const r=await api(body);toast.success('Амжилттай хадгаллаа');void load();if(detailId)await openTask(detailId);return r;}catch(e){toast.error((e as Error).message);return null;}finally{setBusy(false);}};
 const overdue=(t:ItTask)=>!!t.due_at&&t.due_at<new Date().toISOString()&&!itClosed.includes(t.status);
 const ownerName=(email:string)=>members.find(m=>m.email===email)?.name||email;
 // Тайлангийн задаргааг Excel/PDF-д ижил бүтэцтэй гаргана.
 const reportDoc=():ReportDoc=>{
  const r=report;
  return {title:'IT / вэбсайтын тайлан',meta:[`Хугацаа: ${reportFrom||'бүх'} — ${reportTo||'өнөөдөр'}`,`Нийт ажил: ${r?.total||0}`],sheets:[
   {name:'Төлөв',columns:[{header:'Төлөв',width:22},{header:'Тоо'},{header:'Хувь %'}],
    rows:Object.entries(itStages).map(([k,v])=>{const c=r?.byStatus.find(b=>b.status===k)?.count||0;return [v,c,r?.total?Math.round(c/r.total*100):0];})},
   {name:'Систем',columns:[{header:'Систем / чиглэл',width:34},{header:'Тоо'},{header:'Хувь %'}],
    rows:itSystemAreas.map(a=>{const c=r?.bySystemArea.find(b=>b.system_area===a)?.count||0;return [a,c,r?.total?Math.round(c/r.total*100):0];})},
   {name:'Ажилтан',columns:[{header:'Ажилтан',width:24},{header:'Нийт'},{header:'Дууссан'},{header:'Гүйцэтгэл %'}],
    rows:[...(r?.byOwner||[])].sort((a,b)=>b.total-a.total).map(o=>[ownerName(o.owner),o.total,o.done,o.total?Number((o.done/o.total*100).toFixed(1)):0])},
  ]};
 };
 const reportActive=report?report.byStatus.filter(b=>!itClosed.includes(b.status)).reduce((n,b)=>n+b.count,0):0;
 const reportDone=report?.byStatus.find(b=>b.status==='done')?.count||0;
 return <section className="table-panel">
 {mode==='report'&&<div className="report-range panel"><Field label="Хугацааны эхлэл (үүсгэсэн огноо)"><Input type="date" value={reportFrom} max={reportTo||undefined} onChange={e=>setReportFrom(e.target.value)}/></Field><Field label="Хугацааны төгсгөл"><Input type="date" value={reportTo} min={reportFrom||undefined} onChange={e=>setReportTo(e.target.value)}/></Field>{(reportFrom||reportTo)&&<Button variant="ghost" size="sm" onClick={()=>{setReportFrom('');setReportTo('');}}>Бүх хугацаа</Button>}<ReportExport doc={reportDoc} disabled={!report}/><p className="muted text-sm">{reportState.error?'Тайлан ачаалагдаагүй.':reportLoading?'Тайлан ачаалж байна…':reportFrom||reportTo?`${reportFrom||'…'} — ${reportTo||'өнөөдөр'} хооронд үүсгэсэн ${(report?.total||0).toLocaleString()} ажилд үндэслэв.`:'Бүх хугацааны мэдээлэл харагдаж байна. Тодорхой үе харахын тулд огноо сонгоно уу.'}</p></div>}
 {mode==='report'?report&&<div className="metrics"><div className="metric"><div><span>Нийт ажил</span><Wrench size={19}/></div><strong>{report.total.toLocaleString()}</strong><small>Сонгосон хугацаанд үүсгэсэн</small></div><div className="metric metric-focus"><div><span>Идэвхтэй ажил</span><Clock size={19}/></div><strong>{reportActive.toLocaleString()}</strong><small>Хийгдэж/төлөвлөгдөж буй</small></div><div className={'metric'+(stats?.overdue?' metric-alert':'')}><div><span>Хугацаа хэтэрсэн</span><Clock size={19}/></div><strong>{(stats?.overdue||0).toLocaleString()}</strong><small>Одоогийн байдлаар, бүх хугацаа</small></div><div className="metric"><div><span>Дууссан</span><CheckCircle2 size={19}/></div><strong>{reportDone.toLocaleString()}</strong><small>Энэ хугацаанд үүссэнээс одоо дууссан</small></div></div>:stats&&<div className="metrics"><div className="metric"><div><span>Нийт ажил</span><Wrench size={19}/></div><strong>{stats.total.toLocaleString()}</strong><small>Бүх IT/вэбсайтын ажил</small></div><div className="metric metric-focus"><div><span>Идэвхтэй ажил</span><Clock size={19}/></div><strong>{stats.active.toLocaleString()}</strong><small>Хийгдэж/төлөвлөгдөж буй</small></div><div className={'metric'+(stats.overdue?' metric-alert':'')}><div><span>Хугацаа хэтэрсэн</span><Clock size={19}/></div><strong>{stats.overdue.toLocaleString()}</strong><small>Дуусах хугацаа өнгөрсөн</small></div><div className="metric"><div><span>Дууссан</span><CheckCircle2 size={19}/></div><strong>{stats.done.toLocaleString()}</strong><small>Хаагдсан ажил</small></div></div>}
 <div className="table-toolbar"><h2>IT/вэбсайтын ажлууд<span>{count}</span></h2><div className="row"><Button className="primary" size="sm" onClick={()=>setCreate(true)}><Plus size={16}/>Шинэ ажил</Button><div className="view-toggle"><Button variant={mode==='list'?'default':'outline'} className={mode==='list'?'primary':''} size="sm" onClick={()=>setMode('list')}><List size={14}/>Жагсаалт</Button><Button variant={mode==='calendar'?'default':'outline'} className={mode==='calendar'?'primary':''} size="sm" onClick={()=>setMode('calendar')}><CalendarDays size={14}/>Календарь</Button><Button variant={mode==='report'?'default':'outline'} className={mode==='report'?'primary':''} size="sm" onClick={()=>setMode('report')}><ChartNoAxesCombined size={14}/>Тайлан</Button></div></div></div>
 <div className="filters">{mode!=='report'&&<><div className="search"><Search size={17}/><Input aria-label="Ажил хайх" placeholder="Гарчгаар хайх…" value={q} onChange={e=>{setQ(e.target.value);setPage(1);}}/></div><SelectControl aria-label="Төлөвөөр шүүх" value={status} onChange={e=>{setStatus(e.target.value);setPage(1);}}><option value="">Бүх төлөв</option>{Object.entries(itStages).map(([k,v])=><option key={k} value={k}>{v}</option>)}</SelectControl></>}{(loading||calLoading||reportLoading)&&<Loader2 size={17} className="spin muted"/>}</div>
 {error&&<div role="alert" className="error-box">{error} <button onClick={load}>Дахин оролдох</button></div>}
 {mode==='calendar'?<MonthCalendar month={calMonth} onMonthChange={setCalMonth} events={calEvents} onOpen={openTask} todayDate={todayUB()} loading={calLoading} error={calendar.error} onRetry={calendar.retry} endpoint={calUrl} key={calUrl}/>:mode==='report'?(reportState.error||reportLoading)?<AsyncStatus error={reportState.error} loading={reportLoading} retry={()=>setRetryReport(n=>n+1)}/>:<div className="reports-grid">
 <section className="panel team-report"><div className="eyebrow">АЖЛЫН ТӨЛӨВ</div><h2>Төлөвийн задаргаа</h2><p className="muted">Төлөв бүрийн ажлын тоо, сонгосон хугацаанд эзлэх хувь.</p><div className="bars">{Object.entries(itStages).map(([k,v])=>{const c=report?.byStatus.find(b=>b.status===k)?.count||0;const pct=report?.total?Math.round(c/report.total*100):0;return <div className="bar-row" key={k}><div><span>{v}</span><strong>{c} <small>({pct}%)</small></strong></div><div className="bar-track"><span style={{width:pct+'%'}}/></div></div>;})}</div></section>
 <section className="panel team-report"><div className="eyebrow">СИСТЕМ</div><h2>Систем/чиглэлээр хуваарилалт</h2><p className="muted">Систем тус бүрийн ажлын тоо, сонгосон хугацаанд эзлэх хувь.</p><div className="bars">{itSystemAreas.map(a=>{const cnt=report?.bySystemArea.find(b=>b.system_area===a)?.count||0;const pct=report?.total?Math.round(cnt/report.total*100):0;return <div className="bar-row" key={a}><div><span>{a}</span><strong>{cnt} <small>({pct}%)</small></strong></div><div className="bar-track"><span style={{width:pct+'%'}}/></div></div>;})}</div></section>
 <section className="panel team-report"><div className="eyebrow">БАГИЙН ГИШҮҮД</div><h2>Ажилтан тус бүрийн үзүүлэлт</h2><p className="muted">Сонгосон хугацаанд хариуцсан ажил, дууссан тоо, гүйцэтгэлийн хувь.</p><div className="table-scroll"><Table><TableHeader><TableRow><TableHead>АЖИЛТАН</TableHead><TableHead>НИЙТ</TableHead><TableHead>ДУУССАН</TableHead><TableHead>ГҮЙЦЭТГЭЛ</TableHead></TableRow></TableHeader><TableBody>{[...(report?.byOwner||[])].sort((a,b)=>b.total-a.total).map(r=><TableRow key={r.owner}><TableCell><strong>{ownerName(r.owner)}</strong><small>{r.owner}</small></TableCell><TableCell>{r.total}</TableCell><TableCell>{r.done}</TableCell><TableCell>{r.total?(r.done/r.total*100).toFixed(1):'0.0'}%</TableCell></TableRow>)}{!report?.byOwner.length&&<TableRow><TableCell colSpan={4} className="muted">Сонгосон хугацаанд ажил алга.</TableCell></TableRow>}</TableBody></Table></div></section>
 </div>:<>
 {items.length?<div className="table-scroll"><Table><TableHeader><TableRow><TableHead>ГАРЧИГ</TableHead><TableHead>СИСТЕМ</TableHead><TableHead>ХАРИУЦАГЧ</TableHead><TableHead>ТӨЛӨВ</TableHead><TableHead>ДУУСАХ ХУГАЦАА</TableHead><TableHead><span className="sr-only">Үйлдэл</span></TableHead></TableRow></TableHeader><TableBody>{items.map(t=><TableRow key={t.id} className={'lead-row'+(overdue(t)?' overdue-row':'')}><TableCell><button className="lead-link" onClick={()=>openTask(t.id)}><span className="lead-avatar"><Wrench size={16}/></span><strong>{t.title}</strong></button></TableCell><TableCell>{t.system_area}</TableCell><TableCell><span className="owner-label">{ownerName(t.owner)}</span></TableCell><TableCell><span className={'stage '+(itClosed.includes(t.status)?(t.status==='done'?'stage-won':'stage-lost'):'stage-pending')}>{itStages[t.status]||t.status}</span></TableCell><TableCell><div className={overdue(t)?'due-text':''}>{t.due_at?dateLabel(t.due_at):'Товгүй'}</div></TableCell><TableCell><Button variant="ghost" size="icon" aria-label={t.title+' нээх'} onClick={()=>openTask(t.id)}><ArrowUpRight size={18}/></Button></TableCell></TableRow>)}</TableBody></Table></div>:!loading&&<p className="muted chat-empty-list">IT/вэбсайтын ажил бүртгэгдээгүй байна.</p>}
 <ListPagination page={page} total={count} loading={loading} onChange={setPage} pageSize={50} label="ажил"/>
 </>}
 <Dialog open={create} onOpenChange={setCreate}><DialogContent className="form-dialog"><DialogHeader><DialogTitle>Шинэ IT/вэбсайтын ажил</DialogTitle><DialogDescription>Ажлын мэдээлэл, хариуцагч, дуусах хугацааг тохируулна уу.</DialogDescription></DialogHeader><TaskForm members={activeMembers.length?activeMembers:[me]} busy={busy} onSubmit={async d=>{const r=await mutate({action:'create',data:d});if(r)setCreate(false);}}/></DialogContent></Dialog>
 <Sheet open={!!detailId} onOpenChange={o=>{if(!o){detailSeq.current++;setDetailId('');setDetail(null);}}}><SheetContent className="detail-sheet"><SheetHeader><SheetTitle>{detail?.task.title||'Ажлын дэлгэрэнгүй'}</SheetTitle><SheetDescription>{detail?`${detail.task.system_area} · ${itStages[detail.task.status]||detail.task.status}`:'Мэдээлэл болон явцын түүх'}</SheetDescription></SheetHeader>{detailError?<div className="error-box">{detailError}<Button onClick={()=>openTask(detailId)}>Дахин нээх</Button></div>:!detail?<div className="loading"><Loader2 className="spin"/>Ачаалж байна…</div>:<div className="detail-body">
 <div className="next-box"><Wrench size={18}/><div><strong>{detail.task.system_area}</strong><p>Хариуцагч: {ownerName(detail.task.owner)}</p></div></div>
 <TaskForm key={detail.task.version} task={detail.task} members={activeMembers.length?activeMembers:[me]} busy={busy} onSubmit={d=>mutate({action:'update',id:detail.task.id,version:detail.task.version,data:d})}/>
 <div className="detail-tools"><GuardedForm className="form-stack full" onSubmit={async e=>{e.preventDefault();const form=e.currentTarget,f=new FormData(form);const note=String(f.get('note')||'').trim();if(!note)return;const r=await mutate({action:'activity',id:detail.task.id,version:detail.task.version,data:{note}});if(r){form.reset();markFormSaved(form);}}}><Field label="Явцын тэмдэглэл нэмэх"><TextareaControl name="note" required maxLength={2000} rows={2} placeholder="Юу хийсэн, ямар үр дүнтэй болсныг тэмдэглэ…"/></Field><Button className="primary full" disabled={busy}><Plus size={16}/>Тэмдэглэл бүртгэх</Button></GuardedForm></div>
 <div className="timeline">{detail.activities.map(a=><article key={a.id}><span className="timeline-dot"/><div className="row between"><strong>{ownerName(a.actor)}</strong><time>{dateLabel(a.created_at)}</time></div><p>{a.note}</p></article>)}</div>
 </div>}</SheetContent></Sheet>
 </section>;
}
