import {env} from './runtime';
import {shiftOff} from './crm';
const db=()=>env.DB!;
export type Candidate={email:string;name:string;today:number};
// Улаанбаатарын хуанлийн өдөр ба тэр өдрийн 00:00-ийн ISO — хуваарь, "өнөөдрийн хүсэлт" хоёуланд хэрэгтэй.
export const ubDay=(at=Date.now())=>new Date(at+8*3600000).toISOString().slice(0,10);
export const ubDayStart=(day:string)=>new Date(day+'T00:00:00+08:00').toISOString();
// Тухайн өдөр ажлын хуваарьт байгаа (амралт/чөлөө биш) идэвхтэй борлуулалтын ажилтнууд, тэдний тэр
// өдөр аль хэдийн авсан хүсэлтийн тоотой хамт. Хуваарьт байхгүй ажилтан хүсэлт авахгүй.
export async function dutyRoster(day:string):Promise<Candidate[]>{
 const off=shiftOff.map(()=>'?').join(',');
 const rows=await db().prepare(
  `SELECT m.email,m.name,(SELECT COUNT(*) FROM leads l WHERE l.owner=m.email AND l.deleted_at IS NULL AND l.created_at>=?) today
   FROM members m JOIN work_shifts w ON w.member_email=m.email AND w.day=?
   WHERE m.active=1 AND m.role='agent' AND w.assignment NOT IN (${off})
   ORDER BY today ASC,m.email ASC`
 ).bind(ubDayStart(day),day,...shiftOff).all<Candidate>();
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
