-- Essais de la lecture des comptes (migration 20261110120000).
--
-- À rejouer après toute modification de can_read_profile(), de la règle de
-- lecture de profiles, de get_profiles_with_email() ou de profils_etat_acces().
-- Base locale jetable, jamais le projet Supabase.
--
--   createdb essai_lecture
--   psql -v ON_ERROR_STOP=1 -d essai_lecture \
--     -f supabase/tests/socle-local.sql \
--     -f supabase/migrations/20261109110000_invitations_etat_comptes.sql \
--     -f supabase/migrations/20261110100000_profils_droits_gardes.sql \
--     -f supabase/migrations/20261110110000_profils_ecriture_directe_fermee.sql \
--     -f supabase/tests/profils-lecture.sql
--   dropdb essai_lecture
--
-- Toutes les lignes doivent afficher OK ; le script s'arrête en erreur sinon.
-- Il applique lui-même la migration entre ses deux temps : d'abord l'état
-- d'avant, où le défaut se constate, puis la lecture par espace.

\ir outils-essais.sql
\ir jeu-profils.sql

-- Un compte dont le profil a disparu (cas limite de profils_etat_acces).
insert into auth.users (id, email) values (:nouveau, 'sans-profil@test.invalid');
delete from public.profiles where id = :nouveau;

-- Un nom court par compte, pour écrire ce que chacun doit voir.
create table public.zz_noms as
  select id, split_part(email, '@', 1) as nom from auth.users;

-- Une table réglée comme city_branding : sa règle relit profiles avec les
-- droits de l'appelant. Elle doit continuer de reconnaître un administrateur.
create table public.zz_villes (ville text primary key, note text);
insert into public.zz_villes (ville) values ('a'), ('b');
alter table public.zz_villes enable row level security;
create policy zz_villes_select on public.zz_villes for select to authenticated using (true);
create policy zz_villes_update on public.zz_villes for update to authenticated
  using (auth.uid() in (select profiles.id from profiles
                         where profiles.role = 'admin'
                           and (profiles.ville @> array[zz_villes.ville] or profiles.ville @> array['global'])));

\set vus_table   '$q$select string_agg(z.nom, '' '' order by z.nom) from profiles p join zz_noms z using (id)$q$'
\set vus_emails  '$q$select string_agg(z.nom, '' '' order by z.nom) from get_profiles_with_email() e join zz_noms z using (id)$q$'
\set vus_acces   '$q$select string_agg(z.nom, '' '' order by z.nom) from profils_etat_acces() e join zz_noms z using (id)$q$'
\set tous        '''adm-0 adm-a adm-ab adm-b glob glob-a inv-0 inv-a inv-ab'''

-- ═════════════════════════════════════════════════════════════════════════════
-- TEMPS 1 : avant la migration, le défaut
-- ═════════════════════════════════════════════════════════════════════════════

select zz_check('Avant : l''admin de la ville a lit tous les profils',
  zz_lit('authenticated', :adm_a, :vus_table), :tous);
select zz_check('Avant : ... et toutes les adresses',
  zz_lit('authenticated', :adm_a, :vus_emails), :tous);
select zz_check('Avant : ... et toutes les dates de connexion',
  zz_lit('authenticated', :adm_a, :vus_acces), :tous || ' sans-profil');
select zz_check('Avant : un admin sans espace lit tout aussi',
  zz_lit('authenticated', :adm_0, :vus_emails), :tous);

\ir ../migrations/20261110120000_profils_lecture_par_espace.sql

-- ═════════════════════════════════════════════════════════════════════════════
-- TEMPS 2 : la lecture par espace
-- ═════════════════════════════════════════════════════════════════════════════

-- Administrateur d'une ville : les comptes qui partagent un espace avec lui.
select zz_check('Admin a : les profils de son espace',
  zz_lit('authenticated', :adm_a, :vus_table), 'adm-a adm-ab glob-a inv-a inv-ab');
select zz_check('Admin a : les adresses de son espace',
  zz_lit('authenticated', :adm_a, :vus_emails), 'adm-a adm-ab glob-a inv-a inv-ab');
select zz_check('Admin a : les dates de connexion de son espace',
  zz_lit('authenticated', :adm_a, :vus_acces), 'adm-a adm-ab glob-a inv-a inv-ab');
select zz_check('Admin b : les profils de son espace',
  zz_lit('authenticated', :adm_b, :vus_table), 'adm-ab adm-b inv-ab');
select zz_check('Admin b : les adresses de son espace',
  zz_lit('authenticated', :adm_b, :vus_emails), 'adm-ab adm-b inv-ab');
select zz_check('Admin b : les dates de connexion de son espace',
  zz_lit('authenticated', :adm_b, :vus_acces), 'adm-ab adm-b inv-ab');
select zz_check('Admin a et b : les comptes de ses deux espaces',
  zz_lit('authenticated', :adm_ab, :vus_emails), 'adm-a adm-ab adm-b glob-a inv-a inv-ab');
select zz_check('Admin a : pas le profil d''un compte de b, même demandé par son identifiant',
  zz_lit('authenticated', :adm_a, format('select count(*) from profiles where id = %L', :adm_b)), '0');
select zz_check('Admin a : pas le profil d''un compte sans espace',
  zz_lit('authenticated', :adm_a, format('select count(*) from profiles where id = %L', :inv_0)), '0');
select zz_check('Admin a : pas le super administrateur qui n''a pas son espace',
  zz_lit('authenticated', :adm_a, format('select count(*) from profiles where id = %L', :glob)), '0');

