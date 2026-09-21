'use client';
import {Checkbox,Radio} from 'antd';
import type {ComponentProps,ChangeEvent} from 'react';
export function ChoiceInput({type,onChange,ref,...props}:ComponentProps<'input'>){
 if(type==='radio')return <Radio {...props} ref={instance=>{const element=instance?.input??null;if(typeof ref==='function')ref(element);else if(ref)ref.current=element;}} onChange={event=>onChange?.(event as unknown as ChangeEvent<HTMLInputElement>)}/>;
 return <Checkbox {...props} ref={instance=>{const element=instance?.input??null;if(typeof ref==='function')ref(element);else if(ref)ref.current=element;}} onChange={event=>onChange?.(event as unknown as ChangeEvent<HTMLInputElement>)}/>;
}
