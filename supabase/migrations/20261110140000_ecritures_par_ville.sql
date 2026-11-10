-- Chaque écriture est limitée aux villes du compte.
--
-- Le défaut (audit de sécurité du 9 novembre 2026) : plusieurs règles
-- d'écriture regardaient au mieux le rôle, jamais la ville.
--   - city_modules : tout compte connecté ajoutait, modifiait ou supprimait les
--     modules de n'importe quelle ville ;
--   - consultation_dossiers : tout compte connecté écrivait les dossiers de
--     concertation de n'importe quel projet ;
--   - category_icons, contribution_uploads, images de marque du stockage :
--     l'administrateur d'une ville écrivait chez toutes les autres ;
--   - city_branding : tout administrateur créait ou supprimait une ville ;
--   - ui_toggles (catalogue commun à toutes les villes) : tout administrateur
--     le modifiait.
-- Seule la console retenait chacun dans sa ville, dans le navigateur.
--
-- La règle, la même partout, avec les fonctions qui existent déjà :
--   - ce qui appartient à une ville s'écrit par ses administrateurs,
--     is_admin_for_ville(ville) (un super administrateur administre toutes les
--     villes) ;
--   - ce qui est commun à toutes les villes, et la liste des villes elle-même,
--     s'écrit par les super administrateurs, is_global_admin() ;
--   - un dossier de concertation suit le projet auquel il est rattaché :
--     l'écrit qui peut écrire ce projet (can_write_consultation_dossier).
--
-- C'est ce que la console permet déjà : ses écrans ne changent pour personne.
-- Les lectures publiques ne changent pas. Les fonctions serveur, qui tiennent
-- la clé de service, ne passent pas par ces règles.
--
-- La proposition d'un projet par un contributeur (contrib_insert_non_admin)
-- n'est pas modifiée ici.
--
-- Essais : supabase/tests/ecritures-par-ville.sql (base locale).

-- 1. Les catégories d'une ville ----------------------------------------------------

alter policy category_icons_insert_admin on public.category_icons
  with check (public.is_admin_for_ville(ville));
alter policy category_icons_update_admin on public.category_icons
  using (public.is_admin_for_ville(ville))
  with check (public.is_admin_for_ville(ville));
alter policy category_icons_delete_admin on public.category_icons
  using (public.is_admin_for_ville(ville));

-- 2. Les modules d'une ville ---------------------------------------------------------
--
-- L'écran Modules est réservé aux super administrateurs, mais les réglages du
-- module Travaux, ouverts aux administrateurs de la ville, s'enregistrent dans
-- cette table : la règle est donc celle de la ville.

drop policy if exists city_modules_insert_auth on public.city_modules;
drop policy if exists city_modules_update_auth on public.city_modules;
drop policy if exists city_modules_delete_auth on public.city_modules;
drop policy if exists city_modules_insert_admin on public.city_modules;
drop policy if exists city_modules_update_admin on public.city_modules;
drop policy if exists city_modules_delete_admin on public.city_modules;

create policy city_modules_insert_admin on public.city_modules
  for insert to authenticated
  with check (public.is_admin_for_ville(ville));
create policy city_modules_update_admin on public.city_modules
  for update to authenticated
  using (public.is_admin_for_ville(ville))
  with check (public.is_admin_for_ville(ville));
create policy city_modules_delete_admin on public.city_modules
  for delete to authenticated
  using (public.is_admin_for_ville(ville));

-- 3. Le catalogue des boutons de la carte ----------------------------------------------

alter policy ui_toggles_insert_admin on public.ui_toggles
  with check (public.is_global_admin());
alter policy ui_toggles_update_admin on public.ui_toggles
  using (public.is_global_admin())
  with check (public.is_global_admin());
alter policy ui_toggles_delete_admin on public.ui_toggles
  using (public.is_global_admin());

-- 4. Les villes ------------------------------------------------------------------------
--
-- Créer ou supprimer une ville : super administrateur (c'est l'écran Villes).
-- Modifier une ville : ses administrateurs, comme avant, et la ligne modifiée
-- doit rester une de leurs villes.

alter policy "Admins can insert cities" on public.city_branding
  with check (public.is_global_admin());
alter policy "Admins can delete cities" on public.city_branding
  using (public.is_global_admin());
alter policy "Admins can update their cities" on public.city_branding
  using (public.is_admin_for_ville(ville))
  with check (public.is_admin_for_ville(ville));

-- 5. Les projets -------------------------------------------------------------------------
--
-- L'administrateur écrit les projets de ses villes. L'auteur d'un projet le
-- modifie toujours sans pouvoir le publier lui-même ; il ne peut plus non plus
-- le déplacer dans une ville qui n'est pas la sienne.

alter policy contrib_insert_admin on public.contribution_uploads
  with check (public.is_admin_for_ville(ville));
alter policy contrib_update_admin on public.contribution_uploads
  using (public.is_admin_for_ville(ville))
  with check (public.is_admin_for_ville(ville));
alter policy contrib_delete_admin on public.contribution_uploads
  using (public.is_admin_for_ville(ville));

