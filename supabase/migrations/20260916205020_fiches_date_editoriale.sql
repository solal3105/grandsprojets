-- Date de dernière modification du contenu public d'une fiche.
-- Les anciennes lignes restent à NULL : leur historique n'est pas connu,
-- le sitemap et le JSON-LD utilisent alors created_at, jamais la date du jour.
begin;

alter table public.contribution_uploads
  add column if not exists content_updated_at timestamptz;

comment on column public.contribution_uploads.content_updated_at is
  'Dernière modification éditoriale, tenue par trigger. NULL si historique inconnu.';

create or replace function public.track_project_content_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    new.content_updated_at := coalesce(new.created_at, now());
  elsif row(new.project_name, new.description, new.category, new.category_slug,
            new.slug, new.ville, new.markdown_url, new.cover_url, new.geojson_url,
            new.official_url, to_jsonb(new.meta), to_jsonb(new.tags), new.approved)
    is distinct from
        row(old.project_name, old.description, old.category, old.category_slug,
            old.slug, old.ville, old.markdown_url, old.cover_url, old.geojson_url,
            old.official_url, to_jsonb(old.meta), to_jsonb(old.tags), old.approved) then
    new.content_updated_at := now();
  else
    -- Une sauvegarde identique ou une date envoyée par le client ne rajeunit
    -- pas la fiche. Les écritures via l'admin, les imports et SQL sont couvertes.
    new.content_updated_at := old.content_updated_at;
  end if;
  return new;
end;
$$;

drop trigger if exists contribution_content_updated on public.contribution_uploads;
create trigger contribution_content_updated
  before insert or update on public.contribution_uploads
  for each row execute function public.track_project_content_update();

commit;
