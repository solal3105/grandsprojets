-- Add ville column to contribution_uploads, backfill to 'lyon', make it NOT NULL, and index it
BEGIN;

-- 1) Add column with a temporary default so existing rows get a value
ALTER TABLE public.contribution_uploads
  ADD COLUMN IF NOT EXISTS ville text DEFAULT 'lyon';

-- 2) Backfill existing NULLs explicitly to 'lyon' (in case default didn't apply to prior rows)
UPDATE public.contribution_uploads SET ville = 'lyon' WHERE ville IS NULL;

-- 3) Enforce NOT NULL now that data is backfilled
ALTER TABLE public.contribution_uploads
  ALTER COLUMN ville SET NOT NULL;

-- 4) Create an index for filtering by city
CREATE INDEX IF NOT EXISTS contribution_uploads_ville_idx
  ON public.contribution_uploads (ville);

-- 5) Drop the default so new inserts must specify ville from the app
ALTER TABLE public.contribution_uploads
  ALTER COLUMN ville DROP DEFAULT;

COMMIT;
