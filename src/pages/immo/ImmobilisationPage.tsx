/* Immobilisation : matériel et outillage / matériel de transport (portage du prototype, lignes 2335–2536). */
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useStore, useRights } from '../../data/store';
import type { Immobilisation, State, Tiers } from '../../lib/types';
import { addJours, fmtDate, money, todayIso } from '../../lib/format';
import { IMMO_CATS, IMMO_ETATS, IMMO_ETAT_BADGE, VEHICULE_TYPES, immoAmort, nextImmoId } from '../../lib/immo';
import { useUI } from '../../ui/UIProvider';
import { Modal } from '../../ui/Modal';
import { toast } from '../../ui/toast';
import { validateRequired } from '../../ui/validate';
import { DataTable, useTableFilters, type Column } from '../../ui/DataTable';
import { AddButton, Badge, Field, PageActions, Panel } from '../../ui/misc';

type Cat = 'materiel' | 'transport';
type Update = (fn: (draft: State) => void) => void;

function fournisseurNom(fournisseurs: Tiers[], id: string): string { const f = fournisseurs.find(x => x.id === id); return f ? f.nom : '—'; }
/** Rouge si l'échéance est dépassée, orange si elle tombe dans les 30 jours. */
function echeanceStyle(dateStr?: string) {
  if (!dateStr) return undefined;
  const today = todayIso();
  if (dateStr < today) return { color: 'var(--danger)', fontWeight: 600 } as const;
  if (dateStr <= addJours(today, 30)) return { color: 'var(--warn)', fontWeight: 600 } as const;
  return undefined;
}
function libelleImmo(a: Immobilisation): string {
  return a.categorie === 'transport' ? `${a.typeVehicule} ${a.marque} (${a.immatriculation})` : (a.designation || '');
}

