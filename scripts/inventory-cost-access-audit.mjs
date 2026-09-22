import {DatabaseSync} from 'node:sqlite';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {encode} from 'next-auth/jwt';
import assert from 'node:assert/strict';

// Disposable local database. Optional argv[2] exercises the supplied workbook in the browser.
const dir=await mkdtemp(join(tmpdir(),'antmall-products-')),out=resolve('artifacts/inventory-cost-access-audit');
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
 for(const role of ['operator','agent','manager','director','marketing','it','delivery'])fixture.prepare('INSERT INTO members(email,name,role,active) VALUES(?,?,?,1)').run(role+'@example.test',role,role);
 fixture.close();
 const post=async(action,data)=>{const r=await fetch(base+'/api/inventory',{method:'POST',headers,body:JSON.stringify({action,data})});const body=await r.json();assert.equal(r.status,200,JSON.stringify(body));return body;};
 const warehouse=(await post('create_warehouse',{name:'Test warehouse'})).id;
 const item=(await post('create_item',{code:'COST-TEST',name:'Cost visibility item',brand:'Dyson',supplier:'Yuna',sale_price:9876,cash_price:9000})).id;
 await post('record_purchase',{item_id:item,warehouse_id:warehouse,qty:10,unit_cost:1234.56});
 await post('record_sale',{item_id:item,warehouse_id:warehouse,qty:1,unit_price:9876,seller:'agent@example.test'});

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



 for(const role of ['admin','director','manager','agent','operator']){
  const email=role==='admin'?'owner@example.test':role+'@example.test';
  const roleToken=await encode({secret,salt:'authjs.session-token',token:{sub:'google:'+(role==='admin'?'owner':role),email,name:role},maxAge:3600});
  await cdp('Network.setCookie',{name:'authjs.session-token',value:roleToken,url:base,httpOnly:true,sameSite:'Lax'});
  const privileged=['admin','director','manager'].includes(role);
  for(const tab of ['items','balance','purchases','sales','moves']){
   await cdp('Page.navigate',{url:base+'/?view=inventory&inv_tab='+tab});
   await wait("!!document.querySelector('.inventory-panel') && !document.querySelector('.inventory-loading') && document.querySelector('.inventory-panel').textContent.includes('Cost visibility item')");
   if(tab==='balance')await wait("!!document.querySelector('.balance-kpis')");
   const text=await evaluate("document.querySelector('.inventory-panel').innerText");
   assert.ok(!text.includes('NaN'),role+' '+tab+' NaN');
   const headings=await evaluate("[...document.querySelectorAll('.inventory-panel th,.inventory-panel .metric,.balance-kpis')].map(e=>e.innerText).join(' ')");
   assert.equal(/өртөг|ашиг/i.test(headings),privileged,role+' '+tab+' headers');
   if(!privileged)assert.ok(!text.includes('1,234.56')&&!text.includes('11,111.04'),role+' cost amount leaked');
   if(role==='operator'){
    await evaluate("window.exportedCsv=null;const create=URL.createObjectURL.bind(URL);URL.createObjectURL=b=>{b.text().then(t=>window.exportedCsv=t);return create(b);}");
    await click('CSV татах');await wait("typeof window.exportedCsv==='string'");
    const csv=await evaluate('window.exportedCsv');assert.ok(!/өртөг|ашиг/i.test(csv.split('\n')[0]),tab+' CSV headers');assert.ok(!csv.includes('NaN'),tab+' CSV NaN');
   }
   if(role==='operator'&&tab==='items'){
    await evaluate("document.querySelector('.inventory-item-link').click()");await wait("!!document.querySelector('.inventory-product-detail')");
    assert.ok(!(await evaluate("document.querySelector('.inventory-product-detail').innerText")).includes('Үлдэгдлийн өртөг'));
   }
   if(role==='operator'&&tab==='balance'){await viewport(390);await snap('operator-balance-mobile');await viewport(1440);}
  }
  await cdp('Page.navigate',{url:base+'/?view=direct'});
  await wait("[...document.querySelectorAll('h2')].some(e=>e.textContent.includes('Шууд бэлэн борлуулалт')) && !!document.querySelector('.metric-focus')");
  const direct=await evaluate("document.querySelector('.metric-focus').closest('section').innerText");
  assert.equal(direct.includes('Ашиг'),privileged,role+' direct sales profit');assert.ok(!direct.includes('NaN'));
  evidence.checks[role]='cost visibility passed in five inventory views';
 }
 assert.equal(evidence.errors.length,0,JSON.stringify(evidence.errors));console.log('PASS: admin/director/manager costs retained; agent/operator costs hidden across catalog, detail, balances, purchases, sales and movements; mobile fits.');
}finally{await writeFile(join(out,'evidence.json'),JSON.stringify(evidence,null,2));ws?.close();chrome?.kill();server.kill();}
