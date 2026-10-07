/* Impôts et taxes + panneau « impôt libératoire » de l'auto-entrepreneur (portage du prototype, lignes 2701–2902). */
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useStore, useRights } from '../../data/store';
import type { Impot, State } from '../../lib/types';
import { fmtDate, money, todayIso } from '../../lib/format';
import { IMPOT_BADGE, IMPOT_MODES, IMPOT_ORDRE, IMPOT_TYPES, impotStatut, nextImpotId } from '../../lib/impots';
import { LIB_BADGE, LIB_RETENUE, LIB_SEUIL, dashboardYears, libActif, libNature, libPeriode } from '../../lib/liberatoire';
import { useUI } from '../../ui/UIProvider';
import { Modal } from '../../ui/Modal';
import { toast } from '../../ui/toast';
import { validateRequired } from '../../ui/validate';
import { DataTable, useTableFilters, type Column } from '../../ui/DataTable';
import { AddButton, Badge, EmptyState, Field, PageActions, Panel } from '../../ui/misc';

type Update = (fn: (draft: State) => void) => void;

/* ───────── Fenêtres (affichées hors du magasin : tout leur est passé en props) ───────── */
function ImpotForm({ impot, editing, update }: { impot: Impot; editing: boolean; update: Update }) {
  const { closeModal } = useUI();
  const bodyRef = useRef<HTMLDivElement>(null);
  const [type, setType] = useState(impot.type);
  const [periode, setPeriode] = useState(impot.periode);
  const [echeance, setEcheance] = useState(impot.echeance);
  const [montant, setMontant] = useState(String(impot.montant || 0));
  const save = () => {
    if (!validateRequired(bodyRef.current)) return;
    const m = Number(montant) || 0;
    if (m <= 0) { toast('Le montant dû doit être supérieur à 0.'); return; }
    const data = { type, periode: periode.trim(), echeance, montant: m };
    update(draft => {
      if (editing) { const t = draft.impots.find(i => i.id === impot.id); if (t) Object.assign(t, data); }
      else draft.impots.unshift({ ...impot, ...data });
    });
    closeModal();
    toast(editing ? `${impot.id} modifié.` : `${impot.id} créé.`);
  };
  return (
    <Modal title={editing ? `Modifier ${impot.id}` : 'Ajouter un impôt ou une taxe'} size="sm" onClose={closeModal} bodyRef={bodyRef}
      footer={<><button className="btn btn-ghost" onClick={closeModal}>Annuler</button><button className="btn btn-accent" onClick={save}>Enregistrer</button></>}>
      <div className="field-row">
        <Field label="Code"><input value={impot.id} disabled readOnly /></Field>
        <Field label="Impôt / taxe"><select required value={type} onChange={e => setType(e.target.value)}>{IMPOT_TYPES.map(t => <option key={t}>{t}</option>)}</select></Field>
      </div>
      <div className="field-row">
        <Field label="Période concernée"><input required placeholder="ex. T3 2026, Année 2026, Août 2026" value={periode} onChange={e => setPeriode(e.target.value)} /></Field>
        <Field label="Date d'échéance"><input required type="date" value={echeance} onChange={e => setEcheance(e.target.value)} /></Field>
      </div>
      <Field label="Montant dû (DH)"><input required type="number" min="0" step="0.01" value={montant} onChange={e => setMontant(e.target.value)} /></Field>
      {impot.paiement && <div className="hint">Cette échéance est payée : pour changer le paiement, utilisez « Annuler le paiement » puis « Marquer payé ».</div>}
    </Modal>
  );
}

