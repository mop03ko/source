import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import {DB} from './lib/database';
import {googleIdentity} from './lib/auth-policy';
// Cold serverless invocation-ий эхний Turso сурвалжид хийх query нь заримдаа сүлжээний түр саатлаас болж
// амжилтгүй болдог; нэг удаа шууд дахин оролдоход энэ нь ихэвчлэн шийдэгддэг тул хэрэглэгчийг 2 дахь удаа
// дарахад хүргэхгүй.
async function withRetry<T>(fn:()=>Promise<T>,attempts=2):Promise<T>{
 let lastErr:unknown;
 for(let i=0;i<attempts;i++){try{return await fn();}catch(e){lastErr=e;if(i<attempts-1)await new Promise(r=>setTimeout(r,150));}}
 throw lastErr;
}
export const {handlers,auth,signIn,signOut}=NextAuth({
 providers:[Google],
 session:{strategy:'jwt',maxAge:8*60*60},
 pages:{signIn:'/login',error:'/login'},
 callbacks:{
  async signIn({account,profile}){
   const identity=googleIdentity(account?.provider,profile);
   const owner=process.env.CRM_OWNER_EMAIL?.trim().toLowerCase();
   if(!identity || !owner || !process.env.AUTH_SECRET || !process.env.AUTH_URL)return false;
   // Google must verify the email, and an admin must pre-register non-owner members.
   if(identity.email===owner)return true;
   const m=await withRetry(()=>DB.prepare('SELECT user_id FROM members WHERE email=? AND active=1').bind(identity.email).first<{user_id:string|null}>());
   return !!m && (!m.user_id || m.user_id===identity.userId);
  },
  async jwt({token,account,profile}){
   if(account){const identity=googleIdentity(account.provider,profile);if(!identity)throw new Error('Invalid identity');token.sub=identity.userId;token.email=identity.email;}
   return token;
  },
  async session({session,token}){if(session.user){session.user.id=token.sub!;session.user.email=token.email!;}return session;},
  async redirect({url}){
   const base=process.env.AUTH_URL;
   if(!base)throw new Error('AUTH_URL is required');
   const origin=new URL(base).origin;
   const target=new URL(url,origin);
   return target.origin===origin?target.href:origin;
  }
 }
});
