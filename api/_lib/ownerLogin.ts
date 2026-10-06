/* Connexion du propriétaire de la plateforme. Ses identifiants ne sont pas dans la base : ils sont comparés aux
   variables d'environnement OWNER_EMAIL / OWNER_PASSWORD, puis une session Supabase est ouverte sur un compte
   marqué app_metadata.is_owner (app_metadata n'est modifiable qu'avec la clé service_role ; user_metadata, que
   chaque utilisateur peut modifier lui-même, n'est jamais consulté). */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { HttpError, ok, type ApiRequest, type ApiResponse } from './http.js';
import type { Deps } from './supabase.js';

/** Limitation simple des échecs par adresse IP, en mémoire (au mieux : chaque instance a son compteur). */
export class FailureLimiter {
  private hits = new Map<string, number[]>();
  constructor(readonly max = 5, readonly windowMs = 15 * 60 * 1000, private maxEntries = 5000) {}
  private recent(ip: string, now: number) { return (this.hits.get(ip) || []).filter(t => now - t < this.windowMs); }
  /** Millisecondes restantes avant de pouvoir réessayer (0 = autorisé). */
  blockedMs(ip: string, now: number): number {
    const r = this.recent(ip, now);
    return r.length >= this.max ? r[0] + this.windowMs - now : 0;
  }
  fail(ip: string, now: number) {
    if (this.hits.size >= this.maxEntries && !this.hits.has(ip)) {
      for (const [k, v] of this.hits) if (!v.some(t => now - t < this.windowMs)) this.hits.delete(k);
      if (this.hits.size >= this.maxEntries) this.hits.delete(this.hits.keys().next().value as string);
    }
    this.hits.set(ip, [...this.recent(ip, now), now]);
  }
  reset(ip: string) { this.hits.delete(ip); }
}

/** Comparaison en temps constant, quelle que soit la longueur des deux chaînes. */
export function safeEqual(a: string, b: string): boolean {
  const key = randomBytes(32);
  return timingSafeEqual(createHmac('sha256', key).update(a).digest(), createHmac('sha256', key).update(b).digest());
}

export interface OwnerLoginDeps extends Deps {
  anon: SupabaseClient;
  limiter: FailureLimiter;
  sleep: (ms: number) => Promise<void>;
}
export const FAIL_DELAY_MS = 800;
const GENERIC = 'Identifiants incorrects.';

export function ownerConfig(env: Deps['env']): { email: string; password: string } {
  const email = (env.OWNER_EMAIL || '').trim().toLowerCase(), password = env.OWNER_PASSWORD || '';
  if (!email || password.length < 8) throw new HttpError(503, 'Espace propriétaire non configuré sur le serveur.');
  return { email, password };
}

async function findUserByEmail(deps: Deps, email: string) {
  for (let page = 1; page <= 200; page++) {
    const { data, error } = await deps.admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);
    const u = data.users.find(x => (x.email || '').toLowerCase() === email);
    if (u) return u;
    if (data.users.length < 1000) return null;
  }
  return null;
}

/** Ouvre une session pour le compte propriétaire, en le créant (ou le recréant) si nécessaire. */
async function ownerSession(deps: OwnerLoginDeps, email: string, password: string) {
  const conflict = new HttpError(409, 'L’adresse OWNER_EMAIL est déjà utilisée par un compte d’entreprise : choisissez une adresse réservée au propriétaire.');
  const signIn = () => deps.anon.auth.signInWithPassword({ email, password });
  const isOwner = (u: any) => u?.app_metadata?.is_owner === true && !u?.app_metadata?.company_id;

  let s = await signIn();
  if (!s.error && s.data.session && isOwner(s.data.user)) return s.data.session;

  // Compte absent, ou présent mais non créé par cette fonction (mot de passe différent, marque absente) :
  // on ne « promeut » jamais un compte existant — ses sessions déjà ouvertes deviendraient propriétaires.
  const existing = (!s.error && s.data.user) ? s.data.user : await findUserByEmail(deps, email);
  if (existing) {
    if ((existing.app_metadata as any)?.company_id) throw conflict;
    const del = await deps.admin.auth.admin.deleteUser(existing.id);
    if (del.error) throw new Error('suppression de l’ancien compte propriétaire : ' + del.error.message);
  }
  const created = await deps.admin.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { is_owner: true } });
  if (created.error) throw new Error('création du compte propriétaire : ' + created.error.message);
  s = await signIn();
  if (s.error || !s.data.session || !isOwner(s.data.user)) throw new Error('ouverture de session propriétaire : ' + (s.error?.message || 'session absente'));
  return s.data.session;
}

export async function handleOwnerLogin(deps: OwnerLoginDeps, req: ApiRequest): Promise<ApiResponse> {
  const cfg = ownerConfig(deps.env);
  const now = deps.now().getTime();
  const wait = deps.limiter.blockedMs(req.ip, now);
  if (wait > 0) throw new HttpError(429, 'Trop de tentatives. Réessayez dans quelques minutes.', { 'Retry-After': String(Math.ceil(wait / 1000)) });

  const b = req.body || {};
  const email = typeof b.email === 'string' ? b.email.slice(0, 320).trim().toLowerCase() : '';
  const password = typeof b.password === 'string' ? b.password.slice(0, 1024) : '';
  const emailOk = safeEqual(email, cfg.email), pwdOk = safeEqual(password, cfg.password);   // les deux comparaisons sont toujours faites
  if (!(emailOk && pwdOk)) {
    deps.limiter.fail(req.ip, now);
    await deps.sleep(FAIL_DELAY_MS);
    throw new HttpError(401, GENERIC);
  }
  deps.limiter.reset(req.ip);
  try {
    const session = await ownerSession(deps, cfg.email, cfg.password);
    return ok({ access_token: session.access_token, refresh_token: session.refresh_token });
  } catch (e: any) {
    if (e instanceof HttpError) throw e;
    deps.log('connexion propriétaire :', e?.message || e);
    throw new HttpError(500, 'Connexion impossible pour le moment.');
  }
}
