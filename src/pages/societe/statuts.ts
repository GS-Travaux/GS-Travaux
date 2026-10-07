/* Statuts juridiques proposés dans « Mon société ». */
import { libStatutAE } from '../../lib/liberatoire';

export const STATUTS_JURIDIQUES = ['Auto-entrepreneur', 'Personne physique', 'SARL', 'SARL AU', 'SA', 'SNC', 'SCS', 'Coopérative', 'Association'];

/** Liste déroulante pour une valeur courante : une valeur existante hors liste est conservée comme option.
    `selected` est la valeur à présélectionner (« auto entrepreneur » → « Auto-entrepreneur », casse normalisée). */
export function statutOptions(cur: unknown): { options: string[]; selected: string } {
  const options = STATUTS_JURIDIQUES.slice();
  const c = String(cur ?? '').trim();
  const known = options.find(x => x.toLowerCase() === c.toLowerCase() || (libStatutAE(c) && x === 'Auto-entrepreneur'));
  if (c && !known) options.push(c);
  return { options, selected: known || c || options[0] };
}
