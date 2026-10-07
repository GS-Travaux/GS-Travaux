import { useStore, useRights } from '../../data/store';
import { fmtDate } from '../../lib/format';
import { nextCollabId } from '../../lib/paie';
import type { Collaborateur } from '../../lib/types';
import { DataTable, useTableFilters, type Column } from '../../ui/DataTable';
import { AddButton, Badge, PageActions, Panel } from '../../ui/misc';
import { useUI } from '../../ui/UIProvider';
import SalarieForm from './SalarieForm';
import DemissionForm from './DemissionForm';
import { COLLAB_STATUTS, STATUT_BADGE, collabVide, salaireAffiche } from './shared';

export default function SalariesTab() {
  const { state, update } = useStore();
  const r = useRights('collab_salaries');
  const { openModal } = useUI();

  const openForm = (c?: Collaborateur) => {
    const editing = !!c;
    openModal(<SalarieForm key={c?.id ?? 'new'} collab={c ?? collabVide(nextCollabId(state.collaborateurs))} editing={editing} readOnly={!r.modifier}
      onSave={out => update(d => {
        const i = d.collaborateurs.findIndex(x => x.id === out.id);
        if (editing && i >= 0) Object.assign(d.collaborateurs[i], out);
        else if (!editing) d.collaborateurs.unshift(out);
      })} />);
  };
  const openDemission = (c: Collaborateur) => openModal(
    <DemissionForm collab={c} onConfirm={date => update(d => {
      const x = d.collaborateurs.find(k => k.id === c.id);
      if (x) { x.statut = 'Démissionné'; x.dateDemission = date; }
    })} />);

  const columns: Column<Collaborateur>[] = [
    { key: 'id', label: 'ID', className: 'mono', render: c => c.id, filter: { value: c => c.id, placeholder: 'ID' } },
    { key: 'nom', label: 'Nom & Prénom', render: c => `${c.prenom} ${c.nom}`, filter: { value: c => `${c.prenom} ${c.nom}`, placeholder: 'Nom' } },
    { key: 'poste', label: 'Poste', render: c => c.poste, filter: { value: c => c.poste, placeholder: 'Poste' } },
    { key: 'contrat', label: 'Contrat', render: c => c.typeContrat },
    { key: 'embauche', label: 'Embauche', render: c => fmtDate(c.dateEmbauche) },
    { key: 'salaire', label: 'Salaire de base', className: 'num', render: c => salaireAffiche(c) },
    { key: 'statut', label: 'Statut', render: c => <Badge cls={STATUT_BADGE[c.statut] || 'badge-cree'}>{c.statut}</Badge>, filter: { value: c => c.statut, options: COLLAB_STATUTS } },
    { key: 'demission', label: 'Date démission', render: c => fmtDate(c.dateDemission) },
    { key: 'actions', label: '', nowrap: true, render: c => (r.modifier && c.statut === 'Actif')
      ? <button className="btn btn-danger btn-sm" onClick={() => openDemission(c)}>Démissionner</button> : null },
  ];
  const tf = useTableFilters(state.collaborateurs, columns);

  return (
    <>
      {r.modifier && <PageActions><AddButton onClick={() => openForm()}>Ajouter un collaborateur</AddButton></PageActions>}
      <Panel title="Collaborateurs" count={tf.filtered.length}>
        <DataTable tf={tf} columns={columns} rowKey={c => c.id} onRowDoubleClick={openForm}
          emptyText="Aucun collaborateur ne correspond aux filtres." />
      </Panel>
    </>
  );
}
