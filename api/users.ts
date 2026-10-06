/* POST /api/users — gestion des utilisateurs de l'entreprise de l'appelant (voir api/_lib/users.ts). */
import { vercelHandler } from './_lib/http.js';
import { realDeps } from './_lib/supabase.js';
import { handleUsers } from './_lib/users.js';

export default vercelHandler(req => handleUsers(realDeps(), req));
