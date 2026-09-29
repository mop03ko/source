import assert from 'node:assert/strict';
import {sheetTimestamp,sheetValues,existingRow,timestampKey,columnName,occupiedRow,firstEmptyRow} from '../scripts/web-loan-sheet-mirror.mjs';
const lead={id:'web-test',received_at:'2026-09-29T07:15:16.068Z',phone:'09112233',registration:'АБ12345678',product:'=SUM(A1)',name:'Test'};
assert.equal(sheetTimestamp(lead.received_at),'9/29/2026, 15:15:16');
assert.equal(sheetTimestamp('2026-09-28T16:00:00.000Z'),'9/29/2026, 00:00:00');
const values=sheetValues(lead);assert.equal(values.length,27);assert.equal(values[1],'09112233');assert.equal(values[3],'=SUM(A1)');assert.equal(values[26],lead.id);
assert.equal(existingRow([['Header'],values],lead),1);
const legacy=values.slice(0,5);assert.equal(existingRow([['Header'],legacy],lead),1);
const numeric=[timestampKey(legacy[0])/86400+25569,...legacy.slice(1)];assert.equal(existingRow([['Header'],numeric],lead),1);
assert.equal(existingRow([['Header'],legacy],{...lead,phone:'99112233'}),-1);
assert.equal(existingRow([['Header'],legacy],{...lead,received_at:'2026-09-29T07:16:16.068Z'}),-1);
assert.equal(timestampKey('bad'),null);
console.log('Sheet mirror: UB timestamps, marker dedup, legacy reconciliation and raw payload preservation passed');

assert.equal(columnName(27),'AA');assert.equal(columnName(53),'BA');
for(const cell of [{note:'note'},{userEnteredValue:{formulaValue:'=""'}},{userEnteredValue:{numberValue:0}},{userEnteredValue:{boolValue:false}},{userEnteredValue:{stringValue:' '}},{userEnteredValue:{stringValue:'web-id'}}])assert.equal(occupiedRow({values:[{},cell]}),true);
assert.equal(occupiedRow({values:[{}, {userEnteredValue:{stringValue:''}}]}),false);
const occupied=new Set([1,2,4]);assert.equal(firstEmptyRow(occupied,5),3);occupied.add(3);assert.equal(firstEmptyRow(occupied,5),5);occupied.add(5);assert.equal(firstEmptyRow(occupied,5),null);
console.log('Empty-row allocation: notes, formulas, IDs, zero, false and whitespace protected');
