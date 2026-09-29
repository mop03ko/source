import mysql,{type PoolConnection,type RowDataPacket,type ResultSetHeader} from 'mysql2/promise';
import type {Client,InStatement,InValue,ResultSet,Row} from '@libsql/client';
import {mysqlSql} from './mysql-sql';

export function createMysqlClient(url:string):Client{
 const parsed=new URL(url);if(parsed.protocol!=='mysql:')throw Error('MYSQL_URL must use mysql protocol');
 const pool=mysql.createPool({host:parsed.hostname,port:Number(parsed.port||3306),user:decodeURIComponent(parsed.username),password:decodeURIComponent(parsed.password),database:decodeURIComponent(parsed.pathname.slice(1)),connectionLimit:8,waitForConnections:true,queueLimit:100,charset:'utf8mb4',decimalNumbers:true,supportBigNumbers:true,bigNumberStrings:false,dateStrings:true,multipleStatements:false});
 const acquire=async()=>{const c=await pool.getConnection();try{await c.query('SET NAMES utf8mb4 COLLATE utf8mb4_0900_bin');await c.query("SET SESSION time_zone='+00:00', transaction_isolation='REPEATABLE-READ', group_concat_max_len=1048576, sql_mode='STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION,PIPES_AS_CONCAT,ANSI_QUOTES'");return c;}catch(e){c.release();throw e;}};
 const run=async(c:PoolConnection,input:InStatement):Promise<ResultSet>=>{
  const source=typeof input==='string'?input:input.sql,args=typeof input==='string'?[]:input.args||[];
  if(!Array.isArray(args))throw Error('Named SQL parameters are not supported');
  const sql=mysqlSql(source),[data,fields]=await c.query(sql,(args as InValue[]).map(v=>typeof v==='bigint'?v.toString():v));
  const columns=fields?.map(f=>f.name)||[],rows=Array.isArray(data)?(data as RowDataPacket[]).map(row=>{const values=columns.map(k=>row[k]);for(const k of columns)Object.defineProperty(values,k,{value:row[k],enumerable:true});return values as unknown as Row;}):[];
  const changes=Array.isArray(data)?0:(data as ResultSetHeader).affectedRows;
  return {columns,columnTypes:columns.map(()=>''),rows,rowsAffected:/ON CONFLICT/i.test(source)&&changes>0?1:changes,lastInsertRowid:undefined,toJSON(){return {columns,rows,rowsAffected:changes};}} as ResultSet;
 };
 const transaction=async(mode='write')=>{
  const c=await acquire();let closed=false;
  try{if(mode==='read')await c.query('SET TRANSACTION READ ONLY');await c.beginTransaction();if(mode!=='read')await c.query('SELECT id FROM crm_write_lock WHERE id=1 FOR UPDATE');}
  catch(e){try{await c.rollback();}finally{c.release();}throw e;}
  const finish=async(commit:boolean)=>{if(closed)return;try{if(commit)await c.commit();else await c.rollback();}finally{closed=true;c.release();}};
  return {get closed(){return closed;},execute:(s:InStatement)=>{if(closed)throw Error('Transaction closed');return run(c,s);},async batch(statements:InStatement[]){const out:ResultSet[]=[];for(const s of statements)out.push(await run(c,s));return out;},commit:()=>finish(true),rollback:()=>finish(false),close(){if(!closed)void finish(false);}};
 };
 const client={transaction,async execute(input:InStatement){const sql=typeof input==='string'?input:input.sql;if(/^\s*(SELECT|WITH|SHOW|EXPLAIN)\b/i.test(sql)){const c=await acquire();try{return await run(c,input);}finally{c.release();}}const tx=await transaction();try{const result=await tx.execute(input);await tx.commit();return result;}catch(e){await tx.rollback();throw e;}},async batch(statements:InStatement[],mode='write'){const tx=await transaction(mode);try{const result=await tx.batch(statements);await tx.commit();return result;}catch(e){await tx.rollback();throw e;}},close(){void pool.end();}};
 return client as unknown as Client;
}
