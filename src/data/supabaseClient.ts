import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || '';
export const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || '';
export const supabaseConfigured = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

let client: SupabaseClient | null = null;
/** Client Supabase du navigateur (clé « anon » : l'accès aux données est limité par les règles RLS). */
export function getSupabase(): SupabaseClient {
  if (!client) {
    if (!supabaseConfigured) throw new Error('Supabase n’est pas configuré (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).');
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  }
  return client;
}

/** Appel d'une fonction serveur Vercel (/api/...) avec le jeton de la session courante. */
export async function callApi<T = any>(path: string, body: unknown): Promise<T> {
  const { data } = await getSupabase().auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  let json: any = null;
  try { json = await res.json(); } catch { /* réponse vide */ }
  if (!res.ok) throw new Error((json && json.error) || `Erreur serveur (${res.status}).`);
  return json as T;
}
