'use client';
import {useSyncExternalStore} from 'react';
export const catalogColumns=['photo','stock','price','supplier','brand','cost'] as const;
export const catalogSorts=['name','name_desc','stock_asc','stock_desc','price_asc','price_desc','value_desc'] as const;
export type CatalogPreferences={columns:string[];density:'small'|'middle';sort:string};
const defaults:CatalogPreferences={columns:[...catalogColumns],density:'small',sort:'name'};
const memory=new Map<string,string>();
function read(key:string){try{return memory.get(key)??localStorage.getItem(key)??'';}catch{return memory.get(key)??'';}}
function parse(raw:string):CatalogPreferences{try{const v=JSON.parse(raw);return {columns:Array.isArray(v.columns)?catalogColumns.filter(c=>v.columns.includes(c)):[...catalogColumns],density:v.density==='middle'?'middle':'small',sort:catalogSorts.includes(v.sort)?v.sort:'name'};}catch{return defaults;}}
export function useCatalogPreferences(identity:string){
 const key='inventory-catalog:v1:'+identity;
 const raw=useSyncExternalStore(notify=>{const update=(event:Event)=>{if(event instanceof StorageEvent&&event.key===key)memory.delete(key);notify();};window.addEventListener('storage',update);window.addEventListener('inventory:preferences',update);return()=>{window.removeEventListener('storage',update);window.removeEventListener('inventory:preferences',update);};},()=>read(key),()=>'');
 const preferences=parse(raw);
 const update=(patch:Partial<CatalogPreferences>)=>{const next=JSON.stringify({...parse(read(key)),...patch});memory.set(key,next);try{localStorage.setItem(key,next);}catch{/* The current tab still retains the preference. */}window.dispatchEvent(new Event('inventory:preferences'));};
 return {preferences,update,reset:()=>update(defaults)};
}
