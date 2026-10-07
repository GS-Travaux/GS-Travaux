/* Coque de l'application : menu latéral, barre du haut, contenu de la page. */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useStore } from './data/store';
import { NAV_GROUPS, PAGES, PAGE_TABS } from './lib/rights';
import { ICONS } from './ui/icons';
import { PageActionsTarget } from './ui/misc';
import { NavContext } from './nav';
import { etatEntreprise, limiteEntreprise } from './lib/licence';
import { joursDepuisAujourdhui } from './lib/format';

import DashboardPage from './pages/dashboard/DashboardPage';
import DevisPage from './pages/recettes/DevisPage';
import CommandesPage from './pages/recettes/CommandesPage';
import FacturationPage from './pages/recettes/FacturationPage';
import TiersPage from './pages/tiers/TiersPage';
import ImmobilisationPage from './pages/immo/ImmobilisationPage';
import AchatsPage from './pages/achats/AchatsPage';
import CollaborateurPage from './pages/collaborateur/CollaborateurPage';
import MissionPage from './pages/mission/MissionPage';
import ImpotsPage from './pages/impots/ImpotsPage';
import SocietePage from './pages/societe/SocietePage';
import SecuritePage from './pages/securite/SecuritePage';

function renderPage(id: string): ReactNode {
  switch (id) {
    case 'dashboard': return <DashboardPage />;
    case 'devis': return <DevisPage />;
    case 'commandes': return <CommandesPage />;
    case 'facturation': return <FacturationPage />;
    case 'tiers': return <TiersPage />;
    case 'immo_materiel': return <ImmobilisationPage cat="materiel" />;
    case 'immo_transport': return <ImmobilisationPage cat="transport" />;
    case 'achat_consommable': return <AchatsPage type="consommable" />;
    case 'achat_autre': return <AchatsPage type="autre" />;
    case 'collaborateur': return <CollaborateurPage />;
    case 'mission': return <MissionPage />;
    case 'impots': return <ImpotsPage />;
    case 'societe': return <SocietePage />;
    case 'securite': return <SecuritePage />;
    default: return null;
  }
}

export function Shell({ onLogout }: { onLogout: () => void }) {
  const { state, me, company, can, profilNom, previewProfil, setPreviewProfil, backend } = useStore();
  const [page, setPage] = useState('dashboard');
  const [open, setOpen] = useState(false);
  const [actionsEl, setActionsEl] = useState<HTMLElement | null>(null);

  const allowed = useMemo(() => PAGES.filter(p => (PAGE_TABS[p.id] || [p.id]).some(k => can(k, 'voir'))), [can]);
  const current = allowed.find(p => p.id === page) || allowed[0];

  useEffect(() => { document.getElementById('root')?.scrollTo?.(0, 0); }, [current?.id]);

  const go = (id: string) => { setPage(id); setOpen(false); };
  const etat = etatEntreprise(company);
  const reste = company.interne ? null : joursDepuisAujourdhui(limiteEntreprise(company));
  const licenceNote = reste !== null && reste <= 14 && etat !== 'Suspendue'
    ? (etat === 'Essai' ? `Période d’essai : ${reste} jour${reste > 1 ? 's' : ''} restant${reste > 1 ? 's' : ''}.` : `Votre licence arrive à échéance dans ${reste} jour${reste > 1 ? 's' : ''}.`)
    : '';

  return (
    <NavContext.Provider value={{ page: current ? current.id : '', go }}>
      <div className="shell">
        <div className={'sidebar-backdrop' + (open ? ' show' : '')} onClick={() => setOpen(false)} />
        <aside className={'sidebar' + (open ? ' open' : '')}>
          <div className="brand"><span className="brand-mark">GT</span> GS-Travaux</div>
          {NAV_GROUPS.map(g => {
            const items = allowed.filter(p => p.group === g.id);
            if (!items.length) return null;
            return (
              <div key={g.id}>
                <div className="nav-group">{g.label}</div>
                <div className="nav">
                  {items.map(p => (
                    <button key={p.id} className={current && current.id === p.id ? 'active' : ''} onClick={() => go(p.id)}>
                      <svg viewBox="0 0 20 20" fill="none" dangerouslySetInnerHTML={{ __html: ICONS[p.id] || '' }} /><span>{p.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          <div className="sidebar-foot">
            <div id="sidebar-company">{state.societe.nom || company.nom || 'Mon Société'}</div>
            <div id="sidebar-user">{`${me.nom} · ${profilNom}`}</div>
            {backend.mode === 'supabase' && <button id="logout-btn" onClick={onLogout}>Se déconnecter</button>}
          </div>
        </aside>

        <div className="main">
          <div className="topbar">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button className="menu-btn" onClick={() => setOpen(true)} aria-label="Menu">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
              </button>
              <div>
                <h1 id="page-title">{current ? current.label : 'Accès restreint'}</h1>
                <div className="sub" id="page-sub">{current ? current.sub : ''}</div>
              </div>
            </div>
            <div id="page-actions" ref={setActionsEl} />
          </div>
          {licenceNote && <div className="owner-alert" style={{ margin: '0 0 0' }}><span>{licenceNote} Contactez l{'’'}éditeur pour la renouveler.</span></div>}
          <div className="content" id="content">
            {backend.mode === 'local' && <div className="hint" style={{ marginBottom: 12 }}>Mode démonstration : les données restent dans ce navigateur. Configurez Supabase pour l{'’'}utilisation en ligne (voir le guide).</div>}
            {current
              ? <PageActionsTarget.Provider value={actionsEl}><div key={current.id}>{renderPage(current.id)}</div></PageActionsTarget.Provider>
              : <div className="empty-state">Ce profil n{'’'}a accès à aucun onglet.</div>}
          </div>
        </div>
      </div>
      {previewProfil && (
        <div className="preview-banner" style={{ display: 'flex' }}>
          <span>Aperçu du profil « {previewProfil} »</span>
          <button className="btn btn-sm" onClick={() => { setPreviewProfil(null); go('securite'); }}>Quitter l{'’'}aperçu</button>
        </div>
      )}
    </NavContext.Provider>
  );
}
