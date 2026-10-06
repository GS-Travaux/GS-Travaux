// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { UIProvider } from '../ui/UIProvider';
import { DEMO_OWNER_PASSWORD, LocalOwnerBackend } from '../data/ownerBackend';
import { memoryStorage } from '../data/localBackend';
import { addMois, fmtDate, todayIso } from '../lib/format';
import { etatEntreprise } from '../lib/licence';
import OwnerGate from './OwnerGate';
import { paiementPeriode, companyIssue, tarifsIssue } from './rules';

let backend: LocalOwnerBackend; let onExit: ReturnType<typeof vi.fn>;
beforeEach(() => { backend = new LocalOwnerBackend(memoryStorage(), memoryStorage()); onExit = vi.fn(); });
afterEach(cleanup);
const mount = () => render(<UIProvider><OwnerGate onExit={onExit} backend={backend} /></UIProvider>);
const fill = (label: string | RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const dialog = () => within(screen.getByRole('dialog'));
const row = (code: string) => screen.getByText(code, { selector: 'td' }).closest('tr')!;
async function login() {
  mount();
  await screen.findByLabelText(/Adresse e-mail/);
  fill(/Adresse e-mail/, 'moi@exemple.ma'); fill('Mot de passe', DEMO_OWNER_PASSWORD);
  fireEvent.click(screen.getByRole('button', { name: 'Se connecter' }));
  await screen.findByText('Vue d’ensemble');
}
const company = async (code: string) => (await backend.list()).entreprises.find(e => e.code === code)!;

describe('règles (pures)', () => {
  it('période payée : prolonge l’échéance en cours, sinon repart de la date du paiement', () => {
    expect(paiementPeriode({ licence: 'Mensuelle', echeance: '2026-11-15' }, '2026-10-06', 2)).toEqual({ du: '2026-11-15', au: '2027-01-15' });
    expect(paiementPeriode({ licence: 'Annuelle', echeance: '2026-08-31' }, '2026-10-06', 1)).toEqual({ du: '2026-10-06', au: '2027-10-06' });
    expect(paiementPeriode({ licence: 'Mensuelle', echeance: '' }, '2026-01-31', 1)).toEqual({ du: '2026-01-31', au: '2026-02-28' });
  });
  it('validations', () => {
    const c = { code: 'AB-1', nom: 'N', contact: 'C', email: 'a@b.ma', telephone: '05', interne: false, licence: 'Mensuelle' as const, prix: 10, debut: '2026-01-01' };
    expect(companyIssue(c)).toBe('');
    expect(companyIssue({ ...c, code: 'a b' })).toMatch(/Code société/);
    expect(companyIssue({ ...c, prix: 0 })).toMatch(/supérieur à 0/);
    expect(companyIssue({ ...c, prix: 0, interne: true })).toBe('');
    expect(tarifsIssue({ mensuel: 1, annuel: 1, essaiJours: 91 })).toMatch(/0 et 90/);
  });
});

describe('espace propriétaire (mode démo)', () => {
  it('demande une connexion ; mauvais mot de passe refusé ; retour à l’application', async () => {
    mount();
    expect(await screen.findByText('Espace propriétaire')).toBeTruthy();
    expect(screen.getByText(DEMO_OWNER_PASSWORD)).toBeTruthy();
    fill(/Adresse e-mail/, 'moi@exemple.ma'); fill('Mot de passe', 'faux');
    fireEvent.click(screen.getByRole('button', { name: 'Se connecter' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Identifiants incorrects.');
    expect(screen.queryByText('Vue d’ensemble')).toBeNull();
    fireEvent.click(screen.getByText(/Retour à l’application/));
    expect(onExit).toHaveBeenCalled();
  });

  it('affiche les indicateurs, les alertes et la liste ; filtres et tri', async () => {
    await login();
    expect(screen.getByText('Entreprises clientes').parentElement!.textContent).toContain('4');
    expect(screen.getByText(/Essai : se termine dans 5 j/)).toBeTruthy();
    const codes = () => screen.getAllByRole('row').map(r => r.querySelector('td.mono')?.textContent).filter(Boolean);
    expect(codes()).toHaveLength(5);
    expect(codes()[codes().length - 1]).toBe('DEMO');                      // tri par échéance : le compte interne en dernier
    expect(within(row('DEMO')).getByText('Gratuite')).toBeTruthy();
    expect(within(row('DEMO')).queryByRole('button', { name: 'Paiement' })).toBeNull();
    expect(within(row('SOMATEC-04')).getByText('Impayé')).toBeTruthy();

    fill('Recherche', 'nadia');
    expect(codes()).toEqual(['METALPRO-02']);
    fill('Recherche', '');
    fireEvent.change(screen.getByLabelText('État'), { target: { value: 'Suspendue' } });
    expect(codes()).toEqual(['SOMATEC-04']);
    fireEvent.change(screen.getByLabelText('État'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Licence'), { target: { value: 'Annuelle' } });
    expect(codes().sort()).toEqual(['DEMO', 'METALPRO-02']);
    fireEvent.change(screen.getByLabelText('Licence'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Trier par'), { target: { value: 'prix' } });
    expect(codes()[0]).toBe('METALPRO-02');
    fireEvent.change(screen.getByLabelText('État'), { target: { value: 'Essai expiré' } });
    expect(screen.getByText('Aucune entreprise ne correspond aux filtres.')).toBeTruthy();
  });

  it('ajoute une entreprise (tarif proposé selon la licence, essai, compte administrateur)', async () => {
    await login();
    fireEvent.click(screen.getByRole('button', { name: /Ajouter une entreprise/ }));
    expect((screen.getByLabelText('Prix par période (DH)') as HTMLInputElement).value).toBe('2000');
    fireEvent.change(dialog().getByLabelText('Licence'), { target: { value: 'Annuelle' } });
    expect((screen.getByLabelText('Prix par période (DH)') as HTMLInputElement).value).toBe('24000');
    fill('Code société', 'ATLAS-01'); fill('Nom de l’entreprise', 'Fer & Co'); fill('Contact', 'Ali'); fill('Téléphone', '0600000000'); fill('E-mail', 'ali@fer.example');
    fill('Nom de l’administrateur', 'Ali B.'); fill('E-mail de connexion', 'ali@fer.example'); fill('Mot de passe initial', 'Bienvenue2026');
    fireEvent.click(dialog().getByRole('button', { name: 'Enregistrer' }));           // code déjà pris
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Ce code société existe déjà.'));
    fill('Code société', 'FER-05');
    fireEvent.click(dialog().getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(within(row('FER-05')).getByText('Essai')).toBeTruthy());
    const e = await company('FER-05');
    expect(e).toMatchObject({ licence: 'Annuelle', prix: 24000, debut: todayIso(), echeance: '', suspendu: false, interne: false });
    expect(etatEntreprise(e)).toBe('Essai');
    expect(JSON.stringify(e)).not.toContain('Bienvenue2026');
  });

  it('enregistre un paiement : montant recalculé, nouvelle échéance, historique', async () => {
    await login();
    const avant = await company('ATLAS-01');
    fireEvent.click(within(row('ATLAS-01')).getByRole('button', { name: 'Paiement' }));
    fill(/Nombre de périodes/, '3');
    expect((screen.getByLabelText('Montant (DH)') as HTMLInputElement).value).toBe('6000');
    const attendu = addMois(avant.echeance, 3);
    expect(screen.getByText(`Nouvelle échéance : ${fmtDate(attendu)}`)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Mode de paiement'), { target: { value: 'Chèque' } });
    fireEvent.click(dialog().getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const apres = await company('ATLAS-01');
    expect(apres.echeance).toBe(attendu);
    expect(apres.paiements).toHaveLength(5);
    expect(apres.paiements[4]).toMatchObject({ montant: 6000, periodes: 3, mode: 'Chèque', du: avant.echeance, au: attendu, date: todayIso() });
    await waitFor(() => expect(within(row('ATLAS-01')).getByText(fmtDate(attendu))).toBeTruthy());

    fireEvent.click(within(row('ATLAS-01')).getByRole('button', { name: 'Détail' }));
    expect(dialog().getByText('Total encaissé')).toBeTruthy();
    expect(dialog().getAllByRole('row')).toHaveLength(1 + 5 + 1);
    fireEvent.change(dialog().getByLabelText('Notes internes'), { target: { value: 'Client fidèle' } });
    fireEvent.click(dialog().getByRole('button', { name: 'Enregistrer la note' }));
    await waitFor(async () => expect((await company('ATLAS-01')).notes).toBe('Client fidèle'));
  });

  it('un premier paiement met fin à l’essai', async () => {
    await login();
    fireEvent.click(within(row('NORD-03')).getByRole('button', { name: 'Paiement' }));
    fireEvent.click(dialog().getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(within(row('NORD-03')).getByText('Active')).toBeTruthy());
    expect((await company('NORD-03')).echeance).toBe(addMois(todayIso(), 1));
  });

  it('suspend (motif obligatoire) puis réactive', async () => {
    await login();
    fireEvent.click(within(row('ATLAS-01')).getByRole('button', { name: 'Suspendre' }));
    fireEvent.click(dialog().getByRole('button', { name: 'Suspendre' }));
    expect((await company('ATLAS-01')).suspendu).toBe(false);
    fill('Motif de la suspension', 'Demande du client');
    fireEvent.click(dialog().getByRole('button', { name: 'Suspendre' }));
    await waitFor(() => expect(within(row('ATLAS-01')).getByText('Suspendue')).toBeTruthy());
    expect(await company('ATLAS-01')).toMatchObject({ suspendu: true, motifSuspension: 'Demande du client' });
    fireEvent.click(within(row('ATLAS-01')).getByRole('button', { name: 'Réactiver' }));
    await waitFor(() => expect(within(row('ATLAS-01')).getByText('Active')).toBeTruthy());
    expect(await company('ATLAS-01')).toMatchObject({ suspendu: false, motifSuspension: '' });
  });

  it('modifie une entreprise ; un compte passé en interne devient gratuit', async () => {
    await login();
    fireEvent.click(within(row('NORD-03')).getByRole('button', { name: 'Modifier' }));
    expect(dialog().queryByLabelText('Mot de passe initial')).toBeNull();
    fill('Contact', 'Karim T.');
    fireEvent.change(screen.getByLabelText('Facturation'), { target: { value: 'interne' } });
    fireEvent.click(dialog().getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(within(row('NORD-03')).getByText('Interne')).toBeTruthy());
    expect(await company('NORD-03')).toMatchObject({ contact: 'Karim T.', interne: true, prix: 0, essaiFin: '', echeance: '' });
  });

  it('tarifs : validation puis enregistrement', async () => {
    await login();
    fireEvent.click(screen.getByRole('button', { name: 'Tarifs' }));
    fill('Licence mensuelle (DH)', '2500'); fill(/Durée de la période d’essai/, '120');
    fireEvent.click(dialog().getByRole('button', { name: 'Enregistrer' }));
    expect((await backend.list()).tarifs.tarifs.Mensuelle).toBe(2000);
    fill(/Durée de la période d’essai/, '30');
    fireEvent.click(dialog().getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect((await backend.list()).tarifs).toEqual({ tarifs: { Mensuelle: 2500, Annuelle: 24000 }, essaiJours: 30 });
    await waitFor(() => expect(screen.getByText('Durée d’essai : 30 jours')).toBeTruthy());
  });

  it('suppression : le code société doit être ressaisi', async () => {
    await login();
    fireEvent.click(within(row('SOMATEC-04')).getByRole('button', { name: 'Supprimer' }));
    const btn = dialog().getByRole('button', { name: 'Supprimer' }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fill(/Pour confirmer/, 'somatec-04');
    expect(btn.disabled).toBe(true);
    fill(/Pour confirmer/, 'SOMATEC-04');
    fireEvent.click(btn);
    await waitFor(() => expect(screen.queryByText('SOMATEC-04', { selector: 'td' })).toBeNull());
    expect((await backend.list()).entreprises).toHaveLength(4);
    await expect(backend.deleteCompany((await company('ATLAS-01')).id, 'x')).rejects.toThrow(/Confirmation/);
  });

  it('déconnexion et « Retour à l’application » ferment la session propriétaire', async () => {
    await login();
    expect(await backend.hasSession()).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Se déconnecter' }));
    await screen.findByRole('button', { name: 'Se connecter' });
    expect(await backend.hasSession()).toBe(false);
    cleanup();
    await login();
    fireEvent.click(screen.getByRole('button', { name: 'Retour à l’application' }));
    await waitFor(() => expect(onExit).toHaveBeenCalled());
    expect(await backend.hasSession()).toBe(false);
  });
});
