/* Demande d'article : sélection du devis, formulaire, « marquer pris ». */
import { useRef, useState } from 'react';
import { useStore } from '../../data/store';
import { Modal } from '../../ui/Modal';
import { useUI } from '../../ui/UIProvider';
import { toast } from '../../ui/toast';
import { validateRequired } from '../../ui/validate';
import { Field } from '../../ui/misc';
import { todayIso, uid } from '../../lib/format';
import { nextArticleLigne } from './devisLogic';
import { DevisPicker } from './DevisPicker';

/** Fenêtre de choix d'un devis soldé / facturé pour lequel demander un article. */
export function ArticlePicker() {
  const { state } = useStore();
  const { openModal } = useUI();
  return (
    <DevisPicker title="Sélectionner un devis soldé" candidates={state.devis.filter(d => d.statut === 'Soldée' || d.statut === 'Facturé')}
      emptyText="Aucun devis soldé disponible. Soldez d'abord un devis dans Conversion en commande."
      sub={d => <>BC {d.bc?.numero || '—'} · {d.objet}</>}
      onChoose={d => openModal(<ArticleForm devisId={d.id} />)} />
  );
}

/** Nouvelle demande d'article pour un devis. `onSaved` remplace le simple retour à la page (ex. rouvrir le détail du devis). */
export function ArticleForm({ devisId, onSaved }: { devisId: string; onSaved?: () => void }) {
  const { state, update } = useStore();
  const { closeModal } = useUI();
  const bodyRef = useRef<HTMLDivElement>(null);
  const dv = state.devis.find(d => d.id === devisId);
  const [designation, setDesignation] = useState('');
  const [quantite, setQuantite] = useState('1');
  function save() {
    if (!validateRequired(bodyRef.current)) return;
    const des = designation.trim(); const q = Number(quantite) || 0;
    if (!des || q <= 0) { toast('Désignation et quantité sont obligatoires.'); return; }
    update(d => {
      d.demandesArticles.unshift({
        id: uid('art'), ligne: nextArticleLigne(d.demandesArticles), dateHeure: new Date().toISOString().slice(0, 16),
        designation: des, quantite: q, situation: 'Demandé', datePris: '', devisId,
      });
    });
    closeModal(); onSaved?.();
    toast('Demande d’article enregistrée.');
  }
  return (
    <Modal title="Nouvelle demande d’article" onClose={closeModal} bodyRef={bodyRef}
      footer={<><button className="btn btn-ghost" onClick={closeModal}>Annuler</button><button className="btn btn-accent" onClick={save}>Enregistrer</button></>}>
      {dv && <div className="hint">Devis <strong>{dv.numero}</strong> — {dv.client} — BC {dv.bc?.numero || '—'}</div>}
      <Field label="Désignation"><input required placeholder="ex. Tube carré 40x40" value={designation} onChange={e => setDesignation(e.target.value)} /></Field>
      <Field label="Quantité"><input required type="number" min="1" step="1" value={quantite} onChange={e => setQuantite(e.target.value)} /></Field>
    </Modal>
  );
}

export function ArticlePrisForm({ articleId }: { articleId: string }) {
  const { state, update } = useStore();
  const { closeModal } = useUI();
  const bodyRef = useRef<HTMLDivElement>(null);
  const a = state.demandesArticles.find(x => x.id === articleId);
  const [date, setDate] = useState(todayIso());
  function confirm() {
    if (!validateRequired(bodyRef.current)) return;
    update(d => { const x = d.demandesArticles.find(y => y.id === articleId); if (x) { x.situation = 'Pris'; x.datePris = date; } });
    closeModal(); toast('Article marqué comme pris.');
  }
  return (
    <Modal title={`Marquer "${a?.designation ?? ''}" comme pris`} size="sm" onClose={closeModal} bodyRef={bodyRef}
      footer={<><button className="btn btn-ghost" onClick={closeModal}>Annuler</button><button className="btn btn-accent" onClick={confirm}>Confirmer</button></>}>
      <Field label="Date de prise"><input required type="date" value={date} onChange={e => setDate(e.target.value)} /></Field>
    </Modal>
  );
}
