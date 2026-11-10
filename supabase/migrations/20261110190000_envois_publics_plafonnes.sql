-- LES E-MAILS DEMANDÉS SANS COMPTE : UN PLAFOND TENU PAR LA BASE.
--
-- Deux formulaires publics envoient un message à l'adresse qu'on leur donne :
-- le lien d'une carte de démonstration (/api/demo-lead) et l'estimation de
-- /tarification (/api/tarif-lead). L'adresse peut être celle d'un tiers. Trois
-- plafonds sur vingt-quatre heures glissantes, par formulaire :
--   - ce qu'une même origine peut demander, messages partis ou non ;
--   - les messages qu'une même adresse peut recevoir ;
--   - les messages que le formulaire entier peut envoyer.
--
-- La fonction serveur inscrit chaque demande ici avant d'agir, et la base lui
-- dit quoi en faire. Le décompte et l'inscription se font sous verrou : deux
-- demandes simultanées ne passent pas ensemble sous un plafond. Les plafonds
-- sont donnés par l'appelant, qui tient la clé de service ; le navigateur
-- n'atteint ni la table ni la fonction.
--
-- Le journal ne garde ni l'adresse du destinataire ni l'adresse IP : seulement
-- leurs empreintes, trente jours.

create table if not exists public.public_mail_requests (
  id             bigint generated always as identity primary key,
  kind           text not null,
  ip_hash        text not null,
  recipient_hash text not null,
  sent           boolean not null,
  created_at     timestamptz not null default now()
);
comment on table public.public_mail_requests is
  'Journal des e-mails demandés sans compte (lien d''une démonstration, estimation tarifaire) : une ligne par demande acceptée, sent disant si son message a pu partir. Empreintes seulement, trente jours. Écrit par reserve_public_mail, clé de service.';

create index if not exists public_mail_requests_kind_created_at on public.public_mail_requests (kind, created_at);

alter table public.public_mail_requests enable row level security;
revoke all on table public.public_mail_requests from public, anon, authenticated;

create or replace function public.reserve_public_mail(
  p_kind          text,
  p_ip_hash       text,
  p_recipient     text,
  p_max_ip        integer,
  p_max_recipient integer,
  p_max_total     integer
)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_recipient text := encode(sha256(convert_to(lower(btrim(p_recipient)), 'UTF8')), 'hex');
  v_status    text;
  n_ip        integer;
  n_recipient integer;
  n_total     integer;
begin
  -- Un appel à la fois par formulaire, jusqu'à la fin de la transaction.
  perform pg_advisory_xact_lock(hashtext('reserve_public_mail:' || p_kind));

  delete from public.public_mail_requests where created_at < now() - interval '30 days';

  select count(*) filter (where ip_hash = p_ip_hash),
         count(*) filter (where sent and recipient_hash = v_recipient),
         count(*) filter (where sent)
    into n_ip, n_recipient, n_total
    from public.public_mail_requests
   where kind = p_kind and created_at > now() - interval '24 hours';

  -- Une origine au plafond : sa demande est ignorée, et rien ne s'inscrit.
  if n_ip >= p_max_ip then return 'ip'; end if;

  -- Sinon la demande est acceptée et comptée pour son origine, que son message
  -- puisse partir ou non.
  v_status := case
    when n_recipient >= p_max_recipient then 'recipient'
    when n_total >= p_max_total then 'total'
    else 'reserved'
  end;
  insert into public.public_mail_requests (kind, ip_hash, recipient_hash, sent)
  values (p_kind, p_ip_hash, v_recipient, v_status = 'reserved');
  return v_status;
end;
$$;
comment on function public.reserve_public_mail(text, text, text, integer, integer, integer) is
  'Inscrit une demande d''e-mail faite sans compte et dit quoi en faire, sur les dernières vingt-quatre heures : reserved (le message peut partir), recipient ou total (demande à garder sans message : cette adresse ou ce formulaire a atteint son plafond de messages), ip (demande à ignorer : cette origine a atteint son plafond de demandes). Clé de service seulement.';

revoke execute on function public.reserve_public_mail(text, text, text, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.reserve_public_mail(text, text, text, integer, integer, integer) to service_role;
