/* Aides de test des pages Tiers / Immobilisation / Achats / Impôts / Société (les libellés ne sont pas liés aux champs par htmlFor). */
import { fireEvent, screen } from '@testing-library/react';
import { defaultDroits } from '../lib/rights';
import type { DroitsMap } from '../lib/types';

export function fieldOf(label: string, root: HTMLElement = document.body): HTMLInputElement | HTMLSelectElement {
  const l = Array.from(root.querySelectorAll('label')).find(x => (x.textContent || '').trim() === label);
  if (!l) throw new Error(`Champ introuvable : ${label}`);
  const el = l.parentElement!.querySelector('input,select') as HTMLInputElement | HTMLSelectElement | null;
  if (!el) throw new Error(`Aucun champ pour : ${label}`);
  return el;
}
export const hasField = (label: string, root: HTMLElement = document.body) => Array.from(root.querySelectorAll('label')).some(x => (x.textContent || '').trim() === label);
export function setField(label: string, value: string, root: HTMLElement = document.body) { fireEvent.change(fieldOf(label, root), { target: { value } }); }
export const dialog = () => screen.getByRole('dialog');
export const flat = (s: string | null | undefined) => (s || '').replace(/\s/g, ' ');

/** Droits du profil Comptable limités à « voir » sur les onglets donnés (profil en lecture seule). */
export function lectureSeule(...keys: string[]): DroitsMap {
  const d = defaultDroits();
  const c: Record<string, { voir: boolean; modifier: boolean; supprimer: boolean }> = {};
  keys.forEach(k => { c[k] = { voir: true, modifier: false, supprimer: false }; });
  return { ...d, 'prf-comptable': c };
}
