/* Facturation : devis facturés (statut « Facturé »), édition de la facture, PDF. */
import { useRights, useStore } from '../../data/store';
import { useUI } from '../../ui/UIProvider';
import { DataTable, useTableFilters, type Column } from '../../ui/DataTable';
import { AddButton, PageActions, Panel } from '../../ui/misc';
import { devisTotal, factureEcheance } from '../../lib/devis';
import { fmtDate, money } from '../../lib/format';
import { printDocument } from '../../lib/print';
import { buildFacturePrintHtml } from '../../lib/printDevis';
import type { Devis } from '../../lib/types';
import { FactureEditForm, FacturationPicker } from './FactureForms';

export default function FacturationPage() {
  const { state } = useStore();
  const { openModal } = useUI();
  const r = useRights('facturation');
  const rows = state.devis.filter(d => d.statut === 'Facturé');
  const edit = (d: Devis) => openModal(<FactureEditForm devisId={d.id} />);
  const columns: Column<Devis>[] = [
    { key: 'numero', label: 'N° facture', className: 'mono', filter: { value: d => d.facture?.numero, placeholder: 'N° facture' }, render: d => d.facture?.numero || '—' },
    { key: 'client', label: 'Client', filter: { value: d => d.client, options: state.clients.map(c => c.nom), placeholder: 'Tous les clients' }, render: d => d.client },
    { key: 'objet', label: 'Objet', filter: { value: d => d.objet, placeholder: 'Objet' }, render: d => d.objet },
    { key: 'montant', label: 'Montant', className: 'num', render: d => `${money(devisTotal(d))} DH` },
    { key: 'date', label: 'Date facture', render: d => fmtDate(d.facture?.date) },
    { key: 'mode', label: 'Mode paiement', render: d => d.facture?.modePaiement || '—' },
    { key: 'delai', label: 'Délai', render: d => d.facture?.delai || '—' },
    { key: 'echeance', label: 'Échéance', render: d => fmtDate(factureEcheance(d)) },
    { key: 'actions', label: '', nowrap: true, render: d => <>
      {r.modifier && <><button className="btn btn-ghost btn-sm" onClick={() => edit(d)}>Modifier</button>{' '}</>}
      <button className="btn btn-ghost btn-sm" onClick={() => printDocument(buildFacturePrintHtml(d, state.societe))}>PDF</button>
    </> },
  ];
  const tf = useTableFilters(rows, columns);
  return (
    <>
      {r.modifier && <PageActions><AddButton onClick={() => openModal(<FacturationPicker />)}>Facturer un devis</AddButton></PageActions>}
      <Panel title="Factures" count={tf.filtered.length}>
        <DataTable tf={tf} columns={columns} rowKey={d => d.id} onRowDoubleClick={r.modifier ? edit : undefined} emptyText="Aucune facture pour l'instant." />
      </Panel>
    </>
  );
}
