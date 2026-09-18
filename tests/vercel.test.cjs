const assert=require('node:assert/strict');
const fs=require('node:fs');const ts=require('typescript');const os=require('node:os');const path=require('node:path');const {execFileSync}=require('node:child_process');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'antmall-vercel-'));
process.env.TURSO_DATABASE_URL='file:'+path.join(temp,'test.db');
process.env.CRM_OWNER_EMAIL='owner@example.test';
const deps={};
function load(p){const out=ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const m={exports:{}};new Function('require','module','exports',out)(id=>deps[id]||require(id),m,m.exports);return m.exports;}
(async()=>{
 execFileSync(process.execPath,['scripts/migrate.mjs'],{env:process.env});
 execFileSync(process.execPath,['scripts/migrate.mjs'],{env:process.env});
 const database=load('lib/database.ts');const {DB}=database;
 assert.equal((await DB.prepare('SELECT count(*) n FROM crm_migrations').first()).n,fs.readdirSync('drizzle').filter(p=>p.endsWith('.sql')).length);
 await DB.prepare('CREATE TABLE probe(id TEXT PRIMARY KEY, value TEXT)').run();
 await DB.prepare('INSERT INTO probe VALUES(?,?)').bind('one','Монгол').run();
 await assert.rejects(()=>DB.batch([DB.prepare('INSERT INTO probe VALUES(?,?)').bind('two','rollback'),DB.prepare('INSERT INTO probe VALUES(?,?)').bind('one','duplicate')]));
 assert.equal(await DB.prepare('SELECT * FROM probe WHERE id=?').bind('two').first(),null);
 assert.equal((await DB.prepare('UPDATE probe SET value=? WHERE id=? RETURNING value').bind('Шинэ','one').all()).results[0].value,'Шинэ');
 assert.equal((await DB.prepare('UPDATE probe SET value=? WHERE id=?').bind('Шинэ','missing').run()).meta.changes,0);
 assert.throws(()=>DB.prepare('SELECT ?').bind(undefined));
 await assert.rejects(()=>DB.transaction(async tx=>{await tx.prepare('INSERT INTO probe VALUES(?,?)').bind('atomic','rollback').run();throw new Error('reject after write');}));
 assert.equal(await DB.prepare('SELECT * FROM probe WHERE id=?').bind('atomic').first(),null);
 await DB.transaction(async tx=>{await tx.prepare('INSERT INTO probe VALUES(?,?)').bind('atomic','committed').run();assert.equal((await tx.prepare('SELECT value FROM probe WHERE id=?').bind('atomic').first()).value,'committed');});
 await DB.prepare('INSERT INTO probe VALUES(?,?)').bind('last-unit','1').run();
 const takeLast=()=>DB.transaction(async tx=>{const row=await tx.prepare('SELECT value FROM probe WHERE id=?').bind('last-unit').first();if(row.value==='0')return false;await tx.prepare('UPDATE probe SET value=? WHERE id=?').bind('0','last-unit').run();return true;});
 assert.deepEqual((await Promise.all([takeLast(),takeLast()])).sort(),[false,true]);
 const policy=load('lib/auth-policy.ts');
 assert.equal(policy.googleIdentity('google',{sub:'123',email:'a@b.mn',email_verified:false}),null);
 assert.equal(policy.googleIdentity('credentials',{sub:'123',email:'a@b.mn',email_verified:true}),null);
 assert.equal(policy.googleIdentity('google',{sub:'123',email:'OWNER@EXAMPLE.TEST',email_verified:true}).email,'owner@example.test');
 let user={userId:'google:stranger',email:'stranger@example.test',displayName:'Stranger'};
 deps['./runtime']={env:{DB}};deps['../app/session']={getCurrentUser:async()=>user};
 const {member}=load('lib/access.ts');
 await assert.rejects(member,e=>e.status===403);
 assert.equal(await DB.prepare('SELECT * FROM organization').first(),null);
 user={userId:'google:owner',email:'owner@example.test',displayName:'Owner'};
 assert.equal((await member()).role,'admin');
 await DB.prepare("INSERT INTO members(email,name,role,active) VALUES('agent@example.test','Agent','agent',1)").run();
 user={userId:'google:agent',email:'agent@example.test',displayName:'Agent'};
 assert.equal((await member()).role,'agent');
 user={...user,userId:'google:imposter'};await assert.rejects(member,e=>e.status===403);
 user={...user,userId:'google:agent'};await DB.prepare("UPDATE members SET active=0 WHERE email='agent@example.test'").run();await assert.rejects(member,e=>e.status===403);
 user=null;await assert.rejects(member,e=>e.status===401);
 await database.getClient().close();
 // Windows дээр sqlite файлын handle шууд суллагдахгүй байж болох тул түр хугацааны файлыг цэвэрлэж чадаагүй ч тестийн үр дүнд нөлөөлөхгүй.
 try{fs.rmSync(temp,{recursive:true,force:true,maxRetries:5,retryDelay:100});}catch{}
 console.log('PASS: real libSQL migration replay, transaction rollback, RETURNING, parameter safety, verified Google identity, explicit owner bootstrap, member linking and revoked access.');
})().catch(e=>{console.error(e);process.exit(1)});
