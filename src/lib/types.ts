/* Modèle de données de GS-Travaux (repris du prototype HTML).
   Chaque entité est stockée en base dans la table `records` (collection + id + data jsonb). */

export type DevisStatut = 'Créé' | 'Soldée' | 'Facturé' | 'Annulé';

export interface DevisLigne {
  designation: string;
  qte: number;
  pu: number;
  matiere: 'avec' | 'sans';
  taches: string[];
}
export interface BonCommande { numero: string; date: string; fichier: string }
export interface FactureInfo { numero: string; date: string; modePaiement: string; delai: string }

export interface Devis {
  id: string;
  numero: string;
  client: string;                 // nom du client (texte libre, rattaché à un client par son nom)
  date: string;                   // AAAA-MM-JJ
  objet: string;
  emetteur: string;
  statut: DevisStatut;
  modePaiement: string;
  delaiPaiement: string;          // « 60 jours », « Comptant »…
  demandeAvance: number;
  lignes: DevisLigne[];
  dateSoldee: string;
  dateFacturee: string;
  bc: BonCommande | null;
  facture: FactureInfo | null;
  [extra: string]: any;
}

export interface Societe {
  nom: string; statutJuridique: string; activite: string; adresse: string; tel: string;
  cne: string; ice: string; if_: string; taxePro: string; email: string;
  rc: string; cnss: string; natureActivite: 'services' | 'commerce' | string;
  [extra: string]: any;
}

export interface Impot {
  id: string; type: string; periode: string; echeance: string; montant: number;
  paiement: null | { date: string; montant: number; mode: string; reference: string };
  [extra: string]: any;
}

export interface Achat {
  id: string; type: 'consommable' | 'autre'; date: string; fournisseurId: string; numFacture: string;
  designation: string; categorie: string; quantite: number; unite: string; prixUnitaire: number; tva: number;
  modePaiement: string; statut: 'Payé' | 'À payer' | string; affectation: string;
  [extra: string]: any;
}

export interface Immobilisation {
  id: string; categorie: 'materiel' | 'transport'; designation?: string; marque: string; numSerie?: string;
  typeVehicule?: string; immatriculation?: string; dateAcquisition: string; fournisseurId: string;
  valeur: number; dureeAmort: number; affectation: string; etat: string;
  echeanceAssurance?: string; echeanceVisite?: string;
  [extra: string]: any;
}

export interface OrdreMission {
  id: string; date: string; client: string; emetteur: string; devisId: string;
  lignes: string[]; collaborateurIds: string[]; statut: 'Planifié' | 'En cours' | 'Terminé' | 'Annulé' | string;
  [extra: string]: any;
}

export interface DemandeArticle {
  id: string; ligne: number; dateHeure: string; designation: string; quantite: number;
  situation: 'Demandé' | 'Pris' | 'Annulé' | string; datePris: string; devisId: string;
  [extra: string]: any;
}

export interface Collaborateur {
  id: string; nom: string; prenom: string; cin: string; dateNaissance: string; situationFamiliale: string;
  telephone: string; adresse: string; departement: string; service: string; poste: string; dateEmbauche: string;
  typeContrat: string; typePaie: 'Mensuel' | 'Journalier' | 'Horaire' | string; tauxHoraire: number; salaireJournalier?: number;
  salaireBase: number; personnesACharge: number; cnssNum: string; cotiseCimr: boolean; cimrNum: string; mutuelleNum: string;
  congesDroitAnnuel: number; pretCapital: number; pretMensualite: number; pretRembourse: number; pretSolde: number;
  statut: 'Actif' | 'Démissionné' | string; dateDemission?: string;
  [extra: string]: any;
}

export interface Pointage { id: string; collaborateurId: string; date: string; statut: 'Présent' | 'Absent' | 'Retard' | string; [extra: string]: any }
export interface Conge { id: string; collaborateurId: string; type: string; dateDebut: string; dateFin: string; jours: number; statut: string; [extra: string]: any }

export interface BulletinLigne { designation: string; montant: number }
export interface BulletinRetenue { label: string; montant: number }
export interface Bulletin {
  id: string; collaborateurId: string; mois: string;   // AAAA-MM
  lignes: BulletinLigne[]; retenues: BulletinRetenue[];
  statut: string; datePaiement: string; modePaiement: string;
  [extra: string]: any;
}

