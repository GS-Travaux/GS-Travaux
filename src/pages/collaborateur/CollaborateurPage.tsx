import { useState } from 'react';
import { useStore } from '../../data/store';
import { EmptyState, SettingsTabs, pickTab, type TabDef } from '../../ui/misc';
import SalariesTab from './SalariesTab';
import PointageTab from './PointageTab';
import CongesTab from './CongesTab';
import PaieTab from './paie/PaieTab';
import CnssTab from './paie/CnssTab';
import CimrTab from './paie/CimrTab';

type TabId = 'salaries' | 'pointage' | 'conges' | 'paie' | 'cnss' | 'cimr';

export default function CollaborateurPage() {
  const { can } = useStore();
  const [tab, setTab] = useState<TabId>('salaries');
  const tabs: TabDef<TabId>[] = [
    { id: 'salaries', label: 'Collaborateurs', visible: can('collab_salaries') },
    { id: 'pointage', label: 'Pointage', visible: can('collab_pointage') },
    { id: 'conges', label: 'Congés & Absences', visible: can('collab_conges') },
    { id: 'paie', label: 'Paie', visible: can('collab_paie') },
    { id: 'cnss', label: 'Bordereaux de paiement CNSS', visible: can('collab_cnss') },
    { id: 'cimr', label: 'Bordereaux CIMR', visible: can('collab_cimr') },
  ];
  const active = pickTab(tab, tabs);
  if (!tabs.some(t => t.visible)) return <EmptyState>Aucun onglet accessible avec votre profil.</EmptyState>;
  return (
    <>
      <SettingsTabs tabs={tabs} active={active} onChange={setTab} />
      <div>
        {active === 'salaries' && <SalariesTab />}
        {active === 'pointage' && <PointageTab />}
        {active === 'conges' && <CongesTab />}
        {active === 'paie' && <PaieTab />}
        {active === 'cnss' && <CnssTab />}
        {active === 'cimr' && <CimrTab />}
      </div>
    </>
  );
}
