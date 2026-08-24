---
title: Créer la carte des travaux de sa commune : le guide complet
description: La loi confie déjà au maire la coordination de tous les chantiers de voirie. Voici comment transformer cette information, que votre mairie possède déjà, en carte des travaux utile aux habitants.
date: 2026-03-05
updated: 2026-03-05
tag: Travaux
readingTime: 11
solutionHeading: La méthode de ce guide, appliquée sans SIG
solutionIntro: Le module Travaux d'Open Projets applique la méthode décrite ici, pour les communes qui n'ont ni SIG ni prestataire : la matière vient de vos arrêtés, l'outil se charge de la carte, des fiches et de leur publication ; le rythme de mise à jour, lui, reste chez vous.
solutionPoints: Trois statuts natifs (à venir, en cours, terminé) et les chantiers finis qui s'archivent | Mise à jour par un agent depuis un simple navigateur, au rythme des arrêtés | Chaque chantier a sa fiche publique, lisible par les moteurs de recherche | Carte intégrable au site de la commune, partageable par lien ou QR code
---

Il y a une question que toutes les mairies de France entendent, du village à la métropole : « pourquoi ma rue est barrée, et jusqu'à quand ? » La réponse existe presque toujours quelque part : dans un arrêté, dans le calendrier des services techniques, dans le programme d'un concessionnaire. Elle est simplement rangée là où les habitants ne la verront jamais.

Une carte des travaux ne crée pas d'information nouvelle. Elle rend visible une information que votre commune détient déjà, et que la loi lui confie même explicitement. C'est ce qui en fait l'un des projets de communication les plus rentables qui soient : la matière première est gratuite, elle est chez vous.

## La loi vous a déjà confié le rôle de chef d'orchestre

C'est un article de loi méconnu et pourtant central : l'article [L. 115-1 du code de la voirie routière](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006398462), en vigueur depuis 1989.

> « À l'intérieur des agglomérations, le maire assure la coordination des travaux affectant le sol et le sous-sol des voies publiques et de leurs dépendances, sous réserve des pouvoirs dévolus au représentant de l'État sur les routes à grande circulation. »

