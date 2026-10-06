/* Pages, onglets de droits et profils par défaut. Fonctions pures (pas d'état global). */
import type { Droit, DroitsMap, Profil } from './types';

export interface PageDef { id: string; group: string; label: string; sub: string }
export const PAGES: PageDef[] = [
  { id: 'dashboard', group: 'dashboard', label: 'Tableau de bord', sub: 'Analyses et indicateurs clés' },
  { id: 'devis', group: 'recettes', label: 'Devis', sub: 'Suivi des devis émis' },
  { id: 'commandes', group: 'recettes', label: 'Conversion en commande', sub: 'Devis soldés — bons de commande' },
  { id: 'facturation', group: 'recettes', label: 'Facturation', sub: 'Bons de commande facturés' },
  { id: 'tiers', group: 'tiers', label: 'Tiers', sub: 'Clients et fournisseurs' },
  { id: 'immo_materiel', group: 'immobilisation', label: 'Matériel et outillage', sub: "Registre du matériel et de l'outillage" },
  { id: 'immo_transport', group: 'immobilisation', label: 'Matériel de transport', sub: 'Registre des véhicules' },
  { id: 'achat_consommable', group: 'charges', label: 'Achats consommables', sub: 'Matières et fournitures consommables' },
  { id: 'achat_autre', group: 'charges', label: 'Autres achats consommables', sub: 'Carburant, EPI, fournitures et autres achats' },
  { id: 'collaborateur', group: 'collaborateur', label: 'Collaborateur', sub: 'Salariés, pointage, congés et paie' },
  { id: 'mission', group: 'mission', label: 'Ordre de mission', sub: 'Affectation des équipes sur les lignes de devis' },
  { id: 'impots', group: 'impots', label: 'Impôts et taxes', sub: 'Échéances, paiements et suivi fiscal' },
  { id: 'societe', group: 'base', label: 'Mon société', sub: 'Coordonnées et informations légales' },
  { id: 'securite', group: 'base', label: 'Sécurité', sub: 'Comptes, utilisateurs, droits par profil' },
];
export const NAV_GROUPS: { id: string; label: string }[] = [
  { id: 'dashboard', label: 'Tableau de bord' }, { id: 'recettes', label: 'Recettes' }, { id: 'tiers', label: 'Tiers' },
  { id: 'immobilisation', label: 'Immobilisation' }, { id: 'charges', label: "Charge d'exploitation" },
  { id: 'collaborateur', label: 'Collaborateur' }, { id: 'mission', label: 'Ordre de mission' },
  { id: 'impots', label: 'Impôts et taxes' }, { id: 'base', label: 'Base de données' },
];

