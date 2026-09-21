'use client';
import {useState} from 'react';
import {CalendarDays,ChevronLeft,ChevronRight,Check,X,Loader2,Inbox,Plus,Users,Clock} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {Table,TableHeader,TableHead,TableBody,TableRow,TableCell} from '@/components/ui/table';
import {Field} from '@/components/form-field';
import {SelectControl,TextareaControl} from '@/components/ui/form-controls';
import {GuardedForm,markFormSaved,markFormError} from '@/components/draft-guard';
import {AsyncStatus} from '@/components/async-status';
import {useRemote} from '@/hooks/use-remote';
import {toast} from '@/components/ui/sonner';
import {shiftAssignments,shiftOff,shiftIsWork,shiftRequestKinds,shiftRequestStatuses,requestDateLabel,type Member,type WorkShift,type ShiftRequest} from '@/lib/crm';
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
export default function SchedulePanel({me}:{me:Member}){
 const [month,setMonth]=useState(()=>todayUB().slice(0,7));
 const [mode,setMode]=useState<'grid'|'requests'>('grid');
 const [revision,setRevision]=useState(0),[busy,setBusy]=useState(false);
 const [cell,setCell]=useState<{person:string;day:string;email:string|null;assignment:string}|null>(null);
 const [addOpen,setAddOpen]=useState(false);
 const data=useRemote<Data>('/api/schedule?'+new URLSearchParams({month,revision:String(revision)}));
 const d=data.data;
 const days=monthDays(month);
 const byPerson=new Map<string,Map<string,WorkShift>>();
 for(const s of d?.shifts||[]){if(!byPerson.has(s.person_name))byPerson.set(s.person_name,new Map());byPerson.get(s.person_name)!.set(s.day,s);}
 const people=[...byPerson.keys()].sort((a,b)=>a.localeCompare(b,'mn'));
 const mine=new Set(d?.me.names||[]);
 const pending=(d?.requests||[]).filter(r=>r.status==='pending');
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
 return <section className="table-panel">
 <div className="table-toolbar"><h2>Ажлын хуваарь<span>{people.length} ажилтан</span></h2><div className="row">
  <Button variant="outline" size="icon" aria-label="Өмнөх сар" onClick={()=>setMonth(m=>shiftMonth(m,-1))}><ChevronLeft size={16}/></Button>
  <strong style={{minWidth:120,textAlign:'center'}}>{month.slice(0,4)} оны {Number(month.slice(5))} сар</strong>
  <Button variant="outline" size="icon" aria-label="Дараагийн сар" onClick={()=>setMonth(m=>shiftMonth(m,1))}><ChevronRight size={16}/></Button>
  <Button variant="ghost" size="sm" onClick={()=>setMonth(todayUB().slice(0,7))}>Энэ сар</Button>
  <div className="view-toggle"><Button variant={mode==='grid'?'default':'outline'} className={mode==='grid'?'primary':''} size="sm" onClick={()=>setMode('grid')}><CalendarDays size={14}/>Хуваарь</Button><Button variant={mode==='requests'?'default':'outline'} className={mode==='requests'?'primary':''} size="sm" onClick={()=>setMode('requests')}><Inbox size={14}/>Хүсэлт{pending.length?` (${pending.length})`:''}</Button></div>
  {d?.can_manage&&mode==='grid'&&<Button className="primary" size="sm" onClick={()=>setAddOpen(true)}><Plus size={16}/>Ажилтан нэмэх</Button>}
 </div></div>
 <AsyncStatus error={data.error} loading={data.loading} retry={data.retry}/>
 {d&&!data.error&&(mode==='grid'?<>
 {!!pending.length&&<div className="notice compact"><Clock size={20}/><p><strong>{pending.length} хүсэлт</strong> шийдвэрлэгдэхийг хүлээж байна. "Хүсэлт" таб дээр харна уу.</p></div>}
 {!people.length&&<p className="muted chat-empty-list">Энэ сард хуваарь бүртгэгдээгүй байна.</p>}
 {!!people.length&&<div className="table-scroll" style={{overflowX:'auto'}}>
  <table className="schedule-grid" style={{borderCollapse:'collapse',fontSize:12,whiteSpace:'nowrap'}}>
   <thead>
    <tr><th style={{position:'sticky',left:0,background:'var(--background,#fff)',textAlign:'left',padding:'6px 10px',minWidth:150,zIndex:1}}>Ажилтан</th>
     {days.map(day=><th key={day} style={{padding:'4px 3px',minWidth:34,textAlign:'center',opacity:isWeekend(day)?0.6:1}}><div>{weekdayOf(day)}</div><div style={{fontWeight:day===todayUB()?700:400}}>{Number(day.slice(8))}</div></th>)}
     <th style={{padding:'4px 8px'}}>Ажил</th><th style={{padding:'4px 8px'}}>Амралт</th></tr>
   </thead>
   <tbody>
    {people.map(p=><tr key={p} style={mine.has(p)?{outline:'2px solid var(--primary,#2563eb)',outlineOffset:-2}:undefined}>
     <td style={{position:'sticky',left:0,background:'var(--background,#fff)',padding:'4px 10px',fontWeight:mine.has(p)?700:500,zIndex:1}}>{p}{mine.has(p)&&<small style={{marginLeft:6,opacity:0.7}}>та</small>}</td>
     {days.map(day=>{const s=byPerson.get(p)?.get(day);const a=s?.assignment||'';const editable=d.can_manage||(mine.has(p)&&!!a);
      return <td key={day} style={{padding:0,textAlign:'center',border:'1px solid rgba(0,0,0,.06)',background:TINT[a]||'transparent'}}>
       <button type="button" disabled={!editable} title={`${p} · ${day}${a?' · '+a:''}${s?.note?' · '+s.note:''}`} onClick={()=>setCell({person:p,day,email:s?.member_email||null,assignment:a})}
        style={{width:'100%',minHeight:26,border:0,background:'transparent',cursor:editable?'pointer':'default',font:'inherit',color:a==='Чөлөө'?'#b42318':'inherit'}}>{SHORT[a]||a||'·'}</button>
      </td>;})}
     <td style={{padding:'4px 8px',textAlign:'center',fontWeight:600}}>{workDays(p)}</td>
     <td style={{padding:'4px 8px',textAlign:'center',opacity:0.7}}>{offDays(p)}</td>
    </tr>)}
    <tr><td style={{position:'sticky',left:0,background:'var(--background,#fff)',padding:'6px 10px',fontWeight:600,zIndex:1}}>Хүргэлтэд</td>
     {days.map(day=>{const n=coverage(day).get('Хүргэлт')||0;return <td key={day} style={{textAlign:'center',padding:'4px 2px',fontWeight:600,color:n===0?'#b42318':n===1?'#b54708':'inherit'}}>{n||'·'}</td>;})}
     <td/><td/></tr>
   </tbody>
  </table>
 </div>}
 <p className="muted text-sm" style={{padding:'8px 4px'}}>{Object.entries(SHORT).map(([k,v])=><span key={k} style={{marginRight:14}}><b style={{background:TINT[k],padding:'1px 5px',borderRadius:3}}>{v}</b> {k}</span>)}</p>
 </>:<>
 {!d.requests.length&&<p className="muted chat-empty-list">Хүсэлт бүртгэгдээгүй байна.</p>}
 {!!d.requests.length&&<div className="table-scroll"><Table><TableHeader><TableRow><TableHead>АЖИЛТАН</TableHead><TableHead>ТӨРӨЛ</TableHead><TableHead>ӨДӨР</TableHead><TableHead>ШИЛЖИХ ӨДӨР</TableHead><TableHead>ТОМИЛГОО</TableHead><TableHead>ШАЛТГААН</TableHead><TableHead>ТӨЛӨВ</TableHead><TableHead>ҮЙЛДЭЛ</TableHead></TableRow></TableHeader><TableBody>
  {d.requests.map(r=><TableRow key={r.id}>
   <TableCell><strong>{r.person_name}</strong><small>{requestDateLabel(r.created_at)}</small></TableCell>
   <TableCell>{shiftRequestKinds[r.kind]||r.kind}</TableCell>
   <TableCell>{r.from_day}</TableCell>
   <TableCell>{r.to_day||'—'}</TableCell>
   <TableCell>{r.assignment||'—'}</TableCell>
   <TableCell>{r.reason||'—'}{r.decision_note&&<small>{r.decision_note}</small>}</TableCell>
   <TableCell><span className={'stage '+(r.status==='approved'?'stage-won':r.status==='pending'?'stage-pending':'stage-lost')}>{shiftRequestStatuses[r.status]||r.status}</span></TableCell>
   <TableCell>{r.status==='pending'&&<div className="row">
    {d.can_manage&&<><Button size="sm" className="primary" disabled={busy} onClick={()=>post('decide',{approve:true},r.id,r.version)}><Check size={14}/>Батлах</Button>
    <Button size="sm" variant="outline" disabled={busy} onClick={()=>post('decide',{approve:false,note:'Татгалзсан.'},r.id,r.version)}><X size={14}/>Татгалзах</Button></>}
    {r.requested_by===d.me.email&&<Button size="sm" variant="ghost" disabled={busy} onClick={()=>post('cancel_request',{},r.id,r.version)}>Татах</Button>}
   </div>}</TableCell>
  </TableRow>)}
 </TableBody></Table></div>}
 </>)}
 <Dialog open={!!cell} onOpenChange={o=>{if(!o)setCell(null);}}><DialogContent className="form-dialog">
  <DialogHeader><DialogTitle>{cell?`${cell.person} · ${cell.day}`:''}</DialogTitle><DialogDescription>{cell?.assignment?`Одоогийн томилгоо: ${cell.assignment}`:'Томилгоо бүртгээгүй'}</DialogDescription></DialogHeader>
  {cell&&d&&<div className="form-stack">
   {d.can_manage&&<GuardedForm className="form-stack" onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);
    if(await post('set_shift',{day:cell.day,person_name:cell.person,member_email:cell.email,assignment:f.get('assignment'),note:f.get('note')}))setCell(null);}}>
    <Field label="Томилгоо *"><SelectControl name="assignment" required defaultValue={cell.assignment||'Хүргэлт'}>{shiftAssignments.map(a=><option key={a} value={a}>{a}</option>)}</SelectControl></Field>
    <Field label="Тэмдэглэл"><Input name="note" maxLength={400} placeholder="Шалтгаан, нэмэлт заавар"/></Field>
    <Button type="submit" className="primary full" disabled={busy}>{busy?<Loader2 className="spin" size={16}/>:<Check size={16}/>}Хуваарь хадгалах</Button>
   </GuardedForm>}
   {mine.has(cell.person)&&!!cell.assignment&&shiftIsWork(cell.assignment)&&<>
    {d.can_manage&&<hr/>}
    <GuardedForm className="form-stack" onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);const kind=String(f.get('kind'));
     if(await post('request',{kind,person_name:cell.person,from_day:cell.day,to_day:kind==='move'?f.get('to_day'):null,reason:f.get('reason')}))setCell(null);}}>
     <Field label="Хүсэлтийн төрөл *"><SelectControl name="kind" required defaultValue="leave">{Object.entries(shiftRequestKinds).map(([k,v])=><option key={k} value={k}>{v}</option>)}</SelectControl></Field>
     <Field label="Шилжүүлэх өдөр (зөвхөн шилжүүлэхэд)"><Input name="to_day" type="date" min={month+'-01'}/></Field>
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
   <div className="form-grid"><Field label="Өдөр *"><Input name="day" type="date" required defaultValue={todayUB()}/></Field><Field label="Томилгоо *"><SelectControl name="assignment" required defaultValue="Хүргэлт">{shiftAssignments.map(a=><option key={a} value={a}>{a}</option>)}</SelectControl></Field></div>
   <Button type="submit" className="primary full" disabled={busy}>{busy?<Loader2 className="spin" size={16}/>:<Users size={16}/>}Нэмэх</Button>
  </GuardedForm>
 </DialogContent></Dialog>
 </section>;
}
