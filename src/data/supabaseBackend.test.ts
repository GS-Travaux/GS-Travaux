import { beforeEach, describe, expect, it, vi } from 'vitest';

/* Faux client Supabase : suffisamment fidèle (chaînes select/eq/order/range, rpc, auth) pour vérifier
   ce que le navigateur demande et comment il interprète les réponses. */
const calls: any[] = [];
let tables: Record<string, any[]> = {};
let rpcError: { message: string } | null = null;
let user: any = null;

function query(table: string) {
  const q: any = { filters: [] as [string, any][], win: null as null | [number, number] };
  const run = () => {
    let rows = (tables[table] || []).filter(r => q.filters.every(([k, v]: [string, any]) => r[k] === v));
    if (q.win) rows = rows.slice(q.win[0], q.win[1] + 1);
    return { data: rows, error: null };
  };
  q.select = (cols: string) => { calls.push({ select: table, cols }); return q; };
  q.eq = (k: string, v: any) => { q.filters.push([k, v]); return q; };
  q.order = () => q;
  q.range = (a: number, b: number) => { q.win = [a, b]; return q; };
  q.maybeSingle = async () => ({ data: run().data[0] ?? null, error: null });
  q.then = (res: any) => res(run());
  return q;
}
const fake = {
  from: (t: string) => query(t),
  rpc: async (fn: string, args: any) => { calls.push({ rpc: fn, args }); return { data: null, error: rpcError }; },
  auth: {
    getUser: async () => ({ data: { user }, error: null }),
    getSession: async () => ({ data: { session: user ? { user, access_token: 't' } : null } }),
    signInWithPassword: async ({ password }: any) => password === 'ok' ? { data: { user }, error: null } : { data: { user: null }, error: { message: 'Invalid login credentials' } },
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  },
};
vi.mock('./supabaseClient', () => ({ getSupabase: () => fake, callApi: vi.fn(), supabaseConfigured: true }));

import { SupabaseBackend } from './supabaseBackend';

const CID = 'c1';
beforeEach(() => {
  calls.length = 0; rpcError = null;
  user = { id: 'u1', email: 'a@b.c', app_metadata: { company_id: CID } };
  tables = {
    companies: [{ id: CID, code: 'ACME', nom: 'Acme', licence: 'Mensuelle', debut: '2026-01-01', essai_fin: null, echeance: '2099-01-01', suspendu: false, motif_suspension: '', interne: false }],
    roles: [{ company_id: CID, id: 'prf-admin', nom: 'Administrateur', description: '', systeme: true, droits: {} },
            { company_id: CID, id: 'p2', nom: 'Commercial', description: 'x', systeme: false, droits: { devis: { voir: true, modifier: true, supprimer: false } } }],
    profiles: [{ user_id: 'u1', company_id: CID, nom: 'Moi', email: 'a@b.c', profil_id: 'prf-admin', actif: true }],
    records: [
      { company_id: CID, collection: 'societe', id: 'main', data: { nom: 'Acme SARL' } },
      { company_id: CID, collection: 'devis', id: 'd2', data: { id: 'd2', lignes: [] } },
      { company_id: CID, collection: 'devis', id: 'd1', data: { id: 'd1', lignes: [] } },
      { company_id: CID, collection: 'inconnue', id: 'x', data: { id: 'x' } },
    ],
  };
});

describe('SupabaseBackend', () => {
  it('load : assemble entreprise, utilisateurs, profils, droits et enregistrements', async () => {
    const d = await new SupabaseBackend().load();
    expect(d.company.nom).toBe('Acme'); expect(d.me.profil).toBe('Administrateur');
    expect(d.state.societe.nom).toBe('Acme SARL');
    expect(d.state.devis.map((x: any) => x.id)).toEqual(['d2', 'd1']);              // ordre renvoyé par la base conservé
    expect((d.state as any).inconnue).toBeUndefined();                                // collection inconnue ignorée
    expect(d.state.droits.p2.devis.modifier).toBe(true); expect(d.state.droits['prf-admin']).toBeUndefined();
    expect(d.state.profils.map(p => p.nom)).toEqual(['Administrateur', 'Commercial']);
  });
  it('load : ne demande jamais les colonnes réservées à l’éditeur (select * interdit sur companies)', async () => {
    await new SupabaseBackend().load();
    const c = calls.find(x => x.select === 'companies');
    expect(c.cols).not.toMatch(/\*|notes|prix|contact/);
  });
  it('load : refuse un compte sans entreprise, désactivé ou sans profil', async () => {
    user = { ...user, app_metadata: {} };
    await expect(new SupabaseBackend().load()).rejects.toMatchObject({ code: 'no_company' });
    user = { id: 'u1', email: 'a@b.c', app_metadata: { company_id: CID } };
    tables.profiles[0].actif = false;
    await expect(new SupabaseBackend().load()).rejects.toMatchObject({ code: 'inactive' });
    tables.profiles = [];
    await expect(new SupabaseBackend().load()).rejects.toMatchObject({ code: 'no_profile' });
  });
  it('load : lit les enregistrements page par page', async () => {
    tables.records = Array.from({ length: 2500 }, (_, i) => ({ company_id: CID, collection: 'clients', id: 'c' + i, data: { id: 'c' + i } }));
    const d = await new SupabaseBackend().load();
    expect(d.state.clients.length).toBe(2500);
  });
  it('save : envoie un seul lot atomique à apply_changes', async () => {
    await new SupabaseBackend().save([
      { collection: 'devis', id: 'd1', op: 'upsert', data: { id: 'd1' } },
      { collection: 'clients', id: 'c1', op: 'delete' },
    ]);
    expect(calls.find(c => c.rpc).args.changes).toEqual([
      { collection: 'devis', id: 'd1', op: 'upsert', data: { id: 'd1' } },
      { collection: 'clients', id: 'c1', op: 'delete', data: null },
    ]);
  });
  it('save : traduit les refus de la base', async () => {
    rpcError = { message: 'Licence inactive : écriture refusée' };
    await expect(new SupabaseBackend().save([{ collection: 'devis', id: 'x', op: 'delete' }])).rejects.toMatchObject({ code: 'licence' });
    rpcError = { message: 'Droit manquant : devis' };
    await expect(new SupabaseBackend().save([{ collection: 'devis', id: 'x', op: 'delete' }])).rejects.toMatchObject({ code: 'forbidden' });
  });
  it('signIn : message français et rôle propriétaire reconnu via app_metadata uniquement', async () => {
    const b = new SupabaseBackend();
    await expect(b.signIn('a@b.c', 'mauvais')).rejects.toThrow('E-mail ou mot de passe incorrect.');
    user = { id: 'u9', email: 'o@b.c', app_metadata: {}, user_metadata: { is_owner: true } };
    expect(await b.signIn('o@b.c', 'ok')).toMatchObject({ role: 'user' });
    user = { id: 'u9', email: 'o@b.c', app_metadata: { is_owner: true } };
    expect(await b.signIn('o@b.c', 'ok')).toMatchObject({ role: 'owner' });
  });
});
