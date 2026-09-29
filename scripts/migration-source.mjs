import {createClient} from '@libsql/client';
const action=process.argv[2]||'status';
if(!['status','freeze'].includes(action))throw Error('Use status or freeze. Unfreezing after MySQL accepts writes requires reconciliation.');
const db=createClient({url:process.env.TURSO_DATABASE_URL,authToken:process.env.TURSO_AUTH_TOKEN});
try{
 if(action==='freeze')await db.execute({sql:"INSERT INTO app_settings(key,value,updated_at) VALUES('migration_read_only','true',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at",args:[new Date().toISOString()]});
 const state=await db.execute("SELECT value,updated_at FROM app_settings WHERE key='migration_read_only'");console.log(JSON.stringify({sourceFrozen:state.rows[0]?.value==='true',at:state.rows[0]?.updated_at||null}));
}finally{db.close();}
