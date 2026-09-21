import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import env from '@next/env';
import {createClient} from '@libsql/client';

// The export contains quoted semicolons and multiline HTML; never split it by lines.
export function parseProducts(text){
 const rows=[];let row=[],cell='',quoted=false;
 text=text.replace(/^\uFEFF/,'');
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
  else if(c===';'&&!quoted){row.push(cell);cell='';}
  else if((c==='\r'||c==='\n')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(Boolean))rows.push(row);row=[];cell='';}
  else cell+=c;
 }
 if(quoted)throw new Error('Unclosed CSV quote');
 row.push(cell);if(row.some(Boolean))rows.push(row);
 const headers=rows.shift();
 if(!headers?.includes('Product code')||!headers.includes('Product name')||!headers.includes('Features')||!headers.includes('Secondary categories')||new Set(headers).size!==headers.length)throw new Error('Unsupported product export');
 return rows.map((r,i)=>{if(r.length!==headers.length)throw new Error(`Column mismatch at record ${i+2}`);return Object.fromEntries(headers.map((h,j)=>[h,r[j]]));});
}
export function brandPlan(rows,items){
 const codes=new Map(),names=new Map(),issues=[];
 // Exact names after trimming outer whitespace; no fuzzy matching or name-based guessing.
 for(const row of rows){
  const feature=[...row.Features.matchAll(/(?:^|;\s*)Брэнд:\s*[ES]\[([^\]]+)\]/g)].map(m=>m[1]);
  const categories=row['Secondary categories'].split(';').map(s=>s.trim()).filter(s=>s.startsWith('Брэндүүд///')).map(s=>s.split('///')[1]);
  const brands=[...new Set((feature.length?feature:categories).map(s=>s.trim().toUpperCase()).filter(Boolean))];
  for(const [index,key] of [[codes,row['Product code'].trim()],[names,row['Product name'].trim()]]){
   if(!key)continue;
   const entry=index.get(key)||{brands:new Set()};brands.forEach(b=>entry.brands.add(b));index.set(key,entry);
  }
 }
 const changes=[];let unchanged=0,matched=0;
 const usedNames=new Set(),usedCodes=new Set();
 for(const item of items){
  const direct=codes.get(item.code),entry=direct||names.get(item.name.trim()),match=direct?'code':'exact name';
  if(!entry){issues.push({code:item.code,name:item.name,reason:'no source match'});continue;}
  if(entry.brands.size!==1){issues.push({code:item.code,name:item.name,reason:entry.brands.size?'conflicting brands':'no brand',brands:[...entry.brands]});continue;}
  const brand=[...entry.brands][0];
  if(brand.length>120){issues.push({code:item.code,reason:'brand too long'});continue;}
  matched++;if(direct)usedCodes.add(item.code);else usedNames.add(item.name.trim());
  if(item.brand===brand){unchanged++;continue;}
  changes.push({id:item.id,code:item.code,name:item.name,match,previous:item.brand,brand,supplier:item.supplier,updated_at:item.updated_at});
 }
 const unmatchedSource=rows.filter(row=>!usedCodes.has(row['Product code'].trim())&&!usedNames.has(row['Product name'].trim())).map(row=>({code:row['Product code'],name:row['Product name']}));
 return {sourceRows:rows.length,sourceCodes:codes.size,matched,unchanged,changes,issues,unmatchedSource};
}
async function main(){
 const file=process.argv[2];if(!file)throw new Error('Usage: node scripts/product-brand-sync.mjs <csv> [--apply]');
 env.loadEnvConfig(process.cwd());
 const client=createClient({url:process.env.TURSO_DATABASE_URL,authToken:process.env.TURSO_AUTH_TOKEN});
 try{
  const source=await readFile(file,'utf8'),rows=parseProducts(source);
  const items=(await client.execute('SELECT id,code,name,brand,supplier,updated_at FROM inventory_items')).rows;
  const plan=brandPlan(rows,items),out=resolve('artifacts/product-brand-sync',new Date().toISOString().replaceAll(':','-'));
  await mkdir(out,{recursive:true});
  await writeFile(resolve(out,'plan.json'),JSON.stringify({source:resolve(file),sha256:createHash('sha256').update(source).digest('hex'),...plan},null,2));
  const csv=(headers,data)=>'\uFEFF'+[headers,...data].map(row=>row.map(value=>'"'+String(value??'').replace(/^[=+\-@\t\r]/,"'$&").replaceAll('"','""')+'"').join(',')).join('\r\n');
  await writeFile(resolve(out,'brand-changes.csv'),csv(['Код','Нэр','Өмнөх брэнд','Шинэ брэнд','Нийлүүлэгч'],plan.changes.map(c=>[c.code,c.name,c.previous,c.brand,c.supplier])));
  await writeFile(resolve(out,'unmatched-inventory.csv'),csv(['Код','Нэр','Шалтгаан'],plan.issues.map(c=>[c.code,c.name,c.reason])));
  await writeFile(resolve(out,'unmatched-source.csv'),csv(['CSV код','CSV нэр'],plan.unmatchedSource.map(c=>[c.code,c.name])));
  console.log(JSON.stringify({sourceRows:plan.sourceRows,sourceCodes:plan.sourceCodes,matched:plan.matched,changes:plan.changes.length,unchanged:plan.unchanged,unmatchedSource:plan.unmatchedSource.length,issues:plan.issues.reduce((a,v)=>(a[v.reason]=(a[v.reason]||0)+1,a),{}),out}));
  if(!process.argv.includes('--apply'))return;
  const tx=await client.transaction('write');
  try{
   const before=(await tx.execute('SELECT COUNT(*) movements,COALESCE(SUM(qty_delta),0) qty,COALESCE(SUM(value_cents),0) value FROM inventory_stock_moves')).rows;
   for(const change of plan.changes){
    const r=await tx.execute({sql:'UPDATE inventory_items SET brand=?,updated_at=? WHERE id=? AND code=? AND brand=? AND supplier=? AND name=? AND updated_at=?',args:[change.brand,new Date().toISOString(),change.id,change.code,change.previous,change.supplier,change.name,change.updated_at]});
    if(r.rowsAffected!==1)throw new Error('Concurrent change: '+change.code);
   }
   const after=(await tx.execute('SELECT COUNT(*) movements,COALESCE(SUM(qty_delta),0) qty,COALESCE(SUM(value_cents),0) value FROM inventory_stock_moves')).rows;
   if(JSON.stringify(before)!==JSON.stringify(after))throw new Error('Stock invariant failed');
   await tx.commit();await writeFile(resolve(out,'applied.json'),JSON.stringify({updated:plan.changes.length,stock:after},null,2));
   console.log('Applied '+plan.changes.length+' brand updates; supplier, price and stock preserved.');
  }catch(e){await tx.rollback();throw e;}finally{tx.close();}
 }finally{client.close();}
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(fileURLToPath(import.meta.url)))await main();
