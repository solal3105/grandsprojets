-- Essais des fichiers du compartiment « uploads » (migration 20261110150000).
--
-- À rejouer après toute modification des règles de storage.objects pour ce
-- compartiment, de can_write_upload() ou de can_write_contribution(). Base
-- locale jetable, jamais le projet Supabase.
--
--   createdb essai_fichiers
--   psql -v ON_ERROR_STOP=1 -d essai_fichiers \
--     -f supabase/tests/socle-local.sql \
--     -f supabase/tests/socle-stockage-local.sql \
--     -f supabase/tests/socle-ecritures-local.sql \
--     -f supabase/tests/socle-fichiers-local.sql \
--     -f supabase/tests/fichiers-par-projet.sql
--   dropdb essai_fichiers
--
-- Toutes les lignes doivent afficher OK ; le script s'arrête en erreur sinon.
-- Il part de l'état laissé par les deux migrations précédentes, puis applique
-- lui-même la sienne entre ses deux temps : d'abord l'état d'avant, où le
-- défaut se constate, puis chaque fichier, rôle par rôle.

\ir outils-essais.sql
\ir jeu-profils.sql
\ir ../migrations/20261110130000_stockage_lecture_par_compartiment.sql
\ir ../migrations/20261110140000_ecritures_par_ville.sql

\set base 'https://exemple.supabase.co/storage/v1/object/public/uploads/'

-- Trois projets : celui d'un contributeur en ville a, un projet importé sans
-- auteur en ville b, celui d'un administrateur en ville a.
insert into public.contribution_uploads (id, project_name, category, ville, created_by, approved, geojson_url, cover_url, markdown_url) values
  (1, 'Projet de inv_a', 'urbanisme', 'a', :inv_a, true,
      :'base' || 'geojson/projects/urbanisme/p1.geojson', :'base' || 'img/cover/urbanisme/p1.jpg', :'base' || 'md/projects/urbanisme/p1.md?v=2'),
  (2, 'Projet importé',  'urbanisme', 'b', null,   true,
      :'base' || 'geojson/projects/urbanisme/p2.geojson', 'https://ailleurs.example/couverture.jpg', null),
  (3, 'Projet de adm_a', 'urbanisme', 'a', :adm_a, true,
      :'base' || 'geojson/projects/urbanisme/p3.geojson', null, null);

-- Deux dossiers de concertation : un rattaché au premier projet, un sans projet.
insert into public.consultation_dossiers (id, project_name, category, title, pdf_url, contribution_id) values
  (101, 'Projet de inv_a',   'urbanisme', 'Dossier rattaché',    :'base' || 'pdfs/projects/urbanisme/p1.pdf',   1),
  (102, 'Projet sans suite', 'urbanisme', 'Dossier sans projet', :'base' || 'pdfs/projects/urbanisme/seul.pdf', null);

-- Un fichier par cas, nommé d'un mot court dans les résultats attendus.
create table public.zz_fichiers (mot text primary key, name text unique, owner uuid);
insert into public.zz_fichiers values
  ('trace-1',   'geojson/projects/urbanisme/p1.geojson',         :inv_a),  -- projet 1, déposé par son auteur
  ('couv-1',    'img/cover/urbanisme/p1.jpg',                    :adm_a),  -- projet 1, déposé par un administrateur
  ('fiche-1',   'md/projects/urbanisme/p1.md',                   :inv_a),  -- projet 1, adresse suivie de ?v=2
  ('pdf-1',     'pdfs/projects/urbanisme/p1.pdf',                :adm_a),  -- dossier rattaché au projet 1
  ('trace-2',   'geojson/projects/urbanisme/p2.geojson',         null),    -- projet 2, importé sans auteur
  ('trace-3',   'geojson/projects/urbanisme/p3.geojson',         :adm_a),  -- projet 3
  ('pdf-seul',  'pdfs/projects/urbanisme/seul.pdf',              :adm_b),  -- dossier sans projet
  ('perdu',     'geojson/projects/urbanisme/perdu.geojson',      null),    -- plus aucun projet, sans auteur
  ('perdu-0',   'geojson/projects/urbanisme/perdu-inv0.geojson', :inv_0),  -- aucun projet, déposé par inv_0
  ('image-1',   'img/articles/urbanisme/p1-image.png',           :inv_a),  -- image d'article
  ('logo-a',    'branding/a/logo.png',                           null),
  ('logo-b',    'branding/b/logo.png',                           null),
  ('demo-a',    'demo/a/geojson/projet.geojson',                 null),
  ('vieille-a', 'diagnostic/a/couche.geojson',                   :adm_a),
  ('couche',    'layer/metro.geojson',                           null),
  ('photo',     'participer/a/photo.webp',                       null);

