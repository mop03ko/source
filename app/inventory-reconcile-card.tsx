'use client';
import {useState} from 'react';
import {Alert,Button,Card,Col,DatePicker,Row,Space,Statistic,Table,Tabs,Tag} from 'antd';
import dayjs,{type Dayjs} from 'dayjs';
import {ReportExport} from '@/components/report-export';
import type {ReportDoc} from '@/lib/report-export';
type StockRow={row:number|null;code:string;name:string;warehouse:string;sheet:number|null;crm:number|null;delta:number|null;reason:string};
type Counts={c1:unknown;in:unknown;out:unknown;c2:unknown};
type MoveRow={row:number|null;code:string;name:string;warehouse:string;sheet:Counts|null;expected:Counts|null;reason:string};
type TxRow={day:string;code:string;name:string;kind:string;sheet:number;crm:number;delta:number;reason:string;rows:string};
type List<T>={rows:T[];total:number;truncated:boolean};
type Result={title:string;readAt:string;period:{start:string;end:string};range:{from:string;to:string};warehouses:string[];tabs:{balance:number;purchase:number|null;sales:number|null};
 summary:{stockMatched:number;stockIssues:number;movementIssues:number;transactionIssues:number;transactionsChecked:boolean;movementsChecked:boolean};
 stock:List<StockRow>;movements:List<MoveRow>;transactions:List<TxRow>};
const ub=()=>dayjs(new Date(Date.now()+8*3600000).toISOString().slice(0,10));
const date=(v:string)=>new Date(v).toLocaleString('mn-MN',{timeZone:'Asia/Ulaanbaatar'});
const n=(v:unknown)=>typeof v==='number'?Math.round(v).toLocaleString():v===null||v===undefined||v===''?'—':String(v);
const counts=(c:Counts|null)=>c?`${n(c.c1)} + ${n(c.in)} − ${n(c.out)} = ${n(c.c2)}`:'—';
const delta=(v:number|null)=>v===null?'—':<Tag color={v>0?'green':v<0?'orange':'default'}>{v>0?'+':''}{v}</Tag>;
const more=(l:List<unknown>)=>l.truncated?<Alert type="warning" showIcon title={`Эхний ${l.rows.length.toLocaleString()} мөр харагдаж байна (нийт ${l.total.toLocaleString()}).`}/>:null;

