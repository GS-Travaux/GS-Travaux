/* Page Sécurité : Mon compte, Utilisateurs, Profil, Droits (portage du prototype, renderSecurite).
   Les profils, droits et utilisateurs ne passent pas par update() : chaque opération appelle le backend
   (qui vérifie que l'appelant est administrateur) puis recharge le magasin. */
import { useState } from 'react';
import { useStore } from '../../data/store';
import { SettingsTabs, pickTab, type TabDef } from '../../ui/misc';
import CompteTab from './CompteTab';
import UtilisateursTab from './UtilisateursTab';
import ProfilTab from './ProfilTab';
import DroitsTab from './DroitsTab';

type Tab = 'compte' | 'utilisateurs' | 'profil' | 'droits';

export default function SecuritePage() {
  const { can } = useStore();
  const [tab, setTab] = useState<Tab>('compte');
  const [droitsProfilId, setDroitsProfilId] = useState<string | null>(null);
  const tabs: TabDef<Tab>[] = [
    { id: 'compte', label: 'Mon compte', visible: can('securite_compte') },
    { id: 'utilisateurs', label: 'Utilisateurs', visible: can('securite_utilisateurs') },
    { id: 'profil', label: 'Profil', visible: can('securite_profil') },
    { id: 'droits', label: 'Droits', visible: can('securite_droits') },
  ];
  const active = pickTab(tab, tabs);
  const reglerDroits = can('securite_droits') ? (id: string) => { setDroitsProfilId(id); setTab('droits'); } : undefined;
  return (
    <>
      <SettingsTabs tabs={tabs} active={active} onChange={setTab} />
      <div id="sec-body">
        {active === 'compte' && <CompteTab />}
        {active === 'utilisateurs' && <UtilisateursTab />}
        {active === 'profil' && <ProfilTab onReglerDroits={reglerDroits} onCreated={setDroitsProfilId} />}
        {active === 'droits' && <DroitsTab profilId={droitsProfilId} onProfilChange={setDroitsProfilId} />}
      </div>
    </>
  );
}
