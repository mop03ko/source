const fs=require('node:fs'),assert=require('node:assert/strict'),ts=require('typescript');
class Failure extends Error{constructor(message,status=400){super(message);this.status=status;}}
let role='admin',calls=0,applyCalls=0;
const db={execute:async()=>({rows:[]})};
const deps={
 'zod':require('zod'),
 '@/lib/access':{Failure,member:async()=>({role,email:'tester@example.test'}),isSameOrigin:r=>r.headers.get('origin')==='https://crm.example.test'},
 '@/lib/crm':{canViewInventoryCost:r=>['admin','director','manager'].includes(r)},
 '@/lib/database':{getClient:()=>db},
 '@/scripts/inventory-sheet-source.mjs':{spreadsheetId:'main-sheet',unionSpreadsheetId:'union-sheet',serviceEmail:'service@example.test',readInventorySheet:async(_,id)=>{calls++;return {spreadsheetId:id,title:'Stock',readAt:'now'};}},
 '@/scripts/inventory-sheet-plan.mjs':{planBalance:()=>({digest:'a'.repeat(64),planDigest:'b'.repeat(64),targets:[],changes:[],issues:[]})},
 '@/scripts/sync-inventory-sheet.mjs':{inventorySnapshot:async()=>({}),applyBalance:async(...args)=>{applyCalls++;assert.equal(args[4],'tester@example.test');return {state:'applied'};}}
};
const code=ts.transpileModule(fs.readFileSync('app/api/inventory-sheet/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const moduleObj={exports:{}};new Function('require','module','exports',code)(id=>{if(!deps[id])throw Error(id);return deps[id];},moduleObj,moduleObj.exports);
const route=moduleObj.exports;
const request=(body,origin='https://crm.example.test')=>new Request('https://crm.example.test/api/inventory-sheet',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
(async()=>{
 for(role of ['agent','operator','delivery','marketing','it']){assert.equal((await route.GET()).status,403);assert.equal((await route.POST(request({action:'preview',source:'main'}))).status,403);}
 assert.equal(calls,0);role='admin';
 assert.equal((await route.POST(request({action:'preview',source:'main'},'https://other.test'))).status,403);
 assert.equal((await route.POST(request({action:'apply',source:'main'}))).status,400);assert.equal(calls,0);
 assert.equal((await route.POST(request({action:'preview',source:'arbitrary-url'}))).status,400);
 for(role of ['admin','director','manager']){const r=await route.POST(request({action:'preview',source:'union'}));assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');assert.equal((await r.json()).targets,undefined);}
 assert.equal((await route.POST(request({action:'apply',source:'main',digest:'a'.repeat(64),planDigest:'b'.repeat(64)}))).status,200);assert.equal(applyCalls,1);
 console.log('PASS: Sheet sync role boundaries, CSRF, source allowlist, preview requirement, no-store, actor attribution.');
})().catch(e=>{console.error(e);process.exitCode=1;});
