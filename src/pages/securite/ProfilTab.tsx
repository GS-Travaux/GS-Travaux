import { useRef, useState } from 'react';
import { useRights, useStore } from '../../data/store';
import type { Profil } from '../../lib/types';
import { RIGHTS_TABS, droitsDe } from '../../lib/rights';
import { uid } from '../../lib/format';
import { Modal } from '../../ui/Modal';
import { useUI } from '../../ui/UIProvider';
import { AddButton, PageActions } from '../../ui/misc';
import { toast } from '../../ui/toast';
import { validateRequired } from '../../ui/validate';

export default function ProfilTab({ onReglerDroits, onCreated }: { onReglerDroits?: (profilId: string) => void; onCreated: (profilId: string) => void }) {
  const { state, me, backend, reload, previewProfil } = useStore();
  const r = useRights('securite_profil');
  const { openModal, confirm } = useUI();
  const canEdit = r.modifier && !previewProfil, canDelete = r.supprimer && !previewProfil;
  const nbUtilisateurs = (p: Profil) => state.utilisateurs.filter(u => u.profilId === p.id).length;
  const nbOnglets = (p: Profil) => RIGHTS_TABS.filter(t => droitsDe(state.profils, state.droits, p.nom, t.key).voir).length;
  const openForm = (p?: Profil) => openModal(<ProfilForm profil={p} onCreated={onCreated} />);

  async function supprimer(p: Profil) {
    const nb = nbUtilisateurs(p);
    if (nb) return toast(`Suppression impossible : ${nb} utilisateur(s) utilisent ce profil. Changez d'abord leur profil.`);
    if (!(await confirm({ title: 'Supprimer ce profil ?', danger: true, confirmLabel: 'Supprimer',
      message: <><div className="hint" style={{ marginBottom: 12, marginTop: 0 }}><strong>{p.nom}</strong> — {p.description}</div><div style={{ fontSize: 13 }}>Le profil et ses droits seront supprimés définitivement.</div></> }))) return;
    try { await backend.deleteProfil(p.id); await reload(); toast('Profil supprimé.'); }
    catch (e: any) { toast(e?.message || 'Suppression impossible.'); }
  }

  return (
    <>
      {canEdit && <PageActions><AddButton onClick={() => openForm()}>Créer un profil</AddButton></PageActions>}
      <div className="hint" style={{ marginBottom: 12, marginTop: 0 }}>Compte connecté : <strong>{me.nom}</strong> — profil <strong>{me.profil}</strong>. Les droits de chaque profil se règlent dans l’onglet Droits.</div>
      <div className="panel">
        <div className="panel-head"><h2>Profils <span className="count-pill">{state.profils.length}</span></h2></div>
        <div className="table-wrap"><table>
          <thead><tr><th>Profil</th><th>Description</th><th>Utilisateurs</th><th>Onglets accessibles</th><th></th></tr></thead>
          <tbody>
            {state.profils.map(p => (
              <tr key={p.id} title={!p.systeme && canEdit ? 'Double-cliquer pour modifier' : undefined}
                onDoubleClick={ev => { if (!p.systeme && canEdit && !(ev.target as HTMLElement).closest('button')) openForm(p); }}>
                <td data-label="Profil"><span className="role-chip">{p.nom}</span>{p.systeme && <span className="badge badge-cree" style={{ marginLeft: 6 }}>Système</span>}</td>
                <td data-label="Description">{p.description}</td>
                <td className="num" data-label="Utilisateurs">{nbUtilisateurs(p)}</td>
                <td className="num" data-label="Onglets accessibles">{nbOnglets(p)} / {RIGHTS_TABS.length}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {onReglerDroits && <><button className="btn btn-ghost btn-sm" onClick={() => onReglerDroits(p.id)}>Régler les droits</button>{' '}</>}
                  {!p.systeme && canEdit && <><button className="btn btn-ghost btn-sm" onClick={() => openForm(p)}>Modifier</button>{' '}</>}
                  {!p.systeme && canDelete && <button className="btn btn-danger btn-sm" onClick={() => void supprimer(p)}>Supprimer</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
    </>
  );
}

function ProfilForm({ profil, onCreated }: { profil?: Profil; onCreated: (id: string) => void }) {
  const { state, backend, reload } = useStore();
  const { closeModal } = useUI();
  const bodyRef = useRef<HTMLDivElement>(null);
  const editing = !!profil;
  const [nom, setNom] = useState(profil?.nom ?? ''); const [description, setDescription] = useState(profil?.description ?? '');
  const [copie, setCopie] = useState('none');
  const [busy, setBusy] = useState(false);

  async function enregistrer() {
    if (busy || !validateRequired(bodyRef.current)) return;
    if (profil?.systeme) return toast('Le profil système n’est pas modifiable.');
    const n = nom.trim(), d = description.trim();
    if (state.profils.some(x => x.id !== profil?.id && x.nom.toLowerCase() === n.toLowerCase())) return toast('Un profil porte déjà ce nom.');
    setBusy(true);
    try {
      if (editing) await backend.saveProfil({ id: profil!.id, nom: n, description: d });
      else {
        const id = uid('prf');
        await backend.saveProfil({ id, nom: n, description: d });
        const source = copie === 'none' ? null : state.droits[copie];
        if (source && Object.keys(source).length) await backend.saveDroits(id, JSON.parse(JSON.stringify(source)));
        onCreated(id);
      }
      await reload(); closeModal();
      toast(editing ? 'Profil modifié.' : `Profil « ${n} » créé — réglez ses droits dans l’onglet Droits.`);
    } catch (e: any) { toast(e?.message || 'Enregistrement impossible.'); await reload(); setBusy(false); }
  }
  return (
    <Modal title={editing ? `Modifier le profil « ${profil!.nom} »` : 'Créer un profil'} size="sm" onClose={closeModal} bodyRef={bodyRef}
      footer={<><button className="btn btn-ghost" onClick={closeModal}>Annuler</button><button className="btn btn-accent" disabled={busy} onClick={() => void enregistrer()}>{busy ? '…' : editing ? 'Enregistrer' : 'Créer'}</button></>}>
      <div className="field"><label htmlFor="pf-nom">Nom du profil</label><input id="pf-nom" required maxLength={60} value={nom} onChange={e => setNom(e.target.value)} /></div>
      <div className="field"><label htmlFor="pf-desc">Description</label><input id="pf-desc" required maxLength={200} value={description} onChange={e => setDescription(e.target.value)} /></div>
      {!editing && <>
        <div className="field"><label htmlFor="pf-copie">Copier les droits du profil</label>
          <select id="pf-copie" required value={copie} onChange={e => setCopie(e.target.value)}>
            <option value="none">Aucun (partir de zéro)</option>
            {state.profils.filter(x => !x.systeme).map(x => <option key={x.id} value={x.id}>{x.nom}</option>)}
          </select></div>
        <div className="hint">Un nouveau profil n’a accès qu’à « Mon compte » tant que ses droits ne sont pas réglés dans l’onglet Droits.</div>
      </>}
    </Modal>
  );
}
