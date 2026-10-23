-- Cloisonnement des données entre collectivités, audit de sécurité du 11/10/2026.
--
-- Constats, vérifiés en simulant chaque rôle dans une transaction annulée :
--   * tout compte connecté, y compris un compte vierge sans ville (l'inscription
--     publique était ouverte, sans confirmation d'adresse), pouvait modifier ou
--     supprimer les modules de toutes les villes et tous les documents de
--     concertation (politiques « true ») ;
--   * le même compte lisait les fichiers privés du diagnostic et les photos des
--     signalements (politique de lecture « true » sur storage.objects) ;
--   * n'importe quel visiteur, sans compte, pouvait déposer des fichiers dans le
--     compartiment public « image » ;
--   * un administrateur d'une ville pouvait se donner les droits de super
--     administrateur (profiles), lire l'adresse de tous les utilisateurs,
--     modifier ou supprimer les fiches, catégories, images de marque des autres
--     villes, et supprimer leur espace ;
--   * les contributions en attente de modération étaient lisibles par tous.
--
-- Règle posée ici : un administrateur n'agit que sur les villes de son profil,
-- un contributeur que sur ses propres contributions dans ses villes, et ce qui
-- engage toutes les villes (modules, espaces, interrupteurs) revient au super
-- administrateur. Les fonctions Netlify et Supabase utilisent la clé de service
-- et ne sont pas concernées.

-- ── Fonctions d'appui ──────────────────────────────────────────────────────

-- Villes que l'utilisateur courant administre (vide s'il n'est pas administrateur).
create or replace function public.my_admin_villes()
returns text[]
language sql stable security definer
set search_path = public
as $$
  select coalesce(
    (select ville from public.profiles where id = auth.uid() and role = 'admin'),
    '{}'::text[]
  );
$$;

-- Vrai si l'utilisateur courant appartient à au moins une ville d'Open Projets.
-- Les comptes d'OpenArrêté partagent la base sans appartenir à une ville.
create or replace function public.has_open_projets_city()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
     where id = auth.uid() and cardinality(coalesce(ville, '{}'::text[])) > 0
  );
$$;

-- Les documents les plus anciens ne sont rattachés à leur fiche que par le nom
-- du projet (877 sur 957 le 12/10/2026). Le nom n'identifie pas une fiche : un
-- contributeur pourrait créer dans sa ville une fiche du même nom qu'un projet
-- d'une autre ville et prendre la main sur ses documents. On rattache donc par
-- identifiant ceux dont le nom ne désigne qu'une seule fiche (781) ; les autres
-- (noms portés par plusieurs fiches, ou fiche disparue) restent sans rattachement
-- et ne se modifient plus que par un super administrateur.
update public.consultation_dossiers d
   set contribution_id = c.id
  from public.contribution_uploads c
 where d.contribution_id is null
   and c.project_name = d.project_name
   and (select count(*) from public.contribution_uploads c2 where c2.project_name = d.project_name) = 1;

-- Vrai si l'utilisateur courant peut modifier les documents rattachés à cette
-- fiche : son auteur, un administrateur de sa ville, ou un super administrateur.
create or replace function public.can_edit_project_docs(p_contribution bigint)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.is_global_admin() or exists (
    select 1 from public.contribution_uploads c
     where c.id = p_contribution
       and (c.created_by = auth.uid() or public.is_admin_for_ville(c.ville))
  );
$$;

-- ── Profils ────────────────────────────────────────────────────────────────

-- Lecture : soi-même, un super administrateur, ou un administrateur qui
-- partage une ville avec la personne.
drop policy if exists "Enable read access for users" on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or (select public.is_global_admin())
    or ville && (select public.my_admin_villes())
  );

-- Écriture : un administrateur ne touche qu'aux personnes de ses villes, jamais
-- à lui-même ; le détail des colonnes est gardé par profiles_guard.
drop policy if exists "Admins can update profiles" on public.profiles;
create policy profiles_update_admin on public.profiles
  for update to authenticated
  using (
    (select public.is_global_admin())
    or (id <> (select auth.uid()) and ville && (select public.my_admin_villes()))
  )
  with check (
    (select public.is_global_admin())
    or (id <> (select auth.uid()) and ville && (select public.my_admin_villes()))
  );

