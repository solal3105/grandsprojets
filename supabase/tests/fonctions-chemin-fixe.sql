-- Essais du chemin de recherche fixe des fonctions de droits (migration 20261110200000).
--
-- À rejouer après toute retouche de is_admin(), can_manage_city_travaux(),
-- is_contributor_for_ville() ou travaux_before_insert(). Base locale jetable,
-- jamais le projet Supabase.
--
--   createdb essai_chemin
--   psql -v ON_ERROR_STOP=1 -d essai_chemin \
--     -f supabase/tests/socle-local.sql \
--     -f supabase/tests/socle-travaux-local.sql \
--     -f supabase/tests/fonctions-chemin-fixe.sql
--   dropdb essai_chemin
--
-- Toutes les lignes doivent afficher OK ; le script s'arrête en erreur sinon.
-- Il applique lui-même la migration entre ses deux temps : les mêmes questions
-- sont posées avant et après, et les réponses doivent être les mêmes.

\ir outils-essais.sql
\ir jeu-profils.sql

-- Ce que chaque compte obtient des trois fonctions et de la table des chantiers,
-- en une ligne de texte par compte. Jouée avant puis après la migration.
create function public.zz_releve() returns table (compte text, reponses text)
language sql as $$
  select c.nom,
         'admin=' || public.zz_lit(c.role, c.id, 'select public.is_admin()')
      || ' gere_a=' || public.zz_lit(c.role, c.id, 'select public.can_manage_city_travaux(''a'')')
      || ' gere_b=' || public.zz_lit(c.role, c.id, 'select public.can_manage_city_travaux(''b'')')
      || ' equipe_a=' || public.zz_lit(c.role, c.id, 'select public.is_contributor_for_ville(''a'')')
      || ' equipe_b=' || public.zz_lit(c.role, c.id, 'select public.is_contributor_for_ville(''b'')')
      || ' lit=' || public.zz_lit(c.role, c.id, 'select count(*) from public.city_travaux')
    from (values
      ('super administrateur',        'authenticated', '00000000-0000-4000-8000-000000000001'::uuid),
      ('administrateur de a',         'authenticated', '00000000-0000-4000-8000-00000000000a'::uuid),
      ('administrateur de a et b',    'authenticated', '00000000-0000-4000-8000-0000000000ab'::uuid),
      ('administrateur de b',         'authenticated', '00000000-0000-4000-8000-00000000000b'::uuid),
      ('administrateur sans ville',   'authenticated', '00000000-0000-4000-8000-0000000000a0'::uuid),
      ('contributeur de a',           'authenticated', '00000000-0000-4000-8000-0000000001a0'::uuid),
      ('contributeur sans ville',     'authenticated', '00000000-0000-4000-8000-000000000100'::uuid),
      ('compte sans profil',          'authenticated', '00000000-0000-4000-8000-00000000dead'::uuid),
      ('visiteur',                    'anon',          null::uuid)
    ) as c(nom, role, id);
$$;

-- Deux chantiers pour que les lectures aient quelque chose à compter.
insert into public.city_travaux (ville, name, approved) values ('a', 'Rue publiée', true), ('b', 'Rue en attente', false);
update public.city_travaux set approved = true where name = 'Rue publiée';

-- ═════════════════════════════════════════════════════════════════════════════
-- TEMPS 1 : avant la migration
-- ═════════════════════════════════════════════════════════════════════════════

create table public.zz_avant as select * from public.zz_releve();

select zz_check('Avant : le contributeur de a dépose un chantier en a',
  zz_as('authenticated', :inv_a, $$insert into public.city_travaux (ville, name, approved, created_by) values ('a', 'Dépôt avant', true, '00000000-0000-4000-8000-000000000001')$$),
  'ok 1');
select zz_check('... sous son nom et en attente, quoi qu''il ait envoyé',
  (select created_by || ' ' || approved from public.city_travaux where name = 'Dépôt avant'),
  '00000000-0000-4000-8000-0000000001a0 false');
select zz_check('Avant : il ne dépose pas en b',
  zz_as('authenticated', :inv_a, $$insert into public.city_travaux (ville, name) values ('b', 'Refusé avant')$$),
  'new row violates row-level security policy%');
select zz_check('Avant : l''administrateur de a publie son propre dépôt',
  zz_as('authenticated', :adm_a, $$insert into public.city_travaux (ville, name, approved) values ('a', 'Publié avant', true)$$),
  'ok 1');
select zz_check('... et il reste publié',
  (select approved::text from public.city_travaux where name = 'Publié avant'), 'true');

-- ═════════════════════════════════════════════════════════════════════════════
\ir ../migrations/20261110200000_fonctions_chemin_fixe.sql
-- TEMPS 2 : après la migration
-- ═════════════════════════════════════════════════════════════════════════════

select zz_check('Le réglage est posé sur ' || p.proname,
  coalesce(array_to_string(p.proconfig, ','), '(aucun)'), 'search_path=""')
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and p.proname in ('is_admin', 'can_manage_city_travaux', 'is_contributor_for_ville', 'travaux_before_insert')
 order by p.proname;

select zz_check('Elles s''exécutent toujours avec les droits de leur propriétaire',
  (select count(*)::text from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prosecdef
      and p.proname in ('is_admin', 'can_manage_city_travaux', 'is_contributor_for_ville', 'travaux_before_insert')),
  '4');
