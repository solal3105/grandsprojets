-- ============================================================================
-- MODULE PARTICIPER - signalements citoyens
--
-- Troisième module de la carte, aux côtés de « carte » et « travaux ». Les
-- habitants déposent sans compte ; la collectivité modère, traite et répond.
--
-- Principe de sécurité : ces tables n'ont AUCUNE policy anonyme. Toute écriture
-- publique passe par les fonctions Netlify avec la clé de service (pattern
-- demo_runs), la lecture d'équipe passe par la RLS. Les colonnes sensibles
-- (email du signaleur, empreinte de connexion, jetons) sont en outre refusées
-- au rôle `authenticated` par des privilèges par colonne : la policy laisse
-- passer tout membre d'équipe d'une ville, or le jeton de suivi est un porteur
-- permanent qui donne accès au signalement privé de l'habitant.
--
-- Doc : docs/participer.md
-- ============================================================================

-- ─── Référentiels administrables par ville ──────────────────────────────────

create table if not exists public.participer_categories (
  id uuid primary key default gen_random_uuid(),
  ville text not null check (ville <> ''),
  category_key text not null check (category_key ~ '^[a-z0-9-]+$'),
  label text not null,
  icon_class text not null default 'fa-solid fa-circle-exclamation',
  color text not null default '#14AE5C',
  help_text text,
  sort_order integer not null default 0,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ville, category_key)
);

-- Les 7 clés de statut sont FIXES : emails, filtres et statistiques en
-- dépendent. Seul l'affichage (libellé, couleur, ordre, notification) est
-- administrable - c'est la leçon de l'incohérence des états du module travaux.
create table if not exists public.participer_statuts (
  id uuid primary key default gen_random_uuid(),
  ville text not null check (ville <> ''),
  statut_key text not null check (statut_key in ('nouveau','pris_en_compte','en_cours','resolu','rejete','hors_competence','doublon')),
  label text not null,
  color text not null,
  sort_order integer not null default 0,
  notify boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (ville, statut_key)
);

create table if not exists public.participer_settings (
  ville text primary key check (ville <> ''),
  intro_text text,
  success_text text,
  notify_email text,
  paused boolean not null default false,
  pause_message text,
  quota_email_jour integer not null default 5,
  quota_ip_jour integer not null default 20,
  alerte_jours integer not null default 7,
  retention_mois integer not null default 12,
  last_alert_at timestamptz,
  updated_at timestamptz not null default now()
);

-- ─── Signalements et historique ─────────────────────────────────────────────

