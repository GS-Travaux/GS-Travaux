import type { Achat, Devis } from './types';

export const ACHAT_TYPES = {
  consommable: { label: 'Achats consommables', prefix: 'AC', add: 'Ajouter un achat',
    cats: ['Tôles et profilés', 'Électrodes et fil de soudure', 'Gaz (oxygène, acétylène, argon)', 'Disques de meulage et de coupe', 'Boulonnerie et visserie', 'Peinture et traitement', 'Autre matière consommable'] },
  autre: { label: 'Autres achats consommables', prefix: 'AA', add: 'Ajouter un achat',
    cats: ['Carburant', 'Équipements de protection (EPI)', 'Fournitures de bureau', 'Eau et électricité', 'Entretien et petit outillage', "Produits d'entretien", 'Autre achat'] },
} as const;
export const ACHAT_UNITES = ['Unité', 'Kg', 'm', 'm²', 'L', 'Boîte', 'Lot'];
export const ACHAT_TVA = [0, 7, 10, 14, 20];
export const ACHAT_MODES = ['Virement', 'Chèque', 'Espèces', 'Traite'];

export function achatMontants(a: Pick<Achat, 'quantite' | 'prixUnitaire' | 'tva'>) {
  const ht = (Number(a.quantite) || 0) * (Number(a.prixUnitaire) || 0);
  const tva = ht * (Number(a.tva) || 0) / 100;
  return { ht, tva, ttc: ht + tva };
}
export function nextAchatId(list: Achat[], type: 'consommable' | 'autre'): string {
  const p = ACHAT_TYPES[type].prefix;
  const max = list.filter(a => a.type === type).reduce((m, a) => {
    const n = parseInt((a.id || '').split('-')[1] || '0', 10); return isNaN(n) ? m : Math.max(m, n);
  }, 0);
  return `${p}-${String(max + 1).padStart(4, '0')}`;
}
/** « FG » = frais généraux, sinon l'identifiant d'un devis (chantier). */
export function achatAffectationLabel(v: string | undefined, devis: Devis[]): string {
  if (!v || v === 'FG') return 'Frais généraux';
  const d = devis.find(x => x.id === v);
  return d ? `${d.numero} — ${d.client}` : '—';
}
