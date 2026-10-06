import { beforeEach, describe, expect, it } from 'vitest';
import { FakeSupabase, auth, fakeDeps } from './fakeSupabase.js';
import { run } from './http.js';
import { handleUsers } from './users.js';

let fake: FakeSupabase; let deps: ReturnType<typeof fakeDeps>;
let A: any, B: any, admin: { id: string; token: string }, commercial: { id: string; token: string }, autre: { id: string; token: string };
const call = (token: string, body: any, headers: any = {}) => run(r => handleUsers(deps, r), { headers: { ...(token ? auth(token) : {}), ...headers }, body });

beforeEach(() => {
  fake = new FakeSupabase(); deps = fakeDeps(fake);
  A = fake.addCompany('ALPHA'); B = fake.addCompany('BETA');
  admin = fake.addUser(A, 'admin@alpha.example');
  commercial = fake.addUser(A, 'com@alpha.example', 'prf-commercial');
  autre = fake.addUser(B, 'admin@beta.example');
});
const nouveau = { action: 'create', nom: 'Sara', email: 'Sara@Alpha.example', password: 'Bonjour123', profilId: 'prf-commercial' };

describe('/api/users — accès', () => {
  it('refuse sans jeton ou avec un jeton invalide', async () => {
    expect((await call('', nouveau)).status).toBe(401);
    expect((await call('x'.repeat(40), nouveau)).status).toBe(401);
    expect(fake.users).toHaveLength(3);
  });
  it('refuse un utilisateur non administrateur', async () => {
    const r = await call(commercial.token, nouveau);
    expect(r.status).toBe(403);
    expect(fake.users).toHaveLength(3);
  });
  it('refuse un administrateur désactivé', async () => {
    fake.tables.profiles.find(p => p.user_id === admin.id)!.actif = false;
    expect((await call(admin.token, nouveau)).status).toBe(403);
  });
  it('ne lit jamais company_id ni le rôle dans user_metadata', async () => {
    const intrus = fake.addUser(null, 'intrus@x.example', 'prf-admin', { user_metadata: { company_id: A.id, is_owner: true, systeme: true } });
    expect((await call(intrus.token, nouveau)).status).toBe(403);
  });
  it('refuse un compte dont le jeton désigne une autre entreprise que sa ligne profiles', async () => {
    const u = fake.addUser(B, 'x@beta.example', 'prf-admin', { app_metadata: { company_id: A.id } });
    expect((await call(u.token, nouveau)).status).toBe(403);
  });
  it('refuse si l’entreprise est suspendue ou sa licence expirée', async () => {
    A.suspendu = true;
    expect((await call(admin.token, nouveau)).status).toBe(403);
    A.suspendu = false; A.echeance = '2026-01-31';
    expect((await call(admin.token, nouveau)).status).toBe(403);
  });
  it('refuse une action inconnue', async () => { expect((await call(admin.token, { action: 'promote' })).status).toBe(400); });
});

describe('/api/users — create', () => {
  it('crée le compte Auth (app_metadata.company_id de l’appelant) et la ligne profiles', async () => {
    const r = await call(admin.token, { ...nouveau, company_id: B.id, companyId: B.id });
    expect(r.status).toBe(200);
    const user = (r.body as any).user;
    expect(user).toMatchObject({ nom: 'Sara', email: 'sara@alpha.example', profilId: 'prf-commercial', profil: 'Commercial', actif: true });
    const au = fake.users.find(u => u.id === user.id)!;
    expect(au.app_metadata).toEqual({ company_id: A.id });
    expect(au.user_metadata).toEqual({});
    expect(fake.tables.profiles.find(p => p.user_id === user.id)).toMatchObject({ company_id: A.id, profil_id: 'prf-commercial' });
  });
  it('valide e-mail, mot de passe et profil', async () => {
    expect((await call(admin.token, { ...nouveau, email: 'pas-un-email' })).status).toBe(400);
    expect((await call(admin.token, { ...nouveau, password: 'court1' })).status).toBe(400);
    expect((await call(admin.token, { ...nouveau, password: 'sanschiffres' })).status).toBe(400);
    expect((await call(admin.token, { ...nouveau, nom: '  ' })).status).toBe(400);
    expect((await call(admin.token, { ...nouveau, profilId: 'prf-inconnu' })).status).toBe(400);
    expect(fake.users).toHaveLength(3);
  });
  it('refuse un profil qui n’existe que dans une autre entreprise', async () => {
    fake.tables.roles.push({ company_id: B.id, id: 'prf-special', nom: 'Spécial', systeme: true, droits: {} });
    expect((await call(admin.token, { ...nouveau, profilId: 'prf-special' })).status).toBe(400);
  });
  it('annule le compte Auth si l’insertion du profil échoue', async () => {
    fake.failNext('profiles', 'insert');
    const r = await call(admin.token, nouveau);
    expect(r.status).toBe(500);
    expect((r.body as any).error).not.toMatch(/boom/);
    expect(fake.users.some(u => u.email === 'sara@alpha.example')).toBe(false);
    expect(fake.tables.profiles).toHaveLength(3);
  });
  it('adresse déjà utilisée (même ailleurs) : message générique, rien de créé', async () => {
    const r = await call(admin.token, { ...nouveau, email: 'admin@beta.example' });
    expect(r.status).toBe(409);
    expect((r.body as any).error).toBe('Impossible de créer un compte avec cette adresse e-mail.');
    const o = await call(admin.token, { ...nouveau, email: 'proprio@exemple.com' });
    expect((o.body as any).error).toBe((r.body as any).error);
    expect(fake.users).toHaveLength(3);
  });
});

