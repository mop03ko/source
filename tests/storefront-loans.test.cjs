const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const code=ts.transpileModule(fs.readFileSync('deploy/storefront/loan-request-form-route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const mod={exports:{}};let count=0,fail=false;const ids=[];
new Function('require','module','exports','process','fetch',code)(name=>name==='next/server'?{NextResponse:{json:Response.json}}:require(name),mod,mod.exports,{env:{CRM_WEB_LOAN_TOKEN:'private-test-token',CRM_WEB_LOAN_URL:'https://crm.test/api/integrations/web-loans'}},async(url,options)=>{assert.equal(options.headers['X-Web-Loan-Token'],'private-test-token');ids.push(JSON.parse(options.body).request_id);count++;if(fail||count===1)throw Error('network');return Response.json({ok:true,id:'web-test'});});
const body={request_id:crypto.randomUUID(),ant_loan_request_form:'Test customer',contact_phone:'99112233',cust_register_no:'АБ12345678',req_products:'Test phone'};
const call=(origin='https://www.antmall.mn',data=body)=>mod.exports.POST(new Request('https://www.antmall.mn/api/loan-request-form',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(data)}));
(async()=>{
 assert.equal((await call('https://evil.test')).status,403);assert.equal(count,0);
 assert.equal((await call(undefined,{...body,contact_phone:'bad'})).status,400);
 const r=await call();assert.equal(r.status,200);const data=await r.json();assert.equal(data.success,true);assert.equal(data.ant_loan_request_form_id,'web-test');assert.equal(count,2);assert.equal(ids[0],ids[1]);assert.equal(JSON.stringify(data).includes('private-test-token'),false);
 fail=true;assert.equal((await call()).status,503);assert.equal(count,5);
 console.log('PASS: storefront origin, validation, secret boundary, stable retry IDs and no false success');
})().catch(e=>{console.error(e);process.exit(1)});
