/* Conversion en commande : devis soldés (Soldée / Facturé) avec leur bon de commande. */
import { useRights, useStore } from '../../data/store';
import { useUI } from '../../ui/UIProvider';
import { DataTable, useTableFilters, type Column } from '../../ui/DataTable';
import { AddButton, Badge, PageActions, Panel } from '../../ui/misc';
import { BADGE_CLASS, devisTotal } from '../../lib/devis';
import { fmtDate, money } from '../../lib/format';
import type { Devis } from '../../lib/types';
import { DevisForm } from './DevisForm';
import { CommandePicker } from './SolderForm';

export default function CommandesPage() {
  const { state, can } = useStore();
  const { openModal } = useUI();
  const r = useRights('commandes');
  const canEditDevis = can('devis', 'modifier');
  const rows = state.devis.filter(d => d.statut === 'Soldée' || d.statut === 'Facturé');
  const columns: Column<Devis>[] = [
    { key: 'numero', label: 'N° devis', className: 'mono', filter: { value: d => d.numero, placeholder: 'N° devis' }, render: d => d.numero },
    { key: 'client', label: 'Client', filter: { value: d => d.client, options: state.clients.map(c => c.nom), placeholder: 'Tous les clients' }, render: d => d.client },
    { key: 'objet', label: 'Objet', filter: { value: d => d.objet, placeholder: 'Objet' }, render: d => d.objet },
    { key: 'montant', label: 'Montant', className: 'num', render: d => `${money(devisTotal(d))} DH` },
    { key: 'bc', label: 'N° BC', className: 'mono', filter: { value: d => d.bc?.numero, placeholder: 'N° BC' }, render: d => d.bc?.numero || '—' },
    { key: 'bcDate', label: 'Date BC', render: d => fmtDate(d.bc?.date) },
    { key: 'fichier', label: 'Pièce jointe', render: d => d.bc?.fichier ? <span className="mono" style={{ fontSize: 11.5 }}>{d.bc.fichier}</span> : '—' },
    { key: 'statut', label: 'Situation', render: d => <Badge cls={BADGE_CLASS[d.statut]}>{d.statut}</Badge> },
  ];
  const tf = useTableFilters(rows, columns);
  return (
    <>
      {r.modifier && <PageActions><AddButton onClick={() => openModal(<CommandePicker />)}>Solder un devis</AddButton></PageActions>}
      <Panel title="Devis soldés" count={tf.filtered.length}>
        <DataTable tf={tf} columns={columns} rowKey={d => d.id} onRowDoubleClick={canEditDevis ? (d => openModal(<DevisForm devisId={d.id} />)) : undefined}
          emptyText="Aucun devis soldé pour l'instant." />
      </Panel>
    </>
  );
}
