/* Tableau des lignes d'un devis (désignation + tâches, matière, quantité, PU, montant).
   mode 'edit'  : création / modification d'un devis.
   mode 'solder': désignation, matière et tâches figées (reprises du devis), quantité et PU ajustables. */
import { money } from '../../lib/format';
import { ligneMontant, lignesTotal, newDraftLigne, type DraftLigne } from './devisLogic';
import { toast } from '../../ui/toast';

interface Props {
  lignes: DraftLigne[];
  onChange: (next: DraftLigne[]) => void;
  mode?: 'edit' | 'solder';
  /** Lecture seule : tous les champs sont désactivés et les boutons d'ajout / suppression sont masqués. */
  readOnly?: boolean;
}
export function LignesTable({ lignes, onChange, mode = 'edit', readOnly }: Props) {
  const solder = mode === 'solder';
  const lockText = solder || !!readOnly;           // désignation / matière / tâches
  const lockNums = !!readOnly;                     // quantité / PU
  const setLine = (i: number, patch: Partial<DraftLigne>) => onChange(lignes.map((l, k) => k === i ? { ...l, ...patch } : l));
  const setTache = (i: number, ti: number, v: string) => setLine(i, { taches: lignes[i].taches.map((t, k) => k === ti ? v : t) });
  const removeLine = (i: number) => {
    if (lignes.length > 1) onChange(lignes.filter((_, k) => k !== i)); else toast('Le devis doit garder au moins une ligne.');
  };
  const showRm = !solder && !readOnly;
  return (
    <>
      <table className="lines-table">
        <thead><tr><th>#</th><th>Désignation</th><th>Matière</th><th>Qté</th><th>PU (DH)</th><th>Montant</th>{!solder && <th></th>}</tr></thead>
        <tbody>
          {lignes.map((l, i) => (
            <tr key={i}>
              <td className="num-col">{i + 1}</td>
              <td>
                <textarea rows={1} required={!lockText} disabled={lockText} aria-label={`Désignation ligne ${i + 1}`} value={l.designation}
                  onChange={e => setLine(i, { designation: e.target.value })} />
                <div className="taches-box">
                  {l.taches.map((t, ti) => (
                    <div className="tache-row" key={ti}>
                      <span className="tache-bullet" />
                      <input value={t} placeholder="Tâche" disabled={lockText} onChange={e => setTache(i, ti, e.target.value)} />
                      {!lockText && (
                        <button type="button" className="icon-btn tache-rm" title="Supprimer la tâche" aria-label="Supprimer la tâche"
                          onClick={() => setLine(i, { taches: l.taches.filter((_, k) => k !== ti) })}>
                          <svg width="12" height="12" viewBox="0 0 16 16"><path d="M3 3l10 10M13 3 3 13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
                        </button>
                      )}
                    </div>
                  ))}
                  {!lockText && <button type="button" className="btn btn-ghost btn-sm add-tache-btn" onClick={() => setLine(i, { taches: [...l.taches, ''] })}>+ Ajouter une tâche</button>}
                </div>
              </td>
              <td className="matiere-col">
                <select value={l.matiere} disabled={lockText} aria-label={`Matière ligne ${i + 1}`} onChange={e => setLine(i, { matiere: e.target.value as 'avec' | 'sans' })}>
                  <option value="avec">Avec matière</option>
                  <option value="sans">Sans matière</option>
                </select>
              </td>
              <td className="qty-col"><input type="number" min="0" step="1" required={!lockNums} disabled={lockNums} aria-label={`Quantité ligne ${i + 1}`} value={l.qte} onChange={e => setLine(i, { qte: e.target.value })} /></td>
              <td className="pu-col"><input type="number" min="0" step="0.01" required={!lockNums} disabled={lockNums} aria-label={`Prix unitaire ligne ${i + 1}`} value={l.pu} onChange={e => setLine(i, { pu: e.target.value })} /></td>
              <td className="amt-col">{money(ligneMontant(l))}</td>
              {!solder && (
                <td className="rm-col">{showRm && (
                  <button type="button" className="icon-btn" title="Supprimer" aria-label="Supprimer la ligne" onClick={() => removeLine(i)}>
                    <svg width="14" height="14" viewBox="0 0 16 16"><path d="M3 4h10M6.5 4V2.8a.8.8 0 0 1 .8-.8h1.4a.8.8 0 0 1 .8.8V4M4.5 4v9a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1V4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>
                  </button>)}
                </td>
              )}
            </tr>
          ))}
        </tbody>
        <tfoot><tr className="total-row"><td colSpan={5}>Total</td><td className="amt-col" data-testid="lines-total">{money(lignesTotal(lignes))} DH</td>{!solder && <td></td>}</tr></tfoot>
      </table>
      {mode === 'edit' && !readOnly && <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange([...lignes, newDraftLigne()])}>+ Ajouter une ligne</button>}
    </>
  );
}
