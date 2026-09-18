import {requireCurrentUser} from './session';
import CRM from './crm';
export const dynamic='force-dynamic';
async function requestTime(){return Date.now();}
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){await requireCurrentUser();const initialNow=await requestTime();return <CRM initialNow={initialNow} initialQuery={await searchParams}/>;}
