/* Calculs de paie marocains (barème 2026 du prototype) : CNSS, AMO, CIMR, IR, charges patronales. */
import type { BordereauCimrLigne, BordereauCnssLigne, Bulletin, Collaborateur, Conge, Pointage } from './types';

export const CNSS_PLAFOND = 6000;
export const IR_BAREME = [
  { max: 40000, taux: 0, deduction: 0 },
  { max: 60000, taux: 0.10, deduction: 4000 },
  { max: 80000, taux: 0.20, deduction: 10000 },
  { max: 100000, taux: 0.30, deduction: 18000 },
  { max: 180000, taux: 0.34, deduction: 22000 },
  { max: Infinity, taux: 0.37, deduction: 27400 },
];

export function calculPaie(brut: unknown, personnesACharge: unknown, cotiseCimr: boolean) {
  const b = Number(brut) || 0;
  const cnss = Math.min(b, CNSS_PLAFOND) * 0.0448;
  const amo = b * 0.0226;
  const cimr = cotiseCimr ? b * 0.0345 : 0;
  const sbi = Math.max(0, b - cnss - amo - cimr);
  const fraisPro = Math.min(sbi * 0.35, 35000 / 12);
  const rni = Math.max(0, sbi - fraisPro);
  const rniAnnuel = rni * 12;
  const tranche = IR_BAREME.find(t => rniAnnuel <= t.max)!;
  let irAnnuel = Math.max(0, rniAnnuel * tranche.taux - tranche.deduction);
  const chargesFamille = Math.min(Number(personnesACharge) || 0, 6) * 360;
  irAnnuel = Math.max(0, irAnnuel - chargesFamille);
  const ir = irAnnuel / 12;
  const net = b - cnss - amo - cimr - ir;
  return { brut: b, cnss, amo, cimr, sbi, fraisPro, rni, ir, net };
}

export function calculChargesPatronales(brut: unknown, cotiseCimr: boolean) {
  const b = Number(brut) || 0;
  const baseCnssPlaf = Math.min(b, CNSS_PLAFOND);
  const allocFamiliales = b * 0.0640;
  const prestCourtTerme = baseCnssPlaf * 0.0105;
  const prestLongTerme = baseCnssPlaf * 0.0793;
  const amoPatronal = b * 0.0411;
  const taxeFormation = b * 0.0160;
  const cimrPatronal = cotiseCimr ? b * 0.0345 : 0;
  const total = allocFamiliales + prestCourtTerme + prestLongTerme + amoPatronal + taxeFormation + cimrPatronal;
  return { allocFamiliales, prestCourtTerme, prestLongTerme, amoPatronal, taxeFormation, cimrPatronal, total, coutEmployeur: b + total };
}

export const bulletinBrut = (b: Pick<Bulletin, 'lignes'>) => (b.lignes || []).reduce((s, l) => s + (Number(l.montant) || 0), 0);
export const bulletinRetenuesDiv = (b: Pick<Bulletin, 'retenues'>) => (b.retenues || []).reduce((s, r) => s + (Number(r.montant) || 0), 0);

export function nextCollabId(list: Collaborateur[]): string {
  const max = list.reduce((m, c) => { const n = parseInt((c.id || '').split('-')[1] || '0', 10); return isNaN(n) ? m : Math.max(m, n); }, 0);
  return `SAL-${String(max + 1).padStart(4, '0')}`;
}
export function collabNom(list: Collaborateur[], id: string): string {
  const c = list.find(x => x.id === id); return c ? `${c.prenom} ${c.nom}` : '—';
}
export function congesPrisAnnee(conges: Conge[], collaborateurId: string, annee: string | number): number {
  return conges.filter(cg => cg.collaborateurId === collaborateurId && cg.type === 'Congé payé' && cg.statut === 'Validé' && cg.dateDebut.slice(0, 4) === String(annee))
    .reduce((s, cg) => s + (Number(cg.jours) || 0), 0);
}
export function cumulsAnnee(bulletins: Bulletin[], collaborateurs: Collaborateur[], collaborateurId: string, mois: string) {
  const annee = mois.slice(0, 4);
  return bulletins.filter(b => b.collaborateurId === collaborateurId && b.mois.slice(0, 4) === annee).reduce((acc, b) => {
    const c = collaborateurs.find(x => x.id === b.collaborateurId);
    const brut = bulletinBrut(b);
    const p = calculPaie(brut, c ? c.personnesACharge : 0, c ? c.cotiseCimr : false);
    const cp = calculChargesPatronales(brut, c ? c.cotiseCimr : false);
    acc.brut += p.brut; acc.net += p.net; acc.cnssAmoCimr += p.cnss + p.amo + p.cimr; acc.ir += p.ir; acc.fraisPro += p.fraisPro;
    acc.chargesPatronales += cp.total;
    return acc;
  }, { brut: 0, net: 0, cnssAmoCimr: 0, ir: 0, fraisPro: 0, chargesPatronales: 0 });
}
export function joursPointes(pointages: Pointage[], collaborateurId: string, mois: string): number {
  return pointages.filter(p => p.collaborateurId === collaborateurId && p.date.slice(0, 7) === mois && (p.statut === 'Présent' || p.statut === 'Retard')).length;
}

