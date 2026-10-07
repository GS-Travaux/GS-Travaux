/* Charges d'exploitation : achats consommables / autres achats (portage du prototype, lignes 2538–2699). */
import { useMemo, useRef, useState } from 'react';
import { useStore, useRights } from '../../data/store';
import type { Achat, State } from '../../lib/types';
import { fmtDate, money, todayIso } from '../../lib/format';
import { ACHAT_MODES, ACHAT_TVA, ACHAT_TYPES, ACHAT_UNITES, achatAffectationLabel, achatMontants, nextAchatId } from '../../lib/achats';
import { useUI } from '../../ui/UIProvider';
import { Modal } from '../../ui/Modal';
import { toast } from '../../ui/toast';
import { validateRequired } from '../../ui/validate';
import { DataTable, useTableFilters, type Column } from '../../ui/DataTable';
import { AddButton, Badge, Field, PageActions, Panel } from '../../ui/misc';

type AchatType = 'consommable' | 'autre';
type Update = (fn: (draft: State) => void) => void;

/* Fenêtre affichée hors du magasin : état et update lui sont passés en props. */
function AchatForm({ type, achat, editing, state, update }: { type: AchatType; achat: Achat; editing: boolean; state: State; update: Update }) {
  const { closeModal } = useUI();
  const bodyRef = useRef<HTMLDivElement>(null);
  const cfg = ACHAT_TYPES[type];
  const a = achat;
  const [statut, setStatut] = useState(a.statut);
  const [date, setDate] = useState(a.date);
  const [fournisseurId, setFournisseurId] = useState(a.fournisseurId);
  const [numFacture, setNumFacture] = useState(a.numFacture);
  const [mode, setMode] = useState(a.modePaiement);
  const [designation, setDesignation] = useState(a.designation);
  const [categorie, setCategorie] = useState(a.categorie);
  const [qte, setQte] = useState(String(a.quantite));
  const [unite, setUnite] = useState(a.unite);
  const [pu, setPu] = useState(String(a.prixUnitaire));
  const [tva, setTva] = useState(String(a.tva));
  const [affectation, setAffectation] = useState(a.affectation || 'FG');
  const m = achatMontants({ quantite: Number(qte), prixUnitaire: Number(pu), tva: Number(tva) });
  const fournKnown = state.fournisseurs.some(x => x.id === fournisseurId);

  const save = () => {
    if (!validateRequired(bodyRef.current)) return;
    const quantite = Number(qte) || 0, prix = Number(pu) || 0;
    if (quantite <= 0) { toast('La quantité doit être supérieure à 0.'); return; }
    if (prix <= 0) { toast('Le prix unitaire doit être supérieur à 0.'); return; }
    const data: Partial<Achat> = {
      date, fournisseurId, numFacture: numFacture.trim(), modePaiement: mode, designation: designation.trim(), categorie,
      quantite, unite, prixUnitaire: prix, tva: Number(tva), affectation, statut,
    };
    update(draft => {
      if (editing) { const t = draft.achats.find(x => x.id === a.id); if (t) Object.assign(t, data); }
      else draft.achats.unshift({ ...a, ...data } as Achat);
    });
    closeModal();
    toast(editing ? `${a.id} modifié.` : `${a.id} créé.`);
  };

  return (
    <Modal title={editing ? `Modifier ${a.id}` : 'Nouvel achat'} onClose={closeModal} bodyRef={bodyRef}
      footer={<>
        <button className="btn btn-ghost" onClick={closeModal}>Annuler</button>
        <button className="btn btn-accent" onClick={save}>Enregistrer</button>
      </>}>
      <div className="field-row">
        <Field label="Code"><input value={a.id} disabled readOnly /></Field>
        <Field label="Statut"><select required value={statut} onChange={e => setStatut(e.target.value)}>{['À payer', 'Payé'].map(s => <option key={s}>{s}</option>)}</select></Field>
      </div>
      <div className="field-row">
        <Field label="Date d'achat"><input required type="date" value={date} onChange={e => setDate(e.target.value)} /></Field>
        <Field label="Fournisseur"><select required value={fournisseurId} onChange={e => setFournisseurId(e.target.value)}>
          {(!editing || !fournKnown) && <option value="">Sélectionner…</option>}
          {state.fournisseurs.map(x => <option key={x.id} value={x.id}>{x.nom}</option>)}
        </select></Field>
      </div>
      <div className="field-row">
        <Field label="N° facture / bon de livraison"><input required value={numFacture} onChange={e => setNumFacture(e.target.value)} /></Field>
        <Field label="Mode de paiement"><select required value={mode} onChange={e => setMode(e.target.value)}>{ACHAT_MODES.map(x => <option key={x}>{x}</option>)}</select></Field>
      </div>
      <div className="field-row">
        <Field label="Désignation"><input required value={designation} onChange={e => setDesignation(e.target.value)} /></Field>
        <Field label="Catégorie"><select required value={categorie} onChange={e => setCategorie(e.target.value)}>{cfg.cats.map(c => <option key={c}>{c}</option>)}</select></Field>
      </div>
      <div className="field-row-3">
        <Field label="Quantité"><input required type="number" min="0" step="0.01" value={qte} onChange={e => setQte(e.target.value)} /></Field>
        <Field label="Unité"><select required value={unite} onChange={e => setUnite(e.target.value)}>{ACHAT_UNITES.map(u => <option key={u}>{u}</option>)}</select></Field>
        <Field label="Prix unitaire HT (DH)"><input required type="number" min="0" step="0.01" value={pu} onChange={e => setPu(e.target.value)} /></Field>
      </div>
      <div className="field-row">
        <Field label="TVA (%)"><select required value={tva} onChange={e => setTva(e.target.value)}>{ACHAT_TVA.map(t => <option key={t} value={t}>{t} %</option>)}</select></Field>
        <Field label="Affectation"><select required value={affectation} onChange={e => setAffectation(e.target.value)}>
          <option value="FG">Frais généraux</option>
          {state.devis.filter(d => d.statut !== 'Annulé').map(d => <option key={d.id} value={d.id}>{d.numero} — {d.client}</option>)}
        </select></Field>
      </div>
      <div className="hint" data-testid="achat-hint">Montant HT <strong>{money(m.ht)} DH</strong> · TVA <strong>{money(m.tva)} DH</strong> · Montant TTC <strong>{money(m.ttc)} DH</strong></div>
    </Modal>
  );
}

