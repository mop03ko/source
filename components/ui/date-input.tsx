'use client';
import {useField} from '@/components/form-field';
import * as React from 'react';
import {DatePicker} from 'antd';
import dayjs from 'dayjs';
import 'dayjs/locale/mn';

// Keep wall-clock values and native validation/FormData contracts used by CRM forms.
export function DateInput({value,defaultValue,onChange,ref,type,className,...props}:React.ComponentProps<'input'>){
 const field=useField();
 const native=React.useRef<HTMLInputElement>(null),picker=React.useRef<React.ComponentRef<typeof DatePicker>>(null);
 const [local,setLocal]=React.useState(String(defaultValue??''));
 const raw=String(value??local),parsed=raw?dayjs(raw).locale('mn'):null;
 React.useEffect(()=>{const form=native.current?.form;const reset=()=>queueMicrotask(()=>setLocal(native.current?.value??''));form?.addEventListener('reset',reset);return()=>form?.removeEventListener('reset',reset);},[]);
 return <span className={`crm-date-control ${className??''}`}><input {...props} ref={node=>{native.current=node;if(typeof ref==='function')ref(node);else if(ref)ref.current=node;}} id={undefined} type={type} value={value} defaultValue={defaultValue} className="crm-native-select" aria-hidden="true" tabIndex={-1} onFocus={()=>picker.current?.focus()} onChange={event=>{setLocal(event.target.value);onChange?.(event);}} onInvalid={event=>{event.preventDefault();picker.current?.focus();props.onInvalid?.(event);}}/><DatePicker ref={picker} value={parsed?.isValid()?parsed:null} disabled={props.disabled||props.readOnly} aria-label={props['aria-label']??(field.label||props.placeholder)} aria-invalid={field.error?true:props['aria-invalid']} aria-errormessage={field.error?field.errorId:undefined} status={field.error?'error':undefined} aria-required={props.required} id={props.id} placeholder={props.placeholder??(type==='datetime-local'?'Огноо, цаг сонгох':'Огноо сонгох')} showTime={type==='datetime-local'?{format:'HH:mm'}:false} format={type==='datetime-local'?'YYYY-MM-DD HH:mm':'YYYY-MM-DD'} minDate={props.min?dayjs(props.min):undefined} maxDate={props.max?dayjs(props.max):undefined} onChange={date=>{const element=native.current;if(!element)return;const next=date?date.format(type==='datetime-local'?'YYYY-MM-DDTHH:mm':'YYYY-MM-DD'):'';Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set?.call(element,next);element.dispatchEvent(new Event('input',{bubbles:true}));element.dispatchEvent(new Event('change',{bubbles:true}));}}/></span>;
}
