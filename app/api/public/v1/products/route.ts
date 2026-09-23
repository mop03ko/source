import {listPublicProducts,publicError,publicHeaders,publicProductQuery} from '@/lib/public-products';
import {authorizePublicApi} from '@/lib/public-api-auth';
export const dynamic='force-dynamic';
export async function GET(req:Request){
 const denied=authorizePublicApi(req);if(denied)return denied;
 const params=new URL(req.url).searchParams;
 const parsed=publicProductQuery.safeParse(Object.fromEntries(params));
 if(!parsed.success||new Set(params.keys()).size!==[...params.keys()].length)return publicError(400,'INVALID_QUERY','Хайлтын параметр буруу. page ≥ 1, limit 1–100 байна.');
 try{return Response.json(await listPublicProducts(parsed.data),{headers:publicHeaders()});}
 catch{return publicError(503,'SERVICE_UNAVAILABLE','Барааны мэдээллийг түр авах боломжгүй.');}
}
export function OPTIONS(){return new Response(null,{status:204,headers:publicHeaders()});}