create or replace function public.profiles_guard()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_mine    text[];
  v_added   text[];
  v_removed text[];
begin
  -- Clé de service, éditeur SQL, migrations, super administrateur : rien à vérifier
  if auth.uid() is null or public.is_global_admin() then
    return new;
  end if;

  if new.id is distinct from old.id then
    raise exception 'L''identifiant d''un profil ne change pas' using errcode = 'insufficient_privilege';
  end if;

  if new.id = auth.uid()
     and (new.role is distinct from old.role or new.ville is distinct from old.ville) then
    raise exception 'Un administrateur ne modifie pas ses propres droits' using errcode = 'insufficient_privilege';
  end if;

  v_mine := public.my_admin_villes();

  -- Les villes ajoutées ou retirées doivent être des villes qu'il administre
  -- (« global » n'en fait jamais partie pour un administrateur de ville).
  v_added := array(select unnest(coalesce(new.ville, '{}')) except select unnest(coalesce(old.ville, '{}')));
  v_removed := array(select unnest(coalesce(old.ville, '{}')) except select unnest(coalesce(new.ville, '{}')));
  if not (v_added <@ v_mine and v_removed <@ v_mine) then
    raise exception 'Vous ne pouvez donner ou retirer l''accès qu''aux villes que vous administrez'
      using errcode = 'insufficient_privilege';
  end if;

  -- Le rôle vaut pour toutes les villes de la personne : le changer suppose de
  -- les administrer toutes.
  if new.role is distinct from old.role
     and not (coalesce(old.ville, '{}') <@ v_mine and coalesce(new.ville, '{}') <@ v_mine) then
    raise exception 'Cette personne a aussi accès à des villes que vous n''administrez pas : seul un super administrateur peut changer son rôle'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard
  before update on public.profiles
  for each row execute function public.profiles_guard();

-- Adresses des utilisateurs : mêmes règles que la lecture des profils.
create or replace function public.get_profiles_with_email()
returns table(id uuid, role text, ville text, created_at timestamp with time zone, email character varying)
language plpgsql security definer
set search_path = public
as $$
begin
  return query
  select p.id, p.role, p.ville::text, p.created_at, u.email::varchar
    from public.profiles p
    left join auth.users u on u.id = p.id
   where p.id = auth.uid()
      or public.is_global_admin()
      or p.ville && public.my_admin_villes();
end;
$$;
revoke execute on function public.get_profiles_with_email() from public, anon;
grant execute on function public.get_profiles_with_email() to authenticated;

-- Inviter une personne qui a déjà un compte : on lui ajoute les villes de
-- l'administrateur sans lui donner à voir les autres utilisateurs.
create or replace function public.add_villes_to_user(p_email text, p_villes text[])
returns text
language plpgsql security definer
set search_path = public
as $$
declare
  v_id  uuid;
  v_old text[];
  v_new text[];
begin
  if auth.uid() is null then
    raise exception 'Connexion requise' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(cardinality(p_villes), 0) = 0 then
    raise exception 'Aucune ville à ajouter' using errcode = 'invalid_parameter_value';
  end if;
  if not public.is_global_admin() and not (p_villes <@ public.my_admin_villes()) then
    raise exception 'Vous ne pouvez donner accès qu''aux villes que vous administrez'
      using errcode = 'insufficient_privilege';
  end if;

  select u.id into v_id from auth.users u where lower(u.email) = lower(trim(p_email)) limit 1;
  if v_id is null then
    return 'introuvable';
  end if;

  select coalesce(ville, '{}') into v_old from public.profiles where id = v_id;
  if not found then
    insert into public.profiles (id, role, ville) values (v_id, 'invited', p_villes);
    return 'ajoute';
  end if;

  v_new := array(select distinct unnest(v_old || p_villes));
  if v_new <@ v_old then
    return 'deja_membre';
  end if;

  update public.profiles set ville = v_new where id = v_id;
  return 'ajoute';
end;
$$;
revoke execute on function public.add_villes_to_user(text, text[]) from public, anon;
grant execute on function public.add_villes_to_user(text, text[]) to authenticated;

-- ── Contributions (fiches projet) ──────────────────────────────────────────

-- Lecture : publiées pour tous ; en attente pour leur auteur et les
-- administrateurs de la ville. Appels de fonction directs, sans sous-requête :
-- contrib_update_owner relit la table dans sa clause de contrôle, et une
-- sous-requête ici ferait conclure Postgres à une récursion infinie.
drop policy if exists contrib_read_all on public.contribution_uploads;
drop policy if exists "public read contribution uploads" on public.contribution_uploads;
create policy contrib_select on public.contribution_uploads
  for select to anon, authenticated
  using (
    approved is true
    or created_by = auth.uid()
    or public.is_admin_for_ville(ville)
  );

alter policy contrib_insert_admin on public.contribution_uploads
  with check (public.is_admin_for_ville(ville));

alter policy contrib_insert_non_admin on public.contribution_uploads
  with check (
    approved = false
    and created_by = auth.uid()
    and public.is_contributor_for_ville(ville)
    and not public.is_admin()
  );

alter policy contrib_update_admin on public.contribution_uploads
  using (public.is_admin_for_ville(ville))
  with check (public.is_admin_for_ville(ville));

alter policy contrib_update_owner on public.contribution_uploads
  with check (
    created_by = auth.uid()
    and public.is_contributor_for_ville(ville)
    and approved = (select c.approved from public.contribution_uploads c where c.id = contribution_uploads.id)
  );

alter policy contrib_delete_admin on public.contribution_uploads
  using (public.is_admin_for_ville(ville));

-- ── Documents de concertation ──────────────────────────────────────────────

drop policy if exists "Consultation dossiers - delete (authenticated)" on public.consultation_dossiers;
drop policy if exists dossiers_delete_authenticated on public.consultation_dossiers;
drop policy if exists "Consultation dossiers - insert (authenticated)" on public.consultation_dossiers;
drop policy if exists "auth can insert consultation docs" on public.consultation_dossiers;
drop policy if exists dossiers_insert_authenticated on public.consultation_dossiers;
drop policy if exists "Consultation dossiers - select (authenticated)" on public.consultation_dossiers;
drop policy if exists "Consultation dossiers are viewable by anon" on public.consultation_dossiers;
drop policy if exists "public read consultation docs" on public.consultation_dossiers;
drop policy if exists read_public_consultation_dossiers on public.consultation_dossiers;
drop policy if exists "Consultation dossiers - update (authenticated)" on public.consultation_dossiers;
drop policy if exists dossiers_update_authenticated on public.consultation_dossiers;
-- dossiers_select_all (lecture publique) est conservée.

create policy dossiers_insert_editeur on public.consultation_dossiers
  for insert to authenticated
  with check (public.can_edit_project_docs(contribution_id));

create policy dossiers_update_editeur on public.consultation_dossiers
  for update to authenticated
  using (public.can_edit_project_docs(contribution_id))
  with check (public.can_edit_project_docs(contribution_id));

create policy dossiers_delete_editeur on public.consultation_dossiers
  for delete to authenticated
  using (public.can_edit_project_docs(contribution_id));

-- ── Modules, espaces, catégories, interrupteurs ────────────────────────────

-- Les modules d'une ville sont une décision commerciale : super administrateur
-- seulement (l'écran Modules de l'administration l'est déjà).
drop policy if exists city_modules_insert_auth on public.city_modules;
drop policy if exists city_modules_update_auth on public.city_modules;
drop policy if exists city_modules_delete_auth on public.city_modules;
create policy city_modules_insert_global on public.city_modules
  for insert to authenticated with check (public.is_global_admin());
create policy city_modules_update_global on public.city_modules
  for update to authenticated using (public.is_global_admin()) with check (public.is_global_admin());
create policy city_modules_delete_global on public.city_modules
  for delete to authenticated using (public.is_global_admin());

-- Créer ou supprimer un espace : super administrateur seulement (écran Villes).
drop policy if exists "Admins can insert cities" on public.city_branding;
drop policy if exists "Admins can delete cities" on public.city_branding;
drop policy if exists city_branding_select on public.city_branding;
create policy city_branding_insert_global on public.city_branding
  for insert to authenticated with check (public.is_global_admin());
create policy city_branding_delete_global on public.city_branding
  for delete to authenticated using (public.is_global_admin());

alter policy category_icons_insert_admin on public.category_icons
  with check (public.is_admin_for_ville(ville));
alter policy category_icons_update_admin on public.category_icons
  using (public.is_admin_for_ville(ville))
  with check (public.is_admin_for_ville(ville));
alter policy category_icons_delete_admin on public.category_icons
  using (public.is_admin_for_ville(ville));

-- Les interrupteurs de l'interface valent pour toutes les villes.
alter policy ui_toggles_insert_admin on public.ui_toggles with check (public.is_global_admin());
alter policy ui_toggles_update_admin on public.ui_toggles
  using (public.is_global_admin()) with check (public.is_global_admin());
alter policy ui_toggles_delete_admin on public.ui_toggles using (public.is_global_admin());

-- ── Stockage ───────────────────────────────────────────────────────────────

-- La lecture « true » rendait lisibles les compartiments privés (diagnostic,
-- photos des signalements) à tout compte connecté. Chaque compartiment garde
-- sa propre règle de lecture ; les compartiments publics restent servis par
-- leur adresse publique, qui ne passe pas par ces politiques.
drop policy if exists "Enable read access for all users" on storage.objects;

-- Dépôt anonyme dans « image » : plus aucun écran ne s'en sert (les PDF qui y
-- sont restent lisibles par leur adresse publique).
drop policy if exists "allow anonymous uploads 1nq2cb_0" on storage.objects;

-- Images de marque : seulement pour les villes que l'on administre, comme la
-- suppression (uploads_delete_branding_admin).
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
  );

