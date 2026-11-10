-- Essais des droits sur profiles (migrations 20261110100000 et 20261110110000).
--
-- À rejouer après toute modification de la garde profiles_rights_guard, de
-- set_profile_role() ou des règles d'accès de profiles. Les essais ÉCRIVENT :
-- ils se jouent sur une base locale jetable, jamais sur le projet Supabase.
--
--   createdb essai_profils
--   psql -v ON_ERROR_STOP=1 -d essai_profils \
--     -f supabase/tests/socle-local.sql \
--     -f supabase/migrations/20261110100000_profils_droits_gardes.sql \
--     -f supabase/tests/profils-droits.sql
--   dropdb essai_profils
--
-- Toutes les lignes doivent afficher OK ; le script s'arrête en erreur sinon.
-- Il applique lui-même la seconde migration entre ses deux temps : d'abord la
-- garde seule, l'ancienne règle d'écriture encore en place (l'état où la console
-- d'avant doit continuer de marcher), puis l'écriture directe fermée.

\set QUIET on
set client_min_messages = warning;

create table public.zz_essais (n int generated always as identity, cas text, attendu text, obtenu text, ok boolean);

-- Joue une instruction au nom d'un compte, comme le fait l'API : rôle Postgres
-- et jeton. Rend 'ok <lignes touchées>' ou le message de l'erreur.
create function public.zz_as(p_role text, p_user uuid, p_sql text) returns text
language plpgsql as $$
declare
  v text;
  n bigint;
begin
  begin
    if p_role in ('anon', 'authenticated', 'service_role') then
      perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', p_role)::text, true);
    end if;
    perform set_config('role', p_role, true);
    execute p_sql;
    get diagnostics n = row_count;
    v := 'ok ' || n;
    perform set_config('role', 'none', true);
  exception when others then
    v := sqlerrm;
  end;
  perform set_config('request.jwt.claims', '', true);
  return v;
end;
$$;

create function public.zz_check(p_cas text, p_obtenu text, p_attendu text) returns void
language sql as $$
  insert into public.zz_essais (cas, attendu, obtenu, ok)
  values (p_cas, p_attendu, p_obtenu, coalesce(p_obtenu like p_attendu, false));
$$;

-- ── Jeu d'essai ──────────────────────────────────────────────────────────────
\set glob    '''00000000-0000-4000-8000-000000000001'''
\set glob_a  '''00000000-0000-4000-8000-000000000002'''
\set adm_a   '''00000000-0000-4000-8000-00000000000a'''
\set adm_ab  '''00000000-0000-4000-8000-0000000000ab'''
\set adm_b   '''00000000-0000-4000-8000-00000000000b'''
\set adm_0   '''00000000-0000-4000-8000-0000000000a0'''
\set inv_a   '''00000000-0000-4000-8000-0000000001a0'''
\set inv_ab  '''00000000-0000-4000-8000-0000000001ab'''
\set inv_0   '''00000000-0000-4000-8000-000000000100'''
\set nouveau '''00000000-0000-4000-8000-000000000999'''
\set inconnu '''00000000-0000-4000-8000-00000000dead'''

insert into auth.users (id, email) values
  (:glob,   'glob@test.invalid'),   (:glob_a, 'glob-a@test.invalid'),
  (:adm_a,  'adm-a@test.invalid'),  (:adm_ab, 'adm-ab@test.invalid'),
  (:adm_b,  'adm-b@test.invalid'),  (:adm_0,  'adm-0@test.invalid'),
  (:inv_a,  'inv-a@test.invalid'),  (:inv_ab, 'inv-ab@test.invalid'),
  (:inv_0,  'inv-0@test.invalid');

update public.profiles set role = 'admin',   ville = '{global}'   where id = :glob;
update public.profiles set role = 'admin',   ville = '{global,a}' where id = :glob_a;
update public.profiles set role = 'admin',   ville = '{a}'        where id = :adm_a;
update public.profiles set role = 'admin',   ville = '{a,b}'      where id = :adm_ab;
update public.profiles set role = 'admin',   ville = '{b}'        where id = :adm_b;
update public.profiles set role = 'admin',   ville = '{}'         where id = :adm_0;
update public.profiles set role = 'invited', ville = '{a}'        where id = :inv_a;
update public.profiles set role = 'invited', ville = '{a,b}'      where id = :inv_ab;
-- inv_0 reste tel que l'inscription l'a créé : invited, sans espace.

-- ═════════════════════════════════════════════════════════════════════════════
-- TEMPS 1 : la garde seule, l'ancienne règle d'écriture encore en place
-- ═════════════════════════════════════════════════════════════════════════════

-- Le défaut lui-même : un administrateur de ville se donne 'global'.
select zz_check('L''admin de ville ne se donne pas global',
  zz_as('authenticated', :adm_a, format('update profiles set ville = ville || ''{global}'' where id = %L', :adm_a)),
  'Vous ne pouvez pas changer vos propres droits%');
select zz_check('... et son profil n''a pas bougé',
  (select ville::text from profiles where id = :adm_a), '{a}');
select zz_check('L''admin de ville ne change pas son propre rôle',
  zz_as('authenticated', :adm_a, format('update profiles set role = ''invited'' where id = %L', :adm_a)),
  'Vous ne pouvez pas changer vos propres droits%');
select zz_check('Il ne donne pas global à un autre compte',
  zz_as('authenticated', :adm_a, format('update profiles set ville = ''{a,global}'' where id = %L', :inv_a)),
  'Seul un super administrateur peut changer les espaces%');
select zz_check('Il n''ajoute pas un espace à un compte',
  zz_as('authenticated', :adm_a, format('update profiles set ville = ''{a,b}'' where id = %L', :inv_a)),
  'Seul un super administrateur peut changer les espaces%');
select zz_check('Il ne retire pas un espace à un compte',
  zz_as('authenticated', :adm_a, format('update profiles set ville = ''{}'' where id = %L', :inv_a)),
  'Seul un super administrateur peut changer les espaces%');
select zz_check('Il ne rattache pas un profil à un autre compte',
  zz_as('authenticated', :adm_a, format('update profiles set id = %L where id = %L', :inconnu, :inv_a)),
  'Un profil ne peut pas être rattaché%');
select zz_check('Il ne donne pas un rôle inconnu',
  zz_as('authenticated', :adm_a, format('update profiles set role = ''root'' where id = %L', :inv_a)),
  'Le rôle demandé est inconnu%');

-- La console d'avant (mise à jour directe du rôle) marche toujours dans son espace.
select zz_check('Console d''avant : promouvoir un contributeur de son espace',
  zz_as('authenticated', :adm_a, format('update profiles set role = ''admin'' where id = %L', :inv_a)), 'ok 1');
select zz_check('... le rôle a changé',
  (select role from profiles where id = :inv_a), 'admin');
select zz_check('Console d''avant : le rétrograder',
  zz_as('authenticated', :adm_a, format('update profiles set role = ''invited'' where id = %L', :inv_a)), 'ok 1');

-- Les comptes qui relèvent du super administrateur.
select zz_check('Compte présent aussi dans un espace voisin : refusé',
  zz_as('authenticated', :adm_a, format('update profiles set role = ''admin'' where id = %L', :inv_ab)),
  'Ce compte a aussi accès à un espace que vous n''administrez pas%');
select zz_check('... accepté pour qui administre tous ses espaces',
  zz_as('authenticated', :adm_ab, format('update profiles set role = ''admin'' where id = %L', :inv_ab)), 'ok 1');
select zz_check('Super administrateur présent dans son espace : refusé',
  zz_as('authenticated', :adm_a, format('update profiles set role = ''invited'' where id = %L', :glob_a)),
  'Ce compte est super administrateur%');
select zz_check('Compte sans espace : refusé',
  zz_as('authenticated', :adm_a, format('update profiles set role = ''admin'' where id = %L', :inv_0)),
  'Ce compte n''est rattaché à aucun espace%');
select zz_check('Administrateur sans espace : ne peut rien changer',
  zz_as('authenticated', :adm_0, format('update profiles set role = ''admin'' where id = %L', :inv_a)),
  'Ce compte a aussi accès à un espace que vous n''administrez pas%');

-- Les autres comptes : la règle d'accès d'origine les arrête déjà (aucune ligne touchée).
select zz_check('Contributeur : aucune écriture, pas même sur son profil',
  zz_as('authenticated', :inv_a, format('update profiles set role = ''admin'' where id = %L', :inv_a)), 'ok 0');
select zz_check('... son rôle n''a pas bougé',
  (select role from profiles where id = :inv_a), 'invited');
select zz_check('Anonyme : aucune écriture',
  zz_as('anon', null, format('update profiles set role = ''admin'' where id = %L', :inv_a)), 'permission denied%');
select zz_check('Admin de ville : pas de création de profil',
  zz_as('authenticated', :adm_a, format('insert into profiles (id, role, ville) values (%L, ''admin'', ''{global}'')', :inconnu)),
  'Seul un super administrateur peut créer ou supprimer un profil%');
select zz_check('Admin de ville : pas de suppression de profil',
  zz_as('authenticated', :adm_a, format('delete from profiles where id = %L', :inv_a)), 'ok 0');

-- Le super administrateur.
select zz_check('Super admin : change le rôle de tout autre compte',
  zz_as('authenticated', :glob, format('update profiles set role = ''admin'' where id = %L', :inv_0)), 'ok 1');
select zz_check('Super admin : change les espaces d''un compte',
  zz_as('authenticated', :glob, format('update profiles set role = ''invited'', ville = ''{b}'' where id = %L', :inv_0)), 'ok 1');
select zz_check('Super admin : nomme un autre super admin',
  zz_as('authenticated', :glob, format('update profiles set ville = ''{global}'' where id = %L', :adm_b)), 'ok 1');
select zz_check('Super admin : pas ses propres droits non plus',
  zz_as('authenticated', :glob, format('update profiles set role = ''invited'' where id = %L', :glob)),
  'Vous ne pouvez pas changer vos propres droits%');

-- La porte de la console : set_profile_role().
select zz_check('Porte : promouvoir un contributeur de son espace',
  zz_as('authenticated', :adm_a, format('select set_profile_role(%L, ''admin'')', :inv_a)), 'ok 1');
select zz_check('... le rôle a changé',
  (select role from profiles where id = :inv_a), 'admin');
select zz_check('... et le journal dit qui, quoi, par où',
  (select format('%s %s>%s par %s via %s', action, old_role, new_role, changed_by_email, changed_via)
     from profiles_log where profile_id = :inv_a order by id desc limit 1),
  'update invited>admin par adm-a@test.invalid via authenticated');
select zz_check('Porte : rétrograder',
  zz_as('authenticated', :adm_a, format('select set_profile_role(%L, ''invited'')', :inv_a)), 'ok 1');
select zz_check('Porte : pas son propre rôle',
  zz_as('authenticated', :adm_a, format('select set_profile_role(%L, ''invited'')', :adm_a)),
  'Vous ne pouvez pas changer vos propres droits%');
select zz_check('Porte : pas un compte d''un espace voisin',
  zz_as('authenticated', :adm_a, format('select set_profile_role(%L, ''invited'')', :adm_ab)),
  'Ce compte a aussi accès à un espace que vous n''administrez pas%');
select zz_check('Porte : fermée à un contributeur',
  zz_as('authenticated', :inv_a, format('select set_profile_role(%L, ''admin'')', :inv_a)),
  'Seul un administrateur peut changer les droits%');
select zz_check('Porte : fermée à un anonyme',
  zz_as('anon', null, format('select set_profile_role(%L, ''admin'')', :inv_a)), 'permission denied for function%');
select zz_check('Porte : rôle inconnu',
  zz_as('authenticated', :adm_a, format('select set_profile_role(%L, ''root'')', :inv_a)), 'Le rôle demandé est inconnu%');
select zz_check('Porte : compte introuvable',
  zz_as('authenticated', :adm_a, format('select set_profile_role(%L, ''admin'')', :inconnu)), 'Ce compte est introuvable%');
select zz_check('Porte : pas faite pour la clé de service',
  zz_as('service_role', null, format('select set_profile_role(%L, ''admin'')', :inv_a)), 'Connexion requise%');

-- Les chemins sans utilisateur restent libres : invitation, SSO, inscription, suppression.
select zz_check('Clé de service (invite-user) : ajoute un espace à un profil',
  zz_as('service_role', null, format('insert into profiles (id, role, ville) values (%L, ''invited'', ''{a,b}'') on conflict (id) do update set role = excluded.role, ville = excluded.ville', :inv_a)), 'ok 1');
select zz_check('Inscription : le profil naît, contributeur',
  zz_as('supabase_auth_admin', null, format('insert into auth.users (id, email) values (%L, ''nouveau@test.invalid'')', :nouveau)), 'ok 1');
select zz_check('... et le journal le note',
  (select format('%s %s %s', action, new_role, profile_email) from profiles_log where profile_id = :nouveau), 'insert invited nouveau@test.invalid');
select zz_check('Suppression d''un compte : le profil suit, sans erreur',
  zz_as('none', null, format('delete from auth.users where id = %L', :nouveau)), 'ok 1');
select zz_check('... et le journal garde la trace',
  (select count(*)::text from profiles_log where profile_id = :nouveau and action = 'delete'), '1');

-- Le journal ne se lit que par un super administrateur et ne s'écrit par personne.
select zz_check('Journal : invisible pour un admin de ville',
  zz_as('authenticated', :adm_a, 'create temp table zz_vu on commit drop as select * from profiles_log'), 'ok 0');
select zz_check('Journal : lisible par un super admin',
  zz_as('authenticated', :glob, 'create temp table zz_vu2 on commit drop as select * from profiles_log limit 3'), 'ok 3');
select zz_check('Journal : fermé à un anonyme',
  zz_as('anon', null, 'select 1 from profiles_log'), 'permission denied%');
select zz_check('Journal : personne n''y écrit',
  zz_as('authenticated', :glob, format('insert into profiles_log (profile_id, action, changed_via) values (%L, ''update'', ''x'')', :glob)),
  'permission denied%');

-- ═════════════════════════════════════════════════════════════════════════════
-- TEMPS 2 : l'écriture directe fermée
-- ═════════════════════════════════════════════════════════════════════════════
\ir ../migrations/20261110110000_profils_ecriture_directe_fermee.sql

update public.profiles set role = 'invited', ville = '{a}' where id = :inv_a;

select zz_check('Fermé : la mise à jour directe d''un admin de ville est refusée',
  zz_as('authenticated', :adm_a, format('update profiles set role = ''admin'' where id = %L', :inv_a)), 'permission denied for table profiles');
select zz_check('Fermé : celle d''un super admin aussi',
  zz_as('authenticated', :glob, format('update profiles set role = ''admin'' where id = %L', :inv_a)), 'permission denied for table profiles');
select zz_check('... le rôle n''a pas bougé',
  (select role from profiles where id = :inv_a), 'invited');
select zz_check('Fermé : la porte marche pour un admin de ville',
  zz_as('authenticated', :adm_a, format('select set_profile_role(%L, ''admin'')', :inv_a)), 'ok 1');
select zz_check('Fermé : la porte garde ses refus',
  zz_as('authenticated', :adm_a, format('select set_profile_role(%L, ''invited'')', :adm_a)),
  'Vous ne pouvez pas changer vos propres droits%');
select zz_check('Fermé : la porte marche pour un super admin',
  zz_as('authenticated', :glob, format('select set_profile_role(%L, ''invited'')', :inv_a)), 'ok 1');
select zz_check('Fermé : la clé de service écrit toujours',
  zz_as('service_role', null, format('update profiles set ville = ''{a,b}'' where id = %L', :inv_a)), 'ok 1');
select zz_check('Fermé : chacun lit toujours son profil',
  zz_as('authenticated', :inv_a, 'create temp table zz_moi on commit drop as select * from profiles'), 'ok 1');
select zz_check('Fermé : un admin lit toujours les profils',
  zz_as('authenticated', :adm_a, 'create temp table zz_tous on commit drop as select * from profiles'), 'ok 9');

-- ── Résultat ─────────────────────────────────────────────────────────────────
\set QUIET off
\pset footer off
select n, case when ok then 'OK' else 'ÉCHEC' end as resultat, cas,
       case when ok then '' else 'attendu : ' || attendu || ' | obtenu : ' || coalesce(obtenu, '(rien)') end as detail
  from public.zz_essais order by n;
select count(*) as essais, count(*) filter (where ok) as reussis from public.zz_essais;

do $$
begin
  if exists (select 1 from public.zz_essais where not ok) then
    raise exception 'Des essais échouent : voir les lignes ÉCHEC ci-dessus.';
  end if;
end $$;
