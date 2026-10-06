# Guide de portage — prototype HTML → Vite + React + Supabase

Source de vérité du **comportement** : `/mnt/user-data/outputs/gs-travaux.html` (prototype mono-fichier, ~5 500 lignes).
Le portage doit reproduire fidèlement : textes français, libellés, validations, calculs, statuts, tris, filtres,
messages (`toast`), documents imprimables. Lire la section du prototype qui vous est assignée en entier avant d'écrire.

## Ce qui existe déjà (ne pas réécrire)
| Fichier | Contenu |
|---|---|
| `src/lib/types.ts` | Types de toutes les entités (`State`, `Devis`, `Collaborateur`…). Les types ont `[extra: string]: any` : un champ du prototype manquant peut être utilisé sans modifier le fichier. |
| `src/lib/format.ts` | `uid, money, fmtDate, esc, todayIso, addJours, addMois, joursDepuisAujourdhui, matches, numberToFrenchWords` |
| `src/lib/devis.ts` | `devisTotal, devisAvancement(d, ordresMission), delaiEnJours, factureEcheance, STATUTS, BADGE_CLASS, AVANCEMENT_BADGE` |
| `src/lib/liberatoire.ts` | Tout l'impôt libératoire (fonctions pures, `today` injectable) |
| `src/lib/paie.ts` | `calculPaie, calculChargesPatronales, bulletinBrut, cumulsAnnee, congesPrisAnnee, buildBordereau*Lignes, bordereau*Totaux, nextCollabId, collabNom…` |
| `src/lib/immo.ts`, `achats.ts`, `impots.ts` | Constantes, `immoAmort`, `achatMontants`, `impotStatut`, `next*Id`… |
| `src/lib/rights.ts` | `PAGES, RIGHTS_TABS, PAGE_TABS, droitsDe, defaultProfils, defaultDroits` |
| `src/lib/print.ts` | `printDocument(html), legalIds, legalVal` — l'impression injecte du HTML dans `#print-area` |
| `src/data/store.tsx` | `useStore()` → `{ state, update, can, rights, me, company, backend, reload, previewProfil, setPreviewProfil }`, `useRights(tabKey)` |
| `src/ui/*` | `Modal`, `useUI()` (`openModal(node)`, `closeModal()`, `confirm({title,message,danger})`), `toast`, `validateRequired`, `DataTable` + `useTableFilters`, `Badge`, `Panel`, `Field`, `AddButton`, `EmptyState`, `SettingsTabs`/`pickTab`, `PageActions` |
| `src/nav.tsx` | `useNav()` → `{ page, go(pageId) }` |
| `src/test/harness.tsx` | `renderApp(<Page/>, { profil?, state?, empty? })` pour tester une page (jsdom, backend local en mémoire) |
| `src/styles.css` | Tout le CSS du prototype : **réutiliser les mêmes classes** (`btn btn-accent`, `panel`, `table-wrap`, `field`, `kpi-card`, `badge badge-facture`…). |

## Règles de portage
1. **Données** : lire `state` via `useStore()` ; modifier **uniquement** avec `update(draft => { … })` (immer). `state` est gelé : ne jamais le muter directement.
   Nouveaux enregistrements : `draft.xxx.unshift(obj)` (plus récent en premier, comme après rechargement). Suppression : `draft.xxx = draft.xxx.filter(...)` ou `splice`.
   Chaque enregistrement doit avoir un `id` texte unique dans sa collection (les `next*Id` / `uid()` existent).
2. **Droits** : le prototype masquait les boutons par manipulation du DOM (`applyRights`). En React : `const r = useRights('<clé d\'onglet>')`
   (clés = `RIGHTS_TABS`). Sans `r.modifier` : pas de boutons d'ajout / modification / enregistrement / actions d'état, pas d'édition au double-clic,
   champs des formulaires désactivés (ouverture en lecture seule), mais PDF / Détail / Historique restent accessibles.
   Sans `r.supprimer` : pas de bouton « Supprimer ». Les droits sont de toute façon appliqués côté base : l'interface ne fait que refléter.
   Les `<PageActions>` (boutons de la barre du haut) ne s'affichent qu'avec `r.modifier`.
