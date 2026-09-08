-- Un espace peut être retiré des moteurs de recherche sans être fermé :
-- city_branding.indexable à false, et le plan du site, le plan pour les IA,
-- les fiches et la page ville de cet espace passent en « noindex ». La carte
-- et les fiches restent consultables par lien.
--
-- Pourquoi : Search Console (8 septembre 2026) montre que Google n'indexe
-- qu'une petite part des 2 700 pages proposées, et écarte d'abord les fiches
-- courtes ou générées. Le hub national « france » (974 fiches importées le
-- 16 avril 2026, dont des centaines en double) diluait le budget d'exploration
-- des espaces des collectivités.

alter table public.city_branding
  add column if not exists indexable boolean not null default true;

comment on column public.city_branding.indexable is
  'false : l''espace est servi en noindex et absent du sitemap et de llms.txt';

update public.city_branding set indexable = false where ville = 'france';
