'use client';
import {Alert,Card,Empty,Pagination,Statistic,Tag} from 'antd';
import {useState} from 'react';
import {useRemote} from '@/hooks/use-remote';
import {AsyncStatus} from '@/components/async-status';
import {Button} from '@/components/ui/button';
import {dateLabel,roles,itStages,marketingStages,deliveryStatuses,isIsolatedRole,type Member} from '@/lib/crm';
type Daily={day:string;shift:{assignment:string;note:string}[];items:{id:string;title:string;status:string;due_at:string;context:string}[];count:number;summary:{due:number;overdue:number;unscheduled:number}|null};
export default function DailyWorkPanel({me,refresh,day,onNavigate,onOpen}:{me:Member;refresh:number;day:string;onNavigate:(view:string)=>void;onOpen:(targetView:string,id:string)=>void}){
 const [page,setPage]=useState(1);
 const result=useRemote<Daily>('/api/dashboard?'+new URLSearchParams({page:String(page),refresh:String(refresh),day}));
 const d=result.data,isolated=isIsolatedRole(me.role),targetView=me.role==='delivery'?'delivery':me.role;
 const description:Record<string,string>={admin:'Багийн өнөөдрийн дараалал, хуваарилалт, батлах ажлуудаа хянана.',director:'Багийн явц, хугацаа хэтэрсэн ажил, батлах төсвөө хянана.',manager:'Багийн холбоо барих дараалал, хариуцагчгүй хүсэлт, хуваарилалтаа удирдана.',agent:'Танд хуваарилсан өнөөдрийн болон хугацаа хэтэрсэн хүсэлтүүд.',marketing:'Танд хуваарилсан өнөөдрийн болон хоцорсон маркетингийн ажлууд.',it:'Танд хуваарилсан өнөөдрийн болон хоцорсон IT ажлууд.',delivery:'Танд хуваарилсан өнөөдрийн болон хоцорсон хүргэлтүүд.'};
 return <section className="panel daily-work" aria-label="Эрхэд тохирсон өнөөдрийн ажил"><div className="section-heading"><div><div className="eyebrow">{roles[me.role]} · {day}</div><h2>{isolated||me.role==='agent'?'Миний өнөөдрийн ажил':'Багийн өнөөдрийн ажил'}</h2><p className="muted">{description[me.role]}</p></div><Button variant="outline" onClick={()=>onNavigate('schedule')}>Баг ба хуваарь</Button></div>
  <AsyncStatus error={result.error} loading={result.loading} retry={result.retry}/>
  {d&&!result.loading&&!result.error&&<><div className="daily-shift"><strong>Миний өнөөдрийн хуваарь:</strong> {d.shift.length?d.shift.map((s,i)=><Tag key={i} title={s.note}>{s.assignment}</Tag>):<span className="muted">Хуваарь бүртгээгүй</span>}</div>
   {!isolated&&me.role!=='agent'&&<div className="row"><Button variant="outline" onClick={()=>onNavigate('all')}>Хүсэлт хуваарилах</Button><Button variant="outline" onClick={()=>onNavigate('delivery')}>Хүргэлт хянах</Button></div>}
   {isolated&&d.summary&&<>{d.summary.overdue>0&&<Alert className="daily-priority" showIcon type="warning" title={`${d.summary.overdue} ажил хугацаа хэтэрсэн`} description="Доорх жагсаалт хамгийн эрт товлосон ажлаас эхэлнэ. Эхэлж хоцорсон ажлуудаа шалгаарай."/>}<div className="daily-metrics">{[['Өнөөдөр товлосон',d.summary.due-d.summary.overdue],['Хугацаа хэтэрсэн',d.summary.overdue],['Хугацаа товлоогүй',d.summary.unscheduled]].map(([label,n])=><Card key={label} size="small"><Statistic title={label} value={Number(n)} groupSeparator=","/></Card>)}</div>
    {d.items.length?<ul className="daily-task-list">{d.items.map(t=><li key={t.id}><button onClick={()=>onOpen(targetView,t.id)}><span><strong>{t.title}</strong><small>{t.context}</small></span><span><Tag color={t.due_at<(me.role==='delivery'?day:new Date(day+'T00:00:00+08:00').toISOString())?'orange':'blue'}>{me.role==='delivery'?t.due_at:dateLabel(t.due_at)}</Tag><small>{(me.role==='delivery'?deliveryStatuses:me.role==='marketing'?marketingStages:itStages)[t.status]||t.status} · Нээх →</small></span></button></li>)}</ul>:<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={d.summary.unscheduled?`Товтой ажил алга. Хугацаа товлоогүй ${d.summary.unscheduled} ажлыг “Бүх ажил харах”-аас шалгана уу.`:'Өнөөдөр хийх болон хоцорсон ажил алга'}/>}
    <div className="daily-footer"><Button variant="outline" onClick={()=>onNavigate(targetView)}>Бүх {me.role==='delivery'?'хүргэлт':'ажил'} харах</Button><Pagination current={page} total={d.count} pageSize={20} showSizeChanger={false} onChange={setPage} hideOnSinglePage/></div>
   </>}
  </>}
 </section>;
}
