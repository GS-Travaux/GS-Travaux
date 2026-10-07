/* Collaborateur › Bordereaux de paiement CNSS (clé de droits : collab_cnss). */
import { useMemo } from 'react';
import { useRights, useStore } from '../../../data/store';
import { fmtDate, money } from '../../../lib/format';
import { bordereauCnssTotaux, buildBordereauCnssLignes } from '../../../lib/paie';
import { printDocument } from '../../../lib/print';
import { buildBordereauCnssPrintHtml } from '../../../lib/printPaie';
import type { BordereauCnss } from '../../../lib/types';
import { DataTable, useTableFilters, type Column } from '../../../ui/DataTable';
import { Modal } from '../../../ui/Modal';
import { PageActions, Panel, PlusIcon } from '../../../ui/misc';
import { toast } from '../../../ui/toast';
import { useUI } from '../../../ui/UIProvider';
import { BordereauGenerateForm, BordereauPaiementForm, BordereauStatut, STATUTS_BORDEREAU } from './shared';

function CnssDetail({ id }: { id: string }) {
  const { state } = useStore();
  const { closeModal } = useUI();
  const b = state.bordereauxCnss.find(x => x.id === id);
  if (!b) return null;
  const t = bordereauCnssTotaux(b);
  const sum = (k: 'psSal' | 'psPat' | 'amoSal' | 'amoPat') => b.lignes.reduce((s, l) => s + l[k], 0);
  const branches: [string, number, number][] = [
    ['Prestations sociales (4,48 % + 8,98 %, plafonnées à 6 000 DH)', sum('psSal'), sum('psPat')],
    ['Allocations familiales (6,40 %)', 0, t.af],
    ['AMO (2,26 % + 4,11 %)', sum('amoSal'), sum('amoPat')],
    ['Taxe de formation professionnelle (1,60 %)', 0, t.tfp],
  ];
  return (
    <Modal title={`Bordereau ${b.id}`} onClose={closeModal}
      footer={<>
        <button className="btn btn-ghost" onClick={closeModal}>Fermer</button>
        <button className="btn btn-primary" onClick={() => printDocument(buildBordereauCnssPrintHtml(b, state.societe))}>PDF</button>
      </>}>
      <div className="hint" style={{ marginBottom: 14 }}>
        Mois : <strong>{b.mois}</strong> · Statut : <BordereauStatut statut={b.statut} />
        {b.statut === 'Payé' && <> · Payé le {fmtDate(b.datePaiement)} ({b.modePaiement})</>}
      </div>
      <div className="h-scroll" style={{ marginTop: 0 }}>
        <table className="pdoc-table">
          <thead><tr><th>Branche</th><th className="num">Part salariale</th><th className="num">Part patronale</th><th className="num">Total</th></tr></thead>
          <tbody>
            {branches.map(([lib, sal, pat]) => (
              <tr key={lib}><td>{lib}</td><td className="num">{money(sal)}</td><td className="num">{money(pat)}</td><td className="num">{money(sal + pat)}</td></tr>
            ))}
            <tr className="pdoc-total"><td>Total à payer à la CNSS</td><td className="num">{money(t.salariale)}</td><td className="num">{money(t.patronale)}</td><td className="num">{money(t.total)} DH</td></tr>
          </tbody>
        </table>
      </div>
      <div className="form-section-title">Salariés déclarés</div>
      <div className="h-scroll" style={{ marginTop: 0 }}>
        <table className="pdoc-table">
          <thead><tr><th>N° CNSS</th><th>Salarié</th><th className="num">Jours</th><th className="num">Salaire réel</th><th className="num">Salaire plafonné</th><th className="num">Cotisations</th></tr></thead>
          <tbody>
            {b.lignes.map(l => (
              <tr key={l.collaborateurId}>
                <td className="mono">{l.cnssNum || '—'}</td><td>{l.nom}</td><td className="num">{l.jours}</td>
                <td className="num">{money(l.brut)}</td><td className="num">{money(l.brutPlafonne)}</td>
                <td className="num">{money(l.psSal + l.psPat + l.af + l.tfp + l.amoSal + l.amoPat)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="hint" style={{ marginTop: 10 }}>Jours déclarés : 26 pour les salariés mensuels/horaires, jours pointés pour les journaliers. CIMR exclue (non versée à la CNSS).</div>
    </Modal>
  );
}

export default function CnssTab() {
  const { state, update } = useStore();
  const r = useRights('collab_cnss');
  const { openModal } = useUI();

  const rows = useMemo(() => [...state.bordereauxCnss].sort((a, b) => b.mois.localeCompare(a.mois)), [state.bordereauxCnss]);

  const detail = (b: BordereauCnss) => openModal(<CnssDetail id={b.id} />);
  const actualiser = (b: BordereauCnss) => {
    const lignes = buildBordereauCnssLignes(state.bulletins, state.collaborateurs, state.pointages, b.mois);
    if (!lignes.length) { toast('Aucun bulletin de paie pour ce mois.'); return; }
    update(d => { const x = d.bordereauxCnss.find(y => y.id === b.id); if (x) x.lignes = lignes; });
    toast('Bordereau actualisé depuis les bulletins de paie.');
  };

  const columns: Column<BordereauCnss>[] = [
    { key: 'id', label: 'N° bordereau', className: 'mono', render: b => b.id },
    { key: 'mois', label: 'Mois', className: 'mono', filter: { value: b => b.mois, placeholder: 'Mois (AAAA-MM)' }, render: b => b.mois },
    { key: 'nb', label: 'Salariés', className: 'num', render: b => b.lignes.length },
    { key: 'brut', label: 'Salaire brut', className: 'num', render: b => money(bordereauCnssTotaux(b).brut) },
    { key: 'sal', label: 'Cotis. salariales', className: 'num', render: b => money(bordereauCnssTotaux(b).salariale) },
    { key: 'pat', label: 'Cotis. patronales', className: 'num', render: b => money(bordereauCnssTotaux(b).patronale) },
    { key: 'total', label: 'Total à payer', className: 'num', render: b => <span style={{ fontWeight: 600 }}>{money(bordereauCnssTotaux(b).total)} DH</span> },
    { key: 'statut', label: 'Statut', filter: { value: b => b.statut, options: STATUTS_BORDEREAU }, render: b => <BordereauStatut statut={b.statut} /> },
    { key: 'date', label: 'Date paiement', render: b => fmtDate(b.datePaiement) },
    { key: 'actions', label: '', nowrap: true, render: b => (<>
      <button className="btn btn-ghost btn-sm" onClick={() => detail(b)}>Détail</button>{' '}
      <button className="btn btn-ghost btn-sm" onClick={() => printDocument(buildBordereauCnssPrintHtml(b, state.societe))}>PDF</button>
      {r.modifier && b.statut === 'À payer' && <>{' '}
        <button className="btn btn-ghost btn-sm" onClick={() => actualiser(b)}>Actualiser</button>{' '}
        <button className="btn btn-accent btn-sm" onClick={() => openModal(<BordereauPaiementForm kind="cnss" id={b.id} />)}>Marquer payé</button>
      </>}
    </>) },
  ];
  const tf = useTableFilters(rows, columns);

  return (<>
    {r.modifier && <PageActions>
      <button className="btn btn-accent" onClick={() => openModal(<BordereauGenerateForm kind="cnss" />)}><PlusIcon /> Générer un bordereau</button>
    </PageActions>}
    <Panel title="Bordereaux de paiement CNSS" count={tf.filtered.length}>
      <DataTable tf={tf} columns={columns} rowKey={b => b.id} onRowDoubleClick={detail}
        emptyText="Aucun bordereau. Générez-en un à partir des bulletins de paie d'un mois." />
    </Panel>
  </>);
}
