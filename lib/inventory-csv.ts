// RFC 4180 fields, including Excel's BOM, quoted commas and embedded newlines.
export function parseCsv(text:string):Record<string,string>[] {
 const rows:string[][]=[];let row:string[]=[],cell='',quoted=false;
 const input=text.replace(/^\uFEFF/,'');
 for(let i=0;i<input.length;i++){
  const c=input[i];
  if(c==='"'){if(quoted&&input[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
  else if(c===','&&!quoted){row.push(cell);cell='';}
  else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&input[i+1]==='\n')i++;row.push(cell);if(row.some(v=>v.trim()))rows.push(row);row=[];cell='';}
  else cell+=c;
 }
 if(quoted)throw new Error('CSV файлд хаагдаагүй хашилт байна.');
 row.push(cell);if(row.some(v=>v.trim()))rows.push(row);
 const headers=rows.shift()?.map(v=>v.trim())||[];
 if(new Set(headers).size!==headers.length)throw new Error('CSV баганын нэр давхардсан.');
 const required=['code','name','warehouse','qty','unit_cost'];
 if(required.some(h=>!headers.includes(h)))throw new Error('Шаардлагатай багана: '+required.join(', '));
 return rows.map((r,i)=>{if(r.length!==headers.length)throw new Error(`${i+2}-р мөрийн баганын тоо зөрүүтэй.`);return Object.fromEntries(headers.map((h,j)=>[h,r[j]]));});
}
export function openingRows(text:string){
 return parseCsv(text).map(row=>({...row,...Object.fromEntries(['qty','unit_cost','sale_price','min_stock','total_cost'].filter(k=>row[k]!==undefined&&row[k]!=='').map(k=>[k,Number(row[k])]))}));
}
export function toCsv(headers:string[],rows:unknown[][]){
 const field=(value:unknown)=>{let s=String(value??'');if(typeof value==='string'&&/^[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
 return '\uFEFF'+[headers,...rows].map(row=>row.map(field).join(',')).join('\r\n');
}
