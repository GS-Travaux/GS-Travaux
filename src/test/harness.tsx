/* Outil de test : affiche une page dans l'application (magasin + fenêtres modales + barre d'actions)
   avec le backend local en mémoire. Utiliser avec  // @vitest-environment jsdom  en tête de fichier de test. */
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { LocalBackend, normalizeState } from '../data/localBackend';
import { memoryStorage } from '../data/localBackend';
import { StoreProvider } from '../data/store';
import { UIProvider } from '../ui/UIProvider';
import { PageActionsTarget } from '../ui/misc';
import { seedState, emptyState } from '../data/seed';
import type { State } from '../lib/types';

export interface HarnessOpts {
  /** Nom du profil appliqué (défaut « Administrateur » = tous les droits). */
  profil?: string;
  /** Remplace des collections de l'état de démonstration. */
  state?: Partial<State>;
  /** true : part d'une entreprise vide plutôt que des données de démonstration. */
  empty?: boolean;
}
export async function renderApp(ui: ReactElement, opts: HarnessOpts = {}) {
  const storage = memoryStorage();
  const base = opts.empty ? emptyState('Test SARL') : seedState();
  const state = normalizeState({ ...base, ...(opts.state || {}) });
  if (opts.empty && !state.utilisateurs.length) state.utilisateurs = [{ id: 'u1', nom: 'Admin', email: 'a@b.c', profilId: 'prf-admin', profil: 'Administrateur', actif: true }];
  storage.setItem('gs-travaux-local-v2', JSON.stringify({ state, meId: 'u1' }));
  const backend = new LocalBackend(storage);
  const loaded = await backend.load();
  const prof = loaded.state.profils.find(p => p.nom === (opts.profil || 'Administrateur'))!;
  const me = { ...loaded.me, profil: prof.nom, profilId: prof.id };
  const actions = document.createElement('div'); document.body.appendChild(actions);
  const utils = render(
    <StoreProvider backend={backend} initial={{ ...loaded, me }} onFatal={e => { throw e; }}>
      <UIProvider>
        <PageActionsTarget.Provider value={actions}>{ui}</PageActionsTarget.Provider>
      </UIProvider>
    </StoreProvider>);
  /** Données telles qu'enregistrées par le backend (attend la fin des enregistrements en cours). */
  const saved = async () => { await new Promise(r => setTimeout(r, 0)); return (await backend.load()).state; };
  return { ...utils, backend, actions, saved };
}
