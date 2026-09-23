# Stockage public « uploads » : qui peut supprimer quoi

Relevé du 23 septembre 2026 pour la migration `supabase/migrations/20260923150000_uploads_suppression_restreinte.sql`, appliquée le même jour en production avec l'accord de Solal.

## Ce qui n'allait pas

La politique `uploads_delete_authenticated` de `storage.objects` autorisait tout compte connecté à supprimer n'importe quel fichier du compartiment public `uploads`. Les politiques permissives de Postgres s'additionnent : les règles plus étroites qui existaient à côté (`uploads_delete_authenticated_limited_paths`, `Admins can delete branding images`, `diagnostic_geojson_delete_admin`) ne limitaient donc rien. Un contributeur invité, ou n'importe quel compte ouvert par un lien d'inscription, pouvait effacer les couvertures et les tracés des projets publiés de toutes les villes, les fiches Markdown, les PDF de concertation, les logos et les couches du diagnostic. La carte publique perdrait alors ses tracés.

Deux autres restes ouvraient le même compartiment : `temp_anon_reimport_france` laissait n'importe qui, sans compte, déposer un fichier sous `geojson/projects/`, et `auth can update project geojson` laissait tout compte connecté écraser le tracé d'un projet publié. La migration `close_temp_anon_import_access` du 16 avril 2026 avait retiré une politique voisine, `temp_anon_import_france`, mais pas celle-ci.

## Suppressions faites par l'application

Les fonctions Netlify utilisent la clé de service et ne passent pas par ces politiques. Côté navigateur, deux parcours suppriment des fichiers :

- `deleteContribution` (`modules/supabaseservice.js`) retire les fichiers d'une contribution : `geojson/projects/`, `img/cover/`, `md/projects/` (et l'ancien `markdown/`), `pdfs/projects/`, et `demo/<espace>/` dans les espaces de démonstration. Il est déclenché dans l'administration par l'auteur de la contribution ou par un administrateur, comme le permettent `contrib_delete_owner` et `contrib_delete_admin` sur la table `contribution_uploads`.
- `deleteDiagnosticLayer` retire le fichier d'une couche du diagnostic : `uploads/diagnostic/<ville>/` pour les anciennes couches, le compartiment privé `diagnostic` pour les nouvelles. Les deux sont réservés à l'administrateur de la ville.

Aucun parcours ne supprime une image de marque ni ne remplace un fichier existant : tous les dépôts se font sans écrasement (`upsert: false`).

## Ce que change la migration

- Un contributeur ne supprime plus que les fichiers qu'il a déposés lui-même.
- Un administrateur supprime les fichiers d'une contribution, quelle que soit sa ville, comme il peut déjà supprimer la contribution elle-même.
- Quand le chemin porte la ville (logos `branding/<ville>/`, espaces de démonstration `demo/<espace>/`, couches du diagnostic), seul l'administrateur de cette ville ou l'administrateur global supprime.
- Personne ne dépose plus de fichier sans compte, et personne ne remplace plus le tracé d'un autre.
- Les images insérées dans l'article d'une contribution se déposent enfin : aucune règle ne couvrait `img/articles/`, et la base refusait ce dépôt même à un administrateur (essayé le 23/09/2026 avec le compte de test).

Rien ne change pour la création d'une contribution, ni pour la lecture publique des fichiers.

## Vérification

`tests/unauth.storage-policies.spec.js` rejoue les politiques de production (`tests/fixtures/storage-uploads-policies.sql`) et la migration dans une base PostgreSQL embarquée : il montre la faille avant la migration et chaque droit après. `tests/invited.contributions.spec.js` (2.8.6-2.8.7) et `tests/admin.contributions.spec.js` (2.9.1) vérifient sur la vraie base qu'un fichier disparaît quand son auteur, puis un administrateur, supprime la contribution. Ils passaient avant la migration et passent après son application (relancés le 23/09/2026).

## Points restants

- Tout administrateur peut supprimer la contribution d'une autre ville (`contrib_delete_admin`, sur la table). La migration garde la même règle pour les fichiers ; resserrer les deux par ville est un chantier à part.
- `uploads_read_public` permet de lister tout le compartiment par l'API. Aujourd'hui, une autre politique en erreur bloque ce listage sans compte, par accident ; une lecture publique limitée aux fichiers eux-mêmes suffirait.
