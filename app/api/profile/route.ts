import {member} from '@/lib/access';
import {env} from '@/lib/runtime';
import {normalizePhone} from '@/lib/crm';
import {z} from 'zod';
export const dynamic='force-dynamic';
const db=()=>env.DB!;
// Гишүүн бүр (эрхээс үл хамааран) зөвхөн ӨӨРИЙН avatar, утасны дугаараа засна; нэр/эрхийг админ 'member' үйлдлээр удирдана.
export async function POST(req:Request){try{
 if(req.headers.get('origin')!==new URL(req.url).origin)return Response.json({error:'Хүсэлт зөвшөөрөгдөхгүй.'},{status:403});
 const m=await member();
 const raw=await req.text();if(raw.length>400000)return Response.json({error:'Зураг хэт том.'},{status:413});
 const b=z.object({
 phone:z.string().trim().transform((v,ctx)=>{if(!v)return '';try{return normalizePhone(v);}catch{ctx.addIssue({code:z.ZodIssueCode.custom,message:'8 оронтой утасны дугаар оруулна уу.'});return z.NEVER;}}).optional(),
 avatar:z.string().max(300000).regex(/^data:image\/(png|jpeg|webp);base64,/).nullable().optional(),
 }).parse(JSON.parse(raw));
 if(b.phone!==undefined)await db().prepare('UPDATE members SET phone=? WHERE email=?').bind(b.phone||null,m.email).run();
 if(b.avatar!==undefined)await db().prepare('UPDATE members SET avatar=? WHERE email=?').bind(b.avatar,m.email).run();
 return Response.json({ok:true,phone:b.phone,avatar:b.avatar});
}catch(e){return Response.json({error:e instanceof z.ZodError?'Мэдээллээ шалгана уу: '+e.issues.map(i=>i.message).join('; '):(e as Error).message},{status:(e as {status?:number}).status||400});}}
