'use client';
import {Checkbox,Table,Tag} from 'antd';
import {useIsMobile} from '@/hooks/use-mobile';
import {cash,type Item} from './inventory-forms';

type Props={items:Item[];catalog:boolean;onOpen:(item:Item)=>void;selected:(id:string)=>boolean;onSelect:(id:string,value:boolean)=>void;all:boolean;mixed:boolean;onAll:(value:boolean)=>void;disabled:boolean};
export default function InventoryCatalog({items,catalog,onOpen,selected,onSelect,all,mixed,onAll,disabled}:Props){
 const mobile=useIsMobile();
 const name=(i:Item)=><button className="inventory-item-link" onClick={()=>onOpen(i)}><strong>{i.name}</strong><small>{catalog?`${i.unit_count} дугаарын бүртгэл`:i.code}</small></button>;
 const variant=(i:Item)=>[i.capacity,i.color,i.variant].filter(Boolean).join(' / ');
 const prices=(i:Item)=><div className="inventory-prices"><strong>{cash(i.sale_price)}{i.sale_price_max!==undefined&&i.sale_price_max!==i.sale_price?' – '+cash(i.sale_price_max):''}</strong><small>Бэлэн: {cash(i.cash_price??i.sale_price)}{i.cash_price_max!==undefined&&i.cash_price_max!==(i.cash_price??i.sale_price)?' – '+cash(i.cash_price_max):''}</small></div>;
 const stock=(i:Item)=><Tag color={i.stock<0?'red':i.stock===0?'default':i.stock<=i.min_stock?'orange':'green'}>{i.stock} ш · {i.stock<0?'Сөрөг':i.stock===0?'Үлдэгдэлгүй':i.stock<=i.min_stock?'Нөхөн татах':'Үлдэгдэлтэй'}</Tag>;
 if(mobile)return <div className="inventory-cards"><Checkbox checked={all} indeterminate={mixed} disabled={disabled} onChange={e=>onAll(e.target.checked)}>Энэ хуудасны бүх барааг сонгох</Checkbox>{items.map(i=><article key={i.id} className={'inventory-product-card'+(selected(i.id)?' selected':'')}><div className="inventory-card-title"><Checkbox aria-label={`${i.name} (${i.code}) барааг сонгох`} checked={selected(i.id)} disabled={disabled} onChange={e=>onSelect(i.id,e.target.checked)}/>{name(i)}</div><p>{variant(i)||i.category||'Ангилаагүй'}</p>{stock(i)}{prices(i)}<small>{i.supplier||'Нийлүүлэгч тодорхойгүй'}</small></article>)}</div>;
 return <Table<Item> className="inventory-catalog-table" size="small" rowKey="id" dataSource={items} pagination={false} scroll={{x:1080}} sticky rowSelection={{selectedRowKeys:items.filter(i=>selected(i.id)).map(i=>i.id),onSelect:(i,v)=>onSelect(i.id,v),onSelectAll:v=>onAll(v),getCheckboxProps:i=>({disabled,'aria-label':`${i.name} (${i.code}) барааг сонгох`}),columnTitle:<Checkbox aria-label="Энэ хуудасны бүх барааг сонгох" checked={all} indeterminate={mixed} disabled={disabled} onChange={e=>onAll(e.target.checked)}/>}} columns={[
  {title:'Бараа / хувилбар',key:'name',fixed:'left',width:260,render:(_,i)=><>{name(i)}<small>{variant(i)}</small></>},
  {title:'Үлдэгдэл',key:'stock',width:190,render:(_,i)=>stock(i)},
  {title:'Үндсэн / бэлэн үнэ',key:'price',align:'right',width:220,render:(_,i)=>prices(i)},
  {title:'Нийлүүлэгч',dataIndex:'supplier',width:140,render:v=>v||'Тодорхойгүй'},
  {title:'Ангилал / брэнд',key:'brand',width:150,render:(_,i)=><>{i.category||'Ангилаагүй'}<small>{i.brand||'Брэнд бүртгээгүй'}</small></>},
  {title:'Үлдэгдлийн өртөг',key:'cost',align:'right',width:160,render:(_,i)=>cash(i.value_cents/100)},
 ]}/>;
}
