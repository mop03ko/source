'use client';
import {Select} from 'antd';
import {useIsMobile} from '@/hooks/use-mobile';
import {Button} from '@/components/ui/button';
import {ScrollNavigation} from '@/components/scroll-navigation';

export function SalesNavigation({active,onNavigate,showDuplicates}:{active:string;onNavigate:(view:string)=>void;showDuplicates:boolean}){
 const mobile=useIsMobile();
 const items=[['all','Бүх хүсэлт'],['candidates','Дахин ажиллах бүлэг'],['recycle','Дахин холбогдох'],['reports','Тайлан'],...(showDuplicates?[['duplicates','Давхардсан хүсэлт']]:[])];
 if(mobile)return <nav className="crm-mobile-tabs" aria-label="Борлуулалтын хэсгүүд"><Select aria-label="Борлуулалтын хэсэг сонгох" value={active} onChange={onNavigate} options={items.map(([value,label])=>({value,label}))} style={{width:'100%'}}/></nav>;
 return <ScrollNavigation active={active} className="sales-tabs sales-navigation" aria-label="Борлуулалтын хэсгүүд"><div className="row">{items.map(([id,label])=><Button key={id} variant={active===id?'default':'ghost'} className={active===id?'primary':''} aria-current={active===id?'page':undefined} onClick={()=>onNavigate(id)}>{label}</Button>)}</div></ScrollNavigation>;
}
