import {planBalance,aliases} from './inventory-sheet-plan.mjs';
import {unionSpreadsheetId} from './inventory-sheet-source.mjs';

/**
 * AOM Inventory workbook-ийн бүх холбогдох табыг (Balance, Purchase, Sales) CRM-тэй тулгана. ЗӨВХӨН тайлан:
 * өгөгдлийн сан, Sheet аль алинд нь юу ч бичихгүй.
 *
 * 1. stock        — Balance-ийн эцсийн үлдэгдэл (C2) ↔ CRM-ийн үлдэгдэл (planBalance-ийн дүрмээр) + Sheet-д мөргүй CRM үлдэгдэл.
 * 2. movements    — Balance-ийн C1/орлого/зарлага/C2-ийг Purchase, Sales табаас Balance-ийн томьёотой ижил дүрмээр
 *                   дахин тооцож харьцуулна (код бүрээр; томьёо эвдэрсэн, гараар бичсэн утга, давхар/мөргүй кодыг илрүүлнэ).
 * 3. transactions — сонгосон хугацааны Purchase/Sales мөрүүдийг CRM-ийн purchase/purchase_return/sale/sale_reversal хөдөлгөөнтэй
 *                   өдөр ба код бүрээр тулгана.
 */
const clean=v=>String(v??'').normalize('NFKC').trim().replace(/\s+/g,' ').toUpperCase();
const isNum=v=>typeof v==='number'&&Number.isFinite(v);
const num=v=>isNum(v)?v:0;
// Sheets-ийн огнооны serial (1899-12-30-оос хоног) → 'YYYY-MM-DD'.
export const serialDay=n=>isNum(n)?new Date(Date.UTC(1899,11,30)+Math.floor(n)*86400000).toISOString().slice(0,10):'';
const RECEIVED='ХҮЛЭЭН АВСАН',RETURNED='БУЦААСАН';
const LIMIT=2000;
const cap=rows=>({rows:rows.slice(0,LIMIT),total:rows.length,truncated:rows.length>LIMIT});

function balanceRows(values){
 const h=values[1]||[];
 for(const [i,name] of [[1,'Код'],[3,'Нэр'],[7,'Агуулах'],[8,'Тоо ширхэг c1'],[11,'Орлого тоо'],[13,'Зарлага тоо'],[15,'Тоо ширхэг c2']])
  if(clean(h[i])!==clean(name))throw Error('Unexpected Balance header: '+i);
 return values.slice(2).map((r,i)=>({row:i+3,code:clean(r[1]),rawCode:String(r[1]??''),name:String(r[3]??''),warehouse:String(r[7]??''),c1:r[8],in:r[11],out:r[13],c2:r[15]})).filter(r=>r.code||r.name);
}
function purchaseRows(values){
 if(!values.length)return null;
 const h=values[1]||[];
 for(const [i,name] of [[2,'Ирсэн огноо'],[3,'Код'],[5,'Нэр'],[9,'Төлөв'],[10,'Тоо']])if(clean(h[i])!==clean(name))throw Error('Unexpected Purchase header: '+i);
 return values.slice(2).map((r,i)=>({row:i+3,date:r[2],code:clean(r[3]),rawCode:String(r[3]??''),name:String(r[5]??''),status:clean(r[9]),qty:r[10]})).filter(r=>r.code);
}
function salesRows(values){
 if(!values.length)return null;
 const h=values[1]||[];
 for(const [i,name] of [[0,'Огноо'],[5,'Код'],[6,'Нэр'],[9,'Тоо']])if(clean(h[i])!==clean(name))throw Error('Unexpected Sales header: '+i);
 return values.slice(2).map((r,i)=>({row:i+3,date:r[0],code:clean(r[5]),rawCode:String(r[5]??''),name:String(r[6]??''),qty:r[9]})).filter(r=>r.code);
}

/**
 * @param {{spreadsheetId:string,title?:string,readAt:string,tabs:{Balance:unknown[][],Purchase:unknown[][],Sales:unknown[][]}}} workbook
 * @param {{items:any[],warehouses:any[],balances:any[]}} crm  inventorySnapshot()-ийн үр дүн
 * @param {{code:string,warehouse_id:string,kind:string,qty_delta:number,day:string}[]} crmMoves  хугацааны purchase/purchase_return/sale хөдөлгөөн (УБ өдөр)
 * @param {{from:string,to:string}} range  УБ өдрүүд, хоёулаа орно
 */
