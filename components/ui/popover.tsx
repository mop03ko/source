'use client';
import * as React from 'react';
import {Popover as AntPopover} from 'antd';
type ContentProps=React.ComponentProps<'div'>&{align?:'start'|'center'|'end';side?:'top'|'right'|'bottom'|'left';sideOffset?:number};
export function Popover({children,open,defaultOpen,onOpenChange}:{children?:React.ReactNode;open?:boolean;defaultOpen?:boolean;onOpenChange?:(open:boolean)=>void}){
 const parts=React.Children.toArray(children);
 const trigger=parts.find(child=>React.isValidElement(child)&&child.type===PopoverTrigger) as React.ReactElement<{children:React.ReactElement}>|undefined;
 const content=parts.find(child=>React.isValidElement(child)&&child.type===PopoverContent) as React.ReactElement<ContentProps>|undefined;
 return <AntPopover open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange} trigger="click" placement={content?.props.align==='end'?'bottomRight':content?.props.align==='start'?'bottomLeft':'bottom'} content={content} destroyOnHidden>{trigger?.props.children??<span/>}</AntPopover>;
}
export function PopoverTrigger({children}:{children?:React.ReactNode;asChild?:boolean}){return <>{children}</>;}
export function PopoverContent({align: _align,side: _side,sideOffset: _offset,...props}:ContentProps){return <div {...props} data-slot="popover-content"/>;}
export function PopoverAnchor(props:React.ComponentProps<'div'>){return <div {...props}/>;}
export function PopoverHeader(props:React.ComponentProps<'div'>){return <div {...props}/>;}
export function PopoverTitle(props:React.ComponentProps<'h2'>){return <h2 {...props}/>;}
export function PopoverDescription(props:React.ComponentProps<'p'>){return <p {...props}/>;}