3. **Pas d'accès global** : pas de `window.xxx`, `document.getElementById`, `innerHTML` pour l'interface. Formulaires = composants React contrôlés dans `<Modal>`.
   Champs obligatoires : mettre l'attribut `required` et appeler `validateRequired(bodyRef.current)` (voir `Modal` → `bodyRef`) avant d'enregistrer, comme le prototype.
4. **Sécurité XSS** : le JSX échappe déjà. Dans les chaînes HTML d'impression (`buildXxxPrintHtml`) : passer **tout** texte venant des données par `esc()`. Jamais de `dangerouslySetInnerHTML` avec des données utilisateur.
5. **Fenêtres** : `useUI().openModal(<MonFormulaire … />)` ; fermer avec `closeModal()`. Un seul niveau de fenêtre à la fois (comme le prototype). Les confirmations : `await confirm({...})`.
6. **Filtres de tableaux** : `useTableFilters(rows, columns)` + `<DataTable tf={tf} columns rowKey onRowDoubleClick />` ; le compteur du panneau = `tf.filtered.length`. Pour des tableaux atypiques, écrire le JSX avec les classes `table-wrap`, et mettre `data-label` sur les `<td>` (version mobile).
7. **CSS** : réutiliser `src/styles.css`. S'il manque quelque chose, créer un fichier CSS **à vous** (ex. `src/pages/recettes/recettes.css`) importé par votre page ; ne pas modifier `styles.css`.
8. **Fichiers partagés** : ne modifier ni `src/lib/*`, `src/data/*`, `src/ui/*`, `Shell.tsx`, `App.tsx`, `package.json`. Si une modification est indispensable (bug, ajout minime), la faire de façon minimale et la signaler dans votre rapport. **Ne lancez jamais `npm install`** (les agents travaillent en parallèle) : si une dépendance manque, le signaler.
9. **Types** : `tsc` est en mode strict avec `noImplicitAny: false`. Typer ce qui est raisonnable ; éviter les `as any` inutiles.
10. **Tests** : tests unitaires pour la logique pure (`*.test.ts`) et au moins un test de rendu par page principale avec `renderApp` (`// @vitest-environment jsdom`) : affichage de la liste, création d'un enregistrement via le formulaire, et profil sans droit de modification (boutons absents). Lancer uniquement vos tests : `npx vitest run src/pages/<votre-dossier>`.
11. **Vérification** : `npx tsc --noEmit 2>&1 | grep "^src/pages/<votre-dossier>"` (les autres dossiers peuvent être en cours de travail et afficher des erreurs qui ne sont pas les vôtres).
12. **Rapport final** (court) : fichiers créés, exports dont d'autres modules dépendent, ce qui n'a pas pu être porté ou diffère du prototype (et pourquoi), résultats des tests.

## Répartition
- **A — Recettes + Ordres de mission** : `src/pages/recettes/*`, `src/pages/mission/*`, `src/lib/printDevis.ts` (prototype 1401–2203, 4062–4192, 4630–4696).
- **B — Tiers, Immobilisation, Achats, Impôts (+ libératoire), Société** : `src/pages/{tiers,immo,achats,impots,societe}/*` (2203–2537, 2538–2700, 2701–2903, 4193–4265).
- **C1 — Collaborateur : salariés, pointage, congés + page à onglets** : `src/pages/collaborateur/*` hors `paie/` (2904–3338).
- **C2 — Collaborateur : paie, bordereaux CNSS, bordereaux CIMR** : `src/pages/collaborateur/paie/{PaieTab,CnssTab,CimrTab}.tsx` (3339–4061), composants par défaut sans props.
- **D — Tableau de bord** : `src/pages/dashboard/*` (906–1400).
- **E — Sécurité, espace propriétaire, fonctions serveur** : `src/pages/securite/*`, `src/owner/*`, `src/data/ownerBackend.ts`, `api/*` (4266–4600, 5059–5514).
- **F — Base de données** : `supabase/*`.
