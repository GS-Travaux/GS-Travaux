import { useRef, useState } from 'react';
import { useRights, useStore } from '../../data/store';
import type { Utilisateur } from '../../lib/types';
import { passwordIssue } from '../../auth/AuthScreens';
import { Modal } from '../../ui/Modal';
import { useUI } from '../../ui/UIProvider';
import { toast } from '../../ui/toast';
import { validateRequired } from '../../ui/validate';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const erreur = (e: any) => toast(e?.message || 'Opération impossible.');

export default function UtilisateursTab() {
  const { state, me, backend, reload, previewProfil } = useStore();
  const r = useRights('securite_utilisateurs');
  const { openModal, confirm } = useUI();
  const [busy, setBusy] = useState('');
  // Pendant l'aperçu d'un profil, « moi » reste le compte réellement connecté.
  const isMe = (u: Utilisateur) => u.id === me.id;

  async function run(key: string, op: () => Promise<unknown>, okMsg: string) {
    if (busy) return;
    setBusy(key);
    try { await op(); await reload(); toast(okMsg); } catch (e) { erreur(e); } finally { setBusy(''); }
  }
  async function basculer(u: Utilisateur) {
    if (isMe(u)) return toast('Vous ne pouvez pas désactiver votre propre compte.');
    if (u.actif && !(await confirm({ title: 'Désactiver ce compte ?', danger: true, confirmLabel: 'Désactiver',
      message: <><strong>{u.nom}</strong> ne pourra plus se connecter tant que son compte n’est pas réactivé. Ses données sont conservées.</> }))) return;
    await run(u.id, () => backend.updateUser(u.id, { actif: !u.actif }), u.actif ? `Compte de ${u.nom} désactivé.` : `Compte de ${u.nom} réactivé.`);
  }
  async function supprimer(u: Utilisateur) {
    if (isMe(u)) return toast('Vous ne pouvez pas supprimer votre propre compte.');
    if (!(await confirm({ title: 'Supprimer cet utilisateur ?', danger: true, confirmLabel: 'Supprimer',
      message: <><strong>{u.nom}</strong> — {u.email}<br />Le compte sera supprimé définitivement. Pour bloquer simplement l’accès, utilisez plutôt « Désactiver ».</> }))) return;
    await run(u.id, () => backend.deleteUser(u.id), `Compte de ${u.nom} supprimé.`);
  }
  async function reinitialiser(u: Utilisateur) {
    if (!(await confirm({ title: 'Envoyer un e-mail de réinitialisation ?', confirmLabel: 'Envoyer',
      message: <>Un lien pour choisir un nouveau mot de passe sera envoyé à <strong>{u.email}</strong>.</> }))) return;
    await run(u.id, () => backend.resetUserPassword(u.id), backend.mode === 'local' ? 'Mode démonstration : aucun e-mail n’est envoyé.' : `E-mail de réinitialisation envoyé à ${u.email}.`);
  }
  const edit = (u: Utilisateur) => openModal(<UserEditForm user={u} />);

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Utilisateurs <span className="count-pill">{state.utilisateurs.length}</span></h2>
        {r.modifier && !previewProfil && <button className="btn btn-primary btn-sm" onClick={() => openModal(<UserCreateForm />)}>+ Créer utilisateur</button>}
      </div>
      <div className="table-wrap"><table>
        <thead><tr><th>Nom</th><th>E-mail</th><th>Profil</th><th>État</th><th></th></tr></thead>
        <tbody>
          {state.utilisateurs.map(u => (
            <tr key={u.id} title={r.modifier ? 'Double-cliquer pour modifier' : undefined}
              onDoubleClick={ev => { if (r.modifier && !previewProfil && !(ev.target as HTMLElement).closest('button')) edit(u); }}>
              <td data-label="Nom">{u.nom}{isMe(u) && <span className="badge badge-cree" style={{ marginLeft: 6 }}>Vous</span>}</td>
              <td className="mono" data-label="E-mail">{u.email}</td>
              <td data-label="Profil"><span className="role-chip">{u.profil}</span></td>
              <td data-label="État">{u.actif ? <span className="badge badge-facture">Actif</span> : <span className="badge badge-annule">Désactivé</span>}</td>
              <td style={{ whiteSpace: 'nowrap' }}>
                {r.modifier && !previewProfil && <>
                  <button className="btn btn-ghost btn-sm" disabled={busy === u.id} onClick={() => edit(u)}>Modifier</button>{' '}
                  {u.actif && <><button className="btn btn-ghost btn-sm" disabled={busy === u.id} title="Envoyer un e-mail de réinitialisation du mot de passe" onClick={() => void reinitialiser(u)}>Réinitialiser le mot de passe</button>{' '}</>}
                  {!isMe(u) && <><button className="btn btn-ghost btn-sm" disabled={busy === u.id} onClick={() => void basculer(u)}>{u.actif ? 'Désactiver' : 'Réactiver'}</button>{' '}</>}
                </>}
                {r.supprimer && !previewProfil && !isMe(u) && <button className="btn btn-danger btn-sm" disabled={busy === u.id} onClick={() => void supprimer(u)}>Supprimer</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </div>
  );
}

function UserCreateForm() {
  const { state, backend, reload } = useStore();
  const { closeModal } = useUI();
  const bodyRef = useRef<HTMLDivElement>(null);
  const [nom, setNom] = useState(''); const [email, setEmail] = useState(''); const [pwd, setPwd] = useState('');
  const [profilId, setProfilId] = useState(state.profils[0]?.id || '');
  const [busy, setBusy] = useState(false);

  async function creer() {
    if (busy || !validateRequired(bodyRef.current)) return;
    const n = nom.trim(), e = email.trim().toLowerCase();
    if (!EMAIL_RE.test(e)) return toast('Adresse e-mail invalide.');
    if (state.utilisateurs.some(u => u.email.toLowerCase() === e)) return toast('Cette adresse e-mail est déjà utilisée.');
    const issue = passwordIssue(pwd);
    if (issue) return toast(issue);
    if (pwd.toLowerCase() === e) return toast('Le mot de passe ne doit pas être identique à l’adresse e-mail.');
    setBusy(true);
    try {
      await backend.createUser({ nom: n, email: e, password: pwd, profil: profilId });
      await reload(); closeModal(); toast('Utilisateur créé.');
    } catch (ex) { erreur(ex); setBusy(false); }
  }
  return (
    <Modal title="Créer un utilisateur" onClose={closeModal} bodyRef={bodyRef}
      footer={<><button className="btn btn-ghost" onClick={closeModal}>Annuler</button><button className="btn btn-accent" disabled={busy} onClick={() => void creer()}>{busy ? '…' : 'Créer'}</button></>}>
      <div className="field-row">
        <div className="field"><label htmlFor="u-nom">Nom</label><input id="u-nom" required maxLength={120} value={nom} onChange={e => setNom(e.target.value)} /></div>
        <div className="field"><label htmlFor="u-email">Adresse e-mail</label><input id="u-email" required type="email" autoComplete="off" value={email} onChange={e => setEmail(e.target.value)} /></div>
      </div>
      <div className="field-row">
        <div className="field"><label htmlFor="u-pwd">Mot de passe initial</label><input id="u-pwd" required type="password" autoComplete="new-password" value={pwd} onChange={e => setPwd(e.target.value)} /></div>
        <div className="field"><label htmlFor="u-profil">Profil</label>
          <select id="u-profil" required value={profilId} onChange={e => setProfilId(e.target.value)}>{state.profils.map(p => <option key={p.id} value={p.id}>{p.nom}</option>)}</select></div>
      </div>
      <div className="hint">L’adresse e-mail sert d’identifiant de connexion. Mot de passe : 8 caractères minimum, avec au moins une lettre et un chiffre ; l’utilisateur pourra le changer dans « Mon compte ». Ses droits dépendent de son profil (onglet Droits).</div>
    </Modal>
  );
}

function UserEditForm({ user: u }: { user: Utilisateur }) {
  const { state, me, backend, reload } = useStore();
  const { closeModal } = useUI();
  const bodyRef = useRef<HTMLDivElement>(null);
  const isMe = me.id === u.id;                                   // compte connecté : profil verrouillé
  const [nom, setNom] = useState(u.nom); const [profilId, setProfilId] = useState(u.profilId);
  const [busy, setBusy] = useState(false);

  async function enregistrer() {
    if (busy || !validateRequired(bodyRef.current)) return;
    setBusy(true);
    try {
      await backend.updateUser(u.id, { nom: nom.trim(), ...(isMe || profilId === u.profilId ? {} : { profilId }) });
      await reload(); closeModal(); toast('Utilisateur modifié.');
    } catch (ex) { erreur(ex); setBusy(false); }
  }
  return (
    <Modal title={`Modifier ${u.nom}`} size="sm" onClose={closeModal} bodyRef={bodyRef}
      footer={<><button className="btn btn-ghost" onClick={closeModal}>Annuler</button><button className="btn btn-accent" disabled={busy} onClick={() => void enregistrer()}>{busy ? '…' : 'Enregistrer'}</button></>}>
      <div className="field-row">
        <div className="field"><label htmlFor="ue-nom">Nom</label><input id="ue-nom" required maxLength={120} value={nom} onChange={e => setNom(e.target.value)} /></div>
        <div className="field"><label htmlFor="ue-email">Adresse e-mail</label><input id="ue-email" value={u.email} disabled /></div>
      </div>
      <div className="field"><label htmlFor="ue-profil">Profil</label>
        <select id="ue-profil" required disabled={isMe} value={profilId} onChange={e => setProfilId(e.target.value)}>{state.profils.map(p => <option key={p.id} value={p.id}>{p.nom}</option>)}</select></div>
      <div className="hint">{isMe
        ? 'Le profil du compte connecté n’est pas modifiable, pour éviter de vous retirer vos propres droits.'
        : 'Pour changer son mot de passe, utilisez « Réinitialiser le mot de passe » : l’utilisateur reçoit un lien par e-mail.'}</div>
    </Modal>
  );
}
