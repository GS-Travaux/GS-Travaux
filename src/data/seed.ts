/* Données de démonstration (mode local sans Supabase uniquement). */
import type { State } from '../lib/types';
import { defaultDroits, defaultProfils } from '../lib/rights';

export function seedState(): State {
  return {
    devis: [
      { id:'d1', numero:'02.190926', client:'VMM', date:'2026-09-19', objet:'Divers travaux au niveau de végétale', emetteur:'Brahim Elbouanani', statut:'Créé',
        modePaiement:'Chèque', delaiPaiement:'60 jours', demandeAvance:0,
        lignes:[
          {designation:'Confection les cadres fixés sur sol', qte:4, pu:600, matiere:'avec', taches:['Découpe des profilés métalliques','Soudure des cadres','Fixation au sol']},
          {designation:'Confection des caniveaux à siphon', qte:4, pu:600, matiere:'avec', taches:['Traçage et découpe','Assemblage du siphon']}
        ], dateSoldee:'', dateFacturee:'', bc:null, facture:null },
      { id:'d2', numero:'01.230626', client:'VMM', date:'2026-06-23', objet:'Installation grillage rigide pour citernes', emetteur:'Brahim Elbouanani', statut:'Facturé',
        modePaiement:'Chèque', delaiPaiement:'90 jours', demandeAvance:1000,
        lignes:[
          {designation:"Installation grillage rigide pour des 3 citernes d'huiles à côté du bureau open space technique", qte:1, pu:3200, matiere:'avec', taches:['Prise de mesures sur site','Fabrication du grillage','Pose et fixation']}
        ], dateSoldee:'2026-06-24', dateFacturee:'2026-06-23',
        bc:{numero:'BC-2026-014', date:'2026-06-24', fichier:'bc_vmm_014.pdf'},
        facture:{numero:'000000009', date:'2026-06-23', modePaiement:'Chèque', delai:'90 jours'} },
      { id:'d3', numero:'03.150726', client:'Chantier Anfa', date:'2026-07-15', objet:'Fourniture garde-corps métallique', emetteur:'Brahim Elbouanani', statut:'Soldée',
        modePaiement:'Virement', delaiPaiement:'30 jours', demandeAvance:0,
        lignes:[ {designation:'Fabrication garde-corps métallique', qte:10, pu:450, matiere:'avec', taches:['Fabrication en atelier','Pose sur site']} ],
        dateSoldee:'2026-07-20', dateFacturee:'', bc:{numero:'BC-2026-015', date:'2026-07-20', fichier:'bc_anfa_015.pdf'}, facture:null },
      { id:'d4', numero:'04.010826', client:'SOMAPRO', date:'2026-08-01', objet:'Réparation clôture métallique', emetteur:'Brahim Elbouanani', statut:'Annulé',
        modePaiement:'Espèces', delaiPaiement:'Comptant', demandeAvance:0,
        lignes:[ {designation:'Réparation clôture métallique', qte:1, pu:1200, matiere:'sans', taches:[]} ],
        dateSoldee:'', dateFacturee:'', bc:null, facture:null }
    ],
    societe: {
      nom:'EL BOUANANI BRAHIM', statutJuridique:'Auto-entrepreneur', activite:"Travaux de chaudronnerie et construction métallique",
      adresse:'Lot Essalam 02 GH 04 Imm 03 Appt 633 Oulfa, Casablanca', tel:'06.13.15.01.79',
      cne:'BH203148', ice:'003801478000062', if_:'68601506', taxePro:'36208701', email:'ibrahimelbouanani6@gmail.com',
      rc:'', cnss:'', natureActivite:'services'
    },
    impots: [
      { id:'IT-0001', type:'Impôt sur le revenu (IR)', periode:'T2 2026', echeance:'2026-07-31', montant:3200, paiement:{ date:'2026-07-20', montant:3200, mode:'Virement', reference:'QT-26-07-0412' } },
      { id:'IT-0002', type:'Taxe de services communaux', periode:'Année 2026', echeance:'2026-09-30', montant:900, paiement:null },
      { id:'IT-0003', type:'Impôt sur le revenu (IR)', periode:'T3 2026', echeance:'2026-10-31', montant:2400, paiement:null },
      { id:'IT-0004', type:'Taxe professionnelle', periode:'Année 2026', echeance:'2026-12-31', montant:1500, paiement:null }
    ],
    achats: [
      { id:'AC-0001', type:'consommable', date:'2026-09-02', fournisseurId:'FL-0001', numFacture:'F-2026-0412', designation:'Tôle acier 3 mm 1500×3000', categorie:'Tôles et profilés', quantite:12, unite:'Unité', prixUnitaire:1450, tva:20, modePaiement:'Virement', statut:'Payé', affectation:'FG' },
      { id:'AC-0002', type:'consommable', date:'2026-09-15', fournisseurId:'FL-0002', numFacture:'QA-8841', designation:'Électrodes rutiles Ø 3,2 mm', categorie:'Électrodes et fil de soudure', quantite:5, unite:'Boîte', prixUnitaire:185, tva:20, modePaiement:'Chèque', statut:'À payer', affectation:'FG' },
      { id:'AC-0003', type:'consommable', date:'2026-09-20', fournisseurId:'FL-0001', numFacture:'F-2026-0455', designation:'Profilé tube carré 40×40', categorie:'Tôles et profilés', quantite:20, unite:'m', prixUnitaire:38, tva:20, modePaiement:'Virement', statut:'Payé', affectation:'d2' },
      { id:'AA-0001', type:'autre', date:'2026-09-05', fournisseurId:'FL-0002', numFacture:'QA-8790', designation:'Gasoil véhicules atelier', categorie:'Carburant', quantite:300, unite:'L', prixUnitaire:11.5, tva:10, modePaiement:'Espèces', statut:'Payé', affectation:'FG' },
      { id:'AA-0002', type:'autre', date:'2026-09-18', fournisseurId:'FL-0002', numFacture:'QA-8860', designation:'Gants et lunettes de protection', categorie:'Équipements de protection (EPI)', quantite:1, unite:'Lot', prixUnitaire:1250, tva:20, modePaiement:'Espèces', statut:'Payé', affectation:'FG' },
      { id:'AA-0003', type:'autre', date:'2026-09-25', fournisseurId:'FL-0002', numFacture:'QA-8902', designation:'Papeterie et fournitures de bureau', categorie:'Fournitures de bureau', quantite:1, unite:'Lot', prixUnitaire:420, tva:20, modePaiement:'Chèque', statut:'À payer', affectation:'FG' }
    ],
    immobilisations: [
      { id:'MO-0001', categorie:'materiel', designation:'Poste à souder MIG/MAG 350 A', marque:'Lincoln Electric Powertec 350', numSerie:'LE-350-2210', dateAcquisition:'2024-03-15', fournisseurId:'FL-0002', valeur:18500, dureeAmort:5, affectation:'Atelier', etat:'En service' },
      { id:'MO-0002', categorie:'materiel', designation:'Cintreuse à rouleaux 3 m', marque:'Durma AS 3010', numSerie:'DU-3010-0457', dateAcquisition:'2023-09-01', fournisseurId:'FL-0001', valeur:62000, dureeAmort:10, affectation:'Atelier', etat:'En service' },
      { id:'MO-0003', categorie:'materiel', designation:'Meuleuse d\'angle 230 mm', marque:'Bosch GWS 22-230', numSerie:'BO-22230-8812', dateAcquisition:'2025-06-10', fournisseurId:'FL-0002', valeur:2400, dureeAmort:3, affectation:'Chantiers', etat:'En réparation' },
      { id:'MT-0001', categorie:'transport', typeVehicule:'Camionnette', marque:'Renault Master plateau', immatriculation:'48215-B-6', dateAcquisition:'2024-01-20', fournisseurId:'FL-0001', valeur:245000, dureeAmort:5, affectation:'Chantiers', etat:'En service', echeanceAssurance:'2026-12-31', echeanceVisite:'2026-11-15' },
      { id:'MT-0002', categorie:'transport', typeVehicule:'Voiture', marque:'Dacia Dokker fourgon', immatriculation:'61937-A-6', dateAcquisition:'2025-02-10', fournisseurId:'FL-0001', valeur:118000, dureeAmort:5, affectation:'Livraisons', etat:'En service', echeanceAssurance:'2026-10-20', echeanceVisite:'2026-09-30' }
    ],
    ordresMission: [
      { id:'OM-0001', date:'2026-06-26', client:'VMM', emetteur:'Brahim Elbouanani', devisId:'d2',
        lignes:["Installation grillage rigide pour des 3 citernes d'huiles à côté du bureau open space technique"],
        collaborateurIds:['SAL-0001','SAL-0003'], statut:'Terminé' },
      { id:'OM-0002', date:'2026-07-22', client:'Chantier Anfa', emetteur:'Brahim Elbouanani', devisId:'d3',
        lignes:['Fabrication garde-corps métallique'], collaborateurIds:['SAL-0001'], statut:'Planifié' }
    ],
    demandesArticles: [
      { id:'art1', ligne:1, dateHeure:'2026-06-25T09:15', designation:'Grillage rigide galvanisé 2m', quantite:3, situation:'Pris', datePris:'2026-06-25', devisId:'d2' },
      { id:'art2', ligne:2, dateHeure:'2026-07-21T14:30', designation:'Tube carré 40x40', quantite:20, situation:'Demandé', datePris:'', devisId:'d3' },
      { id:'art3', ligne:3, dateHeure:'2026-06-26T11:00', designation:'Visserie inox', quantite:50, situation:'Annulé', datePris:'', devisId:'d2' }
    ],
    collaborateurs: [
      { id:'SAL-0001', nom:'El Amrani', prenom:'Youssef', cin:'BE482910', dateNaissance:'1990-04-12', situationFamiliale:'Marié(e)', telephone:'06.45.12.33.90', adresse:'Hay Mohammadi, Casablanca',
        departement:'Atelier', service:'Production', poste:'Soudeur', dateEmbauche:'2024-03-01', typeContrat:'CDI', typePaie:'Mensuel', tauxHoraire:0,
        salaireBase:4500, personnesACharge:2, cnssNum:'124927013', cotiseCimr:true, cimrNum:'012449601', mutuelleNum:'129/03',
        congesDroitAnnuel:21, pretCapital:5000, pretMensualite:625, pretRembourse:3125, pretSolde:1875, statut:'Actif' },
      { id:'SAL-0002', nom:'Idrissi', prenom:'Fatima Zahra', cin:'BK317654', dateNaissance:'1996-11-03', situationFamiliale:'Célibataire', telephone:'06.61.98.45.20', adresse:'Sidi Bernoussi, Casablanca',
        departement:'Administration', service:'Secrétariat', poste:'Assistante administrative', dateEmbauche:'2025-01-15', typeContrat:'CDI', typePaie:'Mensuel', tauxHoraire:0,
        salaireBase:4000, personnesACharge:0, cnssNum:'118203456', cotiseCimr:false, cimrNum:'', mutuelleNum:'',
        congesDroitAnnuel:21, pretCapital:0, pretMensualite:0, pretRembourse:0, pretSolde:0, statut:'Actif' },
      { id:'SAL-0003', nom:'Bouziane', prenom:'Hamid', cin:'BJ209871', dateNaissance:'1985-07-22', situationFamiliale:'Marié(e)', telephone:'06.72.30.55.11', adresse:'Ain Sebaâ, Casablanca',
        departement:'Atelier', service:'Production', poste:'Manœuvre', dateEmbauche:'2025-09-01', typeContrat:'Journalier', typePaie:'Journalier', tauxHoraire:0, salaireJournalier:180,
        salaireBase:3200, personnesACharge:1, cnssNum:'109887321', cotiseCimr:false, cimrNum:'', mutuelleNum:'',
        congesDroitAnnuel:18, pretCapital:0, pretMensualite:0, pretRembourse:0, pretSolde:0, statut:'Actif' }
    ],
    pointages: [
      { id:'pt1', collaborateurId:'SAL-0001', date:'2026-09-21', statut:'Présent' },
      { id:'pt2', collaborateurId:'SAL-0002', date:'2026-09-21', statut:'Présent' },
      { id:'pt3', collaborateurId:'SAL-0003', date:'2026-09-21', statut:'Retard' },
      { id:'pt4', collaborateurId:'SAL-0001', date:'2026-09-20', statut:'Présent' },
      { id:'pt5', collaborateurId:'SAL-0003', date:'2026-09-20', statut:'Absent' }
    ],
    conges: [
      { id:'cg1', collaborateurId:'SAL-0002', type:'Congé payé', dateDebut:'2026-08-10', dateFin:'2026-08-16', jours:7, statut:'Validé' },
      { id:'cg2', collaborateurId:'SAL-0001', type:'Maladie', dateDebut:'2026-09-05', dateFin:'2026-09-06', jours:2, statut:'Demandé' }
    ],
    bulletins: [
      { id:'blt1', collaborateurId:'SAL-0001', mois:'2026-08',
        lignes:[{designation:'Salaire de base', montant:4500},{designation:"Prime d'ancienneté", montant:225},{designation:'Indemnité de transport', montant:500}],
        retenues:[{label:'Prêt social', montant:625}],
        statut:'Payé', datePaiement:'2026-09-01', modePaiement:'Virement' },
      { id:'blt2', collaborateurId:'SAL-0002', mois:'2026-08',
        lignes:[{designation:'Salaire de base', montant:4000}], retenues:[],
        statut:'Payé', datePaiement:'2026-09-01', modePaiement:'Virement' }
    ],
    clients: [
      { id:'CL-0001', nom:'VMM', ice:'001527230000072', adresse:"Z.I LISSASSFA KM 9 ROUTE D'EL JADIDA CASABLANCA" },
      { id:'CL-0002', nom:'Chantier Anfa', ice:'001789450000038', adresse:'Bd Anfa, Casablanca' },
      { id:'CL-0003', nom:'SOMAPRO', ice:'001334210000091', adresse:'Zone Industrielle Ain Sebaâ, Casablanca' }
    ],
    fournisseurs: [
      { id:'FL-0001', nom:'Steel Maroc SARL', ice:'002145780000056', adresse:'Zone Industrielle Sidi Bernoussi, Casablanca' },
      { id:'FL-0002', nom:'Quincaillerie Al Amal', ice:'001987650000023', adresse:'Rue 12, Derb Omar, Casablanca' }
    ],
    bordereauxCnss: [],
    bordereauxCimr: [],
    profils: defaultProfils(),
    droits: defaultDroits(),
    utilisateurs: [
      { id: 'u1', nom: 'Brahim Elbouanani', email: 'demo@gs-travaux.local', profilId: 'prf-admin', profil: 'Administrateur', actif: true },
      { id: 'u2', nom: 'Yasmine Regraga', email: 'y.regraga@gs-travaux.local', profilId: 'prf-commercial', profil: 'Commercial', actif: true },
    ],
  } as State;
}

/** État vide d'une nouvelle entreprise. */
export function emptyState(societeNom = ''): State {
  return {
    societe: { nom: societeNom, statutJuridique: 'Auto-entrepreneur', activite: '', adresse: '', tel: '', cne: '', ice: '', if_: '', taxePro: '', email: '', rc: '', cnss: '', natureActivite: 'services' },
    devis: [], demandesArticles: [], clients: [], fournisseurs: [], immobilisations: [], achats: [], impots: [],
    collaborateurs: [], pointages: [], conges: [], bulletins: [], bordereauxCnss: [], bordereauxCimr: [], ordresMission: [],
    profils: defaultProfils(), droits: defaultDroits(), utilisateurs: [],
  };
}
