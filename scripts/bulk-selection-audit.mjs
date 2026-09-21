import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {encode} from 'next-auth/jwt';
import assert from 'node:assert/strict';

// Disposable local database. Optional argv[2] exercises the supplied workbook in the browser.
const dir=await mkdtemp(join(tmpdir(),'antmall-inventory-')),out=resolve('artifacts/bulk-selection');
await mkdir(out,{recursive:true});
const base='http://127.0.0.1:34679',secret=randomBytes(32).toString('base64');
const env={...process.env,AUTH_SECRET:secret,AUTH_URL:base,AUTH_TRUST_HOST:'true',AUTH_GOOGLE_ID:'test',AUTH_GOOGLE_SECRET:'test',CRM_OWNER_EMAIL:'owner@example.test',TURSO_DATABASE_URL:'file:'+join(dir,'test.db'),TURSO_AUTH_TOKEN:'',ANTMALL_SMS_API_KEY:'',CRM_GOOGLE_SERVICE_ACCOUNT_JSON:'',NEXT_TELEMETRY_DISABLED:'1'};delete env.VERCEL;
execFileSync(process.execPath,['scripts/migrate.mjs'],{env,stdio:'pipe'});
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','34679'],{env,stdio:'ignore',windowsHide:true});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
let chrome,ws;const evidence={checks:{},screens:[],errors:[]};
try{
 for(let i=0;i<80;i++){try{await fetch(base+'/login',{signal:AbortSignal.timeout(1000)});break;}catch{await pause(150);}}
 const token=await encode({secret,salt:'authjs.session-token',token:{sub:'google:owner',email:'owner@example.test',name:'Inventory test'},maxAge:3600});
 const headers={cookie:'authjs.session-token='+token,Origin:base,'Content-Type':'application/json'};
 assert.equal((await fetch(base+'/api/crm',{headers})).status,200);
 const post=async(action,data,id)=>{const r=await fetch(base+'/api/inventory',{method:'POST',headers,body:JSON.stringify({action,data,id})});const value=await r.json();assert.equal(r.status,200,JSON.stringify(value));return value;};
 const wh=(await post('create_warehouse',{name:'Туршилтын агуулах'})).id;
 await post('create_warehouse',{name:'Туршилтын салбар'});
 const item=(await post('create_item',{code:'UI-TEST-256',name:'Туршилтын утас',brand:'SearchBrand',supplier:'Туршилтын нийлүүлэгч',variant:'Тусгай хувилбар',capacity:'256GB',color:'Silver',sale_price:2000000,cash_price:1800000,min_stock:2})).id;
 for(const q of ['SearchBrand','256GB','Silver','Тусгай хувилбар']){
  const result=await (await fetch(base+'/api/inventory?view=items&q='+encodeURIComponent(q),{headers})).json();
  assert.equal(result.items[0]?.id,item,'Search field: '+q);
 }
 evidence.checks.productSearch=true;
 await post('record_purchase',{item_id:item,warehouse_id:wh,qty:5,unit_cost:1000000.25,additional_cost:25000,status:'received'});
 await post('record_sale',{item_id:item,warehouse_id:wh,qty:1,unit_price:2000000,platform:'STOREPAY',bill_number:'TEST-BILL'});
 chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=9340','--user-data-dir='+join(dir,'chrome'),'about:blank'],{stdio:'ignore',windowsHide:true});
 let target;for(let i=0;i<50;i++){try{target=(await (await fetch('http://127.0.0.1:9340/json')).json()).find(t=>t.type==='page');if(target)break;}catch{}await pause(150);}
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

 for(let i=0;i<50;i++)await post('create_item',{code:'BULK-'+i,name:'Bulk item '+String(i).padStart(2,'0'),sale_price:100});
 for(let i=0;i<51;i++){
  const response=await fetch(base+'/api/crm',{method:'POST',headers,body:JSON.stringify({action:'create',data:{name:'Bulk lead '+String(i).padStart(2,'0'),phone:String(99130000+i),product:'Phone',source:'Facebook',owner:'owner@example.test',status:'new',next_at:new Date().toISOString(),next_action:'Call'}})});
  assert.equal(response.status,200);
 }
 const navigate=async view=>{await cdp('Page.navigate',{url:base+'/?view='+view});await wait("document.querySelectorAll('tbody :is(.selection-cell,.ant-table-selection-column) input').length===50&&!document.querySelector('tbody :is(.selection-cell,.ant-table-selection-column) input').disabled");};
 const count=()=>evaluate("document.querySelectorAll('tbody :is(.selection-cell,.ant-table-selection-column) input:checked').length");
 const check=async selector=>{await wait(`!document.querySelector(${JSON.stringify(selector)}).disabled`);await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);await pause(150);await wait("!document.querySelector('tbody :is(.selection-cell,.ant-table-selection-column) input').disabled");};
 const selectedExport=async()=>{
  await evaluate("window.__csv='';window.__oldBlob=URL.createObjectURL;URL.createObjectURL=b=>{window.__csvPromise=b.text().then(t=>window.__csv=t);return window.__oldBlob(b)};window.__oldAnchor=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(!this.download)window.__oldAnchor.call(this)};");
  await click('Сонгосныг CSV татах');await evaluate('window.__csvPromise');
  const csv=await evaluate('window.__csv');assert.equal(csv.trim().split(/\r?\n/).length,3,'Export exactly two selected records');
  await evaluate('URL.createObjectURL=window.__oldBlob;HTMLAnchorElement.prototype.click=window.__oldAnchor;');
 };
 for(const view of ['inventory','all']){
  await navigate(view);assert.equal(await count(),0);
  await check('tbody tr:nth-child(1 of :not(.ant-table-measure-row)) :is(.selection-cell,.ant-table-selection-column) input');await check('tbody tr:nth-child(2 of :not(.ant-table-measure-row)) :is(.selection-cell,.ant-table-selection-column) input');assert.equal(await count(),2);
  assert.ok(await evaluate("!!document.querySelector('thead .ant-checkbox-indeterminate')"));
  assert.equal(await evaluate("document.querySelectorAll('.ant-drawer-open').length"),0,'Selecting must not open detail');
  await selectedExport();
  await check('thead :is(.selection-cell,.ant-table-selection-column) input');assert.equal(await count(),50);
  await check('button[title="Шинэчлэх"]');assert.equal(await count(),50,'Refreshing identical rows preserves selection');
  await evaluate("document.querySelector('.ant-pagination-item-2').click()");await wait("document.querySelectorAll('tbody :is(.selection-cell,.ant-table-selection-column) input').length===1&&!document.querySelector('tbody :is(.selection-cell,.ant-table-selection-column) input').disabled");assert.equal(await count(),0);
  await check('tbody :is(.selection-cell,.ant-table-selection-column) input');assert.equal(await count(),1);
  await evaluate("document.querySelector('.ant-pagination-item-1').click()");await wait("document.querySelectorAll('tbody :is(.selection-cell,.ant-table-selection-column) input').length===50&&!document.querySelector('tbody :is(.selection-cell,.ant-table-selection-column) input').disabled");assert.equal(await count(),0,'Page one must not restore old selections');
  await evaluate("document.querySelector('tbody :is(.selection-cell,.ant-table-selection-column) input').focus()");
  await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32});await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32});await pause(150);assert.equal(await count(),1,'Keyboard Space selects a row');
  const selector=view==='inventory'?'input[aria-label="Бараа хайх"]':'input[aria-label="Хүсэлт хайх"]';
  await fill(selector,view==='inventory'?'BULK-49':'99130000');await wait("document.querySelectorAll('tbody :is(.selection-cell,.ant-table-selection-column) input').length===1&&!document.querySelector('tbody :is(.selection-cell,.ant-table-selection-column) input').disabled");assert.equal(await count(),0,'Filter resets selection');
  await check('thead :is(.selection-cell,.ant-table-selection-column) input');await click('Сонголт цэвэрлэх');assert.equal(await count(),0);
  await fill(selector,'');await wait("document.querySelectorAll('tbody :is(.selection-cell,.ant-table-selection-column) input').length===50&&!document.querySelector('tbody :is(.selection-cell,.ant-table-selection-column) input').disabled");assert.equal(await count(),0);
  await snap(view+'-desktop');await viewport(390);
  if(view==='inventory'){await wait("!!document.querySelector('.inventory-card-title input')");await evaluate("document.querySelector('.inventory-card-title input').click()");await pause(200);assert.equal(await evaluate("document.querySelectorAll('.inventory-card-title input:checked').length"),1);}
  else{await check('tbody :is(.selection-cell,.ant-table-selection-column) input');assert.equal(await count(),1);}
  await snap(view+'-mobile');await viewport(1440);
  evidence.checks[view]={selectedExport:true,selectPage:true,pageAndFilterReset:true,keyboard:true,mobile:true};
 }
 assert.equal(evidence.errors.length,0,JSON.stringify(evidence.errors));
 console.log('PASS: inventory/lead bulk selection, mixed state, 50-row page boundaries, no restored stale selection, filter reset, selected CSV export, keyboard and mobile.');
}finally{await writeFile(join(out,'evidence.json'),JSON.stringify(evidence,null,2));ws?.close();chrome?.kill();server.kill();}
