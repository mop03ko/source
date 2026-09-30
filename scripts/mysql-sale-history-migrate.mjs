import mysql from 'mysql2/promise';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {mysqlSchema} from './mysql-schema.mjs';
const database=process.argv[2];
if(database!=='antmall_crm_production')throw Error('Explicit production CRM database required');
const name='0043_sale_history_changes.sql',hash=createHash('sha256').update(readFileSync(new URL('../drizzle/'+name,import.meta.url))).digest('hex');
const db=await mysql.createConnection({socketPath:'/var/run/mysqld/mysqld.sock',user:'root',database});
try{
 const [history]=await db.query('SELECT sha256 FROM crm_migrations WHERE name=?',[name]);
 if(history.length&&history[0].sha256!==hash)throw Error('Migration checksum mismatch');
 for(const [table,column,definition] of [['inventory_sales','revision','BIGINT NOT NULL DEFAULT 1'],['direct_sale_requests','deleted_at','LONGTEXT NULL']]){
  const [columns]=await db.query(`SHOW COLUMNS FROM ${table} LIKE ?`,[column]);
  if(!columns.length)await db.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
 }
 const [exists]=await db.query("SELECT 1 FROM information_schema.tables WHERE table_schema=? AND table_name='inventory_sale_changes'",[database]);
 if(!exists.length)await db.query(mysqlSchema().find(t=>t.name==='inventory_sale_changes').sql);
 if(!history.length)await db.query('INSERT INTO crm_migrations(name,sha256,applied_at) VALUES(?,?,?)',[name,hash,new Date().toISOString()]);
 console.log(JSON.stringify({migration:name,state:history.length?'verified':'applied'}));
}finally{await db.end();}
