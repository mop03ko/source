import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {encode} from 'next-auth/jwt';
import assert from 'node:assert/strict';

// UI/UX evidence capture against a disposable local database; no production writes.
const dir=await mkdtemp(join(tmpdir(),'antmall-products-')),out=resolve('artifacts/inventory-ui-ux-fixes-2026-09-21');
await mkdir(out,{recursive:true});
const base='http://127.0.0.1:34682',secret=randomBytes(32).toString('base64');
const env={...process.env,AUTH_SECRET:secret,AUTH_URL:base,AUTH_TRUST_HOST:'true',AUTH_GOOGLE_ID:'test',AUTH_GOOGLE_SECRET:'test',CRM_OWNER_EMAIL:'owner@example.test',TURSO_DATABASE_URL:'file:'+join(dir,'test.db'),TURSO_AUTH_TOKEN:'',ANTMALL_SMS_API_KEY:'',CRM_GOOGLE_SERVICE_ACCOUNT_JSON:'',NEXT_TELEMETRY_DISABLED:'1'};delete env.VERCEL;
execFileSync(process.execPath,['scripts/migrate.mjs'],{env,stdio:'pipe'});
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','34682'],{env,stdio:'ignore',windowsHide:true});
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
 chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=9343','--user-data-dir='+join(dir,'chrome'),'about:blank'],{stdio:'ignore',windowsHide:true});
 let target;for(let i=0;i<50;i++){try{target=(await (await fetch('http://127.0.0.1:9343/json')).json()).find(t=>t.type==='page');if(target)break;}catch{}await pause(150);}
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

 evidence.views=[];

 for(const width of [1440,768,390]){
  await viewport(width);
  for(const tab of ['Бараа, үлдэгдэл','Үлдэгдлийн тайлан','Худалдан авалт','Борлуулалт','Хөдөлгөөн','Тооллого']){
   await click(tab,'[role=tab]');await pause(900);
   const slug=['items','balance','purchases','sales','moves','counts'][['Бараа, үлдэгдэл','Үлдэгдлийн тайлан','Худалдан авалт','Борлуулалт','Хөдөлгөөн','Тооллого'].indexOf(tab)];
   await snap(slug+'-'+width);
   evidence.views.push({tab,width,...await evaluate(`({text:document.querySelector('.inventory-panel').innerText,tables:[...document.querySelectorAll('.inventory-panel .table-scroll')].map(e=>({width:e.clientWidth,scroll:e.scrollWidth})),tabs:[...document.querySelectorAll('.inventory-tabs [role=tab]')].map(e=>({text:e.innerText,tabIndex:e.tabIndex,controls:e.getAttribute('aria-controls')}))})`)});
  }
 }
 await viewport(1440);await click('Бараа, үлдэгдэл','[role=tab]');await pause(500);
 await evaluate("document.querySelector('.inventory-tabs [role=tab]').focus()");
 await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});
 evidence.tabArrowFocus=await evaluate("document.activeElement.textContent");assert.ok(evidence.tabArrowFocus.endsWith('Үлдэгдлийн тайлан'));
 await click('Бараа, үлдэгдэл','[role=tab]');await pause(500);
 for(const [name,button,selector] of [
  ['item-form','Бараа нэмэх','.inventory-heading button'],
  ['warehouse-form','Агуулах / салбар нэмэх','[role=menuitem]'],
  ['import-form','Эхний үлдэгдэл импортлох','[role=menuitem]'],
  ['settings-form','Платформ / шимтгэл / данс','[role=menuitem]']
 ]){
  if(selector==='[role=menuitem]')await click('Агуулахын тохиргоо');
  if(button)await click(button,selector);else await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  await pause(400);await viewport(1440);await snap(name+'-1440');await viewport(390);await snap(name+'-390');
  evidence.views.push({name,text:await evaluate("document.querySelector('.ant-modal')?.innerText")});
  if(['item-form','sale-form','purchase-form','transfer-form'].includes(name))assert.ok(await evaluate("(()=>{const b=document.querySelector('.ant-modal-footer button[form]');const r=b?.getBoundingClientRect();return !!b.form&&r.top>=0&&r.bottom<=innerHeight})()"),'Save button stays visible and linked to form');
  await evaluate("document.querySelector('.ant-modal-close').click()");await pause(300);await viewport(1440);
 }
 for(const [tab,button,name] of [['Худалдан авалт','Худалдан авалт','purchase-form'],['Борлуулалт','Борлуулалт','sale-form'],['Хөдөлгөөн','Шилжүүлэх','transfer-form'],['Тооллого','Шинэ тооллого','count-form']]){
  await click(tab,'[role=tab]');await pause(500);
  await click(button,tab==='Тооллого'?'.table-toolbar button':'.inventory-commandbar button');
  await pause(400);await snap(name+'-1440');await viewport(390);await snap(name+'-390');
  evidence.views.push({name,text:await evaluate("document.querySelector('.ant-modal')?.innerText")});
  if(['item-form','sale-form','purchase-form','transfer-form'].includes(name))assert.ok(await evaluate("(()=>{const b=document.querySelector('.ant-modal-footer button[form]');const r=b?.getBoundingClientRect();return !!b.form&&r.top>=0&&r.bottom<=innerHeight})()"),'Save button stays visible and linked to form');
  await evaluate("document.querySelector('.ant-modal-close').click()");await pause(300);await viewport(1440);
 }

 await click('Худалдан авалт','[role=tab]');await pause(400);await click('Хүлээн авах','.inventory-panel button');await wait("!!document.querySelector('.ant-popconfirm')");
 await click('Цуцлах','.ant-popconfirm button');
 const purchases=await (await fetch(base+'/api/inventory?view=purchases',{headers})).json();assert.ok(purchases.items.some(p=>p.status==='ordered'),'Cancel receiving leaves order unchanged');
 evidence.receiveReview=true;
 await click('Тооллого','[role=tab]');await click('UX audit count','.lead-link');await wait("!!document.querySelector('.detail-body input[type=number]')");
 await snap('count-detail-1440');await viewport(390);await snap('count-detail-390');await viewport(1440);
 await click('Зөрүү хянах');await wait("!!document.querySelector('.ant-modal')");
 assert.equal(await evaluate("document.querySelector('.ant-modal-footer .ant-btn-primary').disabled"),true);
 await click('Буцах','.ant-modal button');
 await fill('.count-lines input[type=number]','0');await click('Зөрүү хянах');await snap('count-review');
 assert.equal(await evaluate("document.querySelector('.ant-modal-footer .ant-btn-primary').disabled"),false);
 await click('Буцах','.ant-modal button');assert.equal(await evaluate("document.querySelector('.count-lines input[type=number]').value"),'0');
 await click('Зөрүү хянах');await click('1 мөрийн зөрүүг баталгаажуулах','.ant-modal button');
 await wait("document.querySelector('.inventory-count-workspace')?.textContent.includes('Дууссан')");
 evidence.countReview=true;

 await evaluate("[...document.querySelectorAll('.ant-drawer-close')].at(-1).click()");await pause(300);await viewport(1440);
 await click('Календарь','.view-toggle button');await pause(700);await snap('count-calendar-1440');await viewport(390);await snap('count-calendar-390');
 await viewport(1440);await click('Бараа, үлдэгдэл','[role=tab]');await pause(500);
 await fill('input[aria-label="Бараа хайх"]','Grouped');await pause(500);
 await cdp('Page.reload');await wait("document.querySelector('input[aria-label=\"Бараа хайх\"]')?.value==='Grouped'");await wait("!!document.querySelector('.inventory-item-link')");
 evidence.restoredQuery=true;
 evidence.firstRow=await evaluate("({top:document.querySelector('.inventory-panel tbody tr.ant-table-row')?.getBoundingClientRect().top,viewport:innerHeight})");
 await evaluate("document.querySelector('.inventory-panel tbody tr.ant-table-row').scrollIntoView()");await snap('items-table-1440');await viewport(390);await snap('items-table-390');
 await viewport(1440);await evaluate("window.scrollTo(0,0)");
 await fill('input[aria-label="Бараа хайх"]','NO_MATCH_AUDIT');await pause(600);await snap('search-empty-1440');
 await cdp('Network.setBlockedURLs',{urls:['*api/inventory?view=products*']});
 await fill('input[aria-label="Бараа хайх"]','ERROR_AUDIT');await pause(700);await snap('search-error-1440');await cdp('Network.setBlockedURLs',{urls:[]});
 assert.equal(evidence.errors.length,0,JSON.stringify(evidence.errors));
 evidence.checks={sixTabsThreeWidths:true,eightFormsTwoWidths:true};
 console.log('PASS: six inventory tabs at three widths and eight forms at two widths; no page overflow or runtime exceptions.');
}finally{await writeFile(join(out,'evidence.json'),JSON.stringify(evidence,null,2));ws?.close();chrome?.kill();server.kill();}
