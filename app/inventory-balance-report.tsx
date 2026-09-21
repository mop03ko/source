'use client';
import {Alert,Card,Empty,Progress,Segmented,Statistic,Tag} from 'antd';
import {useState} from 'react';
import {Bar,BarChart,CartesianGrid,Cell,ResponsiveContainer,Tooltip,XAxis,YAxis} from 'recharts';

export type BalanceCategory={label:string;item_count:number;stock:number;value_cents:number};
export type BalanceView='all'|'charts'|'list';
const number=(n:number)=>n.toLocaleString('en-US',{maximumFractionDigits:2});
const compact=(n:number)=>new Intl.NumberFormat('en',{notation:'compact',maximumFractionDigits:1}).format(n);
const colors=['#64748b','#059669','#d97706','#2563eb'];

export default function InventoryBalanceReport({summary,categories,from,to,warehouse,view,onView,onStock}:{summary:Record<string,number>;categories:BalanceCategory[];from:string;to:string;warehouse:string;view:BalanceView;onView:(view:BalanceView)=>void;onStock:(stock:string)=>void}){
 const [measure,setMeasure]=useState<'qty'|'value'>('value');
 const value=measure==='value',unit=value?'₮':'ш';
 const flow=[
  {name:'Эхний үлдэгдэл',qty:summary.opening_qty,money:summary.opening_cents/100},
  {name:'Орлого',qty:summary.in_qty,money:summary.in_cents/100},
  {name:'Зарлага',qty:summary.out_qty,money:summary.out_cents/100},
  {name:'Эцсийн үлдэгдэл',qty:summary.units,money:summary.value_cents/100},
 ].map(row=>({...row,amount:value?row.money:row.qty}));
 const ranked=categories.map(c=>({...c,amount:value?c.value_cents/100:c.stock})).sort((a,b)=>Math.abs(b.amount)-Math.abs(a.amount)||a.label.localeCompare(b.label));
 const top=ranked.slice(0,7);
 if(ranked.length>7)top.push({label:`Бусад ${ranked.length-7} ангилал`,item_count:ranked.slice(7).reduce((a,c)=>a+c.item_count,0),stock:0,value_cents:0,amount:ranked.slice(7).reduce((a,c)=>a+c.amount,0)});
 const max=Math.max(...top.map(c=>Math.abs(c.amount)),1);
 const adjustment=summary.value_cents-summary.opening_cents-summary.in_cents+summary.out_cents;
 return <div className="balance-report">
  <div className="balance-heading"><div><h3>Үлдэгдлийн тойм</h3><p>{from} — {to} · Улаанбаатарын цагаар · {warehouse}</p><span className="muted">Сонгосон шүүлтүүрт тохирох бүх {number(summary.count)} барааны бүртгэл</span></div><Segmented aria-label="Тайлангийн харагдац" value={view} onChange={onView} options={[{label:'Нэгдсэн',value:'all'},{label:'График',value:'charts'},{label:'Жагсаалт',value:'list'}]}/></div>
  <div className="balance-kpis">{flow.map((row,i)=><Card key={row.name} size="small" className={i===3?'balance-closing':''}><span className="balance-kpi-title"><i style={{background:colors[i]}}/>{row.name}</span><Statistic value={row.qty} suffix="ш" groupSeparator=","/><p>{number(row.money)} ₮ <span className="muted">өртөг</span></p></Card>)}</div>
  <div className="balance-health" aria-label="Үлдэгдлийн хяналт"><button onClick={()=>onStock('empty')}>Үлдэгдэлгүй <strong>{number(summary.empty_stock)}</strong></button><button onClick={()=>onStock('reorder')}>Нөхөн татах <strong>{number(summary.reorder_stock)}</strong></button><span>Нөхөн татах: үлдэгдэлтэй боловч доод хэмжээнд хүрсэн бараа.</span></div>
  {summary.negative_stock>0&&<Alert type="warning" showIcon title={`${summary.negative_stock} барааны үлдэгдэл сөрөг байна. Хөдөлгөөнийг шалгана уу.`}/>}
  {!!summary.cost_estimated&&<Alert type="info" showIcon title="Зарим барааны өртөг нөхөн тооцсон, ойролцоо дүнтэй."/>}
  <p className="balance-equation">Эхний үлдэгдэл + Орлого − Зарлага = Эцсийн үлдэгдэл. Орлого, зарлагад шилжүүлэг, буцаалт, тооллогын тохируулга багтана.{adjustment!==0&&` Тоо өөрчлөхгүй өртгийн тохируулга: ${number(adjustment/100)} ₮.`}</p>
  {view!=='list'&&<><div className="balance-chart-toolbar"><h3>Үлдэгдлийн бүтэц</h3><Segmented aria-label="Графикийн хэмжүүр" value={measure} onChange={setMeasure} options={[{label:'Өртөг (₮)',value:'value'},{label:'Тоо ширхэг',value:'qty'}]}/></div>
   {!summary.count?<Empty description="Сонгосон шүүлтүүрт бараа алга"/>:<div className="balance-charts">
    <Card title={value?'Өртгийн өөрчлөлт':'Тоо ширхэгийн өөрчлөлт'} size="small"><div className="balance-flow-chart" role="img" aria-label={flow.map(r=>`${r.name}: ${number(r.amount)} ${unit}`).join('; ')}><ResponsiveContainer width="100%" height="100%"><BarChart data={flow} margin={{top:18,right:8,bottom:12,left:0}} accessibilityLayer><CartesianGrid vertical={false} strokeDasharray="3 3"/><XAxis dataKey="name" tickFormatter={label=>String(label).replace(" үлдэгдэл","")} tick={{fontSize:11}} interval={0}/><YAxis allowDecimals={value} tickFormatter={compact} width={54} tick={{fontSize:11}}/><Tooltip formatter={v=>[`${number(Number(v))} ${unit}`,value?'Өртөг':'Тоо ширхэг']}/><Bar dataKey="amount" radius={[5,5,0,0]} maxBarSize={64} isAnimationActive={false}>{flow.map((r,i)=><Cell key={r.name} fill={colors[i]}/>)}</Bar></BarChart></ResponsiveContainer></div><p className="muted">{value?'Худалдах үнэ бус, агуулахын өртгөөр тооцсон.':'Бүх барааны хэмжих нэгж: ширхэг.'}</p></Card>
    <Card title="Эцсийн үлдэгдэл · Ангиллаар" size="small"><div className="balance-category-list">{top.map((c,i)=><div key={c.label} className="balance-category"><div><span>{c.label||'Ангилаагүй'}</span><strong>{number(c.amount)} {unit}</strong></div><Progress percent={Math.abs(c.amount)/max*100} showInfo={false} strokeColor={c.amount<0?'#dc2626':colors[i%colors.length]} size="small"/><small>{number(c.item_count)} барааны бүртгэл {c.amount<0&&<Tag color="red">Сөрөг үлдэгдэл</Tag>}</small></div>)}</div><p className="muted">{ranked.length>7?'Хамгийн их дүнтэй 7 ангилал; үлдсэнийг “Бусад”-д нэгтгэв.':`Тохирох бүх ${ranked.length} ангиллыг харуулж байна.`}</p></Card>
   </div>}
  </>}
 </div>;
}
