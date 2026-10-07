/* Collaborateur › Bordereaux CIMR (clé de droits : collab_cimr). */
import { useMemo } from 'react';
import { useRights, useStore } from '../../../data/store';
import { fmtDate, money } from '../../../lib/format';
import { bordereauCimrTotaux, buildBordereauCimrLignes } from '../../../lib/paie';
import { printDocument } from '../../../lib/print';
import { buildBordereauCimrPrintHtml } from '../../../lib/printPaie';
import type { BordereauCimr } from '../../../lib/types';
import { DataTable, useTableFilters, type Column } from '../../../ui/DataTable';
import { Modal } from '../../../ui/Modal';
import { PageActions, Panel, PlusIcon } from '../../../ui/misc';
import { toast } from '../../../ui/toast';
import { useUI } from '../../../ui/UIProvider';
import { BordereauGenerateForm, BordereauPaiementForm, BordereauStatut, STATUTS_BORDEREAU } from './shared';

function CimrDetail({ id }: { id: string }) {
  const { state } = useStore();
  const { closeModal } = useUI();
  const b = state.bordereauxCimr.find(x => x.id === id);
  if (!b) return null;
  const t = bordereauCimrTotaux(b);
  return (
    <Modal title={`Bordereau ${b.id}`} onClose={closeModal}
      footer={<>
        <button className="btn btn-ghost" onClick={closeModal}>Fermer</button>
        <button className="btn btn-primary" onClick={() => printDocument(buildBordereauCimrPrintHtml(b, state.societe))}>PDF</button>
      </>}>
      <div className="hint" style={{ marginBottom: 14 }}>
        Mois : <strong>{b.mois}</strong> · Statut : <BordereauStatut statut={b.statut} />
        {b.statut === 'Payé' && <> · Payé le {fmtDate(b.datePaiement)} ({b.modePaiement})</>}
      </div>
      <div className="h-scroll" style={{ marginTop: 0 }}>
        <table className="pdoc-table">
          <thead><tr><th>N° CIMR</th><th>Affilié</th><th className="num">Salaire brut</th><th className="num">Part salariale</th><th className="num">Part patronale</th><th className="num">Total</th></tr></thead>
          <tbody>
            {b.lignes.map(l => (
              <tr key={l.collaborateurId}>
                <td className="mono">{l.cimrNum || '—'}</td><td>{l.nom}</td>
                <td className="num">{money(l.brut)}</td><td className="num">{money(l.sal)}</td><td className="num">{money(l.pat)}</td><td className="num">{money(l.sal + l.pat)}</td>
              </tr>
            ))}
            <tr className="pdoc-total"><td colSpan={2}>Total à payer à la CIMR</td><td className="num">{money(t.brut)}</td><td className="num">{money(t.sal)}</td><td className="num">{money(t.pat)}</td><td className="num">{money(t.total)} DH</td></tr>
          </tbody>
        </table>
      </div>
      <div className="hint" style={{ marginTop: 10 }}>Cotisation CIMR : 3,45 % salarié + 3,45 % employeur, sur le salaire brut. Seuls les collaborateurs cochés « Cotise à la CIMR » sont déclarés.</div>
    </Modal>
  );
}

export default function CimrTab() {
  const { state, update } = useStore();
  const r = useRights('collab_cimr');
  const { openModal } = useUI();

  const rows = useMemo(() => [...state.bordereauxCimr].sort((a, b) => b.mois.localeCompare(a.mois)), [state.bordereauxCimr]);

  const detail = (b: BordereauCimr) => openModal(<CimrDetail id={b.id} />);
  const actualiser = (b: BordereauCimr) => {
    const lignes = buildBordereauCimrLignes(state.bulletins, state.collaborateurs, b.mois);
    if (!lignes.length) { toast('Aucun bulletin de collaborateur affilié à la CIMR pour ce mois.'); return; }
    update(d => { const x = d.bordereauxCimr.find(y => y.id === b.id); if (x) x.lignes = lignes; });
    toast('Bordereau actualisé depuis les bulletins de paie.');
  };

  const columns: Column<BordereauCimr>[] = [
    { key: 'id', label: 'N° bordereau', className: 'mono', render: b => b.id },
    { key: 'mois', label: 'Mois', className: 'mono', filter: { value: b => b.mois, placeholder: 'Mois (AAAA-MM)' }, render: b => b.mois },
    { key: 'nb', label: 'Affiliés', className: 'num', render: b => b.lignes.length },
    { key: 'brut', label: 'Salaire brut', className: 'num', render: b => money(bordereauCimrTotaux(b).brut) },
    { key: 'sal', label: 'Part salariale', className: 'num', render: b => money(bordereauCimrTotaux(b).sal) },
    { key: 'pat', label: 'Part patronale', className: 'num', render: b => money(bordereauCimrTotaux(b).pat) },
    { key: 'total', label: 'Total à payer', className: 'num', render: b => <span style={{ fontWeight: 600 }}>{money(bordereauCimrTotaux(b).total)} DH</span> },
    { key: 'statut', label: 'Statut', filter: { value: b => b.statut, options: STATUTS_BORDEREAU }, render: b => <BordereauStatut statut={b.statut} /> },
    { key: 'date', label: 'Date paiement', render: b => fmtDate(b.datePaiement) },
    { key: 'actions', label: '', nowrap: true, render: b => (<>
      <button className="btn btn-ghost btn-sm" onClick={() => detail(b)}>Détail</button>{' '}
      <button className="btn btn-ghost btn-sm" onClick={() => printDocument(buildBordereauCimrPrintHtml(b, state.societe))}>PDF</button>
      {r.modifier && b.statut === 'À payer' && <>{' '}
        <button className="btn btn-ghost btn-sm" onClick={() => actualiser(b)}>Actualiser</button>{' '}
        <button className="btn btn-accent btn-sm" onClick={() => openModal(<BordereauPaiementForm kind="cimr" id={b.id} />)}>Marquer payé</button>
      </>}
    </>) },
  ];
  const tf = useTableFilters(rows, columns);

  return (<>
    {r.modifier && <PageActions>
      <button className="btn btn-accent" onClick={() => openModal(<BordereauGenerateForm kind="cimr" />)}><PlusIcon /> Générer un bordereau</button>
    </PageActions>}
    <Panel title="Bordereaux CIMR" count={tf.filtered.length}>
      <DataTable tf={tf} columns={columns} rowKey={b => b.id} onRowDoubleClick={detail}
        emptyText="Aucun bordereau CIMR. Générez-en un à partir des bulletins des collaborateurs affiliés." />
    </Panel>
  </>);
}
