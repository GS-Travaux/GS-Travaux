/* Espace propriétaire : connexion (e-mail + mot de passe vérifiés par le serveur) puis console. */
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { getOwnerBackend, type OwnerBackend } from '../data/ownerBackend';
import OwnerConsole from './OwnerConsole';

const IDLE_MS = 15 * 60 * 1000;
type View = { k: 'boot' } | { k: 'login'; msg: string } | { k: 'console' };

export default function OwnerGate({ onExit, backend: injected }: { onExit: () => void; backend?: OwnerBackend }) {
  const backend = injected || getOwnerBackend();
  const [view, setView] = useState<View>({ k: 'boot' });
  const last = useRef(Date.now());

  useEffect(() => {
    let alive = true;
    backend.hasSession().then(ok => { if (alive) setView(ok ? { k: 'console' } : { k: 'login', msg: '' }); })
      .catch(() => { if (alive) setView({ k: 'login', msg: '' }); });
    return () => { alive = false; };
  }, [backend]);

  const logout = useCallback(async (msg = '') => {
    try { await backend.logout(); } catch { /* déjà déconnecté */ }
    setView({ k: 'login', msg });
  }, [backend]);
  /** « Retour à l'application » : la session propriétaire est fermée avant de revenir à l'écran de connexion. */
  const leave = useCallback(async () => {
    try { await backend.logout(); } catch { /* déjà déconnecté */ }
    onExit();
  }, [backend, onExit]);

  // Fermeture de la session après 15 minutes d'inactivité.
  useEffect(() => {
    if (view.k !== 'console') return;
    last.current = Date.now();
    const touch = () => { last.current = Date.now(); };
    const ev = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    ev.forEach(e => window.addEventListener(e, touch, { passive: true }));
    const t = window.setInterval(() => { if (Date.now() - last.current > IDLE_MS) void logout('Session fermée après 15 minutes d’inactivité.'); }, 15000);
    return () => { ev.forEach(e => window.removeEventListener(e, touch)); window.clearInterval(t); };
  }, [view.k, logout]);

  if (view.k === 'boot') return <div className="auth-screen" style={{ display: 'flex' }}><div className="auth-sub">Chargement…</div></div>;
  if (view.k === 'login') return <OwnerLogin backend={backend} message={view.msg} onExit={onExit} onLogged={() => setView({ k: 'console' })} />;
  return <OwnerConsole backend={backend} onExit={leave} onLogout={logout} />;
}

function OwnerLogin({ backend, message, onExit, onLogged }: { backend: OwnerBackend; message: string; onExit: () => void; onLogged: () => void }) {
  const [email, setEmail] = useState(''); const [pwd, setPwd] = useState('');
  const [err, setErr] = useState(message); const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault(); setErr(''); setBusy(true);
    try { await backend.login(email.trim(), pwd); onLogged(); }
    catch (ex: any) { setPwd(''); setErr(ex?.message || 'Connexion impossible.'); }
    finally { setBusy(false); }
  }
  return (
    <div className="auth-screen" style={{ display: 'flex' }}>
      <div className="auth-card">
        <div className="auth-brand"><span className="brand-mark">GT</span> GS-Travaux</div>
        <h1>Espace propriétaire</h1>
        <p className="auth-sub">Réservé à l’éditeur de l’application : entreprises clientes, licences et paiements.</p>
        {err && <div className="auth-msg" role="alert">{err}</div>}
        <form onSubmit={submit}>
          <div className="field"><label htmlFor="ow-email">Adresse e-mail du propriétaire</label>
            <input id="ow-email" type="email" autoComplete="username" required autoFocus value={email} onChange={e => setEmail(e.target.value)} /></div>
          <div className="field"><label htmlFor="ow-pwd">Mot de passe</label>
            <input id="ow-pwd" type="password" autoComplete="current-password" required value={pwd} onChange={e => setPwd(e.target.value)} /></div>
          {backend.demoPassword && <div className="hint">Mode démonstration (aucune sécurité, données d’exemple dans ce navigateur) — mot de passe : <strong className="mono">{backend.demoPassword}</strong></div>}
          <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={busy}>{busy ? '…' : 'Se connecter'}</button>
        </form>
        <div className="auth-links"><a onClick={onExit}>← Retour à l’application</a></div>
      </div>
    </div>
  );
}
