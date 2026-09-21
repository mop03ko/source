import {mkdir,mkdtemp,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {encode} from 'next-auth/jwt';
import {createClient} from '@libsql/client';
import assert from 'node:assert/strict';

// Local disposable fixtures only; production credentials and customer data are never used.
const dir=await mkdtemp(join(tmpdir(),'antmall-full-ux-'));
const out=resolve('artifacts/full-ui-ux-probes-2026-09-21-fixed');
await mkdir(out,{recursive:true});
const base='http://127.0.0.1:34677',secret=randomBytes(32).toString('base64');
const env={...process.env,AUTH_SECRET:secret,AUTH_URL:base,AUTH_TRUST_HOST:'true',AUTH_GOOGLE_ID:'ux-test',AUTH_GOOGLE_SECRET:'ux-test',CRM_OWNER_EMAIL:'owner@example.test',TURSO_DATABASE_URL:'file:'+join(dir,'test.db'),TURSO_AUTH_TOKEN:'',ANTMALL_SMS_API_KEY:'',CRM_GOOGLE_SERVICE_ACCOUNT_JSON:'',NEXT_TELEMETRY_DISABLED:'1'};
delete env.VERCEL;
execFileSync(process.execPath,['scripts/migrate.mjs'],{env,stdio:'pipe'});
console.log('Temporary database migrated');
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','34677'],{env,stdio:'ignore',windowsHide:true});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
let chrome,ws,db;
const evidence={screens:[],checks:{},errors:[]};
try{
 for(let i=0;i<80;i++){try{await fetch(base+'/login',{signal:AbortSignal.timeout(2000)});break;}catch{await pause(150);}}
 console.log('Local server ready');
 const token=await encode({secret,salt:'authjs.session-token',token:{sub:'google:owner',email:'owner@example.test',name:'Туршилтын админ'},maxAge:3600});
 const r=await fetch(base+'/api/crm',{headers:{cookie:'authjs.session-token='+token},signal:AbortSignal.timeout(10000)});
 if(!r.ok)throw new Error('Local fixture bootstrap failed: '+r.status);
 console.log('Local owner bootstrapped');
 db=createClient({url:env.TURSO_DATABASE_URL});
 const now=new Date().toISOString();
 for(const [email,name,role] of [['agent@example.test','Борлуулалтын ажилтан','agent'],['marketing@example.test','Маркетингийн ажилтан','marketing'],['it@example.test','IT ажилтан','it']])await db.execute({sql:'INSERT INTO members(email,name,role,active,last_seen) VALUES(?,?,?,1,?)',args:[email,name,role,now]});
 await db.execute("INSERT INTO app_settings(key,value,updated_at) VALUES('notification_sound','none',datetime('now')) ON CONFLICT(key) DO UPDATE SET value='none'");
 const statuses=['new','contacted','materials','pending','appointment','unreachable','won','lost','review'];
 for(let i=0;i<18;i++)await db.execute({sql:'INSERT INTO leads(id,name,phone,product,source,owner,status,next_at,next_action,created_at,updated_at,op) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',args:['ux-'+i,['Туршилтын харилцагч Бат','Туршилтын харилцагч Саруул','Урт нэртэй туршилтын байгууллага ХХК'][i%3],String(99000000+i),'Dell Pro 14 — зөөврийн компьютер','Facebook',i%3?'owner@example.test':'agent@example.test',statuses[i%9],new Date(Date.now()+(i<6?-3600000:3600000)).toISOString(),'Зээлийн нөхцөл тайлбарлаж, материал бүрдүүлэх',now,now,'ux-op-'+i]});
 for(let i=0;i<4;i++){
 await db.execute({sql:'INSERT INTO marketing_tasks(id,title,channel,budget,owner,status,due_at,note,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',args:['ux-m-'+i,'Туршилт: намрын бүтээгдэхүүний сурталчилгаа '+(i+1),'Facebook',500000+i*100000,'marketing@example.test','planned',now,'Туршилтын өгөгдөл','owner@example.test',now,now]});
 await db.execute({sql:'INSERT INTO it_tasks(id,title,system_area,owner,status,due_at,note,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)',args:['ux-it-'+i,'Туршилт: сайтын сайжруулалт '+(i+1),'Вэбсайт','it@example.test','planned',now,'Туршилтын өгөгдөл','owner@example.test',now,now]});
 }
 console.log('Fixtures populated');
 chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=9338','--user-data-dir='+join(dir,'chrome'),'about:blank'],{stdio:'ignore',windowsHide:true});
 let target;
 for(let i=0;i<40;i++){try{target=(await (await fetch('http://127.0.0.1:9338/json',{signal:AbortSignal.timeout(500)})).json()).find(t=>t.type==='page');if(target)break;}catch{}await pause(150);}
 if(!target)throw new Error('Headless Chrome did not start');
 ws=new WebSocket(target.webSocketDebuggerUrl);
 await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
 let seq=0,dialogAnswer=false;const pending=new Map();
 evidence.checks.dialogs=[];
 ws.onmessage=event=>{const v=JSON.parse(event.data);if(v.id){const p=pending.get(v.id);if(p){pending.delete(v.id);v.error?p.reject(new Error(v.error.message)):p.resolve(v.result);}}else if(v.method==='Runtime.exceptionThrown')evidence.errors.push(v.params.exceptionDetails.exception?.description||v.params.exceptionDetails.text);else if(v.method==='Page.javascriptDialogOpening'){evidence.checks.dialogs.push({type:v.params.type,accepted:dialogAnswer});void cdp('Page.handleJavaScriptDialog',{accept:dialogAnswer});}};
 const cdp=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;const timer=setTimeout(()=>{pending.delete(id);reject(new Error('CDP timeout: '+method));},20000);pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});ws.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>{const v=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(v.exceptionDetails)throw new Error(v.exceptionDetails.text+': '+v.result.description);return v.result.value;};
 const click=async(text,selector='button')=>{const pos=await evaluate(`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.textContent.trim()===${JSON.stringify(text)}||[...e.querySelectorAll('span')].some(s=>s.textContent===${JSON.stringify(text)}));if(!e)return null;e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);if(!pos)throw new Error('Missing button: '+text);await cdp('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...pos});await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...pos});await pause(650);};
 const viewport=async(width,height=1000)=>{await cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await pause(250);};
 const snap=async name=>{
  await pause(250);
  const metrics=await evaluate(`(()=>{const visible=e=>!!(e.getClientRects().length);const box=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return {text:e.textContent.trim().slice(0,90),x:r.x,y:r.y,width:r.width,height:r.height,font:s.fontSize,color:s.color,background:s.backgroundColor,display:s.display,flexDirection:s.flexDirection}};return {url:location.href,viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth,headings:[...document.querySelectorAll('h1,h2')].filter(visible).map(e=>e.textContent),primary:[...document.querySelectorAll('button.primary')].filter(visible).slice(0,5).map(box),smallText:[...document.querySelectorAll('th,small,.muted,.form-help')].filter(visible).slice(0,15).map(box),tabs:[...document.querySelectorAll('[role=tablist]')].filter(visible).map(box),chat:[...document.querySelectorAll('.chat-layout,.chat-list,.chat-thread,.chat-composer')].filter(visible).map(box),calendarMore:[...document.querySelectorAll('.month-cal-more')].map(e=>({text:e.textContent,tag:e.tagName,tabIndex:e.tabIndex})),smallTargets:[...document.querySelectorAll('button,a,input,select')].filter(visible).filter(e=>{const r=e.getBoundingClientRect();return r.width<24||r.height<24}).slice(0,12).map(box)}})()`);
  const shot=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  await writeFile(join(out,name+'.png'),Buffer.from(shot.data,'base64'));
  evidence.screens.push({name,...metrics});console.log('Captured '+name);
 };
 const axeSource=await readFile('node_modules/axe-core/axe.min.js','utf8');
 evidence.commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();evidence.axeVersion=JSON.parse(await readFile('node_modules/axe-core/package.json','utf8')).version;evidence.accessibility=[];evidence.scanFailures=[];
 const post=async(path,action,data)=>{const r=await fetch(base+path,{method:'POST',headers:{cookie:'authjs.session-token='+token,Origin:base,'Content-Type':'application/json'},body:JSON.stringify({action,data})});const j=await r.json();if(!r.ok)throw new Error(JSON.stringify(j));return j;};
 const wh=(await post('/api/inventory','create_warehouse',{name:'Туршилтын төв агуулах'})).id;
 const item=(await post('/api/inventory','create_item',{code:'UX-FULL-256',name:'Туршилтын зөөврийн компьютер урт нэртэй загвар',brand:'Dell',sale_price:2500000})).id;
 await post('/api/inventory','record_purchase',{item_id:item,warehouse_id:wh,qty:5,unit_cost:1500000,status:'received'});
 for(const person of ['Туршилтын админ','Борлуулалтын ажилтан'])await post('/api/schedule','set_shift',{person_name:person,day:new Date(Date.now()+8*3600000).toISOString().slice(0,10),assignment:'Хүргэлт'});
 await post('/api/deliveries','create',{delivered_on:new Date(Date.now()+8*3600000).toISOString().slice(0,10),kind:'24 цаг',item_info:'Урт нэртэй барааны хүргэлт',customer_phone:'99001122',address:'Баянзүрх дүүрэг, урт хаягтай туршилтын байр, 120 тоот',courier_email:'agent@example.test',status:'pending'});
 await cdp('Runtime.enable');await cdp('Page.enable');await cdp('Network.enable');
 await cdp('Network.setCookie',{name:'authjs.session-token',value:token,url:base,httpOnly:true,sameSite:'Lax'});
 async function inspect(name){
  await snap(name);
  await evaluate(axeSource);
  const result=await evaluate("axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa','best-practice']}}).then(r=>({violations:r.violations.map(v=>({id:v.id,impact:v.impact,description:v.description,help:v.help,helpUrl:v.helpUrl,nodes:v.nodes.map(n=>({target:n.target,html:n.html,failureSummary:n.failureSummary,any:n.any.map(c=>({id:c.id,data:c.data,message:c.message}))}))})),incomplete:r.incomplete.map(v=>({id:v.id,count:v.nodes.length})),passes:r.passes.length}))");
  evidence.accessibility.push({name,...result});
  const metrics=await evaluate(`(()=>{const visible=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>2&&r.height>2&&s.visibility!=='hidden'&&s.display!=='none'&&!e.closest('[aria-hidden=true]')};const targets=[...document.querySelectorAll('button,a,[role=tab],[role=combobox]')].filter(visible);return {unnamed:targets.filter(e=>!(e.textContent.trim()||e.getAttribute('aria-label')||e.getAttribute('aria-labelledby')||e.getAttribute('title'))).map(e=>e.outerHTML.slice(0,400)),smallTargets:targets.filter(e=>{const r=e.getBoundingClientRect();return r.width<24||r.height<24}).map(e=>({text:e.textContent.trim().slice(0,60),aria:e.getAttribute('aria-label'),width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height})).slice(0,30),firstContentY:document.querySelector('.schedule-person-card,.lead-row,.inventory-item-link,.ant-table-tbody tr,.chat-peer')?.getBoundingClientRect().top??null,bodyText:document.querySelector('main')?.innerText.slice(0,700)}})()`);
  evidence.accessibility.at(-1).metrics=metrics;
  await writeFile(join(out,'evidence.json'),JSON.stringify(evidence,null,2));
 }
 const load=async view=>{await cdp('Page.navigate',{url:base+'/?view='+view});await pause(1200);for(let i=0;i<30;i++){if(await evaluate("!!document.querySelector('.nav-button')&&!document.querySelector('.loading')"))break;await pause(150);}};
 await post('/api/inventory','record_purchase',{item_id:item,warehouse_id:wh,qty:200,unit_cost:1500000,status:'received'});
 for(let i=0;i<101;i++)await post('/api/inventory','record_sale',{item_id:item,warehouse_id:wh,qty:1,unit_price:2500000,seller:'owner@example.test',customer_name:'Хуудаслалтын туршилт '+i,units:[{serial:'UX-FULL-SERIAL-'+i}]});
 await viewport(1440);await load('direct');await inspect('direct-101-desktop');
 const sales=await(await fetch(base+'/api/inventory?view=sales&seller=__direct__',{headers:{cookie:'authjs.session-token='+token}})).json();
 evidence.checks.pagination={apiCount:sales.count,apiRows:sales.items.length,visibleRows:await evaluate("document.querySelectorAll('.ant-table-tbody tr').length"),buttons:await evaluate("[...document.querySelectorAll('.table-panel button')].map(e=>e.textContent.trim())")};
 assert.equal(sales.count,101);
 assert.equal(evidence.checks.pagination.visibleRows,50);
 const pageRows=[];
 for(const pageNumber of [2,3]){
  await click(String(pageNumber),'.ant-pagination-item');
  for(let i=0;i<30;i++){if(await evaluate("!!document.querySelector('.ant-table-tbody tr')"))break;await pause(100);}
  pageRows.push(await evaluate("[...document.querySelectorAll('.ant-table-tbody tr')].map(e=>e.textContent)"));
 }
 assert.equal(pageRows[0].length,50);assert.equal(pageRows[1].length,1);
 assert.equal(new Set(pageRows.flat()).size,51);
 evidence.checks.pagination.pageRows=pageRows.map(rows=>rows.length);
 await evaluate("(()=>{const e=document.querySelector('.search input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'NO-MATCH-UX');e.dispatchEvent(new Event('input',{bubbles:true}));})()");await pause(600);
 assert.equal(await evaluate("document.querySelectorAll('.ant-table-tbody tr').length"),0);
 await evaluate("(()=>{const e=document.querySelector('.search input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'');e.dispatchEvent(new Event('input',{bubbles:true}));})()");await pause(600);
 assert.equal(await evaluate("document.querySelector('.ant-pagination-item-active')?.textContent"),'1');
 evidence.checks.pagination.filterResetsPage=true;
 const timed=await post('/api/inventory','record_sale',{item_id:item,warehouse_id:wh,qty:1,unit_price:2500000,seller:'owner@example.test',customer_name:'Шөнийн борлуулалтын туршилт',sold_at:'2026-09-20T18:30:00.000Z',units:[{serial:'UX-NIGHT-SALE'}]});
 await load('direct');
 // Use the exact fixture as the sole result so its date can be inspected independently of pagination.
 await db.execute({sql:'UPDATE inventory_sales SET seller=? WHERE id!=?',args:['agent@example.test',timed.id]});
 await load('direct');await evaluate("(()=>{const e=document.querySelector('select[aria-label=\"Зарсан ажилтнаар шүүх\"]');e.value='owner@example.test';e.dispatchEvent(new Event('change',{bubbles:true}));})()");await pause(500);
 evidence.checks.saleDate={utc:'2026-09-20T18:30:00.000Z',expectedUlaanbaatar:'2026-09-21',displayed:await evaluate("document.querySelector('.ant-table-tbody tr td')?.textContent")};
 assert.match(evidence.checks.saleDate.displayed,/2026-09-21 02:30/);
 await inspect('direct-timezone');await viewport(320);await inspect('direct-populated-mobile');
 await viewport(1440);await load('all');await click('Шинэ хүсэлт');
 const serialise="JSON.stringify([...new FormData(document.querySelector('[role=dialog] form')).entries()])";
 const before=await evaluate(serialise);
 await evaluate("(()=>{const e=document.querySelector('[role=dialog] .ant-select input');e.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'Туршилт хайх');e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()");await pause(300);
 evidence.checks.selectSearchDraft={before,after:await evaluate(serialise),dirty:await evaluate("!!document.querySelector('[role=dialog] .draft-hint')")};
 assert.equal(evidence.checks.selectSearchDraft.dirty,false);assert.equal(evidence.checks.selectSearchDraft.before,evidence.checks.selectSearchDraft.after);
 await inspect('select-search-draft');
 assert.deepEqual(evidence.accessibility.at(-1).violations.filter(v=>['aria-valid-attr-value','aria-required-children'].includes(v.id)),[]);
 // Clearing the transient search and selecting a business value must still mark the form dirty.
 await evaluate("(()=>{const e=document.querySelector('[role=dialog] .ant-select input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'');e.dispatchEvent(new Event('input',{bubbles:true}));})()");await pause(250);
 await evaluate("(()=>{const e=document.querySelector('[role=dialog] select');e.value=[...e.options].find(o=>o.value!==e.value&&!o.disabled).value;e.dispatchEvent(new Event('change',{bubbles:true}));})()");await pause(250);
 assert.equal(await evaluate("!!document.querySelector('[role=dialog] .draft-hint')"),true);
 evidence.checks.selectSearchDraft.selectionMarksDirty=true;
 dialogAnswer=true;await evaluate("document.querySelector('[data-slot=dialog-close]').click()");await pause(500);
 for(const [view,label] of [['direct','Борлуулалт бүртгэх'],['inventory','Бараа нэмэх']]){try{await load(view);await click(label);await inspect(view+'-form-desktop');await viewport(390);await inspect(view+'-form-mobile');await viewport(1440);}catch(error){evidence.scanFailures.push({view,error:String(error)});}}
 console.log('Probe evidence',JSON.stringify(evidence.checks));
}finally{await writeFile(join(out,'evidence.json'),JSON.stringify(evidence,null,2));ws?.close();chrome?.kill();server.kill();db?.close();}
