'use client';
import * as React from 'react';
import {Tabs as AntTabs,Select} from 'antd';
import {useIsMobile} from '@/hooks/use-mobile';
import {cva} from 'class-variance-authority';
import {useDraftGuard} from '@/components/draft-guard';
const Context=React.createContext({value:'',change:(_value:string)=>{},id:''});
export function Tabs({value,defaultValue='',onValueChange,orientation='horizontal',children,...props}:React.ComponentProps<'div'>&{value?:string;defaultValue?:string;onValueChange?:(value:string)=>void;orientation?:'horizontal'|'vertical'}){
 const [local,setLocal]=React.useState(defaultValue),allow=useDraftGuard(),id=React.useId();
 return <Context.Provider value={{value:value??local,id,change:next=>{if(next!==(value??local)&&allow()){setLocal(next);onValueChange?.(next);}}}}><div {...props} data-slot="tabs" data-orientation={orientation}>{children}</div></Context.Provider>;
}
export const tabsListVariants=cva('',{variants:{variant:{default:'',line:''}}});
type TriggerProps=React.ComponentProps<'button'>&{value:string};
export function TabsTrigger({children}:TriggerProps){return <>{children}</>;}
export function TabsList({children,className,...props}:React.ComponentProps<'div'>&{variant?:'default'|'line'}){
 const ctx=React.useContext(Context),mobile=useIsMobile();
 const items=React.Children.toArray(children).filter((child):child is React.ReactElement<TriggerProps>=>React.isValidElement(child)&&child.type===TabsTrigger).map(child=>({key:child.props.value,label:<span data-slot="tabs-trigger" data-state={ctx.value===child.props.value?'active':'inactive'}>{child.props.children}</span>,disabled:child.props.disabled}));
 if(mobile)return <div className={`crm-mobile-tabs ${className||''}`}><span className="sr-only" id={`${ctx.id}-tab-${ctx.value}`}>{items.find(item=>item.key===ctx.value)?.label}</span><Select aria-label={props['aria-label']||'Хэсэг сонгох'} value={ctx.value} onChange={ctx.change} options={items.map(item=>({value:item.key,label:item.label,disabled:item.disabled}))} style={{width:'100%'}}/></div>;
 return <AntTabs id={ctx.id} className={className} data-slot="tabs-list" aria-label={props['aria-label']} activeKey={ctx.value} onChange={ctx.change} items={items}/>;
}
export function TabsContent({value,children,...props}:React.ComponentProps<'div'>&{value:string}){
 const ctx=React.useContext(Context),mobile=useIsMobile();if(ctx.value!==value)return null;
 return <div {...props} data-slot="tabs-content" role={mobile?'region':'tabpanel'} id={`${ctx.id}-panel-${value}`} aria-labelledby={`${ctx.id}-tab-${value}`}>{children}</div>;
}
