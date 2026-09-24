import {createDecipheriv,createSign} from 'node:crypto';

export const spreadsheetId='1p3zkBMJ9AE6qJP9BvN0ax5Fl8cL7pc1txgnlE_q2QmY';
export const unionSpreadsheetId='1TULrtL9lmS93FskMiJ30_V7FSHXQr7fZCnZxUNTV-ds';
export const serviceEmail='zeeliin-huselt@zeeliin-huselt.iam.gserviceaccount.com';
export async function readInventorySheet(db,sourceId=spreadsheetId){
 if(![spreadsheetId,unionSpreadsheetId].includes(sourceId))throw Error('Unknown inventory source');
 const result=await db.execute({sql:'SELECT credential FROM sheet_connection WHERE email=? AND credential IS NOT NULL ORDER BY id LIMIT 1',args:[serviceEmail]});
 if(!result.rows.length)throw Error('Inventory service account credential unavailable');
 const [iv,payload]=String(result.rows[0].credential).split('.').map(s=>Buffer.from(s,'base64'));
 const decipher=createDecipheriv('aes-256-gcm',Buffer.from(process.env.CRM_CONNECTION_ENCRYPTION_KEY||'','base64'),iv);
 decipher.setAAD(Buffer.from('antmall-google-sheets-v1'));decipher.setAuthTag(payload.subarray(-16));
 const credential=JSON.parse(Buffer.concat([decipher.update(payload.subarray(0,-16)),decipher.final()]).toString());
 if(credential.client_email!==serviceEmail)throw Error('Unexpected service account');
 const now=Math.floor(Date.now()/1000),encode=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
 const data=encode({alg:'RS256',typ:'JWT'})+'.'+encode({iss:serviceEmail,scope:'https://www.googleapis.com/auth/spreadsheets.readonly',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600});
 const assertion=data+'.'+createSign('RSA-SHA256').update(data).sign(credential.private_key,'base64url');
 const auth=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion}),signal:AbortSignal.timeout(15000)});
 if(!auth.ok)throw Error('Google authentication failed: '+auth.status);
 const {access_token}=await auth.json();
 const read=async path=>{const r=await fetch('https://sheets.googleapis.com/v4/spreadsheets/'+sourceId+path,{headers:{Authorization:'Bearer '+access_token},signal:AbortSignal.timeout(25000)});if(!r.ok)throw Error('Google Sheet read failed: '+r.status);return r.json();};
 const meta=await read('?fields=properties(title),sheets(properties(title,gridProperties(rowCount,columnCount)))');
 const sheet=meta.sheets.find(s=>s.properties.title==='Balance')?.properties;
 if(!sheet||sheet.gridProperties.rowCount>20000||sheet.gridProperties.columnCount<23)throw Error('Unexpected Balance sheet dimensions');
 const end=sheet.gridProperties.columnCount>=24?'X':'W';
 const values=await read('/values/'+encodeURIComponent("'Balance'!A1:"+end+sheet.gridProperties.rowCount)+'?valueRenderOption=UNFORMATTED_VALUE');
 return {spreadsheetId:sourceId,title:meta.properties.title,readAt:new Date().toISOString(),values:values.values||[]};
}
