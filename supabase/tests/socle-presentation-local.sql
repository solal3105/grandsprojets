-- Socle local des essais sur les valeurs de présentation : les six tables que
-- socle-ecritures-local.sql ne crée pas, réduites aux colonnes que la
-- migration 20261110180000 regarde (relevé en base du 10/11/2026).
-- Joué après socle-ecritures-local.sql, jamais sur le projet Supabase.

create table public.participer_categories (
  id           uuid primary key default gen_random_uuid(),
  ville        text not null,
  category_key text not null,
  icon_class   text not null,
  color        text not null
);
create table public.participer_statuts (
  id         uuid primary key default gen_random_uuid(),
  ville      text not null,
  statut_key text not null,
  color      text not null
);
create table public.layers (
  id         serial primary key,
  name       text not null,
  style      jsonb not null default '{}',
  ville      text,
  icon       text,
  icon_color text
);
create table public.city_travaux (
  id    uuid primary key default gen_random_uuid(),
  ville text not null,
  name  text not null,
  icon  text
);
create table public.filter_items (
  id   text primary key,
  icon text not null
);
create table public.basemaps_v2 (
  name text primary key,
  icon text
);

-- Deux colonnes que les essais d'écriture n'avaient pas eu besoin de créer.
alter table public.city_modules add column icon_class text not null default 'fa-solid fa-layer-group';
alter table public.category_icons add column category_styles jsonb;
