---
title: Analyser un secteur sans être géomaticien : ce que l'IA fait, et ce qu'elle ne fait pas
description: Une analyse spatiale reste un travail de géomaticien, et le restera. Lire ce que disent trois cents signalements sur un carrefour est un autre geste : voici ce qu'un outil de diagnostic de territoire apporte à une collectivité, et ce qu'il ne doit jamais faire.
date: 2026-08-20
updated: 2026-08-20
tag: Diagnostic
readingTime: 12
solutionHeading: Ce que le module Diagnostic terrain fait, et rien de plus
solutionIntro: Le Diagnostic terrain d'Open Projets ne remplace ni un SIG ni un géomaticien : il ne fait ni jointure, ni tampon, ni croisement de couches. Il lit les points contenus dans une zone que vous entourez à main levée et rend une synthèse sourcée, réservée à l'équipe. Ce qu'il produit est une restitution vérifiable, pas un avis.
solutionPoints: Réservé à l'équipe, derrière authentification : aucune page publique n'est créée | La zone entourée à main levée est lue en entier, avec un plafond de 300 points, jamais un échantillon | Chaque ligne de la synthèse cite les points dont elle provient et reproduit les verbatims mot pour mot | Les décomptes sont calculés à partir des données ; l'outil ne note pas, ne hiérarchise pas et ne recommande rien
---

Un carrefour de centre-bourg, dix-huit mois de signalements d'habitants, deux comptes rendus de réunion de quartier, et une commission voirie dans quinze jours. L'élu pose une question simple : qu'est-ce que les gens nous disent, à cet endroit ? La réponse existe, répartie entre une boîte mail, un tableur, deux classeurs et la mémoire d'un agent qui part à la retraite en juin.

Ce n'est pas un problème de système d'information géographique. Le SIG de la collectivité, quand elle en a un, localise très bien ces points. Ce qu'aucun outil ne fait seul, c'est lire les six cents lignes de texte libre qui les accompagnent et en rendre compte fidèlement.

Deux gestes très différents se rangent sous le même mot, « analyse ». Le premier produit de la donnée nouvelle à partir de la donnée existante : c'est l'analyse spatiale, un métier. Le second restitue fidèlement ce qui a déjà été écrit, sans rien y ajouter, et lui seul est à la portée d'une intelligence artificielle tenue en laisse très court. Cet article porte sur cette frontière et sur les garde-fous sans lesquels un outil de diagnostic produit des affirmations invérifiables.

## Une analyse spatiale et une restitution de terrain ne répondent pas à la même question

