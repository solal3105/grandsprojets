-- Démo : relance personnelle deux jours ouvrés après la génération.
--
-- Une seule relance par adresse, jamais de séquence. L'état est consigné sur
-- la ligne du lead pour qu'une relance ne parte jamais deux fois, et pour
-- savoir pourquoi une adresse n'a pas été relancée (équipe, doublon, adresse
-- factice, personne qui nous a déjà écrit).

alter table public.demo_leads
  -- a_faire : en attente de son échéance. ignore : écartée, motif dans
  -- followup_reason. envoye / echec : issue de l'envoi.
  add column if not exists followup_status text not null default 'a_faire'
    check (followup_status in ('a_faire', 'envoye', 'echec', 'ignore')),
  add column if not exists followup_reason text,
  add column if not exists followup_sent_at timestamptz;

create index if not exists demo_leads_followup_status_idx on public.demo_leads (followup_status);

-- Pas d'envoi rétroactif : les adresses laissées avant la mise en service ne
-- reçoivent pas une relance qui arriverait des semaines après leur démo.
update public.demo_leads
  set followup_status = 'ignore', followup_reason = 'avant la mise en service'
  where followup_status = 'a_faire';

comment on column public.demo_leads.followup_status is
  'Relance personnelle J+2 ouvrés : a_faire, envoye, echec ou ignore (motif dans followup_reason).';
