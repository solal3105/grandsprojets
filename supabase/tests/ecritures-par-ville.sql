-- Essais des écritures par ville (migration 20261110140000).
--
-- À rejouer après toute modification des règles d'écriture de city_branding,
-- city_modules, category_icons, ui_toggles, contribution_uploads,
-- consultation_dossiers ou des images de marque du stockage. Base locale
-- jetable, jamais le projet Supabase.
--
--   createdb essai_ecritures
--   psql -v ON_ERROR_STOP=1 -d essai_ecritures \
--     -f supabase/tests/socle-local.sql \
--     -f supabase/tests/socle-stockage-local.sql \
--     -f supabase/tests/socle-ecritures-local.sql \
--     -f supabase/tests/ecritures-par-ville.sql
--   dropdb essai_ecritures
--
-- Toutes les lignes doivent afficher OK ; le script s'arrête en erreur sinon.
-- Il applique lui-même la migration entre ses deux temps : d'abord l'état
-- d'avant, où le défaut se constate, puis chaque écriture, rôle par rôle.

\ir outils-essais.sql
\ir jeu-profils.sql

-- Deux villes, a et b, chacune avec un module et une catégorie.
insert into public.city_branding (ville, brand_name) values ('a', 'Ville A'), ('b', 'Ville B');
insert into public.city_modules (ville, module_key, label) values ('a', 'carte', 'Carte'), ('b', 'carte', 'Carte');
insert into public.category_icons (ville, category, icon_class) values ('a', 'urbanisme', 'fa-city'), ('b', 'urbanisme', 'fa-city');
insert into public.ui_toggles (key, icon, label) values ('filters', 'fa-filter', 'Filtres');

-- Les projets : un par cas.
insert into public.contribution_uploads (id, project_name, category, ville, created_by, approved) values
  (1, 'Projet A admin',          'urbanisme', 'a',  :adm_a,  true),
  (2, 'Projet A invité',         'urbanisme', 'a',  :inv_a,  false),
  (3, 'Projet B',                'urbanisme', 'b',  null,    true),
  (4, 'Sans ville',              'urbanisme', null, null,    true),
  (5, 'Homonyme',                'urbanisme', 'a',  null,    true),
  (6, 'Homonyme',                'urbanisme', 'b',  null,    true),
  (7, 'Ancien projet B',         'urbanisme', 'b',  null,    true),
  (8, 'Projet AB invité',        'urbanisme', 'a',  :inv_ab, true),
  (9, 'Projet A invité publié',  'urbanisme', 'a',  :inv_a,  true);
select setval(pg_get_serial_sequence('public.contribution_uploads', 'id'), 100);

-- Les dossiers : deux rattachés, trois d'avant le rattachement (un seul projet
-- de ce nom, deux projets de ce nom, aucun), et un rattaché à un projet qui a
-- changé de nom depuis.
insert into public.consultation_dossiers (id, project_name, category, title, pdf_url, contribution_id) values
  (1, 'Projet A invité', 'urbanisme', 'Plan',     'https://exemple.invalid/1.pdf', 2),
  (2, 'Projet B',        'urbanisme', 'Plan',     'https://exemple.invalid/2.pdf', 3),
  (3, 'Ancien projet B', 'urbanisme', 'Plan',     'https://exemple.invalid/3.pdf', null),
  (4, 'Homonyme',        'urbanisme', 'Plan',     'https://exemple.invalid/4.pdf', null),
  (5, 'Projet disparu',  'urbanisme', 'Plan',     'https://exemple.invalid/5.pdf', null),
  (6, 'Ancien nom de B', 'urbanisme', 'Plan',     'https://exemple.invalid/6.pdf', 3);
select setval(pg_get_serial_sequence('public.consultation_dossiers', 'id'), 100);

insert into storage.objects (bucket_id, name) values ('uploads', 'branding/b/logo-existant.png');

\set refus_categorie '''new row violates row-level security policy%"category_icons"'''
\set refus_module    '''new row violates row-level security policy%"city_modules"'''
\set refus_bouton    '''new row violates row-level security policy%"ui_toggles"'''
\set refus_ville     '''new row violates row-level security policy%"city_branding"'''
\set refus_projet    '''new row violates row-level security policy%"contribution_uploads"'''
\set refus_dossier   '''new row violates row-level security policy%"consultation_dossiers"'''
\set refus_fichier   '''new row violates row-level security policy%"objects"'''

