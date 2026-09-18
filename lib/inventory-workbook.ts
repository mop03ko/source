import {openingRows} from './inventory-csv';
export type ImportFile={rows:Record<string,unknown>[];warnings:string[];asOf?:string;sourceRows:number};
const identifier=(s:string)=>/^(\d+(\.\d+)?[Ee][+\-]?\d+|\d+\.0+)$/.test(s)&&Number.isSafeInteger(Number(s))?Number(s).toFixed(0):s.trim();
const amount=(s:string|undefined)=>Math.round(Number(s||0)*100)/100;
export function balanceRows(rows:{number:number;cells:Record<string,string>}[]):ImportFile {
 const result:ImportFile={rows:[],warnings:[],sourceRows:0},seen=new Set<string>();
 const report=rows.find(r=>r.number===1)?.cells;
 if(report?.R){const end=Date.UTC(1899,11,30)+Number(report.R)*86400000-1;result.asOf=new Date(end).toISOString().slice(0,16);}
 for(const {number,cells:r} of rows){
  if(number<=2||(!r.B&&!r.D))continue;result.sourceRows++;
  const code=identifier(r.B||''),qty=Number(r.P||0),total=amount(r.R);
  let issue='';
  if(!code||!r.D?.trim()||!r.H?.trim())issue='Код, нэр эсвэл агуулах дутуу';
  else if(seen.has(code))issue='Зайг цэвэрлэсний дараа код давхардсан';
  else if(r.P===undefined||r.P===''||r.R===undefined||r.R==='')issue='Эцсийн үлдэгдэл / өртгийн тооцоолсон утга дутуу. Excel-д дахин тооцоолж хадгална уу';
  else if(!Number.isSafeInteger(qty)||qty<0)issue='Үлдэгдэл сөрөг эсвэл бүхэл бус';
  else if([total,amount(r.Q),amount(r.S)].some(n=>!Number.isFinite(n)||n<0))issue='Өртөг / үнэ буруу';
  else if(!qty&&total!==0)issue='Тэг үлдэгдэлтэй боловч өртөгтэй';
  if(issue){result.warnings.push(`Balance ${number}-р мөр (${code||'кодгүй'}): ${issue}`);continue;}
  seen.add(code);
  result.rows.push({code,brand:(r.C||'').trim(),supplier:(r.C||'').trim(),name:r.D.trim(),capacity:r.E||'',color:r.F||'',imei:identifier(r.G||''),warehouse:r.H.trim(),qty,unit_cost:amount(r.Q),total_cost:total,sale_price:amount(r.S),variant:'',min_stock:0});
 }
 if(!result.rows.length)throw new Error('Balance sheet-д импортлох бараа олдсонгүй.');
 return result;
}
export async function readInventoryFile(file:File):Promise<ImportFile>{
 if(file.size>10_000_000)throw new Error('10 MB-аас бага файл сонгоно уу.');
 if(file.name.toLowerCase().endsWith('.csv')){const rows=openingRows(await file.text());return {rows,warnings:[],sourceRows:rows.length};}
 if(!file.name.toLowerCase().endsWith('.xlsx'))throw new Error('.xlsx эсвэл .csv файл сонгоно уу.');
 const {unzipSync,strFromU8}=await import('fflate');let total=0;
 const archive=unzipSync(new Uint8Array(await file.arrayBuffer()),{filter:entry=>{
  if(!/^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/sheet\d+\.xml)$/.test(entry.name))return false;
  total+=entry.originalSize;if(total>60_000_000||entry.originalSize>25_000_000)throw new Error('Excel-ийн задлагдсан хэмжээ хэт том.');return true;
 }});
 const xml=(path:string)=>{
  if(!archive[path])throw new Error('Excel-ийн бүтэц дутуу: '+path);
  const text=strFromU8(archive[path]);if(/<!DOCTYPE/i.test(text))throw new Error('Excel XML бүтэц дэмжигдэхгүй.');
  const doc=new DOMParser().parseFromString(text,'application/xml');if(doc.querySelector('parsererror'))throw new Error('Excel XML бүтэц буруу.');return doc;
 };
 const book=xml('xl/workbook.xml'),sheet=[...book.getElementsByTagName('sheet')].find(s=>s.getAttribute('name')==='Balance');
 if(!sheet)throw new Error('Balance нэртэй sheet олдсонгүй.');
 const rid=sheet.getAttribute('r:id'),rel=[...xml('xl/_rels/workbook.xml.rels').getElementsByTagName('Relationship')].find(r=>r.getAttribute('Id')===rid);
 const target=rel?.getAttribute('Target')||'',path=target.startsWith('/')?target.slice(1):'xl/'+target;
 const strings=archive['xl/sharedStrings.xml']?[...xml('xl/sharedStrings.xml').getElementsByTagName('si')].map(si=>[...si.getElementsByTagName('t')].map(t=>t.textContent||'').join('')):[];
 const rows=[...xml(path).getElementsByTagName('row')].map(row=>({number:Number(row.getAttribute('r')),cells:Object.fromEntries([...row.getElementsByTagName('c')].map(cell=>{
  let value=cell.getElementsByTagName('v')[0]?.textContent||'';
  if(cell.getAttribute('t')==='s')value=strings[Number(value)]||'';
  if(cell.getAttribute('t')==='inlineStr')value=cell.textContent||'';
  return [(cell.getAttribute('r')||'').replace(/\d/g,''),value];
 }))}));
 return balanceRows(rows);
}
