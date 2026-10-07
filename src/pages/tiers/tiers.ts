/* Logique pure de la page Tiers : identifiants et historiques (client : devis ; fournisseur : immobilisations + achats). */
import type { Achat, Devis, Immobilisation, Tiers } from '../../lib/types';
import { achatMontants } from '../../lib/achats';
import { BADGE_CLASS, devisTotal } from '../../lib/devis';

export function nextTiersId(prefix: 'CL' | 'FL', list: Tiers[]): string {
  const max = list.reduce((m, x) => {
    const n = parseInt((x.id || '').split('-')[1] || '0', 10);
    return isNaN(n) ? m : Math.max(m, n);
  }, 0);
  return `${prefix}-${String(max + 1).padStart(4, '0')}`;
}

export interface HistoriqueLigne { date: string; label: string; statut: string; badge: string; montant: number }

/** Devis d'un client (rattaché par son nom), du plus récent au plus ancien. */
export function clientHistorique(devis: Devis[], nom: string): HistoriqueLigne[] {
  return devis.filter(d => d.client === nom).map(d => ({
    date: d.dateFacturee || d.dateSoldee || d.date,
    label: `Devis ${d.numero} — ${d.objet}`,
    statut: d.statut,
    badge: BADGE_CLASS[d.statut],
    montant: devisTotal(d),
  })).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

/** Immobilisations et achats d'un fournisseur, du plus récent au plus ancien. */
export function fournisseurHistorique(id: string, immobilisations: Immobilisation[], achats: Achat[]): HistoriqueLigne[] {
  const immos = immobilisations.filter(a => a.fournisseurId === id).map(a => ({
    date: a.dateAcquisition,
    label: `${a.id} — ${a.categorie === 'transport' ? `${a.typeVehicule} ${a.marque}` : a.designation}`,
    statut: 'Immobilisation', badge: 'badge-cree', montant: a.valeur,
  }));
  const ach = achats.filter(a => a.fournisseurId === id).map(a => ({
    date: a.date, label: `${a.id} — ${a.designation}`,
    statut: 'Achat', badge: 'badge-soldee', montant: achatMontants(a).ttc,
  }));
  return [...immos, ...ach].sort((x, y) => (y.date || '').localeCompare(x.date || ''));
}
