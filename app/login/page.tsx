import {signIn} from '@/auth';
export const dynamic='force-dynamic';
export default async function Login({searchParams}:{searchParams:Promise<{error?:string}>}){
 const {error}=await searchParams;
 const configured=['AUTH_SECRET','AUTH_URL','AUTH_GOOGLE_ID','AUTH_GOOGLE_SECRET','CRM_OWNER_EMAIL','TURSO_DATABASE_URL','TURSO_AUTH_TOKEN'].every(k=>!!process.env[k]);
 return <main className="auth-page"><section className="auth-card"><div className="auth-logo">AntMall<span>.</span></div><p className="auth-kicker">CRM • БАГИЙН АЖЛЫН ОРЧИН</p><h1>Тавтай морил</h1><p>Бүртгэлтэй Google аккаунтаараа нэвтэрнэ үү.</p>
 {error&&<p role="alert" className="auth-error">Нэвтрэх боломжгүй байна. Зөв аккаунт сонгосон эсэх болон ажилтны эрхээ админтай шалгана уу.</p>}
 {!configured?<p role="alert" className="auth-error">Системийн анхны тохиргоо дутуу байна. Админ суулгах зааврын тохиргоог гүйцээнэ үү.</p>:<form action={async()=>{'use server';await signIn('google',{redirectTo:'/'});}}><button className="auth-button" type="submit">Google аккаунтаар нэвтрэх</button></form>}
 <small>Зөвхөн эрх олгосон AntMall ажилтнуудад.</small></section></main>;
}
