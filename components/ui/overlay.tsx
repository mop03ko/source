'use client';
import * as React from 'react';
import {Drawer, Modal} from 'antd';
import {X} from 'lucide-react';
import {useDraftGuard} from '@/components/draft-guard';
import {Button} from './button';
const Context=React.createContext({open:false,change:(_open:boolean)=>{}});
type RootProps={children?:React.ReactNode;open?:boolean;defaultOpen?:boolean;onOpenChange?:(open:boolean)=>void;modal?:boolean};
export function OverlayRoot({children,open,defaultOpen=false,onOpenChange}:RootProps){
 const [local,setLocal]=React.useState(defaultOpen),allow=useDraftGuard();
 return <Context.Provider value={{open:open??local,change:value=>{if(value||allow()){setLocal(value);onOpenChange?.(value);}}}}>{children}</Context.Provider>;
}
type ActionProps=React.ComponentProps<typeof Button>&{asChild?:boolean};
export function OverlayTrigger({onClick,...props}:ActionProps){const ctx=React.useContext(Context);return <Button type="button" {...props} onClick={event=>{onClick?.(event);if(!event.defaultPrevented)ctx.change(true);}}/>;}
export function OverlayClose({onClick,...props}:ActionProps){const ctx=React.useContext(Context);return <Button type="button" {...props} onClick={event=>{onClick?.(event);if(!event.defaultPrevented)ctx.change(false);}}/>;}
type ContentProps=React.ComponentProps<'div'>&{showCloseButton?:boolean;side?:'top'|'right'|'bottom'|'left'};
export function OverlayContent({children,className,showCloseButton=true,side='right',drawer=false,...props}:ContentProps&{drawer?:boolean}){
 const ctx=React.useContext(Context),id=React.useId();
 const parts=React.Children.toArray(children),header=parts.find(child=>React.isValidElement(child)&&child.type===OverlayHeader);
 const body=parts.filter(child=>child!==header);
 const title=header?<div id={id}>{header}</div>:undefined;
 const closeIcon=<span data-slot={drawer?'sheet-close':'dialog-close'} aria-label="Хаах"><X size={18}/></span>;
 if(drawer)return <Drawer open={ctx.open} onClose={()=>ctx.change(false)} placement={side} size={580} title={title} closable={showCloseButton} closeIcon={closeIcon} destroyOnHidden styles={{body:{padding:0},wrapper:{maxWidth:'100vw'}}}><div {...props} data-slot="sheet-content" className={className}>{body}</div></Drawer>;
 return <Modal open={ctx.open} onCancel={()=>ctx.change(false)} title={title} footer={null} width={620} closable={showCloseButton} closeIcon={closeIcon} destroyOnHidden centered><div {...props} data-slot="dialog-content" className={className}>{body}</div></Modal>;
}
export function OverlayHeader(props:React.ComponentProps<'div'>){return <div {...props} className={`crm-overlay-header ${props.className??''}`}/>;}
export function OverlayTitle(props:React.ComponentProps<'h2'>){return <h2 {...props} className={`crm-overlay-title ${props.className??''}`}/>;}
export function OverlayDescription(props:React.ComponentProps<'p'>){return <p {...props} className={`crm-overlay-description ${props.className??''}`}/>;}

