"use client"
import {useField} from '@/components/form-field';
import * as React from "react"
import {Input as AntInput, Button as AntButton} from "antd"
import {useFormReset} from "./use-form-reset"
import {DateInput} from "./date-input"

import { cn } from "@/lib/utils"

function Input({ className, type, ref, size, ...props }: React.ComponentProps<"input">) {
  const field=useField();
  const native=React.useRef<HTMLInputElement>(null),resetVersion=useFormReset(native);
  const [fileName,setFileName]=React.useState('');
  if(type==='date'||type==='datetime-local')return <DateInput {...props} ref={ref} type={type} className={className}/>;
  if(type==='file')return <div className="file-control"><AntButton className="file-button" htmlType="button" tabIndex={-1}>Файл сонгох</AntButton><span className="file-name">{fileName||'Файл сонгоогүй'}</span><input {...props} ref={ref} type="file" className="file-native" onChange={e=>{setFileName(Array.from(e.target.files||[]).map(f=>f.name).join(', '));props.onChange?.(e);}}/></div>;

  return <AntInput aria-label={props['aria-label']??(field.label||undefined)} aria-invalid={field.error?true:props['aria-invalid']} aria-errormessage={field.error?field.errorId:undefined} status={field.error?'error':undefined} key={props.value===undefined?resetVersion:0} {...props} ref={instance=>{const element=instance?.input??null;native.current=element;if(typeof ref==="function")ref(element);else if(ref)ref.current=element;}} type={type} data-slot="input" className={cn("crm-ant-input",className)} htmlSize={size}/>;
}
export {Input}
