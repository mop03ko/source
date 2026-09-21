'use client';
import {Image} from 'antd';
import {Package} from 'lucide-react';
import {useState} from 'react';
export function ProductPhoto({url,name}:{url?:string;name:string}){
 const [failed,setFailed]=useState('');
 return <span className="inventory-photo">{url&&failed!==url?<Image src={url} alt={name} width={48} height={48} loading="lazy" referrerPolicy="no-referrer" onError={()=>setFailed(url)} styles={{image:{objectFit:'contain'}}}/>:<Package size={24} aria-label="Зураг оруулаагүй"/>}</span>;
}
const colors:Record<string,string>={black:'#252525','хар':'#252525',white:'#fff','цагаан':'#fff',blue:'#3879bd','цэнхэр':'#3879bd',silver:'#bdc5cd','мөнгөлөг':'#bdc5cd',gray:'#89929a',grey:'#89929a','саарал':'#89929a',gold:'#cfaf62',green:'#3e8262','ногоон':'#3e8262',pink:'#e3a3bc','ягаан':'#e3a3bc',red:'#ce5555','улаан':'#ce5555',purple:'#8b6abc',orange:'#df863a'};
export function ProductVariant({capacity,color,variant}:{capacity?:string;color?:string;variant?:string}){
 const swatch=colors[(color||'').trim().toLocaleLowerCase()];
 return <span className="inventory-variant">{capacity&&<span>{capacity}</span>}{color&&<span>{swatch&&<i aria-hidden="true" style={{background:swatch}}/>}{color}</span>}{variant&&<span>{variant}</span>}</span>;
}
