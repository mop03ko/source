import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {encode} from 'next-auth/jwt';
import assert from 'node:assert/strict';

// Disposable local database. Optional argv[2] exercises the supplied workbook in the browser.
const dir=await mkdtemp(join(tmpdir(),'antmall-inventory-')),out=resolve('artifacts/inventory-audit');
await mkdir(out,{recursive:true});
const base='http://127.0.0.1:34673',secret=randomBytes(32).toString('base64');
const env={...process.env,AUTH_SECRET:secret,AUTH_URL:base,AUTH_TRUST_HOST:'true',AUTH_GOOGLE_ID:'test',AUTH_GOOGLE_SECRET:'test',CRM_OWNER_EMAIL:'owner@example.test',TURSO_DATABASE_URL:'file:'+join(dir,'test.db'),TURSO_AUTH_TOKEN:'',ANTMALL_SMS_API_KEY:'',CRM_GOOGLE_SERVICE_ACCOUNT_JSON:'',NEXT_TELEMETRY_DISABLED:'1'};delete env.VERCEL;
execFileSync(process.execPath,['scripts/migrate.mjs'],{env,stdio:'pipe'});
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','34673'],{env,stdio:'ignore',windowsHide:true});
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
 const item=(await post('create_item',{code:'UI-TEST-256',name:'Туршилтын утас',brand:'SearchBrand',category:'Гар утас',supplier:'Туршилтын нийлүүлэгч',variant:'Тусгай хувилбар',capacity:'256GB',color:'Silver',sale_price:2000000,cash_price:1800000,min_stock:2})).id;
 for(const q of ['SearchBrand','256GB','Silver','Тусгай хувилбар']){
  const result=await (await fetch(base+'/api/inventory?view=items&q='+encodeURIComponent(q),{headers})).json();
  assert.equal(result.items[0]?.id,item,'Search field: '+q);
 }
 evidence.checks.productSearch=true;
 await post('record_purchase',{item_id:item,warehouse_id:wh,qty:5,unit_cost:1000000.25,additional_cost:25000,status:'received'});
 await post('record_sale',{item_id:item,warehouse_id:wh,qty:1,unit_price:2000000,platform:'STOREPAY',bill_number:'TEST-BILL'});
 chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=9334','--user-data-dir='+join(dir,'chrome'),'about:blank'],{stdio:'ignore',windowsHide:true});
 let target;for(let i=0;i<50;i++){try{target=(await (await fetch('http://127.0.0.1:9334/json')).json()).find(t=>t.type==='page');if(target)break;}catch{}await pause(150);}
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
 await cdp('Page.navigate',{url:base});await wait("!!document.querySelector('.nav-button')");await pause(1200);await click('Агуулах','.nav-button');await wait("!!document.querySelector('.inventory-item-link')");
 await snap('01-stock-desktop');await click('Туршилтын утасUI-TEST-256','.inventory-item-link');await wait("!!document.querySelector('.detail-body .sync-summary')");
 assert.ok(await evaluate("document.querySelector('.detail-body').textContent.includes('Туршилтын нийлүүлэгч')"));
 assert.ok(await evaluate("document.querySelector('.detail-body').textContent.includes('Тусгай хувилбар')"));
 await click('Мэдээлэл засах');await wait("!!document.querySelector('input[name=sale_price]')");
 await viewport(390);await snap('product-form-mobile');await viewport(1440);
 await fill('input[name=sale_price]','');
 assert.equal(await evaluate("document.querySelector('input[name=sale_price]').checkValidity()"),false);
 assert.equal(await evaluate("document.querySelector('select[name=category]').value"),'Гар утас');await fill('select[name=category]','Таблет');await fill('input[name=sale_price]','2100000');await fill('input[name=supplier]','Шинэ нийлүүлэгч');
 await click('Бараа хадгалах');await wait("!document.querySelector('input[name=sale_price]')");
 await wait("document.querySelector('.detail-body')?.textContent.includes('Шинэ нийлүүлэгч')");
 const updated=await (await fetch(base+'/api/inventory?view=items&id='+item,{headers})).json();
 assert.equal(updated.item.category,'Таблет');assert.equal(updated.item.sale_price,2100000);assert.equal(updated.item.stock,4);assert.equal(updated.item.supplier,'Шинэ нийлүүлэгч');
 evidence.checks.productEditPreservesStock=true;await snap('detail-edited');
 await viewport(390);await snap('product-detail-mobile');await viewport(1440);
 await click('Зарлага бүртгэх');await wait("!!document.querySelector('select[name=warehouse_id]')");assert.equal(await evaluate("document.querySelector('input[name=unit]').value"),'1800000');await fill('select[name=platform]','STOREPAY');assert.equal(await evaluate("document.querySelector('input[name=unit]').value"),'2100000');await fill('select[name=platform]','');assert.equal(await evaluate("document.querySelector('input[name=unit]').value"),'1800000');evidence.checks.cashCreditPrices=true;await fill('select[name=warehouse_id]',wh);await wait("document.querySelector('.inventory-stock-note')?.textContent.includes('4 ш')");
 evidence.checks.detailSale=true;await snap('02-sale-dialog');await evaluate("document.querySelector('[data-slot=dialog-close]').click()");await pause(500);await evaluate("document.querySelector('.ant-drawer-close').click()");await pause(200);
 await click('Борлуулалт','[role=tab]');await wait("document.querySelector('.inventory-panel')?.textContent.includes('TEST-BILL')");await snap('03-sales-profit');
 await click('Үлдэгдлийн тайлан','[role=tab]');await wait("!!document.querySelector('.inventory-item-link')");await snap('04-balance');
 await viewport(390);await snap('05-balance-mobile');await click('Бараа, үлдэгдэл','[role=tab]');await wait("!!document.querySelector('.inventory-item-link')");await snap('06-stock-mobile');await viewport(1440);
 await fill('select[aria-label="Нийлүүлэгчээр шүүх"]','Шинэ нийлүүлэгч');
 await wait("!!document.querySelector('.inventory-item-link')");
 await fill('select[aria-label="Тайлангийн ангилал"]','supplier');
 await wait("document.querySelector('.inventory-panel table')?.textContent.includes('Шинэ нийлүүлэгч')");
 assert.equal(await evaluate("document.querySelectorAll('.inventory-panel tbody tr').length"),1);
 await snap('supplier-report');await viewport(390);await snap('supplier-report-mobile');await viewport(1440);
 await fill('select[aria-label="Ангиллаар шүүх"]','Таблет');
 await fill('select[aria-label="Тайлангийн ангилал"]','category');
 await wait("document.querySelector('.inventory-panel table')?.textContent.includes('Таблет')");
 assert.equal(await evaluate("document.querySelectorAll('.inventory-panel tbody tr').length"),1);
 await snap('category-report');evidence.checks.categories=true;
 await fill('select[aria-label="Тайлангийн ангилал"]','brand');
 await wait("document.querySelector('.inventory-panel table')?.textContent.includes('SearchBrand')");
 await click('Борлуулалт','[role=tab]');
 await wait("document.querySelector('.inventory-panel table')?.textContent.includes('SearchBrand')");
 await snap('brand-sales-report');
 await fill('select[aria-label="Тайлангийн ангилал"]','');await click('Бараа, үлдэгдэл','[role=tab]');await click('Шүүлтүүр цэвэрлэх');
 await wait("!!document.querySelector('.inventory-item-link')");evidence.checks.brandSupplierReports=true;
 if(process.argv[2]){
  await click('Excel импорт');await wait("!!document.querySelector('input[type=file]')");
  const root=await cdp('DOM.getDocument');const node=await cdp('DOM.querySelector',{nodeId:root.root.nodeId,selector:'input[type=file]'});
  await cdp('DOM.setFileInputFiles',{nodeId:node.nodeId,files:[resolve(process.argv[2])]});
  await wait("document.querySelector('[role=dialog]')?.textContent.includes('3096 мөр импортод бэлэн')");
  assert.ok(await evaluate("document.querySelector('[role=dialog]').textContent.includes('19 мөр импортод орохгүй')"));
  assert.equal(await evaluate("document.querySelector('input[type=datetime-local]').value"),'2026-09-18T23:59');
  await evaluate("document.querySelector('.inventory-import-warnings input').click()");await click('Импортын зөрчил шалгах');
  await wait("[...document.querySelectorAll('button')].some(b=>b.textContent==='3096 бараа импортлох')");await snap('07-workbook-preview');
  await click('3096 бараа импортлох');await wait("!document.querySelector('[role=dialog]')");
  const data=await (await fetch(base+'/api/inventory?view=items',{headers})).json();
  assert.equal(data.count,3097);assert.equal(data.summary.units,1528);evidence.checks.workbook={imported:3096,excluded:19,units:1524};await snap('08-imported-stock');
 }
 await cdp('Page.navigate',{url:base+'/?view=direct'});await wait("[...document.querySelectorAll('button')].some(b=>b.textContent==='Борлуулалт бүртгэх')");
 await click('Борлуулалт бүртгэх');await wait("!!document.querySelector('input[placeholder=\"Код, IMEI эсвэл нэр бичнэ үү\"]')");
 await fill('input[placeholder="Код, IMEI эсвэл нэр бичнэ үү"]','UI-TEST-256');await wait("!!document.querySelector('.inventory-picker button')");await evaluate("document.querySelector('.inventory-picker button').click()");await pause(300);
 assert.equal(await evaluate("document.querySelector('input[aria-label=\"Нэгжийн үнэ *\"]').value"),'1800000');
 await fill('select[name=platform]','STOREPAY');assert.equal(await evaluate("document.querySelector('input[aria-label=\"Нэгжийн үнэ *\"]').value"),'2100000');
 await fill('select[name=platform]','');assert.equal(await evaluate("document.querySelector('input[aria-label=\"Нэгжийн үнэ *\"]').value"),'1800000');
 evidence.checks.directCashCreditPrices=true;await snap('direct-sale-pricing');
 assert.equal(evidence.errors.length,0,JSON.stringify(evidence.errors));
 evidence.checks.runtimeErrors=0;console.log('PASS: warehouse desktop/mobile, detail-sale workflow, profit/balance and optional XLSX import.');
}finally{await writeFile(join(out,'evidence.json'),JSON.stringify(evidence,null,2));ws?.close();chrome?.kill();server.kill();}
