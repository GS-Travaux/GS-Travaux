import { describe, expect, it } from 'vitest';
import { seedState } from '../data/seed';
import { money } from './format';
import { buildBordereauCimrLignes, buildBordereauCnssLignes, bulletinBrut, bulletinRetenuesDiv, calculChargesPatronales, calculPaie, cumulsAnnee } from './paie';
import { buildBordereauCimrPrintHtml, buildBordereauCnssPrintHtml, buildBulletinPrintHtml } from './printPaie';

const XSS = '<img src=x onerror=alert(1)>';

describe('bulletin de paie imprimé', () => {
  it('contient les montants de calculPaie, les cumuls et les retenues', () => {
    const s = seedState();
    const b = s.bulletins[0];                               // SAL-0001, 2026-08, CIMR, prêt social 625
    const c = s.collaborateurs.find(x => x.id === b.collaborateurId)!;
    const p = calculPaie(bulletinBrut(b), c.personnesACharge, c.cotiseCimr);
    const cp = calculChargesPatronales(bulletinBrut(b), c.cotiseCimr);
    const cum = cumulsAnnee(s.bulletins, s.collaborateurs, c.id, b.mois);
    const html = buildBulletinPrintHtml(b, s);
    expect(html).toContain('BULLETIN DE PAIE');
    for (const v of [p.brut, p.cnss, p.amo, p.cimr, p.ir, p.net - bulletinRetenuesDiv(b), p.fraisPro, cp.total, cp.coutEmployeur, cum.brut, cum.net]) expect(html).toContain(money(v));
    expect(html).toContain('Retenue CIMR (3,45%)');
    expect(html).toContain('Prêt social');
    expect(html).toContain('Youssef');
    expect(html).toContain('Reste : 21 j');
  });
  it('omet la ligne CIMR pour un non-affilié', () => {
    const s = seedState();
    expect(buildBulletinPrintHtml(s.bulletins[1], s)).not.toContain('Retenue CIMR');
  });
  it('échappe tous les textes issus des données', () => {
    const s = seedState();
    const b = s.bulletins[0];
    s.collaborateurs[0].prenom = XSS; s.collaborateurs[0].nom = '<b>N</b>'; s.collaborateurs[0].poste = '"><script>1</script>';
    b.lignes[0].designation = '<u>prime</u>'; b.retenues[0].label = XSS; b.modePaiement = '<i>x</i>';
    s.societe.nom = 'A&B <s>'; s.societe.rc = '<rc>';
    const html = buildBulletinPrintHtml(b, s);
    for (const bad of ['<img', '<b>N', '<script', '<u>prime', '<i>x', '<s>', '<rc>']) expect(html).not.toContain(bad);
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('A&amp;B &lt;s&gt;');
    expect(html).toContain('RC N° : &lt;rc&gt;');
  });
});

describe('bordereaux imprimés', () => {
  const s = seedState();
  const cnss = { id: 'CNSS-2026-08', mois: '2026-08', statut: 'À payer', datePaiement: '', modePaiement: '', lignes: buildBordereauCnssLignes(s.bulletins, s.collaborateurs, s.pointages, '2026-08') };
  const cimr = { id: 'CIMR-2026-08', mois: '2026-08', statut: 'À payer', datePaiement: '', modePaiement: '', lignes: buildBordereauCimrLignes(s.bulletins, s.collaborateurs, '2026-08') };

  it('CNSS : titre, salariés, totaux et numéro d\'affiliation', () => {
    s.societe.cnss = '1234567';
    const html = buildBordereauCnssPrintHtml(cnss, s.societe);
    expect(html).toContain('BORDEREAU DE PAIEMENT CNSS');
    expect(html).toContain('1234567');
    expect(html).toContain('Statut : À payer');
    cnss.lignes.forEach(l => { expect(html).toContain(l.cnssNum); expect(html).toContain(money(l.brut)); });
    expect(buildBordereauCnssPrintHtml({ ...cnss, statut: 'Payé', datePaiement: '2026-09-10', modePaiement: 'Virement' }, s.societe)).toContain('payé le 10/09/2026 (Virement)');
    s.societe.cnss = '';
    expect(buildBordereauCnssPrintHtml(cnss, s.societe)).toContain('................');
  });
  it('CIMR : titre, affiliés et total', () => {
    const html = buildBordereauCimrPrintHtml(cimr, s.societe);
    expect(html).toContain('BORDEREAU DE PAIEMENT CIMR');
    expect(html).toContain(cimr.lignes[0].cimrNum);
    expect(html).toContain(money(cimr.lignes[0].sal + cimr.lignes[0].pat));
  });
  it('échappent noms, numéros, modes et société', () => {
    const l1 = { ...cnss.lignes[0], nom: XSS, cnssNum: '<c>' };
    const l2 = { ...cimr.lignes[0], nom: XSS, cimrNum: '<m>' };
    const soc = { ...s.societe, nom: '<x>', ice: '<ice>' };
    const h1 = buildBordereauCnssPrintHtml({ ...cnss, id: '<id>', statut: 'Payé', modePaiement: '<mode>', lignes: [l1] }, soc);
    const h2 = buildBordereauCimrPrintHtml({ ...cimr, id: '<id>', statut: 'Payé', modePaiement: '<mode>', lignes: [l2] }, soc);
    for (const h of [h1, h2]) for (const bad of ['<img', '<id>', '<mode>', '<x>', '<ice>', '<c>', '<m>']) expect(h).not.toContain(bad);
    expect(h1).toContain('&lt;img');
    expect(h2).toContain('&lt;img');
  });
});
