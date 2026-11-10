-- Socle des tables de configuration et de contenu d'une ville, pour les essais
-- de base locale. À jouer après socle-local.sql et socle-stockage-local.sql.
--
-- Il reproduit ce dont l'écriture dépend sur le projet Supabase (relevé en base
-- le 10 novembre 2026) : les tables city_branding, city_modules, category_icons,
-- ui_toggles, contribution_uploads et consultation_dossiers réduites aux
-- colonnes qui jouent dans les règles, leurs règles d'origine telles quelles
-- (doublons compris), les deux déclencheurs d'insertion des contributions,
-- is_contributor_for_ville(), et les règles de dépôt des images de marque dans
-- le stockage. Ce n'est pas une copie de la base.

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

-- Les villes ---------------------------------------------------------------------

create table public.city_branding (
  ville         text primary key,
  brand_name    text,
  primary_color text not null default '#21b929',
  updated_by    uuid
);
alter table public.city_branding enable row level security;
revoke insert, update, delete on public.city_branding from anon;

create policy "Public can read cities" on public.city_branding for select to public using (true);
create policy city_branding_select on public.city_branding for select to anon, authenticated using (true);
create policy "Admins can insert cities" on public.city_branding for insert to authenticated
  with check (auth.uid() in (select profiles.id from public.profiles where profiles.role = 'admin'));
create policy "Admins can delete cities" on public.city_branding for delete to authenticated
  using (auth.uid() in (select profiles.id from public.profiles where profiles.role = 'admin'));
create policy "Admins can update their cities" on public.city_branding for update to authenticated
  using (auth.uid() in (
    select profiles.id from public.profiles
     where profiles.role = 'admin'
       and (profiles.ville @> array[city_branding.ville] or profiles.ville @> array['global'])));

-- Les modules d'une ville ----------------------------------------------------------

create table public.city_modules (
  id         serial primary key,
  ville      text not null,
  module_key text not null,
  label      text not null,
  enabled    boolean not null default true,
  config     jsonb not null default '{}',
  unique (ville, module_key)
);
alter table public.city_modules enable row level security;

create policy city_modules_select_all on public.city_modules for select to public using (true);
create policy city_modules_insert_auth on public.city_modules for insert to authenticated with check (true);
create policy city_modules_update_auth on public.city_modules for update to authenticated using (true) with check (true);
create policy city_modules_delete_auth on public.city_modules for delete to authenticated using (true);

-- Les catégories d'une ville --------------------------------------------------------

create table public.category_icons (
  category      text not null,
  icon_class    text not null,
  display_order integer not null default 100,
  ville         text not null,
  primary key (ville, category)
);
alter table public.category_icons enable row level security;
revoke insert, update, delete on public.category_icons from anon;

