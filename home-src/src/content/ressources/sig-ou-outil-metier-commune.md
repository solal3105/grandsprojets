---
title: SIG ou outil métier : ce que cherche vraiment une commune qui veut une carte
description: Un SIG de commune et un logiciel de cartographie pour collectivité ne répondent pas à la même question. Voici la distinction de finalité, illustrée sur les quatre besoins réels d'une mairie : publier ses projets, tenir ses chantiers, recueillir les signalements, lire un secteur.
date: 2026-06-09
updated: 2026-06-09
tag: SIG
readingTime: 12
solutionHeading: Quatre besoins déjà outillés, sur un socle commun
solutionIntro: Open Projets n'est pas un SIG et ne cherche pas à en devenir un : ni WFS, ni WMS, ni Shapefile, ni analyse spatiale. C'est un outil métier qui arrive avec ses objets déjà modélisés, pour les quatre besoins décrits ici, et qui coexiste avec le SIG d'une intercommunalité ou d'un département.
solutionPoints: Carte des projets : chaque projet a sa fiche publique, avec sa propre adresse et son référencement | Travaux : emprise, dates, état, et une chronologie que le riverain fait glisser jour par jour | Participer : signalement géolocalisé sans compte, double opt-in, rien de public sans décision d'un administrateur | Diagnostic terrain : lecture d'une zone entourée à main levée, réservée à l'équipe, sans page publique
---

Il y a un moment, dans la vie d'une commune, où quelqu'un dit en réunion : « il nous faudrait une carte ». Le sujet peut être les projets du mandat, les chantiers de l'été, les signalements des habitants ou l'état d'un quartier. La phrase est la même, et la réponse aussi : « il faudrait voir avec le SIG ».

Cette réponse n'est pas absurde. Disons-le d'emblée comme une lecture et non comme un constat institutionnel, car aucune étude publique ne documente ce point : dans beaucoup de collectivités, le seul service qui savait manipuler des objets situés sur le territoire était le service SIG, et il l'est resté. Mais la réponse mélange deux choses. Un SIG est un outil de production de donnée spatiale, générique par construction, fait pour des professionnels dont c'est le métier. Un outil métier arrive avec les objets déjà faits : un chantier y possède un état et des dates parce que c'est un chantier, pas parce qu'un agent a créé trois colonnes dans une table.

Cet article ne compare pas des logiciels : il pose une distinction de finalité, puis la vérifie sur les quatre besoins qu'une mairie exprime réellement.

## Un SIG et un outil métier ne répondent pas à la même question

Commençons par la définition que les praticiens territoriaux se donnent. Le guide SIG en collectivités de l'[AITF](https://georezo.net/wiki/aitf/guidesig/principes_generaux) décrit un SIG comme « un système informatisé qui, appuyé sur une organisation humaine, permet de créer, gérer, analyser, produire et partager des informations géographiques », et il exige trois ressources : compétences humaines, données homogènes, moyens informatiques. Un SIG se construit, il ne s'allume pas.

