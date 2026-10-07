import { useRef, useState } from 'react';
import { useStore, useRights } from '../../data/store';
import { fmtDate, todayIso, uid } from '../../lib/format';
import { collabNom } from '../../lib/paie';
import type { Collaborateur } from '../../lib/types';
import { Modal } from '../../ui/Modal';
import { AddButton, Badge, PageActions, Panel } from '../../ui/misc';
import { useUI, toast } from '../../ui/UIProvider';
import { validateRequired } from '../../ui/validate';
import { SelectField, TextField } from './fields';
import { CONGE_BADGE, CONGE_STATUTS, CONGE_TYPES, joursEntre } from './shared';

function CongeForm({ actifs, onSave }: { actifs: Collaborateur[]; onSave: (collaborateurId: string, type: string, dateDebut: string, dateFin: string) => void }) {
  const { closeModal } = useUI();
  const bodyRef = useRef<HTMLDivElement>(null);
  const [collab, setCollab] = useState(actifs[0]?.id ?? '');
  const [type, setType] = useState(CONGE_TYPES[0]);
  const [debut, setDebut] = useState(todayIso());
  const [fin, setFin] = useState(todayIso());
  const save = () => {
    if (!validateRequired(bodyRef.current)) return;
    if (!debut || !fin || fin < debut) { toast('Vérifiez les dates de début et de fin.'); return; }
    onSave(collab, type, debut, fin);
    closeModal(); toast('Demande de congé enregistrée.');
  };
  return (
    <Modal title="Nouvelle demande de congé" size="sm" onClose={closeModal} bodyRef={bodyRef}
      footer={<><button className="btn btn-ghost" onClick={closeModal}>Annuler</button><button className="btn btn-accent" onClick={save}>Enregistrer</button></>}>
      <SelectField label="Collaborateur" required value={collab} onChange={setCollab}
        options={actifs.map(c => ({ value: c.id, label: `${c.prenom} ${c.nom} (${c.id})` }))} />
      <SelectField label="Type" required value={type} onChange={setType} options={CONGE_TYPES} />
      <div className="field-row">
        <TextField label="Date début" type="date" required value={debut} onChange={setDebut} />
        <TextField label="Date fin" type="date" required value={fin} onChange={setFin} />
      </div>
    </Modal>
  );
}

export default function CongesTab() {
  const { state, update } = useStore();
  const r = useRights('collab_conges');
  const { openModal } = useUI();
  const [fCollab, setFCollab] = useState(''); const [fStatut, setFStatut] = useState('');

  const rows = state.conges
    .filter(cg => (!fCollab || cg.collaborateurId === fCollab) && (!fStatut || cg.statut === fStatut))
    .sort((a, b) => b.dateDebut.localeCompare(a.dateDebut));

  const openForm = () => {
    const actifs = state.collaborateurs.filter(c => c.statut === 'Actif');
    if (!actifs.length) { toast('Ajoutez d’abord un collaborateur actif.'); return; }
    openModal(<CongeForm actifs={actifs} onSave={(collaborateurId, type, dateDebut, dateFin) =>
      update(d => { d.conges.unshift({ id: uid('cg'), collaborateurId, type, dateDebut, dateFin, jours: joursEntre(dateDebut, dateFin), statut: 'Demandé' }); })} />);
  };
  const setStatut = (id: string, statut: string) => {
    update(d => { const cg = d.conges.find(x => x.id === id); if (cg) cg.statut = statut; });
    toast(`Demande ${statut.toLowerCase()}.`);
  };

  return (
    <>
      {r.modifier && <PageActions><AddButton onClick={openForm}>Ajouter une demande</AddButton></PageActions>}
      <Panel title="Congés & Absences" count={rows.length}>
        <div className="table-wrap"><table>
          <thead>
            <tr><th>Collaborateur</th><th>Type</th><th>Début</th><th>Fin</th><th>Jours</th><th>Statut</th><th></th></tr>
            <tr className="filter-row">
              <th><select aria-label="Filtrer par collaborateur" value={fCollab} onChange={e => setFCollab(e.target.value)}>
                <option value="">Tous</option>
                {state.collaborateurs.map(c => <option key={c.id} value={c.id}>{c.prenom} {c.nom}</option>)}
              </select></th>
              <th></th><th></th><th></th><th></th>
              <th><select aria-label="Filtrer par statut" value={fStatut} onChange={e => setFStatut(e.target.value)}>
                <option value="">Tous</option>
                {CONGE_STATUTS.map(s => <option key={s} value={s}>{s}</option>)}
              </select></th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? rows.map(cg => (
              <tr key={cg.id}>
                <td data-label="Collaborateur">{collabNom(state.collaborateurs, cg.collaborateurId)}</td>
                <td data-label="Type">{cg.type}</td>
                <td data-label="Début">{fmtDate(cg.dateDebut)}</td>
                <td data-label="Fin">{fmtDate(cg.dateFin)}</td>
                <td data-label="Jours" className="num">{cg.jours}</td>
                <td data-label="Statut"><Badge cls={CONGE_BADGE[cg.statut] || 'badge-cree'}>{cg.statut}</Badge></td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {r.modifier && cg.statut === 'Demandé' && <>
                    <button className="btn btn-ghost btn-sm" onClick={() => setStatut(cg.id, 'Validé')}>Valider</button>{' '}
                    <button className="btn btn-danger btn-sm" onClick={() => setStatut(cg.id, 'Refusé')}>Refuser</button>
                  </>}
                </td>
              </tr>
            )) : <tr><td colSpan={7}><div className="empty-state">Aucune demande ne correspond aux filtres.</div></td></tr>}
          </tbody>
        </table></div>
      </Panel>
    </>
  );
}
