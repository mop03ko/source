import {member,isSameOrigin} from '@/lib/access';
import {sendSms} from '@/lib/sms';
import {normalizePhone,isAdminLike} from '@/lib/crm';
import {z} from 'zod';
export const dynamic='force-dynamic';
// Админ, удирдлага гараар дугаар оруулж чөлөөт мессеж илгээх зориулалттай; автомат (won) SMS-тэй адил sendSms ашиглана.
export async function POST(req:Request){try{
 if(!isSameOrigin(req))return Response.json({error:'Хүсэлт зөвшөөрөгдөхгүй.'},{status:403});
 const m=await member();if(!isAdminLike(m.role))return Response.json({error:'Зөвхөн админ, удирдлага SMS илгээнэ.'},{status:403});
 const raw=await req.text();if(raw.length>3000)return Response.json({error:'Хүсэлт хэт том.'},{status:413});
 const b=z.object({to:z.string().transform((v,ctx)=>{try{return normalizePhone(v);}catch{ctx.addIssue({code:z.ZodIssueCode.custom,message:'8 оронтой утасны дугаар оруулна уу.'});return z.NEVER;}}),message:z.string().trim().min(1).max(600)}).parse(JSON.parse(raw));
 const d=await sendSms(b.to,b.message);
 return Response.json({ok:true,...d});
}catch(e){return Response.json({error:e instanceof z.ZodError?'Мэдээллээ шалгана уу: '+e.issues.map(i=>i.message).join('; '):(e as Error).message},{status:(e as {status?:number}).status||400});}}
