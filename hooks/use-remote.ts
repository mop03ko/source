'use client';
import {useCallback,useEffect,useState} from 'react';

export async function readJson<T>(url:string,signal?:AbortSignal):Promise<T>{
 const timeout=AbortSignal.timeout(20000);
 const response=await fetch(url,{cache:'no-store',signal:signal?AbortSignal.any([signal,timeout]):timeout}).catch(error=>{if(signal?.aborted)throw error;throw new Error(timeout.aborted?'Хүлээлгийн хугацаа дууслаа. Дахин оролдоно уу.':'Сервертэй холбогдож чадсангүй. Холболтоо шалгаад дахин оролдоно уу.');});
 const value=await response.json();
 if(!response.ok)throw new Error(response.status===401?'Нэвтрэх хугацаа дууссан. Дахин нэвтэрнэ үү.':value.error||'Мэдээлэл ачаалж чадсангүй. Дахин оролдоно уу.');
 return value as T;
}
export function useRemote<T>(url:string|null){
 const [state,setState]=useState<{url:string|null;data:T|null;error:string;loading:boolean}>({url:null,data:null,error:'',loading:false});
 const [revision,setRevision]=useState(0);
 const retry=useCallback(()=>setRevision(n=>n+1),[]);
 useEffect(()=>{
  if(!url)return;
  const controller=new AbortController();
  const timer=setTimeout(()=>{
   setState({url,data:null,error:'',loading:true});
   void readJson<T>(url,controller.signal).then(data=>{if(!controller.signal.aborted)setState({url,data,error:'',loading:false});}).catch(e=>{if(!controller.signal.aborted)setState({url,data:null,error:e instanceof Error?e.message:'Холболт тасарлаа.',loading:false});});
  },0);
  return()=>{clearTimeout(timer);controller.abort();};
 },[url,revision]);
 const current=state.url===url;
 return {data:current?state.data:null,error:current?state.error:'',loading:!!url&&(!current||state.loading),retry};
}
