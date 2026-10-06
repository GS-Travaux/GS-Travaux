# GS-Travaux

Gestion d'une activité de chaudronnerie / construction métallique (Maroc) : devis → commande → facturation, tiers,
immobilisations, achats, paie (CNSS, AMO, CIMR, IR), ordres de mission, impôts et taxes (dont l'impôt libératoire de
l'auto-entrepreneur), tableau de bord, droits par profil.

Application **en ligne et multi-entreprises** : une seule base pour toutes les entreprises clientes, strictement isolées
les unes des autres, avec un espace propriétaire (éditeur) pour gérer les entreprises et leurs licences.

| Brique | Rôle |
|---|---|
| **GitHub** | code source, branches `main` (production) et `dev` (essais) |
| **Supabase** | base PostgreSQL, comptes (Auth), règles de sécurité (RLS) |
| **Vercel** | hébergement du site et des fonctions serveur (`/api`) |

---

## Guide de mise en ligne (≈ 45 minutes)

### Étape 1 — GitHub

1. Sur github.com : **New repository** → nom `gs-travaux`, **Private**, sans README ni .gitignore (le dossier les contient déjà).
2. Dans un terminal, depuis ce dossier :
   ```bash
   git init
   git add .
   git commit -m "GS-Travaux : première version en ligne"
   git branch -M main
   git remote add origin https://github.com/VOTRE-COMPTE/gs-travaux.git
   git push -u origin main
   git checkout -b dev && git push -u origin dev      # branche d'essais
   ```
   Le fichier `.env` (vos clés) est exclu par `.gitignore` : il ne doit **jamais** être envoyé sur GitHub.

### Étape 2 — Supabase

1. supabase.com → **New project** (région proche, ex. *West EU* ou *Central EU*) ; notez le mot de passe de la base.
2. **SQL Editor → New query** : coller et exécuter **en entier**, dans l'ordre :
   1. `supabase/migrations/0001_schema.sql`
   2. `supabase/migrations/0002_rls.sql`
   Chaque exécution doit se terminer par « Success ».
3. **Authentication → Sign In / Providers** : laisser *Email* actif, **désactiver « Allow new users to sign up »**
   (les comptes sont créés uniquement par l'application) et exiger au moins 8 caractères.
4. **Authentication → URL Configuration** : *Site URL* = l'adresse de votre site Vercel (étape 3) ; ajoutez-la aussi dans
   *Redirect URLs*, avec celle de la branche `dev` (ex. `https://gs-travaux-git-dev-VOTRE-COMPTE.vercel.app`).
   Sans cela, le lien « mot de passe oublié » reçu par e-mail ne fonctionne pas.
5. **E-mails** : le service d'envoi intégré de Supabase est limité à quelques messages par heure. Pour un usage réel,
   **Authentication → SMTP Settings** et branchez votre fournisseur (ex. Resend).
6. **Project Settings → API** : relevez *Project URL*, la clé **anon public** et la clé **service_role**
   (cette dernière est un secret : elle donne tous les droits sur la base).

### Étape 3 — Vercel

1. vercel.com → **Add New → Project** → importer le dépôt GitHub `gs-travaux`. Le framework *Vite* est détecté ;
   commande `npm run build`, sortie `dist` (déjà dans `vercel.json`).
2. **Avant de déployer**, ajouter les **Environment Variables** (Production **et** Preview) :

   | Variable | Valeur | Visible du navigateur ? |
   |---|---|---|
   | `VITE_SUPABASE_URL` | Project URL | oui (publique) |
   | `VITE_SUPABASE_ANON_KEY` | clé *anon public* | oui (publique) |
   | `SUPABASE_URL` | Project URL | non |
   | `SUPABASE_ANON_KEY` | clé *anon public* | non |
   | `SUPABASE_SERVICE_ROLE_KEY` | clé *service_role* | **non — secret** |
   | `OWNER_EMAIL` | une adresse **réservée** au propriétaire (pas celle d'un compte d'entreprise) | non |
   | `OWNER_PASSWORD` | un mot de passe long et unique (8 caractères minimum) | non |
   | `PUBLIC_APP_URL` | *(facultatif)* adresse publique du site | non |

3. **Deploy**. Chaque `git push` sur `main` redéploie la production ; chaque `push` sur `dev` crée un site d'essai.
   Après un changement de variable, relancer un déploiement (**Deployments → Redeploy**).

### Étape 4 — Premier démarrage

1. Ouvrir `https://votre-site.vercel.app/#/owner` (lien « Espace propriétaire » de l'écran de connexion) et se connecter avec
   `OWNER_EMAIL` / `OWNER_PASSWORD`. Changer ce mot de passe = modifier la variable `OWNER_PASSWORD` sur Vercel et redéployer.
2. **Créer votre propre entreprise** : code court (ex. `BRAHIM`), nom, facturation **« Gratuite (compte interne) »**,
   et le compte administrateur initial (nom, e-mail, mot de passe).
3. Revenir à l'accueil, se connecter avec cet e-mail : ouvrir **Mon société** et renseigner les informations légales
   (statut juridique, ICE, IF…), puis **Sécurité** pour créer les utilisateurs et régler les droits des profils.
4. Pour chaque **entreprise cliente** : espace propriétaire → *Ajouter une entreprise* → période d'essai (14 jours par défaut)
   → *Enregistrer un paiement* à chaque règlement de licence → *Suspendre* / *Réactiver* si besoin.
   Une entreprise suspendue ou dont la licence a expiré est bloquée **par la base de données** : elle ne peut plus lire ni écrire.

---

## Utilisation en local

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # tous les tests (≈ 40 s)
npm run build        # contrôle de types + build de production
```

Sans fichier `.env`, l'application démarre en **mode démonstration** : données d'exemple stockées dans le navigateur,
aucune connexion, aucune sécurité (espace propriétaire : mot de passe `demo-proprietaire`). Pour travailler contre
Supabase, copier `.env.example` en `.env` et le remplir. Les fonctions `/api` s'exécutent sur Vercel
(`npx vercel dev` pour les essayer en local).

## Comment la sécurité est assurée

- **Isolation** : chaque ligne porte l'identifiant de son entreprise ; les règles RLS de PostgreSQL ne laissent un compte lire ou
  écrire que les lignes de **son** entreprise. Le rattachement du compte à son entreprise (`app_metadata.company_id`) n'est posé
  que par le serveur, avec la clé `service_role`.
- **Droits par profil** (voir / modifier / supprimer par onglet) : appliqués par la base, pas seulement par l'écran. Un profil
  qui n'a pas le droit de lire les bulletins de paie reçoit une liste vide, même en appelant l'API directement.
- **Licences** : suspension, essai ou licence expirés bloquent lecture et écriture, immédiatement.
- **Propriétaire** : identifiants dans les variables d'environnement Vercel, jamais dans la base ni dans le code ; toutes ses
  opérations passent par des fonctions serveur qui revérifient son identité.
- **Navigateur** : politique de sécurité (CSP), échappement systématique des textes, session fermée après 15 min d'inactivité.
- 47 tests de la base (PostgreSQL embarqué), 74 de l'espace sécurité/serveur, plus ceux des calculs et des pages.

**À savoir / limites**
- Les clés *anon* sont publiques par conception ; la clé `service_role` ne doit jamais figurer dans une variable `VITE_*`,
  dans le code, ni dans un message.
- Le blocage anti-force-brute des mots de passe est celui de Supabase Auth (par adresse et par IP) ; le compteur « tentatives
  maximum par entreprise » du prototype n'existe plus.
- Sauvegardes : l'offre gratuite de Supabase n'inclut pas de sauvegardes quotidiennes téléchargeables et met le projet en pause
  après une longue inactivité. Pour des données réelles, passer à l'offre payante ou exporter régulièrement.
- Calcul de l'impôt libératoire : **indicatif**, à faire valider par un comptable (activité de chaudronnerie : prestations de
  services à 1 % par défaut ; réglable dans *Mon société* → nature de l'activité).

## Organisation du code

```
src/
  lib/        calculs et règles métier purs (paie, CNSS, CIMR, libératoire, amortissement, droits…) — testés
  data/       stockage : backend Supabase, backend local (démo), magasin React (modifications → base)
  pages/      une page par menu (recettes, tiers, immo, achats, collaborateur, impôts, société, sécurité, tableau de bord)
  owner/      espace propriétaire (entreprises, licences, paiements)
  ui/         fenêtres, tableaux, champs communs
api/          fonctions serveur Vercel : /api/users, /api/owner, /api/owner-login (clé service_role)
supabase/     migrations SQL (schéma + sécurité) et tests de sécurité
docs/         guide de portage (historique du passage du prototype HTML à cette version)
```

**Modèle de données** : `companies`, `profiles` (utilisateurs), `roles` (profils et droits), `license_payments`, `platform_settings`,
et une table `records` qui stocke chaque devis, facture, salarié, bulletin… comme un enregistrement JSON typé par `collection`.
Ce choix garde le modèle souple (ajouter un champ ne demande aucune migration) ; les droits et l'isolation s'appliquent par collection.

## Dépannage

| Symptôme | Cause probable |
|---|---|
| « Supabase n'est pas configuré » / mode démo en ligne | variables `VITE_*` absentes sur Vercel — les ajouter puis **redéployer** |
| Connexion propriétaire : « Espace propriétaire non configuré » | `OWNER_EMAIL` / `OWNER_PASSWORD` manquants (ou < 8 caractères) |
| Connexion propriétaire : conflit d'adresse | `OWNER_EMAIL` est déjà l'e-mail d'un compte d'entreprise : en choisir une autre |
| Lien « mot de passe oublié » inopérant | adresse du site absente de *Redirect URLs* (Supabase) |
| « Ce compte n'est rattaché à aucune entreprise » | compte créé hors de l'application ; passer par l'espace propriétaire / Sécurité |
| « Accès indisponible » à la connexion | entreprise suspendue ou licence expirée (voir l'espace propriétaire) |
| Un utilisateur ne voit pas un onglet | son profil n'a pas le droit « voir » (Sécurité → Droits) |

## Reprise des données du prototype HTML

Le prototype (`gs-travaux.html`) stockait ses données dans le navigateur. Elles ne sont pas migrées automatiquement :
les ressaisir (clients, fournisseurs, société, salariés…) dans la version en ligne ou demander un script d'import.
