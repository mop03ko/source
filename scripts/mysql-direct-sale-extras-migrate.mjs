import mysql from 'mysql2/promise';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
const database=process.argv[2];
if(database!=='antmall_crm_production')throw Error('Explicit production CRM database required');
const name='0042_direct_sale_extras.sql',hash=createHash('sha256').update(readFileSync(new URL('../drizzle/'+name,import.meta.url))).digest('hex');
const db=await mysql.createConnection({socketPath:'/var/run/mysqld/mysqld.sock',user:'root',database});
try{
 const [history]=await db.query('SELECT sha256 FROM crm_migrations WHERE name=?',[name]);
 if(history.length&&history[0].sha256!==hash)throw Error('Migration checksum mismatch');
 for(const [column,definition] of [['has_accessories','BIGINT NOT NULL DEFAULT 0'],['gifts',"LONGTEXT NOT NULL DEFAULT ('[]')"],['gift_name',"VARCHAR(120) NOT NULL DEFAULT ''"]]){
  const [columns]=await db.query('SHOW COLUMNS FROM inventory_sales LIKE ?',[column]);
  if(!columns.length)await db.query(`ALTER TABLE inventory_sales ADD COLUMN ${column} ${definition}`);
 }
 if(!history.length)await db.query('INSERT INTO crm_migrations(name,sha256,applied_at) VALUES(?,?,?)',[name,hash,new Date().toISOString()]);
 console.log(JSON.stringify({migration:name,state:history.length?'verified':'applied'}));
}finally{await db.end();}
