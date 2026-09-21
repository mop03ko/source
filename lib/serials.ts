import {z} from 'zod';
import type {DatabaseSession} from './database';
// Нэгжийн танигдах дугаар: сериал (IMEI) эрхэм, байхгүй бол баркод. Хоёулаа хоосон бол бүртгэх утгагүй.
export const unitSchema=z.object({
 serial:z.string().trim().max(120).default(''),
 barcode:z.string().trim().max(120).default(''),
 note:z.string().trim().max(200).default(''),
}).refine(u=>!!(u.serial||u.barcode),{message:'Сериал эсвэл баркод оруулна уу.'});
export const unitsSchema=z.array(unitSchema).max(200).optional();
export type UnitInput=z.infer<typeof unitSchema>;
export const unitSources=['delivery','sale','lead_purchase'] as const;
export type UnitSource=(typeof unitSources)[number];
export type UnitRow={id:string;item_id:string;serial:string;barcode:string;source:string;ref_id:string;lead_id:string|null;customer_phone:string;note:string;actor:string;created_at:string};
// Нэг үйлдлийн (хүргэлт/борлуулалт/зээл) нэгжүүдийг бүртгэнэ. Дахин бүртгэхэд өмнөхийг цэвэрлэж
// бичнэ — маягтыг засахад хуучин мөр хоцрохгүй.
export async function saveUnits(
 db:DatabaseSession,
 ctx:{source:UnitSource;refId:string;itemId:string;leadId?:string|null;customerPhone?:string;actor:string;at:string},
 units:UnitInput[]|undefined,
){
 if(!units)return 0;
 await db.prepare('DELETE FROM inventory_units WHERE source=? AND ref_id=?').bind(ctx.source,ctx.refId).run();
 if(!units.length)return 0;
 await db.batch(units.map(u=>db.prepare(
  'INSERT INTO inventory_units(id,item_id,serial,barcode,source,ref_id,lead_id,customer_phone,note,actor,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)'
 ).bind(crypto.randomUUID(),ctx.itemId,u.serial,u.barcode,ctx.source,ctx.refId,ctx.leadId||null,ctx.customerPhone||'',u.note,ctx.actor,ctx.at)));
 return units.length;
}
// Аль хэдийн гарсан гэж бүртгэгдсэн дугаарууд — буцаалт/солилт бодитоор байдаг тул хориглохгүй, сануулна.
export async function duplicateUnits(db:DatabaseSession,ctx:{source:UnitSource;refId:string},units:UnitInput[]|undefined){
 if(!units?.length)return [] as string[];
 const codes=[...new Set(units.flatMap(u=>[u.serial,u.barcode].filter(Boolean)))];
 if(!codes.length)return [];
 const marks=codes.map(()=>'?').join(',');
 const rows=await db.prepare(
  `SELECT serial,barcode FROM inventory_units WHERE NOT(source=? AND ref_id=?) AND (serial IN (${marks}) OR barcode IN (${marks}))`
 ).bind(ctx.source,ctx.refId,...codes,...codes).all<{serial:string;barcode:string}>();
 const seen=new Set(rows.results.flatMap(r=>[r.serial,r.barcode].filter(Boolean)));
 return codes.filter(c=>seen.has(c));
}
export function duplicateWarning(found:string[]){
 return found.length?`Анхаар: ${found.join(', ')} дугаар өмнө нь гарсан гэж бүртгэгдсэн байна.`:'';
}