alter policy contrib_update_owner on public.contribution_uploads
  using (created_by = auth.uid())
  with check (
    created_by = auth.uid()
    and approved = (select c.approved from public.contribution_uploads c where c.id = contribution_uploads.id)
    and (
      ville is not distinct from (select c.ville from public.contribution_uploads c where c.id = contribution_uploads.id)
      or public.is_contributor_for_ville(ville)
    )
  );

-- 6. Les dossiers de concertation -----------------------------------------------------------
--
-- Un dossier appartient à un projet par contribution_id : le modifie ou le
-- supprime qui peut écrire ce projet. La fiche publique l'affiche encore par le
-- nom du projet : ce qu'on écrit doit donc aussi porter le nom du projet
-- rattaché, pour qu'on ne puisse pas faire apparaître un document sur le
-- projet d'un autre.

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
              and (c.created_by = auth.uid() or public.is_admin_for_ville(c.ville))
         );
$$;

comment on function public.can_write_consultation_dossier(bigint, text) is
  'Qui écrit un dossier de concertation : qui peut écrire le projet auquel il est rattaché (son auteur ou un administrateur de sa ville). Avec p_project, le dossier doit en plus porter le nom de ce projet : c''est le contrôle de ce qu''on écrit. Un dossier sans projet rattaché ne s''écrit que par un super administrateur.';

revoke all on function public.can_write_consultation_dossier(bigint, text) from public, anon;
grant execute on function public.can_write_consultation_dossier(bigint, text) to authenticated, service_role;

-- Les dossiers d'avant contribution_id sont rattachés quand un seul projet
-- porte leur nom. Ceux dont le nom désigne plusieurs projets, ou aucun, restent
-- sans rattachement : ils s'affichent comme avant et seul un super
-- administrateur les modifie.
update public.consultation_dossiers d
   set contribution_id = c.id
  from public.contribution_uploads c
 where d.contribution_id is null
   and c.project_name = d.project_name
   and not exists (
         select 1 from public.contribution_uploads autre
          where autre.project_name = d.project_name and autre.id <> c.id
       );

-- Une seule règle par action, à la place des douze accumulées.
drop policy if exists dossiers_select_all on public.consultation_dossiers;
drop policy if exists "Consultation dossiers - select (authenticated)" on public.consultation_dossiers;
drop policy if exists "Consultation dossiers are viewable by anon" on public.consultation_dossiers;
drop policy if exists "public read consultation docs" on public.consultation_dossiers;
drop policy if exists read_public_consultation_dossiers on public.consultation_dossiers;
drop policy if exists "Consultation dossiers - insert (authenticated)" on public.consultation_dossiers;
drop policy if exists "auth can insert consultation docs" on public.consultation_dossiers;
drop policy if exists dossiers_insert_authenticated on public.consultation_dossiers;
drop policy if exists "Consultation dossiers - update (authenticated)" on public.consultation_dossiers;
drop policy if exists dossiers_update_authenticated on public.consultation_dossiers;
drop policy if exists "Consultation dossiers - delete (authenticated)" on public.consultation_dossiers;
drop policy if exists dossiers_delete_authenticated on public.consultation_dossiers;
drop policy if exists consultation_dossiers_select on public.consultation_dossiers;
drop policy if exists consultation_dossiers_insert on public.consultation_dossiers;
drop policy if exists consultation_dossiers_update on public.consultation_dossiers;
drop policy if exists consultation_dossiers_delete on public.consultation_dossiers;

create policy consultation_dossiers_select on public.consultation_dossiers
  for select to public
  using (true);
create policy consultation_dossiers_insert on public.consultation_dossiers
  for insert to authenticated
  with check (public.can_write_consultation_dossier(contribution_id, project_name));
create policy consultation_dossiers_update on public.consultation_dossiers
  for update to authenticated
  using (public.can_write_consultation_dossier(contribution_id))
  with check (public.can_write_consultation_dossier(contribution_id, project_name));
create policy consultation_dossiers_delete on public.consultation_dossiers
  for delete to authenticated
  using (public.can_write_consultation_dossier(contribution_id));

-- 7. Les images de marque d'une ville, dans le stockage -----------------------------------------
--
-- Chemin : branding/<ville>/<fichier>. La suppression suivait déjà cette règle.

alter policy "Admins can upload branding images" on storage.objects
  with check (
    bucket_id = 'uploads'
    and (storage.foldername(name))[1] = 'branding'
    and public.is_admin_for_ville((storage.foldername(name))[2])
  );
alter policy "Admins can update branding images" on storage.objects
  using (
    bucket_id = 'uploads'
    and (storage.foldername(name))[1] = 'branding'
    and public.is_admin_for_ville((storage.foldername(name))[2])
  )
  with check (
    bucket_id = 'uploads'
    and (storage.foldername(name))[1] = 'branding'
    and public.is_admin_for_ville((storage.foldername(name))[2])
  );

-- Marche arrière : les règles d'origine sont reproduites telles quelles dans
-- supabase/tests/socle-ecritures-local.sql. Le rattachement des dossiers n'a pas
-- à être défait : contribution_id ne joue dans aucun affichage.
