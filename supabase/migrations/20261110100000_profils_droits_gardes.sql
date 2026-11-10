-- Les droits d'un compte (profiles.role et profiles.ville) sont gardés par la base.
--
-- Le défaut (audit de sécurité du 9 novembre 2026) : la règle « Admins can
-- update profiles » laissait tout administrateur modifier n'importe quel
-- profil, colonne ville comprise. Un administrateur de ville pouvait donc
-- ajouter 'global' à son propre profil et devenir super administrateur de la
-- carte, de Chantiers et de Sites, qui lisent tous leurs droits dans cette
-- table. Seule la console vérifiait qui changeait quoi, et la console tourne
-- dans le navigateur.
--
-- Ce que cette migration met en place :
--   1. Un journal (profiles_log) : chaque création, changement de droits ou
--      suppression d'un profil, écrit par la base elle-même. Lisible par les
--      seuls super administrateurs.
--   2. Une garde (profiles_rights_guard) : la règle « qui peut changer les
--      droits de qui », écrite une seule fois et appliquée à toute écriture
--      faite au nom d'un utilisateur, quel que soit le chemin (console, appel
--      direct de l'API, fonction de base). Les écritures sans utilisateur (clé
--      de service de invite-user et du SSO, inscription, éditeur SQL,
--      migrations) restent libres.
--   3. set_profile_role() : la porte par laquelle la console change un rôle.
--
-- Elle ne retire rien : la règle d'écriture d'origine reste en place et la
-- console d'avant continue de marcher, sa mise à jour directe passant
-- désormais par la garde. Le défaut est fermé dès cette migration. La
-- suivante (20261110110000) retire l'écriture directe, une fois la console
-- passée à set_profile_role().
--
-- La règle :
--   - personne ne change ses propres droits ;
--   - un super administrateur change les droits de tout autre compte ;
--   - un administrateur de ville change le rôle (admin ou invited) d'un compte
--     dont TOUS les espaces sont les siens. Un profil porte un seul rôle pour
--     tous ses espaces : promouvoir un compte qui a aussi accès à un espace
--     voisin le rendrait administrateur de cet espace. Ces comptes-là, les
--     super administrateurs et les comptes sans espace relèvent du super
--     administrateur ;
--   - un administrateur de ville ne touche jamais à la liste des espaces d'un
--     compte : un espace s'ajoute par une invitation (fonction invite-user).
--
-- Essais : supabase/tests/profils-droits.sql (base locale, 54 cas).

-- 1. Journal -----------------------------------------------------------------

create table if not exists public.profiles_log (
  id                bigint generated always as identity primary key,
  -- Pas de clé étrangère : la trace survit à la suppression du compte.
  profile_id        uuid        not null,
  profile_email     text,
  action            text        not null check (action in ('insert', 'update', 'delete')),
  old_role          text,
  new_role          text,
  old_ville         text[],
  new_ville         text[],
  changed_at        timestamptz not null default now(),
  changed_by        uuid        references auth.users (id) on delete set null,
  changed_by_email  text,
  changed_via       text        not null
);

comment on table public.profiles_log is
  'Historique des droits (profiles.role, profiles.ville) : une ligne par création, changement ou suppression, écrite par trigger. changed_by null = écriture faite sans utilisateur (clé de service, inscription, SQL).';
comment on column public.profiles_log.profile_email is
  'Adresse du compte concerné, figée au moment du changement (absente si le compte est supprimé dans la même opération)';
comment on column public.profiles_log.changed_by_email is
  'Adresse de l''auteur figée au moment du changement, pour l''affichage sans lire auth.users';
comment on column public.profiles_log.changed_via is
  'Par où l''écriture est arrivée : authenticated (un utilisateur connecté), service_role (fonction serveur), sinon le rôle de connexion (supabase_auth_admin pour une inscription, postgres pour l''éditeur SQL)';

create index if not exists profiles_log_profile_changed_at_idx
  on public.profiles_log (profile_id, changed_at desc);

alter table public.profiles_log enable row level security;

drop policy if exists profiles_log_select_global_admin on public.profiles_log;
create policy profiles_log_select_global_admin
  on public.profiles_log
  for select
  to authenticated
  using (public.is_global_admin());

-- Aucune règle d'écriture : seul le trigger (propriétaire de la table) insère
-- dans le journal.
revoke all on public.profiles_log from anon, authenticated;
grant select on public.profiles_log to authenticated;

-- 2. Garde ---------------------------------------------------------------------

create or replace function public.profiles_rights_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller        uuid := auth.uid();
  v_caller_role   text;
  v_caller_ville  text[];
  v_target_ville  text[];
