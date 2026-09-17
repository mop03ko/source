export const stages: Record<string,string> = {review:'Мэдээлэл шалгах',new:'Шинэ хүсэлт',contacted:'Холбогдсон',materials:'Материал бүрдүүлж буй',pending:'Шийдвэр хүлээж буй',appointment:'Уулзалт товлосон',unreachable:'Холбогдоогүй',won:'Худалдан авсан',lost:'Татгалзсан',invalid:'Буруу дугаар'};
export const sources=['Facebook','Instagram','Утас','Вэбсайт','Дэлгүүр','Байгууллага','Бусад'];
export const roles:Record<string,string>={admin:'Админ',manager:'Удирдлага',agent:'Борлуулалтын ажилтан',marketing:'Маркетинг'};
export const marketingStages:Record<string,string>={planned:'Төлөвлөсөн',in_progress:'Хийгдэж байгаа',pending:'Хүлээгдэж буй',paused:'Түр зогссон',done:'Дууссан',cancelled:'Цуцалсан'};
export const marketingClosed=['done','cancelled'];
export const marketingChannels=['Facebook','Instagram','Вэбсайт','Google Ads','Email','Бусад'];
export const kinds:Record<string,string>={sheet_update:'Sheet мэдээлэл шинэчлэгдсэн',sheet_import:'Google Sheets импорт',sheet_assignment:'Sheet хуваарилалт шинэчлэгдсэн',connected:'Холбогдсон дуудлага',no_answer:'Дуудлагад хариулаагүй',message:'SMS / Messenger бүртгэх',note:'Тэмдэглэл',update:'Мэдээлэл шинэчилсэн',recycle:'Recycle эхлүүлсэн',optout:'Дахин холбогдохгүй',assign:'Гараар хуваарилсан',delete:'Устгасан'};
export type Member={email:string;user_id:string|null;name:string;role:string;active:number;last_seen?:string|null;phone?:string|null;avatar?:string|null};
export type Lead={id:string;name:string;phone:string;registration?:string;registration_manual?:number;product:string;source:string;owner:string;status:string;next_at:string|null;next_action:string;recycle_at:string|null;connected:number;created_at:string;updated_at:string;version:number;blocked?:number;attempts?:number;deleted_at?:string|null};
export type Activity={id:string;kind:string;note:string;actor:string;created_at:string};
export type MarketingTask={id:string;title:string;channel:string;budget:number;owner:string;status:string;due_at:string|null;note:string;created_by:string;created_at:string;updated_at:string;version:number};
export type MarketingActivity={id:string;task_id:string;note:string;actor:string;created_at:string};
export const closed=['won','lost','invalid'];
export function normalizePhone(v:string){let p=v.replace(/[\s()+-]/g,'');if(p.startsWith('976')&&p.length===11)p=p.slice(3);if(!/^\d{8}$/.test(p))throw new Error('Монголын 8 оронтой утасны дугаар оруулна уу.');return p;}
export function dateLabel(v:string|null){return v?new Intl.DateTimeFormat('mn-MN',{timeZone:'Asia/Ulaanbaatar',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(v)):'Товгүй';}
export function localInput(v:string|null){return v?new Date(new Date(v).getTime()+8*3600000).toISOString().slice(0,16):'';}
export function fromInput(v:string){return v?new Date(v+':00+08:00').toISOString():null;}
export function csvCell(v:unknown){let s=String(v??'');if(/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}
export function parseCSV(text:string){const rows:string[][]=[];let row:string[]=[],cell='',q=false;for(let i=0;i<text.length;i++){let c=text[i];if(c==='"'){if(q&&text[i+1]==='"'){cell+='"';i++;}else q=!q;}else if(c===','&&!q){row.push(cell);cell='';}else if((c==='\n'||c==='\r')&&!q){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(x=>x.trim()))rows.push(row);row=[];cell='';}else cell+=c;}if(q)throw new Error('CSV-ийн хашилт дутуу байна.');row.push(cell);if(row.some(x=>x.trim()))rows.push(row);return rows;}

export function normalizeRegistration(v:string){const s=v.trim().replace(/\s/g,'').toUpperCase();if(s&&!/^[А-ЯЁӨҮ]{2}\d{8}$/.test(s))throw new Error('Регистрийн дугаар 2 кирилл үсэг, 8 цифртэй байна.');return s;}

export function requestDateLabel(v:string|null){if(!v)return 'Огноогүй';const d=new Date(v);if(Number.isNaN(d.getTime()))return 'Огноо шалгах';const local=new Date(d.getTime()+8*3600000);return local.toISOString().slice(0,19).replace('T',' ')+' · УБ';}
