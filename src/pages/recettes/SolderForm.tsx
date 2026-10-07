/* Conversion en commande : choix du devis « Créé » puis formulaire de solde (bon de commande). */
import { useRef, useState } from 'react';
import { useStore } from '../../data/store';
import { useNav } from '../../nav';
import { Modal } from '../../ui/Modal';
import { useUI } from '../../ui/UIProvider';
import { toast } from '../../ui/toast';
import { validateRequired } from '../../ui/validate';
import { Field } from '../../ui/misc';
import { todayIso } from '../../lib/format';
import { fromDraftLignes, toDraftLignes } from './devisLogic';
import { DevisPicker } from './DevisPicker';
import { LignesTable } from './LignesTable';

export function CommandePicker() {
  const { state } = useStore();
  const { openModal } = useUI();
  return (
    <DevisPicker title="Sélectionner un devis à solder" candidates={state.devis.filter(d => d.statut === 'Créé')}
      emptyText="Aucun devis au statut « Créé » à solder." showAmount
      onChoose={d => openModal(<SolderForm devisId={d.id} />)} />
  );
}

export function SolderForm({ devisId }: { devisId: string }) {
  const { state, update } = useStore();
  const { closeModal } = useUI();
  const { go } = useNav();
  const bodyRef = useRef<HTMLDivElement>(null);
  const d = state.devis.find(x => x.id === devisId);
  const [lignes, setLignes] = useState(() => toDraftLignes(d?.lignes ?? []));
  const [bcNumero, setBcNumero] = useState('');
  const [bcDate, setBcDate] = useState(todayIso());
  const [fichier, setFichier] = useState('');
  if (!d) return null;

  function confirmSolder() {
    if (!d || !validateRequired(bodyRef.current)) return;
    const numero = bcNumero.trim();
    if (!numero || !bcDate) { toast('N° BC et date de BC sont obligatoires.'); return; }
    if (bcDate < d.date) { toast('La date de BC ne peut pas être antérieure à la date du devis.'); return; }
    const lignesFinales = fromDraftLignes(lignes);
    update(s => {
      const x = s.devis.find(y => y.id === devisId); if (!x) return;
      x.lignes = lignesFinales;
      x.statut = 'Soldée';
      x.dateSoldee = bcDate;
      // Le fichier n'est pas téléversé : seul son nom est conservé (comme dans le prototype).
      x.bc = { numero, date: bcDate, fichier };
    });
    closeModal(); go('commandes');
    toast('Devis soldé — commande créée.');
  }

  return (
    <Modal title={`Solder le devis ${d.numero}`} onClose={closeModal} bodyRef={bodyRef}
      footer={<><button className="btn btn-ghost" onClick={closeModal}>Annuler</button><button className="btn btn-accent" onClick={confirmSolder}>Confirmer</button></>}>
      <div className="field-row">
        <Field label="Client"><input disabled value={d.client} readOnly /></Field>
        <Field label="Date"><input disabled type="date" value={d.date} readOnly /></Field>
      </div>
      <div className="field-row">
        <Field label="N° devis"><input disabled value={d.numero} readOnly /></Field>
        <Field label="Objet"><input disabled value={d.objet} readOnly /></Field>
      </div>

      <div className="form-section-title">Lignes du devis</div>
      <div className="hint" style={{ marginTop: -6 }}>Désignation et matière reprises du devis d'origine, non modifiables. Quantité et PU ajustables si besoin.</div>
      <LignesTable lignes={lignes} onChange={setLignes} mode="solder" />

      <div className="form-section-title">Solder le devis</div>
      <div className="field-row">
        <Field label={<>N° BC <span style={{ color: 'var(--danger)' }}>*</span></>}>
          <input required placeholder="ex. BC-2026-020" value={bcNumero} onChange={e => setBcNumero(e.target.value)} />
        </Field>
        <Field label={<>Date de BC <span style={{ color: 'var(--danger)' }}>*</span></>}>
          <input required type="date" value={bcDate} onChange={e => setBcDate(e.target.value)} />
        </Field>
      </div>
      <Field label="Fichier joint">
        <input required type="file" aria-label="Fichier joint" onChange={e => setFichier(e.target.files?.[0]?.name || '')} />
      </Field>
    </Modal>
  );
}
