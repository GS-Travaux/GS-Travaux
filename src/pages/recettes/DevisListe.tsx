/* Sous-onglet « Devis » : liste, filtres, avancement, actions. */
import { useRights, useStore } from '../../data/store';
import { useUI } from '../../ui/UIProvider';
import { DataTable, useTableFilters, type Column } from '../../ui/DataTable';
import { AddButton, Badge, PageActions, Panel } from '../../ui/misc';
import { AVANCEMENT_BADGE, BADGE_CLASS, STATUTS, devisAvancement, devisTotal } from '../../lib/devis';
import { fmtDate, money } from '../../lib/format';
import { printDocument } from '../../lib/print';
import { buildDevisPrintHtml } from '../../lib/printDevis';
import type { Devis } from '../../lib/types';
import { AVANCEMENTS } from './devisLogic';
import { DevisForm } from './DevisForm';
import { DevisDetail } from './DevisDetail';

export default function DevisListe() {
  const { state } = useStore();
  const { openModal } = useUI();
  const r = useRights('devis');
  const openForm = (id?: string) => openModal(<DevisForm devisId={id} />);
  const avanc = (d: Devis) => devisAvancement(d, state.ordresMission);

  const columns: Column<Devis>[] = [
    { key: 'numero', label: 'N° devis', className: 'mono', filter: { value: d => d.numero, placeholder: 'N° devis' }, render: d => d.numero },
    { key: 'client', label: 'Client', filter: { value: d => d.client, options: state.clients.map(c => c.nom), placeholder: 'Tous les clients' }, render: d => d.client },
    { key: 'date', label: 'Date', filter: { value: d => fmtDate(d.date), placeholder: 'Date' }, render: d => fmtDate(d.date) },
    { key: 'objet', label: 'Objet', filter: { value: d => d.objet, placeholder: 'Objet' }, render: d => d.objet },
    { key: 'emetteur', label: 'Émetteur', filter: { value: d => d.emetteur, placeholder: 'Émetteur' }, render: d => d.emetteur },
    { key: 'montant', label: 'Montant', className: 'num', render: d => `${money(devisTotal(d))} DH` },
    { key: 'statut', label: 'Situation', filter: { value: d => d.statut, options: [...STATUTS], placeholder: 'Toutes' }, render: d => <Badge cls={BADGE_CLASS[d.statut]}>{d.statut}</Badge> },
    { key: 'avancement', label: 'Avancement travaux', filter: { value: avanc, options: [...AVANCEMENTS], placeholder: 'Tous' }, render: d => <Badge cls={AVANCEMENT_BADGE[avanc(d)]}>{avanc(d)}</Badge> },
    { key: 'dateSoldee', label: 'Date soldée', render: d => fmtDate(d.dateSoldee) },
    { key: 'dateFacturee', label: 'Date facturée', render: d => fmtDate(d.dateFacturee) },
    { key: 'actions', label: '', nowrap: true, render: d => <>
      <button className="btn btn-ghost btn-sm" onClick={() => openModal(<DevisDetail devisId={d.id} />)}>Détail</button>{' '}
      {r.modifier && <><button className="btn btn-ghost btn-sm" onClick={() => openForm(d.id)}>Modifier</button>{' '}</>}
      <button className="btn btn-ghost btn-sm" onClick={() => printDocument(buildDevisPrintHtml(d, state.societe))}>PDF</button>
    </> },
  ];
  const tf = useTableFilters(state.devis, columns);
  return (
    <>
      {r.modifier && <PageActions><AddButton onClick={() => openForm()}>Ajouter un devis</AddButton></PageActions>}
      <Panel title="Liste des devis" count={tf.filtered.length}>
        <DataTable tf={tf} columns={columns} rowKey={d => d.id} onRowDoubleClick={r.modifier ? (d => openForm(d.id)) : undefined} emptyText="Aucun devis ne correspond aux filtres." />
      </Panel>
    </>
  );
}
