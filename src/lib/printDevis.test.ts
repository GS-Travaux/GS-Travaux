import { describe, expect, it } from 'vitest';
import { buildDevisPrintHtml, buildFacturePrintHtml } from './printDevis';
import type { Devis } from './types';

const evil = '<img src=x onerror=alert(1)>"&\'';
const devis = {
  id: 'd1', numero: 'DV_26_0001', client: evil, date: '2026-09-19', objet: evil, emetteur: 'E', statut: 'Facturé',
  modePaiement: evil, delaiPaiement: evil, demandeAvance: 1000,
  lignes: [{ designation: evil, qte: 2, pu: 1250.5, matiere: 'avec', taches: [evil, '  ', 'Soudure'] }],
  dateSoldee: '', dateFacturee: '', bc: null,
  facture: { numero: evil, date: '2026-09-30', modePaiement: evil, delai: evil },
} as Devis;
const societe = { nom: evil, statutJuridique: evil, activite: evil, adresse: evil, tel: evil, email: evil, ice: evil, if_: evil, taxePro: evil, cne: evil, rc: evil, cnss: '12' };

describe('buildDevisPrintHtml', () => {
  const html = buildDevisPrintHtml(devis, societe);
  it('n\'injecte aucun HTML venant des données', () => {
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });
  it('contient les montants et les tâches non vides', () => {
    expect(html).toContain('DEVIS');
    expect(html).toContain('N°DV_26_0001');
    expect(html).toContain('Total');
    expect(html).toMatch(/2[\s  ]501,00/);
    expect(html).toContain('<li>Soudure</li>');
    expect(html.match(/<li>/g)?.length).toBe(2);
    expect(html).toContain('Avance demandée');
  });
});

describe('buildFacturePrintHtml', () => {
  const html = buildFacturePrintHtml(devis, societe);
  it('échappe tout texte', () => {
    expect(html).not.toContain('<img');
  });
  it('montant en lettres et mentions légales', () => {
    expect(html).toContain('ARRETE LA PRESENTE FACTURE A LA SOMME DE');
    expect(html).toContain('deux mille cinq cent un dirhams');
    expect(html).toContain('Art 89');
    expect(html).toContain('CNSS N° : 12');
  });
  it('sans facture : ne plante pas', () => {
    expect(() => buildFacturePrintHtml({ ...devis, facture: null }, {})).not.toThrow();
  });
});
