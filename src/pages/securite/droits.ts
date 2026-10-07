/* Logique pure de la matrice des droits (reprise du prototype : applyDroit, toggleDroit, toggleDroitAll). */
import type { Droit, DroitsMap, DroitsParOnglet, Profil } from '../../lib/types';
import { PAGES, PAGE_TABS, RIGHTS_TABS, droitsDe } from '../../lib/rights';

export type DroitKey = keyof Droit;
export const DROITS: DroitKey[] = ['voir', 'modifier', 'supprimer'];
const ALWAYS = (key: string, right: DroitKey) => key === 'securite_compte' && right === 'voir';   // « Mon compte » reste toujours visible

export function droitCoche(d: DroitsParOnglet, key: string, right: DroitKey): boolean {
  return ALWAYS(key, right) || !!(d[key] && d[key][right]);
}
function appliquer(cur: Droit, right: DroitKey, checked: boolean, key: string) {
  if (ALWAYS(key, right) && !checked) return;
  if (right === 'voir') { cur.voir = checked; if (!checked) { cur.modifier = false; cur.supprimer = false; } }
  else { cur[right] = checked; if (checked) cur.voir = true; }
}
/** Nouvelle matrice après avoir coché / décoché un droit (retirer « voir » retire tout ; donner un droit donne « voir »). */
export function basculerDroit(d: DroitsParOnglet, key: string, right: DroitKey, checked: boolean): DroitsParOnglet {
  const out: DroitsParOnglet = JSON.parse(JSON.stringify(d || {}));
  const cur = out[key] = out[key] || { voir: false, modifier: false, supprimer: false };
  appliquer(cur, right, checked, key);
  return out;
}
/** Case « Tout sélectionner » d'une colonne. */
export function basculerTout(d: DroitsParOnglet, right: DroitKey, checked: boolean): DroitsParOnglet {
  const out: DroitsParOnglet = JSON.parse(JSON.stringify(d || {}));
  RIGHTS_TABS.forEach(t => { const cur = out[t.key] = out[t.key] || { voir: false, modifier: false, supprimer: false }; appliquer(cur, right, checked, t.key); });
  return out;
}
export function toutCoche(d: DroitsParOnglet, right: DroitKey): boolean { return RIGHTS_TABS.every(t => droitCoche(d, t.key, right)); }

/** Première page du menu visible par un profil (destination de « Aperçu du profil »). */
export function premierePage(profils: Profil[], droits: DroitsMap, profilNom: string): string | null {
  const p = PAGES.find(pg => (PAGE_TABS[pg.id] || [pg.id]).some(k => droitsDe(profils, droits, profilNom, k).voir));
  return p ? p.id : null;
}
