import {env} from './runtime';
export {soundPresets} from './sound';
const db=()=>env.DB!;
// Цаашид шинэ тохиргоо нэмэхдээ шинэ key/default энд болон app/settings-panel.tsx-д нэмнэ; DB схем өөрчлөгдөхгүй.
export const defaults={notification_sound:'chime',sms_enabled:'on'};
export async function getSettings(){
 const r=await db().prepare('SELECT key,value FROM app_settings').all<{key:string;value:string}>();
 const values=Object.fromEntries(r.results.map(row=>[row.key,row.value]));
 return {...defaults,...values} as typeof defaults;
}
export async function setSetting(key:keyof typeof defaults,value:string){
 await db().prepare('INSERT INTO app_settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').bind(key,value,new Date().toISOString()).run();
}
