import {env} from './runtime';
import {shiftOff,shiftAssignments,defaultAssignmentSettings,type AssignmentSettings} from './crm';
const db=()=>env.DB!;
export type Candidate={email:string;name:string;today:number};
// Улаанбаатарын хуанлийн өдөр ба тэр өдрийн 00:00-ийн ISO — хуваарь, "өнөөдрийн хүсэлт" хоёуланд хэрэгтэй.
export const ubDay=(at=Date.now())=>new Date(at+8*3600000).toISOString().slice(0,10);
export const ubDayStart=(day:string)=>new Date(day+'T00:00:00+08:00').toISOString();
// Тухайн өдөр ажлын хуваарьт байгаа (амралт/чөлөө биш) идэвхтэй борлуулалтын ажилтнууд, тэдний тэр
// өдөр аль хэдийн авсан хүсэлтийн тоотой хамт. Хуваарьт байхгүй ажилтан хүсэлт авахгүй.
export async function getAssignmentSettings():Promise<AssignmentSettings>{
 const row=await db().prepare("SELECT value FROM app_settings WHERE key='auto_assignment'").first<{value:string}>();
 if(!row)return {...defaultAssignmentSettings};
 try{const value=JSON.parse(row.value);return {enabled:value.enabled===true,automatic:value.automatic===true,days:Number.isInteger(value.days)&&value.days>=1&&value.days<=30?value.days:7,assignments:Array.isArray(value.assignments)?value.assignments.filter((v:unknown)=>typeof v==='string'&&shiftAssignments.includes(v)&&!shiftOff.includes(v)):[],excluded_emails:Array.isArray(value.excluded_emails)?value.excluded_emails.filter((v:unknown)=>typeof v==='string'):[]};}catch{return {...defaultAssignmentSettings,enabled:false};}
}
export async function dutyRoster(day:string,config?:AssignmentSettings):Promise<Candidate[]>{
 const settings=config||await getAssignmentSettings();
 if(!settings.enabled)return [];

 const off=shiftOff.map(()=>'?').join(',');
 const rows=await db().prepare(
  `SELECT DISTINCT m.email,m.name,(SELECT COUNT(*) FROM leads l WHERE l.owner=m.email AND l.deleted_at IS NULL AND l.created_at>=?) today
   FROM members m JOIN work_shifts w ON w.member_email=m.email AND w.day=?
   WHERE m.active=1 AND m.role='agent' AND w.assignment!='' AND w.assignment NOT IN (${off}) ${settings.assignments.length?'AND w.assignment IN ('+settings.assignments.map(()=>'?').join(',')+')':''} ${settings.excluded_emails.length?'AND m.email NOT IN ('+settings.excluded_emails.map(()=>'?').join(',')+')':''}
   ORDER BY today ASC,m.email ASC`
 ).bind(ubDayStart(day),day,...shiftOff,...settings.assignments,...settings.excluded_emails).all<Candidate>();
 return rows.results.map(r=>({...r,today:Number(r.today)}));
}
// Өнөөдөр хамгийн бага хүсэлт авсан ажилтанд дараагийнхийг өгч, дотоод тоологчийг нэмнэ — ингэснээр нэг
// sync/багцын дотор ч дараалал тэнцвэртэй хуваагдана. Тэнцвэл и-мэйлээр эрэмбэлж тодорхой байлгана.
export function createRotation(roster:Candidate[]){
 const pool=roster.map(c=>({...c}));
 return {
  size:pool.length,
  next():Candidate|null{
   if(!pool.length)return null;
   let best=pool[0];
   for(const c of pool)if(c.today<best.today||(c.today===best.today&&c.email<best.email))best=c;
   best.today++;
   return best;
  },
 };
}
