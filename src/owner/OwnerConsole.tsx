/* Console du propriétaire (portage du prototype : renderOwner / renderOwnerList). */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { OwnerBackend, OwnerData, OwnerEntreprise } from '../data/ownerBackend';
import { etatEntreprise, limiteEntreprise } from '../lib/licence';
import { fmtDate, joursDepuisAujourdhui, money, todayIso } from '../lib/format';
import { useUI } from '../ui/UIProvider';
import { toast } from '../ui/toast';
import { ETAT_BADGE } from './rules';
import { EntrepriseDetail, EntrepriseForm, PaiementForm, SuppressionForm, SuspensionForm, TarifsForm } from './OwnerForms';

function Kpi({ label, value, sub, accent }: { label: string; value: ReactNode; sub?: string; accent?: string }) {
  return (
    <div className="kpi-card">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" style={accent ? { color: accent } : undefined}>{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}
const Section = ({ title }: { title: string }) => <h2 className="dash-section"><span>{title}</span></h2>;

interface Alerte { e: OwnerEntreprise; niveau: 'warn' | 'danger'; tri: number; txt: string }
export function alertesDe(clients: OwnerEntreprise[]): Alerte[] {
  const out: Alerte[] = [];
  const quand = (j: number) => (j === 0 ? 'aujourd’hui' : 'dans ' + j + ' j');
  clients.forEach(e => {
    const s = etatEntreprise(e);
    if (s === 'Essai') { const j = joursDepuisAujourdhui(e.essaiFin); if (j <= 7) out.push({ e, niveau: 'warn', tri: j, txt: `Essai : se termine ${quand(j)} (${fmtDate(e.essaiFin)})` }); }
    else if (s === 'Active') { const j = joursDepuisAujourdhui(e.echeance); if (j <= 30) out.push({ e, niveau: 'warn', tri: j, txt: `Licence à renouveler ${quand(j)} (échéance ${fmtDate(e.echeance)})` }); }
    else if (s === 'Licence expirée') { const j = joursDepuisAujourdhui(e.echeance); out.push({ e, niveau: 'danger', tri: j, txt: `Licence expirée depuis ${-j} j — ${money(e.prix)} DH à encaisser` }); }
    else if (s === 'Essai expiré') {
      const j = e.essaiFin ? joursDepuisAujourdhui(e.essaiFin) : 0;
      out.push({ e, niveau: 'danger', tri: j, txt: e.essaiFin ? `Essai terminé depuis ${-j} j — aucun paiement reçu` : 'Aucun essai ni paiement enregistré' });
    }
  });
  return out.sort((a, b) => a.tri - b.tri);
}

export default function OwnerConsole({ backend, onExit, onLogout }: { backend: OwnerBackend; onExit: () => void; onLogout: (msg?: string) => void }) {
  const { openModal } = useUI();
  const [data, setData] = useState<OwnerData | null>(null);
  const [error, setError] = useState('');
  const [f, setF] = useState({ q: '', etat: '', licence: '', tri: 'echeance' });

  const refresh = useCallback(async () => {
    try { setData(await backend.list()); setError(''); }
    catch (e: any) {
      if (!(await backend.hasSession().catch(() => false))) return onLogout('Session expirée. Reconnectez-vous.');
      setError(e?.message || 'Chargement impossible.');
    }
  }, [backend, onLogout]);
  useEffect(() => { void refresh(); }, [refresh]);

  const rows = useMemo(() => {
    if (!data) return [];
    const q = f.q.trim().toLowerCase();
    return data.entreprises.filter(e =>
      (!q || [e.nom, e.code, e.contact, e.email].some(v => String(v || '').toLowerCase().includes(q))) &&
      (!f.etat || etatEntreprise(e) === f.etat) && (!f.licence || e.licence === f.licence))
      .sort((a, b) => f.tri === 'nom' ? a.nom.localeCompare(b.nom) : f.tri === 'prix' ? b.prix - a.prix : limiteEntreprise(a).localeCompare(limiteEntreprise(b)));
  }, [data, f]);

  if (!data) {
    return (
      <div className="auth-screen" style={{ display: 'flex' }}>
        {error
          ? <div className="auth-card"><div className="auth-msg" role="alert">{error}</div>
              <div style={{ display: 'flex', gap: 10 }}><button className="btn btn-ghost" onClick={() => void refresh()}>Réessayer</button><button className="btn btn-primary" onClick={() => onLogout()}>Se déconnecter</button></div></div>
          : <div className="auth-sub">Chargement…</div>}
      </div>
    );
  }

  const ents = data.entreprises, clients = ents.filter(e => !e.interne);
  const annee = todayIso().slice(0, 4);
  const nb = (s: string) => clients.filter(e => etatEntreprise(e) === s).length;
  const mrr = clients.filter(e => etatEntreprise(e) === 'Active').reduce((s, e) => s + (e.licence === 'Annuelle' ? e.prix / 12 : e.prix), 0);
  const payesAnnee = ents.flatMap(e => e.paiements.filter(p => p.date.slice(0, 4) === annee));
  const impayes = clients.filter(e => ['Licence expirée', 'Essai expiré'].includes(etatEntreprise(e)));
  const alertes = alertesDe(clients);

  const common = { backend, onDone: refresh };
  const openForm = (e?: OwnerEntreprise) => openModal(<EntrepriseForm {...common} entreprise={e} tarifs={data.tarifs} />);
  const openPaiement = (e: OwnerEntreprise) => {
    if (e.interne) return toast('Compte interne gratuit : aucun paiement à enregistrer.');
    openModal(<PaiementForm {...common} entreprise={e} />);
  };
  const openDetail = (e: OwnerEntreprise) => openModal(<EntrepriseDetail {...common} entreprise={e} onPaiement={() => openPaiement(e)} />);
  async function reactiver(e: OwnerEntreprise) {
    try {
      await backend.reactivate(e.id);
      const s = etatEntreprise({ ...e, suspendu: false });
      toast(`${e.nom} réactivée` + (s === 'Licence expirée' || s === 'Essai expiré' ? ' — attention : sa licence est expirée, l’accès reste bloqué tant qu’aucun paiement n’est enregistré.' : '.'));
      await refresh();
    } catch (ex: any) { toast(ex?.message || 'Opération impossible.'); }
  }

  return (
    <div className="owner-console" style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <div className="owner-top">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><span className="brand-mark">GT</span>
          <div><div style={{ fontFamily: 'var(--font-d)', fontWeight: 700, fontSize: 17 }}>Espace propriétaire</div>
            <div style={{ fontSize: 12, opacity: .75 }}>GS-Travaux · entreprises clientes, licences et paiements{backend.mode === 'local' ? ' · mode démonstration' : ''}</div></div></div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-sm" onClick={() => openModal(<TarifsForm {...common} tarifs={data.tarifs} />)}>Tarifs</button>
          <button className="btn btn-sm" onClick={onExit}>Retour à l’application</button>
          <button className="btn btn-sm" onClick={() => onLogout()}>Se déconnecter</button>
        </div>
      </div>
      <div className="owner-body">
        {error && <div className="auth-msg" role="alert" style={{ marginTop: 14 }}>{error}</div>}
        <Section title="Vue d’ensemble" />
        <div className="kpi-grid">
          <Kpi label="Entreprises clientes" value={clients.length} sub={nb('Active') + ' active(s) · ' + ents.filter(e => e.interne).length + ' compte(s) interne(s)'} />
          <Kpi label="En essai" value={nb('Essai')} sub={'Durée d’essai : ' + data.tarifs.essaiJours + ' jours'} accent="var(--warn)" />
          <Kpi label="Suspendues" value={nb('Suspendue')} sub="Accès bloqué" accent={nb('Suspendue') ? 'var(--danger)' : ''} />
          <Kpi label="À encaisser" value={impayes.length} sub={money(impayes.reduce((s, e) => s + e.prix, 0)) + ' DH (licences ou essais expirés)'} accent={impayes.length ? 'var(--danger)' : ''} />
          <Kpi label="Revenu mensuel estimé" value={money(mrr) + ' DH'} sub="Licences actives ; annuel ÷ 12" accent="var(--success)" />
          <Kpi label="Revenu annuel estimé" value={money(mrr * 12) + ' DH'} sub="Projection sur 12 mois" />
          <Kpi label={'Encaissé en ' + annee} value={money(payesAnnee.reduce((a, p) => a + p.montant, 0)) + ' DH'} sub={payesAnnee.length + ' paiement(s)'} accent="var(--primary-2)" />
        </div>

        <Section title="À traiter" />
        <div className="panel">
          {alertes.length ? alertes.map(a => (
            <div key={a.e.id} className={'owner-alert ' + a.niveau}>
              <div><strong>{a.e.nom}</strong> <span className="mono" style={{ color: 'var(--ink-soft)' }}>{a.e.code}</span><br /><span>{a.txt}</span></div>
              <div style={{ whiteSpace: 'nowrap' }}>
                <button className="btn btn-sm btn-accent" onClick={() => openPaiement(a.e)}>Enregistrer un paiement</button>{' '}
                <button className="btn btn-sm btn-ghost" onClick={() => openDetail(a.e)}>Détail</button>
              </div>
            </div>
          )) : <div className="empty-state" style={{ padding: 26 }}>Rien à signaler : aucun essai ni licence à traiter.</div>}
        </div>

        <Section title="Entreprises" />
        <div className="panel" style={{ padding: '14px 18px', marginBottom: 14 }}>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="field" style={{ margin: 0, flex: 1, minWidth: 200 }}><label htmlFor="of-q">Recherche</label>
              <input id="of-q" placeholder="Nom, code, contact…" value={f.q} onChange={e => setF({ ...f, q: e.target.value })} /></div>
            <div className="field" style={{ margin: 0, minWidth: 160 }}><label htmlFor="of-etat">État</label>
              <select id="of-etat" value={f.etat} onChange={e => setF({ ...f, etat: e.target.value })}><option value="">Tous</option>{Object.keys(ETAT_BADGE).map(s => <option key={s}>{s}</option>)}</select></div>
            <div className="field" style={{ margin: 0, minWidth: 140 }}><label htmlFor="of-lic">Licence</label>
              <select id="of-lic" value={f.licence} onChange={e => setF({ ...f, licence: e.target.value })}><option value="">Toutes</option><option>Mensuelle</option><option>Annuelle</option></select></div>
            <div className="field" style={{ margin: 0, minWidth: 160 }}><label htmlFor="of-tri">Trier par</label>
              <select id="of-tri" value={f.tri} onChange={e => setF({ ...f, tri: e.target.value })}><option value="echeance">Échéance</option><option value="nom">Nom</option><option value="prix">Prix</option></select></div>
            <button className="btn btn-accent" onClick={() => openForm()}>+ Ajouter une entreprise</button>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head"><h2>Entreprises <span className="count-pill">{rows.length}</span></h2></div>
          <div className="table-wrap"><table>
            <thead><tr><th>Code</th><th>Entreprise</th><th>Contact</th><th>Licence</th><th>Prix</th><th>État</th><th>Échéance</th><th>Dernier paiement</th><th>Utilisateurs</th><th></th></tr></thead>
            <tbody>
              {rows.length ? rows.map(e => {
                const s = etatEntreprise(e), dernier = e.paiements.length ? e.paiements.map(p => p.date).sort().slice(-1)[0] : '';
                const lim = e.interne ? '' : (e.echeance || e.essaiFin);
                const j = lim ? joursDepuisAujourdhui(lim) : null;
                const alerte = (j !== null && (s === 'Active' || s === 'Essai')) ? (j <= 7 ? 'var(--danger)' : j <= 30 ? 'var(--warn)' : '') : (s.includes('expir') ? 'var(--danger)' : '');
                return (
                  <tr key={e.id} title="Double-cliquer pour voir le détail" onDoubleClick={ev => { if (!(ev.target as HTMLElement).closest('button')) openDetail(e); }}>
                    <td className="mono" data-label="Code">{e.code}</td>
                    <td data-label="Entreprise">{e.nom}{e.interne && <span className="badge badge-cree" style={{ marginLeft: 4 }}>Interne</span>}</td>
                    <td data-label="Contact">{e.contact}<div style={{ fontSize: 11.5, color: 'var(--ink-soft)' }}>{e.email}</div></td>
                    <td data-label="Licence">{e.interne ? 'Gratuite' : e.licence}</td>
                    <td className="num" data-label="Prix">{e.interne ? '—' : money(e.prix) + ' DH'}</td>
                    <td data-label="État"><span className={'badge ' + ETAT_BADGE[s]}>{s}</span>{e.suspendu && e.motifSuspension && <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', marginTop: 3 }}>{e.motifSuspension}</div>}</td>
                    <td data-label="Échéance" style={alerte ? { color: alerte, fontWeight: 600 } : undefined}>{e.interne ? '—' : (e.echeance ? fmtDate(e.echeance) : (e.essaiFin ? 'Essai jusqu’au ' + fmtDate(e.essaiFin) : '—'))}</td>
                    <td data-label="Dernier paiement">{fmtDate(dernier)}</td>
                    <td className="num" data-label="Utilisateurs">{e.nbUtilisateurs}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => openDetail(e)}>Détail</button>{' '}
                      <button className="btn btn-ghost btn-sm" onClick={() => openForm(e)}>Modifier</button>{' '}
                      {!e.interne && <><button className="btn btn-ghost btn-sm" onClick={() => openPaiement(e)}>Paiement</button>{' '}</>}
                      {e.suspendu
                        ? <button className="btn btn-ghost btn-sm" onClick={() => void reactiver(e)}>Réactiver</button>
                        : <button className="btn btn-ghost btn-sm" onClick={() => openModal(<SuspensionForm {...common} entreprise={e} />)}>Suspendre</button>}{' '}
                      <button className="btn btn-danger btn-sm" onClick={() => openModal(<SuppressionForm {...common} entreprise={e} />)}>Supprimer</button>
                    </td>
                  </tr>
                );
              }) : <tr><td colSpan={10}><div className="empty-state">Aucune entreprise ne correspond aux filtres.</div></td></tr>}
            </tbody>
          </table></div>
        </div>
      </div>
    </div>
  );
}
