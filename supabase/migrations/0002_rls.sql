-- GS-Travaux — sécurité de la base : isolation entre entreprises, droits par profil, licence (RLS)
-- À exécuter après 0001_schema.sql (voir supabase/README.md). Script ré-exécutable.
--
-- ═══════════════════════════════════════════ MODÈLE DE SÉCURITÉ ═══════════════════════════════════════════
--
-- 1. QUI EST L'UTILISATEUR ?
--    Uniquement ce que dit le jeton (JWT) signé par Supabase Auth :
--      • auth.uid()                              : identifiant du compte ;
--      • app_metadata.company_id (uuid)          : entreprise du compte ;
--      • app_metadata.is_owner  (booléen true)   : propriétaire de la plateforme (éditeur).
--    app_metadata ne peut être écrit qu'avec la clé service_role, donc par les fonctions serveur (api/*) :
--    le navigateur ne peut pas le modifier. user_metadata (modifiable par l'utilisateur) n'est JAMAIS lu, et
--    aucune valeur envoyée par le client (colonne company_id, champ dans data…) n'est prise pour argent comptant.
--    Double verrou : le company_id du jeton doit en plus correspondre à profiles.company_id du compte.
--
-- 2. CONDITIONS D'ACCÈS AUX DONNÉES (toutes nécessaires, vérifiées par my_access())
--      a. un profil existe pour auth.uid() dans l'entreprise du jeton ;
--      b. ce profil est actif (profiles.actif) ;
--      c. l'entreprise est active — company_active(), même règle que src/lib/licence.ts :
--         suspendue → non ; interne → oui ; echeance renseignée → echeance >= aujourd'hui ; sinon essai_fin >= aujourd'hui.
--    Si une condition manque : plus AUCUNE donnée (ni lecture ni écriture), à une exception près : tout compte
--    rattaché à une entreprise peut encore lire la ligne « companies » de SON entreprise (et rien d'autre), pour
--    que l'application puisse afficher le message de blocage (suspension, licence expirée).
--
-- 3. DROITS PAR ONGLET
--    roles.droits = { "<clé d'onglet>": { "voir": bool, "modifier": bool, "supprimer": bool } } (clés = RIGHTS_TABS
--    de src/lib/rights.ts). Règles identiques à droitsDe() : profil « systeme » = tous les droits ;
--    « modifier » et « supprimer » exigent « voir » ; seul le booléen true accorde un droit.
--    collection_tabs(collection, data, droit) donne les onglets qui ouvrent le droit sur un enregistrement :
--
--      collection         écriture (modifier / supprimer)          lecture (voir) : écriture +
--      ─────────────────  ───────────────────────────────────────  ─────────────────────────────────────────────
--      devis              devis, commandes, facturation            devis_articles, mission
--      demandesArticles   devis_articles                           devis
--      clients            tiers_client                             devis, commandes, facturation, mission
--      fournisseurs       tiers_fournisseur                        achat_consommable, achat_autre, immo_materiel, immo_transport
--      immobilisations    data.categorie : materiel → immo_materiel ; transport → immo_transport        (rien de plus)
--      achats             data.type : consommable → achat_consommable ; autre → achat_autre             (rien de plus)
--      impots             impots                                   —
--      collaborateurs     collab_salaries                          collab_pointage, collab_conges, collab_paie, collab_cnss, collab_cimr, mission
--      pointages          collab_pointage                          collab_paie, collab_cnss
--      conges             collab_conges                            collab_paie
--      bulletins          collab_paie                              collab_cnss, collab_cimr
--      bordereauxCnss     collab_cnss                              —
--      bordereauxCimr     collab_cimr                              —
--      ordresMission      mission                                  devis
--      societe (id main)  societe                                  tout membre actif de l'entreprise
--
--    Collection inconnue, ou categorie / type inconnu : aucun accès, sauf profil système.
--    Une modification qui change la catégorie d'une immobilisation (ou le type d'un achat) exige le droit sur
--    l'ancien ET sur le nouvel onglet.
--
-- 4. TABLES (RLS activée et forcée partout ; le rôle anon n'a aucun droit)
--      companies          lecture : sa propre ligne (tout compte de l'entreprise) ; le propriétaire lit tout. Aucune écriture.
--      license_payments   lecture : propriétaire seulement. Aucune écriture.
--      platform_settings  lecture : propriétaire seulement. Aucune écriture.
--      profiles           lecture : membres actifs, profils de leur entreprise. Aucune écriture.
--      roles              lecture : membres actifs. Écriture : administrateurs (profil système) de l'entreprise,
--                         colonnes nom / description / droits seulement, jamais sur un rôle système.
--      records            lecture / écriture selon can_access() ; company_id = entreprise du jeton.
--    Toutes les écritures « Aucune » passent par les fonctions serveur (clé service_role, qui contourne RLS).
--    Le propriétaire de la plateforme n'a accès à AUCUNE donnée métier (records, profiles, roles) des entreprises.
--
-- 5. ÉCRITURE DES DONNÉES MÉTIER : fonction apply_changes(changes) (SECURITY INVOKER : RLS s'applique),
--    tout ou rien. Messages d'erreur attendus par src/data/supabaseBackend.ts : « Licence … » ou « Droit manquant … ».
--
-- 6. NOTES TECHNIQUES
--    • Les fonctions qui lisent profiles / roles / companies / records pour décider d'un accès sont SECURITY DEFINER
--      (sinon les règles RLS s'appelleraient elles-mêmes). Elles appartiennent au rôle qui exécute ce script
--      (« postgres » sur Supabase), qui doit avoir l'attribut BYPASSRLS — c'est le cas sur Supabase — car RLS est
--      forcée y compris pour le propriétaire des tables. Sans cet attribut, tout accès échoue (fermé par défaut).
--      Les fonctions qui ne lisent aucune table (jwt_*, collection_tabs, access_allows, droits_valides) restent
--      SECURITY INVOKER : aucun privilège n'est nécessaire.
--    • Toutes les fonctions ont un search_path fixé et ne sont exécutables que par les rôles qui en ont besoin.
--    • Performance : les règles appellent (select my_access()) — évalué UNE fois par requête — puis access_allows(),
--      fonction pure, pour chaque ligne. can_access(cid, …) est exactement
--      « cid = jwt_company_id() et access_allows(my_access(), …) ».
--    • « Aujourd'hui » = current_date du serveur (UTC sur Supabase) : une licence peut donc rester ouverte jusqu'à
--      une heure après minuit, heure du Maroc.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════

-- ───────────────────────────── 1. Identité (JWT) ─────────────────────────────

create or replace function public.jwt_company_id() returns uuid
language sql stable security invoker set search_path = public, pg_temp as $$
  select case when s.v ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then s.v::uuid end
  from (select case when jsonb_typeof(auth.jwt() -> 'app_metadata' -> 'company_id') = 'string'
                    then auth.jwt() -> 'app_metadata' ->> 'company_id' end as v) s
$$;

create or replace function public.jwt_is_owner() returns boolean
language sql stable security invoker set search_path = public, pg_temp as $$
  select auth.uid() is not null and coalesce((auth.jwt() -> 'app_metadata' -> 'is_owner') = 'true'::jsonb, false)
$$;

-- ───────────────────────────── 2. Licence, profil, rôle ─────────────────────────────

create or replace function public.company_active(cid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((
    select case
      when c.suspendu then false
      when c.interne then true
      when c.echeance is not null then c.echeance >= current_date
      else coalesce(c.essai_fin >= current_date, false)
    end
    from public.companies c where c.id = cid), false)
$$;

-- Profil ACTIF du compte connecté, dans l'entreprise de son jeton (ligne nulle sinon).
create or replace function public.my_profile() returns public.profiles
language sql stable security definer set search_path = public, pg_temp as $$
  select p from public.profiles p
  where p.user_id = auth.uid() and p.actif and p.company_id = public.jwt_company_id()
$$;

-- Rôle (profil de droits) du compte connecté dans l'entreprise cid (ligne nulle si cid n'est pas son entreprise).
create or replace function public.my_role(cid uuid) returns public.roles
language sql stable security definer set search_path = public, pg_temp as $$
  select r from public.profiles p
  join public.roles r on r.company_id = p.company_id and r.id = p.profil_id
  where p.user_id = auth.uid() and p.actif and p.company_id = public.jwt_company_id() and p.company_id = cid
$$;

-- Le compte connecté est-il rattaché (actif ou non) à l'entreprise cid, qui est celle de son jeton ?
create or replace function public.is_company_member(cid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select cid is not null and cid = public.jwt_company_id()
     and exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.company_id = cid)
$$;

-- Accès effectif du compte connecté : null = aucun accès (compte inconnu ou désactivé, jeton sans entreprise ou
-- d'une autre entreprise, entreprise suspendue / expirée) ; sinon { "systeme": bool, "droits": { onglet: {…} } }.
create or replace function public.my_access() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('systeme', r.systeme,
                            'droits', case when jsonb_typeof(r.droits) = 'object' then r.droits else '{}'::jsonb end)
  from public.profiles p
  join public.roles r on r.company_id = p.company_id and r.id = p.profil_id
  where p.user_id = auth.uid() and p.actif
    and p.company_id = public.jwt_company_id()
    and public.company_active(p.company_id)
$$;

create or replace function public.is_company_admin(cid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select cid is not null and cid = public.jwt_company_id()
     and coalesce((public.my_access() -> 'systeme') = 'true'::jsonb, false)
$$;

-- ───────────────────────────── 3. Droits par onglet ─────────────────────────────

-- Onglets dont le droit « droit » ouvre l'accès à un enregistrement de « collection » (voir le tableau en tête).
create or replace function public.collection_tabs(collection text, data jsonb, droit text) returns text[]
language sql immutable security invoker set search_path = public, pg_temp as $$
  select case when droit in ('voir', 'modifier', 'supprimer') then
    -- onglets propriétaires (écriture)
    (case collection
      when 'devis'            then array['devis', 'commandes', 'facturation']
      when 'demandesArticles' then array['devis_articles']
      when 'clients'          then array['tiers_client']
      when 'fournisseurs'     then array['tiers_fournisseur']
      when 'immobilisations'  then (case data ->> 'categorie'
                                      when 'materiel'  then array['immo_materiel']
                                      when 'transport' then array['immo_transport']
                                      else array[]::text[] end)
      when 'achats'           then (case data ->> 'type'
                                      when 'consommable' then array['achat_consommable']
                                      when 'autre'       then array['achat_autre']
                                      else array[]::text[] end)
      when 'impots'           then array['impots']
      when 'collaborateurs'   then array['collab_salaries']
      when 'pointages'        then array['collab_pointage']
      when 'conges'           then array['collab_conges']
      when 'bulletins'        then array['collab_paie']
      when 'bordereauxCnss'   then array['collab_cnss']
      when 'bordereauxCimr'   then array['collab_cimr']
      when 'ordresMission'    then array['mission']
      when 'societe'          then array['societe']
      else array[]::text[] end)
    ||
    -- onglets qui s'appuient sur la même donnée (lecture seulement)
    (case when droit <> 'voir' then array[]::text[] else (case collection
      when 'devis'            then array['devis_articles', 'mission']
      when 'demandesArticles' then array['devis']
      when 'clients'          then array['devis', 'commandes', 'facturation', 'mission']
      when 'fournisseurs'     then array['achat_consommable', 'achat_autre', 'immo_materiel', 'immo_transport']
      when 'collaborateurs'   then array['collab_pointage', 'collab_conges', 'collab_paie', 'collab_cnss', 'collab_cimr', 'mission']
      when 'pointages'        then array['collab_paie', 'collab_cnss']
      when 'conges'           then array['collab_paie']
      when 'bulletins'        then array['collab_cnss', 'collab_cimr']
      when 'ordresMission'    then array['devis']
      else array[]::text[] end) end)
  else array[]::text[] end
$$;

-- Décision pure : l'accès « acces » (résultat de my_access()) donne-t-il le droit demandé sur cet enregistrement ?
create or replace function public.access_allows(acces jsonb, collection text, data jsonb, droit text) returns boolean
language sql immutable security invoker set search_path = public, pg_temp as $$
  select case
    when acces is null or collection is null or droit is null then false
    when droit not in ('voir', 'modifier', 'supprimer') then false
    when (acces -> 'systeme') = 'true'::jsonb then true                 -- profil système : tous les droits
    when droit = 'voir' and collection = 'societe' then true            -- fiche société : lisible par tout membre actif
    else exists (
      select 1 from unnest(public.collection_tabs(collection, data, droit)) as t(k)
      where (acces -> 'droits' -> t.k -> 'voir') = 'true'::jsonb        -- modifier / supprimer exigent voir
        and (droit = 'voir' or (acces -> 'droits' -> t.k -> droit) = 'true'::jsonb))
  end
$$;

create or replace function public.can_access(cid uuid, collection text, data jsonb, droit text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(cid is not null and cid = public.jwt_company_id()
                  and public.access_allows(public.my_access(), collection, data, droit), false)
$$;

-- Forme attendue de roles.droits : { onglet: { voir?: bool, modifier?: bool, supprimer?: bool, … } }, 20 Ko au plus.
create or replace function public.droits_valides(d jsonb) returns boolean
language sql immutable security invoker set search_path = public, pg_temp as $$
  select case
    when d is null or jsonb_typeof(d) <> 'object' then false
    when octet_length(d::text) > 20000 then false
    else not exists (
      select 1 from jsonb_each(d) e
      where case when jsonb_typeof(e.value) <> 'object' then true
                 else exists (select 1 from jsonb_each(e.value) f
                              where f.key in ('voir', 'modifier', 'supprimer') and jsonb_typeof(f.value) <> 'boolean') end)
  end
$$;

alter table public.roles drop constraint if exists roles_droits_valides;
alter table public.roles add constraint roles_droits_valides check (public.droits_valides(droits));

-- Catégorie / type d'un enregistrement existant de l'entreprise du compte (null s'il n'existe pas).
-- Sert à apply_changes pour contrôler le droit sur l'ancienne version d'une ligne, même si le compte ne la voit pas ;
-- ne révèle rien d'autre que ces deux champs.
create or replace function public.record_discriminant(p_collection text, p_id text) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('categorie', r.data -> 'categorie', 'type', r.data -> 'type')
  from public.records r
  where r.company_id = public.jwt_company_id() and r.collection = p_collection and r.id = p_id
    and public.my_access() is not null
$$;

-- ───────────────────────────── 4. Déclencheurs ─────────────────────────────

create or replace function public.records_before_write() returns trigger
language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if tg_op = 'UPDATE' and (new.company_id is distinct from old.company_id
                           or new.collection is distinct from old.collection
                           or new.id is distinct from old.id) then
    raise exception 'Enregistrement : entreprise, collection et identifiant ne peuvent pas être changés.' using errcode = '23514';
  end if;
  if new.data is null or jsonb_typeof(new.data) <> 'object' then
    raise exception 'Enregistrement invalide : un objet JSON est attendu.' using errcode = '23514';
  end if;
  if octet_length(new.data::text) > 524288 then
    raise exception 'Enregistrement trop volumineux (512 Ko au maximum).' using errcode = '54000';
  end if;
  if (new.data -> 'id') is distinct from to_jsonb(new.id) then
    new.data := new.data || jsonb_build_object('id', new.id);
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end
$$;

drop trigger if exists records_before_write on public.records;
create trigger records_before_write before insert or update on public.records
  for each row execute function public.records_before_write();

-- Rôles : identifiant, entreprise et caractère « système » figés après création (y compris pour le serveur).
create or replace function public.roles_before_update() returns trigger
language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if new.company_id is distinct from old.company_id or new.id is distinct from old.id
     or new.systeme is distinct from old.systeme then
    raise exception 'Profil : entreprise, identifiant et caractère système ne peuvent pas être changés.' using errcode = '23514';
  end if;
  return new;
end
$$;

drop trigger if exists roles_before_update on public.roles;
create trigger roles_before_update before update on public.roles
  for each row execute function public.roles_before_update();

-- ───────────────────────────── 5. RLS ─────────────────────────────

alter table public.companies         enable row level security;
alter table public.license_payments  enable row level security;
alter table public.platform_settings enable row level security;
alter table public.roles             enable row level security;
alter table public.profiles          enable row level security;
alter table public.records           enable row level security;

alter table public.companies         force row level security;
alter table public.license_payments  force row level security;
alter table public.platform_settings force row level security;
alter table public.roles             force row level security;
alter table public.profiles          force row level security;
alter table public.records           force row level security;

-- companies
drop policy if exists companies_select on public.companies;
create policy companies_select on public.companies for select to authenticated
  using ((select public.jwt_is_owner()) or public.is_company_member(id));

-- license_payments, platform_settings : propriétaire de la plateforme seulement
drop policy if exists license_payments_select on public.license_payments;
create policy license_payments_select on public.license_payments for select to authenticated
  using ((select public.jwt_is_owner()));

drop policy if exists platform_settings_select on public.platform_settings;
create policy platform_settings_select on public.platform_settings for select to authenticated
  using ((select public.jwt_is_owner()));

-- profiles
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (company_id = (select public.jwt_company_id()) and (select public.my_access()) is not null);

-- roles
drop policy if exists roles_select on public.roles;
create policy roles_select on public.roles for select to authenticated
  using (company_id = (select public.jwt_company_id()) and (select public.my_access()) is not null);

drop policy if exists roles_insert on public.roles;
create policy roles_insert on public.roles for insert to authenticated
  with check (not systeme and public.is_company_admin(company_id));

drop policy if exists roles_update on public.roles;
create policy roles_update on public.roles for update to authenticated
  using (not systeme and public.is_company_admin(company_id))
  with check (not systeme and public.is_company_admin(company_id));

drop policy if exists roles_delete on public.roles;
create policy roles_delete on public.roles for delete to authenticated
  using (not systeme and public.is_company_admin(company_id));

-- records
drop policy if exists records_select on public.records;
create policy records_select on public.records for select to authenticated
  using (company_id = (select public.jwt_company_id())
         and public.access_allows((select public.my_access()), collection, data, 'voir'));

drop policy if exists records_insert on public.records;
create policy records_insert on public.records for insert to authenticated
  with check (company_id = (select public.jwt_company_id())
              and public.access_allows((select public.my_access()), collection, data, 'modifier'));

drop policy if exists records_update on public.records;
create policy records_update on public.records for update to authenticated
  using (company_id = (select public.jwt_company_id())
         and public.access_allows((select public.my_access()), collection, data, 'modifier'))
  with check (company_id = (select public.jwt_company_id())
              and public.access_allows((select public.my_access()), collection, data, 'modifier'));

drop policy if exists records_delete on public.records;
create policy records_delete on public.records for delete to authenticated
  using (company_id = (select public.jwt_company_id())
         and public.access_allows((select public.my_access()), collection, data, 'supprimer'));

-- ───────────────────────────── 6. Écriture par lot ─────────────────────────────

-- changes = [ { "collection": "...", "id": "...", "op": "upsert" | "delete", "data": { … } }, … ]
-- Tout ou rien : la moindre erreur annule le lot entier. Renvoie le nombre de changements appliqués.
create or replace function public.apply_changes(changes jsonb) returns integer
language plpgsql volatile security invoker set search_path = public, pg_temp as $$
declare
  cid    uuid := public.jwt_company_id();
  acces  jsonb;
  ch     jsonb;
  coll   text;
  rid    text;
  op     text;
  d      jsonb;
  ancien jsonb;
  n      integer := 0;
begin
  if auth.uid() is null or cid is null or (public.my_profile()).user_id is null then
    raise exception 'Droit manquant : compte inconnu, désactivé ou non rattaché à cette entreprise.' using errcode = '42501';
  end if;
  acces := public.my_access();
  if acces is null then
    raise exception 'Licence inactive : accès suspendu ou licence expirée, modification refusée.' using errcode = '42501';
  end if;
  if changes is null or jsonb_typeof(changes) <> 'array' then
    raise exception 'Modifications invalides : un tableau est attendu.' using errcode = '22023';
  end if;
  if jsonb_array_length(changes) > 500 then
    raise exception 'Modifications invalides : 500 changements au maximum par envoi.' using errcode = '22023';
  end if;

  begin
    for ch in select t.value from jsonb_array_elements(changes) with ordinality as t(value, ord) order by t.ord loop
      if jsonb_typeof(ch) <> 'object' or jsonb_typeof(ch -> 'collection') is distinct from 'string'
         or jsonb_typeof(ch -> 'id') is distinct from 'string' or jsonb_typeof(ch -> 'op') is distinct from 'string' then
        raise exception 'Modification invalide : collection, id et op sont obligatoires.' using errcode = '22023';
      end if;
      coll := ch ->> 'collection';  rid := ch ->> 'id';  op := ch ->> 'op';  d := ch -> 'data';
      if coll not in ('societe', 'devis', 'demandesArticles', 'clients', 'fournisseurs', 'immobilisations', 'achats', 'impots',
                      'collaborateurs', 'pointages', 'conges', 'bulletins', 'bordereauxCnss', 'bordereauxCimr', 'ordresMission') then
        raise exception 'Modification invalide : collection inconnue.' using errcode = '22023';
      end if;
      if length(rid) < 1 or length(rid) > 80 or (coll = 'societe' and rid <> 'main') then
        raise exception 'Modification invalide : identifiant incorrect.' using errcode = '22023';
      end if;
      if op not in ('upsert', 'delete') then
        raise exception 'Modification invalide : opération inconnue.' using errcode = '22023';
      end if;

      ancien := public.record_discriminant(coll, rid);        -- null : la ligne n'existe pas encore

      if op = 'upsert' then
        if d is null or jsonb_typeof(d) <> 'object' then
          raise exception 'Modification invalide : données manquantes.' using errcode = '22023';
        end if;
        if not public.access_allows(acces, coll, d, 'modifier')
           or (ancien is not null and not public.access_allows(acces, coll, ancien, 'modifier')) then
          raise exception 'Droit manquant : modification non autorisée (%).', coll using errcode = '42501';
        end if;
        insert into public.records as r (company_id, collection, id, data)
        values (cid, coll, rid, d)
        on conflict (company_id, collection, id) do update set data = excluded.data;
      else
        if ancien is null then
          -- rien à supprimer ; on refuse tout de même si le compte n'a le droit de suppression sur aucun onglet de la collection
          if not (public.access_allows(acces, coll, '{"categorie":"materiel","type":"consommable"}'::jsonb, 'supprimer')
                  or public.access_allows(acces, coll, '{"categorie":"transport","type":"autre"}'::jsonb, 'supprimer')) then
            raise exception 'Droit manquant : suppression non autorisée (%).', coll using errcode = '42501';
          end if;
        else
          if not public.access_allows(acces, coll, ancien, 'supprimer') then
            raise exception 'Droit manquant : suppression non autorisée (%).', coll using errcode = '42501';
          end if;
          delete from public.records r where r.company_id = cid and r.collection = coll and r.id = rid;
        end if;
      end if;
      n := n + 1;
    end loop;
  exception when insufficient_privilege then
    if sqlerrm like 'Droit manquant%' then raise; end if;
    -- refus venant directement des règles RLS (ne devrait pas arriver : mêmes contrôles ci-dessus)
    raise exception 'Droit manquant : modification refusée par les règles de sécurité.' using errcode = '42501';
  end;
  return n;
end
$$;

-- ───────────────────────────── 7. Privilèges ─────────────────────────────

-- Tables : on retire tout (Supabase accorde tout par défaut à anon / authenticated), puis le strict nécessaire.
revoke all on all tables in schema public from public, anon, authenticated;
revoke all on all sequences in schema public from public, anon, authenticated;

-- companies : colonnes réservées à l'éditeur (tarif, contact, notes internes) NON lisibles par les comptes d'entreprise
-- (le propriétaire de la plateforme les lit via les fonctions serveur /api/owner, avec la clé service_role).
grant select (id, code, nom, licence, debut, essai_fin, echeance, suspendu, motif_suspension, interne, created_at)
  on public.companies to authenticated;
grant select on public.license_payments, public.platform_settings,
                public.profiles, public.roles, public.records to authenticated;
grant insert, delete on public.roles to authenticated;
grant update (nom, description, droits) on public.roles to authenticated;
grant insert (company_id, collection, id, data), update (data), delete on public.records to authenticated;

grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- Fonctions : exécutables seulement par les rôles qui en ont besoin.
revoke all on function
  public.jwt_company_id(), public.jwt_is_owner(), public.company_active(uuid), public.my_profile(), public.my_role(uuid),
  public.is_company_member(uuid), public.my_access(), public.is_company_admin(uuid),
  public.collection_tabs(text, jsonb, text), public.access_allows(jsonb, text, jsonb, text),
  public.can_access(uuid, text, jsonb, text), public.droits_valides(jsonb), public.record_discriminant(text, text),
  public.records_before_write(), public.roles_before_update(), public.apply_changes(jsonb)
from public, anon, authenticated;

-- appelées par les règles RLS ou par apply_changes (qui s'exécute avec les droits de l'appelant)
grant execute on function
  public.jwt_company_id(), public.jwt_is_owner(), public.my_profile(), public.my_role(uuid),
  public.is_company_member(uuid), public.my_access(), public.is_company_admin(uuid),
  public.collection_tabs(text, jsonb, text), public.access_allows(jsonb, text, jsonb, text),
  public.can_access(uuid, text, jsonb, text), public.droits_valides(jsonb), public.record_discriminant(text, text),
  public.apply_changes(jsonb)
to authenticated;

grant execute on function
  public.jwt_company_id(), public.jwt_is_owner(), public.company_active(uuid), public.my_profile(), public.my_role(uuid),
  public.is_company_member(uuid), public.my_access(), public.is_company_admin(uuid),
  public.collection_tabs(text, jsonb, text), public.access_allows(jsonb, text, jsonb, text),
  public.can_access(uuid, text, jsonb, text), public.droits_valides(jsonb), public.record_discriminant(text, text),
  public.apply_changes(jsonb)
to service_role;

-- Les tables et fonctions créées plus tard dans « public » par ce même rôle ne seront pas ouvertes d'office
-- à anon / authenticated : il faudra leur accorder explicitement les droits voulus (et écrire leurs règles RLS).
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from anon, authenticated;