/* Fenêtre affichée hors du magasin : état et update lui sont passés en props. */
function ImmoForm({ cat, immo, editing, state, update }: { cat: Cat; immo: Immobilisation; editing: boolean; state: State; update: Update }) {
  const { closeModal } = useUI();
  const bodyRef = useRef<HTMLDivElement>(null);
  const a = immo;
  const [etat, setEtat] = useState(a.etat);
  const [designation, setDesignation] = useState(a.designation || '');
  const [typeVehicule, setTypeVehicule] = useState(a.typeVehicule || 'Camionnette');
  const [marque, setMarque] = useState(a.marque || '');
  const [numSerie, setNumSerie] = useState(a.numSerie || '');
  const [immat, setImmat] = useState(a.immatriculation || '');
  const [affectation, setAffectation] = useState(a.affectation || '');
  const [date, setDate] = useState(a.dateAcquisition || '');
  const [fournisseurId, setFournisseurId] = useState(a.fournisseurId || '');
  const [valeur, setValeur] = useState(String(a.valeur || 0));
  const [duree, setDuree] = useState(String(a.dureeAmort || 5));
  const [assurance, setAssurance] = useState(a.echeanceAssurance || '');
  const [visite, setVisite] = useState(a.echeanceVisite || '');
  const am = immoAmort(valeur, duree, date);
  const fournKnown = state.fournisseurs.some(x => x.id === fournisseurId);

  const save = () => {
    if (!validateRequired(bodyRef.current)) return;
    const val = Number(valeur) || 0, dur = Number(duree) || 0;
    if (val <= 0) { toast('La valeur d’acquisition doit être supérieure à 0.'); return; }
    if (dur < 1) { toast('La durée d’amortissement doit être d’au moins 1 an.'); return; }
    if (cat === 'transport') {
      const im = immat.trim();
      if (state.immobilisations.some(x => x.categorie === 'transport' && x.id !== a.id && (x.immatriculation || '').toLowerCase() === im.toLowerCase())) { toast('Cette immatriculation existe déjà.'); return; }
      if (assurance < date || visite < date) { toast('Les échéances ne peuvent pas être antérieures à la date d’acquisition.'); return; }
    }
    const data: Partial<Immobilisation> = {
      dateAcquisition: date, fournisseurId: fournisseurId.trim(), valeur: val, dureeAmort: dur, etat,
      marque: marque.trim(), affectation: affectation.trim(),
      ...(cat === 'materiel'
        ? { designation: designation.trim(), numSerie: numSerie.trim() }
        : { typeVehicule, immatriculation: immat.trim(), echeanceAssurance: assurance, echeanceVisite: visite }),
    };
    update(draft => {
      if (editing) { const t = draft.immobilisations.find(x => x.id === a.id); if (t) Object.assign(t, data); }
      else draft.immobilisations.unshift({ ...a, ...data } as Immobilisation);
    });
    closeModal();
    toast(editing ? `${a.id} modifié.` : `${a.id} créé.`);
  };

  return (
    <Modal title={editing ? `Modifier ${a.id}` : (cat === 'materiel' ? 'Nouveau matériel' : 'Nouveau véhicule')} onClose={closeModal} bodyRef={bodyRef}
      footer={<>
        <button className="btn btn-ghost" onClick={closeModal}>Annuler</button>
        <button className="btn btn-accent" onClick={save}>Enregistrer</button>
      </>}>
      <div className="field-row">
        <Field label="Code"><input value={a.id} disabled readOnly /></Field>
        <Field label="État"><select required value={etat} onChange={e => setEtat(e.target.value)}>{IMMO_ETATS.map(s => <option key={s}>{s}</option>)}</select></Field>
      </div>
      {cat === 'materiel' ? (<>
        <div className="field-row">
          <Field label="Désignation"><input required value={designation} onChange={e => setDesignation(e.target.value)} /></Field>
          <Field label="Marque / Modèle"><input required value={marque} onChange={e => setMarque(e.target.value)} /></Field>
        </div>
        <div className="field-row">
          <Field label="N° de série"><input required value={numSerie} onChange={e => setNumSerie(e.target.value)} /></Field>
          <Field label="Affectation / localisation"><input required value={affectation} onChange={e => setAffectation(e.target.value)} /></Field>
        </div>
      </>) : (<>
        <div className="field-row">
          <Field label="Type de véhicule"><select required value={typeVehicule} onChange={e => setTypeVehicule(e.target.value)}>{VEHICULE_TYPES.map(t => <option key={t}>{t}</option>)}</select></Field>
          <Field label="Marque / Modèle"><input required value={marque} onChange={e => setMarque(e.target.value)} /></Field>
        </div>
        <div className="field-row">
          <Field label="Immatriculation"><input required value={immat} onChange={e => setImmat(e.target.value)} /></Field>
          <Field label="Affectation / usage"><input required value={affectation} onChange={e => setAffectation(e.target.value)} /></Field>
        </div>
      </>)}
      <div className="field-row">
        <Field label="Date d'acquisition"><input required type="date" value={date} onChange={e => setDate(e.target.value)} /></Field>
        <Field label="Fournisseur"><select required value={fournisseurId} onChange={e => setFournisseurId(e.target.value)}>
          {(!editing || !fournKnown) && <option value="">Sélectionner…</option>}
          {state.fournisseurs.map(x => <option key={x.id} value={x.id}>{x.nom}</option>)}
        </select></Field>
      </div>
      <div className="field-row">
        <Field label="Valeur d'acquisition (DH)"><input required type="number" min="0" step="0.01" value={valeur} onChange={e => setValeur(e.target.value)} /></Field>
        <Field label="Durée d'amortissement (ans)"><input required type="number" min="1" step="1" value={duree} onChange={e => setDuree(e.target.value)} /></Field>
      </div>
      <div className="hint" data-testid="immo-hint">
        Amortissement linéaire : dotation annuelle <strong>{money(am.dotation)} DH</strong> · cumulé à ce jour <strong>{money(am.cumule)} DH</strong> · valeur nette comptable <strong>{money(am.vnc)} DH</strong>
      </div>
      {cat === 'transport' && (
        <div className="field-row">
          <Field label="Échéance assurance"><input required type="date" value={assurance} onChange={e => setAssurance(e.target.value)} /></Field>
          <Field label="Échéance visite technique"><input required type="date" value={visite} onChange={e => setVisite(e.target.value)} /></Field>
        </div>
      )}
    </Modal>
  );
}

