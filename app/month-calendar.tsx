'use client';
import {ChevronLeft,ChevronRight} from 'lucide-react';
import {Button} from '@/components/ui/button';
export type CalEvent={id:string;date:string;label:string;className?:string};
const WEEKDAYS=['Да','Мя','Лх','Пү','Ба','Бя','Ня'];
// Тухайн сарын нүднүүдийг (өмнөх/дараагийн сарын хоосон зайг оруулаад) Даваагаар эхлүүлж угсарна.
function monthGrid(month:string){
 const [y,m]=month.split('-').map(Number);
 const startWeekday=(new Date(Date.UTC(y,m-1,1)).getUTCDay()+6)%7;
 const daysInMonth=new Date(Date.UTC(y,m,0)).getUTCDate();
 const cells:(string|null)[]=Array(startWeekday).fill(null);
 for(let d=1;d<=daysInMonth;d++)cells.push(`${month}-${String(d).padStart(2,'0')}`);
 while(cells.length%7)cells.push(null);
 return cells;
}
export function shiftMonth(month:string,delta:number){
 const [y,m]=month.split('-').map(Number);
 const d=new Date(Date.UTC(y,m-1+delta,1));
 return d.getUTCFullYear()+'-'+String(d.getUTCMonth()+1).padStart(2,'0');
}
export default function MonthCalendar({month,onMonthChange,events,onOpen,todayDate,loading}:{month:string;onMonthChange:(m:string)=>void;events:CalEvent[];onOpen:(id:string)=>void;todayDate:string;loading?:boolean}){
 const cells=monthGrid(month);
 const byDay=new Map<string,CalEvent[]>();
 for(const e of events){const list=byDay.get(e.date)||[];list.push(e);byDay.set(e.date,list);}
 const label=new Intl.DateTimeFormat('mn-MN',{year:'numeric',month:'long'}).format(new Date(month+'-01T00:00:00Z'));
 return <div className="month-cal">
 <div className="month-cal-head"><Button variant="outline" size="icon" aria-label="Өмнөх сар" onClick={()=>onMonthChange(shiftMonth(month,-1))}><ChevronLeft size={16}/></Button><strong>{label}</strong><Button variant="outline" size="icon" aria-label="Дараагийн сар" onClick={()=>onMonthChange(shiftMonth(month,1))}><ChevronRight size={16}/></Button>{loading&&<span className="muted month-cal-loading">Ачаалж байна…</span>}</div>
 <div className="month-cal-grid">
 {WEEKDAYS.map(w=><div key={w} className="month-cal-weekday">{w}</div>)}
 {cells.map((date,i)=><div key={i} className={'month-cal-day'+(!date?' empty':'')+(date===todayDate?' today':'')}>
 {date&&<><span className="month-cal-daynum">{Number(date.slice(8,10))}</span>
 <div className="month-cal-events">{(byDay.get(date)||[]).slice(0,3).map(e=><button type="button" key={e.id} className={'month-cal-event '+(e.className||'')} onClick={()=>onOpen(e.id)} title={e.label}>{e.label}</button>)}
 {(byDay.get(date)?.length||0)>3&&<span className="month-cal-more">+{(byDay.get(date)!.length)-3} илүү</span>}</div></>}
 </div>)}
 </div>
 {!events.length&&!loading&&<p className="muted chat-empty-list">Энэ сард тов бүхий ажил алга.</p>}
 </div>;
}
