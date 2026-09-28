'use client';
import {Button,Tabs,Tag} from 'antd';
import {CalendarDays,CheckSquare,ChartNoAxesCombined,MessageSquare,Users} from 'lucide-react';
import type {ReactNode} from 'react';
import {roles,type Member} from '@/lib/crm';
export type DashboardSection='day'|'meetings'|'reports';
export default function DashboardWorkspace({me,section,onSection,onNavigate,daily,todos,meetings,canReport}:{me:Member;section:DashboardSection;onSection:(v:DashboardSection)=>void;onNavigate:(v:string)=>void;daily:ReactNode;todos:ReactNode;meetings:ReactNode;canReport:boolean}){
 return <section className="dashboard-workspace" aria-label="Миний ажлын орчин">
  <div className="dashboard-welcome"><div><div className="dashboard-kicker">МИНИЙ АЖЛЫН ОРЧИН <Tag>{roles[me.role]}</Tag></div><h2>Сайн байна уу, {me.name}.</h2><p>Өдрийн ажлаа төлөвлөж, багтайгаа холбоотой байгаарай.</p></div><div className="dashboard-shortcuts"><Button icon={<MessageSquare size={16}/>} onClick={()=>onNavigate('chat')}>Чат</Button><Button icon={<Users size={16}/>} onClick={()=>onNavigate('schedule')}>Баг ба хуваарь</Button></div></div>
  <Tabs className="dashboard-workspace-tabs" activeKey={section} onChange={v=>onSection(v as DashboardSection)} items={[
   {key:'day',label:'Миний өдөр',icon:<CheckSquare size={16}/>,children:<div className="dashboard-day-grid"><div className="dashboard-day-primary">{todos}</div><aside className="dashboard-day-context">{daily}<div className="dashboard-meeting-shortcut"><CalendarDays size={22}/><div><strong>Дараагийн уулзалтаа төлөвлөе</strong><p>Оролцох уулзалтууд болон сануулгаа нэг дороос хараарай.</p><Button type="link" onClick={()=>onSection('meetings')}>Хурал, уулзалт нээх →</Button></div></div></aside></div>},
   {key:'meetings',label:'Хурал, уулзалт',icon:<CalendarDays size={16}/>,children:meetings},
   ...(canReport?[{key:'reports',label:'Тайлан',icon:<ChartNoAxesCombined size={16}/>,children:<div className="dashboard-report-intro">Хугацаагаа сонгож, багийн үйл ажиллагаа болон шийдвэр хүлээж буй ажлуудыг хянана.</div>}]:[])
  ]}/>
 </section>;
}