export default function ImmobilisationPage({ cat }: { cat: Cat }) {
  const { state, update } = useStore();
  const r = useRights('immo_' + cat);
  const { openModal, confirm } = useUI();
  const cfg = IMMO_CATS[cat];
  const rows = useMemo(() => state.immobilisations.filter(a => a.categorie === cat), [state.immobilisations, cat]);
  const fournNom = (id: string) => fournisseurNom(state.fournisseurs, id);

  const openForm = (a?: Immobilisation) => {
    if (!a && !state.fournisseurs.length) { toast('Ajoutez d’abord un fournisseur dans Tiers > Fournisseur.'); return; }
    const immo: Immobilisation = a || {
      id: nextImmoId(state.immobilisations, cat), categorie: cat, designation: '', typeVehicule: 'Camionnette', marque: '', numSerie: '', immatriculation: '',
      dateAcquisition: todayIso(), fournisseurId: '', valeur: 0, dureeAmort: 5, affectation: '', etat: 'En service', echeanceAssurance: '', echeanceVisite: '',
    };
    openModal(<ImmoForm cat={cat} immo={immo} editing={!!a} state={state} update={update} />);
  };
  const supprimer = async (a: Immobilisation) => {
    const ok = await confirm({
      title: 'Supprimer cette immobilisation ?', danger: true, confirmLabel: 'Supprimer',
      message: (<>
        <div className="hint" style={{ marginBottom: 12 }}><strong>{a.id}</strong> — {libelleImmo(a)}<br />Valeur d'acquisition {money(a.valeur)} DH</div>
        <div style={{ fontSize: 13 }}>Cette suppression est définitive. Si le bien est simplement hors service, passez plutôt son état à « Réformé ».</div>
      </>),
    });
    if (!ok) return;
    update(draft => { draft.immobilisations = draft.immobilisations.filter(x => x.id !== a.id); });
    toast(`${a.id} supprimé.`);
  };

  const fournOptions = [...new Set(state.fournisseurs.map(x => x.nom))];
  const etatCol: Column<Immobilisation> = {
    key: 'etat', label: 'État', render: a => <Badge cls={IMMO_ETAT_BADGE[a.etat]}>{a.etat}</Badge>,
    filter: { value: a => a.etat, options: IMMO_ETATS },
  };
  const montants: Column<Immobilisation>[] = [
    { key: 'valeur', label: "Valeur d'acquisition", className: 'num', render: a => `${money(a.valeur)} DH` },
    { key: 'vnc', label: 'VNC', className: 'num', render: a => `${money(immoAmort(a.valeur, a.dureeAmort, a.dateAcquisition).vnc)} DH` },
  ];
  const actionsCol: Column<Immobilisation> = {
    key: 'actions', label: '', nowrap: true,
    render: a => (<>
      {r.modifier && <button className="btn btn-ghost btn-sm" onClick={() => openForm(a)}>Modifier</button>}{' '}
      {r.supprimer && <button className="btn btn-danger btn-sm" onClick={() => supprimer(a)}>Supprimer</button>}
    </>),
  };
  const idCol: Column<Immobilisation> = { key: 'id', label: 'Code', className: 'mono', render: a => a.id, filter: { value: a => a.id } };
  const acqCol: Column<Immobilisation> = { key: 'acq', label: 'Acquisition', render: a => fmtDate(a.dateAcquisition) };

  const columns: Column<Immobilisation>[] = cat === 'materiel' ? [
    idCol,
    { key: 'designation', label: 'Désignation', render: a => a.designation, filter: { value: a => a.designation } },
    { key: 'marque', label: 'Marque / Modèle', render: a => a.marque },
    acqCol,
    { key: 'fournisseur', label: 'Fournisseur', render: a => fournNom(a.fournisseurId), filter: { value: a => fournNom(a.fournisseurId), options: fournOptions, placeholder: 'Tous les fournisseurs' } },
    ...montants,
    { key: 'affectation', label: 'Affectation', render: a => a.affectation },
    etatCol, actionsCol,
  ] : [
    idCol,
    { key: 'type', label: 'Type', render: a => a.typeVehicule, filter: { value: a => a.typeVehicule, options: VEHICULE_TYPES } },
    { key: 'marque', label: 'Marque / Modèle', render: a => a.marque },
    { key: 'immat', label: 'Immatriculation', className: 'mono', render: a => a.immatriculation, filter: { value: a => a.immatriculation } },
    acqCol,
    ...montants,
    { key: 'assurance', label: 'Assurance', render: a => <span style={echeanceStyle(a.echeanceAssurance)}>{fmtDate(a.echeanceAssurance)}</span> },
    { key: 'visite', label: 'Visite technique', render: a => <span style={echeanceStyle(a.echeanceVisite)}>{fmtDate(a.echeanceVisite)}</span> },
    etatCol, actionsCol,
  ];
  const tf = useTableFilters(rows, columns);
  const totVal = tf.filtered.reduce((s, a) => s + (Number(a.valeur) || 0), 0);
  const totVnc = tf.filtered.reduce((s, a) => s + immoAmort(a.valeur, a.dureeAmort, a.dateAcquisition).vnc, 0);
  const resume: ReactNode = (
    <div style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>
      Valeur d'acquisition <strong style={{ color: 'var(--ink)' }}>{money(totVal)} DH</strong> · VNC <strong style={{ color: 'var(--ink)' }}>{money(totVnc)} DH</strong>
    </div>
  );
  return (<>
    {r.modifier && <PageActions><AddButton onClick={() => openForm()}>{cfg.add}</AddButton></PageActions>}
    <Panel title={cfg.label} count={tf.filtered.length} actions={resume}>
      <DataTable tf={tf} columns={columns} rowKey={a => a.id} onRowDoubleClick={r.modifier ? openForm : undefined} emptyText="Aucune immobilisation ne correspond aux filtres." />
    </Panel>
  </>);
}
