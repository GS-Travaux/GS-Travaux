/* Mode en ligne : Supabase Auth + Postgres. L'isolation entre entreprises et les droits par profil
   sont appliqués par la base (RLS) ; ce code ne fait aucune confiance à l'interface. */
import type { DroitsMap, DroitsParOnglet, Entreprise, Profil, RecordCollection, State, Utilisateur } from '../lib/types';
import { RECORD_COLLECTIONS, SOCIETE_ID } from '../lib/types';
import { emptyState } from './seed';
import { licenceBlocage } from '../lib/licence';
import { Backend, AuthEvent, AuthStatus, BackendError, Change, LoadedData, NewUser } from './backend';
import { callApi, getSupabase } from './supabaseClient';

const PAGE = 1000;

export function frenchAuthError(message: string): string {
  const m = (message || '').toLowerCase();
  if (m.includes('invalid login')) return 'E-mail ou mot de passe incorrect.';
  if (m.includes('email not confirmed')) return 'Adresse e-mail non confirmée.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Trop de tentatives. Réessayez dans quelques minutes.';
  if (m.includes('same password') || m.includes('different from the old')) return 'Le nouveau mot de passe doit être différent de l’ancien.';
  if (m.includes('password') && (m.includes('weak') || m.includes('at least') || m.includes('characters'))) return 'Mot de passe trop faible (8 caractères minimum, lettres et chiffres).';
  if (m.includes('failed to fetch') || m.includes('network')) return 'Connexion impossible. Vérifiez votre accès Internet.';
  return message || 'Une erreur est survenue.';
}

function mapEntreprise(r: any, paiements: any[] = []): Entreprise {
  return {
    id: r.id, code: r.code, nom: r.nom, contact: r.contact || '', email: r.email || '', telephone: r.telephone || '',
    licence: r.licence, prix: Number(r.prix || 0), debut: r.debut || '', essaiFin: r.essai_fin || '', echeance: r.echeance || '',
    suspendu: !!r.suspendu, motifSuspension: r.motif_suspension || '', interne: !!r.interne, notes: r.notes || '',
    paiements: paiements.map(p => ({ id: p.id, date: p.date, montant: Number(p.montant), periodes: p.periodes, mode: p.mode, du: p.du, au: p.au })),
  };
}

export class SupabaseBackend implements Backend {
  readonly mode = 'supabase' as const;
  private sb = getSupabase();

  private roleOf(user: any): 'user' | 'owner' { return user?.app_metadata?.is_owner === true ? 'owner' : 'user'; }

  async init(): Promise<AuthStatus> {
    const hash = typeof location !== 'undefined' ? location.hash : '';
    const { data } = await this.sb.auth.getSession();
    if (hash.includes('type=recovery')) return { status: 'recovery' };
    const u = data.session?.user;
    return u ? { status: 'signed_in', role: this.roleOf(u), email: u.email || '' } : { status: 'signed_out' };
  }