export default function AchatsPage({ type }: { type: AchatType }) {
  const { state, update } = useStore();
  const r = useRights('achat_' + type);
  const { openModal, confirm } = useUI();
  const cfg = ACHAT_TYPES[type];
  const fournNom = (id: string) => { const f = state.fournisseurs.find(x => x.id === id); return f ? f.nom : '—'; };
  const rows = useMemo(() => state.achats.filter(a => a.type === type)
    .sort((x, y) => (y.date || '').localeCompare(x.date || '') || y.id.localeCompare(x.id)), [state.achats, type]);

  const openForm = (a?: Achat) => {
    if (!a && !state.fournisseurs.length) { toast('Ajoutez d’abord un fournisseur dans Tiers > Fournisseur.'); return; }
    const achat: Achat = a || {
      id: nextAchatId(state.achats, type), type, date: todayIso(), fournisseurId: '', numFacture: '', designation: '',
      categorie: cfg.cats[0], quantite: 1, unite: 'Unité', prixUnitaire: 0, tva: 20, modePaiement: 'Virement', statut: 'À payer', affectation: 'FG',
    };
    openModal(<AchatForm type={type} achat={achat} editing={!!a} state={state} update={update} />);
  };
  const supprimer = async (a: Achat) => {
    const ok = await confirm({
      title: 'Supprimer cet achat ?', danger: true, confirmLabel: 'Supprimer',
      message: (<>
        <div className="hint" style={{ marginBottom: 12 }}><strong>{a.id}</strong> — {a.designation}<br />{fournNom(a.fournisseurId)} · {money(achatMontants(a).ttc)} DH TTC</div>
        <div style={{ fontSize: 13 }}>Cette suppression est définitive.</div>
      </>),
    });
    if (!ok) return;
    update(draft => { draft.achats = draft.achats.filter(x => x.id !== a.id); });
    toast(`${a.id} supprimé.`);
  };

  const columns: Column<Achat>[] = [
    { key: 'id', label: 'Code', className: 'mono', render: a => a.id, filter: { value: a => a.id } },
    { key: 'date', label: 'Date', render: a => fmtDate(a.date), filter: { value: a => fmtDate(a.date) } },
    { key: 'fournisseur', label: 'Fournisseur', render: a => fournNom(a.fournisseurId), filter: { value: a => fournNom(a.fournisseurId), options: [...new Set(state.fournisseurs.map(x => x.nom))] } },
    { key: 'numFacture', label: 'N° facture', className: 'mono', render: a => a.numFacture, filter: { value: a => a.numFacture } },
    { key: 'designation', label: 'Désignation', render: a => a.designation, filter: { value: a => a.designation } },
    { key: 'categorie', label: 'Catégorie', render: a => a.categorie, filter: { value: a => a.categorie, options: [...cfg.cats], placeholder: 'Toutes' } },
    { key: 'quantite', label: 'Quantité', className: 'num', render: a => `${a.quantite} ${a.unite}` },
    { key: 'ht', label: 'Montant HT', className: 'num', render: a => `${money(achatMontants(a).ht)} DH` },
    { key: 'ttc', label: 'Montant TTC', className: 'num', render: a => `${money(achatMontants(a).ttc)} DH` },
    { key: 'affectation', label: 'Affectation', render: a => achatAffectationLabel(a.affectation, state.devis) },
    { key: 'statut', label: 'Statut', render: a => <Badge cls={a.statut === 'Payé' ? 'badge-facture' : 'badge-soldee'}>{a.statut}</Badge>, filter: { value: a => a.statut, options: ['Payé', 'À payer'] } },
    { key: 'actions', label: '', nowrap: true, render: a => (<>
      {r.modifier && <button className="btn btn-ghost btn-sm" onClick={() => openForm(a)}>Modifier</button>}{' '}
      {r.supprimer && <button className="btn btn-danger btn-sm" onClick={() => supprimer(a)}>Supprimer</button>}
    </>) },
  ];
  const tf = useTableFilters(rows, columns);
  const tot = tf.filtered.reduce((t, a) => { const m = achatMontants(a); t.ht += m.ht; t.ttc += m.ttc; if (a.statut === 'À payer') t.apayer += m.ttc; return t; }, { ht: 0, ttc: 0, apayer: 0 });
  return (<>
    {r.modifier && <PageActions><AddButton onClick={() => openForm()}>{cfg.add}</AddButton></PageActions>}
    <Panel title={cfg.label} count={tf.filtered.length} actions={
      <div style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>
        Total HT <strong style={{ color: 'var(--ink)' }}>{money(tot.ht)} DH</strong> · TTC <strong style={{ color: 'var(--ink)' }}>{money(tot.ttc)} DH</strong> · dont à payer <strong style={{ color: 'var(--warn)' }}>{money(tot.apayer)} DH</strong>
      </div>
    }>
      <DataTable tf={tf} columns={columns} rowKey={a => a.id} onRowDoubleClick={r.modifier ? openForm : undefined} emptyText="Aucun achat ne correspond aux filtres." />
    </Panel>
  </>);
}
