import {NextResponse} from 'next/server';
import {z} from 'zod';
export const dynamic='force-dynamic';
const schema=z.object({request_id:z.string().uuid(),ant_loan_request_form:z.string().trim().min(2).max(160),contact_phone:z.string().regex(/^\d{8}$/),cust_register_no:z.string().trim().toUpperCase().regex(/^[\p{Script=Cyrillic}]{2}\d{8}$/u),req_products:z.string().trim().min(2).max(500)}).strict();
const attempts=new Map<string,{count:number;until:number}>();
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});
export async function POST(request:Request){
 const origin=request.headers.get('origin');
 if(!origin||!['https://www.antmall.mn','https://antmall.mn'].includes(origin))return reply({message:'Хүсэлт зөвшөөрөгдөхгүй.'},403);
 const key=process.env.CRM_WEB_LOAN_TOKEN,url=process.env.CRM_WEB_LOAN_URL;
 if(!key||!url)return reply({message:'Хүсэлт хүлээн авах үйлчилгээ түр боломжгүй байна.'},503);
 if(Number(request.headers.get('content-length')||0)>16000)return reply({message:'Мэдээлэл хэт том байна.'},413);
 const now=Date.now();for(const [ip,entry] of attempts)if(entry.until<now)attempts.delete(ip);
 const ip=request.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim()||'unknown';
 const bucket=attempts.get(ip)||{count:0,until:now+600000};
 if(bucket.count>=20||attempts.size>10000)return reply({message:'Хэт олон хүсэлт илгээгдлээ. Түр хүлээгээд дахин оролдоно уу.'},429);
 bucket.count++;attempts.set(ip,bucket);
 let body:z.infer<typeof schema>;
 try{const raw=await request.text();if(raw.length>16000)return reply({message:'Мэдээлэл хэт том байна.'},413);body=schema.parse(JSON.parse(raw));}
 catch{return reply({message:'Мэдээллээ шалгана уу. Хуудас удаан нээлттэй байсан бол шинэчилж дахин оролдоно уу.'},400);}
 const payload={request_id:body.request_id,name:body.ant_loan_request_form,phone:body.contact_phone,registration:body.cust_register_no,product:body.req_products};
 for(let attempt=0;attempt<3;attempt++){
  try{
   const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','X-Web-Loan-Token':key},body:JSON.stringify(payload),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(5000)});
   const result=await response.json().catch(()=>null);
   if(response.ok&&result?.ok===true)return reply({success:true,ant_loan_request_form_id:result.id,loan_request_form:{ant_loan_request_form:body.ant_loan_request_form},message:'Зээлийн хүсэлт амжилттай бүртгэгдлээ.'});
   if(response.status===409)return reply({message:'Хүсэлтийн мэдээлэл өөрчлөгдсөн. Хуудсаа шинэчлээд дахин оролдоно уу.'},409);
   if(response.status<500)break;
  }catch{/* A timed-out acceptance is safe to retry with this same request ID. */}
  if(attempt<2)await new Promise(resolve=>setTimeout(resolve,250*(attempt+1)));
 }
 return reply({message:'CRM-ийн хариу түр ирсэнгүй. Мэдээллээ хадгалсан хэвээр дахин илгээж болно; давхар хүсэлт үүсэхгүй.'},503);
}