-- ═════════════════════════════════════════════════════════════════════════════
-- TEMPS 1 : avant la migration, le défaut
-- ═════════════════════════════════════════════════════════════════════════════

select zz_check('Avant : un compte sans ville modifie les modules de toutes les villes',
  zz_as('authenticated', :inv_0, 'update public.city_modules set enabled = enabled'), 'ok 2');
select zz_check('Avant : il écrit aussi tous les dossiers de concertation',
  zz_as('authenticated', :inv_0, 'update public.consultation_dossiers set title = title'), 'ok 6');
select zz_check('Avant : l''admin de a modifie les catégories de b',
  zz_as('authenticated', :adm_a, $$update public.category_icons set icon_class = icon_class where ville = 'b'$$), 'ok 1');
select zz_check('Avant : il modifie les projets de b',
  zz_as('authenticated', :adm_a, $$update public.contribution_uploads set description = description where ville = 'b'$$), 'ok 3');
select zz_check('Avant : il crée une ville',
  zz_as('authenticated', :adm_a, $$insert into public.city_branding (ville) values ('c')$$), 'ok 1');
select zz_check('Avant : et la supprime, comme il supprimerait n''importe laquelle',
  zz_as('authenticated', :adm_a, $$delete from public.city_branding where ville = 'c'$$), 'ok 1');
select zz_check('Avant : il modifie le catalogue commun des boutons',
  zz_as('authenticated', :adm_a, 'update public.ui_toggles set label = label'), 'ok 1');
select zz_check('Avant : il dépose un logo dans le dossier de b',
  zz_as('authenticated', :adm_a, $$insert into storage.objects (bucket_id, name) values ('uploads', 'branding/b/logo-intrus.png')$$), 'ok 1');
delete from storage.objects where name = 'branding/b/logo-intrus.png';
select zz_check('Avant : un contributeur de a déplace son projet publié dans b',
  zz_as('authenticated', :inv_a, $$update public.contribution_uploads set ville = 'b' where id = 9$$), 'ok 1');
update public.contribution_uploads set ville = 'a' where id = 9;

\ir ../migrations/20261110140000_ecritures_par_ville.sql

-- ═════════════════════════════════════════════════════════════════════════════
-- TEMPS 2 : chaque écriture limitée aux villes du compte
-- ═════════════════════════════════════════════════════════════════════════════

-- Les catégories.
select zz_check('Catégories : l''admin de a en crée une dans a',
  zz_as('authenticated', :adm_a, $$insert into public.category_icons (ville, category, icon_class) values ('a', 'mobilite', 'fa-bus')$$), 'ok 1');
select zz_check('Catégories : pas dans b',
  zz_as('authenticated', :adm_a, $$insert into public.category_icons (ville, category, icon_class) values ('b', 'mobilite', 'fa-bus')$$), :refus_categorie);
select zz_check('Catégories : il modifie celles de a',
  zz_as('authenticated', :adm_a, $$update public.category_icons set icon_class = 'fa-tram' where ville = 'a' and category = 'mobilite'$$), 'ok 1');
select zz_check('Catégories : pas celles de b',
  zz_as('authenticated', :adm_a, $$update public.category_icons set icon_class = 'fa-tram' where ville = 'b'$$), 'ok 0');
select zz_check('Catégories : il n''en déplace pas une dans b',
  zz_as('authenticated', :adm_a, $$update public.category_icons set ville = 'b' where ville = 'a' and category = 'mobilite'$$), :refus_categorie);
select zz_check('Catégories : il n''en supprime pas dans b',
  zz_as('authenticated', :adm_a, $$delete from public.category_icons where ville = 'b'$$), 'ok 0');
select zz_check('Catégories : il supprime la sienne',
  zz_as('authenticated', :adm_a, $$delete from public.category_icons where ville = 'a' and category = 'mobilite'$$), 'ok 1');
select zz_check('Catégories : l''admin de a et b modifie celles de b',
  zz_as('authenticated', :adm_ab, $$update public.category_icons set icon_class = icon_class where ville = 'b'$$), 'ok 1');
select zz_check('Catégories : un admin sans ville n''en modifie aucune',
  zz_as('authenticated', :adm_0, 'update public.category_icons set icon_class = icon_class'), 'ok 0');
