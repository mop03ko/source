import {env} from './runtime';
import {getCurrentUser} from '../app/session';
import type {Member} from './crm';
export class Failure extends Error {constructor(message:string,public status=400){super(message);}}
// Next's internal Request URL can use localhost behind its server adapter.
// Host is the browser's target authority; do not trust forwarded-host as a CSRF bypass.
export function isSameOrigin(req:Request){
 try{
  const origin=req.headers.get('origin');if(!origin||origin==='null')return false;
  const target=new URL(req.url),host=req.headers.get('host');
  if(host){if(/[\s,/@#?\\]/.test(host))return false;target.port='';target.host=host;if(target.host.toLowerCase()!==host.toLowerCase())return false;}
  // TLS ends at Apache; the internal request may be HTTP. Use the configured
  // public scheme only for its exact host, never a client-supplied proxy header.
  if(process.env.AUTH_URL){const publicUrl=new URL(process.env.AUTH_URL);if(host&&target.host===publicUrl.host)target.protocol=publicUrl.protocol;}
  return new URL(origin).origin===origin&&origin===target.origin;
 }catch{return false;}
}
const db=()=>env.DB;
export async function member(){
 const u=await getCurrentUser();if(!u)throw new Failure('Нэвтрэх шаардлагатай.',401);
 const email=u.email.toLowerCase();
 const ownerEmail=process.env.CRM_OWNER_EMAIL?.trim().toLowerCase();
 if(!ownerEmail)throw new Failure('CRM_OWNER_EMAIL тохируулаагүй.',503);
 let m=await db().prepare('SELECT * FROM members WHERE email=?').bind(email).first<Member & {user_id:string|null}>();
 if(!m&&email===ownerEmail){await db().batch([
 db().prepare('INSERT OR IGNORE INTO organization(id,owner) VALUES(1,?)').bind(u.userId),
 db().prepare("INSERT OR IGNORE INTO members(email,user_id,name,role,active) SELECT ?,?,?, 'admin',1 FROM organization WHERE id=1 AND owner=?").bind(email,u.userId,u.displayName,u.userId)
 ]);m=await db().prepare('SELECT * FROM members WHERE email=?').bind(email).first<Member & {user_id:string|null}>();}
 if(m?.active&&m.user_id===null){
  await db().prepare('UPDATE members SET user_id=? WHERE email=? AND user_id IS NULL AND active=1').bind(u.userId,email).run();
  m=await db().prepare('SELECT * FROM members WHERE email=?').bind(email).first<Member & {user_id:string|null}>();
 }
 // Every request checks current authorization; presence is a separate heartbeat.
 if(!m?.active||m.user_id!==u.userId)throw new Failure('Энэ системд нэвтрэх эрх олгоогүй байна. AntMall-ын админтай холбогдоно уу.',403);return m;
}
