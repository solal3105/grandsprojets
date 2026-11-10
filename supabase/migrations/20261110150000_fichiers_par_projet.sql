-- Un fichier du compartiment « uploads » suit son projet ou sa ville.
--
-- Le défaut (audit de sécurité du 9 novembre 2026, et « points restants » de
-- docs/securite-stockage-uploads.md) :
--   - les fichiers d'un projet (tracé, couverture, fiche, PDF) se supprimaient
--     par tout administrateur, quelle que soit sa ville : leur chemin ne porte
--     pas la ville, et la règle ne regardait que le rôle ;
--   - tout le compartiment se listait par l'API pour un compte connecté (règle
--     de lecture sans autre condition que le compartiment), alors qu'aucun
--     écran ne liste ces fichiers.
--
-- La règle, écrite une seule fois (can_write_upload) : on supprime un fichier,
-- et on le lit par l'API, quand on a le droit de l'écrire.
--   - Le chemin porte la ville (branding/<ville>/, demo/<espace>/,
--     diagnostic/<ville>/) : ses administrateurs, comme avant.
--   - Le fichier d'un projet : qui l'a déposé, ou qui peut écrire le projet
--     qui le désigne (son auteur ou un administrateur de sa ville). Un fichier
--     qu'aucun projet ne désigne ne se supprime que par qui l'a déposé ou par
--     un super administrateur.
--   - Le reste du compartiment : personne par l'API, comme avant.
--
-- Ce qui ne change pas : les adresses publiques ne traversent pas ces règles
-- (cartes, fiches, logos s'affichent comme avant) ; le dépôt et le
-- remplacement d'un fichier gardent leurs règles ; les fonctions serveur, qui
-- tiennent la clé de service, ne passent pas par ces règles.
--
-- Essais : supabase/tests/fichiers-par-projet.sql (base locale).

-- 1. Le fichier désigné par une adresse publique ------------------------------------
--
-- Les projets et les dossiers de concertation portent l'adresse publique de
-- leurs fichiers. Le chemin s'en déduit ; quatre index le rendent immédiat à
-- retrouver, pour que la règle coûte peu à chaque fichier lu.
--
-- upload_path, can_write_contribution et can_write_upload n'ont volontairement
-- pas de search_path fixé : c'est ce qui permet à Postgres de les fondre dans
-- la requête qui les appelle (un listage du compartiment est cinq fois plus
-- rapide ainsi, mesuré sur 12 000 fichiers). Elles s'exécutent avec les droits
-- de l'appelant et chaque nom qu'elles citent porte son schéma.

create or replace function public.upload_path(p_url text)
returns text
language sql
immutable
parallel safe
as $$
  select pg_catalog.substring(p_url, '/storage/v1/object/public/uploads/([^?#]+)');
$$;

comment on function public.upload_path(text) is
  'Le chemin, dans le compartiment uploads, du fichier désigné par une adresse publique. Nul pour toute autre adresse.';

create index if not exists contribution_uploads_geojson_path_idx
  on public.contribution_uploads (public.upload_path(geojson_url));
create index if not exists contribution_uploads_cover_path_idx
  on public.contribution_uploads (public.upload_path(cover_url));
create index if not exists contribution_uploads_markdown_path_idx
  on public.contribution_uploads (public.upload_path(markdown_url));
create index if not exists consultation_dossiers_pdf_path_idx
  on public.consultation_dossiers (public.upload_path(pdf_url));

-- 2. Qui écrit un projet ------------------------------------------------------------------
--
-- Son auteur, ou un administrateur de sa ville. Les dossiers de concertation
-- suivaient déjà cette règle ; elle est maintenant écrite à un seul endroit
-- pour les dossiers et pour les fichiers.

create or replace function public.can_write_contribution(p_created_by uuid, p_ville text)
returns boolean
language sql
stable
as $$
  select coalesce(p_created_by = auth.uid(), false)
      or coalesce(public.is_admin_for_ville(p_ville), false);
$$;

comment on function public.can_write_contribution(uuid, text) is
  'Qui écrit ce qui dépend d''un projet (ses dossiers de concertation, ses fichiers) : son auteur ou un administrateur de sa ville.';

create or replace function public.can_write_consultation_dossier(p_contribution bigint, p_project text default null)
returns boolean
language sql
stable
set search_path = public
as $$
  select public.is_global_admin()
      or exists (
           select 1
             from public.contribution_uploads c
            where c.id = p_contribution
              and (p_project is null or c.project_name = p_project)
              and public.can_write_contribution(c.created_by, c.ville)
         );
$$;

-- 3. Qui écrit un fichier du compartiment uploads -----------------------------------------

create or replace function public.can_write_project_file(p_name text)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
           select 1
             from public.contribution_uploads c
            where (public.upload_path(c.geojson_url) = p_name
                or public.upload_path(c.cover_url) = p_name
                or public.upload_path(c.markdown_url) = p_name)
              and public.can_write_contribution(c.created_by, c.ville)
         )
      or exists (
           select 1
             from public.consultation_dossiers d
            where public.upload_path(d.pdf_url) = p_name
              and public.can_write_consultation_dossier(d.contribution_id)
         );
