/* POST /api/owner-login { email, password } → { access_token, refresh_token } (voir api/_lib/ownerLogin.ts). */
import { vercelHandler } from './_lib/http.js';
import { anonClient, realDeps } from './_lib/supabase.js';
import { FailureLimiter, handleOwnerLogin } from './_lib/ownerLogin.js';

const limiter = new FailureLimiter();
export default vercelHandler(req => handleOwnerLogin({
  ...realDeps(), anon: anonClient(process.env), limiter, sleep: ms => new Promise(r => setTimeout(r, ms)),
}, req));
