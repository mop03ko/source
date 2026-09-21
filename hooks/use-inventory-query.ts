'use client';
import {useSyncExternalStore} from 'react';

const event='inventory:query';
const subscribe=(notify:()=>void)=>{window.addEventListener('popstate',notify);window.addEventListener(event,notify);return()=>{window.removeEventListener('popstate',notify);window.removeEventListener(event,notify);};};
const snapshot=()=>window.location.search;
export function useInventoryQuery(){
 const query=useSyncExternalStore(subscribe,snapshot,()=>''),params=new URLSearchParams(query);
 const get=(key:string,fallback='')=>params.get('inv_'+key)??fallback;
 const set=(key:string,value:string,push=false)=>{const url=new URL(window.location.href);url.searchParams.set('inv_'+key,value);window.history[push?'pushState':'replaceState'](null,'',url);window.dispatchEvent(new Event(event));};
 return {get,set};
}
