// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderApp } from '../../../test/harness';
import { seedState } from '../../../data/seed';
import { buildBordereauCimrLignes, buildBordereauCnssLignes, bulletinBrut, calculPaie } from '../../../lib/paie';
import { buildBulletinPrintHtml } from '../../../lib/printPaie';
import { money } from '../../../lib/format';
import PaieTab from './PaieTab';
import CnssTab from './CnssTab';
import CimrTab from './CimrTab';

afterEach(() => { cleanup(); document.body.innerHTML = ''; });

const dialog = () => screen.getByRole('dialog');
const change = (el: Element, value: string) => fireEvent.change(el, { target: { value } });
const toastText = () => screen.getByRole('status').textContent;
const rowOf = (text: string) => screen.getAllByText(text).map(e => e.closest('tr') as HTMLElement).find(tr => tr && tr.querySelector('td'))!;

describe('PaieTab', () => {
  it('affiche la liste des bulletins avec les montants calculés', async () => {
    await renderApp(<PaieTab />);
    expect(screen.getByText('Bulletins de paie')).toBeTruthy();
    expect(rowOf('Youssef El Amrani')).toBeTruthy();
    const s = seedState(); const b = s.bulletins[0]; const c = s.collaborateurs[0];
    const p = calculPaie(bulletinBrut(b), c.personnesACharge, c.cotiseCimr);
    const row = rowOf('Youssef El Amrani');
    expect(row.textContent).toContain(money(p.brut));
    expect(row.textContent).toContain(money(p.net - 625));
    expect(within(rowOf('Fatima Zahra Idrissi')).getAllByText('—').length).toBeGreaterThan(0);   // pas de CIMR
  });

  it('filtre par mois', async () => {
    await renderApp(<PaieTab />);
    change(screen.getByPlaceholderText('Mois (AAAA-MM)'), '2026-09');
    expect(screen.getByText('Aucun bulletin ne correspond aux filtres.')).toBeTruthy();
  });

  it('crée un bulletin à partir des données de démonstration (prêt social déduit)', async () => {
    const { actions, saved } = await renderApp(<PaieTab />);
    fireEvent.click(within(actions).getByText('Générer un bulletin'));
    expect(screen.getByText('Générer un bulletin de paie')).toBeTruthy();
    change(within(dialog()).getByLabelText('Mois'), '2026-09');
    expect((within(dialog()).getByLabelText('Montant 1') as HTMLInputElement).value).toBe('4500');
    expect((within(dialog()).getByLabelText('Libellé retenue 1') as HTMLInputElement).value).toBe('Prêt social');
    fireEvent.click(within(dialog()).getByText('+ Ajouter une prime / indemnité'));
    change(within(dialog()).getByLabelText('Désignation 2'), 'Prime');
    change(within(dialog()).getByLabelText('Montant 2'), '300');
    const p = calculPaie(4800, 2, true);
    expect(within(dialog()).getByTestId('bulletin-preview').textContent).toContain(money(p.net - 625) + ' DH');
    fireEvent.click(within(dialog()).getByText('Enregistrer'));
    expect(toastText()).toBe('Bulletin généré.');
    const st = await saved();
    expect(st.bulletins).toHaveLength(3);
    const nb = st.bulletins[0];
    expect(nb).toMatchObject({ collaborateurId: 'SAL-0001', mois: '2026-09', statut: 'Payé', modePaiement: 'Virement' });
    expect(nb.lignes).toEqual([{ designation: 'Salaire de base', montant: 4500 }, { designation: 'Prime', montant: 300 }]);
    expect(nb.retenues).toEqual([{ label: 'Prêt social', montant: 625 }]);
    const c = st.collaborateurs.find(x => x.id === 'SAL-0001')!;
    expect(c.pretRembourse).toBe(3750); expect(c.pretSolde).toBe(1250);
  });

  it('journalier : le salaire est calculé à partir des jours pointés', async () => {
    const { actions } = await renderApp(<PaieTab />);
    fireEvent.click(within(actions).getByText('Générer un bulletin'));
    change(within(dialog()).getByLabelText('Collaborateur'), 'SAL-0003');
    change(within(dialog()).getByLabelText('Mois'), '2026-09');
    expect((within(dialog()).getByLabelText('Désignation 1') as HTMLInputElement).value).toBe('Salaire journalier (1 jour(s) pointé(s) × 180,00 DH)');
    expect((within(dialog()).getByLabelText('Montant 1') as HTMLInputElement).value).toBe('180');
  });

  it('refuse un formulaire incomplet et de supprimer la dernière ligne de gain', async () => {
    const { actions, saved } = await renderApp(<PaieTab />);
    fireEvent.click(within(actions).getByText('Générer un bulletin'));
    fireEvent.click(within(dialog()).getAllByTitle('Supprimer')[0]);   // première icône ✕ = ligne de gain
    expect(toastText()).toBe('Le bulletin doit garder au moins une ligne de gain.');
    change(within(dialog()).getByLabelText('Désignation 1'), '');
    fireEvent.click(within(dialog()).getByText('Enregistrer'));
    expect(toastText()).toBe('Veuillez remplir tous les champs obligatoires.');
    expect((await saved()).bulletins).toHaveLength(2);
  });

  it('modifie un bulletin existant', async () => {
    const { saved } = await renderApp(<PaieTab />);
    fireEvent.click(within(rowOf('Fatima Zahra Idrissi')).getByText('Modifier'));
    expect((within(dialog()).getByLabelText('Collaborateur') as HTMLSelectElement).disabled).toBe(true);
    change(within(dialog()).getByLabelText('Mode de paiement'), 'Chèque');
    change(within(dialog()).getByLabelText('Statut'), 'En attente');
    fireEvent.click(within(dialog()).getByText('Enregistrer'));
    expect(toastText()).toBe('Bulletin modifié.');
    const b = (await saved()).bulletins.find(x => x.id === 'blt2')!;
    expect(b.modePaiement).toBe('Chèque'); expect(b.statut).toBe('En attente');
  });

  it('supprime un bulletin et actualise / supprime le bordereau du mois', async () => {
    const s = seedState();
    const cnss = { id: 'CNSS-2026-08', mois: '2026-08', statut: 'À payer', datePaiement: '', modePaiement: '', lignes: buildBordereauCnssLignes(s.bulletins, s.collaborateurs, s.pointages, '2026-08') };
    const cimr = { id: 'CIMR-2026-08', mois: '2026-08', statut: 'À payer', datePaiement: '', modePaiement: '', lignes: buildBordereauCimrLignes(s.bulletins, s.collaborateurs, '2026-08') };
    const { saved } = await renderApp(<PaieTab />, { state: { bordereauxCnss: [cnss], bordereauxCimr: [cimr] } });
    // bulletin de Youssef : prêt rendu (+625 → solde 1875+625), CNSS actualisé (1 ligne), CIMR supprimé
    fireEvent.click(within(rowOf('Youssef El Amrani')).getByText('Supprimer'));
    expect(within(dialog()).getByText(/Le remboursé du prêt sera diminué de 625,00 DH/)).toBeTruthy();
    fireEvent.click(within(dialog()).getByText('Supprimer'));
    await waitFor(() => expect(toastText()).toBe('Bulletin supprimé. Bordereau CNSS-2026-08 actualisé. Bordereau CIMR-2026-08 supprimé (plus aucun affilié ce mois).'));
    const st = await saved();
    expect(st.bulletins.map(x => x.id)).toEqual(['blt2']);
    expect(st.bordereauxCnss[0].lignes).toHaveLength(1);
    expect(st.bordereauxCimr).toHaveLength(0);
    const c = st.collaborateurs.find(x => x.id === 'SAL-0001')!;
    expect(c.pretRembourse).toBe(2500); expect(c.pretSolde).toBe(2500);
  });

  it('refuse la suppression si le bordereau CNSS du mois est payé', async () => {
    const { saved } = await renderApp(<PaieTab />, { state: { bordereauxCnss: [{ id: 'CNSS-2026-08', mois: '2026-08', statut: 'Payé', datePaiement: '2026-09-10', modePaiement: 'Virement', lignes: [] }] } });
    fireEvent.click(within(rowOf('Fatima Zahra Idrissi')).getByText('Supprimer'));
    expect(toastText()).toBe('Suppression impossible : le bordereau CNSS CNSS-2026-08 de ce mois est déjà payé.');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect((await saved()).bulletins).toHaveLength(2);
  });

  it('PDF : imprime le bulletin avec les montants calculés', async () => {
    document.body.insertAdjacentHTML('beforeend', '<div id="print-area"></div>');
    window.print = vi.fn();
    await renderApp(<PaieTab />);
    fireEvent.click(within(rowOf('Fatima Zahra Idrissi')).getByText('PDF'));
    const s = seedState();
    expect(document.getElementById('print-area')!.innerHTML).toBe(buildBulletinPrintHtml(s.bulletins[1], s));
    expect(window.print).toHaveBeenCalled();
    document.getElementById('print-area')!.remove();
  });

  it('profil sans droit de modifier : ni bouton de création, ni Modifier / Supprimer ; consultation en lecture seule', async () => {
    const { actions } = await renderApp(<PaieTab />, { profil: 'Commercial' });
    expect(within(actions).queryByText('Générer un bulletin')).toBeNull();
    expect(screen.queryByText('Modifier')).toBeNull();
    expect(screen.queryByText('Supprimer')).toBeNull();
    expect(screen.getAllByText('PDF')).toHaveLength(2);
    fireEvent.click(within(rowOf('Fatima Zahra Idrissi')).getByText('Voir'));
    expect(within(dialog()).queryByText('Enregistrer')).toBeNull();
    expect((within(dialog()).getByLabelText('Montant 1') as HTMLInputElement).closest('fieldset')!.disabled).toBe(true);
  });

  it('profil Comptable : création et suppression autorisées', async () => {
    const { actions } = await renderApp(<PaieTab />, { profil: 'Comptable' });
    expect(within(actions).getByText('Générer un bulletin')).toBeTruthy();
    expect(screen.getAllByText('Supprimer')).toHaveLength(2);
  });

  it('sans collaborateur actif : message', async () => {
    const s = seedState();
    const { actions } = await renderApp(<PaieTab />, { state: { collaborateurs: s.collaborateurs.map(c => ({ ...c, statut: 'Démissionné' })), bulletins: [] } });
    fireEvent.click(within(actions).getByText('Générer un bulletin'));
    expect(toastText()).toBe('Ajoutez d’abord un collaborateur actif.');
  });
});

