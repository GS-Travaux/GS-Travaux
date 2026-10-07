import { describe, expect, it } from 'vitest';
import { seedState } from '../../data/seed';
import { clientHistorique, fournisseurHistorique, nextTiersId } from './tiers';

describe('tiers', () => {
  const s = seedState();
  it('nextTiersId', () => {
    expect(nextTiersId('CL', [])).toBe('CL-0001');
    expect(nextTiersId('CL', s.clients)).toBe('CL-0004');
    expect(nextTiersId('FL', s.fournisseurs)).toBe('FL-0003');
  });
  it('historique client : devis du client, plus récent en premier, avec total', () => {
    const h = clientHistorique(s.devis, 'VMM');
    expect(h.map(x => x.label)).toEqual([
      'Devis 02.190926 — Divers travaux au niveau de végétale',
      'Devis 01.230626 — Installation grillage rigide pour citernes',
    ]);
    expect(h[0].montant).toBe(4800);
    expect(h[1].statut).toBe('Facturé');
    expect(h[1].badge).toBe('badge-facture');
    expect(clientHistorique(s.devis, 'Inconnu')).toEqual([]);
  });
  it('historique fournisseur : immobilisations et achats, plus récent en premier', () => {
    const h = fournisseurHistorique('FL-0001', s.immobilisations, s.achats);
    expect(h[0]).toMatchObject({ statut: 'Achat', date: '2026-09-20', montant: 20 * 38 * 1.2 });
    expect(h.some(x => x.statut === 'Immobilisation' && x.label === 'MT-0001 — Camionnette Renault Master plateau' && x.montant === 245000)).toBe(true);
    const dates = h.map(x => x.date);
    expect([...dates].sort().reverse()).toEqual(dates);
  });
});
