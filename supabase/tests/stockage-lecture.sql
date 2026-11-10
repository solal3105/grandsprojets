-- Essais de la lecture du stockage (migration 20261110130000).
--
-- À rejouer après toute modification des règles de storage.objects. Base
-- locale jetable, jamais le projet Supabase.
--
--   createdb essai_stockage
--   psql -v ON_ERROR_STOP=1 -d essai_stockage \
--     -f supabase/tests/socle-local.sql \
--     -f supabase/tests/socle-stockage-local.sql \
--     -f supabase/tests/stockage-lecture.sql
--   dropdb essai_stockage
--
-- Toutes les lignes doivent afficher OK ; le script s'arrête en erreur sinon.
-- Il applique lui-même la migration entre ses deux temps : d'abord l'état
-- d'avant, où le défaut se constate, puis une lecture par compartiment.

\ir outils-essais.sql
\ir jeu-profils.sql

\set espace1  '''11111111-1111-4111-8111-111111111111'''
\set espace2  '''22222222-2222-4222-8222-222222222222'''
\set dossier1 '''aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'''
\set dossier2 '''bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'''

-- Chantiers : inv_a est membre de l'espace 1, adm_b de l'espace 2.
insert into public.zz_op_membres values (:inv_a, :espace1), (:adm_b, :espace2);
insert into public.zz_op_dossiers_visibles values (:adm_b, :dossier2);

-- Un fichier par cas, nommé d'un mot court dans les résultats attendus.
create table public.zz_fichiers (mot text primary key, bucket_id text, name text);
insert into public.zz_fichiers values
  ('diag-a',     'diagnostic',              'a/layers/couche.geojson.gz'),
  ('diag-b',     'diagnostic',              'b/figures/carte.jpg'),
  ('photo',      'participer-photos',       'a/photo.webp'),
  ('image',      'image',                   'urbanisme/dossier.pdf'),
  ('signature',  'signatures',              'equipe.png'),
  ('projet',     'uploads',                 'geojson/projects/projet.geojson'),
  ('vieille',    'uploads',                 'diagnostic/a/ancienne-couche.geojson'),
  ('travaux',    'travaux-geojson',         'a/travaux.json'),
  ('chantier-1', 'op-chantier-documents',   '11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/piece.pdf'),
  ('chantier-2', 'op-chantier-documents',   '22222222-2222-4222-8222-222222222222/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/piece.pdf'),
  ('modele-1',   'op-chantier-referentiel', '11111111-1111-4111-8111-111111111111/modele.pdf');
insert into storage.objects (bucket_id, name) select bucket_id, name from public.zz_fichiers;

\set vus    '$q$select string_agg(f.mot, '' '' order by f.mot) from storage.objects o join zz_fichiers f using (bucket_id, name)$q$'
\set public '''projet travaux vieille'''

-- ═════════════════════════════════════════════════════════════════════════════
-- TEMPS 1 : avant la migration, le défaut
-- ═════════════════════════════════════════════════════════════════════════════

select zz_check('Avant : un compte sans espace lit le diagnostic de toutes les villes et les photos',
  zz_lit('authenticated', :inv_0, :vus), 'diag-a diag-b image modele-1 photo projet signature travaux vieille');
select zz_check('Avant : un contributeur aussi, avec les fichiers de son espace Chantiers',
  zz_lit('authenticated', :inv_a, :vus), 'chantier-1 diag-a diag-b image modele-1 photo projet signature travaux vieille');
select zz_check('Avant : sans compte, on dépose dans image',
  zz_as('anon', null, $$insert into storage.objects (bucket_id, name) values ('image', 'depot-anonyme.bin')$$), 'ok 1');
delete from storage.objects where name = 'depot-anonyme.bin';
select zz_check('Avant : sans compte, toute lecture échoue déjà sur une fonction de Chantiers',
  zz_lit('anon', null, :vus), 'permission denied for function op_chantier_mes_espaces');

\ir ../migrations/20261110130000_stockage_lecture_par_compartiment.sql

-- ═════════════════════════════════════════════════════════════════════════════
-- TEMPS 2 : une lecture par compartiment
-- ═════════════════════════════════════════════════════════════════════════════