describe('/api/users — update / delete / reset', () => {
  it('refus inter-entreprises : même réponse que pour un identifiant inexistant, aucune modification', async () => {
    for (const action of ['update', 'delete', 'reset']) {
      const r = await call(admin.token, { action, id: autre.id, nom: 'Piraté', actif: false });
      const inconnu = await call(admin.token, { action, id: '11111111-1111-4111-8111-111111111111', nom: 'x' });
      expect(r.status).toBe(404);
      expect(r.body).toEqual(inconnu.body);
    }
    expect(fake.tables.profiles.find(p => p.user_id === autre.id)).toMatchObject({ nom: 'admin', actif: true });
    expect(fake.users.some(u => u.id === autre.id)).toBe(true);
    expect(fake.resets).toHaveLength(0);
  });
  it('modifie le nom et le profil, désactive (compte bloqué) puis réactive', async () => {
    expect((await call(admin.token, { action: 'update', id: commercial.id, nom: 'Nouveau nom', profilId: 'prf-admin' })).status).toBe(200);
    expect(fake.tables.profiles.find(p => p.user_id === commercial.id)).toMatchObject({ nom: 'Nouveau nom', profil_id: 'prf-admin', actif: true });
    expect((await call(admin.token, { action: 'update', id: commercial.id, actif: false })).status).toBe(200);
    expect(fake.users.find(u => u.id === commercial.id)!.banned).toBe(true);
    expect((await call(admin.token, { action: 'update', id: commercial.id, actif: true })).status).toBe(200);
    expect(fake.users.find(u => u.id === commercial.id)!.banned).toBe(false);
  });
  it('refuse un profil inconnu', async () => {
    expect((await call(admin.token, { action: 'update', id: commercial.id, profilId: 'prf-x' })).status).toBe(400);
  });
  it('protège le dernier administrateur actif (désactivation, rétrogradation, suppression)', async () => {
    for (const body of [{ action: 'update', actif: false }, { action: 'update', profilId: 'prf-commercial' }, { action: 'delete' }]) {
      const r = await call(admin.token, { ...body, id: admin.id });
      expect(r.status).toBe(409);
      expect((r.body as any).error).toMatch(/au moins un administrateur/);
    }
    expect(fake.tables.profiles.find(p => p.user_id === admin.id)).toMatchObject({ profil_id: 'prf-admin', actif: true });
    expect(fake.users.some(u => u.id === admin.id)).toBe(true);
  });
  it('un administrateur désactivé ne compte pas comme administrateur restant', async () => {
    const second = fake.addUser(A, 'admin2@alpha.example', 'prf-admin', { actif: false });
    expect((await call(admin.token, { action: 'delete', id: admin.id })).status).toBe(409);
    expect((await call(admin.token, { action: 'delete', id: second.id })).status).toBe(200);
  });
  it('avec deux administrateurs : on ne peut ni se désactiver, ni se rétrograder, ni se supprimer soi-même', async () => {
    const second = fake.addUser(A, 'admin2@alpha.example');
    expect((await call(admin.token, { action: 'update', id: admin.id, actif: false })).status).toBe(409);
    expect((await call(admin.token, { action: 'update', id: admin.id, profilId: 'prf-commercial' })).status).toBe(409);
    expect((await call(admin.token, { action: 'delete', id: admin.id })).status).toBe(409);
    expect((await call(admin.token, { action: 'update', id: admin.id, nom: 'Moi' })).status).toBe(200);     // son nom, oui
    expect((await call(admin.token, { action: 'update', id: second.id, profilId: 'prf-commercial' })).status).toBe(200);
  });
  it('annule la désactivation si le blocage du compte échoue', async () => {
    fake.authFailures.updateUser = 'boom';
    expect((await call(admin.token, { action: 'update', id: commercial.id, actif: false })).status).toBe(500);
    expect(fake.tables.profiles.find(p => p.user_id === commercial.id)!.actif).toBe(true);
  });
  it('supprime le compte Auth et la ligne profiles', async () => {
    expect((await call(admin.token, { action: 'delete', id: commercial.id })).status).toBe(200);
    expect(fake.users.some(u => u.id === commercial.id)).toBe(false);
    expect(fake.tables.profiles.some(p => p.user_id === commercial.id)).toBe(false);
  });
  it('reset : e-mail envoyé à la cible, lien vers PUBLIC_APP_URL sinon vers l’hôte (jamais l’en-tête Origin)', async () => {
    expect((await call(admin.token, { action: 'reset', id: commercial.id }, { origin: 'https://pirate.example' })).status).toBe(200);
    expect(fake.resets[0]).toEqual({ email: 'com@alpha.example', redirectTo: 'https://app.exemple.ma/' });
    deps = fakeDeps(fake, { PUBLIC_APP_URL: 'https://gestion.exemple.ma/' });
    await call(admin.token, { action: 'reset', id: commercial.id });
    expect(fake.resets[1].redirectTo).toBe('https://gestion.exemple.ma/');
  });
});