create policy category_icons_select_anon on public.category_icons for select to anon, authenticated using (true);
create policy category_icons_insert_admin on public.category_icons for insert to authenticated
  with check (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin'));
create policy category_icons_update_admin on public.category_icons for update to authenticated
  using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin'))
  with check (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin'));
create policy category_icons_delete_admin on public.category_icons for delete to authenticated
  using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin'));

-- Le catalogue des boutons de la carte, commun à toutes les villes ---------------------

create table public.ui_toggles (
  key        text primary key,
  icon       text not null,
  label      text not null,
  sort_order integer not null default 0
);
alter table public.ui_toggles enable row level security;

create policy ui_toggles_select_anon on public.ui_toggles for select to anon, authenticated using (true);
create policy ui_toggles_insert_admin on public.ui_toggles for insert to authenticated
  with check (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin'));
create policy ui_toggles_update_admin on public.ui_toggles for update to authenticated
  using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin'))
  with check (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin'));
create policy ui_toggles_delete_admin on public.ui_toggles for delete to authenticated
  using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin'));

-- Les projets ------------------------------------------------------------------------

create table public.contribution_uploads (
  id           bigint generated by default as identity primary key,
  project_name text not null,
  category     text not null,
  created_by   uuid,
  description  text,
  ville        text,
  approved     boolean not null default false
);
alter table public.contribution_uploads enable row level security;
revoke update, delete on public.contribution_uploads from anon;

create function public.contribution_uploads_set_defaults() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.created_by is null then new.created_by := auth.uid(); end if;
  if new.approved is null then
    new.approved := exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin');
  end if;
  return new;
end;
$$;
create trigger bi_contribution_uploads_defaults before insert on public.contribution_uploads
  for each row execute function public.contribution_uploads_set_defaults();

create policy contrib_read_all on public.contribution_uploads for select to public using (true);
create policy "public read contribution uploads" on public.contribution_uploads for select to anon, authenticated using (true);
create policy contrib_insert_admin on public.contribution_uploads for insert to authenticated
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
create policy contrib_insert_non_admin on public.contribution_uploads for insert to authenticated
  with check (approved = false and created_by = auth.uid()
    and not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
create policy contrib_update_admin on public.contribution_uploads for update to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
create policy contrib_update_owner on public.contribution_uploads for update to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid()
    and approved = (select c.approved from public.contribution_uploads c where c.id = contribution_uploads.id));
create policy contrib_delete_admin on public.contribution_uploads for delete to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
create policy contrib_delete_owner on public.contribution_uploads for delete to authenticated
  using (created_by = auth.uid());

-- Les dossiers de concertation d'un projet -----------------------------------------------

create table public.consultation_dossiers (
  id              bigint generated by default as identity primary key,
  project_name    text not null,
  category        text not null,
  title           text not null,
  pdf_url         text not null check (pdf_url ~ '^https?://'),
  contribution_id bigint references public.contribution_uploads (id) on delete cascade,
  unique (project_name, pdf_url)
);
alter table public.consultation_dossiers enable row level security;
revoke insert, update, delete on public.consultation_dossiers from anon;

create policy dossiers_select_all on public.consultation_dossiers for select to public using (true);
create policy "Consultation dossiers - select (authenticated)" on public.consultation_dossiers
  for select to authenticated using (auth.role() = 'authenticated');
create policy "Consultation dossiers are viewable by anon" on public.consultation_dossiers
  for select to anon, authenticated using (true);
create policy "public read consultation docs" on public.consultation_dossiers
  for select to anon, authenticated using (true);
create policy read_public_consultation_dossiers on public.consultation_dossiers
  for select to anon, authenticated using (true);
create policy "Consultation dossiers - insert (authenticated)" on public.consultation_dossiers
  for insert to authenticated with check (auth.role() = 'authenticated');
create policy "auth can insert consultation docs" on public.consultation_dossiers
  for insert to authenticated with check (true);
create policy dossiers_insert_authenticated on public.consultation_dossiers
  for insert to authenticated with check (true);
create policy "Consultation dossiers - update (authenticated)" on public.consultation_dossiers
  for update to authenticated using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy dossiers_update_authenticated on public.consultation_dossiers
  for update to authenticated using (true) with check (true);
create policy "Consultation dossiers - delete (authenticated)" on public.consultation_dossiers
  for delete to authenticated using (auth.role() = 'authenticated');
create policy dossiers_delete_authenticated on public.consultation_dossiers
  for delete to authenticated using (true);

-- Les images de marque dans le stockage -------------------------------------------------

create policy "Admins can upload branding images" on storage.objects for insert to authenticated
  with check (bucket_id = 'uploads' and (storage.foldername(name))[1] = 'branding'
    and auth.uid() in (select profiles.id from public.profiles where profiles.role = 'admin'));
create policy "Admins can update branding images" on storage.objects for update to authenticated
  using (bucket_id = 'uploads' and (storage.foldername(name))[1] = 'branding'
    and auth.uid() in (select profiles.id from public.profiles where profiles.role = 'admin'));
