/* Formulaire d'ordre de mission (création depuis un devis, ou modification) — utilisé par la page Ordre de mission
   et par le détail d'un devis. */
import { useRef, useState } from 'react';
import type { OrdreMission } from '../../lib/types';
import { useRights, useStore } from '../../data/store';
import { Modal } from '../../ui/Modal';
import { useUI } from '../../ui/UIProvider';
import { toast } from '../../ui/toast';
import { validateRequired } from '../../ui/validate';
import { Field } from '../../ui/misc';
import { todayIso } from '../../lib/format';
import { MISSION_STATUTS, nextMissionId } from './missionLogic';

interface Props {
  devisId: string;
  /** Renseigné : modification de cet ordre de mission. */
  missionId?: string;
  /** Appelé après l'enregistrement (par défaut la fenêtre est simplement fermée). */
  onSaved?: () => void;
}
export function MissionForm({ devisId, missionId, onSaved }: Props) {
  const { state, update } = useStore();
  const { closeModal } = useUI();
  const r = useRights('mission');
  const bodyRef = useRef<HTMLDivElement>(null);
  const dv = state.devis.find(d => d.id === devisId);
  const existing = missionId ? state.ordresMission.find(x => x.id === missionId) : undefined;
  const editing = !!existing;
  const readOnly = !r.modifier;
  const [newId] = useState(() => nextMissionId(state.ordresMission));
  const o = existing ?? { id: newId, date: todayIso(), client: dv?.client ?? '', emetteur: state.societe.nom || '', devisId, lignes: [], collaborateurIds: [], statut: 'Planifié' } as OrdreMission;

  const [date, setDate] = useState(o.date);
  const [emetteur, setEmetteur] = useState(o.emetteur);
  const [statut, setStatut] = useState<string>(o.statut);
  const [collabs, setCollabs] = useState<string[]>(o.collaborateurIds);
  const [ligne, setLigne] = useState<string | null>(editing ? (o.lignes[0] ?? null) : (dv?.lignes[0]?.designation ?? null));

  if (!dv) {
    return (
      <Modal title="Ordre de mission" size="sm" onClose={closeModal} footer={<button className="btn btn-ghost" onClick={closeModal}>Fermer</button>}>
        <div className="empty-state">Le devis de cet ordre de mission est introuvable.</div>
      </Modal>
    );
  }
  const toggle = (id: string) => setCollabs(c => c.includes(id) ? c.filter(x => x !== id) : [...c, id]);

  function save() {
    if (readOnly) return;
    if (!validateRequired(bodyRef.current)) return;
    if (ligne === null) { toast('Sélectionnez la ligne du devis concernée.'); return; }
    if (!collabs.length) { toast('Assignez au moins un collaborateur.'); return; }
    const saved: OrdreMission = { ...o, date, emetteur: emetteur.trim(), lignes: [ligne], collaborateurIds: collabs, statut: editing ? statut : o.statut };
    update(d => {
      if (editing) { const i = d.ordresMission.findIndex(x => x.id === saved.id); if (i >= 0) d.ordresMission[i] = saved; }
      else d.ordresMission.unshift(saved);
    });
    closeModal();
    onSaved?.();
    toast(editing ? `${saved.id} modifié.` : `${saved.id} créé.`);
  }

  return (
    <Modal title={editing ? `Modifier ${o.id}` : `Nouvel ordre de mission (${o.id})`} onClose={closeModal} bodyRef={bodyRef}
      footer={readOnly
        ? <button className="btn btn-ghost" onClick={closeModal}>Fermer</button>
        : <><button className="btn btn-ghost" onClick={closeModal}>Annuler</button><button className="btn btn-accent" onClick={save}>Enregistrer</button></>}>
      <div className="hint">Devis <strong>{dv.numero}</strong> — {dv.client} — {dv.objet}</div>
      <div className="form-section-title">Ligne du devis concernée</div>
      <div className="hint" style={{ marginTop: -6 }}>Un ordre de mission correspond à une seule ligne du devis.</div>
      <div className="checks" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}>
        {dv.lignes.map((l, i) => (
          <label className="check-item" key={i}>
            <input type="radio" name="om-ligne" checked={ligne === l.designation} disabled={readOnly} onChange={() => setLigne(l.designation)} /> {l.designation}
          </label>
        ))}
      </div>
      <div className="form-section-title">Affectation</div>
      <div className="field-row">
        <Field label="Date"><input required type="date" value={date} disabled={readOnly} onChange={e => setDate(e.target.value)} /></Field>
        <Field label="Client"><input value={o.client} disabled readOnly /></Field>
      </div>
      <Field label="Émetteur"><input required value={emetteur} disabled={readOnly} onChange={e => setEmetteur(e.target.value)} /></Field>
      <Field label="Collaborateur(s) assigné(s)">
        <div className="checks" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}>
          {state.collaborateurs.filter(c => c.statut === 'Actif').map(c => (
            <label className="check-item" key={c.id}>
              <input type="checkbox" checked={collabs.includes(c.id)} disabled={readOnly} onChange={() => toggle(c.id)} /> {c.prenom} {c.nom} — {c.poste}
            </label>
          ))}
        </div>
      </Field>
      {editing && (
        <Field label="Statut">
          <select required value={statut} disabled={readOnly} onChange={e => setStatut(e.target.value)}>
            {MISSION_STATUTS.map(s => <option key={s}>{s}</option>)}
          </select>
        </Field>
      )}
    </Modal>
  );
}
