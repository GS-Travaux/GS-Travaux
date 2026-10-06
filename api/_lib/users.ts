/* Gestion des utilisateurs d'une entreprise (créer / modifier / supprimer / réinitialiser), réservée à un
   administrateur ACTIF de cette entreprise. Rien de ce que dit le navigateur n'est cru : l'entreprise vient du
   jeton vérifié (app_metadata, non modifiable par l'utilisateur), le rôle est relu en base à chaque appel. */
import { HttpError, appUrl, bearerToken, ok, reqStr, type ApiRequest, type ApiResponse } from './http.js';
import { authenticate, type Deps } from './supabase.js';
import { isEmail, passwordIssue } from '../../src/owner/rules.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOT_FOUND = 'Utilisateur introuvable.';
const BAN_FOREVER = '876000h';

interface Caller { userId: string; companyId: string }

function db(deps: Deps, r: { error: { message: string } | null }, what: string) {
  if (r.error) { deps.log(what, r.error.message); throw new HttpError(500, 'Opération impossible pour le moment.'); }
}

/** Vérifie que l'appelant est un administrateur actif d'une entreprise dont l'accès n'est pas bloqué. */
export async function requireCompanyAdmin(deps: Deps, req: ApiRequest): Promise<Caller> {
  const user = await authenticate(deps.admin, bearerToken(req.headers));
  const companyId = (user.app_metadata as any)?.company_id;        // jamais user_metadata (modifiable par l'utilisateur)
  const forbidden = new HttpError(403, 'Action réservée à l’administrateur de l’entreprise.');
  if (typeof companyId !== 'string' || !companyId) throw forbidden;

  const p = await deps.admin.from('profiles').select('*').eq('user_id', user.id).maybeSingle();
  db(deps, p, 'lecture profil appelant');
  if (!p.data || p.data.company_id !== companyId || !p.data.actif) throw forbidden;
  const r = await deps.admin.from('roles').select('*').eq('company_id', companyId).eq('id', p.data.profil_id).maybeSingle();
  db(deps, r, 'lecture rôle appelant');
  if (!r.data || r.data.systeme !== true) throw forbidden;

  const c = await deps.admin.from('companies').select('*').eq('id', companyId).maybeSingle();
  db(deps, c, 'lecture entreprise');
  if (!c.data) throw forbidden;
  const today = deps.now().toISOString().slice(0, 10);
  const limite = c.data.echeance || c.data.essai_fin || '';
  if (c.data.suspendu || (!c.data.interne && !(limite && limite >= today))) throw new HttpError(403, 'Licence expirée ou accès suspendu : modification refusée.');
  return { userId: user.id, companyId };
}

async function roleOf(deps: Deps, companyId: string, profilId: string) {
  const r = await deps.admin.from('roles').select('*').eq('company_id', companyId).eq('id', profilId).maybeSingle();
  db(deps, r, 'lecture rôle');
  return r.data as { id: string; nom: string; systeme: boolean } | null;
}
/** Cible de l'opération : doit appartenir à l'entreprise de l'appelant (même réponse si elle existe ailleurs). */
async function targetOf(deps: Deps, caller: Caller, id: unknown) {
  if (typeof id !== 'string' || !UUID_RE.test(id)) throw new HttpError(404, NOT_FOUND);
  const r = await deps.admin.from('profiles').select('*').eq('user_id', id).eq('company_id', caller.companyId).maybeSingle();
  db(deps, r, 'lecture utilisateur cible');
  if (!r.data || r.data.company_id !== caller.companyId) throw new HttpError(404, NOT_FOUND);
  return r.data as { user_id: string; company_id: string; nom: string; email: string; profil_id: string; actif: boolean };
}
/** Nombre d'administrateurs actifs de l'entreprise. */
async function activeAdmins(deps: Deps, companyId: string): Promise<string[]> {
  const [ro, pr] = await Promise.all([
    deps.admin.from('roles').select('*').eq('company_id', companyId).eq('systeme', true),
    deps.admin.from('profiles').select('*').eq('company_id', companyId).eq('actif', true),
  ]);
  db(deps, ro, 'lecture rôles'); db(deps, pr, 'lecture utilisateurs');
  const sys = new Set((ro.data || []).map((r: any) => r.id));
  return (pr.data || []).filter((p: any) => sys.has(p.profil_id)).map((p: any) => p.user_id);
}
const LAST_ADMIN = 'Opération refusée : l’entreprise doit conserver au moins un administrateur actif.';

async function create(deps: Deps, caller: Caller, b: any): Promise<ApiResponse> {
  const nom = reqStr(b.nom, 'nom', 120);
  const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
  if (!isEmail(email)) throw new HttpError(400, 'Adresse e-mail invalide.');
  const issue = passwordIssue(b.password);
  if (issue) throw new HttpError(400, issue);
  const role = await roleOf(deps, caller.companyId, reqStr(b.profilId, 'profil', 80));
  if (!role) throw new HttpError(400, 'Profil inconnu.');
  // Message volontairement vague : ne pas révéler qu'une adresse appartient à un compte d'une autre entreprise.
  const refuse = new HttpError(409, 'Impossible de créer un compte avec cette adresse e-mail.');
  if (email === (deps.env.OWNER_EMAIL || '').trim().toLowerCase()) throw refuse;

  const created = await deps.admin.auth.admin.createUser({
    email, password: b.password, email_confirm: true, app_metadata: { company_id: caller.companyId },
  });
  if (created.error || !created.data?.user) {
    const m = created.error?.message || '';
    if (/already|exists|registered|duplicate/i.test(m)) throw refuse;
    if (/password/i.test(m)) throw new HttpError(400, 'Mot de passe refusé : choisissez-en un plus robuste.');
    deps.log('création compte', m); throw new HttpError(500, 'Création du compte impossible pour le moment.');
  }
  const id = created.data.user.id;
  const ins = await deps.admin.from('profiles').insert({ user_id: id, company_id: caller.companyId, nom, email, profil_id: role.id, actif: true });
  if (ins.error) {
    const del = await deps.admin.auth.admin.deleteUser(id);          // pas de compte Auth orphelin
    if (del.error) deps.log('annulation création : compte Auth orphelin', id, del.error.message);
    db(deps, ins, 'insertion profil');
  }
  return ok({ user: { id, nom, email, profilId: role.id, profil: role.nom, actif: true } });
}

