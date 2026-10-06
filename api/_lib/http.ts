/* Outils communs des fonctions serveur : requête/réponse simplifiées (testables sans Vercel), en-têtes de
   sécurité, POST uniquement, corps JSON limité. Les imports relatifs portent l'extension .js (modules ES sous Node). */
import type { VercelRequest, VercelResponse } from '@vercel/node';

export interface ApiRequest {
  /** En-têtes en minuscules. */
  headers: Record<string, string | undefined>;
  body: any;
  ip: string;
}
export interface ApiResponse { status: number; body: unknown; headers?: Record<string, string> }

export class HttpError extends Error {
  constructor(public status: number, message: string, public headers?: Record<string, string>) { super(message); }
}
export const ok = (body: unknown = { ok: true }): ApiResponse => ({ status: 200, body });

export const MAX_BODY_BYTES = 16 * 1024;
export const SECURITY_HEADERS: Record<string, string> = {
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json; charset=utf-8',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
};

/** Jeton « Authorization: Bearer … » ; chaîne vide s'il est absent ou mal formé. */
export function bearerToken(headers: Record<string, string | undefined>): string {
  const m = /^Bearer\s+([A-Za-z0-9._~+/=-]{20,4096})$/.exec((headers.authorization || '').trim());
  return m ? m[1] : '';
}

/** Adresse de l'application pour les liens envoyés par e-mail : PUBLIC_APP_URL, sinon l'hôte qui a reçu la requête
    (jamais l'en-tête Origin, que l'appelant choisit). */
export function appUrl(env: Record<string, string | undefined>, headers: Record<string, string | undefined>): string {
  const fixed = (env.PUBLIC_APP_URL || '').trim().replace(/\/+$/, '');
  if (/^https?:\/\/[^\s/]+/.test(fixed)) return fixed + '/';
  const host = (headers['x-forwarded-host'] || headers.host || '').split(',')[0].trim();
  if (!/^[A-Za-z0-9.-]+(:\d{1,5})?$/.test(host)) throw new HttpError(500, 'Adresse de l’application inconnue (PUBLIC_APP_URL).');
  return (/^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? 'http://' : 'https://') + host + '/';
}

function first(v: string | string[] | undefined): string | undefined { return Array.isArray(v) ? v[0] : v; }

/** Lit et borne le corps JSON d'une requête (objet attendu). */
export function readBody(raw: unknown, contentLength?: string): Record<string, unknown> {
  if (contentLength && Number(contentLength) > MAX_BODY_BYTES) throw new HttpError(413, 'Requête trop volumineuse.');
  let body = raw;
  if (typeof body === 'string') {
    if (body.length > MAX_BODY_BYTES) throw new HttpError(413, 'Requête trop volumineuse.');
    try { body = JSON.parse(body); } catch { throw new HttpError(400, 'Requête invalide.'); }
  }
  if (!body || typeof body !== 'object' || Array.isArray(body) || Buffer.isBuffer(body)) throw new HttpError(400, 'Requête invalide.');
  if (JSON.stringify(body).length > MAX_BODY_BYTES) throw new HttpError(413, 'Requête trop volumineuse.');
  return body as Record<string, unknown>;
}

/** Transforme une fonction pure (ApiRequest → ApiResponse) en fonction Vercel. */
export function vercelHandler(fn: (req: ApiRequest) => Promise<ApiResponse>) {
  return async (req: VercelRequest, res: VercelResponse): Promise<void> => {
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
    let out: ApiResponse;
    try {
      if (req.method !== 'POST') throw new HttpError(405, 'Méthode non autorisée.', { Allow: 'POST' });
      if (!/^application\/json\b/i.test(first(req.headers['content-type']) || '')) throw new HttpError(415, 'Type de contenu non pris en charge.');
      const headers: Record<string, string | undefined> = {};
      for (const [k, v] of Object.entries(req.headers)) headers[k.toLowerCase()] = first(v);
      let raw: unknown;
      try { raw = req.body; } catch { throw new HttpError(400, 'Requête invalide.'); }   // JSON illisible
      const body = readBody(raw, headers['content-length']);
      const ip = headers['x-real-ip'] || (headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || 'inconnue';
      out = await fn({ headers, body, ip });
    } catch (e: any) {
      if (e instanceof HttpError) out = { status: e.status, body: { error: e.message }, headers: e.headers };
      else { console.error('[api] erreur inattendue :', e); out = { status: 500, body: { error: 'Erreur interne du serveur.' } }; }
    }
    for (const [k, v] of Object.entries(out.headers || {})) res.setHeader(k, v);
    res.status(out.status).send(JSON.stringify(out.body));
  };
}

/** Exécute une fonction pure comme le ferait vercelHandler (erreurs HttpError → réponse) ; utilisé par les tests. */
export async function run(fn: (req: ApiRequest) => Promise<ApiResponse>, req: Partial<ApiRequest>): Promise<ApiResponse> {
  try { return await fn({ headers: {}, body: {}, ip: '203.0.113.1', ...req }); }
  catch (e) { if (e instanceof HttpError) return { status: e.status, body: { error: e.message }, headers: e.headers }; throw e; }
}

/* ── Lecture typée des champs du corps ── */
export function str(v: unknown, max = 200): string { return typeof v === 'string' && v.length <= max ? v.trim() : ''; }
export function reqStr(v: unknown, label: string, max = 200): string {
  const s = str(v, max);
  if (!s) throw new HttpError(400, `Champ obligatoire ou invalide : ${label}.`);
  return s;
}