create table if not exists public.participer_signalements (
  id uuid primary key default gen_random_uuid(),
  ville text not null check (ville <> ''),
  reference text not null,
  category_key text not null,
  statut_key text not null default 'nouveau' check (statut_key in ('nouveau','pris_en_compte','en_cours','resolu','rejete','hors_competence','doublon')),
  description text check (char_length(description) <= 1000),
  photo_path text,
  photo_url text,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  adresse text check (char_length(adresse) <= 300),
  email text,
  email_confirmed boolean not null default false,
  confirm_token uuid not null default gen_random_uuid(),
  suivi_token uuid not null default gen_random_uuid(),
  ip_hash text,
  published boolean not null default false,
  doublon_de uuid references public.participer_signalements(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  confirmed_at timestamptz,
  closed_at timestamptz,
  anonymized_at timestamptz,
  unique (ville, reference)
);

create index if not exists participer_signalements_ville_statut_idx on public.participer_signalements (ville, statut_key);
create index if not exists participer_signalements_ville_published_idx on public.participer_signalements (ville, published);
create unique index if not exists participer_signalements_confirm_token_idx on public.participer_signalements (confirm_token);
create unique index if not exists participer_signalements_suivi_token_idx on public.participer_signalements (suivi_token);

-- `signalement_id` est nullable avec ON DELETE SET NULL : la trace de
-- suppression doit survivre à la suppression du signalement, sinon plus
-- personne ne sait qui a supprimé quoi.
create table if not exists public.participer_events (
  id uuid primary key default gen_random_uuid(),
  signalement_id uuid references public.participer_signalements(id) on delete set null,
  ville text not null,
  type text not null,
  old_statut text,
  new_statut text,
  message_public text,
  contact_email text,
  author_ip_hash text,
  author uuid,
  created_at timestamptz not null default now()
);

create index if not exists participer_events_signalement_idx on public.participer_events (signalement_id, created_at);
create index if not exists participer_events_retrait_idx on public.participer_events (ville, type, created_at);

-- Références lisibles par l'habitant : LYO-2026-0042
create table if not exists public.participer_compteurs (
  ville text not null,
  annee integer not null,
  n integer not null default 0,
  primary key (ville, annee)
);

-- ─── updated_at automatiques ────────────────────────────────────────────────

drop trigger if exists participer_categories_updated_at on public.participer_categories;
create trigger participer_categories_updated_at before update on public.participer_categories
  for each row execute function moddatetime('updated_at');
drop trigger if exists participer_statuts_updated_at on public.participer_statuts;
create trigger participer_statuts_updated_at before update on public.participer_statuts
  for each row execute function moddatetime('updated_at');
drop trigger if exists participer_settings_updated_at on public.participer_settings;
create trigger participer_settings_updated_at before update on public.participer_settings
  for each row execute function moddatetime('updated_at');
drop trigger if exists participer_signalements_updated_at on public.participer_signalements;
create trigger participer_signalements_updated_at before update on public.participer_signalements
  for each row execute function moddatetime('updated_at');

-- ─── RLS : lecture d'équipe, aucune écriture publique ───────────────────────

alter table public.participer_categories enable row level security;
alter table public.participer_statuts enable row level security;
alter table public.participer_settings enable row level security;
alter table public.participer_signalements enable row level security;
alter table public.participer_events enable row level security;
alter table public.participer_compteurs enable row level security;

drop policy if exists participer_categories_admin_all on public.participer_categories;
create policy participer_categories_admin_all on public.participer_categories
  for all using (is_admin_for_ville(ville)) with check (is_admin_for_ville(ville));
drop policy if exists participer_categories_contrib_read on public.participer_categories;
create policy participer_categories_contrib_read on public.participer_categories
  for select using (is_contributor_for_ville(ville));

drop policy if exists participer_statuts_admin_all on public.participer_statuts;
create policy participer_statuts_admin_all on public.participer_statuts
  for all using (is_admin_for_ville(ville)) with check (is_admin_for_ville(ville));
drop policy if exists participer_statuts_contrib_read on public.participer_statuts;
create policy participer_statuts_contrib_read on public.participer_statuts
  for select using (is_contributor_for_ville(ville));

drop policy if exists participer_settings_admin_all on public.participer_settings;
create policy participer_settings_admin_all on public.participer_settings
  for all using (is_admin_for_ville(ville)) with check (is_admin_for_ville(ville));

drop policy if exists participer_signalements_equipe_read on public.participer_signalements;
create policy participer_signalements_equipe_read on public.participer_signalements
  for select using (is_admin_for_ville(ville) or is_contributor_for_ville(ville));

drop policy if exists participer_events_equipe_read on public.participer_events;
create policy participer_events_equipe_read on public.participer_events
  for select using (is_admin_for_ville(ville) or is_contributor_for_ville(ville));

-- ─── Privilèges par colonne ─────────────────────────────────────────────────
-- La policy ci-dessus laisse passer tout membre d'équipe (is_contributor_for_ville
-- ne teste aucun rôle). Sans ces grants, un compte contributeur lirait l'email
-- de chaque habitant et son jeton de suivi. Le serveur passe par la clé de
-- service, non concernée.

revoke select on public.participer_signalements from anon, authenticated;
grant select (
  id, ville, reference, category_key, statut_key, description,
  photo_path, photo_url, lat, lng, adresse, email_confirmed,
  published, doublon_de, created_at, updated_at, confirmed_at,
  closed_at, anonymized_at
) on public.participer_signalements to authenticated;

