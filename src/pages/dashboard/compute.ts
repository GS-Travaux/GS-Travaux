/* Calculs du tableau de bord (fonctions pures ; `today` et `now` injectables pour les tests). */
import type { Devis, State } from '../../lib/types';
import { devisAvancement, devisTotal, factureEcheance } from '../../lib/devis';
import { LIB_NATURES, dashboardYears, libPeriode } from '../../lib/liberatoire';
import { bordereauCimrTotaux, bordereauCnssTotaux, bulletinBrut, bulletinRetenuesDiv, calculChargesPatronales, calculPaie } from '../../lib/paie';
import { immoAmort, IMMO_CATS } from '../../lib/immo';
import { achatMontants } from '../../lib/achats';
import { todayIso } from '../../lib/format';

export type DashData = Pick<State, 'societe' | 'devis' | 'clients' | 'immobilisations' | 'achats' | 'impots' | 'collaborateurs' | 'pointages' | 'bulletins' | 'bordereauxCnss' | 'bordereauxCimr' | 'ordresMission'>;
export interface DashFilters { annee: string; mois: string; client: string }
export const NO_FILTERS: DashFilters = { annee: '', mois: '', client: '' };

export const MOIS_LABELS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
export const OM_COULEURS: Record<string, string> = { 'Planifié': 'var(--ink-soft)', 'En cours': 'var(--warn)', 'Terminé': 'var(--success)', 'Annulé': 'var(--danger)' };
export const AV_COULEURS: Record<string, string> = { 'Non démarré': 'var(--ink-soft)', 'En cours': 'var(--warn)', 'Terminé': 'var(--success)' };
export const PT_COULEURS: Record<string, string> = { 'Présent': 'var(--success)', 'Retard': 'var(--warn)', 'Absent': 'var(--danger)', 'Congé': 'var(--ink-soft)' };

export interface Item { label: string; value: number; color?: string }
export interface TreasuryRow { mois: string; encaiss: number; salaires: number; achats: number; impots: number; solde: number; cumule: number }

/** Nombre de jours entre `today` et `iso` (négatif si `iso` est passée). */
export function joursDepuis(iso: string, today: string): number {
  return Math.round((new Date(iso + 'T00:00:00Z').getTime() - new Date(today + 'T00:00:00Z').getTime()) / 86400000);
}

export function makeMatchYear(f: Pick<DashFilters, 'annee' | 'mois'>) {
  return (dateStr?: string | null): boolean =>
    (!f.annee || !!(dateStr && dateStr.startsWith(f.annee))) && (!f.mois || !!(dateStr && dateStr.slice(5, 7) === f.mois));
}

/** Années proposées par le filtre : celles des devis/factures (comme le prototype) ; si les devis ne sont pas lisibles, celles des autres données lisibles. */
export function availableYears(d: DashData): string[] {
  if (d.devis.length) return dashboardYears(d.devis);
  const y = new Set<string>();
  const add = (s?: string | null) => { if (s && /^\d{4}/.test(s)) y.add(s.slice(0, 4)); };
  d.achats.forEach(a => add(a.date)); d.impots.forEach(x => { add(x.echeance); add(x.paiement && x.paiement.date); });
  d.bulletins.forEach(b => add(b.mois)); d.pointages.forEach(p => add(p.date)); d.ordresMission.forEach(o => add(o.date));
  d.bordereauxCnss.forEach(b => add(b.mois)); d.bordereauxCimr.forEach(b => add(b.mois));
  return [...y].sort().reverse();
}

