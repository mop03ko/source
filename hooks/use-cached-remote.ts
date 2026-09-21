'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {RequestCache} from '@/lib/request-cache';
import {readJson,RemoteError} from './use-remote';

/** Schedule-only opt-in: reuse recent reads, deduplicate, and refresh without blanking rows. */
export function useCachedRemote<T>(url:string,cache:RequestCache,refresh=0){
 const [state,setState]=useState<{url:string;cache:RequestCache;data:T|null;error:string;fetching:boolean}>(()=>({url,cache,data:cache.peek<T>(url),error:'',fetching:false}));
 const [revision,setRevision]=useState(0);
 const handledRefresh=useRef(refresh);
 const retry=useCallback(()=>{cache.invalidate();setRevision(n=>n+1);},[cache]);
 useEffect(()=>{
  let stopped=false,sequence=0;
  if(handledRefresh.current!==refresh){cache.invalidate();handledRefresh.current=refresh;}
  const load=async()=>{
   const n=++sequence;
   setState(previous=>({url,cache,data:previous.url===url&&previous.cache===cache?previous.data:cache.peek<T>(url),error:'',fetching:!cache.fresh(url)}));
   try{
    const data=await cache.read(url,()=>readJson<T>(url));
    if(!stopped&&n===sequence)setState({url,cache,data,error:'',fetching:false});
   }catch(error){
    if(stopped||n!==sequence)return;
    const denied=error instanceof RemoteError&&(error.status===401||error.status===403);
    if(denied)cache.invalidate();
    setState(previous=>({url,cache,data:denied?null:previous.data,error:error instanceof Error?error.message:'Холболт тасарлаа.',fetching:false}));
   }
  };
  const timer=setTimeout(()=>void load(),0);
  const revalidate=()=>{if(document.visibilityState==='visible'&&!cache.fresh(url))void load();};
  // Colleagues' edits appear in the background; hidden pages make no polling requests.
  const poll=setInterval(revalidate,60_000);
  window.addEventListener('focus',revalidate);document.addEventListener('visibilitychange',revalidate);
  return()=>{stopped=true;clearTimeout(timer);clearInterval(poll);window.removeEventListener('focus',revalidate);document.removeEventListener('visibilitychange',revalidate);};
 },[url,cache,refresh,revision]);
 const current=state.url===url&&state.cache===cache;
 const data=current?state.data:cache.peek<T>(url),error=current?state.error:'';
 return {data,error,loading:!data&&!error,refreshing:current&&state.fetching,retry};
}