\set remettre 'insert into storage.objects (bucket_id, name, owner) select ''uploads'', name, owner from public.zz_fichiers on conflict (bucket_id, name) do nothing'
:remettre;

\set vus  '$q$select string_agg(f.mot, '' '' order by f.mot) from storage.objects o join zz_fichiers f on f.name = o.name where o.bucket_id = ''uploads''$q$'
\set tout '''couche couv-1 demo-a fiche-1 image-1 logo-a logo-b pdf-1 pdf-seul perdu perdu-0 photo trace-1 trace-2 trace-3 vieille-a'''

-- Supprimer un fichier par son mot, comme le fait l'API : par compartiment et par nom.
create function public.zz_supprime(p_user uuid, p_mot text) returns text
language sql as $$
  select public.zz_as('authenticated', p_user,
    format('delete from storage.objects where bucket_id = %L and name = %L', 'uploads', (select name from public.zz_fichiers where mot = p_mot)));
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- TEMPS 1 : avant la migration, le défaut
-- ═════════════════════════════════════════════════════════════════════════════

select zz_check('Avant : un compte sans espace liste tout le compartiment par l''API',
  zz_lit('authenticated', :inv_0, :vus), :tout);
select zz_check('Avant : l''administrateur de la ville b supprime la couverture d''un projet de la ville a',
  zz_supprime(:adm_b, 'couv-1'), 'ok 1');
select zz_check('Avant : un administrateur sans ville supprime le tracé d''un projet de la ville b',
  zz_supprime(:adm_0, 'trace-2'), 'ok 1');
:remettre;

-- ═════════════════════════════════════════════════════════════════════════════
-- TEMPS 2 : la migration
-- ═════════════════════════════════════════════════════════════════════════════

\ir ../migrations/20261110150000_fichiers_par_projet.sql

-- Ce que chacun lit par l'API : ce qu'il a le droit d'écrire ----------------------------

-- Un super administrateur lit tout le stockage par une règle de Chantiers
-- (op_chantier_fichiers_select), que cette migration ne touche pas.
select zz_check('Lire : un super administrateur lit toujours tout le compartiment',
  zz_lit('authenticated', :glob, :vus), :tout);
select zz_check('Lire : l''administrateur de la ville a lit les fichiers de sa ville et de ses projets',
  zz_lit('authenticated', :adm_a, :vus), 'couv-1 demo-a fiche-1 logo-a pdf-1 trace-1 trace-3 vieille-a');
select zz_check('Lire : l''administrateur de la ville b lit ceux de la sienne, et le fichier qu''il a déposé',
  zz_lit('authenticated', :adm_b, :vus), 'logo-b pdf-seul trace-2');
select zz_check('Lire : l''administrateur des deux villes lit ceux des deux',
  zz_lit('authenticated', :adm_ab, :vus), 'couv-1 demo-a fiche-1 logo-a logo-b pdf-1 trace-1 trace-2 trace-3 vieille-a');
select zz_check('Lire : un administrateur sans ville ne lit rien',
  zz_lit('authenticated', :adm_0, :vus), '(rien)');
