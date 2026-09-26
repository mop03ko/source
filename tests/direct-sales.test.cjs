// Шууд бэлэн борлуулалт: зарагчийн бүртгэл, эрх, ажилтны үзүүлэлтэд тусах нь.
const fs=require('fs');
const source=fs.readFileSync('tests/serials.test.cjs','utf8');
const bootstrap=source.slice(0,source.indexOf('\n(async()=>{'));
const scenario=String.raw`
(async()=>{
 await crmRoute.GET(new Request('https://crm.test/api/crm')); // owner → admin
 for(const m of [{email:'a1@example.test',name:'Агент Нэг',role:'agent'},{email:'a2@example.test',name:'Агент Хоёр',role:'agent'},{email:'mg@example.test',name:'Ахлах',role:'manager'}])
  assert.equal((await json(await post(crmRoute,{action:'member',data:{...m,active:true}})))[0],200);
 const wh=(await stock('create_warehouse',{name:'Заал'}))[1].id;
 const item=(await stock('create_item',{code:'TV-55',brand:'LG',name:'LG OLED 55',sale_price:3000000}))[1].id;
 assert.equal((await stock('record_purchase',{item_id:item,warehouse_id:wh,qty:10,unit_cost:2000000,payment_status:'Төлөгдсөн'}))[0],200);
 const sale=(o={})=>({item_id:item,warehouse_id:wh,qty:1,unit_price:3000000,customer_name:'Дорж',customer_phone:'99112233',...o});

 // Агент өөрийн нэр дээр шууд борлуулалт бүртгэнэ.
 user={userId:'a1',email:'a1@example.test',displayName:'Агент Нэг'};
 let [status,d]=await stock('record_sale',sale({seller:'a1@example.test'}));
 assert.equal(status,200,JSON.stringify(d));
 assert.equal(d.status,'pending');
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM inventory_sales').get().n,0);
 user={userId:'mg',email:'mg@example.test',displayName:'Ахлах'};
 [status,d]=await stock('approve_sale',{},d.id);assert.equal(status,200,JSON.stringify(d));
 user={userId:'a1',email:'a1@example.test',displayName:'Агент Нэг'};
 assert.equal(sqlite.prepare('SELECT seller FROM inventory_sales WHERE id=?').get(d.id).seller,'a1@example.test');
 // Агент бусдын нэр дээр бүртгэж чадахгүй.
 assert.equal((await stock('record_sale',sale({seller:'a2@example.test'})))[0],403);
 // Идэвхгүй/тохирохгүй ажилтан сонгож чадахгүй.
 assert.equal((await stock('record_sale',sale({seller:'nobody@example.test'})))[0],403);

 // Ахлах бусад ажилтны өмнөөс бүртгэж болно.
 user={userId:'mg',email:'mg@example.test',displayName:'Ахлах'};
 [status,d]=await stock('record_sale',sale({seller:'a2@example.test',qty:2,unit_price:3000000}));
 assert.equal(status,200);
 const onBehalf=sqlite.prepare('SELECT seller,created_by,qty FROM inventory_sales WHERE id=?').get(d.id);
 assert.equal(onBehalf.seller,'a2@example.test');      // үзүүлэлт зарсан хүнд
 assert.equal(onBehalf.created_by,'mg@example.test');  // бүртгэсэн нь ахлах
 assert.equal(onBehalf.qty,2);

 // Зарагчгүй (агуулахын ердийн) борлуулалт хэний ч үзүүлэлтэд орохгүй.
 [status,d]=await stock('record_sale',sale({qty:1}));
 assert.equal(status,200);
 assert.equal(sqlite.prepare('SELECT seller FROM inventory_sales WHERE id=?').get(d.id).seller,'');

 // Үлдэгдэл зөв хасагдсан: 10 - 1 - 2 - 1 = 6.
 assert.equal(sqlite.prepare('SELECT COALESCE(SUM(qty_delta),0) q FROM inventory_stock_moves WHERE item_id=?').get(item).q,6);

 // Жагсаалтын шүүлтүүр: зарагчаар, мөн "бүх шууд борлуулалт".
 let [ls,list]=await json(await stockRoute.GET(new Request('https://crm.test/api/inventory?view=sales&seller=a1@example.test')));
 assert.equal(ls,200);assert.equal(list.count,1);assert.equal(list.items[0].seller_name,'Агент Нэг');
 [ls,list]=await json(await stockRoute.GET(new Request('https://crm.test/api/inventory?view=sales&seller=__direct__')));
 assert.equal(list.count,2); // зарагчтай хоёр мөр (зарагчгүй нь орохгүй)
 [ls,list]=await json(await stockRoute.GET(new Request('https://crm.test/api/inventory?view=sales')));
 assert.equal(list.count,3); // шүүлтгүй бол бүгд

 // Ажилтны үзүүлэлт: шууд борлуулалт тусдаа багана, нийт борлуулалтад нэгтгэгдэнэ.
 user={userId:'owner-test',email:'owner@example.test',displayName:'Owner'};
 let [rs,report]=await json(await crmRoute.GET(new Request('https://crm.test/api/crm?view=reports')));
 assert.equal(rs,200);
 const one=report.byMember.find(r=>r.email==='a1@example.test');
 const two=report.byMember.find(r=>r.email==='a2@example.test');
 assert.equal(one.direct_sales,1);assert.equal(one.direct_amount,3000000);
 assert.equal(two.direct_sales,1);assert.equal(two.direct_amount,6000000); // 2 ш × 3,000,000
 assert.equal(one.sold_total,1);   // хүсэлтээр худалдан авсан 0 + шууд 1
 assert.equal(two.sold_total,1);
 // Хүсэлтээр худалдан авсан нь нийт борлуулалтад нэмэгдэнэ.
 // "Худалдан авсан" төлөвийг зөвхөн худалдан авалт баталгаажуулах урсгал тавьдаг тул фикстурыг шууд бичнэ.
 sqlite.prepare("INSERT INTO leads(id,name,phone,product,source,owner,status,next_action,created_at,updated_at,op) VALUES('won-1','Бат','99554433','LG OLED 55','Дэлгүүр','a1@example.test','won','Хаагдсан',?,?,?)")
  .run(new Date().toISOString(),new Date().toISOString(),crypto.randomUUID());
 [rs,report]=await json(await crmRoute.GET(new Request('https://crm.test/api/crm?view=reports')));
 const after=report.byMember.find(r=>r.email==='a1@example.test');
 assert.equal(after.counts.won,1);assert.equal(after.direct_sales,1);
 assert.equal(after.sold_total,2); // 1 хүсэлт + 1 шууд
 // Хөрвөлтийн хувь нь зөвхөн хүсэлтээр бодогдох тул шууд борлуулалт үүнийг өсгөхгүй.
 assert.equal(after.total,1);

 // Маркетинг эрх шууд борлуулалт бүртгэж чадахгүй.
 assert.equal((await json(await post(crmRoute,{action:'member',data:{email:'mk@example.test',name:'Marketing',role:'marketing',active:true}})))[0],200);
 user={userId:'mk',email:'mk@example.test',displayName:'Marketing'};
 assert.equal((await stock('record_sale',sale({seller:'mk@example.test'})))[0],403);
 console.log('PASS: direct cash sales — agents record only under their own name, managers may record on behalf while created_by still shows who typed it, unknown or isolated sellers refused, stock deducted through the same ledger, seller filters (per agent and all-attributed) on the sales list, and per-agent reporting that adds direct sales to a combined sold total while leaving lead conversion untouched.');
})().catch(e=>{console.error(e);process.exit(1)});
`;
eval(bootstrap+scenario);
