/* Fenêtres de la console propriétaire (portage de openEntrepriseForm, openPaiementForm, openSuspensionForm,
   openEntrepriseDetail, openTarifs, openEntrepriseSuppression). */
import { useRef, useState, type ReactNode } from 'react';
import type { OwnerBackend, OwnerEntreprise } from '../data/ownerBackend';
import type { TarifsPlateforme, TypeLicence } from '../lib/types';
import { etatEntreprise } from '../lib/licence';
import { fmtDate, money, todayIso } from '../lib/format';
import { Modal } from '../ui/Modal';
import { useUI } from '../ui/UIProvider';
import { toast } from '../ui/toast';
import { validateRequired } from '../ui/validate';
import { ETAT_BADGE, MODES_PAIEMENT_OWNER, adminIssue, companyIssue, paiementIssue, paiementPeriode, tarifsIssue } from './rules';

interface Common { backend: OwnerBackend; onDone: () => Promise<void> | void }

/** Exécute une opération serveur : désactive les boutons pendant l'appel, affiche l'erreur éventuelle. */
function useSubmit(onDone: Common['onDone']) {
  const { closeModal } = useUI();
  const [busy, setBusy] = useState(false);
  async function submit(op: () => Promise<unknown>, message: string | (() => string), keepOpen = false) {
    if (busy) return;
    setBusy(true);
    try {
      await op();
      if (!keepOpen) closeModal();
      toast(typeof message === 'string' ? message : message());
      await onDone();
    } catch (e: any) { toast(e?.message || 'Opération impossible.'); }
    finally { setBusy(false); }
  }
  return { busy, submit, closeModal };
}
function Foot({ busy, onCancel, onOk, label, danger, cancelLabel = 'Annuler', disabled }: { busy: boolean; onCancel: () => void; onOk?: () => void; label?: ReactNode; danger?: boolean; cancelLabel?: string; disabled?: boolean }) {
  return <>
    <button className="btn btn-ghost" onClick={onCancel}>{cancelLabel}</button>
    {onOk && <button className={'btn ' + (danger ? 'btn-danger' : 'btn-accent')} disabled={busy || disabled} onClick={onOk}>{busy ? '…' : label}</button>}
  </>;
}

