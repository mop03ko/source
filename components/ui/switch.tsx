'use client';
import {Switch as AntSwitch,type SwitchProps} from 'antd';
export function Switch({onCheckedChange,size,...props}:Omit<SwitchProps,'size'>&{size?:'sm'|'default';onCheckedChange?:(checked:boolean)=>void}){return <AntSwitch {...props} data-slot="switch" size={size==='sm'?'small':'default'} onChange={onCheckedChange??props.onChange}/>;}