select zz_check('Les trois rôles de l''API peuvent toujours les appeler',
  (select count(*)::text from pg_proc p cross join (values ('anon'), ('authenticated'), ('service_role')) r(nom)
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('is_admin', 'can_manage_city_travaux', 'is_contributor_for_ville', 'travaux_before_insert')
      and has_function_privilege(r.nom, p.oid, 'execute')),
  '12');

-- Les mêmes questions, les mêmes réponses, compte par compte. Les deux dépôts du
-- temps 1 se sont ajoutés entre-temps : on les retire le temps de comparer.
create table public.zz_depots as select * from public.city_travaux where name in ('Dépôt avant', 'Publié avant');
delete from public.city_travaux where name in ('Dépôt avant', 'Publié avant');
select zz_check('Mêmes réponses qu''avant pour : ' || a.compte, r.reponses, a.reponses)
  from public.zz_avant a join public.zz_releve() r using (compte)
 order by a.compte;
select zz_check('Les neuf comptes ont été comparés', (select count(*)::text from public.zz_avant), '9');

-- Les réponses attendues elles-mêmes, pour que « pareil qu'avant » ne cache pas
-- un socle faux.
select zz_check('Le super administrateur : administrateur, gère a et b, lit tout',
  (select reponses from public.zz_releve() where compte = 'super administrateur'),
  'admin=true gere_a=true gere_b=true equipe_a=true equipe_b=true lit=2');
select zz_check('L''administrateur de a : gère a, pas b, lit le chantier publié et ceux de a',
  (select reponses from public.zz_releve() where compte = 'administrateur de a'),
  'admin=true gere_a=true gere_b=false equipe_a=true equipe_b=false lit=1');
select zz_check('L''administrateur de b lit aussi le chantier en attente de b',
  (select reponses from public.zz_releve() where compte = 'administrateur de b'),
  'admin=true gere_a=false gere_b=true equipe_a=false equipe_b=true lit=2');
select zz_check('Le contributeur de a : équipe de a, ne gère rien',
  (select reponses from public.zz_releve() where compte = 'contributeur de a'),
  'admin=false gere_a=false gere_b=false equipe_a=true equipe_b=false lit=1');
select zz_check('Le compte sans profil n''a aucun droit',
  (select reponses from public.zz_releve() where compte = 'compte sans profil'),
  'admin=(rien) gere_a=false gere_b=false equipe_a=false equipe_b=false lit=1');
select zz_check('Le visiteur ne lit que le chantier publié',
  (select reponses from public.zz_releve() where compte = 'visiteur'),
  'admin=(rien) gere_a=false gere_b=false equipe_a=false equipe_b=false lit=1');

-- Le dépôt et la publication, comme au temps 1.
select zz_check('Après : le contributeur de a dépose un chantier en a',
  zz_as('authenticated', :inv_a, $$insert into public.city_travaux (ville, name, approved, created_by) values ('a', 'Dépôt après', true, '00000000-0000-4000-8000-000000000001')$$),
  'ok 1');
select zz_check('... sous son nom et en attente, quoi qu''il ait envoyé',
  (select created_by || ' ' || approved from public.city_travaux where name = 'Dépôt après'),
  '00000000-0000-4000-8000-0000000001a0 false');
select zz_check('Après : il ne dépose pas en b',
  zz_as('authenticated', :inv_a, $$insert into public.city_travaux (ville, name) values ('b', 'Refusé après')$$),
  'new row violates row-level security policy%');
select zz_check('Après : l''administrateur de a publie son propre dépôt',
  zz_as('authenticated', :adm_a, $$insert into public.city_travaux (ville, name, approved) values ('a', 'Publié après', true)$$),
  'ok 1');
select zz_check('... et il reste publié',
  (select approved::text from public.city_travaux where name = 'Publié après'), 'true');
select zz_check('L''administrateur de a publie le dépôt du contributeur',
  zz_as('authenticated', :adm_a, $$update public.city_travaux set approved = true where name = 'Dépôt après'$$), 'ok 1');
select zz_check('L''administrateur de b ne le retire pas',
  zz_as('authenticated', :adm_b, $$delete from public.city_travaux where name = 'Dépôt après'$$), 'ok 0');
select zz_check('L''administrateur de a le retire',
  zz_as('authenticated', :adm_a, $$delete from public.city_travaux where name = 'Dépôt après'$$), 'ok 1');

-- La réponse ne dépend plus de la session : une table du même nom, créée par le
-- compte dans sa propre session, n'est pas lue à la place de public.profiles.
grant temporary on database :DBNAME to authenticated;
select zz_check('Le contributeur crée une table temporaire nommée profiles',
  zz_as('authenticated', :inv_a, $$create temporary table profiles as select '00000000-0000-4000-8000-0000000001a0'::uuid as id, 'admin'::text as role, '{global}'::text[] as ville$$),
  'ok 1');
select zz_check('is_admin() lit toujours public.profiles',
  zz_lit('authenticated', :inv_a, 'select public.is_admin()'), 'false');
select zz_check('can_manage_city_travaux() aussi',
  zz_lit('authenticated', :inv_a, $$select public.can_manage_city_travaux('b')$$), 'false');
select zz_check('is_contributor_for_ville() aussi',
  zz_lit('authenticated', :inv_a, $$select public.is_contributor_for_ville('b')$$), 'false');
select zz_check('... et son dépôt reste en attente',
  zz_as('authenticated', :inv_a, $$insert into public.city_travaux (ville, name, approved) values ('a', 'Dépôt avec table temporaire', true)$$),
  'ok 1');
select zz_check('... (vérifié en base)',
  (select approved::text from public.city_travaux where name = 'Dépôt avec table temporaire'), 'false');

\ir resultat-essais.sql
