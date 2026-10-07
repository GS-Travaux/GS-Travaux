/* Logique pure des recettes (numérotation, lignes de devis en cours de saisie). */
import type { DemandeArticle, Devis, DevisLigne } from '../../lib/types';

export const MODES_PAIEMENT = ['Chèque', 'Virement', 'Espèces', 'Traite'] as const;
export const AVANCEMENTS = ['Non démarré', 'En cours', 'Terminé'] as const;
export const ARTICLE_SITUATIONS = ['Demandé', 'Pris', 'Annulé'] as const;
export const ART_BADGE: Record<string, string> = { 'Demandé': 'badge-cree', 'Pris': 'badge-facture', 'Annulé': 'badge-annule' };

/** Prochain n° de devis : DV_AA_NNNN (AA = année de la date du devis, NNNN = max existant de cette année + 1).
    `excludeId` : devis ignoré dans le calcul (celui qu'on est en train de dater). */
export function nextDevisNumero(devis: Pick<Devis, 'id' | 'numero'>[], dateStr?: string, excludeId?: string): string {
  const y = /^\d{4}/.test(dateStr || '') ? parseInt((dateStr as string).slice(0, 4), 10) : new Date().getFullYear();
  const prefix = `DV_${String(y).slice(-2)}_`;
  const max = devis.reduce((m, dv) => {
    if (dv.id === excludeId) return m;
    if (dv.numero && dv.numero.startsWith(prefix)) {
      const n = parseInt(dv.numero.slice(prefix.length), 10);
      if (!isNaN(n)) return Math.max(m, n);
    }
    return m;
  }, 0);
  return prefix + String(max + 1).padStart(4, '0');
}

/** N° de ligne de la prochaine demande d'article. */
export function nextArticleLigne(articles: Pick<DemandeArticle, 'ligne'>[]): number {
  return articles.length ? Math.max(...articles.map(a => a.ligne)) + 1 : 1;
}

/** N° de la prochaine facture : nombre de devis déjà facturés + 1, sur 9 chiffres. */
export function nextFactureNumero(devis: Pick<Devis, 'facture'>[]): string {
  return String(devis.filter(x => x.facture).length + 1).padStart(9, '0');
}

/* ── Lignes de devis en cours de saisie : quantité et PU restent du texte tant que le formulaire est ouvert
   (permet de vider un champ ou de taper « 12. » sans qu'il soit réécrit). ── */
export interface DraftLigne { designation: string; qte: string; pu: string; matiere: 'avec' | 'sans'; taches: string[] }

export function toDraftLignes(lignes: DevisLigne[]): DraftLigne[] {
  return lignes.map(l => ({
    designation: l.designation ?? '', qte: String(l.qte ?? 0), pu: String(l.pu ?? 0),
    matiere: l.matiere === 'avec' ? 'avec' : 'sans', taches: [...(l.taches || [])],
  }));
}
export function fromDraftLignes(lignes: DraftLigne[]): DevisLigne[] {
  return lignes.map(l => ({ designation: l.designation, qte: Number(l.qte) || 0, pu: Number(l.pu) || 0, matiere: l.matiere, taches: [...l.taches] }));
}
export const newDraftLigne = (): DraftLigne => ({ designation: '', qte: '1', pu: '0', matiere: 'sans', taches: [] });
export const ligneMontant = (l: { qte: unknown; pu: unknown }): number => (Number(l.qte) || 0) * (Number(l.pu) || 0);
export const lignesTotal = (ls: { qte: unknown; pu: unknown }[]): number => ls.reduce((s, l) => s + ligneMontant(l), 0);
