---
title: Page travaux de la mairie : 9 exemples réels passés au crible
description: De Saint-Cergues (3 700 habitants) à Paris, nous avons visité et inspecté 9 pages travaux de collectivités : ce qui marche, ce qui manque, et les leçons transférables à n'importe quelle commune.
date: 2026-04-16
updated: 2026-04-16
tag: Exemples
readingTime: 12
solutionHeading: Le même exercice, appliqué à notre propre outil
solutionIntro: Nous avons construit Open Projets en appliquant les leçons de ce banc d'essai. La démo ci-contre est en accès libre : explorez-la avec exactement les mêmes critères que les neuf exemples (fraîcheur, lisibilité des fiches, périmètre annoncé).
solutionPoints: Fiches lisibles par les moteurs de recherche, sans exécuter de JavaScript | Carte en marque blanche aux couleurs de la collectivité | Statuts et calendrier par projet, mis à jour en autonomie par vos agents | Accessible par lien, QR code ou iframe, sans application
---

Comment les collectivités françaises informent-elles vraiment leurs habitants sur les travaux ? Pour le savoir, nous avons fait ce que personne ne prend le temps de faire : visiter les pages travaux une par une, inspecter leur code source pour identifier les outils utilisés, vérifier les dates de mise à jour, et noter honnêtement ce qui marche et ce qui manque. Toutes les observations ci-dessous ont été faites le 24 juillet 2026 ; les pages évoluent, les liens font foi.

Transparence d'abord : nous éditons Open Projets, un outil de ce domaine ; aucun des exemples ci-dessous n'utilise notre solution, et chacun est jugé sur ce que nous avons réellement constaté. Ce panorama va du village de 3 700 habitants à la capitale : quelle que soit la taille de votre commune, au moins un de ces exemples est à votre portée.

## 1. Saint-Cergues (Haute-Savoie, ~3 700 habitants) : géolocaliser ses arrêtés avec son CMS

La preuve qu'il ne faut pas être une métropole pour avoir une carte : [la carte des travaux de Saint-Cergues](https://www.saint-cergues.fr/Carte-des-travaux-en-cours) est générée par le plugin cartographique de son CMS (SPIP et Leaflet, avec regroupement des marqueurs), sans licence payante. Le jour de notre visite, son flux de données contenait 25 points : circulations alternées, routes barrées, réglementations de priorité, chacun renvoyant à l'arrêté municipal correspondant.

**Ce qui marche** : la géolocalisation systématique des arrêtés de voirie, à coût nul, dans l'outil que la commune possède déjà.
**Ce qui manque** : les fiches sont quasi vides ; les dates et la nature des travaux ne se découvrent qu'en ouvrant le PDF de l'arrêté, et des arrêtés anciens cohabitent avec les récents. Le contenu est par ailleurs invisible pour les moteurs de recherche (tout se charge en JavaScript).
**La leçon** : géolocaliser est accessible dès 3 700 habitants ; mais une fiche doit dire en clair quoi, où, quand, sans obliger à télécharger un PDF.

## 2. Veigné (Indre-et-Loire, ~6 800 habitants) : le Google My Maps tenu à jour

