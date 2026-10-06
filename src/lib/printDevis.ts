/* Documents imprimables des recettes : devis et facture (fonctions pures → chaîne HTML).
   Tout texte provenant des données passe par esc(). Le HTML est ensuite injecté par printDocument(). */
import type { Devis, Societe } from './types';
import { esc, fmtDate, money, numberToFrenchWords } from './format';
import { devisTotal } from './devis';
import { legalIds } from './print';

type SocieteDoc = Partial<Societe>;
const num = (x: unknown) => Number(x) || 0;
const montantLigne = (l: { qte: unknown; pu: unknown }) => num(l.qte) * num(l.pu);

function logoInitiales(s: SocieteDoc): string { return esc((s.nom || 'GT').slice(0, 2).toUpperCase()); }

/** Liste à puces des tâches non vides d'une ligne (HTML déjà échappé), ou chaîne vide. */
function tachesHtml(taches: unknown, couleur: string): string {
  const list = (Array.isArray(taches) ? taches : []).filter(t => String(t ?? '').trim());
  return list.length
    ? `<ul style="margin:4px 0 0;padding-left:16px;font-size:11px;color:${couleur};">${list.map(t => `<li>${esc(t)}</li>`).join('')}</ul>`
    : '';
}

export function buildDevisPrintHtml(d: Devis, s: SocieteDoc): string {
  const ids = legalIds(s);
  return `
    <div class="pdoc-head">
      <div style="display:flex;gap:14px;align-items:center;">
        <div class="pdoc-logo">${logoInitiales(s)}</div>
        <div class="pdoc-co"><strong>${esc(s.statutJuridique || '')} : ${esc(s.nom || '')}</strong><br>Activité : ${esc(s.activite || '')}</div>
      </div>
      <div class="pdoc-title-box">DEVIS</div>
    </div>
    <div class="pdoc-meta">
      <div><strong>Devis :</strong> N°${esc(d.numero)}</div>
      <div><strong>Date :</strong> ${esc(fmtDate(d.date))}</div>
      <div><strong>Client :</strong> ${esc(d.client)}</div>
      <div><strong>Objet :</strong> ${esc(d.objet)}</div>
    </div>
    <table class="pdoc-table">
      <thead><tr><th>#</th><th>Désignation</th><th>Matière</th><th>Qté</th><th>PU</th><th>Coûts</th></tr></thead>
      <tbody>
        ${d.lignes.map((l, i) => `<tr><td>${i + 1}</td><td>${esc(l.designation)}${tachesHtml(l.taches, '#444')}</td><td>${l.matiere === 'avec' ? 'Avec matière' : 'Sans matière'}</td><td class="num">${esc(l.qte)}</td><td class="num">${money(l.pu)}</td><td class="num">${money(montantLigne(l))}</td></tr>`).join('')}
        <tr class="pdoc-total"><td colspan="5" style="text-align:right;">Total</td><td class="num">${money(devisTotal(d))}</td></tr>
      </tbody>
    </table>
    <div style="margin-top:12px;font-size:12px;">
      Mode de paiement : ${esc(d.modePaiement || '—')} · Délai de paiement : ${esc(d.delaiPaiement || '—')}${d.demandeAvance ? ` · Avance demandée : ${money(d.demandeAvance)} DH` : ''}
    </div>
    <div class="pdoc-foot">${esc(s.nom || '')} — ${esc(s.adresse || '')} — ICE ${esc(s.ice || '')}${ids ? ' — ' + ids : ''} — Tél ${esc(s.tel || '')} — ${esc(s.email || '')}</div>
  `;
}

export function buildFacturePrintHtml(d: Devis, s: SocieteDoc): string {
  const total = devisTotal(d);
  const ids = legalIds(s);
  return `
    <div class="pdoc-head">
      <div style="display:flex;gap:14px;align-items:center;">
        <div class="pdoc-logo">${logoInitiales(s)}</div>
        <div class="pdoc-co"><strong>${esc(s.statutJuridique || '')}</strong></div>
      </div>
      <div style="text-align:right;">
        <div><strong>Date :</strong> ${esc(fmtDate(d.facture?.date))}</div>
        <div class="pdoc-title-box" style="margin-top:8px;">Facture n° ${esc(d.facture?.numero || '')}</div>
      </div>
    </div>
    <div class="pdoc-meta">
      <div><strong>Client :</strong> ${esc(d.client)}</div>
    </div>
    <table class="pdoc-table">
      <thead><tr><th>Désignation</th><th>Quantité</th><th>Prix unitaire</th><th>Total</th></tr></thead>
      <tbody>
        ${d.lignes.map(l => `<tr><td>${esc(l.designation)}</td><td class="num">${esc(l.qte)}</td><td class="num">${money(l.pu)}</td><td class="num">${money(montantLigne(l))}</td></tr>`).join('')}
      </tbody>
    </table>
    <table class="pdoc-table" style="margin-top:14px;">
      <tr><td style="width:70%;">Montant en dirhams (Hors champ de la TVA¹)</td><td class="pdoc-total num">${money(total)} DH</td></tr>
    </table>
    <div style="margin-top:16px;font-size:12.5px;">ARRETE LA PRESENTE FACTURE A LA SOMME DE : <em>${esc(numberToFrenchWords(total))}</em></div>
    <div style="margin-top:10px;font-size:12.5px;">Délai de paiement : ${esc(d.facture?.delai || '')} · Mode de paiement : ${esc(d.facture?.modePaiement || '')}</div>
    <div style="margin-top:34px;text-align:right;font-size:12.5px;">Signature :</div>
    <div class="pdoc-foot">
      Auto-entrepreneur : ${esc(s.nom || '')} · CNIE : ${esc(s.cne || '')}<br>
      Adresse : ${esc(s.adresse || '')} · ICE : ${esc(s.ice || '')} · IF : ${esc(s.if_ || '')} · Taxe professionnelle N° : ${esc(s.taxePro || '')}${ids ? ' · ' + ids : ''}<br>
      Tél : ${esc(s.tel || '')} · Mail : ${esc(s.email || '')}<br>
      ¹Art 89 – II – 1° - c, Code Général des Impôts.
    </div>
  `;
}
