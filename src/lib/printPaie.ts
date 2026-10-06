/* HTML imprimable de la paie : bulletin de paie, bordereau CNSS, bordereau CIMR (fonctions pures, tout texte passe par esc()). */
import { esc, fmtDate, money } from './format';
import { legalIds, legalVal } from './print';
import { bordereauCimrTotaux, bordereauCnssTotaux, bulletinBrut, bulletinRetenuesDiv, calculChargesPatronales, calculPaie, congesPrisAnnee, cumulsAnnee } from './paie';
import type { BordereauCimr, BordereauCnss, Bulletin, Collaborateur, Conge, Societe } from './types';

type Soc = Pick<Societe, 'nom' | 'adresse' | 'ice' | 'rc' | 'cnss'> | Societe;

function enTete(s: Soc, titre: string, avecIce: boolean, titreStyle = ''): string {
  const ids = legalIds(s);                                  // déjà échappé
  return `
    <div class="pdoc-head">
      <div style="display:flex;gap:14px;align-items:center;">
        <div class="pdoc-logo">${esc((s.nom || 'GT').slice(0, 2).toUpperCase())}</div>
        <div class="pdoc-co"><strong>${esc(s.nom || '')}</strong><br>${esc(s.adresse || '')}${avecIce ? `<br>ICE ${esc(s.ice || '')}` : ''}${avecIce && ids ? `<br>${ids}` : ''}</div>
      </div>
      <div class="pdoc-title-box"${titreStyle ? ` style="${titreStyle}"` : ''}>${esc(titre)}</div>
    </div>`;
}

