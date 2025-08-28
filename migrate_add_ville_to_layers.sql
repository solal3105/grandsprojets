-- Add 'ville' column to public.layers and set values per current requirement
-- Safe to re-run: uses IF NOT EXISTS and guarded updates

-- 1) Add column
ALTER TABLE public.layers
  ADD COLUMN IF NOT EXISTS ville text;

-- 2) Ensure the three common layers remain global (NULL ville)
-- Match by LOWER(name) to be robust to case/spacing variants
WITH commons AS (
  SELECT id
  FROM public.layers
  WHERE LOWER(name) IN (
    'urbanisme',
    'voielyonnaise',
    'reseauprojeteensitepropre',  -- with "en"
    'reseauprojetesitepropre'     -- without "en"
  )
)
UPDATE public.layers l
SET ville = NULL
FROM commons c
WHERE l.id = c.id;

-- 3) Set 'lyon' as default city for all other existing layers that don't have a ville yet
UPDATE public.layers l
SET ville = 'lyon'
WHERE l.ville IS NULL
  AND l.id NOT IN (
    SELECT id FROM public.layers
    WHERE LOWER(name) IN (
      'urbanisme',
      'voielyonnaise',
      'reseauprojeteensitepropre',
      'reseauprojetesitepropre'
    )
  );

-- Optional: (commented) Create an index on ville for future filtering
-- CREATE INDEX IF NOT EXISTS layers_ville_idx ON public.layers (ville);
