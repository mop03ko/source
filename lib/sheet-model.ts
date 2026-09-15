import {z} from 'zod';
import {normalizePhone,normalizeRegistration} from './crm';
export const defaults={spreadsheetId:'1M2axJmy54eQ7ksUS-6bZLACftqkWHFQ4tj82h88DPbk',tab:'Онлайн зээлийн хүсэлт-2026/09',startDate:'2026-01-01',includeHistory:true,columns:{timestamp:'A',phone:'B',product:'D',owner:'E',status:'H',registration:'C'},headers:{timestamp:'Timestamp',phone:'Холбогдох утасны дугаар',product:'Таны зээлээр авахыг хүсэж буй бараа',owner:'Холбогдсон ажилтан/Нэр',status:'ТӨЛӨВ',registration:'Регистрийн дугаар'},aliases:{} as Record<string,string>,statusMap:{'Шийдвэрлэсэн':'review','Шийдвэрлэсэн, авсан':'won','Харилцагч татгалзсан':'lost','Өдөр товлосон':'appointment','мэдээлэл авсан':'contacted','':'new','Холбогдоогүй':'unreachable','Татгалзсан':'lost','Худалдан авсан':'won','Материал хүлээгдэж байгаа':'materials','Хүлээгдэж байгаа':'pending','Шийдвэрлэсэн, аваагүй':'pending','Холбогдсон':'contacted','Уулзалт товлосон':'appointment','Буруу дугаар':'invalid'} as SheetConfig['statusMap']};
export const configSchema=z.object({spreadsheetId:z.string().regex(/^[A-Za-z0-9_-]{15,150}$/),tab:z.string().min(1).max(100),startDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>!Number.isNaN(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v,'Огноо буруу'),includeHistory:z.boolean().default(true),columns:z.object({timestamp:z.string().regex(/^[A-Z]{1,2}$/),phone:z.string().regex(/^[A-Z]{1,2}$/),product:z.string().regex(/^[A-Z]{1,2}$/),owner:z.string().regex(/^[A-Z]{1,2}$/),status:z.string().regex(/^[A-Z]{1,2}$/),registration:z.string().regex(/^[A-Z]{1,2}$/).default('C')}),headers:z.object({timestamp:z.string().min(1),phone:z.string().min(1),product:z.string().min(1),owner:z.string().min(1),status:z.string().min(1),registration:z.string().min(1).default('Регистрийн дугаар') }),aliases:z.record(z.string().max(100),z.string().email()).refine(v=>Object.keys(v).length<=100),statusMap:z.record(z.string().max(100),z.enum(['review','new','contacted','materials','pending','appointment','unreachable','won','lost','invalid'])).refine(v=>Object.keys(v).length<=100)});
export type SheetConfig=z.infer<typeof configSchema>;
export const label=(s:unknown)=>String(s??'').trim().replace(/\s+/g,' ').toLocaleLowerCase('mn');
// Google serials are local wall time in the source's UTC+08 zone. Keep legacy
// millisecond rounding stable because request identity includes this timestamp.
export function timestamp(value:unknown){
 const fail=()=>{throw new Error('Хүсэлтийн огноо танигдсангүй. Timestamp нүдэнд бодит огноо, цаг оруулна уу.');};
 if(typeof value==='number'){if(!Number.isFinite(value)||value<=10000||value>=100000)return fail();return new Date(Math.round((value-25569)*86400000)-8*3600000).toISOString();}
 const s=String(value??'').trim().replace(/\s+/g,' ').replace(/\\$/,'');
 const slash=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?: (\d{1,2}):(\d{2})(?::(\d{2}))?(?: (AM|PM))?)?$/i);
 const iso=s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})?)?$/i);
 if(!slash&&!iso)return fail();
 const y=Number(slash?slash[3]:iso![1]),mo=Number(slash?slash[1]:iso![2]),day=Number(slash?slash[2]:iso![3]);
 let h=Number((slash||iso)![4]||0);const min=Number((slash||iso)![5]||0),sec=Number((slash||iso)![6]||0);
 if(slash?.[7]){if(h<1||h>12)return fail();h=h%12+(slash[7].toUpperCase()==='PM'?12:0);}
 if(y<1900||y>2199||mo<1||mo>12||day<1||day>new Date(Date.UTC(y,mo,0)).getUTCDate()||h>23||min>59||sec>59)return fail();
 const pad=(v:number)=>String(v).padStart(2,'0');const zone=iso?.[8]?.toUpperCase()||'+08:00';
 if(zone!=='Z'){const [zh,zm]=zone.slice(1).split(':').map(Number);if(zh>14||zm>59||(zh===14&&zm!==0))return fail();}
 const millis=iso?.[7]?'.'+iso[7].padEnd(3,'0'):'';
 const date=new Date(`${y}-${pad(mo)}-${pad(day)}T${pad(h)}:${pad(min)}:${pad(sec)}${millis}${zone}`);if(Number.isNaN(date.getTime()))return fail();return date.toISOString();
}
export function transformRows(columns:unknown[][][],config:SheetConfig){
 const [dates,phones,products,owners,statuses,registrations=[]]=columns;const rows=[];const issues:{row:number;reason:string;owner?:string;status?:string}[]=[];const seen=new Set<string>();
 const counts={sourceRows:0,blankRows:0,dateFiltered:0,invalidRows:0,invalidDates:0,invalidPhones:0,duplicateRows:0,reviewRows:0};
 for(let i=1;i<Math.max(...columns.map(c=>c.length));i++){
 const at=dates[i]?.[0],p=phones[i]?.[0];if(!columns.some(c=>String(c[i]?.[0]??'').trim())){counts.blankRows++;continue;}counts.sourceRows++;
 let created:string;try{created=timestamp(at);}catch{counts.invalidRows++;counts.invalidDates++;issues.push({row:i+1,reason:`${config.columns.timestamp}${i+1}: огноо танигдсангүй. Timestamp нүдэнд бодит огноо, цаг оруулна уу.`});continue;}
 try{if(!config.includeHistory&&Date.parse(created)<Date.parse(config.startDate+'T00:00:00+08:00')){counts.dateFiltered++;continue;}
 let phone:string;try{phone=normalizePhone(String(p||''));}catch(e){counts.invalidPhones++;throw e;}const identity=created+'|'+phone;if(seen.has(identity)){counts.duplicateRows++;issues.push({row:i+1,reason:'Ижил огноо, дугаартай давхардсан мөр'});continue;}seen.add(identity);
 const owner=String(owners[i]?.[0]||'').trim(),status=String(statuses[i]?.[0]||'').trim();
 let stage=Object.entries({...defaults.statusMap,...config.statusMap}).find(([k])=>label(k)===label(status))?.[1];
 if(!stage){stage='review';issues.push({row:i+1,reason:'Төлөв танигдаагүй; Мэдээлэл шалгах төлөвөөр импортлов',status});}
 const mapped=Object.entries(config.aliases).find(([k])=>label(k)===label(owner))?.[1]?.toLowerCase()||'';
 let product=String(products[i]?.[0]||'').trim();if(!product){product='Бүтээгдэхүүн тодруулах';if(!['won','lost','invalid'].includes(stage))stage='review';issues.push({row:i+1,reason:'Бүтээгдэхүүн дутуу; тодруулах хүсэлтээр импортлов'});}
 let registration='';try{registration=normalizeRegistration(String(registrations[i]?.[0]||''));}catch{issues.push({row:i+1,reason:'Регистрийн хэлбэр буруу; хүсэлтийг регистргүй импортлов'});}
 if(stage==='review')counts.reviewRows++;
 rows.push({row:i+1,identity,created,phone,registration,product:product.slice(0,160),owner,ownerEmail:mapped,status:stage});
 }catch(e){counts.invalidRows++;issues.push({row:i+1,reason:(e as Error).message});}}
 return{rows,issues,counts};
}
