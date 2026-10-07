/* Sections du tableau de bord. Chaque section ne reçoit que des données déjà restreintes à ce que le profil peut lire
   (voir access.ts) et n'affiche que les éléments marqués visibles dans `Visibility`. */
import type { ReactNode } from 'react';
import { fmtDate, money } from '../../lib/format';
import { ACHAT_TYPES } from '../../lib/achats';
import { LIB_BADGE, LIB_SEUIL } from '../../lib/liberatoire';
import { Badge, Panel } from '../../ui/misc';
import type { Readable, Visibility } from './access';
import type { DashFilters, DashResult } from './compute';
import { BarChart, Donut, HBars } from './charts';
import KpiCard from './KpiCard';
import { DashPanel, DashSection, delaiLabel, signed } from './parts';

interface SectionProps { r: DashResult; v: Visibility; f: DashFilters; readable: Readable }
const dh = (n: number) => money(n) + ' DH';
const Hint = ({ children }: { children: ReactNode }) => <div className="hint" style={{ padding: '0 18px 12px' }}>{children}</div>;
const Empty = ({ cols, children }: { cols: number; children: ReactNode }) => <tr><td colSpan={cols}><div className="empty-state">{children}</div></td></tr>;

/* ───────── Activité commerciale ───────── */
export function CommercialSection({ r }: SectionProps) {
  return (
    <>
      <DashSection title="Activité commerciale" />
      <div className="kpi-grid">
        <KpiCard label="CA facturé" value={dh(r.totalFacture)} sub={r.countFacture + ' facture(s)'} accent="var(--success)" />
        <KpiCard label="CA facturé en cours" value={dh(r.totalFactureEnCours)} sub={r.facturesEnCours.length + ' facture(s) en délai de paiement'} accent="var(--primary-2)" />
        <KpiCard label="CA soldé (à facturer)" value={dh(r.totalSoldee)} sub={r.countSoldee + ' devis soldé(s)'} accent="var(--warn)" />
        <KpiCard label="CA en devis" value={dh(r.totalCree)} sub={r.countCree + ' devis créé(s)'} />
      </div>
      <div className="dash-grid">
        <DashPanel title="Chiffre d'affaires facturé par mois" sub="Basé sur la date de facture (DH)"><BarChart data={r.chartData} /></DashPanel>
        <DashPanel title="Répartition des devis par situation"><Donut data={r.statutData} label="Répartition des devis par situation" /></DashPanel>
      </div>
      <div className="panel" style={{ marginTop: 18 }}>
        <div className="panel-head"><h2>Top clients (CA facturé)</h2></div>
        <div className="table-wrap"><table>
          <thead><tr><th>Client</th><th>Montant facturé</th></tr></thead>
          <tbody>
            {r.topClients.length ? r.topClients.map(([nom, montant]) => (
              <tr key={nom}><td data-label="Client">{nom}</td><td className="num" data-label="Montant facturé">{dh(montant)}</td></tr>
            )) : <Empty cols={2}>Aucune facture pour l'instant.</Empty>}
          </tbody>
        </table></div>
      </div>
    </>
  );
}

/* ───────── Trésorerie ───────── */
export function TresorerieSection({ r, v }: SectionProps) {
  const t = v.tresorerie;
  const complete = t.encaissements && t.salaires && t.achats && t.impots;
  const cols = 3 + [t.encaissements, t.salaires, t.achats, t.impots].filter(Boolean).length;
  return (
    <>
      <DashSection title="Trésorerie" />
      <Panel title="Tableau de trésorerie">
        <Hint>
          Encaissements = factures à leur échéance (date de facture + délai de paiement). Les mois à venir sont prévisionnels. Décaissements = coût employeur (salaires + charges patronales), achats consommables « Payé » (TTC, à leur date d'achat) et impôts et taxes payés (à leur date de paiement). N'inclut pas les immobilisations ni les achats ou impôts « À payer ».
          {!complete && <> <strong>Certaines colonnes ne sont pas accessibles avec votre profil : les soldes sont calculés sur les colonnes affichées uniquement.</strong></>}
        </Hint>
        <div className="table-wrap"><table>
          <thead><tr>
            <th>Mois</th>
            {t.encaissements && <th>Encaissements</th>}{t.salaires && <th>Salaires</th>}{t.achats && <th>Achats payés</th>}{t.impots && <th>Impôts payés</th>}
            <th>Solde du mois</th><th>Solde cumulé</th>
          </tr></thead>
          <tbody>
            {r.treasuryRows.length ? r.treasuryRows.map(row => (
              <tr key={row.mois}>
                <td className="mono" data-label="Mois">{row.mois}{row.mois > r.moisCourant && <span style={{ color: 'var(--ink-soft)', fontSize: 11 }}> · prévu</span>}</td>
                {t.encaissements && <td className="num" data-label="Encaissements" style={{ color: 'var(--success)' }}>+ {dh(row.encaiss)}</td>}
                {t.salaires && <td className="num" data-label="Salaires" style={{ color: 'var(--danger)' }}>− {dh(row.salaires)}</td>}
                {t.achats && <td className="num" data-label="Achats payés" style={{ color: 'var(--danger)' }}>− {dh(row.achats)}</td>}
                {t.impots && <td className="num" data-label="Impôts payés" style={{ color: 'var(--danger)' }}>− {dh(row.impots)}</td>}
                <td className="num" data-label="Solde du mois" style={{ fontWeight: 600 }}>{signed(row.solde)}</td>
                <td className="num" data-label="Solde cumulé" style={{ fontWeight: 700 }}>{signed(row.cumule)}</td>
              </tr>
            )) : <Empty cols={cols}>Aucune donnée de trésorerie pour la période sélectionnée.</Empty>}
          </tbody>
        </table></div>
      </Panel>
    </>
  );
}

/* ───────── Chantiers ───────── */
export function ChantiersSection({ r, v, f }: SectionProps) {
  return (
    <>
      <DashSection title="Chantiers" />
      <div className="kpi-grid">
        <KpiCard label="Ordres de mission en cours" value={r.missionsEnCours} sub={r.missions.length + ' ordre(s) sur la période' + (f.client ? ' · ' + f.client : '')} />
        {v.chantiers.avancement && <>
          <KpiCard label="Travaux terminés" value={r.avItems[2].value} sub={'sur ' + r.devisActifs.length + ' devis non annulé(s)'} accent="var(--success)" />
          <KpiCard label="Travaux en cours" value={r.avItems[1].value} sub={r.avItems[0].value + ' non démarré(s)'} accent="var(--warn)" />
        </>}
      </div>
      <div className="dash-grid">
        <DashPanel title="Ordres de mission par situation" sub="Selon la date de l'ordre"><HBars items={r.omItems} /></DashPanel>
        {v.chantiers.avancement && <DashPanel title="Avancement des travaux" sub="Devis non annulés, d'après leurs ordres de mission"><HBars items={r.avItems} /></DashPanel>}
      </div>
    </>
  );
}

/* ───────── Charges d'exploitation ───────── */
export function ChargesSection({ r, v, f, readable }: SectionProps) {
  const c = v.charges;
  const partiel = readable.achatTypes.length === 1 ? ' · ' + ACHAT_TYPES[readable.achatTypes[0]].label.toLowerCase() + ' uniquement' : '';
  return (
    <>
      <DashSection title="Charges d'exploitation" />
      <div className="kpi-grid">
        {c.achats && <>
          <KpiCard label="Achats HT" value={dh(r.achatsTot.ht)} sub={r.achatsPeriode.length + ' achat(s)' + (f.client ? ' · affectés aux devis de ' + f.client : '') + partiel} />
          <KpiCard label="Achats TTC" value={dh(r.achatsTot.ttc)} sub={'TVA ' + dh(r.achatsTot.ttc - r.achatsTot.ht)} />
          <KpiCard label="Achats à payer" value={dh(r.achatsTot.apayer)} sub={r.achatsTot.nApayer + ' facture(s) fournisseur à régler'} accent="var(--warn)" />
        </>}
        {c.coutEmployeur && <KpiCard label="Coût employeur" value={dh(r.coutEmployeur)} sub={r.bulletinsPeriode.length + ' bulletin(s)' + (f.client ? ' · indépendant du client' : '')} />}
      </div>
      {(c.achats || c.marge) && (
        <div className="dash-grid">
          {c.achats && <DashPanel title="Achats par catégorie (HT)" sub="Consommables et autres achats"><HBars items={r.achatsCatItems} fmt={dh} /></DashPanel>}
          {c.marge && (
            <Panel title="Marge sur achats directs">
              <Hint>Montant du devis − achats HT affectés à ce devis (hors main-d'œuvre et frais généraux). Du moins au plus rentable.</Hint>
              <div className="table-wrap"><table>
                <thead><tr><th>Devis</th><th>Montant</th><th>Achats HT</th><th>Marge</th><th>%</th></tr></thead>
                <tbody>
                  {r.renta.length ? r.renta.map(x => (
                    <tr key={x.d.id}>
                      <td className="mono" data-label="Devis">{x.d.numero} <span style={{ fontFamily: 'var(--font-b)', color: 'var(--ink-soft)' }}>· {x.d.client}</span></td>
                      <td className="num" data-label="Montant">{dh(x.montant)}</td>
                      <td className="num" data-label="Achats HT">{dh(x.ach)}</td>
                      <td className="num" data-label="Marge" style={{ fontWeight: 600, color: x.marge < 0 ? 'var(--danger)' : 'var(--success)' }}>{signed(x.marge)}</td>
                      <td className="num" data-label="%">{x.pct.toFixed(1).replace('.', ',')} %</td>
                    </tr>
                  )) : <Empty cols={5}>Aucun achat affecté à un devis sur la période.</Empty>}
                </tbody>
              </table></div>
            </Panel>
          )}
        </div>
      )}
    </>
  );
}

/* ───────── Personnel & cotisations sociales ───────── */
export function PersonnelSection({ r, v, f }: SectionProps) {
  const p = v.personnel;
  return (
    <>
      <DashSection title="Personnel & cotisations sociales" />
      <div className="kpi-grid">
        {p.masseSalariale && <KpiCard label="Masse salariale" value={dh(r.massSalariale)} sub={r.bulletinsPeriode.length + ' bulletin(s) · net à payer' + (f.client ? ' · indépendant du client' : '')} />}
        {p.collaborateurs && <KpiCard label="Collaborateurs actifs" value={r.collabActifs} sub={r.collabTotal + ' au total'} />}
        {p.cnss && <KpiCard label="CNSS à payer" value={dh(r.cnssDu)} sub={r.cnssDus.length ? r.cnssDus.length + ' bordereau(x) à payer' : 'Aucun bordereau à payer'} accent={r.cnssDu ? 'var(--warn)' : undefined} />}
        {p.cimr && <KpiCard label="CIMR à payer" value={dh(r.cimrDu)} sub={r.cimrDus.length ? r.cimrDus.length + ' bordereau(x) à payer' : 'Aucun bordereau à payer'} accent={r.cimrDu ? 'var(--warn)' : undefined} />}
      </div>
      {p.pointage && (
        <div className="dash-grid">
          <DashPanel title="Pointage par situation" sub={r.tauxPresence === null ? 'Aucun pointage sur la période' : 'Taux de présence : ' + r.tauxPresence + ' % (présent + retard)'}><HBars items={r.ptItems} /></DashPanel>
          <div />
        </div>
      )}
    </>
  );
}

/* ───────── Impôts et taxes ───────── */
export function ImpotsSection({ r }: SectionProps) {
  return (
    <>
      <DashSection title="Impôts et taxes" />
      <div className="kpi-grid">
        <KpiCard label="Impôts et taxes à payer" value={dh(r.impotsNonPayesTotal)} sub={r.impotsNonPayes.length + ' échéance(s) non payée(s)'} accent={r.impotsNonPayes.length ? 'var(--warn)' : undefined} />
        <KpiCard label="Dont en retard" value={dh(r.impotsRetardTotal)} sub={r.impotsRetard.length ? r.impotsRetard.length + ' échéance(s) dépassée(s)' : 'Aucun retard'} accent={r.impotsRetard.length ? 'var(--danger)' : 'var(--success)'} />
        <KpiCard label="Impôts et taxes payés" value={dh(r.impotsPayesTotal)} sub={r.impotsPayes.length + ' paiement(s) sur la période'} accent="var(--success)" />
        <KpiCard label="Prochaine échéance" value={r.prochaineEch ? fmtDate(r.prochaineEch.echeance) : '—'} sub={r.prochaineEch ? r.prochaineEch.type + ' · ' + dh(r.prochaineEch.montant) : 'Aucune échéance à venir'} />
      </div>
      <div className="panel" style={{ marginTop: 18 }}>
        <div className="panel-head"><h2>Échéances fiscales à surveiller</h2></div>
        <Hint>Impôts et taxes non payés, échus ou à échéance dans les 60 prochains jours (situation à ce jour).</Hint>
        <div className="table-wrap"><table>
          <thead><tr><th>Impôt / taxe</th><th>Période</th><th>Échéance</th><th>Montant</th><th>Délai</th></tr></thead>
          <tbody>
            {r.impotsAlertes.length ? r.impotsAlertes.map(x => {
              const j = Math.round((new Date(x.echeance + 'T00:00:00Z').getTime() - new Date(r.today + 'T00:00:00Z').getTime()) / 86400000);
              return (
                <tr key={x.id}>
                  <td data-label="Impôt / taxe">{x.type}</td><td data-label="Période">{x.periode}</td><td data-label="Échéance">{fmtDate(x.echeance)}</td>
                  <td className="num" data-label="Montant">{dh(x.montant)}</td>
                  <td data-label="Délai" style={{ fontWeight: 600, color: j < 0 ? 'var(--danger)' : 'var(--warn)' }}>{delaiLabel(j, n => 'En retard de ' + n + ' j')}</td>
                </tr>
              );
            }) : <Empty cols={5}>Aucune échéance fiscale proche.</Empty>}
          </tbody>
        </table></div>
      </div>
    </>
  );
}

/* ───────── Impôt libératoire (auto-entrepreneur) ───────── */
export function LiberatoireSection({ r }: SectionProps) {
  const { lib, libAlertes } = r;
  return (
    <>
      <DashSection title={'Impôt libératoire — année ' + r.libAnnee} />
      <div className="kpi-grid">
        <KpiCard label="CA encaissé (base libératoire)" value={dh(lib.tot.encaisse)} sub={lib.nat.label + ' · taux ' + lib.nat.tauxLabel} />
        <KpiCard label="Impôt libératoire estimé" value={dh(lib.tot.impot)} sub={lib.nat.tauxLabel + ' sur ' + dh(lib.tot.base)} accent="var(--primary-2)" />
        <KpiCard label="Retenue à la source (30 %)" value={dh(lib.tot.retenue)} sub={lib.nat.seuil ? 'sur ' + dh(lib.tot.exces) + ' au-delà de ' + dh(LIB_SEUIL) : 'Non applicable'} accent={lib.tot.retenue ? 'var(--danger)' : 'var(--success)'} />
        <KpiCard label="Clients au-delà ou proches du seuil" value={String(libAlertes.length)} sub={lib.nat.seuil ? 'Seuil de ' + dh(LIB_SEUIL) + ' par client' : 'Non applicable'} accent={libAlertes.length ? 'var(--warn)' : 'var(--success)'} />
      </div>
      {lib.nat.seuil && (
        <div className="panel" style={{ marginTop: 18 }}>
          <div className="panel-head"><h2>Seuil de {dh(LIB_SEUIL)} par client</h2></div>
          <Hint>CA encaissé et facturé en cours de l'année, comparés au seuil au-delà duquel 30 % sont retenus à la source par le client.</Hint>
          <div className="table-wrap"><table>
            <thead><tr><th>Client</th><th>CA encaissé</th><th>Facturé en cours</th><th style={{ minWidth: 160 }}>Seuil atteint</th><th>Retenue 30 %</th><th>Situation</th></tr></thead>
            <tbody>
              {lib.rows.length ? lib.rows.map(x => {
                const pct = Math.round((x.cumul + x.enCours) / LIB_SEUIL * 100);
                return (
                  <tr key={x.client}>
                    <td data-label="Client">{x.client}</td>
                    <td className="num" data-label="CA encaissé">{dh(x.cumul)}</td>
                    <td className="num" data-label="Facturé en cours">{dh(x.enCours)}</td>
                    <td data-label="Seuil atteint">
                      <div style={{ background: 'var(--neutral-bg)', borderRadius: 6, height: 8, overflow: 'hidden' }}>
                        <div style={{ width: Math.min(100, pct) + '%', height: '100%', background: x.statut === 'Seuil dépassé' ? 'var(--danger)' : x.statut === 'OK' ? 'var(--success)' : 'var(--warn)' }} />
                      </div>
                      <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', marginTop: 3 }}>{pct} %</div>
                    </td>
                    <td className="num" data-label="Retenue 30 %" style={x.retenue ? { color: 'var(--danger)', fontWeight: 600 } : undefined}>{dh(x.retenue)}</td>
                    <td data-label="Situation"><Badge cls={LIB_BADGE[x.statut]}>{x.statut}</Badge></td>
                  </tr>
                );
              }) : <Empty cols={6}>Aucun CA facturé cette année.</Empty>}
            </tbody>
          </table></div>
        </div>
      )}
    </>
  );
}

/* ───────── Immobilisations ───────── */
export function ImmoSection({ r, v }: SectionProps) {
  const cats = r.immoCatItems.filter(c => (c.cat === 'materiel' ? v.immo.materiel : v.immo.transport));
  return (
    <>
      <DashSection title="Immobilisations (situation à ce jour)" />
      <div className="kpi-grid">
        <KpiCard label="Valeur d'acquisition" value={dh(r.immoTot.val)} sub={r.biens.length + ' bien(s)'} />
        <KpiCard label="Valeur nette comptable" value={dh(r.immoTot.vnc)} sub={'Dotation annuelle ' + dh(r.immoTot.dot)} accent="var(--primary-2)" />
      </div>
      <div className="dash-grid">
        <DashPanel title="VNC par catégorie" sub="Matériel et outillage / matériel de transport"><HBars items={cats} fmt={dh} /></DashPanel>
        {v.immo.transport && (
          <Panel title="Échéances véhicules à surveiller">
            <Hint>Assurances et visites techniques échues ou dans les 30 prochains jours.</Hint>
            <div className="table-wrap"><table>
              <thead><tr><th>Véhicule</th><th>Échéance</th><th>Date</th><th>Délai</th></tr></thead>
              <tbody>
                {r.echeances.length ? r.echeances.map(e => (
                  <tr key={e.bien + e.type}>
                    <td data-label="Véhicule">{e.bien}</td><td data-label="Échéance">{e.type}</td><td data-label="Date">{fmtDate(e.date)}</td>
                    <td data-label="Délai" style={{ fontWeight: 600, color: e.jours < 0 ? 'var(--danger)' : 'var(--warn)' }}>{delaiLabel(e.jours, n => 'Échue depuis ' + n + ' j')}</td>
                  </tr>
                )) : <Empty cols={4}>Aucune échéance proche.</Empty>}
              </tbody>
            </table></div>
          </Panel>
        )}
      </div>
    </>
  );
}
