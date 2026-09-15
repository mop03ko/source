import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';
import {encode} from 'next-auth/jwt';
const dir=await mkdtemp(join(tmpdir(),'antmall-production-'));
const port=34671,base=`http://127.0.0.1:${port}`,secret=randomBytes(32).toString('base64');
const env={...process.env,AUTH_SECRET:secret,AUTH_URL:base,AUTH_TRUST_HOST:'true',AUTH_GOOGLE_ID:'local-test-id',AUTH_GOOGLE_SECRET:'local-test-only',CRM_OWNER_EMAIL:'owner@example.test',TURSO_DATABASE_URL:'file:'+join(dir,'test.db'),TURSO_AUTH_TOKEN:'',NEXT_TELEMETRY_DISABLED:'1'};
// A local temporary database only. Never uses production keys or customer records.
delete env.VERCEL;
execFileSync(process.execPath,['scripts/migrate.mjs'],{env,stdio:'pipe'});
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{env,stdio:'ignore'});
const cookieName='authjs.session-token';
async function cookie(sub,email){return `${cookieName}=`+await encode({secret,salt:cookieName,token:{sub,email,name:'Test'},maxAge:60});}
try{
 let ready=false;for(let i=0;i<100;i++){try{await fetch(base+'/login');ready=true;break;}catch{await new Promise(r=>setTimeout(r,100));}}
 assert.ok(ready,'Production server did not start');
 let r=await fetch(base+'/',{redirect:'manual'});assert.equal(r.status,307);assert.ok(r.headers.get('location').endsWith('/login'));
 for(const route of ['/api/crm','/api/notifications','/api/sheets']){
  r=await fetch(base+route,{headers:{'oai-authenticated-user-id':'owner','oai-authenticated-user-email':'owner@example.test'}});assert.equal(r.status,401,route+' must reject spoofed platform identity');
 }
 r=await fetch(base+'/api/crm',{headers:{cookie:cookieName+'=forged'}});assert.equal(r.status,401);
 const ownerCookie=await cookie('google:owner','owner@example.test');
 r=await fetch(base+'/api/crm',{headers:{cookie:ownerCookie}});assert.equal(r.status,200);assert.equal((await r.json()).me.role,'admin');
 r=await fetch(base+'/api/crm',{headers:{cookie:await cookie('google:stranger','stranger@example.test')}});assert.equal(r.status,403);
 r=await fetch(base+'/api/crm',{method:'POST',headers:{cookie:ownerCookie,Origin:'https://other.invalid','Content-Type':'application/json'},body:'{}'});assert.equal(r.status,403);
 r=await fetch(base+'/logout',{headers:{cookie:ownerCookie}});assert.equal(r.status,200);
 r=await fetch(base+'/api/crm',{headers:{cookie:ownerCookie}});assert.equal(r.status,200,'GET logout must not mutate the session');
 console.log('PASS: production HTTP login redirect, unauthenticated APIs, spoofed identity headers, forged sessions, signed owner session, unlisted member, cross-origin writes and logout confirmation. Google OAuth network flow is not exercised.');
}finally{
 child.kill('SIGTERM');await new Promise(resolve=>{child.once('exit',resolve);setTimeout(resolve,3000);});await rm(dir,{recursive:true,force:true});
}