-- Le compartiment public « uploads » n'accepte de dépôt que d'un membre d'une
-- ville d'Open Projets : un compte d'OpenArrêté ou un compte sans ville ne
-- peut plus s'en servir comme hébergement.
create policy uploads_insert_membres on storage.objects
  as restrictive
  for insert to authenticated
  with check (bucket_id <> 'uploads' or public.has_open_projets_city());

-- ── Icônes et couleurs : des valeurs, jamais du HTML ───────────────────────

-- Ces colonnes finissent dans des attributs class et style, sur la carte
-- publique et dans l'administration. Un contributeur pouvait y glisser du HTML
-- (une icône de chantier se rendait telle quelle sur la carte publique). Le code
-- échappe désormais ces valeurs ; la base refuse en plus tout ce qui n'est pas
-- un nom de classe ou une couleur hexadécimale. Toutes les valeurs présentes le
-- 11/10/2026 respectent déjà ces formes.
alter table public.city_travaux
  add constraint city_travaux_icon_classe check (icon is null or icon ~ '^[A-Za-z0-9 _-]*$');
alter table public.category_icons
  add constraint category_icons_icon_classe check (icon_class is null or icon_class ~ '^[A-Za-z0-9 _-]*$'),
  add constraint category_icons_couleurs check (
    category_styles is null
    or ((not category_styles ? 'color' or category_styles->>'color' ~ '^#[0-9A-Fa-f]{3,8}$')
        and (not category_styles ? 'fillColor' or category_styles->>'fillColor' ~ '^#[0-9A-Fa-f]{3,8}$'))
  );
alter table public.city_modules
  add constraint city_modules_icon_classe check (icon_class is null or icon_class ~ '^[A-Za-z0-9 _-]*$');
alter table public.participer_categories
  add constraint participer_categories_icon_classe check (icon_class is null or icon_class ~ '^[A-Za-z0-9 _-]*$');
alter table public.layers
  add constraint layers_icon_classe check (icon is null or icon ~ '^[A-Za-z0-9 _-]*$');
alter table public.basemaps_v2
  add constraint basemaps_v2_icon_classe check (icon is null or icon ~ '^[A-Za-z0-9 _-]*$');
alter table public.city_branding
  add constraint city_branding_couleur check (primary_color is null or primary_color ~ '^#[0-9A-Fa-f]{3,8}$');
