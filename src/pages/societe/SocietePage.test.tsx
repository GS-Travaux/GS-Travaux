// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { renderApp } from '../../test/harness';
import { seedState } from '../../data/seed';
import SocietePage from './SocietePage';
import { STATUTS_JURIDIQUES, statutOptions } from './statuts';
import { fieldOf, hasField, setField } from '../partB.testHelpers';

afterEach(cleanup);
const NATURE = "Nature de l'activité (impôt libératoire)";
const societe = seedState().societe;

describe('statuts juridiques', () => {
  it('liste et valeur hors liste', () => {
    expect(STATUTS_JURIDIQUES).toEqual(['Auto-entrepreneur', 'Personne physique', 'SARL', 'SARL AU', 'SA', 'SNC', 'SCS', 'Coopérative', 'Association']);
    expect(statutOptions('SARL')).toEqual({ options: STATUTS_JURIDIQUES, selected: 'SARL' });
    expect(statutOptions('auto entrepreneur').selected).toBe('Auto-entrepreneur');
    expect(statutOptions('sarl').selected).toBe('SARL');
    expect(statutOptions('EURL')).toEqual({ options: [...STATUTS_JURIDIQUES, 'EURL'], selected: 'EURL' });
    expect(statutOptions('').selected).toBe('Auto-entrepreneur');
  });
});

describe('SocietePage', () => {
  it('affiche les informations de la société (pas de N° de patente)', async () => {
    await renderApp(<SocietePage />);
    expect((fieldOf('Nom société') as HTMLInputElement).value).toBe('EL BOUANANI BRAHIM');
    expect((fieldOf('ICE') as HTMLInputElement).value).toBe('003801478000062');
    expect((fieldOf('IF') as HTMLInputElement).value).toBe('68601506');
    expect((fieldOf('Statut juridique') as HTMLSelectElement).value).toBe('Auto-entrepreneur');
    expect(hasField('N° de patente')).toBe(false);
    expect(Array.from((fieldOf('Statut juridique') as HTMLSelectElement).options).map(o => o.value)).toEqual(STATUTS_JURIDIQUES);
  });

  it('le champ « nature d’activité » n’est visible que pour Auto-entrepreneur, dès le changement de la liste', async () => {
    const { saved } = await renderApp(<SocietePage />);
    expect(hasField(NATURE)).toBe(true);
    setField('Statut juridique', 'SARL');
    expect(hasField(NATURE)).toBe(false);
    setField('Statut juridique', 'Auto-entrepreneur');
    expect(hasField(NATURE)).toBe(true);
    setField('Statut juridique', 'SA');
    expect(hasField(NATURE)).toBe(false);
    // rien n'est enregistré tant qu'on n'a pas cliqué sur Enregistrer
    expect((await saved()).societe.statutJuridique).toBe('Auto-entrepreneur');
  });

  it('nature d’activité : libellés avec taux, et modification enregistrée', async () => {
    const { saved } = await renderApp(<SocietePage />);
    const sel = fieldOf(NATURE) as HTMLSelectElement;
    expect(Array.from(sel.options).map(o => o.textContent)).toEqual(['Prestations de services — 1 %', 'Commerce, industrie, artisanat — 0,5 %']);
    fireEvent.change(sel, { target: { value: 'commerce' } });
    setField('N° Registre de commerce', '—');
    setField('N° CNSS', '—');
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(screen.getByText('Informations société enregistrées.')).toBeTruthy();
    const st = await saved();
    expect(st.societe).toMatchObject({ natureActivite: 'commerce', rc: '—', cnss: '—', nom: 'EL BOUANANI BRAHIM', statutJuridique: 'Auto-entrepreneur' });
  });

  it('champs obligatoires : pas d’enregistrement tant qu’un champ est vide', async () => {
    const { saved } = await renderApp(<SocietePage />);   // rc et cnss sont vides dans la démo
    setField('Nom société', 'Autre nom');
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(screen.getByText('Veuillez remplir tous les champs obligatoires.')).toBeTruthy();
    expect((await saved()).societe.nom).toBe('EL BOUANANI BRAHIM');
  });

  it('changement de statut enregistré ; la nature n’est plus exigée pour une SARL', async () => {
    const { saved } = await renderApp(<SocietePage />);
    setField('Statut juridique', 'SARL');
    setField('N° Registre de commerce', '12345');
    setField('N° CNSS', '67890');
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    const st = await saved();
    expect(st.societe).toMatchObject({ statutJuridique: 'SARL', rc: '12345', cnss: '67890' });
  });

  it('valeur existante hors liste : affichée comme option courante', async () => {
    await renderApp(<SocietePage />, { state: { societe: { ...societe, statutJuridique: 'EURL' } } });
    const sel = fieldOf('Statut juridique') as HTMLSelectElement;
    expect(sel.value).toBe('EURL');
    expect(Array.from(sel.options).map(o => o.value)).toEqual([...STATUTS_JURIDIQUES, 'EURL']);
    expect(hasField(NATURE)).toBe(false);
  });

  it('échappe le texte saisi (pas de HTML interprété)', async () => {
    await renderApp(<SocietePage />, { state: { societe: { ...societe, nom: '<b>Gras</b>' } } });
    expect((fieldOf('Nom société') as HTMLInputElement).value).toBe('<b>Gras</b>');
    expect(document.querySelector('.card b')).toBeNull();
  });

  it('profil sans droit de modifier : champs désactivés, pas de bouton Enregistrer', async () => {
    await renderApp(<SocietePage />, { profil: 'Comptable' });   // société : voir seulement
    expect(screen.queryByRole('button', { name: 'Enregistrer' })).toBeNull();
    expect(document.querySelector('fieldset')!.disabled).toBe(true);
    expect((fieldOf('Nom société') as HTMLInputElement).value).toBe('EL BOUANANI BRAHIM');
  });
});
