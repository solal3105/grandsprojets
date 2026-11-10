-- Chantiers : un fichier suit son dossier, plus seulement son espace.
--
-- La migration 20261110130000 avait gardé à Chantiers sa lecture d'avant par une
-- règle transitoire, op_chantier_fichiers_lecture_espace : tout membre d'un
-- espace lisait les fichiers de tous les dossiers de cet espace, y compris les
-- pièces des demandes des autres. La règle de Chantiers, elle, était déjà
-- écrite par dossier (op_chantier_fichiers_select, dépôt de Chantiers, règles
-- de gestion section 7) : la règle générale de lecture la masquait depuis
-- toujours, puis la règle transitoire à sa suite.
--
-- On retire la règle transitoire : op_chantier_fichiers_select décide seule.
-- Un fichier se lit par qui voit le dossier ou le fil de chantier qui le porte.
--
-- Ce qui ne change pas : chaque compte lit toujours les fichiers des pièces de
-- ses dossiers (contrôlé en base pour chaque compte de Chantiers, aucun lien
-- perdu) ; le document à accepter d'un espace reste lisible par ses membres ;
-- le dépôt et la suppression gardent leurs règles.
--
-- Essais : supabase/tests/stockage-lecture.sql ici, et l'essai « intervenant ne
-- voit pas les pieces d un dossier etranger » de rls-quatre-acteurs.sql dans le
-- dépôt de Chantiers, qui échouait tant que cette règle existait.

drop policy if exists op_chantier_fichiers_lecture_espace on storage.objects;

-- Marche arrière :
--   create policy op_chantier_fichiers_lecture_espace on storage.objects
--     for select to authenticated
--     using (bucket_id in ('op-chantier-documents', 'op-chantier-medias'));
