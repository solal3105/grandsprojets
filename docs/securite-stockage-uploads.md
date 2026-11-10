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

## Depuis le 10 novembre 2026 : un fichier suit son projet ou sa ville

Les deux points laissés ouverts le 23 septembre sont fermés par `supabase/migrations/20261110150000_fichiers_par_projet.sql`, appliquée en base le 10 novembre 2026.

La règle est écrite une seule fois, dans la fonction `can_write_upload` : par l'API, on supprime un fichier du compartiment, et on le lit ou on le liste, quand on a le droit de l'écrire.

- Quand le chemin porte la ville (`branding/<ville>/`, `demo/<espace>/`, `diagnostic/<ville>/`), ce sont ses administrateurs, comme avant.
- Le fichier d'un projet (tracé, couverture, fiche, PDF d'un dossier de concertation) se supprime par qui l'a déposé, ou par qui peut écrire le projet qui le désigne : son auteur ou un administrateur de sa ville (`can_write_contribution`, la même règle que pour les dossiers de concertation). Un administrateur d'une autre ville ne le supprime plus.
- Un fichier de projet que plus aucun projet ne désigne ne se supprime que par qui l'a déposé ou par un super administrateur.
- Le compartiment ne se liste plus par l'API : chacun n'y voit que les fichiers qu'il peut écrire. Aucun écran ne listait ces fichiers.

Ce qui ne change pas : les adresses publiques (`/object/public/`) ne traversent pas ces règles, les cartes, les fiches et les logos s'affichent comme avant ; le dépôt et le remplacement d'un fichier gardent leurs règles ; les fonctions serveur tiennent la clé de service.

Une conséquence pour le code : un fichier n'est rattaché à son projet que tant que la ligne du projet porte son adresse. `deleteContribution` retire donc les fichiers avant les dossiers, et les dossiers avant la ligne ; tout nouveau parcours de suppression garde cet ordre.

Essais : `supabase/tests/fichiers-par-projet.sql` rejoue sur une base locale les règles d'origine (`supabase/tests/socle-fichiers-local.sql`), montre les deux défauts, applique la migration et vérifie 61 cas, rôle par rôle. Après l'application, la lecture réelle de chacun des comptes de la base a été comparée à la liste attendue, calculée à part : aucune différence.
