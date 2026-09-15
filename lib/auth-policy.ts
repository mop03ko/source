export function googleIdentity(provider:unknown,profile:unknown){
 if(provider!=='google'||!profile||typeof profile!=='object')return null;
 const p=profile as Record<string,unknown>;
 if(p.email_verified!==true||typeof p.email!=='string'||typeof p.sub!=='string'||!p.sub||!p.email.includes('@'))return null;
 return {email:p.email.trim().toLowerCase(),userId:'google:'+p.sub};
}