describe('CnssTab', () => {
  it('liste vide puis génération d\'un bordereau pour un mois ayant des bulletins', async () => {
    const { actions, saved } = await renderApp(<CnssTab />);
    expect(screen.getByText(/Aucun bordereau\. Générez-en un/)).toBeTruthy();
    fireEvent.click(within(actions).getByText('Générer un bordereau'));
    change(within(dialog()).getByLabelText('Mois'), '2026-08');
    fireEvent.click(within(dialog()).getByText('Générer'));
    expect(toastText()).toBe('Bordereau CNSS-2026-08 généré.');
    const st = await saved();
    expect(st.bordereauxCnss).toHaveLength(1);
    expect(st.bordereauxCnss[0]).toMatchObject({ id: 'CNSS-2026-08', mois: '2026-08', statut: 'À payer' });
    expect(st.bordereauxCnss[0].lignes.map(l => l.collaborateurId).sort()).toEqual(['SAL-0001', 'SAL-0002']);
    expect(screen.getByText('CNSS-2026-08')).toBeTruthy();
  });

  it('refuse un mois sans bulletin', async () => {
    const { actions, saved } = await renderApp(<CnssTab />);
    fireEvent.click(within(actions).getByText('Générer un bordereau'));
    change(within(dialog()).getByLabelText('Mois'), '2026-05');
    fireEvent.click(within(dialog()).getByText('Générer'));
    expect(toastText()).toBe('Aucun bulletin de paie pour ce mois.');
    expect((await saved()).bordereauxCnss).toHaveLength(0);
  });

  it('refuse un doublon', async () => {
    const s = seedState();
    const existing = { id: 'CNSS-2026-08', mois: '2026-08', statut: 'À payer', datePaiement: '', modePaiement: '', lignes: buildBordereauCnssLignes(s.bulletins, s.collaborateurs, s.pointages, '2026-08') };
    const { actions, saved } = await renderApp(<CnssTab />, { state: { bordereauxCnss: [existing] } });
    fireEvent.click(within(actions).getByText('Générer un bordereau'));
    change(within(dialog()).getByLabelText('Mois'), '2026-08');
    fireEvent.click(within(dialog()).getByText('Générer'));
    expect(toastText()).toBe('Un bordereau existe déjà pour ce mois.');
    expect((await saved()).bordereauxCnss).toHaveLength(1);
  });

  it('détail, actualisation et paiement', async () => {
    const s = seedState();
    const lignes = buildBordereauCnssLignes(s.bulletins, s.collaborateurs, s.pointages, '2026-08');
    const old = { id: 'CNSS-2026-08', mois: '2026-08', statut: 'À payer', datePaiement: '', modePaiement: '', lignes: lignes.slice(0, 1) };
    const { saved } = await renderApp(<CnssTab />, { state: { bordereauxCnss: [old] } });
    fireEvent.click(screen.getByText('Détail'));
    expect(within(dialog()).getByText('Total à payer à la CNSS')).toBeTruthy();
    expect(within(dialog()).getByText('Salariés déclarés')).toBeTruthy();
    fireEvent.click(within(dialog()).getByText('Fermer'));
    fireEvent.click(screen.getByText('Actualiser'));
    expect(toastText()).toBe('Bordereau actualisé depuis les bulletins de paie.');
    expect((await saved()).bordereauxCnss[0].lignes).toHaveLength(2);
    fireEvent.click(screen.getByText('Marquer payé'));
    change(within(dialog()).getByLabelText('Date de paiement'), '2026-07-31');
    fireEvent.click(within(dialog()).getByText('Confirmer'));
    expect(toastText()).toBe('La date de paiement ne peut pas être antérieure au mois du bordereau.');
    change(within(dialog()).getByLabelText('Date de paiement'), '2026-09-10');
    change(within(dialog()).getByLabelText('Mode de paiement'), 'Chèque');
    fireEvent.click(within(dialog()).getByText('Confirmer'));
    expect(toastText()).toBe('Bordereau marqué comme payé.');
    const b = (await saved()).bordereauxCnss[0];
    expect(b).toMatchObject({ statut: 'Payé', datePaiement: '2026-09-10', modePaiement: 'Chèque' });
    expect(screen.queryByText('Marquer payé')).toBeNull();
    expect(screen.queryByText('Actualiser')).toBeNull();
  });

  it('profil sans droit de modifier : pas de bouton de génération ni de paiement', async () => {
    const s = seedState();
    const existing = { id: 'CNSS-2026-08', mois: '2026-08', statut: 'À payer', datePaiement: '', modePaiement: '', lignes: buildBordereauCnssLignes(s.bulletins, s.collaborateurs, s.pointages, '2026-08') };
    const { actions } = await renderApp(<CnssTab />, { profil: 'Commercial', state: { bordereauxCnss: [existing] } });
    expect(within(actions).queryByText('Générer un bordereau')).toBeNull();
    expect(screen.queryByText('Marquer payé')).toBeNull();
    expect(screen.queryByText('Actualiser')).toBeNull();
    expect(screen.getByText('Détail')).toBeTruthy();
    expect(screen.getByText('PDF')).toBeTruthy();
  });
});

