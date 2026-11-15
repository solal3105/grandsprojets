-- État de production relevé le 11/10/2026, avant la migration
-- 20261011230000_cloisonnement_des_villes : tables réduites aux colonnes utiles,
-- fonctions et politiques recopiées telles quelles (pg_policies, pg_get_functiondef).
-- Sert à unauth.cloisonnement.spec.js, joué dans une base PostgreSQL embarquée.

create role anon;
create role authenticated;
create schema auth;
create schema storage;

create function auth.uid() returns uuid language sql stable
  as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
create function auth.role() returns text language sql stable
  as $$ select coalesce(nullif(current_setting('test.role', true), ''), 'anon') $$;
create function storage.foldername(name text) returns text[] language sql immutable
  as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;

create table auth.users (id uuid primary key, email text);
create table public.profiles (id uuid primary key, role text, created_at timestamptz default now(), ville text[]);
create table public.contribution_uploads (id bigserial primary key, project_name text, category text, ville text, approved boolean, created_by uuid);
create table public.consultation_dossiers (id bigserial primary key, project_name text, category text, title text, pdf_url text, contribution_id bigint);
create table public.city_modules (id bigserial primary key, ville text, module_key text, label text, icon_class text, enabled boolean default true);
create table public.city_branding (ville text primary key, brand_name text, primary_color text);
create table public.category_icons (category text, ville text, icon_class text, category_styles jsonb);
create table public.ui_toggles (key text primary key, label text);
create table public.city_travaux (id bigserial primary key, ville text, name text, icon text);
create table public.participer_categories (id bigserial primary key, ville text, icon_class text);
create table public.layers (id bigserial primary key, name text, ville text, icon text);
create table public.basemaps_v2 (name text primary key, icon text);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text not null, name text not null, owner uuid);

-- Fonctions d'appui, définitions de production
create function public.is_admin() returns boolean language plpgsql stable security definer as $$
begin
  return (select role from profiles where id = auth.uid()) = 'admin';
end; $$;
create function public.is_global_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and 'global' = any(ville));
$$;
create function public.is_admin_for_ville(ville_param text) returns boolean language plpgsql stable security definer set search_path = public as $$
declare v_role text; v_villes text[];
begin
  select role, ville into v_role, v_villes from public.profiles where id = auth.uid();
  if v_role is null or v_role <> 'admin' then return false; end if;
  if 'global' = any(v_villes) then return true; end if;
  return ville_param = any(v_villes);
end; $$;
create function public.is_contributor_for_ville(ville_param text) returns boolean language plpgsql stable security definer as $$
declare v_role text; v_villes text[];
begin
  select role, ville into v_role, v_villes from public.profiles where id = auth.uid();
  if v_role is null then return false; end if;
  if 'global' = any(v_villes) then return true; end if;
  if ville_param = any(v_villes) then return true; end if;
  return false;
end; $$;
create function public.get_profiles_with_email()
returns table(id uuid, role text, ville text, created_at timestamptz, email character varying)
language plpgsql security definer set search_path = public as $$
begin
  return query
  select p.id, p.role, p.ville::text, p.created_at, u.email::varchar
    from profiles p left join auth.users u on u.id = p.id
   where (p.id = auth.uid() or is_admin());
end; $$;

alter table public.profiles enable row level security;
alter table public.contribution_uploads enable row level security;
alter table public.consultation_dossiers enable row level security;
alter table public.city_modules enable row level security;
alter table public.city_branding enable row level security;
alter table public.category_icons enable row level security;
alter table public.ui_toggles enable row level security;
alter table storage.objects enable row level security;

grant usage on schema auth, storage, public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant usage on all sequences in schema public to anon, authenticated;
grant select, insert, update, delete on storage.objects to anon, authenticated;