function PaiementForm({ impot, update }: { impot: Impot; update: Update }) {
  const { closeModal } = useUI();
  const bodyRef = useRef<HTMLDivElement>(null);
  const [date, setDate] = useState(todayIso());
  const [montant, setMontant] = useState(String(impot.montant));
  const [mode, setMode] = useState(IMPOT_MODES[0]);
  const [reference, setReference] = useState('');
  const save = () => {
    if (!validateRequired(bodyRef.current)) return;
    const m = Number(montant) || 0;
    if (m <= 0) { toast('Le montant payé doit être supérieur à 0.'); return; }
    const paiement = { date, montant: m, mode, reference: reference.trim() };
    update(draft => { const t = draft.impots.find(i => i.id === impot.id); if (t) t.paiement = paiement; });
    closeModal();
    toast(`${impot.id} marqué comme payé.`);
  };
  return (
    <Modal title={`Paiement — ${impot.id}`} size="sm" onClose={closeModal} bodyRef={bodyRef}
      footer={<><button className="btn btn-ghost" onClick={closeModal}>Annuler</button><button className="btn btn-accent" onClick={save}>Enregistrer</button></>}>
      <div className="hint" style={{ marginBottom: 14 }}><strong>{impot.id}</strong> — {impot.type} · {impot.periode} · échéance {fmtDate(impot.echeance)} · {money(impot.montant)} DH</div>
      <div className="field-row">
        <Field label="Date de paiement"><input required type="date" value={date} onChange={e => setDate(e.target.value)} /></Field>
        <Field label="Montant payé (DH)"><input required type="number" min="0" step="0.01" value={montant} onChange={e => setMontant(e.target.value)} /></Field>
      </div>
      <div className="field-row">
        <Field label="Mode de paiement"><select required value={mode} onChange={e => setMode(e.target.value)}>{IMPOT_MODES.map(m => <option key={m}>{m}</option>)}</select></Field>
        <Field label="Référence de la quittance"><input required value={reference} onChange={e => setReference(e.target.value)} /></Field>
      </div>
      <div className="hint">Le montant payé peut différer du montant dû (majorations, pénalités de retard).</div>
    </Modal>
  );
}

/** Confirmation avec libellés de boutons propres (« Garder le paiement » / « Annuler le paiement »). */
function ConfirmModal({ title, children, keepLabel, confirmLabel, onConfirm }: { title: string; children: ReactNode; keepLabel: string; confirmLabel: string; onConfirm: () => void }) {
  const { closeModal } = useUI();
  return (
    <Modal title={title} size="sm" onClose={closeModal}
      footer={<><button className="btn btn-ghost" onClick={closeModal}>{keepLabel}</button><button className="btn btn-danger" onClick={() => { onConfirm(); closeModal(); }}>{confirmLabel}</button></>}>
      {children}
    </Modal>
  );
}