begin
  -- Sans utilisateur (clé de service, inscription, éditeur SQL, migration) : rien à vérifier
  if v_caller is null then
    return coalesce(new, old);
  end if;

  select role, coalesce(ville, '{}')
    into v_caller_role, v_caller_ville
    from public.profiles
   where id = v_caller;

  if v_caller_role is distinct from 'admin' then
    raise exception 'Seul un administrateur peut changer les droits d''un compte.'
      using errcode = 'insufficient_privilege';
  end if;

  if tg_op = 'UPDATE' and new.id is distinct from old.id then
    raise exception 'Un profil ne peut pas être rattaché à un autre compte.'
      using errcode = 'insufficient_privilege';
  end if;

  if coalesce(old.id, new.id) = v_caller then
    raise exception 'Vous ne pouvez pas changer vos propres droits. Demandez-le à un autre administrateur.'
      using errcode = 'insufficient_privilege';
  end if;

  if tg_op <> 'DELETE' and (new.role is null or new.role not in ('admin', 'invited')) then
    raise exception 'Le rôle demandé est inconnu.'
      using errcode = 'invalid_parameter_value';
  end if;

  -- Super administrateur : tout autre compte
  if 'global' = any(v_caller_ville) then
    return coalesce(new, old);
  end if;

  -- Administrateur de ville : le rôle d'un compte dont tous les espaces sont les siens
  if tg_op <> 'UPDATE' then
    raise exception 'Seul un super administrateur peut créer ou supprimer un profil.'
      using errcode = 'insufficient_privilege';
  end if;

  v_target_ville := coalesce(old.ville, '{}');

  if 'global' = any(v_target_ville) then
    raise exception 'Ce compte est super administrateur : seul un super administrateur peut le modifier.'
      using errcode = 'insufficient_privilege';
  end if;

  if cardinality(v_target_ville) = 0 then
    raise exception 'Ce compte n''est rattaché à aucun espace : seul un super administrateur peut le modifier.'
      using errcode = 'insufficient_privilege';
  end if;

  if not (v_target_ville <@ v_caller_ville) then
    raise exception 'Ce compte a aussi accès à un espace que vous n''administrez pas : seul un super administrateur peut changer son rôle.'
      using errcode = 'insufficient_privilege';
  end if;

  if new.ville is distinct from old.ville then
    raise exception 'Seul un super administrateur peut changer les espaces d''un compte. Pour donner accès à un espace, envoyez une invitation.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

comment on function public.profiles_rights_guard() is
  'Garde de profiles : qui peut changer les droits de qui, pour toute écriture faite au nom d''un utilisateur. Les écritures sans utilisateur (clé de service, SQL) ne sont pas vérifiées.';

revoke all on function public.profiles_rights_guard() from public, anon, authenticated;

drop trigger if exists profiles_rights_guard on public.profiles;
create trigger profiles_rights_guard
  before insert or update or delete on public.profiles
  for each row
  execute function public.profiles_rights_guard();

create or replace function public.profiles_log_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile uuid := case when tg_op = 'DELETE' then old.id else new.id end;
begin
  insert into public.profiles_log (
    profile_id, profile_email, action,
    old_role, new_role, old_ville, new_ville,
    changed_by, changed_by_email, changed_via
  )
  values (
    v_profile,
    (select email from auth.users where id = v_profile),
    lower(tg_op),
    case when tg_op <> 'INSERT' then old.role end,
    case when tg_op <> 'DELETE' then new.role end,
    case when tg_op <> 'INSERT' then old.ville end,
    case when tg_op <> 'DELETE' then new.ville end,
    auth.uid(),
    (select email from auth.users where id = auth.uid()),
    coalesce(auth.jwt() ->> 'role', session_user::text)
  );
  return null;
end;
$$;

revoke all on function public.profiles_log_change() from public, anon, authenticated;

drop trigger if exists profiles_log_insert_delete on public.profiles;
create trigger profiles_log_insert_delete
  after insert or delete on public.profiles
  for each row
  execute function public.profiles_log_change();

drop trigger if exists profiles_log_update on public.profiles;
create trigger profiles_log_update
  after update on public.profiles
  for each row
  when (old.role is distinct from new.role or old.ville is distinct from new.ville)
  execute function public.profiles_log_change();

-- 3. La porte de la console ------------------------------------------------------

create or replace function public.set_profile_role(p_profile uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- La garde ne vérifie pas les écritures sans utilisateur : cette porte n'est
  -- faite que pour un utilisateur connecté. C'est la garde qui décide ensuite.
  if auth.uid() is null then
    raise exception 'Connexion requise.'
      using errcode = 'insufficient_privilege';
  end if;

  update public.profiles
     set role = p_role
   where id = p_profile;

  if not found then
    raise exception 'Ce compte est introuvable.'
      using errcode = 'no_data_found';
  end if;
end;
$$;

comment on function public.set_profile_role(uuid, text) is
  'Change le rôle (admin ou invited) d''un compte au nom de l''utilisateur connecté. Les droits sont vérifiés par la garde profiles_rights_guard.';

-- Les fonctions du schéma public reçoivent d'office le droit d'exécution pour
-- anon : il se retire nommément.
revoke all on function public.set_profile_role(uuid, text) from public, anon;
grant execute on function public.set_profile_role(uuid, text) to authenticated;

-- Marche arrière (le journal est perdu) :
--   drop function if exists public.set_profile_role(uuid, text);
--   drop trigger if exists profiles_log_update on public.profiles;
--   drop trigger if exists profiles_log_insert_delete on public.profiles;
--   drop trigger if exists profiles_rights_guard on public.profiles;
--   drop function if exists public.profiles_log_change();
--   drop function if exists public.profiles_rights_guard();
--   drop table if exists public.profiles_log;
