'use client';
import {useState} from 'react';
import {Alert,Button,Card,Descriptions,Space,Tag,Table,Statistic,Row,Col,Popconfirm,Segmented} from 'antd';
import {useRemote} from '@/hooks/use-remote';
type Change={row:number;code:string;warehouse:string;before:number;after:number;delta:number};
type Issue={row:number;code:string;name:string;quantity:number;reason:string};
type Preview={digest:string;planDigest:string;matched:number;unchanged:number;changes:Change[];issues:Issue[];alreadyApplied:boolean;readAt:string};
type Status={connected:boolean;serviceEmail:string;sources:{id:string;name:string;spreadsheetId:string;mapping:string}[];history:{sourceId:string;at:string;actor:string;changed:number;unchanged:number;issueCount:number}[]};
const date=(v:string)=>new Date(v).toLocaleString('mn-MN',{timeZone:'Asia/Ulaanbaatar'});
export default function InventorySheetPanel({onSynced}:{onSynced:()=>void}){
 const remote=useRemote<Status>('/api/inventory-sheet');
 const [source,setSource]=useState('main'),[preview,setPreview]=useState<Preview|null>(null),[busy,setBusy]=useState(''),[error,setError]=useState(''),[success,setSuccess]=useState('');
 const config=remote.data?.sources.find(s=>s.id===source);
 async function run(action:'preview'|'apply'){
  setBusy(action);setError('');setSuccess('');if(action==='preview')setPreview(null);
  try{const r=await fetch('/api/inventory-sheet',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,source,...(action==='apply'?{digest:preview?.digest,planDigest:preview?.planDigest}:{})}),signal:AbortSignal.timeout(65000)});const d=await r.json();if(!r.ok)throw Error(d.error||'Хүсэлт амжилтгүй.');
   if(action==='preview')setPreview(d);else{setPreview(null);setSuccess(d.state==='already_applied'?'Энэ хувилбар өмнө нь шинэчлэгдсэн. Давхар нэмээгүй.':`${d.changed} бүртгэл шинэчлэгдлээ. ${d.issues.length} зөрчилтэй мөрийг өөрчлөөгүй.`);remote.retry();onSynced();}
  }catch(e){setError(e instanceof Error?e.message:'Холболт тасарлаа.');if(action==='apply')setPreview(null);}finally{setBusy('');}
 }
 return <Space orientation="vertical" size="middle" style={{width:'100%'}}>
  <Card title="Sheet синк" extra={<Tag>Гараар шинэчлэх</Tag>}>
   <Space orientation="vertical" size="middle" style={{width:'100%'}}>
    <Alert type="info" showIcon title="Sheet-ийн эцсийн үлдэгдлийг CRM-д тулгаж шинэчилнэ" description="Эхлээд тулгаж өөрчлөлт, зөрчлийг харна. Ижил өгөгдлийг давхар нэмэхгүй. Зөрчилтэй болон Sheet-д байхгүй барааг автоматаар өөрчлөхгүй."/>
    {remote.error&&<Alert type="error" title={remote.error} action={<Button onClick={remote.retry}>Дахин ачаалах</Button>}/>}
    <div>Үлдэгдлийн эх сурвалж</div>
    <div id="inventory-sheet-source"><Segmented aria-label="Үлдэгдлийн эх сурвалж" value={source} disabled={!!busy||remote.loading} options={[{value:'main',label:'Үндсэн'},{value:'union',label:'Union'}]} onChange={v=>{setSource(v);setPreview(null);setError('');setSuccess('');}}/></div>
    {config&&<Descriptions size="small" bordered column={1} items={[{key:'sheet',label:'Хүснэгт',children:<a href={`https://docs.google.com/spreadsheets/d/${config.spreadsheetId}/edit`} target="_blank" rel="noreferrer">{config.name} · Balance ↗</a>},{key:'map',label:'Агуулахын холбоос',children:config.mapping},{key:'account',label:'Унших эрх',children:<><Tag color={remote.data?.connected?'green':'orange'}>{remote.data?.connected?'Түлхүүр бүртгэлтэй':'Холболт шаардлагатай'}</Tag><span style={{overflowWrap:'anywhere'}}>{remote.data?.serviceEmail}</span></>} ]}/>}
    {source==='union'&&<Alert type="warning" showIcon title="Union-ийн тайлангаас хойших хөдөлгөөнийг хамгаална" description="Тайлангийн өдрөөс хойш CRM хөдөлгөөнтэй барааг зөрчилд үлдээнэ."/>}
    <Button type="primary" loading={busy==='preview'} disabled={!!busy||!remote.data?.connected} onClick={()=>void run('preview')}>1. Sheet уншиж тулгах</Button>
   </Space>
  </Card>
  {error&&<Alert type="error" showIcon title={error}/>}{success&&<Alert type="success" showIcon title={success}/>}
  {preview&&<Card title="Тулгалтын үр дүн" extra={<span>{date(preview.readAt)} · УБ</span>}>
   <Space orientation="vertical" size="middle" style={{width:'100%'}}>
    <Row gutter={[16,16]} style={{width:'100%'}}>{[['Ижил үлдэгдэл',preview.unchanged],['Өөрчлөгдөх',preview.changes.length],['Зөрчилтэй',preview.issues.length]].map(([title,value])=><Col xs={24} sm={8} key={String(title)}><Statistic title={title} value={value}/></Col>)}</Row>
    {preview.alreadyApplied&&<Alert type="info" title="Энэ Sheet-ийн хувилбар өмнө нь шинэчлэгдсэн. Дахин хэрэгжүүлэхгүй."/>}
    <Table<Change> size="small" rowKey="row" dataSource={preview.changes} pagination={{pageSize:10,showSizeChanger:false}} scroll={{x:650}} columns={[{title:'Мөр',dataIndex:'row'},{title:'Барааны код',dataIndex:'code'},{title:'Агуулах',dataIndex:'warehouse'},{title:'CRM',dataIndex:'before'},{title:'Sheet',dataIndex:'after'},{title:'Зөрүү',dataIndex:'delta',render:v=><Tag color={v>0?'green':'orange'}>{v>0?'+':''}{v}</Tag>}]}/>
    <Popconfirm title={`${preview.changes.length} бүртгэлийн үлдэгдлийг шинэчлэх үү?`} description="Хөдөлгөөний түүх хадгалагдана. Зөрчилтэй мөрүүдийг алгасана." onConfirm={()=>run('apply')} okText="Шинэчлэх" cancelText="Болих" disabled={!!busy||preview.alreadyApplied||!preview.changes.length}>
     <Button type="primary" loading={busy==='apply'} disabled={!!busy||preview.alreadyApplied||!preview.changes.length}>2. Үлдэгдэл шинэчлэх</Button>
    </Popconfirm>
    <Table<Issue> caption="Шинэчлэхгүй зөрчилтэй мөрүүд" size="small" rowKey="row" dataSource={preview.issues} pagination={{pageSize:10,showSizeChanger:false}} scroll={{x:700}} columns={[{title:'Мөр',dataIndex:'row'},{title:'Код',dataIndex:'code'},{title:'Бараа',dataIndex:'name'},{title:'Шалтгаан',dataIndex:'reason'}]}/>
   </Space>
  </Card>}
  <Card title="Сүүлийн шинэчлэлтүүд"><Table size="small" rowKey={r=>r.at+r.sourceId} loading={remote.loading} dataSource={remote.data?.history.filter(r=>r.sourceId===config?.spreadsheetId)||[]} pagination={{pageSize:5,showSizeChanger:false}} scroll={{x:650}} columns={[{title:'Цаг · УБ',dataIndex:'at',render:date},{title:'Ажилтан',dataIndex:'actor'},{title:'Шинэчилсэн',dataIndex:'changed'},{title:'Ижил',dataIndex:'unchanged'},{title:'Зөрчил',dataIndex:'issueCount'}]}/></Card>
 </Space>;
}
