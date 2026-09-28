 'use client';
import {Tabs,Select,type TabsProps} from 'antd';
import {useState,useId,useRef,useEffect} from 'react';
import {useIsMobile} from '@/hooks/use-mobile';
/** Compact selector avoids clipped tab labels and overflow controls on phones. */
export function ResponsiveTabs(props:TabsProps){
 const mobile=useIsMobile(),id=useId(),host=useRef<HTMLDivElement>(null);
 const [overflow,setOverflow]=useState(false),requiredWidth=useRef(0);
 useEffect(()=>{const element=host.current;if(!element)return;const observer=new ResizeObserver(()=>{const nav=element.querySelector<HTMLElement>('.ant-tabs-nav-list');if(nav)requiredWidth.current=nav.scrollWidth+24;if(requiredWidth.current)setOverflow(requiredWidth.current>element.clientWidth);});observer.observe(element);return()=>observer.disconnect();},[props.items?.length,mobile,overflow]);
 const [local,setLocal]=useState(props.defaultActiveKey||props.items?.[0]?.key);
 const active=props.activeKey??local;
 if(!mobile&&!overflow)return <div ref={host}><Tabs {...props} activeKey={active} onChange={key=>{setLocal(key);props.onChange?.(key);}}/></div>;
 const item=props.items?.find(item=>item.key===active);
 return <div ref={host} className={props.className}><Select className="responsive-tabs-select" id={id} aria-label={props['aria-label']||'Хэсэг сонгох'} style={{width:'100%',marginBottom:16}} value={active} options={props.items?.map(item=>({value:item.key,label:item.label,disabled:item.disabled}))} onChange={key=>{setLocal(key);props.onChange?.(key);}}/><div role="region" aria-label={typeof item?.label==='string'?item.label:'Сонгосон хэсэг'}>{item?.children}</div></div>;
}
