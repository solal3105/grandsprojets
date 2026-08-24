---
title: Garder son SIG et publier quand même : qui fait quoi entre les deux outils
description: Publier des données SIG grand public n'oblige personne à démonter son SIG. Voici la répartition des rôles entre l'outil de production et l'outil de diffusion, les formats de passage réels (GeoJSON, WFS) et la règle qui dit qui détient la donnée de référence.
date: 2026-08-11
updated: 2026-08-11
tag: SIG
readingTime: 12
solutionHeading: Ce qu'Open Projets fait d'un export de votre SIG, et ce qu'il ne fera jamais
solutionIntro: Open Projets n'est pas un client SIG et ne cherche pas à le devenir : il consomme du GeoJSON, ni plus ni moins. Votre service SIG garde la production et la donnée de référence, l'outil prend le relais pour la page publique, sa rédaction et son référencement. Si votre chaîne ne sait pas encore sortir du GeoJSON en WGS84, la question se règle en amont, côté SIG.
solutionPoints: Un seul format géographique en entrée : le GeoJSON, en fichier importé ou en URL appelée, l'ajout d'une couche restant à ce jour une opération d'éditeur | Ni WFS, ni WMS, ni Shapefile, ni KML, ni reprojection : la donnée doit arriver déjà projetée en WGS84 | Le module Travaux se branche soit sur la saisie des agents, soit sur un flux GeoJSON externe, jamais les deux en même temps | Chaque projet publié obtient une page à son adresse propre, rédigée, pré-rendue côté serveur et déclarée au sitemap, quelques minutes après sa mise en ligne
---

La scène se joue à peu près partout de la même manière. Le service communication veut une carte des travaux en ligne, ou une page par projet d'aménagement. Il en parle au service SIG, qui répond, à juste titre, que la donnée existe déjà, qu'elle est propre, qu'elle est tenue à jour et qu'elle est même diffusée sur le serveur cartographique de la collectivité. Les deux ont raison, et la conversation s'enlise.

Elle s'enlise parce qu'ils ne parlent pas du même objet. D'un côté, une couche géographique : des entités, des attributs, une symbologie, une projection, des métadonnées. De l'autre, une page destinée à un habitant qui arrive par une recherche sur son téléphone et veut savoir jusqu'à quand sa rue est barrée. Deux produits, deux métiers.

Cet article ne plaide pas pour remplacer quoi que ce soit. Il pose une question d'architecture : garder le SIG comme outil de production et comme source, et brancher en aval un outil qui s'adresse au public. Restent les formats de passage, les deux pièges du premier export, et la question de savoir qui détient la vérité.

## Le service SIG est déjà le premier acteur de la donnée, pas un obstacle à contourner

