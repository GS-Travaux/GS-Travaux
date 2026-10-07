import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { getBackend, type AuthStatus, type LoadedData } from './data';
import { StoreProvider } from './data/store';
import { UIProvider } from './ui/UIProvider';
import { BlockedScreen, LoadingScreen, LoginScreen, SetPasswordScreen } from './auth/AuthScreens';
import { Shell } from './Shell';
import { licenceBlocage } from './lib/licence';

const OwnerGate = lazy(() => import('./owner/OwnerGate'));
const IDLE_MS = 15 * 60 * 1000;

type View =
  | { k: 'boot' } | { k: 'login'; msg?: string } | { k: 'recovery' }
  | { k: 'loading' } | { k: 'app'; data: LoadedData } | { k: 'blocked'; title: string; msg: string; retry?: boolean };

export default function App() {
  const backend = getBackend();
  const [view, setView] = useState<View>({ k: 'boot' });
  const [ownerRoute, setOwnerRoute] = useState(location.hash === '#/owner');
  const last = useRef(Date.now());

  useEffect(() => { const h = () => setOwnerRoute(location.hash === '#/owner'); window.addEventListener('hashchange', h); return () => window.removeEventListener('hashchange', h); }, []);

  const enter = useCallback(async (s: AuthStatus) => {
    if (s.status === 'signed_out') return setView({ k: 'login' });
    if (s.status === 'recovery') return setView({ k: 'recovery' });
    if (s.role === 'owner') { location.hash = '#/owner'; return; }
    setView({ k: 'loading' });
    try {
      const data = await backend.load();
      const b = licenceBlocage(data.company);
      if (b) return setView({ k: 'blocked', title: 'Accès indisponible', msg: b });
      setView({ k: 'app', data });
    } catch (e: any) {
      setView({ k: 'blocked', title: e.code === 'licence' ? 'Accès indisponible' : 'Chargement impossible', msg: e.message || 'Erreur inconnue.', retry: e.code === 'db' });
    }
  }, [backend]);

  useEffect(() => {
    backend.init().then(enter).catch(() => setView({ k: 'login' }));
    return backend.onAuthEvent(ev => {
      if (ev === 'PASSWORD_RECOVERY') setView({ k: 'recovery' });
      else if (ev === 'SIGNED_OUT') setView({ k: 'login' });
    });
  }, [backend, enter]);

  const logout = useCallback(async (msg?: string) => { await backend.signOut(); setView({ k: 'login', msg }); }, [backend]);
  const fatal = useCallback((e: Error & { code?: string }) => {
    setView({ k: 'blocked', title: e.code === 'licence' ? 'Accès indisponible' : 'Erreur', msg: e.message, retry: false });
  }, []);

  // Verrouillage après 15 minutes d'inactivité (mode en ligne uniquement).
  useEffect(() => {
    if (backend.mode !== 'supabase' || view.k !== 'app') return;
    const touch = () => { last.current = Date.now(); };
    const ev = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    ev.forEach(e => window.addEventListener(e, touch, { passive: true }));
    const t = window.setInterval(() => { if (Date.now() - last.current > IDLE_MS) void logout('Session fermée après 15 minutes d’inactivité.'); }, 15000);
    return () => { ev.forEach(e => window.removeEventListener(e, touch)); window.clearInterval(t); };
  }, [backend, view.k, logout]);

  if (ownerRoute) {
    return <UIProvider><Suspense fallback={<LoadingScreen />}>
      <OwnerGate onExit={() => { location.hash = ''; backend.init().then(enter); }} />
    </Suspense></UIProvider>;
  }
  switch (view.k) {
    case 'boot': case 'loading': return <LoadingScreen />;
    case 'login': return <LoginScreen backend={backend} message={view.msg} onSignedIn={() => backend.init().then(enter)} />;
    case 'recovery': return <SetPasswordScreen backend={backend} onDone={() => { history.replaceState(null, '', location.pathname); backend.init().then(enter); }} />;
    case 'blocked': return <BlockedScreen title={view.title} message={view.msg} onLogout={() => logout()} onRetry={view.retry ? () => backend.init().then(enter) : undefined} />;
    case 'app':
      return (
        <StoreProvider backend={backend} initial={view.data} onFatal={fatal}>
          <UIProvider>
            <Shell onLogout={() => logout()} />
          </UIProvider>
        </StoreProvider>
      );
  }
}
