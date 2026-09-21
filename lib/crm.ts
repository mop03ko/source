export const stages: Record<string,string> = {review:'Мэдээлэл шалгах',new:'Шинэ хүсэлт',contacted:'Холбогдсон',materials:'Материал бүрдүүлж буй',pending:'Шийдвэр хүлээж буй',appointment:'Уулзалт товлосон',unreachable:'Холбогдоогүй',won:'Худалдан авсан',lost:'Татгалзсан',invalid:'Буруу дугаар'};
export const sources=['Facebook','Instagram','Утас','Вэбсайт','Дэлгүүр','Байгууллага','Бусад'];
export const roles:Record<string,string>={admin:'Админ',director:'Удирдлага',manager:'Ахлах',agent:'Борлуулалтын ажилтан',marketing:'Маркетинг',it:'IT',delivery:'Хүргэлтийн ажилтан'};
// "Удирдлага" (director) нь админтай адил эрхтэй (гишүүн удирдах, тайлан, төсөв батлах г.м); зөвхөн жинхэнэ
// эзэмшигчийн бүртгэлийг хамгаалах логик (owner protection) л 'admin'-ийг өөрөө шаарддаг тул үүнд хамаарахгүй.
export const isAdminLike=(role:string)=>role==='admin'||role==='director';
// Барааны мэдээллийг зөвхөн Админ, Ахлах засна.
export const canEditInventoryItem=(role:string)=>role==='admin'||role==='manager';
// Маркетинг, IT, Хүргэлт гурвуулаа борлуулалтын хүсэлт (leads)-тэй огт харьцдаггүй, тусад нь модультай эрхүүд.
export const isIsolatedRole=(role:string)=>role==='marketing'||role==='it'||role==='delivery';
// Хүргэлтийн журналыг маркетинг, IT-ээс бусад бүх эрх хардаг; хүргэгч зөвхөн өөрийн хүргэлтээ хардаг.
export const canSeeDeliveries=(role:string)=>role!=='marketing'&&role!=='it';
export const isCourierOnly=(role:string)=>role==='delivery';
export const teamChannels:Record<string,string>={all:'Бүх ажилчид',marketing:'Маркетинг',sales:'Борлуулалт'};
// Удирдлага (director) "Бүх ажилчид" сувагт огт ордоггүй (зөвхөн тусгай сувгуудаар хяналт тавина);
// admin/director хоёул Маркетинг, Борлуулалт хоёр сувгийг аль алиныг нь хянах зорилгоор хардаг.
export function channelsForRole(role:string):string[]{
 const list:string[]=[];
 if(role!=='director')list.push('all');
 if(role==='marketing'||role==='admin'||role==='director')list.push('marketing');
 if(role==='agent'||role==='manager'||role==='admin'||role==='director')list.push('sales');
 return list;
}
// Удирдлага (director) хувийн чат (DM)-аар зөвхөн Ахлах, Админтай харилцана; энгийн ажилтан
// (агент, маркетинг, IT) удирдлагатай шууд DM бичиж чадахгүй, зөвхөн сувгаар л хандана.
export function canDm(a:string,b:string):boolean{
 if(a==='director'&&!(b==='manager'||b==='admin'||b==='director'))return false;
 if(b==='director'&&!(a==='manager'||a==='admin'||a==='director'))return false;
 return true;
}
export const marketingStages:Record<string,string>={planned:'Төлөвлөсөн',in_progress:'Хийгдэж байгаа',pending:'Хүлээгдэж буй',paused:'Түр зогссон',done:'Дууссан',cancelled:'Цуцалсан'};
export const marketingClosed=['done','cancelled'];
export const marketingChannels=['Meta / гүйцэтгэлд суурилсан сурталчилгаа','Дахин чиглүүлэх сурталчилгаа','Google хайлтын сурталчилгаа','TikTok / Reels богино видео','OOH / DOOH гадна сурталчилгаа','Нөлөөлөгч / контент бүтээгч','Контент үйлдвэрлэл','CRM / зээлийн хүсэлт сэргээх','A/B тест ба өсгөх нөөц','Facebook','Instagram','Вэбсайт','Email','Бусад'];
export const itStages:Record<string,string>={planned:'Төлөвлөсөн',in_progress:'Хийгдэж байгаа',pending:'Хүлээгдэж буй',paused:'Түр зогссон',done:'Дууссан',cancelled:'Цуцалсан'};
export const itClosed=['done','cancelled'];
export const itSystemAreas=['Вэбсайт / Frontend','Backend / Server','Мэдээллийн сан','Мобайл апп','Дотоод систем / CRM','Сүлжээ / Инфраструктур','Аюулгүй байдал','Дэмжлэг / Bug fix','Бусад'];
export const inventoryStages:Record<string,string>={planned:'Төлөвлөсөн',in_progress:'Хийгдэж байгаа',pending:'Хүлээгдэж буй',paused:'Түр зогссон',done:'Дууссан',cancelled:'Цуцалсан'};
export const inventoryClosed=['done','cancelled'];
// Хүргэлтийн төлөв: Excel дэх "Хүргэлт хийсэн эсэх" (Тийм/Үгүй/Цуцлагдсан/өөрөө ирж авсан)-ыг нормчилсон.
export const deliveryStatuses:Record<string,string>={pending:'Хүлээгдэж буй',delivered:'Хүргэсэн',self_pickup:'Өөрөө ирж авсан',failed:'Хүргэгдээгүй',cancelled:'Цуцалсан'};
export const deliveryDone=['delivered','self_pickup'];
export const deliveryClosed=['delivered','self_pickup','failed','cancelled'];
export const deliveryKinds=['24 цаг','Яаралтай','Гэрээ','Таталт','Засвар','Бусад'];
export const kinds:Record<string,string>={sheet_update:'Sheet мэдээлэл шинэчлэгдсэн',sheet_import:'Google Sheets импорт',sheet_assignment:'Sheet хуваарилалт шинэчлэгдсэн',connected:'Холбогдсон дуудлага',no_answer:'Дуудлагад хариулаагүй',message:'SMS / Messenger бүртгэх',note:'Тэмдэглэл',update:'Мэдээлэл шинэчилсэн',recycle:'Дахин холбогдох эхлүүлсэн',optout:'Дахин холбогдохгүй',assign:'Гараар хуваарилсан',delete:'Устгасан',restore:'Сэргээсэн'};
export type Member={email:string;user_id:string|null;name:string;role:string;active:number;last_seen?:string|null;phone?:string|null;avatar?:string|null};
export type Lead={id:string;name:string;phone:string;registration?:string;registration_manual?:number;product:string;source:string;owner:string;status:string;next_at:string|null;next_action:string;recycle_at:string|null;connected:number;created_at:string;updated_at:string;version:number;blocked?:number;attempts?:number;deleted_at?:string|null};
export type Activity={id:string;kind:string;note:string;actor:string;created_at:string};
export type MarketingTask={id:string;title:string;channel:string;budget:number;owner:string;status:string;due_at:string|null;note:string;created_by:string;created_at:string;updated_at:string;version:number;approved_at:string|null;approved_by:string|null};
export type MarketingActivity={id:string;task_id:string;note:string;actor:string;created_at:string};
export type ItTask={id:string;title:string;system_area:string;owner:string;status:string;due_at:string|null;note:string;created_by:string;created_at:string;updated_at:string;version:number};
export type ItActivity={id:string;task_id:string;note:string;actor:string;created_at:string};
export type InventoryCount={id:string;title:string;category:string;owner:string;status:string;due_at:string|null;expected_amount:number;actual_amount:number|null;note:string;created_by:string;created_at:string;updated_at:string;version:number;stock_revision:number;warehouse_id:string|null};
export type InventoryCountActivity={id:string;count_id:string;note:string;actor:string;created_at:string};
export type InventoryCountLine={id:string;count_id:string;item_id:string;item_name:string;item_code:string;expected_qty:number;counted_qty:number|null;note:string};
export type InventoryWarehouse={id:string;name:string;created_at:string};
export type InventoryItem={id:string;code:string;brand:string;name:string;variant:string;imei:string|null;sale_price:number;active:number;created_by:string;created_at:string;updated_at:string};
export type InventoryPurchase={id:string;item_id:string;warehouse_id:string;qty:number;unit_cost:number;total_cost:number;ordered_at:string|null;received_at:string|null;payment_status:string;note:string;created_by:string;created_at:string};
export type InventorySale={id:string;item_id:string;warehouse_id:string;qty:number;unit_price:number;total_price:number;customer_name:string;customer_phone:string;platform:string;sold_at:string|null;note:string;created_by:string;created_at:string};
export type Delivery={id:string;delivered_on:string;kind:string;item_info:string;customer_phone:string;address:string;payment_channel:string;contents:string;courier_email:string|null;courier_name:string;entered_by_email:string|null;entered_by_name:string;status:string;sale_id:string|null;lead_id:string|null;note:string;created_by:string;created_at:string;updated_at:string;version:number};
export const closed=['won','lost','invalid'];
export function normalizePhone(v:string){let p=v.replace(/[\s()+-]/g,'');if(p.startsWith('976')&&p.length===11)p=p.slice(3);if(!/^\d{8}$/.test(p))throw new Error('Монголын 8 оронтой утасны дугаар оруулна уу.');return p;}
export function dateLabel(v:string|null){if(!v)return 'Товгүй';const d=new Date(v);return Number.isNaN(d.getTime())?'Огноо шалгах':new Date(d.getTime()+8*3600000).toISOString().slice(0,16).replace('T',' ')+' · УБ';}
export function localInput(v:string|null){return v?new Date(new Date(v).getTime()+8*3600000).toISOString().slice(0,16):'';}
export function fromInput(v:string){return v?new Date(v+':00+08:00').toISOString():null;}
export function csvCell(v:unknown){let s=String(v??'');if(/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}
export function parseCSV(text:string){const rows:string[][]=[];let row:string[]=[],cell='',q=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(q&&text[i+1]==='"'){cell+='"';i++;}else q=!q;}else if(c===','&&!q){row.push(cell);cell='';}else if((c==='\n'||c==='\r')&&!q){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(x=>x.trim()))rows.push(row);row=[];cell='';}else cell+=c;}if(q)throw new Error('CSV-ийн хашилт дутуу байна.');row.push(cell);if(row.some(x=>x.trim()))rows.push(row);return rows;}

export function normalizeRegistration(v:string){const s=v.trim().replace(/\s/g,'').toUpperCase();if(s&&!/^[А-ЯЁӨҮ]{2}\d{8}$/.test(s))throw new Error('Регистрийн дугаар 2 кирилл үсэг, 8 цифртэй байна.');return s;}

export function requestDateLabel(v:string|null){if(!v)return 'Огноогүй';const d=new Date(v);if(Number.isNaN(d.getTime()))return 'Огноо шалгах';const local=new Date(d.getTime()+8*3600000);return local.toISOString().slice(0,19).replace('T',' ')+' · УБ';}
