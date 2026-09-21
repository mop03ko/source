'use client';
import {Alert,Button,Space,Spin} from 'antd';
export function AsyncStatus({error,loading=false,retry}:{error:string;loading?:boolean;retry:()=>void}){
 if(error)return <Alert className="crm-async-alert" type="error" showIcon title={error} action={<Space wrap><Button onClick={retry}>Дахин оролдох</Button>{error.toLocaleLowerCase().includes('нэвтрэ')&&<Button href="/login">Нэвтрэх</Button>}</Space>}/>;
 if(loading)return <div className="crm-loading-status" role="status"><Spin size="small"/><span>Мэдээлэл ачаалж байна…</span></div>;
 return null;
}
