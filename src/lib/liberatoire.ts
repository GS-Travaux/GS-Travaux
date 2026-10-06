/* Impôt libératoire de l'auto-entrepreneur (calcul indicatif, à faire valider par un comptable) :
   taux appliqué au chiffre d'affaires ENCAISSÉ ; pour les prestations de services, règle des 80 000 DH par client
   et par an : au-delà, retenue à la source de 30 % opérée par le client. */
import type { Devis, Societe } from './types';
import { todayIso } from './format';
import { devisTotal, factureEcheance } from './devis';

export const LIB_SEUIL = 80000;
export const LIB_RETENUE = 0.30;
export interface LibNature { label: string; taux: number; tauxLabel: string; seuil: boolean }
export const LIB_NATURES: Record<string, LibNature> = {
  services: { label: 'Prestations de services', taux: 0.01, tauxLabel: '1 %', seuil: true },
  commerce: { label: 'Commerce, industrie, artisanat', taux: 0.005, tauxLabel: '0,5 %', seuil: false },
};
export const LIB_BADGE: Record<string, string> = { 'OK': 'badge-facture', 'Proche du seuil': 'badge-soldee', 'Dépassement prévu': 'badge-soldee', 'Seuil dépassé': 'badge-annule' };

export function libStatutAE(txt: unknown): boolean {
  return /auto[\W_]*entrepreneur/.test(String(txt || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''));
}
/** L'impôt libératoire ne concerne que les entreprises dont le statut juridique est auto-entrepreneur. */
export function libActif(societe: Pick<Societe, 'statutJuridique'> | undefined | null): boolean { return libStatutAE(societe && societe.statutJuridique); }
export function libNature(societe: Pick<Societe, 'natureActivite'> | undefined | null): string {
  const k = societe && societe.natureActivite; return k && LIB_NATURES[k] ? k : 'services';
}

const LIB_TRIM: Record<number, [string, string, string | null]> = {
  1: ['01-01', '03-31', '04-30'], 2: ['04-01', '06-30', '07-31'], 3: ['07-01', '09-30', '10-31'], 4: ['10-01', '12-31', null],
};
export type LibMode = 'A' | '1' | '2' | '3' | '4';
export interface LibInfo { fin: string; finPrec: string; label: string; echeance: string }
export function libPeriodeInfo(annee: string | number, mode: LibMode | string): LibInfo {
  if (mode === 'A') return { fin: annee + '-12-31', finPrec: '', label: 'Année ' + annee, echeance: (Number(annee) + 1) + '-01-31' };
  const t = Number(mode), prec = t > 1 ? LIB_TRIM[t - 1][1] : '';
  return {
    fin: annee + '-' + LIB_TRIM[t][1], finPrec: prec ? annee + '-' + prec : '', label: 'T' + t + ' ' + annee,
    echeance: LIB_TRIM[t][2] ? annee + '-' + LIB_TRIM[t][2] : (Number(annee) + 1) + '-01-31',
  };
}
const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

export interface LibCumulClient { client: string; encaisse: number; enCours: number }
/** CA encaissé (échéance de la facture atteinte) cumulé du 1er janvier à `fin`, par client ; enCours = facturé non encore encaissé. */
export function libCumul(devis: Devis[], annee: string | number, fin: string, clientFilter?: string, today = todayIso()): Record<string, LibCumulClient> {
  const map: Record<string, LibCumulClient> = {};
  devis.forEach(d => {
    if (d.statut !== 'Facturé' || !d.facture || !d.facture.date) return;
    if (clientFilter && d.client !== clientFilter) return;
    const e = factureEcheance(d);
    if (!e || e.slice(0, 4) !== String(annee) || e > fin) return;
    const k = d.client || '—';
    const r = map[k] || (map[k] = { client: k, encaisse: 0, enCours: 0 });
    if (e <= today) r.encaisse += devisTotal(d); else r.enCours += devisTotal(d);
  });
  return map;
}
export function libCalcul(natureKey: string, enc: number) {
  const nat = LIB_NATURES[natureKey] || LIB_NATURES.services;
  const base = nat.seuil ? Math.min(enc, LIB_SEUIL) : enc;
  const exces = nat.seuil ? Math.max(0, enc - LIB_SEUIL) : 0;
  return { base: r2(base), exces: r2(exces), retenue: r2(exces * LIB_RETENUE), impot: r2(base * nat.taux) };
}
export interface LibRow { client: string; encaisse: number; cumul: number; enCours: number; base: number; exces: number; retenue: number; impot: number; statut: string }
export interface LibTotaux { encaisse: number; enCours: number; base: number; exces: number; retenue: number; impot: number }
/** Situation par client pour une période (année ou trimestre ; un trimestre = différence de cumuls, car le seuil est annuel). */
export function libPeriode(devis: Devis[], societe: Pick<Societe, 'natureActivite'>, annee: string | number, mode: LibMode | string, clientFilter?: string, today = todayIso()) {
  const info = libPeriodeInfo(annee, mode), natKey = libNature(societe), nat = LIB_NATURES[natKey];
  const cum = libCumul(devis, annee, info.fin, clientFilter, today);
  const prec = info.finPrec ? libCumul(devis, annee, info.finPrec, clientFilter, today) : {};
  const rows: LibRow[] = Object.keys(cum).map(c => {
    const a = cum[c], pEnc = prec[c] ? prec[c].encaisse : 0;
    const k = libCalcul(natKey, a.encaisse), kp = libCalcul(natKey, pEnc);
    let statut = 'OK';
    if (nat.seuil) {
      if (a.encaisse > LIB_SEUIL) statut = 'Seuil dépassé';
      else if (a.encaisse + a.enCours > LIB_SEUIL) statut = 'Dépassement prévu';
      else if (a.encaisse + a.enCours >= LIB_SEUIL * 0.8) statut = 'Proche du seuil';
    }
    return {
      client: c, encaisse: r2(a.encaisse - pEnc), cumul: r2(a.encaisse), enCours: r2(a.enCours),
      base: r2(k.base - kp.base), exces: r2(k.exces - kp.exces), retenue: r2(k.retenue - kp.retenue), impot: r2(k.impot - kp.impot), statut,
    };
  }).filter(r => r.encaisse || r.enCours || r.impot).sort((a, b) => b.cumul - a.cumul);
  const tot = rows.reduce<LibTotaux>((t, r) => ({
    encaisse: t.encaisse + r.encaisse, enCours: t.enCours + r.enCours, base: t.base + r.base, exces: t.exces + r.exces, retenue: t.retenue + r.retenue, impot: t.impot + r.impot,
  }), { encaisse: 0, enCours: 0, base: 0, exces: 0, retenue: 0, impot: 0 });
  (Object.keys(tot) as (keyof LibTotaux)[]).forEach(k => { tot[k] = r2(tot[k]); });
  return { info, rows, tot, nat };
}
/** Années proposées (devis, factures, échéances d'encaissement), de la plus récente à la plus ancienne. */
export function dashboardYears(devis: Devis[]): string[] {
  const years = new Set<string>();
  devis.forEach(d => {
    if (d.date) years.add(d.date.slice(0, 4));
    if (d.facture && d.facture.date) { years.add(d.facture.date.slice(0, 4)); years.add(factureEcheance(d).slice(0, 4)); }
  });
  return [...years].sort().reverse();
}
