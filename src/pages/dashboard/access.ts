/* Lecture des collections : la base ne renvoie une collection (sous forme d'un tableau VIDE, pas d'erreur) qu'aux profils
   ayant le droit « voir » sur au moins un des onglets qui s'appuient dessus. Le tableau de bord ne doit donc jamais afficher
   de zéros trompeurs pour une collection qu'il ne peut pas lire : ces fonctions pures disent ce qui est lisible. */
import type { State } from '../../lib/types';

export type CanFn = (tabKey: string) => boolean;

export type CollectionKey =
  | 'devis' | 'clients' | 'fournisseurs' | 'immobilisations' | 'achats' | 'impots' | 'collaborateurs'
  | 'pointages' | 'conges' | 'bulletins' | 'bordereauxCnss' | 'bordereauxCimr' | 'ordresMission' | 'societe';

/** Onglets de droits dont l'un suffit (droit « voir ») pour lire la collection. */
export const COLLECTION_TABS: Record<Exclude<CollectionKey, 'immobilisations' | 'achats' | 'societe'>, string[]> = {
  devis: ['devis', 'devis_articles', 'commandes', 'facturation', 'mission'],
  clients: ['tiers_client', 'devis', 'commandes', 'facturation', 'mission'],
  fournisseurs: ['tiers_fournisseur', 'achat_consommable', 'achat_autre', 'immo_materiel', 'immo_transport'],
  impots: ['impots'],
  collaborateurs: ['collab_salaries', 'collab_pointage', 'collab_conges', 'collab_paie', 'collab_cnss', 'collab_cimr', 'mission'],
  pointages: ['collab_pointage', 'collab_paie', 'collab_cnss'],
  conges: ['collab_conges', 'collab_paie'],
  bulletins: ['collab_paie', 'collab_cnss', 'collab_cimr'],
  bordereauxCnss: ['collab_cnss'],
  bordereauxCimr: ['collab_cimr'],
  ordresMission: ['mission', 'devis'],
};
/** Immobilisations : lecture par catégorie. */
export const IMMO_TABS = { materiel: 'immo_materiel', transport: 'immo_transport' } as const;
/** Achats : lecture par type. */
export const ACHAT_TABS = { consommable: 'achat_consommable', autre: 'achat_autre' } as const;

export type ImmoCat = keyof typeof IMMO_TABS;
export type AchatType = keyof typeof ACHAT_TABS;

export interface Readable {
  devis: boolean; clients: boolean; fournisseurs: boolean; impots: boolean; collaborateurs: boolean;
  pointages: boolean; conges: boolean; bulletins: boolean; bordereauxCnss: boolean; bordereauxCimr: boolean; ordresMission: boolean;
  /** Lisible s'il l'est pour au moins une catégorie. */
  immobilisations: boolean; achats: boolean;
  immoCategories: ImmoCat[]; achatTypes: AchatType[];
  /** La société est lisible par tous. */
  societe: true;
}

/** Quelles collections sont lisibles, d'après la fonction de droits `can(clé d'onglet)` (droit « voir »). */
export function readableCollections(can: CanFn): Readable {
  const any = (keys: string[]) => keys.some(k => can(k));
  const immoCategories = (Object.keys(IMMO_TABS) as ImmoCat[]).filter(c => can(IMMO_TABS[c]));
  const achatTypes = (Object.keys(ACHAT_TABS) as AchatType[]).filter(t => can(ACHAT_TABS[t]));
  return {
    devis: any(COLLECTION_TABS.devis), clients: any(COLLECTION_TABS.clients), fournisseurs: any(COLLECTION_TABS.fournisseurs),
    impots: any(COLLECTION_TABS.impots), collaborateurs: any(COLLECTION_TABS.collaborateurs), pointages: any(COLLECTION_TABS.pointages),
    conges: any(COLLECTION_TABS.conges), bulletins: any(COLLECTION_TABS.bulletins), bordereauxCnss: any(COLLECTION_TABS.bordereauxCnss),
    bordereauxCimr: any(COLLECTION_TABS.bordereauxCimr), ordresMission: any(COLLECTION_TABS.ordresMission),
    immobilisations: immoCategories.length > 0, achats: achatTypes.length > 0, immoCategories, achatTypes,
    societe: true,
  };
}

