/* Page Devis : onglets « Devis » et « Demande d'article ». */
import { useState } from 'react';
import { useStore } from '../../data/store';
import { EmptyState, SettingsTabs, pickTab, type TabDef } from '../../ui/misc';
import DevisListe from './DevisListe';
import DemandeArticleTab from './DemandeArticleTab';

type Tab = 'liste' | 'articles';

export default function DevisPage() {
  const { can } = useStore();
  const [sel, setSel] = useState<Tab>('liste');
  const tabs: TabDef<Tab>[] = [
    { id: 'liste', label: 'Devis', visible: can('devis') },
    { id: 'articles', label: "Demande d'article", visible: can('devis_articles') },
  ];
  if (!tabs.some(t => t.visible)) return <EmptyState>Vous n'avez accès à aucun onglet de cette page.</EmptyState>;
  const tab = pickTab(sel, tabs);
  return (
    <>
      <SettingsTabs tabs={tabs} active={tab} onChange={setSel} />
      {tab === 'liste' ? <DevisListe /> : <DemandeArticleTab />}
    </>
  );
}
