import {z} from 'zod';
import {member,Failure,isSameOrigin} from '@/lib/access';
import {canViewInventoryCost} from '@/lib/crm';
import {getClient} from '@/lib/database';
import {readInventorySheet,readInventoryWorkbook,spreadsheetId,unionSpreadsheetId,serviceEmail} from '@/scripts/inventory-sheet-source.mjs';
import {planBalance} from '@/scripts/inventory-sheet-plan.mjs';
import {reconcileWorkbook} from '@/scripts/inventory-reconcile.mjs';
import {inventorySnapshot,applyBalance} from '@/scripts/sync-inventory-sheet.mjs';
export const dynamic='force-dynamic';
export const maxDuration=60;
const sources=[{id:'main',spreadsheetId,name:'Үндсэн агуулахууд',mapping:'Арын → Olympic Galleria · Заал → Үзүүлэн · Урд → Сонсголон'},
 {id:'union',spreadsheetId:unionSpreadsheetId,name:'Union',mapping:'Арын агуулах → Union. Бусад агуулахыг шинэчлэхгүй.'}];
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
function failure(e:unknown){
 if(e instanceof Failure)return json({error:e.message},e.status);
 if(e instanceof z.ZodError||e instanceof SyntaxError)return json({error:'Хүсэлтийн мэдээлэл буруу.'},400);
 const message=e instanceof Error?e.message:'';
 const header=/Unexpected (Balance|Purchase|Sales) header/.exec(message);
 if(header)return json({error:`Sheet-ийн ${header[1]} табын баганын бүтэц өөрчлөгдсөн байна. Гарчгийн мөрийг шалгана уу.`},422);
 if(/changed since preview/.test(message))return json({error:'Тулгаснаас хойш мэдээлэл өөрчлөгдсөн. Дахин тулгана уу.'},409);
 if(/Google Sheet read failed: (403|404)/.test(message))return json({error:'Service account-ийн Sheet унших эрхийг шалгана уу.'},503);
 if(/credential unavailable|Invalid key length/.test(message))return json({error:'Зээлийн хүсэлтийн Google холболтын түлхүүрийг эхлээд тохируулна уу.'},503);
 return json({error:'Sheet-ийг шинэчилж чадсангүй. Google холболт болон өгөгдлийн сангийн төлөвийг шалгаад дахин тулгана уу.'},503);
}
async function authorize(){const m=await member();if(!canViewInventoryCost(m.role))throw new Failure('Зөвхөн админ, удирдлага, ахлах хандана.',403);return m;}
export async function GET(){try{
 await authorize();const db=getClient();
 const connection=await db.execute({sql:'SELECT id FROM sheet_connection WHERE email=? AND credential IS NOT NULL LIMIT 1',args:[serviceEmail]});
 const history=await db.execute("SELECT payload,response,created_at FROM inventory_requests WHERE action='sheet_balance_sync' ORDER BY created_at DESC LIMIT 20");
 return json({sources,serviceEmail,connected:!!connection.rows.length,history:history.rows.map(r=>{const p=JSON.parse(String(r.payload)),v=JSON.parse(String(r.response));return {sourceId:p.spreadsheetId,at:r.created_at,actor:p.actor||serviceEmail,changed:v.changed,unchanged:v.unchanged,issueCount:v.issues?.length||0};})});
}catch(e){return failure(e);}}
const day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const input=z.object({action:z.enum(['preview','apply','reconcile']),source:z.enum(['main','union']),digest:z.string().regex(/^[a-f0-9]{64}$/).optional(),planDigest:z.string().regex(/^[a-f0-9]{64}$/).optional(),from:day.optional(),to:day.optional()}).strict();
// Бүх табын тулгалт (зөвхөн тайлан): CRM-ийн purchase/purchase_return/sale хөдөлгөөнийг УБ өдрөөр авч Sheet-тэй харьцуулна.
async function reconcile(db:ReturnType<typeof getClient>,sourceSpreadsheetId:string,from:string,to:string){
 const start=Date.parse(from+'T00:00:00+08:00'),end=Date.parse(to+'T23:59:59.999+08:00');
 if(!(start<=end))throw new Failure('Хугацааны эхлэл төгсгөлөөс хойш байна.');
 if(end-start>92*86400000)throw new Failure('Гүйлгээний тулгалтын хугацаа 92 хоногоос хэтрэхгүй.');
 const [workbook,crm,moves]=await Promise.all([readInventoryWorkbook(db,sourceSpreadsheetId),inventorySnapshot(db),
  db.execute({sql:"SELECT i.code code,m.warehouse_id warehouse_id,m.kind kind,m.qty_delta qty_delta,date(COALESCE(m.occurred_at,m.created_at),'+8 hours') day FROM inventory_stock_moves m JOIN inventory_items i ON i.id=m.item_id WHERE m.kind IN ('purchase','purchase_return','sale','sale_reversal') AND COALESCE(m.occurred_at,m.created_at)>=? AND COALESCE(m.occurred_at,m.created_at)<=?",args:[new Date(start).toISOString(),new Date(end).toISOString()]})]);
 return reconcileWorkbook(workbook,crm,moves.rows.map(r=>({code:String(r.code??''),warehouse_id:String(r.warehouse_id),kind:String(r.kind),qty_delta:Number(r.qty_delta),day:String(r.day)})),{from,to});
}
export async function POST(req:Request){try{
 if(!isSameOrigin(req))throw new Failure('Хүсэлт зөвшөөрөгдөхгүй.',403);
 const m=await authorize();const raw=await req.text();if(raw.length>2048)throw new Failure('Хүсэлт хэт том.',413);
 const b=input.parse(JSON.parse(raw));if(b.action==='apply'&&(!b.digest||!b.planDigest))throw new Failure('Эхлээд үлдэгдлийг тулгана уу.');
 const config=sources.find(s=>s.id===b.source)!;const db=getClient();
 if(b.action==='reconcile'){const today=new Date(Date.now()+8*3600000).toISOString().slice(0,10),weekAgo=new Date(Date.now()+8*3600000-6*86400000).toISOString().slice(0,10);return json(await reconcile(db,config.spreadsheetId,b.from||weekAgo,b.to||today));}
 const source=await readInventorySheet(db,config.spreadsheetId);
 if(b.action==='apply')return json(await applyBalance(db,source,b.digest!,b.planDigest,m.email));
 const plan=planBalance(source,await inventorySnapshot(db));
 const previous=await db.execute({sql:'SELECT id FROM inventory_requests WHERE id=?',args:['inventory-sheet:'+plan.digest]});
 return json({...plan,targets:undefined,title:source.title,readAt:source.readAt,alreadyApplied:!!previous.rows.length});
}catch(e){return failure(e);}}
