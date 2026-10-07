/* Fenêtre « Sélectionner un devis » (solder, facturer, demande d'article, ordre de mission). */
import type { ReactNode } from 'react';
import type { Devis } from '../../lib/types';
import { devisTotal } from '../../lib/devis';
import { money } from '../../lib/format';
import { Modal } from '../../ui/Modal';
import { useUI } from '../../ui/UIProvider';

interface Props {
  title: string;
  candidates: Devis[];
  emptyText: ReactNode;
  /** Deuxième ligne de chaque devis (défaut : l'objet). */
  sub?: (d: Devis) => ReactNode;
  /** Affiche le montant du devis à côté du bouton. */
  showAmount?: boolean;
  onChoose: (d: Devis) => void;
}
export function DevisPicker({ title, candidates, emptyText, sub, showAmount, onChoose }: Props) {
  const { closeModal } = useUI();
  return (
    <Modal title={title} size="sm" onClose={closeModal} footer={<button className="btn btn-ghost" onClick={closeModal}>Fermer</button>}>
      {candidates.length ? (
        <div className="pick-list">{candidates.map(d => (
          <div className="pick-item" key={d.id}>
            <div>
              <div className="pi-main">{d.numero} — {d.client}</div>
              <div className="pi-sub">{sub ? sub(d) : d.objet}</div>
            </div>
            <div style={showAmount ? { display: 'flex', alignItems: 'center', gap: 10 } : undefined}>
              {showAmount && <span className="pi-amt">{money(devisTotal(d))} DH</span>}
              <button className="btn btn-primary btn-sm" onClick={() => { closeModal(); onChoose(d); }}>Choisir</button>
            </div>
          </div>
        ))}</div>
      ) : <div className="empty-state">{emptyText}</div>}
    </Modal>
  );
}
