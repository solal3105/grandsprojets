-- Socle des chantiers d'une ville, pour les essais de base locale. À jouer
-- après socle-local.sql (qui apporte profiles et is_admin()).
--
-- Il reproduit ce que la migration 20261110200000 touche sur le projet Supabase
-- (relevé en base le 10 novembre 2026) : les trois fonctions
-- can_manage_city_travaux(), is_contributor_for_ville() et
-- travaux_before_insert() telles qu'elles y étaient, la table city_travaux
-- réduite aux colonnes qui jouent dans ses règles, ses huit règles d'accès et
-- son déclencheur. Ce n'est pas une copie de la base.

create function public.can_manage_city_travaux(ville_param text) returns boolean
language plpgsql stable security definer as $$
declare
  v_role  text;
  v_villes text[];
begin
  select role, ville into v_role, v_villes from public.profiles where id = auth.uid();
  if v_role is null then return false; end if;
  if v_role = 'admin' and 'global' = any(v_villes) then return true; end if;
  if v_role = 'admin' and ville_param = any(v_villes) then return true; end if;
  return false;
end;
$$;

create function public.is_contributor_for_ville(ville_param text) returns boolean
language plpgsql stable security definer as $$
declare
  v_role  text;
  v_villes text[];
begin
  select role, ville into v_role, v_villes from public.profiles where id = auth.uid();
  if v_role is null then return false; end if;
  if 'global' = any(v_villes) then return true; end if;
  if ville_param = any(v_villes) then return true; end if;
  return false;
end;
$$;

create function public.travaux_before_insert() returns trigger
language plpgsql security definer as $$
declare
  v_role text;
begin
  new.created_by := auth.uid();
  select role into v_role from public.profiles where id = auth.uid();
  if v_role is distinct from 'admin' then
    new.approved := false;
  end if;
  return new;
end;
$$;

create table public.city_travaux (
  id         uuid primary key default gen_random_uuid(),
  ville      text not null,
  name       text not null,
  approved   boolean not null default false,
  created_by uuid
);
alter table public.city_travaux enable row level security;
revoke insert, update, delete on public.city_travaux from anon;

create policy travaux_select_public on public.city_travaux for select to anon, authenticated using (approved = true);
create policy travaux_select_own on public.city_travaux for select to authenticated using (created_by = auth.uid());
create policy travaux_select_admin on public.city_travaux for select to authenticated
  using (public.can_manage_city_travaux(ville));
create policy travaux_insert_contributor on public.city_travaux for insert to authenticated
  with check (public.is_contributor_for_ville(ville));
create policy travaux_update_admin on public.city_travaux for update to authenticated
  using (public.can_manage_city_travaux(ville)) with check (public.can_manage_city_travaux(ville));
create policy travaux_update_own_pending on public.city_travaux for update to authenticated
  using (created_by = auth.uid() and approved = false) with check (created_by = auth.uid() and approved = false);
create policy travaux_delete_admin on public.city_travaux for delete to authenticated
  using (public.can_manage_city_travaux(ville));
create policy travaux_delete_own_pending on public.city_travaux for delete to authenticated
  using (created_by = auth.uid() and approved = false);

create trigger travaux_enforce_ownership before insert on public.city_travaux
  for each row execute function public.travaux_before_insert();
