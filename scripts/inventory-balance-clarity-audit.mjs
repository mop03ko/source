import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {encode} from 'next-auth/jwt';
import assert from 'node:assert/strict';

// Disposable local database. Optional argv[2] exercises the supplied workbook in the browser.
const dir=await mkdtemp(join(tmpdir(),'antmall-products-')),out=resolve('artifacts/inventory-balance-clarity-audit');
await mkdir(out,{recursive:true});
const base='http://127.0.0.1:34685',secret=randomBytes(32).toString('base64');
const env={...process.env,AUTH_SECRET:secret,AUTH_URL:base,AUTH_TRUST_HOST:'true',AUTH_GOOGLE_ID:'test',AUTH_GOOGLE_SECRET:'test',CRM_OWNER_EMAIL:'owner@example.test',TURSO_DATABASE_URL:'file:'+join(dir,'test.db'),TURSO_AUTH_TOKEN:'',ANTMALL_SMS_API_KEY:'',CRM_GOOGLE_SERVICE_ACCOUNT_JSON:'',NEXT_TELEMETRY_DISABLED:'1'};delete env.VERCEL;
execFileSync(process.execPath,['scripts/migrate.mjs'],{env,stdio:'pipe'});
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','34685'],{env,stdio:'ignore',windowsHide:true});
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
 chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=9346','--user-data-dir='+join(dir,'chrome'),'about:blank'],{stdio:'ignore',windowsHide:true});
 let target;for(let i=0;i<50;i++){try{target=(await (await fetch('http://127.0.0.1:9346/json')).json()).find(t=>t.type==='page');if(target)break;}catch{}await pause(150);}
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

 await cdp('Page.navigate',{url:base+'/?view=inventory&inv_tab=balance'});
 await wait("!!document.querySelector('.balance-detail-table .ant-table-row')");
 await wait("document.querySelectorAll('.balance-kpis .ant-card').length===4");
 assert.ok(await evaluate("document.querySelector('.balance-detail-table .ant-table-summary').textContent.includes('Бүх хуудасны дүн')"));
 await snap('balance-desktop');await evaluate("document.querySelector('.balance-detail-table').scrollIntoView()");await snap('balance-table-desktop');
 await viewport(390);await wait("!!document.querySelector('.balance-mobile-card')");await evaluate("document.querySelector('.balance-mobile-list').scrollIntoView()");await snap('balance-mobile-list');await evaluate("window.scrollTo(0,0)");await snap('balance-mobile-overview');
 await viewport(768);await snap('balance-tablet');await viewport(1440);
 await fill('select[aria-label="Тайлангийн ангилал"]','supplier');await wait("document.querySelector('.balance-detail-table')?.textContent.includes('Mike')");
 assert.ok(await evaluate("document.querySelector('.balance-detail-table').textContent.includes('Нийлүүлэгч')"));
 await snap('balance-suppliers');
 await evaluate("[...document.querySelectorAll('.balance-heading .ant-segmented-item')].find(e=>e.textContent==='Жагсаалт').click()");
 await wait("!document.querySelector('.balance-charts')");
 assert.ok(await evaluate("!!document.querySelector('.balance-detail-table')"));
 await evaluate("[...document.querySelectorAll('.balance-heading .ant-segmented-item')].find(e=>e.textContent==='График').click()");
 await wait("!document.querySelector('.balance-detail-table')&&!!document.querySelector('.balance-charts')");

 for(const label of ['Брэндээр','Нийлүүлэгчээр','Агуулахаар']){
  await evaluate(`(()=>{[...document.querySelectorAll('.balance-breakdown-control .ant-segmented-item')].find(e=>e.textContent===${JSON.stringify(label)}).click()})()`);
  await wait(`document.querySelector('.balance-category-list')?.closest('.ant-card').querySelector('.ant-card-head-title').textContent.includes(${JSON.stringify(label)})`);
 }
 await viewport(390);await evaluate("document.querySelector('.balance-breakdown-control').scrollIntoView()");await snap('warehouse-breakdown-mobile');await viewport(1440);
 await evaluate("document.querySelector('.balance-category-list .inventory-chart-link').click()");
 await wait("!!document.querySelector('.balance-detail-table')&&!document.querySelector('.balance-charts')");
 assert.equal(await evaluate("document.querySelector('select[aria-label=\"Агуулахаар шүүх\"]').value"),wh);
 assert.equal(evidence.errors.length,0,JSON.stringify(evidence.errors));
 evidence.checks={totals:true,groupedReport:true,viewModes:true,responsive:true};
 console.log('PASS: balance totals, grouped report, view modes and desktop/tablet/mobile layout.');

}finally{await writeFile(join(out,'evidence.json'),JSON.stringify(evidence,null,2));ws?.close();chrome?.kill();server.kill();}
