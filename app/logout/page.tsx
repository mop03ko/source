import {signOut} from '@/auth';
export default function Logout(){return <main className="auth-page"><section className="auth-card"><h1>Системээс гарах уу?</h1><form action={async()=>{'use server';await signOut({redirectTo:'/login'});}}><button className="auth-button">Гарах</button></form><a href="/">CRM рүү буцах</a></section></main>;}