-- Les compartiments privés d'Open Projets.
select zz_check('Compte sans espace : plus que les compartiments à lecture publique',
  zz_lit('authenticated', :inv_0, :vus), :public);
select zz_check('Admin sans espace : pareil',
  zz_lit('authenticated', :adm_0, :vus), :public);
select zz_check('Admin de la ville a : le diagnostic de sa ville, pas celui de b, pas les photos',
  zz_lit('authenticated', :adm_a, :vus), 'diag-a ' || :public);
select zz_check('Admin des villes a et b : le diagnostic des deux',
  zz_lit('authenticated', :adm_ab, :vus), 'diag-a diag-b ' || :public);
-- Un super administrateur est aussi administrateur de Chantiers, et la règle
-- op_chantier_fichiers_select lui ouvre tout sans regarder le compartiment :
-- il lit donc encore chaque fichier. C'est l'état voulu pour lui.
select zz_check('Super admin : tous les compartiments, comme avant',
  zz_lit('authenticated', :glob, :vus), 'chantier-1 chantier-2 diag-a diag-b image modele-1 photo projet signature travaux vieille');
select zz_check('La clé de service lit tout (photos de Participer comprises)',
  zz_lit('service_role', null, 'select count(*) from storage.objects'), '11');

-- Chantiers : rien ne change.
select zz_check('Chantiers : un membre lit toujours les fichiers de son espace, et son référentiel',
  zz_lit('authenticated', :inv_a, :vus), 'chantier-1 modele-1 ' || :public);
select zz_check('Chantiers : un membre d''un autre espace lit les siens, pas ceux du voisin',
  zz_lit('authenticated', :adm_b, :vus), 'chantier-2 diag-b ' || :public);
select zz_check('Chantiers : un compte hors de tout espace ne lit aucun de ses fichiers',
  zz_lit('authenticated', :adm_a, $$select count(*) from storage.objects where bucket_id like 'op-chantier-%'$$), '0');

-- Les dépôts.
select zz_check('Sans compte : plus de dépôt dans image',
  zz_as('anon', null, $$insert into storage.objects (bucket_id, name) values ('image', 'depot-anonyme.bin')$$),
  'new row violates row-level security policy for table "objects"');
select zz_check('Avec un compte : pas de dépôt dans image non plus',
  zz_as('authenticated', :adm_a, $$insert into storage.objects (bucket_id, name) values ('image', 'depot.bin')$$),
  'new row violates row-level security policy for table "objects"');
select zz_check('Admin de a : dépose toujours dans le diagnostic de sa ville',
  zz_as('authenticated', :adm_a, $$insert into storage.objects (bucket_id, name) values ('diagnostic', 'a/layers/nouvelle.geojson.gz')$$), 'ok 1');
select zz_check('... et relit ce qu''il vient de déposer',
  zz_lit('authenticated', :adm_a, $$select count(*) from storage.objects where name = 'a/layers/nouvelle.geojson.gz'$$), '1');
select zz_check('Admin de a : ne dépose pas dans le diagnostic de b',
  zz_as('authenticated', :adm_a, $$insert into storage.objects (bucket_id, name) values ('diagnostic', 'b/layers/intruse.geojson.gz')$$),
  'new row violates row-level security policy for table "objects"');

-- Les tailles.
select zz_check('Tous les compartiments ont une taille maximale',
  (select count(*)::text from storage.buckets where file_size_limit is null), '0');
select zz_check('Les limites déjà posées ne sont pas touchées',
  (select string_agg(id || '=' || file_size_limit, ' ' order by id) from storage.buckets where id in ('signatures', 'participer-photos', 'op-chantier-documents')),
  'op-chantier-documents=10485760 participer-photos=4194304 signatures=2097152');

-- Les règles : la règle générale et le dépôt sans compte ont disparu.
select zz_check('Plus aucune règle de lecture sans condition',
  (select count(*)::text from pg_policies where schemaname = 'storage' and tablename = 'objects' and cmd = 'SELECT' and permissive = 'PERMISSIVE' and qual = 'true'), '0');
select zz_check('Plus de règle de dépôt ouverte à tous',
  (select count(*)::text from pg_policies where schemaname = 'storage' and tablename = 'objects' and cmd = 'INSERT' and roles::text like '%public%'), '0');

\ir resultat-essais.sql
