import assert from 'node:assert/strict';
import {reconcileWorkbook,serialDay} from '../scripts/inventory-reconcile.mjs';

// Тайлант хугацаа: Q1=46295 (2026-09-30), R1=46296 (2026-10-01).
assert.equal(serialDay(46295),'2026-09-30');
const Q1=46295,R1=46296;
const balanceHeader=Array(24).fill('');
for(const [i,v] of [[1,'Код'],[3,'Нэр'],[6,'Imei'],[7,'Агуулах'],[8,'Тоо ширхэг  c1'],[11,'Орлого тоо'],[13,'Зарлага тоо'],[15,'Тоо ширхэг  c2'],[16,'Нэгжийн үнэ c2']])balanceHeader[i]=v;
const top=Array(24).fill('');top[16]=Q1;top[17]=R1;
const bal=(code,name,c1,inn,out,c2,wh='Урд агуулах')=>{const r=Array(24).fill('');Object.assign(r,{1:code,3:name,7:wh,8:c1,11:inn,13:out,15:c2,16:1000});return r;};
const purchaseHeader=['Захиалгын огноо','Захиалгын дугаар','Ирсэн огноо','Код','Брэнд / Нийлүүлэгч','Нэр','Хэмжээ','Өнгө','Imei','Төлөв','Тоо'];
const pur=(date,code,name,status,qty)=>['','',date,code,'',name,'','','',status,qty];
const salesHeader=['Огноо','Билл дугаар','Харилцагч','Утас','Брэнд / Нийлүүлэгч','Код','Нэр','Платформ','Салбар','Тоо'];
const sale=(date,code,name,qty)=>[date,'','','','',code,name,'','',qty];

const workbook={spreadsheetId:'test',title:'AOM',readAt:'2026-10-01T00:00:00.000Z',tabs:{
 Balance:[top,balanceHeader,
  bal('OK','Good item',5,2,1,6),          // бүх зүйл таарна
  bal('ARITH','Broken arith',5,0,0,4),     // C1+орл−зарл≠C2
  bal('HARD','Hardcoded',9,0,0,9),         // Purchase-аас 3 гарах ёстой
  bal('DUP','Dup',1,0,0,1),bal('DUP','Dup',1,0,0,1),
  bal('CRMDIFF','CRM differs',2,0,0,2),
 ],
 Purchase:[['x'],purchaseHeader,
  pur(46290,'OK','Good item','Хүлээн авсан',6),pur(46291,'OK','Good item','Буцаасан',1),pur(46296,'OK','Good item','Хүлээн авсан',2),
  pur(46200,'ARITH','Broken arith','Хүлээн авсан',5),
  pur(46200,'HARD','Hardcoded','Хүлээн авсан',3),
  pur(46200,'DUP','Dup','Хүлээн авсан',1),
  pur(46200,'CRMDIFF','CRM differs','Хүлээн авсан',2),
  pur(46296,'ORPHAN','Not in balance','Хүлээн авсан',4),
  pur('','OK','Good item','Хүлээн авсан',1),                // огноогүй
 ],
 Sales:[['ӨС'],salesHeader,
  sale(46296,'OK','Good item',1),
  sale(46296,'CRMDIFF','CRM differs',1),                    // Sheet-д байгаа, CRM-д үгүй... гэвч Balance C2=2 гэж бичсэн
 ],
}};
// CRMDIFF-ийн Balance нь зарлагыг тусгаагүй тул movements-д ч зөрнө.
const crm={
 items:[{id:'ok',code:'OK',name:'Good item',active:1,imei:'',capacity:'',color:''},{id:'crm',code:'CRMDIFF',name:'CRM differs',active:1,imei:'',capacity:'',color:''},{id:'extra',code:'EXTRA',name:'Only in CRM',active:1,imei:'',capacity:'',color:''}],
 warehouses:[{id:'w',name:'Сонсголон агуулах'},{id:'u',name:'Union'}],
 balances:[{item_id:'ok',warehouse_id:'w',qty:6,value_cents:6000},{item_id:'crm',warehouse_id:'w',qty:5,value_cents:5000},{item_id:'extra',warehouse_id:'w',qty:3,value_cents:300},
  {item_id:'extra',warehouse_id:'u',qty:7,value_cents:700}],                                                         // Union — үндсэн sheet-ийн хүрээнд биш
};
const mv0=(code,kind,qty_delta,day,warehouse_id='w')=>({code,warehouse_id,kind,qty_delta,day});
const moves=[
 mv0('OK','purchase',2,'2026-10-01'),mv0('OK','sale',-1,'2026-10-01'),   // Sheet-тэй таарна
 mv0('CRMDIFF','sale',-2,'2026-10-01'),                                   // Sheet 1, CRM 2
 mv0('CRMONLY','purchase',1,'2026-09-30'),                                // Sheet-д байхгүй
 mv0('OK','sale',-9,'2026-08-01'),                                        // хугацаанаас гадуур
 mv0('OK','sale',-4,'2026-10-01','u'),                                    // Union агуулахын борлуулалт — тоологдохгүй
 mv0('DELETED','sale',-2,'2026-09-30'),mv0('DELETED','sale_reversal',2,'2026-09-30'), // устгагдсан борлуулалт → цэвэр 0
];
crm.items.push({id:'del',code:'DELETED',name:'Deleted sale',active:1,imei:'',capacity:'',color:''});
const r=reconcileWorkbook(workbook,crm,moves,{from:'2026-09-30',to:'2026-10-01'});

