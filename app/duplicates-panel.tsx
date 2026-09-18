'use client';
import {useCallback,useEffect,useState} from 'react';
import {Copy,Loader2,ArrowUpRight} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {stages,requestDateLabel,type Member} from '@/lib/crm';
type DupLead={id:string;name:string;phone:string;owner:string;status:string;created_at:string;source:string};
type Group={phone:string;count:number;leads:DupLead[]};
export default function DuplicatesPanel({members,onOpen}:{members:Member[];onOpen:(id:string)=>void}){
 const [groups,setGroups]=useState<Group[]>([]),[total,setTotal]=useState(0),[page,setPage]=useState(1),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const load=useCallback(async(p:number)=>{setLoading(true);setError('');try{const r=await fetch('/api/crm?view=duplicates&page='+p,{cache:'no-store'});const d=await r.json() as {groups?:Group[];total?:number;error?:string};if(!r.ok)throw new Error(d.error||'Ачаалж чадсангүй.');setGroups(d.groups||[]);setTotal(d.total||0);}catch(e){setError((e as Error).message);}finally{setLoading(false);}},[]);
 useEffect(()=>{const timer=setTimeout(()=>void load(page),0);return()=>clearTimeout(timer);},[page,load]);
 const ownerName=(email:string)=>email==='__sheet_unassigned__'?'Хуваарилалт хүлээж буй':members.find(m=>m.email===email)?.name||email;
 const totalPages=Math.max(1,Math.ceil(total/20));
 return <section className="panel">
 <div className="section-heading"><div><div className="eyebrow">ӨГӨГДЛИЙН ЧАНАР</div><h2>Ижил утасны дугаартай хүсэлтүүд</h2><p className="muted">Ихэвчлэн Google Sheet-ээс ижил харилцагч өөр огноогоор дахин орж ирснээс үүсдэг. Автоматаар нэгтгэхгүй; шаардлагатай бол гараар шалгаж, илүүц хүсэлтийг хаана уу.</p></div><span className="stage stage-pending">{total.toLocaleString()} бүлэг</span></div>
 {error&&<div role="alert" className="error-box">{error}</div>}
 {loading&&!groups.length?<div className="loading"><Loader2 className="spin"/>Ачаалж байна…</div>:!groups.length?<p className="muted">Давхардсан утасны дугаар олдсонгүй.</p>:<div className="dup-groups">{groups.map(g=><div key={g.phone} className="dup-group"><div className="dup-group-head"><Copy size={15}/><strong>{g.phone}</strong><span>{g.count} хүсэлт</span></div>{g.leads.map(l=><button key={l.id} className="dup-lead" onClick={()=>onOpen(l.id)}><span><strong>{l.name}</strong><small>{requestDateLabel(l.created_at)} · {ownerName(l.owner)}</small></span><span className={'stage stage-'+l.status}>{stages[l.status]||l.status}</span><ArrowUpRight size={16}/></button>)}</div>)}</div>}
 {totalPages>1&&<div className="table-footer"><span>{page} / {totalPages} хуудас</span><div className="row"><Button size="sm" variant="outline" disabled={page<=1||loading} onClick={()=>setPage(p=>p-1)}>Өмнөх</Button><Button size="sm" variant="outline" disabled={page>=totalPages||loading} onClick={()=>setPage(p=>p+1)}>Дараах</Button></div></div>}
 </section>;
}
