import { beforeEach, describe, expect, it } from 'vitest';
import { FakeSupabase, auth, fakeDeps } from './fakeSupabase.js';
import { run } from './http.js';
import { handleOwner } from './owner.js';

let fake: FakeSupabase; let deps: ReturnType<typeof fakeDeps>; let owner: { id: string; token: string };
const call = (token: string, body: any) => run(r => handleOwner(deps, r), { headers: token ? auth(token) : {}, body });
beforeEach(() => {
  fake = new FakeSupabase(); deps = fakeDeps(fake);
  owner = fake.addUser(null, 'proprio@exemple.com', '', { app_metadata: { is_owner: true } });
});
const nouvelle = {
  action: 'createCompany', code: 'ATLAS-01', nom: 'Aciers de l’Atlas', contact: 'Samir', email: 'direction@atlas.example', telephone: '0522000001',
  interne: false, licence: 'Mensuelle', debut: '2026-10-01', adminNom: 'Samir Berrada', adminEmail: 'Samir@Atlas.example', adminPassword: 'Bienvenue2026',
};

describe('/api/owner — accès', () => {
  it('refuse sans jeton', async () => { expect((await call('', { action: 'list' })).status).toBe(401); });
  it('refuse un administrateur d’entreprise', async () => {
    const c = fake.addCompany('ALPHA'); const u = fake.addUser(c, 'admin@alpha.example');
    expect((await call(u.token, { action: 'list' })).status).toBe(403);
  });
  it('is_owner n’est jamais lu depuis user_metadata', async () => {
    const u = fake.addUser(null, 'malin@x.example', '', { user_metadata: { is_owner: true } });
    expect((await call(u.token, { action: 'list' })).status).toBe(403);
    const v = fake.addUser(null, 'proprio2@exemple.com', '', { user_metadata: { is_owner: true, email: 'proprio@exemple.com' } });
    expect((await call(v.token, { action: 'list' })).status).toBe(403);
  });
  it('is_owner sans l’e-mail OWNER_EMAIL ne suffit pas, ni un compte rattaché à une entreprise', async () => {
    const u = fake.addUser(null, 'ancien@exemple.com', '', { app_metadata: { is_owner: true } });
    expect((await call(u.token, { action: 'list' })).status).toBe(403);
    fake.users.find(x => x.id === owner.id)!.app_metadata.company_id = 'abc';
    expect((await call(owner.token, { action: 'list' })).status).toBe(403);
  });
});

