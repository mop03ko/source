import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {encode} from 'next-auth/jwt';
import assert from 'node:assert/strict';

// UI/UX evidence capture against a disposable local database; no production writes.
const dir=await mkdtemp(join(tmpdir(),'antmall-products-')),out=resolve('artifacts/inventory-count-workspace-audit');
await mkdir(out,{recursive:true});
const base='http://127.0.0.1:34683',secret=randomBytes(32).toString('base64');
const env={...process.env,AUTH_SECRET:secret,AUTH_URL:base,AUTH_TRUST_HOST:'true',AUTH_GOOGLE_ID:'test',AUTH_GOOGLE_SECRET:'test',CRM_OWNER_EMAIL:'owner@example.test',TURSO_DATABASE_URL:'file:'+join(dir,'test.db'),TURSO_AUTH_TOKEN:'',ANTMALL_SMS_API_KEY:'',CRM_GOOGLE_SERVICE_ACCOUNT_JSON:'',NEXT_TELEMETRY_DISABLED:'1'};delete env.VERCEL;
execFileSync(process.execPath,['scripts/migrate.mjs'],{env,stdio:'pipe'});
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','34683'],{env,stdio:'ignore',windowsHide:true});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
let chrome,ws;const evidence={checks:{},screens:[],errors:[]};
try{
 for(let i=0;i<80;i++){try{await fetch(base+'/login',{signal:AbortSignal.timeout(1000)});break;}catch{await pause(150);}}
 const token=await encode({secret,salt:'authjs.session-token',token:{sub:'google:owner',email:'owner@example.test',name:'Inventory test'},maxAge:3600});
 const headers={cookie:'authjs.session-token='+token,Origin:base,'Content-Type':'application/json'};
 assert.equal((await fetch(base+'/api/crm',{headers})).status,200);
 const post=async(action,data,id)=>{const r=await fetch(base+'/api/inventory',{method:'POST',headers,body:JSON.stringify({action,data,id})});const value=await r.json();assert.equal(r.status,200,JSON.stringify(value));return value;};
 const wh=(await post('create_warehouse',{name:'Product warehouse'})).id;
 const baseItem={name:'Grouped phone',brand:'Apple',capacity:'256GB',color:'Blue',category:'Гар утас',sale_price:1000,cash_price:900};
 const first=(await post('create_item',{...baseItem,code:'SERIAL-A',imei:'111111111111111',barcode:'8800000000001',supplier:'Mike'})).id;
 const second=(await post('create_item',{...baseItem,code:'SERIAL-B',imei:'222222222222222',barcode:'8800000000001',supplier:'Yuna'})).id;
 await post('create_item',{...baseItem,code:'SERIAL-512',capacity:'512GB'});await post('create_item',{...baseItem,code:'SERIAL-WHITE',color:'White'});
 for(const id of [first,second])await post('record_purchase',{item_id:id,warehouse_id:wh,qty:1,unit_cost:500,status:'received'});
 await post('create_warehouse',{name:'Second warehouse'});
 await post('record_purchase',{item_id:first,warehouse_id:wh,qty:2,unit_cost:500,status:'ordered'});
 await post('record_sale',{item_id:second,warehouse_id:wh,qty:1,unit_price:900});
 const cr=await fetch(base+'/api/inventory-counts',{method:'POST',headers,body:JSON.stringify({action:'create',data:{title:'UX audit count',warehouse_id:wh,owner:'owner@example.test',status:'planned',due_at:new Date().toISOString(),note:''}})});
 assert.equal(cr.status,200);await cr.json();
 chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=9344','--user-data-dir='+join(dir,'chrome'),'about:blank'],{stdio:'ignore',windowsHide:true});
 let target;for(let i=0;i<50;i++){try{target=(await (await fetch('http://127.0.0.1:9344/json')).json()).find(t=>t.type==='page');if(target)break;}catch{}await pause(150);}
 if(!target)throw new Error('Chrome did not start');
 ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
 let sequence=0;const pending=new Map();
 const cdp=(method,params={})=>new Promise((r,j)=>{const id=++sequence,t=setTimeout(()=>{pending.delete(id);j(new Error('CDP timeout: '+method));},30000);pending.set(id,{resolve:v=>{clearTimeout(t);r(v);},reject:e=>{clearTimeout(t);j(e);}});ws.send(JSON.stringify({id,method,params}));});
 ws.onmessage=event=>{const v=JSON.parse(event.data);if(v.id){const p=pending.get(v.id);if(p){pending.delete(v.id);v.error?p.reject(new Error(v.error.message)):p.resolve(v.result);}}else if(v.method==='Runtime.exceptionThrown')evidence.errors.push(v.params.exceptionDetails.exception?.description||v.params.exceptionDetails.text);else if(v.method==='Page.javascriptDialogOpening')void cdp('Page.handleJavaScriptDialog',{accept:true});};
 const evaluate=async expression=>{const r=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.result.description);return r.result.value;};
 const wait=async(expression)=>{for(let i=0;i<100;i++){if(await evaluate(expression))return;await pause(150);}evidence.lastBody=await evaluate('document.body.innerText');const shot=await cdp('Page.captureScreenshot',{format:'png'});await writeFile(join(out,'failure.png'),Buffer.from(shot.data,'base64'));throw new Error('UI wait timed out: '+expression);};
 const click=async(text,selector='button')=>{await evaluate(`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.textContent.trim().replace(/^Tab \d+ of \d+/,'')===${JSON.stringify(text)});if(!e)throw new Error('Missing button: '+${JSON.stringify(text)});e.click();})()`);await pause(300);};
 const fill=async(selector,value)=>{await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw new Error('Missing input');const proto=e instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);await pause(200);};
 const viewport=async(width)=>{await cdp('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});await pause(250);};
 const snap=async name=>{const metrics=await evaluate('({width:innerWidth,scroll:document.documentElement.scrollWidth})');const shot=await cdp('Page.captureScreenshot',{format:'png'});await writeFile(join(out,name+'.png'),Buffer.from(shot.data,'base64'));evidence.screens.push({name,...metrics});assert.ok(metrics.scroll<=metrics.width,name+' overflows');};
 await cdp('Runtime.enable');await cdp('Page.enable');await cdp('Network.enable');await viewport(1440);
 await cdp('Network.setCookie',{name:'authjs.session-token',value:token,url:base,httpOnly:true,sameSite:'Lax'});
 await cdp('Page.navigate',{url:base+'/?view=inventory'});await wait("document.querySelectorAll('.inventory-item-link').length===3");


 for(let i=0;i<51;i++){const id=(await post('create_item',{code:'COUNT-'+i,name:'Count item '+String(i).padStart(2,'0'),sale_price:100})).id;await post('record_purchase',{item_id:id,warehouse_id:wh,qty:1,unit_cost:50,status:'received'});}
 const make=await fetch(base+'/api/inventory-counts',{method:'POST',headers,body:JSON.stringify({action:'create',data:{title:'Paged count',warehouse_id:wh,owner:'owner@example.test',status:'planned',due_at:null,note:''}})});assert.equal(make.status,200);const countId=(await make.json()).id;
 await cdp('Page.navigate',{url:base+'/?view=inventory&inv_tab=counts'});await wait("[...document.querySelectorAll('.lead-link')].some(e=>e.textContent.includes('Paged count'))");
 await click('Paged count','.lead-link');await wait("document.querySelectorAll('.count-lines input[type=number]').length===50");
 const firstName=await evaluate("document.querySelector('.count-lines .count-item strong').textContent");
 await fill('.count-lines input[type=number]','7');
 await evaluate("document.querySelector('.count-lines .ant-pagination-item-2').click()");await wait("document.querySelectorAll('.count-lines input[type=number]').length===2");
 await fill('.count-lines input[type=number]','3');
 await evaluate("document.querySelector('.count-lines .ant-pagination-item-1').click()");await wait("document.querySelectorAll('.count-lines input[type=number]').length===50");
 assert.equal(await evaluate("document.querySelector('.count-lines input[type=number]').value"),'7');
 await fill('input[aria-label="Тооллогын бараа хайх"]',firstName);await wait("document.querySelectorAll('.count-lines input[type=number]').length===1");
 assert.equal(await evaluate("document.querySelector('.count-lines input[type=number]').value"),'7');
 await click('Тоолсон дүн хадгалах');await wait("document.querySelector('.inventory-sticky-actions')?.textContent.includes('Хадгалсан дүн')");
 const saved=await (await fetch(base+'/api/inventory-counts?id='+countId,{headers})).json();assert.equal(saved.lines.filter(l=>l.counted_qty!==null).length,2);assert.deepEqual(saved.lines.filter(l=>l.counted_qty!==null).map(l=>l.counted_qty).sort(),[3,7]);
 await click('Зөрүү хянах');await wait("!!document.querySelector('.ant-modal')");assert.equal(await evaluate("document.querySelector('.ant-modal-footer .ant-btn-primary').disabled"),true);
 await click('Буцах','.ant-modal button');await viewport(390);await snap('paged-count-mobile');
 evidence.checks={paginationPreservesDraft:true,searchPreservesDraft:true,savesAllPages:true,incompleteFinalizeBlocked:true};
 console.log('PASS: 52-line count, cross-page and search draft preservation, partial save and incomplete-finalize guard.');
}finally{await writeFile(join(out,'evidence.json'),JSON.stringify(evidence,null,2));ws?.close();chrome?.kill();server.kill();}
