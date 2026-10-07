/* Formulaire de création / modification d'un collaborateur (fenêtre modale). */
import { useRef, useState } from 'react';
import type { Collaborateur } from '../../lib/types';
import { Modal } from '../../ui/Modal';
import { useUI, toast } from '../../ui/UIProvider';
import { validateRequired } from '../../ui/validate';
import { TextField, SelectField } from './fields';
import { soldePret } from './shared';

interface Props {
  collab: Collaborateur;
  editing: boolean;
  /** Ouverture en lecture seule (profil sans droit de modification). */
  readOnly?: boolean;
  onSave: (c: Collaborateur) => void;
}

export default function SalarieForm({ collab: c, editing, readOnly, onSave }: Props) {
  const { closeModal } = useUI();
  const bodyRef = useRef<HTMLDivElement>(null);
  const [v, setV] = useState({
    statut: c.statut, nom: c.nom, prenom: c.prenom, cin: c.cin, naissance: c.dateNaissance || '', situation: c.situationFamiliale,
    tel: c.telephone, adresse: c.adresse, dept: c.departement || '', service: c.service || '', poste: c.poste,
    embauche: c.dateEmbauche, contrat: c.typeContrat, typePaie: c.typePaie as string,
    salaire: String(c.salaireBase ?? 0), tauxH: String(c.tauxHoraire || 0), salaireJour: String(c.salaireJournalier || 0),
    charge: String(c.personnesACharge || 0), cnss: c.cnssNum || '', mutuelle: c.mutuelleNum || '',
    cimr: !!c.cotiseCimr, cimrNum: c.cimrNum || '', conges: String(c.congesDroitAnnuel || 21),
    pretCap: String(c.pretCapital || 0), pretMens: String(c.pretMensualite || 0), pretRemb: String(c.pretRembourse || 0),
  });
  const set = <K extends keyof typeof v>(k: K) => (val: (typeof v)[K]) => setV(s => ({ ...s, [k]: val }));
  const demissionne = c.statut === 'Démissionné';

  const onContrat = (val: string) => setV(s => ({ ...s, contrat: val, typePaie: val === 'Journalier' ? 'Journalier' : s.typePaie }));

  const save = () => {
    if (!validateRequired(bodyRef.current)) return;
    const nom = v.nom.trim();
    if (!nom) { toast('Le nom est obligatoire.'); return; }
    const pretCap = Number(v.pretCap) || 0, pretRemb = Number(v.pretRemb) || 0;
    if (pretRemb > pretCap) { toast('Le montant remboursé ne peut pas dépasser le capital du prêt.'); return; }
    onSave({
      ...c,
      nom, prenom: v.prenom.trim(), cin: v.cin.trim(), dateNaissance: v.naissance, situationFamiliale: v.situation,
      telephone: v.tel.trim(), adresse: v.adresse.trim(), departement: v.dept.trim(), service: v.service.trim(), poste: v.poste.trim(),
      dateEmbauche: v.embauche, typeContrat: v.contrat, typePaie: v.typePaie,
      tauxHoraire: Number(v.tauxH) || 0, salaireJournalier: Number(v.salaireJour) || 0, salaireBase: Number(v.salaire) || 0,
      personnesACharge: Number(v.charge) || 0, cnssNum: v.cnss.trim(), mutuelleNum: v.mutuelle.trim(),
      cotiseCimr: v.cimr, cimrNum: v.cimrNum.trim(), congesDroitAnnuel: Number(v.conges) || 0,
      pretCapital: pretCap, pretMensualite: Number(v.pretMens) || 0, pretRembourse: pretRemb, pretSolde: soldePret(pretCap, pretRemb),
      statut: v.statut,
    });
    closeModal();
    toast(editing ? `${c.id} modifié.` : `${c.id} créé.`);
  };

  return (
    <Modal title={editing ? `Modifier ${c.id}` : 'Nouveau collaborateur'} onClose={closeModal} bodyRef={bodyRef}
      footer={<>
        <button className="btn btn-ghost" onClick={closeModal}>{readOnly ? 'Fermer' : 'Annuler'}</button>
        {!readOnly && <button className="btn btn-accent" onClick={save}>Enregistrer</button>}
      </>}>
      <fieldset disabled={readOnly} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <div className="field-row">
          <TextField label="Matricule (ID)" value={c.id} onChange={() => {}} disabled />
          <SelectField label="Statut" value={v.statut} onChange={set('statut')} required disabled={demissionne}
            options={demissionne ? ['Démissionné'] : ['Actif', 'Inactif']} />
        </div>
        {demissionne && <TextField label="Date de démission" type="date" value={c.dateDemission || ''} onChange={() => {}} disabled />}
        <div className="field-row">
          <TextField label="Nom" required value={v.nom} onChange={set('nom')} />
          <TextField label="Prénom" required value={v.prenom} onChange={set('prenom')} />
        </div>
        <div className="field-row-3">
          <TextField label="CIN" required value={v.cin} onChange={set('cin')} />
          <TextField label="Date de naissance" type="date" required value={v.naissance} onChange={set('naissance')} />
          <SelectField label="Situation familiale" required value={v.situation} onChange={set('situation')}
            options={['Célibataire', 'Marié(e)', 'Divorcé(e)', 'Veuf(ve)']} />
        </div>
        <div className="field-row">
          <TextField label="Téléphone" required value={v.tel} onChange={set('tel')} />
          <TextField label="Adresse" required value={v.adresse} onChange={set('adresse')} />
        </div>

        <div className="form-section-title">Poste</div>
        <div className="field-row-3">
          <TextField label="Département" required value={v.dept} onChange={set('dept')} />
          <TextField label="Service" required value={v.service} onChange={set('service')} />
          <TextField label="Fonction" required value={v.poste} onChange={set('poste')} />
        </div>
        <div className="field-row-3">
          <TextField label="Date d'embauche" type="date" required value={v.embauche} onChange={set('embauche')} />
          <SelectField label="Type de contrat" required value={v.contrat} onChange={onContrat} options={['CDI', 'CDD', 'Journalier']} />
          <SelectField label="Type de paie" required value={v.typePaie} onChange={set('typePaie')} options={['Mensuel', 'Horaire', 'Journalier']} />
        </div>
        <div className="field-row">
          {v.typePaie !== 'Journalier' && <TextField label="Salaire de base (DH/mois)" type="number" min="0" step="0.01" required value={v.salaire} onChange={set('salaire')} />}
          {v.typePaie === 'Horaire' && <TextField label="Taux horaire (DH/heure)" type="number" min="0" step="0.01" required value={v.tauxH} onChange={set('tauxH')} />}
          {v.typePaie === 'Journalier' && <TextField label="Salaire journalier (DH/jour)" type="number" min="0" step="0.01" required value={v.salaireJour} onChange={set('salaireJour')} />}
        </div>

        <div className="form-section-title">Paie &amp; cotisations</div>
        <div className="field-row-3">
          <TextField label="Personnes à charge" type="number" min="0" max="6" step="1" required value={v.charge} onChange={set('charge')} />
          <TextField label="N° CNSS" required value={v.cnss} onChange={set('cnss')} />
          <TextField label="N° Mutuelle" required value={v.mutuelle} onChange={set('mutuelle')} />
        </div>
        <div className="check-item" style={{ marginBottom: 14 }}>
          <input type="checkbox" id="cb-cimr" checked={v.cimr} onChange={e => set('cimr')(e.target.checked)} />
          <label htmlFor="cb-cimr">Cotise à la CIMR (3,45%)</label>
        </div>
        {v.cimr && <TextField label="N° CIMR" required value={v.cimrNum} onChange={set('cimrNum')} />}
        <TextField label="Droit congés payés (jours/an)" type="number" min="0" step="0.5" required value={v.conges} onChange={set('conges')} />

        <div className="form-section-title">Prêt / avance en cours</div>
        <div className="field-row">
          <TextField label="Capital (DH)" type="number" min="0" step="0.01" required value={v.pretCap} onChange={set('pretCap')} />
          <TextField label="Mensualité (DH)" type="number" min="0" step="0.01" required value={v.pretMens} onChange={set('pretMens')} />
        </div>
        <div className="field-row">
          <TextField label="Déjà remboursé (DH)" type="number" min="0" step="0.01" required value={v.pretRemb} onChange={set('pretRemb')} />
          <TextField label="Solde restant (DH) — calculé" type="number" step="0.01" required disabled value={String(soldePret(v.pretCap, v.pretRemb))} onChange={() => {}} />
        </div>
      </fieldset>
    </Modal>
  );
}
