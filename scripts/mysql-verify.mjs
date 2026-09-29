import mysql from 'mysql2/promise';
import {readFile,writeFile} from 'node:fs/promises';
import {quote,extras} from './mysql-schema.mjs';
const database=new URL(process.env.MYSQL_URL).pathname.slice(1);
if(!/^antmall_crm_(stage|production|test)(?:_[a-z0-9]+)?$/.test(database))throw Error('Unexpected target database');
const db=await mysql.createConnection(process.env.MYSQL_ADMIN_SOCKET?{socketPath:process.env.MYSQL_ADMIN_SOCKET,user:'root',database,decimalNumbers:true,supportBigNumbers:true,dateStrings:true}:{uri:process.env.MYSQL_URL,decimalNumbers:true,supportBigNumbers:true,dateStrings:true});
try{
 if(process.argv.includes('--install-triggers')){for(const sql of extras.filter(s=>s.startsWith('CREATE TRIGGER')))await db.query(sql);}
 const snapshot=JSON.parse(await readFile(process.env.CRM_BACKUP_DIR+'/turso-snapshot.json','utf8'));
 const canonical=rows=>rows.map(r=>JSON.stringify(Object.keys(r).sort().map(k=>[k,r[k]]))).sort();
 const tables=[];for(const t of snapshot){const [rows]=await db.query('SELECT * FROM '+quote(t.name));if(JSON.stringify(canonical(rows))!==JSON.stringify(canonical(t.rows)))throw Error('Row verification failed: '+t.name);tables.push({table:t.name,rows:rows.length});}
 await writeFile(process.env.CRM_BACKUP_DIR+'/verified.json',JSON.stringify({database,tables,verifiedAt:new Date().toISOString()},null,2),{mode:0o600});console.log(JSON.stringify({state:'verified',database,tables}));
}catch(error){console.error('Verification failed:',error.code||error.message);process.exitCode=1;}finally{await db.end();}
