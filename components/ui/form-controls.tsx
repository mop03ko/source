'use client';
import {useField} from '@/components/form-field';
import * as React from 'react';
import {Input,Select} from 'antd';
import {useFormReset} from './use-form-reset';
import type {RefSelectProps} from 'antd';
type Option={value:string;label:React.ReactNode;disabled?:boolean};
function optionsFrom(children:React.ReactNode):Option[]{return React.Children.toArray(children).flatMap(child=>{if(!React.isValidElement<{value?:string|number;children?:React.ReactNode;disabled?:boolean}>(child))return [];if(child.type==='option')return [{value:String(child.props.value??child.props.children??''),label:child.props.children,disabled:child.props.disabled}];return optionsFrom(child.props.children);});}
export function SelectControl({children,value,defaultValue,className,style,onChange,ref,...props}:React.ComponentProps<'select'>){
 const field=useField();
 const native=React.useRef<HTMLSelectElement>(null),select=React.useRef<RefSelectProps>(null);
 const options=optionsFrom(children),[local,setLocal]=React.useState(String(defaultValue??options[0]?.value??''));
 React.useEffect(()=>{const form=native.current?.form;const reset=()=>{queueMicrotask(()=>setLocal(native.current?.value??''));};form?.addEventListener('reset',reset);return()=>form?.removeEventListener('reset',reset);},[]);
 const change=(next:string)=>{const element=native.current;if(!element)return;element.value=next;element.dispatchEvent(new Event('input',{bubbles:true}));element.dispatchEvent(new Event('change',{bubbles:true}));};
 return <span className={`crm-select-control ${className??''}`} style={style}><select {...props} ref={node=>{native.current=node;if(typeof ref==='function')ref(node);else if(ref)ref.current=node;}} id={undefined} aria-hidden="true" tabIndex={-1} className="crm-native-select" value={value} defaultValue={defaultValue} onChange={event=>{setLocal(event.target.value);onChange?.(event);}} onFocus={()=>select.current?.focus()} onInvalid={event=>{event.preventDefault();select.current?.focus();props.onInvalid?.(event);}}>{children}</select><Select ref={select} value={String(value??local)} options={options} onChange={change} disabled={props.disabled} id={props.id} aria-label={props['aria-label']??(field.label||undefined)} aria-errormessage={field.error?field.errorId:undefined} aria-labelledby={props['aria-labelledby']} aria-required={props.required} aria-invalid={field.error?true:props['aria-invalid']} status={field.error||props['aria-invalid']?'error':undefined} showSearch={{optionFilterProp:'label'}} popupMatchSelectWidth styles={{root:{width:'100%'}}}/></span>;
}
export function TextareaControl({ref,...props}:React.ComponentProps<'textarea'>){const field=useField(),native=React.useRef<HTMLTextAreaElement>(null),resetVersion=useFormReset(native);return <Input.TextArea aria-label={props['aria-label']??(field.label||undefined)} aria-invalid={field.error?true:props['aria-invalid']} aria-errormessage={field.error?field.errorId:undefined} status={field.error?'error':undefined} key={props.value===undefined?resetVersion:0} {...props} ref={instance=>{const element=instance?.resizableTextArea?.textArea??null;native.current=element;if(typeof ref==='function')ref(element);else if(ref)ref.current=element;}}/>;}
