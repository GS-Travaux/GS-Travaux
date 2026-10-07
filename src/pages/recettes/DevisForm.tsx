/* Formulaire de création / modification d'un devis. */
import { useRef, useState } from 'react';
import type { Devis } from '../../lib/types';
import { useRights, useStore } from '../../data/store';
import { Modal } from '../../ui/Modal';
import { useUI } from '../../ui/UIProvider';
import { toast } from '../../ui/toast';
import { validateRequired } from '../../ui/validate';
import { Field } from '../../ui/misc';
import { todayIso, uid } from '../../lib/format';
import { printDocument } from '../../lib/print';
import { buildDevisPrintHtml } from '../../lib/printDevis';
import { MODES_PAIEMENT, fromDraftLignes, newDraftLigne, nextDevisNumero, toDraftLignes, type DraftLigne } from './devisLogic';
import { ClientCombo } from './ClientCombo';
import { LignesTable } from './LignesTable';

interface FormState {
  client: string; clientId: string | null; date: string; numero: string; emetteur: string; objet: string;
  modePaiement: string; delaiPaiement: string; demandeAvance: string; lignes: DraftLigne[];
}

export function DevisForm({ devisId }: { devisId?: string }) {
  const { state, update } = useStore();
  const { closeModal } = useUI();
  const r = useRights('devis');
  const bodyRef = useRef<HTMLDivElement>(null);
  const existing = devisId ? state.devis.find(x => x.id === devisId) : undefined;
  const editing = !!existing;
  const readOnly = !r.modifier;
  // Identifiant du nouveau devis : fixé à l'ouverture.
  const [newId] = useState(() => uid('d'));
  const [f, setF] = useState<FormState>(() => existing ? {
    client: existing.client || '', clientId: (existing.clientId as string | null) ?? null, date: existing.date, numero: existing.numero,
    emetteur: existing.emetteur || '', objet: existing.objet || '',
    modePaiement: (MODES_PAIEMENT as readonly string[]).includes(existing.modePaiement) ? existing.modePaiement : MODES_PAIEMENT[0],
    delaiPaiement: existing.delaiPaiement || '', demandeAvance: String(existing.demandeAvance || 0),
    lignes: toDraftLignes(existing.lignes),
  } : {
    client: '', clientId: null, date: todayIso(), numero: nextDevisNumero(state.devis, todayIso()), emetteur: state.societe.nom || '', objet: '',
    modePaiement: MODES_PAIEMENT[0], delaiPaiement: '', demandeAvance: '0', lignes: [newDraftLigne()],
  });
  const set = (patch: Partial<FormState>) => setF(s => ({ ...s, ...patch }));

  function save(thenPrint: boolean) {
    if (readOnly) return;
    if (!validateRequired(bodyRef.current)) return;
    if (!f.client) { toast('Sélectionnez un client existant via la recherche.'); return; }
    const match = state.clients.find(c => c.nom === f.client);
    if (!match) { toast('Client introuvable — choisissez-le dans la liste, ou ajoutez-le dans Tiers > Client.'); return; }
    if (!f.numero) { toast('N° devis manquant.'); return; }
    const saved: Devis = {
      ...(existing ?? { id: newId, statut: 'Créé', dateSoldee: '', dateFacturee: '', bc: null, facture: null }),
      client: f.client, clientId: match.id, date: f.date, numero: f.numero, emetteur: f.emetteur.trim(), objet: f.objet.trim(),
      modePaiement: f.modePaiement, delaiPaiement: f.delaiPaiement.trim(), demandeAvance: Number(f.demandeAvance) || 0,
      lignes: fromDraftLignes(f.lignes),
    } as Devis;
    update(d => {
      if (editing) { const i = d.devis.findIndex(x => x.id === saved.id); if (i >= 0) d.devis[i] = saved; }
      else d.devis.unshift(saved);
    });
    closeModal();
    toast(editing ? 'Devis modifié.' : 'Devis enregistré.');
    if (thenPrint) printDocument(buildDevisPrintHtml(saved, state.societe));
  }
  const printExisting = () => { if (existing) printDocument(buildDevisPrintHtml(existing, state.societe)); };

  return (
    <Modal title={editing ? `Modifier le devis ${existing!.numero}` : 'Nouveau devis'} onClose={closeModal} bodyRef={bodyRef}
      footer={readOnly ? <>
        <button className="btn btn-ghost" onClick={closeModal}>Fermer</button>
        {existing && <button className="btn btn-primary" onClick={printExisting}>Exporter PDF</button>}
      </> : <>
        <button className="btn btn-ghost" onClick={closeModal}>Annuler</button>
        <button className="btn btn-primary" onClick={() => save(true)}>Exporter PDF</button>
        <button className="btn btn-accent" onClick={() => save(false)}>Enregistrer</button>
      </>}>
      <div className="field-row">
        <ClientCombo clients={state.clients} value={f.client} disabled={readOnly}
          onSelect={c => set({ client: c.nom, clientId: c.id })} onClear={() => set({ client: '', clientId: null })} />
        <Field label="Date">
          <input id="f-date" required type="date" value={f.date} disabled={readOnly}
            onChange={e => set({ date: e.target.value, ...(!editing ? { numero: nextDevisNumero(state.devis, e.target.value, newId) } : {}) })} />
        </Field>
      </div>
      <div className="field-row">
        <Field label="N° devis"><input id="f-numero" value={f.numero} disabled readOnly /></Field>
        <Field label="Émetteur"><input id="f-emetteur" required value={f.emetteur} disabled={readOnly} onChange={e => set({ emetteur: e.target.value })} /></Field>
      </div>
      <Field label="Objet"><input id="f-objet" required value={f.objet} disabled={readOnly} onChange={e => set({ objet: e.target.value })} /></Field>

      <div className="field-row-3">
        <Field label="Mode de paiement">
          <select id="f-mode" required value={f.modePaiement} disabled={readOnly} onChange={e => set({ modePaiement: e.target.value })}>
            {MODES_PAIEMENT.map(m => <option key={m}>{m}</option>)}
          </select>
        </Field>
        <Field label="Délai de paiement"><input id="f-delai" required placeholder="ex. 90 jours" value={f.delaiPaiement} disabled={readOnly} onChange={e => set({ delaiPaiement: e.target.value })} /></Field>
        <Field label="Demande d'avance (DH)"><input id="f-avance" required type="number" min="0" step="0.01" value={f.demandeAvance} disabled={readOnly} onChange={e => set({ demandeAvance: e.target.value })} /></Field>
      </div>

      <div className="form-section-title">Lignes du devis</div>
      <LignesTable lignes={f.lignes} onChange={lignes => set({ lignes })} readOnly={readOnly} />
    </Modal>
  );
}