export function reconcileWorkbook(workbook,crm,crmMoves,range){
 const B=workbook.tabs.Balance,balances=balanceRows(B);
 const periodStart=B[0]?.[16],periodEnd=B[0]?.[17];
 const purchases=purchaseRows(workbook.tabs.Purchase||[]),sales=salesRows(workbook.tabs.Sales||[]);
 const itemsByCode=new Map();for(const i of crm.items){const c=clean(i.code);if(c)itemsByCode.set(c,(itemsByCode.get(c)||[]).concat(i));}
 // Sheet бүр зөвхөн өөрийн агуулахуудыг хамарна: Union → UNION; үндсэн → Balance-д байгаа агуулахууд (синкийн холбоосоор).
 const scopeNames=workbook.spreadsheetId===unionSpreadsheetId?new Set(['UNION']):new Set(balances.map(r=>aliases[clean(r.warehouse)]||clean(r.warehouse)).filter(Boolean));
 const scope=new Set(crm.warehouses.filter(w=>scopeNames.has(clean(w.name))).map(w=>w.id));

 // 1. Үлдэгдэл: Sheet ↔ CRM
 const plan=planBalance({spreadsheetId:workbook.spreadsheetId,values:B},crm);
 const stock=[
  ...plan.changes.map(c=>({row:c.row,code:c.code,name:itemsByCode.get(clean(c.code))?.[0]?.name||'',warehouse:c.warehouse,sheet:c.after,crm:c.before,delta:c.after-c.before,reason:'Үлдэгдэл зөрсөн'})),
  ...plan.issues.map(i=>({row:i.row,code:i.code,name:i.name,warehouse:'',sheet:isNum(i.quantity)?i.quantity:null,crm:null,delta:null,reason:i.reason})),
 ];
 const sheetCodes=new Set(balances.map(r=>r.code));
 const warehouseName=new Map(crm.warehouses.map(w=>[w.id,w.name])),itemById=new Map(crm.items.map(i=>[i.id,i]));
 for(const b of crm.balances){
  if(!(Number(b.qty)>0)||!scope.has(b.warehouse_id))continue;
  const item=itemById.get(b.item_id);if(!item||sheetCodes.has(clean(item.code)))continue;
  stock.push({row:null,code:item.code||'',name:item.name,warehouse:warehouseName.get(b.warehouse_id)||'',sheet:null,crm:Number(b.qty),delta:null,reason:'CRM-д үлдэгдэлтэй, Sheet-ийн Balance-д мөргүй'});
 }

 // 2. Хөдөлгөөн ↔ Balance (Sheet доторх уялдаа)
 const movements=[];
 if(purchases&&sales&&isNum(periodStart)&&isNum(periodEnd)){
  const agg=new Map(),get=c=>{if(!agg.has(c))agg.set(c,{c1:0,in:0,out:0});return agg.get(c);};
  const badDate=[];
  for(const p of purchases){
   if(p.status!==RECEIVED&&p.status!==RETURNED)continue;
   if(!isNum(p.date)||!isNum(p.qty)){badDate.push({tab:'Purchase',row:p.row,code:p.rawCode,name:p.name,reason:!isNum(p.date)?'Ирсэн огноо хоосон/буруу — Balance-д тоологдохгүй':'Тоо буруу'});continue;}
   const sign=p.status===RECEIVED?1:-1,a=get(p.code);
   if(p.date<=periodStart)a.c1+=sign*p.qty;else if(p.date<=periodEnd)a.in+=sign*p.qty;
  }
  for(const s of sales){
   if(!isNum(s.date)||!isNum(s.qty)){badDate.push({tab:'Sales',row:s.row,code:s.rawCode,name:s.name,reason:!isNum(s.date)?'Огноо хоосон/буруу — Balance-д тоологдохгүй':'Тоо буруу'});continue;}
   const a=get(s.code);
   if(s.date<=periodStart)a.c1-=s.qty;else if(s.date<=periodEnd)a.out+=s.qty;
  }
  const dup=new Map();for(const r of balances)if(r.code)dup.set(r.code,(dup.get(r.code)||0)+1);
  for(const r of balances){
   if(!r.code)continue;
   const e=agg.get(r.code)||{c1:0,in:0,out:0},exp={c1:e.c1,in:e.in,out:e.out,c2:e.c1+e.in-e.out};
   const base={row:r.row,code:r.rawCode,name:r.name,warehouse:r.warehouse,sheet:{c1:r.c1,in:r.in,out:r.out,c2:r.c2},expected:exp};
   if(dup.get(r.code)>1){movements.push({...base,reason:'Balance-д код давхардсан — хөдөлгөөн мөр бүрт давхар тоологдоно'});continue;}
   if([r.c1,r.in,r.out,r.c2].some(v=>!isNum(v))){movements.push({...base,reason:'Balance-ийн тоо хоосон/текст'});continue;}
   if(Math.round(r.c1+r.in-r.out)!==Math.round(r.c2))movements.push({...base,reason:'C1 + орлого − зарлага ≠ C2'});
   else if(['c1','in','out','c2'].some(k=>Math.round(r[k])!==Math.round(exp[k])))movements.push({...base,reason:'Purchase/Sales-аас тооцсон дүнтэй зөрсөн (томьёо эвдэрсэн эсвэл гараар бичсэн)'});
   else if(r.c2<0)movements.push({...base,reason:'Сөрөг үлдэгдэл — зарсан тоо орлогоос их'});
  }
  // Balance-д мөргүй кодын хөдөлгөөн: үлдэгдэлд огт тусахгүй.
  const orphan=new Map();
  for(const [tab,list] of [['Purchase',purchases],['Sales',sales]])for(const r of list){
   if(sheetCodes.has(r.code)||(tab==='Purchase'&&r.status!==RECEIVED&&r.status!==RETURNED))continue;
   const o=orphan.get(r.code)||{code:r.rawCode,name:r.name,purchase:0,sales:0,rows:[]};
   o[tab==='Purchase'?'purchase':'sales']+=num(r.qty)*(tab==='Purchase'&&r.status===RETURNED?-1:1);if(o.rows.length<5)o.rows.push(tab+' '+r.row);orphan.set(r.code,o);
  }
  for(const o of orphan.values())movements.push({row:null,code:o.code,name:o.name,warehouse:'',sheet:null,expected:{c1:0,in:o.purchase,out:o.sales,c2:o.purchase-o.sales},reason:'Balance-д мөргүй код ('+o.rows.join(', ')+')'});
  for(const b of badDate)movements.push({row:b.row,code:b.code,name:b.name,warehouse:b.tab,sheet:null,expected:null,reason:b.tab+': '+b.reason});
 }

 // 3. Гүйлгээ: Sheet ↔ CRM, өдөр ба код бүрээр
 const transactions=[];
 if(purchases&&sales){
  const key=(day,code,kind)=>day+'\u0000'+code+'\u0000'+kind,m=new Map();
  const add=(day,code,kind,side,qty,name,ref)=>{if(day<range.from||day>range.to)return;const k=key(day,code,kind);const v=m.get(k)||{day,code,kind,name:'',sheet:0,crm:0,rows:[]};v[side]+=qty;if(name&&!v.name)v.name=name;if(ref&&v.rows.length<5)v.rows.push(ref);m.set(k,v);};
  for(const p of purchases)if((p.status===RECEIVED||p.status===RETURNED)&&isNum(p.date)&&isNum(p.qty))add(serialDay(p.date),p.code,'purchase','sheet',p.status===RECEIVED?p.qty:-p.qty,p.name,'Purchase '+p.row);
  for(const s of sales)if(isNum(s.date)&&isNum(s.qty))add(serialDay(s.date),s.code,'sale','sheet',s.qty,s.name,'Sales '+s.row);
  for(const mv of crmMoves){const code=clean(mv.code);if(!code||!scope.has(mv.warehouse_id))continue;
   if(mv.kind==='purchase'||mv.kind==='purchase_return')add(mv.day,code,'purchase','crm',Number(mv.qty_delta),'','');
   // Засагдсан/устгагдсан борлуулалтын буцаалт (sale_reversal) анхны огноогоороо бичигддэг тул борлуулалттай нийлж цэвэр тоо гарна.
   else if(mv.kind==='sale'||mv.kind==='sale_reversal')add(mv.day,code,'sale','crm',-Number(mv.qty_delta),'','');}
  for(const v of m.values()){
   if(v.sheet===v.crm)continue;
   const known=itemsByCode.has(v.code);
   const reason=!v.crm?(known?'CRM-д бүртгэгдээгүй':'CRM-д бараа олдоогүй'):!v.sheet?'Sheet-д бүртгэгдээгүй':'Тоо зөрсөн';
   transactions.push({day:v.day,code:v.code,name:v.name||itemsByCode.get(v.code)?.[0]?.name||'',kind:v.kind==='purchase'?'Худалдан авалт':'Борлуулалт',sheet:v.sheet,crm:v.crm,delta:v.sheet-v.crm,reason,rows:v.rows.join(', ')});
  }
  transactions.sort((a,b)=>b.day.localeCompare(a.day)||a.code.localeCompare(b.code));
 }

 return {
  title:workbook.title,readAt:workbook.readAt,
  period:{start:serialDay(periodStart),end:serialDay(periodEnd)},range,
  warehouses:crm.warehouses.filter(w=>scope.has(w.id)).map(w=>w.name),
  tabs:{balance:balances.length,purchase:purchases?.length??null,sales:sales?.length??null},
  summary:{stockMatched:plan.unchanged,stockIssues:stock.length,movementIssues:movements.length,transactionIssues:transactions.length,
   transactionsChecked:!!(purchases&&sales),movementsChecked:!!(purchases&&sales&&isNum(periodStart)&&isNum(periodEnd))},
  stock:cap(stock),movements:cap(movements),transactions:cap(transactions),
 };
}