  onAuthEvent(cb: (e: AuthEvent) => void) {
    const { data } = this.sb.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') cb('SIGNED_OUT');
      else if (event === 'PASSWORD_RECOVERY') cb('PASSWORD_RECOVERY');
      else if (event === 'SIGNED_IN') cb('SIGNED_IN');
    });
    return () => data.subscription.unsubscribe();
  }

  async signIn(email: string, password: string): Promise<AuthStatus> {
    const { data, error } = await this.sb.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw new BackendError('auth', frenchAuthError(error.message));
    return { status: 'signed_in', role: this.roleOf(data.user), email: data.user?.email || email };
  }
  async signOut() { await this.sb.auth.signOut(); }

  async sendPasswordReset(email: string) {
    const { error } = await this.sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: location.origin + '/' });
    if (error && !/not found|no user/i.test(error.message)) throw new BackendError('auth', frenchAuthError(error.message));
  }
  async setNewPassword(password: string) {
    const { error } = await this.sb.auth.updateUser({ password });
    if (error) throw new BackendError('auth', frenchAuthError(error.message));
  }
  async changePassword(current: string, next: string) {
    const { data } = await this.sb.auth.getUser();
    const email = data.user?.email;
    if (!email) throw new BackendError('auth', 'Session expirée. Reconnectez-vous.');
    const chk = await this.sb.auth.signInWithPassword({ email, password: current });
    if (chk.error) throw new BackendError('auth', 'Mot de passe actuel incorrect.');
    await this.setNewPassword(next);
  }

  async load(): Promise<LoadedData> {
    const { data: ud, error: ue } = await this.sb.auth.getUser();
    if (ue || !ud.user) throw new BackendError('auth', 'Session expirée. Reconnectez-vous.');
    const user = ud.user;
    const companyId = user.app_metadata?.company_id as string | undefined;
    if (!companyId) throw new BackendError('no_company', 'Ce compte n’est rattaché à aucune entreprise. Contactez l’éditeur.');

    const [co, pr, ro] = await Promise.all([
      this.sb.from('companies').select('id,code,nom,licence,debut,essai_fin,echeance,suspendu,motif_suspension,interne,created_at').eq('id', companyId).maybeSingle(),
      this.sb.from('profiles').select('*').eq('company_id', companyId),
      this.sb.from('roles').select('*').eq('company_id', companyId),
    ]);
    for (const r of [co, pr, ro]) if (r.error) throw new BackendError('db', r.error.message);
    if (!co.data) throw new BackendError('no_company', 'Entreprise introuvable.');
    const company = mapEntreprise(co.data);
    // Entreprise suspendue / licence expirée : la base ne renvoie plus que cette ligne (ni profils, ni rôles, ni données).
    const blocage = licenceBlocage(company);
    if (blocage) throw new BackendError('licence', blocage);

    const profils: Profil[] = (ro.data || []).map((r: any) => ({ id: r.id, nom: r.nom, description: r.description || '', systeme: !!r.systeme }));
    const droits: DroitsMap = {};
    (ro.data || []).forEach((r: any) => { if (!r.systeme) droits[r.id] = r.droits || {}; });
    const utilisateurs: Utilisateur[] = (pr.data || []).map((p: any) => ({
      id: p.user_id, nom: p.nom, email: p.email, profilId: p.profil_id,
      profil: (profils.find(x => x.id === p.profil_id) || { nom: '' }).nom, actif: !!p.actif,
    }));
    const me = utilisateurs.find(u => u.id === user.id);
    if (!me) throw new BackendError('no_profile', 'Profil utilisateur introuvable. Contactez l’administrateur.');
    if (!me.actif) throw new BackendError('inactive', 'Ce compte a été désactivé. Contactez l’administrateur.');

    const state: any = emptyState(company.nom);
    state.profils = profils; state.droits = droits; state.utilisateurs = utilisateurs;
    RECORD_COLLECTIONS.forEach(c => { state[c] = []; });

    // Les enregistrements sont lus par pages de 1000 (limite de l'API), du plus récent au plus ancien.
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await this.sb.from('records').select('collection,id,data').eq('company_id', companyId)
        .order('seq', { ascending: false }).range(from, from + PAGE - 1);
      if (error) {
        if (/licen/i.test(error.message)) throw new BackendError('licence', error.message);
        throw new BackendError('db', error.message);
      }
      for (const row of data || []) {
        if (row.collection === 'societe') { if (row.id === SOCIETE_ID) state.societe = { ...state.societe, ...row.data }; }
        else if ((RECORD_COLLECTIONS as readonly string[]).includes(row.collection)) state[row.collection as RecordCollection].push(row.data);
      }
      if (!data || data.length < PAGE) break;
    }
    return { state: state as State, company, me };
  }

  async save(changes: Change[]) {
    if (!changes.length) return;
    const payload = changes.map(c => ({ collection: c.collection, id: c.id, op: c.op, data: c.op === 'upsert' ? c.data : null }));
    const { error } = await this.sb.rpc('apply_changes', { changes: payload });
    if (error) {
      if (/licen/i.test(error.message)) throw new BackendError('licence', 'Licence expirée ou accès suspendu : modification refusée.');
      if (/droit|permission|policy|denied/i.test(error.message)) throw new BackendError('forbidden', 'Vous n’avez pas le droit d’effectuer cette modification.');
      throw new BackendError('db', error.message);
    }
  }

  private async companyId(): Promise<string> {
    const { data } = await this.sb.auth.getUser();
    return data.user?.app_metadata?.company_id as string;
  }

  /** Une règle RLS qui refuse un UPDATE / DELETE ne renvoie pas d'erreur : on vérifie qu'une ligne a bien été touchée. */
  private touched(rows: unknown[] | null) {
    if (!rows || !rows.length) throw new BackendError('forbidden', 'Action refusée : réservée à l\u2019administrateur.');
  }

  async saveProfil(p: Profil) {
    const company_id = await this.companyId();
    const { data: ex } = await this.sb.from('roles').select('id').eq('company_id', company_id).eq('id', p.id).maybeSingle();
    if (ex) {
      const { data, error } = await this.sb.from('roles').update({ nom: p.nom, description: p.description }).eq('company_id', company_id).eq('id', p.id).select('id');
      if (error) throw new BackendError('db', /duplicate|unique/i.test(error.message) ? 'Un profil porte déjà ce nom.' : error.message);
      this.touched(data);
    } else {
      const { error } = await this.sb.from('roles').insert({ company_id, id: p.id, nom: p.nom, description: p.description, systeme: false, droits: {} });
      if (error) throw new BackendError('db', /duplicate|unique/i.test(error.message) ? 'Un profil porte déjà ce nom.' : /row-level|policy/i.test(error.message) ? 'Action refusée : réservée à l\u2019administrateur.' : error.message);
    }
  }
  async deleteProfil(id: string) {
    const company_id = await this.companyId();
    const { data, error } = await this.sb.from('roles').delete().eq('company_id', company_id).eq('id', id).select('id');
    if (error) throw new BackendError('db', /foreign key|violates/i.test(error.message) ? 'Ce profil est utilisé par au moins un utilisateur.' : error.message);
    this.touched(data);
  }
  async saveDroits(profilId: string, droits: DroitsParOnglet) {
    const company_id = await this.companyId();
    const { data, error } = await this.sb.from('roles').update({ droits }).eq('company_id', company_id).eq('id', profilId).select('id');
    if (error) throw new BackendError('db', error.message);
    this.touched(data);
  }

  async createUser(u: NewUser): Promise<Utilisateur> {
    const r = await callApi<{ user: Utilisateur }>('/api/users', { action: 'create', nom: u.nom, email: u.email, password: u.password, profilId: u.profil });
    return r.user;
  }
  async updateUser(id: string, patch: any) { await callApi('/api/users', { action: 'update', id, nom: patch.nom, profilId: patch.profilId, actif: patch.actif }); }
  async deleteUser(id: string) { await callApi('/api/users', { action: 'delete', id }); }
  async resetUserPassword(id: string) { await callApi('/api/users', { action: 'reset', id }); }
}
