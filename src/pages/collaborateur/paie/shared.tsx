/* Éléments communs aux onglets Paie / CNSS / CIMR. */
import { useRef, useState } from 'react';
import { useStore } from '../../../data/store';
import { money, todayIso } from '../../../lib/format';
import { bordereauCimrTotaux, bordereauCnssTotaux, buildBordereauCimrLignes, buildBordereauCnssLignes } from '../../../lib/paie';
import type { State } from '../../../lib/types';
import { Modal } from '../../../ui/Modal';
import { toast } from '../../../ui/toast';
import { useUI } from '../../../ui/UIProvider';
import { validateRequired } from '../../../ui/validate';
import { Badge, Field } from '../../../ui/misc';

export const MODES_PAIEMENT = ['Virement', 'Chèque', 'Espèces'];
export const STATUTS_BORDEREAU = ['À payer', 'Payé'];

/** Badge de statut d'un bordereau (Payé / À payer). */
export function BordereauStatut({ statut }: { statut: string }) {
  return <Badge cls={statut === 'Payé' ? 'badge-facture' : 'badge-soldee'}>{statut}</Badge>;
}

/** Fenêtre de paiement d'un bordereau CNSS ou CIMR. */
export function BordereauPaiementForm({ kind, id }: { kind: 'cnss' | 'cimr'; id: string }) {
  const { state, update } = useStore();
  const { closeModal } = useUI();
  const bodyRef = useRef<HTMLDivElement>(null);
  const b = kind === 'cnss' ? state.bordereauxCnss.find(x => x.id === id) : state.bordereauxCimr.find(x => x.id === id);
  const [date, setDate] = useState(todayIso());
  const [mode, setMode] = useState(MODES_PAIEMENT[0]);
  if (!b) return null;
  const total = kind === 'cnss' ? bordereauCnssTotaux(b as any).total : bordereauCimrTotaux(b as any).total;

  function confirmer() {
    if (!validateRequired(bodyRef.current)) return;
    if (date < b!.mois + '-01') { toast('La date de paiement ne peut pas être antérieure au mois du bordereau.'); return; }
    update(d => {
      const list = kind === 'cnss' ? d.bordereauxCnss : d.bordereauxCimr;
      const x = list.find(y => y.id === id);
      if (x) { x.statut = 'Payé'; x.datePaiement = date; x.modePaiement = mode; }
    });
    closeModal(); toast('Bordereau marqué comme payé.');
  }
  return (
    <Modal title={`Paiement du bordereau ${b.id}`} size="sm" onClose={closeModal} bodyRef={bodyRef}
      footer={<>
        <button className="btn btn-ghost" onClick={closeModal}>Annuler</button>
        <button className="btn btn-accent" onClick={confirmer}>Confirmer</button>
      </>}>
      <div className="hint" style={{ marginBottom: 14 }}>Bordereau <strong>{b.id}</strong> — total à payer : <strong>{money(total)} DH</strong></div>
      <div className="field-row">
        <Field label="Date de paiement"><input aria-label="Date de paiement" required type="date" value={date} onChange={e => setDate(e.target.value)} /></Field>
        <Field label="Mode de paiement">
          <select aria-label="Mode de paiement" required value={mode} onChange={e => setMode(e.target.value)}>{MODES_PAIEMENT.map(m => <option key={m}>{m}</option>)}</select>
        </Field>
      </div>
    </Modal>
  );
}

/** Fenêtre « Générer un bordereau » : choix du mois, puis création (refus de doublon / de mois sans bulletin). */
export function BordereauGenerateForm({ kind }: { kind: 'cnss' | 'cimr' }) {
  const { state, update } = useStore();
  const { closeModal } = useUI();
  const bodyRef = useRef<HTMLDivElement>(null);
  const [mois, setMois] = useState(todayIso().slice(0, 7));
  const label = kind === 'cnss' ? 'CNSS' : 'CIMR';

  function generer() {
    if (!validateRequired(bodyRef.current)) return;
    const existants = kind === 'cnss' ? state.bordereauxCnss : state.bordereauxCimr;
    if (existants.some(b => b.mois === mois)) { toast(kind === 'cnss' ? 'Un bordereau existe déjà pour ce mois.' : 'Un bordereau CIMR existe déjà pour ce mois.'); return; }
    const lignes = kind === 'cnss' ? buildCnss(state, mois) : buildCimr(state, mois);
    if (!lignes.length) { toast(kind === 'cnss' ? 'Aucun bulletin de paie pour ce mois.' : 'Aucun bulletin de collaborateur affilié à la CIMR pour ce mois.'); return; }
    const rec = { id: `${label}-${mois}`, mois, statut: 'À payer', datePaiement: '', modePaiement: '', lignes };
    update(d => { if (kind === 'cnss') d.bordereauxCnss.unshift(rec as any); else d.bordereauxCimr.unshift(rec as any); });
    closeModal(); toast(`Bordereau ${label}-${mois} généré.`);
  }
  return (
    <Modal title={`Générer un bordereau ${label}`} size="sm" onClose={closeModal} bodyRef={bodyRef}
      footer={<>
        <button className="btn btn-ghost" onClick={closeModal}>Annuler</button>
        <button className="btn btn-accent" onClick={generer}>Générer</button>
      </>}>
      <Field label="Mois"><input aria-label="Mois" required type="month" value={mois} onChange={e => setMois(e.target.value)} /></Field>
      <div className="hint">
        {kind === 'cnss'
          ? 'Le bordereau reprend tous les bulletins de paie du mois choisi : cotisations salariales (retenues sur les salaires) et patronales, dues à la CNSS (prestations sociales, allocations familiales, AMO, taxe de formation professionnelle).'
          : 'Le bordereau reprend les bulletins de paie du mois des collaborateurs cotisant à la CIMR : part salariale (retenue sur le salaire) et part patronale, calculées sur le salaire brut.'}
      </div>
    </Modal>
  );
}

const buildCnss = (s: State, mois: string) => buildBordereauCnssLignes(s.bulletins, s.collaborateurs, s.pointages, mois);
const buildCimr = (s: State, mois: string) => buildBordereauCimrLignes(s.bulletins, s.collaborateurs, mois);
