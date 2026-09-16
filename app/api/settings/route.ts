import {member} from '@/lib/access';
import {getSettings,setSetting,soundPresets} from '@/lib/settings';
import {z} from 'zod';
export const dynamic='force-dynamic';
// Уншихыг бүх нэвтэрсэн гишүүнд зөвшөөрнө: NotificationBell хэн бүхэнд нэг тохируулсан
// дуугаар мэдэгдэх ёстой тул зөвхөн admin биш, бүх идэвхтэй гишүүн энд хандах хэрэгтэй.
export async function GET(){try{await member();return Response.json(await getSettings(),{headers:{'Cache-Control':'no-store'}});}catch(e){return Response.json({error:(e as Error).message},{status:(e as {status?:number}).status||500});}}
export async function POST(req:Request){try{
 if(req.headers.get('origin')!==new URL(req.url).origin)return Response.json({error:'Хүсэлт зөвшөөрөгдөхгүй.'},{status:403});
 const m=await member();if(m.role!=='admin')return Response.json({error:'Зөвхөн админ тохиргоо өөрчилнө.'},{status:403});
 const raw=await req.text();if(raw.length>2000)return Response.json({error:'Тохиргоо хэт том.'},{status:413});
 const b=z.object({notification_sound:z.enum(Object.keys(soundPresets) as [string,...string[]]).optional(),sms_enabled:z.enum(['on','off']).optional()}).refine(v=>v.notification_sound||v.sms_enabled,'Тохиргоо буруу.').parse(JSON.parse(raw));
 if(b.notification_sound)await setSetting('notification_sound',b.notification_sound);
 if(b.sms_enabled)await setSetting('sms_enabled',b.sms_enabled);
 return Response.json(await getSettings());
}catch(e){return Response.json({error:e instanceof z.ZodError?'Тохиргоо буруу.':(e as Error).message},{status:(e as {status?:number}).status||400});}}
