 'use client';
import {Tabs,Select,type TabsProps} from 'antd';
import {useState,useId} from 'react';
import {useIsMobile} from '@/hooks/use-mobile';
/** Compact selector avoids clipped tab labels and overflow controls on phones. */
export function ResponsiveTabs(props:TabsProps){
 const mobile=useIsMobile(),id=useId();
 const [local,setLocal]=useState(props.defaultActiveKey||props.items?.[0]?.key);
 const active=props.activeKey??local;
 if(!mobile)return <Tabs {...props} activeKey={active} onChange={key=>{setLocal(key);props.onChange?.(key);}}/>;
 const item=props.items?.find(item=>item.key===active);
 return <div className={props.className}><Select id={id} aria-label={props['aria-label']||'Хэсэг сонгох'} style={{width:'100%',marginBottom:16}} value={active} options={props.items?.map(item=>({value:item.key,label:item.label,disabled:item.disabled}))} onChange={key=>{setLocal(key);props.onChange?.(key);}}/><div role="region" aria-label={typeof item?.label==='string'?item.label:'Сонгосон хэсэг'}>{item?.children}</div></div>;
}