-- Politiques de production (pg_policies, 11/10/2026)
create policy category_icons_delete_admin on public.category_icons as PERMISSIVE for DELETE to authenticated using ((EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));
create policy category_icons_insert_admin on public.category_icons as PERMISSIVE for INSERT to authenticated with check ((EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));
create policy category_icons_select_anon on public.category_icons as PERMISSIVE for SELECT to anon, authenticated using (true);
create policy category_icons_update_admin on public.category_icons as PERMISSIVE for UPDATE to authenticated using ((EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text))))) with check ((EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));
create policy "Admins can delete cities" on public.city_branding as PERMISSIVE for DELETE to authenticated using ((auth.uid() IN ( SELECT profiles.id FROM profiles WHERE (profiles.role = 'admin'::text))));
create policy "Admins can insert cities" on public.city_branding as PERMISSIVE for INSERT to authenticated with check ((auth.uid() IN ( SELECT profiles.id FROM profiles WHERE (profiles.role = 'admin'::text))));
create policy "Admins can update their cities" on public.city_branding as PERMISSIVE for UPDATE to authenticated using ((auth.uid() IN ( SELECT profiles.id FROM profiles WHERE ((profiles.role = 'admin'::text) AND ((profiles.ville @> ARRAY[city_branding.ville]) OR (profiles.ville @> ARRAY['global'::text]))))));
create policy "Public can read cities" on public.city_branding as PERMISSIVE for SELECT to public using (true);
create policy city_branding_select on public.city_branding as PERMISSIVE for SELECT to anon, authenticated using (true);
create policy city_modules_delete_auth on public.city_modules as PERMISSIVE for DELETE to authenticated using (true);
create policy city_modules_insert_auth on public.city_modules as PERMISSIVE for INSERT to authenticated with check (true);
create policy city_modules_select_all on public.city_modules as PERMISSIVE for SELECT to public using (true);
create policy city_modules_update_auth on public.city_modules as PERMISSIVE for UPDATE to authenticated using (true) with check (true);
create policy "Consultation dossiers - delete (authenticated)" on public.consultation_dossiers as PERMISSIVE for DELETE to authenticated using ((auth.role() = 'authenticated'::text));
create policy "Consultation dossiers - insert (authenticated)" on public.consultation_dossiers as PERMISSIVE for INSERT to authenticated with check ((auth.role() = 'authenticated'::text));
create policy "Consultation dossiers - select (authenticated)" on public.consultation_dossiers as PERMISSIVE for SELECT to authenticated using ((auth.role() = 'authenticated'::text));
create policy "Consultation dossiers - update (authenticated)" on public.consultation_dossiers as PERMISSIVE for UPDATE to authenticated using ((auth.role() = 'authenticated'::text)) with check ((auth.role() = 'authenticated'::text));
create policy "Consultation dossiers are viewable by anon" on public.consultation_dossiers as PERMISSIVE for SELECT to anon, authenticated using (true);
create policy "auth can insert consultation docs" on public.consultation_dossiers as PERMISSIVE for INSERT to authenticated with check (true);
create policy dossiers_delete_authenticated on public.consultation_dossiers as PERMISSIVE for DELETE to authenticated using (true);
create policy dossiers_insert_authenticated on public.consultation_dossiers as PERMISSIVE for INSERT to authenticated with check (true);
create policy dossiers_select_all on public.consultation_dossiers as PERMISSIVE for SELECT to public using (true);
create policy dossiers_update_authenticated on public.consultation_dossiers as PERMISSIVE for UPDATE to authenticated using (true) with check (true);
create policy "public read consultation docs" on public.consultation_dossiers as PERMISSIVE for SELECT to anon, authenticated using (true);
create policy read_public_consultation_dossiers on public.consultation_dossiers as PERMISSIVE for SELECT to anon, authenticated using (true);
create policy contrib_delete_admin on public.contribution_uploads as PERMISSIVE for DELETE to authenticated using ((EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text)))));
create policy contrib_delete_owner on public.contribution_uploads as PERMISSIVE for DELETE to authenticated using ((created_by = auth.uid()));
create policy contrib_insert_admin on public.contribution_uploads as PERMISSIVE for INSERT to authenticated with check ((EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text)))));
create policy contrib_insert_non_admin on public.contribution_uploads as PERMISSIVE for INSERT to authenticated with check (((approved = false) AND (created_by = auth.uid()) AND (NOT (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text)))))));
create policy contrib_read_all on public.contribution_uploads as PERMISSIVE for SELECT to public using (true);
create policy contrib_update_admin on public.contribution_uploads as PERMISSIVE for UPDATE to authenticated using ((EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text))))) with check ((EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text)))));
create policy contrib_update_owner on public.contribution_uploads as PERMISSIVE for UPDATE to authenticated using ((created_by = auth.uid())) with check (((created_by = auth.uid()) AND (approved = ( SELECT c.approved FROM contribution_uploads c WHERE (c.id = contribution_uploads.id)))));
create policy "public read contribution uploads" on public.contribution_uploads as PERMISSIVE for SELECT to anon, authenticated using (true);
create policy "Admins can update branding images" on storage.objects as PERMISSIVE for UPDATE to authenticated using (((bucket_id = 'uploads'::text) AND ((storage.foldername(name))[1] = 'branding'::text) AND (auth.uid() IN ( SELECT profiles.id FROM profiles WHERE (profiles.role = 'admin'::text)))));
create policy "Admins can upload branding images" on storage.objects as PERMISSIVE for INSERT to authenticated with check (((bucket_id = 'uploads'::text) AND ((storage.foldername(name))[1] = 'branding'::text) AND (auth.uid() IN ( SELECT profiles.id FROM profiles WHERE (profiles.role = 'admin'::text)))));
create policy "Enable read access for all users" on storage.objects as PERMISSIVE for SELECT to public using (true);
create policy "allow anonymous uploads 1nq2cb_0" on storage.objects as PERMISSIVE for INSERT to public with check ((bucket_id = 'image'::text));
create policy "allow authenticated insert uploads covers and geojson" on storage.objects as PERMISSIVE for INSERT to authenticated with check (((bucket_id = 'uploads'::text) AND ((name ~~ 'img/cover/%'::text) OR (name ~~ 'geojson/projects/%'::text))));
create policy diagnostic_files_select_admin on storage.objects as PERMISSIVE for SELECT to authenticated using (((bucket_id = 'diagnostic'::text) AND is_admin_for_ville((storage.foldername(name))[1])));
create policy storage_insert_uploads_covers_geojson on storage.objects as PERMISSIVE for INSERT to authenticated with check (((bucket_id = 'uploads'::text) AND ((name ~~ 'img/cover/%'::text) OR (name ~~ 'geojson/projects/%'::text))));
create policy uploads_insert_pdfs_projects_authenticated on storage.objects as PERMISSIVE for INSERT to authenticated with check (((bucket_id = 'uploads'::text) AND (name ~~ 'pdfs/projects/%'::text)));
create policy uploads_read_public on storage.objects as PERMISSIVE for SELECT to public using ((bucket_id = 'uploads'::text));
create policy "Admins can update profiles" on public.profiles as PERMISSIVE for UPDATE to authenticated using (is_admin()) with check (is_admin());
create policy "Enable read access for users" on public.profiles as PERMISSIVE for SELECT to authenticated using (((auth.uid() = id) OR is_admin()));
create policy ui_toggles_delete_admin on public.ui_toggles as PERMISSIVE for DELETE to authenticated using ((EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));
create policy ui_toggles_insert_admin on public.ui_toggles as PERMISSIVE for INSERT to authenticated with check ((EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));
create policy ui_toggles_select_anon on public.ui_toggles as PERMISSIVE for SELECT to anon, authenticated using (true);
create policy ui_toggles_update_admin on public.ui_toggles as PERMISSIVE for UPDATE to authenticated using ((EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text))))) with check ((EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));
