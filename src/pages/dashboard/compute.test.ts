import { describe, expect, it } from 'vitest';
import { computeDashboard, makeMatchYear, NO_FILTERS, availableYears, joursDepuis, type DashData } from './compute';

const TODAY = '2026-10-06';
const NOW = new Date(TODAY + 'T00:00:00Z').getTime();
const dv = (id: string, client: string, statut: string, qte: number, pu: number, extra: any = {}) => ({
  id, numero: id, client, date: '2026-05-01', objet: '', emetteur: '', statut, modePaiement: '', delaiPaiement: '', demandeAvance: 0,
  lignes: [{ designation: 'L-' + id, qte, pu, matiere: 'avec', taches: [] }], dateSoldee: '', dateFacturee: '', bc: null, facture: null, ...extra,
});
const fac = (date: string, delai: string) => ({ numero: 'F', date, modePaiement: 'Virement', delai });

const data: DashData = {
  societe: { nom: 'S', statutJuridique: 'SARL', natureActivite: 'services' } as any,
  clients: [{ id: 'c1', nom: 'X', ice: '', adresse: '' }, { id: 'c2', nom: 'Y', ice: '', adresse: '' }],
  devis: [
    dv('A', 'X', 'Facturé', 1, 1000, { facture: fac('2026-08-10', '60 jours') }),     // échéance 2026-10-09 (après aujourd'hui)
    dv('B', 'X', 'Facturé', 2, 500, { facture: fac('2026-06-01', 'Comptant') }),      // échéance 2026-06-01
    dv('C', 'Y', 'Facturé', 1, 500, { facture: fac('2026-05-15', '2 mois') }),        // échéance 2026-07-14
    dv('D', 'X', 'Soldée', 3, 100), dv('E', 'Y', 'Créé', 1, 250), dv('F', 'Y', 'Annulé', 1, 90),
  ] as any,
  collaborateurs: [{ id: 'S1', statut: 'Actif', personnesACharge: 0, cotiseCimr: false }, { id: 'S2', statut: 'Démissionné', personnesACharge: 0, cotiseCimr: false }] as any,
  bulletins: [{ id: 'b1', collaborateurId: 'S1', mois: '2026-06', lignes: [{ designation: 'Salaire', montant: 5000 }], retenues: [], statut: 'Payé' }] as any,
  achats: [
    { id: 'a1', type: 'consommable', date: '2026-06-20', categorie: 'Tôles et profilés', quantite: 2, prixUnitaire: 100, tva: 20, statut: 'Payé', affectation: 'A' },
    { id: 'a2', type: 'autre', date: '2026-06-21', categorie: 'Carburant', quantite: 1, prixUnitaire: 1000, tva: 0, statut: 'À payer', affectation: 'FG' },
  ] as any,
  impots: [
    { id: 'i1', type: 'IR', periode: 'T2', echeance: '2026-07-31', montant: 300, paiement: { date: '2026-07-20', montant: 300, mode: '', reference: '' } },
    { id: 'i2', type: 'TVA', periode: 'T3', echeance: '2026-09-30', montant: 900, paiement: null },
    { id: 'i3', type: 'TP', periode: '2026', echeance: '2026-11-15', montant: 400, paiement: null },
    { id: 'i4', type: 'Vignette', periode: '2026', echeance: '2027-03-01', montant: 50, paiement: null },
  ] as any,
  immobilisations: [
    { id: 'MT-1', categorie: 'transport', typeVehicule: 'Camion', marque: 'M', immatriculation: '1-A-1', dateAcquisition: '2026-01-01', valeur: 1000, dureeAmort: 5, etat: 'En service', echeanceAssurance: '2026-10-01', echeanceVisite: '2026-12-31' },
    { id: 'MT-2', categorie: 'transport', typeVehicule: 'Voiture', marque: 'N', immatriculation: '2-A-1', dateAcquisition: '2026-01-01', valeur: 1000, dureeAmort: 5, etat: 'Réformé', echeanceAssurance: '2026-10-01' },
    { id: 'MO-1', categorie: 'materiel', designation: 'Poste', marque: 'P', dateAcquisition: '2026-01-01', valeur: 500, dureeAmort: 5, etat: 'En service' },
  ] as any,
  pointages: [
    { id: 'p1', collaborateurId: 'S1', date: '2026-06-01', statut: 'Présent' }, { id: 'p2', collaborateurId: 'S1', date: '2026-06-02', statut: 'Retard' },
    { id: 'p3', collaborateurId: 'S1', date: '2026-06-03', statut: 'Absent' }, { id: 'p4', collaborateurId: 'S1', date: '2026-07-03', statut: 'Congé' },
  ] as any,
  bordereauxCnss: [], bordereauxCimr: [], ordresMission: [],
};

