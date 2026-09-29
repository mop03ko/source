import type {Client,InStatement,Transaction} from '@libsql/client';
const read=(statement:InStatement)=>/^\s*(SELECT|WITH|EXPLAIN)\b/i.test(typeof statement==='string'?statement:statement.sql);
/** The source is fenced before the final snapshot, including old DNS/Vercel traffic. */
export function withMigrationGate(raw:Client):Client{
 async function transaction(mode:'write'|'read'|'deferred'='write'):Promise<Transaction>{
  const tx=await raw.transaction(mode);if(mode==='read')return tx;
  try{const flag=await tx.execute("SELECT value FROM app_settings WHERE key='migration_read_only'");if(flag.rows[0]?.value==='true')throw Error('CRM database migration: writes temporarily unavailable');return tx;}
  catch(e){await tx.rollback();tx.close();throw e;}
 }
 return new Proxy(raw,{get(target,property){
  if(property==='transaction')return transaction;
  if(property==='execute')return async(input:InStatement)=>{if(read(input))return raw.execute(input);const tx=await transaction();try{const result=await tx.execute(input);await tx.commit();return result;}catch(e){if(!tx.closed)await tx.rollback();throw e;}finally{tx.close();}};
  if(property==='batch')return async(statements:InStatement[],mode:'write'|'read'|'deferred'='write')=>{const tx=await transaction(mode);try{const result=await tx.batch(statements);await tx.commit();return result;}catch(e){if(!tx.closed)await tx.rollback();throw e;}finally{tx.close();}};
  const value=Reflect.get(target,property);return typeof value==='function'?value.bind(target):value;
 }});
}
