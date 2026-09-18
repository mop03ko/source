import {createClient, type Client, type InValue, type ResultSet} from '@libsql/client';
let client:Client|undefined;
export function getClient(){
 if(!client){
  const url=process.env.TURSO_DATABASE_URL;
  if(!url)throw new Error('TURSO_DATABASE_URL тохируулаагүй.');
  if(process.env.VERCEL && !url.startsWith('libsql://') && !url.startsWith('https://'))throw new Error('Vercel дээр cloud өгөгдлийн сан ашиглана.');
  if(process.env.VERCEL && !process.env.TURSO_AUTH_TOKEN)throw new Error('TURSO_AUTH_TOKEN тохируулаагүй.');
  client=createClient({url,authToken:process.env.TURSO_AUTH_TOKEN});
 }
 return client;
}
function arg(v:unknown):InValue {
 if(v===null || typeof v==='string' || typeof v==='bigint' || typeof v==='boolean' || (typeof v==='number' && Number.isFinite(v)))return v;
 throw new Error('Unsupported SQL parameter');
}
function result<T=Record<string,unknown>>(r:ResultSet){return {results:r.rows.map(row=>Object.fromEntries(r.columns.map(c=>[c,row[c]]))) as T[],meta:{changes:r.rowsAffected},success:true};}
export class Statement {
 constructor(readonly sql:string,readonly args:InValue[]=[],private readonly executor?:Pick<Client,'execute'>){ }
 bind(...args:unknown[]){return new Statement(this.sql,args.map(arg),this.executor);}
 async all<T=Record<string,unknown>>(){return result<T>(await (this.executor||getClient()).execute({sql:this.sql,args:this.args}));}
 async first<T=Record<string,unknown>>(){return (await this.all<T>()).results[0]??null;}
 async run(){return this.all();}
}
export type DatabaseSession={prepare:(sql:string)=>Statement;batch:(statements:Statement[])=>Promise<ReturnType<typeof result>[]>};
async function beginWrite(){
 // Local SQLite can reject BEGIN IMMEDIATE while another request owns the write lock.
 // Retry acquisition only: never replay a callback or an uncertain commit.
 for(let attempt=0;;attempt++){
  try{return await getClient().transaction('write');}
  catch(error){
   if(attempt>=12||!error||typeof error!=='object'||!('code' in error)||error.code!=='SQLITE_BUSY')throw error;
   await new Promise(resolve=>setTimeout(resolve,Math.min(25*2**attempt,250)));
  }
 }
}
export const DB={prepare:(sql:string)=>new Statement(sql),async transaction<T>(work:(db:DatabaseSession)=>Promise<T>):Promise<T>{
 const tx=await beginWrite();
 try{
  const value=await work({prepare:sql=>new Statement(sql,[],tx),batch:async statements=>statements.length?(await tx.batch(statements.map(s=>({sql:s.sql,args:s.args})))).map(r=>result(r)):[]});
  await tx.commit();return value;
 }catch(error){if(!tx.closed)await tx.rollback();throw error;}finally{tx.close();}
},async batch(statements:Statement[]){
 if(!statements.length)return [];
 return (await getClient().batch(statements.map(s=>({sql:s.sql,args:s.args})),'write')).map(r=>result(r));
}};