/* ── Bordereaux CNSS / CIMR ── */
export function buildBordereauCnssLignes(bulletins: Bulletin[], collaborateurs: Collaborateur[], pointages: Pointage[], mois: string): BordereauCnssLigne[] {
  const brutParCollab: Record<string, number> = {};
  bulletins.filter(b => b.mois === mois).forEach(b => { brutParCollab[b.collaborateurId] = (brutParCollab[b.collaborateurId] || 0) + bulletinBrut(b); });
  return Object.entries(brutParCollab).map(([cid, brut]) => {
    const c = collaborateurs.find(x => x.id === cid);
    const p = calculPaie(brut, 0, false);
    const cp = calculChargesPatronales(brut, false);        // la CIMR n'est pas versée à la CNSS
    return {
      collaborateurId: cid, nom: c ? `${c.prenom} ${c.nom}` : cid, cnssNum: c ? c.cnssNum : '',
      jours: (c && c.typePaie === 'Journalier') ? joursPointes(pointages, cid, mois) : 26,
      brut, brutPlafonne: Math.min(brut, CNSS_PLAFOND),
      psSal: p.cnss, psPat: cp.prestCourtTerme + cp.prestLongTerme, af: cp.allocFamiliales, tfp: cp.taxeFormation, amoSal: p.amo, amoPat: cp.amoPatronal,
    };
  });
}
export function bordereauCnssTotaux(b: { lignes: BordereauCnssLigne[] }) {
  const t = { brut: 0, brutPlaf: 0, ps: 0, af: 0, amo: 0, tfp: 0, salariale: 0, patronale: 0, total: 0 };
  b.lignes.forEach(l => {
    t.brut += l.brut; t.brutPlaf += l.brutPlafonne; t.ps += l.psSal + l.psPat; t.af += l.af; t.amo += l.amoSal + l.amoPat; t.tfp += l.tfp;
    t.salariale += l.psSal + l.amoSal; t.patronale += l.psPat + l.af + l.tfp + l.amoPat;
  });
  t.total = t.salariale + t.patronale;
  return t;
}
export function buildBordereauCimrLignes(bulletins: Bulletin[], collaborateurs: Collaborateur[], mois: string): BordereauCimrLigne[] {
  const brutParCollab: Record<string, number> = {};
  bulletins.filter(b => b.mois === mois).forEach(b => {
    const c = collaborateurs.find(x => x.id === b.collaborateurId);
    if (!c || !c.cotiseCimr) return;                       // seuls les affiliés CIMR sont déclarés
    brutParCollab[b.collaborateurId] = (brutParCollab[b.collaborateurId] || 0) + bulletinBrut(b);
  });
  return Object.entries(brutParCollab).map(([cid, brut]) => {
    const c = collaborateurs.find(x => x.id === cid)!;
    return { collaborateurId: cid, nom: `${c.prenom} ${c.nom}`, cimrNum: c.cimrNum || '', brut, sal: calculPaie(brut, 0, true).cimr, pat: calculChargesPatronales(brut, true).cimrPatronal };
  });
}
export function bordereauCimrTotaux(b: { lignes: BordereauCimrLigne[] }) {
  return b.lignes.reduce((t, l) => { t.brut += l.brut; t.sal += l.sal; t.pat += l.pat; t.total += l.sal + l.pat; return t; }, { brut: 0, sal: 0, pat: 0, total: 0 });
}
