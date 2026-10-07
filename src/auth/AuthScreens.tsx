import { useState, type FormEvent, type ReactNode } from 'react';
import type { Backend } from '../data/backend';

function Shell({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <div className="auth-screen" style={{ display: 'flex' }}>
      <div className="auth-card">
        <div className="auth-brand"><span className="brand-mark">GT</span> GS-Travaux</div>
        <h1>{title}</h1>
        {sub && <p className="auth-sub">{sub}</p>}
        {children}
      </div>
    </div>
  );
}

/** Règle minimale côté interface ; Supabase applique en plus sa propre politique de mot de passe. */
export function passwordIssue(pwd: string): string {
  if (pwd.length < 8) return 'Le mot de passe doit contenir au moins 8 caractères.';
  if (!/[A-Za-z]/.test(pwd) || !/\d/.test(pwd)) return 'Le mot de passe doit contenir des lettres et des chiffres.';
  return '';
}

export function LoginScreen({ backend, onSignedIn, message }: { backend: Backend; onSignedIn: () => void; message?: string }) {
  const [mode, setMode] = useState<'login' | 'forgot' | 'sent'>('login');
  const [email, setEmail] = useState(''); const [pwd, setPwd] = useState('');
  const [err, setErr] = useState(message || ''); const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      if (mode === 'login') { await backend.signIn(email, pwd); onSignedIn(); }
      else { await backend.sendPasswordReset(email); setMode('sent'); }
    } catch (ex: any) { setErr(ex.message || 'Erreur.'); } finally { setBusy(false); }
  }
  if (mode === 'sent') {
    return <Shell title="Vérifiez votre boîte e-mail" sub="Si un compte existe pour cette adresse, un lien de réinitialisation vient d’être envoyé.">
      <div className="auth-links"><a onClick={() => { setMode('login'); setErr(''); }}>Retour à la connexion</a></div>
    </Shell>;
  }
  return (
    <Shell title={mode === 'login' ? 'Connexion' : 'Mot de passe oublié'}
      sub={mode === 'login' ? 'Accédez à la gestion de votre entreprise.' : 'Saisissez votre e-mail : vous recevrez un lien pour choisir un nouveau mot de passe.'}>
      {err && <div className="auth-msg" role="alert">{err}</div>}
      <form onSubmit={submit}>
        <div className="field"><label>Adresse e-mail</label><input type="email" autoComplete="username" required autoFocus value={email} onChange={e => setEmail(e.target.value)} /></div>
        {mode === 'login' && <div className="field"><label>Mot de passe</label><input type="password" autoComplete="current-password" required value={pwd} onChange={e => setPwd(e.target.value)} /></div>}
        <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={busy}>{busy ? '…' : mode === 'login' ? 'Se connecter' : 'Envoyer le lien'}</button>
      </form>
      <div className="auth-links">
        {mode === 'login'
          ? <><a onClick={() => { setMode('forgot'); setErr(''); }}>Mot de passe oublié ?</a><a href="#/owner">Espace propriétaire</a></>
          : <a onClick={() => { setMode('login'); setErr(''); }}>Retour à la connexion</a>}
      </div>
    </Shell>
  );
}

/** Affiché quand l'utilisateur arrive depuis le lien de réinitialisation reçu par e-mail. */
export function SetPasswordScreen({ backend, onDone }: { backend: Backend; onDone: () => void }) {
  const [p1, setP1] = useState(''); const [p2, setP2] = useState('');
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    const issue = passwordIssue(p1);
    if (issue) return setErr(issue);
    if (p1 !== p2) return setErr('Les deux mots de passe ne sont pas identiques.');
    setBusy(true); setErr('');
    try { await backend.setNewPassword(p1); onDone(); } catch (ex: any) { setErr(ex.message); } finally { setBusy(false); }
  }
  return (
    <Shell title="Nouveau mot de passe" sub="Choisissez un nouveau mot de passe pour votre compte.">
      {err && <div className="auth-msg" role="alert">{err}</div>}
      <form onSubmit={submit}>
        <div className="field"><label>Nouveau mot de passe</label><input type="password" autoComplete="new-password" required value={p1} onChange={e => setP1(e.target.value)} /></div>
        <div className="field"><label>Confirmer</label><input type="password" autoComplete="new-password" required value={p2} onChange={e => setP2(e.target.value)} /></div>
        <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={busy}>{busy ? '…' : 'Enregistrer'}</button>
      </form>
    </Shell>
  );
}

export function BlockedScreen({ title, message, onLogout, onRetry }: { title: string; message: string; onLogout: () => void; onRetry?: () => void }) {
  return (
    <Shell title={title}>
      <div className="auth-msg" role="alert">{message}</div>
      <div style={{ display: 'flex', gap: 10 }}>
        {onRetry && <button className="btn btn-ghost" onClick={onRetry}>Réessayer</button>}
        <button className="btn btn-primary" onClick={onLogout}>Se déconnecter</button>
      </div>
    </Shell>
  );
}

export function LoadingScreen({ text = 'Chargement…' }: { text?: string }) {
  return <div className="auth-screen" style={{ display: 'flex' }}><div className="auth-sub">{text}</div></div>;
}
