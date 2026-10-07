/* Facturation : choix du devis soldé, création et modification de la facture. */
import { useRef, useState } from 'react';
import { useRights, useStore } from '../../data/store';
import { useNav } from '../../nav';
import { Modal } from '../../ui/Modal';
import { useUI } from '../../ui/UIProvider';
import { toast } from '../../ui/toast';
import { validateRequired } from '../../ui/validate';
import { Field } from '../../ui/misc';
import { devisTotal } from '../../lib/devis';
import { money, todayIso } from '../../lib/format';
import { MODES_PAIEMENT, nextFactureNumero } from './devisLogic';
import { DevisPicker } from './DevisPicker';

export function FacturationPicker() {
  const { state } = useStore();
  const { openModal } = useUI();
  return (
    <DevisPicker title="Sélectionner un devis soldé à facturer" candidates={state.devis.filter(d => d.statut === 'Soldée')}
      emptyText="Aucun devis soldé disponible à facturer." showAmount
      sub={d => <>BC {d.bc?.numero || '—'} · {d.objet}</>}
      onChoose={d => openModal(<FactureCreateForm devisId={d.id} />)} />
  );
}

function ModePaiementSelect({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <select required value={value} disabled={disabled} onChange={e => onChange(e.target.value)}>
      {MODES_PAIEMENT.map(m => <option key={m}>{m}</option>)}
    </select>
  );
}

/** Facturer un devis soldé : le devis passe à « Facturé ». */
export function FactureCreateForm({ devisId }: { devisId: string }) {
  const { state, update } = useStore();
  const { closeModal } = useUI();
  const { go } = useNav();
  const bodyRef = useRef<HTMLDivElement>(null);
  const d = state.devis.find(x => x.id === devisId);
  const [date, setDate] = useState(todayIso());
  const [numero, setNumero] = useState(() => nextFactureNumero(state.devis));
  const [mode, setMode] = useState<string>(MODES_PAIEMENT[0]);
  const [delai, setDelai] = useState('90 jours');
  if (!d) return null;
  function confirmFacture() {
    if (!d || !validateRequired(bodyRef.current)) return;
    if (!date || !mode || !delai.trim()) { toast('Date, mode et délai de paiement sont obligatoires.'); return; }
    if (d.bc && date < d.bc.date) { toast('La date de la facture ne peut pas être antérieure à la date de BC.'); return; }
    update(s => {
      const x = s.devis.find(y => y.id === devisId); if (!x) return;
      x.statut = 'Facturé';
      x.dateFacturee = date;
      x.facture = { numero: numero.trim(), date, modePaiement: mode, delai: delai.trim() };
    });
    closeModal(); go('facturation');
    toast('Facture créée.');
  }
  const star = <span style={{ color: 'var(--danger)' }}>*</span>;
  return (
    <Modal title={`Facturer le devis ${d.numero}`} onClose={closeModal} bodyRef={bodyRef}
      footer={<><button className="btn btn-ghost" onClick={closeModal}>Annuler</button><button className="btn btn-accent" onClick={confirmFacture}>Confirmer</button></>}>
      <div className="hint">Devis <strong>{d.numero}</strong> — {d.client} — {money(devisTotal(d))} DH</div>
      <div className="field-row">
        <Field label={<>Date de la facture {star}</>}><input required type="date" value={date} onChange={e => setDate(e.target.value)} /></Field>
        <Field label="N° facture"><input required value={numero} onChange={e => setNumero(e.target.value)} /></Field>
      </div>
      <div className="field-row">
        <Field label={<>Mode de paiement {star}</>}><ModePaiementSelect value={mode} onChange={setMode} /></Field>
        <Field label={<>Délai de paiement {star}</>}><input required placeholder="ex. 90 jours" value={delai} onChange={e => setDelai(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

/** Modification d'une facture existante (numéro, date, mode, délai). */
export function FactureEditForm({ devisId }: { devisId: string }) {
  const { state, update } = useStore();
  const { closeModal } = useUI();
  const r = useRights('facturation');
  const bodyRef = useRef<HTMLDivElement>(null);
  const d = state.devis.find(x => x.id === devisId);
  const fa = d?.facture;
  const [date, setDate] = useState(fa?.date ?? todayIso());
  const [numero, setNumero] = useState(fa?.numero ?? '');
  const [mode, setMode] = useState<string>((MODES_PAIEMENT as readonly string[]).includes(fa?.modePaiement ?? '') ? fa!.modePaiement : MODES_PAIEMENT[0]);
  const [delai, setDelai] = useState(fa?.delai ?? '');
  if (!d || !fa) return null;
  const readOnly = !r.modifier;
  function save() {
    if (readOnly || !d || !validateRequired(bodyRef.current)) return;
    if (d.bc && date < d.bc.date) { toast('La date de la facture ne peut pas être antérieure à la date de BC.'); return; }
    update(s => {
      const x = s.devis.find(y => y.id === devisId); if (!x || !x.facture) return;
      x.facture = { ...x.facture, date, numero: numero.trim(), modePaiement: mode, delai: delai.trim() };
      x.dateFacturee = date;
    });
    closeModal(); toast('Facture modifiée.');
  }
  return (
    <Modal title={`Modifier la facture ${fa.numero}`} onClose={closeModal} bodyRef={bodyRef}
      footer={readOnly
        ? <button className="btn btn-ghost" onClick={closeModal}>Fermer</button>
        : <><button className="btn btn-ghost" onClick={closeModal}>Annuler</button><button className="btn btn-accent" onClick={save}>Enregistrer</button></>}>
      <div className="field-row">
        <Field label="Date de la facture"><input required type="date" value={date} disabled={readOnly} onChange={e => setDate(e.target.value)} /></Field>
        <Field label="N° facture"><input required value={numero} disabled={readOnly} onChange={e => setNumero(e.target.value)} /></Field>
      </div>
      <div className="field-row">
        <Field label="Mode de paiement"><ModePaiementSelect value={mode} onChange={setMode} disabled={readOnly} /></Field>
        <Field label="Délai de paiement"><input required value={delai} disabled={readOnly} onChange={e => setDelai(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
