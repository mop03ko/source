import {createHash,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {env} from './runtime';
import {getAssignmentSettings,dutyRoster,ubDay} from './assign';
import {assignmentNotice,newLeadNotice} from './notifications';

export const webLoanSchema=z.object({request_id:z.string().uuid(),name:z.string().trim().min(2).max(160),phone:z.string().regex(/^\d{8}$/),registration:z.string().trim().toUpperCase().regex(/^[\p{Script=Cyrillic}]{2}\d{8}$/u),product:z.string().trim().min(2).max(500)}).strict();
export function validWebLoanToken(value:string|null){const expected=process.env.CRM_WEB_LOAN_TOKEN||'';if(expected.length<32||!value)return false;const a=Buffer.from(value),b=Buffer.from(expected);return a.length===b.length&&timingSafeEqual(a,b);}
export async function acceptWebLoan(raw:unknown){
 const data=webLoanSchema.parse(raw),hash=createHash('sha256').update(JSON.stringify(data)).digest('hex');
 return env.DB.transaction(async tx=>{
  const old=await tx.prepare('SELECT payload_hash,lead_id FROM web_loan_requests WHERE request_id=?').bind(data.request_id).first<{payload_hash:string;lead_id:string}>();
  if(old){if(old.payload_hash!==hash)throw Object.assign(new Error('Request ID already used with different data'),{status:409});return {id:old.lead_id,duplicate:true};}
  const at=new Date().toISOString(),id='web-'+data.request_id,op=crypto.randomUUID();
  const suppressed=!!await tx.prepare('SELECT 1 FROM suppressions WHERE phone=?').bind(data.phone).first();
  const settings=await getAssignmentSettings();
  const roster=!suppressed&&settings.enabled&&settings.automatic?await dutyRoster(ubDay(),settings):[];
  const owner=roster[0]?.email||'__sheet_unassigned__';
  await tx.prepare("INSERT INTO leads(id,name,phone,registration,product,source,owner,status,next_at,next_action,created_at,updated_at,op) VALUES(?,?,?,?,?,'Вэбсайт',?,'new',?,?,?,?,?)").bind(id,data.name,data.phone,data.registration,data.product,owner,owner==='__sheet_unassigned__'||suppressed?null:at,suppressed?'Холбоо барихгүй':owner==='__sheet_unassigned__'?'Ажилтантай холбох хүлээлт':'Веб хүсэлт хянах',at,at,op).run();
  await tx.prepare('INSERT INTO web_loan_requests(request_id,payload_hash,lead_id,received_at) VALUES(?,?,?,?)').bind(data.request_id,hash,id,at).run();
  await tx.prepare("INSERT INTO activities(id,lead_id,phone,kind,note,actor,created_at) VALUES(?,?,?,'web_request','antmall.mn маягтаас шууд хүлээн авсан','Вэбсайт',?)").bind(op,id,data.phone,at).run();
  if(!suppressed)await tx.batch([assignmentNotice(id,op,at),newLeadNotice(id,op,at)]);
  const smsRule=!suppressed?await tx.prepare("SELECT message FROM sms_rules WHERE status='new' AND enabled=1").first<{message:string}>():null;
  if(smsRule)await tx.prepare("INSERT INTO activities(id,lead_id,phone,kind,note,actor,created_at) VALUES(?,?,?,'sms_pending',?,'AntMall SMS',?)").bind('sms-'+id,id,data.phone,smsRule.message,at).run();
  return {id,duplicate:false};
 });
}