describe('trésorerie (encaissements par échéance de facture)', () => {
  it('construit les lignes mensuelles et les soldes cumulés', () => {
    const r = computeDashboard(data, NO_FILTERS, TODAY, NOW);
    // coût employeur de 5000 bruts : 5000 + 320 + 52,5 + 396,5 + 205,5 + 80 = 6054,5 ; achat payé : 2 × 100 × 1,2 = 240
    expect(r.treasuryRows).toEqual([
      { mois: '2026-06', encaiss: 1000, salaires: 6054.5, achats: 240, impots: 0, solde: -5294.5, cumule: -5294.5 },
      { mois: '2026-07', encaiss: 500, salaires: 0, achats: 0, impots: 300, solde: 200, cumule: -5094.5 },
      { mois: '2026-10', encaiss: 1000, salaires: 0, achats: 0, impots: 0, solde: 1000, cumule: -4094.5 },
    ]);
  });
  it('le mois courant est « courant », les suivants sont prévisionnels', () => {
    expect(computeDashboard(data, NO_FILTERS, TODAY, NOW).moisCourant).toBe('2026-10');
  });
  it('ignore les achats « À payer » ; filtre mois = juin', () => {
    const r = computeDashboard(data, { ...NO_FILTERS, mois: '06' }, TODAY, NOW);
    expect(r.treasuryRows.map(x => x.mois)).toEqual(['2026-06']);
    expect(r.treasuryRows[0].achats).toBe(240);
  });
  it('filtre client X : exclut la facture de Y mais pas la paie ni les impôts', () => {
    const r = computeDashboard(data, { ...NO_FILTERS, client: 'X' }, TODAY, NOW);
    expect(r.treasuryRows.find(x => x.mois === '2026-07')).toMatchObject({ encaiss: 0, impots: 300 });
    expect(r.treasuryRows.find(x => x.mois === '2026-06')!.salaires).toBe(6054.5);
  });
  it('sans aucune donnée lisible : aucune ligne', () => {
    const r = computeDashboard({ ...data, devis: [], bulletins: [], achats: [], impots: [] }, NO_FILTERS, TODAY, NOW);
    expect(r.treasuryRows).toEqual([]);
  });
});

describe('indicateurs', () => {
  const r = computeDashboard(data, NO_FILTERS, TODAY, NOW);
  it('activité commerciale', () => {
    expect(r.totalFacture).toBe(2500); expect(r.countFacture).toBe(3);
    expect(r.facturesEnCours.map(d => d.id)).toEqual(['A']); expect(r.totalFactureEnCours).toBe(1000);
    expect(r.totalSoldee).toBe(300); expect(r.countSoldee).toBe(1); expect(r.totalCree).toBe(250); expect(r.countAnnule).toBe(1);
    expect(r.topClients).toEqual([['X', 2000], ['Y', 500]]);
    expect(r.chartData).toEqual([{ label: '26/05', value: 500 }, { label: '26/06', value: 1000 }, { label: '26/08', value: 1000 }]);
  });
  it('filtre client', () => {
    const x = computeDashboard(data, { ...NO_FILTERS, client: 'Y' }, TODAY, NOW);
    expect(x.totalFacture).toBe(500); expect(x.countCree).toBe(1);
  });
  it('achats, marge, personnel', () => {
    expect(r.achatsTot).toEqual({ ht: 1200, ttc: 1240, apayer: 1000, nApayer: 1 });
    expect(r.achatsCatItems).toEqual([{ label: 'Carburant', value: 1000 }, { label: 'Tôles et profilés', value: 200 }]);
    expect(r.renta).toHaveLength(1); expect(r.renta[0]).toMatchObject({ ach: 200, montant: 1000, marge: 800, pct: 80 });
    expect(r.collabActifs).toBe(1); expect(r.collabTotal).toBe(2); expect(r.coutEmployeur).toBe(6054.5);
    expect(r.tauxPresence).toBe(50);
  });
  it('impôts : à payer, retard, prochaine échéance, alertes à 60 jours', () => {
    expect(r.impotsNonPayesTotal).toBe(1350); expect(r.impotsRetardTotal).toBe(900); expect(r.impotsPayesTotal).toBe(300);
    expect(r.prochaineEch!.id).toBe('i3');
    expect(r.impotsAlertes.map(x => x.id)).toEqual(['i2', 'i3']);
  });
  it('échéances véhicules : réformés exclus, dans les 30 jours', () => {
    expect(r.echeances).toEqual([{ bien: 'Camion M (1-A-1)', type: 'Assurance', date: '2026-10-01', jours: -5 }]);
  });
  it('libératoire (année courante par défaut) : encaissé = échéance atteinte', () => {
    expect(r.libAnnee).toBe('2026');
    expect(r.lib.tot.encaisse).toBe(1500);       // B (1000) + C (500) ; A n'est pas encore échue
    expect(r.lib.tot.impot).toBe(15);            // 1 % de 1500
  });
});

describe('utilitaires', () => {
  it('makeMatchYear', () => {
    const m = makeMatchYear({ annee: '2026', mois: '06' });
    expect(m('2026-06-15')).toBe(true); expect(m('2026-07-15')).toBe(false); expect(m('2025-06-15')).toBe(false); expect(m(undefined)).toBe(false);
    expect(makeMatchYear({ annee: '', mois: '' })(undefined)).toBe(true);
  });
  it('joursDepuis', () => { expect(joursDepuis('2026-10-09', TODAY)).toBe(3); expect(joursDepuis('2026-10-01', TODAY)).toBe(-5); });
  it('availableYears : devis puis, à défaut, autres données', () => {
    expect(availableYears(data)).toEqual(['2026']);
    expect(availableYears({ ...data, devis: [], impots: [{ ...data.impots[3] }, { ...data.impots[0] }] })).toEqual(['2027', '2026']);
  });
});