describe('/api/owner — entreprises', () => {
  it('createCompany : entreprise en essai au tarif en vigueur, rôles par défaut, société, administrateur', async () => {
    const r = await call(owner.token, nouvelle);
    expect(r.status).toBe(200);
    const e = (r.body as any).entreprise;
    expect(e).toMatchObject({ code: 'ATLAS-01', licence: 'Mensuelle', prix: 2000, debut: '2026-10-01', essaiFin: '2026-10-15', echeance: '', suspendu: false, interne: false, paiements: [], nbUtilisateurs: 1 });
    const roles = fake.tables.roles.filter(x => x.company_id === e.id);
    expect(roles.map(x => x.id).sort()).toEqual(['prf-admin', 'prf-commercial', 'prf-comptable']);
    expect(roles.find(x => x.id === 'prf-admin')).toMatchObject({ systeme: true, droits: {} });
    expect(roles.find(x => x.id === 'prf-commercial')!.droits.devis).toEqual({ voir: true, modifier: true, supprimer: false });
    expect(fake.tables.records).toEqual([expect.objectContaining({ company_id: e.id, collection: 'societe', id: 'main', data: expect.objectContaining({ nom: 'Aciers de l’Atlas', natureActivite: 'services' }) })]);
    const au = fake.users.find(u => u.email === 'samir@atlas.example')!;
    expect(au.app_metadata).toEqual({ company_id: e.id });
    expect(fake.tables.profiles).toEqual([expect.objectContaining({ user_id: au.id, company_id: e.id, profil_id: 'prf-admin', actif: true, nom: 'Samir Berrada' })]);
  });
  it('createCompany : compte interne gratuit, sans essai', async () => {
    const r = await call(owner.token, { ...nouvelle, interne: true, prix: 500 });
    expect((r.body as any).entreprise).toMatchObject({ interne: true, prix: 0, essaiFin: '' });
  });
  it('createCompany : validations (code, e-mail, mot de passe, prix, adresse du propriétaire, doublon)', async () => {
    for (const patch of [{ code: 'a b' }, { code: 'X' }, { email: 'nope' }, { adminPassword: 'faible' }, { adminEmail: 'x' }, { prix: 0 }, { licence: 'Hebdo' }, { debut: '2026-13-01' }, { adminEmail: 'proprio@exemple.com' }]) {
      expect((await call(owner.token, { ...nouvelle, ...patch })).status, JSON.stringify(patch)).toBe(400);
    }
    expect(fake.tables.companies).toHaveLength(0);
    expect((await call(owner.token, nouvelle)).status).toBe(200);
    const d = await call(owner.token, { ...nouvelle, adminEmail: 'autre@atlas.example' });
    expect(d.status).toBe(409);
    expect(fake.tables.companies).toHaveLength(1);
    expect(fake.users.some(u => u.email === 'autre@atlas.example')).toBe(false);
  });
  it('createCompany : annulation complète en cas d’échec partiel', async () => {
    const vide = () => { expect(fake.tables.companies).toHaveLength(0); expect(fake.tables.roles).toHaveLength(0); expect(fake.tables.records).toHaveLength(0); expect(fake.tables.profiles).toHaveLength(0); expect(fake.users).toHaveLength(1); };
    fake.failNext('profiles', 'insert'); expect((await call(owner.token, nouvelle)).status).toBe(500); vide();
    fake.failNext('records', 'insert'); expect((await call(owner.token, nouvelle)).status).toBe(500); vide();
    fake.authFailures.createUser = 'boom'; expect((await call(owner.token, nouvelle)).status).toBe(500); vide();
    fake.addUser(null, 'samir@atlas.example');                          // adresse déjà prise
    expect((await call(owner.token, nouvelle)).status).toBe(409);
    expect(fake.tables.companies).toHaveLength(0);
    expect(fake.users).toHaveLength(2);                                 // le compte préexistant n'est pas touché
  });
  it('list : colonnes converties, paiements imbriqués, nombre d’utilisateurs, tarifs', async () => {
    const c = fake.addCompany('ALPHA', { essai_fin: '2026-02-01', motif_suspension: 'Impayé', suspendu: true });
    fake.addUser(c, 'a@alpha.example'); fake.addUser(c, 'b@alpha.example', 'prf-commercial');
    fake.tables.license_payments.push({ id: 'p1', company_id: c.id, date: '2026-03-01', montant: '2000.00', periodes: 1, mode: 'Virement', du: '2026-03-01', au: '2026-04-01' });
    const r = await call(owner.token, { action: 'list' });
    expect((r.body as any).tarifs).toEqual({ tarifs: { Mensuelle: 2000, Annuelle: 24000 }, essaiJours: 14 });
    expect((r.body as any).entreprises).toEqual([expect.objectContaining({
      id: c.id, essaiFin: '2026-02-01', motifSuspension: 'Impayé', suspendu: true, nbUtilisateurs: 2,
      paiements: [{ id: 'p1', date: '2026-03-01', montant: 2000, periodes: 1, mode: 'Virement', du: '2026-03-01', au: '2026-04-01' }],
    })]);
    expect((r.body as any).entreprises[0]).not.toHaveProperty('essai_fin');
  });
  it('addPayment : prolonge l’échéance en cours, ou repart de la date de paiement si elle est échue', async () => {
    const c = fake.addCompany('ALPHA', { echeance: '2026-11-15' });
    let r = await call(owner.token, { action: 'addPayment', id: c.id, date: '2026-10-06', periodes: 2, montant: 4000, mode: 'Virement' });
    expect(r.body).toMatchObject({ echeance: '2027-01-15', paiement: { du: '2026-11-15', au: '2027-01-15', periodes: 2, montant: 4000 } });
    const d = fake.addCompany('DELTA', { echeance: '2026-08-31', licence: 'Annuelle' });
    r = await call(owner.token, { action: 'addPayment', id: d.id, date: '2026-10-06', periodes: 1, montant: 24000, mode: 'Chèque' });
    expect(r.body).toMatchObject({ echeance: '2027-10-06', paiement: { du: '2026-10-06', au: '2027-10-06' } });
    const e = fake.addCompany('ESSAI', { echeance: null, essai_fin: '2026-10-10' });
    r = await call(owner.token, { action: 'addPayment', id: e.id, date: '2026-01-31', periodes: 1, montant: 2000, mode: 'Espèces' });
    expect(r.body).toMatchObject({ echeance: '2026-02-28' });
    expect(fake.tables.companies.find(x => x.id === e.id)!.echeance).toBe('2026-02-28');
  });
  it('addPayment : refus (compte interne, montant, périodes, mode) et annulation si l’échéance ne peut être enregistrée', async () => {
    const i = fake.addCompany('INT', { interne: true, echeance: null });
    const c = fake.addCompany('ALPHA', { echeance: '2026-11-15' });
    const ok = { action: 'addPayment', id: c.id, date: '2026-10-06', periodes: 1, montant: 2000, mode: 'Virement' };
    expect((await call(owner.token, { ...ok, id: i.id })).status).toBe(400);
    for (const patch of [{ montant: 0 }, { periodes: 0 }, { periodes: 1.5 }, { periodes: 37 }, { mode: 'Troc' }, { date: 'hier' }]) expect((await call(owner.token, { ...ok, ...patch })).status).toBe(400);
    fake.failNext('companies', 'update');
    expect((await call(owner.token, ok)).status).toBe(500);
    expect(fake.tables.license_payments).toHaveLength(0);
    expect(c.echeance).toBe('2026-11-15');
  });
  it('updateCompany, suspend, reactivate, setTarifs', async () => {
    const c = fake.addCompany('ALPHA', { essai_fin: '2026-02-01' }); fake.addCompany('BETA');
    expect((await call(owner.token, { action: 'updateCompany', id: c.id, notes: ' Bon client ' })).status).toBe(200);
    expect(c).toMatchObject({ notes: 'Bon client', code: 'ALPHA', prix: 2000 });
    expect((await call(owner.token, { action: 'updateCompany', id: c.id, code: 'BETA' })).status).toBe(409);
    expect((await call(owner.token, { action: 'updateCompany', id: c.id, prix: 0 })).status).toBe(400);
    expect((await call(owner.token, { action: 'updateCompany', id: c.id, interne: true })).status).toBe(200);
    expect(c).toMatchObject({ interne: true, prix: 0, essai_fin: null, echeance: null });
    expect((await call(owner.token, { action: 'suspend', id: c.id, motif: '' })).status).toBe(400);
    expect((await call(owner.token, { action: 'suspend', id: c.id, motif: 'Impayé' })).status).toBe(200);
    expect(c).toMatchObject({ suspendu: true, motif_suspension: 'Impayé' });
    expect((await call(owner.token, { action: 'reactivate', id: c.id })).status).toBe(200);
    expect(c).toMatchObject({ suspendu: false, motif_suspension: '' });
    expect((await call(owner.token, { action: 'setTarifs', mensuel: 2500, annuel: 27000, essaiJours: 91 })).status).toBe(400);
    expect((await call(owner.token, { action: 'setTarifs', mensuel: 2500, annuel: 27000, essaiJours: 30 })).status).toBe(200);
    expect(fake.tables.platform_settings).toEqual([{ id: 1, tarif_mensuel: 2500, tarif_annuel: 27000, essai_jours: 30 }]);
    expect((await call(owner.token, { action: 'suspend', id: 'nope', motif: 'x' })).status).toBe(404);
  });
  it('deleteCompany : exige le code, supprime les comptes Auth de l’entreprise et elle seule', async () => {
    const a = fake.addCompany('ALPHA'), b = fake.addCompany('BETA');
    const u1 = fake.addUser(a, 'a@alpha.example'), u2 = fake.addUser(a, 'b@alpha.example', 'prf-commercial'), u3 = fake.addUser(b, 'a@beta.example');
    fake.tables.records.push({ company_id: a.id, collection: 'devis', id: 'd1', data: {} }, { company_id: b.id, collection: 'devis', id: 'd1', data: {} });
    expect((await call(owner.token, { action: 'deleteCompany', id: a.id, confirmation: 'alpha' })).status).toBe(400);
    expect((await call(owner.token, { action: 'deleteCompany', id: a.id })).status).toBe(400);
    expect(fake.users).toHaveLength(4);
    fake.authFailures.deleteUser = 'boom';
    expect((await call(owner.token, { action: 'deleteCompany', id: a.id, confirmation: 'ALPHA' })).status).toBe(500);
    expect(fake.tables.companies).toHaveLength(2);                       // rien d'irrécupérable : on peut relancer
    expect((await call(owner.token, { action: 'deleteCompany', id: a.id, confirmation: 'ALPHA' })).status).toBe(200);
    expect(fake.users.map(u => u.id).sort()).toEqual([owner.id, u3.id].sort());
    expect([u1.id, u2.id].some(id => fake.users.some(u => u.id === id))).toBe(false);
    expect(fake.tables.companies.map(c => c.code)).toEqual(['BETA']);
    expect(fake.tables.records).toEqual([expect.objectContaining({ company_id: b.id })]);
    expect(fake.tables.profiles).toEqual([expect.objectContaining({ user_id: u3.id })]);
  });
});
