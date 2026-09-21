'use client';
import {App,Button} from 'antd';
import {useEffect,type ReactNode} from 'react';
type Options={duration?:number;action?:{label:string;onClick:()=>void}};
type Notice={type:'success'|'error'|'info'|'warning';content:ReactNode;options?:Options};
const listeners=new Set<(notice:Notice)=>void>();
const pending:Notice[]=[];
function send(type:Notice['type'],content:ReactNode,options?:Options){const notice={type,content,options};if(!listeners.size){pending.push(notice);if(pending.length>10)pending.shift();}else listeners.forEach(listener=>listener(notice));}
export const toast={success:(content:ReactNode,options?:Options)=>send('success',content,options),error:(content:ReactNode,options?:Options)=>send('error',content,options),info:(content:ReactNode,options?:Options)=>send('info',content,options),warning:(content:ReactNode,options?:Options)=>send('warning',content,options)};
export function Toaster({duration=5000}:{duration?:number;position?:string;richColors?:boolean}){
 const {message}=App.useApp();
 useEffect(()=>{const listener=({type,content,options}:Notice)=>{void message.open({type,content:<>{content}{options?.action&&<Button type="link" onClick={options.action.onClick}>{options.action.label}</Button>}</>,duration:(options?.duration??duration)/1000});};listeners.add(listener);pending.splice(0).forEach(listener);return()=>{listeners.delete(listener);};},[message,duration]);
 return null;
}