select zz_check('Catégories : un contributeur de a non plus',
  zz_as('authenticated', :inv_a, 'update public.category_icons set icon_class = icon_class'), 'ok 0');
select zz_check('Catégories : un super admin modifie celles de toutes les villes',
  zz_as('authenticated', :glob, 'update public.category_icons set icon_class = icon_class'), 'ok 2');

-- Les modules. La console enregistre par insertion ou mise à jour (upsert).
\set module_a '$q$insert into public.city_modules (ville, module_key, label) values (''a'', ''travaux'', ''Travaux'') on conflict (ville, module_key) do update set label = excluded.label$q$'
\set module_b '$q$insert into public.city_modules (ville, module_key, label) values (''b'', ''travaux'', ''Travaux'') on conflict (ville, module_key) do update set label = excluded.label$q$'
select zz_check('Modules : un compte sans ville n''en modifie plus aucun',
  zz_as('authenticated', :inv_0, 'update public.city_modules set enabled = enabled'), 'ok 0');
select zz_check('Modules : un contributeur de a non plus',
  zz_as('authenticated', :inv_a, 'update public.city_modules set enabled = enabled'), 'ok 0');
select zz_check('Modules : l''admin de a enregistre les réglages Travaux de a (création)',
  zz_as('authenticated', :adm_a, :module_a), 'ok 1');
select zz_check('Modules : ... puis les enregistre de nouveau (mise à jour)',
  zz_as('authenticated', :adm_a, :module_a), 'ok 1');
select zz_check('Modules : pas ceux de b',
  zz_as('authenticated', :adm_a, :module_b), :refus_module);
select zz_check('Modules : il ne modifie pas ceux de b',
  zz_as('authenticated', :adm_a, $$update public.city_modules set enabled = false where ville = 'b'$$), 'ok 0');
select zz_check('Modules : il n''en supprime pas dans b',
  zz_as('authenticated', :adm_a, $$delete from public.city_modules where ville = 'b'$$), 'ok 0');
select zz_check('Modules : il supprime le sien',
  zz_as('authenticated', :adm_a, $$delete from public.city_modules where ville = 'a' and module_key = 'travaux'$$), 'ok 1');
select zz_check('Modules : un super admin écrit ceux de b',
  zz_as('authenticated', :glob, :module_b), 'ok 1');

-- Le catalogue commun des boutons.
select zz_check('Boutons : un admin de ville ne modifie plus le catalogue commun',
  zz_as('authenticated', :adm_ab, 'update public.ui_toggles set label = label'), 'ok 0');
select zz_check('Boutons : il n''y ajoute rien',
  zz_as('authenticated', :adm_ab, $$insert into public.ui_toggles (key, icon, label) values ('intrus', 'fa-bug', 'Intrus')$$), :refus_bouton);
select zz_check('Boutons : un super admin le modifie',
  zz_as('authenticated', :glob_a, 'update public.ui_toggles set label = label'), 'ok 1');

-- Les villes.
select zz_check('Villes : un admin de ville n''en crée plus',
  zz_as('authenticated', :adm_a, $$insert into public.city_branding (ville) values ('c')$$), :refus_ville);
select zz_check('Villes : il n''en supprime aucune, pas même la sienne',
  zz_as('authenticated', :adm_a, 'delete from public.city_branding'), 'ok 0');
select zz_check('Villes : il modifie toujours la sienne',
  zz_as('authenticated', :adm_a, $$update public.city_branding set brand_name = 'Ville A bis' where ville = 'a'$$), 'ok 1');
select zz_check('Villes : pas celle du voisin',
  zz_as('authenticated', :adm_a, $$update public.city_branding set brand_name = 'Prise' where ville = 'b'$$), 'ok 0');
select zz_check('Villes : il ne change pas le code de la sienne',
  zz_as('authenticated', :adm_a, $$update public.city_branding set ville = 'z' where ville = 'a'$$), :refus_ville);
select zz_check('Villes : un contributeur ne modifie rien',
  zz_as('authenticated', :inv_a, 'update public.city_branding set brand_name = brand_name'), 'ok 0');
select zz_check('Villes : un super admin en crée une',
  zz_as('authenticated', :glob, $$insert into public.city_branding (ville) values ('c')$$), 'ok 1');
