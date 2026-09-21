import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {encode} from 'next-auth/jwt';
import {createClient} from '@libsql/client';
import assert from 'node:assert/strict';

// Disposable local database. Optional argv[2] exercises the supplied workbook in the browser.
const dir=await mkdtemp(join(tmpdir(),'antmall-dashboard-')),out=resolve('artifacts/dashboard-audit');
await mkdir(out,{recursive:true});
const base='http://127.0.0.1:34680',secret=randomBytes(32).toString('base64');
const env={...process.env,AUTH_SECRET:secret,AUTH_URL:base,AUTH_TRUST_HOST:'true',AUTH_GOOGLE_ID:'test',AUTH_GOOGLE_SECRET:'test',CRM_OWNER_EMAIL:'owner@example.test',TURSO_DATABASE_URL:'file:'+join(dir,'test.db'),TURSO_AUTH_TOKEN:'',ANTMALL_SMS_API_KEY:'',CRM_GOOGLE_SERVICE_ACCOUNT_JSON:'',NEXT_TELEMETRY_DISABLED:'1'};delete env.VERCEL;
execFileSync(process.execPath,['scripts/migrate.mjs'],{env,stdio:'pipe'});
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','34680'],{env,stdio:'ignore',windowsHide:true});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
let chrome,ws,db;const evidence={checks:{},screens:[],errors:[]};
try{
 for(let i=0;i<80;i++){try{await fetch(base+'/login',{signal:AbortSignal.timeout(1000)});break;}catch{await pause(150);}}
 const token=await encode({secret,salt:'authjs.session-token',token:{sub:'google:owner',email:'owner@example.test',name:'Inventory test'},maxAge:3600});
 const headers={cookie:'authjs.session-token='+token,Origin:base,'Content-Type':'application/json'};
 assert.equal((await fetch(base+'/api/crm',{headers})).status,200);
 const roles=['admin','director','manager','agent','marketing','it','delivery'];
 const crmPost=async(action,data)=>{const r=await fetch(base+'/api/crm',{method:'POST',headers,body:JSON.stringify({action,data})});const d=await r.json();assert.equal(r.status,200,JSON.stringify(d));return d;};
 for(const role of roles.filter(r=>r!=='admin'))await crmPost('member',{email:role+'@example.test',name:role,role,active:true});
 await crmPost('create',{name:'Agent today lead',phone:'99112233',product:'Test',source:'Facebook',owner:'agent@example.test',status:'new',next_at:new Date().toISOString(),next_action:'Call'});
 db=createClient({url:env.TURSO_DATABASE_URL});const now=new Date().toISOString(),day=new Date(Date.now()+8*3600000).toISOString().slice(0,10);
 for(const role of ['it','marketing'])for(const [id,owner] of [[role+'-mine',role+'@example.test'],[role+'-other','owner@example.test']])await db.execute({sql:`INSERT INTO ${role}_tasks(id,title,${role==='it'?'system_area':'channel'},owner,status,due_at,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)`,args:[id,id,'Бусад',owner,'planned',now,'owner@example.test',now,now]});
 await db.execute({sql:'INSERT INTO deliveries(id,delivered_on,item_info,courier_email,courier_name,status,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)',args:['delivery-mine',day,'delivery-mine','delivery@example.test','delivery','pending','owner@example.test',now,now]});
 chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=9341','--user-data-dir='+join(dir,'chrome'),'about:blank'],{stdio:'ignore',windowsHide:true});
 let target;for(let i=0;i<50;i++){try{target=(await (await fetch('http://127.0.0.1:9341/json')).json()).find(t=>t.type==='page');if(target)break;}catch{}await pause(150);}
 if(!target)throw new Error('Chrome did not start');
 ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
 let sequence=0;const pending=new Map();
 const cdp=(method,params={})=>new Promise((r,j)=>{const id=++sequence,t=setTimeout(()=>{pending.delete(id);j(new Error('CDP timeout: '+method));},30000);pending.set(id,{resolve:v=>{clearTimeout(t);r(v);},reject:e=>{clearTimeout(t);j(e);}});ws.send(JSON.stringify({id,method,params}));});
 ws.onmessage=event=>{const v=JSON.parse(event.data);if(v.id){const p=pending.get(v.id);if(p){pending.delete(v.id);v.error?p.reject(new Error(v.error.message)):p.resolve(v.result);}}else if(v.method==='Runtime.exceptionThrown')evidence.errors.push(v.params.exceptionDetails.exception?.description||v.params.exceptionDetails.text);else if(v.method==='Page.javascriptDialogOpening')void cdp('Page.handleJavaScriptDialog',{accept:true});};
 const evaluate=async expression=>{const r=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.result.description);return r.result.value;};
 const wait=async(expression)=>{for(let i=0;i<100;i++){if(await evaluate(expression))return;await pause(150);}evidence.lastBody=await evaluate('document.body.innerText');const shot=await cdp('Page.captureScreenshot',{format:'png'});await writeFile(join(out,'failure.png'),Buffer.from(shot.data,'base64'));throw new Error('UI wait timed out: '+expression);};
 const click=async(text,selector='button')=>{await evaluate(`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.textContent.trim()===${JSON.stringify(text)});if(!e)throw new Error('Missing button: '+${JSON.stringify(text)});e.click();})()`);await pause(300);};
 const fill=async(selector,value)=>{await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw new Error('Missing input');const proto=e instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);await pause(200);};
 const viewport=async(width)=>{await cdp('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});await pause(250);};
 const snap=async name=>{const metrics=await evaluate('({width:innerWidth,scroll:document.documentElement.scrollWidth})');const shot=await cdp('Page.captureScreenshot',{format:'png'});await writeFile(join(out,name+'.png'),Buffer.from(shot.data,'base64'));evidence.screens.push({name,...metrics});assert.ok(metrics.scroll<=metrics.width,name+' overflows');};
 await cdp('Runtime.enable');await cdp('Page.enable');await cdp('Network.enable');await viewport(1440);
 await cdp('Network.setCookie',{name:'authjs.session-token',value:token,url:base,httpOnly:true,sameSite:'Lax'});
 for(const role of roles){
  const email=role==='admin'?'owner@example.test':role+'@example.test';
  const roleToken=await encode({secret,salt:'authjs.session-token',token:{sub:'google:'+(role==='admin'?'owner':role),email,name:role},maxAge:3600});
  await cdp('Network.setCookie',{name:'authjs.session-token',value:roleToken,url:base,httpOnly:true,sameSite:'Lax'});
  await cdp('Page.navigate',{url:base+(role==='admin'?'/':role==='director'?'/?view=dashboard':'/?view=today')});await wait("!!document.querySelector('.daily-work .daily-shift')");
  assert.equal(await evaluate("document.querySelector('.nav-button').textContent.trim()"),'Хяналтын самбар'+(['admin','director','manager','agent'].includes(role)?'1':''));
  assert.equal(await evaluate("[...document.querySelectorAll('.nav-button')].some(e=>e.textContent==='Өнөөдрийн ажил')"),false);
  assert.equal(await evaluate("new URLSearchParams(location.search).get('view')"),'dashboard');
  if(['marketing','it','delivery'].includes(role)){
   await wait("!!document.querySelector('.daily-task-list button')");
   assert.equal(await evaluate("document.querySelectorAll('.daily-task-list li').length"),1);
   assert.equal(await evaluate("!!document.querySelector('.lead-list-table')"),false);
   assert.ok(await evaluate("document.querySelector('.daily-work').textContent.includes("+JSON.stringify(role+'-mine')+")"));
   assert.ok(!await evaluate("document.querySelector('.daily-work').textContent.includes("+JSON.stringify(role+'-other')+")"));
  }else{await wait("!!document.querySelector('.lead-list-table')");assert.ok(await evaluate("document.querySelector('.lead-list-table').textContent.includes('Agent today lead')"));}
  await snap(role+'-desktop');await viewport(390);await snap(role+'-mobile');await viewport(1440);
  if(['marketing','it','delivery'].includes(role)){
   await evaluate("document.querySelector('.daily-task-list button').click()");await wait("!!document.querySelector('.ant-drawer-body')");
   await wait("[...document.querySelectorAll('.ant-drawer')].some(e=>e.textContent.includes("+JSON.stringify(role+'-mine')+"))");
  }
  evidence.checks[role]=true;
 }
 assert.equal(evidence.errors.length,0,JSON.stringify(evidence.errors));console.log('PASS: all 7 roles land on first dashboard tab, legacy link redirects, role-specific work and direct task opening, desktop/mobile and no runtime errors.');
}finally{await writeFile(join(out,'evidence.json'),JSON.stringify(evidence,null,2));ws?.close();chrome?.kill();server.kill();db?.close();}
