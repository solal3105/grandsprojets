-- Le choix des espaces proposés aux moteurs de recherche se fait désormais
-- depuis l'admin (page « Référencement »), réservée aux super administrateurs
-- (profil admin dont la liste de villes contient 'global').
--
-- Ce que cette migration met en place :
--   1. is_global_admin() : le rôle « super administrateur » exprimé une seule
--      fois, réutilisable par les règles d'accès et les gardes.
--   2. Une garde en base sur city_branding.indexable : quel que soit le chemin
--      (interface, appel direct de l'API), seul un super administrateur peut
--      changer ce réglage. Les écritures sans utilisateur (clé de service,
--      éditeur SQL, migrations) restent libres.
--   3. Un journal des changements (city_indexing_log) alimenté par la base
--      elle-même : qui a proposé ou retiré quel espace, et quand. Lisible par
--      les seuls super administrateurs, jamais écrit depuis le client.
--   4. Une vue d'ensemble (city_indexing_overview) pour l'écran : chaque
--      espace, son réglage, le nombre de fiches qui seraient proposées aux
--      moteurs (mêmes critères que le plan du site) et son dernier changement.
--   5. La suppression de la règle « tout admin peut modifier toute ville » :
--      un administrateur ne modifie que les villes de son profil, un super
--      administrateur les modifie toutes (règle « their cities », inchangée).
--
-- Suite de 20260908000000 (réglage par espace) et 20260914010000 (test-e2e).

-- 1. Super administrateur --------------------------------------------------

create or replace function public.is_global_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.profiles
     where id = auth.uid()
       and role = 'admin'
       and 'global' = any(ville)
  );
$$;

comment on function public.is_global_admin() is
  'true si l''utilisateur courant est un super administrateur (admin dont les villes contiennent global)';

revoke all on function public.is_global_admin() from public;
grant execute on function public.is_global_admin() to authenticated;

-- 2. Journal des changements ---------------------------------------------

create table if not exists public.city_indexing_log (
  id                bigint generated always as identity primary key,
  ville             text        not null,
  indexable         boolean     not null,
  changed_at        timestamptz not null default now(),
  changed_by        uuid        references auth.users (id) on delete set null,
  changed_by_email  text
);

comment on table public.city_indexing_log is
  'Historique de city_branding.indexable : une ligne par changement, écrite par trigger. changed_by null = changement fait sans utilisateur (clé de service, SQL).';
comment on column public.city_indexing_log.indexable is
  'La valeur APRÈS le changement : true = espace proposé aux moteurs, false = retiré';
comment on column public.city_indexing_log.changed_by_email is
  'Adresse de l''auteur figée au moment du changement, pour l''affichage sans lire auth.users';

create index if not exists city_indexing_log_ville_changed_at_idx
  on public.city_indexing_log (ville, changed_at desc);

alter table public.city_indexing_log enable row level security;

drop policy if exists city_indexing_log_select_global_admin on public.city_indexing_log;
create policy city_indexing_log_select_global_admin
  on public.city_indexing_log
  for select
  to authenticated
  using (public.is_global_admin());

-- Aucune règle d'écriture : seuls les triggers (propriétaire de la table)
-- insèrent dans le journal.
revoke all on public.city_indexing_log from anon, authenticated;
grant select on public.city_indexing_log to authenticated;

-- 3. Garde et journal sur city_branding.indexable -------------------------

create or replace function public.city_indexing_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Sans utilisateur (clé de service, éditeur SQL, migration) : rien à vérifier
  if auth.uid() is null then
    return new;
  end if;

  if not public.is_global_admin() then
    raise exception 'Seul un super administrateur peut changer les espaces proposés aux moteurs de recherche'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

drop trigger if exists city_indexing_guard on public.city_branding;
create trigger city_indexing_guard
  before update of indexable on public.city_branding
  for each row
  when (old.indexable is distinct from new.indexable)
  execute function public.city_indexing_guard();

create or replace function public.city_indexing_log_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.city_indexing_log (ville, indexable, changed_by, changed_by_email)
  values (
    new.ville,
    new.indexable,
    auth.uid(),
    (select email from auth.users where id = auth.uid())
  );
  return new;
end;
$$;

drop trigger if exists city_indexing_log_change on public.city_branding;
create trigger city_indexing_log_change
  after update of indexable on public.city_branding
  for each row
  when (old.indexable is distinct from new.indexable)
  execute function public.city_indexing_log_change();

-- Amorçage : les espaces déjà retirés des moteurs avant l'existence du
-- journal, à l'heure de leur retrait (updated_at, posé par le trigger de
-- city_branding au moment de chaque migration : france le 8 septembre 2026,
-- les espaces des collectivités puis test-e2e le 14 septembre 2026).
insert into public.city_indexing_log (ville, indexable, changed_at)
select ville, false, coalesce(updated_at, now())
  from public.city_branding
 where indexable = false
   and not exists (select 1 from public.city_indexing_log l where l.ville = city_branding.ville);

-- 4. Vue d'ensemble pour l'écran -----------------------------------------

-- « Fiches publiques » : mêmes critères que l'inventaire du plan du site
-- (netlify/functions/lib/projects-index.mjs) : approuvée, adresse complète,
-- contenu, une seule page par groupe de doublons (même nom, même catégorie).
create or replace view public.city_indexing_overview
with (security_invoker = true)
as
with fiches as (
  select distinct
         lower(ville) as ville,
         lower(regexp_replace(btrim(project_name), '\s+', ' ', 'g')) as nom,
         lower(category_slug) as categorie
    from public.contribution_uploads
   where approved
     and ville is not null
     and slug is not null
     and category_slug is not null
     and category is not null
     and nullif(btrim(project_name), '') is not null
     and (markdown_url is not null or nullif(btrim(description), '') is not null)
)
select b.ville,
       b.brand_name,
       b.indexable,
       coalesce(f.n, 0)::int  as fiches_publiques,
       l.changed_at           as last_changed_at,
       l.changed_by_email     as last_changed_by_email
  from public.city_branding b
  left join (select ville, count(*) as n from fiches group by ville) f
         on f.ville = lower(b.ville)
  left join lateral (
         select changed_at, changed_by_email
           from public.city_indexing_log
          where ville = b.ville
          order by changed_at desc, id desc
          limit 1
       ) l on true;

comment on view public.city_indexing_overview is
  'Un espace par ligne : réglage d''indexation, nombre de fiches proposables aux moteurs, dernier changement (visible des seuls super administrateurs, RLS du journal)';

revoke all on public.city_indexing_overview from anon, authenticated;
grant select on public.city_indexing_overview to authenticated;

-- 5. Un administrateur ne modifie que ses villes ---------------------------

-- « Admins can update their cities » (ville du profil ou 'global') reste :
-- c'est elle qui porte la règle. Celle-ci laissait tout admin modifier toute
-- ville, et donc ce réglage : elle disparaît.
drop policy if exists "Admins can update cities" on public.city_branding;
