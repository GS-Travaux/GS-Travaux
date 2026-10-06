/* Magasin de données de l'entreprise courante.
   Les pages lisent `state` et le modifient avec `update(draft => { ... })` (immer) : la modification
   est affichée immédiatement, puis enregistrée (différences par enregistrement) ; en cas d'échec,
   l'affichage revient à l'état du serveur et un message est affiché. */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { produce } from 'immer';
import type { Backend, Change } from './backend';
import { BackendError } from './backend';
import { RECORD_COLLECTIONS, SOCIETE_ID, type Droit, type Entreprise, type State, type Utilisateur } from '../lib/types';
import { droitsDe } from '../lib/rights';
import { toast } from '../ui/toast';

export function diffState(prev: State, next: State): Change[] {
  const out: Change[] = [];
  for (const c of RECORD_COLLECTIONS) {
    const a = (prev as any)[c] as { id: string }[], b = (next as any)[c] as { id: string }[];
    if (a === b) continue;
    const before = new Map(a.map(x => [x.id, x]));
    const seen = new Set<string>();
    for (const x of b) {
      seen.add(x.id);
      if (before.get(x.id) !== x) out.push({ collection: c, id: x.id, op: 'upsert', data: x });
    }
    for (const x of a) if (!seen.has(x.id)) out.push({ collection: c, id: x.id, op: 'delete' });
  }
  if (prev.societe !== next.societe) out.push({ collection: 'societe', id: SOCIETE_ID, op: 'upsert', data: next.societe });
  return out;
}

interface StoreCtx {
  state: State;
  company: Entreprise;
  me: Utilisateur;
  backend: Backend;
  /** Modifie l'état avec immer. Pour ajouter un enregistrement, utiliser unshift (le plus récent d'abord, comme après rechargement). */
  update: (fn: (draft: State) => void) => void;
  /** Recharge depuis le serveur (après une opération Sécurité par exemple). */
  reload: () => Promise<void>;
  /** Profil actuellement appliqué (aperçu d'un profil, sinon celui de l'utilisateur). */
  profilNom: string;
  previewProfil: string | null;
  setPreviewProfil: (nom: string | null) => void;
  rights: (key: string) => Droit;
  can: (key: string, right?: keyof Droit) => boolean;
  pendingSaves: number;
}
const Ctx = createContext<StoreCtx | null>(null);
export function useStore(): StoreCtx { const c = useContext(Ctx); if (!c) throw new Error('useStore hors StoreProvider'); return c; }
/** Droits (voir / modifier / supprimer) de l'utilisateur sur un onglet de droits (voir RIGHTS_TABS). */
export function useRights(key: string): Droit { return useStore().rights(key); }

export function StoreProvider({ backend, initial, onFatal, children }: {
  backend: Backend; initial: { state: State; company: Entreprise; me: Utilisateur };
  onFatal: (err: BackendError | Error) => void; children: ReactNode;
}) {
  const [state, setState] = useState<State>(initial.state);
  const [company, setCompany] = useState(initial.company);
  const [me, setMe] = useState(initial.me);
  const [previewProfil, setPreviewProfil] = useState<string | null>(null);
  const [pendingSaves, setPending] = useState(0);
  const stateRef = useRef(state); stateRef.current = state;
  const queue = useRef<Promise<void>>(Promise.resolve());
  const lastLoad = useRef(Date.now());

  const reload = useCallback(async () => {
    try {
      const d = await backend.load();
      lastLoad.current = Date.now();
      setState(d.state); setCompany(d.company); setMe(d.me);
    } catch (e: any) { onFatal(e); }
  }, [backend, onFatal]);

  const update = useCallback((fn: (draft: State) => void) => {
    const prev = stateRef.current;
    const next = produce(prev, fn);
    if (next === prev) return;
    stateRef.current = next;
    setState(next);
    const changes = diffState(prev, next);
    if (!changes.length) return;
    setPending(n => n + 1);
    queue.current = queue.current.then(async () => {
      try { await backend.save(changes); }
      catch (e: any) {
        toast(e?.message || 'Enregistrement impossible : la modification a été annulée.');
        if (e instanceof BackendError && e.code === 'licence') onFatal(e); else await reload();
      } finally { setPending(n => n - 1); }
    });
  }, [backend, reload, onFatal]);

  // Actualise les données quand l'onglet du navigateur redevient actif (autres utilisateurs de l'entreprise).
  useEffect(() => {
    const h = () => { if (document.visibilityState === 'visible' && Date.now() - lastLoad.current > 30000) void reload(); };
    document.addEventListener('visibilitychange', h);
    return () => document.removeEventListener('visibilitychange', h);
  }, [reload]);

  const profilNom = previewProfil ?? me.profil;
  const rights = useCallback((key: string) => droitsDe(state.profils, state.droits, profilNom, key), [state.profils, state.droits, profilNom]);
  const can = useCallback((key: string, right: keyof Droit = 'voir') => rights(key)[right], [rights]);

  const value = useMemo<StoreCtx>(() => ({
    state, company, me, backend, update, reload, profilNom, previewProfil, setPreviewProfil, rights, can, pendingSaves,
  }), [state, company, me, backend, update, reload, profilNom, previewProfil, rights, can, pendingSaves]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
