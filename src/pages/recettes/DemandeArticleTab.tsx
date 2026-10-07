/* Sous-onglet « Demande d'article » de la page Devis. */
import { useMemo } from 'react';
import { useRights, useStore } from '../../data/store';
import { useUI } from '../../ui/UIProvider';
import { toast } from '../../ui/toast';
import { DataTable, useTableFilters, type Column } from '../../ui/DataTable';
import { AddButton, Badge, PageActions, Panel } from '../../ui/misc';
import { fmtDate } from '../../lib/format';
import type { DemandeArticle } from '../../lib/types';
import { ARTICLE_SITUATIONS, ART_BADGE } from './devisLogic';
import { ArticlePicker, ArticlePrisForm } from './ArticleForms';

export default function DemandeArticleTab() {
  const { state, update } = useStore();
  const { openModal } = useUI();
  const r = useRights('devis_articles');
  const devisDe = (a: DemandeArticle) => state.devis.find(d => d.id === a.devisId);
  const rows = useMemo(() => [...state.demandesArticles].sort((x, y) => y.ligne - x.ligne), [state.demandesArticles]);

  const cancel = (id: string) => {
    update(d => { const a = d.demandesArticles.find(x => x.id === id); if (a) a.situation = 'Annulé'; });
    toast('Demande annulée.');
  };
  const columns: Column<DemandeArticle>[] = [
    { key: 'ligne', label: 'N° ligne', className: 'mono', render: a => a.ligne },
    { key: 'dateHeure', label: 'Date / heure', className: 'mono', render: a => <span style={{ fontSize: 11.5 }}>{fmtDate(a.dateHeure.slice(0, 10))} {a.dateHeure.slice(11, 16)}</span> },
    { key: 'designation', label: 'Désignation', filter: { value: a => a.designation, placeholder: 'Désignation' }, render: a => a.designation },
    { key: 'quantite', label: 'Quantité', className: 'num', render: a => a.quantite },
    { key: 'situation', label: 'Situation', filter: { value: a => a.situation, options: [...ARTICLE_SITUATIONS], placeholder: 'Toutes' }, render: a => <Badge cls={ART_BADGE[a.situation]}>{a.situation}</Badge> },
    { key: 'datePris', label: 'Date pris', render: a => fmtDate(a.datePris) },
    { key: 'numero', label: 'N° devis', className: 'mono', filter: { value: a => devisDe(a)?.numero, placeholder: 'N° devis' }, render: a => devisDe(a)?.numero || '—' },
    { key: 'objet', label: 'Objet devis', filter: { value: a => devisDe(a)?.objet, placeholder: 'Objet devis' }, render: a => devisDe(a)?.objet || '—' },
    { key: 'bc', label: 'N° BC', className: 'mono', filter: { value: a => devisDe(a)?.bc?.numero, placeholder: 'N° BC' }, render: a => devisDe(a)?.bc?.numero || '—' },
    { key: 'actions', label: '', nowrap: true, render: a => (r.modifier && a.situation === 'Demandé') ? <>
      <button className="btn btn-ghost btn-sm" onClick={() => openModal(<ArticlePrisForm articleId={a.id} />)}>Marquer pris</button>{' '}
      <button className="btn btn-danger btn-sm" onClick={() => cancel(a.id)}>Annuler</button>
    </> : null },
  ];
  const tf = useTableFilters(rows, columns);
  return (
    <>
      {r.modifier && <PageActions><AddButton onClick={() => openModal(<ArticlePicker />)}>Ajouter</AddButton></PageActions>}
      <Panel title="Demandes d'article" count={tf.filtered.length}>
        <DataTable tf={tf} columns={columns} rowKey={a => a.id} emptyText="Aucune demande d'article ne correspond aux filtres." />
      </Panel>
    </>
  );
}
