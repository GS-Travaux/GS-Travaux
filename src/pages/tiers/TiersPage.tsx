/* Tiers : clients et fournisseurs, avec historiques (portage du prototype, lignes 2203–2333). */
import { useRef, useState } from 'react';
import { useStore, useRights } from '../../data/store';
import type { State, Tiers } from '../../lib/types';
import { fmtDate, money } from '../../lib/format';
import { useUI } from '../../ui/UIProvider';
import { Modal } from '../../ui/Modal';
import { toast } from '../../ui/toast';
import { validateRequired } from '../../ui/validate';
import { DataTable, useTableFilters, type Column } from '../../ui/DataTable';
import { AddButton, Badge, EmptyState, PageActions, Panel, SettingsTabs, pickTab, Field } from '../../ui/misc';
import { clientHistorique, fournisseurHistorique, nextTiersId } from './tiers';

type TiersType = 'client' | 'fournisseur';
type Update = (fn: (draft: State) => void) => void;
const coll = (t: TiersType) => (t === 'client' ? 'clients' : 'fournisseurs') as 'clients' | 'fournisseurs';

/* Les fenêtres sont affichées hors du magasin : tout ce dont elles ont besoin leur est passé en props. */
function TiersForm({ type, tiers, editing, update }: { type: TiersType; tiers: Tiers; editing: boolean; update: Update }) {
  const { closeModal } = useUI();
  const bodyRef = useRef<HTMLDivElement>(null);
  const isClient = type === 'client';
  const [nom, setNom] = useState(tiers.nom);
  const [ice, setIce] = useState(tiers.ice);
  const [adresse, setAdresse] = useState(tiers.adresse);

  const save = () => {
    if (!validateRequired(bodyRef.current)) return;
    const n = nom.trim();
    if (!n) { toast('Le nom de la société est obligatoire.'); return; }
    const data = { nom: n, ice: ice.trim(), adresse: adresse.trim() };
    update(draft => {
      const list = draft[coll(type)];
      if (editing) { const t = list.find(i => i.id === tiers.id); if (t) Object.assign(t, data); }
      else list.unshift({ id: tiers.id, ...data });
    });
    closeModal();
    toast(editing ? `${tiers.id} modifié.` : `${tiers.id} créé.`);
  };
  return (
    <Modal title={editing ? `Modifier ${tiers.id}` : (isClient ? 'Nouveau client' : 'Nouveau fournisseur')} size="sm" onClose={closeModal} bodyRef={bodyRef}
      footer={<>
        <button className="btn btn-ghost" onClick={closeModal}>Annuler</button>
        <button className="btn btn-accent" onClick={save}>Enregistrer</button>
      </>}>
      <Field label={isClient ? 'ID Client' : 'ID Fournisseur'}><input value={tiers.id} disabled readOnly /></Field>
      <Field label="Nom société"><input required value={nom} onChange={e => setNom(e.target.value)} /></Field>
      <Field label="ICE"><input required value={ice} onChange={e => setIce(e.target.value)} /></Field>
      <Field label="Adresse"><input required value={adresse} onChange={e => setAdresse(e.target.value)} /></Field>
    </Modal>
  );
}

function HistoriqueModal({ type, tiers, state }: { type: TiersType; tiers: Tiers; state: State }) {
  const { closeModal } = useUI();
  const isClient = type === 'client';
  const hist = isClient ? clientHistorique(state.devis, tiers.nom) : fournisseurHistorique(tiers.id, state.immobilisations, state.achats);
  return (
    <Modal title={`Historique — ${tiers.nom}`} onClose={closeModal} footer={<button className="btn btn-ghost" onClick={closeModal}>Fermer</button>}>
      {hist.length ? (
        <div className="pick-list">{hist.map((h, i) => (
          <div className="pick-item" key={i}>
            <div>
              <div className="pi-main">{h.label}</div>
              <div className="pi-sub">{fmtDate(h.date)} · <Badge cls={h.badge}>{h.statut}</Badge></div>
            </div>
            <span className="pi-amt">{money(h.montant)} DH</span>
          </div>
        ))}</div>
      ) : <EmptyState>Aucun historique {isClient ? 'de devis' : "d'achats"} pour ce {isClient ? 'client' : 'fournisseur'} pour l'instant.</EmptyState>}
    </Modal>
  );
}

function TiersList({ type, canEdit }: { type: TiersType; canEdit: boolean }) {
  const { state, update } = useStore();
  const { openModal } = useUI();
  const isClient = type === 'client';
  const list = state[coll(type)];

  const openForm = (t?: Tiers) => {
    const tiers = t || { id: nextTiersId(isClient ? 'CL' : 'FL', list), nom: '', ice: '', adresse: '' };
    openModal(<TiersForm type={type} tiers={tiers} editing={!!t} update={update} />);
  };
  const openHist = (t: Tiers) => openModal(<HistoriqueModal type={type} tiers={t} state={state} />);

  const columns: Column<Tiers>[] = [
    { key: 'id', label: isClient ? 'ID Client' : 'ID Fournisseur', className: 'mono', render: x => x.id, filter: { value: x => x.id, placeholder: 'ID' } },
    { key: 'nom', label: 'Nom société', render: x => x.nom, filter: { value: x => x.nom } },
    { key: 'ice', label: 'ICE', className: 'mono', render: x => x.ice, filter: { value: x => x.ice } },
    { key: 'adresse', label: 'Adresse', render: x => x.adresse, filter: { value: x => x.adresse } },
    { key: 'actions', label: '', nowrap: true, render: x => (<>
      <button className="btn btn-ghost btn-sm" onClick={() => openHist(x)}>Historique</button>{' '}
      {canEdit && <button className="btn btn-ghost btn-sm" onClick={() => openForm(x)}>Modifier</button>}
    </>) },
  ];
  const tf = useTableFilters(list, columns);
  return (<>
    {canEdit && <PageActions><AddButton onClick={() => openForm()}>{isClient ? 'Ajouter un client' : 'Ajouter un fournisseur'}</AddButton></PageActions>}
    <Panel title={isClient ? 'Clients' : 'Fournisseurs'} count={tf.filtered.length}>
      <DataTable tf={tf} columns={columns} rowKey={x => x.id} onRowDoubleClick={canEdit ? openForm : undefined}
        emptyText={`Aucun ${isClient ? 'client' : 'fournisseur'} ne correspond aux filtres.`} />
    </Panel>
  </>);
}

export default function TiersPage() {
  const rc = useRights('tiers_client'), rf = useRights('tiers_fournisseur');
  const [tab, setTab] = useState<TiersType>('client');
  const tabs = [
    { id: 'client' as const, label: 'Client', visible: rc.voir },
    { id: 'fournisseur' as const, label: 'Fournisseur', visible: rf.voir },
  ];
  const cur = pickTab(tab, tabs);
  return (<>
    <SettingsTabs tabs={tabs} active={cur} onChange={setTab} />
    <TiersList key={cur} type={cur} canEdit={(cur === 'client' ? rc : rf).modifier} />
  </>);
}
