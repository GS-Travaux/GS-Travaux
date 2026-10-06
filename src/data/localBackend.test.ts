import { describe, expect, it } from 'vitest';
import { LocalBackend, normalizeState } from './localBackend';
import { memoryStorage } from './localBackend';
import { RECORD_COLLECTIONS } from '../lib/types';
import { diffState } from './store';
import { produce } from 'immer';

describe('LocalBackend', () => {
  it('un premier lancement fournit toutes les collections (régression : le tableau de bord plantait)', async () => {
    const b = new LocalBackend(memoryStorage());
    const { state } = await b.load();
    for (const c of RECORD_COLLECTIONS) expect(Array.isArray((state as any)[c]), c).toBe(true);
    expect(state.societe.nom).toBeTruthy();
  });
  it('des données anciennes incomplètes sont complétées', () => {
    const s = normalizeState({ devis: [] });
    for (const c of RECORD_COLLECTIONS) expect(Array.isArray((s as any)[c]), c).toBe(true);
    expect(s.profils.length).toBeGreaterThan(0);
  });
  it('enregistre créations, modifications et suppressions', async () => {
    const st = memoryStorage(); const b = new LocalBackend(st);
    const { state } = await b.load();
    const next = produce(state, d => { d.clients.unshift({ id: 'CL-9', nom: 'Z', ice: '1', adresse: 'a' }); d.clients = d.clients.filter(c => c.id !== 'CL-0001'); d.societe.nom = 'Nouvelle'; });
    const changes = diffState(state, next);
    expect(changes.map(c => `${c.collection}:${c.op}:${c.id}`).sort()).toEqual(['clients:delete:CL-0001', 'clients:upsert:CL-9', 'societe:upsert:main']);
    await b.save(changes);
    const again = (await new LocalBackend(st).load()).state;
    expect(again.clients[0].id).toBe('CL-9'); expect(again.clients.some(c => c.id === 'CL-0001')).toBe(false); expect(again.societe.nom).toBe('Nouvelle');
  });
  it('diffState : aucun changement → aucune écriture', async () => {
    const { state } = await new LocalBackend(memoryStorage()).load();
    expect(diffState(state, produce(state, () => {}))).toEqual([]);
  });
});