export function EntrepriseForm({ backend, onDone, entreprise, tarifs }: Common & { entreprise?: OwnerEntreprise; tarifs: TarifsPlateforme }) {
  const editing = !!entreprise;
  const { busy, submit, closeModal } = useSubmit(onDone);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [v, setV] = useState(() => ({
    code: entreprise?.code ?? '', nom: entreprise?.nom ?? '', contact: entreprise?.contact ?? '', telephone: entreprise?.telephone ?? '', email: entreprise?.email ?? '',
    fact: entreprise?.interne ? 'interne' : 'payante', licence: (entreprise?.licence ?? 'Mensuelle') as TypeLicence,
    prix: String(entreprise ? entreprise.prix : tarifs.tarifs.Mensuelle), debut: entreprise?.debut || todayIso(),
    adminNom: '', adminEmail: '', adminPassword: '',
  }));
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV(s => ({ ...s, [k]: e.target.value }));
  // À la création, changer de licence propose le tarif en vigueur.
  const setLicence = (l: TypeLicence) => setV(s => ({ ...s, licence: l, prix: editing ? s.prix : String(tarifs.tarifs[l]) }));

  function save() {
    if (!validateRequired(bodyRef.current)) return;
    const interne = v.fact === 'interne';
    const c = { code: v.code.trim(), nom: v.nom.trim(), contact: v.contact.trim(), telephone: v.telephone.trim(), email: v.email.trim(), interne, licence: v.licence, prix: interne ? 0 : Number(v.prix), debut: v.debut };
    const admin = { adminNom: v.adminNom.trim(), adminEmail: v.adminEmail.trim(), adminPassword: v.adminPassword };
    const issue = companyIssue(c) || (editing ? '' : adminIssue(admin));
    if (issue) return toast(issue);
    void submit(() => editing ? backend.updateCompany(entreprise!.id, c) : backend.createCompany({ ...c, ...admin }), editing ? 'Entreprise modifiée.' : 'Entreprise ajoutée.');
  }
  return (
    <Modal title={editing ? `Modifier ${entreprise!.nom}` : 'Ajouter une entreprise cliente'} onClose={closeModal} bodyRef={bodyRef}
      footer={<Foot busy={busy} onCancel={closeModal} onOk={save} label="Enregistrer" />}>
      <div className="field-row">
        <div className="field"><label htmlFor="ent-code">Code société</label><input id="ent-code" required maxLength={30} value={v.code} onChange={set('code')} /></div>
        <div className="field"><label htmlFor="ent-nom">Nom de l’entreprise</label><input id="ent-nom" required maxLength={120} value={v.nom} onChange={set('nom')} /></div>
      </div>
      <div className="field-row">
        <div className="field"><label htmlFor="ent-contact">Contact</label><input id="ent-contact" required maxLength={120} value={v.contact} onChange={set('contact')} /></div>
        <div className="field"><label htmlFor="ent-tel">Téléphone</label><input id="ent-tel" required maxLength={40} value={v.telephone} onChange={set('telephone')} /></div>
      </div>
      <div className="field"><label htmlFor="ent-email">E-mail</label><input id="ent-email" required type="email" value={v.email} onChange={set('email')} /></div>
      <div className="field-row">
        <div className="field"><label htmlFor="ent-fact">Facturation</label>
          <select id="ent-fact" required value={v.fact} onChange={set('fact')}><option value="payante">Payante</option><option value="interne">Gratuite (compte interne)</option></select></div>
        <div className="field"><label htmlFor="ent-licence">Licence</label>
          <select id="ent-licence" required value={v.licence} onChange={e => setLicence(e.target.value as TypeLicence)}><option>Mensuelle</option><option>Annuelle</option></select></div>
      </div>
      <div className="field-row">
        <div className="field"><label htmlFor="ent-prix">Prix par période (DH)</label><input id="ent-prix" required type="number" min="0" step="0.01" value={v.prix} onChange={set('prix')} /></div>
        <div className="field"><label htmlFor="ent-debut">Date de début</label><input id="ent-debut" required type="date" value={v.debut} onChange={set('debut')} /></div>
      </div>
      <div className="hint">{editing
        ? 'Le prix est celui de cette entreprise : modifier les tarifs généraux ne le change pas.'
        : `Le prix proposé est le tarif en vigueur ; il restera figé pour cette entreprise. Une période d’essai de ${tarifs.essaiJours} jours démarre à la date de début (entreprise payante).`}</div>
      {!editing && <>
        <div className="form-section-title">Compte administrateur de l’entreprise</div>
        <div className="field-row">
          <div className="field"><label htmlFor="ent-anom">Nom de l’administrateur</label><input id="ent-anom" required maxLength={120} value={v.adminNom} onChange={set('adminNom')} /></div>
          <div className="field"><label htmlFor="ent-aemail">E-mail de connexion</label><input id="ent-aemail" required type="email" autoComplete="off" value={v.adminEmail} onChange={set('adminEmail')} /></div>
        </div>
        <div className="field"><label htmlFor="ent-apwd">Mot de passe initial</label><input id="ent-apwd" required type="password" autoComplete="new-password" value={v.adminPassword} onChange={set('adminPassword')} /></div>
        <div className="hint">8 caractères minimum, avec des lettres et des chiffres. Transmettez-le à l’administrateur : il pourra le changer dans Sécurité › Mon compte, puis créer les autres utilisateurs.</div>
      </>}
    </Modal>
  );
}

