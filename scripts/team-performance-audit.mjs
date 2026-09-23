import {DatabaseSync} from 'node:sqlite';
import {mkdir,mkdtemp,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {encode} from 'next-auth/jwt';
import assert from 'node:assert/strict';

// Disposable local database. Optional argv[2] exercises the supplied workbook in the browser.
const dir=await mkdtemp(join(tmpdir(),'antmall-products-')),out=resolve('artifacts/team-performance-audit');
await mkdir(out,{recursive:true});
const base='http://127.0.0.1:34687',secret=randomBytes(32).toString('base64');
const env={...process.env,AUTH_SECRET:secret,AUTH_URL:base,AUTH_TRUST_HOST:'true',AUTH_GOOGLE_ID:'test',AUTH_GOOGLE_SECRET:'test',CRM_OWNER_EMAIL:'owner@example.test',TURSO_DATABASE_URL:'file:'+join(dir,'test.db'),TURSO_AUTH_TOKEN:'',ANTMALL_SMS_API_KEY:'',CRM_GOOGLE_SERVICE_ACCOUNT_JSON:'',NEXT_TELEMETRY_DISABLED:'1'};delete env.VERCEL;
execFileSync(process.execPath,['scripts/migrate.mjs'],{env,stdio:'pipe'});
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','34687'],{env,stdio:'ignore',windowsHide:true});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
let chrome,ws;const evidence={checks:{},screens:[],errors:[]};
try{
 for(let i=0;i<80;i++){try{await fetch(base+'/login',{signal:AbortSignal.timeout(1000)});break;}catch{await pause(150);}}
 const token=await encode({secret,salt:'authjs.session-token',token:{sub:'google:owner',email:'owner@example.test',name:'Inventory test'},maxAge:3600});
 const headers={cookie:'authjs.session-token='+token,Origin:base,'Content-Type':'application/json'};
 assert.equal((await fetch(base+'/api/crm',{headers})).status,200);

 const fixture=new DatabaseSync(join(dir,'test.db'));
 const stamp=new Date().toISOString();
 for(let i=0;i<12;i++){
  const email='agent'+i+'@example.test';fixture.prepare('INSERT INTO members(email,name,role,active) VALUES(?,?,?,1)').run(email,'Agent '+String(i).padStart(2,'0'),'agent');
  for(let j=0;j<i;j++)fixture.prepare("INSERT INTO leads(id,name,phone,product,source,owner,status,next_action,created_at,updated_at,op) VALUES(?,?,?,?,?,?,?,'',?,?,?)").run(i+'-'+j,'Customer',String(90000000+i*20+j),'Item','Test',email,j%2?'new':'won',stamp,stamp,i+'-'+j);
 }
 fixture.prepare("INSERT INTO leads(id,name,phone,product,source,owner,status,next_action,created_at,updated_at,op) VALUES('unassigned','Unassigned','99999999','Item','Test','__sheet_unassigned__','new','',?,?,'unassigned')").run(stamp,stamp);
 fixture.close();
 chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=9348','--user-data-dir='+join(dir,'chrome'),'about:blank'],{stdio:'ignore',windowsHide:true});
 let target;for(let i=0;i<50;i++){try{target=(await (await fetch('http://127.0.0.1:9348/json')).json()).find(t=>t.type==='page');if(target)break;}catch{}await pause(150);}
 if(!target)throw new Error('Chrome did not start');
 ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
 let sequence=0;const pending=new Map();
 const cdp=(method,params={})=>new Promise((r,j)=>{const id=++sequence,t=setTimeout(()=>{pending.delete(id);j(new Error('CDP timeout: '+method));},30000);pending.set(id,{resolve:v=>{clearTimeout(t);r(v);},reject:e=>{clearTimeout(t);j(e);}});ws.send(JSON.stringify({id,method,params}));});
 ws.onmessage=event=>{const v=JSON.parse(event.data);if(v.id){const p=pending.get(v.id);if(p){pending.delete(v.id);v.error?p.reject(new Error(v.error.message)):p.resolve(v.result);}}else if(v.method==='Runtime.exceptionThrown')evidence.errors.push(v.params.exceptionDetails.exception?.description||v.params.exceptionDetails.text);else if(v.method==='Page.javascriptDialogOpening')void cdp('Page.handleJavaScriptDialog',{accept:true});};
 const evaluate=async expression=>{const r=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.result.description);return r.result.value;};
 const wait=async(expression)=>{for(let i=0;i<100;i++){if(await evaluate(expression))return;await pause(150);}evidence.lastBody=await evaluate('document.body.innerText');const shot=await cdp('Page.captureScreenshot',{format:'png'});await writeFile(join(out,'failure.png'),Buffer.from(shot.data,'base64'));throw new Error('UI wait timed out: '+expression);};
 const click=async(text,selector='button')=>{await evaluate(`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.textContent.trim()===${JSON.stringify(text)});if(!e)throw new Error('Missing button: '+${JSON.stringify(text)});e.click();})()`);await pause(300);};
 const viewport=async(width)=>{await cdp('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});await pause(250);};
 const snap=async name=>{const metrics=await evaluate('({width:innerWidth,scroll:document.documentElement.scrollWidth})');const shot=await cdp('Page.captureScreenshot',{format:'png'});await writeFile(join(out,name+'.png'),Buffer.from(shot.data,'base64'));evidence.screens.push({name,...metrics});assert.ok(metrics.scroll<=metrics.width,name+' overflows');};
 await cdp('Runtime.enable');await cdp('Page.enable');await cdp('Network.enable');await viewport(1440);
 await cdp('Network.setCookie',{name:'authjs.session-token',value:token,url:base,httpOnly:true,sameSite:'Lax'});




 const day=new Date(Date.now()+8*3600000).toISOString().slice(0,10);
 await cdp('Page.navigate',{url:base+'/?view=reports&rfrom='+day+'&rto='+day});
 await wait("document.querySelector('.team-performance')?.textContent.includes('Agent 11')");
 assert.ok(await evaluate("document.querySelector('.team-performance').textContent.includes('12 ажилтан')"));
 assert.ok(await evaluate("document.querySelector('.team-performance').textContent.includes('Хуваарилаагүй 1 хүсэлт')"));
 const fill=async(value)=>evaluate(`(()=>{const e=document.querySelector('[aria-label="Үзүүлэлтээс ажилтан хайх"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
 await fill('Agent 03');await wait("document.querySelectorAll('.team-performance .ant-table-tbody tr[data-row-key]').length===1");
 await click('Нээх');await wait("document.querySelector('.performance-drawer')?.textContent.includes('Agent 03')");
 assert.ok(await evaluate("document.querySelector('.performance-drawer').textContent.includes('66.7%')"));
 await evaluate("document.querySelector('.performance-drawer .ant-drawer-close').click()");
 await click('Шүүлт цэвэрлэх');await click('Худалдан авалттай');
 assert.ok(!(await evaluate("document.querySelector('.team-performance .ant-table-tbody').textContent")).includes('Agent 00'));
 await click('График','.ant-segmented-item-label');await wait("document.querySelectorAll('.performance-bar').length===8");
 await evaluate("document.querySelector('.performance-bar').click()");await wait("!!document.querySelector('.performance-drawer .ant-descriptions')");await evaluate("document.querySelector('.performance-drawer .ant-drawer-close').click()");
 await fill('Missing');await wait("document.querySelector('.team-performance').textContent.includes('Сонголтод тохирох ажилтан алга')");await click('Шүүлт цэвэрлэх');
 await click('Жагсаалт','.ant-segmented-item-label');
 const selectBox=await evaluate("(()=>{const e=document.querySelector('.performance-controls .ant-select');e.scrollIntoView();const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()");
 await cdp('Input.dispatchMouseEvent',{type:'mousePressed',...selectBox,button:'left',clickCount:1});await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',...selectBox,button:'left',clickCount:1});
 await wait("[...document.querySelectorAll('.ant-select-item-option-content')].some(e=>e.textContent==='Хүсэлтийн тоо')");
 await click('Хүсэлтийн тоо','.ant-select-item-option-content');
 await wait("document.querySelector('.team-performance').textContent.includes('Хүсэлтийн тоо ихээс бага руу')");
 evidence.checks.select=await evaluate("document.querySelector('.performance-controls .ant-select').innerText");
 await evaluate("document.querySelector('.team-performance').scrollIntoView()");await snap('performance-desktop');
 await evaluate(await readFile('node_modules/axe-core/axe.min.js','utf8'));
 const issues=await evaluate("axe.run(document.querySelector('.team-performance'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}}).then(r=>r.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.failureSummary)})))");assert.deepEqual(issues,[]);
 await viewport(390);await wait("!!document.querySelector('.performance-mobile')");await evaluate("document.querySelector('.team-performance').scrollIntoView()");await pause(700);evidence.checks.controls=await evaluate("[...document.querySelectorAll('.performance-controls *')].filter(e=>e.textContent.trim()==='????????? ???'||e.classList.contains('ant-segmented-item-label')).map(e=>({tag:e.tagName,cls:e.className,text:e.textContent,color:getComputedStyle(e).color,visibility:getComputedStyle(e).visibility,background:getComputedStyle(e).backgroundColor}))");await snap('performance-mobile');
 await fill('Agent 00');await wait("document.querySelector('.performance-mobile')?.textContent.includes('Хүсэлтгүй')");
 assert.ok(!(await evaluate("document.querySelector('.team-performance').textContent")).includes('NaN'));
 assert.equal(evidence.errors.length,0,JSON.stringify(evidence.errors));console.log('PASS: search, quick filters, chart/list views, drawer calculations, empty results, zero denominator, accessibility and mobile layout.');
}finally{await writeFile(join(out,'evidence.json'),JSON.stringify(evidence,null,2));ws?.close();chrome?.kill();server.kill();}
