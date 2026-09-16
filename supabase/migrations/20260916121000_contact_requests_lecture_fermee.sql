-- Les demandes de contact ne sont plus lisibles par la clé publique.
--
-- La table portait une politique de lecture ouverte à tout le monde : la clé
-- anonyme est dans le code du site, donc n'importe qui pouvait lire les noms,
-- adresses, téléphones et messages laissés par les prospects. Le défaut était
-- connu (commentaire en tête de netlify/functions/demo-lead.mjs) et jamais
-- refermé. La table `demo_leads`, elle, n'a jamais eu de politique publique.
--
-- La lecture ouverte à tout compte connecté tombe aussi : un agent invité d'une
-- collectivité cliente n'a rien à faire dans les demandes commerciales. Seul un
-- administrateur global les lit désormais avec un jeton de session ; l'équipe
-- passe de toute façon par le tableau de bord Supabase, qui ne dépend pas des RLS.
--
-- Le dépôt d'une demande reste ouvert à tous : c'est le formulaire du site.

drop policy if exists "Allow anonymous reads on contact_requests" on public.contact_requests;
drop policy if exists "Enable read for authenticated users only" on public.contact_requests;

create policy "Lecture reservee aux administrateurs globaux"
  on public.contact_requests
  for select
  to authenticated
  using (public.is_global_admin());