/** Bulletin de paie (équivalent de exportBulletinPDF). */
export function buildBulletinPrintHtml(
  b: Bulletin,
  data: { collaborateurs: Collaborateur[]; bulletins: Bulletin[]; conges: Conge[]; societe: Societe },
): string {
  const { collaborateurs, bulletins, conges, societe: s } = data;
  const c = collaborateurs.find(x => x.id === b.collaborateurId);
  const brut = bulletinBrut(b);
  const p = calculPaie(brut, c ? c.personnesACharge : 0, c ? c.cotiseCimr : false);
  const autres = bulletinRetenuesDiv(b);
  const anneeStr = b.mois.split('-')[0];
  const cum = cumulsAnnee(bulletins, collaborateurs, b.collaborateurId, b.mois);
  const cp = calculChargesPatronales(brut, c ? c.cotiseCimr : false);
  const congesPris = congesPrisAnnee(conges, b.collaborateurId, anneeStr);
  const congesReste = (c?.congesDroitAnnuel || 0) - congesPris;
  const ids = legalIds(s);
  return `
    ${enTete(s, 'BULLETIN DE PAIE', false)}
    <div class="pdoc-meta">
      <div><strong>Période :</strong> ${esc(b.mois)} · <strong>Matricule :</strong> ${esc(b.collaborateurId)}</div>
      <div><strong>Nom et prénom :</strong> ${esc(c?.prenom || '')} ${esc(c?.nom || '')}</div>
      <div><strong>Département :</strong> ${esc(c?.departement || '—')} · <strong>Service :</strong> ${esc(c?.service || '—')} · <strong>Fonction :</strong> ${esc(c?.poste || '—')}</div>
      <div><strong>N° CIN :</strong> ${esc(c?.cin || '—')} · <strong>N° CNSS :</strong> ${esc(c?.cnssNum || '—')} ${c?.cotiseCimr ? `· <strong>N° CIMR :</strong> ${esc(c.cimrNum || '—')}` : ''} ${c?.mutuelleNum ? `· <strong>N° Mutuelle :</strong> ${esc(c.mutuelleNum)}` : ''}</div>
      <div><strong>Situation familiale :</strong> ${esc(c?.situationFamiliale || '—')} · <strong>Personnes à charge :</strong> ${esc(c?.personnesACharge || 0)} · <strong>Type de paie :</strong> ${esc(c?.typePaie || '—')}</div>
    </div>
    <table class="pdoc-table">
      <thead><tr><th>Désignation</th><th class="num">Gain</th></tr></thead>
      <tbody>
        ${(b.lignes || []).map(l => `<tr><td>${esc(l.designation)}</td><td class="num">${money(l.montant)}</td></tr>`).join('')}
        <tr class="pdoc-total"><td>Total brut</td><td class="num">${money(p.brut)}</td></tr>
        <tr><td>Retenue CNSS (4,48%)</td><td class="num">${money(p.cnss)}</td></tr>
        <tr><td>Retenue AMO (2,26%)</td><td class="num">${money(p.amo)}</td></tr>
        ${p.cimr ? `<tr><td>Retenue CIMR (3,45%)</td><td class="num">${money(p.cimr)}</td></tr>` : ''}
        <tr><td>Impôt sur le revenu (IR)</td><td class="num">${money(p.ir)}</td></tr>
        ${(b.retenues || []).map(r => `<tr><td>${esc(r.label)}</td><td class="num">${money(r.montant)}</td></tr>`).join('')}
        <tr class="pdoc-total"><td>Net à payer</td><td class="num">${money(p.net - autres)}</td></tr>
      </tbody>
    </table>
    <table class="pdoc-table" style="margin-top:14px;">
      <thead><tr><th></th><th class="num">Période</th><th class="num">Cumul année</th></tr></thead>
      <tbody>
        <tr><td>Brut imposable</td><td class="num">${money(p.brut)}</td><td class="num">${money(cum.brut)}</td></tr>
        <tr><td>Charges salariales (CNSS+AMO+CIMR)</td><td class="num">${money(p.cnss + p.amo + p.cimr)}</td><td class="num">${money(cum.cnssAmoCimr)}</td></tr>
        <tr><td>Frais professionnels</td><td class="num">${money(p.fraisPro)}</td><td class="num">${money(cum.fraisPro)}</td></tr>
        <tr><td>I.R.</td><td class="num">${money(p.ir)}</td><td class="num">${money(cum.ir)}</td></tr>
        <tr><td>Charges patronales</td><td class="num">${money(cp.total)}</td><td class="num">${money(cum.chargesPatronales)}</td></tr>
        <tr class="pdoc-total"><td>Net</td><td class="num">${money(p.net)}</td><td class="num">${money(cum.net)}</td></tr>
      </tbody>
    </table>
    <div style="margin-top:10px;font-size:12px;color:#444;">Coût employeur du mois (brut + charges patronales) : <strong>${money(cp.coutEmployeur)} DH</strong></div>
    <div style="display:flex;gap:24px;margin-top:14px;font-size:12px;">
      <div><strong>Congés payés</strong> — Droit : ${esc(c?.congesDroitAnnuel || 0)} j · Pris : ${esc(congesPris)} j · Reste : ${esc(congesReste)} j</div>
      ${c && c.pretCapital ? `<div><strong>Prêt</strong> — Capital : ${money(c.pretCapital)} DH · Remboursé : ${money(c.pretRembourse || 0)} DH · Solde : ${money(c.pretSolde)} DH</div>` : ''}
    </div>
    <div style="margin-top:14px;font-size:12.5px;">Mode de paiement : ${esc(b.modePaiement)} · Statut : ${esc(b.statut)}</div>
    <div class="pdoc-foot">${esc(s.nom || '')} — ICE ${esc(s.ice || '')}${ids ? ' — ' + ids : ''} — Calcul indicatif basé sur le barème CNSS/AMO/IR 2026 (Maroc). À faire valider par un comptable avant usage réel.</div>
  `;
}

function statutPaiement(b: { statut: string; datePaiement: string; modePaiement: string }): string {
  return `Statut : ${esc(b.statut)}${b.statut === 'Payé' ? ` — payé le ${fmtDate(b.datePaiement)} (${esc(b.modePaiement)})` : ''}`;
}