-- Administrateur sans espace : lui seul.
select zz_check('Admin sans espace : son profil seulement',
  zz_lit('authenticated', :adm_0, :vus_table), 'adm-0');
select zz_check('Admin sans espace : son adresse seulement',
  zz_lit('authenticated', :adm_0, :vus_emails), 'adm-0');
select zz_check('Admin sans espace : sa date de connexion seulement',
  zz_lit('authenticated', :adm_0, :vus_acces), 'adm-0');

-- Contributeurs : eux seuls, comme avant.
select zz_check('Contributeur : son profil seulement',
  zz_lit('authenticated', :inv_a, :vus_table), 'inv-a');
select zz_check('Contributeur : son adresse seulement',
  zz_lit('authenticated', :inv_a, :vus_emails), 'inv-a');
select zz_check('Contributeur : sa date de connexion seulement',
  zz_lit('authenticated', :inv_a, :vus_acces), 'inv-a');
select zz_check('Contributeur de deux espaces : son profil seulement',
  zz_lit('authenticated', :inv_ab, :vus_table), 'inv-ab');
select zz_check('Contributeur sans espace : son profil seulement',
  zz_lit('authenticated', :inv_0, :vus_table), 'inv-0');

-- Super administrateurs : tout, comme avant.
select zz_check('Super admin : tous les profils',
  zz_lit('authenticated', :glob, :vus_table), :tous);
select zz_check('Super admin : toutes les adresses',
  zz_lit('authenticated', :glob, :vus_emails), :tous);
select zz_check('Super admin : toutes les dates de connexion, compte sans profil compris',
  zz_lit('authenticated', :glob, :vus_acces), :tous || ' sans-profil');
select zz_check('Super admin rattaché aussi à a : tout',
  zz_lit('authenticated', :glob_a, :vus_emails), :tous);

-- Cas limites.
select zz_check('Compte sans profil : sa propre date de connexion',
  zz_lit('authenticated', :nouveau, :vus_acces), 'sans-profil');
select zz_check('Compte sans profil : aucun profil',
  zz_lit('authenticated', :nouveau, :vus_table), '(rien)');
select zz_check('Compte sans profil : aucune adresse',
  zz_lit('authenticated', :nouveau, :vus_emails), '(rien)');
select zz_check('Jeton d''un compte inconnu : rien',
  zz_lit('authenticated', :inconnu, :vus_emails), '(rien)');
select zz_check('Sans compte : aucun profil',
  zz_lit('anon', null, 'select count(*) from profiles'), '0');
select zz_check('Sans compte : la liste des adresses est fermée',
  zz_lit('anon', null, :vus_emails), 'permission denied for function get_profiles_with_email');
select zz_check('Sans compte : les dates de connexion sont fermées',
  zz_lit('anon', null, 'select count(*) from profils_etat_acces()'), 'permission denied for function profils_etat_acces');
select zz_check('Sans compte : la règle elle-même est fermée',
  zz_lit('anon', null, format('select can_read_profile(%L, ''{a}'')', :inv_a)), 'permission denied for function can_read_profile');
select zz_check('La clé de service lit toujours toute la table',
  zz_lit('service_role', null, 'select count(*) from profiles'), '9');

-- Ce qui ne doit pas bouger : les fonctions et les règles qui relisent profiles.
select zz_check('is_admin() reconnaît toujours un admin de ville',
  zz_lit('authenticated', :adm_a, 'select is_admin()'), 'true');
select zz_check('is_admin() refuse toujours un contributeur',
  zz_lit('authenticated', :inv_a, 'select is_admin()'), 'false');
select zz_check('is_global_admin() reconnaît toujours un super admin',
  zz_lit('authenticated', :glob, 'select is_global_admin()'), 'true');
select zz_check('is_global_admin() refuse toujours un admin de ville',
  zz_lit('authenticated', :adm_a, 'select is_global_admin()'), 'false');
select zz_check('Une règle qui relit profiles reconnaît l''admin dans sa ville',
  zz_as('authenticated', :adm_a, 'update zz_villes set note = ''x'' where ville = ''a'''), 'ok 1');
select zz_check('... et pas dans la ville voisine',
  zz_as('authenticated', :adm_a, 'update zz_villes set note = ''x'' where ville = ''b'''), 'ok 0');
select zz_check('... ni un contributeur',
  zz_as('authenticated', :inv_a, 'update zz_villes set note = ''x'' where ville = ''a'''), 'ok 0');
select zz_check('... et toujours le super admin partout',
  zz_as('authenticated', :glob, 'update zz_villes set note = ''y'''), 'ok 2');
select zz_check('La porte de la console marche toujours dans son espace',
  zz_as('authenticated', :adm_a, format('select set_profile_role(%L, ''admin'')', :inv_a)), 'ok 1');
select zz_check('... et garde son refus pour un compte d''un espace voisin',
  zz_as('authenticated', :adm_a, format('select set_profile_role(%L, ''admin'')', :inv_ab)),
  'Ce compte a aussi accès à un espace que vous n''administrez pas%');
select zz_check('... et refuse un compte hors de sa vue, sans le modifier',
  zz_as('authenticated', :adm_a, format('select set_profile_role(%L, ''invited'')', :adm_b)),
  'Ce compte a aussi accès à un espace que vous n''administrez pas%');
select zz_check('... le compte voisin n''a pas bougé',
  (select role from profiles where id = :adm_b), 'admin');

\ir resultat-essais.sql
