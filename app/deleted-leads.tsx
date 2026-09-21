'use client';
import {TextareaControl} from '@/components/ui/form-controls';
import {useState} from 'react';
import {useRemote} from '@/hooks/use-remote';
import {AsyncStatus} from '@/components/async-status';
import {GuardedForm,markFormSaved} from '@/components/draft-guard';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {dateLabel,type Lead} from '@/lib/crm';

export default function DeletedLeads({onRestored}:{onRestored:()=>void}){
 const [q,setQ]=useState(''),[page,setPage]=useState(1),[target,setTarget]=useState<Lead|null>(null),[busy,setBusy]=useState(false);
 const {data,loading,error,retry}=useRemote<{items:Lead[];total:number}>('/api/crm?'+new URLSearchParams({deleted:'1',q,page:String(page)}));
 return <div className="form-stack"><Input aria-label="Устгасан хүсэлт хайх" placeholder="Нэр, утсаар хайх" value={q} onChange={e=>{setQ(e.target.value);setPage(1);}}/><AsyncStatus error={error} loading={loading} retry={retry}/>{data&&<><p>{data.total} устгасан хүсэлт</p><div className="day-agenda">{data.items.map(l=><article key={l.id} className="next-box"><div><strong>{l.name} · {l.phone}</strong><p>{l.product}</p><time>Устгасан: {dateLabel(l.deleted_at||null)}</time><Button variant="outline" onClick={()=>setTarget(l)}>Сэргээх</Button></div></article>)}{!data.total&&<p>Устгасан хүсэлт алга.</p>}</div><div className="row"><Button disabled={page===1||loading} onClick={()=>setPage(p=>p-1)}>Өмнөх</Button><span>{page} / {Math.max(1,Math.ceil(data.total/50))}</span><Button disabled={page*50>=data.total||loading} onClick={()=>setPage(p=>p+1)}>Дараах</Button></div></>}
 <Dialog open={!!target} onOpenChange={o=>{if(!o&&!busy)setTarget(null);}}><DialogContent><DialogHeader><DialogTitle>Хүсэлт сэргээх</DialogTitle><DialogDescription>{target?.name} · “Мэдээлэл шалгах” төлөвт сэргээнэ. Өмнөх түүх болон холбоо барихгүй хориг хэвээр байна. Тов, хариуцагчийг шалгаад үргэлжлүүлнэ үү.</DialogDescription></DialogHeader><GuardedForm className="form-stack" onSubmit={async e=>{const form=e.currentTarget;if(!target)return;setBusy(true);try{const r=await fetch('/api/crm',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'restore',id:target.id,version:target.version,data:{note:new FormData(form).get('note')}})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Сэргээж чадсангүй.');markFormSaved(form);setTarget(null);retry();onRestored();}finally{setBusy(false);}}}><label className="field"><span>Сэргээх шалтгаан *</span><TextareaControl name="note" required maxLength={500}/></label><Button className="primary" disabled={busy}>{busy?'Сэргээж байна…':'Сэргээх'}</Button></GuardedForm></DialogContent></Dialog>
 </div>;
}
