import {createSign} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import mysql from 'mysql2/promise';

const sheetId='1M2axJmy54eQ7ksUS-6bZLACftqkWHFQ4tj82h88DPbk';
const sheetGid=2042487499;
const markerHeader='CRM Request ID';
const root=`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}`;
export function sheetTimestamp(iso){
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Ulaanbaatar',year:'numeric',month:'numeric',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(iso));
 const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));return `${p.month}/${p.day}/${p.year}, ${p.hour}:${p.minute}:${p.second}`;
}
export function timestampKey(value){
 if(typeof value==='number')return Math.round((value-25569)*86400);
 const m=String(value||'').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
 if(!m)return null;
 let hour=Number(m[4]);if(m[7])hour=hour%12+(m[7].toUpperCase()==='PM'?12:0);
 return Date.UTC(Number(m[3]),Number(m[1])-1,Number(m[2]),hour,Number(m[5]),Number(m[6]||0))/1000;
}
export function existingRow(rows,lead){
 const exact=rows.findIndex(row=>row[26]===lead.id);if(exact>=0)return exact;
 const stamp=timestampKey(sheetTimestamp(lead.received_at));
 return rows.findIndex((row,index)=>index>0&&!row[26]&&timestampKey(row[0])!==null&&Math.abs(timestampKey(row[0])-stamp)<=1&&[lead.phone,lead.registration,lead.product,lead.name].every((value,i)=>String(row[i+1]??'').trim()===String(value).trim()));
}
export function sheetValues(lead){const row=Array(27).fill('');row.splice(0,5,sheetTimestamp(lead.received_at),lead.phone,lead.registration,lead.product,lead.name);row[26]=lead.id;return row;}
async function googleToken(){
 const email=process.env.WEB_LOAN_SHEET_CLIENT_EMAIL,key=process.env.WEB_LOAN_SHEET_PRIVATE_KEY_BASE64?Buffer.from(process.env.WEB_LOAN_SHEET_PRIVATE_KEY_BASE64,'base64').toString():process.env.WEB_LOAN_SHEET_PRIVATE_KEY;
 if(!email||!key)throw Error('Mirror credentials missing');
 const enc=value=>Buffer.from(JSON.stringify(value)).toString('base64url'),now=Math.floor(Date.now()/1000);
 const data=enc({alg:'RS256',typ:'JWT'})+'.'+enc({iss:email,scope:'https://www.googleapis.com/auth/spreadsheets',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600});
 const assertion=data+'.'+createSign('RSA-SHA256').update(data).sign(key.replace(/\\n/g,'\n')).toString('base64url');
 const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion}),signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error('Google authentication HTTP '+response.status);
 const token=(await response.json()).access_token;if(!token)throw Error('Google authentication failed');return token;
}
export async function runMirror(){
 if(process.env.WEB_LOAN_SHEET_MIRROR_ENABLED!=='true')return;
 const db=await mysql.createConnection(process.env.MYSQL_URL);
 let locked=false;
 try{
  const [lock]=await db.query("SELECT GET_LOCK('antmall_web_loan_sheet_mirror',0) acquired");if(!lock[0].acquired)return;locked=true;
  const [leads]=await db.execute(`SELECT l.id,l.name,l.phone,l.registration,l.product,w.received_at,a.kind mirror_state
   FROM web_loan_requests w JOIN leads l ON l.id=w.lead_id LEFT JOIN activities a ON a.id=CONCAT('sheet-',l.id)
   WHERE a.id IS NULL OR a.kind IN ('sheet_pending','sheet_sending','sheet_uncertain') ORDER BY w.received_at LIMIT 1000`);
  if(!leads.length){console.log('Sheet mirror: no pending requests');return;}
  const token=await googleToken(),headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
  const read=async url=>{const r=await fetch(url,{headers,signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('Google read HTTP '+r.status);return r.json();};
  const metadata=await read(root+'?fields=sheets(properties(sheetId,title,gridProperties(columnCount)))');
  const tab=metadata.sheets.find(s=>s.properties.sheetId===sheetGid)?.properties;
  if(!tab||tab.gridProperties.columnCount<27)throw Error('Sheet tab or marker column unavailable');
  const range="'"+tab.title.replaceAll("'","''")+"'!";
  const urlRange=r=>root+'/values/'+encodeURIComponent(range+r);
  const rows=(await read(urlRange('A:AA')+'?valueRenderOption=UNFORMATTED_VALUE')).values||[];
  if(rows[0]?.[26]&&rows[0][26]!==markerHeader)throw Error('AA column already used');
  if(!rows[0]?.[26]&&rows.slice(1).some(row=>row[26]))throw Error('AA column contains existing values');
  if(!rows[0]?.[26]){
   const r=await fetch(urlRange('AA1')+'?valueInputOption=RAW',{method:'PUT',headers,body:JSON.stringify({values:[[markerHeader]]}),signal:AbortSignal.timeout(15000)});
   if(!r.ok)throw Error('Marker header HTTP '+r.status);
  }
  let mirrored=0,reconciled=0,uncertain=0,failed=0;const started=Date.now();
  const record=async(lead,kind,note)=>db.execute("INSERT INTO activities(id,lead_id,phone,kind,note,actor,created_at) VALUES(?,?,?,?,?,'AntMall Sheet',?) ON DUPLICATE KEY UPDATE kind=VALUES(kind),note=VALUES(note)",['sheet-'+lead.id,lead.id,lead.phone,kind,note,new Date().toISOString()]);
  for(const lead of leads){
   if(Date.now()-started>45000)break;
   const existing=existingRow(rows,lead);
   if(existing>=0){
    if(!rows[existing][26]){const r=await fetch(urlRange('AA'+(existing+1))+'?valueInputOption=RAW',{method:'PUT',headers,body:JSON.stringify({values:[[lead.id]]}),signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('Marker update HTTP '+r.status);rows[existing][26]=lead.id;}
    await record(lead,'note','Google Sheet-д давхар бүртгэгдсэн (тулгаж баталгаажуулсан).');reconciled++;continue;
   }
   if(['sheet_sending','sheet_uncertain'].includes(lead.mirror_state)){uncertain++;continue;}
   if(mirrored+failed>=40)break;
   // Claim before append: a timeout must never cause a blind duplicate append.
   await record(lead,'sheet_sending','Google Sheet-д давхар бүртгэж байна.');
   let response;
   // Search only the original A:E table. Including isolated AA markers can
   // make Sheets detect a different table and start an append at column AA.
   try{response=await fetch(urlRange('A:E')+':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS',{method:'POST',headers,body:JSON.stringify({values:[sheetValues(lead)]}),signal:AbortSignal.timeout(20000)});}
   catch{await record(lead,'sheet_uncertain','Google Sheet-ийн хариу тодорхойгүй. Давхар бичихээс өмнө хүсэлтийн ID-аар тулгана.');uncertain++;continue;}
   if(!response.ok){const kind=response.status>=500?'sheet_uncertain':'sheet_pending';await record(lead,kind,'Google Sheet бичилт HTTP '+response.status);failed++;continue;}
   let result;try{result=await response.json();}catch{await record(lead,'sheet_uncertain','Google Sheet-ийн хариуг тулгаж шалгах шаардлагатай.');uncertain++;continue;}
   if(result.updates?.updatedRows!==1||!/!A\d+:AA\d+$/.test(result.updates?.updatedRange||'')){await record(lead,'sheet_uncertain','Google Sheet-ийн бичилтийн багана, мөрийг тулгаж шалгах шаардлагатай.');uncertain++;continue;}
   // Read back the request marker before calling this export complete.
   const written=await read(root+'/values/'+encodeURIComponent(result.updates.updatedRange)+'?valueRenderOption=UNFORMATTED_VALUE');
   if(written.values?.[0]?.[26]!==lead.id){await record(lead,'sheet_uncertain','Google Sheet-ийн хүсэлтийн ID баталгаажаагүй.');uncertain++;continue;}
   rows.push(sheetValues(lead));await record(lead,'note','Google Sheet-д давхар бүртгэгдсэн.');mirrored++;
  }
  console.log(JSON.stringify({mirrored,reconciled,uncertain,failed}));
 }finally{if(locked)await db.query("SELECT RELEASE_LOCK('antmall_web_loan_sheet_mirror')");await db.end();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)runMirror().catch(()=>{console.error('Sheet mirror failed; no credentials or customer data logged');process.exitCode=1;});
