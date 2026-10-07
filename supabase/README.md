# Base de données GS-Travaux (Supabase / PostgreSQL 15)

Une seule base pour toutes les entreprises clientes. L'isolation entre entreprises, les droits par profil et le
blocage de licence sont appliqués **par la base** (RLS) : l'interface ne fait que les refléter.
Le modèle complet est décrit en tête de `migrations/0002_rls.sql`.

## Installation

Dans Supabase : **SQL Editor → New query**, coller puis exécuter chaque fichier **en entier**, dans cet ordre :

1. `migrations/0001_schema.sql` — tables (`companies`, `license_payments`, `platform_settings`, `roles`, `profiles`, `records`). Une seule fois.
2. `migrations/0002_rls.sql` — fonctions de sécurité, déclencheurs, règles RLS, fonction `apply_changes`, privilèges.
   Ré-exécutable : on peut le relancer tel quel après une modification.

À exécuter avec le rôle par défaut de l'éditeur SQL (`postgres`). Ne pas changer ensuite le propriétaire des
tables ni des fonctions.

Après `0002`, les tables créées plus tard dans le schéma `public` ne sont plus ouvertes d'office aux rôles
`anon` / `authenticated` : toute nouvelle table doit recevoir ses propres `GRANT` et ses règles RLS.

## Le jeton (JWT) : posé par le serveur uniquement

La base identifie l'utilisateur par `auth.uid()` et par deux champs de **`app_metadata`** :

| Champ | Sens |
|---|---|
| `app_metadata.company_id` (uuid) | entreprise du compte |
| `app_metadata.is_owner` (booléen `true`) | propriétaire de la plateforme (éditeur) |

`app_metadata` ne s'écrit qu'avec la clé **service_role**, donc uniquement depuis les fonctions serveur (`api/*`),
jamais depuis le navigateur. Cette clé ne doit jamais figurer dans le code client ni dans une variable `VITE_*`.
`user_metadata` (modifiable par l'utilisateur lui-même) n'est jamais lu par la base.
Le `company_id` du jeton doit en plus correspondre à la ligne `profiles` du compte : un jeton incohérent n'ouvre rien.
Un jeton déjà émis reste valable jusqu'à son expiration (1 h par défaut) : c'est pourquoi la désactivation d'un
compte (`profiles.actif`) et la suspension d'une entreprise sont relues dans la base à chaque requête.

Toutes les écritures sur `companies`, `license_payments`, `platform_settings` et `profiles` passent par le serveur
(service_role). Le navigateur n'écrit que `records` (via `rpc('apply_changes')`) et `roles` (administrateur de l'entreprise).

## Tests

```
npx vitest run supabase/tests
```

Les tests montent un PostgreSQL embarqué (PGlite), un faux schéma `auth` et les rôles `anon` / `authenticated` /
`service_role` (avec les privilèges par défaut trop larges de Supabase), appliquent les migrations, puis rejouent
les requêtes de chaque utilisateur avec `SET ROLE` + `request.jwt.claims`. Les profils sont ceux de
`src/lib/rights.ts` (`defaultProfils()` / `defaultDroits()`).

| Groupe (`tests/rls.test.ts`) | Ce qui est vérifié |
|---|---|
| structure | RLS activée et forcée partout ; privilèges exacts de `authenticated`, aucun pour `anon` ; `search_path` fixé sur toutes les fonctions ; `0002` ré-exécutable ; collections de la base = `RECORD_COLLECTIONS` + `societe` |
| identité (JWT) et licence | seul `app_metadata` est lu ; `company_active` = règle de `src/lib/licence.ts` (bornes comprises) ; `my_profile` / `my_role` / `is_company_admin` |
| isolation entre entreprises | lecture, insertion, mise à jour, suppression, `apply_changes` ; `company_id` forgé dans la ligne, dans `data`, dans `user_metadata` ou dans le jeton d'un autre compte ; déplacement d'une ligne impossible |
| droits par profil | `can_access` comparé à `droitsDe()` pour 5 profils × 20 cas × 3 droits ; Commercial ; Comptable ; immobilisations / achats par catégorie (changement de catégorie compris) ; `societe` ; Administrateur ; effet immédiat d'un changement de droits |
| licence inactive et comptes désactivés | suspendue / licence expirée / essai expiré / sans date : ni lecture ni écriture, ligne `companies` encore lisible ; message « licence » ; entreprise interne jamais bloquée ; suspension et rétablissement immédiats ; utilisateur désactivé |
| propriétaire, anonyme, tables protégées | le propriétaire lit `companies` / `license_payments` / `platform_settings` mais aucune donnée métier ; `anon` : rien ; aucun utilisateur n'écrit `profiles`, `companies`, `license_payments`, `platform_settings` ; `service_role` garde tout |
| table roles | lecture par les membres ; écriture réservée à l'administrateur ; rôle système intouchable ; `systeme` / `id` / `company_id` figés ; rôle utilisé non supprimable ; `droits` mal formés refusés |
| apply_changes | tout ou rien ; upsert / delete / ordre du lot ; validation (500 changements, collection, id, op, data) ; messages « Droit manquant » / « Licence » reconnus par `supabaseBackend.save` |
| records | `data.id` forcé, `updated_at` / `updated_by` imposés ; 512 Ko au maximum ; lecture par `seq` décroissant |

Écarts de PGlite par rapport à Supabase, sans effet sur le SQL des migrations : le schéma `auth` est simulé
(`tests/helpers.ts`), et les migrations sont exécutées par un super-utilisateur (sur Supabase : `postgres`, qui a
l'attribut BYPASSRLS nécessaire aux fonctions `SECURITY DEFINER`).
