-- GS-Travaux — schéma de base (Supabase / PostgreSQL)
-- Une seule base pour toutes les entreprises clientes ; l'isolation est assurée par la colonne company_id
-- et par les règles RLS de 0002_rls.sql.

create table public.companies (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique check (code ~ '^[A-Za-z0-9_-]{2,30}$'),
  nom              text not null check (length(trim(nom)) > 0),
  contact          text not null default '',
  email            text not null default '',
  telephone        text not null default '',
  licence          text not null default 'Mensuelle' check (licence in ('Mensuelle', 'Annuelle')),
  prix             numeric(12,2) not null default 0,            -- tarif figé pour cette entreprise
  debut            date not null default current_date,           -- début de licence / d'essai
  essai_fin        date,                                         -- fin de la période d'essai
  echeance         date,                                         -- fin de licence payée (null tant qu'aucun paiement)
  suspendu         boolean not null default false,
  motif_suspension text not null default '',
  interne          boolean not null default false,               -- entreprise de l'éditeur : jamais bloquée
  notes            text not null default '',
  created_at       timestamptz not null default now()
);

create table public.license_payments (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  date        date not null,
  montant     numeric(12,2) not null check (montant >= 0),
  periodes    integer not null default 1 check (periodes >= 1),
  mode        text not null default 'Virement',
  du          date not null,
  au          date not null,
  created_at  timestamptz not null default now()
);
create index license_payments_company on public.license_payments(company_id);

-- Réglages de la plateforme (une seule ligne) : tarifs proposés aux nouvelles entreprises.
create table public.platform_settings (
  id            integer primary key default 1 check (id = 1),
  tarif_mensuel numeric(12,2) not null default 2000,
  tarif_annuel  numeric(12,2) not null default 24000,
  essai_jours   integer not null default 14
);
insert into public.platform_settings (id) values (1);

-- Profils de droits d'une entreprise ; droits = { "<onglet>": { "voir": bool, "modifier": bool, "supprimer": bool } }
create table public.roles (
  company_id  uuid not null references public.companies(id) on delete cascade,
  id          text not null check (length(id) between 1 and 80),
  nom         text not null check (length(trim(nom)) > 0 and length(nom) <= 120),
  description text not null default '' check (length(description) <= 500),
  systeme     boolean not null default false,                    -- Administrateur : tous les droits, non modifiable
  droits      jsonb not null default '{}'::jsonb check (jsonb_typeof(droits) = 'object'),
  primary key (company_id, id),
  unique (company_id, nom)
);

-- Utilisateurs de l'application (1 ligne par compte Supabase Auth, sauf le propriétaire de la plateforme).
create table public.profiles (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  company_id  uuid not null references public.companies(id) on delete cascade,
  nom         text not null check (length(trim(nom)) > 0),
  email       text not null,
  profil_id   text not null,
  actif       boolean not null default true,
  created_at  timestamptz not null default now(),
  foreign key (company_id, profil_id) references public.roles(company_id, id) on delete restrict
);
create index profiles_company on public.profiles(company_id);

-- Toutes les données métier d'une entreprise : une ligne par enregistrement (devis, facture, salarié, bulletin…).
create table public.records (
  company_id  uuid not null references public.companies(id) on delete cascade,
  collection  text not null check (collection in (
    'societe', 'devis', 'demandesArticles', 'clients', 'fournisseurs', 'immobilisations', 'achats', 'impots',
    'collaborateurs', 'pointages', 'conges', 'bulletins', 'bordereauxCnss', 'bordereauxCimr', 'ordresMission')),
  id          text not null check (length(id) between 1 and 80),
  data        jsonb not null check (jsonb_typeof(data) = 'object'),
  seq         bigint generated always as identity,               -- ordre d'insertion (le plus récent d'abord à l'affichage)
  updated_at  timestamptz not null default now(),
  updated_by  uuid,
  primary key (company_id, collection, id),
  constraint records_societe_id check (collection <> 'societe' or id = 'main')   -- une seule fiche société par entreprise
);
create index records_company_seq on public.records(company_id, seq desc);
