// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '../../test/harness';
import { defaultDroits } from '../../lib/rights';
import DevisPage from './DevisPage';
import CommandesPage from './CommandesPage';
import FacturationPage from './FacturationPage';

afterEach(() => { cleanup(); document.body.innerHTML = ''; document.body.className = ''; });

const dialog = () => screen.getByRole('dialog');

describe('DevisPage', () => {
  it('affiche la liste des devis avec montants, situation et avancement', async () => {
    await renderApp(<DevisPage />);
    expect(screen.getByText('Liste des devis')).toBeTruthy();
    expect(screen.getByText('02.190926')).toBeTruthy();
    expect(screen.getByText('01.230626')).toBeTruthy();
    expect(screen.getByText(/^4[\s\u202f\u00a0]800,00 DH$/)).toBeTruthy();                 // 4×600 + 4×600 (d1)
    expect(screen.getAllByText('Terminé').length).toBeGreaterThan(0);          // avancement de d2
    expect(screen.getAllByText('Non démarré').length).toBeGreaterThan(0);
  });

  it('filtre par situation', async () => {
    await renderApp(<DevisPage />);
    const user = userEvent.setup();
    const selects = screen.getAllByRole('combobox');
    const statut = selects.find(s => Array.from((s as HTMLSelectElement).options).some(o => o.value === 'Soldée'))!;
    await user.selectOptions(statut, 'Soldée');
    expect(screen.getByText('03.150726')).toBeTruthy();
    expect(screen.queryByText('02.190926')).toBeNull();
  });

  it('crée un devis (numérotation DV_AA_NNNN, client choisi dans la liste)', async () => {
    const { saved } = await renderApp(<DevisPage />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Ajouter un devis/ }));
    const d = within(dialog());
    await user.type(d.getByPlaceholderText('Rechercher un client…'), 'Anf');
    await user.click(d.getByText('Chantier Anfa'));
    const byId = (id: string) => dialog().querySelector('#' + id) as HTMLInputElement;
    expect(byId('f-numero').value).toMatch(/^DV_\d\d_0001$/);
    await user.type(byId('f-objet'), 'Portail coulissant');
    await user.type(byId('f-delai'), '60 jours');
    await user.type(d.getByLabelText('Désignation ligne 1'), 'Portail 4 m');
    await user.clear(d.getByLabelText('Prix unitaire ligne 1'));
    await user.type(d.getByLabelText('Prix unitaire ligne 1'), '1250.5');
    await user.click(d.getByRole('button', { name: '+ Ajouter une tâche' }));
    await user.type(dialog().querySelector('.tache-row input') as HTMLInputElement, 'Soudure');
    expect(d.getByTestId('lines-total').textContent).toContain('1');
    await user.click(d.getByRole('button', { name: 'Enregistrer' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    const st = await saved();
    const nouveau = st.devis.find(x => x.objet === 'Portail coulissant')!;
    expect(nouveau).toMatchObject({ client: 'Chantier Anfa', clientId: 'CL-0002', statut: 'Créé', delaiPaiement: '60 jours', modePaiement: 'Chèque', bc: null, facture: null });
    expect(nouveau.lignes).toEqual([{ designation: 'Portail 4 m', qte: 1, pu: 1250.5, matiere: 'sans', taches: ['Soudure'] }]);
    expect(nouveau.numero).toMatch(/^DV_\d\d_0001$/);
    expect(st.devis[0].id).toBe(nouveau.id);                                    // le plus récent d'abord
  });

  it('refuse un client tapé mais non choisi, et les champs obligatoires vides', async () => {
    const { saved } = await renderApp(<DevisPage />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Ajouter un devis/ }));
    const d = within(dialog());
    await user.click(d.getByRole('button', { name: 'Enregistrer' }));           // champs vides
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(document.querySelector('.field-invalid')).toBeTruthy();
    await user.type(d.getByPlaceholderText('Rechercher un client…'), 'Inconnu');
    await user.type(dialog().querySelector('#f-objet') as HTMLInputElement, 'X');
    await user.type(dialog().querySelector('#f-delai') as HTMLInputElement, '30 jours');
    await user.type(d.getByLabelText('Désignation ligne 1'), 'Y');
    await user.click(d.getByRole('button', { name: 'Enregistrer' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect((await saved()).devis.length).toBe(4);
  });

  it('modifie un devis existant sans perdre son statut ni son BC', async () => {
    const { saved } = await renderApp(<DevisPage />);
    const user = userEvent.setup();
    const row = screen.getByText('03.150726').closest('tr')!;
    await user.click(within(row).getByRole('button', { name: 'Modifier' }));
    const objet = dialog().querySelector('#f-objet') as HTMLInputElement;
    await user.clear(objet); await user.type(objet, 'Garde-corps révisé');
    await user.click(within(dialog()).getByRole('button', { name: 'Enregistrer' }));
    const d3 = (await saved()).devis.find(x => x.id === 'd3')!;
    expect(d3).toMatchObject({ objet: 'Garde-corps révisé', statut: 'Soldée', numero: '03.150726' });
    expect(d3.bc?.numero).toBe('BC-2026-015');
  });

  it('détail d\'un devis : onglets lignes / articles / ordres de mission', async () => {
    await renderApp(<DevisPage />);
    const user = userEvent.setup();
    const row = screen.getByText('01.230626').closest('tr')!;
    await user.click(within(row).getByRole('button', { name: 'Détail' }));
    const d = within(dialog());
    expect(d.getByText('Détail du devis 01.230626')).toBeTruthy();
    expect(d.getByText('Pose et fixation')).toBeTruthy();
    await user.click(d.getByRole('button', { name: /Articles demandés \(2\)/ }));
    expect(d.getByText('Grillage rigide galvanisé 2m')).toBeTruthy();
    await user.click(d.getByRole('button', { name: /Ordres de mission \(1\)/ }));
    expect(d.getByText('OM-0001')).toBeTruthy();
    expect(d.getByText('Youssef El Amrani, Hamid Bouziane')).toBeTruthy();
  });

  it('export PDF du devis : injecte le document dans #print-area', async () => {
    await renderApp(<DevisPage />);
    const area = document.createElement('div'); area.id = 'print-area'; document.body.appendChild(area);
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    const user = userEvent.setup();
    const row = screen.getByText('02.190926').closest('tr')!;
    await user.click(within(row).getByRole('button', { name: 'PDF' }));
    expect(print).toHaveBeenCalled();
    expect(area.innerHTML).toContain('DEVIS');
    expect(area.innerHTML).toContain('N°02.190926');
    print.mockRestore();
  });

  it('onglet Demande d\'article : liste, nouvelle demande, pris, annulation', async () => {
    const { saved } = await renderApp(<DevisPage />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: "Demande d'article" }));
    expect(screen.getByText('Tube carré 40x40')).toBeTruthy();
    // tri : n° de ligne décroissant
    const lignes = Array.from(document.querySelectorAll('tbody tr')).map(tr => tr.querySelector('td')!.textContent);
    expect(lignes).toEqual(['3', '2', '1']);
    // marquer pris
    const row = screen.getByText('Tube carré 40x40').closest('tr')!;
    await user.click(within(row).getByRole('button', { name: 'Marquer pris' }));
    await user.click(within(dialog()).getByRole('button', { name: 'Confirmer' }));
    expect((await saved()).demandesArticles.find(a => a.id === 'art2')?.situation).toBe('Pris');
    // nouvelle demande
    await user.click(screen.getByRole('button', { name: /Ajouter$/ }));
    await user.click(within(dialog()).getAllByRole('button', { name: 'Choisir' })[0]);
    await user.type(within(dialog()).getByPlaceholderText('ex. Tube carré 40x40'), 'Cornière 30x30');
    await user.click(within(dialog()).getByRole('button', { name: 'Enregistrer' }));
    const st = await saved();
    expect(st.demandesArticles[0]).toMatchObject({ designation: 'Cornière 30x30', ligne: 4, situation: 'Demandé', quantite: 1 });
    // annulation
    const row2 = screen.getByText('Cornière 30x30').closest('tr')!;
    await user.click(within(row2).getByRole('button', { name: 'Annuler' }));
    expect((await saved()).demandesArticles[0].situation).toBe('Annulé');
  });

  it('profil Comptable : aucun accès aux devis, donc pas de bouton d\'ajout', async () => {
    const { actions } = await renderApp(<DevisPage />, { profil: 'Comptable' });
    expect(screen.queryByRole('button', { name: /Ajouter un devis/ })).toBeNull();
    expect(actions.textContent).toBe('');
  });

  it('profil en lecture seule sur les devis : liste visible, ni ajout ni modification', async () => {
    const droits = defaultDroits();
    droits['prf-comptable'].devis = { voir: true, modifier: false, supprimer: false };
    const { actions } = await renderApp(<DevisPage />, { profil: 'Comptable', state: { droits } });
    expect(screen.getByText('02.190926')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Ajouter un devis/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Modifier' })).toBeNull();
    expect(actions.textContent).toBe('');
    expect(screen.getAllByRole('button', { name: 'Détail' }).length).toBe(4);
    expect(screen.getAllByRole('button', { name: 'PDF' }).length).toBe(4);
    // double-clic : pas d'ouverture du formulaire
    const user = userEvent.setup();
    await user.dblClick(screen.getByText('02.190926'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('profil Commercial : peut ajouter un devis', async () => {
    await renderApp(<DevisPage />, { profil: 'Commercial' });
    expect(screen.getByRole('button', { name: /Ajouter un devis/ })).toBeTruthy();
  });
});

describe('CommandesPage', () => {
  it('liste les devis soldés ou facturés avec leur bon de commande', async () => {
    await renderApp(<CommandesPage />);
    expect(screen.getByText('Devis soldés')).toBeTruthy();
    expect(screen.getByText('BC-2026-014')).toBeTruthy();
    expect(screen.getByText('bc_anfa_015.pdf')).toBeTruthy();
    expect(screen.queryByText('02.190926')).toBeNull();               // « Créé » : pas encore une commande
  });

  it('solde un devis : BC, fichier (nom seulement), statut Soldée', async () => {
    const { saved } = await renderApp(<CommandesPage />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Solder un devis/ }));
    expect(within(dialog()).getByText('02.190926 — VMM')).toBeTruthy();
    await user.click(within(dialog()).getByRole('button', { name: 'Choisir' }));
    const d = within(dialog());
    expect(d.getByText('Solder le devis 02.190926')).toBeTruthy();
    // sans BC : refusé
    await user.click(d.getByRole('button', { name: 'Confirmer' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    await user.type(d.getByPlaceholderText('ex. BC-2026-020'), 'BC-2026-020');
    await user.upload(d.getByLabelText('Fichier joint'), new File(['x'], 'bc_vmm_020.pdf', { type: 'application/pdf' }));
    await user.clear(d.getByLabelText('Quantité ligne 1')); await user.type(d.getByLabelText('Quantité ligne 1'), '5');
    await user.click(d.getByRole('button', { name: 'Confirmer' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    const d1 = (await saved()).devis.find(x => x.id === 'd1')!;
    expect(d1.statut).toBe('Soldée');
    expect(d1.bc).toMatchObject({ numero: 'BC-2026-020', fichier: 'bc_vmm_020.pdf' });
    expect(d1.dateSoldee).toBe(d1.bc!.date);
    expect(d1.lignes[0].qte).toBe(5);
    expect(d1.lignes[0].designation).toBe('Confection les cadres fixés sur sol');
  });

  it('refuse une date de BC antérieure au devis', async () => {
    const { saved } = await renderApp(<CommandesPage />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Solder un devis/ }));
    await user.click(within(dialog()).getByRole('button', { name: 'Choisir' }));
    const d = within(dialog());
    await user.type(d.getByPlaceholderText('ex. BC-2026-020'), 'BC-X');
    await user.upload(d.getByLabelText('Fichier joint'), new File(['x'], 'a.pdf'));
    const date = dialog().querySelectorAll('input[type=date]')[1] as HTMLInputElement;   // date de BC (la 1re, celle du devis, est figée)
    await user.clear(date); await user.type(date, '2026-01-01');
    await user.click(d.getByRole('button', { name: 'Confirmer' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect((await saved()).devis.find(x => x.id === 'd1')!.statut).toBe('Créé');
  });

  it('profil Comptable (lecture seule) : pas de bouton « Solder un devis »', async () => {
    const { actions } = await renderApp(<CommandesPage />, { profil: 'Comptable' });
    expect(screen.getByText('BC-2026-014')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Solder un devis/ })).toBeNull();
    expect(actions.textContent).toBe('');
  });
});

describe('FacturationPage', () => {
  it('liste les factures avec échéance', async () => {
    await renderApp(<FacturationPage />);
    expect(screen.getByText('000000009')).toBeTruthy();
    expect(screen.getByText('21/09/2026')).toBeTruthy();                // 2026-06-23 + 90 jours
    expect(screen.queryByText('03.150726')).toBeNull();
  });

  it('facture un devis soldé (n° suivant, statut Facturé)', async () => {
    const { saved } = await renderApp(<FacturationPage />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Facturer un devis/ }));
    await user.click(within(dialog()).getByRole('button', { name: 'Choisir' }));
    const d = within(dialog());
    expect((dialog().querySelector('input[required]:not([type=date]):not([placeholder])') as HTMLInputElement).value).toBe('000000002');
    await user.click(d.getByRole('button', { name: 'Confirmer' }));
    const d3 = (await saved()).devis.find(x => x.id === 'd3')!;
    expect(d3.statut).toBe('Facturé');
    expect(d3.facture).toMatchObject({ numero: '000000002', modePaiement: 'Chèque', delai: '90 jours' });
    expect(d3.dateFacturee).toBe(d3.facture!.date);
  });

  it('refuse une facture antérieure au bon de commande', async () => {
    const { saved } = await renderApp(<FacturationPage />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Facturer un devis/ }));
    await user.click(within(dialog()).getByRole('button', { name: 'Choisir' }));
    const date = dialog().querySelector('input[type=date]') as HTMLInputElement;
    await user.clear(date); await user.type(date, '2026-01-01');
    await user.click(within(dialog()).getByRole('button', { name: 'Confirmer' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect((await saved()).devis.find(x => x.id === 'd3')!.statut).toBe('Soldée');
  });

  it('modifie une facture', async () => {
    const { saved } = await renderApp(<FacturationPage />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Modifier' }));
    const delai = within(dialog()).getByDisplayValue('90 jours');
    await user.clear(delai); await user.type(delai, '30 jours');
    // la facture ne peut pas précéder le BC (24/06) : la date de démonstration (23/06) doit être corrigée
    const date = dialog().querySelector('input[type=date]') as HTMLInputElement;
    await user.clear(date); await user.type(date, '2026-06-25');
    await user.click(within(dialog()).getByRole('button', { name: 'Enregistrer' }));
    expect((await saved()).devis.find(x => x.id === 'd2')!.facture?.delai).toBe('30 jours');
  });

  it('PDF facture', async () => {
    await renderApp(<FacturationPage />);
    const area = document.createElement('div'); area.id = 'print-area'; document.body.appendChild(area);
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    await userEvent.setup().click(screen.getByRole('button', { name: 'PDF' }));
    expect(area.innerHTML).toContain('Facture n° 000000009');
    expect(area.innerHTML).toContain('trois mille deux cents dirhams');
    print.mockRestore();
  });

  it('profil Commercial (lecture seule) : pas de création ni de modification', async () => {
    const { actions } = await renderApp(<FacturationPage />, { profil: 'Commercial' });
    expect(screen.getByText('000000009')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Modifier' })).toBeNull();
    expect(screen.getByRole('button', { name: 'PDF' })).toBeTruthy();
    expect(actions.textContent).toBe('');
  });
});
