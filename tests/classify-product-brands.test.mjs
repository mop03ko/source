import assert from 'node:assert/strict';
import {identify,sourceIndex,classify} from '../scripts/classify-product-brands.mjs';
for(const [name,brand] of [
 ['IPHONE 17 PROMAX 256GB LL/A','APPLE'],['IPAD PRO M5','APPLE'],['MacBook Air','APPLE'],
 ['IWATCH SERIES 11 46MM','APPLE'],['GALAXY S26 ULTRA','SAMSUNG'],['OSMO MOBILE 8','DJI'],
 ['[POUT] CaseLoop Leather for iPhone 17','POUT'],['Hands7 (for Samsung Series)','POUT'],
 ['EYES 11 for iPad','POUT'],['DYSON V15S','DYSON'],['DEERMA Vacuum','DEERMA'],
 ['17 PM BEATS CASE','BEATS'],['mophie 3in1','MOPHIE'],['PS5 SLIM DISK EDITION','SONY'],
 ['[BodyLabs] ReCovery','BODYLABS'],['GSKILL-TRIDENT Z5 RGB','G.SKILL'],
])assert.equal(identify(name).brand,brand,name);
for(const name of ['IPHONE 17 PRO CASE','S25 ULTRA CLEAR CASE','IPHONE 17 PRO NAALT','BUDS 3','SD CARD 128GB','CONTROLLER','TABLET','BP04 Carbon filter','CHARGER FOR APPLE','AIPODS PRO 3'])assert.equal(identify(name).brand,null,name);
const source=(name,brand)=>({'Product name':name,Features:`Брэнд: E[${brand}]`,'Secondary categories':''});
assert.equal(identify('  Test   Item ',sourceIndex([source('Test Item','BRAND')])).brand,'BRAND');
assert.equal(identify('Test Item',sourceIndex([source('Test Item','A'),source('Test Item','B')])).brand,null);
assert.equal(identify('DYSON V15S',sourceIndex([source('DYSON V15S','DJI')])).brand,null);
const item={id:'1',name:'IPHONE 17',brand:'MIKE',supplier:'MIKE'};
const first=classify([item],[])[0];assert.equal(first.brand,'APPLE');assert.equal(first.previous,'MIKE');assert.equal(first.supplier,'MIKE');
assert.equal(classify([{...item,brand:first.brand}],[])[0].previous,'APPLE');
console.log('PASS: name classification, product-family aliases, accessory maker vs compatible device, ambiguous names, CSV conflicts and preserved supplier.');
