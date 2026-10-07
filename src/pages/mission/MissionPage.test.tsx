// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '../../test/harness';
import MissionPage from './MissionPage';

afterEach(() => { cleanup(); document.body.innerHTML = ''; });
const dialog = () => screen.getByRole('dialog');

describe('MissionPage', () => {
  it('liste les ordres de mission (plus récent en premier)', async () => {
    await renderApp(<MissionPage />);
    expect(screen.getByText('Ordres de mission')).toBeTruthy();
    const ids = Array.from(document.querySelectorAll('tbody tr')).map(tr => tr.querySelector('td')!.textContent);
    expect(ids).toEqual(['OM-0002', 'OM-0001']);
    expect(screen.getByText('Youssef El Amrani, Hamid Bouziane')).toBeTruthy();
  });

  it('crée un ordre de mission sur une ligne de devis soldé', async () => {
    const { saved } = await renderApp(<MissionPage />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Créer un ordre de mission/ }));
    expect(within(dialog()).getAllByRole('button', { name: 'Choisir' }).length).toBe(2);   // d2 (Facturé) et d3 (Soldée)
    await user.click(within(dialog()).getAllByRole('button', { name: 'Choisir' })[1]);
    const d = within(dialog());
    expect(d.getByText(/Nouvel ordre de mission \(OM-0003\)/)).toBeTruthy();
    // aucun collaborateur : refus
    await user.click(d.getByRole('button', { name: 'Enregistrer' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    await user.click(d.getByLabelText(/Fatima Zahra Idrissi/));
    await user.click(d.getByRole('button', { name: 'Enregistrer' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    const om = (await saved()).ordresMission[0];
    expect(om).toMatchObject({ id: 'OM-0003', statut: 'Planifié', collaborateurIds: ['SAL-0002'] });
    expect(om.lignes).toHaveLength(1);
    expect(screen.getByText('OM-0003')).toBeTruthy();
  });

  it('démarre, termine et annule', async () => {
    const { saved } = await renderApp(<MissionPage />);
    const user = userEvent.setup();
    const row = () => screen.getByText('OM-0002').closest('tr')!;
    await user.click(within(row()).getByRole('button', { name: 'Démarrer' }));
    expect((await saved()).ordresMission.find(o => o.id === 'OM-0002')!.statut).toBe('En cours');
    await user.click(within(row()).getByRole('button', { name: 'Terminer' }));
    expect((await saved()).ordresMission.find(o => o.id === 'OM-0002')!.statut).toBe('Terminé');
    expect(within(row()).queryByRole('button', { name: 'Annuler' })).toBeNull();
  });

  it('double-clic : modification (statut modifiable)', async () => {
    const { saved } = await renderApp(<MissionPage />);
    const user = userEvent.setup();
    await user.dblClick(screen.getByText('OM-0002'));
    const d = within(dialog());
    expect(d.getByText('Modifier OM-0002')).toBeTruthy();
    await user.selectOptions(d.getByDisplayValue('Planifié'), 'Annulé');
    await user.click(d.getByRole('button', { name: 'Enregistrer' }));
    expect((await saved()).ordresMission.find(o => o.id === 'OM-0002')!.statut).toBe('Annulé');
  });

  it('filtre par statut', async () => {
    await renderApp(<MissionPage />);
    const user = userEvent.setup();
    await user.selectOptions(screen.getAllByRole('combobox')[0], 'Terminé');
    expect(screen.getByText('OM-0001')).toBeTruthy();
    expect(screen.queryByText('OM-0002')).toBeNull();
  });

  it('profil Comptable : lecture seule, aucun bouton de création ni de changement d\'état', async () => {
    const { actions } = await renderApp(<MissionPage />, { profil: 'Comptable' });
    expect(actions.textContent).toBe('');
    expect(screen.queryByRole('button', { name: 'Démarrer' })).toBeNull();
  });
});
