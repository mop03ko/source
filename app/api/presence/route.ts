import {member,Failure,isSameOrigin} from '@/lib/access';
import {env} from '@/lib/runtime';
export async function POST(req:Request){
 try{
  if(!isSameOrigin(req))throw new Failure('Хүсэлт зөвшөөрөгдөхгүй.',403);
  const me=await member(),now=Date.now();
  if(!me.last_seen||Date.parse(me.last_seen)<now-20000)await env.DB.prepare('UPDATE members SET last_seen=? WHERE email=? AND active=1 AND (last_seen IS NULL OR last_seen<?)').bind(new Date(now).toISOString(),me.email,new Date(now-20000).toISOString()).run();
  return Response.json({ok:true},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return Response.json({error:e instanceof Failure?e.message:'Холболтын төлөв шинэчлэгдсэнгүй.'},{status:e instanceof Failure?e.status:500});}
}
