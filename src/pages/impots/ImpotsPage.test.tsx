// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderApp } from '../../test/harness';
import { seedState } from '../../data/seed';
import ImpotsPage from './ImpotsPage';
import { dialog, flat, lectureSeule, setField } from '../partB.testHelpers';
import { libPeriode } from '../../lib/liberatoire';
import type { Devis, Impot } from '../../lib/types';

afterEach(cleanup);

const IR = 'Impôt sur le revenu (IR)';
const impots: Impot[] = [
  { id: 'IT-0001', type: IR, periode: 'T2 2020', echeance: '2020-07-31', montant: 3200, paiement: { date: '2020-07-20', montant: 3200, mode: 'Virement', reference: 'QT-1' } },
  { id: 'IT-0002', type: 'Taxe de services communaux', periode: 'Année 2020', echeance: '2020-09-30', montant: 900, paiement: null },          // en retard
  { id: 'IT-0003', type: IR, periode: 'T3 2099', echeance: '2099-10-31', montant: 2400, paiement: null },                                            // à payer
];

/** Client facturé 100 000 DH le 01/02/2025, délai 30 jours → encaissé le 03/03/2025 (échue, quelle que soit la date du jour). */
const devisGros: Devis = {
  id: 'dx', numero: '01.250101', client: 'Client X', date: '2025-01-05', objet: 'Gros chantier', emetteur: 'Brahim', statut: 'Facturé',
  modePaiement: 'Virement', delaiPaiement: '30 jours', demandeAvance: 0,
  lignes: [{ designation: 'Charpente', qte: 1, pu: 100000, matiere: 'sans', taches: [] }],
  dateSoldee: '2025-01-10', dateFacturee: '2025-02-01', bc: null, facture: { numero: '000000001', date: '2025-02-01', modePaiement: 'Virement', delai: '30 jours' },
};
const societe = seedState().societe;     // auto-entrepreneur, prestations de services (1 %)

describe('impôt libératoire — exemple chiffré', () => {
  it('100 000 DH encaissés (services, 1 %) : base 80 000, excédent 20 000, retenue 6 000, impôt 800', () => {
    const L = libPeriode([devisGros], societe, 2025, 'A', undefined, '2026-10-06');
    expect(L.rows).toHaveLength(1);
    expect(L.rows[0]).toMatchObject({ client: 'Client X', encaisse: 100000, cumul: 100000, enCours: 0, base: 80000, exces: 20000, retenue: 6000, impot: 800, statut: 'Seuil dépassé' });
    expect(L.tot).toMatchObject({ base: 80000, exces: 20000, retenue: 6000, impot: 800 });
    expect(L.info).toMatchObject({ label: 'Année 2025', echeance: '2026-01-31' });
    // le seuil est annuel : le trimestre de l'encaissement porte tout, les suivants rien
    expect(libPeriode([devisGros], societe, 2025, '1', undefined, '2026-10-06').tot.impot).toBe(800);
    expect(libPeriode([devisGros], societe, 2025, '2', undefined, '2026-10-06').rows).toHaveLength(0);
  });
  it('commerce : 0,5 % sans seuil ; facture non encore échue : « en cours »', () => {
    const L = libPeriode([devisGros], { ...societe, natureActivite: 'commerce' }, 2025, 'A', undefined, '2026-10-06');
    expect(L.rows[0]).toMatchObject({ base: 100000, exces: 0, retenue: 0, impot: 500 });
    const tot = libPeriode([devisGros], societe, 2025, 'A', undefined, '2025-02-15');
    expect(tot.rows[0]).toMatchObject({ encaisse: 0, enCours: 100000, impot: 0 });
  });
});

