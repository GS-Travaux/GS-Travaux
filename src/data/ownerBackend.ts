/* Espace propriétaire (éditeur de l'application) : registre des entreprises clientes, licences et paiements.
   - RemoteOwnerBackend : fonctions serveur /api/owner-login et /api/owner (tout est vérifié côté serveur) ;
   - LocalOwnerBackend  : mode démo sans Supabase (données d'exemple dans le navigateur, aucune sécurité). */
import type { Entreprise, TarifsPlateforme } from '../lib/types';
import { addJours, addMois, todayIso, uid } from '../lib/format.js';
import {
  adminIssue, companyIssue, paiementIssue, paiementPeriode, tarifsIssue,
  type CompanyInput, type NewCompany, type PaiementInput, type TarifsInput,
} from '../owner/rules.js';
import { getBackend } from './index';
import { callApi, getSupabase } from './supabaseClient';
import { memoryStorage } from './localBackend';

export type { CompanyInput, NewCompany, PaiementInput, TarifsInput };
export interface OwnerEntreprise extends Entreprise { nbUtilisateurs: number }
export interface OwnerData { entreprises: OwnerEntreprise[]; tarifs: TarifsPlateforme }

export interface OwnerBackend {
  readonly mode: 'local' | 'supabase';
  /** Mode démo uniquement : mot de passe à afficher sur l'écran de connexion. */
  readonly demoPassword?: string;
  /** Une session propriétaire est-elle ouverte ? */
  hasSession(): Promise<boolean>;
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
  list(): Promise<OwnerData>;
  createCompany(c: NewCompany): Promise<void>;
  updateCompany(id: string, patch: Partial<CompanyInput> & { notes?: string }): Promise<void>;
  /** Renvoie la nouvelle échéance de la licence. */
  addPayment(id: string, p: PaiementInput): Promise<{ echeance: string }>;
  suspend(id: string, motif: string): Promise<void>;
  reactivate(id: string): Promise<void>;
  /** `confirmation` = code société, ressaisi par le propriétaire. */
  deleteCompany(id: string, confirmation: string): Promise<void>;
  setTarifs(t: TarifsInput): Promise<void>;
}

/* ───────── En ligne ───────── */
export class RemoteOwnerBackend implements OwnerBackend {
  readonly mode = 'supabase' as const;
  private call<T = any>(action: string, body: Record<string, unknown> = {}) { return callApi<T>('/api/owner', { action, ...body }); }

