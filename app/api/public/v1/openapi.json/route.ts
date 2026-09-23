import {authorizePublicApi} from '@/lib/public-api-auth';
import {publicHeaders} from '@/lib/public-products';
export const dynamic='force-dynamic';
const product={type:'object',additionalProperties:false,properties:{
 id:{type:'string'},sku:{type:'string',description:'Persistent ANT-000123 style code per product group. Old CRM-{id} aliases remain accepted for lookup.'},name:{type:'string'},
 ...Object.fromEntries(['brand','category','capacity','color','variant','image_url'].map(k=>[k,{type:['string','null']}])),
 stock:{type:'object',properties:{quantity:{type:'integer',minimum:0},in_stock:{type:'boolean'},scope:{const:'all_warehouses'}}},
 prices:{type:'object',properties:{currency:{const:'MNT'},...Object.fromEntries(['credit','cash'].map(k=>[k,{oneOf:[{type:'null'},{type:'object',properties:{min:{type:'number'},max:{type:'number'}}}]}]))}},
 site:{oneOf:[{type:'null'},{type:'object',properties:{product_id:{type:'string'},product_code:{type:'string'}}}]},
}};
const error={description:'Request failed. Error responses are not cached.',content:{'application/json':{schema:{type:'object',properties:{error:{type:'object',properties:{code:{type:'string'},message:{type:'string'}}}}}}}};
export function GET(req:Request){const denied=authorizePublicApi(req);if(denied)return denied;return Response.json({
 openapi:'3.1.0',info:{title:'AntMall Public Products API',version:'1.2.0',description:'Read-only grouped products and stock. A fixed X-Token is required for all GET/HEAD endpoints, including this specification. IMEI, barcode, supplier, cost and customer data are excluded. Responses are not cached. Stock is not a checkout reservation.'},
 servers:[{url:'https://crm.antmall.mn'}],security:[{XToken:[]}],
 paths:{
  '/api/public/v1/products':{get:{summary:'List active product groups',parameters:[
   {name:'page',in:'query',schema:{type:'integer',minimum:1,maximum:10000,default:1}},
   {name:'limit',in:'query',schema:{type:'integer',minimum:1,maximum:100,default:25}},
   ...['q','brand','category','site_product_id'].map(name=>({name,in:'query',schema:{type:'string'},description:name==='q'?'Literal product-name substring, exact ID, SKU or linked site code':name==='site_product_id'?'Exact enabled and current site product ID':'Exact match'})),
   {name:'in_stock',in:'query',schema:{type:'string',enum:['true','false']},description:'Omit to include zero-stock groups'}
  ],responses:{'200':{description:'Products ordered by ID',content:{'application/json':{schema:{type:'object',properties:{data:{type:'array',items:{$ref:'#/components/schemas/Product'}},pagination:{type:'object',properties:{page:{type:'integer'},limit:{type:'integer'},total:{type:'integer'},total_pages:{type:'integer'},has_more:{type:'boolean'}}},as_of:{type:'string',format:'date-time'}}}}}},'401':error,'400':error,'503':error}}},
  '/api/public/v1/products/{id}':{get:{summary:'Get one group by ID or unified SKU',parameters:[{name:'id',in:'path',required:true,schema:{type:'string',maxLength:200}}],responses:{'200':{description:'Product group',content:{'application/json':{schema:{type:'object',properties:{data:{$ref:'#/components/schemas/Product'},as_of:{type:'string',format:'date-time'}}}}}},'401':error,'400':error,'404':error,'503':error}}},
 },components:{schemas:{Product:product},securitySchemes:{XToken:{type:'apiKey',in:'header',name:'X-Token'}}},
 },{headers:publicHeaders()});}
export function OPTIONS(){return new Response(null,{status:204,headers:publicHeaders()});}