select zz_check('Lire : l''auteur d''un projet lit les fichiers de son projet et ce qu''il a déposé',
  zz_lit('authenticated', :inv_a, :vus), 'couv-1 fiche-1 image-1 pdf-1 trace-1');
select zz_check('Lire : un contributeur de la ville qui n''est pas l''auteur ne lit rien',
  zz_lit('authenticated', :inv_ab, :vus), '(rien)');
select zz_check('Lire : un compte sans espace ne lit plus que ce qu''il a déposé',
  zz_lit('authenticated', :inv_0, :vus), 'perdu-0');

-- Supprimer le fichier d'un projet --------------------------------------------------------

select zz_check('Projet : l''administrateur d''une autre ville ne supprime plus la couverture',
  zz_supprime(:adm_b, 'couv-1'), 'ok 0');
select zz_check('Projet : un administrateur sans ville ne supprime plus le tracé d''un projet',
  zz_supprime(:adm_0, 'trace-2'), 'ok 0');
select zz_check('Projet : un contributeur de la ville qui n''est pas l''auteur ne supprime rien',
  zz_supprime(:inv_ab, 'trace-1'), 'ok 0');
select zz_check('Projet : l''administrateur de la ville supprime le tracé déposé par l''auteur',
  zz_supprime(:adm_a, 'trace-1'), 'ok 1');
select zz_check('Projet : l''auteur supprime la couverture qu''un administrateur a déposée sur son projet',
  zz_supprime(:inv_a, 'couv-1'), 'ok 1');
select zz_check('Projet : une adresse suivie de ?v=2 désigne toujours le fichier',
  zz_supprime(:adm_a, 'fiche-1'), 'ok 1');
:remettre;
select zz_check('Projet importé sans auteur : pas l''administrateur d''une autre ville',
  zz_supprime(:adm_a, 'trace-2'), 'ok 0');
select zz_check('Projet importé sans auteur : l''administrateur de sa ville supprime son tracé',
  zz_supprime(:adm_b, 'trace-2'), 'ok 1');
:remettre;

-- Le fichier suit le projet : la ville du projet change, le droit aussi.
update public.contribution_uploads set ville = 'b' where id = 1;
select zz_check('Projet déplacé en ville b : l''administrateur de la ville a ne supprime plus son tracé',
  zz_supprime(:adm_a, 'trace-1'), 'ok 0');
select zz_check('Projet déplacé en ville b : l''administrateur de la ville b le supprime',
  zz_supprime(:adm_b, 'trace-1'), 'ok 1');
update public.contribution_uploads set ville = 'a' where id = 1;
:remettre;

-- Les PDF des dossiers de concertation -------------------------------------------------------

select zz_check('PDF d''un dossier rattaché : pas l''administrateur d''une autre ville',
  zz_supprime(:adm_b, 'pdf-1'), 'ok 0');
select zz_check('PDF d''un dossier rattaché : l''auteur du projet',
  zz_supprime(:inv_a, 'pdf-1'), 'ok 1');
select zz_check('PDF d''un dossier sans projet : pas un administrateur de ville',
  zz_supprime(:adm_a, 'pdf-seul'), 'ok 0');
select zz_check('PDF d''un dossier sans projet : qui l''a déposé',
  zz_supprime(:adm_b, 'pdf-seul'), 'ok 1');
:remettre;
select zz_check('PDF d''un dossier sans projet : un super administrateur',
  zz_supprime(:glob, 'pdf-seul'), 'ok 1');
:remettre;

-- Les fichiers qu'aucun projet ne désigne ------------------------------------------------------

select zz_check('Fichier sans projet : pas un administrateur de ville',
  zz_supprime(:adm_ab, 'perdu'), 'ok 0');
select zz_check('Fichier sans projet : un super administrateur',
  zz_supprime(:glob, 'perdu'), 'ok 1');
select zz_check('Fichier sans projet déposé par un autre : pas un administrateur de ville',
  zz_supprime(:adm_ab, 'perdu-0'), 'ok 0');
