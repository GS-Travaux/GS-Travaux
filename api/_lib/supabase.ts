/* Clients Supabase côté serveur. La clé service_role contourne toutes les règles RLS : elle ne vit que dans
   les variables d'environnement Vercel (jamais préfixée VITE_, jamais renvoyée au navigateur). */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { HttpError } from './http.js';

export type Env = Record<string, string | undefined>;
export type Admin = SupabaseClient;
export interface Deps {
  admin: Admin;
  env: Env;
  now: () => Date;
  log: (...a: unknown[]) => void;
}

const opts = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
function url(env: Env): string {
  const u = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  if (!u) throw new HttpError(503, 'Serveur non configuré.');
  return u;
}
export function adminClient(env: Env): SupabaseClient {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) throw new HttpError(503, 'Serveur non configuré.');
  return createClient(url(env), env.SUPABASE_SERVICE_ROLE_KEY, opts);
}
/** Client « anon » : sert uniquement à ouvrir la session du propriétaire (signInWithPassword). */
export function anonClient(env: Env): SupabaseClient {
  const key = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
  if (!key) throw new HttpError(503, 'Serveur non configuré.');
  return createClient(url(env), key, opts);
}
export function realDeps(): Deps {
  return { admin: adminClient(process.env), env: process.env, now: () => new Date(), log: (...a) => console.error('[api]', ...a) };
}

/** Utilisateur Supabase correspondant au jeton de la requête, revérifié auprès de Supabase (401 sinon). */
export async function authenticate(admin: Admin, token: string) {
  if (!token) throw new HttpError(401, 'Authentification requise.');
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) throw new HttpError(401, 'Session expirée. Reconnectez-vous.');
  return data.user;
}

/** Lit toutes les lignes (l'API renvoie au plus 1000 lignes par appel). */
export async function selectAll(build: () => any): Promise<any[]> {
  const out: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build().range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data || []));
    if (!data || data.length < 1000) return out;
  }
}
