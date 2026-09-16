-- La colonne `status` des demandes de contact est retirée.
--
-- Elle valait 'new' sur les 28 lignes de la table : personne ne la met à jour,
-- le suivi des demandes se fait ailleurs. Une colonne qui ment sur l'état réel
-- d'une demande vaut moins que pas de colonne du tout.
--
-- Aucun code ne l'écrit ni ne la lit : le formulaire du site et la fonction de
-- l'estimateur de prix insèrent nom, adresse, téléphone, organisation, message
-- et provenance, rien d'autre.

alter table public.contact_requests drop column if exists status;
