-- Socle minimal pour rejouer une migration sur un Postgres local vide.
--
-- Il reproduit ce dont les règles d'accès de `profiles` dépendent sur le projet
-- Supabase (relevé en base le 10 novembre 2026) : les rôles de l'API, auth.uid(),
-- auth.jwt(), la table auth.users, la table profiles avec ses droits et ses deux
-- règles d'origine, les fonctions is_admin(), is_global_admin() et
-- get_profiles_with_email(), le trigger d'inscription. Rien d'autre : ce n'est
-- pas une copie de la base.
--
-- Usage : voir l'en-tête de chaque fichier d'essais (profils-droits.sql,
-- profils-lecture.sql).

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then create role supabase_auth_admin nologin; end if;
end $$;

create schema auth;
grant usage on schema auth to anon, authenticated, service_role, supabase_auth_admin;
grant usage on schema public to anon, authenticated, service_role, supabase_auth_admin;

create table auth.users (
  id                 uuid primary key,
  email              text,
  email_confirmed_at timestamptz,
  last_sign_in_at    timestamptz,
  created_at         timestamptz not null default now()
);
grant all on auth.users to supabase_auth_admin;

create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
$$;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid;
$$;
create function auth.role() returns text language sql stable as $$
  select auth.jwt() ->> 'role';
$$;

-- Comme sur Supabase : toute table et toute fonction créée dans public est
-- d'office ouverte aux trois rôles de l'API. Les migrations doivent retirer
-- nommément ce qu'elles ne veulent pas laisser.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  role       text not null default 'invité',
  created_at timestamptz not null default now(),
  ville      text[]
);
revoke insert, update, delete on public.profiles from anon;
alter table public.profiles enable row level security;

create function public.is_admin() returns boolean
language plpgsql stable security definer as $$
begin
  return (select role from profiles where id = auth.uid()) = 'admin';
end;
$$;

create function public.is_global_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
     where id = auth.uid() and role = 'admin' and 'global' = any(ville)
  );
$$;

-- La liste des utilisateurs de la console, telle qu'elle était en base avant
-- 20261110120000 (aucune migration du dépôt ne la crée).
create function public.get_profiles_with_email()
returns table (id uuid, role text, ville text, created_at timestamptz, email varchar)
language plpgsql security definer set search_path = public as $$
begin
  return query
  select p.id, p.role, p.ville::text, p.created_at, u.email::varchar
    from profiles p
    left join auth.users u on u.id = p.id
   where (p.id = auth.uid() or is_admin());
end;
$$;

create policy "Enable read access for users" on public.profiles
  for select to authenticated using ((auth.uid() = id) or public.is_admin());
create policy "Admins can update profiles" on public.profiles
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, role)
  values (new.id, 'invited')
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
