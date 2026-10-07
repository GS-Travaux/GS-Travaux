import { describe, expect, it } from 'vitest';
import { RIGHTS_TABS, defaultDroits, defaultProfils, droitsDe } from '../../lib/rights';
import { dashboardVisibility, hasAnySection, readableCollections, restrictState } from './access';

const canOf = (...keys: string[]) => (k: string) => keys.includes(k);
const profilCan = (nom: string) => { const p = defaultProfils(), d = defaultDroits(); return (k: string) => droitsDe(p, d, nom, k).voir; };

describe('readableCollections', () => {
  it('aucun droit : rien de lisible, sauf la société', () => {
    const r = readableCollections(canOf());
    expect(r).toMatchObject({ devis: false, clients: false, fournisseurs: false, immobilisations: false, achats: false, impots: false, collaborateurs: false,
      pointages: false, conges: false, bulletins: false, bordereauxCnss: false, bordereauxCimr: false, ordresMission: false, societe: true });
    expect(r.immoCategories).toEqual([]); expect(r.achatTypes).toEqual([]);
  });
  it('un onglet de facturation donne la lecture des devis, des clients, mais pas des ordres de mission', () => {
    const r = readableCollections(canOf('facturation'));
    expect(r.devis).toBe(true); expect(r.clients).toBe(true); expect(r.ordresMission).toBe(false);
  });
  it('devis_articles lit les devis mais pas les ordres de mission ; mission lit devis, clients, collaborateurs, ordres', () => {
    expect(readableCollections(canOf('devis_articles'))).toMatchObject({ devis: true, ordresMission: false });
    expect(readableCollections(canOf('mission'))).toMatchObject({ devis: true, clients: true, collaborateurs: true, ordresMission: true, bulletins: false });
  });
  it('immobilisations et achats se lisent par catégorie / type', () => {
    const r = readableCollections(canOf('immo_transport', 'achat_autre'));
    expect(r.immobilisations).toBe(true); expect(r.immoCategories).toEqual(['transport']);
    expect(r.achats).toBe(true); expect(r.achatTypes).toEqual(['autre']);
    expect(r.fournisseurs).toBe(true);
  });
  it('cotisations : CNSS lit pointages, bulletins, collaborateurs et ses bordereaux ; pas ceux de la CIMR', () => {
    const r = readableCollections(canOf('collab_cnss'));
    expect(r).toMatchObject({ pointages: true, bulletins: true, collaborateurs: true, bordereauxCnss: true, bordereauxCimr: false, conges: false });
  });
  it('congés : lus par collab_conges et collab_paie', () => {
    expect(readableCollections(canOf('collab_conges')).conges).toBe(true);
    expect(readableCollections(canOf('collab_paie')).conges).toBe(true);
    expect(readableCollections(canOf('collab_cimr')).conges).toBe(false);
  });
  it('impôts', () => {
    expect(readableCollections(canOf('impots')).impots).toBe(true);
    expect(readableCollections(canOf('societe')).impots).toBe(false);
  });
  it('tous les onglets : tout est lisible', () => {
    const r = readableCollections(() => true);
    expect(Object.values(r).every(x => x === true || Array.isArray(x))).toBe(true);
    expect(r.immoCategories).toHaveLength(2); expect(r.achatTypes).toHaveLength(2);
  });
  it('les clés utilisées existent dans RIGHTS_TABS', () => {
    const keys = new Set(RIGHTS_TABS.map(t => t.key));
    const used = ['devis', 'devis_articles', 'commandes', 'facturation', 'mission', 'tiers_client', 'tiers_fournisseur', 'achat_consommable', 'achat_autre', 'immo_materiel', 'immo_transport',
      'impots', 'collab_salaries', 'collab_pointage', 'collab_conges', 'collab_paie', 'collab_cnss', 'collab_cimr'];
    used.forEach(k => expect(keys.has(k)).toBe(true));
  });
});

