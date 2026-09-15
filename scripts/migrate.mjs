import {createClient} from '@libsql/client';
import {readdir,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const url=process.env.TURSO_DATABASE_URL;
if(!url)throw new Error('Set TURSO_DATABASE_URL before migration.');
const db=createClient({url,authToken:process.env.TURSO_AUTH_TOKEN});
try{
 await db.execute('CREATE TABLE IF NOT EXISTS crm_migrations(name TEXT PRIMARY KEY, sha256 TEXT NOT NULL, applied_at TEXT NOT NULL)');
 const history=await db.execute('SELECT name FROM crm_migrations');
 const existing=await db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('leads','members','organization')");
 if(!history.rows.length && existing.rows.length)throw new Error('Existing CRM schema without migration history: use an empty database or a reviewed data migration. No application tables changed.');
 for(const name of (await readdir(new URL('../drizzle/',import.meta.url))).filter(n=>n.endsWith('.sql')).sort()){
  const sql=await readFile(new URL('../drizzle/'+name,import.meta.url),'utf8');
  const hash=createHash('sha256').update(sql).digest('hex');
  const applied=await db.execute({sql:'SELECT sha256 FROM crm_migrations WHERE name=?',args:[name]});
  if(applied.rows.length){if(applied.rows[0].sha256!==hash)throw new Error('Migration checksum mismatch: '+name);console.log('Already applied: '+name);continue;}
  const statements=sql.split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean);
  await db.batch([...statements,{sql:'INSERT INTO crm_migrations(name,sha256,applied_at) VALUES(?,?,?)',args:[name,hash,new Date().toISOString()]}],'write');
  console.log('Applied: '+name);
 }
}finally{db.close();}
