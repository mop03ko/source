import {z} from 'zod';
import {acceptWebLoan,validWebLoanToken} from '@/lib/web-loans';
export const dynamic='force-dynamic';
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
export async function POST(req:Request){
 if(!validWebLoanToken(req.headers.get('x-web-loan-token')))return json({error:'Unauthorized'},401);
 if(Number(req.headers.get('content-length')||0)>16000)return json({error:'Payload too large'},413);
 try{const raw=await req.text();if(raw.length>16000)return json({error:'Payload too large'},413);const result=await acceptWebLoan(JSON.parse(raw));return json({ok:true,...result},result.duplicate?200:201);}
 catch(error){if(error instanceof z.ZodError||error instanceof SyntaxError)return json({error:'Invalid loan request'},400);if(error&&typeof error==='object'&&'status' in error&&error.status===409)return json({error:'Request ID conflict'},409);console.error('Web loan intake failed');return json({error:'Temporarily unavailable; retry with the same request ID'},503);}
}
