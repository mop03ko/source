'use client';
import * as React from 'react';
import {OverlayRoot,OverlayContent,OverlayHeader,OverlayTitle,OverlayDescription,OverlayTrigger,OverlayClose} from './overlay';
export {OverlayRoot as Dialog,OverlayContent as DialogContent,OverlayHeader as DialogHeader,OverlayTitle as DialogTitle,OverlayDescription as DialogDescription,OverlayTrigger as DialogTrigger,OverlayClose as DialogClose};
export function DialogPortal({children}:{children?:React.ReactNode}){return <>{children}</>;}
export function DialogOverlay(props:React.ComponentProps<'div'>){return <div {...props}/>;}
export function DialogFooter({showCloseButton,children,...props}:React.ComponentProps<'div'>&{showCloseButton?:boolean}){return <div {...props} className={`crm-overlay-footer ${props.className??''}`}>{children}{showCloseButton&&<OverlayClose>Хаах</OverlayClose>}</div>;}
