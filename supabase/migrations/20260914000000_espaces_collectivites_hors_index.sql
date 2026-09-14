-- Les espaces des collectivités sortent des moteurs de recherche, sauf la
-- Métropole de Lyon. Leurs cartes et leurs fiches restent consultables par
-- lien : seules l'indexation et la présence dans le plan du site changent.
--
-- Décision de Solal, 14 septembre 2026. Suite de 20260908000000 (le hub
-- national « france » était déjà sorti de l'index le 8 septembre).

update public.city_branding
   set indexable = false
 where ville in (
   'rassemblees',     -- Engages, le bilan 2020-2026
   'fdlm',            -- Fête de la musique Lyon
   'engages-projet',  -- Engages, le projet 2026-2032
   'lumieres',        -- Fêtes des lumières 2025
   'strasbourg',
   'musee-vienne',    -- Musée d'histoire de Vienne
   'vannes',          -- Vannes Agglomération
   'defitassin',      -- Défi Mobilité
   'divonne',         -- Divonne-les-Bains
   'grenoble',
   'keolis',
   'besancon',
   'mres',            -- Maison de l'environnement et des solidarités
   'villedelyon',     -- Ville de Lyon
   'frans',
   'lyon'             -- Grand Lyon
 );

-- Contrôle : seule 'metropole-lyon' doit rester indexable parmi les espaces
-- de collectivités (les cartes de communes 'essai-*' ne sont pas touchées).
-- select ville, indexable from public.city_branding
--  where ville not like 'essai-%' order by indexable desc, ville;
