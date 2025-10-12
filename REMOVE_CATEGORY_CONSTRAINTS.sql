-- Supprimer les contraintes CHECK sur les catégories
-- Pour permettre des catégories dynamiques

-- ============================================================================
-- Supprimer le constraint sur consultation_dossiers
-- ============================================================================

ALTER TABLE public.consultation_dossiers 
DROP CONSTRAINT IF EXISTS consultation_dossiers_category_check;

-- ============================================================================
-- Vérifier qu'il n'y a plus de constraints sur category
-- ============================================================================

SELECT 
  conrelid::regclass AS table_name,
  conname AS constraint_name, 
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint 
WHERE conname LIKE '%category%'
  AND conrelid::regclass::text IN ('contribution_uploads', 'consultation_dossiers');

-- Si aucune ligne n'est retournée avec "category_check", c'est parfait ! ✅

-- ============================================================================
-- Vérifier les catégories actuelles
-- ============================================================================

-- Contributions
SELECT DISTINCT category, COUNT(*) as count
FROM public.contribution_uploads 
WHERE category IS NOT NULL
GROUP BY category
ORDER BY category;

-- Documents
SELECT DISTINCT category, COUNT(*) as count
FROM public.consultation_dossiers 
WHERE category IS NOT NULL
GROUP BY category
ORDER BY category;
