'use client';
import {useCallback,useEffect,useState} from 'react';
import {BadgeCheck,Loader2} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Table,TableHeader,TableHead,TableBody,TableRow,TableCell} from '@/components/ui/table';
import {toast} from 'sonner';
import {dateLabel,type Member} from '@/lib/crm';
type ModuleStats={total:number;active:number;overdue:number;done:number};
type SalesStats={total:number;won:number;due:number;recycled:number;recycle_overdue:number;unassigned:number};
type Pending={id:string;title:string;channel:string;owner:string;status:string;due_at:string|null;budget:number;version:number};
async function approveTask(body:unknown){const r=await fetch('/api/marketing',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json() as {error?:string};if(!r.ok)throw new Error(d.error||'Хүсэлт амжилтгүй.');return d;}
export default function DashboardPanel({members,salesStats}:{members:Member[];salesStats:SalesStats}){
 const [marketing,setMarketing]=useState<ModuleStats|null>(null),[it,setIt]=useState<ModuleStats|null>(null);
 const [pending,setPending]=useState<Pending[]>([]),[pendingCount,setPendingCount]=useState(0),[pendingBudget,setPendingBudget]=useState(0);
 const [loading,setLoading]=useState(true),[error,setError]=useState(''),[busyId,setBusyId]=useState('');
 const ownerName=(email:string)=>members.find(m=>m.email===email)?.name||email;
 const load=useCallback(async()=>{setLoading(true);try{
  const [mRes,iRes,pRes]=await Promise.all([
   fetch('/api/marketing',{cache:'no-store'}),
   fetch('/api/it',{cache:'no-store'}),
   fetch('/api/marketing?pending_approvals=1',{cache:'no-store'}),
  ]);
  const [mData,iData,pData]=await Promise.all([mRes.json(),iRes.json(),pRes.json()]) as [{stats?:ModuleStats;error?:string},{stats?:ModuleStats;error?:string},{items?:Pending[];count?:number;budget?:number;error?:string}];
  if(!mRes.ok)throw new Error(mData.error||'Уншиж чадсангүй.');
  if(!iRes.ok)throw new Error(iData.error||'Уншиж чадсангүй.');
  if(!pRes.ok)throw new Error(pData.error||'Уншиж чадсангүй.');
  setMarketing(mData.stats||null);setIt(iData.stats||null);
  setPending(pData.items||[]);setPendingCount(pData.count||0);setPendingBudget(pData.budget||0);
  setError('');
 }catch(e){setError((e as Error).message);}finally{setLoading(false);}},[]);
 useEffect(()=>{load();},[load]);
 const approve=async(t:Pending)=>{setBusyId(t.id);try{await approveTask({action:'approve',id:t.id,version:t.version});toast.success('Төсөв баталгаажлаа.');await load();}catch(e){toast.error((e as Error).message);}finally{setBusyId('');}};
 if(loading&&!marketing&&!it)return <div className="loading"><Loader2 className="spin"/>Ачаалж байна…</div>;
 return <>
 {error&&<div role="alert" className="error-box">{error}</div>}
 <div className="reports-grid">
 <div className="budget-cards team-report">
 <section className="panel"><div className="eyebrow">БОРЛУУЛАЛТ</div><h2>Хүсэлтийн үзүүлэлт</h2><div className="sync-summary"><div><span>Нийт хүсэлт</span><strong>{salesStats.total.toLocaleString()}</strong></div><div><span>Холбогдох хүсэлт</span><strong>{salesStats.due.toLocaleString()}</strong></div><div><span>Идэвхтэй Recycle</span><strong>{salesStats.recycled.toLocaleString()}</strong></div><div><span>Хугацаа хэтэрсэн Recycle</span><strong>{salesStats.recycle_overdue.toLocaleString()}</strong></div><div><span>Хуваарилагдаагүй</span><strong>{salesStats.unassigned.toLocaleString()}</strong></div><div><span>Худалдан авсан</span><strong>{salesStats.won.toLocaleString()}</strong></div></div></section>
 <section className="panel"><div className="eyebrow">МАРКЕТИНГ</div><h2>Ажлын үзүүлэлт</h2><div className="sync-summary"><div><span>Нийт ажил</span><strong>{marketing?.total??0}</strong></div><div><span>Идэвхтэй</span><strong>{marketing?.active??0}</strong></div><div><span>Хугацаа хэтэрсэн</span><strong>{marketing?.overdue??0}</strong></div></div></section>
 <section className="panel"><div className="eyebrow">IT</div><h2>Ажлын үзүүлэлт</h2><div className="sync-summary"><div><span>Нийт ажил</span><strong>{it?.total??0}</strong></div><div><span>Идэвхтэй</span><strong>{it?.active??0}</strong></div><div><span>Хугацаа хэтэрсэн</span><strong>{it?.overdue??0}</strong></div></div></section>
 </div>
 <section className="panel team-report">
 <div className="section-heading"><div><div className="eyebrow">БАТЛАХ ХҮЛЭЭГДЭЖ БУЙ</div><h2>Маркетингийн төсөв баталгаажуулалт</h2><p className="muted">Одоог хүртэл баталгаажаагүй {pendingCount.toLocaleString()} ажил, нийт {pendingBudget.toLocaleString()}₮ төсөв хүлээгдэж байна.</p></div></div>
 {pending.length?<div className="table-scroll"><Table><TableHeader><TableRow><TableHead>ГАРЧИГ</TableHead><TableHead>СУВАГ</TableHead><TableHead>ХАРИУЦАГЧ</TableHead><TableHead>ТӨСӨВ</TableHead><TableHead>ДУУСАХ ХУГАЦАА</TableHead><TableHead/></TableRow></TableHeader><TableBody>{pending.map(t=><TableRow key={t.id}><TableCell><strong>{t.title}</strong></TableCell><TableCell>{t.channel}</TableCell><TableCell><span className="owner-label">{ownerName(t.owner)}</span></TableCell><TableCell>{t.budget.toLocaleString()}₮</TableCell><TableCell>{t.due_at?dateLabel(t.due_at):'Товгүй'}</TableCell><TableCell><Button size="sm" className="primary" disabled={busyId===t.id} onClick={()=>approve(t)}>{busyId===t.id?<Loader2 className="spin" size={14}/>:<BadgeCheck size={14}/>}Батлах</Button></TableCell></TableRow>)}</TableBody></Table></div>:<p className="muted">Батлах хүлээгдэж буй төсөв алга.</p>}
 </section>
 </div>
 </>;
}
