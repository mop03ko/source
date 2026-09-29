import {DatabaseSync} from 'node:sqlite';
import {readdirSync,readFileSync} from 'node:fs';
export const quote=name=>'`'+name.replaceAll('`','``')+'`';
export function sqliteSchema(){
 const db=new DatabaseSync(':memory:');for(const f of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())db.exec(readFileSync(new URL('../drizzle/'+f,import.meta.url),'utf8'));
 db.exec('CREATE TABLE crm_migrations(name TEXT PRIMARY KEY NOT NULL,sha256 TEXT NOT NULL,applied_at TEXT NOT NULL)');
 const tables=db.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(t=>({...t,columns:db.prepare(`PRAGMA table_info(${quote(t.name)})`).all(),indexes:db.prepare(`PRAGMA index_list(${quote(t.name)})`).all().map(i=>({...i,columns:db.prepare(`PRAGMA index_info(${quote(i.name)})`).all().map(c=>c.name)}))}));db.close();return tables;
}
function length(table,col){if(table==='notifications'&&col==='id')return 768;if(col==='product_key')return 600;if(col==='pair_key')return 650;if(/email|owner|recipient|sender|actor|requester|seller|courier_name/.test(col))return 320;if(/_at$|^day$|_day$|^delivered_on$/.test(col))return 32;if(/status|kind|emoji|assignment/.test(col))return 64;return 255;}
export function mysqlSchema(){return sqliteSchema().map(t=>{
 const pk=t.columns.filter(c=>c.pk).sort((a,b)=>a.pk-b.pk).map(c=>c.name),indexed=new Set([...pk,...t.indexes.flatMap(i=>i.columns)]);
 const defs=t.columns.map(c=>{let type=/^(?:unit_cost|total_cost|unit_price|total_price|sale_price|cash_price|budget)$/.test(c.name)?'DOUBLE':/INT/i.test(c.type)?'BIGINT':/REAL|DOUBLE|FLOAT/i.test(c.type)?'DOUBLE':indexed.has(c.name)?`VARCHAR(${length(t.name,c.name)})`:'LONGTEXT';let value=`${quote(c.name)} ${type}${c.notnull||c.pk?' NOT NULL':''}`;if(t.name==='inventory_product_codes'&&c.name==='id')value+=' AUTO_INCREMENT';if(c.dflt_value!==null)value+=' DEFAULT ('+c.dflt_value+')';return value;});
 if(t.name==='inventory_stock_moves')defs.push('`rowid` BIGINT NOT NULL AUTO_INCREMENT UNIQUE');
 if(pk.length)defs.push('PRIMARY KEY ('+pk.map(quote).join(',')+')');
 for(const i of t.indexes.filter(i=>i.origin!=='pk')){if(i.partial)throw Error('Partial index requires explicit conversion');const bytes=i.columns.reduce((n,col)=>n+(t.columns.find(c=>c.name===col).type==='text'?4*length(t.name,col):8),0);if(bytes>3072)throw Error('Index too wide: '+i.name);defs.push(`${i.unique?'UNIQUE ':''}KEY ${quote(i.name.replace('sqlite_autoindex_','auto_'))} (${i.columns.map(quote).join(',')})`);}
 if(t.name==='direct_sale_requests')defs.push("CHECK (`status` IN ('pending','approved','rejected'))");
 return {name:t.name,columns:t.columns.map(c=>c.name),integers:t.columns.filter(c=>/INT/i.test(c.type)&&!(/^(?:unit_cost|total_cost|unit_price|total_price|sale_price|cash_price|budget)$/.test(c.name))).map(c=>c.name),sql:`CREATE TABLE ${quote(t.name)} (\n${defs.join(',\n')}\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin`};
});}
export const extras=[
 'CREATE TABLE crm_write_lock(id INT PRIMARY KEY) ENGINE=InnoDB',
 'INSERT INTO crm_write_lock VALUES(1)',
 ...['INSERT','UPDATE'].map(event=>`CREATE TRIGGER inventory_product_code_${event.toLowerCase()} AFTER ${event} ON inventory_items FOR EACH ROW INSERT INTO inventory_product_codes(product_key) VALUES(COALESCE(NULLIF(NEW.product_key,''),NEW.id)) ON DUPLICATE KEY UPDATE product_key=inventory_product_codes.product_key`)
];
