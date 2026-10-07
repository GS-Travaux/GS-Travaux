import { useState } from 'react';
import { useStore } from '../../data/store';
import { passwordIssue } from '../../auth/AuthScreens';
import { toast } from '../../ui/toast';

export default function CompteTab() {
  const { me, company, backend, previewProfil } = useStore();
  const [o, setO] = useState(''); const [n, setN] = useState(''); const [n2, setN2] = useState('');
  const [busy, setBusy] = useState(false);

  async function changer() {
    if (!o || !n || !n2) return toast('Renseignez les trois champs.');
    const issue = passwordIssue(n);
    if (issue) return toast(issue);
    if (n.toLowerCase() === me.email.toLowerCase()) return toast('Le mot de passe ne doit pas être identique à l’adresse e-mail.');
    if (n !== n2) return toast('Les deux mots de passe ne correspondent pas.');
    if (n === o) return toast('Le nouveau mot de passe doit être différent de l’actuel.');
    setBusy(true);
    try {
      await backend.changePassword(o, n);
      setO(''); setN(''); setN2('');
      toast('Mot de passe modifié.');
    } catch (e: any) { toast(e?.message || 'Modification impossible.'); }
    finally { setBusy(false); }
  }

  return (
    <>
      <div className="card" style={{ maxWidth: 460, marginBottom: 16 }}>
        <div className="field-row">
          <div className="field"><label htmlFor="c-nom">Nom</label><input id="c-nom" value={me.nom} disabled /></div>
          <div className="field"><label htmlFor="c-profil">Profil</label><input id="c-profil" value={me.profil} disabled /></div>
        </div>
        <div className="field"><label htmlFor="c-email">Adresse e-mail (identifiant de connexion)</label><input id="c-email" value={me.email} disabled /></div>
        <div className="field" style={{ marginBottom: 0 }}><label htmlFor="c-code">Code société</label><input id="c-code" className="mono" value={company.code} disabled /></div>
      </div>
      <div className="card keep-enabled" style={{ maxWidth: 460 }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 14 }}>Changer mon mot de passe</h3>
        {previewProfil
          ? <div className="hint" style={{ margin: 0 }}>Indisponible pendant l’aperçu d’un profil.</div>
          : <form onSubmit={e => { e.preventDefault(); void changer(); }}>
            <div className="field"><label htmlFor="pw-old">Mot de passe actuel</label><input id="pw-old" type="password" autoComplete="current-password" value={o} onChange={e => setO(e.target.value)} /></div>
            <div className="field"><label htmlFor="pw-new">Nouveau mot de passe</label><input id="pw-new" type="password" autoComplete="new-password" value={n} onChange={e => setN(e.target.value)} /></div>
            <div className="field"><label htmlFor="pw-new2">Confirmer le nouveau mot de passe</label><input id="pw-new2" type="password" autoComplete="new-password" value={n2} onChange={e => setN2(e.target.value)} /></div>
            <div className="hint">8 caractères minimum, avec au moins une lettre et un chiffre.{backend.mode === 'local' ? ' Mode démonstration : il n’y a pas de mot de passe, la modification est sans effet.' : ''}</div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button type="submit" className="btn btn-accent" disabled={busy}>{busy ? '…' : 'Modifier le mot de passe'}</button>
              {backend.mode === 'supabase' && <button type="button" className="btn btn-ghost" onClick={() => void backend.signOut()}>Se déconnecter</button>}
            </div>
          </form>}
      </div>
    </>
  );
}
