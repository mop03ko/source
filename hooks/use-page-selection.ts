'use client';
import {useState} from 'react';

export function usePageSelection<T extends {id:string}>(rows:T[],scope:string,enabled=true){
 const key=JSON.stringify([scope,rows.map(r=>r.id)]);
 const [state,setState]=useState<{key:string;ids:Set<string>}>({key:'',ids:new Set()});
 // Reset permanently when the visible page changes; going Back must not resurrect old selections.
 if(state.key!==key)setState({key,ids:new Set()});
 const ids=state.key===key?state.ids:new Set<string>();
 const selected=enabled?rows.filter(r=>ids.has(r.id)):[];
 return {
  rows:selected,count:selected.length,all:rows.length>0&&selected.length===rows.length,
  mixed:selected.length>0&&selected.length<rows.length,
  has:(id:string)=>enabled&&ids.has(id),
  toggle:(id:string,checked:boolean)=>{if(!enabled||!rows.some(r=>r.id===id))return;setState(previous=>{const next=new Set(previous.key===key?previous.ids:[]);if(checked)next.add(id);else next.delete(id);return {key,ids:next};});},
  toggleAll:(checked:boolean)=>{if(enabled)setState({key,ids:new Set(checked?rows.map(r=>r.id):[])});},
  clear:()=>setState({key,ids:new Set()}),
 };
}
