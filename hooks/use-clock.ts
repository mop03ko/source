'use client';
import {useEffect,useState} from 'react';

/** Refresh time-dependent labels without reading a changing clock during render. */
export function useClock(){
 const [now,setNow]=useState(()=>Date.now());
 useEffect(()=>{
  const update=()=>setNow(Date.now());
  const timer=setInterval(update,15000);
  document.addEventListener('visibilitychange',update);
  return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',update);};
 },[]);
 return now;
}
