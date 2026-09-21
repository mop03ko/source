'use client';
import {useEffect,useState,type RefObject} from 'react';
// Ant inputs keep internal state; remount uncontrolled widgets after a native form reset.
export function useFormReset(element:RefObject<HTMLInputElement|HTMLTextAreaElement|null>){
 const [version,setVersion]=useState(0);
 useEffect(()=>{const form=element.current?.form;const reset=()=>setVersion(value=>value+1);form?.addEventListener('reset',reset);return()=>form?.removeEventListener('reset',reset);},[element,version]);
 return version;
}
