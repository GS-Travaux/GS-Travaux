/* Fonctions et constantes communes aux onglets Salariés / Pointage / Congés (reprises du prototype). */
import type { Collaborateur } from '../../lib/types';
import { money, todayIso } from '../../lib/format';

export const COLLAB_STATUTS = ['Actif', 'Inactif', 'Démissionné'];
export const STATUT_BADGE: Record<string, string> = { 'Actif': 'badge-facture', 'Inactif': 'badge-cree', 'Démissionné': 'badge-annule' };
export const POINTAGE_STATUTS = ['Présent', 'Absent', 'Retard', 'Congé'];
export const POINTAGE_BADGE: Record<string, string> = { 'Présent': 'badge-facture', 'Absent': 'badge-annule', 'Retard': 'badge-soldee', 'Congé': 'badge-cree' };
export const CONGE_TYPES = ['Congé payé', 'Maladie', 'Sans solde', 'Exceptionnel'];
export const CONGE_STATUTS = ['Demandé', 'Validé', 'Refusé'];
export const CONGE_BADGE: Record<string, string> = { 'Demandé': 'badge-cree', 'Validé': 'badge-facture', 'Refusé': 'badge-annule' };

/** Salaire affiché selon le type de paie (mensuel / journalier / horaire). */
export function salaireAffiche(c: Pick<Collaborateur, 'typePaie' | 'salaireJournalier' | 'tauxHoraire' | 'salaireBase'>): string {
  if (c.typePaie === 'Journalier') return money(c.salaireJournalier || 0) + ' DH/jour';
  if (c.typePaie === 'Horaire') return money(c.tauxHoraire || 0) + ' DH/h';
  return money(c.salaireBase || 0) + ' DH/mois';
}

/** Nombre de jours (inclusifs, minimum 1) entre deux dates ISO. */
export function joursEntre(d1: string, d2: string): number {
  const a = new Date(d1).getTime(), b = new Date(d2).getTime();
  return Math.max(1, Math.round((b - a) / 86400000) + 1);
}

/** Solde restant d'un prêt : capital - remboursé, arrondi au centime, jamais négatif. */
export function soldePret(capital: unknown, rembourse: unknown): number {
  return Math.max(0, Math.round(((Number(capital) || 0) - (Number(rembourse) || 0)) * 100) / 100);
}

export function collabVide(id: string): Collaborateur {
  return {
    id, nom: '', prenom: '', cin: '', dateNaissance: '', situationFamiliale: 'Célibataire', telephone: '', adresse: '',
    departement: '', service: '', poste: '', dateEmbauche: todayIso(), typeContrat: 'CDI',
    typePaie: 'Mensuel', tauxHoraire: 0, salaireBase: 0, personnesACharge: 0, cnssNum: '', cotiseCimr: false, cimrNum: '', mutuelleNum: '',
    congesDroitAnnuel: 21, pretCapital: 0, pretMensualite: 0, pretRembourse: 0, pretSolde: 0, dateDemission: '', statut: 'Actif',
  };
}
