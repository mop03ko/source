// Import only into a new, empty CRM database. Never changes the source database.
import mysql from 'mysql2/promise';
import {createClient} from '@libsql/client';
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {mysqlSchema,quote,extras} from './mysql-schema.mjs';

const schema=mysqlSchema(),destination=new URL(process.env.MYSQL_URL);
if(!/^antmall_crm_(stage|production|test)(?:_[a-z0-9]+)?$/.test(destination.pathname.slice(1)))throw Error('Unexpected target database');
const target=await mysql.createConnection(process.env.MYSQL_ADMIN_SOCKET?{socketPath:process.env.MYSQL_ADMIN_SOCKET,user:'root',database:destination.pathname.slice(1),decimalNumbers:true,supportBigNumbers:true,dateStrings:true}:{uri:process.env.MYSQL_URL,decimalNumbers:true,supportBigNumbers:true,dateStrings:true});
const source=createClient({url:process.env.TURSO_DATABASE_URL,authToken:process.env.TURSO_AUTH_TOKEN});
try{
 const [existing]=await target.query('SHOW TABLES');if(existing.length)throw Error('Target must be empty');
 const sourceTables=await source.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
 if(JSON.stringify(sourceTables.rows.map(r=>r.name).sort())!==JSON.stringify(schema.map(t=>t.name).sort()))throw Error('Source schema differs from the reviewed release');
 const tx=await source.transaction('read');let snapshot,skuSequence=0;
 try{const results=await tx.batch([...schema.map(t=>`SELECT ${t.name==='inventory_stock_moves'?'rowid,':''}* FROM ${quote(t.name)}`),"SELECT seq FROM sqlite_sequence WHERE name='inventory_product_codes'"]);snapshot=schema.map((t,i)=>({name:t.name,rows:results[i].rows.map(r=>Object.fromEntries(results[i].columns.map(c=>[c,r[c]])))}));skuSequence=Number(results.at(-1).rows[0]?.seq||0);await tx.commit();}finally{if(!tx.closed)await tx.rollback();tx.close();}
 const path=process.env.CRM_BACKUP_DIR;if(!path)throw Error('CRM_BACKUP_DIR required');await mkdir(path,{recursive:true,mode:0o700});
 const data=JSON.stringify(snapshot),digest=createHash('sha256').update(data).digest('hex');await writeFile(path+'/turso-snapshot.json',data,{mode:0o600});await writeFile(path+'/turso-snapshot.sha256',digest+'\n',{mode:0o600});
 await writeFile(path+'/metadata.json',JSON.stringify({skuSequence,createdAt:new Date().toISOString(),digest}),{mode:0o600});
 for(const t of snapshot){const spec=schema.find(s=>s.name===t.name);for(const row of t.rows){if(JSON.stringify(Object.keys(row).filter(k=>k!=='rowid').sort())!==JSON.stringify([...spec.columns].sort()))throw Error('Source columns differ: '+t.name);for(const col of spec.integers)if(row[col]!==null&&!Number.isSafeInteger(row[col]))throw Error('Non-integer source value: '+t.name+'.'+col);}}
 for(const t of schema)await target.query(t.sql);
 await target.beginTransaction();
 try{for(const t of snapshot){const columns=t.name==='inventory_stock_moves'?['rowid',...schema.find(s=>s.name===t.name).columns]:schema.find(s=>s.name===t.name).columns;for(let i=0;i<t.rows.length;i+=100){const rows=t.rows.slice(i,i+100);await target.query(`INSERT INTO ${quote(t.name)} (${columns.map(quote).join(',')}) VALUES ?`,[rows.map(r=>columns.map(c=>r[c]))]);}}await target.commit();}catch(e){await target.rollback();throw e;}
 for(const sql of extras)await target.query(sql);
 if(!Number.isSafeInteger(skuSequence)||skuSequence<0)throw Error('Invalid SKU sequence');
 await target.query('ALTER TABLE inventory_product_codes AUTO_INCREMENT='+(skuSequence+1));
 const reports=[];
 const canonical=rows=>rows.map(r=>JSON.stringify(Object.keys(r).sort().map(k=>[k,r[k]]))).sort();
 for(const t of snapshot){const [rows]=await target.query(`SELECT * FROM ${quote(t.name)}`);if(JSON.stringify(canonical(rows))!==JSON.stringify(canonical(t.rows)))throw Error('Row verification failed: '+t.name);reports.push({table:t.name,rows:rows.length});}
 await writeFile(path+'/verified.json',JSON.stringify({digest,verifiedAt:new Date().toISOString(),tables:reports},null,2),{mode:0o600});
 console.log(JSON.stringify({state:'verified',database:destination.pathname.slice(1),tables:reports,digest}));
}catch(error){console.error('Migration failed:',error.code||error.message);process.exitCode=1;}finally{source.close();await target.end();}
