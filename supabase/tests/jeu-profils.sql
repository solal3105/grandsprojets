-- Jeu de comptes commun aux essais sur profiles : deux super administrateurs,
-- quatre administrateurs (ville a, villes a et b, ville b, aucune ville) et
-- trois contributeurs (ville a, villes a et b, aucune ville).
-- Inclus par les fichiers d'essais (\ir), après outils-essais.sql.

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
