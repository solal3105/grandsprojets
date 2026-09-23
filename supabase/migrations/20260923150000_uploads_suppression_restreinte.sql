-- Compartiment public « uploads » : chacun ne supprime plus que ce qui le concerne.
--
-- Avant cette migration, la politique uploads_delete_authenticated laissait
-- n'importe quel compte connecté (administrateur, contributeur invité, compte
-- ouvert par un lien d'inscription) supprimer n'importe quel fichier du
-- compartiment : couvertures et tracés des projets publiés, fiches Markdown,
-- PDF de concertation, images de marque, couches du diagnostic. Les politiques
-- permissives s'additionnent, les règles plus étroites ne servaient donc à rien.
--
-- Parcours recensés le 23/09/2026 (docs/securite-stockage-uploads.md) :
--   * deleteContribution (modules/supabaseservice.js) supprime geojson/projects/,
--     img/cover/, md/projects/ (et l'ancien markdown/) et pdfs/projects/. Il est
--     déclenché par l'auteur de la contribution (contributeur invité) ou par un
--     administrateur, comme le permettent contrib_delete_owner et
--     contrib_delete_admin sur la table. Dans les espaces de démonstration, ces
--     fichiers vivent sous demo/<espace>/ ;
--   * deleteDiagnosticLayer supprime les anciennes couches uploads/diagnostic/<ville>/,
--     couvert par diagnostic_geojson_delete_admin (administrateur de la ville) ;
--   * aucun parcours ne supprime une image de marque, ni ne remplace un fichier
--     existant (tous les dépôts sont faits sans écrasement, upsert: false).
-- Les fonctions Netlify utilisent la clé de service et ne sont pas concernées.

drop policy if exists uploads_delete_authenticated on storage.objects;
drop policy if exists uploads_delete_authenticated_limited_paths on storage.objects;

-- Fichiers d'une contribution : leur auteur, ou un administrateur (la table
-- contribution_uploads laisse déjà tout administrateur supprimer une contribution).
create policy uploads_delete_contribution_files on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'uploads'
    and (
      name like 'geojson/projects/%' or name like 'img/cover/%' or name like 'md/projects/%'
      or name like 'markdown/%' or name like 'pdfs/projects/%' or name like 'img/articles/%'
    )
    and (
      owner = auth.uid()
      or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
    )
  );

-- Espaces de démonstration : le chemin porte l'espace, seul son administrateur supprime.
create policy uploads_delete_demo_admin on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'uploads'
    and (storage.foldername(name))[1] = 'demo'
    and public.is_admin_for_ville((storage.foldername(name))[2])
  );

-- Images de marque : le chemin porte la ville, seul son administrateur supprime.
drop policy if exists "Admins can delete branding images" on storage.objects;
create policy uploads_delete_branding_admin on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'uploads'
    and (storage.foldername(name))[1] = 'branding'
    and public.is_admin_for_ville((storage.foldername(name))[2])
  );

-- Reste d'un import ponctuel : n'importe qui, sans compte, pouvait déposer un
-- fichier dans geojson/projects/. Aucun parcours ne dépose sans compte.
drop policy if exists temp_anon_reimport_france on storage.objects;

-- Aucun parcours ne remplace un tracé déposé, mais tout compte connecté pouvait
-- écraser celui d'un projet publié. L'auteur garde le droit de remplacer ses
-- propres fichiers (allow owner update uploads covers and geojson).
drop policy if exists "auth can update project geojson" on storage.objects;

-- Les images insérées dans l'article d'une contribution (img/articles/) n'avaient
-- aucune règle de dépôt : l'éditeur les proposait, la base les refusait, même à un
-- administrateur (constaté le 23/09/2026 avec le compte de test). Même règle que
-- pour les couvertures : tout compte connecté dépose, seul l'auteur ou un
-- administrateur supprime (uploads_delete_contribution_files).
create policy uploads_insert_article_images on storage.objects
  for insert to authenticated
  with check (bucket_id = 'uploads' and name like 'img/articles/%');

