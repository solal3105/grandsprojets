-- ============================================================================
-- MODULE PARTICIPER - signalements déposés depuis le site d'une collectivité
--
-- Un site de collectivité (module Sites) dépose ses signalements par
-- /api/participer/submit et peut désigner la page où l'habitant les suit. Le
-- serveur garde cette adresse pour écrire, plus tard, les liens des emails
-- (accusé, changements de statut) vers cette page au lieu de la carte. Elle
-- n'est enregistrée qu'après validation contre PARTICIPER_ORIGINES_SITES, et
-- revalidée à chaque email : un site retiré de la liste ne reçoit plus de lien.
--
-- Ce n'est pas une donnée personnelle (une page publique du site), elle n'est
-- donc pas effacée par l'anonymisation. Aucun privilège de lecture n'est
-- accordé à `authenticated` : le navigateur de l'équipe n'en a pas besoin.
--
-- À appliquer AVANT de déployer le code qui la lit (participer-submit,
-- participer-confirm, participer-update la nomment dans leurs requêtes).
--
-- Doc : docs/participer.md
-- ============================================================================

alter table public.participer_signalements
  add column if not exists retour_url text
    check (retour_url is null or char_length(retour_url) <= 500);
