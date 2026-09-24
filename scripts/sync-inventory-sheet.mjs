import {createClient} from '@libsql/client';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {readInventorySheet,serviceEmail,spreadsheetId,unionSpreadsheetId} from './inventory-sheet-source.mjs';
import {planBalance} from './inventory-sheet-plan.mjs';

export async function inventorySnapshot(db){
 const items=await db.execute('SELECT * FROM inventory_items');
 const warehouses=await db.execute('SELECT * FROM inventory_warehouses');
 const balances=await db.execute('SELECT item_id,warehouse_id,SUM(qty_delta) qty,SUM(value_cents) value_cents,MAX(cost_estimated) cost_estimated,MAX(COALESCE(occurred_at,created_at)) last_movement_at FROM inventory_stock_moves GROUP BY item_id,warehouse_id');
 return {items:items.rows,warehouses:warehouses.rows,balances:balances.rows};
}
/** @param {string|null} expectedPlan */
export async function applyBalance(db,source,expectedDigest,expectedPlan=null,actor=serviceEmail){
 const spreadsheetId=source.spreadsheetId;
 const tx=await db.transaction('write');
 try{
  const before=await inventorySnapshot(tx),plan=planBalance(source,before);
  if(plan.digest!==expectedDigest)throw Error('Sheet changed since preview; run preview again');
  const id='inventory-sheet:'+plan.digest;
  if((await tx.execute({sql:'SELECT id FROM inventory_requests WHERE id=?',args:[id]})).rows.length){await tx.rollback();return {state:'already_applied',digest:plan.digest};}
  if(expectedPlan&&plan.planDigest!==expectedPlan)throw Error('Inventory changed since preview');
  const now=new Date().toISOString();
  const statements=plan.changes.map(r=>({sql:'INSERT INTO inventory_stock_moves(id,item_id,warehouse_id,kind,qty_delta,unit_cost,value_cents,cost_estimated,occurred_at,ref_id,note,actor,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',args:[randomUUID(),r.item_id,r.warehouse_id,'count_adjustment',r.delta,r.value_cents/r.delta/100,r.value_cents,r.cost_estimated,now,id,`Google Sheet Balance мөр ${r.row}: ${r.before} → ${r.after}; эх сурвалж ${spreadsheetId}`,actor,now]}));
  const result={state:'applied',digest:plan.digest,matched:plan.matched,changed:plan.changes.length,unchanged:plan.unchanged,netQuantity:plan.changes.reduce((n,r)=>n+r.delta,0),issues:plan.issues};
  statements.push({sql:'INSERT INTO inventory_requests(id,action,payload,response,created_at) VALUES(?,?,?,?,?)',args:[id,'sheet_balance_sync',JSON.stringify({spreadsheetId,actor,readAt:source.readAt,changes:plan.changes}),JSON.stringify(result),now]});
  await tx.batch(statements);
  const after=await inventorySnapshot(tx);
  for(const target of plan.targets){const qty=after.balances.find(b=>b.item_id===target.item_id&&b.warehouse_id===target.warehouse_id)?.qty||0;if(qty!==target.after)throw Error('Stock verification failed');}
  await tx.commit();return result;
 }catch(e){if(!tx.closed)await tx.rollback();throw e;}finally{tx.close();}
}

if(process.argv[1]?.replaceAll('\\','/').endsWith('/sync-inventory-sheet.mjs')){
 const db=createClient({url:process.env.TURSO_DATABASE_URL,authToken:process.env.TURSO_AUTH_TOKEN});
 try{
  const source=await readInventorySheet(db,process.argv.includes('--union')?unionSpreadsheetId:spreadsheetId),before=await inventorySnapshot(db),plan=planBalance(source,before);
  const out='outputs/inventory-sheet-'+new Date().toISOString().replaceAll(':','-');await mkdir(out,{recursive:true});
  await writeFile(out+'/source.json',JSON.stringify(source));await writeFile(out+'/crm-before.json',JSON.stringify(before));await writeFile(out+'/preview.json',JSON.stringify(plan,null,2));
  let result={state:'preview',digest:plan.digest,matched:plan.matched,changed:plan.changes.length,unchanged:plan.unchanged,issueCount:plan.issues.length};
  if(process.argv.includes('--apply')){const expected=process.argv.find(a=>a.startsWith('--digest='))?.slice(9);if(!expected)throw Error('Apply requires --digest=<reviewed preview digest>');result=await applyBalance(db,source,expected);}
  await writeFile(out+'/result.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify({...result,issues:undefined,issueCount:result.issues?.length??plan.issues.length,report:out}));
 }finally{db.close();}
}
