import { Fragment, useEffect, useRef, useState } from 'react';
import { useRights, useStore } from '../../data/store';
import type { DroitsParOnglet } from '../../lib/types';
import { RIGHTS_TABS } from '../../lib/rights';
import { useNav } from '../../nav';
import { toast } from '../../ui/toast';
import { DROITS, basculerDroit, basculerTout, droitCoche, premierePage, toutCoche, type DroitKey } from './droits';

const LIBELLE: Record<DroitKey, string> = { voir: 'Voir', modifier: 'Modifier', supprimer: 'Supprimer' };

export default function DroitsTab({ profilId, onProfilChange }: { profilId: string | null; onProfilChange: (id: string) => void }) {
  const { state, backend, reload, previewProfil, setPreviewProfil } = useStore();
  const r = useRights('securite_droits');
  const { go } = useNav();
  const p = state.profils.find(x => x.id === profilId) || state.profils.find(x => !x.systeme) || state.profils[0];

  // Les cases répondent tout de suite (brouillon) ; l'enregistrement suit, un appel à la fois, la dernière version l'emporte.
  const [draft, setDraft] = useState<{ id: string; d: DroitsParOnglet } | null>(null);
  const [saving, setSaving] = useState(false);
  const pending = useRef<{ id: string; d: DroitsParOnglet } | null>(null);
  const running = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  if (!p) return <div className="empty-state">Aucun profil.</div>;
  const locked = !!p.systeme;
  const readOnly = locked || !r.modifier || !!previewProfil;
  const d: DroitsParOnglet = draft && draft.id === p.id ? draft.d : (state.droits[p.id] || {});
  const val = (key: string, right: DroitKey) => locked || droitCoche(d, key, right);

  async function flush() {
    if (running.current) return;
    running.current = true; setSaving(true);
    try {
      while (pending.current) {
        const job = pending.current; pending.current = null;
        await backend.saveDroits(job.id, job.d);
      }
      await reload();
    } catch (e: any) {
      pending.current = null;
      toast(e?.message || 'Enregistrement des droits impossible.');
      await reload();
    } finally {
      running.current = false;
      if (alive.current) { setSaving(false); if (!pending.current) setDraft(null); }
      if (pending.current) void flush();
    }
  }
  function appliquer(next: DroitsParOnglet) {
    if (readOnly) return;
    setDraft({ id: p.id, d: next });
    pending.current = { id: p.id, d: next };
    void flush();
  }
  function apercu() {
    const droits = { ...state.droits, [p.id]: d };
    const page = premierePage(state.profils, droits, p.nom);
    setPreviewProfil(p.nom);
    if (page) go(page);
  }

  let lastGroup: string | null = null;
  return (
    <>
      <div className="panel" style={{ padding: '16px 18px', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="field" style={{ margin: 0, minWidth: 220 }}><label htmlFor="dr-profil">Profil</label>
            <select id="dr-profil" value={p.id} onChange={e => onProfilChange(e.target.value)}>{state.profils.map(x => <option key={x.id} value={x.id}>{x.nom}</option>)}</select></div>
          {!locked && !previewProfil && <button className="btn btn-ghost" disabled={saving} onClick={apercu}>Aperçu du profil</button>}
          {saving && <span style={{ fontSize: 12, color: 'var(--ink-soft)' }} role="status">Enregistrement…</span>}
        </div>
        <div className="hint" style={{ marginTop: 10, marginBottom: 0 }}>{locked
          ? 'Profil système : tous les droits sur tous les onglets (non modifiable).'
          : readOnly
            ? 'Droits de ce profil pour chaque onglet (lecture seule).'
            : 'Cochez les droits de ce profil pour chaque onglet. Les modifications sont enregistrées immédiatement. « Aperçu du profil » affiche l’application telle que ce profil la verrait.'}</div>
      </div>
      <div className="panel">
        <div className="table-wrap"><table>
          <thead>
            <tr><th>Onglet</th>{DROITS.map(x => <th key={x} style={{ textAlign: 'center' }}>{LIBELLE[x]}</th>)}</tr>
            <tr className="filter-row"><th style={{ fontWeight: 600, color: 'var(--ink-soft)' }}>Tout sélectionner</th>
              {DROITS.map(x => <th key={x} style={{ textAlign: 'center' }}>
                <input type="checkbox" aria-label={`Tout sélectionner — ${LIBELLE[x]}`} checked={locked || toutCoche(d, x)} disabled={readOnly} onChange={e => appliquer(basculerTout(d, x, e.target.checked))} />
              </th>)}</tr>
          </thead>
          <tbody>
            {RIGHTS_TABS.map(t => {
              const head = t.group !== lastGroup;
              lastGroup = t.group;
              return (
                <Fragment key={t.key}>
                  {head && <tr className="grp-row"><td colSpan={4} style={{ background: 'var(--surface-2)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--ink-soft)' }}>{t.group}</td></tr>}
                  <tr>
                    <td data-label="Onglet">{t.label}</td>
                    {DROITS.map(x => <td key={x} style={{ textAlign: 'center' }} data-label={LIBELLE[x]}>
                      <input type="checkbox" aria-label={`${t.label} — ${LIBELLE[x]}`} checked={val(t.key, x)}
                        disabled={readOnly || (t.key === 'securite_compte' && x === 'voir')}
                        onChange={e => appliquer(basculerDroit(d, t.key, x, e.target.checked))} />
                    </td>)}
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table></div>
      </div>
    </>
  );
}
