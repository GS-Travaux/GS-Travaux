// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderApp } from '../../test/harness';
import AchatsPage from './AchatsPage';
import { dialog, flat, lectureSeule, setField } from '../partB.testHelpers';

afterEach(cleanup);

describe('AchatsPage', () => {
  it('liste les achats consommables, du plus récent au plus ancien, avec totaux', async () => {
    await renderApp(<AchatsPage type="consommable" />);
    expect(screen.getByText('Achats consommables')).toBeTruthy();
    const codes = Array.from(document.querySelectorAll('tbody td.mono:first-child')).map(td => td.textContent);
    expect(codes).toEqual(['AC-0003', 'AC-0002', 'AC-0001']);
    const head = flat(document.querySelector('.panel-head')!.textContent);
    // HT = 12×1450 + 5×185 + 20×38 = 19 085 ; TTC = ×1,2 = 22 902 ; à payer = 5×185×1,2 = 1 110
    expect(head).toContain('Total HT 19 085,00 DH');
    expect(head).toContain('TTC 22 902,00 DH');
    expect(head).toContain('dont à payer 1 110,00 DH');
    expect(screen.getAllByText('Frais généraux', { selector: 'td' }).length).toBe(2);
    expect(screen.getByText('01.230626 — VMM')).toBeTruthy();   // affectation à un devis
  });

  it('les « autres achats » sont séparés', async () => {
    await renderApp(<AchatsPage type="autre" />);
    expect(screen.getByText('Autres achats consommables')).toBeTruthy();
    expect(screen.getByText('AA-0001')).toBeTruthy();
    expect(screen.queryByText('AC-0001')).toBeNull();
  });

  it('filtre par statut', async () => {
    await renderApp(<AchatsPage type="consommable" />);
    const sel = Array.from(document.querySelectorAll('.filter-row select')).find(s => Array.from((s as HTMLSelectElement).options).some(o => o.value === 'À payer')) as HTMLSelectElement;
    fireEvent.change(sel, { target: { value: 'À payer' } });
    expect(screen.getByText('AC-0002')).toBeTruthy();
    expect(screen.queryByText('AC-0001')).toBeNull();
    expect(document.querySelector('.count-pill')!.textContent).toBe('1');
  });

  it('crée un achat : validations et montants calculés', async () => {
    const { saved } = await renderApp(<AchatsPage type="autre" />);
    fireEvent.click(screen.getByRole('button', { name: /Ajouter un achat/ }));
    const d = dialog();
    expect(within(d).getByText('Nouvel achat')).toBeTruthy();
    fireEvent.click(within(d).getByRole('button', { name: 'Enregistrer' }));
    expect(screen.getByText('Veuillez remplir tous les champs obligatoires.')).toBeTruthy();
    setField('Fournisseur', 'FL-0002');
    setField('N° facture / bon de livraison', 'BL-77');
    setField('Désignation', 'Disques');
    setField('Quantité', '2');
    setField('Prix unitaire HT (DH)', '0');
    fireEvent.click(within(d).getByRole('button', { name: 'Enregistrer' }));
    expect(screen.getByText('Le prix unitaire doit être supérieur à 0.')).toBeTruthy();
    setField('Prix unitaire HT (DH)', '10');
    setField('TVA (%)', '20');
    expect(flat(screen.getByTestId('achat-hint').textContent)).toContain('Montant TTC 24,00 DH');
    setField('Statut', 'Payé');
    fireEvent.click(within(d).getByRole('button', { name: 'Enregistrer' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    const st = await saved();
    expect(st.achats).toHaveLength(7);
    expect(st.achats[0]).toMatchObject({ id: 'AA-0004', type: 'autre', fournisseurId: 'FL-0002', quantite: 2, prixUnitaire: 10, tva: 20, statut: 'Payé', affectation: 'FG', categorie: 'Carburant', modePaiement: 'Virement' });
  });

  it('modifie puis supprime un achat', async () => {
    const { saved } = await renderApp(<AchatsPage type="consommable" />);
    fireEvent.doubleClick(screen.getByText('AC-0002'));
    setField('Statut', 'Payé');
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Enregistrer' }));
    expect((await saved()).achats.find(a => a.id === 'AC-0002')!.statut).toBe('Payé');
    fireEvent.click(within(screen.getByText('AC-0002').closest('tr')!).getByRole('button', { name: 'Supprimer' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Supprimer' }));
    await waitFor(() => expect(screen.queryByText('AC-0002')).toBeNull());
    expect((await saved()).achats.map(a => a.id)).not.toContain('AC-0002');
  });

  it('profil en lecture seule : pas de boutons', async () => {
    const { actions } = await renderApp(<AchatsPage type="consommable" />, { profil: 'Comptable', state: { droits: lectureSeule('achat_consommable') } });
    expect(screen.getByText('AC-0001')).toBeTruthy();
    expect(actions.textContent).not.toContain('Ajouter');
    expect(screen.queryByRole('button', { name: 'Modifier' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Supprimer' })).toBeNull();
    fireEvent.doubleClick(screen.getByText('AC-0001'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
