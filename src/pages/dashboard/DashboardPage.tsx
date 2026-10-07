import { useId, useMemo, useState, type ChangeEvent } from 'react';
import { useStore } from '../../data/store';
import { libActif } from '../../lib/liberatoire';
import { EmptyState, Panel } from '../../ui/misc';
import { dashboardVisibility, hasAnySection, readableCollections, restrictState } from './access';
import { MOIS_LABELS, NO_FILTERS, availableYears, computeDashboard, type DashFilters } from './compute';
import { ChantiersSection, ChargesSection, CommercialSection, ImmoSection, ImpotsSection, LiberatoireSection, PersonnelSection, TresorerieSection } from './sections';

export default function DashboardPage() {
  const { state, can } = useStore();
  const uid = useId();
  const [f, setF] = useState<DashFilters>(NO_FILTERS);
  const set = (k: keyof DashFilters) => (e: ChangeEvent<HTMLSelectElement>) => setF(p => ({ ...p, [k]: e.target.value }));

  const readable = useMemo(() => readableCollections(can), [can]);
  const v = useMemo(() => dashboardVisibility(readable, libActif(state.societe)), [readable, state.societe]);
  const data = useMemo(() => restrictState(state, readable), [state, readable]);
  const years = useMemo(() => availableYears(data), [data]);
  const r = useMemo(() => computeDashboard(data, f), [data, f]);

  if (!hasAnySection(v)) return <Panel><EmptyState>Aucune donnée n'est accessible avec votre profil : le tableau de bord est vide. Contactez un administrateur pour obtenir l'accès aux données.</EmptyState></Panel>;

  const props = { r, v, f, readable };
  return (
    <>
      <div className="panel" style={{ padding: '14px 18px', marginBottom: 18 }}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="field" style={{ margin: 0, minWidth: 150 }}>
            <label htmlFor={uid + 'a'}>Année</label>
            <select id={uid + 'a'} value={f.annee} onChange={set('annee')}>
              <option value="">Toutes</option>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="field" style={{ margin: 0, minWidth: 150 }}>
            <label htmlFor={uid + 'm'}>Mois</label>
            <select id={uid + 'm'} value={f.mois} onChange={set('mois')}>
              <option value="">Tous</option>
              {MOIS_LABELS.map((m, i) => <option key={m} value={String(i + 1).padStart(2, '0')}>{m}</option>)}
            </select>
          </div>
          {v.clientFilter && (
            <div className="field" style={{ margin: 0, minWidth: 200 }}>
              <label htmlFor={uid + 'c'}>Client</label>
              <select id={uid + 'c'} value={f.client} onChange={set('client')}>
                <option value="">Tous les clients</option>
                {data.clients.map(c => <option key={c.id} value={c.nom}>{c.nom}</option>)}
              </select>
            </div>
          )}
        </div>
      </div>
      {v.commercial && <CommercialSection {...props} />}
      {v.tresorerie.show && <TresorerieSection {...props} />}
      {v.chantiers.show && <ChantiersSection {...props} />}
      {v.charges.show && <ChargesSection {...props} />}
      {v.personnel.show && <PersonnelSection {...props} />}
      {v.impots && <ImpotsSection {...props} />}
      {v.liberatoire && <LiberatoireSection {...props} />}
      {v.immo.show && <ImmoSection {...props} />}
    </>
  );
}
