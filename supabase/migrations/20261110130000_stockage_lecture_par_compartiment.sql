-- Stockage : plus de règle générale de lecture, plus de dépôt sans compte.
--
-- Le défaut (audit de sécurité du 9 novembre 2026) : la règle « Enable read
-- access for all users » de storage.objects valait true pour tous les
-- compartiments. Les règles de lecture propres à un compartiment privé ne
-- servaient donc à rien : un compte sans aucun espace listait et téléchargeait
-- les fichiers du diagnostic de toutes les villes et les photos déposées par
-- les habitants dans Participer. Une seconde règle laissait n'importe qui, sans
-- compte, déposer des fichiers dans le compartiment public image.
--
-- Après cette migration, chaque compartiment n'a plus que ses propres règles :
--   - uploads, travaux-geojson : lecture publique, inchangée (leurs règles
--     existent déjà) ;
--   - diagnostic : les administrateurs de la ville du dossier (règle
--     diagnostic_files_select_admin, déjà en place, enfin seule à décider) ;
--   - participer-photos : aucune lecture par l'API, les fonctions serveur
--     tiennent la clé de service ;
--   - image, signatures : compartiments publics, leurs fichiers restent servis
--     par leur adresse publique (72 dossiers de concertation pointent vers
--     image), mais on ne les liste plus et on n'y dépose plus par l'API ;
--   - compartiments de Chantiers : rien ne change pour eux, voir ci-dessous.
--
-- Une adresse publique (/object/public/...) ne traverse pas ces règles : aucun
-- fichier affiché sur une carte ou une fiche n'est touché.
--
-- Essais : supabase/tests/stockage-lecture.sql (base locale).

-- 1. La règle générale disparaît, Chantiers garde la sienne -------------------------
--
-- Chantiers s'appuyait sur la règle générale : sa règle restrictive
-- op_chantier_fichiers_confidentialite limite la lecture aux membres de
-- l'espace, et c'est la règle générale qui ouvrait cette lecture. On garde
-- exactement ce comportement par une règle réduite aux deux compartiments
-- concernés. Elle est TRANSITOIRE : elle appartient à Chantiers, dont le dépôt
-- la reprendra dans ses propres règles, avec ses propres essais. Le troisième
-- compartiment de Chantiers, op-chantier-referentiel, n'en a pas besoin : sa
-- lecture par les membres de l'espace est déjà écrite dans
-- op_chantier_fichiers_select, qui décide désormais seule (la règle générale
-- l'ouvrait à tout compte connecté).
--
-- (Une règle de storage.objects ne se renomme pas sur Supabase, la table
-- appartient au service de stockage : on crée la nouvelle, on retire l'ancienne.)

drop policy if exists op_chantier_fichiers_lecture_espace on storage.objects;
create policy op_chantier_fichiers_lecture_espace on storage.objects
  for select
  to authenticated
  using (bucket_id in ('op-chantier-documents', 'op-chantier-medias'));

comment on policy op_chantier_fichiers_lecture_espace on storage.objects is
  'TRANSITOIRE. Tient la place de l''ancienne règle générale de lecture, réduite aux compartiments de Chantiers pour ne rien changer chez eux : avec op_chantier_fichiers_confidentialite, un membre lit les fichiers de son espace. Elle appartient à Chantiers, dont le dépôt la reprendra dans ses propres règles.';

drop policy if exists "Enable read access for all users" on storage.objects;

-- 2. Plus de dépôt sans compte -----------------------------------------------------

drop policy if exists "allow anonymous uploads 1nq2cb_0" on storage.objects;

-- 3. Une taille maximale par compartiment --------------------------------------------
--
-- Trois compartiments publics n'avaient aucune limite. 50 Mo couvre le plus
-- gros fichier présent (37 Mo) et l'import de couches, plafonné à 45 Mo par la
-- console. Les types de fichiers ne sont pas restreints ici : uploads en
-- reçoit une quinzaine, chemin par chemin, et cela se règle avec les règles
-- de dépôt par ville.

update storage.buckets
   set file_size_limit = 52428800
 where id in ('uploads', 'travaux-geojson', 'image')
   and file_size_limit is null;

-- Marche arrière :
--   create policy "Enable read access for all users" on storage.objects
--     for select to public using (true);
--   drop policy if exists op_chantier_fichiers_lecture_espace on storage.objects;
--   create policy "allow anonymous uploads 1nq2cb_0" on storage.objects
--     for insert to public with check (bucket_id = 'image');
--   update storage.buckets set file_size_limit = null where id in ('uploads', 'travaux-geojson', 'image');