select zz_check('Villes : ... et la supprime',
  zz_as('authenticated', :glob, $$delete from public.city_branding where ville = 'c'$$), 'ok 1');

-- Les projets, côté administrateur.
select zz_check('Projets : l''admin de a en crée un dans a, publié',
  zz_as('authenticated', :adm_a, $$insert into public.contribution_uploads (project_name, category, ville, approved) values ('Nouveau A', 'urbanisme', 'a', true)$$), 'ok 1');
select zz_check('Projets : pas dans b',
  zz_as('authenticated', :adm_a, $$insert into public.contribution_uploads (project_name, category, ville, approved) values ('Intrus B', 'urbanisme', 'b', true)$$), :refus_projet);
select zz_check('Projets : pas sans ville',
  zz_as('authenticated', :adm_a, $$insert into public.contribution_uploads (project_name, category, approved) values ('Intrus', 'urbanisme', true)$$), :refus_projet);
select zz_check('Projets : il publie la proposition d''un contributeur de a',
  zz_as('authenticated', :adm_a, 'update public.contribution_uploads set approved = true where id = 2'), 'ok 1');
update public.contribution_uploads set approved = false where id = 2;
select zz_check('Projets : l''admin de b ne la publie pas',
  zz_as('authenticated', :adm_b, 'update public.contribution_uploads set approved = true where id = 2'), 'ok 0');
select zz_check('Projets : l''admin de a ne modifie plus ceux de b',
  zz_as('authenticated', :adm_a, $$update public.contribution_uploads set description = 'pris' where ville = 'b'$$), 'ok 0');
select zz_check('Projets : il ne déplace pas un projet de a dans b',
  zz_as('authenticated', :adm_a, $$update public.contribution_uploads set ville = 'b' where id = 1$$), :refus_projet);
select zz_check('Projets : il ne supprime pas ceux de b',
  zz_as('authenticated', :adm_a, $$delete from public.contribution_uploads where ville = 'b'$$), 'ok 0');
select zz_check('Projets : l''admin de a et b déplace un projet de a dans b',
  zz_as('authenticated', :adm_ab, $$update public.contribution_uploads set ville = 'b' where id = 1$$), 'ok 1');
update public.contribution_uploads set ville = 'a' where id = 1;
select zz_check('Projets : un projet sans ville ne s''écrit que par un super admin (admin de ville)',
  zz_as('authenticated', :adm_ab, 'update public.contribution_uploads set description = description where id = 4'), 'ok 0');
select zz_check('Projets : ... (super admin)',
  zz_as('authenticated', :glob, 'update public.contribution_uploads set description = description where id = 4'), 'ok 1');

-- Les projets, côté auteur.
select zz_check('Auteur : un contributeur de a propose un projet dans a, non publié',
  zz_as('authenticated', :inv_a, $$insert into public.contribution_uploads (project_name, category, ville) values ('Proposition A', 'urbanisme', 'a')$$), 'ok 1');
select zz_check('Auteur : il ne le publie pas lui-même à la création',
  zz_as('authenticated', :inv_a, $$insert into public.contribution_uploads (project_name, category, ville, approved) values ('Proposition publiée', 'urbanisme', 'a', true)$$), :refus_projet);
select zz_check('Auteur : il modifie sa proposition',
  zz_as('authenticated', :inv_a, $$update public.contribution_uploads set description = 'précision' where id = 2$$), 'ok 1');
select zz_check('Auteur : il ne la publie pas lui-même',
  zz_as('authenticated', :inv_a, 'update public.contribution_uploads set approved = true where id = 2'), :refus_projet);
select zz_check('Auteur : il ne déplace plus son projet publié dans b',
  zz_as('authenticated', :inv_a, $$update public.contribution_uploads set ville = 'b' where id = 9$$), :refus_projet);
select zz_check('Auteur : un contributeur de a et b déplace le sien de a dans b',
  zz_as('authenticated', :inv_ab, $$update public.contribution_uploads set ville = 'b' where id = 8$$), 'ok 1');
update public.contribution_uploads set ville = 'a' where id = 8;
select zz_check('Auteur : il ne modifie pas le projet d''un autre',
  zz_as('authenticated', :inv_a, $$update public.contribution_uploads set description = 'pris' where id = 1$$), 'ok 0');

