/* Règles communes de l'espace propriétaire (reprises du prototype) : validations, calcul des périodes payées.
   Fonctions pures, utilisées à la fois par le navigateur (mode démo) et par les fonctions serveur (api/).
   ⚠ Les imports relatifs portent l'extension .js : ce fichier est aussi chargé par Node (fonctions Vercel, modules ES). */
import { addMois } from '../lib/format.js';
import type { TypeLicence } from '../lib/types';

export const MODES_PAIEMENT_OWNER = ['Virement', 'Chèque', 'Espèces', 'Carte bancaire'];
export const ETAT_BADGE: Record<string, string> = {
  'Active': 'badge-facture', 'Essai': 'badge-soldee', 'Suspendue': 'badge-annule', 'Licence expirée': 'badge-annule', 'Essai expiré': 'badge-annule',
};
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const CODE_RE = /^[A-Za-z0-9_-]{2,30}$/;

export function isEmail(v: unknown): v is string { return typeof v === 'string' && v.length <= 254 && EMAIL_RE.test(v); }
export function isIsoDate(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(v + 'T00:00:00Z');
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}
/** Même règle que l'écran de connexion : 8 caractères minimum, lettres et chiffres. */
export function passwordIssue(pwd: unknown): string {
  if (typeof pwd !== 'string' || pwd.length < 8) return 'Le mot de passe doit contenir au moins 8 caractères.';
  if (pwd.length > 72) return 'Le mot de passe ne doit pas dépasser 72 caractères.';
  if (!/[A-Za-z]/.test(pwd) || !/\d/.test(pwd)) return 'Le mot de passe doit contenir des lettres et des chiffres.';
  return '';
}

export interface CompanyInput {
  code: string; nom: string; contact: string; email: string; telephone: string;
  interne: boolean; licence: TypeLicence; prix: number; debut: string;
}
export interface AdminInput { adminNom: string; adminEmail: string; adminPassword: string }
export type NewCompany = CompanyInput & AdminInput;
export interface PaiementInput { date: string; periodes: number; montant: number; mode: string }
export interface TarifsInput { mensuel: number; annuel: number; essaiJours: number }

const short = (v: unknown, max: number) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;

/** Message d'erreur (chaîne vide si la fiche entreprise est valide). */
export function companyIssue(c: CompanyInput): string {
  if (!CODE_RE.test(c.code || '')) return 'Code société invalide : 2 à 30 caractères (lettres, chiffres, tiret, souligné), sans espace.';
  if (!short(c.nom, 120)) return 'Le nom de l’entreprise est obligatoire.';
  if (!short(c.contact, 120)) return 'Le contact est obligatoire.';
  if (!short(c.telephone, 40)) return 'Le téléphone est obligatoire.';
  if (!isEmail(c.email)) return 'Adresse e-mail invalide.';
  if (c.licence !== 'Mensuelle' && c.licence !== 'Annuelle') return 'Type de licence invalide.';
  if (typeof c.interne !== 'boolean') return 'Type de facturation invalide.';
  if (!Number.isFinite(c.prix) || c.prix < 0 || c.prix > 9999999) return 'Prix invalide.';
  if (!c.interne && !(c.prix > 0)) return 'Le prix doit être supérieur à 0 pour une entreprise payante.';
  if (!isIsoDate(c.debut)) return 'Date de début invalide.';
  return '';
}
export function adminIssue(a: AdminInput): string {
  if (!short(a.adminNom, 120)) return 'Le nom de l’administrateur est obligatoire.';
  if (!isEmail(a.adminEmail)) return 'Adresse e-mail de l’administrateur invalide.';
  return passwordIssue(a.adminPassword);
}

/** Période couverte par un paiement : elle prolonge l'échéance en cours, ou part de la date du paiement si la licence est échue. */
export function paiementPeriode(e: { licence: TypeLicence; echeance: string }, date: string, periodes: number): { du: string; au: string } {
  const moisParPeriode = e.licence === 'Annuelle' ? 12 : 1;
  const du = (e.echeance && e.echeance >= date) ? e.echeance : date;
  return { du, au: addMois(du, periodes * moisParPeriode) };
}
export function paiementIssue(e: { interne: boolean }, p: PaiementInput): string {
  if (e.interne) return 'Compte interne gratuit : aucun paiement à enregistrer.';
  if (!isIsoDate(p.date)) return 'Date de paiement invalide.';
  if (!Number.isInteger(p.periodes) || p.periodes < 1) return 'Le nombre de périodes doit être d’au moins 1.';
  if (p.periodes > 36) return 'Le nombre de périodes ne peut pas dépasser 36.';
  if (!Number.isFinite(p.montant) || !(p.montant > 0) || p.montant > 99999999) return 'Le montant doit être supérieur à 0.';
  if (!MODES_PAIEMENT_OWNER.includes(p.mode)) return 'Mode de paiement invalide.';
  return '';
}
export function tarifsIssue(t: TarifsInput): string {
  if (!Number.isFinite(t.mensuel) || !Number.isFinite(t.annuel) || !(t.mensuel > 0 && t.annuel > 0) || t.mensuel > 9999999 || t.annuel > 9999999) return 'Les tarifs doivent être supérieurs à 0.';
  if (!Number.isInteger(t.essaiJours) || t.essaiJours < 0 || t.essaiJours > 90) return 'La durée d’essai doit être comprise entre 0 et 90 jours.';
  return '';
}
