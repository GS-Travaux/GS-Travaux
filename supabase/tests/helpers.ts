/* Outils des tests de la base : PGlite (PostgreSQL embarqué) + faux schéma « auth » de Supabase. */
import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultDroits, defaultProfils } from '../../src/lib/rights';

const MIGRATIONS = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

/** Ce que Supabase fournit et que PGlite n'a pas : schéma auth, rôles anon / authenticated / service_role. */
const FAUX_SUPABASE = `
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_app_meta_data jsonb);
  create function auth.jwt() returns jsonb language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  grant usage on schema auth, public to anon, authenticated, service_role;
  -- comme Supabase : tout est accordé par défaut aux trois rôles (0002_rls.sql doit le retirer)
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
`;

export function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort();
}

export async function createDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(FAUX_SUPABASE);
  for (const f of migrationFiles()) await db.exec(readFileSync(join(MIGRATIONS, f), 'utf8'));
  return db;
}

/* Garde-fou : seed() / raw() remettent le rôle super-utilisateur ; les appeler au milieu d'une session simulée
   ferait passer la suite du test sans RLS (faux positifs). */
let enSession = false;
function horsSession() { if (enSession) throw new Error('raw() / seed() / withRole() appelé à l’intérieur de withRole()'); }

export interface Claims { sub?: string; role?: string; app_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown> }
export type Q = <T = any>(sql: string, params?: unknown[]) => Promise<T[]>;

/** Exécute fn comme le ferait l'API Supabase pour ce jeton : SET ROLE + request.jwt.claims. */
export async function withRole<T>(db: PGlite, role: 'anon' | 'authenticated' | 'service_role', claims: Claims | null, fn: (q: Q) => Promise<T>): Promise<T> {
  horsSession();
  await db.exec('reset role');
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [claims ? JSON.stringify({ role, ...claims }) : '']);
  await db.exec(`set role ${role}`);
  enSession = true;
  try {
    return await fn(async (sql, params) => (await db.query(sql, params as any[])).rows as any[]);
  } finally {
    enSession = false;
    await db.exec('reset role');
    await db.query(`select set_config('request.jwt.claims', '', false)`);
  }
}

/** Jeton d'un utilisateur d'entreprise (app_metadata posé par le serveur). */
export function jeton(userId: string, companyId: string | null, extra: Partial<Claims> = {}): Claims {
  return { sub: userId, app_metadata: companyId ? { company_id: companyId } : {}, user_metadata: {}, ...extra };
}

let compteur = 0;
/** uuid déterministe et lisible : préfixe hexadécimal + compteur. */
export function uuid(prefix = 'a'): string {
  compteur += 1;
  return `${prefix.repeat(8).slice(0, 8)}-0000-4000-8000-${String(compteur).padStart(12, '0')}`;
}

export interface CompanyOpts { suspendu?: boolean; interne?: boolean; echeance?: string | null; essaiFin?: string | null }
export interface Company { id: string; admin: string; commercial: string; comptable: string }

/** Crée une entreprise, ses trois profils par défaut (src/lib/rights.ts) et un utilisateur par profil. */
export async function createCompany(db: PGlite, code: string, o: CompanyOpts = {}): Promise<Company> {
  const id = uuid('c');
  await db.query(
    `insert into public.companies (id, code, nom, suspendu, interne, echeance, essai_fin, notes)
     values ($1, $2, $3, $4, $5, $6::date, $7::date, 'note interne')`,
    [id, code, 'Entreprise ' + code, !!o.suspendu, !!o.interne, o.echeance ?? null, o.essaiFin ?? null]);
  const droits = defaultDroits();
  for (const p of defaultProfils()) {
    await db.query(`insert into public.roles (company_id, id, nom, description, systeme, droits) values ($1, $2, $3, $4, $5, $6::jsonb)`,
      [id, p.id, p.nom, p.description, !!p.systeme, JSON.stringify(droits[p.id] || {})]);
  }
  const c: Company = { id, admin: '', commercial: '', comptable: '' };
  c.admin = await createUser(db, id, 'prf-admin', `admin@${code}.test`);
  c.commercial = await createUser(db, id, 'prf-commercial', `commercial@${code}.test`);
  c.comptable = await createUser(db, id, 'prf-comptable', `comptable@${code}.test`);
  return c;
}

export async function createUser(db: PGlite, companyId: string, profilId: string, email: string, actif = true): Promise<string> {
  const id = uuid('e');
  await db.query(`insert into auth.users (id, email, raw_app_meta_data) values ($1, $2, $3::jsonb)`, [id, email, JSON.stringify({ company_id: companyId })]);
  await db.query(`insert into public.profiles (user_id, company_id, nom, email, profil_id, actif) values ($1, $2, $3, $4, $5, $6)`,
    [id, companyId, email.split('@')[0], email, profilId, actif]);
  return id;
}

/** Insère un enregistrement sans passer par RLS (préparation des jeux de données). */
export async function seed(db: PGlite, companyId: string, collection: string, id: string, data: Record<string, unknown> = {}): Promise<void> {
  horsSession();
  await db.exec('reset role');
  await db.query(`insert into public.records (company_id, collection, id, data) values ($1, $2, $3, $4::jsonb)`,
    [companyId, collection, id, JSON.stringify({ id, ...data })]);
}

/** Lecture sans RLS (vérification de l'état réel de la base). */
export async function raw<T = any>(db: PGlite, sql: string, params: unknown[] = []): Promise<T[]> {
  horsSession();
  await db.exec('reset role');
  return (await db.query(sql, params as any[])).rows as T[];
}

export function jours(n: number): string {
  const d = new Date(Date.now() + n * 86400000);
  return d.toISOString().slice(0, 10);
}
