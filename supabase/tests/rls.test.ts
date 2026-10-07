/* Tests de la sécurité de la base (supabase/migrations) sur un PostgreSQL embarqué (PGlite).
   Chaque requête « utilisateur » est exécutée comme par l'API Supabase : SET ROLE authenticated + jeton simulé. */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { defaultDroits, defaultProfils, droitsDe, RIGHTS_TABS } from '../../src/lib/rights';
import { RECORD_COLLECTIONS } from '../../src/lib/types';
import type { Droit } from '../../src/lib/types';
import { Claims, Company, Q, createCompany, createDb, createUser, jeton, jours, raw, seed, uuid, withRole } from './helpers';

let db: PGlite;
let A: Company, B: Company;                       // deux entreprises actives
let SUSP: Company, EXP: Company, ESSAI_EXP: Company, INTERNE: Company, SANS_DATE: Company;
let desactive: string;                            // utilisateur désactivé de A (profil Administrateur)
let owner: string;                                // propriétaire de la plateforme (aucun profil)

const as = <T>(claims: Claims, fn: (q: Q) => Promise<T>) => withRole(db, 'authenticated', claims, fn);
const user = (c: Company, who: 'admin' | 'commercial' | 'comptable') => jeton(c[who], c.id);
const count = async (q: Q, sql: string, params: unknown[] = []) => Number((await q<{ n: number }>(`select count(*)::int as n from ${sql}`, params))[0].n);
const apply = (q: Q, changes: unknown) => q<{ n: number }>(`select public.apply_changes($1::jsonb) as n`, [JSON.stringify(changes)]);
const up = (collection: string, id: string, data: Record<string, unknown> = {}) => ({ collection, id, op: 'upsert', data: { id, ...data } });
const del = (collection: string, id: string) => ({ collection, id, op: 'delete', data: null });
const existe = async (c: Company, collection: string, id: string) =>
  (await raw(db, `select 1 from public.records where company_id = $1 and collection = $2 and id = $3`, [c.id, collection, id])).length === 1;

const TABLES = ['companies', 'license_payments', 'platform_settings', 'roles', 'profiles', 'records'];

beforeAll(async () => {
  db = await createDb();
  A = await createCompany(db, 'ALPHA', { echeance: jours(30) });
  B = await createCompany(db, 'BETA', { essaiFin: jours(10) });
  SUSP = await createCompany(db, 'SUSP', { echeance: jours(30), suspendu: true });
  EXP = await createCompany(db, 'EXPIREE', { echeance: jours(-5), essaiFin: jours(30) });
  ESSAI_EXP = await createCompany(db, 'ESSAIEXP', { essaiFin: jours(-5) });
  INTERNE = await createCompany(db, 'INTERNE', { interne: true, echeance: jours(-400), essaiFin: jours(-500) });
  SANS_DATE = await createCompany(db, 'SANSDATE', {});
  desactive = await createUser(db, A.id, 'prf-admin', 'ancien@ALPHA.test', false);
  owner = uuid('f');
  await raw(db, `insert into auth.users (id, email, raw_app_meta_data) values ($1, 'editeur@gs.test', '{"is_owner": true}')`, [owner]);
  for (const c of [A, B, SUSP, EXP, ESSAI_EXP, INTERNE, SANS_DATE]) {
    await raw(db, `insert into public.license_payments (company_id, date, montant, du, au) values ($1, current_date, 2000, current_date, current_date + 30)`, [c.id]);
    await seed(db, c.id, 'societe', 'main', { nom: 'Société ' + c.id.slice(-2) });
    await seed(db, c.id, 'devis', 'DEV-1', { client: 'Client 1', montant: 100 });
    await seed(db, c.id, 'clients', 'CLI-1', { nom: 'Client 1' });
    await seed(db, c.id, 'bulletins', 'BUL-1', { net: 5000 });
    await seed(db, c.id, 'achats', 'ACH-1', { type: 'consommable' });
    await seed(db, c.id, 'achats', 'ACH-2', { type: 'autre' });
    await seed(db, c.id, 'immobilisations', 'IMM-1', { categorie: 'materiel' });
    await seed(db, c.id, 'immobilisations', 'IMM-2', { categorie: 'transport' });
    await seed(db, c.id, 'collaborateurs', 'SAL-1', { nom: 'Salarié 1' });
  }
});
afterAll(async () => { await db?.close(); });

