'use client';
import {useEffect,useRef,type ComponentProps} from 'react';

export function ScrollNavigation({children,active,...props}:ComponentProps<'nav'>&{active:string}){
 const ref=useRef<HTMLElement>(null);
 useEffect(()=>{
  const nav=ref.current;if(!nav)return;
  const reveal=()=>{
   const selected=nav.querySelector('[aria-current="page"]');if(!selected)return;
   const bounds=nav.getBoundingClientRect(),item=selected.getBoundingClientRect();
   if(item.left<bounds.left)nav.scrollLeft-=bounds.left-item.left+4;
   else if(item.right>bounds.right)nav.scrollLeft+=item.right-bounds.right+4;
  };
  reveal();const observer=new ResizeObserver(reveal);observer.observe(nav);
  return()=>observer.disconnect();
 },[active]);
 return <nav {...props} ref={ref}>{children}</nav>;
}
