// Бодит .xlsx (Office Open XML) бичигч. .xlsx нь zip тул кодод аль хэдийн байгаа fflate-ээр хийнэ —
// шинэ dependency шаардахгүй (lib/inventory-workbook.ts мөн fflate-ээр л уншдаг).
// Текстийг inlineStr-ээр бичдэг тул sharedStrings шаардахгүй, кирилл шууд ажиллана.
export type Cell=string|number|null|undefined;
export type Column={header:string;width?:number};
export type Sheet={name:string;columns:Column[];rows:Cell[][]};
const esc=(v:string)=>v.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!)).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'');
// Excel-ийн баганын нэр: 0→A, 26→AA.
export function columnName(index:number){let n=index+1,out='';while(n>0){const r=(n-1)%26;out=String.fromCharCode(65+r)+out;n=Math.floor((n-1)/26);}return out;}
// Excel-ийн хуудасны нэрэнд : \ / ? * [ ] хориотой, 31 тэмдэгтээр хязгаарлагдана.
const sheetName=(name:string,index:number)=>(name.replace(/[:\\/?*[\]]/g,' ').trim().slice(0,31)||`Sheet${index+1}`);
function sheetXml(sheet:Sheet){
 const cols=sheet.columns.length
  ? `<cols>${sheet.columns.map((c,i)=>`<col min="${i+1}" max="${i+1}" width="${Math.min(80,Math.max(8,c.width??Math.min(40,Math.max(10,c.header.length+4))))}" customWidth="1"/>`).join('')}</cols>`
  : '';
 const cell=(value:Cell,ref:string,style:number)=>{
  const s=style?` s="${style}"`:'';
  if(value===null||value===undefined||value==='')return `<c r="${ref}"${s}/>`;
  if(typeof value==='number'&&Number.isFinite(value))return `<c r="${ref}"${s}><v>${value}</v></c>`;
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(String(value))}</t></is></c>`;
 };
 const header=sheet.columns.length
  ? `<row r="1">${sheet.columns.map((c,i)=>cell(c.header,columnName(i)+'1',1)).join('')}</row>`
  : '';
 const body=sheet.rows.map((row,r)=>{
  const n=r+(sheet.columns.length?2:1);
  return `<row r="${n}">${row.map((v,i)=>cell(v,columnName(i)+n,0)).join('')}</row>`;
 }).join('');
 return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${cols}<sheetData>${header}${body}</sheetData></worksheet>`;
}
export function buildXlsx(sheets:Sheet[]){
 const list=(sheets.length?sheets:[{name:'Sheet1',columns:[],rows:[]}]).map((s,i)=>({...s,name:sheetName(s.name,i)}));
 const files:Record<string,string>={
  '[Content_Types].xml':`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${list.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`,
  '_rels/.rels':`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
  'xl/workbook.xml':`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${list.map((s,i)=>`<sheet name="${esc(s.name)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets></workbook>`,
  'xl/_rels/workbook.xml.rels':`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${list.map((_,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')}<Relationship Id="rId${list.length+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
  // Хоёр хэв: 0 = ердийн, 1 = тод (толгой мөр).
  'xl/styles.xml':`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>`,
 };
 for(const [i,s] of list.entries())files[`xl/worksheets/sheet${i+1}.xml`]=sheetXml(s);
 return files;
}
