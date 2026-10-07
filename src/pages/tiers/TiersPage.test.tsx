// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderApp } from '../../test/harness';
import TiersPage from './TiersPage';
import { dialog, flat, hasField, setField } from '../partB.testHelpers';

afterEach(cleanup);

describe('TiersPage', () => {
  it('liste les clients puis les fournisseurs', async () => {
    await renderApp(<TiersPage />);
    expect(screen.getByText('Clients')).toBeTruthy();
    expect(screen.getByText('CL-0001')).toBeTruthy();
    expect(screen.getByText('Chantier Anfa')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Fournisseur' }));
    expect(screen.getByText('Fournisseurs')).toBeTruthy();
    expect(screen.getByText('Steel Maroc SARL')).toBeTruthy();
    expect(screen.queryByText('VMM')).toBeNull();
  });

  it('filtre par nom', async () => {
    await renderApp(<TiersPage />);
    fireEvent.change(screen.getByPlaceholderText('Nom société'), { target: { value: 'soma' } });
    expect(screen.getByText('SOMAPRO')).toBeTruthy();
    expect(screen.queryByText('VMM')).toBeNull();
  });

  it('crée un client via le formulaire (champs obligatoires, puis enregistrement)', async () => {
    const { saved } = await renderApp(<TiersPage />);
    fireEvent.click(screen.getByRole('button', { name: /Ajouter un client/ }));
    expect((within(dialog()).getByDisplayValue('CL-0004') as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Enregistrer' }));
    expect(screen.getByText('Veuillez remplir tous les champs obligatoires.')).toBeTruthy();
    expect(screen.getByRole('dialog')).toBeTruthy();
    setField('Nom société', '  Nouveau Client  ');
    setField('ICE', '001122334455667');
    setField('Adresse', 'Rue 1, Casablanca');
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Enregistrer' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText('Nouveau Client')).toBeTruthy();
    const st = await saved();
    expect(st.clients).toHaveLength(4);
    expect(st.clients[0]).toMatchObject({ id: 'CL-0004', nom: 'Nouveau Client', ice: '001122334455667', adresse: 'Rue 1, Casablanca' });
  });

  it('modifie un fournisseur par double-clic', async () => {
    const { saved } = await renderApp(<TiersPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Fournisseur' }));
    fireEvent.doubleClick(screen.getByText('Quincaillerie Al Amal'));
    expect(within(dialog()).getByText('Modifier FL-0002')).toBeTruthy();
    setField('Nom société', 'Quincaillerie Al Amal 2');
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Enregistrer' }));
    const st = await saved();
    expect(st.fournisseurs.find(f => f.id === 'FL-0002')!.nom).toBe('Quincaillerie Al Amal 2');
    expect(st.fournisseurs).toHaveLength(2);
  });

  it('historique client (devis) et fournisseur (immobilisations + achats)', async () => {
    await renderApp(<TiersPage />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Historique' })[0]);
    const d = dialog();
    expect(within(d).getByText('Historique — VMM')).toBeTruthy();
    expect(within(d).getByText(/Devis 01\.230626/)).toBeTruthy();
    expect(flat(d.textContent)).toContain('3 200,00 DH');
    fireEvent.click(within(d).getAllByRole('button', { name: 'Fermer' }).pop()!);
    fireEvent.click(screen.getByRole('button', { name: 'Fournisseur' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Historique' })[0]);
    expect(within(dialog()).getByText(/MT-0001 — Camionnette Renault Master plateau/)).toBeTruthy();
    expect(within(dialog()).getAllByText('Achat').length).toBeGreaterThan(0);
  });

  it('historique vide', async () => {
    await renderApp(<TiersPage />, { empty: true, state: { clients: [{ id: 'CL-0001', nom: 'Seul', ice: '1', adresse: 'x' }] } });
    fireEvent.click(screen.getByRole('button', { name: 'Historique' }));
    expect(within(dialog()).getByText(/Aucun historique de devis pour ce client/)).toBeTruthy();
  });

  it('échappe le texte (pas de HTML injecté)', async () => {
    await renderApp(<TiersPage />, { state: { clients: [{ id: 'CL-0001', nom: '<img src=x onerror=alert(1)>', ice: '1', adresse: 'x' }] } });
    expect(document.querySelector('img[src="x"]')).toBeNull();
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeTruthy();
  });

  it('profil sans droit de modification : pas de boutons d’ajout ni de modification, historique conservé', async () => {
    const { actions } = await renderApp(<TiersPage />, { profil: 'Comptable' });   // client : voir seulement ; fournisseur : voir + modifier
    expect(actions.textContent).not.toContain('Ajouter un client');
    expect(screen.queryByRole('button', { name: 'Modifier' })).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Historique' }).length).toBe(3);
    fireEvent.doubleClick(screen.getByText('VMM'));
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Fournisseur' }));
    expect(actions.textContent).toContain('Ajouter un fournisseur');
    expect(screen.getAllByRole('button', { name: 'Modifier' }).length).toBe(2);
  });

  it('un onglet sans droit « voir » est masqué', async () => {
    await renderApp(<TiersPage />, { profil: 'Commercial', state: { droits: { 'prf-commercial': { tiers_client: { voir: true, modifier: true, supprimer: false } } } } });
    expect(screen.getByRole('button', { name: 'Client' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Fournisseur' })).toBeNull();
    expect(hasField('Nom société')).toBe(false);
    await waitFor(() => expect(screen.getByText('Clients')).toBeTruthy());
  });
});
