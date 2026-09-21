import {DatabaseSync} from 'node:sqlite';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {encode} from 'next-auth/jwt';
import assert from 'node:assert/strict';

// Disposable local database. Optional argv[2] exercises the supplied workbook in the browser.
const dir=await mkdtemp(join(tmpdir(),'antmall-products-')),out=resolve('artifacts/dashboard-clarity-audit');
await mkdir(out,{recursive:true});
const base='http://127.0.0.1:34686',secret=randomBytes(32).toString('base64');
const env={...process.env,AUTH_SECRET:secret,AUTH_URL:base,AUTH_TRUST_HOST:'true',AUTH_GOOGLE_ID:'test',AUTH_GOOGLE_SECRET:'test',CRM_OWNER_EMAIL:'owner@example.test',TURSO_DATABASE_URL:'file:'+join(dir,'test.db'),TURSO_AUTH_TOKEN:'',ANTMALL_SMS_API_KEY:'',CRM_GOOGLE_SERVICE_ACCOUNT_JSON:'',NEXT_TELEMETRY_DISABLED:'1'};delete env.VERCEL;
execFileSync(process.execPath,['scripts/migrate.mjs'],{env,stdio:'pipe'});
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','34686'],{env,stdio:'ignore',windowsHide:true});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
let chrome,ws;const evidence={checks:{},screens:[],errors:[]};
try{
 for(let i=0;i<80;i++){try{await fetch(base+'/login',{signal:AbortSignal.timeout(1000)});break;}catch{await pause(150);}}
 const token=await encode({secret,salt:'authjs.session-token',token:{sub:'google:owner',email:'owner@example.test',name:'Inventory test'},maxAge:3600});
 const headers={cookie:'authjs.session-token='+token,Origin:base,'Content-Type':'application/json'};
 assert.equal((await fetch(base+'/api/crm',{headers})).status,200);

 const fixture=new DatabaseSync(join(dir,'test.db'));
 const stamp=new Date().toISOString(),past=new Date(Date.now()-86400000*2).toISOString();
 for(const role of ['agent','manager','director','marketing','it','delivery'])fixture.prepare('INSERT INTO members(email,name,role,active) VALUES(?,?,?,1)').run(role+'@example.test',role,role);
 fixture.prepare('INSERT INTO marketing_tasks(id,title,channel,budget,owner,status,due_at,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run('task-marketing','Campaign review','Social',120000,'marketing@example.test','planned',past,'owner@example.test',stamp,stamp);
 fixture.prepare('INSERT INTO it_tasks(id,title,system_area,owner,status,due_at,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').run('task-it','Service review','Web','it@example.test','planned',past,'owner@example.test',stamp,stamp);
 fixture.close();
 chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=9347','--user-data-dir='+join(dir,'chrome'),'about:blank'],{stdio:'ignore',windowsHide:true});
 let target;for(let i=0;i<50;i++){try{target=(await (await fetch('http://127.0.0.1:9347/json')).json()).find(t=>t.type==='page');if(target)break;}catch{}await pause(150);}
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


 await cdp('Page.navigate',{url:base+'/?view=dashboard'});
 await wait("!!document.querySelector('.dashboard-report-tabs')");
 assert.equal(await evaluate("!!document.querySelector('input[aria-label=\"Хүсэлт хайх\"]')||!!document.querySelector('.today-performance')"),false);
 await snap('admin-top-1440');await evaluate("document.querySelector('.dashboard-report').scrollIntoView()");await snap('admin-report-1440');
 for(const label of ['Маркетинг','IT']){await evaluate(`(()=>{[...document.querySelectorAll('.dashboard-report-tabs [role=tab]')].find(e=>e.textContent===${JSON.stringify(label)}).click()})()`);await pause(200);}
 await viewport(390);await snap('admin-report-390');await viewport(768);await snap('admin-report-768');await viewport(1440);

 await evaluate("document.querySelector('.dashboard-task-link').click()");await wait("document.querySelector('.detail-body')?.textContent.includes('120,000')");
 assert.ok(await evaluate("document.querySelector('.ant-drawer').textContent.includes('Campaign review')"));await snap('pending-task-detail');
 await cdp('Page.navigate',{url:base+'/?view=dashboard'});await wait("!!document.querySelector('.dashboard-approval-card')");
 await evaluate("[...document.querySelectorAll('.dashboard-approval-card button')].find(e=>e.textContent==='Хянаж батлах').click()");await wait("!!document.querySelector('.ant-modal textarea')");
 assert.equal(await evaluate("document.querySelector('.ant-modal button[type=submit]').disabled"),true);
 await evaluate("(()=>{const e=document.querySelector('.ant-modal textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,'Approved in disposable audit');e.dispatchEvent(new Event('input',{bubbles:true}));})()");
 await wait("!document.querySelector('.ant-modal button[type=submit]').disabled");await evaluate("document.querySelector('.ant-modal button[type=submit]').click()");await wait("!document.querySelector('.ant-modal')&&!document.querySelector('.dashboard-approval-card')");
 const verification=new DatabaseSync(join(dir,'test.db'));assert.ok(verification.prepare("SELECT approved_at FROM marketing_tasks WHERE id='task-marketing'").get().approved_at);verification.close();
 for(const role of ['agent','manager','director','marketing','it','delivery']){
  const roleToken=await encode({secret,salt:'authjs.session-token',token:{sub:'test:'+role,email:role+'@example.test',name:role},maxAge:3600});
  await cdp('Network.setCookie',{name:'authjs.session-token',value:roleToken,url:base,httpOnly:true,sameSite:'Lax'});
  await cdp('Page.navigate',{url:base+'/?view=dashboard'});await wait("!!document.querySelector('.daily-shift,.daily-staffing')");
  if(['manager','director'].includes(role)){assert.ok(await evaluate("!!document.querySelector('.daily-staffing')"));assert.equal(await evaluate("document.querySelector('.daily-work').textContent.includes('Хүсэлт хуваарилах')||document.querySelector('.daily-work').textContent.includes('Хүргэлт хянах')||document.body.innerText.includes('Өнөөдрийн үзүүлэлт · Улаанбаатарын цаг')"),false);}
  if(['manager','director'].includes(role))assert.equal(await evaluate("!!document.querySelector('input[aria-label=\"Хүсэлт хайх\"]')||!!document.querySelector('.today-performance')"),false);
  if(role==='agent')assert.ok(await evaluate("!!document.querySelector('input[aria-label=\"Хүсэлт хайх\"]')"));
  if(['marketing','it'].includes(role)){await wait("!!document.querySelector('.daily-priority')");assert.ok(await evaluate("document.querySelector('.daily-task-list').textContent.includes('review')"));}
  if(['agent','marketing','it','delivery'].includes(role))assert.equal(await evaluate("!!document.querySelector('.dashboard-report')"),false);
  await viewport(390);await snap(role+'-390');await viewport(1440);await snap(role+'-1440');
 }
 assert.equal(evidence.errors.length,0,JSON.stringify(evidence.errors));evidence.checks={roles:7,reports:true,approvalReview:true,mobile:true};console.log('PASS: seven dashboard roles, report tabs, approval review, desktop/tablet/mobile and runtime errors.');

}finally{await writeFile(join(out,'evidence.json'),JSON.stringify(evidence,null,2));ws?.close();chrome?.kill();server.kill();}
