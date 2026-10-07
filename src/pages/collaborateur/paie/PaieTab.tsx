/* Collaborateur › Paie : liste des bulletins, formulaire, suppression, bulletin imprimable (clé de droits : collab_paie). */
import { useMemo } from 'react';
import { useRights, useStore } from '../../../data/store';
import { money } from '../../../lib/format';
import { bulletinBrut, bulletinRetenuesDiv, buildBordereauCimrLignes, buildBordereauCnssLignes, calculPaie, collabNom } from '../../../lib/paie';
import { printDocument } from '../../../lib/print';
import { buildBulletinPrintHtml } from '../../../lib/printPaie';
import type { Bulletin } from '../../../lib/types';
import { DataTable, useTableFilters, type Column } from '../../../ui/DataTable';
import { Badge, PageActions, Panel, PlusIcon } from '../../../ui/misc';
import { toast } from '../../../ui/toast';
import { useUI } from '../../../ui/UIProvider';
import BulletinForm from './BulletinForm';

export default function PaieTab() {
  const { state, update } = useStore();
  const r = useRights('collab_paie');
  const { openModal, confirm } = useUI();

  const rows = useMemo(() => [...state.bulletins].sort((a, b) => b.mois.localeCompare(a.mois)), [state.bulletins]);
  const noms = useMemo(() => Array.from(new Set(state.collaborateurs.map(c => `${c.prenom} ${c.nom}`))), [state.collaborateurs]);
  const collab = (b: Bulletin) => state.collaborateurs.find(x => x.id === b.collaborateurId);
  const calc = (b: Bulletin) => { const c = collab(b); return calculPaie(bulletinBrut(b), c ? c.personnesACharge : 0, c ? c.cotiseCimr : false); };

  const ouvrirForm = (id?: string) => {
    if (!id && !state.collaborateurs.some(c => c.statut === 'Actif')) { toast('Ajoutez d’abord un collaborateur actif.'); return; }
    openModal(<BulletinForm editId={id} />);
  };

  async function supprimer(b: Bulletin) {
    const c = collab(b);
    const bord = state.bordereauxCnss.find(x => x.mois === b.mois);
    if (bord && bord.statut === 'Payé') { toast(`Suppression impossible : le bordereau CNSS ${bord.id} de ce mois est déjà payé.`); return; }
    const bordCimr = c && c.cotiseCimr ? state.bordereauxCimr.find(x => x.mois === b.mois) : undefined;
    if (bordCimr && bordCimr.statut === 'Payé') { toast(`Suppression impossible : le bordereau CIMR ${bordCimr.id} de ce mois est déjà payé.`); return; }
    const p = calc(b);
    const net = p.net - bulletinRetenuesDiv(b);
    const pretMontant = (b.retenues || []).filter(x => x.label === 'Prêt social').reduce((s, x) => s + (Number(x.montant) || 0), 0);
    const ok = await confirm({
      title: 'Supprimer ce bulletin ?', danger: true, confirmLabel: 'Supprimer',
      message: <>
        <div className="hint" style={{ marginBottom: 12 }}>
          <strong>{collabNom(state.collaborateurs, b.collaborateurId)}</strong> — {b.mois}<br />
          Brut {money(p.brut)} DH · Net à payer {money(net)} DH · {b.statut}
        </div>
        <div style={{ fontSize: 13 }}>Cette suppression est définitive.</div>
        {pretMontant ? <div className="hint" style={{ marginTop: 10 }}>Le remboursé du prêt sera diminué de {money(pretMontant)} DH (solde recalculé).</div> : null}
        {bord ? <div className="hint" style={{ marginTop: 10 }}>Le bordereau CNSS {bord.id} sera actualisé (ou supprimé s'il ne reste aucun bulletin ce mois-là).</div> : null}
        {bordCimr ? <div className="hint" style={{ marginTop: 10 }}>Le bordereau CIMR {bordCimr.id} sera actualisé (ou supprimé s'il ne reste aucun affilié ce mois-là).</div> : null}
      </>,
    });
    if (!ok) return;
    let msg = 'Bulletin supprimé.';
    update(d => {
      d.bulletins = d.bulletins.filter(x => x.id !== b.id);
      const dc = d.collaborateurs.find(x => x.id === b.collaborateurId);
      if (dc && pretMontant) {
        dc.pretRembourse = Math.max(0, Math.round(((dc.pretRembourse || 0) - pretMontant) * 100) / 100);
        dc.pretSolde = Math.max(0, Math.round(((dc.pretCapital || 0) - dc.pretRembourse) * 100) / 100);
      }
      const dBord = d.bordereauxCnss.find(x => x.mois === b.mois);
      if (dBord) {
        const lignes = buildBordereauCnssLignes(d.bulletins, d.collaborateurs, d.pointages, dBord.mois);
        if (lignes.length) { dBord.lignes = lignes; msg += ` Bordereau ${dBord.id} actualisé.`; }
        else { d.bordereauxCnss = d.bordereauxCnss.filter(x => x.id !== dBord.id); msg += ` Bordereau ${dBord.id} supprimé (plus aucun bulletin ce mois).`; }
      }
      const dBordC = dc && dc.cotiseCimr ? d.bordereauxCimr.find(x => x.mois === b.mois) : undefined;
      if (dBordC) {
        const lignes = buildBordereauCimrLignes(d.bulletins, d.collaborateurs, dBordC.mois);
        if (lignes.length) { dBordC.lignes = lignes; msg += ` Bordereau ${dBordC.id} actualisé.`; }
        else { d.bordereauxCimr = d.bordereauxCimr.filter(x => x.id !== dBordC.id); msg += ` Bordereau ${dBordC.id} supprimé (plus aucun affilié ce mois).`; }
      }
    });
    toast(msg);
  }

  const columns: Column<Bulletin>[] = [
    { key: 'collab', label: 'Collaborateur', filter: { value: b => collabNom(state.collaborateurs, b.collaborateurId), options: noms, placeholder: 'Tous' }, render: b => collabNom(state.collaborateurs, b.collaborateurId) },
    { key: 'mois', label: 'Mois', className: 'mono', filter: { value: b => b.mois, placeholder: 'Mois (AAAA-MM)' }, render: b => b.mois },
    { key: 'brut', label: 'Brut', className: 'num', render: b => money(calc(b).brut) },
    { key: 'cnss', label: 'CNSS', className: 'num', render: b => money(calc(b).cnss) },
    { key: 'amo', label: 'AMO', className: 'num', render: b => money(calc(b).amo) },
    { key: 'cimr', label: 'CIMR', className: 'num', render: b => { const v = calc(b).cimr; return v ? money(v) : '—'; } },
    { key: 'ir', label: 'IR', className: 'num', render: b => money(calc(b).ir) },
    { key: 'autres', label: 'Autres ret.', className: 'num', render: b => { const v = bulletinRetenuesDiv(b); return v ? money(v) : '—'; } },
    { key: 'net', label: 'Net', className: 'num', render: b => <span style={{ fontWeight: 600 }}>{money(calc(b).net - bulletinRetenuesDiv(b))}</span> },
    { key: 'statut', label: 'Statut', render: b => <Badge cls={b.statut === 'Payé' ? 'badge-facture' : 'badge-cree'}>{b.statut}</Badge> },
    { key: 'actions', label: '', nowrap: true, render: b => (<>
      <button className="btn btn-ghost btn-sm" onClick={() => ouvrirForm(b.id)}>{r.modifier ? 'Modifier' : 'Voir'}</button>{' '}
      <button className="btn btn-ghost btn-sm" onClick={() => printDocument(buildBulletinPrintHtml(b, state))}>PDF</button>
      {r.supprimer && <>{' '}<button className="btn btn-danger btn-sm" onClick={() => void supprimer(b)}>Supprimer</button></>}
    </>) },
  ];
  const tf = useTableFilters(rows, columns);

  return (<>
    {r.modifier && <PageActions>
      <button className="btn btn-accent" onClick={() => ouvrirForm()}><PlusIcon /> Générer un bulletin</button>
    </PageActions>}
    <Panel title="Bulletins de paie" count={tf.filtered.length}>
      <DataTable tf={tf} columns={columns} rowKey={b => b.id} onRowDoubleClick={r.modifier ? (b => ouvrirForm(b.id)) : undefined}
        emptyText="Aucun bulletin ne correspond aux filtres." />
    </Panel>
  </>);
}
