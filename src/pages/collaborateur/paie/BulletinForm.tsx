/* Formulaire de bulletin de paie (création / modification / consultation en lecture seule). */
import { useRef, useState } from 'react';
import { useRights, useStore } from '../../../data/store';
import { money, todayIso } from '../../../lib/format';
import { calculChargesPatronales, calculPaie, collabNom, joursPointes } from '../../../lib/paie';
import type { Collaborateur } from '../../../lib/types';
import { Modal } from '../../../ui/Modal';
import { Field } from '../../../ui/misc';
import { toast } from '../../../ui/toast';
import { useUI } from '../../../ui/UIProvider';
import { validateRequired } from '../../../ui/validate';
import { MODES_PAIEMENT } from './shared';

interface Ligne { designation: string; montant: string }
interface Retenue { label: string; montant: string }
const STATUTS_BULLETIN = ['Payé', 'En attente'];
const num = (v: string | number) => Number(v) || 0;
const sumPret = (arr: { label: string; montant: number }[] | undefined) => (arr || []).filter(r => r.label === 'Prêt social').reduce((s, r) => s + (Number(r.montant) || 0), 0);

/** Lignes de gains et retenues proposées pour un collaborateur et un mois. */
function initFor(c: Collaborateur, mois: string, pointages: Parameters<typeof joursPointes>[0]): { lignes: Ligne[]; retenues: Retenue[] } {
  let lignes: Ligne[];
  if (c.typePaie === 'Journalier') {
    const jours = joursPointes(pointages, c.id, mois);
    lignes = [{ designation: `Salaire journalier (${jours} jour(s) pointé(s) × ${money(c.salaireJournalier || 0)} DH)`, montant: String(jours * (c.salaireJournalier || 0)) }];
  } else {
    lignes = [{ designation: c.typePaie === 'Horaire' ? 'Salaire horaire' : 'Salaire de base', montant: String(c.salaireBase) }];
  }
  const retenues: Retenue[] = c.pretSolde > 0 ? [{ label: 'Prêt social', montant: String(Math.min(c.pretMensualite, c.pretSolde)) }] : [];
  return { lignes, retenues };
}

/** Ajuste le remboursé / solde du prêt d'un collaborateur (brouillon immer). */
export function ajusterPret(c: Collaborateur | undefined, delta: number) {
  if (!c || !delta) return;
  c.pretRembourse = Math.max(0, Math.min(c.pretCapital || 0, Math.round(((c.pretRembourse || 0) + delta) * 100) / 100));
  c.pretSolde = Math.max(0, Math.round(((c.pretCapital || 0) - c.pretRembourse) * 100) / 100);
}

