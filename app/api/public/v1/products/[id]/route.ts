import {getPublicProduct,publicError,publicHeaders,publicProductId} from '@/lib/public-products';
export const dynamic='force-dynamic';
export async function GET(_req:Request,context:{params:Promise<{id:string}>}){
 const {id}=await context.params;
 if(!publicProductId.safeParse(id).success)return publicError(400,'INVALID_ID','Барааны ID эсвэл SKU буруу.');
 try{const product=await getPublicProduct(id);return product?Response.json(product,{headers:publicHeaders(true)}):publicError(404,'PRODUCT_NOT_FOUND','Бараа олдсонгүй.');}
 catch{return publicError(503,'SERVICE_UNAVAILABLE','Барааны мэдээллийг түр авах боломжгүй.');}
}
export function OPTIONS(){return new Response(null,{status:204,headers:publicHeaders()});}
