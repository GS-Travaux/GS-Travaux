import type { Backend } from './backend';
import { LocalBackend } from './localBackend';
import { SupabaseBackend } from './supabaseBackend';
import { supabaseConfigured } from './supabaseClient';

let backend: Backend | null = null;
/** Supabase si les variables d'environnement sont présentes, sinon mode démo local. */
export function getBackend(): Backend {
  if (!backend) backend = supabaseConfigured ? new SupabaseBackend() : new LocalBackend();
  return backend;
}
export function setBackendForTests(b: Backend | null) { backend = b; }
export * from './backend';