/** Vide les collections illisibles et ne garde que les catégories / types lisibles (la base le fait déjà ; défense en profondeur
    pour un backend qui ne filtrerait pas). N'altère pas l'état d'origine. */
export function restrictState<S extends Pick<State, 'devis' | 'clients' | 'immobilisations' | 'achats' | 'impots' | 'collaborateurs' | 'pointages' | 'bulletins' | 'bordereauxCnss' | 'bordereauxCimr' | 'ordresMission'>>(state: S, r: Readable): S {
  const keep = <T,>(ok: boolean, rows: T[]): T[] => (ok ? rows : []);
  return {
    ...state,
    devis: keep(r.devis, state.devis),
    clients: keep(r.clients, state.clients),
    immobilisations: state.immobilisations.filter(a => (r.immoCategories as string[]).includes(a.categorie)),
    achats: state.achats.filter(a => (r.achatTypes as string[]).includes(a.type)),
    impots: keep(r.impots, state.impots),
    collaborateurs: keep(r.collaborateurs, state.collaborateurs),
    pointages: keep(r.pointages, state.pointages),
    bulletins: keep(r.bulletins, state.bulletins),
    bordereauxCnss: keep(r.bordereauxCnss, state.bordereauxCnss),
    bordereauxCimr: keep(r.bordereauxCimr, state.bordereauxCimr),
    ordresMission: keep(r.ordresMission, state.ordresMission),
  };
}

export interface Visibility {
  /** Filtre « Client » (liste des clients + devis). */
  clientFilter: boolean;
  commercial: boolean;
  tresorerie: { show: boolean; encaissements: boolean; salaires: boolean; achats: boolean; impots: boolean };
  chantiers: { show: boolean; avancement: boolean };
  charges: { show: boolean; achats: boolean; marge: boolean; coutEmployeur: boolean };
  personnel: { show: boolean; masseSalariale: boolean; collaborateurs: boolean; cnss: boolean; cimr: boolean; pointage: boolean };
  impots: boolean;
  liberatoire: boolean;
  immo: { show: boolean; materiel: boolean; transport: boolean };
}

/** Ce qui peut être affiché : un élément qui s'appuie sur plusieurs collections exige qu'elles soient toutes lisibles. */
export function dashboardVisibility(r: Readable, libOn: boolean): Visibility {
  const salaires = r.bulletins && r.collaborateurs;
  const tresorerie = { encaissements: r.devis, salaires, achats: r.achats, impots: r.impots };
  // la marge sur achats directs compare le devis à TOUS ses achats : il faut lire les deux types
  const marge = r.devis && r.achatTypes.length === 2;
  const charges = { achats: r.achats, marge, coutEmployeur: salaires };
  const personnel = { masseSalariale: salaires, collaborateurs: r.collaborateurs, cnss: r.bordereauxCnss, cimr: r.bordereauxCimr, pointage: r.pointages };
  return {
    clientFilter: r.clients && r.devis,
    commercial: r.devis,
    tresorerie: { show: Object.values(tresorerie).some(Boolean), ...tresorerie },
    chantiers: { show: r.ordresMission, avancement: r.devis && r.ordresMission },
    charges: { show: Object.values(charges).some(Boolean), ...charges },
    personnel: { show: Object.values(personnel).some(Boolean), ...personnel },
    impots: r.impots,
    liberatoire: libOn && r.devis,
    immo: { show: r.immobilisations, materiel: r.immoCategories.includes('materiel'), transport: r.immoCategories.includes('transport') },
  };
}

/** Vrai si au moins une section du tableau de bord est affichable (sinon : message d'état vide). */
export function hasAnySection(v: Visibility): boolean {
  return v.commercial || v.tresorerie.show || v.chantiers.show || v.charges.show || v.personnel.show || v.impots || v.liberatoire || v.immo.show;
}
