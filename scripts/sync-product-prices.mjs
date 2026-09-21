import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import env from '@next/env';
import {createClient} from '@libsql/client';

export function priceKey(name,size=''){
 let n=name.normalize('NFKC').toUpperCase().replace(/\s+/g,' ').trim();
 n=n.replace(/\b[A-Z0-9]{1,3}\/A\b/g,'');
 if(!/^CONTROLLER\b/.test(n))n=n.replace(/\b\d{1,2}\/\d{1,2}\b/g,'');
 n=n.replace(/^\[?(?:APPLE|DJI|DYSON|POUT)\]?\s+/,'').replace(/^IWATCH\b/,'WATCH').replace(/\bSER(?:IES)?\s*(\d+)/g,'S$1');
 n=n.replace(/PRO\s*MAX/g,'PRO MAX').replace(/\bSTANDART\b/g,'STANDARD').replace(/\bCREATER\b/g,'CREATOR').replace(/\bMOBLIE\b/g,'MOBILE');
 n=n.replace(/\bIPHONE (16|17) E\b/g,'IPHONE $1E').replace(/^AIRPODS (PRO )?\(?\s*(\d)(?:ND|RD|TH) GENERATION\)?/,'AIRPODS $1$2').replace(/^AIRPODS GEN\s*(\d)/,'AIRPODS $1');
 n=n.replace(/^PENCIL \(?2ND GENERATION\)?/,'PENCIL 2ND');
 const dimension=size.trim().toUpperCase().replace(/\s/g,'');
 if(/^\d+(?:GB|TB|MM)$/.test(dimension)&&!n.replace(/\s/g,'').includes(dimension))n+=' '+dimension;
 return n.replace(/[^\p{L}\p{N}]/gu,'');
}
const specialCondition=name=>/\b(?:USED|OPENBOX|DUMMY|DISPLAY|UZUULEN)\b|ҮЗҮҮЛЭН|ЗАДАРСАН|ЗАДГАЙ|ЗАСВАР|BH\s*\d/i.test(name);
export function pricePlan(items,source){
 const names=new Map(),models=new Map();
 for(const row of source.rows){
  const key=priceKey(row.name,row.model);names.set(key,[...(names.get(key)||[]),row]);
  if(row.model&&/[A-Z]/i.test(row.model)&&!/^(?:\d+(?:GB|TB|MM)|\[)/i.test(row.model)){
   const code=row.model.trim().toUpperCase();models.set(code,[...(models.get(code)||[]),row]);
  }
 }
 const changes=[],unchanged=[],issues=[],used=new Set();
 for(const item of items){
  if(specialCondition(item.name)){issues.push({id:item.id,code:item.code,name:item.name,reason:'Хуучин / задгай / үзүүлэн / засварын бараа'});continue;}
  const matches=models.get(item.code.trim().toUpperCase())||names.get(priceKey(item.name,item.capacity))||[];
  if(!matches.length){issues.push({id:item.id,code:item.code,name:item.name,reason:'Загвар, багтаамжтайгаа баттай таараагүй'});continue;}
  if(matches.some(r=>r.issues.length)||new Set(matches.map(r=>JSON.stringify([r.base,r.cash]))).size!==1){issues.push({id:item.id,code:item.code,name:item.name,reason:'Эх үнийн зөрчил / тусгай нөхцөл',rows:matches.map(r=>r.row)});continue;}
  const row=matches[0];matches.forEach(r=>used.add(r.row));
  const entry={...item,sourceRows:matches.map(r=>r.row),base:row.base,cash:row.cash};
  if(item.sale_price===row.base&&(item.cash_price??null)===row.cash)unchanged.push(entry);else changes.push(entry);
 }
 return {changes,unchanged,issues,unmatchedSource:source.rows.filter(r=>!used.has(r.row))};
}
async function main(){
 const file=process.argv[2];if(!file)throw new Error('Usage: node scripts/sync-product-prices.mjs <prepared.json> [--apply]');
 env.loadEnvConfig(process.cwd());const client=createClient({url:process.env.TURSO_DATABASE_URL,authToken:process.env.TURSO_AUTH_TOKEN});
 try{
  const source=JSON.parse(await readFile(file,'utf8')),items=(await client.execute('SELECT * FROM inventory_items ORDER BY id')).rows,plan=pricePlan(items,source);
  const out=resolve('artifacts/price-update',new Date().toISOString().replaceAll(':','-'));await mkdir(out,{recursive:true});
  await writeFile(resolve(out,'before.json'),JSON.stringify(items,null,2));await writeFile(resolve(out,'plan.json'),JSON.stringify({source:source.source,sha256:source.sha256,...plan},null,2));
  const csv=(headers,data)=>'\uFEFF'+[headers,...data].map(row=>row.map(v=>'"'+String(v??'').replace(/^[=+\-@\t\r]/,"'$&").replaceAll('"','""')+'"').join(',')).join('\r\n');
  await writeFile(resolve(out,'changes.csv'),csv(['Код','Бараа','Өмнөх үндсэн үнэ','Өмнөх бэлэн үнэ','Шинэ үндсэн үнэ','Шинэ бэлэн үнэ','Excel мөр'],plan.changes.map(r=>[r.code,r.name,r.sale_price,r.cash_price,r.base,r.cash,r.sourceRows.join(',')])));
  await writeFile(resolve(out,'unmatched-inventory.csv'),csv(['Код','Бараа','Шалтгаан','Excel мөр'],plan.issues.map(r=>[r.code,r.name,r.reason,r.rows?.join(',')])));
  await writeFile(resolve(out,'source-review.csv'),csv(['Excel мөр','Бараа','Үндсэн үнэ','Бэлэн үнэ','Тайлбар','Зөрчил'],plan.unmatchedSource.map(r=>[r.row,r.name,r.base,r.cash,r.note,r.issues.join('; ')])));
  const summary={total:items.length,changed:plan.changes.length,unchanged:plan.unchanged.length,skipped:plan.issues.length,unmatchedSource:plan.unmatchedSource.length,out};console.log(JSON.stringify(summary));
  if(!process.argv.includes('--apply'))return;
  const tx=await client.transaction('write');
  try{
   const ledger=(await tx.execute('SELECT COUNT(*) count,SUM(qty_delta) qty,SUM(value_cents) value FROM inventory_stock_moves')).rows;
   const sales=(await tx.execute('SELECT * FROM inventory_sales ORDER BY id')).rows;
   for(let start=0;start<plan.changes.length;start+=100){
    const results=await tx.batch(plan.changes.slice(start,start+100).map(r=>({sql:'UPDATE inventory_items SET sale_price=?,cash_price=?,updated_at=? WHERE id=? AND name=? AND sale_price=? AND cash_price IS ? AND updated_at=?',args:[r.base,r.cash,new Date().toISOString(),r.id,r.name,r.sale_price,r.cash_price??null,r.updated_at]})));
    if(results.some(r=>r.rowsAffected!==1))throw new Error('Concurrent price edit; rolled back');
   }
   const after=(await tx.execute('SELECT * FROM inventory_items ORDER BY id')).rows,expected=new Map(plan.changes.map(r=>[r.id,r]));
   if(after.length!==items.length)throw new Error('Product count changed');
   for(let i=0;i<items.length;i++){
    const old=items[i],next=after[i],change=expected.get(old.id);
    for(const k of Object.keys(old))if(!['sale_price','cash_price','updated_at'].includes(k)&&old[k]!==next[k])throw new Error('Unexpected change: '+k);
    if(next.sale_price!==(change?change.base:old.sale_price)||next.cash_price!==(change?change.cash:old.cash_price))throw new Error('Price verification failed');
   }
   const nextLedger=(await tx.execute('SELECT COUNT(*) count,SUM(qty_delta) qty,SUM(value_cents) value FROM inventory_stock_moves')).rows;
   const nextSales=(await tx.execute('SELECT * FROM inventory_sales ORDER BY id')).rows;
   if(JSON.stringify(ledger)!==JSON.stringify(nextLedger)||JSON.stringify(sales)!==JSON.stringify(nextSales))throw new Error('Historical amounts changed');
   await tx.commit();await writeFile(resolve(out,'applied.json'),JSON.stringify({...summary,stockAndSalesPreserved:true},null,2));console.log('APPLIED and verified.');
  }catch(e){await tx.rollback();throw e;}finally{tx.close();}
 }finally{client.close();}
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(fileURLToPath(import.meta.url)))await main();