/* ───────── Panneau impôt libératoire ───────── */
function Kpi({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="kpi-card">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" style={accent ? { color: accent } : undefined}>{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

function LiberatoirePanel({ state, update, canEdit }: { state: State; update: Update; canEdit: boolean }) {
  const annees = useMemo(() => [...new Set([String(new Date().getFullYear()), ...dashboardYears(state.devis)])].sort().reverse(), [state.devis]);
  const [anneeSel, setAnnee] = useState('');
  const [mode, setMode] = useState('A');
  const annee = anneeSel || annees[0];
  const L = libPeriode(state.devis, state.societe, annee, mode);
  const nat = L.nat, natKey = libNature(state.societe);
  const existant = state.impots.find(x => x.type === IMPOT_TYPES[0] && x.periode === L.info.label);

  const creerEcheance = () => {
    if (!libActif(state.societe)) return;
    if (L.tot.impot <= 0) { toast('Aucun impôt libératoire à déclarer sur cette période.'); return; }
    if (existant) {
      if (existant.paiement) return;
      update(draft => { const t = draft.impots.find(i => i.id === existant.id); if (t) t.montant = L.tot.impot; });
      toast(`${existant.id} mis à jour : ${money(L.tot.impot)} DH.`);
      return;
    }
    const x: Impot = { id: nextImpotId(state.impots), type: IMPOT_TYPES[0], periode: L.info.label, echeance: L.info.echeance, montant: L.tot.impot, paiement: null };
    update(draft => { draft.impots.unshift(x); });
    toast(`${x.id} créé : ${money(x.montant)} DH.`);
  };

  let action: ReactNode = null;
  if (existant && existant.paiement) action = <span className="hint">Échéance {existant.id} déjà payée ({money(existant.paiement.montant)} DH).</span>;
  else if (canEdit && existant) action = <button className="btn btn-accent btn-sm" onClick={creerEcheance}>Mettre à jour l'échéance {existant.id} ({money(existant.montant)} → {money(L.tot.impot)} DH)</button>;
  else if (canEdit) action = <button className="btn btn-accent btn-sm" onClick={creerEcheance}>Créer l'échéance d'IR — {L.info.label}</button>;

  const totCumul = L.rows.reduce((t, x) => t + x.cumul, 0);
  const clientUnique = nat.seuil && L.rows.some(r => r.statut === 'Seuil dépassé' && r.cumul > 0.5 * totCumul);
  const ret = LIB_RETENUE * 100;
  return (
    <div className="panel" style={{ marginBottom: 18 }} data-testid="lib-panel">
      <div className="panel-head"><h2>Impôt libératoire — auto-entrepreneur</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select aria-label="Année" value={annee} onChange={e => setAnnee(e.target.value)}>{annees.map(a => <option key={a}>{a}</option>)}</select>
          <select aria-label="Période" value={mode} onChange={e => setMode(e.target.value)}>
            {[['A', 'Année entière'], ['1', 'T1'], ['2', 'T2'], ['3', 'T3'], ['4', 'T4']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      </div>
      <div className="hint" style={{ padding: '0 18px 12px' }}>
        Impôt calculé sur le <strong>chiffre d'affaires encaissé</strong> (facture encaissée à l'échéance de son délai de paiement), sans charges déductibles.{' '}
        Nature d'activité : <strong>{nat.label}</strong> — taux <strong>{nat.tauxLabel}</strong> <span style={{ color: 'var(--ink-soft)' }}>(à modifier dans « Mon société »)</span>.{' '}
        {nat.seuil ? `Règle des ${money(LIB_SEUIL)} DH par client : la part encaissée au-delà de ce seuil sur l'année ne bénéficie plus du ${nat.tauxLabel} et subit une retenue à la source de ${ret} %, opérée par le client. ` : ''}
        Estimation indicative, à faire valider par votre comptable.
      </div>
      <div className="kpi-grid" style={{ padding: '0 18px' }}>
        <Kpi label={`CA encaissé (${L.info.label})`} value={`${money(L.tot.encaisse)} DH`} sub={`${L.rows.length} client(s)`} />
        <Kpi label="Impôt libératoire à payer" value={`${money(L.tot.impot)} DH`} sub={`${nat.tauxLabel} sur ${money(L.tot.base)} DH`} accent="var(--primary-2)" />
        <Kpi label={`Retenue à la source (${ret} %)`} value={`${money(L.tot.retenue)} DH`} sub={natKey === 'services' ? `sur ${money(L.tot.exces)} DH au-delà du seuil` : 'Non applicable'} accent={L.tot.retenue ? 'var(--danger)' : undefined} />
        <Kpi label="Impôt total" value={`${money(L.tot.impot + L.tot.retenue)} DH`} sub="Libératoire + retenue" accent="var(--warn)" />
      </div>
      <div className="table-wrap" style={{ marginTop: 12 }}><table>
        <thead><tr>
          <th>Client</th><th>CA encaissé (période)</th><th>Cumul annuel encaissé</th><th>Facturé en cours</th><th>Base au {nat.tauxLabel}</th>
          <th>Au-delà de {money(LIB_SEUIL)} DH</th><th>Retenue {ret} %</th><th>Impôt libératoire</th><th>Situation</th>
        </tr></thead>
        <tbody>
          {L.rows.length ? (<>
            {L.rows.map(r => (
              <tr key={r.client}>
                <td data-label="Client">{r.client}</td>
                <td data-label="CA encaissé (période)" className="num">{money(r.encaisse)} DH</td>
                <td data-label="Cumul annuel encaissé" className="num">{money(r.cumul)} DH</td>
                <td data-label="Facturé en cours" className="num">{money(r.enCours)} DH</td>
                <td data-label={`Base au ${nat.tauxLabel}`} className="num">{money(r.base)} DH</td>
                <td data-label={`Au-delà de ${money(LIB_SEUIL)} DH`} className="num">{money(r.exces)} DH</td>
                <td data-label={`Retenue ${ret} %`} className="num" style={r.retenue ? { color: 'var(--danger)', fontWeight: 600 } : undefined}>{money(r.retenue)} DH</td>
                <td data-label="Impôt libératoire" className="num">{money(r.impot)} DH</td>
                <td data-label="Situation">{nat.seuil ? <Badge cls={LIB_BADGE[r.statut]}>{r.statut}</Badge> : '—'}</td>
              </tr>
            ))}
            <tr style={{ fontWeight: 700 }}>
              <td>Total</td><td className="num">{money(L.tot.encaisse)} DH</td><td></td><td className="num">{money(L.tot.enCours)} DH</td>
              <td className="num">{money(L.tot.base)} DH</td><td className="num">{money(L.tot.exces)} DH</td><td className="num">{money(L.tot.retenue)} DH</td>
              <td className="num">{money(L.tot.impot)} DH</td><td></td>
            </tr>
          </>) : <tr><td colSpan={9}><EmptyState>Aucun CA encaissé sur cette période.</EmptyState></td></tr>}
        </tbody>
      </table></div>
      {clientUnique && <div className="hint" style={{ padding: '12px 18px 0', color: 'var(--danger)' }}>Un client unique dépasse {money(LIB_SEUIL)} DH par an : l'excédent subit 30 % de retenue, ce qui fait perdre son intérêt fiscal au statut d'auto-entrepreneur. À étudier avec votre comptable.</div>}
      <div style={{ padding: '12px 18px 16px' }}>{action}</div>
    </div>
  );
}

/* ───────── Page ───────── */
export default function ImpotsPage() {
  const { state, update } = useStore();
  const r = useRights('impots');
  const { openModal } = useUI();
  const today = todayIso();

  const openForm = (x?: Impot) => {
    const impot: Impot = x || { id: nextImpotId(state.impots), type: IMPOT_TYPES[0], periode: '', echeance: '', montant: 0, paiement: null };
    openModal(<ImpotForm impot={impot} editing={!!x} update={update} />);
  };
  const annulerPaiement = (x: Impot) => openModal(
    <ConfirmModal title="Annuler ce paiement ?" keepLabel="Garder le paiement" confirmLabel="Annuler le paiement" onConfirm={() => {
      update(draft => { const t = draft.impots.find(i => i.id === x.id); if (t) t.paiement = null; });
      toast(`Paiement de ${x.id} annulé.`);
    }}>
      <div className="hint" style={{ marginBottom: 12 }}><strong>{x.id}</strong> — {x.type} · {x.periode}<br />Payé le {fmtDate(x.paiement?.date)} · {money(x.paiement?.montant)} DH · quittance {x.paiement?.reference}</div>
      <div style={{ fontSize: 13 }}>L'échéance repassera à « À payer » (ou « En retard » si sa date est dépassée).</div>
    </ConfirmModal>);
  const supprimer = (x: Impot) => openModal(
    <ConfirmModal title="Supprimer cet impôt ou cette taxe ?" keepLabel="Annuler" confirmLabel="Supprimer" onConfirm={() => {
      update(draft => { draft.impots = draft.impots.filter(i => i.id !== x.id); });
      toast(`${x.id} supprimé.`);
    }}>
      <div className="hint" style={{ marginBottom: 12 }}><strong>{x.id}</strong> — {x.type} · {x.periode}<br />{money(x.montant)} DH{x.paiement ? ' · payé' : ''}</div>
      <div style={{ fontSize: 13 }}>Cette suppression est définitive{x.paiement ? ' ; le paiement enregistré disparaîtra aussi de la trésorerie' : ''}.</div>
    </ConfirmModal>);

  const rows = useMemo(() => [...state.impots].sort((a, b) => IMPOT_ORDRE[impotStatut(a)] - IMPOT_ORDRE[impotStatut(b)] || a.echeance.localeCompare(b.echeance)), [state.impots]);
  const columns: Column<Impot>[] = [
    { key: 'id', label: 'Code', className: 'mono', render: x => x.id, filter: { value: x => x.id } },
    { key: 'type', label: 'Impôt / taxe', render: x => x.type, filter: { value: x => x.type, options: IMPOT_TYPES } },
    { key: 'periode', label: 'Période', render: x => x.periode, filter: { value: x => x.periode } },
    { key: 'echeance', label: 'Échéance', render: x => <span style={impotStatut(x, today) === 'En retard' ? { color: 'var(--danger)', fontWeight: 600 } : undefined}>{fmtDate(x.echeance)}</span>, filter: { value: x => fmtDate(x.echeance) } },
    { key: 'montant', label: 'Montant dû', className: 'num', render: x => `${money(x.montant)} DH` },
    { key: 'statut', label: 'Statut', render: x => { const s = impotStatut(x, today); return <Badge cls={IMPOT_BADGE[s]}>{s}</Badge>; }, filter: { value: x => impotStatut(x, today), options: ['À payer', 'En retard', 'Payé'] } },
    { key: 'datePaiement', label: 'Date de paiement', render: x => x.paiement ? fmtDate(x.paiement.date) : '—' },
    { key: 'montantPaye', label: 'Montant payé', className: 'num', render: x => x.paiement ? `${money(x.paiement.montant)} DH` : '—' },
    { key: 'reference', label: 'Réf. quittance', className: 'mono', render: x => x.paiement ? x.paiement.reference : '—' },
    { key: 'actions', label: '', nowrap: true, render: x => (<>
      {r.modifier && <button className="btn btn-ghost btn-sm" onClick={() => openForm(x)}>Modifier</button>}{' '}
      {r.modifier && (x.paiement
        ? <button className="btn btn-ghost btn-sm" onClick={() => annulerPaiement(x)}>Annuler le paiement</button>
        : <button className="btn btn-accent btn-sm" onClick={() => openModal(<PaiementForm impot={x} update={update} />)}>Marquer payé</button>)}{' '}
      {r.supprimer && <button className="btn btn-danger btn-sm" onClick={() => supprimer(x)}>Supprimer</button>}
    </>) },
  ];
  const tf = useTableFilters(rows, columns);
  const tot = tf.filtered.reduce((t, x) => {
    t.du += x.montant;
    if (x.paiement) t.paye += x.paiement.montant;
    else { t.reste += x.montant; if (impotStatut(x, today) === 'En retard') t.retard += x.montant; }
    return t;
  }, { du: 0, paye: 0, reste: 0, retard: 0 });

  return (<>
    {r.modifier && <PageActions><AddButton onClick={() => openForm()}>Ajouter un impôt ou une taxe</AddButton></PageActions>}
    {libActif(state.societe) && <LiberatoirePanel state={state} update={update} canEdit={r.modifier} />}
    <Panel title="Impôts et taxes" count={tf.filtered.length} actions={
      <div style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>
        Total dû <strong style={{ color: 'var(--ink)' }}>{money(tot.du)} DH</strong> · payé <strong style={{ color: 'var(--success)' }}>{money(tot.paye)} DH</strong> · reste à payer <strong style={{ color: 'var(--warn)' }}>{money(tot.reste)} DH</strong>
        {tot.retard > 0 && <> · dont en retard <strong style={{ color: 'var(--danger)' }}>{money(tot.retard)} DH</strong></>}
      </div>
    }>
      <DataTable tf={tf} columns={columns} rowKey={x => x.id} onRowDoubleClick={r.modifier ? openForm : undefined} emptyText="Aucun impôt ou taxe ne correspond aux filtres." />
    </Panel>
  </>);
}
