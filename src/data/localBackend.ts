/* Mode démo : tout est stocké dans le navigateur (localStorage), sans connexion. Utile pour essayer
   l'application avant d'avoir configuré Supabase, et pour les tests. Aucune sécurité n'est assurée ici. */
import { uid, todayIso, addJours } from '../lib/format';
import type { DroitsParOnglet, Entreprise, Profil, State, Utilisateur } from '../lib/types';
import { RECORD_COLLECTIONS } from '../lib/types';
import { defaultDroits, defaultProfils } from '../lib/rights';
import { Backend, AuthEvent, AuthStatus, BackendError, Change, LoadedData, NewUser } from './backend';
import { seedState } from './seed';

const KEY = 'gs-travaux-local-v2';

interface Stored { state: State; company: Entreprise; meId: string }

function demoCompany(): Entreprise {
  return {
    id: 'demo', code: 'DEMO', nom: 'Entreprise de démonstration', contact: '', email: '', telephone: '',
    licence: 'Annuelle', prix: 0, debut: todayIso(), essaiFin: addJours(todayIso(), 3650), echeance: '',
    suspendu: false, motifSuspension: '', interne: true, notes: '', paiements: [],
  };
}

export function normalizeState(s: any): State {
  const base = seedState();
  const out: any = { ...s };
  for (const c of RECORD_COLLECTIONS) if (!Array.isArray(out[c])) out[c] = [];
  if (!out.societe) out.societe = base.societe;
  if (!out.profils) out.profils = defaultProfils();
  if (!out.droits) out.droits = defaultDroits();
  if (!out.utilisateurs) out.utilisateurs = [];
  return out as State;
}

export class LocalBackend implements Backend {
  readonly mode = 'local' as const;
  private store: Stored;
  private listeners = new Set<(e: AuthEvent) => void>();

  constructor(private storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = (typeof localStorage !== 'undefined' ? localStorage : memoryStorage())) {
    this.store = this.read();
  }

  private read(): Stored {
    try {
      const raw = this.storage.getItem(KEY);
      if (raw) { const p = JSON.parse(raw); return { state: normalizeState(p.state), company: p.company || demoCompany(), meId: p.meId || 'u1' }; }
    } catch { /* données illisibles : on repart de la démo */ }
    return { state: normalizeState(seedState()), company: demoCompany(), meId: 'u1' };
  }
  private persist() { try { this.storage.setItem(KEY, JSON.stringify(this.store)); } catch { /* quota */ } }

  async init(): Promise<AuthStatus> { return { status: 'signed_in', role: 'user', email: this.me().email }; }
  onAuthEvent(cb: (e: AuthEvent) => void) { this.listeners.add(cb); return () => { this.listeners.delete(cb); }; }
  async signIn(): Promise<AuthStatus> { return this.init(); }
  async signOut() { /* pas de session en mode démo */ }
  async sendPasswordReset() { /* sans effet en mode démo */ }
  async setNewPassword() { /* sans effet en mode démo */ }
  async changePassword() { /* sans effet en mode démo */ }

  private me(): Utilisateur {
    return this.store.state.utilisateurs.find(u => u.id === this.store.meId) || this.store.state.utilisateurs[0];
  }

  async load(): Promise<LoadedData> {
    this.store = this.read();
    return { state: structuredClone(this.store.state), company: this.store.company, me: this.me() };
  }

  async save(changes: Change[]) {
    const s: any = this.store.state;
    for (const ch of changes) {
      if (ch.collection === 'societe') { if (ch.op === 'upsert') s.societe = ch.data; continue; }
      const list: any[] = s[ch.collection];
      const i = list.findIndex(x => x.id === ch.id);
      if (ch.op === 'delete') { if (i >= 0) list.splice(i, 1); }
      else if (i >= 0) list[i] = ch.data;
      else list.unshift(ch.data);
    }
    this.persist();
  }

  private requireAdmin() {
    const me = this.me(); const p = this.store.state.profils.find(x => x.id === me.profilId);
    if (!p || !p.systeme) throw new BackendError('forbidden', 'Action réservée à l’administrateur.');
  }
  private profilNom(id: string) { const p = this.store.state.profils.find(x => x.id === id); return p ? p.nom : ''; }

  async saveProfil(p: Profil) {
    this.requireAdmin();
    const s = this.store.state; const i = s.profils.findIndex(x => x.id === p.id);
    if (i >= 0) { if (s.profils[i].systeme) throw new BackendError('forbidden', 'Le profil système n’est pas modifiable.'); s.profils[i] = { ...s.profils[i], nom: p.nom, description: p.description }; s.utilisateurs.forEach(u => { if (u.profilId === p.id) u.profil = p.nom; }); }
    else { s.profils.push({ id: p.id, nom: p.nom, description: p.description }); s.droits[p.id] = {}; }
    this.persist();
  }
  async deleteProfil(id: string) {
    this.requireAdmin();
    const s = this.store.state;
    if (s.utilisateurs.some(u => u.profilId === id)) throw new BackendError('in_use', 'Ce profil est utilisé par au moins un utilisateur.');
    s.profils = s.profils.filter(p => p.id !== id || p.systeme); delete s.droits[id]; this.persist();
  }
  async saveDroits(profilId: string, droits: DroitsParOnglet) {
    this.requireAdmin();
    const p = this.store.state.profils.find(x => x.id === profilId);
    if (!p || p.systeme) throw new BackendError('forbidden', 'Le profil système n’est pas modifiable.');
    this.store.state.droits[profilId] = droits; this.persist();
  }
  async createUser(u: NewUser): Promise<Utilisateur> {
    this.requireAdmin();
    const s = this.store.state;
    if (s.utilisateurs.some(x => x.email.toLowerCase() === u.email.toLowerCase())) throw new BackendError('duplicate', 'Cette adresse e-mail est déjà utilisée.');
    const nu: Utilisateur = { id: uid('u'), nom: u.nom, email: u.email, profilId: u.profil, profil: this.profilNom(u.profil), actif: true };
    s.utilisateurs.push(nu); this.persist(); return nu;
  }
  async updateUser(id: string, patch: any) {
    this.requireAdmin();
    const u = this.store.state.utilisateurs.find(x => x.id === id); if (!u) return;
    if (patch.nom !== undefined) u.nom = patch.nom;
    if (patch.actif !== undefined) u.actif = patch.actif;
    if (patch.profilId !== undefined) { u.profilId = patch.profilId; u.profil = this.profilNom(patch.profilId); }
    this.persist();
  }
  async deleteUser(id: string) {
    this.requireAdmin();
    if (id === this.store.meId) throw new BackendError('forbidden', 'Vous ne pouvez pas supprimer votre propre compte.');
    this.store.state.utilisateurs = this.store.state.utilisateurs.filter(u => u.id !== id); this.persist();
  }
  async resetUserPassword() { /* sans effet en mode démo */ }
}

export function memoryStorage() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); } };
}
