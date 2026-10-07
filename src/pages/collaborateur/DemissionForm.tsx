/* Fenêtre de démission d'un collaborateur. */
import { useRef, useState } from 'react';
import type { Collaborateur } from '../../lib/types';
import { fmtDate, todayIso } from '../../lib/format';
import { Modal } from '../../ui/Modal';
import { useUI, toast } from '../../ui/UIProvider';
import { validateRequired } from '../../ui/validate';
import { TextField } from './fields';

export default function DemissionForm({ collab: c, onConfirm }: { collab: Collaborateur; onConfirm: (date: string) => void }) {
  const { closeModal } = useUI();
  const bodyRef = useRef<HTMLDivElement>(null);
  const [date, setDate] = useState(todayIso());
  const confirmer = () => {
    if (!validateRequired(bodyRef.current)) return;
    if (date < c.dateEmbauche) { toast('La date de démission ne peut pas être antérieure à la date d’embauche.'); return; }
    onConfirm(date);
    closeModal();
    toast(`${c.prenom} ${c.nom} : démission enregistrée.`);
  };
  return (
    <Modal title={`Démission de ${c.prenom} ${c.nom}`} size="sm" onClose={closeModal} bodyRef={bodyRef}
      footer={<>
        <button className="btn btn-ghost" onClick={closeModal}>Annuler</button>
        <button className="btn btn-danger" onClick={confirmer}>Confirmer la démission</button>
      </>}>
      <div className="hint" style={{ marginBottom: 14 }}>
        <strong>{c.prenom} {c.nom}</strong> ({c.id}) — {c.poste}<br />
        Embauché le {fmtDate(c.dateEmbauche)}
      </div>
      <TextField label="Date de démission" type="date" required value={date} onChange={setDate} />
      <div className="hint">Le collaborateur passera au statut « Démissionné » et ne pourra plus être sélectionné pour un pointage, un congé ou un ordre de mission. Son bulletin de paie final reste possible.</div>
    </Modal>
  );
}
