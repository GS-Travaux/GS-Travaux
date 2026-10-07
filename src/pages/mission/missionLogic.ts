/* Logique pure des ordres de mission. */
import type { OrdreMission } from '../../lib/types';

export const MISSION_STATUTS = ['Planifié', 'En cours', 'Terminé', 'Annulé'] as const;
export const MISSION_BADGE: Record<string, string> = { 'Planifié': 'badge-cree', 'En cours': 'badge-soldee', 'Terminé': 'badge-facture', 'Annulé': 'badge-annule' };

/** Prochain n° d'ordre de mission : OM-0001, OM-0002… */
export function nextMissionId(ordres: Pick<OrdreMission, 'id'>[]): string {
  const max = ordres.reduce((m, o) => {
    const n = parseInt((o.id || '').split('-')[1] || '0', 10);
    return isNaN(n) ? m : Math.max(m, n);
  }, 0);
  return `OM-${String(max + 1).padStart(4, '0')}`;
}
