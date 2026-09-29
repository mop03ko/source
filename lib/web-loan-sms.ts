import {env} from './runtime';
import {sendSms,SmsError} from './sms';

// Claim once before contacting Unitel. Never retry an uncertain provider response.
// Only new intake records with a pending entry are eligible; no historical backfill.
export async function dispatchWebLoanSms(leadId:string){
 const id='sms-'+leadId;
 try{
  const pending=await env.DB.transaction(async tx=>{
   const claimed=await tx.prepare("UPDATE activities SET kind='sms_sending' WHERE id=? AND kind='sms_pending'").bind(id).run();
   if(!claimed.meta.changes)return null;
   const row=await tx.prepare('SELECT phone,note FROM activities WHERE id=?').bind(id).first<{phone:string;note:string}>();
   if(!row)return null;
   const allowed=await tx.prepare("SELECT 1 FROM sms_rules WHERE status='new' AND enabled=1 AND NOT EXISTS(SELECT 1 FROM suppressions WHERE phone=?)").bind(row.phone).first();
   if(!allowed){await tx.prepare("UPDATE activities SET kind='note',note='Автомат SMS алгассан: тохиргоо унтарсан эсвэл холбоо барих хязгаартай.' WHERE id=?").bind(id).run();return null;}
   return row;
  });
  if(!pending)return;
  let note:string;
  try{await sendSms(pending.phone,pending.note);note='Шинэ веб хүсэлтийн автомат SMS-ийг Unitel хүлээн авсан.';}
  catch(error){note='Шинэ веб хүсэлтийн SMS илгээж чадсангүй: '+(error instanceof SmsError?error.message:'Илгээлтийн үр дүн тодорхойгүй. Unitel-ийн түүхийг шалгана уу.');}
  await env.DB.prepare("UPDATE activities SET kind='note',note=? WHERE id=? AND kind='sms_sending'").bind(note,id).run();
 }catch{console.error('Web loan SMS processing failed; inspect pending/sending activity records');}
}
