import type { Impot } from './types';
import { todayIso } from './format';

export const IMPOT_TYPES = ['Impôt sur le revenu (IR)', 'Impôt sur les sociétés (IS)', 'TVA', 'Taxe professionnelle', 'Taxe de services communaux', 'Vignette automobile', "Droits d'enregistrement et timbre", 'Retenue à la source', 'Autre impôt ou taxe'];
export const IMPOT_MODES = ['Virement', 'Chèque', 'Espèces', 'Carte bancaire', 'Paiement en ligne'];
export const IMPOT_BADGE: Record<string, string> = { 'Payé': 'badge-facture', 'À payer': 'badge-soldee', 'En retard': 'badge-annule' };
export const IMPOT_ORDRE: Record<string, number> = { 'En retard': 0, 'À payer': 1, 'Payé': 2 };
export type ImpotStatut = 'Payé' | 'À payer' | 'En retard';
export function impotStatut(x: Pick<Impot, 'paiement' | 'echeance'>, today = todayIso()): ImpotStatut {
  return x.paiement ? 'Payé' : (x.echeance < today ? 'En retard' : 'À payer');
}
export function nextImpotId(list: Impot[]): string {
  const max = list.reduce((m, x) => { const n = parseInt((x.id || '').split('-')[1] || '0', 10); return isNaN(n) ? m : Math.max(m, n); }, 0);
  return `IT-${String(max + 1).padStart(4, '0')}`;
}
