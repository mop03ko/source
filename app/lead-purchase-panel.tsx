'use client';
import {useRef,useState} from 'react';
import {Button} from '@/components/ui/button';
import {AsyncStatus} from '@/components/async-status';
import {useDraftGuard} from '@/components/draft-guard';
import {useRemote} from '@/hooks/use-remote';
import {dateLabel,type Lead} from '@/lib/crm';
import {MovementForm,cash,type Options} from './inventory-forms';
import {toast} from '@/components/ui/sonner';

type Purchase={id:string;item_name:string;item_code:string;imei:string|null;warehouse_name:string;qty:number;total_price:number;sold_at:string;bill_number:string};
export default function LeadPurchasePanel({lead,onConfirmed}:{lead:Lead;onConfirmed:()=>Promise<void>}){
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false);
 const pending=useRef<{payload:string;id:string}|null>(null),inFlight=useRef(false),allow=useDraftGuard();
 const detail=useRemote<{purchase:Purchase|null}>('/api/lead-purchases?'+new URLSearchParams({id:lead.id,version:String(lead.version)}));
 const options=useRemote<Options>(open?'/api/inventory?view=options':null);
 const purchase=detail.data?.purchase;
 return <section className="form-stack" aria-label="Хүсэлтийн худалдан авалт">
  <h3>Худалдан авалт</h3>
  <AsyncStatus error={detail.error} loading={detail.loading} retry={detail.retry}/>
  {purchase?<div className="next-box"><div><strong>Баталгаажсан · {purchase.item_name}</strong><p>{purchase.item_code}{purchase.imei?' · '+purchase.imei:''}</p><p>{purchase.warehouse_name} · {purchase.qty} ш · {cash(purchase.total_price)}</p><p>{dateLabel(purchase.sold_at)}{purchase.bill_number?' · Билл '+purchase.bill_number:''}</p></div></div>:detail.data&&<>
   {!open?<><p className="form-help">Худалдан авсан барааг агуулахын бүртгэлээс сонгож баталгаажуулна.</p><Button type="button" variant="outline" onClick={()=>setOpen(true)}>Бараа сонгож баталгаажуулах</Button></>:<>
    <p className="inventory-note">Баталгаажуулбал сонгосон агуулахаас тоо ширхэг хасагдаж, борлуулалт бүртгэгдэнэ. Хүсэлт “Худалдан авсан” төлөвт шилжинэ.</p>
    {lead.status==='won'&&<p className="inventory-note">Энэ хүсэлт өмнө нь “Худалдан авсан” төлөвтэй болсон ч агуулахын борлуулалттай холбогдоогүй байна. Энд баталгаажуулахад шинэ зарлага үүснэ. Өмнө нь агуулахаас зарлага бүртгэсэн бол давхар баталгаажуулахгүй.</p>}
    <AsyncStatus error={options.error} loading={options.loading} retry={options.retry}/>
    {options.data&&<MovementForm kind="sale" options={options.data} warehouse="" busy={busy} customer={{name:lead.name,phone:lead.phone}} submitLabel="Худалдан авалтыг баталгаажуулах" onSave={async values=>{
     if(inFlight.current)throw new Error('Өмнөх хүсэлт дуусахыг хүлээнэ үү.');
     const data={...(values as Record<string,unknown>),lead_id:lead.id,version:lead.version};
     const payload=JSON.stringify(data);
     if(pending.current?.payload!==payload)pending.current={payload,id:crypto.randomUUID()};
     inFlight.current=true;setBusy(true);
     try{
      const response=await fetch('/api/lead-purchases',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...data,request_id:pending.current.id})});
      const result=await response.json();if(!response.ok)throw new Error(result.error||'Баталгаажуулж чадсангүй.');
      pending.current=null;setOpen(false);detail.retry();toast.success('Худалдан авалт баталгаажиж, агуулахын үлдэгдэл хасагдлаа.');await onConfirmed();
     }finally{inFlight.current=false;setBusy(false);}
    }}/>}
    <Button type="button" variant="ghost" disabled={busy} onClick={()=>{if(allow())setOpen(false);}}>Болих</Button>
   </>}
  </>}
 </section>;
}
