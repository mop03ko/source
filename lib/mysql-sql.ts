/** Explicit compatibility for the application's reviewed SQLite query vocabulary. */
const tokens=(sql:string)=>sql.match(/'(?:''|[^'])*'|"(?:""|[^"])*"|`[^`]*`|[A-Za-z_][A-Za-z_0-9]*|\s+|[\s\S]/g)||[];
function splitArgs(value:string){const parts:string[]=[];let depth=0,current='';for(const t of tokens(value)){if(t==='(')depth++;if(t===')')depth--;if(t===','&&depth===0){parts.push(current.trim());current='';}else current+=t;}parts.push(current.trim());return parts;}
function functions(sql:string):string{
 const ts=tokens(sql);let result='';
 for(let i=0;i<ts.length;i++){
  const name=ts[i];if(!/^(date|julianday|max|min|printf)$/i.test(name)||ts[i+1]!=='('){result+=name;continue;}
  let depth=1,body='';i+=2;for(;i<ts.length;i++){if(ts[i]==='(')depth++;if(ts[i]===')'&&!--depth)break;if(ts[i]===')'&&depth<0)throw Error('Invalid SQL function');body+=ts[i];}
  const args=splitArgs(body).map(functions),kind=name.toLowerCase();
  if(kind==='max'||kind==='min'){result+=(args.length>1?(kind==='max'?'GREATEST':'LEAST'):name)+'('+args.join(',')+')';continue;}
  if(kind==='printf'){if(args[0]!=="'ANT-%06d'"||args.length!==2)throw Error('Unsupported SQL format');result+=`CONCAT('ANT-',IF(CHAR_LENGTH(CAST(${args[1]} AS CHAR))<6,LPAD(${args[1]},6,'0'),CAST(${args[1]} AS CHAR)))`;continue;}
  let dt=args[0]==="'now'"?'UTC_TIMESTAMP(3)':`CAST(REPLACE(REPLACE(${args[0]},'T',' '),'Z','') AS DATETIME(3))`;
  if(args[1]){const m=/^'([+-]?\d+) (days|hours)'$/.exec(args[1]);if(!m)throw Error('Unsupported date modifier');dt=`DATE_ADD(${dt},INTERVAL ${Number(m[1])} ${m[2]==='days'?'DAY':'HOUR'})`;}
  result+=kind==='date'?`DATE_FORMAT(${dt},'%Y-%m-%d')`:`(2440587.5+TIMESTAMPDIFF(MICROSECOND,'1970-01-01 00:00:00',${dt})/86400000000.0)`;
 }
 return result;
}
export function mysqlSql(source:string){
 let sql=functions(source);
 sql=sql.replace(/\bAS (?:NOT )?MATERIALIZED\s*\(/gi,'AS (');
 sql=sql.replace(/\)\s+WHERE rn<=/g,') AS calendar_rows WHERE rn<=');
 sql=sql.replace(/COLLATE NOCASE/gi,'COLLATE utf8mb4_0900_as_ci');
 sql=sql.replace(/\bAS INTEGER\b/gi,'AS SIGNED');
 // KEY is a MySQL reserved word; application columns retain their original names.
 sql=tokens(sql).map((t,i,all)=>/^key$/i.test(t)?'`key`':/^row_number$/i.test(t)&&all.slice(i+1).find(next=>next.trim())!=='('?'`row_number`':/^LIKE$/i.test(t)?'COLLATE utf8mb4_0900_as_ci LIKE':t).join('');
 const ignore=/^INSERT OR IGNORE INTO\s+(\w+)/i.exec(sql);
 if(ignore){const key:Record<string,string>={organization:'id',members:'email',notifications:'id',suppressions:'phone'};if(!key[ignore[1]])throw Error('Unreviewed ignored insert');sql=sql.replace(/^INSERT OR IGNORE/i,'INSERT')+` ON DUPLICATE KEY UPDATE ${key[ignore[1]]}=${ignore[1]}.${key[ignore[1]]}`;}
 const conflict=/\s+ON CONFLICT\([^)]*\) DO UPDATE SET\s+([\s\S]+)$/i.exec(sql);
 if(conflict){let update=conflict[1];const where=/\s+WHERE\s+([\s\S]+)$/i.exec(update);if(where){update=update.slice(0,where.index);update=splitArgs(update).map(assignment=>{const eq=assignment.indexOf('=');const field=assignment.slice(0,eq).trim();return `${field}=IF(${where[1]},${assignment.slice(eq+1)},${field})`;}).join(',');}update=update.replace(/excluded\.(\w+)/gi,'VALUES($1)');sql=sql.slice(0,conflict.index)+' ON DUPLICATE KEY UPDATE '+update;}
 if(/\bRETURNING\b/i.test(sql))throw Error('RETURNING requires an explicit transaction');
 return sql;
}
