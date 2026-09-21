'use client';
import {createContext,useCallback,useContext,useEffect,useId,useRef,useState,type FormEvent,type ComponentProps,type ReactNode} from 'react';

type Guard={register:(id:string,dirty:boolean)=>void;allow:()=>boolean};
const Context=createContext<Guard>({register:()=>{},allow:()=>true});
export function DraftGuard({children}:{children:ReactNode}){
 const dirty=useRef(new Set<string>());
 const register=useCallback((id:string,value:boolean)=>{if(value)dirty.current.add(id);else dirty.current.delete(id);},[]);
 const allow=useCallback(()=>!dirty.current.size||window.confirm('Хадгалаагүй өөрчлөлт байна. Өөрчлөлтөө хаяж гарах уу? Цуцлах дарвал үргэлжлүүлэн засна.'),[]);
 useEffect(()=>{const before=(e:BeforeUnloadEvent)=>{if(dirty.current.size){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',before);return()=>window.removeEventListener('beforeunload',before);},[]);
 return <Context.Provider value={{register,allow}}>{children}</Context.Provider>;
}
export const useDraftGuard=()=>useContext(Context).allow;
export function useUnsavedChanges(dirty:boolean){
 const id=useId(),{register}=useContext(Context);
 useEffect(()=>{register(id,dirty);return()=>register(id,false);},[id,dirty,register]);
}
const snapshot=(form:HTMLFormElement)=>JSON.stringify(Array.from(form.elements).filter((el):el is HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement=>(el instanceof HTMLInputElement||el instanceof HTMLSelectElement||el instanceof HTMLTextAreaElement)&&!el.closest('.ant-select')).map(el=>[el.name,el.value,el instanceof HTMLInputElement?el.checked:null]));
export function markFormSaved(form:HTMLFormElement|null){form?.dispatchEvent(new Event('crm:saved'));}
export function markFormError(form:HTMLFormElement|null,message:string,fields?:Record<string,string>){
 form?.dispatchEvent(new CustomEvent('crm:error',{detail:message}));
 if(!form||!fields)return;
 let first:HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement|null=null;
 for(const [name,text] of Object.entries(fields)){
  const el=form.elements.namedItem(name);
  if(el instanceof HTMLInputElement||el instanceof HTMLSelectElement||el instanceof HTMLTextAreaElement){el.setCustomValidity(text);el.dispatchEvent(new Event('invalid',{cancelable:true}));first??=el;}
 }
 first?.focus();
}
export function GuardedForm({onSubmit,children,focusError=false,...props}:Omit<ComponentProps<'form'>,'onSubmit'> & {focusError?:boolean;onSubmit?:(e:FormEvent<HTMLFormElement>)=>unknown;children:ReactNode}){
 const ref=useRef<HTMLFormElement>(null),baseline=useRef('');const [dirty,setDirty]=useState(false),[failure,setFailure]=useState('');
 useUnsavedChanges(dirty);
 useEffect(()=>{if(failure&&focusError){const alert=ref.current?.querySelector<HTMLElement>('.error-box');alert?.focus();alert?.scrollIntoView({block:'nearest'});}},[failure,focusError]);
 useEffect(()=>{const form=ref.current;if(!form)return;const saved=()=>{baseline.current=snapshot(form);setDirty(false);setFailure('');};const failed=(e:Event)=>setFailure((e as CustomEvent<string>).detail);baseline.current=snapshot(form);form.addEventListener('crm:saved',saved);form.addEventListener('crm:error',failed);return()=>{form.removeEventListener('crm:saved',saved);form.removeEventListener('crm:error',failed);};},[]);
 return <form {...props} ref={ref} onChangeCapture={()=>{if(ref.current)setDirty(snapshot(ref.current)!==baseline.current);}} onSubmit={async e=>{e.preventDefault();setFailure('');try{const result=await onSubmit?.(e);if(result)markFormSaved(ref.current);}catch(error){setFailure(error instanceof Error?error.message:'Хадгалж чадсангүй.');}}}>{failure&&<p className="error-box" role="alert" tabIndex={-1}>{failure}</p>}{children}{dirty&&<p className="draft-hint" role="status">Хадгалаагүй өөрчлөлттэй</p>}</form>;
}
