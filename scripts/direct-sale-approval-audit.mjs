import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {encode} from 'next-auth/jwt';
import assert from 'node:assert/strict';

// Disposable local database. Optional argv[2] exercises the supplied workbook in the browser.
const dir=await mkdtemp(join(tmpdir(),'antmall-products-')),out=resolve('artifacts/direct-sale-approval-audit');
await mkdir(out,{recursive:true});
const base='http://127.0.0.1:34691',secret=randomBytes(32).toString('base64');
const env={...process.env,AUTH_SECRET:secret,AUTH_URL:base,AUTH_TRUST_HOST:'true',AUTH_GOOGLE_ID:'test',AUTH_GOOGLE_SECRET:'test',CRM_OWNER_EMAIL:'owner@example.test',TURSO_DATABASE_URL:'file:'+join(dir,'test.db'),TURSO_AUTH_TOKEN:'',ANTMALL_SMS_API_KEY:'',CRM_GOOGLE_SERVICE_ACCOUNT_JSON:'',NEXT_TELEMETRY_DISABLED:'1'};delete env.VERCEL;
execFileSync(process.execPath,['scripts/migrate.mjs'],{env,stdio:'pipe'});
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','34691'],{env,stdio:'ignore',windowsHide:true});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
let chrome,ws;const evidence={checks:{},screens:[],errors:[]};
try{
 for(let i=0;i<80;i++){try{await fetch(base+'/login',{signal:AbortSignal.timeout(1000)});break;}catch{await pause(150);}}
 const token=await encode({secret,salt:'authjs.session-token',token:{sub:'google:owner',email:'owner@example.test',name:'Inventory test'},maxAge:3600});
 const headers={cookie:'authjs.session-token='+token,Origin:base,'Content-Type':'application/json'};
 assert.equal((await fetch(base+'/api/crm',{headers})).status,200);
 chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=9352','--user-data-dir='+join(dir,'chrome'),'about:blank'],{stdio:'ignore',windowsHide:true});
 let target;for(let i=0;i<50;i++){try{target=(await (await fetch('http://127.0.0.1:9352/json')).json()).find(t=>t.type==='page');if(target)break;}catch{}await pause(150);}
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

 const post=async(body,custom=headers)=>{const r=await fetch(base+'/api/inventory',{method:'POST',headers:custom,body:JSON.stringify({...body,request_id:crypto.randomUUID()})});const data=await r.json();assert.equal(r.status,200,JSON.stringify(data));return data;};
 const wh=(await post({action:'create_warehouse',data:{name:'Approval warehouse'}})).id;
 const item=(await post({action:'create_item',data:{code:'PENDING-TEST',name:'Approval phone'}})).id;
 await post({action:'record_purchase',data:{item_id:item,warehouse_id:wh,qty:2,unit_cost:100}});
 await fetch(base+'/api/crm',{method:'POST',headers,body:JSON.stringify({action:'member',data:{email:'operator@example.test',name:'Operator test',role:'operator',active:true}})});
 const agentToken=await encode({secret,salt:'authjs.session-token',token:{sub:'google:operator',email:'operator@example.test',name:'Operator test'},maxAge:3600});
 const pendingSale=await post({action:'record_sale',data:{item_id:item,warehouse_id:wh,qty:1,unit_price:200}},{...headers,cookie:'authjs.session-token='+agentToken});assert.equal(pendingSale.status,'pending');
 await cdp('Page.navigate',{url:base+'/?view=inventory&inv_tab=sales'});
 await wait("document.body.innerText.includes('PENDING-TEST')");
 await snap('approval-desktop');await viewport(390);await snap('approval-mobile');await viewport(1440);
 await evaluate("[...document.querySelectorAll('button')].find(e=>e.textContent.includes('\u0425\u044f\u043d\u0430\u0445')).click()");
 await wait("document.querySelector('.ant-modal-body')?.textContent.includes('PENDING-TEST')");await pause(400);await snap('approval-detail');
 await evaluate("[...document.querySelectorAll('.ant-modal-footer button')].find(e=>e.classList.contains('ant-btn-primary')).click()");
 await wait("!document.querySelector('.ant-modal-wrap:not([style*=none]) .ant-modal-body')");
 const result=await (await fetch(base+'/api/inventory?view=sale_requests&status=approved',{headers})).json();assert.equal(result.count,1);
 assert.equal(evidence.errors.length,0,JSON.stringify(evidence.errors));
 evidence.checks={operatorPending:true,adminApprovedInUI:true,desktop:true,mobile:true};
 console.log('PASS: operator submission and admin approval in browser, desktop/mobile, no overflow.');

}finally{await writeFile(join(out,'evidence.json'),JSON.stringify(evidence,null,2));ws?.close();chrome?.kill();server.kill();}