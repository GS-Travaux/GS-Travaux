/* Faux client Supabase en mémoire pour les tests des fonctions serveur (sous-ensemble utilisé par api/_lib). */
import type { Deps } from './supabase.js';

type Row = Record<string, any>;
const UNIQUE: Record<string, string[][]> = {
  companies: [['id'], ['code']], roles: [['company_id', 'id'], ['company_id', 'nom']], profiles: [['user_id']],
  records: [['company_id', 'collection', 'id']], platform_settings: [['id']], license_payments: [['id']],
};
let seq = 0;
export function uuid(): string { seq++; return `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`; }

class Query implements PromiseLike<{ data: any; error: { message: string } | null }> {
  private filters: [string, any][] = [];
  private op: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
  private payload: any; private one: '' | 'single' | 'maybe' = ''; private rng: [number, number] | null = null;
  private sort: [string, boolean] | null = null;
  constructor(private fake: FakeSupabase, private table: string) {}
  select() { return this; }
  insert(p: any) { this.op = 'insert'; this.payload = p; return this; }
  upsert(p: any) { this.op = 'upsert'; this.payload = p; return this; }
  update(p: any) { this.op = 'update'; this.payload = p; return this; }
  delete() { this.op = 'delete'; return this; }
  eq(k: string, v: any) { this.filters.push([k, v]); return this; }
  order(k: string, o?: { ascending?: boolean }) { this.sort = [k, o?.ascending !== false]; return this; }
  range(a: number, b: number) { this.rng = [a, b]; return this; }
  single() { this.one = 'single'; return this; }
  maybeSingle() { this.one = 'maybe'; return this; }
  then<A, B>(res?: ((v: any) => A | PromiseLike<A>) | null, rej?: ((e: any) => B | PromiseLike<B>) | null) { return Promise.resolve(this.exec()).then(res, rej); }

  private exec() {
    const f = this.fake; const rows = (f.tables[this.table] ||= []);
    f.calls.push(`${this.op}:${this.table}`);
    const inj = f.failures.findIndex(x => x.table === this.table && x.op === this.op);
    if (inj >= 0) { const [x] = f.failures.splice(inj, 1); return { data: null, error: { message: x.message } }; }
    const match = (r: Row) => this.filters.every(([k, v]) => r[k] === v);
    const dup = (r: Row, except?: Row) => (UNIQUE[this.table] || []).some(keys => rows.some(o => o !== except && keys.every(k => o[k] === r[k])));
    let out: Row[] = [];
    if (this.op === 'insert' || this.op === 'upsert') {
      const list: Row[] = (Array.isArray(this.payload) ? this.payload : [this.payload]).map(r => ({ ...r }));
      for (const r of list) {
        if (this.table === 'companies' || this.table === 'license_payments') r.id ||= uuid();
        if (this.table === 'companies') Object.assign(r, { suspendu: false, motif_suspension: '', notes: '', created_at: new Date(2026, 0, 1, 0, 0, rows.length).toISOString(), ...r });
        const existing = this.op === 'upsert' ? rows.find(o => (UNIQUE[this.table] || [])[0].every(k => o[k] === r[k])) : undefined;
        if (existing) { Object.assign(existing, r); out.push(existing); continue; }
        if (dup(r)) return { data: null, error: { message: 'duplicate key value violates unique constraint' } };
        if (this.table === 'profiles' && !f.tables.roles.some(o => o.company_id === r.company_id && o.id === r.profil_id)) return { data: null, error: { message: 'violates foreign key constraint' } };
        rows.push(r); out.push(r);
      }
    } else if (this.op === 'update') {
      out = rows.filter(match);
      for (const r of out) { if (dup({ ...r, ...this.payload }, r)) return { data: null, error: { message: 'duplicate key value violates unique constraint' } }; Object.assign(r, this.payload); }
    } else if (this.op === 'delete') {
      out = rows.filter(match);
      f.tables[this.table] = rows.filter(r => !match(r));
      if (this.table === 'companies') for (const c of out) for (const t of ['roles', 'profiles', 'records', 'license_payments']) f.tables[t] = f.tables[t].filter(r => r.company_id !== c.id);
    } else {
      out = rows.filter(match);
      if (this.sort) { const [k, asc] = this.sort; out = [...out].sort((a, b) => (a[k] < b[k] ? -1 : a[k] > b[k] ? 1 : 0) * (asc ? 1 : -1)); }
      if (this.rng) out = out.slice(this.rng[0], this.rng[1] + 1);
    }
    const copy = out.map(r => ({ ...r }));
    if (this.one === 'single') return copy.length === 1 ? { data: copy[0], error: null } : { data: null, error: { message: 'no rows' } };
    if (this.one === 'maybe') return { data: copy[0] || null, error: null };
    return { data: copy, error: null };
  }
}

export interface FakeUser { id: string; email: string; password: string; app_metadata: Row; user_metadata: Row; banned?: boolean }

export class FakeSupabase {
  tables: Record<string, Row[]> = { companies: [], roles: [], profiles: [], records: [], license_payments: [], platform_settings: [{ id: 1, tarif_mensuel: 2000, tarif_annuel: 24000, essai_jours: 14 }] };
  users: FakeUser[] = [];
  tokens = new Map<string, string>();
  calls: string[] = [];
  resets: { email: string; redirectTo?: string }[] = [];
  failures: { table: string; op: string; message: string }[] = [];
  authFailures: Record<string, string> = {};

  /** Fait échouer le prochain appel `op` sur `table`. */
  failNext(table: string, op: string, message = 'boom') { this.failures.push({ table, op, message }); }
  from(table: string) { return new Query(this, table); }

