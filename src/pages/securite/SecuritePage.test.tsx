// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderApp } from '../../test/harness';
import { useStore } from '../../data/store';
import SecuritePage from './SecuritePage';
import { basculerDroit, basculerTout, droitCoche, premierePage, toutCoche } from './droits';
import { defaultDroits, defaultProfils, RIGHTS_TABS } from '../../lib/rights';
import { NavContext } from '../../nav';

afterEach(cleanup);
const tab = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
const fill = (label: string | RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const dialog = () => within(screen.getByRole('dialog'));

describe('droits (logique pure)', () => {
  it('retirer « voir » retire tout ; donner un droit donne « voir » ; « Mon compte » reste visible', () => {
    let d = basculerDroit({}, 'devis', 'supprimer', true);
    expect(d.devis).toEqual({ voir: true, modifier: false, supprimer: true });
    d = basculerDroit(d, 'devis', 'voir', false);
    expect(d.devis).toEqual({ voir: false, modifier: false, supprimer: false });
    expect(droitCoche(basculerDroit({}, 'securite_compte', 'voir', false), 'securite_compte', 'voir')).toBe(true);
  });
  it('« tout sélectionner » par colonne, sans modifier la matrice d’origine', () => {
    const src = {};
    const d = basculerTout(src, 'modifier', true);
    expect(src).toEqual({});
    expect(toutCoche(d, 'modifier')).toBe(true); expect(toutCoche(d, 'voir')).toBe(true); expect(toutCoche(d, 'supprimer')).toBe(false);
    expect(Object.keys(d)).toHaveLength(RIGHTS_TABS.length);
    expect(toutCoche(basculerTout(d, 'voir', false), 'modifier')).toBe(false);
  });
  it('première page visible d’un profil', () => {
    expect(premierePage(defaultProfils(), defaultDroits(), 'Commercial')).toBe('dashboard');
    expect(premierePage(defaultProfils(), { 'prf-commercial': {} }, 'Commercial')).toBe('securite');
    expect(premierePage(defaultProfils(), { 'prf-commercial': basculerDroit({}, 'tiers_fournisseur', 'voir', true) }, 'Commercial')).toBe('tiers');
  });
});

describe('SecuritePage', () => {
  it('administrateur : les quatre onglets, liste des utilisateurs', async () => {
    await renderApp(<SecuritePage />);
    for (const n of ['Mon compte', 'Utilisateurs', 'Profil', 'Droits']) expect(screen.getByRole('button', { name: n })).toBeTruthy();
    expect((screen.getByLabelText(/Adresse e-mail/) as HTMLInputElement).value).toBe('demo@gs-travaux.local');
    tab('Utilisateurs');
    expect(screen.getByText('Yasmine Regraga')).toBeTruthy();
    expect(screen.getByText('y.regraga@gs-travaux.local')).toBeTruthy();
  });

  it('un profil non administrateur ne voit que les onglets auxquels il a droit', async () => {
    await renderApp(<SecuritePage />, { profil: 'Comptable' });
    expect(screen.getByRole('button', { name: 'Mon compte' })).toBeTruthy();
    for (const n of ['Utilisateurs', 'Profil', 'Droits']) expect(screen.queryByRole('button', { name: n })).toBeNull();
    expect(screen.queryByText('Yasmine Regraga')).toBeNull();
    expect(screen.getByText('Changer mon mot de passe')).toBeTruthy();
  });

  it('droit « voir » seul sur Utilisateurs et Profil : aucun bouton de création, modification ou suppression', async () => {
    const droits = defaultDroits();
    droits['prf-comptable'].securite_utilisateurs = { voir: true, modifier: false, supprimer: false };
    droits['prf-comptable'].securite_profil = { voir: true, modifier: false, supprimer: false };
    droits['prf-comptable'].securite_droits = { voir: true, modifier: false, supprimer: false };
    const { actions } = await renderApp(<SecuritePage />, { profil: 'Comptable', state: { droits } });
    tab('Utilisateurs');
    expect(screen.getByText('Yasmine Regraga')).toBeTruthy();
    for (const n of [/Créer utilisateur/, 'Modifier', 'Désactiver', 'Supprimer', /Réinitialiser/]) expect(screen.queryByRole('button', { name: n })).toBeNull();
    tab('Profil');
    expect(within(actions).queryByRole('button', { name: /Créer un profil/ })).toBeNull();
    for (const n of ['Modifier', 'Supprimer']) expect(screen.queryByRole('button', { name: n })).toBeNull();
    tab('Droits');
    expect((screen.getByLabelText('Devis — Voir') as HTMLInputElement).disabled).toBe(true);
  });

  it('crée un utilisateur (validations puis enregistrement)', async () => {
    const { saved } = await renderApp(<SecuritePage />);
    tab('Utilisateurs');
    fireEvent.click(screen.getByRole('button', { name: /Créer utilisateur/ }));
    fireEvent.click(dialog().getByRole('button', { name: 'Créer' }));           // champs vides
    expect(screen.getByRole('dialog')).toBeTruthy();
    fill('Nom', 'Sara Idrissi'); fill('Adresse e-mail', 'Y.Regraga@gs-travaux.local'); fill('Mot de passe initial', 'Bonjour123');
    fireEvent.change(screen.getByLabelText('Profil'), { target: { value: 'prf-comptable' } });
    fireEvent.click(dialog().getByRole('button', { name: 'Créer' }));           // adresse déjà utilisée
    expect((await saved()).utilisateurs).toHaveLength(2);
    fill('Adresse e-mail', 'sara@exemple.ma'); fill('Mot de passe initial', 'court');
    fireEvent.click(dialog().getByRole('button', { name: 'Créer' }));           // mot de passe trop court
    expect((await saved()).utilisateurs).toHaveLength(2);
    fill('Mot de passe initial', 'Bonjour123');
    fireEvent.click(dialog().getByRole('button', { name: 'Créer' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByText('sara@exemple.ma')).toBeTruthy();
    const u = (await saved()).utilisateurs.find(x => x.email === 'sara@exemple.ma')!;
    expect(u).toMatchObject({ nom: 'Sara Idrissi', profilId: 'prf-comptable', profil: 'Comptable', actif: true });
    expect(u).not.toHaveProperty('password');
  });

  it('modifie, désactive, réactive et supprime un autre utilisateur ; jamais son propre compte', async () => {
    const { saved } = await renderApp(<SecuritePage />);
    tab('Utilisateurs');
    const moi = screen.getByText('Brahim Elbouanani').closest('tr')!;
    expect(within(moi).queryByRole('button', { name: 'Désactiver' })).toBeNull();
    expect(within(moi).queryByRole('button', { name: 'Supprimer' })).toBeNull();
    fireEvent.click(within(moi).getByRole('button', { name: 'Modifier' }));
    expect((screen.getByLabelText('Profil') as HTMLSelectElement).disabled).toBe(true);
    fireEvent.click(dialog().getByRole('button', { name: 'Annuler' }));

    const ligne = () => screen.getByText(/Yasmine/, { selector: 'td' }).closest('tr')!;
    fireEvent.click(within(ligne()).getByRole('button', { name: 'Modifier' }));
    fill('Nom', 'Yasmine R.'); fireEvent.change(screen.getByLabelText('Profil'), { target: { value: 'prf-comptable' } });
    fireEvent.click(dialog().getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect((await saved()).utilisateurs[1]).toMatchObject({ nom: 'Yasmine R.', profilId: 'prf-comptable', profil: 'Comptable' });

    fireEvent.click(within(ligne()).getByRole('button', { name: 'Désactiver' }));
    fireEvent.click(dialog().getByRole('button', { name: 'Désactiver' }));
    await waitFor(() => expect(within(ligne()).getByText('Désactivé')).toBeTruthy());
    expect((await saved()).utilisateurs[1].actif).toBe(false);
    fireEvent.click(within(ligne()).getByRole('button', { name: 'Réactiver' }));
    await waitFor(() => expect(within(ligne()).getByText('Actif')).toBeTruthy());

    fireEvent.click(within(ligne()).getByRole('button', { name: 'Supprimer' }));
    fireEvent.click(dialog().getByRole('button', { name: 'Supprimer' }));
    await waitFor(() => expect(screen.queryByText(/Yasmine/, { selector: 'td' })).toBeNull());
    expect((await saved()).utilisateurs.map(u => u.id)).toEqual(['u1']);
  });

  it('envoie un e-mail de réinitialisation et affiche les erreurs du backend', async () => {
    const { backend } = await renderApp(<SecuritePage />);
    const spy = vi.spyOn(backend, 'resetUserPassword').mockRejectedValueOnce(new Error('Envoi impossible pour le moment.'));
    tab('Utilisateurs');
    const ligne = screen.getByText(/Yasmine/, { selector: 'td' }).closest('tr')!;
    fireEvent.click(within(ligne).getByRole('button', { name: /Réinitialiser/ }));
    fireEvent.click(dialog().getByRole('button', { name: 'Envoyer' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Envoi impossible pour le moment.'));
    expect(spy).toHaveBeenCalledWith('u2');
  });

  it('profils : création avec copie des droits, modification, suppression ; Administrateur intouchable', async () => {
    const { saved, actions } = await renderApp(<SecuritePage />);
    tab('Profil');
    const admin = screen.getByText('Administrateur', { selector: '.role-chip' }).closest('tr')!;
    expect(within(admin).getByText('Système')).toBeTruthy();
    expect(within(admin).queryByRole('button', { name: 'Modifier' })).toBeNull();
    expect(within(admin).queryByRole('button', { name: 'Supprimer' })).toBeNull();
    expect(within(admin).getByText(`${RIGHTS_TABS.length} / ${RIGHTS_TABS.length}`)).toBeTruthy();

    fireEvent.click(within(actions).getByRole('button', { name: /Créer un profil/ }));
    fill('Nom du profil', 'commercial'); fill('Description', 'Suivi des chantiers');
    fireEvent.click(dialog().getByRole('button', { name: 'Créer' }));           // nom déjà pris (sans tenir compte de la casse)
    expect((await saved()).profils).toHaveLength(3);
    fill('Nom du profil', 'Chef de chantier');
    fireEvent.change(screen.getByLabelText('Copier les droits du profil'), { target: { value: 'prf-commercial' } });
    fireEvent.click(dialog().getByRole('button', { name: 'Créer' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    let s = await saved();
    const nouveau = s.profils.find(p => p.nom === 'Chef de chantier')!;
    expect(nouveau.systeme).toBeFalsy();
    expect(s.droits[nouveau.id]).toEqual(defaultDroits()['prf-commercial']);

    const ligne = () => screen.getByText(/Chef de/, { selector: '.role-chip' }).closest('tr')!;
    fireEvent.click(within(ligne()).getByRole('button', { name: 'Modifier' }));
    fill('Nom du profil', 'Chef d’équipe');
    fireEvent.click(dialog().getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(screen.getByText('Chef d’équipe', { selector: '.role-chip' })).toBeTruthy());

    // Un profil utilisé ne se supprime pas.
    fireEvent.click(within(screen.getByText('Commercial', { selector: '.role-chip' }).closest('tr')!).getByRole('button', { name: 'Supprimer' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(within(screen.getByText('Chef d’équipe', { selector: '.role-chip' }).closest('tr')!).getByRole('button', { name: 'Supprimer' }));
    fireEvent.click(dialog().getByRole('button', { name: 'Supprimer' }));
    await waitFor(() => expect(screen.queryByText('Chef d’équipe', { selector: '.role-chip' })).toBeNull());
    s = await saved();
    expect(s.profils.map(p => p.id)).toEqual(['prf-admin', 'prf-commercial', 'prf-comptable']);
    expect(s.droits[nouveau.id]).toBeUndefined();
  });

  it('droits : matrice groupée, enregistrement immédiat, « tout sélectionner », profil système verrouillé', async () => {
    const { saved } = await renderApp(<SecuritePage />);
    tab('Droits');
    expect((screen.getByLabelText('Profil') as HTMLSelectElement).value).toBe('prf-commercial');
    for (const g of ['Recettes', 'Collaborateur', 'Base de données']) expect(screen.getAllByText(g).length).toBeGreaterThan(0);
    const cb = (n: string) => screen.getByLabelText(n) as HTMLInputElement;
    expect(cb('Devis — Modifier').checked).toBe(true);
    expect(cb('Facturation — Supprimer').checked).toBe(false);
    expect(cb('Mon compte — Voir').checked && cb('Mon compte — Voir').disabled).toBe(true);

    fireEvent.click(cb('Facturation — Supprimer'));
    expect(cb('Facturation — Supprimer').checked).toBe(true);
    await waitFor(async () => expect((await saved()).droits['prf-commercial'].facturation).toEqual({ voir: true, modifier: false, supprimer: true }));
    fireEvent.click(cb('Devis — Voir'));
    await waitFor(async () => expect((await saved()).droits['prf-commercial'].devis).toEqual({ voir: false, modifier: false, supprimer: false }));
    await waitFor(() => expect(screen.queryByText('Enregistrement…')).toBeNull());

    fireEvent.click(cb('Tout sélectionner — Supprimer'));
    await waitFor(async () => { const d = (await saved()).droits['prf-commercial']; expect(RIGHTS_TABS.every(t => d[t.key].voir && d[t.key].supprimer)).toBe(true); });
    expect(cb('Tout sélectionner — Voir').checked).toBe(true);

    fireEvent.change(screen.getByLabelText('Profil'), { target: { value: 'prf-admin' } });
    expect(cb('Devis — Supprimer').checked && cb('Devis — Supprimer').disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Aperçu du profil' })).toBeNull();
    expect(screen.getByText(/Profil système/)).toBeTruthy();
  });

  it('« Aperçu du profil » applique le profil et va à sa première page', async () => {
    const go = vi.fn();
    function Probe() { const { previewProfil } = useStore(); return <div data-testid="preview">{previewProfil || '-'}</div>; }
    await renderApp(<NavContext.Provider value={{ page: 'securite', go }}><Probe /><SecuritePage /></NavContext.Provider>);
    tab('Droits');
    fireEvent.change(screen.getByLabelText('Profil'), { target: { value: 'prf-comptable' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aperçu du profil' }));
    expect(screen.getByTestId('preview').textContent).toBe('Comptable');
    expect(go).toHaveBeenCalledWith('dashboard');
    // L'application est maintenant vue comme le profil Comptable : seul « Mon compte » reste.
    expect(screen.queryByRole('button', { name: 'Droits' })).toBeNull();
  });

  it('mon compte : règles du mot de passe puis appel du backend', async () => {
    const { backend } = await renderApp(<SecuritePage />);
    const spy = vi.spyOn(backend, 'changePassword');
    const go = () => fireEvent.click(screen.getByRole('button', { name: 'Modifier le mot de passe' }));
    const toastText = () => screen.getByRole('status').textContent;
    go(); await waitFor(() => expect(toastText()).toBe('Renseignez les trois champs.'));
    fill('Mot de passe actuel', 'Ancien123'); fill('Nouveau mot de passe', 'court'); fill('Confirmer le nouveau mot de passe', 'court');
    go(); await waitFor(() => expect(toastText()).toMatch(/au moins 8 caractères/));
    fill('Nouveau mot de passe', 'Nouveau123'); fill('Confirmer le nouveau mot de passe', 'Nouveau124');
    go(); await waitFor(() => expect(toastText()).toBe('Les deux mots de passe ne correspondent pas.'));
    fill('Nouveau mot de passe', 'Ancien123'); fill('Confirmer le nouveau mot de passe', 'Ancien123');
    go(); await waitFor(() => expect(toastText()).toMatch(/différent de l’actuel/));
    expect(spy).not.toHaveBeenCalled();
    fill('Nouveau mot de passe', 'Nouveau123'); fill('Confirmer le nouveau mot de passe', 'Nouveau123');
    go(); await waitFor(() => expect(toastText()).toBe('Mot de passe modifié.'));
    expect(spy).toHaveBeenCalledWith('Ancien123', 'Nouveau123');
    expect((screen.getByLabelText('Mot de passe actuel') as HTMLInputElement).value).toBe('');
  });
});