export interface RightsTab { key: string; group: string; label: string }
export const RIGHTS_TABS: RightsTab[] = [
  { key: 'dashboard', group: 'Tableau de bord', label: 'Tableau de bord' },
  { key: 'devis', group: 'Recettes', label: 'Devis' },
  { key: 'devis_articles', group: 'Recettes', label: "Devis › Demande d'article" },
  { key: 'commandes', group: 'Recettes', label: 'Conversion en commande' },
  { key: 'facturation', group: 'Recettes', label: 'Facturation' },
  { key: 'tiers_client', group: 'Tiers', label: 'Client' },
  { key: 'tiers_fournisseur', group: 'Tiers', label: 'Fournisseur' },
  { key: 'immo_materiel', group: 'Immobilisation', label: 'Matériel et outillage' },
  { key: 'immo_transport', group: 'Immobilisation', label: 'Matériel de transport' },
  { key: 'achat_consommable', group: "Charge d'exploitation", label: 'Achats consommables' },
  { key: 'achat_autre', group: "Charge d'exploitation", label: 'Autres achats consommables' },
  { key: 'collab_salaries', group: 'Collaborateur', label: 'Collaborateurs' },
  { key: 'collab_pointage', group: 'Collaborateur', label: 'Pointage' },
  { key: 'collab_conges', group: 'Collaborateur', label: 'Congés & Absences' },
  { key: 'collab_paie', group: 'Collaborateur', label: 'Paie' },
  { key: 'collab_cnss', group: 'Collaborateur', label: 'Bordereaux de paiement CNSS' },
  { key: 'collab_cimr', group: 'Collaborateur', label: 'Bordereaux CIMR' },
  { key: 'mission', group: 'Ordre de mission', label: 'Ordre de mission' },
  { key: 'impots', group: 'Impôts et taxes', label: 'Impôts et taxes' },
  { key: 'societe', group: 'Base de données', label: 'Mon société' },
  { key: 'securite_compte', group: 'Sécurité', label: 'Mon compte' },
  { key: 'securite_utilisateurs', group: 'Sécurité', label: 'Utilisateurs' },
  { key: 'securite_profil', group: 'Sécurité', label: 'Profil' },
  { key: 'securite_droits', group: 'Sécurité', label: 'Droits' },
];
/** Page → onglets de droits qu'elle contient (une page est visible si au moins un onglet est visible). */
export const PAGE_TABS: Record<string, string[]> = {
  devis: ['devis', 'devis_articles'], tiers: ['tiers_client', 'tiers_fournisseur'],
  collaborateur: ['collab_salaries', 'collab_pointage', 'collab_conges', 'collab_paie', 'collab_cnss', 'collab_cimr'],
  securite: ['securite_compte', 'securite_utilisateurs', 'securite_profil', 'securite_droits'],
};

export const ADMIN_PROFIL_ID = 'prf-admin';
export function defaultProfils(): Profil[] {
  return [
    { id: 'prf-admin', nom: 'Administrateur', description: 'Accès complet à tous les onglets (profil système, non modifiable)', systeme: true },
    { id: 'prf-commercial', nom: 'Commercial', description: 'Devis, commandes, clients et ordres de mission' },
    { id: 'prf-comptable', nom: 'Comptable', description: 'Facturation, achats, immobilisations, paie et déclarations sociales' },
  ];
}
/** v = voir, m = modifier, s = supprimer */
function mkDroits(spec: Record<string, string>): Record<string, Droit> {
  const out: Record<string, Droit> = {};
  Object.entries(spec).forEach(([k, l]) => { out[k] = { voir: true, modifier: l.includes('m'), supprimer: l.includes('s') }; });
  return out;
}
export function defaultDroits(): DroitsMap {
  return {
    'prf-commercial': mkDroits({ dashboard: 'v', devis: 'vm', devis_articles: 'vm', commandes: 'vm', facturation: 'v', tiers_client: 'vm', tiers_fournisseur: 'v', mission: 'vm' }),
    'prf-comptable': mkDroits({
      dashboard: 'v', commandes: 'v', facturation: 'vms', tiers_client: 'v', tiers_fournisseur: 'vm',
      immo_materiel: 'vms', immo_transport: 'vms', achat_consommable: 'vms', achat_autre: 'vms',
      collab_salaries: 'v', collab_paie: 'vms', collab_cnss: 'vms', collab_cimr: 'vms', impots: 'vms', societe: 'v',
    }),
  };
}

/** Droits effectifs d'un profil sur un onglet. Le profil système a tous les droits. */
export function droitsDe(profils: Profil[], droits: DroitsMap, profilNom: string | null | undefined, key: string): Droit {
  const p = profils.find(x => x.nom === profilNom);
  if (!p) return { voir: false, modifier: false, supprimer: false };
  if (p.systeme) return { voir: true, modifier: true, supprimer: true };
  const d = (droits[p.id] || {})[key];
  const r: Droit = { voir: !!(d && d.voir), modifier: !!(d && d.voir && d.modifier), supprimer: !!(d && d.voir && d.supprimer) };
  if (key === 'securite_compte') r.voir = true;          // chacun gère son propre compte
  return r;
}
