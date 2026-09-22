const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const deps={};
function load(path){const js=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const m={exports:{}};new Function('require','module','exports',js)(id=>deps[id]||require(id),m,m.exports);return m.exports;}
const {sendSms,SmsError}=load('lib/sms.ts');
const originalFetch=global.fetch,originalKey=process.env.ANTMALL_SMS_API_KEY;
let calls=[],next=()=>new Response('{}');
global.fetch=async(url,options)=>{calls.push({url:new URL(url),options});return next();};
(async()=>{
 delete process.env.ANTMALL_SMS_API_KEY;
 await assert.rejects(sendSms('99112233','Test'),/тохируулаагүй/);assert.equal(calls.length,0);
 const key='test-key_+&?=/';process.env.ANTMALL_SMS_API_KEY=key;
 const message='Сайн байна уу? Үнэ 50% & шинэ мөр\nЗахиалга #1';
 for(const body of ['{"success":true}','{"id":"queued-id"}','{"status":"accepted"}','{"code":200}','{"code":0}','true','OK','"SUCCESS"','']){
  next=()=>new Response(body);assert.deepEqual(await sendSms('99112233',message),{success:true});
 }
 const {url,options}=calls[0];assert.equal(url.origin,'https://pn.unitel.mn');assert.equal(url.pathname,'/api/message/send/sms');assert.equal(url.searchParams.get('enc'),key);assert.deepEqual([...url.searchParams.keys()],['enc']);
 assert.equal(options.method,'POST');assert.equal(options.headers['Content-Type'],'application/json');assert.equal(options.headers['storefront-api-access-key'],undefined);assert.deepEqual(JSON.parse(options.body),{to:'99112233',message});assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');assert.ok(options.signal instanceof AbortSignal);
 for(const [status,body] of [[401,key],[500,'Server error'],[200,'{"success":false}'],[200,'{"ok":false}'],[200,'{"status":"FAILED"}'],[200,'{"error":"secret '+key+'"}'],[200,'{"errors":["bad"]}'],[200,'{"code":-1}'],[200,'{"statusCode":"403"}'],[200,'<html>Login</html>'],[200,'false'],[200,'null'],[200,'[]']]){
  next=()=>new Response(body,{status});const before=calls.length;
  await assert.rejects(sendSms('99112233',message),e=>{assert.ok(!e.message.includes(key));assert.ok(!e.message.includes('99112233'));assert.ok(!e.message.includes(message));return true;});assert.equal(calls.length,before+1,'no retry');
 }
 next=()=>{throw new Error('fetch failed at https://pn.unitel.mn/?enc='+key);};
 await assert.rejects(sendSms('99112233',message),e=>!e.message.includes(key)&&e.message.includes('түүх'));
 // The manual route retains role/origin checks and returns only a normalized receipt.
 let role='admin';deps['@/lib/access']={member:async()=>({role}),isSameOrigin:r=>r.headers.get('origin')==='https://crm.test'};
 deps['@/lib/sms']={sendSms,SmsError};deps['@/lib/crm']=load('lib/crm.ts');const route=load('app/api/sms/route.ts');
 const request=(origin='https://crm.test')=>new Request('https://crm.test/api/sms',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify({to:'+976 99112233',message})});
 next=()=>new Response(JSON.stringify({success:true,internalSecret:key,recipient:'99112233'}));
 for(role of ['admin','director']){const r=await route.POST(request());assert.equal(r.status,200);assert.deepEqual(await r.json(),{ok:true,success:true});}
 for(role of ['agent','manager','operator','delivery']){const before=calls.length;assert.equal((await route.POST(request())).status,403);assert.equal(calls.length,before);}
 role='admin';assert.equal((await route.POST(request('https://other.test'))).status,403);
 role='admin';
 for(const upstream of [401,403,429,500]){
  next=()=>new Response(JSON.stringify({error:key}),{status:upstream});const before=calls.length;
  const r=await route.POST(request());assert.equal(r.status,502);const body=await r.json();assert.equal(body.provider_status,upstream);assert.ok(body.code.startsWith('SMS_PROVIDER_'));assert.ok(!JSON.stringify(body).includes(key));assert.equal(calls.length,before+1);
  if(upstream===403){assert.equal(body.code,'SMS_PROVIDER_FORBIDDEN');assert.ok(body.error.includes('Hosts/IP'));}
 }
 next=()=>{throw new DOMException('timeout','TimeoutError');};assert.equal((await route.POST(request())).status,504);
 delete process.env.ANTMALL_SMS_API_KEY;assert.equal((await route.POST(request())).status,503);
 console.log('PASS: Unitel JSON POST contract, Unicode, encoded key, sanitized receipts/errors, no retries, failure handling and manual SMS permissions. No real SMS sent.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{global.fetch=originalFetch;if(originalKey===undefined)delete process.env.ANTMALL_SMS_API_KEY;else process.env.ANTMALL_SMS_API_KEY=originalKey;});
