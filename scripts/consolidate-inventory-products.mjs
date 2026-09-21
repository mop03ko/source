import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
import env from '@next/env';
import {createClient} from '@libsql/client';
const require=createRequire(import.meta.url),module={exports:{}};
new Function('require','module','exports',ts.transpileModule(await readFile(new URL('../lib/inventory.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(id=>id==='@/lib/access'?{Failure:Error}:require(id),module,module.exports);
export const productKey=module.exports.productKey;
async function main(){
 env.loadEnvConfig(process.cwd());const client=createClient({url:process.env.TURSO_DATABASE_URL,authToken:process.env.TURSO_AUTH_TOKEN});
 try{
  const before=(await client.execute('SELECT * FROM inventory_items ORDER BY id')).rows;
  const plan=await Promise.all(before.map(async item=>({item,key:await productKey(item)})));
  const groups=new Map();for(const row of plan){const rows=groups.get(row.key)||[];rows.push(row.item);groups.set(row.key,rows);}
  const changes=plan.filter(row=>row.item.product_key!==row.key);
  const summary={records:before.length,products:groups.size,mergedProducts:[...groups.values()].filter(g=>g.length>1).length,changes:changes.length};
  const out=resolve('artifacts/product-consolidation',new Date().toISOString().replaceAll(':','-'));await mkdir(out,{recursive:true});
  await writeFile(resolve(out,'before.json'),JSON.stringify(before,null,2));await writeFile(resolve(out,'plan.json'),JSON.stringify({summary,groups:[...groups].map(([key,items])=>({key,name:items[0].name,capacity:items[0].capacity,color:items[0].color,ids:items.map(i=>i.id)}))},null,2));console.log(JSON.stringify({...summary,out}));
  if(!process.argv.includes('--apply'))return;
  const tx=await client.transaction('write');
  try{
   const ledger=(await tx.execute('SELECT COUNT(*) count,SUM(qty_delta) qty,SUM(value_cents) value FROM inventory_stock_moves')).rows;
   for(let i=0;i<changes.length;i+=100){const results=await tx.batch(changes.slice(i,i+100).map(({item,key})=>({sql:'UPDATE inventory_items SET product_key=? WHERE id=? AND name=? AND brand=? AND capacity=? AND color=? AND variant=? AND code=? AND updated_at=?',args:[key,item.id,item.name,item.brand,item.capacity,item.color,item.variant,item.code,item.updated_at]})));if(results.some(r=>r.rowsAffected!==1))throw new Error('Concurrent edit; consolidation rolled back');}
   const after=(await tx.execute('SELECT * FROM inventory_items ORDER BY id')).rows;if(after.length!==before.length)throw new Error('Record count changed');
   for(let i=0;i<before.length;i++)for(const field of Object.keys(before[i]))if(field==='product_key'?after[i][field]!==plan[i].key:after[i][field]!==before[i][field])throw new Error('Unexpected change: '+field);
   if(JSON.stringify(ledger)!==JSON.stringify((await tx.execute('SELECT COUNT(*) count,SUM(qty_delta) qty,SUM(value_cents) value FROM inventory_stock_moves')).rows))throw new Error('Stock changed');
   await tx.commit();await writeFile(resolve(out,'applied.json'),JSON.stringify({...summary,identifiersPricesStockPreserved:true},null,2));console.log('APPLIED and verified.');
  }catch(e){await tx.rollback();throw e;}finally{tx.close();}
 }finally{client.close();}
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(fileURLToPath(import.meta.url)))await main();