describe('dashboardVisibility', () => {
  it('aucun droit : aucune section', () => {
    expect(hasAnySection(dashboardVisibility(readableCollections(canOf()), true))).toBe(false);
  });
  it('Commercial : activité commerciale, chantiers, encaissements ; ni paie, ni charges, ni impôts, ni immobilisations', () => {
    const v = dashboardVisibility(readableCollections(profilCan('Commercial')), true);
    expect(v.commercial).toBe(true); expect(v.chantiers.show).toBe(true); expect(v.chantiers.avancement).toBe(true);
    expect(v.clientFilter).toBe(true);
    expect(v.tresorerie).toEqual({ show: true, encaissements: true, salaires: false, achats: false, impots: false }); expect(v.charges.show).toBe(false); expect(v.impots).toBe(false); expect(v.immo.show).toBe(false);
    expect(v.personnel).toMatchObject({ masseSalariale: false, cnss: false, cimr: false, pointage: false });
  });
  it('Comptable : pas de chantiers, charges/immobilisations/impôts/paie visibles', () => {
    const v = dashboardVisibility(readableCollections(profilCan('Comptable')), true);
    expect(v.chantiers.show).toBe(false);
    expect(v.charges).toMatchObject({ show: true, achats: true, marge: true, coutEmployeur: true });
    expect(v.immo).toMatchObject({ show: true, materiel: true, transport: true });
    expect(v.impots).toBe(true); expect(v.personnel).toMatchObject({ masseSalariale: true, cnss: true, cimr: true, pointage: true });
    expect(v.tresorerie).toMatchObject({ show: true, encaissements: true, salaires: true, achats: true, impots: true });
  });
  it('trésorerie : seules les colonnes lisibles', () => {
    const v = dashboardVisibility(readableCollections(canOf('impots', 'achat_autre')), false);
    expect(v.tresorerie).toEqual({ show: true, encaissements: false, salaires: false, achats: true, impots: true });
  });
  it('marge sur achats : exige les deux types d\'achats et les devis', () => {
    expect(dashboardVisibility(readableCollections(canOf('devis', 'achat_autre')), false).charges.marge).toBe(false);
    expect(dashboardVisibility(readableCollections(canOf('devis', 'achat_autre', 'achat_consommable')), false).charges.marge).toBe(true);
    expect(dashboardVisibility(readableCollections(canOf('achat_autre', 'achat_consommable')), false).charges.marge).toBe(false);
  });
  it('impôt libératoire : statut auto-entrepreneur ET devis lisibles', () => {
    expect(dashboardVisibility(readableCollections(canOf('devis')), true).liberatoire).toBe(true);
    expect(dashboardVisibility(readableCollections(canOf('devis')), false).liberatoire).toBe(false);
    expect(dashboardVisibility(readableCollections(canOf('impots')), true).liberatoire).toBe(false);
  });
  it('masse salariale : bulletins et collaborateurs ; filtre client : clients et devis', () => {
    expect(dashboardVisibility(readableCollections(canOf('collab_cimr')), false).personnel.masseSalariale).toBe(true);
    expect(dashboardVisibility(readableCollections(canOf('tiers_client')), false).clientFilter).toBe(false);
  });
});

describe('restrictState', () => {
  const state: any = {
    devis: [{ id: 'd' }], clients: [{ id: 'c' }], impots: [{ id: 'i' }], collaborateurs: [{ id: 'c1' }], pointages: [{ id: 'p' }], bulletins: [{ id: 'b' }],
    bordereauxCnss: [{ id: 'n' }], bordereauxCimr: [{ id: 'm' }], ordresMission: [{ id: 'o' }],
    achats: [{ id: 'a1', type: 'consommable' }, { id: 'a2', type: 'autre' }],
    immobilisations: [{ id: 'm1', categorie: 'materiel' }, { id: 't1', categorie: 'transport' }],
  };
  it('vide ce qui est illisible et filtre catégories / types', () => {
    const out = restrictState(state, readableCollections(canOf('facturation', 'achat_autre', 'immo_transport')));
    expect(out.devis).toHaveLength(1); expect(out.clients).toHaveLength(1);
    expect(out.impots).toEqual([]); expect(out.collaborateurs).toEqual([]); expect(out.bulletins).toEqual([]); expect(out.ordresMission).toEqual([]);
    expect(out.achats.map((a: any) => a.id)).toEqual(['a2']); expect(out.immobilisations.map((a: any) => a.id)).toEqual(['t1']);
    expect(state.impots).toHaveLength(1);       // l'original n'est pas modifié
  });
});
