// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderApp } from '../../test/harness';
import CollaborateurPage from './CollaborateurPage';

const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const click = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));

describe('CollaborateurPage', () => {
  afterEach(() => { cleanup(); document.body.innerHTML = ''; });
  it('affiche les six onglets et la liste des salariés (administrateur)', async () => {
    await renderApp(<CollaborateurPage />);
    for (const n of ['Collaborateurs', 'Pointage', 'Congés & Absences', 'Paie', 'Bordereaux de paiement CNSS', 'Bordereaux CIMR'])
      expect(screen.getByRole('button', { name: n })).toBeTruthy();
    expect(screen.getByText('Youssef El Amrani')).toBeTruthy();
    expect(screen.getByText(/180,00 DH\/jour/)).toBeTruthy();
    expect(screen.getByText(/4\s?500,00 DH\/mois/)).toBeTruthy();
  });

  it('profil Comptable : onglets Pointage et Congés masqués, lecture seule', async () => {
    await renderApp(<CollaborateurPage />, { profil: 'Comptable' });
    expect(screen.queryByRole('button', { name: 'Pointage' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Congés & Absences' })).toBeNull();
    for (const n of ['Collaborateurs', 'Paie', 'Bordereaux de paiement CNSS', 'Bordereaux CIMR'])
      expect(screen.getByRole('button', { name: n })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Ajouter un collaborateur/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Démissionner' })).toBeNull();
    // ouverture en lecture seule au double-clic
    fireEvent.doubleClick(screen.getByText('Youssef El Amrani'));
    expect(screen.queryByRole('button', { name: 'Enregistrer' })).toBeNull();
    expect(screen.getByLabelText('Nom').matches(':disabled')).toBe(true);
  });

  it('profil sans aucun droit Collaborateur : aucun onglet', async () => {
    await renderApp(<CollaborateurPage />, { profil: 'Commercial' });
    expect(screen.queryByRole('button', { name: 'Collaborateurs' })).toBeNull();
    expect(screen.getByText(/Aucun onglet accessible/)).toBeTruthy();
  });

  it('crée un salarié (mensuel puis journalier) avec contrôle des champs obligatoires', async () => {
    const { saved } = await renderApp(<CollaborateurPage />);
    click(/Ajouter un collaborateur/);
    click('Enregistrer');                                   // champs vides -> refus
    expect(screen.getByText('Veuillez remplir tous les champs obligatoires.')).toBeTruthy();
    expect((await saved()).collaborateurs).toHaveLength(3);
    type('Nom', 'Alaoui'); type('Prénom', 'Karim'); type('CIN', 'AB12345'); type('Date de naissance', '1992-02-02');
    type('Téléphone', '0600000000'); type('Adresse', 'Casablanca'); type('Département', 'Atelier'); type('Service', 'Production');
    type('Fonction', 'Soudeur'); type('N° CNSS', '123456'); type('N° Mutuelle', '99/01');
    type('Type de contrat', 'Journalier');                  // bascule le type de paie
    expect((screen.getByLabelText('Type de paie') as HTMLSelectElement).value).toBe('Journalier');
    type('Salaire journalier (DH/jour)', '200');
    type('Capital (DH)', '1000'); type('Déjà remboursé (DH)', '400');
    expect((screen.getByLabelText(/Solde restant/) as HTMLInputElement).value).toBe('600');
    click('Enregistrer');
    await waitFor(async () => expect((await saved()).collaborateurs).toHaveLength(4));
    const c = (await saved()).collaborateurs[0];
    expect(c).toMatchObject({ id: 'SAL-0004', nom: 'Alaoui', prenom: 'Karim', typePaie: 'Journalier', salaireJournalier: 200, pretCapital: 1000, pretRembourse: 400, pretSolde: 600, statut: 'Actif' });
    expect(screen.getByText('Karim Alaoui')).toBeTruthy();
  });

  it('refuse un remboursement supérieur au capital', async () => {
    const { saved } = await renderApp(<CollaborateurPage />);
    fireEvent.doubleClick(screen.getByText('Youssef El Amrani'));
    type('Déjà remboursé (DH)', '9000');
    click('Enregistrer');
    expect(screen.getByText('Le montant remboursé ne peut pas dépasser le capital du prêt.')).toBeTruthy();
    expect((await saved()).collaborateurs.find(c => c.id === 'SAL-0001')!.pretRembourse).toBe(3125);
  });

  it('démission : statut Démissionné, date enregistrée, plus de bouton', async () => {
    const { saved } = await renderApp(<CollaborateurPage />);
    const row = screen.getByText('Youssef El Amrani').closest('tr')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Démissionner' }));
    type('Date de démission', '2020-01-01');                // antérieure à l'embauche
    click('Confirmer la démission');
    expect(screen.getByText(/ne peut pas être antérieure/)).toBeTruthy();
    type('Date de démission', '2026-09-30');
    click('Confirmer la démission');
    await waitFor(async () => expect((await saved()).collaborateurs.find(c => c.id === 'SAL-0001')!.statut).toBe('Démissionné'));
    expect((await saved()).collaborateurs.find(c => c.id === 'SAL-0001')!.dateDemission).toBe('2026-09-30');
    expect(within(screen.getByText('Youssef El Amrani').closest('tr')!).queryByRole('button', { name: 'Démissionner' })).toBeNull();
    expect(screen.getByText('30/09/2026')).toBeTruthy();
  });

  it('pointage : ajout d’un pointage', async () => {
    const { saved } = await renderApp(<CollaborateurPage />);
    click('Pointage');
    expect(screen.getAllByText('Présent').length).toBeGreaterThan(0);
    click(/Ajouter un pointage/);
    type('Collaborateur', 'SAL-0002'); type('Date', '2026-10-01'); type('Situation', 'Retard');
    click('Enregistrer');
    await waitFor(async () => expect((await saved()).pointages).toHaveLength(6));
    expect((await saved()).pointages[0]).toMatchObject({ collaborateurId: 'SAL-0002', date: '2026-10-01', statut: 'Retard' });
    expect(screen.getByText('01/10/2026')).toBeTruthy();
  });

  it('congés : demande puis validation, refus', async () => {
    const { saved } = await renderApp(<CollaborateurPage />);
    click('Congés & Absences');
    click(/Ajouter une demande/);
    type('Collaborateur', 'SAL-0003'); type('Date début', '2026-10-05'); type('Date fin', '2026-10-01');
    click('Enregistrer');
    expect(screen.getByText('Vérifiez les dates de début et de fin.')).toBeTruthy();
    type('Date fin', '2026-10-09');
    click('Enregistrer');
    await waitFor(async () => expect((await saved()).conges).toHaveLength(3));
    expect((await saved()).conges[0]).toMatchObject({ collaborateurId: 'SAL-0003', type: 'Congé payé', jours: 5, statut: 'Demandé' });
    const newId = (await saved()).conges[0].id;
    const row = screen.getByRole('cell', { name: 'Hamid Bouziane' }).closest('tr')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Valider' }));
    await waitFor(async () => expect((await saved()).conges.find(c => c.id === newId)!.statut).toBe('Validé'));
    expect(within(screen.getByRole('cell', { name: 'Hamid Bouziane' }).closest('tr')!).queryByRole('button', { name: 'Valider' })).toBeNull();
    // refus de la demande de maladie de SAL-0001
    const row2 = screen.getByRole('cell', { name: 'Youssef El Amrani' }).closest('tr')!;
    fireEvent.click(within(row2).getByRole('button', { name: 'Refuser' }));
    await waitFor(async () => expect((await saved()).conges.find(c => c.id === 'cg2')!.statut).toBe('Refusé'));
  });
});
