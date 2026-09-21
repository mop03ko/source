'use client';
import {useState} from 'react';
import {Truck,Search,Plus,List,ChartNoAxesCombined,CheckCircle2,Clock,CircleX,ArrowUpRight,Loader2,Package,Link2} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {Sheet,SheetContent,SheetHeader,SheetTitle,SheetDescription} from '@/components/ui/sheet';
import {Table,TableHeader,TableHead,TableBody,TableRow,TableCell} from '@/components/ui/table';
import {Field} from '@/components/form-field';
import {GuardedForm,markFormSaved,markFormError} from '@/components/draft-guard';
import {AsyncStatus} from '@/components/async-status';
import {useRemote} from '@/hooks/use-remote';
import {ItemPicker,type Item} from './inventory-forms';
import {toast} from 'sonner';
import {deliveryStatuses,deliveryDone,deliveryKinds,isCourierOnly,requestDateLabel,type Member,type Delivery} from '@/lib/crm';
type Stats={total:number;done:number;pending:number;failed:number;linked:number};
type CourierRow={name:string;total:number;done:number;failed:number;cancelled:number;pending:number;last_day:string;active_days:number};
type Report={total:number;byCourier:CourierRow[];byMonth:{month:string;total:number;done:number}[];byChannel:{channel:string;total:number}[];byKind:{kind:string;total:number}[];byStatus:{status:string;total:number}[];byItem:{name:string;code:string;total:number}[]};
type Linked=Delivery&{item_code:string|null;item_name:string|null;item_brand:string|null};
type List={items:Linked[];count:number;stats:Stats;couriers:{name:string;total:number}[];channels:{name:string}[]};
const todayUB=()=>new Date(Date.now()+8*3600000).toISOString().slice(0,10);
const pct=(n:number,of:number)=>of?Math.round(n/of*100):0;
const statusClass=(s:string)=>deliveryDone.includes(s)?'stage-won':s==='pending'?'stage-pending':'stage-lost';
// Хүргэгчийн сонголт: и-мэйлтэй гишүүн бол value=и-мэйл, Excel-ээс импортолсон и-мэйлгүй хуучин нэр бол
// value='name:<нэр>' — ингэснээр хуучин мөрийг засахад нэр нь хадгалагдана.
const courierValue=(d?:Delivery)=>!d?'':d.courier_email||'name:'+d.courier_name;
function DeliveryForm({row,members,legacy,busy,onSubmit}:{row?:Linked;members:Member[];legacy:string[];busy:boolean;onSubmit:(d:unknown)=>unknown}){
 // Хүргэж буй барааг агуулахын бүртгэлтэй холбоно. Гэрээ, баримт хүргэх мөрүүд бий тул сонголттой.
 const [item,setItem]=useState<Item|null>(row?.item_id?{id:row.item_id,code:row.item_code||'',name:row.item_name||'',brand:row.item_brand||''} as Item:null);
 return <GuardedForm className="form-stack" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);const c=String(f.get('courier')||'');
  onSubmit({delivered_on:f.get('delivered_on'),kind:f.get('kind'),item_id:item?.id||null,item_info:f.get('item_info'),customer_phone:f.get('customer_phone'),address:f.get('address'),payment_channel:f.get('payment_channel'),contents:f.get('contents'),courier_email:c.startsWith('name:')?null:c,courier_name:c.startsWith('name:')?c.slice(5):'',status:f.get('status'),note:f.get('note')});}}>
 <div className="form-grid"><Field label="Огноо (УБ) *"><Input name="delivered_on" type="date" required defaultValue={row?.delivered_on||todayUB()}/></Field><Field label="Төрөл"><select name="kind" defaultValue={row?.kind||'24 цаг'}>{[...new Set([...deliveryKinds,...(row?.kind?[row.kind]:[])])].map(k=><option key={k}>{k}</option>)}</select></Field></div>
 <ItemPicker value={item} onChange={setItem} warehouse="" label="Агуулахын бараа (сонголттой)"/>
 <Field label="Барааны нэмэлт тайлбар"><Input name="item_info" maxLength={400} defaultValue={row?.item_info} placeholder="Агуулахын бүртгэлд байхгүй бол гараар бичнэ"/></Field>
 <div className="form-grid"><Field label="Харилцагчийн утас"><Input name="customer_phone" maxLength={120} defaultValue={row?.customer_phone} placeholder="99112233"/></Field><Field label="Төлбөрийн суваг"><Input name="payment_channel" maxLength={60} defaultValue={row?.payment_channel} placeholder="Зөгий, Гэгээн, Storepay…"/></Field></div>
 <Field label="Хаягийн мэдээлэл"><textarea name="address" rows={2} maxLength={500} defaultValue={row?.address} placeholder="Дүүрэг, хороо, байр, орц, тоот…"/></Field>
 <div className="form-grid"><Field label="Хүргэлтийн ажилтан *"><select name="courier" required defaultValue={courierValue(row)}>{[<option key="" value="" disabled>Сонгох…</option>,...members.map(m=><option key={m.email} value={m.email}>{m.name}</option>),...legacy.map(n=><option key={'name:'+n} value={'name:'+n}>{n} (хуучин бүртгэл)</option>)]}</select></Field><Field label="Төлөв"><select name="status" defaultValue={row?.status||'pending'}>{Object.entries(deliveryStatuses).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></Field></div>
 <Field label="Хамт хүргэх зүйлс"><Input name="contents" maxLength={200} defaultValue={row?.contents} placeholder="Бараа, гэрээ, баталгааны хуудас"/></Field>
 <Field label="Нэмэлт тайлбар"><textarea name="note" rows={2} maxLength={2000} defaultValue={row?.note}/></Field>
 <Button type="submit" className="primary full" disabled={busy}>{busy?<Loader2 className="spin" size={16}/>:<Plus size={16}/>}Хадгалах</Button>
 </GuardedForm>;
}
export default function DeliveriesPanel({me,members}:{me:Member;members:Member[]}){
 const [mode,setMode]=useState<'list'|'report'>('list');
 const [q,setQ]=useState(''),[status,setStatus]=useState(''),[courier,setCourier]=useState(''),[channel,setChannel]=useState(''),[kind,setKind]=useState('');
 const [from,setFrom]=useState(''),[to,setTo]=useState(''),[page,setPage]=useState(1),[revision,setRevision]=useState(0);
 const [today]=useState(todayUB);
 const [rfrom,setRfrom]=useState(()=>today.slice(0,4)+'-01-01'),[rto,setRto]=useState(today);
 const [create,setCreate]=useState(false),[detailId,setDetailId]=useState(''),[busy,setBusy]=useState(false);
 const courierOnly=isCourierOnly(me.role);
 const listUrl='/api/deliveries?'+new URLSearchParams({q,status,courier,channel,kind,from,to,page:String(page),revision:String(revision)});
 const list=useRemote<List>(mode==='list'?listUrl:null);
 const report=useRemote<Report>(mode==='report'?'/api/deliveries?'+new URLSearchParams({report:'1',rfrom,rto,revision:String(revision)}):null);
 const detail=useRemote<{delivery:Linked}>(detailId?'/api/deliveries?id='+encodeURIComponent(detailId)+'&revision='+revision:null);
 const rows=list.data?.items||[],total=list.data?.count||0,stats=list.data?.stats,totalPages=Math.max(1,Math.ceil(total/50));
 const activeMembers=members.filter(m=>m.active);
 const legacy=(list.data?.couriers||[]).map(c=>c.name).filter(n=>!activeMembers.some(m=>m.name===n));
 const post=async(action:string,data:unknown,id?:string,version?:number)=>{
  setBusy(true);
  try{
   const r=await fetch('/api/deliveries',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,data,id,version})});
   const d=await r.json() as {error?:string;fieldErrors?:Record<string,string>};
   const form=document.activeElement?.closest('form')||null;
   if(!r.ok){markFormError(form,d.error||'Хүсэлт амжилтгүй.',d.fieldErrors);throw new Error(d.error||'Хүсэлт амжилтгүй.');}
   markFormSaved(form);setRevision(v=>v+1);toast.success('Амжилттай хадгаллаа.');return d;
  }catch(e){toast.error((e as Error).message);return null;}finally{setBusy(false);}
 };
 const setFilter=(fn:(v:string)=>void,v:string)=>{fn(v);setPage(1);};
 const d=detail.data?.delivery;
 const reportDone=report.data?.byStatus.filter(s=>deliveryDone.includes(s.status)).reduce((n,s)=>n+s.total,0)||0;
 const reportDays=report.data?.byCourier.reduce((n,c)=>Math.max(n,c.active_days),0)||0;
 const maxMonth=Math.max(1,...(report.data?.byMonth||[]).map(b=>b.total));
 return <section className="table-panel">
 <div className="table-toolbar"><h2>{courierOnly?'Миний хүргэлтүүд':'Хүргэлтийн журнал'}<span>{mode==='report'?report.data?.total||0:total}</span></h2><div className="row">{!courierOnly&&<Button className="primary" size="sm" onClick={()=>setCreate(true)}><Plus size={16}/>Шинэ хүргэлт</Button>}<div className="view-toggle"><Button variant={mode==='list'?'default':'outline'} className={mode==='list'?'primary':''} size="sm" onClick={()=>setMode('list')}><List size={14}/>Жагсаалт</Button><Button variant={mode==='report'?'default':'outline'} className={mode==='report'?'primary':''} size="sm" onClick={()=>setMode('report')}><ChartNoAxesCombined size={14}/>Дашбоард</Button></div></div></div>
 {mode==='list'?<>
 {stats&&<div className="metrics"><div className="metric"><div><span>Нийт хүргэлт</span><Truck size={19}/></div><strong>{stats.total.toLocaleString()}</strong><small>Шүүлтүүрт тохирсон</small></div><div className="metric"><div><span>Хүргэсэн</span><CheckCircle2 size={19}/></div><strong>{stats.done.toLocaleString()}</strong><small>{pct(stats.done,stats.total)}% гүйцэтгэл</small></div><div className="metric metric-focus"><div><span>Хүлээгдэж буй</span><Clock size={19}/></div><strong>{stats.pending.toLocaleString()}</strong><small>Хүргэгдэх шаардлагатай</small></div><div className={'metric'+(stats.failed?' metric-alert':'')}><div><span>Хүргэгдээгүй</span><CircleX size={19}/></div><strong>{stats.failed.toLocaleString()}</strong><small>Цуцалсан, бүтээгүй</small></div><div className="metric"><div><span>Бараатай холбогдсон</span><Link2 size={19}/></div><strong>{stats.linked.toLocaleString()}</strong><small>{pct(stats.linked,stats.total)}% агуулахын бүртгэлтэй</small></div></div>}
 <div className="filters"><div className="search"><Search size={17}/><Input aria-label="Хүргэлт хайх" placeholder="Утас, хаяг, бараагаар хайх…" value={q} onChange={e=>setFilter(setQ,e.target.value)}/></div>
 <select aria-label="Төлөвөөр шүүх" value={status} onChange={e=>setFilter(setStatus,e.target.value)}><option value="">Бүх төлөв</option>{Object.entries(deliveryStatuses).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select>
 {!courierOnly&&<select aria-label="Хүргэгчээр шүүх" value={courier} onChange={e=>setFilter(setCourier,e.target.value)}><option value="">Бүх хүргэгч</option>{(list.data?.couriers||[]).map(c=><option key={c.name} value={c.name}>{c.name} ({c.total})</option>)}</select>}
 <select aria-label="Сувгаар шүүх" value={channel} onChange={e=>setFilter(setChannel,e.target.value)}><option value="">Бүх суваг</option>{(list.data?.channels||[]).map(c=><option key={c.name} value={c.name}>{c.name}</option>)}</select>
 <select aria-label="Төрлөөр шүүх" value={kind} onChange={e=>setFilter(setKind,e.target.value)}><option value="">Бүх төрөл</option>{deliveryKinds.map(k=><option key={k} value={k}>{k}</option>)}</select>
 <Input aria-label="Огноо: эхлэх" type="date" value={from} max={to||undefined} onChange={e=>setFilter(setFrom,e.target.value)}/><span className="muted">—</span><Input aria-label="Огноо: дуусах" type="date" value={to} min={from||undefined} onChange={e=>setFilter(setTo,e.target.value)}/>
 {(q||status||courier||channel||kind||from||to)&&<Button variant="ghost" size="sm" onClick={()=>{setQ('');setStatus('');setCourier('');setChannel('');setKind('');setFrom('');setTo('');setPage(1);}}>Шүүлтүүр цэвэрлэх</Button>}</div>
 <AsyncStatus error={list.error} loading={list.loading} retry={list.retry}/>
 {!list.error&&(rows.length?<div className="table-scroll"><Table><TableHeader><TableRow><TableHead>ОГНОО</TableHead><TableHead>ТӨРӨЛ</TableHead><TableHead>БАРАА</TableHead><TableHead>УТАС</TableHead><TableHead>ХАЯГ</TableHead><TableHead>СУВАГ</TableHead><TableHead>ХҮРГЭГЧ</TableHead><TableHead>ТӨЛӨВ</TableHead><TableHead/></TableRow></TableHeader><TableBody>{rows.map(r=><TableRow key={r.id} className="lead-row"><TableCell><button className="lead-link" onClick={()=>setDetailId(r.id)}><span className="lead-avatar"><Truck size={16}/></span><strong>{r.delivered_on}</strong></button></TableCell><TableCell>{r.kind||'—'}</TableCell><TableCell>{r.item_name?<span className="owner-label" title={r.item_code||''}><Link2 size={12}/> {r.item_name}</span>:r.item_info||'—'}</TableCell><TableCell>{r.customer_phone||'—'}</TableCell><TableCell><span title={r.address}>{r.address.slice(0,40)||'—'}{r.address.length>40?'…':''}</span></TableCell><TableCell>{r.payment_channel||'—'}</TableCell><TableCell><span className="owner-label">{r.courier_name}</span></TableCell><TableCell><span className={'stage '+statusClass(r.status)}>{deliveryStatuses[r.status]||r.status}</span></TableCell><TableCell><Button variant="ghost" size="icon" aria-label="Хүргэлт нээх" onClick={()=>setDetailId(r.id)}><ArrowUpRight size={18}/></Button></TableCell></TableRow>)}</TableBody></Table></div>:!list.loading&&<p className="muted chat-empty-list">Тохирох хүргэлт олдсонгүй.</p>)}
 {totalPages>1&&<div className="table-footer"><span>{total.toLocaleString()} хүргэлт</span><div className="row"><Button size="sm" variant="outline" disabled={page<=1||list.loading} onClick={()=>setPage(p=>p-1)}>Өмнөх</Button><span className="muted">{page} / {totalPages}</span><Button size="sm" variant="outline" disabled={page>=totalPages||list.loading} onClick={()=>setPage(p=>p+1)}>Дараах</Button></div></div>}
 </>:<>
 <div className="report-range panel"><Field label="Хугацааны эхлэл"><Input type="date" value={rfrom} max={rto||undefined} onChange={e=>setRfrom(e.target.value)}/></Field><Field label="Хугацааны төгсгөл"><Input type="date" value={rto} min={rfrom||undefined} onChange={e=>setRto(e.target.value)}/></Field><Button variant="ghost" size="sm" onClick={()=>{setRfrom('');setRto('');}}>Бүх хугацаа</Button><p className="muted text-sm">{rfrom||rto?`${rfrom||'…'} — ${rto||'өнөөдөр'} хооронд хүргэсэн ${(report.data?.total||0).toLocaleString()} хүргэлтэд үндэслэв.`:'Бүх хугацааны хүргэлт харагдаж байна.'}</p></div>
 <AsyncStatus error={report.error} loading={report.loading} retry={report.retry}/>
 {report.data&&!report.error&&<>
 <div className="metrics"><div className="metric"><div><span>Нийт хүргэлт</span><Truck size={19}/></div><strong>{report.data.total.toLocaleString()}</strong><small>Сонгосон хугацаанд</small></div><div className="metric"><div><span>Хүргэсэн</span><CheckCircle2 size={19}/></div><strong>{reportDone.toLocaleString()}</strong><small>{pct(reportDone,report.data.total)}% гүйцэтгэл</small></div><div className="metric metric-focus"><div><span>Хүргэгч</span><Package size={19}/></div><strong>{report.data.byCourier.length}</strong><small>Ажилласан ажилтан</small></div><div className="metric"><div><span>Өдрийн дундаж</span><ChartNoAxesCombined size={19}/></div><strong>{reportDays?(report.data.total/reportDays).toFixed(1):'0.0'}</strong><small>Хамгийн ачаалалтай {reportDays} өдөрт</small></div></div>
 <div className="reports-grid">
 <section className="panel team-report" style={{gridColumn:'1 / -1'}}><div className="eyebrow">ХҮРГЭЛТИЙН АЖИЛТНУУД</div><h2>Ажилтан тус бүрийн гүйцэтгэл</h2><p className="muted">Сонгосон хугацаанд хариуцсан хүргэлт, гүйцэтгэлийн хувь, ажилласан өдрийн тоо, өдрийн дундаж ачаалал.</p><div className="table-scroll"><Table><TableHeader><TableRow><TableHead>ХҮРГЭГЧ</TableHead><TableHead>НИЙТ</TableHead><TableHead>ХҮРГЭСЭН</TableHead><TableHead>ХҮРГЭГДЭЭГҮЙ</TableHead><TableHead>ЦУЦАЛСАН</TableHead><TableHead>ХҮЛЭЭГДЭЖ БУЙ</TableHead><TableHead>АЖИЛЛАСАН ӨДӨР</TableHead><TableHead>ӨДРИЙН ДУНДАЖ</TableHead><TableHead>ГҮЙЦЭТГЭЛ</TableHead><TableHead>СҮҮЛД</TableHead></TableRow></TableHeader><TableBody>{report.data.byCourier.map(c=><TableRow key={c.name}><TableCell><strong>{c.name}</strong></TableCell><TableCell>{c.total.toLocaleString()}</TableCell><TableCell>{c.done.toLocaleString()}</TableCell><TableCell>{c.failed?<span className="due-text">{c.failed}</span>:'0'}</TableCell><TableCell>{c.cancelled||'0'}</TableCell><TableCell>{c.pending||'0'}</TableCell><TableCell>{c.active_days}</TableCell><TableCell>{c.active_days?(c.total/c.active_days).toFixed(1):'0.0'}</TableCell><TableCell><div className="bar-track" style={{minWidth:70}}><span style={{width:pct(c.done,c.total)+'%'}}/></div><small>{pct(c.done,c.total)}%</small></TableCell><TableCell>{c.last_day}</TableCell></TableRow>)}{!report.data.byCourier.length&&<TableRow><TableCell colSpan={10} className="muted">Сонгосон хугацаанд хүргэлт алга.</TableCell></TableRow>}</TableBody></Table></div></section>
 <section className="panel team-report"><div className="eyebrow">САРААР</div><h2>Хүргэлтийн ачаалал</h2><p className="muted">Сар тус бүрийн хүргэлтийн тоо, хүргэж дууссан хэмжээ.</p><div className="bars">{report.data.byMonth.map(b=><div className="bar-row" key={b.month}><div><span>{b.month}</span><strong>{b.total} <small>({b.done} хүргэсэн)</small></strong></div><div className="bar-track"><span style={{width:Math.round(b.total/maxMonth*100)+'%'}}/></div></div>)}{!report.data.byMonth.length&&<p className="muted">Мэдээлэл алга.</p>}</div></section>
 <section className="panel team-report"><div className="eyebrow">ТӨЛБӨРИЙН СУВАГ</div><h2>Сувгаар хуваарилалт</h2><p className="muted">Хүргэлтэд хамгийн их ашиглагдсан төлбөрийн сувгууд.</p><div className="bars">{report.data.byChannel.map(c=><div className="bar-row" key={c.channel}><div><span>{c.channel}</span><strong>{c.total} <small>({pct(c.total,report.data!.total)}%)</small></strong></div><div className="bar-track"><span style={{width:pct(c.total,report.data!.total)+'%'}}/></div></div>)}</div></section>
 <section className="panel team-report"><div className="eyebrow">БАРАА</div><h2>Хамгийн их хүргэгдсэн бараа</h2><p className="muted">Агуулахын бүртгэлтэй холбосон хүргэлтүүдээр.</p><div className="bars">{report.data.byItem.map(i=><div className="bar-row" key={i.code+i.name}><div><span>{i.name}<small> {i.code}</small></span><strong>{i.total}</strong></div><div className="bar-track"><span style={{width:pct(i.total,report.data!.byItem[0].total)+'%'}}/></div></div>)}{!report.data.byItem.length&&<p className="muted">Агуулахын бараатай холбосон хүргэлт хараахан алга.</p>}</div></section>
 <section className="panel team-report"><div className="eyebrow">ТӨРӨЛ</div><h2>Хүргэлтийн төрөл</h2><p className="muted">Яаралтай, 24 цаг, гэрээ гэх мэт төрлөөр.</p><div className="bars">{report.data.byKind.map(k=><div className="bar-row" key={k.kind}><div><span>{k.kind}</span><strong>{k.total} <small>({pct(k.total,report.data!.total)}%)</small></strong></div><div className="bar-track"><span style={{width:pct(k.total,report.data!.total)+'%'}}/></div></div>)}</div></section>
 </div></>}
 </>}
 <Dialog open={create} onOpenChange={setCreate}><DialogContent className="form-dialog"><DialogHeader><DialogTitle>Шинэ хүргэлт</DialogTitle><DialogDescription>Харилцагчийн хаяг, төлбөрийн суваг, хүргэх ажилтныг бүртгэнэ.</DialogDescription></DialogHeader><DeliveryForm members={activeMembers} legacy={legacy} busy={busy} onSubmit={async v=>{if(await post('create',v))setCreate(false);}}/></DialogContent></Dialog>
 <Sheet open={!!detailId} onOpenChange={o=>{if(!o)setDetailId('');}}><SheetContent className="detail-sheet"><SheetHeader><SheetTitle>{d?d.delivered_on+' · '+d.courier_name:'Хүргэлтийн дэлгэрэнгүй'}</SheetTitle><SheetDescription>{d?`${deliveryStatuses[d.status]||d.status} · ${d.kind||'төрөл тодорхойгүй'}`:'Мэдээлэл ачаалж байна'}</SheetDescription></SheetHeader>
 <AsyncStatus error={detail.error} loading={detail.loading} retry={detail.retry}/>
 {d&&!detail.error&&<div className="detail-body">
 <div className="next-box"><Truck size={18}/><div><strong>{d.item_name||d.item_info||'Барааны мэдээлэл бүртгээгүй'}</strong>{d.item_name&&<p className="muted"><Link2 size={12}/> Агуулахын бараа: {d.item_code} {d.item_brand?'· '+d.item_brand:''}</p>}<p>{d.customer_phone||'утасгүй'} · {d.address||'хаяггүй'}</p><p className="muted">Бүртгэсэн: {d.entered_by_name||d.created_by} · {requestDateLabel(d.created_at)}</p></div></div>
 <div className="row">{Object.entries(deliveryStatuses).filter(([k])=>k!==d.status).map(([k,v])=><Button key={k} size="sm" variant="outline" disabled={busy} onClick={()=>post('set_status',{status:k},d.id,d.version)}>{v}</Button>)}</div>
 {!courierOnly&&<><div className="section-heading"><div><h2>Мэдээлэл засах</h2><p className="muted">Огноо, хаяг, суваг, хүргэгчийг шинэчилнэ.</p></div></div>
 <DeliveryForm key={d.version} row={d} members={activeMembers} legacy={legacy} busy={busy} onSubmit={v=>post('update',v,d.id,d.version)}/></>}
 </div>}
 </SheetContent></Sheet>
 </section>;
}