[La carte interactive des travaux de Veigné](https://www.veigne.fr/ma-vie-veigne/travaux-amenagements/carte-interactive-des-travaux) est un simple Google My Maps intégré à la page. Aucune sophistication, et pourtant l'un des exemples les plus solides du panel, pour une raison : la page est vivante. Lors de notre visite, le texte annonçait des échéances précises et actuelles (des interventions d'assainissement courant jusqu'à octobre 2027, des alternats programmés entre juin et septembre 2026), et doublait la carte d'une liste écrite des chantiers et des arrêtés de circulation.

**Ce qui marche** : la fraîcheur, et le doublon texte + carte : même si la carte ne charge pas, l'information reste lisible (et indexable).
**Ce qui manque** : dépendance à Google, pas de filtres ni de catégories.
**La leçon** : l'outil gratuit tenu à jour bat l'outil sophistiqué abandonné. Toujours.

## 3. Rennes Métropole (43 communes) : la « météo des travaux »

[travaux.rennesmetropole.fr](https://travaux.rennesmetropole.fr/) est un site entièrement dédié, adossé au visualiseur cartographique open source du SIG métropolitain. Sa trouvaille est éditoriale plus que technique : la [« météo des travaux »](https://travaux.rennesmetropole.fr/meteo-travaux/), un bulletin hebdomadaire des perturbations. Le jour de notre visite, il couvrait la semaine du 27 juillet au 2 août 2026, ouvrait sur un indicateur global (« circulation très perturbée ») puis détaillait, commune par commune, chaque perturbation : lieu, dates, motif, déviation. S'y ajoutent des [fiches « infos riverains »](https://travaux.rennesmetropole.fr/infos-riverains/) datées et téléchargeables.

**Ce qui marche** : le rendez-vous hebdomadaire crée une habitude ; l'indicateur synthétique dit en un mot ce qu'une liste de trente chantiers ne dira jamais.
**Ce qui manque** : pas de moteur de recherche ni d'abonnement visibles.
**La leçon** : hiérarchiser (une « météo ») parle aux habitants ; le rythme éditorial compte plus que l'exhaustivité.

## 4. Montpellier Méditerranée Métropole : trois lectures de la même information

[travaux.montpellier.fr](https://travaux.montpellier.fr/) est un site entièrement dédié aux travaux de la métropole, avec une idée simple et efficace : la même information se consulte de trois façons, une vue « Carte », une vue « Liste » et une vue « Hebdo », complétées par un point travaux hebdomadaire téléchargeable en PDF.

**Ce qui marche** : chacun choisit son format ; l'habitant pressé lit la liste, le curieux explore la carte, l'habitué télécharge le point hebdo. La même donnée sert trois usages sans travail supplémentaire.
**Ce qui manque** : comme la plupart des cartes de ce panel, le contenu détaillé se charge en JavaScript, donc peu lisible par les moteurs de recherche.
**La leçon** : ne présumez pas du format préféré de vos habitants ; carte, liste et rendez-vous périodique se complètent à partir de la même source.

## 5. Grand Paris Seine et Oise (73 communes) : dire ce que la carte ne montre pas

La communauté urbaine la plus peuplée de France publie [sa carte des travaux](https://gpseo.fr/article/carte-travaux) sur ArcGIS, avec recherche par commune et fiches par chantier, en deux statuts (en cours, à venir). Son geste le plus précieux tient en une phrase affichée sur la page : les interventions de moins d'une semaine et les travaux des concessionnaires n'y figurent pas.

**Ce qui marche** : annoncer le périmètre. Une carte qui dit ses limites est crédible sur tout le reste.
**Ce qui manque** : la page hôte n'avait pas été mise à jour depuis mai 2024 lors de notre visite, ce qui jette un doute injuste sur la carte elle-même.
**La leçon** : écrivez noir sur blanc ce que votre carte ne couvre pas ; et n'oubliez pas que la date de mise à jour de la page se voit autant que la carte.

## 6. Paris : deux cartes pour deux horizons

Paris illustre une distinction que beaucoup de communes gagneraient à copier : [la carte des opérations d'aménagement et projets urbains](https://www.paris.fr/pages/carte-des-projets-urbains-et-architecturaux-4111) porte le temps long (écoquartiers, opérations d'aménagement, projets issus de « Réinventer Paris »), tandis que [la page chantiers de voirie](https://www.paris.fr/pages/chantiers-de-voirie-3207) porte le quotidien : arrondissement par arrondissement, chaque chantier avec ses dates précises, sa nature, ses impacts et les lettres riverains en PDF. Lors de notre visite, la page voirie avait été mise à jour trois jours plus tôt ; la carte des projets urbains, elle, datait d'avril 2024.

**Ce qui marche** : ne pas mélanger l'écoquartier livré en 2031 et la tranchée qui bloque la rue la semaine prochaine. Deux pages, deux rythmes.
**Ce qui manque** : la navigation entre les deux univers n'est pas évidente, et le temps long paraît à l'abandon à côté du quotidien.
**La leçon** : séparez projets et travaux ; chaque registre a son public et son rythme de mise à jour.

## 7. Rueil-Malmaison (~78 000 habitants) : la carte, plus le canal humain

Rueil-Malmaison publie [une liste de grands chantiers](https://www.villederueil.fr/vos-services/espace-public/suivis-de-chantiers/) (logements, gare de la ligne 15, équipements, avec chiffres et dates de livraison) et [une carte interactive des travaux](https://www.villederueil.fr/fr/pratique/urbanisme-et-affaires-foncieres/suivi-de-chantiers) mise à jour trois jours avant notre visite. Mais son vrai différenciateur est humain : des comités de suivi de chantiers ouverts aux riverains, et une adresse dédiée (chantiers@mairie-rueilmalmaison.fr) pour s'y inscrire et poser ses questions.

**Ce qui marche** : le couple carte + canal humain ; les chiffres concrets dans les fiches (nombre de logements, dates de livraison).
**Ce qui manque** : l'information est éclatée entre plusieurs pages aux titres presque identiques, avec des fiches de formats hétérogènes.
**La leçon** : la carte ne remplace pas le contact. Une adresse courriel dédiée aux chantiers et des comités de riverains absorbent les inquiétudes qu'aucune carte ne traite.

## 8. Vence (~20 000 habitants) : l'engagement de mise à jour affiché

[La page travaux de Vence](https://vence.fr/carte-interactive-des-travaux/) est modeste : une image, un lien vers une carte Google externe, un numéro de téléphone. Mais elle contient une phrase que nous n'avons vue nulle part ailleurs : la carte « est réactualisée chaque semaine par les Services Techniques de la Ville ». Qui met à jour, à quelle fréquence : tout est dit.

**Ce qui marche** : l'engagement public sur le rythme et le responsable, un vrai contrat de confiance.
**Ce qui manque** : la page vitrine elle-même datait de 2022 lors de notre visite, et tout le contenu vit dans une carte externe, invisible pour les moteurs de recherche.
**La leçon** : affichez qui met à jour et à quelle fréquence ; et veillez à ce que la page qui le promet n'ait pas l'air abandonnée.

## 9. Gap (~41 000 habitants) : le contre-exemple instructif

[La carte interactive des travaux de Gap](https://www.ville-gap.fr/carte-interactive-des-travaux/) avait tout pour plaire : un outil libre et gratuit (uMap, via Framacarte), et le meilleur découpage thématique du panel, en cinq familles illustrées (bâtiments, voirie, éclairage public, espaces verts, eau potable). Mais le texte de la page invitait encore, à l'été 2026, à retrouver « tous les travaux déjà réalisés en 2018 et à réaliser en 2019 ».

**La leçon**, et elle vaut pour tout ce guide : une page travaux périmée fait plus de dégâts que pas de page du tout, parce qu'elle prouve publiquement que le suivi annoncé n'est pas assuré. Avant de créer votre page, décidez qui la fera vivre ; c'est le cœur de notre [guide de la carte des travaux](/home/ressources/carte-des-travaux-commune).

Un mot sur la question qui fâche, avant la synthèse : sur les neuf pages de ce panel, la grande majorité des cartes sont invisibles pour les moteurs de recherche (le contenu ne se charge qu'en JavaScript). Concrètement, un habitant qui tape « travaux rue X » dans Google ne trouvera jamais le chantier, même s'il figure sur la carte de sa commune. C'est un critère que presque personne ne regarde en choisissant son outil, et l'un de ceux qui comptent le plus ; nous en avons fait un principe de conception d'Open Projets, et le point se vérifie sur n'importe quelle page de la démo. Les fiches d'un chantier ou d'un projet méritent d'exister aussi comme pages web à part entière, pas seulement comme des points sur une carte. Elles sont d'ailleurs la brique de départ d'une [carte de plan de mandat](/home/ressources/carte-plan-de-mandat-2026-2032) comme d'une carte des travaux.

## Les leçons, en synthèse

- **La fraîcheur avant l'outil** : Veigné (Google My Maps à jour) rend plus service que des cartes sophistiquées figées. Et Gap montre le coût d'une page abandonnée.
- **Des fiches lisibles en clair** : dates et nature des travaux dans la page, pas seulement dans un PDF (Saint-Cergues) ni dans une carte 100 % JavaScript (la majorité du panel).
- **Un rythme incarné** : la météo hebdomadaire de Rennes, l'engagement affiché de Vence. Qui met à jour, quand : écrivez-le.
- **Le périmètre annoncé** : la phrase de Grand Paris Seine et Oise (« les interventions de moins d'une semaine n'y figurent pas ») est un modèle à copier.
- **Deux horizons, deux pages** : projets de long terme et chantiers du quotidien ne se mettent pas sur la même carte (Paris).
- **Le canal humain en complément** : comités de riverains et adresse dédiée à Rueil ; la carte informe, le contact rassure. Pour la méthode complète côté riverains, voir [notre guide dédié](/home/ressources/informer-les-riverains-travaux).