  async hasSession() {
    const { data } = await getSupabase().auth.getSession();
    return data.session?.user?.app_metadata?.is_owner === true;     // simple affichage : le serveur revérifie chaque appel
  }
  async login(email: string, password: string) {
    const res = await fetch('/api/owner-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
    let json: any = null;
    try { json = await res.json(); } catch { /* réponse vide */ }
    if (!res.ok || !json?.access_token) throw new Error((json && json.error) || `Connexion impossible (${res.status}).`);
    const { error } = await getSupabase().auth.setSession({ access_token: json.access_token, refresh_token: json.refresh_token });
    if (error) throw new Error('Connexion impossible : session refusée.');
  }
  async logout() { await getSupabase().auth.signOut(); }
  list() { return this.call<OwnerData>('list'); }
  async createCompany(c: NewCompany) { await this.call('createCompany', { ...c }); }
  async updateCompany(id: string, patch: Partial<CompanyInput> & { notes?: string }) { await this.call('updateCompany', { id, ...patch }); }
  async addPayment(id: string, p: PaiementInput) { const r = await this.call<{ echeance: string }>('addPayment', { id, ...p }); return { echeance: r.echeance }; }
  async suspend(id: string, motif: string) { await this.call('suspend', { id, motif }); }
  async reactivate(id: string) { await this.call('reactivate', { id }); }
  async deleteCompany(id: string, confirmation: string) { await this.call('deleteCompany', { id, confirmation }); }
  async setTarifs(t: TarifsInput) { await this.call('setTarifs', { ...t }); }
}

/* ───────── Mode démo ───────── */
const KEY = 'gs-travaux-owner-demo-v1', SESSION_KEY = 'gs-travaux-owner-demo-session';
export const DEMO_OWNER_PASSWORD = 'demo-proprietaire';

/** Données d'exemple du prototype (newOwnerData). */
export function demoOwnerData(today = todayIso()): OwnerData {
  const t = today;
  const base = { suspendu: false, motifSuspension: '', paiements: [], notes: '', interne: false, essaiFin: '', echeance: '', nbUtilisateurs: 1 };
  const pay = (debut: string, n: number, prix: number, mode: string) =>
    Array.from({ length: n }, (_, i) => ({ id: uid('pay'), date: addMois(debut, i), montant: prix, periodes: 1, mode, du: addMois(debut, i), au: addMois(debut, i + 1) }));
  const d1 = addMois(t, -3), d3 = addMois(t, -8), d5 = addMois(t, -5);
  return {
    tarifs: { tarifs: { Mensuelle: 2000, Annuelle: 24000 }, essaiJours: 14 },
    entreprises: [
      { ...base, id: uid('ent'), code: 'DEMO', nom: 'Entreprise de démonstration', contact: 'Brahim Elbouanani', email: 'demo@gs-travaux.local', telephone: '06 13 15 01 79', licence: 'Annuelle', prix: 0, debut: t, interne: true, nbUtilisateurs: 2, notes: "Entreprise de l'éditeur : compte interne, gratuit." },
      { ...base, id: uid('ent'), code: 'ATLAS-01', nom: "Aciers de l'Atlas", contact: 'Samir Berrada', email: 'direction@atlas.example', telephone: '05 22 00 00 01', licence: 'Mensuelle', prix: 2000, debut: d1, echeance: addMois(d1, 4), paiements: pay(d1, 4, 2000, 'Virement'), nbUtilisateurs: 3, notes: 'Exemple — à supprimer.' },
      { ...base, id: uid('ent'), code: 'METALPRO-02', nom: 'MétalPro Industrie', contact: 'Nadia Fassi', email: 'contact@metalpro.example', telephone: '05 22 00 00 02', licence: 'Annuelle', prix: 24000, debut: d3, echeance: addMois(d3, 12), paiements: [{ id: uid('pay'), date: d3, montant: 24000, periodes: 1, mode: 'Chèque', du: d3, au: addMois(d3, 12) }], nbUtilisateurs: 5, notes: 'Exemple — à supprimer.' },
      { ...base, id: uid('ent'), code: 'NORD-03', nom: 'Chaudronnerie du Nord', contact: 'Karim Tazi', email: 'info@nord.example', telephone: '05 22 00 00 03', licence: 'Mensuelle', prix: 2000, debut: addJours(t, -9), essaiFin: addJours(t, 5), notes: 'Exemple — essai en cours.' },
      { ...base, id: uid('ent'), code: 'SOMATEC-04', nom: 'Somatec', contact: 'Hicham Lamrani', email: 'compta@somatec.example', telephone: '05 22 00 00 04', licence: 'Mensuelle', prix: 2000, debut: d5, echeance: addMois(d5, 3), paiements: pay(d5, 3, 2000, 'Virement'), suspendu: true, motifSuspension: 'Impayé', nbUtilisateurs: 2, notes: 'Exemple — suspendue pour impayé.' },
    ],
  };
}

type KV = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export class LocalOwnerBackend implements OwnerBackend {
  readonly mode = 'local' as const;
  readonly demoPassword = DEMO_OWNER_PASSWORD;
  private data: OwnerData;
  constructor(
    private storage: KV = (typeof localStorage !== 'undefined' ? localStorage : memoryStorage()),
    private session: KV = (typeof sessionStorage !== 'undefined' ? sessionStorage : memoryStorage()),
  ) { this.data = this.read(); }

  private read(): OwnerData {
    try {
      const p = JSON.parse(this.storage.getItem(KEY) || 'null');
      if (p && Array.isArray(p.entreprises) && p.tarifs) return p;
    } catch { /* données illisibles : on repart des exemples */ }
    return demoOwnerData();
  }
  private persist() { try { this.storage.setItem(KEY, JSON.stringify(this.data)); } catch { /* quota */ } }
  private find(id: string): OwnerEntreprise {
    const e = this.data.entreprises.find(x => x.id === id);
    if (!e) throw new Error('Entreprise introuvable.');
    return e;
  }
  private codeLibre(code: string, sauf = '') {
    if (this.data.entreprises.some(x => x.id !== sauf && x.code.toLowerCase() === code.toLowerCase())) throw new Error('Ce code société existe déjà.');
  }

  async hasSession() { try { return this.session.getItem(SESSION_KEY) === '1'; } catch { return false; } }
  async login(_email: string, password: string) {
    if (password !== DEMO_OWNER_PASSWORD) throw new Error('Identifiants incorrects.');
    try { this.session.setItem(SESSION_KEY, '1'); } catch { /* stockage indisponible */ }
  }
  async logout() { try { this.session.removeItem(SESSION_KEY); } catch { /* stockage indisponible */ } }

  async list(): Promise<OwnerData> { return structuredClone(this.data); }
  async createCompany(c: NewCompany) {
    const issue = companyIssue(c) || adminIssue(c);
    if (issue) throw new Error(issue);
    this.codeLibre(c.code);
    this.data.entreprises.push({
      id: uid('ent'), code: c.code, nom: c.nom, contact: c.contact, email: c.email, telephone: c.telephone, interne: c.interne, licence: c.licence,
      prix: c.interne ? 0 : c.prix, debut: c.debut, essaiFin: c.interne ? '' : addJours(c.debut, this.data.tarifs.essaiJours), echeance: '',
      suspendu: false, motifSuspension: '', paiements: [], notes: '', nbUtilisateurs: 1,
    });
    this.persist();
  }
  async updateCompany(id: string, patch: Partial<CompanyInput> & { notes?: string }) {
    const e = this.find(id);
    const { notes, ...rest } = patch;
    const next: CompanyInput = { code: e.code, nom: e.nom, contact: e.contact, email: e.email, telephone: e.telephone, interne: e.interne, licence: e.licence, prix: e.prix, debut: e.debut, ...rest };
    if (next.interne) next.prix = 0;
    const issue = companyIssue(next);
    if (issue) throw new Error(issue);
    this.codeLibre(next.code, id);
    Object.assign(e, next);
    if (next.interne) { e.essaiFin = ''; e.echeance = ''; }
    if (notes !== undefined) e.notes = notes.trim();
    this.persist();
  }
  async addPayment(id: string, p: PaiementInput) {
    const e = this.find(id);
    const issue = paiementIssue(e, p);
    if (issue) throw new Error(issue);
    const { du, au } = paiementPeriode(e, p.date, p.periodes);
    e.paiements.push({ id: uid('pay'), date: p.date, montant: p.montant, periodes: p.periodes, mode: p.mode, du, au });
    e.echeance = au;                              // le premier paiement met fin à l'essai
    this.persist();
    return { echeance: au };
  }
  async suspend(id: string, motif: string) {
    if (!motif.trim()) throw new Error('Le motif de la suspension est obligatoire.');
    const e = this.find(id); e.suspendu = true; e.motifSuspension = motif.trim(); this.persist();
  }
  async reactivate(id: string) { const e = this.find(id); e.suspendu = false; e.motifSuspension = ''; this.persist(); }
  async deleteCompany(id: string, confirmation: string) {
    const e = this.find(id);
    if (confirmation !== e.code) throw new Error('Confirmation incorrecte : saisissez exactement le code société.');
    this.data.entreprises = this.data.entreprises.filter(x => x.id !== id); this.persist();
  }
  async setTarifs(t: TarifsInput) {
    const issue = tarifsIssue(t);
    if (issue) throw new Error(issue);
    this.data.tarifs = { tarifs: { Mensuelle: t.mensuel, Annuelle: t.annuel }, essaiJours: t.essaiJours }; this.persist();
  }
}

let instance: OwnerBackend | null = null;
/** Même choix que l'application : en ligne si Supabase est configuré, sinon mode démo. */
export function getOwnerBackend(): OwnerBackend {
  if (!instance) instance = getBackend().mode === 'supabase' ? new RemoteOwnerBackend() : new LocalOwnerBackend();
  return instance;
}
export function setOwnerBackendForTests(b: OwnerBackend | null) { instance = b; }
