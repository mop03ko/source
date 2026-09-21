// .xlsx бичигчийг бодит zip болгож шахаад эргүүлэн уншиж шалгана (Excel-ийн шаардлагатай хэсгүүд).
const ts=require('typescript');const fs=require('fs');const assert=require('node:assert/strict');
const {zipSync,unzipSync,strToU8,strFromU8}=require('fflate');
function load(path){const out=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const m={exports:{}};new Function('require','module','exports',out)(require,m,m.exports);return m.exports;}
const {buildXlsx,columnName}=load('lib/xlsx.ts');
// Бичигчийн гаргасан файлуудыг бодитоор zip → unzip хийж, Excel уншдагтай ижил замаар шалгана.
const roundTrip=(sheets)=>{
 const files=buildXlsx(sheets);
 const archive=unzipSync(zipSync(Object.fromEntries(Object.entries(files).map(([k,v])=>[k,strToU8(v)])),{level:6}));
 return Object.fromEntries(Object.entries(archive).map(([k,v])=>[k,strFromU8(v)]));
};
(async()=>{
 // Баганын нэр: Excel-ийн A..Z, AA.. дараалал.
 assert.equal(columnName(0),'A');assert.equal(columnName(25),'Z');
 assert.equal(columnName(26),'AA');assert.equal(columnName(27),'AB');assert.equal(columnName(51),'AZ');
 assert.equal(columnName(52),'BA');assert.equal(columnName(701),'ZZ');assert.equal(columnName(702),'AAA');

 const out=roundTrip([
  {name:'Ажилтны үзүүлэлт',columns:[{header:'Ажилтан',width:24},{header:'Нийт'},{header:'Хувь %'}],
   rows:[['Б.Сэлэнгэ',25,62.5],['Г.Тунгалаг',0,0],['Хоосонтой',null,'']]},
  {name:'Сараар',columns:[{header:'Сар'},{header:'Тоо'}],rows:[['2026-09',108]]},
 ]);
 // Excel шаарддаг бүх хэсэг байх ёстой.
 for(const part of ['[Content_Types].xml','_rels/.rels','xl/workbook.xml','xl/_rels/workbook.xml.rels','xl/styles.xml','xl/worksheets/sheet1.xml','xl/worksheets/sheet2.xml'])
  assert.ok(out[part],'дутуу: '+part);
 assert.equal(Object.keys(out).filter(k=>k.startsWith('xl/worksheets/')).length,2);

 // Хуудасны нэр, холбоос зөв уялдсан.
 assert.match(out['xl/workbook.xml'],/name="Ажилтны үзүүлэлт" sheetId="1" r:id="rId1"/);
 assert.match(out['xl/workbook.xml'],/name="Сараар" sheetId="2" r:id="rId2"/);
 assert.match(out['xl/_rels/workbook.xml.rels'],/Id="rId1"[^>]*Target="worksheets\/sheet1\.xml"/);
 assert.match(out['xl/_rels/workbook.xml.rels'],/Id="rId3"[^>]*Target="styles\.xml"/); // 2 хуудас + styles
 assert.match(out['[Content_Types].xml'],/\/xl\/worksheets\/sheet2\.xml/);

 const sheet=out['xl/worksheets/sheet1.xml'];
 // Толгой мөр тод хэвтэй (s="1"), кирилл шууд уншигдана.
 assert.match(sheet,/<row r="1">/);
 assert.match(sheet,/<c r="A1" s="1" t="inlineStr"><is><t xml:space="preserve">Ажилтан<\/t><\/is><\/c>/);
 // Текст inlineStr, тоо <v> — Excel тоог тоо гэж уншина.
 assert.match(sheet,/<c r="A2" t="inlineStr"><is><t xml:space="preserve">Б\.Сэлэнгэ<\/t><\/is><\/c>/);
 assert.match(sheet,/<c r="B2"><v>25<\/v><\/c>/);
 assert.match(sheet,/<c r="C2"><v>62\.5<\/v><\/c>/);
 // Тэг нь хоосон биш тоо хэвээр.
 assert.match(sheet,/<c r="B3"><v>0<\/v><\/c>/);
 // null ба хоосон текст хоосон нүд болно.
 assert.match(sheet,/<c r="B4"\/>/);assert.match(sheet,/<c r="C4"\/>/);
 // Баганын өргөн бичигдсэн.
 assert.match(sheet,/<col min="1" max="1" width="24" customWidth="1"\/>/);
 assert.match(sheet,/<cols>/);

 // XML-д онцгой тэмдэгт зөв escape болно (эс тэгвээс Excel файлыг эвдэрсэн гэж үзнэ).
 const esc=roundTrip([{name:'Т',columns:[{header:'A&B'}],rows:[['<tag> "quoted" & \'apos\''],["мөрхяналт"]]}]);
 const escSheet=esc['xl/worksheets/sheet1.xml'];
 assert.match(escSheet,/A&amp;B/);
 assert.match(escSheet,/&lt;tag&gt; &quot;quoted&quot; &amp; &apos;apos&apos;/);
 assert.ok(!escSheet.includes(''),'хяналтын тэмдэгт хасагдах ёстой');
 assert.ok(!/<t xml:space="preserve">[^<]*<tag>/.test(escSheet),'escape хийгдээгүй тэг байна');

 // Хуудасны нэрний хориотой тэмдэгт, 31 тэмдэгтийн хязгаар.
 const named=roundTrip([{name:'Тайлан: 2026/09 [шинэ]*?',columns:[{header:'A'}],rows:[['x']]},{name:'',columns:[],rows:[]}]);
 const book=named['xl/workbook.xml'];
 assert.ok(!/[:\\/?*[\]]/.test(book.match(/name="([^"]*)" sheetId="1"/)[1]),'хориотой тэмдэгт цэвэрлэгдсэн байх');
 assert.ok(book.match(/name="([^"]*)" sheetId="1"/)[1].length<=31);
 assert.equal(book.match(/name="([^"]*)" sheetId="2"/)[1],'Sheet2'); // хоосон нэр нөхөгдөнө

 // Хуудасгүй ч Excel уншихаар хүчинтэй файл гарна.
 const empty=roundTrip([]);
 assert.ok(empty['xl/worksheets/sheet1.xml']);
 assert.match(empty['xl/workbook.xml'],/name="Sheet1"/);

 // Мөр дэх нүдний хаяг мөрийн дугаартай тааруулсан (толгойтой үед 2-оос эхэлнэ).
 const many=roundTrip([{name:'S',columns:[{header:'H'}],rows:[['a'],['b'],['c']]}]);
 assert.match(many['xl/worksheets/sheet1.xml'],/<row r="4"><c r="A4" t="inlineStr"><is><t xml:space="preserve">c<\/t>/);
 console.log('PASS: xlsx writer — real zip round-trip, all parts Excel requires with matching sheet/rel/content-type wiring, bold header style, inline strings for text and numeric <v> cells (zero kept, null and empty blanked), column widths, XML escaping with control characters stripped, sheet-name sanitising and the 31-character limit, an empty workbook still valid, and cell references aligned to row numbers.');
})().catch(e=>{console.error(e);process.exit(1)});
