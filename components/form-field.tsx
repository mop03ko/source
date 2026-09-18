'use client';
import {useId,useState,type ReactNode} from 'react';
export function Field({label,children}:{label:string;children:ReactNode}){
 const [error,setError]=useState(''),id=useId();
 return <label className="field" onInvalidCapture={e=>{const el=e.target as HTMLInputElement;const message=el.validity.customError?el.validationMessage:el.validity.valueMissing?'Энэ талбарыг бөглөнө үү.':el.validity.rangeUnderflow?'Зөвшөөрөгдсөн хугацаа эсвэл доод утгыг шалгана уу.':el.validity.tooLong?'Утга хэт урт байна.':'Оруулсан утгын хэлбэрийг шалгана уу.';setError(message);el.setAttribute('aria-invalid','true');el.setAttribute('aria-errormessage',id);}} onInputCapture={e=>{const el=e.target as HTMLInputElement;el.setCustomValidity('');if(el.validity?.valid){setError('');el.removeAttribute('aria-invalid');el.removeAttribute('aria-errormessage');}}}><span>{label}</span>{children}{error&&<small id={id} className="field-error" role="alert">{error}</small>}</label>;
}
