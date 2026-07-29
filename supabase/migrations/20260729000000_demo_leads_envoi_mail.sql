-- Démo salon : suivi de l'envoi du message au visiteur qui laisse son adresse.
--
-- Sans ces colonnes, on savait qu'une adresse avait été laissée mais pas si le
-- message était parti, ni pourquoi il ne l'était pas. Un envoi raté est
-- silencieux pour le visiteur : il attend un lien qui n'arrive jamais.

alter table public.demo_leads
  -- non_configure : aucune clé de fournisseur d'e-mail dans l'environnement.
  -- C'est l'état par défaut tant que l'envoi n'est pas branché.
  add column if not exists mail_status text not null default 'non_configure'
    check (mail_status in ('non_configure', 'envoye', 'echec')),
  add column if not exists mail_error text,
  add column if not exists mail_sent_at timestamptz;

create index if not exists demo_leads_mail_status_idx on public.demo_leads (mail_status);

comment on column public.demo_leads.mail_status is
  'Etat de l envoi du message au visiteur : non_configure, envoye ou echec.';