Il faut commencer par tuer un préjugé. Dans les collectivités, la gestion des données n'est ni orpheline, ni tenue par la seule informatique. Le [baromètre 2025 de l'Observatoire Data Publica](https://observatoire.data-publica.eu/wp-content/uploads/2025/11/Observatoire-Data-Publica-Barome%CC%80tre-2025.pdf) décrit un trio de tête où les directions et services en charge de l'information géographique figurent en premier, devant les directions Data, qui n'existent que chez 40 % des répondants, et devant les directions informatiques. L'enquête a été menée de mai à juillet 2025 auprès de 292 collectivités et établissements publics locaux, un échantillon que sa notice méthodologique présente comme un large panel des collectivités françaises.

Derrière ces services, il y a une filière tendue. L'[étude économique de l'écosystème géonumérique publiée par l'Afigeo](https://www.afigeo.asso.fr/publication-de-la-1ere-etude-economique-de-l-ecosysteme-geonumerique-en-france/) chiffre 70 000 emplois qualifiés et un poids de 10 milliards d'euros, et l'[IGN ajoute](https://www.ign.fr/mag/geonumerique-la-filiere-qui-valait-10-milliards) qu'environ 3 000 postes y restent non pourvus chaque année. Le même baromètre place d'ailleurs à égalité, à 62 % chacun, le manque de temps et le manque de compétences en tête des obstacles à la diffusion d'outils innovants en matière de gestion des données. Demander à une équipe SIG de tenir à jour des pages grand public, ce n'est pas lui rendre service, c'est lui ajouter un métier.

## Une couche cartographique et une page publique ne répondent pas à la même question

Soyons précis, parce que c'est là que beaucoup d'articles dérapent : un SIG sait parfaitement publier. La documentation française de [Lizmap](https://docs.lizmap.com/current/fr/) décrit une application qui met des cartes en ligne à partir d'un projet QGIS, [uMap](https://umap-project.org/) annonce des cartes personnalisées bâties sur les fonds d'OpenStreetMap et intégrables à son propre site, et ArcGIS Online documente le [partage d'un élément avec tout le monde](https://doc.arcgis.com/fr/arcgis-online/share-maps/share-items.htm). Cette filière est outillée, largement libre et documentée en français.

Ce que ces outils publient, ce sont des cartes. Une carte n'est pas une page. Une page a sa propre adresse, un texte rédigé pour être lu, un titre et une description que les moteurs indexent, et parfois un formulaire par lequel un habitant renvoie quelque chose. C'est la seule nuance qui tienne, et elle explique presque tous les malentendus.

Elle explique aussi un chiffre inconfortable du [même baromètre](https://observatoire.data-publica.eu/wp-content/uploads/2025/11/Observatoire-Data-Publica-Barome%CC%80tre-2025.pdf) : l'amélioration de l'information et de la transparence vis-à-vis des citoyens recule comme objectif, de 59 % en 2024 à 43 % en 2025, alors que 79 % des Français se disent mal informés de ce que les services publics font de leurs données. La donnée progresse en interne, la restitution au public marque le pas. Savoir [qui tient la carte publique en mairie](/home/ressources/qui-tient-la-carte-en-mairie) n'est donc pas une querelle d'organigramme.

## Qui est vraiment tenu de publier, et à partir de quel seuil ?

Une confusion circule : l'obligation de publication en ligne n'est plus portée par le code général des collectivités territoriales. La version actuelle de l'[article L1112-23 du CGCT](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000033971749) traite des conseils de jeunes, pas d'ouverture des données. Le texte à citer est l'[article L312-1-1 du code des relations entre le public et l'administration](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000033205512), qui impose de mettre en ligne les bases de données mises à jour régulièrement et les données d'intérêt économique, social, sanitaire ou environnemental. Il ne s'applique pas aux collectivités de moins de 3 500 habitants, et l'[article D312-1-1-1](https://www.legifrance.gouv.fr/codes/section_lc/LEGITEXT000031366350/LEGISCTA000031367735/2020-12-09/) ajoute un seuil de 50 agents en équivalents temps plein. Le [guide pratique de la CADA, de la CNIL et d'Etalab](https://www.cnil.fr/sites/default/files/atoms/files/guide-open-data.pdf) énonce la combinaison de ces deux seuils et donne la date : ces obligations sont entrées en vigueur le 7 octobre 2018.

La réalité est plus modeste que le droit. L'[Observatoire open data des territoires d'OpenDataFrance](https://opendatafrance.fr/presentation-de-lobservatoire/) relève qu'au 1er septembre 2025, 30 % des collectivités et EPCI assujettis avaient publié au moins un jeu de données en dix ans, et compte, en citant l'AMF, environ 3 346 communes de plus de 3 500 habitants.

## Quel format fait réellement passer la donnée du SIG vers le public ?

La règle légale est courte et libérale. L'[article L300-4 du CRPA](https://www.legifrance.gouv.fr/codes/section_lc/LEGITEXT000031366350/LEGISCTA000031367685/) dispose que toute mise à disposition sous forme électronique se fait dans un standard ouvert, aisément réutilisable et exploitable par un système de traitement automatisé. Aucun format n'y est nommé, et le [guide de la CADA et de la CNIL, avec Etalab](https://www.cnil.fr/sites/default/files/atoms/files/guide-open-data.pdf), le confirme : il n'existe pas de standard imposé, seulement l'exigence d'un format uniforme au sein d'un jeu, lisible par une machine et non propriétaire de préférence.

Le GeoJSON est donc recevable, et il n'a plus rien de marginal. Au 24 août 2026, l'API de data.gouv.fr recense [2 705 jeux disposant d'une ressource GeoJSON](https://www.data.gouv.fr/api/1/datasets/?format=geojson&page_size=1) et [2 517 au format shapefile](https://www.data.gouv.fr/api/1/datasets/?format=shp&page_size=1). Les standards géographiques vont dans le même sens : le [standard OGC API - Features](https://docs.ogc.org/is/17-069r4/17-069r4.html), successeur moderne du WFS, n'impose aucun encodage mais recommande explicitement le GeoJSON, pour sa popularité auprès des développeurs web et sa simplicité.

## Un flux WFS déjà en place sait renvoyer du GeoJSON, à condition de le lui demander

Bonne nouvelle pour qui dispose déjà d'un serveur de diffusion : il sait faire. La Métropole de Lyon l'explique dans sa [documentation publique](https://rdata-grandlyon.readthedocs.io/fr/latest/services.html), et dans les termes exacts du problème : le format généralement utilisé en WFS est le GML, dérivé du XML, qui n'est pas forcément le plus simple à utiliser dans une application web, aussi est-il possible de recevoir un flux au format GeoJSON en ajoutant le paramètre `OUTPUTFORMAT=geojson`. Un flux existant alimente donc une page publique sans qu'on touche à la production.

Les trois moteurs les plus répandus le documentent noir sur blanc. Le [manuel de GeoServer](https://docs.geoserver.org/main/en/user/services/wfs/outputformats/) indique que `outputFormat=application/json` renvoie un document GeoJSON, le GML restant le format par défaut. La [documentation de QGIS Server](https://docs.qgis.org/latest/en/docs/server_manual/services/wfs.html) liste `geojson` parmi les valeurs possibles, GML s'appliquant par défaut : le GeoJSON est toujours un choix explicite. [ArcGIS Enterprise](https://enterprise.arcgis.com/en/server/latest/publish-services/windows/communicating-with-a-wfs-service-in-a-web-browser.htm) documente un `outputFormat=GEOJSON` sur ses requêtes GetFeature, et l'IGN, dans le [client officiel de ses services WFS](https://github.com/IGNF/geoportal-wfs-client/blob/master/README.md), fige `outputFormat=application/json` et la projection CRS:84.

Sans serveur, l'export bureautique suffit : la [documentation française de QGIS](https://docs.qgis.org/latest/fr/docs/user_manual/managing_data_source/create_layers.html) décrit la boîte de dialogue « Enregistrer la couche vecteur sous », qui écrit vers n'importe quel format vecteur que GDAL sait produire et renvoie, pour le GeoJSON, aux paramètres propres de ce pilote. Aucune extension à installer.

Une précision honnête avant toute démonstration : disposer d'une URL qui renvoie du GeoJSON ne signifie pas qu'un agent la branchera lui-même. Sur beaucoup de plateformes, la nôtre comprise, ajouter une couche cartographique à un territoire reste une opération d'éditeur, pas un bouton dans l'administration. Posez la question avant de signer.

## Deux pièges font échouer la plupart des premiers exports

**Le premier piège est la projection.** La [RFC 7946](https://datatracker.ietf.org/doc/html/rfc7946), qui définit le format GeoJSON, est catégorique : le système de coordonnées de tout GeoJSON est un système géographique fondé sur le WGS 84, en degrés décimaux. La possibilité d'en déclarer un autre, tolérée par la spécification de 2008, a été retirée pour cause de problèmes d'interopérabilité, les logiciels qui traitent du GeoJSON n'étant pas censés avoir accès à une base de systèmes de coordonnées. Un export en Lambert 93 doit donc être reprojeté avant publication, et le piège est mécanique : dans la boîte d'export de QGIS, le paramètre CRS permet de reprojeter, mais il faut y penser, sans quoi le fichier sort dans la projection du projet. Et comme la RFC a supprimé le membre qui déclarait la projection, rien ne l'annonce : on s'en aperçoit à des coordonnées à sept chiffres là où on attendait des degrés.

**Le second piège est la pagination des flux.** Un flux WFS ne rend pas forcément une couche entière en un appel. Le Géoportail de l'urbanisme [prévient](https://www.geoportail-urbanisme.gouv.fr/services/) que les requêtes sur ses flux sont paginées et limitées à 5 000 objets, et Data Grand Lyon [documente](https://rdata-grandlyon.readthedocs.io/fr/latest/services.html) un plafond par défaut à 1 000 objets. La Géoplateforme nationale est [limitée à 30 requêtes par seconde](https://cartes.gouv.fr/aide/fr/guides-utilisateur/utiliser-les-services-de-la-geoplateforme/diffusion/wfs/), ce qui invite un outil en aval à mettre en cache plutôt qu'à interroger le flux à chaque visite. Le raccourci le plus confortable reste l'URL d'export stable, comme celle de [Nantes Métropole](https://data.nantesmetropole.fr/explore/dataset/244400404_communes-nantes-metropole/export/).

## Qui détient la vérité quand la même donnée existe à deux endroits ?

Sur un seul domaine, le droit tranche. Le [Géoportail de l'urbanisme](https://www.geoportail-urbanisme.gouv.fr/info-general/) rappelle que depuis le 1er janvier 2020, la publication des nouvelles versions d'un document d'urbanisme y est obligatoire, et que communes et EPCI les y versent eux-mêmes. Ses [statistiques nationales](https://www.geoportail-urbanisme.gouv.fr/statistics/france/), au 20 juillet 2026, dénombrent 26 009 communes couvertes par un document publié sur 35 011.

La Ville de Paris illustre la cohabitation des deux étages : elle republie sur son portail open data le [zonage du PLU bioclimatique](https://opendata.paris.fr/explore/dataset/plub_gpu_zone/) voté le 20 novembre 2024, en indiquant que ces données sont aussi téléchargeables sur le Géoportail national. La source de référence est à un endroit, la version réutilisable à un autre, et la fiche le dit.

Pour la voirie, les projets, les équipements, aucun texte ne désigne un détenteur de la vérité : c'est une décision d'organisation, à prendre et à écrire. Rennes Métropole en donne un exemple public, avec d'un côté un [serveur de diffusion tenu par son SIG](https://public.sig.rennesmetropole.fr/public/) et de l'autre le [portail open data de la métropole](https://data.rennesmetropole.fr/). Les collectivités sans serveur à elles trouvent cet étage intermédiaire dans les plateformes mutualisées, comme [GeoBretagne](https://cms.geobretagne.fr/) ou [Geo2France](https://www.geo2france.fr/).

## Quatre règles suffisent à répartir le travail entre les deux outils

**Le SIG garde la production et la référence.** C'est lui qui saisit, corrige, contrôle la topologie, tient les métadonnées et arbitre ce qui fait foi. Rien de ce qui suit ne lui retire quoi que ce soit.

**Le passage se fait par un format unique, décidé une fois.** Un GeoJSON en WGS84, servi en fichier déposé ou sur une URL stable. Écrivez cette convention noir sur blanc, avec le nom des champs attendus, plutôt que de la rejouer à chaque couche.

**L'outil aval ne modifie jamais la donnée de production.** Il en consomme une copie publiable, ce qui permet à un agent de travailler la page sans risque pour la base. C'est la limite honnête d'un outil comme le nôtre : Open Projets consomme du GeoJSON et rien d'autre, il ne parle ni WFS, ni WMS, ni Shapefile, il ne reprojette pas, et la mise en ligne d'une page demande quelques minutes.

**Le contenu rédigé appartient au service qui écrit.** Le nom lisible, le texte, les dates, le contact : ce n'est pas de la donnée géographique, c'est de l'éditorial. La même mécanique vaut pour la [publication des travaux de voirie à partir du SIG](/home/ressources/travaux-voirie-sig-publication), et c'est la ligne de partage entre [SIG et outil métier](/home/ressources/sig-ou-outil-metier-commune).

## L'essentiel en six points

- Le SIG est le premier service porteur de la donnée : la question n'est pas de le contourner, mais de ne pas lui ajouter un métier d'édition.
- Un SIG publie très bien des cartes ; ce qu'il ne produit pas nativement, c'est une page avec son adresse, son texte et son référencement.
- L'obligation de publication en ligne vient du CRPA, pas du CGCT, et combine deux seuils : plus de 3 500 habitants et plus de 50 agents en équivalent temps plein.
- Aucun format n'est imposé par la loi : le GeoJSON est recevable, aussi représenté que le shapefile sur data.gouv.fr, et recommandé par OGC API - Features.
- Un WFS existant sait presque toujours renvoyer du GeoJSON, mais c'est un paramètre explicite : le GML reste le format par défaut de GeoServer comme de QGIS Server.
- Les deux pièges sont la projection, à ramener en WGS84 comme l'exige la RFC 7946, et la pagination des flux, plafonnée à 5 000 objets sur le Géoportail de l'urbanisme.
