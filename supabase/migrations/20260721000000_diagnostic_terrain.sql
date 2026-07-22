-- Module « Diagnostic terrain » : couches de données agrégées par ville + rapports d'analyse.
-- Appliquée sur le projet Supabase de production (voir historique des migrations MCP).

-- Helper RLS générique : l'utilisateur est admin de cette ville (ou admin global).
create or replace function public.is_admin_for_ville(ville_param text)
returns boolean
language plpgsql
stable security definer
as $$
declare
  v_role  text;
  v_villes text[];
begin
  select role, ville
    into v_role, v_villes
    from public.profiles
   where id = auth.uid();

  if v_role is null or v_role <> 'admin' then
    return false;
  end if;

  if 'global' = any(v_villes) then
    return true;
  end if;

  return ville_param = any(v_villes);
end;
$$;

-- Configuration des couches du diagnostic (une ligne = une source de données d'une ville).
create table public.diagnostic_layers (
  id uuid primary key default gen_random_uuid(),
  ville text not null,
  label text not null,
  group_label text not null default '',
  source_type text not null default 'url'
    check (source_type in ('url', 'storage', 'internal')),
  source_ref text not null,
  style jsonb not null default '{}'::jsonb,
  popup jsonb not null default '{}'::jsonb,
  ai_context text not null default '',
  polarity text not null default 'neutre'
    check (polarity in ('negatif', 'neutre', 'positif')),
  default_on boolean not null default true,
  enabled boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.diagnostic_layers is
  'Couches de données du module admin Diagnostic terrain. source_type: url (GeoJSON distant), storage (fichier importé, normalisé en GeoJSON), internal (source Open Projets : contributions | travaux). style/popup: config d''affichage JSONB. ai_context + polarity alimentent l''analyse IA de zone.';

create index diagnostic_layers_ville_idx on public.diagnostic_layers (ville, sort_order);

-- Rapports de diagnostic générés (historique par ville).
create table public.diagnostic_reports (
  id uuid primary key default gen_random_uuid(),
  ville text not null,
  title text not null default '',
  zone jsonb not null default '{}'::jsonb,
  stats jsonb not null default '{}'::jsonb,
  analysis jsonb not null default '{}'::jsonb,
  point_count integer not null default 0,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.diagnostic_reports is
  'Diagnostics de zone sauvegardés (module Diagnostic terrain). zone: polygone + emprise ; stats: ventilation déterministe ; analysis: résumé + constats IA.';

create index diagnostic_reports_ville_idx on public.diagnostic_reports (ville, created_at desc);

-- RLS : outil admin uniquement, cloisonné par ville.
alter table public.diagnostic_layers enable row level security;
alter table public.diagnostic_reports enable row level security;

create policy diagnostic_layers_select_admin on public.diagnostic_layers
  for select to authenticated using (is_admin_for_ville(ville));
create policy diagnostic_layers_insert_admin on public.diagnostic_layers
  for insert to authenticated with check (is_admin_for_ville(ville));
create policy diagnostic_layers_update_admin on public.diagnostic_layers
  for update to authenticated using (is_admin_for_ville(ville)) with check (is_admin_for_ville(ville));
create policy diagnostic_layers_delete_admin on public.diagnostic_layers
  for delete to authenticated using (is_admin_for_ville(ville));

create policy diagnostic_reports_select_admin on public.diagnostic_reports
  for select to authenticated using (is_admin_for_ville(ville));
create policy diagnostic_reports_insert_admin on public.diagnostic_reports
  for insert to authenticated with check (is_admin_for_ville(ville));
create policy diagnostic_reports_delete_admin on public.diagnostic_reports
  for delete to authenticated using (is_admin_for_ville(ville));

-- Durcissement : search_path figé pour le helper RLS (lint 0011).
alter function public.is_admin_for_ville(text) set search_path = public;

-- Storage : dépôt des GeoJSON normalisés dans uploads/diagnostic/<ville>/…
-- réservé aux admins de la ville (même pattern que travaux-geojson).
create policy diagnostic_geojson_insert_admin on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'uploads'
    and (storage.foldername(name))[1] = 'diagnostic'
    and public.is_admin_for_ville((storage.foldername(name))[2])
  );

-- Le diagnostic ne qualifie plus les couches (négatif/neutre/positif) :
-- l'analyse restitue ce que disent les points, sans jugement de valeur.
alter table public.diagnostic_layers drop constraint if exists diagnostic_layers_polarity_check;
alter table public.diagnostic_layers drop column if exists polarity;
