/* Contrat entre l'application et son stockage. Deux implémentations :
   - supabaseBackend : mode en ligne (Supabase Auth + Postgres avec RLS)
   - localBackend    : mode démo sans configuration (données dans le navigateur) */
import type { DroitsParOnglet, Entreprise, Profil, RecordCollection, State, Utilisateur } from '../lib/types';

export type Role = 'user' | 'owner';
export type AuthStatus =
  | { status: 'signed_out' }
  | { status: 'recovery' }                         // l'utilisateur arrive depuis un e-mail de réinitialisation
  | { status: 'signed_in'; role: Role; email: string };

export type AuthEvent = 'SIGNED_OUT' | 'SIGNED_IN' | 'PASSWORD_RECOVERY';

export interface Change {
  collection: RecordCollection | 'societe';
  id: string;
  op: 'upsert' | 'delete';
  data?: any;
}

export interface LoadedData {
  state: State;
  company: Entreprise;
  me: Utilisateur;
}

export interface NewUser { nom: string; email: string; password: string; profil: string /* id du profil */ }

export class BackendError extends Error {
  code: string;
  constructor(code: string, message: string) { super(message); this.code = code; }
}

export interface Backend {
  readonly mode: 'local' | 'supabase';

  /* ── Authentification ── */
  init(): Promise<AuthStatus>;
  onAuthEvent(cb: (e: AuthEvent) => void): () => void;
  signIn(email: string, password: string): Promise<AuthStatus>;
  signOut(): Promise<void>;
  /** Envoie l'e-mail de réinitialisation (ne révèle pas si l'adresse existe). */
  sendPasswordReset(email: string): Promise<void>;
  /** Définit un nouveau mot de passe (utilisateur connecté ou arrivé par le lien de réinitialisation). */
  setNewPassword(password: string): Promise<void>;
  /** Vérifie l'ancien mot de passe puis le remplace. */
  changePassword(current: string, next: string): Promise<void>;

  /* ── Données de l'entreprise ── */
  load(): Promise<LoadedData>;
  /** Enregistre un lot de modifications (échoue en bloc ; l'appelant annule alors l'affichage optimiste). */
  save(changes: Change[]): Promise<void>;

  /* ── Sécurité : profils, droits, utilisateurs (réservé au profil Administrateur, vérifié côté base/serveur) ── */
  saveProfil(p: Profil): Promise<void>;
  deleteProfil(id: string): Promise<void>;
  saveDroits(profilId: string, droits: DroitsParOnglet): Promise<void>;
  createUser(u: NewUser): Promise<Utilisateur>;
  updateUser(id: string, patch: Partial<Pick<Utilisateur, 'nom' | 'profil' | 'actif'>> & { profilId?: string }): Promise<void>;
  deleteUser(id: string): Promise<void>;
  /** Envoie à l'utilisateur un e-mail de réinitialisation de son mot de passe. */
  resetUserPassword(id: string): Promise<void>;
}
