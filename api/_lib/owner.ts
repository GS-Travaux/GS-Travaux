/* Console du propriétaire de la plateforme : entreprises clientes, licences, paiements, tarifs.
   Accès : jeton valide d'un compte marqué app_metadata.is_owner ET dont l'e-mail est OWNER_EMAIL (revérifié ici). */
import { HttpError, bearerToken, ok, reqStr, str, type ApiRequest, type ApiResponse } from './http.js';
import { authenticate, selectAll, type Deps } from './supabase.js';
import { ownerConfig, safeEqual } from './ownerLogin.js';
import { addJours } from '../../src/lib/format.js';
import { defaultDroits, defaultProfils } from '../../src/lib/rights.js';
import {
  adminIssue, companyIssue, isIsoDate, paiementIssue, paiementPeriode, tarifsIssue,
  type CompanyInput, type PaiementInput,
} from '../../src/owner/rules.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function requireOwner(deps: Deps, req: ApiRequest) {
  const cfg = ownerConfig(deps.env);
  const user = await authenticate(deps.admin, bearerToken(req.headers));
  const meta = (user.app_metadata || {}) as Record<string, unknown>;   // jamais user_metadata
  if (meta.is_owner !== true || meta.company_id || !safeEqual((user.email || '').toLowerCase(), cfg.email)) {
    throw new HttpError(403, 'Accès réservé au propriétaire de la plateforme.');
  }
  return user;
}

function fail(deps: Deps, what: string, message: string): never {
  deps.log(what, message);
  throw new HttpError(500, 'Opération impossible pour le moment.');
}
function check(deps: Deps, r: { error: { message: string } | null }, what: string) { if (r.error) fail(deps, what, r.error.message); }

export function mapPaiement(p: any) {
  return { id: p.id, date: p.date, montant: Number(p.montant), periodes: Number(p.periodes), mode: p.mode, du: p.du, au: p.au };
}
/** Ligne `companies` (snake_case) → type Entreprise de l'application (camelCase, paiements imbriqués). */
export function mapEntreprise(r: any, paiements: any[] = [], nbUtilisateurs = 0) {
  return {
    id: r.id, code: r.code, nom: r.nom, contact: r.contact || '', email: r.email || '', telephone: r.telephone || '',
    licence: r.licence, prix: Number(r.prix || 0), debut: r.debut || '', essaiFin: r.essai_fin || '', echeance: r.echeance || '',
    suspendu: !!r.suspendu, motifSuspension: r.motif_suspension || '', interne: !!r.interne, notes: r.notes || '',
    paiements: paiements.map(mapPaiement), nbUtilisateurs,
  };
}

async function settings(deps: Deps) {
  const r = await deps.admin.from('platform_settings').select('*').eq('id', 1).maybeSingle();
  check(deps, r, 'lecture tarifs');
  const s = r.data || {};
  return { tarifs: { Mensuelle: Number(s.tarif_mensuel ?? 2000), Annuelle: Number(s.tarif_annuel ?? 24000) }, essaiJours: Number(s.essai_jours ?? 14) };
}
async function companyRow(deps: Deps, id: unknown) {
  if (typeof id !== 'string' || !UUID_RE.test(id)) throw new HttpError(404, 'Entreprise introuvable.');
  const r = await deps.admin.from('companies').select('*').eq('id', id).maybeSingle();
  check(deps, r, 'lecture entreprise');
  if (!r.data) throw new HttpError(404, 'Entreprise introuvable.');
  return r.data;
}

async function list(deps: Deps): Promise<ApiResponse> {
  try {
    const [companies, payments, profiles, tarifs] = await Promise.all([
      selectAll(() => deps.admin.from('companies').select('*').order('created_at', { ascending: true })),
      selectAll(() => deps.admin.from('license_payments').select('*').order('date', { ascending: true })),
      selectAll(() => deps.admin.from('profiles').select('company_id,user_id').order('user_id', { ascending: true })),
      settings(deps),
    ]);
    const nb = new Map<string, number>();
    profiles.forEach(p => nb.set(p.company_id, (nb.get(p.company_id) || 0) + 1));
    return ok({
      entreprises: companies.map(c => mapEntreprise(c, payments.filter(p => p.company_id === c.id), nb.get(c.id) || 0)),
      tarifs,
    });
  } catch (e: any) { if (e instanceof HttpError) throw e; return fail(deps, 'liste des entreprises', e?.message); }
}

function companyInput(b: any, base?: any): CompanyInput {
  const pick = (k: string, cur: unknown) => (b[k] === undefined || b[k] === null ? cur : b[k]);
  const interne = pick('interne', base ? !!base.interne : false);
  return {
    code: str(pick('code', base?.code), 60), nom: str(pick('nom', base?.nom), 200), contact: str(pick('contact', base?.contact), 200),
    email: str(pick('email', base?.email), 300).toLowerCase(), telephone: str(pick('telephone', base?.telephone), 100),
    interne, licence: pick('licence', base?.licence ?? 'Mensuelle'),
    prix: interne === true ? 0 : Math.round(Number(pick('prix', base ? Number(base.prix) : NaN)) * 100) / 100,
    debut: pick('debut', base?.debut),
  };
}
const toRow = (c: CompanyInput) => ({ code: c.code, nom: c.nom, contact: c.contact, email: c.email, telephone: c.telephone, interne: c.interne, licence: c.licence, prix: c.prix, debut: c.debut });
const duplicateCode = (m: string) => /duplicate|unique/i.test(m);