export function PaiementForm({ backend, onDone, entreprise: e }: Common & { entreprise: OwnerEntreprise }) {
  const { busy, submit, closeModal } = useSubmit(onDone);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [date, setDate] = useState(todayIso());
  const [n, setN] = useState('1');
  const [montant, setMontant] = useState(String(e.prix));
  const [mode, setMode] = useState(MODES_PAIEMENT_OWNER[0]);
  const unite = e.licence === 'Annuelle' ? 'an' : 'mois';
  const periodes = Math.max(1, Math.round(Number(n) || 1));
  const apercu = date ? paiementPeriode(e, date, periodes).au : '';

  function save() {
    if (!validateRequired(bodyRef.current)) return;
    const p = { date, periodes: Math.round(Number(n)), montant: Number(montant), mode };
    const issue = paiementIssue(e, p);
    if (issue) return toast(issue);
    let au = '';
    void submit(async () => { au = (await backend.addPayment(e.id, p)).echeance; },
      () => `Paiement enregistré — licence valable jusqu’au ${fmtDate(au)}.` + (e.suspendu ? ' L’entreprise reste suspendue : réactivez-la si besoin.' : ''));
  }
  return (
    <Modal title={`Paiement — ${e.nom}`} size="sm" onClose={closeModal} bodyRef={bodyRef} footer={<Foot busy={busy} onCancel={closeModal} onOk={save} label="Enregistrer" />}>
      <div className="hint" style={{ marginBottom: 14, marginTop: 0 }}><strong>{e.nom}</strong> — licence {e.licence.toLowerCase()} à {money(e.prix)} DH ·{' '}
        {e.echeance ? 'échéance actuelle : ' + fmtDate(e.echeance) : (e.essaiFin ? 'en essai jusqu’au ' + fmtDate(e.essaiFin) : 'aucune échéance')}</div>
      <div className="field-row">
        <div className="field"><label htmlFor="pay-date">Date de paiement</label><input id="pay-date" required type="date" value={date} onChange={ev => setDate(ev.target.value)} /></div>
        <div className="field"><label htmlFor="pay-n">Nombre de périodes ({unite})</label>
          <input id="pay-n" required type="number" min="1" max="36" step="1" value={n}
            onChange={ev => { setN(ev.target.value); setMontant(String(Math.round(e.prix * Math.max(1, Math.round(Number(ev.target.value) || 1)) * 100) / 100)); }} /></div>
      </div>
      <div className="field-row">
        <div className="field"><label htmlFor="pay-montant">Montant (DH)</label><input id="pay-montant" required type="number" min="0" step="0.01" value={montant} onChange={ev => setMontant(ev.target.value)} /></div>
        <div className="field"><label htmlFor="pay-mode">Mode de paiement</label><select id="pay-mode" required value={mode} onChange={ev => setMode(ev.target.value)}>{MODES_PAIEMENT_OWNER.map(m => <option key={m}>{m}</option>)}</select></div>
      </div>
      <div className="hint" id="pay-hint">{apercu ? `Nouvelle échéance : ${fmtDate(apercu)}` : ''}</div>
    </Modal>
  );
}

export function SuspensionForm({ backend, onDone, entreprise: e }: Common & { entreprise: OwnerEntreprise }) {
  const { busy, submit, closeModal } = useSubmit(onDone);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [motif, setMotif] = useState('');
  function save() {
    if (!validateRequired(bodyRef.current)) return;
    void submit(() => backend.suspend(e.id, motif.trim()), `${e.nom} suspendue.`);
  }
  return (
    <Modal title={`Suspendre ${e.nom}`} size="sm" onClose={closeModal} bodyRef={bodyRef} footer={<Foot busy={busy} onCancel={closeModal} onOk={save} label="Suspendre" danger />}>
      <div className="hint" style={{ marginBottom: 14, marginTop: 0 }}><strong>{e.nom}</strong> ne pourra plus se connecter tant qu’elle n’est pas réactivée.</div>
      <div className="field"><label htmlFor="sus-motif">Motif de la suspension</label><input id="sus-motif" required maxLength={200} placeholder="ex. Impayé, demande du client…" value={motif} onChange={ev => setMotif(ev.target.value)} /></div>
    </Modal>
  );
}

export function EntrepriseDetail({ backend, onDone, entreprise: e, onPaiement }: Common & { entreprise: OwnerEntreprise; onPaiement: () => void }) {
  const { busy, submit, closeModal } = useSubmit(onDone);
  const [notes, setNotes] = useState(e.notes);
  const s = etatEntreprise(e);
  const paiements = [...e.paiements].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <Modal title={`Détail — ${e.nom}`} onClose={closeModal}
      footer={<Foot busy={false} onCancel={closeModal} cancelLabel="Fermer" onOk={e.interne ? undefined : onPaiement} label="Enregistrer un paiement" />}>
      <div className="hint" style={{ marginBottom: 14, marginTop: 0 }}>
        <strong>{e.nom}</strong> · <span className="mono">{e.code}</span> · <span className={'badge ' + ETAT_BADGE[s]}>{s}</span>{e.suspendu && e.motifSuspension ? ' · ' + e.motifSuspension : ''}<br />
        {e.contact} · {e.email} · {e.telephone}<br />
        {e.interne ? 'Compte interne gratuit' : `Licence ${e.licence.toLowerCase()} à ${money(e.prix)} DH · début ${fmtDate(e.debut)} · ${e.echeance ? 'échéance ' + fmtDate(e.echeance) : (e.essaiFin ? 'essai jusqu’au ' + fmtDate(e.essaiFin) : '—')}`}
        {' '}· {e.nbUtilisateurs} utilisateur(s)
      </div>
      <div className="form-section-title">Historique des paiements</div>
      {paiements.length ? (
        <div className="h-scroll" style={{ marginTop: 0 }}><table className="pdoc-table">
          <thead><tr><th>Date</th><th>Période couverte</th><th>Mode</th><th className="num">Montant</th></tr></thead>
          <tbody>
            {paiements.map(p => <tr key={p.id}><td>{fmtDate(p.date)}</td><td>{fmtDate(p.du)} → {fmtDate(p.au)}</td><td>{p.mode}</td><td className="num">{money(p.montant)} DH</td></tr>)}
            <tr className="pdoc-total"><td colSpan={3}>Total encaissé</td><td className="num">{money(e.paiements.reduce((a, p) => a + p.montant, 0))} DH</td></tr>
          </tbody>
        </table></div>
      ) : <div className="empty-state" style={{ padding: 18 }}>Aucun paiement enregistré.</div>}
      <div className="form-section-title">Notes internes</div>
      <div className="field"><textarea aria-label="Notes internes" rows={3} maxLength={4000} placeholder="Visible uniquement dans l’espace propriétaire" value={notes} onChange={ev => setNotes(ev.target.value)} /></div>
      <button className="btn btn-sm" disabled={busy} onClick={() => void submit(() => backend.updateCompany(e.id, { notes: notes.trim() }), 'Note enregistrée.', true)}>Enregistrer la note</button>
    </Modal>
  );
}