Le glossaire de [Géoconfluences](https://geoconfluences.ens-lyon.fr/glossaire/analyse-spatiale), publié par l'ENS de Lyon, définit l'analyse spatiale comme une démarche visant à systématiser les raisonnements géographiques en mobilisant des outils de formalisation, c'est-à-dire des modèles. Elle recourt aux statistiques, aux mathématiques et à l'informatique, et étudie des interactions : corrélations, gradients, diffusion, réseaux. C'est une discipline constituée.

**Un exemple vaut mieux qu'une définition.** La documentation officielle de [QGIS](https://docs.qgis.org/3.44/fr/docs/gentle_gis_introduction/vector_spatial_analysis_buffers.html) présente la zone tampon, l'opération la plus banale qui soit, comme une surface permettant d'évaluer la distance entre des entités réelles. Sauf que ces distances s'expriment dans les unités du système de coordonnées de référence, et que les tampons peuvent être variables selon les attributs, dissous ou non. Tracer un tampon de cinquante mètres autour d'une école suppose de maîtriser projection, attributs et paramétrage.

Le même glossaire définit un [SIG](https://geoconfluences.ens-lyon.fr/glossaire/systemes-dinformation-geographique-sig-et-geomatique) comme un système permettant de recueillir, stocker, traiter, analyser puis mettre en forme des données géographiques organisées en couches superposables. C'est un outil de production, fait pour des experts parce que c'est sa raison d'être.

Restituer, c'est répondre à la question « qu'est-ce qui a été dit à cet endroit », en citant qui l'a dit et dans quels termes. Aucune modélisation, aucune donnée nouvelle : un travail de lecture que personne n'a jamais aimé faire.

## Le géomaticien exerce un métier que l'IA ne remplace pas

La [fiche métier officielle](https://www.emploi-territorial.fr/fichemetier/D10406) du chef de projet SIG, au répertoire de l'emploi public territorial, dit ce qui se joue. Le professionnel structure et modélise l'information géographique de la collectivité, pilote un système intégrant acquisition, traitement, analyse et diffusion, et en contrôle la qualité. Compétences attendues : référentiels géodésiques et projections, langage SQL, métadonnées, analyses statistique et spatiale, sémiologie graphique. Cadres d'emplois : ingénieurs territoriaux, catégorie A, ou techniciens territoriaux, catégorie B.

**Cette compétence est rare, et elle se mutualise.** Le [service SIG du Pays de Brocéliande](https://sig.pays-broceliande.bzh/service-sig) réunit depuis 2011 un syndicat mixte et trois communautés de communes autour d'une base partagée et d'un WebSIG commun : une commune seule ne peut pas porter ce métier. Le [portail SIG de Rennes Métropole](https://portail.sig.rennesmetropole.fr/accueil/), réservé aux services et aux élus des communes membres, est doublé d'un serveur public de diffusion : l'outil du géomaticien y est séparé de ce qui est ouvert aux autres.

Rappelons la structure du bloc communal. Selon l'[Insee](https://www.insee.fr/fr/statistiques/1908488), dans une étude publiée fin 2015 sur des données de 2013, 54 % des communes de France métropolitaine comptaient moins de 500 habitants, pour 7 % de la population. Rapprochez ce chiffre du cadre d'emploi décrit ci-dessus et vous comprenez pourquoi la mutualisation est la règle. La question utile n'est donc pas de se passer d'un expert, mais de savoir quel travail relève de lui et quel travail n'a jamais dû lui être confié, faute d'alternative : c'est la ligne de partage décrite dans notre article sur le choix entre [un SIG et un outil métier](/home/ressources/sig-ou-outil-metier-commune).

Un point vaut pour tous les outils, y compris les nôtres : la qualité de la donnée en amont conditionne tout traitement en aval, comme l'alertait déjà le CERTU en 2008 dans « [La qualité des données géographiques : quels enjeux pour les collectivités ?](https://doc.cerema.fr/Default/doc/SYRACUSE/16608) », publication reprise au catalogue documentaire du Cerema. Le [baromètre 2025 « Data, IA et territoires »](https://observatoire.data-publica.eu/wp-content/uploads/2025/11/Observatoire-Data-Publica-Synthe%CC%80se-4-pages-du-Barome%CC%80tre-2025-Web.pdf) de l'Observatoire Data Publica, mené auprès de 292 collectivités, le confirme : pour la moitié d'entre elles, la qualité des données est le premier obstacle au déploiement de l'IA. Une synthèse automatique n'améliore pas une donnée mal saisie, elle la propage plus vite.

## Ce dont un élu a besoin avant un arbitrage tient rarement dans une carte de plus

La collectivité accumule du texte localisé parce que la loi l'y oblige. L'[article L103-2 du code de l'urbanisme](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000052866507) soumet à concertation, pendant toute la durée du projet, l'élaboration et la révision du SCoT et du PLU, la création de ZAC et les projets modifiant substantiellement le cadre de vie. L'[article L103-3](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000052866731) désigne ensuite qui en fixe les objectifs et les modalités : l'organe délibérant de la collectivité compétente dans le cas courant, mais l'autorité administrative de l'État ou le représentant légal de SNCF Réseau lorsque l'opération relève de leur initiative. Une collectivité ne choisit donc pas de recevoir des centaines de contributions : elle y est conduite.

Les volumes parlent d'eux-mêmes. Le grand débat « Fabrique de nos villes » de [Nantes Métropole](https://metropole.nantes.fr/actualites/2023/dialogue-citoyen/grand-debat-bilan) a réuni en 2023 30 000 participants, 620 contributions postées et 140 cahiers d'acteurs, et la [Métropole de Lyon](https://www.grandlyon.com/mes-services-au-quotidien/sinvestir-dans-la-vie-citoyenne/participer-aux-concertations-publiques-de-la-metropole) publie avis et bilans depuis 2019. La matière ne vient pas que des concertations : la Ville de Paris publie en open data l'[historique des anomalies signalées](https://www.data.gouv.fr/datasets/dans-ma-rue-historique-anomalies-signalees) via « Dans Ma Rue » depuis 2012.

**Ce que l'élu demande avant un arbitrage n'est pas une modélisation.** C'est un état des dires, honnête et daté, sur un périmètre précis. Un outil peut en fournir la matière première ; la signature du diagnostic, elle, reste celle d'un agent et d'un élu.

## Le Grand débat national montre ce qui arrive quand une machine analyse sans garde-fous

Le précédent le plus instructif est français. Des chercheurs d'Inria et de l'Université de Lille ont rétro-analysé le traitement algorithmique des réponses au Grand débat national, dans [un article publié par The Conversation](https://theconversation.com/ia-et-democratie-participative-comment-les-reponses-au-grand-debat-national-ont-elles-ete-analysees-158158) en mars 2021. Leur constat : code non fourni, méthode de sélection des catégories non spécifiée, affectations des réponses jamais publiées, résultats non reproductibles par des méthodes standards. Leur contre-analyse manuelle aboutit, sur une catégorie, à 54,5 % là où le rapport officiel affichait 43,4 %, soit environ 15 000 réponses d'écart, et 22,5 % des contributions avaient été jugées inclassables.

Une étude de [Terra Nova](https://tnova.fr/democratie/nouvelles-pratiques-democratiques/le-grand-debat-a-la-lumiere-de-lia-quelques-avancees-de-nombreuses-limites/) publiée en juillet 2025 a rejoué l'exercice avec un modèle génératif récent et des précautions sérieuses : grille imposée, trois analyses indépendantes par thème, échantillon stratifié de 16 448 contributions sur 1,9 million. Les auteurs documentent ce qu'ils n'ont pas pu corriger. Sur les communes de plus de 4 000 habitants du Pas-de-Calais, ils mesurent une corrélation de 0,76 entre la part des foyers fiscaux imposés à l'impôt sur le revenu et le taux de participation. Ils écrivent que « les algorithmes permettent de lire plus vite, de catégoriser plus finement, mais pas nécessairement de révéler ce qui a été invisibilisé dès la collecte », et concluent qu'il reste « assez difficile de déduire de ce corpus des conclusions générales robustes ». Un outil de restitution hérite des angles morts du dispositif qui a produit la matière.

## Cinq garde-fous devraient conditionner tout outil de restitution automatique

**Un outil doit lire l'intégralité du périmètre, jamais un échantillon.** Sur une concertation nationale, échantillonner est défendable. Sur un carrefour et ses trois cents signalements, c'est inutile et risqué : un échantillon transforme une restitution en sondage, et les deux études ci-dessus disent le prix d'un corpus mal représenté.

**Chaque ligne doit citer les points dont elle provient.** Un agent doit pouvoir les rouvrir et vérifier, sans quoi la synthèse n'est qu'une opinion mise en forme. C'est la réponse au reproche fait au Grand débat : des affectations jamais publiées.

**Les verbatims se reproduisent mot pour mot.** Une reformulation, même fidèle en intention, déplace le sens : la restitution porte les phrases telles qu'elles ont été écrites.

**Les chiffres se calculent sur les données, ils ne s'énoncent pas par le modèle.** Un modèle de langage produit des nombres plausibles, ce qui est exactement le problème : un décompte doit sortir d'un calcul sur la base, pas d'une génération de texte. C'est le principe retenu dans le module Diagnostic terrain d'Open Projets.

**Un outil de restitution ne recommande rien.** C'est le point décisif, et la doctrine publique l'a tranché ailleurs. Pour une concertation préalable relevant du code de l'environnement, le garant désigné est [tenu à une obligation de neutralité et d'impartialité](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000036671284) et veille à la qualité des informations diffusées au public. La [Commission nationale du débat public](https://www.debatpublic.fr/foire-aux-questions-168) rédige ses bilans sans se prononcer sur le bien-fondé du projet, en présentant une cartographie des arguments plutôt qu'un jugement. Un outil qui restitue doit tenir ce standard : décrire, pas arbitrer.

## Le cadre public français dit déjà l'essentiel sur l'usage de l'IA

Il n'est pas nécessaire d'inventer une doctrine, elle existe. Le [guide d'usage de l'intelligence artificielle pour les agents publics](https://ia.numerique.gouv.fr/ressources/guide-dusage-de-lia/) publié par la DINUM, la DITP et la DGAFP en juin 2026 pose cinq principes : l'agent public reste responsable de ses productions, le choix de l'outil dépend des données traitées, l'usage doit être transparent lorsque l'IA joue un rôle substantiel, chaque usage doit répondre à une utilité réelle, et la formation reste indispensable.

La CNIL le complète. Ses [questions-réponses sur l'IA générative](https://www.cnil.fr/fr/les-questions-reponses-de-la-cnil-sur-lutilisation-dun-systeme-dia-generative) de juillet 2024 recommandent de privilégier les systèmes qui limitent les hallucinations, de vérifier l'exactitude factuelle des sorties et de se méfier du biais d'automatisation. Le bilan de son [bac à sable sur l'IA dans les services publics](https://www.cnil.fr/fr/bilan-bac-a-sable-IA-services-publics) d'avril 2025 insiste sur l'intervention humaine significative, dont la [Banque des Territoires](https://www.banquedesterritoires.fr/la-cnil-publie-ses-recommandations-sur-lusage-de-lia-dans-les-services-publics) retient que les agents doivent pouvoir refuser une suggestion jugée non pertinente.

Deux obligations méritent d'être connues des DGS. L'article 50 du [règlement européen sur l'intelligence artificielle](https://artificialintelligenceact.eu/article/50/), applicable depuis le 2 août 2026, impose de signaler comme tel un texte généré par IA publié pour informer le public sur une question d'intérêt général, sauf relecture éditoriale humaine avec responsabilité assumée. Et la CNIL rappelle que les collectivités de plus de 3 500 habitants employant plus de 50 agents doivent publier, au titre de l'[open data](https://www.cnil.fr/fr/les-collectivites-territoriales-et-lopen-data-concilier-ouverture-des-donnees-et-protection-des), les règles définissant leurs principaux traitements algorithmiques lorsque ces traitements fondent des décisions individuelles. Une synthèse de terrain lue par un agent n'entre pas dans ce cas ; un outil qui trancherait à sa place, oui.

## Une commune sans service SIG peut commencer par la donnée, pas par l'outil

Si vos signalements arrivent par courriel sans localisation, aucune synthèse ne sera utile : mettez d'abord en place une [collecte géolocalisée des remontées d'habitants](/home/ressources/signalement-habitants-sig). Ce préalable ne coûte pas un poste de géomaticien.

Appuyez-vous ensuite sur ce qui est déjà normé. Le [Conseil national de l'information géolocalisée](https://cnig.gouv.fr/qui-sommes-nous-r843.html?lang=fr) coordonne standards, qualité et toponymie, et le [Géoportail de l'urbanisme](https://www.geoportail-urbanisme.gouv.fr/info-general/) référençait en 2023 plus de 13 000 documents d'urbanisme et 90 000 servitudes. La donnée géographique publique est solide : le point faible est dans la restitution de la parole locale.

Désignez enfin qui porte cette restitution : l'outil ne remplace pas cette responsabilité, il l'outille. La question de savoir [qui tient la carte en mairie](/home/ressources/qui-tient-la-carte-en-mairie) se pose à l'identique pour un diagnostic : un agent nommé, un périmètre écrit, une date de mise à jour affichée.

## L'essentiel en six points

- Une analyse spatiale produit de la donnée nouvelle par modélisation : c'est un métier de catégorie A ou B, que l'IA ne remplace pas.
- Restituer ce que disent des centaines de signalements localisés est un autre geste, long et fastidieux, que la machine peut prendre en charge.
- Le Grand débat national a montré le prix de l'absence de garde-fous : affectations non publiées, résultats non reproductibles, 22,5 % de contributions jugées inclassables.
- Cinq exigences minimales : lire l'intégralité du périmètre, citer ses sources ligne à ligne, reproduire les verbatims, calculer les chiffres à partir des données, ne rien recommander.
- La doctrine publique existe déjà : responsabilité de l'agent côté DINUM, vérification des sorties et intervention humaine significative côté CNIL, signalement des contenus générés côté règlement européen.
- La qualité de la donnée en amont commande tout : pour la moitié des collectivités interrogées en 2025, c'est le premier obstacle au déploiement de l'IA.
