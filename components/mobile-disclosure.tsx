'use client';
import {Children,useId,useState,type ReactNode} from 'react';
import {ChevronDown} from 'lucide-react';
import {useIsMobile} from '@/hooks/use-mobile';

/** Keep controls mounted so collapsing a mobile panel never resets its values. */
export function MobileDisclosure({children,label}:{children:ReactNode;label:string}){
 const mobile=useIsMobile(),[expanded,setExpanded]=useState(false),id=useId();
 return <div className="mobile-disclosure"><button type="button" className="mobile-disclosure-toggle" aria-expanded={expanded} aria-controls={id} onClick={()=>setExpanded(v=>!v)}>{label}<ChevronDown size={16}/></button><div id={id} className="mobile-disclosure-content" hidden={mobile&&!expanded}>{children}</div></div>;
}

/** The first child is the primary search; additional filters remain available on demand. */
export function ResponsiveFilters({children,active=0,className='filters'}:{children:ReactNode;active?:number;className?:string}){
 const items=Children.toArray(children);
 return <div className={className}>{items[0]}<MobileDisclosure label={`Нэмэлт шүүлтүүр${active?` · ${active} идэвхтэй`:''}`}>{items.slice(1)}</MobileDisclosure></div>;
}
