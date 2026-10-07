import { useRef, useState } from 'react';
import { useStore, useRights } from '../../data/store';
import { fmtDate, matches, todayIso, uid } from '../../lib/format';
import { collabNom } from '../../lib/paie';
import type { Collaborateur } from '../../lib/types';
import { Modal } from '../../ui/Modal';
import { AddButton, Badge, PageActions, Panel } from '../../ui/misc';
import { useUI, toast } from '../../ui/UIProvider';
import { validateRequired } from '../../ui/validate';
import { SelectField, TextField } from './fields';
import { POINTAGE_BADGE, POINTAGE_STATUTS } from './shared';

function PointageForm({ actifs, onSave }: { actifs: Collaborateur[]; onSave: (collaborateurId: string, date: string, statut: string) => void }) {
  const { closeModal } = useUI();
  const bodyRef = useRef<HTMLDivElement>(null);
  const [collab, setCollab] = useState(actifs[0]?.id ?? '');
  const [date, setDate] = useState(todayIso());
  const [statut, setStatut] = useState(POINTAGE_STATUTS[0]);
  const save = () => {
    if (!validateRequired(bodyRef.current)) return;
    onSave(collab, date, statut);
    closeModal(); toast('Pointage enregistré.');
  };
  return (
    <Modal title="Nouveau pointage" size="sm" onClose={closeModal} bodyRef={bodyRef}
      footer={<><button className="btn btn-ghost" onClick={closeModal}>Annuler</button><button className="btn btn-accent" onClick={save}>Enregistrer</button></>}>
      <SelectField label="Collaborateur" required value={collab} onChange={setCollab}
        options={actifs.map(c => ({ value: c.id, label: `${c.prenom} ${c.nom} (${c.id})` }))} />
      <div className="field-row">
        <TextField label="Date" type="date" required value={date} onChange={setDate} />
        <SelectField label="Situation" required value={statut} onChange={setStatut} options={POINTAGE_STATUTS} />
      </div>
    </Modal>
  );
}

export default function PointageTab() {
  const { state, update } = useStore();
  const r = useRights('collab_pointage');
  const { openModal } = useUI();
  const [fDate, setFDate] = useState(''); const [fCollab, setFCollab] = useState(''); const [fStatut, setFStatut] = useState('');

  const rows = state.pointages
    .filter(p => (!fCollab || p.collaborateurId === fCollab) && matches(fmtDate(p.date), fDate) && (!fStatut || p.statut === fStatut))
    .sort((a, b) => b.date.localeCompare(a.date));

  const openForm = () => {
    const actifs = state.collaborateurs.filter(c => c.statut === 'Actif');
    if (!actifs.length) { toast('Ajoutez d’abord un collaborateur actif.'); return; }
    openModal(<PointageForm actifs={actifs} onSave={(collaborateurId, date, statut) =>
      update(d => { d.pointages.unshift({ id: uid('pt'), collaborateurId, date, statut }); })} />);
  };

  return (
    <>
      {r.modifier && <PageActions><AddButton onClick={openForm}>Ajouter un pointage</AddButton></PageActions>}
      <Panel title="Pointage" count={rows.length}>
        <div className="table-wrap"><table>
          <thead>
            <tr><th>Date</th><th>Collaborateur</th><th>Situation</th></tr>
            <tr className="filter-row">
              <th><input placeholder="Date" value={fDate} onChange={e => setFDate(e.target.value)} /></th>
              <th><select aria-label="Filtrer par collaborateur" value={fCollab} onChange={e => setFCollab(e.target.value)}>
                <option value="">Tous</option>
                {state.collaborateurs.map(c => <option key={c.id} value={c.id}>{c.prenom} {c.nom}</option>)}
              </select></th>
              <th><select aria-label="Filtrer par situation" value={fStatut} onChange={e => setFStatut(e.target.value)}>
                <option value="">Toutes</option>
                {POINTAGE_STATUTS.map(s => <option key={s} value={s}>{s}</option>)}
              </select></th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? rows.map(p => (
              <tr key={p.id}>
                <td data-label="Date">{fmtDate(p.date)}</td>
                <td data-label="Collaborateur">{collabNom(state.collaborateurs, p.collaborateurId)}</td>
                <td data-label="Situation"><Badge cls={POINTAGE_BADGE[p.statut] || 'badge-cree'}>{p.statut}</Badge></td>
              </tr>
            )) : <tr><td colSpan={3}><div className="empty-state">Aucun pointage ne correspond aux filtres.</div></td></tr>}
          </tbody>
        </table></div>
      </Panel>
    </>
  );
}
