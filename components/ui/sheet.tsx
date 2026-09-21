'use client';
import * as React from 'react';
import {OverlayRoot,OverlayContent,OverlayHeader,OverlayTitle,OverlayDescription,OverlayTrigger,OverlayClose} from './overlay';
export {OverlayRoot as Sheet,OverlayHeader as SheetHeader,OverlayTitle as SheetTitle,OverlayDescription as SheetDescription,OverlayTrigger as SheetTrigger,OverlayClose as SheetClose};
export function SheetContent(props:React.ComponentProps<typeof OverlayContent>){return <OverlayContent {...props} drawer/>;}
export function SheetFooter(props:React.ComponentProps<'div'>){return <div {...props} className={`crm-overlay-footer ${props.className??''}`}/>;}
