import type { Immobilisation } from './types';

export const IMMO_CATS = {
  materiel: { label: 'Matériel et outillage', prefix: 'MO', add: 'Ajouter un matériel' },
  transport: { label: 'Matériel de transport', prefix: 'MT', add: 'Ajouter un véhicule' },
} as const;
export const IMMO_ETATS = ['En service', 'En réparation', 'Réformé'];
export const IMMO_ETAT_BADGE: Record<string, string> = { 'En service': 'badge-facture', 'En réparation': 'badge-soldee', 'Réformé': 'badge-annule' };
export const VEHICULE_TYPES = ['Camion', 'Camionnette', 'Voiture', 'Remorque', 'Engin', 'Autre'];

/** Amortissement linéaire au prorata temporis. `now` injectable pour les tests. */
export function immoAmort(valeur: unknown, dureeAns: unknown, dateAcq?: string, now = Date.now()) {
  const val = Number(valeur) || 0, duree = Number(dureeAns) || 0;
  if (!val || !duree) return { dotation: 0, cumule: 0, vnc: val };
  const dotation = val / duree;
  const annees = dateAcq ? Math.max(0, (now - new Date(dateAcq + 'T00:00:00Z').getTime()) / (365.25 * 86400000)) : 0;
  const cumule = Math.min(val, dotation * annees);
  return { dotation, cumule, vnc: val - cumule };
}
export function nextImmoId(list: Immobilisation[], cat: 'materiel' | 'transport'): string {
  const p = IMMO_CATS[cat].prefix;
  const max = list.filter(a => a.categorie === cat).reduce((m, a) => {
    const n = parseInt((a.id || '').split('-')[1] || '0', 10); return isNaN(n) ? m : Math.max(m, n);
  }, 0);
  return `${p}-${String(max + 1).padStart(4, '0')}`;
}
