// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { renderApp } from '../../test/harness';
import DashboardPage from './DashboardPage';

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-06T10:00:00Z')); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

const sections = () => screen.queryAllByRole('heading', { level: 2 }).filter(h => h.classList.contains('dash-section')).map(h => h.textContent);

describe('DashboardPage — Administrateur', () => {
  it('affiche toutes les sections', async () => {
    await renderApp(<DashboardPage />);
    expect(sections()).toEqual([
      'Activité commerciale', 'Trésorerie', 'Chantiers', "Charges d'exploitation", 'Personnel & cotisations sociales',
      'Impôts et taxes', 'Impôt libératoire — année 2026', 'Immobilisations (situation à ce jour)',
    ]);
    expect(screen.getByText('Tableau de trésorerie')).toBeTruthy();
    expect(screen.getByText('Marge sur achats directs')).toBeTruthy();
    expect(screen.getByText('Échéances véhicules à surveiller')).toBeTruthy();
    expect(screen.getByRole('heading', { name: /^Seuil de .*DH par client$/ })).toBeTruthy();
    expect(screen.getByText('Top clients (CA facturé)')).toBeTruthy();
  });
  it('calcule les indicateurs de la démonstration', async () => {
    await renderApp(<DashboardPage />);
    const kpi = (label: string) => screen.getByText(label).closest('.kpi-card') as HTMLElement;
    expect(within(kpi('CA facturé')).getByText('3 200,00 DH')).toBeTruthy();
    expect(within(kpi('CA soldé (à facturer)')).getByText('4 500,00 DH')).toBeTruthy();
    expect(within(kpi('CA en devis')).getByText('4 800,00 DH')).toBeTruthy();
    expect(within(kpi('Impôts et taxes à payer')).getByText(/4 800,00 DH/)).toBeTruthy();
  });
  it('les filtres Année / Client recalculent', async () => {
    await renderApp(<DashboardPage />);
    fireEvent.change(screen.getByLabelText('Client'), { target: { value: 'SOMAPRO' } });
    const kpi = screen.getByText('CA facturé').closest('.kpi-card') as HTMLElement;
    expect(within(kpi).getByText('0,00 DH')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Client'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Année'), { target: { value: '2026' } });
    fireEvent.change(screen.getByLabelText('Mois'), { target: { value: '01' } });
    expect(screen.queryAllByText('Aucune facture pour l\'instant.').length).toBe(1);
  });
  it("sans impôt libératoire hors statut auto-entrepreneur", async () => {
    const { seedState } = await import('../../data/seed');
    await renderApp(<DashboardPage />, { state: { societe: { ...seedState().societe, statutJuridique: 'SARL' } } });
    expect(sections().some(s => s!.startsWith('Impôt libératoire'))).toBe(false);
    expect(sections()).toContain('Impôts et taxes');
  });
});

describe('DashboardPage — droits de lecture', () => {
  it('Commercial : ni paie, ni charges, ni immobilisations, ni impôts', async () => {
    await renderApp(<DashboardPage />, { profil: 'Commercial' });
    const s = sections();
    expect(s).toContain('Activité commerciale'); expect(s).toContain('Chantiers');
    expect(s).not.toContain("Charges d'exploitation");
    expect(s).not.toContain('Impôts et taxes');
    expect(s.some(x => x!.startsWith('Immobilisations'))).toBe(false);
    expect(screen.queryByText('Masse salariale')).toBeNull();
    expect(screen.queryByText('CNSS à payer')).toBeNull();
    expect(screen.queryByText('Coût employeur')).toBeNull();
    expect(screen.queryByText('Pointage par situation')).toBeNull();
    // trésorerie : seule la colonne des encaissements est lisible
    expect(screen.getByText('Encaissements')).toBeTruthy();
    expect(screen.queryByText('Salaires')).toBeNull(); expect(screen.queryByText('Achats payés')).toBeNull(); expect(screen.queryByText('Impôts payés')).toBeNull();
    expect(screen.getByText(/Certaines colonnes ne sont pas accessibles/)).toBeTruthy();
  });
  it('Comptable : pas de chantiers, mais charges, paie, impôts et immobilisations', async () => {
    await renderApp(<DashboardPage />, { profil: 'Comptable' });
    const s = sections();
    expect(s).not.toContain('Chantiers');
    expect(s).toContain("Charges d'exploitation"); expect(s).toContain('Personnel & cotisations sociales'); expect(s).toContain('Impôts et taxes');
    expect(screen.getByText('Masse salariale')).toBeTruthy();
    expect(screen.getByText('CNSS à payer')).toBeTruthy();
    expect(screen.queryByText('Pointage par situation')).not.toBeNull();   // collab_paie lit les pointages
  });
  it("profil sans aucun droit de lecture : message d'état vide, pas de zéros", async () => {
    await renderApp(<DashboardPage />, { profil: 'Commercial', state: { droits: { 'prf-commercial': {} } } });
    expect(screen.getByText(/Aucune donnée n'est accessible avec votre profil/)).toBeTruthy();
    expect(sections()).toEqual([]);
    expect(screen.queryByText('CA facturé')).toBeNull();
    expect(screen.queryByLabelText('Année')).toBeNull();
  });
});