$$;

comment on function public.can_write_project_file(text) is
  'Vrai si un projet désigne ce fichier (tracé, couverture, fiche) et que l''appelant peut écrire ce projet, ou si c''est le PDF d''un dossier de concertation que l''appelant peut écrire.';

create or replace function public.can_write_upload(p_name text, p_owner uuid)
returns boolean
language sql
stable
as $$
  select case
    when (storage.foldername(p_name))[1] in ('branding', 'demo', 'diagnostic')
      then coalesce(public.is_admin_for_ville((storage.foldername(p_name))[2]), false)
    when p_name like any (array['geojson/projects/%', 'img/cover/%', 'md/projects/%',
                                'markdown/%', 'pdfs/projects/%', 'img/articles/%'])
      then coalesce(p_owner = auth.uid(), false)
        or public.is_global_admin()
        or public.can_write_project_file(p_name)
    else false
  end;
$$;

comment on function public.can_write_upload(text, uuid) is
  'Qui supprime un fichier du compartiment uploads, et le lit par l''API : les administrateurs de la ville quand le chemin la porte ; pour le fichier d''un projet, qui l''a déposé ou qui peut écrire le projet qui le désigne ; un super administrateur pour un fichier de projet que plus rien ne désigne.';

revoke all on function public.can_write_contribution(uuid, text) from public, anon;
revoke all on function public.can_write_project_file(text) from public, anon;
revoke all on function public.can_write_upload(text, uuid) from public, anon;
grant execute on function public.can_write_contribution(uuid, text) to authenticated, service_role;
grant execute on function public.can_write_project_file(text) to authenticated, service_role;
grant execute on function public.can_write_upload(text, uuid) to authenticated, service_role;

-- 4. Les règles du compartiment : une pour lire par l'API, une pour supprimer -----------
--
-- Une règle de storage.objects ne se renomme pas : on crée, on retire.

drop policy if exists uploads_read_public on storage.objects;
drop policy if exists "Public can read branding images" on storage.objects;
drop policy if exists uploads_select_pdfs_projects_public on storage.objects;
drop policy if exists uploads_lecture_par_qui_ecrit on storage.objects;

create policy uploads_lecture_par_qui_ecrit on storage.objects
  for select to authenticated
  using (bucket_id = 'uploads' and public.can_write_upload(name, owner));

drop policy if exists uploads_delete_contribution_files on storage.objects;
drop policy if exists uploads_delete_demo_admin on storage.objects;
drop policy if exists uploads_delete_branding_admin on storage.objects;
drop policy if exists diagnostic_geojson_delete_admin on storage.objects;
drop policy if exists uploads_suppression_par_qui_ecrit on storage.objects;

create policy uploads_suppression_par_qui_ecrit on storage.objects
  for delete to authenticated
  using (bucket_id = 'uploads' and public.can_write_upload(name, owner));

-- Marche arrière : les règles d'origine sont reproduites telles quelles dans
-- supabase/tests/socle-stockage-local.sql (uploads_read_public) et
-- supabase/tests/socle-fichiers-local.sql. Les fonctions et les index peuvent
-- rester : plus rien ne les appelle une fois les règles d'origine remises,
-- sauf can_write_consultation_dossier, dont le résultat est inchangé.
