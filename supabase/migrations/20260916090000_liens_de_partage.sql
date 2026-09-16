-- Les liens de partage de l'équipe commerciale (page /lien).
--
-- Un commercial colle l'adresse qu'il veut partager, choisit son support, son
-- opération et son prénom ; la page lui rend une adresse marquée (utm_source,
-- utm_medium, utm_campaign, utm_content) que PostHog reconnaît à l'arrivée du
-- visiteur. Il peut aussi demander une adresse courte : c'est cette table.
--
-- Le code est la fin de l'adresse courte (openprojets.com/l/amif-2026), la
-- cible est l'adresse marquée complète. Rien d'autre : les statistiques de
-- clics viennent de PostHog, pas d'un compteur ici.
--
-- Écriture réservée à la clé de service (fonction netlify/functions/lien-court.mjs,
-- qui vérifie le domaine de la cible). Lecture ouverte : l'edge function qui
-- résout /l/{code} lit avec la clé publique, et une adresse courte n'a rien de
-- secret.

create table if not exists public.share_links (
  code        text primary key
              check (code ~ '^[a-z0-9][a-z0-9-]{1,39}$'),
  target_url  text not null
              check (length(target_url) <= 2000),
  label       text,
  author      text,
  created_at  timestamptz not null default now()
);

comment on table public.share_links is
  'Adresses courtes openprojets.com/l/{code} créées depuis la page /lien : code, adresse marquée complète, nom de l''opération et prénom du commercial. Les clics se comptent dans PostHog.';

alter table public.share_links enable row level security;

-- Lecture publique : la résolution de /l/{code} se fait avec la clé publique.
drop policy if exists "share_links_select_public" on public.share_links;
create policy "share_links_select_public"
  on public.share_links
  for select
  using (true);

-- Aucune politique d'écriture : seule la clé de service insère, après avoir
-- vérifié que la cible est bien une adresse à nous.

create index if not exists share_links_created_at_idx
  on public.share_links (created_at desc);
