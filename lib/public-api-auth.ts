import {createHash,timingSafeEqual} from 'node:crypto';
import {publicError} from './public-products';

// Fixed integration token. Only its digest is committed; the raw token is private.
const PUBLIC_API_TOKEN_SHA256='7cd37988a771abe15b38222ff4a19c930134fb4e06d4febf2accbbc5fdaa9fbe';

export function authorizePublicApi(req:Request,expectedDigest=PUBLIC_API_TOKEN_SHA256):Response|null{
 const token=req.headers.get('x-token');
 if(!token||token.length>256||!timingSafeEqual(createHash('sha256').update(token).digest(),Buffer.from(expectedDigest,'hex'))){
  return publicError(401,'UNAUTHORIZED','X-Token дутуу эсвэл буруу байна.');
 }
 return null;
}
