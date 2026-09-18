'use client';
import {useEffect,useState} from 'react';

/** Refresh time-dependent labels without reading a changing clock during render. */
export function useClock(initialNow=0){
 const [now,setNow]=useState(initialNow);
 useEffect(()=>{
  const update=()=>setNow(Date.now());
  const initial=setTimeout(update,0);const timer=setInterval(update,15000);
  document.addEventListener('visibilitychange',update);
  return()=>{clearTimeout(initial);clearInterval(timer);document.removeEventListener('visibilitychange',update);};
 },[]);
 return now;
}