Et le texte ne s'arrête pas à ce principe. Il organise un vrai circuit d'information : les concessionnaires et occupants du domaine public « communiquent périodiquement au maire le programme des travaux qu'ils envisagent de réaliser ainsi que le calendrier de leur exécution ». Le maire, lui, « établit, à sa diligence, le calendrier des travaux dans l'ensemble de l'agglomération et le notifie aux services concernés ». Il peut refuser d'inscrire un chantier au calendrier (refus motivé, sauf pour protéger une chaussée refaite il y a moins de trois ans), et même « ordonner la suspension des travaux qui n'auraient pas fait l'objet des procédures de coordination ». Le [décret d'application](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000029111814) précise que le maire fixe chaque année la date à laquelle ces programmes doivent lui être adressés.

Autrement dit : la mairie est, par construction juridique, le point de passage de l'information travaux sur son territoire. La carte des travaux n'est que la face publique d'un travail de coordination que la loi vous demande déjà de faire.

Une nuance, posée par le Conseil d'État en 2023 : cette coordination vise les travaux affectant le sol et le sous-sol des voies (tranchées de réseaux, réfections), pas l'occupation du trottoir par un chantier privé riverain. Votre carte couvrira donc naturellement mieux la voirie que les chantiers immobiliers privés, et c'est normal.

## Qui creuse dans votre rue (et pourquoi vous le savez déjà)

Dans une même rue communale peuvent intervenir, selon les semaines : la commune elle-même (chaussée, trottoirs), l'intercommunalité ou un syndicat (eau, assainissement), le département si la voie est une départementale en traversée d'agglomération, et les gestionnaires de réseaux. Ces derniers ont des statuts différents : Enedis et GRDF sont « occupants de droit » du domaine public routier, tandis que les opérateurs de fibre doivent obtenir une [permission de voirie](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000039247422). Tous, en revanche, passent par la coordination du maire.

Et il existe un second filet d'information, côté exécution : la réforme anti-endommagement de 2012 impose une déclaration avant tout travaux à proximité de réseaux (les fameuses DT-DICT), via le [guichet unique national](https://www.reseaux-et-canalisations.ineris.fr) qui recense environ [4,5 millions de kilomètres de réseaux](https://www.ecologie.gouv.fr/politiques-publiques/canalisations-reforme-anti-endommagement) aériens ou souterrains. Cette réforme a fait ses preuves : on comptait plus de 100 000 endommagements de réseaux par an en 2008, ramenés à environ 65 000 fin 2016 selon l'Observatoire DT-DICT.

La conclusion pratique est simple : en France, on ne donne pas un coup de pelleteuse sans l'avoir déclaré quelque part. Le problème des habitants n'est pas un manque d'information, c'est un problème d'accès à l'information.

## Ce que font les collectivités : cinq modèles, du gratuit au sur-mesure

Nous avons inspecté le code source de plusieurs pages travaux de collectivités (le détail complet est dans notre [banc d'essai de 9 pages travaux](/home/ressources/pages-travaux-exemples-collectivites)). Il en ressort un vrai continuum :

- **[Veigné](https://www.veigne.fr/ma-vie-veigne/travaux-amenagements/carte-interactive-des-travaux)** (Indre-et-Loire, ~6 800 habitants) : une carte Google My Maps gratuite, doublée d'un texte daté et tenu à jour. Le niveau zéro d'outillage, et pourtant l'un des exemples les plus honnêtes du panel.
- **[Saint-Cergues](https://www.saint-cergues.fr/Carte-des-travaux-en-cours)** (Haute-Savoie, ~3 700 habitants) : une carte Leaflet générée par le plugin cartographique de son CMS, qui géolocalise les arrêtés de circulation. La preuve qu'une commune de moins de 4 000 habitants peut géolocaliser ses travaux.
- **[Rennes Métropole](https://travaux.rennesmetropole.fr/)** : un site dédié adossé au SIG de la métropole, avec une trouvaille éditoriale, la « météo des travaux » : chaque semaine, un bulletin des perturbations avec un indicateur global de circulation.
- **[Grand Paris Seine et Oise](https://gpseo.fr/article/carte-travaux)** : une carte ArcGIS pour 73 communes, avec une phrase précieuse écrite noir sur blanc : les interventions de moins d'une semaine et les travaux des concessionnaires n'y figurent pas. Dire le périmètre de sa carte, c'est la crédibiliser.
- **[Montpellier Méditerranée Métropole](https://travaux.montpellier.fr/)** : un site entièrement dédié, où la même information se lit de trois façons (carte, liste, point hebdomadaire en PDF) : chaque habitant choisit son format.

Aucun de ces dispositifs n'est parfait, mais chacun apporte une leçon transférable à n'importe quelle commune, quelle que soit sa taille.

## Le cas d'école : « C' le Chantier » à Clermont

En 2023, Clermont Auvergne Métropole entrait dans une décennie de grands chantiers simultanés : nouveau réseau de transports, eau et assainissement, schéma cyclable, réseau de chaleur. Plutôt que de communiquer projet par projet, la métropole a lancé une marque ombrelle, « C' le Chantier », avec [sa carte des travaux dédiée](https://carte.clechantier.fr/) et une démarche en trois temps : d'abord informer factuellement (où, quand, quelles déviations), ensuite aider à s'adapter (alternatives de déplacement), enfin donner à voir le projet d'ensemble.

La campagne « Bénéfices travaux » qui a suivi en 2024 a été [lauréate du Grand Prix Cap'Com 2024](https://www.cap-com.org/le-grand-prix-capcom-2024) dans la catégorie communication d'accompagnement de projet. Les chiffres publiés donnent une idée de l'ampleur : environ 98 600 € TTC de budget global, de l'affichage dans toutes les communes, des « cafés et apéros chantiers », et près de 1 000 commentaires générés sous les publications des trois premières phases, avec une modération personnalisée.

Ce qu'une commune de 5 000 habitants doit retenir de ce cas, ce n'est pas le budget : c'est l'ordre des choses. L'information factuelle d'abord (la carte, les dates, les déviations), le récit ensuite. Une collectivité qui raconte les bénéfices d'un chantier sans avoir d'abord répondu à « quand rouvre ma rue » parle dans le vide.

## La méthode pour une commune sans SIG

**1. Partez de ce que vous avez déjà.** Le calendrier de coordination de l'article L. 115-1, les arrêtés temporaires de circulation, les programmes transmis par les concessionnaires, les délibérations. Il ne s'agit pas de créer de l'information, mais de la reformater.

**2. Écrivez le périmètre de votre carte, publiquement.** La leçon de Grand Paris Seine et Oise : dites ce qui n'y figure pas (les interventions de quelques heures, les chantiers privés). Une carte au périmètre annoncé est attaquable sur rien ; une carte supposée exhaustive est attaquable sur tout.

**3. Une fiche par chantier, avec les dates en clair.** La leçon de Saint-Cergues, en négatif : géolocaliser un arrêté ne suffit pas si toute l'information reste dans un PDF à télécharger. Nature des travaux, dates de début et de fin, impact (route barrée, alternat, stationnement), maître d'ouvrage : ces quatre lignes doivent se lire sans rien ouvrir.

**4. Fixez le rythme de mise à jour, et affichez-le.** Vence écrit sur sa page que sa carte est « réactualisée chaque semaine par les Services Techniques » : c'est un contrat de confiance. Rennes tient un rendez-vous hebdomadaire. Le rythme réaliste pour une commune moyenne : une passe hebdomadaire en saison de travaux, calée sur la sortie des arrêtés.

**5. Trois statuts suffisent.** À venir, en cours, terminé. Résistez à la tentation des nomenclatures de service technique (phase APD, réception provisoire...) : elles parlent aux experts, pas aux riverains. Et les chantiers terminés ne doivent pas s'accumuler sur la carte : une carte encombrée de travaux finis depuis deux ans dit aux habitants qu'on ne s'en occupe plus. C'est pour cela que dans le module Travaux d'Open Projets, ces trois statuts sont natifs et les chantiers terminés s'archivent : le choix d'interface fait la politique éditoriale.

**6. Branchez la carte sur vos canaux existants.** Un lien dans chaque publication travaux sur les réseaux, une intégration sur le site, une mention dans le bulletin, et le lien dans chaque [courrier aux riverains](/home/ressources/informer-les-riverains-travaux). Sur le terrain, un [QR code sur le panneau ou la barrière de chantier](/home/ressources/qr-code-panneau-chantier) fait le pont entre la rue et la fiche.

## Ce que les habitants en attendent

Le [Baromètre de la communication locale 2024](https://www.cap-com.org/le-barometre-de-la-communication-locale) (Epiceum et Harris Interactive, avec Cap'Com et l'AMF) éclaire l'enjeu : 76 % des Français jugent fiable l'information locale issue des collectivités, l'information de la mairie est jugée utile par 76 % d'entre eux (loin devant le département et la région), et le site internet de la collectivité est utilisé par 70 % des habitants, en progression. Parmi les sujets recherchés figurent les services publics et les grands projets. L'information de proximité est le point fort des mairies : la carte des travaux en est l'expression la plus concrète.

Côté outils, tout dépend de vos moyens : un Google My Maps tenu à la main, le plugin carto de votre CMS, le SIG de l'interco si vous y avez accès. C'est aussi le problème que nous avons construit [Open Projets](https://openprojets.com/home/fonctionnalites) pour résoudre : une carte à vos couleurs, avec un module Travaux, des fiches mises à jour par un agent sans compétence technique, et des pages lisibles par les moteurs de recherche. Mais l'outil est secondaire : une carte gratuite tenue à jour vaudra toujours mieux qu'un bel outil abandonné.

## L'essentiel en six points

- La loi (article L. 115-1 du code de la voirie routière) fait déjà du maire le coordinateur de tous les travaux de voirie en agglomération : l'information existe, en mairie.
- Une carte des travaux ne crée pas d'information, elle rend accessible ce que les habitants ont le droit de savoir et cherchent déjà.
- Écrivez publiquement le périmètre de la carte : ce qu'elle montre, ce qu'elle ne montre pas.
- Chaque chantier mérite quatre lignes lisibles sans télécharger de PDF : nature, dates, impact, maître d'ouvrage.
- Le rythme de mise à jour affiché (hebdomadaire en saison) vaut plus que la sophistication de l'outil.
- L'ordre des choses, validé par le Grand Prix Cap'Com 2024 de Clermont : les faits d'abord, le récit ensuite.