/* ───────────────────────────── Structure ───────────────────────────── */
describe('structure', () => {
  it('RLS activée et forcée sur toutes les tables de public', async () => {
    const rows = await raw<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(db,
      `select c.relname, c.relrowsecurity, c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' order by 1`);
    expect(rows.map(r => r.relname).sort()).toEqual([...TABLES].sort());
    for (const r of rows) expect(r, r.relname).toMatchObject({ relrowsecurity: true, relforcerowsecurity: true });
  });

  it('privilèges : rien pour anon, le strict nécessaire pour authenticated', async () => {
    const rows = await raw<{ grantee: string; t: string; p: string }>(db,
      `select grantee, table_name as t, privilege_type as p from information_schema.table_privileges
       where table_schema = 'public' and grantee in ('anon', 'authenticated', 'PUBLIC')`);
    expect(rows.filter(r => r.grantee !== 'authenticated')).toEqual([]);
    const got = rows.map(r => `${r.t}:${r.p}`).sort();
    expect(got).toEqual([...TABLES.filter(t => t !== 'companies').map(t => `${t}:SELECT`), 'roles:INSERT', 'roles:DELETE', 'records:DELETE'].sort());
    // companies : lecture limitée à des colonnes — jamais le tarif, le contact ni les notes internes de l'éditeur
    const sel = await raw<{ c: string }>(db,
      `select column_name as c from information_schema.column_privileges where table_schema = 'public' and table_name = 'companies' and grantee = 'authenticated' and privilege_type = 'SELECT'`);
    expect(sel.map(r => r.c).sort()).toEqual(['code', 'created_at', 'debut', 'echeance', 'essai_fin', 'id', 'interne', 'licence', 'motif_suspension', 'nom', 'suspendu']);
    const cols = await raw<{ t: string; c: string; p: string }>(db,
      `select table_name as t, column_name as c, privilege_type as p from information_schema.column_privileges
       where table_schema = 'public' and grantee = 'authenticated' and privilege_type in ('INSERT', 'UPDATE')`);
    expect(cols.filter(c => c.p === 'UPDATE').map(c => `${c.t}.${c.c}`).sort()).toEqual(['records.data', 'roles.description', 'roles.droits', 'roles.nom']);
    expect(cols.filter(c => c.p === 'INSERT' && c.t === 'records').map(c => c.c).sort()).toEqual(['collection', 'company_id', 'data', 'id']);
  });

  it('fonctions : search_path fixé, aucune exécutable par anon ni PUBLIC', async () => {
    const rows = await raw<{ proname: string; proconfig: string[] | null; anon: boolean; pub: boolean; auth: boolean }>(db,
      `select p.proname, p.proconfig, has_function_privilege('anon', p.oid, 'execute') as anon,
              has_function_privilege('authenticated', p.oid, 'execute') as auth,
              exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0) as pub
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'`);
    expect(rows.length).toBeGreaterThan(10);
    for (const r of rows) {
      expect(r.proconfig?.some(c => c.startsWith('search_path=')), r.proname + ' search_path').toBe(true);
      expect(r.anon, r.proname + ' anon').toBe(false);
      expect(r.pub, r.proname + ' PUBLIC').toBe(false);
    }
    const nonAccordees = rows.filter(r => !r.auth).map(r => r.proname).sort();
    expect(nonAccordees).toEqual(['company_active', 'records_before_write', 'roles_before_update']);
  });

  it('0002_rls.sql est ré-exécutable sans erreur ni changement de privilèges', async () => {
    const avant = await raw(db, `select grantee, table_name, privilege_type from information_schema.table_privileges where table_schema = 'public' order by 1, 2, 3`);
    const pol = await raw(db, `select count(*)::int as n from pg_policies where schemaname = 'public'`);
    await db.exec(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations', '0002_rls.sql'), 'utf8'));
    expect(await raw(db, `select grantee, table_name, privilege_type from information_schema.table_privileges where table_schema = 'public' order by 1, 2, 3`)).toEqual(avant);
    expect(await raw(db, `select count(*)::int as n from pg_policies where schemaname = 'public'`)).toEqual(pol);
    expect(pol[0].n).toBe(12);
  });

  it('la liste des collections de la base correspond à RECORD_COLLECTIONS (+ societe)', async () => {
    for (const c of [...RECORD_COLLECTIONS, 'societe']) {
      const data = c === 'immobilisations' ? { categorie: 'materiel' } : c === 'achats' ? { type: 'autre' } : {};
      const id = c === 'societe' ? 'main' : 'COL-' + c;
      await as(user(A, 'admin'), q => apply(q, [up(c, id, data)]));
      expect(await existe(A, c, id), c).toBe(true);
      const tabs = await raw<{ t: string[] }>(db, `select public.collection_tabs($1, $2::jsonb, 'modifier') as t`, [c, JSON.stringify(data)]);
      expect(tabs[0].t.length, c).toBeGreaterThan(0);
      for (const t of tabs[0].t) expect(RIGHTS_TABS.map(x => x.key)).toContain(t);
    }
    await expect(raw(db, `insert into public.records (company_id, collection, id, data) values ($1, 'inconnue', 'x', '{}')`, [A.id])).rejects.toThrow();
    await expect(raw(db, `insert into public.records (company_id, collection, id, data) values ($1, 'societe', 'autre', '{}')`, [A.id])).rejects.toThrow();
  });
});

/* ───────────────────────────── Fonctions d'identité et de licence ───────────────────────────── */
describe('identité (JWT) et licence', () => {
  it('jwt_company_id / jwt_is_owner ne lisent que app_metadata', async () => {
    const r = async (claims: Claims) => (await as(claims, q => q(`select public.jwt_company_id() as c, public.jwt_is_owner() as o`)))[0];
    expect(await r(user(A, 'admin'))).toEqual({ c: A.id, o: false });
    expect(await r({ sub: A.admin, app_metadata: {}, user_metadata: { company_id: A.id, is_owner: true } })).toEqual({ c: null, o: false });
    expect(await r({ sub: A.admin, app_metadata: { company_id: 'pas-un-uuid', is_owner: 'true' } })).toEqual({ c: null, o: false });
    expect(await r({ sub: A.admin, app_metadata: { company_id: 42, is_owner: 1 } })).toEqual({ c: null, o: false });
    expect(await r({ sub: owner, app_metadata: { is_owner: true } })).toEqual({ c: null, o: true });
    expect(await r({ app_metadata: { is_owner: true, company_id: A.id } })).toEqual({ c: A.id, o: false });   // pas de sub
  });

  it('company_active suit la règle de src/lib/licence.ts', async () => {
    const actif = async (c: Company) => (await raw<{ a: boolean }>(db, `select public.company_active($1) as a`, [c.id]))[0].a;
    expect(await actif(A)).toBe(true);
    expect(await actif(B)).toBe(true);
    expect(await actif(SUSP)).toBe(false);
    expect(await actif(EXP)).toBe(false);            // échéance dépassée : l'essai encore valide ne compte plus
    expect(await actif(ESSAI_EXP)).toBe(false);
    expect(await actif(INTERNE)).toBe(true);
    expect(await actif(SANS_DATE)).toBe(false);      // ni échéance ni essai
    expect((await raw<{ a: boolean }>(db, `select public.company_active($1) as a`, [uuid('d')]))[0].a).toBe(false);
    // bornes : le jour de l'échéance est encore actif, le lendemain non
    const c = await createCompany(db, 'BORNE', {});
    await raw(db, `update public.companies set echeance = current_date where id = $1`, [c.id]);
    expect(await actif(c)).toBe(true);
    await raw(db, `update public.companies set echeance = current_date - 1 where id = $1`, [c.id]);
    expect(await actif(c)).toBe(false);
    await raw(db, `update public.companies set echeance = null, essai_fin = current_date where id = $1`, [c.id]);
    expect(await actif(c)).toBe(true);
    await raw(db, `update public.companies set interne = true, suspendu = true where id = $1`, [c.id]);
    expect(await actif(c)).toBe(false);              // la suspension l'emporte, même pour une entreprise interne
  });

  it('my_profile / my_role / is_company_admin', async () => {
    const r = (claims: Claims, cid: string) => as(claims, async q => (await q(
      `select (public.my_profile()).user_id as u, (public.my_role($1)).id as r, public.is_company_admin($1) as adm`, [cid]))[0]);
    expect(await r(user(A, 'admin'), A.id)).toEqual({ u: A.admin, r: 'prf-admin', adm: true });
    expect(await r(user(A, 'commercial'), A.id)).toEqual({ u: A.commercial, r: 'prf-commercial', adm: false });
    expect(await r(user(A, 'admin'), B.id)).toEqual({ u: A.admin, r: null, adm: false });
    expect(await r(jeton(A.admin, B.id), B.id)).toEqual({ u: null, r: null, adm: false });        // jeton d'une autre entreprise
    expect(await r(jeton(desactive, A.id), A.id)).toEqual({ u: null, r: null, adm: false });
    expect(await r(user(SUSP, 'admin'), SUSP.id)).toEqual({ u: SUSP.admin, r: 'prf-admin', adm: false });
  });
});

/* ───────────────────────────── Isolation entre entreprises ───────────────────────────── */
describe('isolation entre entreprises', () => {
  it('lecture : un administrateur ne voit que son entreprise, dans toutes les tables', async () => {
    await as(user(A, 'admin'), async q => {
      for (const t of ['records', 'profiles', 'roles']) {
        expect(await count(q, `public.${t}`), t).toBeGreaterThan(0);
        expect(await count(q, `public.${t} where company_id <> $1`, [A.id]), t).toBe(0);
        expect(await count(q, `public.${t} where company_id = $1`, [B.id]), t).toBe(0);
      }
      expect((await q(`select id from public.companies`)).map(r => r.id)).toEqual([A.id]);
      expect(await count(q, `public.license_payments`)).toBe(0);
      expect(await count(q, `public.platform_settings`)).toBe(0);
    });
  });

  it("insertion : impossible dans une autre entreprise, même en forgeant company_id", async () => {
    await as(user(A, 'admin'), async q => {
      await expect(q(`insert into public.records (company_id, collection, id, data) values ($1, 'devis', 'PIRATE', '{}')`, [B.id]))
        .rejects.toThrow(/row-level security/);
      // company_id forgé dans data : ignoré, la ligne va dans l'entreprise du jeton
      await q(`insert into public.records (company_id, collection, id, data) values ($1, 'devis', 'FORGE-1', $2::jsonb)`,
        [A.id, JSON.stringify({ id: 'FORGE-1', company_id: B.id })]);
    });
    expect(await existe(B, 'devis', 'PIRATE')).toBe(false);
    expect(await existe(B, 'devis', 'FORGE-1')).toBe(false);
    expect(await existe(A, 'devis', 'FORGE-1')).toBe(true);
  });

  it('mise à jour et suppression : sans effet sur une autre entreprise', async () => {
    await as(user(A, 'admin'), async q => {
      expect(await q(`update public.records set data = '{"pirate":true}' where company_id = $1 returning id`, [B.id])).toEqual([]);
      expect(await q(`update public.records set data = '{"pirate":true}' where id = 'DEV-1' and company_id <> $1 returning id`, [A.id])).toEqual([]);
      expect(await q(`delete from public.records where company_id = $1 returning id`, [B.id])).toEqual([]);
      expect(await q(`delete from public.roles where company_id = $1 returning id`, [B.id])).toEqual([]);
      expect(await q(`update public.roles set droits = '{}' where company_id = $1 returning id`, [B.id])).toEqual([]);
      await expect(q(`insert into public.roles (company_id, id, nom) values ($1, 'prf-pirate', 'Pirate')`, [B.id])).rejects.toThrow(/row-level security/);
    });
    const d = await raw(db, `select data from public.records where company_id = $1 and collection = 'devis' and id = 'DEV-1'`, [B.id]);
    expect(d[0].data).toMatchObject({ client: 'Client 1' });
    expect((await raw(db, `select 1 from public.roles where company_id = $1`, [B.id])).length).toBe(3);
  });

  it("déplacer une ligne vers une autre entreprise est impossible", async () => {
    await as(user(A, 'admin'), async q => {
      await expect(q(`update public.records set company_id = $1 where collection = 'devis' and id = 'DEV-1'`, [B.id])).rejects.toThrow(/permission denied/);
      await expect(q(`update public.records set id = 'DEV-X' where collection = 'devis' and id = 'DEV-1'`)).rejects.toThrow(/permission denied/);
      await expect(q(`update public.records set collection = 'clients' where collection = 'devis' and id = 'DEV-1'`)).rejects.toThrow(/permission denied/);
    });
    // même le serveur (service_role) ne peut pas changer la clé d'une ligne : le déclencheur l'interdit
    await withRole(db, 'service_role', null, async q => {
      await expect(q(`update public.records set company_id = $1 where company_id = $2 and collection = 'clients' and id = 'CLI-1'`, [B.id, SANS_DATE.id]))
        .rejects.toThrow(/ne peuvent pas être changés/);
    });
  });

  it('apply_changes écrit toujours dans l’entreprise du jeton', async () => {
    await as(user(A, 'admin'), q => apply(q, [
      { collection: 'devis', id: 'RPC-1', op: 'upsert', data: { id: 'RPC-1', company_id: B.id }, company_id: B.id },
      up('devis', 'DEV-1', { client: 'Modifié par A' }),          // DEV-1 existe aussi chez B : seule la ligne de A change
      del('clients', 'CLI-1'),
    ]));
    expect(await existe(A, 'devis', 'RPC-1')).toBe(true);
    expect(await existe(B, 'devis', 'RPC-1')).toBe(false);
    expect(await existe(A, 'clients', 'CLI-1')).toBe(false);
    expect(await existe(B, 'clients', 'CLI-1')).toBe(true);
    const d = await raw(db, `select company_id, data ->> 'client' as c from public.records where collection = 'devis' and id = 'DEV-1' and company_id in ($1, $2)`, [A.id, B.id]);
    expect(d.find(r => r.company_id === A.id).c).toBe('Modifié par A');
    expect(d.find(r => r.company_id === B.id).c).toBe('Client 1');
  });

  it("un jeton portant l'entreprise d'un autre (company_id forgé) n'ouvre rien", async () => {
    const forge = jeton(A.admin, B.id);               // compte de A, jeton prétendant appartenir à B
    await as(forge, async q => {
      for (const t of TABLES) expect(await count(q, `public.${t}`), t).toBe(0);
      await expect(q(`insert into public.records (company_id, collection, id, data) values ($1, 'devis', 'FORGE-2', '{}')`, [B.id])).rejects.toThrow(/row-level security/);
      await expect(q(`insert into public.records (company_id, collection, id, data) values ($1, 'devis', 'FORGE-2', '{}')`, [A.id])).rejects.toThrow(/row-level security/);
      await expect(apply(q, [up('devis', 'FORGE-2')])).rejects.toThrow(/Droit manquant/);
      expect((await q(`select public.can_access($1, 'devis', '{}', 'voir') as a, public.can_access($2, 'devis', '{}', 'voir') as b`, [A.id, B.id]))[0]).toEqual({ a: false, b: false });
    });
    // company_id dans user_metadata (modifiable par l'utilisateur) : ignoré
    await as({ sub: A.admin, app_metadata: {}, user_metadata: { company_id: A.id } }, async q => {
      for (const t of TABLES) expect(await count(q, `public.${t}`), t).toBe(0);
      await expect(apply(q, [up('devis', 'FORGE-3')])).rejects.toThrow(/Droit manquant/);
    });
    // utilisateur inconnu de la base avec un jeton d'entreprise valide
    await as(jeton(uuid('d'), A.id), async q => {
      for (const t of TABLES) expect(await count(q, `public.${t}`), t).toBe(0);
    });
    expect(await existe(A, 'devis', 'FORGE-2')).toBe(false);
    expect(await existe(B, 'devis', 'FORGE-2')).toBe(false);
  });

  it("can_access refuse toute autre entreprise que celle du jeton", async () => {
    await as(user(A, 'admin'), async q => {
      expect((await q(`select public.can_access($1, 'devis', '{}', 'voir') as a, public.can_access($2, 'devis', '{}', 'voir') as b,
                              public.can_access(null, 'devis', '{}', 'voir') as n`, [A.id, B.id]))[0]).toEqual({ a: true, b: false, n: false });
    });
  });
});

/* ───────────────────────────── Matrice de droits ───────────────────────────── */
describe('droits par profil', () => {
  /* Table de référence, recopiée de l'énoncé du modèle (indépendante du SQL). */
  const ECRITURE: Record<string, string[]> = {
    devis: ['devis', 'commandes', 'facturation'], demandesArticles: ['devis_articles'], clients: ['tiers_client'],
    fournisseurs: ['tiers_fournisseur'], 'immobilisations/materiel': ['immo_materiel'], 'immobilisations/transport': ['immo_transport'],
    'immobilisations/inconnu': [], 'achats/consommable': ['achat_consommable'], 'achats/autre': ['achat_autre'], 'achats/inconnu': [],
    impots: ['impots'], collaborateurs: ['collab_salaries'], pointages: ['collab_pointage'], conges: ['collab_conges'],
    bulletins: ['collab_paie'], bordereauxCnss: ['collab_cnss'], bordereauxCimr: ['collab_cimr'], ordresMission: ['mission'],
    societe: ['societe'], inconnue: [],
  };
  const LECTURE_EN_PLUS: Record<string, string[]> = {
    devis: ['devis_articles', 'mission'], clients: ['devis', 'commandes', 'facturation', 'mission'],
    fournisseurs: ['achat_consommable', 'achat_autre', 'immo_materiel', 'immo_transport'],
    collaborateurs: ['collab_pointage', 'collab_conges', 'collab_paie', 'collab_cnss', 'collab_cimr', 'mission'],
    pointages: ['collab_paie', 'collab_cnss'], conges: ['collab_paie'], bulletins: ['collab_cnss', 'collab_cimr'],
    ordresMission: ['devis'], demandesArticles: ['devis'],
  };
  const variante = (k: string) => {
    const [collection, v] = k.split('/');
    const data = collection === 'immobilisations' ? { categorie: v } : collection === 'achats' ? { type: v } : {};
    return { collection, data };
  };
  const DROITS = ['voir', 'modifier', 'supprimer'] as const;

  it('can_access est équivalent à droitsDe() pour chaque profil, collection et droit', async () => {
    // un 4e profil « piégé » : modifier / supprimer sans voir (donc sans effet), et des onglets isolés
    const droitsPieges = {
      devis: { voir: false, modifier: true, supprimer: true }, mission: { voir: true, modifier: false, supprimer: true },
      collab_cnss: { voir: true, modifier: false, supprimer: false }, immo_transport: { voir: true, modifier: true, supprimer: false },
      achat_autre: { voir: true, modifier: false, supprimer: false }, societe: { voir: true, modifier: true, supprimer: false },
    };
    await raw(db, `insert into public.roles (company_id, id, nom, droits) values ($1, 'prf-piege', 'Piégé', $2::jsonb)`, [A.id, JSON.stringify(droitsPieges)]);
    const piege = await createUser(db, A.id, 'prf-piege', 'piege@ALPHA.test');
    await raw(db, `insert into public.roles (company_id, id, nom, droits) values ($1, 'prf-vide', 'Vide', '{}')`, [A.id]);
    const vide = await createUser(db, A.id, 'prf-vide', 'vide@ALPHA.test');

    const profils = [...defaultProfils(), { id: 'prf-piege', nom: 'Piégé', description: '' }, { id: 'prf-vide', nom: 'Vide', description: '' }];
    const droits = { ...defaultDroits(), 'prf-piege': droitsPieges, 'prf-vide': {} };
    const comptes: [string, string][] = [['Administrateur', A.admin], ['Commercial', A.commercial], ['Comptable', A.comptable], ['Piégé', piege], ['Vide', vide]];
    let verifies = 0;
    for (const [profilNom, uid] of comptes) {
      const systeme = profilNom === 'Administrateur';
      for (const k of Object.keys(ECRITURE)) {
        const { collection, data } = variante(k);
        const got = (await as(jeton(uid, A.id), q => q(
          `select public.can_access($1, $2, $3::jsonb, 'voir') as voir, public.can_access($1, $2, $3::jsonb, 'modifier') as modifier,
                  public.can_access($1, $2, $3::jsonb, 'supprimer') as supprimer, public.can_access($1, $2, $3::jsonb, 'tout') as invalide`,
          [A.id, collection, JSON.stringify(data)])))[0];
        for (const droit of DROITS) {
          const onglets = droit === 'voir' ? [...ECRITURE[k], ...(LECTURE_EN_PLUS[collection] || [])] : ECRITURE[k];
          const attendu = systeme
            || (droit === 'voir' && collection === 'societe')
            || onglets.some(t => (droitsDe(profils, droits, profilNom, t) as Droit)[droit]);
          expect(got[droit], `${profilNom} / ${k} / ${droit}`).toBe(attendu);
          verifies += 1;
        }
        expect(got.invalide, `${profilNom} / ${k} / droit inconnu`).toBe(false);
      }
    }
    expect(verifies).toBe(5 * 20 * 3);
  });

  it('Commercial : écrit les devis, ne lit ni bulletins ni achats', async () => {
    await seed(db, A.id, 'fournisseurs', 'FOU-1', { nom: 'Fournisseur 1' });
    await as(user(A, 'commercial'), async q => {
      await apply(q, [up('devis', 'COM-1', { client: 'X' }), up('clients', 'COM-CLI', { nom: 'X' }), up('ordresMission', 'COM-OM'), up('demandesArticles', 'COM-DA')]);
      expect(await count(q, `public.records where collection = 'devis'`)).toBeGreaterThan(0);
      expect(await count(q, `public.records where collection in ('bulletins', 'achats', 'immobilisations', 'impots', 'pointages', 'conges', 'bordereauxCnss', 'bordereauxCimr')`)).toBe(0);
      expect(await count(q, `public.records where collection = 'collaborateurs'`)).toBeGreaterThan(0);   // via l'onglet Ordre de mission
      expect(await count(q, `public.records where collection = 'fournisseurs' and id = 'FOU-1'`)).toBe(1);                // tiers_fournisseur : voir
      await expect(apply(q, [up('bulletins', 'COM-BUL')])).rejects.toThrow(/Droit manquant/);
      await expect(apply(q, [up('achats', 'COM-ACH', { type: 'consommable' })])).rejects.toThrow(/Droit manquant/);
      await expect(apply(q, [up('collaborateurs', 'SAL-1', { nom: 'Pirate' })])).rejects.toThrow(/Droit manquant/);   // lisible mais pas modifiable
      await expect(apply(q, [up('fournisseurs', 'COM-FOU')])).rejects.toThrow(/Droit manquant/);
      await expect(apply(q, [del('devis', 'COM-1')])).rejects.toThrow(/Droit manquant/);                // modifier sans supprimer
      await expect(q(`insert into public.records (company_id, collection, id, data) values ($1, 'bulletins', 'COM-BUL', '{}')`, [A.id])).rejects.toThrow(/row-level security/);
      expect(await q(`delete from public.records where collection = 'devis' and id = 'COM-1' returning id`)).toEqual([]);
      expect(await q(`update public.records set data = '{"nom":"Pirate"}' where collection = 'collaborateurs' returning id`)).toEqual([]);
    });
    expect(await existe(A, 'devis', 'COM-1')).toBe(true);
    expect(await existe(A, 'bulletins', 'COM-BUL')).toBe(false);
    expect((await raw(db, `select data ->> 'nom' as n from public.records where company_id = $1 and collection = 'collaborateurs' and id = 'SAL-1'`, [A.id]))[0].n).toBe('Salarié 1');
  });

  it('Comptable : écrit la facturation donc les devis, lit les clients, n’écrit pas les demandes d’articles', async () => {
    await seed(db, A.id, 'demandesArticles', 'DA-1', { article: 'Tôle' });
    await as(user(A, 'comptable'), async q => {
      await apply(q, [up('devis', 'DEV-1', { statut: 'Facturé' }), up('devis', 'CPT-DEV'), del('devis', 'CPT-DEV'), up('bulletins', 'CPT-BUL'), up('fournisseurs', 'CPT-FOU')]);
      expect(await count(q, `public.records where collection = 'clients'`)).toBeGreaterThan(0);
      expect(await count(q, `public.records where collection = 'demandesArticles'`)).toBe(0);            // ni devis ni devis_articles visibles
      expect(await count(q, `public.records where collection = 'ordresMission'`)).toBe(0);
      await expect(apply(q, [up('demandesArticles', 'DA-1', { article: 'Pirate' })])).rejects.toThrow(/Droit manquant/);
      await expect(apply(q, [up('demandesArticles', 'CPT-DA')])).rejects.toThrow(/Droit manquant/);
      await expect(apply(q, [del('demandesArticles', 'DA-1')])).rejects.toThrow(/Droit manquant/);
      await expect(apply(q, [up('clients', 'CLI-NEW')])).rejects.toThrow(/Droit manquant/);              // tiers_client : voir seulement
      await expect(apply(q, [up('collaborateurs', 'SAL-1', { nom: 'Pirate' })])).rejects.toThrow(/Droit manquant/);
      await expect(apply(q, [del('fournisseurs', 'CPT-FOU')])).rejects.toThrow(/Droit manquant/);        // tiers_fournisseur : modifier sans supprimer
    });
    expect(await existe(A, 'devis', 'CPT-DEV')).toBe(false);
    expect(await existe(A, 'bulletins', 'CPT-BUL')).toBe(true);
    expect((await raw(db, `select data ->> 'article' as a from public.records where company_id = $1 and collection = 'demandesArticles' and id = 'DA-1'`, [A.id]))[0].a).toBe('Tôle');
  });

  it('immobilisations et achats : droits selon la catégorie / le type', async () => {
    await raw(db, `insert into public.roles (company_id, id, nom, droits) values ($1, 'prf-atelier', 'Atelier', $2::jsonb)`, [B.id, JSON.stringify({
      immo_materiel: { voir: true, modifier: true, supprimer: true }, achat_consommable: { voir: true, modifier: false, supprimer: false },
    })]);
    const atelier = await createUser(db, B.id, 'prf-atelier', 'atelier@BETA.test');
    await seed(db, B.id, 'immobilisations', 'IMM-9', { categorie: 'camion' });       // catégorie inconnue
    await as(jeton(atelier, B.id), async q => {
      expect((await q(`select id from public.records where collection = 'immobilisations' order by id`)).map(r => r.id)).toEqual(['IMM-1']);
      expect((await q(`select id from public.records where collection = 'achats' order by id`)).map(r => r.id)).toEqual(['ACH-1']);
      await apply(q, [up('immobilisations', 'IMM-NEW', { categorie: 'materiel' }), up('immobilisations', 'IMM-1', { categorie: 'materiel', nom: 'Poste à souder' })]);
      await expect(apply(q, [up('immobilisations', 'IMM-T', { categorie: 'transport' })])).rejects.toThrow(/Droit manquant/);
      await expect(apply(q, [up('immobilisations', 'IMM-S')])).rejects.toThrow(/Droit manquant/);                       // sans catégorie
      await expect(apply(q, [up('immobilisations', 'IMM-K', { categorie: 'camion' })])).rejects.toThrow(/Droit manquant/);
      // changer de catégorie exige le droit sur les deux onglets, dans les deux sens
      await expect(apply(q, [up('immobilisations', 'IMM-1', { categorie: 'transport' })])).rejects.toThrow(/Droit manquant/);
      await expect(apply(q, [up('immobilisations', 'IMM-2', { categorie: 'materiel' })])).rejects.toThrow(/Droit manquant/);
      await expect(q(`update public.records set data = '{"categorie":"transport"}' where collection = 'immobilisations' and id = 'IMM-1'`)).rejects.toThrow(/row-level security/);
      expect(await q(`update public.records set data = '{"categorie":"materiel"}' where collection = 'immobilisations' and id = 'IMM-2' returning id`)).toEqual([]);
      // suppression : selon la catégorie de la ligne existante, pas selon ce que prétend le client
      await expect(apply(q, [del('immobilisations', 'IMM-2')])).rejects.toThrow(/Droit manquant/);
      await expect(apply(q, [del('immobilisations', 'IMM-9')])).rejects.toThrow(/Droit manquant/);
      await apply(q, [del('immobilisations', 'IMM-NEW'), del('immobilisations', 'INEXISTANT')]);
      await expect(apply(q, [up('achats', 'ACH-1', { type: 'consommable', montant: 1 })])).rejects.toThrow(/Droit manquant/);   // voir seulement
      await expect(apply(q, [del('achats', 'INEXISTANT')])).rejects.toThrow(/Droit manquant/);
    });
    expect(await existe(B, 'immobilisations', 'IMM-NEW')).toBe(false);
    expect(await existe(B, 'immobilisations', 'IMM-2')).toBe(true);
    expect(await existe(B, 'immobilisations', 'IMM-9')).toBe(true);
    const r = await raw(db, `select id, data ->> 'categorie' as c from public.records where company_id = $1 and collection = 'immobilisations' order by id`, [B.id]);
    expect(r).toEqual([{ id: 'IMM-1', c: 'materiel' }, { id: 'IMM-2', c: 'transport' }, { id: 'IMM-9', c: 'camion' }]);
    // le profil système voit et corrige même une catégorie inconnue
    await as(user(B, 'admin'), async q => {
      expect(await count(q, `public.records where collection = 'immobilisations'`)).toBe(3);
      await apply(q, [up('immobilisations', 'IMM-9', { categorie: 'transport' })]);
    });
  });

  it('societe : lisible par tous les membres, modifiable seulement avec le droit', async () => {
    for (const who of ['admin', 'commercial', 'comptable'] as const) {
      await as(user(A, who), async q => expect(await count(q, `public.records where collection = 'societe' and id = 'main'`), who).toBe(1));
    }
    await as(user(A, 'commercial'), async q => {            // aucun droit sur l'onglet societe
      await expect(apply(q, [up('societe', 'main', { nom: 'Pirate' })])).rejects.toThrow(/Droit manquant/);
      expect(await q(`update public.records set data = '{"nom":"Pirate"}' where collection = 'societe' returning id`)).toEqual([]);
    });
    await as(user(A, 'comptable'), async q => {             // societe : voir seulement
      await expect(apply(q, [up('societe', 'main', { nom: 'Pirate' })])).rejects.toThrow(/Droit manquant/);
    });
    await as(user(A, 'admin'), async q => {
      await apply(q, [{ collection: 'societe', id: 'main', op: 'upsert', data: { nom: 'Chaudronnerie Alpha', ice: '001' } }]);
      await expect(apply(q, [up('societe', 'autre')])).rejects.toThrow(/identifiant incorrect/);
    });
    const s = await raw(db, `select data from public.records where company_id = $1 and collection = 'societe'`, [A.id]);
    expect(s).toEqual([{ data: { id: 'main', nom: 'Chaudronnerie Alpha', ice: '001' } }]);
  });

  it('Administrateur : tous les droits sur toutes les collections', async () => {
    await as(user(B, 'admin'), async q => {
      const lot = RECORD_COLLECTIONS.map(c => up(c, 'ADM-' + c, c === 'immobilisations' ? { categorie: 'transport' } : c === 'achats' ? { type: 'autre' } : {}));
      expect((await apply(q, lot))[0].n).toBe(RECORD_COLLECTIONS.length);
      expect(await count(q, `public.records where id like 'ADM-%'`)).toBe(RECORD_COLLECTIONS.length);
      expect((await apply(q, RECORD_COLLECTIONS.map(c => del(c, 'ADM-' + c))))[0].n).toBe(RECORD_COLLECTIONS.length);
      expect(await count(q, `public.records where id like 'ADM-%'`)).toBe(0);
    });
    const total = (await raw(db, `select 1 from public.records where company_id = $1`, [B.id])).length;
    expect(await as(user(B, 'admin'), q => count(q, `public.records`))).toBe(total);
  });

  it("un changement de droits ou de profil s'applique immédiatement", async () => {
    const c = await createCompany(db, 'DYNAMIQUE', { essaiFin: jours(5) });
    await seed(db, c.id, 'bulletins', 'BUL-1');
    const lit = () => as(user(c, 'commercial'), q => count(q, `public.records where collection = 'bulletins'`));
    expect(await lit()).toBe(0);
    await as(user(c, 'admin'), q => q(`update public.roles set droits = droits || '{"collab_paie":{"voir":true,"modifier":false,"supprimer":false}}' where id = 'prf-commercial'`));
    expect(await lit()).toBe(1);
    await raw(db, `update public.profiles set profil_id = 'prf-comptable' where user_id = $1`, [c.commercial]);
    await as(user(c, 'commercial'), q => apply(q, [up('bulletins', 'BUL-2')]));
    await raw(db, `update public.profiles set profil_id = 'prf-commercial' where user_id = $1`, [c.commercial]);
    await as(user(c, 'commercial'), async q => { await expect(apply(q, [up('bulletins', 'BUL-3')])).rejects.toThrow(/Droit manquant/); });
  });
});

/* ───────────────────────────── Licence et comptes désactivés ───────────────────────────── */
describe('licence inactive et comptes désactivés', () => {
  const bloquee = (nom: string, get: () => Company) => it(`${nom} : ni lecture ni écriture, mais la ligne companies reste lisible`, async () => {
    const c = get();
    for (const who of ['admin', 'commercial'] as const) {
      await as(user(c, who), async q => {
        const co = await q(`select id, suspendu from public.companies`);
        expect(co.map(r => r.id)).toEqual([c.id]);
        for (const t of ['records', 'profiles', 'roles', 'license_payments', 'platform_settings']) expect(await count(q, `public.${t}`), t).toBe(0);
        await expect(apply(q, [up('devis', 'BLOQUE-1')])).rejects.toThrow(/licence/i);
        await expect(apply(q, [del('devis', 'DEV-1')])).rejects.toThrow(/licence/i);
        await expect(apply(q, [])).rejects.toThrow(/licence/i);
        await expect(q(`insert into public.records (company_id, collection, id, data) values ($1, 'devis', 'BLOQUE-2', '{}')`, [c.id])).rejects.toThrow(/row-level security/);
        expect(await q(`update public.records set data = '{}' returning id`)).toEqual([]);
        expect(await q(`delete from public.records returning id`)).toEqual([]);
        expect(await q(`update public.roles set droits = '{}' returning id`)).toEqual([]);
        expect(await q(`delete from public.roles returning id`)).toEqual([]);
        await expect(q(`insert into public.roles (company_id, id, nom) values ($1, 'prf-x', 'X')`, [c.id])).rejects.toThrow(/row-level security/);
        expect((await q(`select public.can_access($1, 'societe', '{}', 'voir') as a, public.is_company_admin($1) as b`, [c.id]))[0]).toEqual({ a: false, b: false });
      });
    }
    expect(await existe(c, 'devis', 'BLOQUE-1')).toBe(false);
    expect(await existe(c, 'devis', 'DEV-1')).toBe(true);
    expect((await raw(db, `select 1 from public.records where company_id = $1`, [c.id])).length).toBe(9);
    expect((await raw(db, `select 1 from public.roles where company_id = $1`, [c.id])).length).toBe(3);
  });
  bloquee('entreprise suspendue', () => SUSP);
  bloquee('licence expirée', () => EXP);
  bloquee('essai expiré', () => ESSAI_EXP);
  bloquee('entreprise sans échéance ni essai', () => SANS_DATE);

  it('le message de apply_changes est reconnu par le client (licence avant droit)', async () => {
    await as(user(SUSP, 'commercial'), async q => {
      const e: any = await apply(q, [up('bulletins', 'X')]).catch(x => x);
      expect(/licen/i.test(e.message)).toBe(true);
    });
    await as(user(A, 'commercial'), async q => {
      const e: any = await apply(q, [up('bulletins', 'X')]).catch(x => x);
      expect(/licen/i.test(e.message)).toBe(false);
      expect(/droit|permission|policy|denied/i.test(e.message)).toBe(true);
    });
  });

  it('entreprise interne : jamais bloquée par les dates', async () => {
    await as(user(INTERNE, 'admin'), async q => {
      expect(await count(q, `public.records`)).toBe(9);
      await apply(q, [up('devis', 'INT-1')]);
      expect(await count(q, `public.records`)).toBe(10);
    });
  });

  it("la suspension et le rétablissement s'appliquent immédiatement", async () => {
    const c = await createCompany(db, 'BASCULE', { echeance: jours(20) });
    await seed(db, c.id, 'devis', 'DEV-1');
    const lit = () => as(user(c, 'admin'), q => count(q, `public.records`));
    expect(await lit()).toBe(1);
    await withRole(db, 'service_role', null, q => q(`update public.companies set suspendu = true, motif_suspension = 'Impayé' where id = $1`, [c.id]));
    expect(await lit()).toBe(0);
    expect((await as(user(c, 'admin'), q => q(`select motif_suspension from public.companies`)))[0].motif_suspension).toBe('Impayé');
    await withRole(db, 'service_role', null, q => q(`update public.companies set suspendu = false where id = $1`, [c.id]));
    expect(await lit()).toBe(1);
  });

  it('utilisateur désactivé : aucune donnée, aucune écriture (seule la ligne de son entreprise reste lisible)', async () => {
    await as(jeton(desactive, A.id), async q => {
      expect((await q(`select id from public.companies`)).map(r => r.id)).toEqual([A.id]);
      for (const t of ['records', 'profiles', 'roles', 'license_payments', 'platform_settings']) expect(await count(q, `public.${t}`), t).toBe(0);
      await expect(apply(q, [up('devis', 'DESACT-1')])).rejects.toThrow(/Droit manquant/);
      await expect(q(`insert into public.records (company_id, collection, id, data) values ($1, 'devis', 'DESACT-2', '{}')`, [A.id])).rejects.toThrow(/row-level security/);
      expect(await q(`delete from public.records returning id`)).toEqual([]);
      expect(await q(`update public.roles set droits = '{}' returning id`)).toEqual([]);
      await expect(q(`insert into public.roles (company_id, id, nom) values ($1, 'prf-x', 'X')`, [A.id])).rejects.toThrow(/row-level security/);
    });
    expect(await existe(A, 'devis', 'DESACT-1')).toBe(false);
    // réactivé par le serveur : l'accès revient
    const u = await createUser(db, A.id, 'prf-commercial', 'retour@ALPHA.test', false);
    expect(await as(jeton(u, A.id), q => count(q, `public.records`))).toBe(0);
    await raw(db, `update public.profiles set actif = true where user_id = $1`, [u]);
    expect(await as(jeton(u, A.id), q => count(q, `public.records`))).toBeGreaterThan(0);
  });
});

/* ───────────────────────────── Propriétaire, anon, tables protégées ───────────────────────────── */
describe('propriétaire de la plateforme, anonyme, tables protégées', () => {
  it('propriétaire : lit companies, license_payments et platform_settings, mais aucune donnée métier', async () => {
    const total = (await raw(db, `select 1 from public.companies`)).length;
    expect(total).toBeGreaterThanOrEqual(7);
    await as({ sub: owner, app_metadata: { is_owner: true } }, async q => {
      expect(await count(q, `public.companies`)).toBe(total);
      expect(await count(q, `public.license_payments`)).toBe(7);
      expect(await count(q, `public.platform_settings`)).toBe(1);
      for (const t of ['records', 'profiles', 'roles']) expect(await count(q, `public.${t}`), t).toBe(0);
      await expect(apply(q, [up('devis', 'OWN-1')])).rejects.toThrow(/Droit manquant/);
      await expect(q(`insert into public.records (company_id, collection, id, data) values ($1, 'devis', 'OWN-2', '{}')`, [A.id])).rejects.toThrow(/row-level security/);
      // même le propriétaire n'écrit pas directement : tout passe par les fonctions serveur
      await expect(q(`update public.companies set suspendu = true`)).rejects.toThrow(/permission denied/);
      await expect(q(`insert into public.license_payments (company_id, date, montant, du, au) values ($1, current_date, 1, current_date, current_date)`, [A.id])).rejects.toThrow(/permission denied/);
      await expect(q(`update public.platform_settings set tarif_mensuel = 1`)).rejects.toThrow(/permission denied/);
    });
    // is_owner dans user_metadata, ou autre chose que le booléen true : pas propriétaire
    for (const claims of [{ sub: owner, app_metadata: {}, user_metadata: { is_owner: true } }, { sub: owner, app_metadata: { is_owner: 'true' } }]) {
      await as(claims, async q => { for (const t of TABLES) expect(await count(q, `public.${t}`), t).toBe(0); });
    }
  });

  it('anon : aucune lecture, aucune écriture, aucune fonction', async () => {
    for (const claims of [null, { sub: A.admin, app_metadata: { company_id: A.id, is_owner: true } }]) {
      await withRole(db, 'anon', claims, async q => {
        for (const t of TABLES) await expect(q(`select * from public.${t}`), t).rejects.toThrow(/permission denied/);
        await expect(q(`insert into public.records (company_id, collection, id, data) values ($1, 'devis', 'ANON', '{}')`, [A.id])).rejects.toThrow(/permission denied/);
        await expect(q(`delete from public.records`)).rejects.toThrow(/permission denied/);
        await expect(q(`select public.apply_changes('[]'::jsonb)`)).rejects.toThrow(/permission denied/);
        await expect(q(`select public.my_access()`)).rejects.toThrow(/permission denied/);
        await expect(q(`select public.can_access($1, 'devis', '{}', 'voir')`, [A.id])).rejects.toThrow(/permission denied/);
      });
    }
  });

  it('authenticated sans jeton exploitable : rien', async () => {
    await as({}, async q => {
      for (const t of TABLES) expect(await count(q, `public.${t}`), t).toBe(0);
      await expect(apply(q, [up('devis', 'X')])).rejects.toThrow(/Droit manquant/);
    });
  });

  it('un utilisateur (même administrateur) ne peut écrire ni profiles, ni companies, ni license_payments, ni platform_settings', async () => {
    await as(user(A, 'admin'), async q => {
      await expect(q(`update public.profiles set profil_id = 'prf-admin' where user_id = $1`, [A.commercial])).rejects.toThrow(/permission denied/);
      await expect(q(`update public.profiles set actif = true`)).rejects.toThrow(/permission denied/);
      await expect(q(`update public.profiles set company_id = $1 where user_id = $2`, [B.id, A.admin])).rejects.toThrow(/permission denied/);
      await expect(q(`insert into public.profiles (user_id, company_id, nom, email, profil_id) values ($1, $2, 'x', 'x@x', 'prf-admin')`, [owner, A.id])).rejects.toThrow(/permission denied/);
      await expect(q(`delete from public.profiles where user_id = $1`, [A.commercial])).rejects.toThrow(/permission denied/);
      await expect(q(`update public.companies set echeance = '2099-01-01', suspendu = false, interne = true`)).rejects.toThrow(/permission denied/);
      await expect(q(`insert into public.companies (code, nom) values ('PIRATE', 'Pirate')`)).rejects.toThrow(/permission denied/);
      await expect(q(`delete from public.companies`)).rejects.toThrow(/permission denied/);
      await expect(q(`insert into public.license_payments (company_id, date, montant, du, au) values ($1, current_date, 1, current_date, '2099-01-01')`, [A.id])).rejects.toThrow(/permission denied/);
      await expect(q(`update public.platform_settings set essai_jours = 9999`)).rejects.toThrow(/permission denied/);
      await expect(q(`truncate public.records`)).rejects.toThrow(/permission denied/);
      await expect(q(`select public.company_active($1)`, [B.id])).rejects.toThrow(/permission denied/);
    });
    expect((await raw(db, `select profil_id from public.profiles where user_id = $1`, [A.commercial]))[0].profil_id).toBe('prf-commercial');
  });

  it('service_role (fonctions serveur) garde tous les droits', async () => {
    await withRole(db, 'service_role', null, async q => {
      expect(await count(q, `public.records`)).toBeGreaterThan(20);
      const id = uuid('c');
      await q(`insert into public.companies (id, code, nom) values ($1, 'SRV', 'Créée par le serveur')`, [id]);
      await q(`insert into public.roles (company_id, id, nom, systeme) values ($1, 'prf-admin', 'Administrateur', true)`, [id]);
      await q(`insert into public.license_payments (company_id, date, montant, du, au) values ($1, current_date, 1, current_date, current_date)`, [id]);
      await q(`update public.platform_settings set essai_jours = 14`);
      await q(`insert into public.records (company_id, collection, id, data) values ($1, 'societe', 'main', '{"nom":"SRV"}')`, [id]);
      await q(`delete from public.companies where id = $1`, [id]);
      expect(await count(q, `public.records where company_id = $1`, [id])).toBe(0);      // suppression en cascade
    });
  });
});

/* ───────────────────────────── Rôles (profils de droits) ───────────────────────────── */
describe('table roles', () => {
  it('tout membre actif lit les rôles de son entreprise ; un non-administrateur ne peut pas les modifier', async () => {
    for (const who of ['commercial', 'comptable'] as const) {
      await as(user(B, who), async q => {
        expect(await count(q, `public.roles where company_id = $1`, [B.id])).toBeGreaterThanOrEqual(3);
        expect(await q(`update public.roles set droits = '{"devis":{"voir":true,"modifier":true,"supprimer":true}}' returning id`)).toEqual([]);
        expect(await q(`update public.roles set nom = 'Pirate' where id = 'prf-commercial' returning id`)).toEqual([]);
        expect(await q(`delete from public.roles returning id`)).toEqual([]);
        await expect(q(`insert into public.roles (company_id, id, nom, droits) values ($1, 'prf-pirate', 'Pirate', '{}')`, [B.id])).rejects.toThrow(/row-level security/);
        await expect(q(`update public.roles set systeme = true where id = 'prf-commercial'`)).rejects.toThrow(/permission denied/);
      });
    }
    const r = await raw(db, `select id, nom, systeme, droits from public.roles where company_id = $1 and id in ('prf-admin', 'prf-commercial', 'prf-comptable') order by id`, [B.id]);
    expect(r.map(x => [x.id, x.nom, x.systeme])).toEqual([['prf-admin', 'Administrateur', true], ['prf-commercial', 'Commercial', false], ['prf-comptable', 'Comptable', false]]);
    expect(r[1].droits).toEqual(defaultDroits()['prf-commercial']);
  });

  it("l'administrateur crée, modifie et supprime les rôles non système (comme supabaseBackend)", async () => {
    await as(user(A, 'admin'), async q => {
      await q(`insert into public.roles (company_id, id, nom, description, systeme, droits) values ($1, 'prf-magasin', 'Magasinier', 'Stock', false, '{}')`, [A.id]);
      expect((await q(`update public.roles set nom = 'Magasin', description = 'Stock et achats' where company_id = $1 and id = 'prf-magasin' returning id`, [A.id])).length).toBe(1);
      expect((await q(`update public.roles set droits = $2::jsonb where company_id = $1 and id = 'prf-magasin' returning id`,
        [A.id, JSON.stringify({ achat_consommable: { voir: true, modifier: true, supprimer: false } })])).length).toBe(1);
      await expect(q(`insert into public.roles (company_id, id, nom) values ($1, 'prf-doublon', 'Magasin')`, [A.id])).rejects.toThrow(/duplicate|unique/i);
      expect((await q(`delete from public.roles where company_id = $1 and id = 'prf-magasin' returning id`, [A.id])).length).toBe(1);
    });
  });

  it("l'administrateur ne peut ni modifier ni supprimer ni créer un rôle système, ni changer id / company_id", async () => {
    await as(user(A, 'admin'), async q => {
      expect(await q(`update public.roles set nom = 'Chef' where id = 'prf-admin' returning id`)).toEqual([]);
      expect(await q(`update public.roles set droits = '{}' where id = 'prf-admin' returning id`)).toEqual([]);
      expect(await q(`delete from public.roles where id = 'prf-admin' returning id`)).toEqual([]);
      await expect(q(`insert into public.roles (company_id, id, nom, systeme) values ($1, 'prf-admin2', 'Admin 2', true)`, [A.id])).rejects.toThrow(/row-level security/);
      await expect(q(`update public.roles set systeme = true where id = 'prf-commercial'`)).rejects.toThrow(/permission denied/);
      await expect(q(`update public.roles set systeme = false where id = 'prf-admin'`)).rejects.toThrow(/permission denied/);
      await expect(q(`update public.roles set id = 'prf-autre' where id = 'prf-commercial'`)).rejects.toThrow(/permission denied/);
      await expect(q(`update public.roles set company_id = $1 where id = 'prf-commercial'`, [B.id])).rejects.toThrow(/permission denied/);
    });
    const r = await raw(db, `select nom, systeme from public.roles where company_id = $1 and id = 'prf-admin'`, [A.id]);
    expect(r).toEqual([{ nom: 'Administrateur', systeme: true }]);
    // le serveur non plus ne peut pas transformer un rôle en rôle système (déclencheur)
    await withRole(db, 'service_role', null, async q => {
      await expect(q(`update public.roles set systeme = true where company_id = $1 and id = 'prf-commercial'`, [A.id])).rejects.toThrow(/ne peuvent pas être changés/);
    });
  });

  it("un rôle utilisé par un utilisateur ne peut pas être supprimé", async () => {
    await as(user(A, 'admin'), async q => {
      await expect(q(`delete from public.roles where company_id = $1 and id = 'prf-commercial'`, [A.id])).rejects.toThrow(/foreign key|violates/i);
    });
    expect((await raw(db, `select 1 from public.roles where company_id = $1 and id = 'prf-commercial'`, [A.id])).length).toBe(1);
  });

  it('droits mal formés refusés', async () => {
    await as(user(A, 'admin'), async q => {
      for (const d of ['[]', '"x"', '{"devis":true}', '{"devis":{"voir":"oui"}}', '{"devis":{"voir":true,"modifier":1}}']) {
        await expect(q(`update public.roles set droits = $1::jsonb where id = 'prf-commercial'`, [d]), d).rejects.toThrow(/check constraint/);
      }
      await expect(q(`update public.roles set droits = $1::jsonb where id = 'prf-commercial'`, [JSON.stringify({ x: { note: 'a'.repeat(21000) } })])).rejects.toThrow(/check constraint/);
    });
  });
});

/* ───────────────────────────── apply_changes ───────────────────────────── */
describe('apply_changes', () => {
  it('atomique : un lot dont un élément est refusé n’écrit rien', async () => {
    await seed(db, A.id, 'devis', 'ATO-EXISTANT', { v: 1 });
    await as(user(A, 'commercial'), async q => {
      await expect(apply(q, [
        up('devis', 'ATO-1'), up('devis', 'ATO-EXISTANT', { v: 2 }), up('clients', 'ATO-CLI'),
        up('bulletins', 'ATO-BUL'),                                   // refusé
        up('devis', 'ATO-2'),
      ])).rejects.toThrow(/Droit manquant/);
      await expect(apply(q, [up('devis', 'ATO-3'), { collection: 'devis', id: '', op: 'upsert', data: {} }])).rejects.toThrow(/identifiant incorrect/);
      await expect(apply(q, [up('devis', 'ATO-4'), up('devis', 'ATO-GROS', { blob: 'x'.repeat(600 * 1024) })])).rejects.toThrow(/trop volumineux/);
    });
    for (const id of ['ATO-1', 'ATO-2', 'ATO-3', 'ATO-4', 'ATO-GROS']) expect(await existe(A, 'devis', id), id).toBe(false);
    expect(await existe(A, 'clients', 'ATO-CLI')).toBe(false);
    expect((await raw(db, `select data from public.records where company_id = $1 and collection = 'devis' and id = 'ATO-EXISTANT'`, [A.id]))[0].data).toEqual({ id: 'ATO-EXISTANT', v: 1 });
  });

  it('upsert (création puis remplacement), delete, ordre du lot, valeur de retour', async () => {
    await as(user(A, 'admin'), async q => {
      expect((await apply(q, [up('devis', 'SEQ-1', { v: 1 }), up('devis', 'SEQ-1', { v: 2, extra: true }), up('devis', 'SEQ-2'), del('devis', 'SEQ-2'), del('devis', 'JAMAIS-VU')]))[0].n).toBe(5);
      expect((await apply(q, []))[0].n).toBe(0);
      expect((await apply(q, [up('devis', 'SEQ-1', { v: 3 })]))[0].n).toBe(1);     // remplacement complet : « extra » disparaît
    });
    expect((await raw(db, `select data from public.records where company_id = $1 and collection = 'devis' and id = 'SEQ-1'`, [A.id]))[0].data).toEqual({ id: 'SEQ-1', v: 3 });
    expect(await existe(A, 'devis', 'SEQ-2')).toBe(false);
  });

  it('validation des entrées', async () => {
    const ko = async (changes: unknown, re: RegExp) => as(user(A, 'admin'), async q => { await expect(apply(q, changes)).rejects.toThrow(re); });
    await ko({ collection: 'devis' }, /tableau est attendu/);
    await ko('texte', /tableau est attendu/);
    await ko(null, /tableau est attendu/);
    await ko(Array.from({ length: 501 }, (_, i) => up('devis', 'LOT-' + i)), /500 changements/);
    await ko(['x'], /obligatoires/);
    await ko([{ collection: 'devis', id: 12, op: 'upsert', data: {} }], /obligatoires/);
    await ko([{ collection: 'devis', id: 'V-1', data: {} }], /obligatoires/);
    await ko([{ collection: 'roles', id: 'V-1', op: 'upsert', data: {} }], /collection inconnue/);
    await ko([{ collection: 'profiles', id: 'V-1', op: 'delete' }], /collection inconnue/);
    await ko([{ collection: 'devis', id: 'x'.repeat(81), op: 'upsert', data: {} }], /identifiant incorrect/);
    await ko([{ collection: 'devis', id: 'V-1', op: 'truncate', data: {} }], /opération inconnue/);
    await ko([{ collection: 'devis', id: 'V-1', op: 'upsert' }], /données manquantes/);
    await ko([{ collection: 'devis', id: 'V-1', op: 'upsert', data: null }], /données manquantes/);
    await ko([{ collection: 'devis', id: 'V-1', op: 'upsert', data: [1, 2] }], /données manquantes/);
    await ko([{ collection: 'devis', id: 'V-1', op: 'upsert', data: 'x' }], /données manquantes/);
    expect((await raw(db, `select 1 from public.records where id like 'V-%' or id like 'LOT-%'`)).length).toBe(0);
    // 500 changements exactement : accepté
    await as(user(A, 'admin'), async q => {
      expect((await apply(q, Array.from({ length: 500 }, (_, i) => up('impots', 'MAX-' + i))))[0].n).toBe(500);
      expect((await apply(q, Array.from({ length: 500 }, (_, i) => del('impots', 'MAX-' + i))))[0].n).toBe(500);
    });
    // un identifiant de 80 caractères est accepté
    await as(user(A, 'admin'), q => apply(q, [up('impots', 'y'.repeat(80)), del('impots', 'y'.repeat(80))]));
  });

  it("aucun message d'erreur de validation ne peut être pris pour une erreur de licence", async () => {
    await as(user(A, 'admin'), async q => {
      const e: any = await apply(q, [{ collection: 'licence', id: 'licence', op: 'licence', data: {} }]).catch(x => x);
      expect(/licen/i.test(e.message)).toBe(false);
      const e2: any = await apply(q, [{ collection: 'devis', id: 'licence', op: 'licence', data: {} }]).catch(x => x);
      expect(/licen/i.test(e2.message)).toBe(false);
    });
    await as(user(A, 'commercial'), async q => {
      const e: any = await apply(q, [up('bulletins', 'licence')]).catch(x => x);
      expect(e.message).toMatch(/Droit manquant/);
      expect(/licen/i.test(e.message)).toBe(false);
    });
  });
});

/* ───────────────────────────── Déclencheur de records, taille, ordre ───────────────────────────── */
describe('records : déclencheur, taille maximale, ordre de lecture', () => {
  it("data.id est forcé à l'identifiant de la ligne ; updated_at / updated_by sont imposés", async () => {
    await as(user(A, 'commercial'), async q => {
      await apply(q, [{ collection: 'devis', id: 'TRG-1', op: 'upsert', data: { id: 'AUTRE', client: 'X' } },
                      { collection: 'devis', id: 'TRG-2', op: 'upsert', data: { client: 'Y' } }]);
      // colonnes updated_* non inscriptibles par le client
      await expect(q(`insert into public.records (company_id, collection, id, data, updated_by) values ($1, 'devis', 'TRG-3', '{}', $2)`, [A.id, A.admin])).rejects.toThrow(/permission denied/);
      await expect(q(`update public.records set updated_by = $1 where id = 'TRG-1'`, [A.admin])).rejects.toThrow(/permission denied/);
      await expect(q(`update public.records set updated_at = '2000-01-01' where id = 'TRG-1'`)).rejects.toThrow(/permission denied/);
      await expect(q(`insert into public.records (company_id, collection, id, data, seq) values ($1, 'devis', 'TRG-3', '{}', 1)`, [A.id])).rejects.toThrow();
    });
    let r = await raw(db, `select id, data, updated_by, updated_at from public.records where company_id = $1 and id like 'TRG-%' order by id`, [A.id]);
    expect(r.map(x => [x.id, x.data.id, x.updated_by])).toEqual([['TRG-1', 'TRG-1', A.commercial], ['TRG-2', 'TRG-2', A.commercial]]);
    await raw(db, `update public.records set updated_at = '2000-01-01', updated_by = null where company_id = $1 and id = 'TRG-1'`, [A.id]);   // même forcé par un super-utilisateur…
    r = await raw(db, `select updated_by, updated_at > now() - interval '1 hour' as recent from public.records where company_id = $1 and id = 'TRG-1'`, [A.id]);
    expect(r).toEqual([{ updated_by: null, recent: true }]);                                    // … updated_at reste l'heure réelle
    await as(user(A, 'admin'), q => q(`update public.records set data = '{"id":"FAUX","client":"Z"}' where collection = 'devis' and id = 'TRG-1'`));
    r = await raw(db, `select data, updated_by from public.records where company_id = $1 and id = 'TRG-1'`, [A.id]);
    expect(r).toEqual([{ data: { id: 'TRG-1', client: 'Z' }, updated_by: A.admin }]);
  });

  it('data doit être un objet de 512 Ko au plus', async () => {
    await as(user(A, 'admin'), async q => {
      await expect(q(`insert into public.records (company_id, collection, id, data) values ($1, 'devis', 'BIG-1', $2::jsonb)`,
        [A.id, JSON.stringify({ blob: 'x'.repeat(520 * 1024) })])).rejects.toThrow(/trop volumineux/);
      await expect(q(`update public.records set data = $1::jsonb where collection = 'devis' and id = 'DEV-1'`,
        [JSON.stringify({ blob: 'x'.repeat(520 * 1024) })])).rejects.toThrow(/trop volumineux/);
      await expect(q(`insert into public.records (company_id, collection, id, data) values ($1, 'devis', 'BIG-2', '[1]')`, [A.id])).rejects.toThrow(/objet JSON/);
      await apply(q, [up('devis', 'BIG-OK', { blob: 'x'.repeat(500 * 1024) })]);            // juste sous la limite
    });
    expect(await existe(A, 'devis', 'BIG-1')).toBe(false);
    expect(await existe(A, 'devis', 'BIG-OK')).toBe(true);
    await raw(db, `delete from public.records where company_id = $1 and id = 'BIG-OK'`, [A.id]);
  });

  it('lecture par seq décroissant : le plus récent d’abord ; une modification ne change pas le rang', async () => {
    const c = await createCompany(db, 'ORDRE', { essaiFin: jours(5) });
    const lire = () => as(user(c, 'admin'), async q =>
      (await q(`select collection, id, data from public.records where company_id = $1 order by seq desc`, [c.id])).map(r => r.id));
    await as(user(c, 'admin'), q => apply(q, [up('devis', 'O-1'), up('devis', 'O-2'), up('clients', 'O-3')]));
    await as(user(c, 'commercial'), q => apply(q, [up('devis', 'O-4')]));
    expect(await lire()).toEqual(['O-4', 'O-3', 'O-2', 'O-1']);
    await as(user(c, 'admin'), q => apply(q, [up('devis', 'O-1', { modifie: true }), del('devis', 'O-2'), up('devis', 'O-5')]));
    expect(await lire()).toEqual(['O-5', 'O-4', 'O-3', 'O-1']);
    // pagination comme supabaseBackend.load (range)
    const page = await as(user(c, 'admin'), q => q(`select id from public.records where company_id = $1 order by seq desc limit 2 offset 2`, [c.id]));
    expect(page.map(r => r.id)).toEqual(['O-3', 'O-1']);
  });
});
