# Diagnostic terrain : ce que porte chaque entité des couches automatiques

Inventaire, source par source, de ce qu'une entité (un point, un tronçon, une zone) transporte une fois importée par le catalogue « Ajouter des données », et de ce que la source propose en plus sans que nous le gardions. Il sert de base à la refonte de l'affichage au clic. Les noms de champs sont ceux enregistrés dans la couche (propriétés GeoJSON).

## Vos modules Open Projets

### Signalements des habitants (module Participer)
Points, synchronisés (relus à chaque ouverture). Champs : `reference` (numéro du signalement), `category_label` avec `category_icon` et `category_color`, `statut_label` avec `statut_color`, `description` (texte de l'habitant), `photo_url`, `adresse`, `created_at`, `updated_at`. Lecture par l'IA : témoignages (la description est citée). Non gardé : rien, tout ce qui est public est là ; l'adresse mail et les jetons ne sortent jamais.

### Projets publiés (module Carte)
Géométrie du projet (point, tracé ou emprise selon le projet), synchronisés. Champs : `project_name`, `category`, `cover_url` (vignette). Un projet à plusieurs entités les partage. Non gardé mais disponible dans la fiche : description, lien officiel, étiquettes, page fiche publique.

### Travaux en cours (module Travaux)
Géométrie du chantier, synchronisés. Champs : `chantier_id`, `project_name` (nom du chantier), `nature_travaux`, `etat`, `date_debut`, `date_fin`, `last_update`, `description`, `icon`, `approved`, `commune`, `adresse`, `code_insee`.

## Données publiques sur votre territoire

### Baromètre vélo (FUB)
Trois couches de points, une édition (2025, 2021…), par commune ou intercommunalité. Champ unique : `description`, le commentaire du cycliste mot pour mot (souvent vide sur les « améliorations constatées »). Lecture par l'IA : témoignages. Non gardé : les codes de rattachement (commune, EPCI, département, région, identiques pour toute la couche). Disponible dans l'archive mais non exploité : les regroupements (zones « points noirs » et « stationnements » avec nombre de contributions et part du total), le tableau complet des réponses au questionnaire, les résultats de classement de la commune.

### Aménagements cyclables (OpenStreetMap)
Tronçons (lignes). Champs : `type` (piste cyclable, bande cyclable, voie verte, zone de rencontre, voie bus ouverte aux vélos, chaussée partagée, contresens), `nom` (rue), `sens_unique` (oui/non), `revetement`, `osm_id`. Référence : compte de tronçons par zone. Disponible dans OpenStreetMap mais non gardé : largeur, éclairage, limitation de vitesse de la rue, séparation physique, date de dernière modification.

### Accidents corporels (fichier national BAAC)
Points, une période (une à toutes les années depuis 2019). Champs : `numero`, `annee`, `date` (JJ/MM/AAAA), `heure`, `gravite` (la plus élevée : tué, blessé hospitalisé, blessé léger, indemne), `usagers` (nombre de personnes impliquées), `tues`, `blesses_hospitalises`, `blesses_legers`, `pietons` (nombre) et `pieton` (oui/non), `velo`, `trottinette`, `deux_roues_motorise`, `voiture`, `poids_lourd`, `transport_en_commun` (oui/non chacun), `lumiere`, `agglomeration` (oui/non), `intersection` (type), `meteo`, `adresse`, `commune`. Référence : tués, blessés et usagers par zone. Disponible dans le fichier mais non gardé : le type de collision, la catégorie de route et la vitesse limite, le nombre de voies et l'état de la surface (table lieux), pour chaque victime son sexe, son année de naissance, le motif du trajet et l'équipement de sécurité, pour chaque véhicule la manœuvre et l'obstacle heurté.

### Compteurs vélo (pages publiques Eco-Compteur)
Points. Champs : `nom`, `type` (vélos, piétons, mixte), `moyenne_journaliere`, `hier` (passages de la veille), `total_depuis_la_pose`, `installe_le`, `releve_le`, `organisme` (gestionnaire), `id_compteur`. Référence : cumul des passages journaliers par zone. Disponible mais non gardé : les photos du compteur, l'adresse de la page publique du gestionnaire, les identifiants par sens de passage. Non accessible publiquement : l'historique jour par jour.

## Données qui demandent un compte

### Flux cyclistes Strava Metro
Tronçons de rue, une année. Champs gardés par la recette : `edgeUID` (identifiant du tronçon), `total_trip_count`, `forward_trip_count` et `reverse_trip_count` (par sens), `forward_commute_trip_count` et `reverse_commute_trip_count` (trajets domicile-travail), `forward_average_speed_meters_per_second` et `reverse_average_speed_meters_per_second`, `ebike_ride_count`. Référence : total des passages, part de vélos électriques, vitesse moyenne par zone. Disponible dans l'export mais non gardé : le nombre de personnes distinctes, les trajets de loisir, la répartition par moment de la journée (matin, midi, soir, nuit), par genre (hommes, femmes, non précisé) et par tranche d'âge (18-34, 35-54, 55-64, 65 et plus), l'identifiant OpenStreetMap du tronçon, le nombre de trajets à vélo classique. Toutes les années de l'export sont dans le tableau ; une seule est retenue par couche.

### Alertes Waze (flux Waze for Cities)
Points, synchronisés. Champs : `type` (accident, embouteillage, danger sur la route, route fermée, police, travaux), `precision` (nid-de-poule, véhicule arrêté, verglas…), `rue`, `commune`, `description` (texte libre, rare), `fiabilite` (0 à 10), `confirmations` (pouces levés), `signale_le`. Disponible dans le flux mais non gardé : la note du signaleur, le nombre de commentaires et d'images, le type de route, l'orientation.

### Ralentissements Waze
Lignes, synchronisés. Champs : `rue`, `commune`, `vitesse_kmh`, `retard_s` (retard en secondes), `longueur_m`, `niveau` (1 à 5), `signale_le`. Disponible mais non gardé : le type de route, le sens de circulation, l'alerte de blocage associée, les nœuds de début et de fin.

## Ce qui structure l'affichage au clic

Trois familles d'entités se dégagent, qui appellent trois présentations différentes.

Les témoignages (signalements, Baromètre, projets, travaux) portent un texte et une identité : titre, catégorie ou statut avec couleur, texte cité tel quel, date, photo quand elle existe.

Les mesures ponctuelles (accidents, compteurs, alertes Waze) portent des chiffres et des qualificatifs : une gravité ou un type à afficher comme un état, des compteurs de victimes ou de passages, une date, et des oui/non qui se lisent mieux en pastilles (vélo, piéton, deux-roues) qu'en lignes clé-valeur.

Les tronçons (aménagements, Strava, ralentissements) portent une intensité et un sens : la rue, la grandeur principale en grand (passages, retard, type d'aménagement), puis les grandeurs par sens de circulation face à face, et la vitesse.

Dans tous les cas la provenance et la date du relevé méritent une ligne discrète, et un champ vide ne doit jamais s'afficher.
