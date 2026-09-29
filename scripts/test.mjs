import {spawnSync} from 'node:child_process';

// CI and Vercel have production credentials in their parent environment.
// Test subprocesses receive only OS essentials; each suite creates its own fixtures.
const allowed=new Set(['path','systemroot','windir','comspec','pathext','temp','tmp','tmpdir','home','userprofile','localappdata','appdata']);
const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>allowed.has(key.toLowerCase())));
env.NODE_ENV='test';env.NEXT_TELEMETRY_DISABLED='1';
const suites=[
 'login-config.test.cjs','mysql-sql.test.cjs','crm.test.cjs','it.test.cjs','marketing.test.cjs','messages.test.cjs','sheets.test.cjs',
 'sms-rules.test.cjs','sms.test.cjs','inventory-counts.test.cjs','inventory.test.cjs',
 'inventory-workflows.test.cjs','lead-purchases.test.cjs','deliveries.test.cjs','schedule.test.cjs',
 'auto-assign.test.cjs','serials.test.cjs','direct-sales.test.cjs','direct-sale-approvals.test.cjs',
 'xlsx.test.cjs','vercel.test.cjs','request-cache.test.cjs','product-brand-sync.test.mjs',
 'classify-product-brands.test.mjs','product-prices.test.mjs','product-categories.test.mjs',
 'dashboard.test.cjs','inventory-products.test.cjs','todos.test.cjs','meetings.test.cjs',
 'workspace-read.test.cjs','inventory-sheet.test.mjs','inventory-sheet-route.test.cjs',
 'public-products.test.cjs','product-sku.test.cjs','p2-regressions.test.cjs',
];
for(const suite of suites){
 const result=spawnSync(process.execPath,['tests/'+suite],{env,stdio:'inherit',windowsHide:true});
 if(result.error)throw result.error;
 if(result.status!==0)process.exit(result.status||1);
}
console.log(`PASS: ${suites.length} isolated test suites; deployment credentials excluded.`);
