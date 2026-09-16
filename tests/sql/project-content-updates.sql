-- Après la migration des dates éditoriales, dans PostgreSQL ou PGlite.
-- La table temporaire n'écrit aucune fiche dans la base de l'application.
begin;
create temporary table seo_date_test as
  select * from public.contribution_uploads with no data;
create trigger seo_date_test_update
  before insert or update on seo_date_test
  for each row execute function public.track_project_content_update();

do $$
declare
  changed_at timestamptz;
  actual_at timestamptz;
begin
  insert into seo_date_test (project_name, created_at, description, meta)
    values ('Test date SEO', '2025-01-01T00:00:00Z', 'Avant.', '{"etat":"prévu"}');
  select content_updated_at into actual_at from seo_date_test;
  assert actual_at = '2025-01-01T00:00:00Z'::timestamptz, 'Insertion : date de création';

  update seo_date_test set description = description;
  select content_updated_at into actual_at from seo_date_test;
  assert actual_at = '2025-01-01T00:00:00Z'::timestamptz, 'Sauvegarde identique : date inchangée';

  update seo_date_test set description = 'Après.';
  select content_updated_at into changed_at from seo_date_test;
  assert changed_at = now(), 'Modification éditoriale : date courante';
  assert (select created_at = '2025-01-01T00:00:00Z'::timestamptz from seo_date_test), 'Publication conservée';

  update seo_date_test set content_updated_at = '2099-01-01';
  select content_updated_at into actual_at from seo_date_test;
  assert actual_at = changed_at, 'Une date envoyée par le client est ignorée';

  -- Simuler une ligne antérieure à la migration : son historique est inconnu.
  alter table seo_date_test disable trigger seo_date_test_update;
  update seo_date_test set content_updated_at = null;
  alter table seo_date_test enable trigger seo_date_test_update;
  update seo_date_test set description = description;
  assert (select content_updated_at is null from seo_date_test), 'Ancienne ligne intacte : pas de date inventée';
  update seo_date_test set meta = '{"etat":"terminé"}';
  assert (select content_updated_at = now() from seo_date_test), 'Un changement de statut public met à jour la date';
end;
$$;
rollback;