export function computeDashboard(data: DashData, f: DashFilters, today: string = todayIso(), now: number = Date.now()) {
  const matchYear = makeMatchYear(f);
  const matchClient = (d: { client?: string }) => !f.client || d.client === f.client;
  const collabById = (id: string) => data.collaborateurs.find(x => x.id === id);
  const cotise = (id: string) => { const c = collabById(id); return c ? c.cotiseCimr : false; };

  // ----- Activité commerciale -----
  const devisAll = data.devis.filter(matchClient);
  const devis = devisAll.filter(d => matchYear(d.date));
  const devisFactureesAnnee = devisAll.filter(d => d.statut === 'Facturé' && d.facture && matchYear(d.facture.date));
  const facturesEnCours = devisFactureesAnnee.filter(d => factureEcheance(d) > today);   // délai de paiement pas encore écoulé
  const totalFactureEnCours = facturesEnCours.reduce((s, d) => s + devisTotal(d), 0);
  const totalFacture = devisFactureesAnnee.reduce((s, d) => s + devisTotal(d), 0);
  const totalSoldee = devis.filter(d => d.statut === 'Soldée').reduce((s, d) => s + devisTotal(d), 0);
  const totalCree = devis.filter(d => d.statut === 'Créé').reduce((s, d) => s + devisTotal(d), 0);
  const countCree = devis.filter(d => d.statut === 'Créé').length;
  const countSoldee = devis.filter(d => d.statut === 'Soldée').length;
  const countFacture = devisFactureesAnnee.length;
  const countAnnule = devis.filter(d => d.statut === 'Annulé').length;

  // CA facturé par mois (6 derniers mois avec données)
  const byMonth: Record<string, number> = {};
  devisFactureesAnnee.forEach(d => { const m = d.facture!.date.slice(0, 7); byMonth[m] = (byMonth[m] || 0) + devisTotal(d); });
  const months = Object.keys(byMonth).sort().slice(-6);
  const chartData: Item[] = months.length ? months.map(m => ({ label: m.slice(2).replace('-', '/'), value: byMonth[m] })) : [{ label: '—', value: 0 }];
  const statutData = [
    { label: 'Créé', value: countCree, color: 'var(--neutral-bg)' },
    { label: 'Soldée', value: countSoldee, color: '#E8CB7A' },
    { label: 'Facturé', value: countFacture, color: '#8FCBA6' },
    { label: 'Annulé', value: countAnnule, color: '#E7A98F' },
  ];
  const parClient: Record<string, number> = {};
  devisFactureesAnnee.forEach(d => { parClient[d.client] = (parClient[d.client] || 0) + devisTotal(d); });
  const topClients = Object.entries(parClient).sort((a, b) => b[1] - a[1]).slice(0, 5);

  // ----- Chantiers -----
  const missions = data.ordresMission.filter(o => matchYear(o.date) && matchClient(o));
  const missionsEnCours = missions.filter(o => o.statut === 'Planifié' || o.statut === 'En cours').length;
  const omItems: Item[] = ['Planifié', 'En cours', 'Terminé', 'Annulé'].map(s => ({ label: s, value: missions.filter(o => o.statut === s).length, color: OM_COULEURS[s] }));
  const devisActifs = devis.filter(d => d.statut !== 'Annulé');
  const avItems: Item[] = ['Non démarré', 'En cours', 'Terminé'].map(s => ({ label: s, value: devisActifs.filter(d => devisAvancement(d, data.ordresMission) === s).length, color: AV_COULEURS[s] }));

  // ----- Charges d'exploitation (avec un client choisi : seuls les achats affectés à ses devis) -----
  const devisIdsClient = f.client ? new Set(data.devis.filter(d => d.client === f.client).map(d => d.id)) : null;
  const achatsPeriode = data.achats.filter(a => matchYear(a.date) && (!devisIdsClient || devisIdsClient.has(a.affectation)));
  const achatsTot = achatsPeriode.reduce((t, a) => {
    const m = achatMontants(a); t.ht += m.ht; t.ttc += m.ttc;
    if (a.statut === 'À payer') { t.apayer += m.ttc; t.nApayer++; }
    return t;
  }, { ht: 0, ttc: 0, apayer: 0, nApayer: 0 });
  const achatsParCat: Record<string, number> = {};
  achatsPeriode.forEach(a => { achatsParCat[a.categorie] = (achatsParCat[a.categorie] || 0) + achatMontants(a).ht; });
  const achatsCatItems: Item[] = Object.entries(achatsParCat).sort((x, y) => y[1] - x[1]).map(([label, value]) => ({ label, value }));
  const renta = devisActifs.map((d: Devis) => {
    const ach = data.achats.filter(a => a.affectation === d.id).reduce((s, a) => s + achatMontants(a).ht, 0);
    const montant = devisTotal(d);
    return { d, montant, ach, marge: montant - ach, pct: montant ? (montant - ach) / montant * 100 : 0 };
  }).filter(r => r.ach > 0).sort((a, b) => a.pct - b.pct);

  // ----- Personnel & cotisations sociales -----
  const collabActifs = data.collaborateurs.filter(c => c.statut === 'Actif').length;
  const bulletinsPeriode = data.bulletins.filter(b => matchYear(b.mois));
  const massSalariale = bulletinsPeriode.reduce((s, b) => {
    const c = collabById(b.collaborateurId);
    const p = calculPaie(bulletinBrut(b), c ? c.personnesACharge : 0, c ? c.cotiseCimr : false);
    return s + (p.net - bulletinRetenuesDiv(b));
  }, 0);
  const coutEmployeur = bulletinsPeriode.reduce((s, b) => s + calculChargesPatronales(bulletinBrut(b), cotise(b.collaborateurId)).coutEmployeur, 0);
  const cnssDus = data.bordereauxCnss.filter(b => b.statut === 'À payer' && matchYear(b.mois));
  const cnssDu = cnssDus.reduce((s, b) => s + bordereauCnssTotaux(b).total, 0);
  const cimrDus = data.bordereauxCimr.filter(b => b.statut === 'À payer' && matchYear(b.mois));
  const cimrDu = cimrDus.reduce((s, b) => s + bordereauCimrTotaux(b).total, 0);
  const pointagesPeriode = data.pointages.filter(p => matchYear(p.date));
  const ptItems: Item[] = ['Présent', 'Retard', 'Absent', 'Congé'].map(s => ({ label: s, value: pointagesPeriode.filter(p => p.statut === s).length, color: PT_COULEURS[s] }));
  const tauxPresence = pointagesPeriode.length ? Math.round(pointagesPeriode.filter(p => p.statut === 'Présent' || p.statut === 'Retard').length / pointagesPeriode.length * 100) : null;

  // ----- Immobilisations (situation à ce jour) -----
  const biens = data.immobilisations;
  const immoTot = biens.reduce((t, a) => { const am = immoAmort(a.valeur, a.dureeAmort, a.dateAcquisition, now); t.val += Number(a.valeur) || 0; t.vnc += am.vnc; t.dot += am.dotation; return t; }, { val: 0, vnc: 0, dot: 0 });
  const immoCatItems = (['materiel', 'transport'] as const).map(c => ({
    cat: c,
    label: `${IMMO_CATS[c].label} (${biens.filter(a => a.categorie === c).length})`,
    value: biens.filter(a => a.categorie === c).reduce((s, a) => s + immoAmort(a.valeur, a.dureeAmort, a.dateAcquisition, now).vnc, 0),
  }));
  const echeances: { bien: string; type: string; date: string; jours: number }[] = [];
  biens.filter(a => a.categorie === 'transport' && a.etat !== 'Réformé').forEach(a => {
    ([['Assurance', a.echeanceAssurance], ['Visite technique', a.echeanceVisite]] as const).forEach(([type, dt]) => {
      if (!dt) return;
      const jours = joursDepuis(dt, today);
      if (jours <= 30) echeances.push({ bien: `${a.typeVehicule} ${a.marque} (${a.immatriculation})`, type, date: dt, jours });
    });
  });
  echeances.sort((x, y) => x.date.localeCompare(y.date));

  // ----- Impôts et taxes -----
  const impotsNonPayes = data.impots.filter(x => !x.paiement && matchYear(x.echeance));
  const impotsRetard = impotsNonPayes.filter(x => x.echeance < today);
  const impotsPayes = data.impots.filter(x => x.paiement && matchYear(x.paiement.date));
  const somme = <T,>(arr: T[], fn: (x: T) => number) => arr.reduce((s, x) => s + fn(x), 0);
  const prochaineEch = data.impots.filter(x => !x.paiement && x.echeance >= today).sort((a, b) => a.echeance.localeCompare(b.echeance))[0];
  const impotsAlertes = data.impots.filter(x => !x.paiement && joursDepuis(x.echeance, today) <= 60).sort((a, b) => a.echeance.localeCompare(b.echeance));

  // ----- Impôt libératoire -----
  const libAnnee = f.annee || today.slice(0, 4);
  const lib = libPeriode(data.devis, data.societe, libAnnee, 'A', f.client, today);
  const libAlertes = lib.nat.seuil ? lib.rows.filter(r => r.statut !== 'OK') : [];

  // ----- Trésorerie : encaissements par échéance de facture vs coût employeur, achats payés (TTC), impôts payés -----
  const encaissByMonth: Record<string, number> = {};
  devisAll.filter(d => d.statut === 'Facturé' && d.facture).forEach(d => {
    const ech = factureEcheance(d);
    if (!matchYear(ech)) return;
    const m = ech.slice(0, 7);
    encaissByMonth[m] = (encaissByMonth[m] || 0) + devisTotal(d);
  });
  const payrollByMonth: Record<string, number> = {};
  data.bulletins.filter(b => matchYear(b.mois)).forEach(b => {
    payrollByMonth[b.mois] = (payrollByMonth[b.mois] || 0) + calculChargesPatronales(bulletinBrut(b), cotise(b.collaborateurId)).coutEmployeur;
  });
  const achatsPayesByMonth: Record<string, number> = {};
  data.achats.filter(a => a.statut === 'Payé' && matchYear(a.date)).forEach(a => {
    const m = a.date.slice(0, 7);
    achatsPayesByMonth[m] = (achatsPayesByMonth[m] || 0) + achatMontants(a).ttc;
  });
  const impotsPayesByMonth: Record<string, number> = {};
  data.impots.filter(x => x.paiement && matchYear(x.paiement.date)).forEach(x => {
    const m = x.paiement!.date.slice(0, 7);
    impotsPayesByMonth[m] = (impotsPayesByMonth[m] || 0) + x.paiement!.montant;
  });
  const moisCourant = today.slice(0, 7);
  const treasuryMonths = [...new Set([...Object.keys(encaissByMonth), ...Object.keys(payrollByMonth), ...Object.keys(achatsPayesByMonth), ...Object.keys(impotsPayesByMonth)])].sort();
  let soldeCumule = 0;
  const treasuryRows: TreasuryRow[] = treasuryMonths.map(m => {
    const encaiss = encaissByMonth[m] || 0, salaires = payrollByMonth[m] || 0, achats = achatsPayesByMonth[m] || 0, impots = impotsPayesByMonth[m] || 0;
    const solde = encaiss - salaires - achats - impots;
    soldeCumule += solde;
    return { mois: m, encaiss, salaires, achats, impots, solde, cumule: soldeCumule };
  });

  return {
    today, moisCourant,
    // commercial
    devisCount: devis.length, totalFacture, countFacture, facturesEnCours, totalFactureEnCours, totalSoldee, countSoldee, totalCree, countCree, countAnnule,
    chartData, statutData, topClients,
    // trésorerie
    treasuryRows,
    // chantiers
    missions, missionsEnCours, omItems, avItems, devisActifs,
    // charges
    achatsPeriode, achatsTot, achatsCatItems, renta, coutEmployeur, bulletinsPeriode,
    // personnel
    collabActifs, collabTotal: data.collaborateurs.length, massSalariale, cnssDus, cnssDu, cimrDus, cimrDu, ptItems, tauxPresence,
    // immobilisations
    biens, immoTot, immoCatItems, echeances,
    // impôts
    impotsNonPayes, impotsRetard, impotsPayes, impotsNonPayesTotal: somme(impotsNonPayes, x => x.montant), impotsRetardTotal: somme(impotsRetard, x => x.montant),
    impotsPayesTotal: somme(impotsPayes, x => x.paiement!.montant), prochaineEch, impotsAlertes,
    // libératoire
    libAnnee, lib, libAlertes, libNatures: LIB_NATURES,
  };
}
export type DashResult = ReturnType<typeof computeDashboard>;
