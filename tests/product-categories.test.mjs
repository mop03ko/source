import assert from 'node:assert/strict';
import {categoryFromName,classification,productCategories} from '../scripts/assign-product-categories.mjs';
for(const [name,expected] of [
 ['iPhone 17 Pro Max','Гар утас'],['Galaxy S25 Ultra','Гар утас'],['AirPods Pro 2','Чихэвч'],
 ['iPhone 17 Pro Max Case','Гэр, хамгаалалт'],['iPad Magic Keyboard','Дагалдах хэрэгсэл'],
 ['[POUT] HANDS 7 for Apple','Цэнэглэгч, кабель'],['Dyson V15 Filter','Дагалдах хэрэгсэл'],
 ['Galaxy Watch 7','Ухаалаг цаг'],['Galaxy Tab S10','Таблет'],['MacBook Air','Зөөврийн компьютер'],
 ['DJI Osmo Mobile 7','Гар утасны тогтворжуулагч'],['DJI Osmo Pocket 3','Камер'],
 ['DJI Mini 4 Pro','Дрон'],['Dyson Airwrap','Үс арчилгааны төхөөрөмж'],['XIAMI СЭНС','Сэнс'],
 ['Belkin',null],['YAHAMA',null],
]){assert.equal(categoryFromName(name),expected,name);if(expected)assert.ok(productCategories.includes(expected));}
for(const supplier of ['Yuna','solar','mike','khangai','SOLAR, BELEG']){
 assert.deepEqual(classification({name:'iPhone 17',brand:supplier,supplier:'',category:''}),{category:'Гар утас',brand:'',supplier:supplier.toUpperCase()});
}
assert.deepEqual(classification({name:'AirPods',brand:'Apple',supplier:'Mike',category:'Custom'}),{category:'Custom',brand:'Apple',supplier:'Mike'});
assert.deepEqual(classification({name:'Unknown',brand:'Dyson',supplier:'',category:''}),{category:'',brand:'Dyson',supplier:''});
console.log('PASS: accessory precedence, categories, supplier corrections, unknown names and existing metadata preservation.');