export function TarifsForm({ backend, onDone, tarifs }: Common & { tarifs: TarifsPlateforme }) {
  const { busy, submit, closeModal } = useSubmit(onDone);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [m, setM] = useState(String(tarifs.tarifs.Mensuelle)); const [a, setA] = useState(String(tarifs.tarifs.Annuelle)); const [j, setJ] = useState(String(tarifs.essaiJours));
  function save() {
    if (!validateRequired(bodyRef.current)) return;
    const t = { mensuel: Number(m), annuel: Number(a), essaiJours: Math.round(Number(j)) };
    const issue = tarifsIssue(t);
    if (issue) return toast(issue);
    void submit(() => backend.setTarifs(t), 'Tarifs enregistrés pour les nouvelles entreprises.');
  }
  return (
    <Modal title="Tarifs et période d’essai" size="sm" onClose={closeModal} bodyRef={bodyRef} footer={<Foot busy={busy} onCancel={closeModal} onOk={save} label="Enregistrer" />}>
      <div className="field-row">
        <div className="field"><label htmlFor="tar-m">Licence mensuelle (DH)</label><input id="tar-m" required type="number" min="1" step="0.01" value={m} onChange={e => setM(e.target.value)} /></div>
        <div className="field"><label htmlFor="tar-a">Licence annuelle (DH)</label><input id="tar-a" required type="number" min="1" step="0.01" value={a} onChange={e => setA(e.target.value)} /></div>
      </div>
      <div className="field"><label htmlFor="tar-e">Durée de la période d’essai (jours)</label><input id="tar-e" required type="number" min="0" max="90" step="1" value={j} onChange={e => setJ(e.target.value)} /></div>
      <div className="hint">Ces tarifs s’appliquent aux nouvelles entreprises. Les entreprises déjà enregistrées gardent leur prix.</div>
    </Modal>
  );
}

export function SuppressionForm({ backend, onDone, entreprise: e }: Common & { entreprise: OwnerEntreprise }) {
  const { busy, submit, closeModal } = useSubmit(onDone);
  const [code, setCode] = useState('');
  return (
    <Modal title="Supprimer cette entreprise ?" size="sm" onClose={closeModal}
      footer={<Foot busy={busy} onCancel={closeModal} danger label="Supprimer" disabled={code !== e.code} onOk={() => void submit(() => backend.deleteCompany(e.id, code), `${e.nom} supprimée.`)} />}>
      <div className="hint" style={{ marginBottom: 12, marginTop: 0 }}><strong>{e.nom}</strong> · {e.code}<br />{e.paiements.length} paiement(s) enregistré(s) · {e.nbUtilisateurs} utilisateur(s)</div>
      <div style={{ fontSize: 13, marginBottom: 14 }}>L’entreprise sera supprimée avec <strong>toutes ses données</strong> (devis, factures, paie…), ses comptes utilisateurs et son historique de paiements. Cette action est définitive{e.suspendu ? '' : ' ; pour bloquer simplement l’accès, utilisez plutôt « Suspendre »'}.</div>
      <div className="field"><label htmlFor="sup-code">Pour confirmer, saisissez le code société <span className="mono">{e.code}</span></label>
        <input id="sup-code" autoComplete="off" value={code} onChange={ev => setCode(ev.target.value)} /></div>
    </Modal>
  );
}
