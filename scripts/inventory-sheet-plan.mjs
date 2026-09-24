import {createHash} from 'node:crypto';
import {unionSpreadsheetId} from './inventory-sheet-source.mjs';
const clean=v=>String(v??'').normalize('NFKC').trim().replace(/\s+/g,' ').toUpperCase();
const aliases={'АРЫН АГУУЛАХ':'OLYMPIC GALLERIA','ЗААЛ':'ҮЗҮҮЛЭН','УРД АГУУЛАХ':'СОНСГОЛОН АГУУЛАХ'};
export function planBalance(source,crm){
 const union=source.spreadsheetId===unionSpreadsheetId;
 const end=source.values[0]?.[17];
 if(union&&(!Number.isInteger(end)||end<40000||end>60000))throw Error('Union report date invalid');
 const cutoff=union?new Date(Date.UTC(1899,11,30)+(end+1)*86400000-8*3600000).toISOString():null;
 const h=source.values[1]||[];
 for(const [i,name] of [[1,'Код'],[3,'Нэр'],[6,'Imei'],[7,'Агуулах'],[15,'Тоо ширхэг c2'],[16,'Нэгжийн үнэ c2']])if(clean(h[i])!==clean(name))throw Error('Unexpected Balance header: '+i);
 const issues=[],targets=[],changes=[],seen=new Map();
 const rows=source.values.slice(2).map((r,i)=>({r,row:i+3})).filter(({r})=>r.some(v=>v!==''&&v!==null));
 for(const {r,row} of rows){const code=clean(r[1]);if(code)seen.set(code,(seen.get(code)||0)+1);}
 for(const {r,row} of rows){
  if(union&&clean(r[7])!=='АРЫН АГУУЛАХ')continue;
  const code=clean(r[1]),name=clean(r[3]),qty=r[15];
  const reject=reason=>issues.push({row,code:String(r[1]??''),name:String(r[3]??''),quantity:qty,reason});
  if(!code||!name){reject('Код эсвэл нэр хоосон');continue;}
  if(seen.get(code)!==1){reject('Sheet-д код давхардсан');continue;}
  if(!Number.isSafeInteger(qty)||qty<0||qty>1000000){reject('Үлдэгдэл буруу');continue;}
  const candidates=crm.items.filter(i=>clean(i.code)===code);
  if(candidates.length!==1){reject(candidates.length?'CRM-д код давхардсан':'CRM-д код олдоогүй');continue;}
  const item=candidates[0];
  if(!item.active||clean(item.name)!==name){reject('Нэр эсвэл идэвхтэй төлөв зөрсөн');continue;}
  if(clean(item.imei)!==clean(r[6])||clean(item.capacity)!==clean(r[4])||clean(item.color)!==clean(r[5])){reject('IMEI, багтаамж эсвэл өнгө зөрсөн');continue;}
  const warehouseName=union?'UNION':aliases[clean(r[7])]||clean(r[7]);
  const warehouses=crm.warehouses.filter(w=>clean(w.name)===warehouseName);
  if(warehouses.length!==1){reject('Агуулах олдоогүй');continue;}
  const warehouse=warehouses[0];
  if(qty>0&&crm.balances.some(b=>b.item_id===item.id&&b.warehouse_id!==warehouse.id&&b.qty>0)){reject('Өөр агуулахт үлдэгдэлтэй — шилжүүлгийг тулгах шаардлагатай');continue;}
  if(/^\d{15}$/.test(clean(r[6]))&&(qty>1||rows.filter(({r:other})=>clean(other[6])===clean(r[6])&&other[15]>0).length>1)){reject('IMEI-ийн үлдэгдэл давхардсан');continue;}
  const stock=crm.balances.find(b=>b.item_id===item.id&&b.warehouse_id===warehouse.id)||{qty:0,value_cents:0};
  if(cutoff&&stock.last_movement_at&&stock.last_movement_at>=cutoff){reject('Тайлангийн өдрөөс хойш CRM хөдөлгөөнтэй');continue;}
  if(stock.qty<0||stock.value_cents<0){reject('CRM үлдэгдэл эсвэл өртөг сөрөг');continue;}
  const delta=qty-stock.qty;
  let value=0;
  if(delta<0)value=qty===0?-stock.value_cents:-Math.round(stock.value_cents/stock.qty*-delta);
  if(delta>0){const unit=stock.qty>0?stock.value_cents/stock.qty:typeof r[16]==='number'&&Number.isFinite(r[16])&&r[16]>=0?r[16]*100:NaN;
   if(!Number.isFinite(unit)){reject('Нэмэгдэх үлдэгдлийн өртөг тодорхойгүй');continue;}value=Math.round(unit*delta);}
  if(!Number.isSafeInteger(value)||Math.abs(value)>9000000000000){reject('Өртгийн хэмжээ буруу');continue;}
  const target={row,item_id:item.id,code:item.code,warehouse_id:warehouse.id,warehouse:warehouse.name,before:stock.qty,after:qty,delta,value_cents:value,cost_estimated:stock.cost_estimated||0};
  targets.push(target);if(delta)changes.push(target);
 }
 const digest=createHash('sha256').update(JSON.stringify({spreadsheetId:source.spreadsheetId,values:source.values})).digest('hex');
 const planDigest=createHash('sha256').update(JSON.stringify({digest,targets,issues})).digest('hex');
 return {digest,planDigest,sourceRows:rows.length,matched:targets.length,unchanged:targets.length-changes.length,changes,issues,targets};
}