/** Sheet-ийн Balance, Purchase, Sales табуудыг CRM-тэй тулгасан тайлан. Юу ч өөрчлөхгүй. */
export default function InventoryReconcileCard({source}:{source:string}){
 const [range,setRange]=useState<[Dayjs,Dayjs]>(()=>[ub().subtract(6,'day'),ub()]);
 const [result,setResult]=useState<Result|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function run(){
  setBusy(true);setError('');
  try{const r=await fetch('/api/inventory-sheet',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'reconcile',source,from:range[0].format('YYYY-MM-DD'),to:range[1].format('YYYY-MM-DD')}),signal:AbortSignal.timeout(65000)});
   const d=await r.json();if(!r.ok)throw Error(d.error||'Хүсэлт амжилтгүй.');setResult(d);}
  catch(e){setError(e instanceof Error?e.message:'Холболт тасарлаа.');}finally{setBusy(false);}
 }
 const doc=():ReportDoc=>({title:'Үлдэгдлийн тулгалт',meta:[`Sheet: ${result?.title||''}`,`Уншсан: ${result?date(result.readAt):''}`,`Balance-ийн тайлант хугацаа: ${result?.period.start} — ${result?.period.end}`,`Гүйлгээний хугацаа: ${result?.range.from} — ${result?.range.to}`,`CRM агуулах: ${result?.warehouses.join(', ')||''}`],sheets:[
  {name:'Үлдэгдэл Sheet-CRM',columns:[{header:'Мөр'},{header:'Код',width:22},{header:'Бараа',width:32},{header:'Агуулах',width:18},{header:'Sheet'},{header:'CRM'},{header:'Зөрүү'},{header:'Шалтгаан',width:44}],
   rows:(result?.stock.rows||[]).map(r=>[r.row,r.code,r.name,r.warehouse,r.sheet,r.crm,r.delta,r.reason])},
  {name:'Хөдөлгөөн-Balance',columns:[{header:'Мөр'},{header:'Код',width:22},{header:'Бараа',width:32},{header:'Агуулах',width:16},{header:'Balance: C1+Орл−Зарл=C2',width:26},{header:'Purchase/Sales-аас',width:26},{header:'Шалтгаан',width:50}],
   rows:(result?.movements.rows||[]).map(r=>[r.row,r.code,r.name,r.warehouse,counts(r.sheet),counts(r.expected),r.reason])},
  {name:'Гүйлгээ Sheet-CRM',columns:[{header:'Огноо',width:12},{header:'Төрөл',width:16},{header:'Код',width:22},{header:'Бараа',width:32},{header:'Sheet'},{header:'CRM'},{header:'Зөрүү'},{header:'Шалтгаан',width:24},{header:'Sheet-ийн мөр',width:24}],
   rows:(result?.transactions.rows||[]).map(r=>[r.day,r.kind,r.code,r.name,r.sheet,r.crm,r.delta,r.reason,r.rows])},
 ]});
 const s=result?.summary;
 return <Card title="Бүх табын тулгалт" extra={<Tag color="blue">Зөвхөн тайлан</Tag>}>
  <Space orientation="vertical" size="middle" style={{width:'100%'}}>
   <Alert type="info" showIcon title="Balance, Purchase, Sales табуудыг CRM-тэй тулгана" description="Үлдэгдэл, Sheet доторх хөдөлгөөний уялдаа, гүйлгээ бүрийг шалгаж зөрүүг харуулна. CRM болон Sheet-д юу ч өөрчлөхгүй."/>
   <Space wrap align="end">
    <div><div style={{marginBottom:6}}>Гүйлгээ тулгах хугацаа (УБ)</div>
     <DatePicker.RangePicker value={range} allowClear={false} disabled={busy} disabledDate={d=>d.isAfter(ub())} onChange={v=>{if(v?.[0]&&v[1])setRange([v[0],v[1]]);}}/></div>
    <Button type="primary" loading={busy} onClick={()=>void run()}>Бүх табыг тулгах</Button>
    {result&&<ReportExport doc={doc}/>}
   </Space>
   {error&&<Alert type="error" showIcon title={error}/>}
   {result&&s&&<>
    <div className="muted text-sm">{result.title} · {date(result.readAt)} УБ · Balance {result.tabs.balance.toLocaleString()} мөр · Purchase {result.tabs.purchase?.toLocaleString()??'—'} · Sales {result.tabs.sales?.toLocaleString()??'—'}<br/>Хамрах CRM агуулах: {result.warehouses.join(', ')||'—'}</div>
    <Row gutter={[16,16]}>{[['Үлдэгдэл таарсан',s.stockMatched],['Үлдэгдлийн зөрүү',s.stockIssues],['Хөдөлгөөний зөрүү',s.movementIssues],['Гүйлгээний зөрүү',s.transactionIssues]].map(([title,value])=><Col xs={12} md={6} key={String(title)}><Statistic title={title} value={Number(value)}/></Col>)}</Row>
    <Tabs items={[
     {key:'stock',label:`Үлдэгдэл (${s.stockIssues})`,children:<Space orientation="vertical" style={{width:'100%'}}>
      <div className="muted text-sm">Balance-ийн эцсийн үлдэгдэл (C2) ↔ CRM-ийн одоогийн үлдэгдэл, код ба агуулахаар.</div>{more(result.stock)}
      <Table<StockRow> size="small" rowKey={(r,i)=>`${r.row}-${r.code}-${r.warehouse}-${i}`} dataSource={result.stock.rows} pagination={{pageSize:15,showSizeChanger:false}} scroll={{x:900}} columns={[{title:'Мөр',dataIndex:'row',render:v=>v??'—'},{title:'Код',dataIndex:'code'},{title:'Бараа',dataIndex:'name'},{title:'Агуулах',dataIndex:'warehouse'},{title:'Sheet',dataIndex:'sheet',render:n},{title:'CRM',dataIndex:'crm',render:n},{title:'Зөрүү',dataIndex:'delta',render:delta},{title:'Шалтгаан',dataIndex:'reason'}]}/></Space>},
     {key:'movements',label:`Хөдөлгөөн ↔ Balance (${s.movementIssues})`,children:<Space orientation="vertical" style={{width:'100%'}}>
      <div className="muted text-sm">Balance-ийн тоог Purchase (хүлээн авсан − буцаасан) болон Sales табаас Balance-ийн томьёотой ижил дүрмээр дахин тооцож харьцуулсан. Тайлант хугацаа: {result.period.start} — {result.period.end}.</div>
      {!s.movementsChecked&&<Alert type="warning" showIcon title="Энэ эх сурвалжид Purchase/Sales таб эсвэл тайлант хугацаа алга тул шалгаагүй."/>}{more(result.movements)}
      <Table<MoveRow> size="small" rowKey={(r,i)=>`${r.row}-${r.code}-${i}`} dataSource={result.movements.rows} pagination={{pageSize:15,showSizeChanger:false}} scroll={{x:1000}} columns={[{title:'Мөр',dataIndex:'row',render:v=>v??'—'},{title:'Код',dataIndex:'code'},{title:'Бараа',dataIndex:'name'},{title:'Balance: C1+Орл−Зарл=C2',dataIndex:'sheet',render:counts},{title:'Purchase/Sales-аас',dataIndex:'expected',render:counts},{title:'Шалтгаан',dataIndex:'reason'}]}/></Space>},
     {key:'transactions',label:`Гүйлгээ (${s.transactionIssues})`,children:<Space orientation="vertical" style={{width:'100%'}}>
      <div className="muted text-sm">{result.range.from} — {result.range.to} хооронд Sheet-ийн Purchase/Sales мөрүүд ↔ CRM-ийн худалдан авалт, буцаалт, борлуулалт; өдөр ба кодоор нэгтгэсэн.</div>
      {!s.transactionsChecked&&<Alert type="warning" showIcon title="Энэ эх сурвалжид Purchase/Sales таб алга тул шалгаагүй."/>}{more(result.transactions)}
      <Table<TxRow> size="small" rowKey={r=>`${r.day}-${r.kind}-${r.code}`} dataSource={result.transactions.rows} pagination={{pageSize:15,showSizeChanger:false}} scroll={{x:1000}} columns={[{title:'Огноо',dataIndex:'day'},{title:'Төрөл',dataIndex:'kind'},{title:'Код',dataIndex:'code'},{title:'Бараа',dataIndex:'name'},{title:'Sheet',dataIndex:'sheet'},{title:'CRM',dataIndex:'crm'},{title:'Зөрүү',dataIndex:'delta',render:delta},{title:'Шалтгаан',dataIndex:'reason'},{title:'Sheet-ийн мөр',dataIndex:'rows'}]}/></Space>},
    ]}/>
   </>}
  </Space>
 </Card>;
}
