/* Détail d'un devis : lignes, articles demandés, ordres de mission. */
import { useState } from 'react';
import { useRights, useStore } from '../../data/store';
import { Modal } from '../../ui/Modal';
import { useUI } from '../../ui/UIProvider';
import { Badge, PlusIcon, SettingsTabs } from '../../ui/misc';
import { AVANCEMENT_BADGE, BADGE_CLASS, devisAvancement, devisTotal } from '../../lib/devis';
import { fmtDate, money } from '../../lib/format';
import { collabNom } from '../../lib/paie';
import { ART_BADGE, ligneMontant } from './devisLogic';
import { DevisForm } from './DevisForm';
import { ArticleForm } from './ArticleForms';
import { MissionForm } from '../mission/MissionForm';
import { MISSION_BADGE } from '../mission/missionLogic';

export type DetailTab = 'lignes' | 'articles' | 'missions';

export function DevisDetail({ devisId, tab: initialTab = 'lignes' }: { devisId: string; tab?: DetailTab }) {
  const { state } = useStore();
  const { openModal, closeModal } = useUI();
  const rDevis = useRights('devis');
  const rArt = useRights('devis_articles');
  const rMission = useRights('mission');
  const [tab, setTab] = useState<DetailTab>(initialTab);
  const d = state.devis.find(x => x.id === devisId);
  if (!d) return null;

  const avancement = devisAvancement(d, state.ordresMission);
  const articles = state.demandesArticles.filter(a => a.devisId === devisId).sort((a, b) => a.ligne - b.ligne);
  const missions = state.ordresMission.filter(o => o.devisId === devisId).sort((a, b) => b.date.localeCompare(a.date));
  const reopen = (t: DetailTab) => () => openModal(<DevisDetail devisId={devisId} tab={t} />);

  return (
    <Modal title={`Détail du devis ${d.numero}`} onClose={closeModal}
      footer={<>
        <button className="btn btn-ghost" onClick={closeModal}>Fermer</button>
        {rDevis.modifier && <button className="btn btn-primary" onClick={() => openModal(<DevisForm devisId={d.id} />)}>Modifier</button>}
      </>}>
      <div className="modal-sticky-head">
        <div className="hint" style={{ marginBottom: 14 }}>
          <strong>{d.client}</strong> — {d.objet}<br />
          Date : {fmtDate(d.date)} · Émetteur : {d.emetteur} · Situation : <Badge cls={BADGE_CLASS[d.statut]}>{d.statut}</Badge>
          {' '}· Avancement travaux : <Badge cls={AVANCEMENT_BADGE[avancement]}>{avancement}</Badge>
        </div>
        <SettingsTabs<DetailTab> active={tab} onChange={setTab} tabs={[
          { id: 'lignes', label: 'Lignes' },
          { id: 'articles', label: `Articles demandés${articles.length ? ` (${articles.length})` : ''}` },
          { id: 'missions', label: `Ordres de mission${missions.length ? ` (${missions.length})` : ''}` },
        ]} />
      </div>

      {tab === 'lignes' && (
        <>
          <div className="h-scroll">
            <table className="pdoc-table">
              <thead><tr><th>#</th><th>Désignation</th><th>Matière</th><th className="num">Qté</th><th className="num">PU</th><th className="num">Montant</th></tr></thead>
              <tbody>
                {d.lignes.map((l, i) => {
                  const taches = (l.taches || []).filter(t => t.trim());
                  return (
                    <tr key={i}>
                      <td>{i + 1}</td>
                      <td>{l.designation}{taches.length > 0 && <ul style={{ margin: '4px 0 0', paddingLeft: 16, fontSize: 11, color: 'var(--ink-soft)' }}>{taches.map((t, k) => <li key={k}>{t}</li>)}</ul>}</td>
                      <td>{l.matiere === 'avec' ? 'Avec matière' : 'Sans matière'}</td>
                      <td className="num">{l.qte}</td>
                      <td className="num">{money(l.pu)}</td>
                      <td className="num">{money(ligneMontant(l))}</td>
                    </tr>
                  );
                })}
                <tr className="pdoc-total"><td colSpan={5} style={{ textAlign: 'right' }}>Total</td><td className="num">{money(devisTotal(d))}</td></tr>
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 12, fontSize: 12.5 }}>
            Mode de paiement : {d.modePaiement || '—'} · Délai de paiement : {d.delaiPaiement || '—'}{d.demandeAvance ? ` · Avance demandée : ${money(d.demandeAvance)} DH` : ''}
          </div>
        </>
      )}

      {tab === 'articles' && (
        <>
          {rArt.modifier && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16, marginBottom: 10 }}>
              <button className="btn btn-accent btn-sm" onClick={() => openModal(<ArticleForm devisId={devisId} onSaved={reopen('articles')} />)}><PlusIcon /> Ajouter un article</button>
            </div>
          )}
          {articles.length ? (
            <div className="h-scroll">
              <table className="pdoc-table">
                <thead><tr><th>#</th><th>Désignation</th><th className="num">Quantité</th><th>Situation</th><th>Date pris</th></tr></thead>
                <tbody>{articles.map(a => (
                  <tr key={a.id}>
                    <td>{a.ligne}</td><td>{a.designation}</td><td className="num">{a.quantite}</td>
                    <td><Badge cls={ART_BADGE[a.situation]}>{a.situation}</Badge></td><td>{fmtDate(a.datePris)}</td>
                  </tr>))}
                </tbody>
              </table>
            </div>
          ) : <div className="empty-state">Aucun article demandé pour ce devis.</div>}
        </>
      )}

      {tab === 'missions' && (
        <>
          {rMission.modifier && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16, marginBottom: 10 }}>
              <button className="btn btn-accent btn-sm" onClick={() => openModal(<MissionForm devisId={devisId} onSaved={reopen('missions')} />)}><PlusIcon /> Ajouter un ordre de mission</button>
            </div>
          )}
          {missions.length ? (
            <div className="h-scroll">
              <table className="pdoc-table">
                <thead><tr><th>N° OM</th><th>Date</th><th>Ligne concernée</th><th>Collaborateurs</th><th>Statut</th></tr></thead>
                <tbody>{missions.map(o => (
                  <tr key={o.id}>
                    <td className="mono">{o.id}</td><td>{fmtDate(o.date)}</td><td>{o.lignes[0] || '—'}</td>
                    <td>{o.collaborateurIds.map(cid => collabNom(state.collaborateurs, cid)).join(', ') || '—'}</td>
                    <td><Badge cls={MISSION_BADGE[o.statut]}>{o.statut}</Badge></td>
                  </tr>))}
                </tbody>
              </table>
            </div>
          ) : <div className="empty-state">Aucun ordre de mission pour ce devis.</div>}
        </>
      )}
    </Modal>
  );
}
