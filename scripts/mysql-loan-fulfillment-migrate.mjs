// Additive migration only; run on the Ubuntu CRM host as root after a verified backup.
import mysql from 'mysql2/promise';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {mysqlSchema,quote} from './mysql-schema.mjs';
const database=process.argv[2];
if(!/^antmall_crm_(production|test_[a-z0-9]+)$/.test(database||''))throw Error('Explicit CRM database required');
const name='0040_loan_fulfillment.sql',hash=createHash('sha256').update(readFileSync(new URL('../drizzle/'+name,import.meta.url))).digest('hex');
const names=['loan_request_receipts','lead_purchase_lines','lead_purchase_fulfillment'];
const db=await mysql.createConnection({socketPath:'/var/run/mysqld/mysqld.sock',user:'root',database});
try{
 const [history]=await db.query('SELECT sha256 FROM crm_migrations WHERE name=?',[name]);
 if(history.length&&history[0].sha256!==hash)throw Error('Migration checksum mismatch');
 const schema=mysqlSchema().filter(t=>names.includes(t.name));
 if(schema.length!==names.length)throw Error('Migration table list mismatch');
 for(const t of schema){
  const [exists]=await db.query('SELECT 1 FROM information_schema.tables WHERE table_schema=? AND table_name=?',[database,t.name]);
  if(!exists.length){if(history.length)throw Error('Applied migration table missing');await db.query(t.sql);}
  const [columns]=await db.query('SHOW COLUMNS FROM '+quote(t.name));
  if(JSON.stringify(columns.map(c=>c.Field))!==JSON.stringify(t.columns))throw Error('Table columns differ: '+t.name);
 }
 if(!history.length)await db.query('INSERT INTO crm_migrations(name,sha256,applied_at) VALUES(?,?,?)',[name,hash,new Date().toISOString()]);
 console.log(JSON.stringify({migration:name,tables:names,state:history.length?'verified':'applied'}));
}finally{await db.end();}
