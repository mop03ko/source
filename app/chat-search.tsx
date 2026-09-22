 'use client';
import {Input,Popover,Empty,Spin,Alert} from 'antd';
import {useState} from 'react';
import {useDebouncedValue} from '@/hooks/use-debounced-value';
import {useRemote} from '@/hooks/use-remote';
import {dateLabel} from '@/lib/crm';
export default function ChatSearch({peer,channel,name}:{peer:string;channel:boolean;name:(email:string)=>string}){
 const [term,setTerm]=useState('');
 const search=useDebouncedValue(term.trim());
 const result=useRemote<{items:{id:string;sender:string;body:string;created_at:string}[]}>(search?'/api/messages?'+new URLSearchParams({...channel?{team:'1',channel:peer}:{peer},search}):null);
 return <Popover trigger="click" placement="bottomRight" title="Энэ чат дотор хайх" content={<div style={{width:300,maxWidth:'75vw'}}><Input.Search aria-label="Зурвасын агуулгаар хайх" value={term} maxLength={100} allowClear onChange={e=>setTerm(e.target.value)} placeholder="Зурвасын текст…"/>{result.loading&&<Spin/>}{result.error&&<Alert type="error" title={result.error}/>}<div style={{maxHeight:320,overflowY:'auto'}} tabIndex={0} aria-label="Зурвасын хайлтын үр дүн">{result.data?.items.map(item=><article key={item.id} style={{paddingBlock:10,borderBottom:'1px solid #ddd'}}><strong>{name(item.sender)}</strong><small style={{display:'block'}}>{dateLabel(item.created_at)}</small><p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{item.body}</p></article>)}</div>{result.data&&!result.data.items.length&&<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Тохирох зурвас алга"/>}{result.data&&<small>Хамгийн сүүлийн 50 тохирох зурвас.</small>}</div>}><button type="button" className="chat-search-button">Зурвас хайх</button></Popover>;
}
