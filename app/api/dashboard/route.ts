import {env} from '@/lib/runtime';
import {member,Failure} from '@/lib/access';
import {personKey} from '@/lib/crm';
export const dynamic='force-dynamic';
export async function GET(req:Request){try{
 const me=await member(),db=env.DB;
 const day=new Date(Date.now()+8*3600000).toISOString().slice(0,10);
 const start=new Date(day+'T00:00:00+08:00').toISOString();
 const end=new Date(Date.parse(start)+86400000).toISOString();
 const page=Math.max(1,Math.min(10000,Math.floor(Number(new URL(req.url).searchParams.get('page')))||1));
 const shifts=await db.prepare('SELECT person_name,member_email,assignment,note FROM work_shifts WHERE day=?').bind(day).all<{person_name:string;member_email:string|null;assignment:string;note:string}>();
 const shift=shifts.results.filter(s=>s.member_email?s.member_email.toLowerCase()===me.email.toLowerCase():personKey(s.person_name)===personKey(me.name)).map(s=>({assignment:s.assignment,note:s.note}));
 if(!['marketing','it','delivery'].includes(me.role))return Response.json({day,shift,items:[],count:0,summary:null},{headers:{'Cache-Control':'no-store'}});
 const delivery=me.role==='delivery',table=delivery?'deliveries':me.role==='it'?'it_tasks':'marketing_tasks';
 const due=delivery?'delivered_on':'due_at';
 const scope=delivery?'(courier_email=? OR (courier_email IS NULL AND courier_name=?))':'owner=?';
 const scopeArgs=delivery?[me.email,me.name]:[me.email];
 const open=delivery?"status NOT IN ('delivered','self_pickup','failed','cancelled')":"status NOT IN ('done','cancelled')";
 const cutoff=delivery?day:end;
 const dueFilter=delivery?'delivered_on<=?':'due_at<?';
 const [rows,summary]=await Promise.all([
  db.prepare(`SELECT id,${delivery?"COALESCE(NULLIF(item_info,''),'Хүргэлт')":'title'} title,status,${due} due_at,${delivery?'address':me.role==='it'?'system_area':'channel'} context FROM ${table} WHERE ${scope} AND ${open} AND ${dueFilter} ORDER BY ${due},id LIMIT 20 OFFSET ?`).bind(...scopeArgs,cutoff,(page-1)*20).all(),
  db.prepare(`SELECT COALESCE(SUM(${open} AND ${dueFilter}),0) due,COALESCE(SUM(${open} AND ${due}<?),0) overdue,COALESCE(SUM(${open} AND ${due} IS NULL),0) unscheduled FROM ${table} WHERE ${scope}`).bind(cutoff,delivery?day:start,...scopeArgs).first<{due:number;overdue:number;unscheduled:number}>(),
 ]);
 return Response.json({day,shift,items:rows.results,count:summary?.due||0,summary},{headers:{'Cache-Control':'no-store'}});
 }catch(e){if(e instanceof Failure)return Response.json({error:e.message},{status:e.status});console.error('Dashboard failed',e instanceof Error?e.message:'error');return Response.json({error:'Өнөөдрийн ажлыг ачаалж чадсангүй.'},{status:500});}}