-- Les dossiers de concertation.
select zz_check('Dossiers : l''ancien dossier dont un seul projet porte le nom est rattaché',
  (select contribution_id::text from public.consultation_dossiers where id = 3), '7');
select zz_check('Dossiers : ceux dont le nom désigne deux projets, ou aucun, ne le sont pas',
  (select count(*)::text from public.consultation_dossiers where id in (4, 5) and contribution_id is null), '2');
select zz_check('Dossiers : un compte sans ville n''en écrit plus aucun',
  zz_as('authenticated', :inv_0, 'update public.consultation_dossiers set title = title'), 'ok 0');
select zz_check('Dossiers : l''auteur en ajoute un à sa proposition',
  zz_as('authenticated', :inv_a, $$insert into public.consultation_dossiers (project_name, category, title, pdf_url, contribution_id) values ('Projet A invité', 'urbanisme', 'Étude', 'https://exemple.invalid/a.pdf', 2)$$), 'ok 1');
select zz_check('Dossiers : pas sous le nom du projet d''un autre',
  zz_as('authenticated', :inv_a, $$insert into public.consultation_dossiers (project_name, category, title, pdf_url, contribution_id) values ('Projet B', 'urbanisme', 'Étude', 'https://exemple.invalid/b.pdf', 2)$$), :refus_dossier);
select zz_check('Dossiers : pas sur le projet d''un autre',
  zz_as('authenticated', :inv_a, $$insert into public.consultation_dossiers (project_name, category, title, pdf_url, contribution_id) values ('Projet A admin', 'urbanisme', 'Étude', 'https://exemple.invalid/c.pdf', 1)$$), :refus_dossier);
select zz_check('Dossiers : pas sans projet rattaché',
  zz_as('authenticated', :inv_a, $$insert into public.consultation_dossiers (project_name, category, title, pdf_url) values ('Projet A invité', 'urbanisme', 'Étude', 'https://exemple.invalid/d.pdf')$$), :refus_dossier);
select zz_check('Dossiers : l''admin de a en ajoute un à un projet de a',
  zz_as('authenticated', :adm_a, $$insert into public.consultation_dossiers (project_name, category, title, pdf_url, contribution_id) values ('Projet A admin', 'urbanisme', 'Étude', 'https://exemple.invalid/e.pdf', 1)$$), 'ok 1');
select zz_check('Dossiers : pas à un projet de b',
  zz_as('authenticated', :adm_a, $$insert into public.consultation_dossiers (project_name, category, title, pdf_url, contribution_id) values ('Projet B', 'urbanisme', 'Étude', 'https://exemple.invalid/f.pdf', 3)$$), :refus_dossier);
select zz_check('Dossiers : il ne modifie pas ceux des projets de b',
  zz_as('authenticated', :adm_a, 'update public.consultation_dossiers set title = title where id in (2, 3)'), 'ok 0');
select zz_check('Dossiers : il ne rattache pas le dossier d''un projet de a à un projet de b',
  zz_as('authenticated', :adm_a, $$update public.consultation_dossiers set contribution_id = 3, project_name = 'Projet B' where contribution_id = 1$$), :refus_dossier);
select zz_check('Dossiers : l''admin de b modifie les siens, l''ancien rattaché compris',
  zz_as('authenticated', :adm_b, 'update public.consultation_dossiers set title = title where id in (2, 3)'), 'ok 2');
select zz_check('Dossiers : celui d''un projet renommé ne s''écrit pas sous son ancien nom',
  zz_as('authenticated', :adm_b, $$update public.consultation_dossiers set title = 'Plan 2' where id = 6$$), :refus_dossier);
select zz_check('Dossiers : ... l''admin de la ville le remet au nom du projet',
  zz_as('authenticated', :adm_b, $$update public.consultation_dossiers set project_name = 'Projet B' where id = 6$$), 'ok 1');
update public.consultation_dossiers set project_name = 'Ancien nom de B' where id = 6;
select zz_check('Dossiers : ... ou le supprime',
  zz_as('authenticated', :adm_b, 'delete from public.consultation_dossiers where id = 6'), 'ok 1');
select zz_check('Dossiers : sans rattachement, pas même l''admin des deux villes',
  zz_as('authenticated', :adm_ab, 'update public.consultation_dossiers set title = title where id in (4, 5)'), 'ok 0');
