import { describe, expect, it } from 'vitest';
import { devisTotal } from '../../lib/devis';
import { fromDraftLignes, lignesTotal, newDraftLigne, nextArticleLigne, nextDevisNumero, nextFactureNumero, toDraftLignes } from './devisLogic';
import { nextMissionId } from '../mission/missionLogic';

const dv = (id: string, numero: string, facture: any = null) => ({ id, numero, facture });

describe('nextDevisNumero', () => {
  it('commence à 0001 pour une nouvelle année', () => {
    expect(nextDevisNumero([dv('a', 'DV_25_0007')], '2026-03-01')).toBe('DV_26_0001');
  });
  it('prend le maximum de l\'année + 1 (ignore les anciens formats)', () => {
    expect(nextDevisNumero([dv('a', 'DV_26_0002'), dv('b', 'DV_26_0010'), dv('c', '02.190926'), dv('d', 'DV_25_0099')], '2026-09-19')).toBe('DV_26_0011');
  });
  it('ignore le devis exclu (changement de date d\'un devis en cours de création)', () => {
    expect(nextDevisNumero([dv('a', 'DV_26_0001'), dv('b', 'DV_26_0002')], '2026-01-01', 'b')).toBe('DV_26_0002');
  });
  it('utilise l\'année courante sans date', () => {
    const yy = String(new Date().getFullYear()).slice(-2);
    expect(nextDevisNumero([], undefined)).toBe(`DV_${yy}_0001`);
  });
});

describe('autres numéros', () => {
  it('ligne de demande d\'article', () => {
    expect(nextArticleLigne([])).toBe(1);
    expect(nextArticleLigne([{ ligne: 3 }, { ligne: 1 }])).toBe(4);
  });
  it('n° de facture sur 9 chiffres', () => {
    expect(nextFactureNumero([dv('a', 'x'), dv('b', 'y', {}), dv('c', 'z', {})])).toBe('000000003');
  });
  it('ordre de mission', () => {
    expect(nextMissionId([])).toBe('OM-0001');
    expect(nextMissionId([{ id: 'OM-0002' }, { id: 'OM-0010' }])).toBe('OM-0011');
  });
});

describe('lignes de devis', () => {
  it('totaux (texte → nombres, valeurs invalides = 0)', () => {
    expect(lignesTotal([{ qte: '4', pu: '600' }, { qte: '', pu: '12.5' }, { qte: '2', pu: '1.25' }])).toBe(2402.5);
    const lignes = [{ designation: 'A', qte: 4, pu: 600, matiere: 'avec' as const, taches: ['t'] }, { designation: 'B', qte: 2, pu: 100, matiere: 'sans' as const, taches: [] }];
    expect(lignesTotal(toDraftLignes(lignes))).toBe(devisTotal({ lignes }));
  });
  it('aller-retour brouillon', () => {
    const l = [{ designation: 'A', qte: 4, pu: 600.5, matiere: 'avec' as const, taches: ['x', 'y'] }];
    expect(fromDraftLignes(toDraftLignes(l))).toEqual(l);
    expect(toDraftLignes([{ designation: 'A', qte: 1, pu: 1 } as any])[0]).toMatchObject({ matiere: 'sans', taches: [] });
    expect(newDraftLigne()).toEqual({ designation: '', qte: '1', pu: '0', matiere: 'sans', taches: [] });
  });
});
