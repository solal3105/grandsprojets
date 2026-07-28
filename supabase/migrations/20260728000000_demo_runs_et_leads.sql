-- Démo salon : journal des générations (succès ET échecs) + adresses laissées
-- en fin de parcours.
--
-- Pourquoi ce journal : `demo_instances` ne garde que l'état courant d'une
-- commune, et le chemin « redémarrage de zéro » supprime la ligne. Résultat,
-- seuls les succès survivaient : impossible de savoir combien de visiteurs se
-- sont pris un mur, sur quelle étape, ni combien de temps une démo prend
-- réellement (`demo_instances.duration_ms` ne mesure que la dernière étape).
--
-- Les deux tables sont en RLS SANS aucune politique : elles ne sont lisibles
-- et écrivables que par la clé de service, côté serveur. Une adresse laissée
-- par un élu au salon n'a rien à faire derrière la clé publique.

-- ─────────────────────────────────────────────────────────────────────────────
-- Journal des générations : une ligne par tentative, close en succès ou en échec
-- ─────────────────────────────────────────────────────────────────────────────
create table public.demo_runs (
  id uuid primary key default gen_random_uuid(),
  commune_insee text not null,
  commune_nom text not null default '',
  ville text,
  -- running : la génération est partie et n'a jamais été close. C'est le cas
  -- d'un visiteur qui abandonne ou d'un onglet fermé : l'information vaut
  -- autant qu'un échec déclaré.
  status text not null default 'running'
    check (status in ('running', 'ready', 'failed')),
  -- Dernière étape entamée : sources, ai, locate, media, redact, create
  phase text not null default 'sources',
  -- Motif d'échec lisible (le message envoyé à l'écran), tronqué à l'écriture
  error_message text,
  projects_count integer,
  sources_count integer,
  tokens_in integer not null default 0,
  tokens_out integer not null default 0,
  ia_calls integer not null default 0,
  ip_hash text,
  kiosk boolean not null default false,
  -- Relance volontaire sur une commune déjà générée (bouton « Refaire le
  -- recensement » ou lien ?regen=1)
  regen boolean not null default false,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_ms integer
);

create index demo_runs_started_at_idx on public.demo_runs (started_at desc);
create index demo_runs_status_idx on public.demo_runs (status);
create index demo_runs_insee_idx on public.demo_runs (commune_insee);

alter table public.demo_runs enable row level security;

comment on table public.demo_runs is
  'Démo salon : une ligne par génération tentée, succès comme échec. Écrit uniquement par la clé de service (netlify/functions/demo-generate.mjs).';

-- ─────────────────────────────────────────────────────────────────────────────
-- Adresses laissées en fin de démo
-- ─────────────────────────────────────────────────────────────────────────────
create table public.demo_leads (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  commune_insee text not null default '',
  commune_nom text not null default '',
  ville text,
  projects_count integer,
  -- Adresse de l'espace généré, pour la relance
  space_url text,
  ip_hash text,
  kiosk boolean not null default false,
  run_id uuid references public.demo_runs (id) on delete set null,
  created_at timestamptz not null default now()
);

create index demo_leads_created_at_idx on public.demo_leads (created_at desc);
create index demo_leads_email_idx on public.demo_leads (lower(email));

alter table public.demo_leads enable row level security;

comment on table public.demo_leads is
  'Démo salon : adresses laissées sur l''écran de fin. RLS sans politique : lisible uniquement par la clé de service.';
