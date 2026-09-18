'use client';
import {useState} from 'react';
import {ChevronLeft,ChevronRight} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {AsyncStatus} from '@/components/async-status';
import {useRemote} from '@/hooks/use-remote';
import {dateLabel} from '@/lib/crm';
export type CalEvent={id:string;date:string;label:string;className?:string;dayCount?:number};
type DayResult={items:{id:string;name?:string;title?:string;next_at?:string;due_at?:string}[];total:number};
const WEEKDAYS=['Да','Мя','Лх','Пү','Ба','Бя','Ня'];
function monthGrid(month:string){
 const [y,m]=month.split('-').map(Number),cells:(string|null)[]=Array((new Date(Date.UTC(y,m-1,1)).getUTCDay()+6)%7).fill(null);
 for(let d=1;d<=new Date(Date.UTC(y,m,0)).getUTCDate();d++)cells.push(`${month}-${String(d).padStart(2,'0')}`);
 while(cells.length%7)cells.push(null);return cells;
}
export function shiftMonth(month:string,delta:number){const [y,m]=month.split('-').map(Number),d=new Date(Date.UTC(y,m-1+delta,1));return d.getUTCFullYear()+'-'+String(d.getUTCMonth()+1).padStart(2,'0');}
export default function MonthCalendar({month,onMonthChange,events,onOpen,todayDate,loading,error='',onRetry,endpoint}:{month:string;onMonthChange:(m:string)=>void;events:CalEvent[];onOpen:(id:string)=>void;todayDate:string;loading?:boolean;error?:string;onRetry?:()=>void;endpoint:string}){
 const [day,setDay]=useState(''),[page,setPage]=useState(1);
 const result=useRemote<DayResult>(day?endpoint+'&day='+day+'&page='+page:null);
 const byDay=new Map<string,CalEvent[]>();for(const event of events){const list=byDay.get(event.date)||[];list.push(event);byDay.set(event.date,list);}
 const openDay=(date:string)=>{setPage(1);setDay(date);};
 const label=month.slice(0,4)+' оны '+Number(month.slice(5))+' сар';
 return <div className="month-cal" aria-busy={loading}>
 <div className="month-cal-head"><Button variant="outline" size="icon" aria-label="Өмнөх сар" onClick={()=>onMonthChange(shiftMonth(month,-1))}><ChevronLeft size={16}/></Button><strong>{label}</strong><Button variant="outline" size="icon" aria-label="Дараагийн сар" onClick={()=>onMonthChange(shiftMonth(month,1))}><ChevronRight size={16}/></Button><Button variant="ghost" onClick={()=>onMonthChange(todayDate.slice(0,7))}>Энэ сар</Button></div>
 <AsyncStatus error={error} loading={!!loading} retry={onRetry||(()=>{})}/>
 {!error&&!loading&&<><div className="month-cal-grid">
 {WEEKDAYS.map(w=><div key={w} className="month-cal-weekday">{w}</div>)}
 {monthGrid(month).map((date,i)=><div key={date||i} className={'month-cal-day'+(!date?' empty':'')+(date===todayDate?' today':'')}>
 {date&&<><span className="month-cal-daynum">{Number(date.slice(8))}</span><div className="month-cal-events">{(byDay.get(date)||[]).slice(0,3).map(e=><button key={e.id} className={'month-cal-event '+(e.className||'')} onClick={()=>onOpen(e.id)} title={e.label}>{e.label}</button>)}{(byDay.get(date)?.[0]?.dayCount||byDay.get(date)?.length||0)>3&&<button className="month-cal-more" onClick={()=>openDay(date)} aria-label={date+' өдрийн бүх ажлыг харах'}>+{(byDay.get(date)?.[0]?.dayCount||byDay.get(date)!.length)-3} илүү</button>}</div></>}
 </div>)}</div>
 <div className="mobile-agenda" aria-label="Өдрөөр харах">{[...byDay].sort(([a],[b])=>a.localeCompare(b)).map(([date,items])=><button key={date} onClick={()=>openDay(date)}><span>{date}{date===todayDate?' · Өнөөдөр':''}</span><strong>{items[0].dayCount||items.length} ажил</strong></button>)}</div>
 {!events.length&&<p className="muted chat-empty-list">Энэ сард сонгосон шүүлтэд тохирох тов бүхий ажил алга.</p>}</>}
 <Dialog open={!!day} onOpenChange={open=>{if(!open)setDay('');}}><DialogContent className="form-dialog"><DialogHeader><DialogTitle>{day} · Ажлын жагсаалт</DialogTitle><DialogDescription>Сонгосон шүүлтэд тохирох тухайн өдрийн бүх ажил.</DialogDescription></DialogHeader><AsyncStatus error={result.error} loading={result.loading} retry={result.retry}/>{result.data&&<><div className="day-agenda">{result.data.items.map(item=><button key={item.id} onClick={()=>{setDay('');onOpen(item.id);}}>{item.name||item.title}<time>{dateLabel(item.next_at||item.due_at||null)}</time></button>)}</div><div className="row between"><Button variant="outline" disabled={page<=1} onClick={()=>setPage(p=>p-1)}>Өмнөх</Button><span>{page} / {Math.max(1,Math.ceil(result.data.total/50))} · {result.data.total} ажил</span><Button variant="outline" disabled={page*50>=result.data.total} onClick={()=>setPage(p=>p+1)}>Дараах</Button></div></>}</DialogContent></Dialog>
 </div>;
}