async function createCompany(deps: Deps, b: any): Promise<ApiResponse> {
  const s = await settings(deps);
  const licence = b.licence === 'Annuelle' ? 'Annuelle' : b.licence;
  const c = companyInput({ ...b, licence, prix: b.prix ?? s.tarifs[licence as 'Mensuelle' | 'Annuelle'], debut: b.debut ?? deps.now().toISOString().slice(0, 10) });
  const admin = { adminNom: str(b.adminNom, 200), adminEmail: str(b.adminEmail, 300).toLowerCase(), adminPassword: typeof b.adminPassword === 'string' ? b.adminPassword : '' };
  const issue = companyIssue(c) || adminIssue(admin);
  if (issue) throw new HttpError(400, issue);
  if (admin.adminEmail === ownerConfig(deps.env).email) throw new HttpError(400, 'L’adresse du propriétaire ne peut pas servir de compte d’entreprise.');

  const ins = await deps.admin.from('companies')
    .insert({ ...toRow(c), essai_fin: c.interne ? null : addJours(c.debut, s.essaiJours), echeance: null }).select('*').single();
  if (ins.error || !ins.data) {
    if (duplicateCode(ins.error?.message || '')) throw new HttpError(409, 'Ce code société existe déjà.');
    return fail(deps, 'création entreprise', ins.error?.message || 'aucune ligne');
  }
  const company = ins.data;
  let authId = '';
  const rollback = async () => {                                   // rien ne doit rester d'une création incomplète
    if (authId) { const d = await deps.admin.auth.admin.deleteUser(authId); if (d.error) deps.log('annulation : compte Auth orphelin', authId, d.error.message); }
    await deps.admin.from('profiles').delete().eq('company_id', company.id);
    const d = await deps.admin.from('companies').delete().eq('id', company.id);   // rôles et enregistrements suivent (cascade)
    if (d.error) deps.log('annulation : entreprise orpheline', company.id, d.error.message);
  };
  try {
    const droits = defaultDroits();
    const roles = defaultProfils().map(p => ({
      company_id: company.id, id: p.id, nom: p.nom, description: p.description, systeme: !!p.systeme, droits: p.systeme ? {} : (droits[p.id] || {}),
    }));
    const r1 = await deps.admin.from('roles').insert(roles);
    if (r1.error) throw new Error('rôles : ' + r1.error.message);
    const societe = {
      nom: c.nom, statutJuridique: 'Auto-entrepreneur', activite: '', adresse: '', tel: c.telephone, cne: '', ice: '', if_: '',
      taxePro: '', email: c.email, rc: '', cnss: '', natureActivite: 'services',
    };
    const r2 = await deps.admin.from('records').insert({ company_id: company.id, collection: 'societe', id: 'main', data: societe });
    if (r2.error) throw new Error('société : ' + r2.error.message);

    const created = await deps.admin.auth.admin.createUser({
      email: admin.adminEmail, password: admin.adminPassword, email_confirm: true, app_metadata: { company_id: company.id },
    });
    if (created.error || !created.data?.user) {
      const m = created.error?.message || '';
      if (/already|exists|registered|duplicate/i.test(m)) throw new HttpError(409, 'L’adresse e-mail de l’administrateur est déjà utilisée par un autre compte.');
      if (/password/i.test(m)) throw new HttpError(400, 'Mot de passe de l’administrateur refusé : choisissez-en un plus robuste.');
      throw new Error('compte administrateur : ' + m);
    }
    authId = created.data.user.id;
    const r3 = await deps.admin.from('profiles').insert({ user_id: authId, company_id: company.id, nom: admin.adminNom, email: admin.adminEmail, profil_id: 'prf-admin', actif: true });
    if (r3.error) throw new Error('profil administrateur : ' + r3.error.message);
  } catch (e: any) {
    await rollback();
    if (e instanceof HttpError) throw e;
    return fail(deps, 'création entreprise (annulée)', e?.message);
  }
  return ok({ entreprise: mapEntreprise(company, [], 1) });
}

async function updateCompany(deps: Deps, b: any): Promise<ApiResponse> {
  const cur = await companyRow(deps, b.id);
  const c = companyInput(b, cur);
  const issue = companyIssue(c);
  if (issue) throw new HttpError(400, issue);
  const patch: Record<string, unknown> = toRow(c);
  if (c.interne) { patch.essai_fin = null; patch.echeance = null; }
  if (b.notes !== undefined && b.notes !== null) {
    if (typeof b.notes !== 'string' || b.notes.length > 4000) throw new HttpError(400, 'Note trop longue.');
    patch.notes = b.notes.trim();
  }
  const up = await deps.admin.from('companies').update(patch).eq('id', cur.id);
  if (up.error && duplicateCode(up.error.message)) throw new HttpError(409, 'Ce code société existe déjà.');
  check(deps, up, 'modification entreprise');
  return ok();
}