select zz_check('Fichier sans projet : qui l''a déposé, même sans espace',
  zz_supprime(:inv_0, 'perdu-0'), 'ok 1');
select zz_check('Image d''article : pas un administrateur de la ville, aucun projet ne la désigne',
  zz_supprime(:adm_a, 'image-1'), 'ok 0');
select zz_check('Image d''article : qui l''a déposée',
  zz_supprime(:inv_a, 'image-1'), 'ok 1');
:remettre;

-- Un projet supprimé ne désigne plus son tracé.
delete from public.contribution_uploads where id = 3;
select zz_check('Projet supprimé : l''administrateur des deux villes ne supprime plus son tracé',
  zz_supprime(:adm_ab, 'trace-3'), 'ok 0');
select zz_check('Projet supprimé : qui a déposé le tracé le supprime encore',
  zz_supprime(:adm_a, 'trace-3'), 'ok 1');
:remettre;

-- Les fichiers dont le chemin porte la ville : comme avant ---------------------------------------

select zz_check('Logo de la ville a : pas l''administrateur de la ville b',
  zz_supprime(:adm_b, 'logo-a'), 'ok 0');
select zz_check('Logo de la ville a : son administrateur',
  zz_supprime(:adm_a, 'logo-a'), 'ok 1');
select zz_check('Ancienne couche du diagnostic de la ville a : pas l''administrateur de la ville b',
  zz_supprime(:adm_b, 'vieille-a'), 'ok 0');
select zz_check('Ancienne couche du diagnostic de la ville a : son administrateur',
  zz_supprime(:adm_ab, 'vieille-a'), 'ok 1');
select zz_check('Espace de démonstration a : pas l''administrateur de la ville b',
  zz_supprime(:adm_b, 'demo-a'), 'ok 0');
select zz_check('Espace de démonstration a : pas un contributeur de la ville',
  zz_supprime(:inv_a, 'demo-a'), 'ok 0');
select zz_check('Espace de démonstration a : son administrateur',
  zz_supprime(:adm_a, 'demo-a'), 'ok 1');
:remettre;

-- Le reste du compartiment : personne par l'API, comme avant ------------------------------------------

select zz_check('Couche de carte (layer/) : même un super administrateur ne la supprime pas par l''API',
  zz_supprime(:glob, 'couche'), 'ok 0');
select zz_check('Photo d''un signalement (participer/) : même un super administrateur',
  zz_supprime(:glob, 'photo'), 'ok 0');

-- Sans compte ----------------------------------------------------------------------------------

select zz_check('Sans compte : rien ne se supprime',
  zz_as('anon', null, $$delete from storage.objects where bucket_id = 'uploads' and name = 'branding/a/logo.png'$$),
  'permission denied for function op_chantier%');
select zz_check('Sans compte : les fichiers sont toujours là',
  (select count(*)::text from storage.objects where bucket_id = 'uploads'), '16');

-- Ce qui ne change pas : déposer, remplacer ------------------------------------------------------

select zz_check('Déposer : le tracé d''un projet se dépose comme avant',
  zz_as('authenticated', :inv_a, $$insert into storage.objects (bucket_id, name, owner) values ('uploads', 'geojson/projects/urbanisme/nouveau.geojson', auth.uid())$$), 'ok 1');
select zz_check('Déposer : qui vient de déposer supprime son fichier, avant même de créer le projet',
  zz_as('authenticated', :inv_a, $$delete from storage.objects where bucket_id = 'uploads' and name = 'geojson/projects/urbanisme/nouveau.geojson'$$), 'ok 1');
select zz_check('Déposer : rien ne se dépose hors des dossiers prévus',
  zz_as('authenticated', :adm_a, $$insert into storage.objects (bucket_id, name, owner) values ('uploads', 'layer/intrus.geojson', auth.uid())$$),
  'new row violates row-level security policy%');
