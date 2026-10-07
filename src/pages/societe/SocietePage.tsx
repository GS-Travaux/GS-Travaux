/* Mon société : coordonnées et informations légales (portage du prototype, lignes 4193–4264). */
import { useRef, useState } from 'react';
import { useStore, useRights } from '../../data/store';
import { LIB_NATURES, libStatutAE } from '../../lib/liberatoire';
import { toast } from '../../ui/toast';
import { validateRequired } from '../../ui/validate';
import { Field } from '../../ui/misc';
import { statutOptions } from './statuts';

export default function SocietePage() {
  const { state, update } = useStore();
  const r = useRights('societe');
  const s = state.societe;
  const cardRef = useRef<HTMLDivElement>(null);
  const [statutList] = useState(() => statutOptions(s.statutJuridique));
  const [f, setF] = useState({
    nom: s.nom || '', statutJuridique: statutList.selected, activite: s.activite || '', natureActivite: s.natureActivite || 'services',
    adresse: s.adresse || '', tel: s.tel || '', email: s.email || '', cne: s.cne || '', ice: s.ice || '', if_: s.if_ || '',
    taxePro: s.taxePro || '', rc: s.rc || '', cnss: s.cnss || '',
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF(p => ({ ...p, [k]: e.target.value }));
  const estAE = libStatutAE(f.statutJuridique);

  const save = () => {
    if (!validateRequired(cardRef.current)) return;
    const t = (v: string) => v.trim();
    const data = {
      nom: t(f.nom), statutJuridique: t(f.statutJuridique), activite: t(f.activite), natureActivite: f.natureActivite, adresse: t(f.adresse),
      tel: t(f.tel), email: t(f.email), cne: t(f.cne), ice: t(f.ice), if_: t(f.if_), taxePro: t(f.taxePro), rc: t(f.rc), cnss: t(f.cnss),
    };
    update(draft => { Object.assign(draft.societe, data); });
    toast('Informations société enregistrées.');
  };

  return (<>
    <div className="settings-tabs"><button className="active">Mon société</button></div>
    <div className="card" style={{ maxWidth: 640 }} ref={cardRef}>
      <div className="logo-drop" style={{ marginBottom: 20 }}>
        <div className="swatch">LOGO</div>
        <div>
          <div style={{ fontWeight: 600, fontSize: 13.5, marginBottom: 3 }}>Logo de la société</div>
          <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>PNG/SVG recommandé — utilisé sur les devis et factures exportés.</div>
        </div>
      </div>
      <fieldset disabled={!r.modifier} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <div className="field-row">
          <Field label="Nom société"><input required value={f.nom} onChange={set('nom')} /></Field>
          <Field label="Statut juridique"><select required value={f.statutJuridique} onChange={set('statutJuridique')}>
            {statutList.options.map(x => <option key={x} value={x}>{x}</option>)}
          </select></Field>
        </div>
        <Field label="Activité / sous-titre"><input required value={f.activite} onChange={set('activite')} /></Field>
        {estAE && (
          <Field label="Nature de l'activité (impôt libératoire)" hint="Détermine le taux de l'impôt libératoire calculé sur le CA encaissé. Les prestations de services sont soumises à la règle des 80 000 DH par client (retenue à la source de 30 % au-delà). Rubrique réservée au statut auto-entrepreneur.">
            <select required value={f.natureActivite} onChange={set('natureActivite')}>
              {Object.keys(LIB_NATURES).map(k => <option key={k} value={k}>{LIB_NATURES[k].label} — {LIB_NATURES[k].tauxLabel}</option>)}
            </select>
          </Field>
        )}
        <Field label="Adresse"><input required value={f.adresse} onChange={set('adresse')} /></Field>
        <div className="field-row">
          <Field label="N° téléphone"><input required value={f.tel} onChange={set('tel')} /></Field>
          <Field label="Email"><input required value={f.email} onChange={set('email')} /></Field>
        </div>
        <div className="field-row-3">
          <Field label="CNE"><input required value={f.cne} onChange={set('cne')} /></Field>
          <Field label="ICE"><input required value={f.ice} onChange={set('ice')} /></Field>
          <Field label="IF"><input required value={f.if_} onChange={set('if_')} /></Field>
        </div>
        <Field label="Taxe professionnelle"><input required value={f.taxePro} onChange={set('taxePro')} /></Field>
        <div className="field-row">
          <Field label="N° Registre de commerce"><input required value={f.rc} onChange={set('rc')} /></Field>
          <Field label="N° CNSS"><input required value={f.cnss} onChange={set('cnss')} /></Field>
        </div>
      </fieldset>
      <div className="hint" style={{ marginBottom: 14 }}>Si un numéro n'existe pas pour votre statut (par exemple le registre de commerce pour un auto-entrepreneur), saisissez « — » : il ne sera pas imprimé sur les documents.</div>
      {r.modifier && <button className="btn btn-accent" onClick={save}>Enregistrer</button>}
    </div>
  </>);
}
