---
title: Recueillir les signalements des habitants : ce qu'il faut construire dans un SIG
description: Formulaire géolocalisé, modération, statuts, durée de conservation, droit d'effacement : la liste complète de ce qu'un dispositif de signalement citoyen doit prévoir dans une commune, et pourquoi la couche cartographique en est la partie la plus simple.
date: 2026-07-30
updated: 2026-07-30
tag: Signalement
readingTime: 12
solutionHeading: Ce que le module Participer prend en charge dans cette chaîne
solutionIntro: Le module Participer d'Open Projets prend en charge le dépôt, la modération, les statuts, la durée de conservation et le rappel des dossiers qui stagnent. Il ne couvre pas le reste de la liste ci-dessus : ni la détection des doublons, ni le floutage des visages, ni le raccordement à une GRC, ni l'historique des décisions. Il ne remplace pas votre SIG et n'y touche pas.
solutionPoints: Dépôt en deux minutes sans compte ni application (point sur la carte, catégorie, email), avec confirmation par double opt-in | Rien n'est publié sans décision d'un administrateur, et les métadonnées des photos sont supprimées sur l'appareil avant l'envoi | Sept statuts dont le cycle est figé : seuls les mots, les couleurs et les notifications au déposant sont paramétrables | Durée de conservation réglable de 1 à 60 mois, rappel automatique quand des signalements stagnent, bouton de demande de retrait ouvert aux tiers
---

Un élu revient d'une réunion de quartier avec une idée simple : « on met un formulaire sur le site, les gens signalent les nids-de-poule et les dépôts sauvages, et les services techniques traitent ». La demande arrive au service SIG sous une forme qui paraît anodine : peut-on ajouter une couche de points où les habitants déposent leurs remarques ?

Ajouter cette couche est précisément ce qu'un service SIG sait faire, et ce n'est pas là que se joue le sujet. Le reste, c'est un traitement de données personnelles, une demande adressée à l'administration à laquelle la commune doit répondre, une chaîne de décisions qui l'engagent, et un travail d'entretien qui ne s'arrête jamais. Rien de tout cela n'est insurmontable, mais rien ne s'improvise après la mise en ligne.

Cet article est une liste : il n'indique pas quel outil choisir, il énumère ce qu'un dispositif de signalement citoyen doit prévoir pour être conforme et tenable. Nous ne sommes pas juristes, et chaque affirmation renvoie à sa source.

## Le premier travail du formulaire est d'orienter vers le bon responsable