describe('CimrTab', () => {
  it('génère un bordereau CIMR (affiliés seulement), refuse doublon et mois vide', async () => {
    const { actions, saved } = await renderApp(<CimrTab />);
    expect(screen.getByText(/Aucun bordereau CIMR/)).toBeTruthy();
    const ouvrir = (m: string) => { fireEvent.click(within(actions).getByText('Générer un bordereau')); change(within(dialog()).getByLabelText('Mois'), m); fireEvent.click(within(dialog()).getByText('Générer')); };
    ouvrir('2026-05');
    expect(toastText()).toBe('Aucun bulletin de collaborateur affilié à la CIMR pour ce mois.');
    fireEvent.click(within(dialog()).getByText('Annuler'));
    ouvrir('2026-08');
    expect(toastText()).toBe('Bordereau CIMR-2026-08 généré.');
    const st = await saved();
    expect(st.bordereauxCimr).toHaveLength(1);
    expect(st.bordereauxCimr[0].lignes.map(l => l.collaborateurId)).toEqual(['SAL-0001']);
    ouvrir('2026-08');
    expect(toastText()).toBe('Un bordereau CIMR existe déjà pour ce mois.');
    expect((await saved()).bordereauxCimr).toHaveLength(1);
  });

  it('détail, actualisation et paiement', async () => {
    const s = seedState();
    const b = { id: 'CIMR-2026-08', mois: '2026-08', statut: 'À payer', datePaiement: '', modePaiement: '', lignes: buildBordereauCimrLignes(s.bulletins, s.collaborateurs, '2026-08') };
    const { saved } = await renderApp(<CimrTab />, { state: { bordereauxCimr: [b] } });
    fireEvent.click(screen.getByText('Détail'));
    expect(within(dialog()).getByText('Total à payer à la CIMR')).toBeTruthy();
    expect(within(dialog()).getByText('012449601')).toBeTruthy();
    fireEvent.click(within(dialog()).getByText('Fermer'));
    fireEvent.click(screen.getByText('Actualiser'));
    expect(toastText()).toBe('Bordereau actualisé depuis les bulletins de paie.');
    fireEvent.click(screen.getByText('Marquer payé'));
    change(within(dialog()).getByLabelText('Date de paiement'), '2026-09-12');
    fireEvent.click(within(dialog()).getByText('Confirmer'));
    expect((await saved()).bordereauxCimr[0]).toMatchObject({ statut: 'Payé', datePaiement: '2026-09-12', modePaiement: 'Virement' });
  });

  it('profil sans droit de modifier : pas de bouton', async () => {
    const s = seedState();
    const b = { id: 'CIMR-2026-08', mois: '2026-08', statut: 'À payer', datePaiement: '', modePaiement: '', lignes: buildBordereauCimrLignes(s.bulletins, s.collaborateurs, '2026-08') };
    const { actions } = await renderApp(<CimrTab />, { profil: 'Commercial', state: { bordereauxCimr: [b] } });
    expect(within(actions).queryByText('Générer un bordereau')).toBeNull();
    expect(screen.queryByText('Marquer payé')).toBeNull();
    expect(screen.getByText('Détail')).toBeTruthy();
  });
});
