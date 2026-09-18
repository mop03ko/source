import {Button} from '@/components/ui/button';
export function AsyncStatus({error,loading=false,retry}:{error:string;loading?:boolean;retry:()=>void}){
 if(error)return <div className="error-box" role="alert"><span>{error}</span><Button variant="outline" onClick={retry}>Дахин оролдох</Button>{error.includes('нэвтэр')&&<a href="/login">Нэвтрэх</a>}</div>;
 if(loading)return <p className="muted" role="status">Мэдээлэл ачаалж байна…</p>;
 return null;
}
