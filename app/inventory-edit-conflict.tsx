'use client';
import {Alert,Button,Table} from 'antd';
import type {Item} from './inventory-forms';
const fields:Partial<Record<keyof Item,string>>={name:'Барааны нэр',code:'Код',brand:'Брэнд',supplier:'Нийлүүлэгч',category:'Ангилал',capacity:'Багтаамж',color:'Өнгө',variant:'Хувилбар',imei:'IMEI',barcode:'Баркод',sale_price:'Үндсэн үнэ',cash_price:'Бэлэн үнэ',min_stock:'Доод үлдэгдэл',image_url:'Зураг'};
export function InventoryEditConflict({before,current,draft,onReload}:{before:Item;current:Item;draft:Partial<Item>;onReload:()=>void}){
 const rows=(Object.keys(fields) as (keyof Item)[]).filter(key=>String(before[key]??'')!==String(current[key]??'')).map(key=>({key,label:fields[key],before:String(before[key]??'—'),current:String(current[key]??'—'),draft:String(draft[key]??'—')}));
 return <Alert type="warning" showIcon title="Барааны мэдээлэл өөрчлөгдсөн" description={<><p>Таны засвар хадгалагдаагүй бөгөөд маягтад хэвээр байна. Шинэ мэдээллээр нээхэд оруулсан засвар арилна.</p><Table size="small" rowKey="key" pagination={false} dataSource={rows} scroll={{x:480}} columns={[{title:'Талбар',dataIndex:'label'},{title:'Нээх үеийн',dataIndex:'before'},{title:'Одоо хадгалагдсан',dataIndex:'current'},{title:'Таны оруулсан',dataIndex:'draft'}]}/><Button onClick={onReload}>Засварыг орхиж, шинэ мэдээллээр нээх</Button></>}/>;
}
