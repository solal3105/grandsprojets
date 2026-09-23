-- Politiques de storage.objects en production pour les compartiments uploads et
-- diagnostic, relevées dans pg_policies le 23/09/2026, avant la migration
-- 20260923150000_uploads_suppression_restreinte. Elles servent à rejouer, hors
-- production, l'effet de cette migration (tests/unauth.storage-policies.spec.js).

create policy "Admins can delete branding images" on storage.objects for delete to authenticated
  using ((bucket_id = 'uploads') and ((storage.foldername(name))[1] = 'branding') and (auth.uid() in (select profiles.id from public.profiles where profiles.role = 'admin')));
create policy diagnostic_files_delete_admin on storage.objects for delete to authenticated
  using ((bucket_id = 'diagnostic') and public.is_admin_for_ville((storage.foldername(name))[1]));
create policy diagnostic_geojson_delete_admin on storage.objects for delete to authenticated
  using ((bucket_id = 'uploads') and ((storage.foldername(name))[1] = 'diagnostic') and public.is_admin_for_ville((storage.foldername(name))[2]));
create policy uploads_delete_authenticated on storage.objects for delete to authenticated
  using (bucket_id = 'uploads');
create policy uploads_delete_authenticated_limited_paths on storage.objects for delete to authenticated
  using ((bucket_id = 'uploads') and ((name like 'geojson/projects/%') or (name like 'img/cover/%') or (name like 'markdown/%')));

create policy "Admins can upload branding images" on storage.objects for insert to authenticated
  with check ((bucket_id = 'uploads') and ((storage.foldername(name))[1] = 'branding') and (auth.uid() in (select profiles.id from public.profiles where profiles.role = 'admin')));
create policy "allow authenticated insert uploads covers and geojson" on storage.objects for insert to authenticated
  with check ((bucket_id = 'uploads') and ((name like 'img/cover/%') or (name like 'geojson/projects/%')));
create policy "auth can insert project geojson" on storage.objects for insert to authenticated
  with check ((bucket_id = 'uploads') and (name like 'geojson/projects/%'));
create policy auth_insert_md_projects on storage.objects for insert to authenticated
  with check ((bucket_id = 'uploads') and (name like 'md/projects/%'));
create policy diagnostic_files_insert_admin on storage.objects for insert to authenticated
  with check ((bucket_id = 'diagnostic') and public.is_admin_for_ville((storage.foldername(name))[1]));
create policy diagnostic_geojson_insert_admin on storage.objects for insert to authenticated
  with check ((bucket_id = 'uploads') and ((storage.foldername(name))[1] = 'diagnostic') and public.is_admin_for_ville((storage.foldername(name))[2]));
create policy storage_insert_uploads_covers_geojson on storage.objects for insert to authenticated
  with check ((bucket_id = 'uploads') and ((name like 'img/cover/%') or (name like 'geojson/projects/%')));
create policy temp_anon_reimport_france on storage.objects for insert to anon
  with check ((bucket_id = 'uploads') and (name like 'geojson/projects/%'));
create policy uploads_insert_authenticated_limited_paths on storage.objects for insert to public
  with check ((bucket_id = 'uploads') and (auth.role() = 'authenticated') and ((name like 'geojson/projects/%') or (name like 'img/cover/%') or (name like 'markdown/%')));
create policy uploads_insert_pdfs_projects_authenticated on storage.objects for insert to authenticated
  with check ((bucket_id = 'uploads') and (name like 'pdfs/projects/%'));

create policy "Public can read branding images" on storage.objects for select to public
  using ((bucket_id = 'uploads') and ((storage.foldername(name))[1] = 'branding'));
create policy diagnostic_files_select_admin on storage.objects for select to authenticated
  using ((bucket_id = 'diagnostic') and public.is_admin_for_ville((storage.foldername(name))[1]));
create policy uploads_read_public on storage.objects for select to public
  using (bucket_id = 'uploads');
create policy uploads_select_pdfs_projects_public on storage.objects for select to public
  using ((bucket_id = 'uploads') and (name like 'pdfs/projects/%'));

create policy "Admins can update branding images" on storage.objects for update to authenticated
  using ((bucket_id = 'uploads') and ((storage.foldername(name))[1] = 'branding') and (auth.uid() in (select profiles.id from public.profiles where profiles.role = 'admin')));
create policy "allow owner update uploads covers and geojson" on storage.objects for update to authenticated
  using ((bucket_id = 'uploads') and (owner = auth.uid()) and ((name like 'img/cover/%') or (name like 'geojson/projects/%')))
  with check ((bucket_id = 'uploads') and (owner = auth.uid()) and ((name like 'img/cover/%') or (name like 'geojson/projects/%')));
create policy "auth can update project geojson" on storage.objects for update to authenticated
  using ((bucket_id = 'uploads') and (name like 'geojson/projects/%'))
  with check ((bucket_id = 'uploads') and (name like 'geojson/projects/%'));
create policy diagnostic_files_update_admin on storage.objects for update to authenticated
  using ((bucket_id = 'diagnostic') and public.is_admin_for_ville((storage.foldername(name))[1]))
  with check ((bucket_id = 'diagnostic') and public.is_admin_for_ville((storage.foldername(name))[1]));
