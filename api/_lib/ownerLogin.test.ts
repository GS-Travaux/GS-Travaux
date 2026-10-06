import { beforeEach, describe, expect, it } from 'vitest';
import { FakeSupabase, fakeDeps } from './fakeSupabase.js';
import { run } from './http.js';
import { FAIL_DELAY_MS, FailureLimiter, handleOwnerLogin, safeEqual, type OwnerLoginDeps } from './ownerLogin.js';

let fake: FakeSupabase; let deps: OwnerLoginDeps; let slept: number[];
const login = (body: any, ip = '198.51.100.7') => run(r => handleOwnerLogin(deps, r), { body, ip });
const bons = { email: 'proprio@exemple.com', password: 'Tr3s-long-secret' };
function setup(env: Record<string, string> = {}) {
  fake = new FakeSupabase(); slept = [];
  deps = { ...fakeDeps(fake, env), anon: fake as any, limiter: new FailureLimiter(), sleep: async ms => { slept.push(ms); } };
}
beforeEach(() => setup());

describe('/api/owner-login', () => {
  it('mauvais mot de passe ou mauvais e-mail : 401 générique, délai, aucun compte créé', async () => {
    const a = await login({ ...bons, password: 'faux' });
    const b = await login({ ...bons, email: 'autre@exemple.com' });
    const c = await login({});
    for (const r of [a, b, c]) { expect(r.status).toBe(401); expect(r.body).toEqual({ error: 'Identifiants incorrects.' }); }
    expect(slept).toEqual([FAIL_DELAY_MS, FAIL_DELAY_MS, FAIL_DELAY_MS]);
    expect(fake.users).toHaveLength(0);
    expect(fake.calls).toHaveLength(0);
  });
  it('bon mot de passe : crée le compte (is_owner dans app_metadata uniquement) et renvoie la session', async () => {
    const r = await login({ email: ' Proprio@Exemple.COM ', password: bons.password });
    expect(r.status).toBe(200);
    expect(Object.keys(r.body as any).sort()).toEqual(['access_token', 'refresh_token']);
    expect(fake.users).toHaveLength(1);
    expect(fake.users[0]).toMatchObject({ email: 'proprio@exemple.com', app_metadata: { is_owner: true }, user_metadata: {} });
    expect((await fake.auth.getUser((r.body as any).access_token)).data.user!.id).toBe(fake.users[0].id);
  });
  it('connexions suivantes : réutilise le compte existant', async () => {
    await login(bons); const id = fake.users[0].id;
    expect((await login(bons)).status).toBe(200);
    expect(fake.users.map(u => u.id)).toEqual([id]);
  });
  it('mot de passe changé dans l’environnement : le compte est recréé avec le nouveau', async () => {
    await login(bons); const ancien = fake.users[0].id;
    deps.env.OWNER_PASSWORD = 'Nouveau-secret-2';
    expect((await login(bons)).status).toBe(401);
    expect((await login({ ...bons, password: 'Nouveau-secret-2' })).status).toBe(200);
    expect(fake.users).toHaveLength(1);
    expect(fake.users[0].id).not.toBe(ancien);
    expect(fake.users[0].password).toBe('Nouveau-secret-2');
  });
  it('ne promeut jamais un compte préexistant : il est remplacé (même s’il se dit propriétaire dans user_metadata)', async () => {
    const squat = fake.addUser(null, 'proprio@exemple.com', '', { user_metadata: { is_owner: true } });
    const r = await login(bons);
    expect(r.status).toBe(200);
    expect(fake.users).toHaveLength(1);
    expect(fake.users[0].id).not.toBe(squat.id);
    expect((await fake.auth.getUser(squat.token)).error).toBeTruthy();   // l'ancienne session ne vaut plus rien
  });
  it('refuse si OWNER_EMAIL est un compte d’entreprise (ne le modifie pas)', async () => {
    const c = fake.addCompany('ALPHA'); const u = fake.addUser(c, 'proprio@exemple.com');
    expect((await login(bons)).status).toBe(409);
    expect(fake.users.find(x => x.id === u.id)).toMatchObject({ password: 'Motdepasse1', app_metadata: { company_id: c.id } });
  });
  it('limite les échecs par adresse IP, sans bloquer les autres adresses', async () => {
    for (let i = 0; i < 5; i++) expect((await login({ ...bons, password: 'faux' + i })).status).toBe(401);
    const r = await login(bons);
    expect(r.status).toBe(429);
    expect(Number(r.headers!['Retry-After'])).toBeGreaterThan(0);
    expect(fake.users).toHaveLength(0);
    expect((await login(bons, '198.51.100.8')).status).toBe(200);
    deps.now = () => new Date('2026-10-06T10:16:00Z');                    // fenêtre de 15 minutes écoulée
    expect((await login(bons)).status).toBe(200);
  });
  it('503 si le serveur n’est pas configuré', async () => {
    setup({ OWNER_PASSWORD: '' });
    expect((await login({ email: bons.email, password: '' })).status).toBe(503);
  });
  it('safeEqual compare des chaînes de longueurs différentes sans erreur', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abcd')).toBe(false);
    expect(safeEqual('', 'x')).toBe(false);
  });
});
