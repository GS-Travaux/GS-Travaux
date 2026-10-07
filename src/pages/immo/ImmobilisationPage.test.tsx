// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderApp } from '../../test/harness';
import ImmobilisationPage from './ImmobilisationPage';
import { dialog, flat, lectureSeule, setField } from '../partB.testHelpers';
import { immoAmort } from '../../lib/immo';

afterEach(cleanup);

describe('ImmobilisationPage — matériel et outillage', () => {
  it('affiche la liste, le compteur et les totaux', async () => {
    await renderApp(<ImmobilisationPage cat="materiel" />);
    expect(screen.getByText('Matériel et outillage')).toBeTruthy();
    expect(screen.getByText('MO-0001')).toBeTruthy();
    expect(screen.getByText('Poste à souder MIG/MAG 350 A')).toBeTruthy();
    expect(screen.queryByText('MT-0001')).toBeNull();
    expect(flat(document.querySelector('.panel-head')!.textContent)).toContain("Valeur d'acquisition 82 900,00 DH");
    expect(document.querySelector('.count-pill')!.textContent).toBe('3');
  });

  it('filtre par état', async () => {
    await renderApp(<ImmobilisationPage cat="materiel" />);
    const sel = document.querySelector('.filter-row select[value=""], .filter-row select') as HTMLSelectElement;
    const etat = Array.from(document.querySelectorAll('.filter-row select')).find(s => Array.from((s as HTMLSelectElement).options).some(o => o.value === 'Réformé')) as HTMLSelectElement;
    expect(sel).toBeTruthy();
    fireEvent.change(etat, { target: { value: 'En réparation' } });
    expect(screen.getByText('MO-0003')).toBeTruthy();
    expect(screen.queryByText('MO-0001')).toBeNull();
  });

  it('crée un matériel : validations, aperçu d’amortissement, enregistrement', async () => {
    const { saved } = await renderApp(<ImmobilisationPage cat="materiel" />);
    fireEvent.click(screen.getByRole('button', { name: /Ajouter un matériel/ }));
    const d = dialog();
    expect(within(d).getByText('Nouveau matériel')).toBeTruthy();
    fireEvent.click(within(d).getByRole('button', { name: 'Enregistrer' }));
    expect(screen.getByText('Veuillez remplir tous les champs obligatoires.')).toBeTruthy();
    setField('Désignation', 'Plieuse');
    setField('Marque / Modèle', 'Durma');
    setField('N° de série', 'SN-1');
    setField('Affectation / localisation', 'Atelier');
    setField('Fournisseur', 'FL-0001');
    setField("Date d'acquisition", '2026-01-01');
    setField("Valeur d'acquisition (DH)", '0');
    fireEvent.click(within(d).getByRole('button', { name: 'Enregistrer' }));
    expect(screen.getByText('La valeur d’acquisition doit être supérieure à 0.')).toBeTruthy();
    setField("Valeur d'acquisition (DH)", '10000');
    setField("Durée d'amortissement (ans)", '5');
    expect(flat(screen.getByTestId('immo-hint').textContent)).toContain('dotation annuelle 2 000,00 DH');
    fireEvent.click(within(d).getByRole('button', { name: 'Enregistrer' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    const st = await saved();
    expect(st.immobilisations).toHaveLength(6);
    expect(st.immobilisations[0]).toMatchObject({ id: 'MO-0004', categorie: 'materiel', designation: 'Plieuse', valeur: 10000, dureeAmort: 5, fournisseurId: 'FL-0001', etat: 'En service' });
  });

  it('refuse l’ajout sans fournisseur', async () => {
    const { actions } = await renderApp(<ImmobilisationPage cat="materiel" />, { state: { fournisseurs: [] } });
    fireEvent.click(within(actions).getByRole('button', { name: /Ajouter un matériel/ }));
    expect(screen.getByText('Ajoutez d’abord un fournisseur dans Tiers > Fournisseur.')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('modifie un matériel puis le supprime (confirmation)', async () => {
    const { saved } = await renderApp(<ImmobilisationPage cat="materiel" />);
    fireEvent.doubleClick(screen.getByText('MO-0003'));
    setField('État', 'Réformé');
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Enregistrer' }));
    expect((await saved()).immobilisations.find(a => a.id === 'MO-0003')!.etat).toBe('Réformé');

    const ligne = screen.getByText('MO-0003').closest('tr')!;
    fireEvent.click(within(ligne).getByRole('button', { name: 'Supprimer' }));
    expect(within(dialog()).getByText(/Cette suppression est définitive/)).toBeTruthy();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Annuler' }));
    expect((await saved()).immobilisations).toHaveLength(5);
    fireEvent.click(within(screen.getByText('MO-0003').closest('tr')!).getByRole('button', { name: 'Supprimer' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Supprimer' }));
    await waitFor(() => expect(screen.queryByText('MO-0003')).toBeNull());
    expect((await saved()).immobilisations.map(a => a.id)).not.toContain('MO-0003');
  });

  it('profil en lecture seule : ni ajout, ni modification, ni suppression', async () => {
    const { actions } = await renderApp(<ImmobilisationPage cat="materiel" />, { profil: 'Comptable', state: { droits: lectureSeule('immo_materiel') } });
    expect(screen.getByText('MO-0001')).toBeTruthy();
    expect(actions.textContent).not.toContain('Ajouter');
    expect(screen.queryByRole('button', { name: 'Modifier' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Supprimer' })).toBeNull();
    fireEvent.doubleClick(screen.getByText('MO-0001'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('droit de modifier sans supprimer : pas de bouton Supprimer', async () => {
    await renderApp(<ImmobilisationPage cat="materiel" />, { profil: 'Comptable', state: { droits: { 'prf-comptable': { immo_materiel: { voir: true, modifier: true, supprimer: false } } } } });
    expect(screen.getAllByRole('button', { name: 'Modifier' }).length).toBe(3);
    expect(screen.queryByRole('button', { name: 'Supprimer' })).toBeNull();
  });
});

describe('ImmobilisationPage — matériel de transport', () => {
  it('affiche les véhicules et les échéances', async () => {
    await renderApp(<ImmobilisationPage cat="transport" />);
    expect(screen.getByText('Matériel de transport')).toBeTruthy();
    expect(screen.getByText('48215-B-6')).toBeTruthy();
    expect(screen.queryByText('MO-0001')).toBeNull();
    // échéance d'assurance de MT-0002 (20/10/2026) et visite de MT-0001 : affichées au format français
    expect(screen.getByText('20/10/2026')).toBeTruthy();
    expect(screen.getByText('15/11/2026')).toBeTruthy();
  });

  it('colore les échéances dépassées', async () => {
    await renderApp(<ImmobilisationPage cat="transport" />, { state: { immobilisations: [
      { id: 'MT-0001', categorie: 'transport', typeVehicule: 'Camion', marque: 'X', immatriculation: '1-A-1', dateAcquisition: '2020-01-01', fournisseurId: 'FL-0001', valeur: 1000, dureeAmort: 5, affectation: 'a', etat: 'En service', echeanceAssurance: '2020-06-01', echeanceVisite: '2099-01-01' },
    ] } });
    expect((screen.getByText('01/06/2020') as HTMLElement).style.color).toBe('var(--danger)');
    expect((screen.getByText('01/01/2099') as HTMLElement).style.color).toBe('');
  });

  it('crée un véhicule : immatriculation unique et échéances postérieures à l’acquisition', async () => {
    const { saved } = await renderApp(<ImmobilisationPage cat="transport" />);
    fireEvent.click(screen.getByRole('button', { name: /Ajouter un véhicule/ }));
    const d = dialog();
    setField('Type de véhicule', 'Camion');
    setField('Marque / Modèle', 'Isuzu');
    setField('Immatriculation', '48215-b-6');
    setField('Affectation / usage', 'Chantiers');
    setField('Fournisseur', 'FL-0001');
    setField("Date d'acquisition", '2026-05-01');
    setField("Valeur d'acquisition (DH)", '300000');
    setField("Durée d'amortissement (ans)", '5');
    setField('Échéance assurance', '2026-04-01');
    setField('Échéance visite technique', '2027-01-01');
    fireEvent.click(within(d).getByRole('button', { name: 'Enregistrer' }));
    expect(screen.getByText('Cette immatriculation existe déjà.')).toBeTruthy();
    setField('Immatriculation', '99999-C-6');
    fireEvent.click(within(d).getByRole('button', { name: 'Enregistrer' }));
    expect(screen.getByText('Les échéances ne peuvent pas être antérieures à la date d’acquisition.')).toBeTruthy();
    setField('Échéance assurance', '2027-05-01');
    fireEvent.click(within(d).getByRole('button', { name: 'Enregistrer' }));
    const st = await saved();
    expect(st.immobilisations[0]).toMatchObject({ id: 'MT-0003', categorie: 'transport', typeVehicule: 'Camion', immatriculation: '99999-C-6', echeanceAssurance: '2027-05-01', echeanceVisite: '2027-01-01' });
  });

  it('amortissement linéaire (logique partagée)', () => {
    const am = immoAmort(10000, 5, '2024-01-01', new Date('2026-01-01T00:00:00Z').getTime());
    expect(am.dotation).toBe(2000);
    expect(am.cumule).toBeGreaterThan(3990);   // prorata temporis sur 365,25 jours/an : ≈ 2 ans
    expect(am.cumule).toBeLessThan(4010);
    expect(am.vnc).toBeCloseTo(10000 - am.cumule, 6);
  });
});
