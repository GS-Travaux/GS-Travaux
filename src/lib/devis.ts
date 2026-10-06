import type { Devis, OrdreMission } from './types';
import { addJours } from './format';

export const STATUTS = ['Créé', 'Soldée', 'Facturé', 'Annulé'] as const;
export const BADGE_CLASS: Record<string, string> = { 'Créé': 'badge-cree', 'Soldée': 'badge-soldee', 'Facturé': 'badge-facture', 'Annulé': 'badge-annule' };
export const AVANCEMENT_BADGE: Record<string, string> = { 'Non démarré': 'badge-cree', 'En cours': 'badge-soldee', 'Terminé': 'badge-facture' };

export function devisTotal(d: Pick<Devis, 'lignes'>): number {
  return d.lignes.reduce((s, l) => s + (Number(l.qte) || 0) * (Number(l.pu) || 0), 0);
}

/** Avancement d'un devis d'après les ordres de mission rattachés à ses lignes. */
export function devisAvancement(d: Devis, ordresMission: OrdreMission[]): 'Non démarré' | 'En cours' | 'Terminé' {
  const oms = ordresMission.filter(o => o.devisId === d.id && o.statut !== 'Annulé');
  if (!oms.length) return 'Non démarré';
  const statutsParLigne = d.lignes.map(l => {
    const om = oms.find(o => o.lignes[0] === l.designation);
    return om ? om.statut : null;
  });
  if (statutsParLigne.every(s => s === 'Terminé')) return 'Terminé';
  if (statutsParLigne.some(s => s === 'En cours' || s === 'Terminé')) return 'En cours';
  return 'Non démarré';
}

/** « 60 jours » → 60 ; « 2 mois » → 60 ; « Comptant » → 0. */
export function delaiEnJours(txt: unknown): number {
  const t = (txt ?? '').toString().toLowerCase();
  const m = t.match(/(\d+)/);
  if (!m) return 0;
  const n = parseInt(m[1], 10);
  return /mois/.test(t) ? n * 30 : n;
}

/** Date d'encaissement attendue d'une facture : date de facture + délai de paiement. */
export function factureEcheance(d: Pick<Devis, 'facture'>): string {
  return d.facture && d.facture.date ? addJours(d.facture.date, delaiEnJours(d.facture.delai)) : '';
}