  private pub(u: FakeUser) { return { id: u.id, email: u.email, app_metadata: { ...u.app_metadata }, user_metadata: { ...u.user_metadata } }; }
  private authFail(op: string) { const m = this.authFailures[op]; if (m) { delete this.authFailures[op]; return { message: m }; } return null; }
  private issue(u: FakeUser) { const t = `tok.${u.id}.${Math.random().toString(36).slice(2)}aaaaaaaaaaaa`; this.tokens.set(t, u.id); return t; }

  auth = {
    getUser: async (token: string) => {
      const u = this.users.find(x => x.id === this.tokens.get(token));
      return u ? { data: { user: this.pub(u) }, error: null } : { data: { user: null }, error: { message: 'invalid JWT' } };
    },
    signInWithPassword: async ({ email, password }: { email: string; password: string }) => {
      this.calls.push('auth:signIn');
      const u = this.users.find(x => x.email === email.toLowerCase());
      if (!u || u.password !== password || u.banned) return { data: { user: null, session: null }, error: { message: 'Invalid login credentials' } };
      return { data: { user: this.pub(u), session: { access_token: this.issue(u), refresh_token: 'refresh.' + u.id } }, error: null };
    },
    resetPasswordForEmail: async (email: string, o?: { redirectTo?: string }) => {
      const e = this.authFail('reset'); if (e) return { data: null, error: e };
      this.resets.push({ email, redirectTo: o?.redirectTo }); return { data: {}, error: null };
    },
    admin: {
      createUser: async (a: { email: string; password: string; app_metadata?: Row; user_metadata?: Row }) => {
        this.calls.push('auth:createUser');
        const e = this.authFail('createUser'); if (e) return { data: { user: null }, error: e };
        if (this.users.some(x => x.email === a.email.toLowerCase())) return { data: { user: null }, error: { message: 'A user with this email address has already been registered' } };
        const u: FakeUser = { id: uuid(), email: a.email.toLowerCase(), password: a.password, app_metadata: { ...(a.app_metadata || {}) }, user_metadata: { ...(a.user_metadata || {}) } };
        this.users.push(u); return { data: { user: this.pub(u) }, error: null };
      },
      updateUserById: async (id: string, a: Row) => {
        this.calls.push('auth:updateUser');
        const e = this.authFail('updateUser'); if (e) return { data: { user: null }, error: e };
        const u = this.users.find(x => x.id === id); if (!u) return { data: { user: null }, error: { message: 'User not found' } };
        if (a.password) u.password = a.password;
        if (a.app_metadata) Object.assign(u.app_metadata, a.app_metadata);
        if (a.ban_duration) u.banned = a.ban_duration !== 'none';
        return { data: { user: this.pub(u) }, error: null };
      },
      deleteUser: async (id: string) => {
        this.calls.push('auth:deleteUser');
        const e = this.authFail('deleteUser'); if (e) return { data: null, error: e };
        if (!this.users.some(x => x.id === id)) return { data: null, error: { message: 'User not found' } };
        this.users = this.users.filter(x => x.id !== id);
        this.tables.profiles = this.tables.profiles.filter(p => p.user_id !== id);   // on delete cascade
        return { data: {}, error: null };
      },
      listUsers: async ({ page = 1, perPage = 50 }: { page?: number; perPage?: number } = {}) =>
        ({ data: { users: this.users.slice((page - 1) * perPage, page * perPage).map(u => this.pub(u)) }, error: null }),
    },
  };

  /* ── Aides de préparation ── */
  addCompany(code: string, extra: Row = {}) {
    const c = { id: uuid(), code, nom: 'Société ' + code, contact: 'Contact', email: `contact@${code.toLowerCase()}.example`, telephone: '0500000000', licence: 'Mensuelle', prix: 2000,
      debut: '2026-01-01', essai_fin: null, echeance: '2099-01-01', suspendu: false, motif_suspension: '', interne: false, notes: '', created_at: new Date(2025, 0, 1, 0, 0, this.tables.companies.length).toISOString(), ...extra };
    this.tables.companies.push(c);
    this.tables.roles.push(
      { company_id: c.id, id: 'prf-admin', nom: 'Administrateur', description: '', systeme: true, droits: {} },
      { company_id: c.id, id: 'prf-commercial', nom: 'Commercial', description: '', systeme: false, droits: {} });
    return c;
  }
  /** Crée un compte + sa ligne profiles ; renvoie l'utilisateur et un jeton de session valide. */
  addUser(company: Row | null, email: string, profilId = 'prf-admin', extra: { actif?: boolean; app_metadata?: Row; user_metadata?: Row } = {}) {
    const u: FakeUser = { id: uuid(), email, password: 'Motdepasse1', app_metadata: extra.app_metadata ?? (company ? { company_id: company.id } : {}), user_metadata: extra.user_metadata || {} };
    this.users.push(u);
    if (company) this.tables.profiles.push({ user_id: u.id, company_id: company.id, nom: email.split('@')[0], email, profil_id: profilId, actif: extra.actif !== false });
    return { id: u.id, token: this.issue(u) };
  }
}

export function fakeDeps(fake: FakeSupabase, env: Record<string, string> = {}, now = '2026-10-06T10:00:00Z'): Deps & { logs: unknown[][] } {
  const logs: unknown[][] = [];
  return {
    admin: fake as any, now: () => new Date(now), log: (...a) => { logs.push(a); }, logs,
    env: { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service', SUPABASE_ANON_KEY: 'anon', OWNER_EMAIL: 'Proprio@Exemple.com', OWNER_PASSWORD: 'Tr3s-long-secret', ...env },
  };
}
export const auth = (token: string) => ({ authorization: 'Bearer ' + token, host: 'app.exemple.ma' });
