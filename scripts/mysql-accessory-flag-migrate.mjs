import mysql from 'mysql2/promise';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
const database=process.argv[2];
if(database!=='antmall_crm_production')throw Error('Explicit production CRM database required');
const name='0041_purchase_accessory_flag.sql',hash=createHash('sha256').update(readFileSync(new URL('../drizzle/'+name,import.meta.url))).digest('hex');
const db=await mysql.createConnection({socketPath:'/var/run/mysqld/mysqld.sock',user:'root',database});
try{
 const [history]=await db.query('SELECT sha256 FROM crm_migrations WHERE name=?',[name]);
 if(history.length&&history[0].sha256!==hash)throw Error('Migration checksum mismatch');
 const [columns]=await db.query("SHOW COLUMNS FROM lead_purchase_fulfillment LIKE 'has_accessories'");
 if(!columns.length)await db.query('ALTER TABLE lead_purchase_fulfillment ADD COLUMN has_accessories BIGINT NOT NULL DEFAULT 0');
 if(!history.length){
  await db.beginTransaction();
  try{
   await db.query("UPDATE lead_purchase_fulfillment f SET has_accessories=1 WHERE EXISTS(SELECT 1 FROM lead_purchase_lines p WHERE p.lead_id=f.lead_id AND p.kind='accessory')");
   await db.query('INSERT INTO crm_migrations(name,sha256,applied_at) VALUES(?,?,?)',[name,hash,new Date().toISOString()]);
   await db.commit();
  }catch(e){await db.rollback();throw e;}
 }
 console.log(JSON.stringify({migration:name,state:history.length?'verified':'applied'}));
}finally{await db.end();}