select zz_check('Déposer : le logo d''une autre ville reste refusé',
  zz_as('authenticated', :adm_b, $$insert into storage.objects (bucket_id, name, owner) values ('uploads', 'branding/a/intrus.png', auth.uid())$$),
  'new row violates row-level security policy%');
select zz_check('Remplacer : qui a déposé un tracé le remplace',
  zz_as('authenticated', :inv_a, $$update storage.objects set owner = owner where bucket_id = 'uploads' and name = 'geojson/projects/urbanisme/p1.geojson'$$), 'ok 1');
select zz_check('Remplacer : pas l''administrateur de la ville, qui ne l''a pas déposé',
  zz_as('authenticated', :adm_a, $$update storage.objects set owner = owner where bucket_id = 'uploads' and name = 'geojson/projects/urbanisme/p1.geojson'$$), 'ok 0');

-- Les dossiers de concertation gardent leur règle (elle passe par can_write_contribution) ----------

select zz_check('Dossier : l''administrateur de la ville ajoute un dossier au projet',
  zz_as('authenticated', :adm_a, $$insert into public.consultation_dossiers (project_name, category, title, pdf_url, contribution_id) values ('Projet de inv_a', 'urbanisme', 'Ajout', 'https://exemple.org/ajout.pdf', 1)$$), 'ok 1');
select zz_check('Dossier : pas sous le nom d''un autre projet',
  zz_as('authenticated', :adm_a, $$insert into public.consultation_dossiers (project_name, category, title, pdf_url, contribution_id) values ('Projet importé', 'urbanisme', 'Ailleurs', 'https://exemple.org/ailleurs.pdf', 1)$$),
  'new row violates row-level security policy%');
select zz_check('Dossier : pas l''administrateur d''une autre ville',
  zz_as('authenticated', :adm_b, $$insert into public.consultation_dossiers (project_name, category, title, pdf_url, contribution_id) values ('Projet de inv_a', 'urbanisme', 'Intrus', 'https://exemple.org/intrus.pdf', 1)$$),
  'new row violates row-level security policy%');
select zz_check('Dossier : l''auteur du projet modifie un dossier de son projet',
  zz_as('authenticated', :inv_a, $$update public.consultation_dossiers set title = 'Titre revu' where id = 101$$), 'ok 1');
select zz_check('Dossier : un contributeur de la ville qui n''est pas l''auteur ne le modifie pas',
  zz_as('authenticated', :inv_ab, $$update public.consultation_dossiers set title = 'Intrus' where id = 101$$), 'ok 0');
select zz_check('Dossier sans projet : pas un administrateur de ville',
  zz_as('authenticated', :adm_ab, $$delete from public.consultation_dossiers where id = 102$$), 'ok 0');
select zz_check('Dossier sans projet : un super administrateur',
  zz_as('authenticated', :glob, $$update public.consultation_dossiers set title = 'Repris' where id = 102$$), 'ok 1');

-- La structure : une règle pour lire par l'API, une pour supprimer ------------------------------------

\set regles '$q$select string_agg(cmd || '' '' || n, '', '' order by cmd) from (select cmd, count(*) n from pg_policies where schemaname = ''storage'' and tablename = ''objects'' and cmd in (''SELECT'', ''DELETE'') and coalesce(qual, '''') like ''%uploads%'' group by cmd) t$q$'
select zz_check('Structure : une règle de lecture et une règle de suppression pour le compartiment',
  zz_lit('postgres', null, :regles), 'DELETE 1, SELECT 1');

-- La migration se rejoue sans rien changer.
\ir ../migrations/20261110150000_fichiers_par_projet.sql
select zz_check('Rejouée : toujours une règle de lecture et une règle de suppression',
  zz_lit('postgres', null, :regles), 'DELETE 1, SELECT 1');
select zz_check('Rejouée : l''administrateur de la ville a lit toujours les mêmes fichiers',
  zz_lit('authenticated', :adm_a, :vus), 'couv-1 demo-a fiche-1 logo-a pdf-1 trace-1 trace-3 vieille-a');

\ir resultat-essais.sql