export default function BulletinForm({ editId }: { editId?: string }) {
  const { state, update } = useStore();
  const r = useRights('collab_paie');
  const { closeModal } = useUI();
  const bodyRef = useRef<HTMLDivElement>(null);
  const bEdit = editId ? state.bulletins.find(x => x.id === editId) : undefined;
  const editing = !!bEdit;
  const readOnly = !r.modifier;

  const [collabId, setCollabId] = useState(() => bEdit ? bEdit.collaborateurId : (state.collaborateurs.find(c => c.statut === 'Actif')?.id ?? ''));
  const [mois, setMois] = useState(() => bEdit ? bEdit.mois : todayIso().slice(0, 7));
  const [init] = useState(() => {
    if (bEdit) return { lignes: bEdit.lignes.map(l => ({ designation: l.designation, montant: String(l.montant) })), retenues: (bEdit.retenues || []).map(x => ({ label: x.label, montant: String(x.montant) })) };
    const c = state.collaborateurs.find(x => x.id === collabId);
    return c ? initFor(c, mois, state.pointages) : { lignes: [{ designation: '', montant: '0' }], retenues: [] as Retenue[] };
  });
  const [lignes, setLignes] = useState<Ligne[]>(init.lignes);
  const [retenues, setRetenues] = useState<Retenue[]>(init.retenues);
  const [mode, setMode] = useState(bEdit && MODES_PAIEMENT.includes(bEdit.modePaiement) ? bEdit.modePaiement : MODES_PAIEMENT[0]);
  const [statut, setStatut] = useState(bEdit && STATUTS_BULLETIN.includes(bEdit.statut) ? bEdit.statut : STATUTS_BULLETIN[0]);

  const c = state.collaborateurs.find(x => x.id === collabId);
  const brut = lignes.reduce((s, l) => s + num(l.montant), 0);
  const p = calculPaie(brut, c ? c.personnesACharge : 0, c ? c.cotiseCimr : false);
  const cp = calculChargesPatronales(brut, c ? c.cotiseCimr : false);
  const autres = retenues.reduce((s, x) => s + num(x.montant), 0);

  function changeCollab(id: string) {
    setCollabId(id);
    const nc = state.collaborateurs.find(x => x.id === id);
    if (nc) { const i = initFor(nc, mois, state.pointages); setLignes(i.lignes); setRetenues(i.retenues); }
  }
  function changeMois(m: string) {
    setMois(m);
    if (!editing && c && c.typePaie === 'Journalier') setLignes(initFor(c, m, state.pointages).lignes);
  }
  const setLigne = (i: number, k: keyof Ligne, v: string) => setLignes(ls => ls.map((l, j) => j === i ? { ...l, [k]: v } : l));
  const setRetenue = (i: number, k: keyof Retenue, v: string) => setRetenues(rs => rs.map((x, j) => j === i ? { ...x, [k]: v } : x));
  function removeLigne(i: number) {
    if (lignes.length > 1) setLignes(ls => ls.filter((_, j) => j !== i)); else toast('Le bulletin doit garder au moins une ligne de gain.');
  }

  function enregistrer() {
    if (!validateRequired(bodyRef.current)) return;
    if (!mois) { toast('Le mois est obligatoire.'); return; }
    const lignesOut = lignes.map(l => ({ designation: l.designation, montant: num(l.montant) }));
    const retenuesOut = retenues.map(x => ({ label: x.label, montant: num(x.montant) }));
    const today = todayIso();
    if (editing && bEdit) {
      const oldPret = sumPret(bEdit.retenues);
      update(d => {
        const b = d.bulletins.find(x => x.id === bEdit.id); if (!b) return;
        if (b.statut !== 'Payé' && statut === 'Payé') b.datePaiement = today;
        b.mois = mois; b.lignes = lignesOut; b.retenues = retenuesOut; b.statut = statut; b.modePaiement = mode;
        ajusterPret(d.collaborateurs.find(x => x.id === collabId), sumPret(retenuesOut) - oldPret);
      });
      closeModal(); toast('Bulletin modifié.');
      return;
    }
    update(d => {
      d.bulletins.unshift({ id: 'blt_' + Math.random().toString(36).slice(2, 9), collaborateurId: collabId, mois, lignes: lignesOut, retenues: retenuesOut, statut, datePaiement: today, modePaiement: mode });
      ajusterPret(d.collaborateurs.find(x => x.id === collabId), sumPret(retenuesOut));
    });
    closeModal(); toast('Bulletin généré.');
  }

  const title = editing ? `${readOnly ? 'Bulletin' : 'Modifier le bulletin'} — ${collabNom(state.collaborateurs, collabId)} (${bEdit!.mois})` : 'Générer un bulletin de paie';
  const options = state.collaborateurs.filter(x => x.statut === 'Actif' || x.statut === 'Démissionné');
  return (
    <Modal title={title} onClose={closeModal} bodyRef={bodyRef}
      footer={<>
        <button className="btn btn-ghost" onClick={closeModal}>{readOnly ? 'Fermer' : 'Annuler'}</button>
        {!readOnly && <button className="btn btn-accent" onClick={enregistrer}>Enregistrer</button>}
      </>}>
      <fieldset disabled={readOnly} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <div className="field-row">
          <Field label="Collaborateur">
            <select aria-label="Collaborateur" required disabled={editing || readOnly} value={collabId} onChange={e => changeCollab(e.target.value)}>
              {options.map(x => <option key={x.id} value={x.id}>{x.prenom} {x.nom} ({x.id}){x.statut === 'Démissionné' ? ' — démissionné' : ''}</option>)}
            </select>
          </Field>
          <Field label="Mois"><input aria-label="Mois" required type="month" value={mois} onChange={e => changeMois(e.target.value)} /></Field>
        </div>

        <div className="form-section-title">Gains</div>
        <table className="lines-table">
          <thead><tr><th>Désignation</th><th style={{ width: 120 }}>Montant (DH)</th><th></th></tr></thead>
          <tbody>
            {lignes.map((l, i) => (
              <tr key={i}>
                <td><input aria-label={`Désignation ${i + 1}`} value={l.designation} required onChange={e => setLigne(i, 'designation', e.target.value)} /></td>
                <td><input aria-label={`Montant ${i + 1}`} type="number" step="0.01" value={l.montant} required onChange={e => setLigne(i, 'montant', e.target.value)} /></td>
                <td><button type="button" className="icon-btn" title="Supprimer" onClick={() => removeLigne(i)}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setLignes(ls => [...ls, { designation: '', montant: '0' }])}>+ Ajouter une prime / indemnité</button>

        <div className="form-section-title">Retenues diverses (prêt, avance…)</div>
        <table className="lines-table">
          <thead><tr><th>Libellé</th><th style={{ width: 120 }}>Montant (DH)</th><th></th></tr></thead>
          <tbody>
            {retenues.length ? retenues.map((x, i) => (
              <tr key={i}>
                <td><input aria-label={`Libellé retenue ${i + 1}`} value={x.label} required onChange={e => setRetenue(i, 'label', e.target.value)} /></td>
                <td><input aria-label={`Montant retenue ${i + 1}`} type="number" step="0.01" value={x.montant} required onChange={e => setRetenue(i, 'montant', e.target.value)} /></td>
                <td><button type="button" className="icon-btn" title="Supprimer" onClick={() => setRetenues(rs => rs.filter((_, j) => j !== i))}>✕</button></td>
              </tr>
            )) : <tr><td colSpan={3} style={{ color: 'var(--ink-soft)', fontSize: 12 }}>Aucune retenue diverse</td></tr>}
          </tbody>
        </table>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRetenues(rs => [...rs, { label: '', montant: '0' }])}>+ Ajouter une retenue</button>

        <div className="form-section-title">Calcul automatique (CNSS 4,48% · AMO 2,26% · CIMR si applicable · IR barème 2026)</div>
        <table className="pdoc-table" data-testid="bulletin-preview" style={{ fontSize: 12.5 }}>
          <tbody>
            <tr><td>Salaire brut</td><td className="num">{money(p.brut)} DH</td></tr>
            <tr><td>CNSS (4,48%, plafonné 6 000 DH)</td><td className="num">− {money(p.cnss)} DH</td></tr>
            <tr><td>AMO (2,26%)</td><td className="num">− {money(p.amo)} DH</td></tr>
            {p.cimr ? <tr><td>CIMR (3,45%)</td><td className="num">− {money(p.cimr)} DH</td></tr> : null}
            <tr><td>IR (retenue à la source)</td><td className="num">− {money(p.ir)} DH</td></tr>
            {autres ? <tr><td>Retenues diverses</td><td className="num">− {money(autres)} DH</td></tr> : null}
            <tr className="pdoc-total"><td>Net à payer</td><td className="num">{money(p.net - autres)} DH</td></tr>
            <tr><td style={{ paddingTop: 10, color: 'var(--ink-soft)' }}>Charges patronales (21,09%{c?.cotiseCimr ? ' + CIMR' : ''})</td><td className="num" style={{ color: 'var(--ink-soft)', paddingTop: 10 }}>+ {money(cp.total)} DH</td></tr>
            <tr><td style={{ fontWeight: 600 }}>Coût employeur total</td><td className="num" style={{ fontWeight: 600 }}>{money(cp.coutEmployeur)} DH</td></tr>
          </tbody>
        </table>

        <div className="field-row" style={{ marginTop: 14 }}>
          <Field label="Mode de paiement">
            <select aria-label="Mode de paiement" required value={mode} onChange={e => setMode(e.target.value)}>{MODES_PAIEMENT.map(m => <option key={m}>{m}</option>)}</select>
          </Field>
          <Field label="Statut">
            <select aria-label="Statut" required value={statut} onChange={e => setStatut(e.target.value)}>{STATUTS_BULLETIN.map(s => <option key={s}>{s}</option>)}</select>
          </Field>
        </div>
      </fieldset>
    </Modal>
  );
}