describe('ImpotsPage — impôts et taxes', () => {
  it('liste (en retard, à payer, payé) avec totaux', async () => {
    await renderApp(<ImpotsPage />, { state: { impots } });
    const codes = Array.from(document.querySelectorAll('tbody td.mono:first-child')).map(td => td.textContent);
    expect(codes.slice(-3)).toEqual(['IT-0002', 'IT-0003', 'IT-0001']);
    const head = flat(Array.from(document.querySelectorAll('.panel-head')).pop()!.textContent);
    expect(head).toContain('Total dû 6 500,00 DH');
    expect(head).toContain('payé 3 200,00 DH');
    expect(head).toContain('reste à payer 3 300,00 DH');
    expect(head).toContain('dont en retard 900,00 DH');
    expect(screen.getAllByText('En retard').length).toBeGreaterThan(0);
  });

  it('crée un impôt', async () => {
    const { saved } = await renderApp(<ImpotsPage />, { state: { impots } });
    fireEvent.click(screen.getByRole('button', { name: /Ajouter un impôt ou une taxe/ }));
    const d = dialog();
    fireEvent.click(within(d).getByRole('button', { name: 'Enregistrer' }));
    expect(screen.getByText('Veuillez remplir tous les champs obligatoires.')).toBeTruthy();
    setField('Impôt / taxe', 'TVA');
    setField('Période concernée', 'Août 2026');
    setField("Date d'échéance", '2026-09-20');
    fireEvent.click(within(d).getByRole('button', { name: 'Enregistrer' }));
    expect(screen.getByText('Le montant dû doit être supérieur à 0.')).toBeTruthy();
    setField('Montant dû (DH)', '1500.5');
    fireEvent.click(within(d).getByRole('button', { name: 'Enregistrer' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect((await saved()).impots[0]).toMatchObject({ id: 'IT-0004', type: 'TVA', periode: 'Août 2026', echeance: '2026-09-20', montant: 1500.5, paiement: null });
  });

  it('marque payé, puis annule le paiement', async () => {
    const { saved } = await renderApp(<ImpotsPage />, { state: { impots } });
    fireEvent.click(within(screen.getByText('IT-0002').closest('tr')!).getByRole('button', { name: 'Marquer payé' }));
    const d = dialog();
    expect(within(d).getByText('Paiement — IT-0002')).toBeTruthy();
    fireEvent.click(within(d).getByRole('button', { name: 'Enregistrer' }));
    expect(screen.getByText('Veuillez remplir tous les champs obligatoires.')).toBeTruthy();
    setField('Référence de la quittance', 'Q-42');
    setField('Mode de paiement', 'Chèque');
    setField('Montant payé (DH)', '950');
    fireEvent.click(within(d).getByRole('button', { name: 'Enregistrer' }));
    let st = await saved();
    expect(st.impots.find(i => i.id === 'IT-0002')!.paiement).toMatchObject({ montant: 950, mode: 'Chèque', reference: 'Q-42' });
    expect(flat(screen.getByText('IT-0002').closest('tr')!.textContent)).toContain('950,00 DH');

    fireEvent.click(within(screen.getByText('IT-0002').closest('tr')!).getByRole('button', { name: 'Annuler le paiement' }));
    expect(within(dialog()).getByText(/quittance Q-42/)).toBeTruthy();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Garder le paiement' }));
    expect((await saved()).impots.find(i => i.id === 'IT-0002')!.paiement).not.toBeNull();
    fireEvent.click(within(screen.getByText('IT-0002').closest('tr')!).getByRole('button', { name: 'Annuler le paiement' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Annuler le paiement' }));
    st = await saved();
    expect(st.impots.find(i => i.id === 'IT-0002')!.paiement).toBeNull();
  });

  it('modifie et supprime', async () => {
    const { saved } = await renderApp(<ImpotsPage />, { state: { impots } });
    fireEvent.doubleClick(screen.getByText('IT-0003'));
    setField('Montant dû (DH)', '2600');
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Enregistrer' }));
    expect((await saved()).impots.find(i => i.id === 'IT-0003')!.montant).toBe(2600);
    fireEvent.click(within(screen.getByText('IT-0001').closest('tr')!).getByRole('button', { name: 'Supprimer' }));
    expect(within(dialog()).getByText(/disparaîtra aussi de la trésorerie/)).toBeTruthy();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Supprimer' }));
    await waitFor(() => expect(screen.queryByText('IT-0001')).toBeNull());
    expect((await saved()).impots.map(i => i.id)).toEqual(['IT-0002', 'IT-0003']);
  });

  it('profil en lecture seule : pas de boutons d’ajout, de paiement, de modification ni de suppression', async () => {
    const { actions } = await renderApp(<ImpotsPage />, { profil: 'Comptable', state: { impots, droits: lectureSeule('impots') } });
    expect(screen.getByText('IT-0001')).toBeTruthy();
    expect(actions.textContent).not.toContain('Ajouter');
    for (const n of ['Modifier', 'Marquer payé', 'Annuler le paiement', 'Supprimer']) expect(screen.queryByRole('button', { name: n })).toBeNull();
    fireEvent.doubleClick(screen.getByText('IT-0003'));
    expect(screen.queryByRole('dialog')).toBeNull();
    // le panneau libératoire reste lisible mais sans bouton de création d'échéance
    expect(screen.getByTestId('lib-panel')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Créer l'échéance/ })).toBeNull();
  });
});

describe('ImpotsPage — panneau impôt libératoire', () => {
  it('affiché seulement pour le statut auto-entrepreneur', async () => {
    const a = await renderApp(<ImpotsPage />);
    expect(screen.getByText('Impôt libératoire — auto-entrepreneur')).toBeTruthy();
    a.unmount(); cleanup();
    await renderApp(<ImpotsPage />, { state: { societe: { ...societe, statutJuridique: 'SARL' } } });
    expect(screen.queryByText('Impôt libératoire — auto-entrepreneur')).toBeNull();
    expect(screen.getByText('Impôts et taxes')).toBeTruthy();
    cleanup();
    await renderApp(<ImpotsPage />, { state: { societe: { ...societe, statutJuridique: 'auto entrepreneur' } } });
    expect(screen.getByText('Impôt libératoire — auto-entrepreneur')).toBeTruthy();
  });

  it('situation par client, KPI et création / mise à jour / paiement de l’échéance', async () => {
    const { saved } = await renderApp(<ImpotsPage />, { state: { devis: [devisGros] } });
    fireEvent.change(screen.getByLabelText('Année'), { target: { value: '2025' } });
    const p = screen.getByTestId('lib-panel');
    const txt = flat(p.textContent);
    expect(txt).toContain('Prestations de services');
    expect(txt).toContain('taux 1 %');
    const kpis = Array.from(p.querySelectorAll('.kpi-card')).map(k => flat(k.textContent));
    expect(kpis).toEqual([
      'CA encaissé (Année 2025)100 000,00 DH1 client(s)',
      'Impôt libératoire à payer800,00 DH1 % sur 80 000,00 DH',
      'Retenue à la source (30 %)6 000,00 DHsur 20 000,00 DH au-delà du seuil',
      'Impôt total6 800,00 DHLibératoire + retenue',
    ]);
    const ligne = flat(within(p).getByText('Client X').closest('tr')!.textContent);
    expect(ligne).toContain('100 000,00 DH');        // encaissé et cumul
    expect(ligne).toContain('80 000,00 DH');         // base
    expect(ligne).toContain('20 000,00 DH');         // au-delà du seuil
    expect(ligne).toContain('6 000,00 DH');          // retenue
    expect(ligne).toContain('800,00 DH');            // impôt
    expect(within(p).getByText('Seuil dépassé')).toBeTruthy();
    expect(txt).toContain('Un client unique dépasse 80 000,00 DH par an');

    fireEvent.click(within(p).getByRole('button', { name: "Créer l'échéance d'IR — Année 2025" }));
    let st = await saved();
    expect(st.impots[0]).toEqual({ id: 'IT-0005', type: IR, periode: 'Année 2025', echeance: '2026-01-31', montant: 800, paiement: null });
    expect(st.impots).toHaveLength(5);
    expect(screen.getByText('IT-0005')).toBeTruthy();
    expect(within(screen.getByTestId('lib-panel')).getByRole('button', { name: /Mettre à jour l'échéance IT-0005/ })).toBeTruthy();

    // marquée payée : le panneau ne propose plus de la modifier
    fireEvent.click(within(screen.getByText('IT-0005').closest('tr')!).getByRole('button', { name: 'Marquer payé' }));
    setField('Référence de la quittance', 'Q-LIB');
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(flat(screen.getByTestId('lib-panel').textContent)).toContain('Échéance IT-0005 déjà payée (800,00 DH)'));
    st = await saved();
    expect(st.impots[0].paiement).toMatchObject({ montant: 800, reference: 'Q-LIB' });
  });

  it('un trimestre sans encaissement : tableau vide', async () => {
    await renderApp(<ImpotsPage />, { state: { devis: [devisGros] } });
    fireEvent.change(screen.getByLabelText('Année'), { target: { value: '2025' } });
    fireEvent.change(screen.getByLabelText('Période'), { target: { value: '2' } });
    expect(screen.getByText('Aucun CA encaissé sur cette période.')).toBeTruthy();
    expect(within(screen.getByTestId('lib-panel')).getByRole('button', { name: "Créer l'échéance d'IR — T2 2025" })).toBeTruthy();
    fireEvent.click(within(screen.getByTestId('lib-panel')).getByRole('button', { name: "Créer l'échéance d'IR — T2 2025" }));
    expect(screen.getByText('Aucun impôt libératoire à déclarer sur cette période.')).toBeTruthy();
  });

  it('commerce : pas de seuil ni de situation par client', async () => {
    await renderApp(<ImpotsPage />, { state: { devis: [devisGros], societe: { ...societe, natureActivite: 'commerce' } } });
    fireEvent.change(screen.getByLabelText('Année'), { target: { value: '2025' } });
    const txt = flat(screen.getByTestId('lib-panel').textContent);
    expect(txt).toContain('taux 0,5 %');
    const kpis = Array.from(screen.getByTestId('lib-panel').querySelectorAll('.kpi-card')).map(k => flat(k.textContent));
    expect(kpis[1]).toBe('Impôt libératoire à payer500,00 DH0,5 % sur 100 000,00 DH');
    expect(kpis[2]).toBe('Retenue à la source (30 %)0,00 DHNon applicable');
    expect(txt).not.toContain('Seuil dépassé');
  });
});
