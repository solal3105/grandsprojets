-- Socle des fichiers du compartiment public « uploads », pour les essais de
-- base locale. À jouer après socle-local.sql, socle-stockage-local.sql et
-- socle-ecritures-local.sql.
--
-- Il reproduit ce dont l'écriture et la lecture par l'API de ces fichiers
-- dépendent sur le projet Supabase (relevé en base le 10 novembre 2026) : les
-- adresses de fichiers portées par un projet, et les règles d'origine de
-- storage.objects pour ce compartiment, telles quelles (doublons compris).
-- La règle de lecture uploads_read_public et les règles de dépôt des images de
-- marque viennent des deux socles précédents.

alter table public.contribution_uploads
  add column geojson_url  text,
  add column cover_url    text,
  add column markdown_url text;

-- Lecture par l'API ----------------------------------------------------------------

create policy "Public can read branding images" on storage.objects for select to public
  using (bucket_id = 'uploads' and (storage.foldername(name))[1] = 'branding');
create policy uploads_select_pdfs_projects_public on storage.objects for select to public
  using (bucket_id = 'uploads' and name like 'pdfs/projects/%');

-- Dépôt ------------------------------------------------------------------------------

create policy "allow authenticated insert uploads covers and geojson" on storage.objects for insert to authenticated
  with check (bucket_id = 'uploads' and (name like 'img/cover/%' or name like 'geojson/projects/%'));
create policy "auth can insert project geojson" on storage.objects for insert to authenticated
  with check (bucket_id = 'uploads' and name like 'geojson/projects/%');
create policy auth_insert_md_projects on storage.objects for insert to authenticated
  with check (bucket_id = 'uploads' and name like 'md/projects/%');
create policy storage_insert_uploads_covers_geojson on storage.objects for insert to authenticated
  with check (bucket_id = 'uploads' and (name like 'img/cover/%' or name like 'geojson/projects/%'));
create policy uploads_insert_article_images on storage.objects for insert to authenticated
  with check (bucket_id = 'uploads' and name like 'img/articles/%');
create policy uploads_insert_authenticated_limited_paths on storage.objects for insert to public
  with check (bucket_id = 'uploads' and auth.role() = 'authenticated'
    and (name like 'geojson/projects/%' or name like 'img/cover/%' or name like 'markdown/%'));
create policy uploads_insert_pdfs_projects_authenticated on storage.objects for insert to authenticated
  with check (bucket_id = 'uploads' and name like 'pdfs/projects/%');
create policy diagnostic_geojson_insert_admin on storage.objects for insert to authenticated
  with check (bucket_id = 'uploads' and (storage.foldername(name))[1] = 'diagnostic'
    and public.is_admin_for_ville((storage.foldername(name))[2]));

-- Remplacement -------------------------------------------------------------------------

create policy "allow owner update uploads covers and geojson" on storage.objects for update to authenticated
  using (bucket_id = 'uploads' and owner = auth.uid() and (name like 'img/cover/%' or name like 'geojson/projects/%'))
  with check (bucket_id = 'uploads' and owner = auth.uid() and (name like 'img/cover/%' or name like 'geojson/projects/%'));

-- Suppression ----------------------------------------------------------------------------

create policy diagnostic_geojson_delete_admin on storage.objects for delete to authenticated
  using (bucket_id = 'uploads' and (storage.foldername(name))[1] = 'diagnostic'
    and public.is_admin_for_ville((storage.foldername(name))[2]));
create policy uploads_delete_branding_admin on storage.objects for delete to authenticated
  using (bucket_id = 'uploads' and (storage.foldername(name))[1] = 'branding'
    and public.is_admin_for_ville((storage.foldername(name))[2]));
create policy uploads_delete_demo_admin on storage.objects for delete to authenticated
  using (bucket_id = 'uploads' and (storage.foldername(name))[1] = 'demo'
    and public.is_admin_for_ville((storage.foldername(name))[2]));
create policy uploads_delete_contribution_files on storage.objects for delete to authenticated
  using (
    bucket_id = 'uploads'
    and (name like 'geojson/projects/%' or name like 'img/cover/%' or name like 'md/projects/%'
      or name like 'markdown/%' or name like 'pdfs/projects/%' or name like 'img/articles/%')
    and (owner = auth.uid()
      or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  );
