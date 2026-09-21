import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import env from '@next/env';
import {createClient} from '@libsql/client';
import {parseProducts} from './product-brand-sync.mjs';

const normalize=s=>s.normalize('NFKC').trim().replace(/\s+/g,' ').toUpperCase();
export function sourceIndex(rows){
 const index=new Map();
 for(const row of rows){
  const features=[...row.Features.matchAll(/(?:^|;\s*)Брэнд:\s*[ES]\[([^\]]+)\]/g)].map(m=>m[1]);
  const categories=row['Secondary categories'].split(';').map(s=>s.trim()).filter(s=>s.startsWith('Брэндүүд///')).map(s=>s.split('///')[1]);
  const key=normalize(row['Product name']),values=index.get(key)||new Set();
  (features.length?features:categories).forEach(v=>values.add(normalize(v)));index.set(key,values);
 }
 return index;
}
const explicit=/^\[?(APPLE|SAMSUNG|DYSON|DJI|POUT|BODYLABS|CUCKOO|DEERMA|DELL|ACER|ASUS|TECNO|SONY|EPSON|HP|AIMA|BELKIN|JBL|HIKVISION|UGREEN|MAMIBOT|MOPHIE|BEATS)\b/;
// Prefixes refer to the product itself, never a "for Apple/Samsung" compatibility suffix.
export function identify(name,index=new Map()){
 const n=normalize(name),source=index.get(n);
 const branded=n.match(explicit)?.[1];
 if(source?.size>1)return {brand:null,reason:'CSV брэндүүд зөрчилтэй'};
 if(source?.size===1){
  const brand=[...source][0];
  if(branded&&branded!==brand)return {brand:null,reason:'Нэрийн брэнд CSV-тэй зөрчилтэй'};
  return {brand,reason:'CSV-ийн ижил нэр'};
 }
 if(branded)return {brand:branded,reason:'Нэрийн эхэнд брэнд тодорхой'};
 if(/^G\.?SKILL\b/.test(n))return {brand:'G.SKILL',reason:'Нэрэнд G.SKILL брэнд тодорхой'};
 if(/^\d+\s+(?:PM|PRO)\s+BEATS\s+CASE\b/.test(n))return {brand:'BEATS',reason:'Нэрэнд Beats гэр гэж тодорхой'};
 if(/^(?:EYES\s*\d+|HANDS\s*\d+|TEKDE[CK]\s+2\b|TABLETOP\s*-\s*PCH\b|GAME STATION 1\b)/.test(n))return {brand:'POUT',reason:'CSV / POUT бүтээгдэхүүний цуврал'};
 if(/^KOMFORT MASSAGER FOOTREST\b/.test(n))return {brand:'BODYLABS',reason:'CSV-ийн BodyLabs KomFort цуврал'};
 // Generic cases, protectors and replacement parts cannot inherit the device maker.
 if(/\b(?:CASE|NAALT|COVER|PROTECTOR|FILTER|ADAPTER|BATTERY|STRAP)\b|НААЛТ|КЕЙС/.test(n))return {brand:null,reason:'Дагалдах хэрэгслийн үйлдвэрлэгч тодорхойгүй'};
 if(/^(?:IPHONE|IPAD|AIRPODS|EARPODS|MACBOOK|HOMEPOD)\b|^MAC MINI\b|^MAGIC MOUSE\b|^LIGHTNING EARPODS\b/.test(n))return {brand:'APPLE',reason:'Apple-ийн бүтээгдэхүүний цуврал'};
 if(/^IWATCH\s+(?:S\d+|SE\d*|SER(?:IES)?\s+\d+|ULTRA)\b/.test(n))return {brand:'APPLE',reason:'Бүртгэлийн iWatch нэршил, Watch загварын цуврал'};
 if(/^PENCIL (?:PRO|2ND|USB-C)$/.test(n))return {brand:'APPLE',reason:'CSV / Apple Pencil загварын нэр'};
 if(/^GALAXY\b|^S25 ULTRA$/.test(n))return {brand:'SAMSUNG',reason:'Samsung Galaxy бүтээгдэхүүний цуврал'};
 if(/^(?:OSMO|AVATA|MAVIC)\b|^MINI 5 PRO FLY MORE COMBO\b/.test(n))return {brand:'DJI',reason:'CSV / DJI бүтээгдэхүүний цуврал'};
 if(/^PS5\b/.test(n))return {brand:'SONY',reason:'Sony PlayStation 5 цуврал'};
 if(n==='V15S')return {brand:'DYSON',reason:'CSV / Dyson V15s цуврал'};
 return {brand:null,reason:'Нэрээс брэндийг баттай тогтоох боломжгүй'};
}
export function classify(items,rows){
 const index=sourceIndex(rows);
 return items.map(item=>({...item,previous:item.brand,...identify(item.name,index)}));
}
async function main(){
 const file=process.argv[2];if(!file)throw new Error('Usage: node scripts/classify-product-brands.mjs <csv> [--apply]');
 env.loadEnvConfig(process.cwd());
 const client=createClient({url:process.env.TURSO_DATABASE_URL,authToken:process.env.TURSO_AUTH_TOKEN});
 try{
  const source=await readFile(file,'utf8'),items=(await client.execute('SELECT * FROM inventory_items ORDER BY id')).rows;
  const results=classify(items,parseProducts(source)),changes=results.filter(r=>r.brand&&r.brand!==r.previous),uncertain=results.filter(r=>!r.brand);
  const out=resolve('artifacts/name-brand-classification',new Date().toISOString().replaceAll(':','-'));await mkdir(out,{recursive:true});
  const summary={total:items.length,identified:results.length-uncertain.length,changed:changes.length,uncertain:uncertain.length,brands:results.filter(r=>r.brand).reduce((a,r)=>(a[r.brand]=(a[r.brand]||0)+1,a),{})};
  await writeFile(resolve(out,'plan.json'),JSON.stringify({source:resolve(file),sourceHash:createHash('sha256').update(source).digest('hex'),summary,results},null,2));
  await writeFile(resolve(out,'before.json'),JSON.stringify(items,null,2));
  const csv=data=>'\uFEFF'+[['Код','Барааны нэр','Өмнөх брэнд','Тодорхойлсон брэнд','Үндэслэл'],...data.map(r=>[r.code,r.name,r.previous,r.brand||'',r.reason])].map(row=>row.map(v=>'"'+String(v).replace(/^[=+\-@\t\r]/,"'$&").replaceAll('"','""')+'"').join(',')).join('\r\n');
  await writeFile(resolve(out,'classification.csv'),csv(results));await writeFile(resolve(out,'uncertain.csv'),csv(uncertain));
  console.log(JSON.stringify({...summary,out}));
  if(!process.argv.includes('--apply'))return;
  const tx=await client.transaction('write');
  try{
   const ledger=(await tx.execute('SELECT COUNT(*) count,SUM(qty_delta) qty,SUM(value_cents) value FROM inventory_stock_moves')).rows;
   // Batch requests avoid a round trip for each of the thousands of individual items.
   for(let start=0;start<changes.length;start+=100){
    const batch=changes.slice(start,start+100).map(r=>({sql:'UPDATE inventory_items SET brand=?,updated_at=? WHERE id=? AND name=? AND brand=? AND supplier=? AND updated_at=?',args:[r.brand,new Date().toISOString(),r.id,r.name,r.previous,r.supplier,r.updated_at]}));
    const applied=await tx.batch(batch);if(applied.some(r=>r.rowsAffected!==1))throw new Error('Concurrent product edit; rolled back');
   }
   const after=(await tx.execute('SELECT * FROM inventory_items ORDER BY id')).rows,expected=new Map(results.map(r=>[r.id,r.brand||r.previous]));
   if(after.length!==items.length)throw new Error('Product count changed');
   for(let i=0;i<items.length;i++){
    if(after[i].brand!==expected.get(items[i].id))throw new Error('Brand verification failed');
    for(const key of Object.keys(items[i]))if(!['brand','updated_at'].includes(key)&&items[i][key]!==after[i][key])throw new Error('Unexpected product change: '+key);
   }
   const nextLedger=(await tx.execute('SELECT COUNT(*) count,SUM(qty_delta) qty,SUM(value_cents) value FROM inventory_stock_moves')).rows;
   if(JSON.stringify(ledger)!==JSON.stringify(nextLedger))throw new Error('Stock changed');
   await tx.commit();await writeFile(resolve(out,'applied.json'),JSON.stringify({...summary,stockPreserved:true,otherFieldsPreserved:true},null,2));console.log('APPLIED and verified.');
  }catch(e){await tx.rollback();throw e;}finally{tx.close();}
 }finally{client.close();}
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(fileURLToPath(import.meta.url)))await main();
