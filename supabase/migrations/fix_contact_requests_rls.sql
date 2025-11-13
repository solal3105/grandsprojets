-- Fix RLS policies for contact_requests table
-- Allow anonymous users to insert contact requests

-- Vérifier si la table existe
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'contact_requests') THEN
    -- Désactiver RLS temporairement pour ajouter les politiques
    ALTER TABLE public.contact_requests DISABLE ROW LEVEL SECURITY;
    
    -- Réactiver RLS
    ALTER TABLE public.contact_requests ENABLE ROW LEVEL SECURITY;
    
    -- Supprimer les anciennes politiques si elles existent
    DROP POLICY IF EXISTS "Allow anonymous inserts" ON public.contact_requests;
    DROP POLICY IF EXISTS "Allow anonymous reads" ON public.contact_requests;
    
    -- Créer la politique pour INSERT (utilisateurs anonymes)
    CREATE POLICY "Allow anonymous inserts on contact_requests"
    ON public.contact_requests
    FOR INSERT
    WITH CHECK (true);
    
    -- Créer la politique pour SELECT (utilisateurs anonymes)
    CREATE POLICY "Allow anonymous reads on contact_requests"
    ON public.contact_requests
    FOR SELECT
    USING (true);
    
    RAISE NOTICE 'RLS policies created successfully for contact_requests';
  ELSE
    RAISE NOTICE 'Table contact_requests does not exist';
  END IF;
END $$;
