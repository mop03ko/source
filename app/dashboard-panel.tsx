'use client';
import {ResponsiveTabs as Tabs} from '@/components/responsive-tabs';
import {TextareaControl} from '@/components/ui/form-controls';
import {GuardedForm,markFormSaved,markFormError} from '@/components/draft-guard';
import {AsyncStatus} from '@/components/async-status';
import {ReportExport} from '@/components/report-export';
import type {ReportDoc} from '@/lib/report-export';
import {useCallback,useEffect,useState,useRef} from 'react';
import {BadgeCheck,Loader2} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {Alert,Card,DatePicker,Empty,Progress,Skeleton,Statistic,Table,Tag} from 'antd';
import dayjs from 'dayjs';
import {toast} from '@/components/ui/sonner';
import {dateLabel,stages,marketingStages,itStages,type Member} from '@/lib/crm';
type ModuleStats={total:number;active:number;overdue:number;done:number};
type SalesStats={total:number;won:number;due:number;recycled:number;recycle_overdue:number;unassigned:number};
type Distribution={status:string;count:number};
type Pending={id:string;title:string;channel:string;owner:string;status:string;due_at:string|null;budget:number;version:number};
type MarketingReport={total:number;byStatus:Distribution[];budget:{total:number;approved:number;unapproved:number}};
type ItReport={total:number;byStatus:Distribution[]};
async function approveTask(body:unknown){const form=document.activeElement?.closest('form')||null;const r=await fetch('/api/marketing',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json() as {error?:string};if(!r.ok){markFormError(form,d.error||'Хүсэлт амжилтгүй.');throw new Error(d.error||'Хүсэлт амжилтгүй.');}markFormSaved(form);return d;}
// Төлөв тус бүрийн тоо, эзлэх хувийг ил тод харуулах хэвтээ багана (одоо байгаа Тайлангийн загвартай адил).
function BarList({rows,total}:{rows:{key:string;label:string;count:number}[];total:number}){
 return <div className="dashboard-bars">{rows.filter(r=>r.count>0).length?rows.filter(r=>r.count>0).map(r=>{const pct=total?Math.round(r.count/total*100):0;return <div key={r.key}><div className="row between"><span>{r.label}</span><strong>{r.count.toLocaleString()} <small>({pct}%)</small></strong></div><Progress aria-label={`${r.label}: ${r.count} (${pct}%)`} percent={pct} showInfo={false} size="small"/></div>;}):<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Энэ хугацаанд бүртгэл алга"/>}</div>;
}
export default function DashboardPanel({members,salesStats,salesDistribution,rfrom,rto,onRange,onOpenTask}:{members:Member[];salesStats:SalesStats;salesDistribution:Distribution[];rfrom:string;rto:string;onRange:(from:string,to:string)=>void;onOpenTask:(id:string)=>void}){
 const loadSequence=useRef(0);
 const [marketing,setMarketing]=useState<ModuleStats|null>(null),[it,setIt]=useState<ModuleStats|null>(null);
 const [marketingReport,setMarketingReport]=useState<MarketingReport|null>(null),[itReport,setItReport]=useState<ItReport|null>(null);
 const [pending,setPending]=useState<Pending[]>([]),[pendingCount,setPendingCount]=useState(0),[pendingBudget,setPendingBudget]=useState(0);
 const [loading,setLoading]=useState(true),[error,setError]=useState(''),[busyId,setBusyId]=useState('');
 const [approveTarget,setApproveTarget]=useState<Pending|null>(null),[approveNote,setApproveNote]=useState('');
 const ownerName=(email:string)=>members.find(m=>m.email===email)?.name||email;
 const load=useCallback(async()=>{const sequence=++loadSequence.current;setLoading(true);try{
  const range='&'+new URLSearchParams({rfrom,rto});
  const [mRes,mrRes,iRes,irRes,pRes]=await Promise.all([
   fetch('/api/marketing',{cache:'no-store',signal:AbortSignal.timeout(20000)}),
   fetch('/api/marketing?report=1'+range,{cache:'no-store',signal:AbortSignal.timeout(20000)}),
   fetch('/api/it',{cache:'no-store',signal:AbortSignal.timeout(20000)}),
   fetch('/api/it?report=1'+range,{cache:'no-store',signal:AbortSignal.timeout(20000)}),
   fetch('/api/marketing?pending_approvals=1',{cache:'no-store',signal:AbortSignal.timeout(20000)}),
  ]);
  const [mData,mrData,iData,irData,pData]=await Promise.all([mRes.json(),mrRes.json(),iRes.json(),irRes.json(),pRes.json()]) as [
   {stats?:ModuleStats;error?:string},MarketingReport&{error?:string},{stats?:ModuleStats;error?:string},ItReport&{error?:string},
   {items?:Pending[];count?:number;budget?:number;error?:string},
  ];
  if(!mRes.ok)throw new Error(mData.error||'Уншиж чадсангүй.');
  if(!mrRes.ok)throw new Error(mrData.error||'Уншиж чадсангүй.');
  if(!iRes.ok)throw new Error(iData.error||'Уншиж чадсангүй.');
  if(!irRes.ok)throw new Error(irData.error||'Уншиж чадсангүй.');
  if(!pRes.ok)throw new Error(pData.error||'Уншиж чадсангүй.');
  if(sequence!==loadSequence.current)return;
  setMarketing(mData.stats||null);setIt(iData.stats||null);
  setMarketingReport(mrData);setItReport(irData);
  setPending(pData.items||[]);setPendingCount(pData.count||0);setPendingBudget(pData.budget||0);
  setError('');
 }catch(e){if(sequence===loadSequence.current)setError((e as Error).message);}finally{if(sequence===loadSequence.current)setLoading(false);}},[rfrom,rto]);
 const invalidateLoad=useCallback(()=>{loadSequence.current++;},[]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>{clearTimeout(timer);invalidateLoad();};},[load,invalidateLoad]);
 const approve=async()=>{if(!approveTarget||!approveNote.trim())return;const t=approveTarget;setBusyId(t.id);try{await approveTask({action:'approve',id:t.id,version:t.version,data:{note:approveNote.trim()}});toast.success('Төсөв баталгаажлаа.');setApproveTarget(null);setApproveNote('');await load();}catch(e){toast.error((e as Error).message);}finally{setBusyId('');}};

 const salesTotal=salesDistribution.reduce((n,d)=>n+d.count,0);
 const salesWon=salesDistribution.find(d=>d.status==='won')?.count||0;
 const salesConversion=salesTotal?Math.round(salesWon/salesTotal*1000)/10:0;
 const budget=marketingReport?.budget||{total:0,approved:0,unapproved:0};
 const budgetApprovedPct=budget.total?Math.round(budget.approved/budget.total*100):0;
 // Бүх модулийн ерөнхий үзүүлэлтийг Excel/PDF-д нэг ижил бүтэцтэй гаргана.
 const reportDoc=():ReportDoc=>({title:'Хяналтын самбар',meta:[`Хугацаа: ${rfrom||'бүх'} — ${rto||'өнөөдөр'}`],sheets:[
  {name:'Борлуулалт',columns:[{header:'Үзүүлэлт',width:30},{header:'Дүн'}],rows:[
   ['Нийт хүсэлт',salesTotal],['Худалдан авсан',salesWon],['Хөрвөлт %',salesConversion],
   ['Холбогдох хүсэлт',salesStats.due],['Дахин холбогдох',salesStats.recycled],
   ['Хугацаа хэтэрсэн',salesStats.recycle_overdue],['Хариуцагчгүй',salesStats.unassigned]]},
  {name:'Хүсэлтийн төлөв',columns:[{header:'Төлөв',width:26},{header:'Тоо'},{header:'Хувь %'}],
   rows:salesDistribution.map(d=>[stages[d.status]||d.status,d.count,salesTotal?Math.round(d.count/salesTotal*100):0])},
  {name:'Маркетинг',columns:[{header:'Үзүүлэлт',width:30},{header:'Дүн'}],rows:[
   ['Нийт ажил',marketing?.total||0],['Идэвхтэй',marketing?.active||0],['Хугацаа хэтэрсэн',marketing?.overdue||0],['Дууссан',marketing?.done||0],
   ['Нийт төсөв',budget.total],['Батлагдсан төсөв',budget.approved],['Батлагдаагүй төсөв',budget.unapproved],['Батлагдсан %',budgetApprovedPct]]},
  {name:'IT',columns:[{header:'Үзүүлэлт',width:30},{header:'Дүн'}],rows:[
   ['Нийт ажил',it?.total||0],['Идэвхтэй',it?.active||0],['Хугацаа хэтэрсэн',it?.overdue||0],['Дууссан',it?.done||0]]},
  {name:'Батлах хүлээж буй',columns:[{header:'Ажил',width:38},{header:'Суваг',width:26},{header:'Хариуцагч',width:22},{header:'Төсөв'},{header:'Товлосон',width:14}],
   rows:pending.map(x=>[x.title,x.channel,ownerName(x.owner),x.budget,x.due_at?x.due_at.slice(0,10):''])},
 ]});
 const metrics=(values:{label:string;value:number;suffix?:string;hint?:string}[])=><div className="dashboard-stat-grid">{values.map(v=><Card size="small" key={v.label}><Statistic title={v.label} value={v.value} suffix={v.suffix} groupSeparator=","/><small>{v.hint}</small></Card>)}</div>;
 return <section className="dashboard-report" aria-label="Удирдлагын тайлан">
 <div className="dashboard-report-heading"><div><h2>Үйл ажиллагааны тайлан</h2><p className="muted">Өнөөдрийн ажлын дарааллаас тусдаа, хугацаагаар харьцуулж харах мэдээлэл.</p></div><ReportExport doc={reportDoc} disabled={loading||!!error}/></div>
 <div className="dashboard-range"><div><strong>Тайлангийн хугацаа</strong><small>Хүсэлт, ажил үүссэн огноогоор</small></div><DatePicker.RangePicker aria-label="Тайлангийн хугацаа" value={[rfrom?dayjs(rfrom):null,rto?dayjs(rto):null]} onChange={dates=>onRange(dates?.[0]?.format('YYYY-MM-DD')||'',dates?.[1]?.format('YYYY-MM-DD')||'')} placeholder={['Эхлэх огноо','Дуусах огноо']} allowEmpty={[true,true]}/><Tag>{rfrom||rto?`${rfrom||'Эхнээс'} — ${rto||'өнөөдөр'}`:'Бүх хугацаа'}</Tag></div>
 <AsyncStatus error={error} loading={false} retry={()=>void load()}/>
 {loading?<Skeleton active paragraph={{rows:6}}/>:!error&&<>
 {pendingCount>0&&<Card className="dashboard-approval-card" title={<span>Шийдвэр хүлээж байна <Tag color="orange">{pendingCount} төсөв</Tag></span>}><p>Одоогоор батлагдаагүй нийт {pendingBudget.toLocaleString()} ₮. Дээрх хугацааны шүүлтүүрээс үл хамаарна.</p><Table<Pending> size="small" rowKey="id" dataSource={pending} pagination={{pageSize:5,showSizeChanger:false}} scroll={{x:650}} columns={[{title:'Ажил / хариуцагч',key:'task',render:(_,t)=><><button className="lead-link dashboard-task-link" onClick={()=>onOpenTask(t.id)}>{t.title}</button><small className="dashboard-subtext">{ownerName(t.owner)} · {t.channel}</small></>},{title:'Төсөв',dataIndex:'budget',align:'right',render:v=>v.toLocaleString()+' ₮'},{title:'Хугацаа',dataIndex:'due_at',render:v=>v?dateLabel(v):'Товлоогүй'},{title:'Үйлдэл',key:'action',render:(_,t)=><div className="row"><Button size="sm" variant="outline" onClick={()=>onOpenTask(t.id)}>Дэлгэрэнгүй</Button><Button size="sm" onClick={()=>{setApproveTarget(t);setApproveNote('');}}>Хянаж батлах</Button></div>}]}/>{pending.length<pendingCount&&<Alert type="info" title={`Эхний ${pending.length} ажлыг харуулж байна. Үлдсэнийг Маркетинг хэсгээс харна.`}/>}</Card>}
 <Tabs className="dashboard-report-tabs" items={[
 {key:'sales',label:'Борлуулалтын хүсэлт',children:<>{metrics([{label:'Ирсэн хүсэлт',value:salesTotal,hint:'Сонгосон хугацаанд үүссэн'},{label:'Худалдан авсан',value:salesWon,hint:'Тэдгээр хүсэлтийн одоогийн төлөв'},{label:'Хөрвөлт',value:salesConversion,suffix:'%',hint:'Худалдан авсан ÷ ирсэн хүсэлт'}])}<Card title="Хүсэлтүүд одоо ямар төлөвтэй байна вэ?"><BarList rows={Object.entries(stages).map(([key,label])=>({key,label,count:salesDistribution.find(d=>d.status===key)?.count||0}))} total={salesTotal}/></Card></>},
 {key:'marketing',label:'Маркетинг',children:<><Alert type="info" showIcon title="Одоогийн ажлын ачаалал · бүх хугацаа"/>{metrics([{label:'Идэвхтэй ажил',value:marketing?.active||0},{label:'Хугацаа хэтэрсэн',value:marketing?.overdue||0},{label:'Дууссан',value:marketing?.done||0}])}<Card title="Сонгосон хугацаанд үүссэн ажил"><BarList rows={Object.entries(marketingStages).map(([key,label])=>({key,label,count:marketingReport?.byStatus.find(d=>d.status===key)?.count||0}))} total={marketingReport?.total||0}/></Card>{metrics([{label:'Нийт төсөв',value:budget.total,suffix:'₮'},{label:'Батлагдсан',value:budget.approved,suffix:'₮'},{label:'Батлагдаагүй',value:budget.unapproved,suffix:'₮'}])}<Progress aria-label={`Батлагдсан төсөв: ${budgetApprovedPct}%`} percent={budgetApprovedPct} format={pct=>`${pct}% батлагдсан`}/></>},
 {key:'it',label:'IT',children:<><Alert type="info" showIcon title="Одоогийн ажлын ачаалал · бүх хугацаа"/>{metrics([{label:'Идэвхтэй ажил',value:it?.active||0},{label:'Хугацаа хэтэрсэн',value:it?.overdue||0},{label:'Дууссан',value:it?.done||0}])}<Card title="Сонгосон хугацаанд үүссэн ажил"><BarList rows={Object.entries(itStages).map(([key,label])=>({key,label,count:itReport?.byStatus.find(d=>d.status===key)?.count||0}))} total={itReport?.total||0}/></Card></>},
 ]}/></>}

 <Dialog open={!!approveTarget} onOpenChange={o=>{if(!o&&!busyId){setApproveTarget(null);setApproveNote('');}}}><DialogContent><DialogHeader><DialogTitle>Төсөв батлах</DialogTitle><DialogDescription>{approveTarget?.title} · {approveTarget?.budget.toLocaleString()}₮</DialogDescription></DialogHeader><GuardedForm className="form-stack" onSubmit={e=>{e.preventDefault();approve();}}><label className="field"><span>Батлах шалтгаан *</span><TextareaControl required maxLength={2000} rows={3} value={approveNote} onChange={e=>setApproveNote(e.target.value)} placeholder="Батлах шалтгаан, тохиролцоог тэмдэглэнэ үү…"/></label><Button type="submit" className="primary full" disabled={!approveTarget||busyId===approveTarget.id||!approveNote.trim()}>{approveTarget&&busyId===approveTarget.id?<Loader2 className="spin" size={16}/>:<BadgeCheck size={16}/>}Батлах</Button></GuardedForm></DialogContent></Dialog>
 </section>;
}
