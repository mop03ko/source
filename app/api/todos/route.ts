import {z} from 'zod';
import {env} from '@/lib/runtime';
import {member,Failure,isSameOrigin} from '@/lib/access';
export const dynamic='force-dynamic';
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
function error(e:unknown){return json({error:e instanceof Failure?e.message:e instanceof z.ZodError||e instanceof SyntaxError?'Ажлын мэдээллээ шалгана уу.':'Ажлыг хадгалж чадсангүй. Дахин оролдоно уу.'},e instanceof Failure?e.status:e instanceof z.ZodError||e instanceof SyntaxError?400:500);}
export async function GET(req:Request){try{
 const me=await member(),p=new URL(req.url).searchParams;
 const status=z.enum(['all','open','done']).parse(p.get('status')||'open');
 const page=z.coerce.number().int().min(1).max(10000).parse(p.get('page')||1);
 const filter=status==='all'?'':status==='open'?' AND done=0':' AND done=1';
 const [items,summary]=await Promise.all([
  env.DB.prepare(`SELECT id,title,done,version,created_at,updated_at FROM personal_todos WHERE owner=?${filter} ORDER BY done,created_at DESC,id LIMIT 20 OFFSET ?`).bind(me.email,(page-1)*20).all(),
  env.DB.prepare('SELECT COUNT(*) total,COALESCE(SUM(done),0) done FROM personal_todos WHERE owner=?').bind(me.email).first<{total:number;done:number}>()
 ]);
 const total=summary?.total||0,done=summary?.done||0;
 return json({items:items.results,summary:{total,done,open:total-done},count:status==='all'?total:status==='done'?done:total-done});
}catch(e){return error(e);}}
const schema=z.discriminatedUnion('action',[
 z.object({action:z.literal('create'),id:z.string().uuid(),title:z.string().trim().min(1).max(300)}).strict(),
 z.object({action:z.literal('update'),id:z.string().uuid(),version:z.number().int().positive(),title:z.string().trim().min(1).max(300),done:z.boolean()}).strict(),
 z.object({action:z.literal('delete'),id:z.string().uuid(),version:z.number().int().positive()}).strict()
]);
export async function POST(req:Request){try{
 if(!isSameOrigin(req))throw new Failure('Хүсэлт зөвшөөрөгдөхгүй.',403);
 const me=await member(),raw=await req.text();if(raw.length>4096)throw new Failure('Мэдээлэл хэт том.',413);
 const b=schema.parse(JSON.parse(raw)),now=new Date().toISOString();
 return json(await env.DB.transaction(async db=>{
  if(b.action==='create'){
   const existing=await db.prepare('SELECT owner FROM personal_todos WHERE id=?').bind(b.id).first<{owner:string}>();
   if(existing){if(existing.owner!==me.email)throw new Failure('Ажил олдсонгүй.',404);return {ok:true,id:b.id};}
   await db.prepare('INSERT INTO personal_todos(id,owner,title,created_at,updated_at) VALUES(?,?,?,?,?)').bind(b.id,me.email,b.title,now,now).run();return {ok:true,id:b.id};
  }
  const item=await db.prepare('SELECT version FROM personal_todos WHERE id=? AND owner=?').bind(b.id,me.email).first<{version:number}>();
  if(!item)throw new Failure('Ажил олдсонгүй.',404);
  if(item.version!==b.version)throw new Failure('Ажил өөрчлөгдсөн байна. Жагсаалтыг шинэчлээд дахин оролдоно уу.',409);
  if(b.action==='delete')await db.prepare('DELETE FROM personal_todos WHERE id=? AND owner=? AND version=?').bind(b.id,me.email,b.version).run();
  else await db.prepare('UPDATE personal_todos SET title=?,done=?,version=version+1,updated_at=? WHERE id=? AND owner=? AND version=?').bind(b.title,b.done?1:0,now,b.id,me.email,b.version).run();
  return {ok:true};
 }));
}catch(e){return error(e);}}