/** Bordereau de paiement CNSS (équivalent de exportBordereauPDF). */
export function buildBordereauCnssPrintHtml(b: BordereauCnss, s: Societe): string {
  const t = bordereauCnssTotaux(b);
  const affiliation = legalVal(s.cnss);
  return `
    ${enTete(s, 'BORDEREAU DE PAIEMENT CNSS', true, 'font-size:16px;')}
    <div class="pdoc-meta">
      <div><strong>Période :</strong> ${esc(b.mois)} · <strong>Bordereau :</strong> ${esc(b.id)}</div>
      <div><strong>N° d'affiliation employeur :</strong> ${affiliation ? esc(affiliation) : '................................'}</div>
    </div>
    <table class="pdoc-table">
      <thead><tr><th>N° CNSS</th><th>Nom et prénom</th><th class="num">Jours</th><th class="num">Salaire réel</th><th class="num">Salaire plafonné</th></tr></thead>
      <tbody>
        ${b.lignes.map(l => `<tr><td>${esc(l.cnssNum || '—')}</td><td>${esc(l.nom)}</td><td class="num">${esc(l.jours)}</td><td class="num">${money(l.brut)}</td><td class="num">${money(l.brutPlafonne)}</td></tr>`).join('')}
        <tr class="pdoc-total"><td colspan="3">Total</td><td class="num">${money(t.brut)}</td><td class="num">${money(t.brutPlaf)}</td></tr>
      </tbody>
    </table>
    <table class="pdoc-table" style="margin-top:14px;">
      <thead><tr><th>Cotisations</th><th class="num">Montant (DH)</th></tr></thead>
      <tbody>
        <tr><td>Prestations sociales</td><td class="num">${money(t.ps)}</td></tr>
        <tr><td>Allocations familiales</td><td class="num">${money(t.af)}</td></tr>
        <tr><td>AMO</td><td class="num">${money(t.amo)}</td></tr>
        <tr><td>Taxe de formation professionnelle</td><td class="num">${money(t.tfp)}</td></tr>
        <tr class="pdoc-total"><td>Total à payer à la CNSS</td><td class="num">${money(t.total)}</td></tr>
      </tbody>
    </table>
    <div style="margin-top:12px;font-size:12px;">${statutPaiement(b)}</div>
    <div class="pdoc-foot">${esc(s.nom || '')} — Document établi à partir des bulletins de paie du mois. Calcul indicatif à faire valider avant déclaration à la CNSS.</div>
  `;
}

/** Bordereau de paiement CIMR (équivalent de exportBordereauCimrPDF). */
export function buildBordereauCimrPrintHtml(b: BordereauCimr, s: Societe): string {
  const t = bordereauCimrTotaux(b);
  return `
    ${enTete(s, 'BORDEREAU DE PAIEMENT CIMR', true, 'font-size:16px;')}
    <div class="pdoc-meta">
      <div><strong>Période :</strong> ${esc(b.mois)} · <strong>Bordereau :</strong> ${esc(b.id)}</div>
      <div><strong>N° d'adhésion employeur :</strong> ................................</div>
    </div>
    <table class="pdoc-table">
      <thead><tr><th>N° CIMR</th><th>Nom et prénom</th><th class="num">Salaire brut</th><th class="num">Part salariale</th><th class="num">Part patronale</th><th class="num">Total</th></tr></thead>
      <tbody>
        ${b.lignes.map(l => `<tr><td>${esc(l.cimrNum || '—')}</td><td>${esc(l.nom)}</td><td class="num">${money(l.brut)}</td><td class="num">${money(l.sal)}</td><td class="num">${money(l.pat)}</td><td class="num">${money(l.sal + l.pat)}</td></tr>`).join('')}
        <tr class="pdoc-total"><td colspan="2">Total à payer à la CIMR</td><td class="num">${money(t.brut)}</td><td class="num">${money(t.sal)}</td><td class="num">${money(t.pat)}</td><td class="num">${money(t.total)}</td></tr>
      </tbody>
    </table>
    <div style="margin-top:12px;font-size:12px;">${statutPaiement(b)}</div>
    <div class="pdoc-foot">${esc(s.nom || '')} — Document établi à partir des bulletins de paie du mois. Calcul indicatif à faire valider avant déclaration à la CIMR.</div>
  `;
}
