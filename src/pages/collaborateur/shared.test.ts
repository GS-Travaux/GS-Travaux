import { describe, expect, it } from 'vitest';
import { joursEntre, salaireAffiche, soldePret } from './shared';

describe('collaborateur / shared', () => {
  it('salaire affiché selon le type de paie', () => {
    expect(salaireAffiche({ typePaie: 'Mensuel', salaireBase: 4500, tauxHoraire: 0 })).toMatch(/4\s?500,00 DH\/mois/);
    expect(salaireAffiche({ typePaie: 'Journalier', salaireJournalier: 180, salaireBase: 3200, tauxHoraire: 0 })).toMatch(/180,00 DH\/jour/);
    expect(salaireAffiche({ typePaie: 'Horaire', tauxHoraire: 25.5, salaireBase: 0 })).toMatch(/25,50 DH\/h/);
  });
  it('jours entre deux dates (inclusif, minimum 1)', () => {
    expect(joursEntre('2026-08-10', '2026-08-16')).toBe(7);
    expect(joursEntre('2026-09-05', '2026-09-05')).toBe(1);
    expect(joursEntre('2026-09-05', '2026-09-01')).toBe(1);
  });
  it('solde du prêt', () => {
    expect(soldePret(5000, 3125)).toBe(1875);
    expect(soldePret(100, 150)).toBe(0);
    expect(soldePret('', '')).toBe(0);
  });
});