async function addPayment(deps: Deps, b: any): Promise<ApiResponse> {
  const cur = await companyRow(deps, b.id);
  const p: PaiementInput = { date: b.date, periodes: Number(b.periodes), montant: Math.round(Number(b.montant) * 100) / 100, mode: str(b.mode, 40) };
  const issue = paiementIssue({ interne: !!cur.interne }, p);
  if (issue) throw new HttpError(400, issue);
  const { du, au } = paiementPeriode({ licence: cur.licence, echeance: cur.echeance || '' }, p.date, p.periodes);
  const ins = await deps.admin.from('license_payments').insert({ company_id: cur.id, date: p.date, montant: p.montant, periodes: p.periodes, mode: p.mode, du, au }).select('*').single();
  if (ins.error || !ins.data) return fail(deps, 'enregistrement paiement', ins.error?.message || 'aucune ligne');
  // Le premier paiement met fin à l'essai : l'échéance prime sur la date d'essai.
  const up = await deps.admin.from('companies').update({ echeance: au }).eq('id', cur.id);
  if (up.error) {
    const d = await deps.admin.from('license_payments').delete().eq('id', ins.data.id);
    if (d.error) deps.log('annulation paiement', ins.data.id, d.error.message);
    check(deps, up, 'mise à jour échéance');
  }
  return ok({ paiement: mapPaiement(ins.data), echeance: au, suspendu: !!cur.suspendu });
}

async function suspend(deps: Deps, b: any): Promise<ApiResponse> {
  const cur = await companyRow(deps, b.id);
  const motif = reqStr(b.motif, 'motif de la suspension', 200);
  check(deps, await deps.admin.from('companies').update({ suspendu: true, motif_suspension: motif }).eq('id', cur.id), 'suspension');
  return ok();
}
async function reactivate(deps: Deps, b: any): Promise<ApiResponse> {
  const cur = await companyRow(deps, b.id);
  check(deps, await deps.admin.from('companies').update({ suspendu: false, motif_suspension: '' }).eq('id', cur.id), 'réactivation');
  return ok();
}

async function deleteCompany(deps: Deps, b: any): Promise<ApiResponse> {
  const cur = await companyRow(deps, b.id);
  if (typeof b.confirmation !== 'string' || b.confirmation !== cur.code) throw new HttpError(400, 'Confirmation incorrecte : saisissez exactement le code société.');
  // D'abord les comptes Auth (sinon ils resteraient orphelins, la cascade ne remontant pas vers auth.users).
  let users: any[];
  try { users = await selectAll(() => deps.admin.from('profiles').select('*').eq('company_id', cur.id).order('user_id', { ascending: true })); }
  catch (e: any) { return fail(deps, 'lecture utilisateurs', e?.message); }
  for (const u of users) {
    const d = await deps.admin.auth.admin.deleteUser(u.user_id);
    if (d.error && !/not found/i.test(d.error.message)) {
      deps.log('suppression compte', u.user_id, d.error.message);
      throw new HttpError(500, 'Suppression incomplète : certains comptes n’ont pas pu être supprimés. Relancez la suppression.');
    }
  }
  check(deps, await deps.admin.from('profiles').delete().eq('company_id', cur.id), 'suppression utilisateurs');
  check(deps, await deps.admin.from('companies').delete().eq('id', cur.id), 'suppression entreprise');
  return ok({ comptesSupprimes: users.length });
}

async function setTarifs(deps: Deps, b: any): Promise<ApiResponse> {
  const t = { mensuel: Math.round(Number(b.mensuel) * 100) / 100, annuel: Math.round(Number(b.annuel) * 100) / 100, essaiJours: Number(b.essaiJours) };
  const issue = tarifsIssue(t);
  if (issue) throw new HttpError(400, issue);
  check(deps, await deps.admin.from('platform_settings').upsert({ id: 1, tarif_mensuel: t.mensuel, tarif_annuel: t.annuel, essai_jours: t.essaiJours }), 'tarifs');
  return ok();
}

export async function handleOwner(deps: Deps, req: ApiRequest): Promise<ApiResponse> {
  await requireOwner(deps, req);
  const b = req.body || {};
  switch (b.action) {
    case 'list': return list(deps);
    case 'createCompany': return createCompany(deps, b);
    case 'updateCompany': return updateCompany(deps, b);
    case 'addPayment': return addPayment(deps, b);
    case 'suspend': return suspend(deps, b);
    case 'reactivate': return reactivate(deps, b);
    case 'deleteCompany': return deleteCompany(deps, b);
    case 'setTarifs': return setTarifs(deps, b);
    default: throw new HttpError(400, 'Action inconnue.');
  }
}
