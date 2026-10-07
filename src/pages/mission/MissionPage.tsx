/* Ordre de mission : affectation des équipes sur les lignes de devis. */
import { useMemo } from 'react';
import { useRights, useStore } from '../../data/store';
import { useUI } from '../../ui/UIProvider';
import { toast } from '../../ui/toast';
import { DataTable, useTableFilters, type Column } from '../../ui/DataTable';
import { AddButton, Badge, PageActions, Panel } from '../../ui/misc';
import { fmtDate } from '../../lib/format';
import { collabNom } from '../../lib/paie';
import type { OrdreMission } from '../../lib/types';
import { DevisPicker } from '../recettes/DevisPicker';
import { MissionForm } from './MissionForm';
import { MISSION_BADGE, MISSION_STATUTS } from './missionLogic';

export default function MissionPage() {
  const { state, update } = useStore();
  const { openModal } = useUI();
  const r = useRights('mission');
  const rows = useMemo(() => [...state.ordresMission].sort((a, b) => b.date.localeCompare(a.date)), [state.ordresMission]);

  const setStatut = (id: string, statut: string) => {
    update(d => { const o = d.ordresMission.find(x => x.id === id); if (o) o.statut = statut; });
    toast(`Ordre de mission : ${statut.toLowerCase()}.`);
  };
  const openPicker = () => openModal(
    <DevisPicker title="Sélectionner un devis" candidates={state.devis.filter(d => d.statut === 'Soldée' || d.statut === 'Facturé')}
      emptyText="Aucun devis soldé disponible. Soldez d'abord un devis dans Conversion en commande."
      onChoose={d => openModal(<MissionForm devisId={d.id} />)} />);
  const openDetail = (o: OrdreMission) => openModal(<MissionForm devisId={o.devisId} missionId={o.id} />);

  const columns: Column<OrdreMission>[] = [
    { key: 'id', label: 'N° OM', className: 'mono', filter: { value: o => o.id, placeholder: 'N° OM' }, render: o => o.id },
    { key: 'date', label: 'Date', render: o => fmtDate(o.date) },
    { key: 'ligne', label: 'Ligne de devis', filter: { value: o => o.lignes[0], placeholder: 'Ligne de devis' }, render: o => <span style={{ fontSize: 12 }}>{o.lignes[0] || '—'}</span> },
    { key: 'collabs', label: 'Collaborateurs', render: o => o.collaborateurIds.map(id => collabNom(state.collaborateurs, id)).join(', ') || '—' },
    { key: 'statut', label: 'Statut', filter: { value: o => o.statut, options: [...MISSION_STATUTS], placeholder: 'Tous' }, render: o => <Badge cls={MISSION_BADGE[o.statut]}>{o.statut}</Badge> },
    { key: 'actions', label: '', nowrap: true, render: o => r.modifier ? <>
      {o.statut === 'Planifié' && <button className="btn btn-ghost btn-sm" onClick={() => setStatut(o.id, 'En cours')}>Démarrer</button>}{' '}
      {o.statut === 'En cours' && <button className="btn btn-ghost btn-sm" onClick={() => setStatut(o.id, 'Terminé')}>Terminer</button>}{' '}
      {(o.statut === 'Planifié' || o.statut === 'En cours') && <button className="btn btn-danger btn-sm" onClick={() => setStatut(o.id, 'Annulé')}>Annuler</button>}
    </> : null },
  ];
  const tf = useTableFilters(rows, columns);
  return (
    <>
      {r.modifier && <PageActions><AddButton onClick={openPicker}>Créer un ordre de mission</AddButton></PageActions>}
      <Panel title="Ordres de mission" count={tf.filtered.length}>
        <DataTable tf={tf} columns={columns} rowKey={o => o.id} onRowDoubleClick={openDetail} emptyText="Aucun ordre de mission ne correspond aux filtres." />
      </Panel>
    </>
  );
}
