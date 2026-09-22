import {canViewInventoryCost} from './crm';
// Profit and stock valuation reveal acquisition cost even without a unit-cost field.
const privateKeys=new Set(['value_cents','unit_cost','base_unit_cost','total_cost','additional_cost','cost_cents','cost_estimated','profit_cents','opening_cents','in_cents','out_cents']);
export function inventoryForRole(value:unknown,role:string):unknown{
 if(canViewInventoryCost(role))return value;
 if(Array.isArray(value))return value.map(v=>inventoryForRole(v,role));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>!privateKeys.has(key)).map(([key,v])=>[key,inventoryForRole(v,role)]));
 return value;
}