select zz_check('Dossiers : ... seulement un super admin',
  zz_as('authenticated', :glob, 'update public.consultation_dossiers set title = title where id in (4, 5)'), 'ok 2');
select zz_check('Dossiers : l''auteur supprime sa proposition, ses dossiers partent avec elle',
  zz_as('authenticated', :inv_a, 'delete from public.contribution_uploads where id = 2'), 'ok 1');
select zz_check('Dossiers : ... il n''en reste aucun',
  (select count(*)::text from public.consultation_dossiers where contribution_id = 2 or project_name = 'Projet A invité'), '0');

-- Les images de marque.
select zz_check('Logos : l''admin de a dépose dans le dossier de a',
  zz_as('authenticated', :adm_a, $$insert into storage.objects (bucket_id, name) values ('uploads', 'branding/a/logo-1.png')$$), 'ok 1');
select zz_check('Logos : plus dans celui de b',
  zz_as('authenticated', :adm_a, $$insert into storage.objects (bucket_id, name) values ('uploads', 'branding/b/logo-1.png')$$), :refus_fichier);
select zz_check('Logos : il ne remplace pas un fichier de b',
  zz_as('authenticated', :adm_a, $$update storage.objects set owner = owner where name = 'branding/b/logo-existant.png'$$), 'ok 0');
select zz_check('Logos : un contributeur ne dépose pas',
  zz_as('authenticated', :inv_a, $$insert into storage.objects (bucket_id, name) values ('uploads', 'branding/a/logo-2.png')$$), :refus_fichier);
select zz_check('Logos : un super admin dépose pour une ville qui n''existe pas encore',
  zz_as('authenticated', :glob, $$insert into storage.objects (bucket_id, name) values ('uploads', 'branding/nouvelle/logo-1.png')$$), 'ok 1');

-- Les lectures publiques ne changent pas.
select zz_check('Lecture : sans compte, on lit toujours tout ce qui s''affiche',
  zz_lit('anon', null, $$select (select count(*) from public.city_branding) || ' villes, ' || (select count(*) from public.city_modules) || ' modules, ' || (select count(*) from public.category_icons) || ' catégories, ' || (select count(*) from public.ui_toggles) || ' bouton, ' || (select count(*) from public.contribution_uploads where id < 100) || ' projets, ' || (select count(*) from public.consultation_dossiers where id < 100) || ' dossiers'$$),
  '2 villes, 3 modules, 2 catégories, 1 bouton, 8 projets, 4 dossiers');

-- Les règles elles-mêmes.
select zz_check('Règles : plus aucune écriture ouverte sans condition',
  (select count(*)::text from pg_policies
    where schemaname = 'public' and cmd <> 'SELECT'
      and tablename in ('city_branding', 'city_modules', 'category_icons', 'ui_toggles', 'contribution_uploads', 'consultation_dossiers')
      and (qual in ('true', '(auth.role() = ''authenticated''::text)') or with_check in ('true', '(auth.role() = ''authenticated''::text)'))), '0');
select zz_check('Règles : une seule par action pour les dossiers et pour les modules',
  (select string_agg(tablename || ' ' || n, ', ' order by tablename)
     from (select tablename, count(*) n from pg_policies
            where schemaname = 'public' and tablename in ('consultation_dossiers', 'city_modules') group by 1) t),
  'city_modules 4, consultation_dossiers 4');
select zz_check('Règles : la fonction des dossiers n''est pas exécutable sans compte',
  has_function_privilege('anon', 'public.can_write_consultation_dossier(bigint, text)', 'execute')::text, 'false');

-- La migration se rejoue sans rien changer.
\ir ../migrations/20261110140000_ecritures_par_ville.sql
select zz_check('Rejouée une seconde fois : mêmes règles, mêmes rattachements',
  (select count(*)::text from pg_policies
    where schemaname = 'public'
      and tablename in ('city_branding', 'city_modules', 'category_icons', 'ui_toggles', 'contribution_uploads', 'consultation_dossiers'))
  || ' règles, ' || (select count(*)::text from public.consultation_dossiers where contribution_id is null) || ' dossiers sans rattachement',
  '29 règles, 2 dossiers sans rattachement');

\ir resultat-essais.sql
