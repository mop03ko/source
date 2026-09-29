const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const code=ts.transpileModule(fs.readFileSync('app/login/page.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
async function hasForm(env){
 const exports={};
 vm.runInNewContext(code,{exports,process:{env},require(name){
  if(name==='@/auth')return {signIn(){throw Error('Unexpected sign-in');}};
  if(name==='@/components/ui/button')return {Button:'button'};
  return require(name);
 }});
 const tree=await exports.default({searchParams:Promise.resolve({})});
 const visit=node=>Array.isArray(node)?node.some(visit):!!node&&typeof node==='object'&&(node.type==='form'||visit(node.props?.children));
 return visit(tree);
}
(async()=>{
 const auth={AUTH_SECRET:'test',AUTH_URL:'https://crm.example.test',AUTH_GOOGLE_ID:'test',AUTH_GOOGLE_SECRET:'test',CRM_OWNER_EMAIL:'owner@example.test'};
 assert.equal(await hasForm({...auth,MYSQL_URL:'mysql://test@localhost/test'}),true,'MySQL does not require Turso credentials');
 assert.equal(await hasForm({...auth,TURSO_DATABASE_URL:'libsql://example',TURSO_AUTH_TOKEN:'test'}),true);
 assert.equal(await hasForm(auth),false,'Missing database blocks login');
 assert.equal(await hasForm({...auth,TURSO_DATABASE_URL:'libsql://example'}),false);
 assert.equal(await hasForm({...auth,MYSQL_URL:'mysql://test@localhost/test',AUTH_GOOGLE_SECRET:''}),false,'OAuth credentials remain required');
 console.log('PASS: login configuration for MySQL and Turso');
})().catch(error=>{console.error(error);process.exitCode=1;});
