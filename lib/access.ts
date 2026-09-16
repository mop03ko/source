import {env} from './runtime';
import {getCurrentUser} from '../app/session';
import type {Member} from './crm';
export class Failure extends Error {constructor(message:string,public status=400){super(message);}}
const db=()=>env.DB;
export async function member(){
 const u=await getCurrentUser();if(!u)throw new Failure('Нэвтрэх шаардлагатай.',401);
 const email=u.email.toLowerCase();
 const ownerEmail=process.env.CRM_OWNER_EMAIL?.trim().toLowerCase();
 if(!ownerEmail)throw new Failure('CRM_OWNER_EMAIL тохируулаагүй.',503);
 if(email===ownerEmail)await db().batch([
 db().prepare('INSERT OR IGNORE INTO organization(id,owner) VALUES(1,?)').bind(u.userId),
 db().prepare("INSERT OR IGNORE INTO members(email,user_id,name,role,active) SELECT ?,?,?, 'admin',1 FROM organization WHERE id=1 AND owner=?").bind(email,u.userId,u.displayName,u.userId)
 ]);
 // Онлайн төлөв: 20 секундэд нэгээс олонгүй бичихээр хязгаарлаж, идэвхтэй хэрэглэгч бүрийн request-ээр шинэчилнэ.
 await db().batch([
 db().prepare('UPDATE members SET user_id=? WHERE email=? AND user_id IS NULL AND active=1').bind(u.userId,email),
 db().prepare('UPDATE members SET last_seen=? WHERE email=? AND (last_seen IS NULL OR last_seen<?)').bind(new Date().toISOString(),email,new Date(Date.now()-20000).toISOString())
 ]);
 const m=await db().prepare('SELECT * FROM members WHERE email=? AND user_id=? AND active=1').bind(email,u.userId).first<Member>();
 if(!m)throw new Failure('Энэ системд нэвтрэх эрх олгоогүй байна. AntMall-ын админтай холбогдоно уу.',403);return m;
}
