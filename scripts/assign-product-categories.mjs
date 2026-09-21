import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
import env from '@next/env';
import {createClient} from '@libsql/client';
const module={exports:{}};
new Function('module','exports',ts.transpileModule(await readFile(new URL('../lib/product-categories.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(module,module.exports);
export const {categoryFromName,productCategories}=module.exports;
const supplierBrand=/^(?:YUNA(?: DARAA)?|SOLAR(?:,\s*BELEG)?|MIKE|KHANGAI)$/i;
export function classification(item){
 const category=item.category||categoryFromName(item.name)||'';
 const misplaced=supplierBrand.test(item.brand.trim());
 return {category,brand:misplaced?'':item.brand,supplier:misplaced&&!item.supplier.trim()?item.brand.trim().toUpperCase():item.supplier};
}
async function main(){
 env.loadEnvConfig(process.cwd());const client=createClient({url:process.env.TURSO_DATABASE_URL,authToken:process.env.TURSO_AUTH_TOKEN});
 try{
  const items=(await client.execute('SELECT * FROM inventory_items ORDER BY id')).rows;
  const plan=items.map(item=>({item,next:classification(item)})),changes=plan.filter(({item,next})=>Object.entries(next).some(([k,v])=>(item[k]??'')!==v));
  const out=resolve('artifacts/product-categories',new Date().toISOString().replaceAll(':','-'));await mkdir(out,{recursive:true});
  const summary={total:items.length,categorized:plan.filter(p=>p.next.category).length,unknown:plan.filter(p=>!p.next.category).length,brandCorrections:plan.filter(p=>p.next.brand!==p.item.brand).length,changes:changes.length,categories:plan.reduce((a,p)=>(a[p.next.category||'Ангилаагүй']=(a[p.next.category||'Ангилаагүй']||0)+1,a),{})};
  await writeFile(resolve(out,'before.json'),JSON.stringify(items,null,2));await writeFile(resolve(out,'plan.json'),JSON.stringify({summary,plan},null,2));
  const csv=data=>'\uFEFF'+[['Код','Бараа','Ангилал','Брэнд','Нийлүүлэгч'],...data.map(p=>[p.item.code,p.item.name,p.next.category,p.next.brand,p.next.supplier])].map(row=>row.map(v=>'"'+String(v).replace(/^[=+\-@\t\r]/,"'$&").replaceAll('"','""')+'"').join(',')).join('\r\n');
  await writeFile(resolve(out,'categories.csv'),csv(plan));await writeFile(resolve(out,'unclassified.csv'),csv(plan.filter(p=>!p.next.category)));console.log(JSON.stringify({...summary,out}));
  if(!process.argv.includes('--apply'))return;
  const tx=await client.transaction('write');
  try{
   const moves=(await tx.execute('SELECT COUNT(*) count,SUM(qty_delta) qty,SUM(value_cents) value FROM inventory_stock_moves')).rows;
   for(let start=0;start<changes.length;start+=100){
    const results=await tx.batch(changes.slice(start,start+100).map(({item,next})=>({sql:'UPDATE inventory_items SET category=?,brand=?,supplier=?,updated_at=? WHERE id=? AND name=? AND category=? AND brand=? AND supplier=? AND updated_at=?',args:[next.category,next.brand,next.supplier,new Date().toISOString(),item.id,item.name,item.category,item.brand,item.supplier,item.updated_at]})));
    if(results.some(r=>r.rowsAffected!==1))throw new Error('Concurrent product update; rolled back');
   }
   const after=(await tx.execute('SELECT * FROM inventory_items ORDER BY id')).rows;
   if(after.length!==items.length)throw new Error('Product count changed');
   for(let i=0;i<items.length;i++){
    for(const [key,value] of Object.entries(plan[i].next))if(after[i][key]!==value)throw new Error('Classification mismatch');
    for(const key of Object.keys(items[i]))if(!['category','brand','supplier','updated_at'].includes(key)&&items[i][key]!==after[i][key])throw new Error('Unexpected change: '+key);
   }
   const nextMoves=(await tx.execute('SELECT COUNT(*) count,SUM(qty_delta) qty,SUM(value_cents) value FROM inventory_stock_moves')).rows;
   if(JSON.stringify(moves)!==JSON.stringify(nextMoves))throw new Error('Stock changed');
   await tx.commit();await writeFile(resolve(out,'applied.json'),JSON.stringify({...summary,pricesAndStockPreserved:true},null,2));console.log('APPLIED and verified.');
  }catch(e){await tx.rollback();throw e;}finally{tx.close();}
 }finally{client.close();}
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(fileURLToPath(import.meta.url)))await main();
