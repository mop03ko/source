'use client';
import {Collapse} from 'antd';
import type {ReactNode} from 'react';

export function Disclosure({label,children,className=''}:{label:ReactNode;children:ReactNode;className?:string}){
 return <Collapse className={`crm-disclosure ${className}`} size="small" expandIconPlacement="end" destroyOnHidden={false} items={[{key:'content',label,children,forceRender:true}]}/>;
}
