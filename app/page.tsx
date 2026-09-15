import {requireChatGPTUser} from './chatgpt-auth';
import CRM from './crm';
export const dynamic='force-dynamic';
export default async function Page(){await requireChatGPTUser('/');return <CRM/>;}