// 1. Үлдэгдэл
const stock=Object.fromEntries(r.stock.rows.map(x=>[x.code+':'+x.reason,x]));
assert.ok(stock['CRMDIFF:Үлдэгдэл зөрсөн'],'CRM-ийн үлдэгдэл зөрсөн');assert.equal(stock['CRMDIFF:Үлдэгдэл зөрсөн'].delta,-3);
assert.ok(stock['EXTRA:CRM-д үлдэгдэлтэй, Sheet-ийн Balance-д мөргүй']);
assert.equal(r.stock.rows.filter(x=>x.code==='EXTRA').length,1,'Union агуулахын үлдэгдэл үндсэн sheet-д тулгагдахгүй');
assert.deepEqual(r.warehouses,['Сонсголон агуулах']);
assert.ok(!r.stock.rows.some(x=>x.code==='OK'),'таарсан бараа тайланд орохгүй');
assert.equal(r.summary.stockMatched,1);

// 2. Хөдөлгөөн ↔ Balance
const mv=code=>r.movements.rows.filter(x=>x.code===code).map(x=>x.reason);
assert.deepEqual(mv('OK').filter(x=>!x.startsWith('Purchase:')),[],'OK мөр таарна');
assert.match(mv('ARITH')[0],/C1 \+ орлого − зарлага ≠ C2/);
assert.match(mv('HARD')[0],/Purchase\/Sales-аас тооцсон/);
assert.equal(mv('DUP').length,2);assert.match(mv('DUP')[0],/давхардсан/);
assert.match(mv('CRMDIFF')[0],/Purchase\/Sales-аас тооцсон/);
assert.match(mv('ORPHAN')[0],/Balance-д мөргүй код \(Purchase 10\)/);
assert.deepEqual(mv('OK'),['Purchase: Ирсэн огноо хоосон/буруу — Balance-д тоологдохгүй'],'огноогүй мөрийг л мэдээлнэ');

// 3. Гүйлгээ
const tx=Object.fromEntries(r.transactions.rows.map(x=>[`${x.day}:${x.kind}:${x.code}`,x]));
assert.equal(tx['2026-10-01:Борлуулалт:CRMDIFF'].reason,'Тоо зөрсөн');assert.equal(tx['2026-10-01:Борлуулалт:CRMDIFF'].delta,-1);
assert.equal(tx['2026-09-30:Худалдан авалт:CRMONLY'].reason,'Sheet-д бүртгэгдээгүй');
assert.equal(tx['2026-10-01:Худалдан авалт:ORPHAN'].reason,'CRM-д бараа олдоогүй');
assert.ok(!tx['2026-10-01:Худалдан авалт:OK']&&!tx['2026-10-01:Борлуулалт:OK'],'таарсан гүйлгээ тайланд орохгүй');
assert.ok(!r.transactions.rows.some(x=>x.day<'2026-09-30'),'хугацаанаас гадуурх гүйлгээ (Sheet 09-25/26, CRM 08-01) орохгүй');
assert.equal(r.transactions.total,3);
assert.ok(!r.transactions.rows.some(x=>x.code==='DELETED'),'устгагдсан борлуулалт (sale + sale_reversal) зөрүү гаргахгүй');

// Purchase/Sales табгүй эх сурвалж (жишээ нь Union) — зөвхөн үлдэгдлийг шалгана.
const onlyBalance=reconcileWorkbook({...workbook,tabs:{Balance:workbook.tabs.Balance,Purchase:[],Sales:[]}},crm,moves,{from:'2026-09-24',to:'2026-10-01'});
assert.equal(onlyBalance.summary.movementsChecked,false);assert.equal(onlyBalance.summary.transactionsChecked,false);
assert.equal(onlyBalance.movements.total,0);assert.equal(onlyBalance.transactions.total,0);

// Гарчиг өөрчлөгдвөл тодорхой алдаа.
const broken=structuredClone(workbook);broken.tabs.Sales[1][5]='SKU';
assert.throws(()=>reconcileWorkbook(broken,crm,moves,{from:'2026-09-24',to:'2026-10-01'}),/Unexpected Sales header/);
console.log('inventory-reconcile: ok');