revoke select on public.participer_events from anon, authenticated;
grant select (
  id, signalement_id, ville, type, old_statut, new_statut,
  message_public, author, created_at
) on public.participer_events to authenticated;

-- ─── Fonctions ──────────────────────────────────────────────────────────────

-- Référence atomique par ville et par année. SECURITY INVOKER volontaire :
-- seule la clé de service passe la RLS de participer_compteurs.
create or replace function public.participer_next_reference(p_ville text)
returns text
language plpgsql
as $function$
declare
  v_annee integer := extract(year from now())::integer;
  v_n integer;
  v_prefix text;
begin
  insert into public.participer_compteurs as c (ville, annee, n)
  values (p_ville, v_annee, 1)
  on conflict (ville, annee) do update set n = c.n + 1
  returning n into v_n;
  v_prefix := upper(left(regexp_replace(p_ville, '[^a-z0-9]', '', 'g'), 3));
  return v_prefix || '-' || v_annee || '-' || lpad(v_n::text, 4, '0');
end;
$function$;

-- Seed idempotent, appelé à l'activation du module pour une ville. C'est LA
-- source des libellés, icônes, couleurs et ordres par défaut : le code
-- applicatif n'en garde aucune copie.
-- Les catégories de départ sont orientées projets et chantiers, pas voirie
-- générique : le module se veut complément d'une gestion de relation citoyen
-- existante, pas son doublon.
create or replace function public.participer_seed_ville(p_ville text)
returns void
language plpgsql
as $function$
begin
  insert into public.participer_statuts (ville, statut_key, label, color, sort_order, notify) values
    (p_ville, 'nouveau',         'Reçu',                   '#2563EB', 1, false),
    (p_ville, 'pris_en_compte',  'Pris en compte',         '#2563EB', 2, true),
    (p_ville, 'en_cours',        'En cours de traitement', '#F59E0B', 3, true),
    (p_ville, 'resolu',          'Résolu',                 '#10B981', 4, true),
    (p_ville, 'rejete',          'Non retenu',             '#6B7280', 5, true),
    (p_ville, 'hors_competence', 'Hors compétence',        '#6B7280', 6, true),
    (p_ville, 'doublon',         'Doublon',                '#6B7280', 7, false)
  on conflict (ville, statut_key) do nothing;

  insert into public.participer_categories (ville, category_key, label, icon_class, color, sort_order) values
    (p_ville, 'chantier',      'Problème sur un chantier',       'fa-solid fa-person-digging',       '#F59E0B', 1),
    (p_ville, 'cheminement',   'Cheminement coupé ou dangereux', 'fa-solid fa-person-walking',       '#EF4444', 2),
    (p_ville, 'signaletique',  'Signalétique manquante',         'fa-solid fa-triangle-exclamation', '#2563EB', 3),
    (p_ville, 'accessibilite', 'Accessibilité',                  'fa-solid fa-wheelchair',           '#2563EB', 4),
    (p_ville, 'idee',          'Idée sur un aménagement',        'fa-solid fa-lightbulb',            '#14AE5C', 5),
    (p_ville, 'autre',         'Autre',                          'fa-solid fa-circle-question',      '#6B7280', 6)
  on conflict (ville, category_key) do nothing;

  insert into public.participer_settings (ville) values (p_ville)
  on conflict (ville) do nothing;
end;
$function$;

-- ─── Storage ────────────────────────────────────────────────────────────────
-- Bucket PRIVÉ, sans aucune policy : les photos ne sont lisibles que par la clé
-- de service, qui en sert des URL signées à l'équipe. À la publication, la
-- photo est recopiée dans le bucket public `uploads` sous `participer/`.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('participer-photos', 'participer-photos', false, 4194304, array['image/webp','image/jpeg','image/png'])
on conflict (id) do nothing;
