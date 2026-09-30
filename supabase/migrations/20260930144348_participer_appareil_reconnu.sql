-- ============================================================================
-- MODULE PARTICIPER - un navigateur reconnu après une première confirmation
--
-- Le navigateur de l'habitant tire au hasard un identifiant qu'il garde pour
-- lui et joint à chaque dépôt ; la base n'en garde que l'empreinte salée
-- (calculée par le serveur, jamais servie à un navigateur). Un clic sur le
-- lien de confirmation transmet alors tous les dépôts en attente faits depuis
-- ce navigateur avec cette adresse, et les dépôts suivants partent sans
-- nouvelle confirmation tant qu'un signalement confirmé porte le même couple
-- adresse + empreinte. L'anonymisation efface l'empreinte avec l'adresse.
--
-- Aucun privilège de lecture n'est accordé à `authenticated` sur la colonne :
-- les grants par colonne de 20260806000000_participer.sql ne la couvrent pas.
--
-- Doc : docs/participer.md
-- ============================================================================

alter table public.participer_signalements
  add column if not exists appareil_hash text;

create index if not exists participer_signalements_appareil_idx
  on public.participer_signalements (ville, email, appareil_hash)
  where appareil_hash is not null;