export interface BordereauCnssLigne {
  collaborateurId: string; nom: string; cnssNum: string; jours: number; brut: number; brutPlafonne: number;
  psSal: number; psPat: number; af: number; tfp: number; amoSal: number; amoPat: number;
}
export interface BordereauCnss { id: string; mois: string; statut: string; datePaiement: string; modePaiement: string; lignes: BordereauCnssLigne[]; [extra: string]: any }
export interface BordereauCimrLigne { collaborateurId: string; nom: string; cimrNum: string; brut: number; sal: number; pat: number }
export interface BordereauCimr { id: string; mois: string; statut: string; datePaiement: string; modePaiement: string; lignes: BordereauCimrLigne[]; [extra: string]: any }

export interface Tiers { id: string; nom: string; ice: string; adresse: string; [extra: string]: any }

/* ───── Droits ───── */
export interface Droit { voir: boolean; modifier: boolean; supprimer: boolean }
export type DroitsParOnglet = Record<string, Droit>;
export interface Profil { id: string; nom: string; description: string; systeme?: boolean }
/** droits[profilId][ongletKey] */
export type DroitsMap = Record<string, DroitsParOnglet>;

export interface Utilisateur {
  id: string;                 // = id Supabase Auth
  nom: string;
  email: string;
  profilId: string;           // id du profil (table roles)
  profil: string;             // nom du profil
  actif: boolean;
  derniereConnexion?: string;
}

/* ───── Entreprise / licence (registre du propriétaire) ───── */
export type TypeLicence = 'Mensuelle' | 'Annuelle';
export interface PaiementLicence {
  id: string; date: string; montant: number; periodes: number; mode: string;
  du: string; au: string;                 // période couverte
}
export interface Entreprise {
  id: string; code: string; nom: string; contact: string; email: string; telephone: string;
  licence: TypeLicence; prix: number;      // tarif figé pour cette entreprise
  debut: string;                           // début de la licence / de l'essai
  essaiFin: string;                        // fin d'essai (vide si pas d'essai)
  echeance: string;                        // fin de licence payée (vide tant qu'aucun paiement)
  suspendu: boolean; motifSuspension: string;
  interne: boolean;                        // entreprise de l'éditeur : jamais bloquée
  notes: string;
  paiements: PaiementLicence[];
}
export interface TarifsPlateforme { tarifs: { Mensuelle: number; Annuelle: number }; essaiJours: number }

/* ───── État de l'application (une entreprise) ───── */
export interface State {
  societe: Societe;
  devis: Devis[];
  demandesArticles: DemandeArticle[];
  clients: Tiers[];
  fournisseurs: Tiers[];
  immobilisations: Immobilisation[];
  achats: Achat[];
  impots: Impot[];
  collaborateurs: Collaborateur[];
  pointages: Pointage[];
  conges: Conge[];
  bulletins: Bulletin[];
  bordereauxCnss: BordereauCnss[];
  bordereauxCimr: BordereauCimr[];
  ordresMission: OrdreMission[];
  /* gérés par le module Sécurité (tables dédiées, pas `records`) */
  profils: Profil[];
  droits: DroitsMap;
  utilisateurs: Utilisateur[];
}

/** Collections stockées dans la table `records` (tableaux d'objets avec `id`). */
export const RECORD_COLLECTIONS = [
  'devis', 'demandesArticles', 'clients', 'fournisseurs', 'immobilisations', 'achats', 'impots',
  'collaborateurs', 'pointages', 'conges', 'bulletins', 'bordereauxCnss', 'bordereauxCimr', 'ordresMission',
] as const;
export type RecordCollection = typeof RECORD_COLLECTIONS[number];
/** Identifiant fixe de l'unique enregistrement `societe`. */
export const SOCIETE_ID = 'main';

/* Les droits par collection sont appliqués dans la base (voir supabase/migrations : table collection_tabs
   et fonction can_access). Écriture : droit « modifier » / « supprimer » de l'onglet propriétaire de la donnée.
   Lecture : droit « voir » de l'onglet propriétaire ou d'un onglet qui s'appuie sur la même donnée
   (ex. la Facturation lit les devis, l'Ordre de mission lit les collaborateurs). */
