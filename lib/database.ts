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
 constructor(readonly sql:string,readonly args:InValue[]=[]){ }
 bind(...args:unknown[]){return new Statement(this.sql,args.map(arg));}
 async all<T=Record<string,unknown>>(){return result<T>(await getClient().execute({sql:this.sql,args:this.args}));}
 async first<T=Record<string,unknown>>(){return (await this.all<T>()).results[0]??null;}
 async run(){return this.all();}
}
export const DB={prepare:(sql:string)=>new Statement(sql),async batch(statements:Statement[]){
 if(!statements.length)return [];
 return (await getClient().batch(statements.map(s=>({sql:s.sql,args:s.args})),'write')).map(r=>result(r));
}};
