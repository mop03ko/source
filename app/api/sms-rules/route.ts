import {env} from '@/lib/runtime';
import {member,Failure} from '@/lib/access';
import {isAdminLike,stages} from '@/lib/crm';
import {z} from 'zod';
export const dynamic='force-dynamic';
const db=()=>env.DB!;
export type SmsRule={id:string;status:string;message:string;enabled:number;created_at:string;updated_at:string};
function err(e:unknown){
 if(e instanceof Failure)return Response.json({error:e.message},{status:e.status});
 if(e instanceof z.ZodError)return Response.json({error:'Мэдээллээ шалгана уу: '+e.issues.map(i=>i.message).join('; ')},{status:400});
 console.error('SMS rule request failed',e instanceof Error?e.message:'error');
 return Response.json({error:'Хадгалж чадсангүй. Дахин оролдоно уу.'},{status:500});
}
// Хүсэлтийн төлөв өөрчлөгдөх үед харилцагч руу автоматаар илгээх SMS-ийн дүрмүүд: статус тус бүрт нэг дүрэм,
// текст болон асаах/унтраах switch-тэй; зөвхөн Админ, Удирдлага удирдана.
export async function GET(){try{
 const m=await member();if(!isAdminLike(m.role))throw new Failure('Зөвхөн админ, удирдлага харна.',403);
 const rows=await db().prepare('SELECT * FROM sms_rules ORDER BY status').all<SmsRule>();
 return Response.json({items:rows.results},{headers:{'Cache-Control':'no-store'}});
}catch(e){return err(e);}}
const bodySchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('save'),status:z.string().refine(v=>Object.hasOwn(stages,v)),message:z.string().trim().min(1).max(600),enabled:z.boolean()}),
 z.object({action:z.literal('delete'),status:z.string().refine(v=>Object.hasOwn(stages,v))}),
]);
export async function POST(req:Request){try{
 if(req.headers.get('origin')!==new URL(req.url).origin)throw new Failure('Хүсэлтийн эх сурвалж буруу.',403);
 const m=await member();if(!isAdminLike(m.role))throw new Failure('Зөвхөн админ, удирдлага удирдана.',403);
 const raw=await req.text();if(raw.length>3000)throw new Failure('Мэдээлэл хэт их.',413);
 const b=bodySchema.parse(JSON.parse(raw)),now=new Date().toISOString();
 if(b.action==='save'){
  await db().prepare('INSERT INTO sms_rules(id,status,message,enabled,created_at,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(status) DO UPDATE SET message=excluded.message,enabled=excluded.enabled,updated_at=excluded.updated_at').bind(crypto.randomUUID(),b.status,b.message,b.enabled?1:0,now,now).run();
  return Response.json({ok:true});
 }
 await db().prepare('DELETE FROM sms_rules WHERE status=?').bind(b.status).run();
 return Response.json({ok:true});
}catch(e){return err(e);}}
