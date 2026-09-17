'use client';
import {useCallback,useEffect,useState} from 'react';
import {BadgeCheck,Loader2,Wallet,ShieldAlert} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {Table,TableHeader,TableHead,TableBody,TableRow,TableCell} from '@/components/ui/table';
import {toast} from 'sonner';
import {dateLabel,stages,marketingStages,itStages,type Member} from '@/lib/crm';
type ModuleStats={total:number;active:number;overdue:number;done:number};
type SalesStats={total:number;won:number;due:number;recycled:number;recycle_overdue:number;unassigned:number};
type Distribution={status:string;count:number};
type Pending={id:string;title:string;channel:string;owner:string;status:string;due_at:string|null;budget:number;version:number};
type MarketingReport={total:number;byStatus:Distribution[];budget:{total:number;approved:number;unapproved:number}};
type ItReport={total:number;byStatus:Distribution[]};
async function approveTask(body:unknown){const r=await fetch('/api/marketing',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json() as {error?:string};if(!r.ok)throw new Error(d.error||'Хүсэлт амжилтгүй.');return d;}
// Төлөв тус бүрийн тоо, эзлэх хувийг ил тод харуулах хэвтээ багана (одоо байгаа Тайлангийн загвартай адил).
function BarList({rows,total}:{rows:{key:string;label:string;count:number}[];total:number}){
 return <div className="bars">{rows.map(r=>{const pct=total?Math.round(r.count/total*100):0;return <div className="bar-row" key={r.key}><div><span>{r.label}</span><strong>{r.count.toLocaleString()} <small>({pct}%)</small></strong></div><div className="bar-track"><span style={{width:pct+'%'}}/></div></div>;})}</div>;
}
export default function DashboardPanel({members,salesStats,salesDistribution}:{members:Member[];salesStats:SalesStats;salesDistribution:Distribution[]}){
 const [marketing,setMarketing]=useState<ModuleStats|null>(null),[it,setIt]=useState<ModuleStats|null>(null);
 const [marketingReport,setMarketingReport]=useState<MarketingReport|null>(null),[itReport,setItReport]=useState<ItReport|null>(null);
 const [pending,setPending]=useState<Pending[]>([]),[pendingCount,setPendingCount]=useState(0),[pendingBudget,setPendingBudget]=useState(0);
 const [loading,setLoading]=useState(true),[error,setError]=useState(''),[busyId,setBusyId]=useState('');
 const [approveTarget,setApproveTarget]=useState<Pending|null>(null),[approveNote,setApproveNote]=useState('');
 const ownerName=(email:string)=>members.find(m=>m.email===email)?.name||email;
 const load=useCallback(async()=>{setLoading(true);try{
  const [mRes,mrRes,iRes,irRes,pRes]=await Promise.all([
   fetch('/api/marketing',{cache:'no-store'}),
   fetch('/api/marketing?report=1',{cache:'no-store'}),
   fetch('/api/it',{cache:'no-store'}),
   fetch('/api/it?report=1',{cache:'no-store'}),
   fetch('/api/marketing?pending_approvals=1',{cache:'no-store'}),
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
  setMarketing(mData.stats||null);setIt(iData.stats||null);
  setMarketingReport(mrData);setItReport(irData);
  setPending(pData.items||[]);setPendingCount(pData.count||0);setPendingBudget(pData.budget||0);
  setError('');
 }catch(e){setError((e as Error).message);}finally{setLoading(false);}},[]);
 useEffect(()=>{load();},[load]);
 const approve=async()=>{if(!approveTarget||!approveNote.trim())return;const t=approveTarget;setBusyId(t.id);try{await approveTask({action:'approve',id:t.id,version:t.version,data:{note:approveNote.trim()}});toast.success('Төсөв баталгаажлаа.');setApproveTarget(null);setApproveNote('');await load();}catch(e){toast.error((e as Error).message);}finally{setBusyId('');}};
 if(loading&&!marketing&&!it)return <div className="loading"><Loader2 className="spin"/>Ачаалж байна…</div>;
 const salesTotal=salesDistribution.reduce((n,d)=>n+d.count,0);
 const salesWon=salesDistribution.find(d=>d.status==='won')?.count||0;
 const salesConversion=salesTotal?Math.round(salesWon/salesTotal*1000)/10:0;
 const budget=marketingReport?.budget||{total:0,approved:0,unapproved:0};
 const budgetApprovedPct=budget.total?Math.round(budget.approved/budget.total*100):0;
 return <>
 {error&&<div role="alert" className="error-box">{error}</div>}
 <div className="reports-grid">
 <div className="budget-cards team-report">
 <section className="panel"><div className="eyebrow">БОРЛУУЛАЛТ</div><h2>Хүсэлтийн үзүүлэлт</h2><div className="sync-summary"><div><span>Нийт хүсэлт</span><strong>{salesStats.total.toLocaleString()}</strong></div><div><span>Холбогдох хүсэлт</span><strong>{salesStats.due.toLocaleString()}</strong></div><div><span>Идэвхтэй Recycle</span><strong>{salesStats.recycled.toLocaleString()}</strong></div><div><span>Хугацаа хэтэрсэн Recycle</span><strong>{salesStats.recycle_overdue.toLocaleString()}</strong></div><div><span>Хуваарилагдаагүй</span><strong>{salesStats.unassigned.toLocaleString()}</strong></div><div><span>Худалдан авсан</span><strong>{salesStats.won.toLocaleString()}</strong></div></div></section>
 <section className="panel"><div className="eyebrow">МАРКЕТИНГ</div><h2>Ажлын үзүүлэлт</h2><div className="sync-summary"><div><span>Нийт ажил</span><strong>{marketing?.total??0}</strong></div><div><span>Идэвхтэй</span><strong>{marketing?.active??0}</strong></div><div><span>Хугацаа хэтэрсэн</span><strong>{marketing?.overdue??0}</strong></div><div><span>Баталгаажсан төсөв</span><strong>{budget.approved.toLocaleString()}₮</strong></div><div><span>Баталгаажаагүй төсөв</span><strong>{budget.unapproved.toLocaleString()}₮</strong></div><div><span>Баталгаажилтын хувь</span><strong>{budgetApprovedPct}%</strong></div></div></section>
 <section className="panel"><div className="eyebrow">IT</div><h2>Ажлын үзүүлэлт</h2><div className="sync-summary"><div><span>Нийт ажил</span><strong>{it?.total??0}</strong></div><div><span>Идэвхтэй</span><strong>{it?.active??0}</strong></div><div><span>Хугацаа хэтэрсэн</span><strong>{it?.overdue??0}</strong></div></div></section>
 </div>
 <section className="panel"><div className="eyebrow">БОРЛУУЛАЛТ</div><h2>Хүсэлтийн төлөвийн задаргаа</h2><p className="muted">Одоо байгаа бүх хүсэлтийн төлөв тус бүрийн тоо, эзлэх хувь.</p><BarList rows={Object.entries(stages).map(([k,v])=>({key:k,label:v,count:salesDistribution.find(d=>d.status===k)?.count||0}))} total={salesTotal}/></section>
 <section className="panel report-summary"><div className="eyebrow">ХӨРВӨЛТ</div><strong className="big-number">{salesConversion}<span>%</span></strong><h2>Худалдан авалтын хөрвөлт</h2><p>Худалдан авсан төлөвтэй хүсэлт ÷ нийт хүсэлт.</p></section>
 <section className="panel team-report"><div className="eyebrow">МАРКЕТИНГ</div><h2>Ажлын төлөв ба төсвийн баталгаажилт</h2><p className="muted">Ажлын төлөв тус бүрийн тоо, эзлэх хувь, төсвийн баталгаажилтын байдал.</p><BarList rows={Object.entries(marketingStages).map(([k,v])=>({key:k,label:v,count:marketingReport?.byStatus.find(b=>b.status===k)?.count||0}))} total={marketingReport?.total||0}/><div className="budget-cards"><div className="metric"><div><span>Нийт төсөв</span><Wallet size={19}/></div><strong>{budget.total.toLocaleString()}₮</strong></div><div className="metric"><div><span>Баталгаажсан</span><BadgeCheck size={19}/></div><strong>{budget.approved.toLocaleString()}₮</strong></div><div className={'metric'+(budget.unapproved?' metric-alert':'')}><div><span>Баталгаажаагүй</span><ShieldAlert size={19}/></div><strong>{budget.unapproved.toLocaleString()}₮</strong></div></div><BarList rows={[{key:'approved',label:'Баталгаажсан хувь',count:budgetApprovedPct}]} total={100}/></section>
 <section className="panel team-report"><div className="eyebrow">IT</div><h2>Ажлын төлөвийн задаргаа</h2><p className="muted">Бүх IT ажлын төлөв тус бүрийн тоо, эзлэх хувь.</p><BarList rows={Object.entries(itStages).map(([k,v])=>({key:k,label:v,count:itReport?.byStatus.find(b=>b.status===k)?.count||0}))} total={itReport?.total||0}/></section>
 <section className="panel team-report">
 <div className="section-heading"><div><div className="eyebrow">БАТЛАХ ХҮЛЭЭГДЭЖ БУЙ</div><h2>Маркетингийн төсөв баталгаажуулалт</h2><p className="muted">Одоог хүртэл баталгаажаагүй {pendingCount.toLocaleString()} ажил, нийт {pendingBudget.toLocaleString()}₮ төсөв хүлээгдэж байна.</p></div></div>
 {pending.length?<div className="table-scroll"><Table><TableHeader><TableRow><TableHead>ГАРЧИГ</TableHead><TableHead>СУВАГ</TableHead><TableHead>ХАРИУЦАГЧ</TableHead><TableHead>ТӨСӨВ</TableHead><TableHead>ДУУСАХ ХУГАЦАА</TableHead><TableHead/></TableRow></TableHeader><TableBody>{pending.map(t=><TableRow key={t.id}><TableCell><strong>{t.title}</strong></TableCell><TableCell>{t.channel}</TableCell><TableCell><span className="owner-label">{ownerName(t.owner)}</span></TableCell><TableCell>{t.budget.toLocaleString()}₮</TableCell><TableCell>{t.due_at?dateLabel(t.due_at):'Товгүй'}</TableCell><TableCell><Button size="sm" className="primary" disabled={busyId===t.id} onClick={()=>{setApproveTarget(t);setApproveNote('');}}>{busyId===t.id?<Loader2 className="spin" size={14}/>:<BadgeCheck size={14}/>}Батлах</Button></TableCell></TableRow>)}</TableBody></Table></div>:<p className="muted">Батлах хүлээгдэж буй төсөв алга.</p>}
 </section>
 </div>
 <Dialog open={!!approveTarget} onOpenChange={o=>{if(!o){setApproveTarget(null);setApproveNote('');}}}><DialogContent><DialogHeader><DialogTitle>Төсөв батлах</DialogTitle><DialogDescription>{approveTarget?.title} · {approveTarget?.budget.toLocaleString()}₮</DialogDescription></DialogHeader><form className="form-stack" onSubmit={e=>{e.preventDefault();approve();}}><label className="field"><span>Батлах шалтгаан *</span><textarea required maxLength={2000} rows={3} value={approveNote} onChange={e=>setApproveNote(e.target.value)} placeholder="Батлах шалтгаан, тохиролцоог тэмдэглэнэ үү…"/></label><Button type="submit" className="primary full" disabled={!approveTarget||busyId===approveTarget.id||!approveNote.trim()}>{approveTarget&&busyId===approveTarget.id?<Loader2 className="spin" size={16}/>:<BadgeCheck size={16}/>}Батлах</Button></form></DialogContent></Dialog>
 </>;
}