La France compte [34 875 communes et 1 252 EPCI à fiscalité propre au 1er janvier 2026](https://www.collectivites-locales.gouv.fr/actualites/bis-206-les-structures-territoriales-au-1er-janvier). Sur une même rue, l'habitant qui voit un trottoir défoncé ne sait pas, et n'a pas à savoir, lequel de ces échelons entretient quoi.

Deux communes le disent sur leur propre page. [Betton](https://www.betton.fr/accueil/mes-demarches/signaler-un-probleme) sépare ce qui relève de Rennes Métropole (voirie, éclairage public, eau, assainissement, déchets) et ce qui relève de la commune (arbres dangereux, aires de jeux, espaces verts). [Saint-Herblain](https://www.saint-herblain.fr/services-et-demarches/espace-public-travaux-urbanisme/signaler-un-probleme-sur-lespace-public/) fait le même aiguillage entre Nantes Métropole et la ville, en laissant coexister formulaire, application mobile, téléphone et courrier.

**Le rattachement juridique aide à trancher.** L'[article L2212-2 du code général des collectivités territoriales](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000029946370) confie au maire tout ce qui intéresse la sûreté et la commodité du passage dans les rues, quais, places et voies publiques, ce qui comprend le nettoiement, l'éclairage et l'enlèvement des encombrements. C'est le socle de légitimité d'un dispositif communal, et la frontière au-delà de laquelle un signalement se transfère. [Cesson-Sévigné](https://www.ville-cesson-sevigne.fr/faire-un-signalement/) s'en tient ainsi à six catégories : élagage, aires de jeux, chemins piétonniers et ruraux, bâtiments publics, plaques et numéros de rue, propreté urbaine.

**La localisation doit être normalisée dès la saisie.** Un point posé sur un fond de carte situe une anomalie, mais ne suffit pas à la retrouver dans un logiciel métier. La [Base Adresse Nationale](https://adresse.data.gouv.fr/decouvrir-la-BAN) réunit environ 25 millions d'adresses et 250 000 lieux-dits, et depuis la loi 3DS de 2022 les communes en sont compétentes. Y adosser le champ d'adresse évite de reconstruire un géocodage maison.

## Savoir qui dépose protège autant l'habitant que la commune

Le réflexe est de vouloir un dépôt anonyme, par souci de simplicité. Mais un signalement n'est pas toujours dirigé contre un trou dans la chaussée : il peut viser un voisin, un commerçant, une entreprise. L'[article 226-10 du code pénal](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006417940) punit de cinq ans d'emprisonnement et de 45 000 euros d'amende la dénonciation, dirigée contre une personne déterminée, d'un fait de nature à entraîner des sanctions judiciaires, administratives ou disciplinaires et que l'on sait totalement ou partiellement inexact. Un dispositif sans trace de l'auteur laisse la collectivité sans réponse le jour où la question se pose.

La Ville de Paris a tranché nettement : depuis le [1er mars 2023](https://www.paris.fr/pages/dansmarue-fait-peau-neuve-23227), l'utilisation de l'application DansMaRue passe par la connexion à MonParis, le compte unique de la ville, ce qui permet en retour d'informer le déposant du suivi de son anomalie. [Cesson-Sévigné](https://www.ville-cesson-sevigne.fr/faire-un-signalement/), sans compte usager, demande nom, prénom, téléphone et courriel.

**Identifier n'est pas collecter sans limite.** Le [RGPD impose que les données soient adéquates, pertinentes et limitées à ce qui est nécessaire](https://www.cnil.fr/fr/reglement-europeen-protection-donnees/chapitre2) au regard des finalités. Il faut donc savoir dire pourquoi on réclame un numéro de téléphone. Une confirmation par courriel place au moins une adresse valide derrière chaque dépôt, et ouvre le canal par lequel la réponse partira.

## Rien ne devrait apparaître en ligne sans qu'un agent l'ait décidé

C'est la règle la plus structurante, et elle a un fondement écrit. L'[article L312-1-2 du code des relations entre le public et l'administration](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000033205514) dispose que, sauf disposition contraire ou consentement des intéressés, les documents comportant des données à caractère personnel ne peuvent être rendus publics qu'après un traitement rendant impossible l'identification des personnes. La CNIL en tire une doctrine détaillée pour l'[open data des collectivités](https://www.cnil.fr/fr/les-collectivites-territoriales-et-lopen-data-concilier-ouverture-des-donnees-et-protection-des) : anonymisation préalable, occultation des mentions protégées, information claire à la collecte comme à la publication, et droit d'opposition ouvert.

Le jeu de données ouvert de Dans Ma Rue l'illustre. Il contient [plus de 1,47 million d'enregistrements](https://parisdata.opendatasoft.com/api/explore/v2.1/catalog/datasets/dans-ma-rue/records?limit=1), dont les champs se résument au type d'anomalie, à l'adresse, aux dates de déclaration, à l'intervenant et à la géométrie. Aucun n'identifie le déposant : ce que la ville publie n'est pas ce qu'elle reçoit.

**Les photos méritent leur propre décision.** La CNIL rappelle que [chacun a sur son image un droit exclusif et absolu](https://www.cnil.fr/fr/cnil-direct/question/381) et peut s'opposer à sa reproduction sans autorisation préalable. Une photo où l'on distingue un visage ou une plaque d'immatriculation ne peut donc pas être republiée telle quelle : il faut prévoir qui regarde chaque image avant qu'elle sorte. Purger les métadonnées des fichiers reçus relève du même esprit, par simple application du principe de minimisation.

## Le cycle de vie et les traces s'écrivent avant l'ouverture du formulaire

Un signalement est une demande adressée à l'administration. L'[article L112-3 du CRPA](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000031367338) prévoit qu'elle fait l'objet d'un accusé de réception, l'obligation ne s'appliquant pas aux demandes abusives, notamment par leur nombre ou leur caractère répétitif. Son contenu n'est pas laissé au libre choix : l'[article R112-5](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000031369981) énumère la date de réception, la date à laquelle la demande sera réputée acceptée ou rejetée à défaut de décision expresse, ainsi que la désignation et les coordonnées du service chargé du dossier. Il faut donc savoir, dès le dépôt, quel service est saisi.

**Ensuite viennent les statuts, et ils se comptent.** [Rennes Métropole](https://transport.metropole.rennes.fr/faire-un-signalement-avec-citezen/) publie un engagement clair sur son dispositif Cité Zen : un numéro de ticket remis au déposant, une réponse à tous les signalements reçus, moins de 5 jours pour les urgences et environ 21 jours en moyenne pour le reste. Un cycle de vie utile tient en quelques états, avec pour chacun une décision sur ce qui part au déposant. Ces états gagnent à être écrits dans les mots des habitants plutôt que dans ceux du service technique.

**Les décisions se journalisent, et ce n'est pas de la bureaucratie.** Le jour où un habitant demande pourquoi son signalement n'a pas été publié, la commune doit pouvoir répondre autre chose qu'une impression. La CNIL décrit les précautions élémentaires : [journaliser les opérations](https://www.cnil.fr/fr/securite-tracer-les-operations) de création, consultation, partage, modification et suppression en conservant l'auteur, la date, l'heure et la nature de l'opération, informer les utilisateurs de ce dispositif, protéger les journaux et analyser activement ces traces. Sa [recommandation du 18 novembre 2021](https://www.cnil.fr/fr/la-cnil-publie-une-recommandation-relative-aux-mesures-de-journalisation) donne un ordre de grandeur sur la durée : entre six mois et un an, extensible jusqu'à trois ans si l'organisme démontre et documente la nécessité. Ce sont aussi ces traces qui permettent de mesurer la répétition, donc d'opposer l'exception du CRPA aux demandes abusives.

## La protection des données se décide en six points, et par écrit

**Le consentement n'est pas la bonne base légale ici.** La CNIL pose deux conditions cumulatives à la [mission d'intérêt public](https://cnil.fr/fr/les-bases-legales/mission-interet-public) : le traitement doit permettre d'exercer de manière pertinente et appropriée la mission dont l'autorité est investie, et cette mission ne peut être présumée par l'organisme, elle doit être définie dans un texte. Sur cette base, tous les droits s'appliquent sauf la portabilité, droit d'opposition compris.

**Chaque champ doit se justifier par la finalité annoncée.** La CNIL rappelle aux collectivités que [seules les données strictement nécessaires](https://www.cnil.fr/fr/collectivites-territoriales/les-principes-cles-de-la-protection-des-donnees) peuvent être demandées. Le numéro de téléphone, l'adresse du déposant ou une pièce jointe libre doivent pouvoir être défendus un par un, faute de quoi ils sortent du formulaire.

**La durée de conservation revient à la collectivité.** La CNIL rappelle que pour de nombreux traitements [la durée n'est pas fixée par un texte](https://www.cnil.fr/fr/les-durees-de-conservation-des-donnees) et qu'il appartient alors au responsable du fichier de la déterminer en fonction de la finalité, en distinguant la base active de l'archivage intermédiaire. La durée est donc à fixer et à justifier localement, et elle doit être techniquement applicable, pas seulement inscrite au registre.

**Les droits s'exercent dans un délai d'un mois.** Le responsable de traitement doit répondre [au plus tard dans un délai d'un mois](https://www.cnil.fr/fr/cnil-direct/question/exercice-des-droits-informatique-et-libertes-dans-quel-delai-doit-me-repondre), prolongeable de deux mois seulement si la demande est complexe et si la personne en est informée dans le mois initial. Il faut donc savoir retrouver tous les signalements d'un même déposant, et savoir les effacer.

**L'analyse d'impact se tranche avec le délégué à la protection des données.** La CNIL publie deux listes de [traitements pour lesquels une AIPD est requise ou non](https://www.cnil.fr/fr/listes-des-traitements-pour-lesquels-une-aipd-est-requise-ou-non). La question doit être instruite avant l'ouverture du formulaire, et la réponse consignée.

**L'information est due au moment du recueil des données.** La CNIL demande qu'elle soit [concise, transparente, compréhensible et aisément accessible, en des termes clairs et simples](https://www.cnil.fr/fr/conformite-rgpd-information-des-personnes-et-transparence), et qu'elle couvre le responsable du traitement, les finalités, la base légale, les destinataires, la durée de conservation et les droits. Sur un formulaire de signalement, cela tient en quelques lignes.

## Un SIG couvre déjà une partie du chemin, et le reste se bâtit à côté

Rien de ce qui précède ne conduit à écarter le SIG, ni à lui reprocher quoi que ce soit. La documentation de QGIS décrit un [formulaire d'attributs de couche vecteur](https://docs.qgis.org/3.44/fr/docs/user_manual/working_with_vector/vector_properties.html) déjà très complet : widgets de saisie, contraintes de validation, valeurs par défaut, expressions. Côté diffusion, la [configuration d'une couche Lizmap](https://docs.lizmap.com/3.5/fr/publish/configuration/layer.html) couvre les alias de champs et le formulaire d'édition, et Lizmap sait même [filtrer les entités selon l'utilisateur connecté](https://docs.lizmap.com/current/fr/publish/lizmap_plugin/filtered_layers_login.html), ce qui est la brique la plus proche d'un « chacun voit son signalement ».

Ce que ces documentations ne décrivent pas, c'est le statut de modération, le circuit d'approbation, le compte déposant, la notification au changement d'état ou la durée de conservation appliquée automatiquement. Ce n'est pas un manque : un SIG est un outil de production, d'administration et de diffusion de donnée géographique, conçu pour des experts, et il fait cela mieux que tout le reste. La chaîne décrite ici relève d'un autre métier, celui de la relation à l'usager. C'est la distinction que détaillent nos articles sur le [SIG et l'outil métier](/home/ressources/sig-ou-outil-metier-commune) et sur la façon de [garder son SIG tout en publiant ailleurs](/home/ressources/garder-son-sig-et-publier).

## Un dispositif de signalement vit de sa régularité, pas de son lancement

Le CEREMA a réuni en [novembre 2018 un atelier consacré aux applications citoyennes et aux espaces publics](https://www.cerema.fr/fr/actualites/applications-citoyennes-espaces-publics-retour-atelier-du-27). Deux enseignements en sont sortis, qui n'ont pas pris une ride : définir les objectifs et la cible avant de penser à l'outil, et combiner le numérique à des relais physiques plutôt que de les remplacer. Le compte rendu laisse aussi une question ouverte : « Comment accompagner les services techniques dans une nouvelle posture d'encadrement des usagers ? » Huit ans plus tard, elle reste posée.

Trois garde-fous valent d'être installés dès le départ. Publier un engagement de délai, comme le fait Rennes Métropole, oblige à le tenir. Nommer un responsable de la file d'attente, et pas seulement un service, évite le signalement qui n'appartient à personne. Enfin, prévoir une alerte quand des dossiers stagnent, qu'il s'agisse du rappel automatique du module Participer d'Open Projets ou d'un simple tableau de bord hebdomadaire. La question de savoir [qui tient la carte en mairie](/home/ressources/qui-tient-la-carte-en-mairie) se pose ici avec la même force, car un dispositif sans propriétaire désigné s'éteint en silence.

## L'essentiel en six points

- Le formulaire doit d'abord router vers le bon responsable, parce que l'habitant n'a pas à savoir quel échelon entretient quoi.
- Un dépôt entièrement anonyme expose la collectivité quand un signalement vise une personne : identifier le déposant, mais ne collecter que les champs justifiables.
- Rien ne doit devenir public sans décision humaine : le CRPA impose l'anonymisation préalable, et le droit à l'image interdit de republier une photo où quelqu'un est identifiable.
- L'accusé de réception a un contenu fixé par les textes, les délais annoncés se décident avant l'ouverture, et les décisions de modération se journalisent.
- Base légale, minimisation, conservation, droits des personnes, analyse d'impact et information : six décisions à écrire, la durée de conservation revenant à la collectivité de la fixer et de la justifier.
- Ce qui manque à un SIG ici n'est pas une faiblesse : la modération, les statuts et la relation au déposant relèvent d'un autre métier, à bâtir à côté sans rien démonter de l'existant.
