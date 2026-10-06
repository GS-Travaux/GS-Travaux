/* POST /api/owner { action, ... } — console du propriétaire de la plateforme (voir api/_lib/owner.ts). */
import { vercelHandler } from './_lib/http.js';
import { realDeps } from './_lib/supabase.js';
import { handleOwner } from './_lib/owner.js';

export default vercelHandler(req => handleOwner(realDeps(), req));
