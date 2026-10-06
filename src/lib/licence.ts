/* État de la licence d'une entreprise (règles du prototype). */
import type { Entreprise } from './types';
import { todayIso } from './format';

export type EtatEntreprise = 'Active' | 'Essai' | 'Suspendue' | 'Licence expirée' | 'Essai expiré';

export function etatEntreprise(e: Pick<Entreprise, 'suspendu' | 'interne' | 'echeance' | 'essaiFin'>, today = todayIso()): EtatEntreprise {
  if (e.suspendu) return 'Suspendue';
  if (e.interne) return 'Active';
  if (e.echeance) return e.echeance >= today ? 'Active' : 'Licence expirée';
  return (e.essaiFin && e.essaiFin >= today) ? 'Essai' : 'Essai expiré';
}
export function limiteEntreprise(e: Pick<Entreprise, 'interne' | 'echeance' | 'essaiFin'>): string {
  return e.interne ? '9999-12-31' : (e.echeance || e.essaiFin || '9999-12-31');
}
/** Message affiché à l'entreprise bloquée ; chaîne vide si l'accès est autorisé. */
export function licenceBlocage(e: Entreprise | null | undefined): string {
  if (!e) return '';
  const etat = etatEntreprise(e);
  if (etat === 'Suspendue') return 'Accès suspendu par l’éditeur de l’application' + (e.motifSuspension ? ' (' + e.motifSuspension + ')' : '') + '. Contactez-le pour le rétablir.';
  if (etat === 'Licence expirée' || etat === 'Essai expiré') return 'La licence de votre entreprise a expiré. Contactez l’éditeur pour la renouveler.';
  return '';
}
