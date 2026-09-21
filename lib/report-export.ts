'use client';
import {buildXlsx,type Sheet,type Cell} from './xlsx';
export type {Sheet,Cell};
export type ReportDoc={title:string;meta?:string[];sheets:Sheet[]};
const stamp=()=>new Date(Date.now()+8*3600000).toISOString().slice(0,10);
const safeName=(v:string)=>v.replace(/[\\/:*?"<>|]/g,'-').replace(/\s+/g,' ').trim().slice(0,80);
// .xlsx нь zip тул fflate-ээр шахаж татаана (inventory-workbook.ts-тэй ижил сан).
export async function downloadXlsx(doc:ReportDoc){
 const {zipSync,strToU8}=await import('fflate');
 const parts=Object.fromEntries(Object.entries(buildXlsx(doc.sheets)).map(([name,xml])=>[name,strToU8(xml)]));
 const zipped=zipSync(parts,{level:6});
 const blob=new Blob([zipped.slice() as unknown as BlobPart],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
 const url=URL.createObjectURL(blob),link=document.createElement('a');
 link.href=url;link.download=`${safeName(doc.title)} ${stamp()}.xlsx`;
 document.body.append(link);link.click();link.remove();
 setTimeout(()=>URL.revokeObjectURL(url),2000);
}
const cellText=(v:Cell)=>v===null||v===undefined?'':typeof v==='number'?v.toLocaleString('mn-MN'):String(v);
const escHtml=(v:string)=>v.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]!));
// PDF-ийг хэвлэх цонхоор гаргана: кирилл үсэг 100% зөв, график/фонт хавсаргах шаардлагагүй, хэрэглэгч
// хэвлэх цонхноос "Save as PDF" гэж хадгална.
export function printReport(doc:ReportDoc){
 const win=window.open('','_blank','width=1100,height=800');
 if(!win){throw new Error('Хэвлэх цонх хаагдсан байна. Хөтчийн popup хоригийг зөвшөөрнө үү.');}
 const tables=doc.sheets.map(s=>`<section><h2>${escHtml(s.name)}</h2><table><thead><tr>${s.columns.map(c=>`<th>${escHtml(c.header)}</th>`).join('')}</tr></thead><tbody>${
  s.rows.map(r=>`<tr>${r.map(v=>`<td${typeof v==='number'?' class="num"':''}>${escHtml(cellText(v))}</td>`).join('')}</tr>`).join('')
 }</tbody></table>${s.rows.length?'':'<p class="empty">Мэдээлэл алга.</p>'}</section>`).join('');
 win.document.write(`<!doctype html><html lang="mn"><head><meta charset="utf-8"><title>${escHtml(doc.title)}</title><style>
 *{box-sizing:border-box}
 body{font:13px/1.45 'Segoe UI',Arial,sans-serif;color:#111;margin:28px}
 h1{font-size:20px;margin:0 0 4px}
 .meta{color:#555;font-size:12px;margin:0 0 18px}
 .meta span{margin-right:14px}
 section{margin:0 0 22px;break-inside:avoid}
 h2{font-size:14px;margin:0 0 8px;padding-bottom:4px;border-bottom:2px solid #111}
 table{width:100%;border-collapse:collapse}
 th,td{border:1px solid #d0d0d0;padding:5px 7px;text-align:left;vertical-align:top}
 th{background:#f2f2f2;font-weight:600}
 td.num{text-align:right;font-variant-numeric:tabular-nums}
 tbody tr:nth-child(even){background:#fafafa}
 .empty{color:#666;font-style:italic}
 @page{size:A4 landscape;margin:12mm}
 @media print{body{margin:0}thead{display:table-header-group}tr{break-inside:avoid}}
 </style></head><body>
 <h1>${escHtml(doc.title)}</h1>
 <p class="meta">${[...(doc.meta||[]),`Татсан: ${stamp()} · АntMall CRM`].map(v=>`<span>${escHtml(v)}</span>`).join('')}</p>
 ${tables}
 </body></html>`);
 win.document.close();
 win.focus();
 // Зарим хөтөч дээр DOM бүрэн бэлдэхээс өмнө print() дуудвал хоосон хуудас гардаг.
 setTimeout(()=>win.print(),250);
}
