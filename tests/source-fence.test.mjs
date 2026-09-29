import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {fenceStatements} from '../scripts/source-fence.mjs';
const db=new DatabaseSync(':memory:');
db.exec("CREATE TABLE app_settings(key TEXT PRIMARY KEY,value TEXT);CREATE TABLE data(id INTEGER PRIMARY KEY,value TEXT);INSERT INTO data VALUES(1,'original')");
for(const sql of fenceStatements(['app_settings','data']))db.exec(sql);
db.exec("UPDATE data SET value='before';INSERT INTO app_settings VALUES('migration_read_only','true')");
for(const sql of ["UPDATE data SET value='after'","DELETE FROM data","INSERT INTO data VALUES(2,'after')","INSERT OR REPLACE INTO data VALUES(1,'after')","INSERT INTO app_settings VALUES('business','changed')"]){assert.throws(()=>db.exec(sql),/read-only/);}
assert.equal(db.prepare('SELECT value FROM data').get().value,'before');
db.exec("UPDATE app_settings SET value='false' WHERE key='migration_read_only';UPDATE data SET value='rollback'");
assert.equal(db.prepare('SELECT value FROM data').get().value,'rollback');db.close();
console.log('PASS: database-level source fence blocks legacy clients and preserves controlled rollback');
