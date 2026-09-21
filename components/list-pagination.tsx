'use client';
import {Pagination} from 'antd';

export function ListPagination({page,total,pageSize=50,loading=false,onChange,label='бүртгэл'}:{page:number;total:number;pageSize?:number;loading?:boolean;onChange:(page:number)=>void;label?:string}){
 if(!total)return null;
 return <div className="table-footer crm-list-pagination"><Pagination current={page} total={total} pageSize={pageSize} disabled={loading} onChange={onChange} showSizeChanger={false} responsive showTotal={(count,range)=>`${range[0]}–${range[1]} / ${count} ${label}`}/></div>;
}
