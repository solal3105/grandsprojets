-- Socle du stockage pour les essais de base locale, à jouer après socle-local.sql.
--
-- Il reproduit ce dont la lecture de storage.objects dépend sur le projet
-- Supabase (relevé en base le 10 novembre 2026) : les compartiments, la table
-- des fichiers, storage.foldername(), is_admin_for_ville(), les règles de
-- lecture de chaque compartiment, la règle générale et la règle de dépôt sans
-- compte d'origine, et les règles de lecture de Chantiers avec des doublures de
-- ses fonctions (op_chantier_*). Les règles d'écriture qui ne jouent pas dans
-- ces essais ne sont pas reprises.

create schema storage;
grant usage on schema storage to anon, authenticated, service_role;

create table storage.buckets (
  id                 text primary key,
  public             boolean not null default false,
  file_size_limit    bigint,
  allowed_mime_types text[]
);
insert into storage.buckets (id, public, file_size_limit) values
  ('uploads', true, null), ('travaux-geojson', true, null), ('image', true, null),
  ('signatures', true, 2097152), ('diagnostic', false, 52428800), ('participer-photos', false, 4194304),
  ('op-chantier-documents', false, 10485760), ('op-chantier-medias', false, 52428800),
  ('op-chantier-referentiel', false, 10485760);

create table storage.objects (
  id        uuid primary key default gen_random_uuid(),
  bucket_id text not null references storage.buckets (id),
  name      text not null,
  owner     uuid,
  unique (bucket_id, name)
);
grant all on storage.objects to anon, authenticated, service_role;
grant select on storage.buckets to anon, authenticated, service_role;
alter table storage.objects enable row level security;

create function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1 : array_length(string_to_array(name, '/'), 1) - 1];
$$;

create function public.is_admin_for_ville(ville_param text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  v_role  text;
  v_villes text[];
begin
  select role, ville into v_role, v_villes from public.profiles where id = auth.uid();
  if v_role is null or v_role <> 'admin' then return false; end if;
  if 'global' = any(v_villes) then return true; end if;
  return ville_param = any(v_villes);
end;
$$;

-- Doublures de Chantiers : qui est membre de quel espace, qui voit quel dossier.
create table public.zz_op_membres (compte uuid, espace uuid);
create table public.zz_op_dossiers_visibles (compte uuid, dossier uuid);

create function public.op_chantier_mes_espaces() returns setof uuid
language sql stable security definer set search_path = public as $$
  select espace from public.zz_op_membres where compte = auth.uid();
$$;
create function public.op_chantier_est_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_global_admin();
$$;
create function public.op_chantier_dossier_visible(p_dossier uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.zz_op_dossiers_visibles where compte = auth.uid() and dossier = p_dossier);
$$;
create function public.op_chantier_uuid_ou_null(p text) returns uuid
language plpgsql immutable as $$
begin
  return p::uuid;
exception when others then
  return null;
end;
$$;
-- Comme en base le 10 novembre 2026 : ces deux fonctions ne sont pas
-- exécutables sans compte, alors que la règle restrictive les appelle pour
-- tout le monde. Toute lecture de storage.objects sans compte échoue donc.
revoke all on function public.op_chantier_mes_espaces() from public, anon;
revoke all on function public.op_chantier_est_admin() from public, anon;

-- Les règles de lecture, telles qu'en base.
create policy "Enable read access for all users" on storage.objects
  for select to public using (true);
create policy uploads_read_public on storage.objects
  for select to public using (bucket_id = 'uploads');
create policy "Public read travaux GeoJSON" on storage.objects
  for select to public using (bucket_id = 'travaux-geojson');
create policy diagnostic_files_select_admin on storage.objects
  for select to authenticated
  using (bucket_id = 'diagnostic' and public.is_admin_for_ville((storage.foldername(name))[1]));
create policy op_chantier_fichiers_confidentialite on storage.objects
  as restrictive for select to public
  using (
    bucket_id not in ('op-chantier-documents', 'op-chantier-medias')
    or (storage.foldername(name))[1] in (select espace::text from public.op_chantier_mes_espaces() as t(espace))
    or (select public.op_chantier_est_admin())
  );
create policy op_chantier_fichiers_select on storage.objects
  for select to authenticated
  using (
    (select public.op_chantier_est_admin())
    or (bucket_id = 'op-chantier-documents'
        and (select public.op_chantier_dossier_visible(public.op_chantier_uuid_ou_null((storage.foldername(objects.name))[2]))))
    or (bucket_id = 'op-chantier-referentiel'
        and public.op_chantier_uuid_ou_null((storage.foldername(name))[1]) in (select public.op_chantier_mes_espaces()))
  );

-- Les règles de dépôt qui jouent dans les essais.
create policy "allow anonymous uploads 1nq2cb_0" on storage.objects
  for insert to public with check (bucket_id = 'image');
create policy diagnostic_files_insert_admin on storage.objects
  for insert to authenticated
  with check (bucket_id = 'diagnostic' and public.is_admin_for_ville((storage.foldername(name))[1]));
