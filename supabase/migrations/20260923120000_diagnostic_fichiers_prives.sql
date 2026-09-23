-- Les couches importées dans le diagnostic (export Strava sous licence, tableaux
-- de la collectivité) ne doivent plus être lisibles par quiconque obtient leur
-- adresse. Elles vont désormais dans un compartiment privé, rangé par ville :
-- diagnostic/<ville>/<fichier>. Seuls les administrateurs de cette ville y
-- lisent, déposent, remplacent et suppriment.
insert into storage.buckets (id, name, public, file_size_limit)
values ('diagnostic', 'diagnostic', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

create policy diagnostic_files_select_admin on storage.objects
  for select to authenticated
  using (bucket_id = 'diagnostic' and public.is_admin_for_ville((storage.foldername(name))[1]));

create policy diagnostic_files_insert_admin on storage.objects
  for insert to authenticated
  with check (bucket_id = 'diagnostic' and public.is_admin_for_ville((storage.foldername(name))[1]));

create policy diagnostic_files_update_admin on storage.objects
  for update to authenticated
  using (bucket_id = 'diagnostic' and public.is_admin_for_ville((storage.foldername(name))[1]))
  with check (bucket_id = 'diagnostic' and public.is_admin_for_ville((storage.foldername(name))[1]));

create policy diagnostic_files_delete_admin on storage.objects
  for delete to authenticated
  using (bucket_id = 'diagnostic' and public.is_admin_for_ville((storage.foldername(name))[1]));

-- Les couches déposées avant ce changement restent dans uploads/diagnostic/<ville>/.
-- Leur suppression, au retrait de la couche, suit la même règle par ville.
create policy diagnostic_geojson_delete_admin on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'uploads'
    and (storage.foldername(name))[1] = 'diagnostic'
    and public.is_admin_for_ville((storage.foldername(name))[2])
  );