async function update(deps: Deps, caller: Caller, b: any): Promise<ApiResponse> {
  const t = await targetOf(deps, caller, b.id);
  const patch: Record<string, unknown> = {};
  if (b.nom !== undefined && b.nom !== null) patch.nom = reqStr(b.nom, 'nom', 120);
  if (b.actif !== undefined && b.actif !== null) {
    if (typeof b.actif !== 'boolean') throw new HttpError(400, 'Champ obligatoire ou invalide : actif.');
    if (b.actif !== t.actif) patch.actif = b.actif;
  }
  let newRole: Awaited<ReturnType<typeof roleOf>> = null;
  if (b.profilId !== undefined && b.profilId !== null && b.profilId !== t.profil_id) {
    newRole = await roleOf(deps, caller.companyId, reqStr(b.profilId, 'profil', 80));
    if (!newRole) throw new HttpError(400, 'Profil inconnu.');
    patch.profil_id = newRole.id;
  }
  if (!Object.keys(patch).length) return ok();

  const curRole = await roleOf(deps, caller.companyId, t.profil_id);
  const wasAdmin = !!curRole?.systeme && t.actif;
  const staysAdmin = (newRole ? !!newRole.systeme : !!curRole?.systeme) && (patch.actif === undefined ? t.actif : patch.actif === true);
  if (wasAdmin && !staysAdmin) {
    const others = (await activeAdmins(deps, caller.companyId)).filter(id => id !== t.user_id);
    if (!others.length) throw new HttpError(409, LAST_ADMIN);
  }
  if (t.user_id === caller.userId) {
    if (patch.actif === false) throw new HttpError(409, 'Vous ne pouvez pas désactiver votre propre compte.');
    if (patch.profil_id !== undefined) throw new HttpError(409, 'Le profil du compte connecté n’est pas modifiable.');
  }

  const up = await deps.admin.from('profiles').update(patch).eq('user_id', t.user_id).eq('company_id', caller.companyId);
  db(deps, up, 'mise à jour utilisateur');
  const revert = async () => {
    const r = await deps.admin.from('profiles').update({ nom: t.nom, profil_id: t.profil_id, actif: t.actif }).eq('user_id', t.user_id).eq('company_id', caller.companyId);
    if (r.error) deps.log('annulation mise à jour utilisateur', r.error.message);
  };
  // Deux administrateurs qui se rétrogradent l'un l'autre au même instant : on revérifie après coup.
  if (wasAdmin && !staysAdmin && !(await activeAdmins(deps, caller.companyId)).length) { await revert(); throw new HttpError(409, LAST_ADMIN); }
  if (patch.actif !== undefined) {
    // Un compte désactivé ne peut plus se connecter ni renouveler sa session.
    const ban = await deps.admin.auth.admin.updateUserById(t.user_id, { ban_duration: patch.actif ? 'none' : BAN_FOREVER } as any);
    if (ban.error) { await revert(); db(deps, ban, 'blocage du compte'); }
  }
  return ok();
}

async function remove(deps: Deps, caller: Caller, b: any): Promise<ApiResponse> {
  const t = await targetOf(deps, caller, b.id);
  const role = await roleOf(deps, caller.companyId, t.profil_id);
  if (role?.systeme && t.actif) {
    const others = (await activeAdmins(deps, caller.companyId)).filter(id => id !== t.user_id);
    if (!others.length) throw new HttpError(409, LAST_ADMIN);
  }
  if (t.user_id === caller.userId) throw new HttpError(409, 'Vous ne pouvez pas supprimer votre propre compte.');
  const del = await deps.admin.auth.admin.deleteUser(t.user_id);     // la ligne profiles suit (on delete cascade)
  if (del.error && !/not found/i.test(del.error.message)) db(deps, del, 'suppression compte');
  const row = await deps.admin.from('profiles').delete().eq('user_id', t.user_id).eq('company_id', caller.companyId);
  if (row.error) deps.log('suppression profil', row.error.message);
  return ok();
}

async function reset(deps: Deps, caller: Caller, req: ApiRequest): Promise<ApiResponse> {
  const t = await targetOf(deps, caller, req.body.id);
  if (!t.actif) throw new HttpError(409, 'Ce compte est désactivé : réactivez-le avant d’envoyer un e-mail.');
  const r = await deps.admin.auth.resetPasswordForEmail(t.email, { redirectTo: appUrl(deps.env, req.headers) });
  if (r.error) {
    deps.log('e-mail de réinitialisation', r.error.message);
    throw new HttpError(/rate|too many|seconds/i.test(r.error.message) ? 429 : 502, 'Envoi de l’e-mail impossible pour le moment. Réessayez dans quelques minutes.');
  }
  return ok();
}

export async function handleUsers(deps: Deps, req: ApiRequest): Promise<ApiResponse> {
  const caller = await requireCompanyAdmin(deps, req);
  const b = req.body || {};
  switch (b.action) {
    case 'create': return create(deps, caller, b);
    case 'update': return update(deps, caller, b);
    case 'delete': return remove(deps, caller, b);
    case 'reset': return reset(deps, caller, req);
    default: throw new HttpError(400, 'Action inconnue.');
  }
}
