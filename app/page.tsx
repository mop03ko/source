import {requireCurrentUser} from './session';
import CRM from './crm';
export const dynamic='force-dynamic';
export default async function Page(){await requireCurrentUser();return <CRM/>;}
