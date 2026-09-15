import {auth} from '@/auth';
import {redirect} from 'next/navigation';
export async function getCurrentUser(){
 const session=await auth();
 if(!session?.user?.id || !session.user.email)return null;
 return {userId:session.user.id,email:session.user.email,displayName:session.user.name||session.user.email};
}
export async function requireCurrentUser(){const u=await getCurrentUser();if(!u)redirect('/login');return u;}