Les éditeurs disent la même chose. Esri France décrit un [logiciel SIG](https://www.esrifrance.fr/fr-fr/produits/en-savoir-plus/logiciel-sig) en trois volets, géodonnées, géovisualisation et géotraitement, et [QGIS](https://qgis.org/) se présente comme un outil de décision spatiale « pour tous ». Aucune de ces définitions ne mentionne de domaine d'application, et c'est la force du produit : le même logiciel sert au cadastre et aux écoles.

**Cette généricité a une contrepartie, parfaitement documentée.** La documentation officielle de QGIS sur la [création de couches](https://docs.qgis.org/latest/fr/docs/user_manual/managing_data_source/create_layers.html) le montre sans polémique : pour créer une couche vecteur, l'utilisateur choisit le type de géométrie, le système de coordonnées, puis saisit un à un le nom de chaque champ et son type. Le modèle de l'objet métier n'existe donc pas tant qu'on ne l'a pas créé. Ce n'est pas un défaut : un outil de production produit aussi la structure de la donnée.

Un outil métier fait le pari inverse et livre le modèle déjà écrit : personne, en ouvrant un logiciel de suivi de chantiers, ne se demande s'il faut créer un champ « date de fin ».

## Le SIG a hérité de besoins qui n'étaient pas les siens, faute d'alternative

Le glissement n'a jamais été étudié, mais les faits qui l'expliquent sont sourçables. La filière géonumérique française pèse [10 milliards d'euros et 70 000 experts](https://www.ign.fr/mag/geonumerique-la-filiere-qui-valait-10-milliards) selon l'étude Afigéo reprise par l'IGN, mais cette compétence s'est structurée là où il y avait de la taille : depuis la loi NOTRe, chaque région coordonne « l'acquisition et la mise à jour des données géographiques de référence » de son territoire, et le Sénat observe que « les grandes métropoles consacrent aussi de plus en plus de moyens à l'information géolocalisée », comme le rapporte le [Labo Société Numérique de l'ANCT](https://labo.societenumerique.gouv.fr/fr/articles/g%C3%A9ocommuns-le-s%C3%A9nat-appelle-%C3%A0-un-renfort-des-liens-entre-lign-et-les-collectivit%C3%A9s-locales/). À l'autre bout de l'échelle, l'INSEE titrait dès 2015 une étude « [Plus d'une commune métropolitaine sur deux compte moins de 500 habitants](https://www.insee.fr/fr/statistiques/1908488) ».

La compétence s'est donc mutualisée. En Dordogne, l'agence technique départementale emploie [45 agents dont cinq géomaticiens](https://smart-city.cerema.fr/en-dordogne-du-sig-mutualise-au-smart-territoire) pour opérer le SIG mutualisé Périgéo au profit des communes et EPCI du département. Ailleurs, un syndicat d'énergie facture ce service [0,70 euro par habitant](https://www.territoiredenergie90.fr/sig/) jusqu'à 2 999 habitants, puis un forfait annuel de 2 500 à 2 700 euros au-delà.

Quand une mairie a un besoin cartographique, elle se tourne vers le seul guichet disponible, et le service SIG fait ce qu'un bon service fait : il répond, il configure une application de plus. Le Département des Pyrénées-Atlantiques déclarait ainsi en juin 2022 avoir [plus de vingt applications Lizmap en production](https://comptoir-du-libre.org/fr/softwares/478/reviews). C'est du travail bien fait, mais devait-il revenir au SIG ?

## Publier des projets relève d'une obligation de concertation

Le premier besoin est réglementaire avant d'être communicationnel. L'[article L103-2 du code de l'urbanisme](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000052866507) impose une concertation avec les habitants pendant toute l'élaboration du SCoT ou du PLU, la création d'une ZAC et les opérations modifiant le cadre de vie.

Deux obligations voisines sont souvent confondues. La publication des nouvelles versions d'un document d'urbanisme sur le portail national est obligatoire « depuis le 1e janvier 2020, au titre du Code de l'urbanisme », écrit le [Géoportail de l'urbanisme](https://www.geoportail-urbanisme.gouv.fr/info-general/). C'est seulement au 1er janvier 2023, avec l'entrée en vigueur de la rédaction issue de l'ordonnance du 7 octobre 2021, que l'[article L153-23](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000044190577) a conditionné le caractère exécutoire du PLU à cette publication.

Là, le SIG est chez lui : le [géostandard PLU du CNIG](https://cnig.gouv.fr/geostandard-plan-local-d-urbanisme-plu-a28539.html?lang=fr) normalise la structure du document et un géoconvertisseur rend les données conformes au portail. Travail de donnée réglementaire, il demande un expert et en demandera toujours un.

Publier un projet au sens de la concertation, c'est autre chose. Nantes Métropole présente [60 grands projets](https://metropole.nantes.fr/ma-ville-ma-metropole/les-grands-projets) consultables en liste ou en carte, chacun avec un statut, une échéance et une localisation, et Paris héberge sa [carte des projets urbains](https://www.paris.fr/pages/carte-des-projets-urbains-et-architecturaux-4111).

Ce que ces collectivités produisent n'est pas une couche, c'est un objet éditorial : un nom, un récit, un statut, une page que l'on partage en réunion publique et que l'on retrouve dans un moteur de recherche six mois plus tard. Soyons précis, car c'est là que l'argument facile se retourne. Un SIG publie très bien une carte : la [documentation de Lizmap](https://docs.lizmap.com/current/en/) décrit ce parcours, du projet QGIS au plugin puis au serveur. Et l'écosystème SIG sait aussi produire des pages, puisque [ArcGIS Hub](https://www.esri.com/en-us/arcgis/products/arcgis-hub/overview) permet de « créer et publier un nombre illimité de sites web » et qu'[ArcGIS StoryMaps](https://storymaps.arcgis.com/) transforme « vos cartes et votre travail SIG en contenu interactif ». La nuance n'est donc pas technique, elle est éditoriale : la page devient un chantier de plus, à tenir à côté de la couche, et le travail d'écriture, d'adressage et de réponse aux habitants reste entier. D'où tant de communes avec une carte d'un côté et des pages projets de l'autre, comme le détaille l'article [qui tient la carte en mairie](/home/ressources/qui-tient-la-carte-en-mairie).

## Un chantier arrive déjà avec ses dates, son état et son porteur

C'est le besoin où la démonstration est la plus nette, parce que l'État a déjà écrit le modèle. Le schéma national [Informations travaux](https://schema.data.gouv.fr/metis-reseaux/infos-travaux/latest.html) décrit un chantier du domaine public par dix champs obligatoires : la raison sociale du maître d'ouvrage et son SIRET, les nom, prénom, courriel et téléphone d'un gestionnaire, un « intitulé univoque permettant de désigner le chantier », une date de début, une date de fin, une catégorie.

Le détail compte, car il dit l'inverse de ce qu'on attendrait : la géométrie n'y est pas obligatoire, elle est conditionnelle. L'objet chantier est d'abord défini par ses acteurs, son intitulé et son calendrier ; sa localisation vient ensuite. C'est le contraire de la logique d'une couche, qui part de la géométrie et lui accroche des attributs. Le [Guichet Travaux](https://www.data.gouv.fr/reuses/guichet-travaux) applique ce standard.

L'objet chantier existe donc indépendamment de tout logiciel : il vient du droit, jusque dans ses délais, puisqu'une [DT doit être renouvelée si la commande n'est pas signée dans les trois mois](https://www.reseaux-et-canalisations.ineris.fr/gu-presentation/faq/reglementation-anti-endommagement.html).

Sur le terrain, cette structure se voit. Paris publie [quotidiennement ses chantiers à J-1](https://www.data.gouv.fr/datasets/chantiers-a-paris), et Bordeaux affiche pour chacun sa nature, son impact et ses dates, avec la mention honnête que [ces dates peuvent évoluer selon les aléas](https://www.bordeaux.fr/fermetures-de-rues-et-deviations-pour-cause-de-travaux). À l'autre bout du spectre, Vence tient une carte « réactualisée chaque semaine par les Services Techniques » posée sur [un fond cartographique grand public](https://vence.fr/carte-interactive-des-travaux/), et Veigné localise ses chantiers sur [une carte assortie des restrictions de circulation](https://www.veigne.fr/ma-vie-veigne/travaux-amenagements/carte-interactive-des-travaux) bâtie sur le même type d'outil : deux communes qui tiennent leur information travaux à jour sans SIG, comme le développe notre guide sur la [carte des travaux d'une commune](/home/ressources/carte-des-travaux-commune).

## Recueillir des signalements engage la mairie sur les données personnelles

Le troisième besoin sort du champ cartographique dès la deuxième minute. Un signalement est un objet typé, historisé et localisé : Paris en publie l'[historique depuis 2012](https://www.data.gouv.fr/datasets/dans-ma-rue-historique-anomalies-signalees), et [l'application DansMaRue](https://www.paris.fr/dossiers/l-application-dansmarue-65) le transmet au service compétent.

Ce qui pèse ici n'est pas la géométrie, c'est le régime juridique. La [CNIL rappelle](https://www.cnil.fr/fr/les-collectivites-territoriales-et-lopen-data-concilier-ouverture-des-donnees-et-protection-des) que la diffusion de documents contenant des données personnelles doit être précédée d'une anonymisation, sauf trois exceptions précises, et que les personnes doivent être informées et disposent d'un droit d'opposition au titre du RGPD. Le même régulateur reconnaît, dans son [guide destiné aux communes de petite et moyenne taille](https://cnil.fr/fr/collectivites-territoriales-la-cnil-publie-un-guide-de-sensibilisation-au-rgpd), que ces collectivités n'ont pas de ressources internes dédiées.

Aucun de ces sujets n'est un sujet SIG. Consentement, durée de conservation, modération avant publication, retrait à la demande d'un tiers : ce sont des règles de traitement, qui gagnent à être portées par l'outil plutôt que par la vigilance d'un agent. C'est le parti pris du module Participer d'Open Projets, où rien n'est public sans décision d'un administrateur.

## Lire un secteur est une lecture, pas une couche de plus

Le dernier besoin est le plus mal formulé des quatre. Quand un DGS demande « ce qu'il y a » dans un secteur avant un aménagement, il ne veut pas une couche supplémentaire, il veut une synthèse de ce qui existe déjà. L'État l'a compris pour la sobriété foncière, avec [Mon Diagnostic Artificialisation](https://mondiagartif.beta.gouv.fr/), qui produit les rapports réglementaires d'un territoire sans rien installer.

Le Cerema a recueilli la même demande auprès des communes littorales, dans son projet de [SIG Littoral Communal](https://www.cerema.fr/fr/projets/systeme-information-geographique-sig-littoral-communal) : elles réclamaient « un système standard, développé entièrement à partir de logiciels libres et gratuits », « un socle de données constitué de données géographiques de référence, enrichi de couches de données » et « des outils de création de données : observation de phénomènes, historisation d'évènements ». Elles ne demandaient pas un logiciel générique de plus, mais des objets déjà outillés, dans la logique du [Socle Commun des Données Locales](https://opendatafrance.fr/les-projets/opendatafactory/socle-commun-des-donnees-locales/).

## Comment une commune décide-t-elle sans opposer le SIG et l'outil métier ?

La bonne question n'est pas « SIG ou outil métier », elle est « qui produit la donnée, et qui la donne à lire ». Un SIG produit, valide, croise et projette, et il restera indispensable pour tout ce qui est réglementaire, technique ou analytique. Un outil métier prend un objet déjà modélisé et le rend exploitable par des agents non géomaticiens.

Aucun recensement public de l'équipement SIG des communes n'existe à notre connaissance, mais la capacité de publication, elle, est mesurée et suit la taille : [60 % des collectivités de plus de 100 000 habitants avaient ouvert leurs données en 2020](https://www.banquedesterritoires.fr/open-data-60-des-collectivites-de-plus-de-100-000-habitants-ont-ouvert-leurs-donnees) contre 7 % des autres, et [1 062 seulement](https://www.maire-info.com/1-062-collectivites-ont-ouvert-leurs-donnees-en-2022-article2-27363) publiaient en 2022, soit 16 % de celles qui y sont tenues.

La collectivité qui hésite gagnera à poser trois questions. Le besoin porte-t-il sur un objet dont le modèle existe déjà ? Le résultat sera-t-il lu par des habitants ou par des professionnels ? Qui fera la mise à jour dans six mois ? Si la réponse à la dernière question est « un agent d'accueil ou un chargé de communication », le choix est fait, sans rien retirer au SIG de l'intercommunalité, comme l'explique l'article [garder son SIG et publier quand même](/home/ressources/garder-son-sig-et-publier).

## L'essentiel en six points

- Un SIG est un outil de production de donnée spatiale, générique par construction : le modèle de l'objet métier n'y existe pas tant qu'on ne l'a pas créé, comme le disent l'AITF et les éditeurs eux-mêmes.
- Un outil métier livre le modèle déjà écrit : dans le schéma national Informations travaux, les dix champs obligatoires sont les acteurs, l'intitulé et les dates, la géométrie n'y étant que conditionnelle.
- Le SIG a hérité de ces besoins faute d'alternative, la compétence géomatique s'étant concentrée dans les régions et les métropoles.
- L'écosystème SIG sait publier des pages, avec ArcGIS Hub ou StoryMaps : la différence n'est pas technique, la page reste simplement un chantier éditorial de plus à côté de la couche.
- Recueillir des signalements est d'abord un sujet de données personnelles rappelé par la CNIL, pas un sujet de géométrie.
- La question utile est de savoir qui produit la donnée et qui la donne à lire : les deux réponses sont rarement les mêmes.
