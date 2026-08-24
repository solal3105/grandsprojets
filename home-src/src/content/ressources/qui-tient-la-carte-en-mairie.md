---
title: Personne à la mairie n'a été recruté pour tenir la carte : qui doit s'en charger
description: Le géomaticien est un métier codifié par l'État, avec son concours, son titre professionnel et ses fiches de poste. Reste une question : qui tient la carte dans les communes où ce poste n'existe pas, et comment répartir les rôles sans déposséder personne ?
date: 2026-07-02
updated: 2026-07-02
tag: Géomatique
readingTime: 11
solutionHeading: Un périmètre clair pour chaque personne qui touche à la carte
solutionIntro: Open Projets ne remplace ni un SIG ni un géomaticien : il ne lit ni WFS, ni Shapefile, il ne reprojette pas et ne fait aucune analyse spatiale. Son socle sert à autre chose, donner à chaque agent un périmètre défini et lui permettre de publier une page sans passer par un spécialiste. Le seul format d'import géographique est le GeoJSON, ou une URL qui en renvoie.
solutionPoints: Des rôles et des territoires : un agent n'accède qu'à la collectivité et aux modules qui le concernent | Publier une fiche demande trois champs obligatoires : un nom, une catégorie, un tracé dessiné ou importé | Un seul format d'import géographique, le GeoJSON, ou une URL qui en renvoie | Catégories entièrement paramétrables : nom, icône, couleur, épaisseur, ordre d'affichage
---

Un élu demande une carte : les chantiers de l'année, les projets du mandat, peu importe. La demande est légitime et elle paraît simple. Puis le directeur général des services fait le tour de son organigramme et n'y trouve aucune fiche de poste qui mentionne la cartographie. La carte échoit alors à celui ou celle qui semble le plus à l'aise avec l'informatique : un agent des services techniques, la chargée de communication, parfois le DGS lui-même, un dimanche soir.

La question se pose aussi en sens inverse, là où un géomaticien a été recruté. Aucune des fiches de poste citées plus bas dans cet article ne mentionne la mise à jour d'une page travaux ni la préparation d'une image pour le bulletin municipal. Ces tâches existent pourtant, et quelqu'un finit toujours par les faire.

Les deux situations sont le même problème vu par ses deux extrémités. Elles ne disent pas qu'un système d'information géographique serait trop compliqué : elles disent qu'on lui a longtemps demandé un travail qui n'était pas le sien, faute d'alternative. Un point de méthode : aucune source publique récente ne dit combien de communes emploient un géomaticien, ni à partir de quelle taille ce poste apparaît. Ce qui suit ne s'appuie donc que sur ce qui est positivement documenté.

## Tenir un système d'information géographique est un métier que l'État a codifié

Ce n'est pas une tâche annexe : c'est un métier inscrit dans le référentiel territorial. La fiche [chef ou cheffe de projet des systèmes d'information géographique](https://www.emploi-territorial.fr/fichemetier/D10406) décrit un professionnel qui structure et modélise l'information géographique de la collectivité, pilote l'acquisition, le traitement, l'analyse et la diffusion des données, et en contrôle la qualité. Elle relève des cadres d'emplois d'ingénieurs territoriaux, catégorie A, et de techniciens territoriaux, catégorie B.

La codification va plus loin. Le concours d'ingénieur territorial comporte cinq spécialités, dont « informatique et systèmes d'information », elle-même divisée en trois options dont « systèmes d'information géographiques (SIG), topographie » ([décret n° 2016-206 du 26 février 2016](https://www.legifrance.gouv.fr/loda/id/JORFTEXT000032111761)). Le [statut particulier du cadre d'emplois](https://www.legifrance.gouv.fr/loda/id/JORFTEXT000032111484) précise que le concours externe exige un diplôme d'ingénieur, d'architecte, ou un diplôme scientifique ou technique sanctionnant au moins cinq années d'études après le baccalauréat.

Il existe aussi un titre professionnel d'État, [technicien supérieur en système d'information géographique](https://www.legifrance.gouv.fr/loda/id/JORFTEXT000033980487/2025-03-03). Son article 3 le décompose en deux blocs de compétences : « acquérir des données et concevoir un projet de système d'information géographique » d'une part, « exploiter les données d'un système d'information géographique et diffuser des informations géographiques » d'autre part. Son annexe recense quatre appellations d'emploi, parmi lesquelles technicien supérieur en système d'information géographique et technicien supérieur en géomatique.

L'État a donc écrit à trois endroits que ce travail suppose une qualification, et la profession se bat pour que cette évidence se traduise dans les organigrammes : le [groupe de travail SIG et topographie de l'AITF](https://www.aitf.fr/groupe-travail/sig-topographie), qui réunissait plus de 450 membres dans 350 collectivités en novembre 2019, affiche pour objectif que « cette compétence soit bien identifiée et reconnue dans les organisations des collectivités territoriales ».

## Un SIG demande des connaissances que l'on n'improvise pas

Il n'y a rien de dévalorisant à dire qu'un SIG est fait pour des experts : c'est sa raison d'être et sa force. Le [manuel utilisateur de QGIS](https://docs.qgis.org/latest/fr/docs/user_manual/), logiciel libre de système d'information géographique, compte vingt-sept chapitres, des systèmes de projection aux nuages de points, des protocoles OGC et ISO aux outils de traitement.

Publier ce travail en ligne ajoute une couche. La [documentation de Lizmap](https://docs.lizmap.com/), l'application web qui met en ligne des projets QGIS, s'organise en guides adressés à des publics différents : l'utilisateur qui consulte la carte, le publieur qui la prépare depuis le plugin QGIS Desktop, l'administrateur qui gère le serveur, les comptes et les groupes. Ce ne sont pas nécessairement trois personnes, mais ce sont trois casquettes, et il faut que quelqu'un les porte.

Le guide SIG en collectivités de l'AITF résume la chose de la manière la plus juste : un SIG territorial repose sur trois piliers, « des compétences humaines et des méthodes spécifiques, des données géographiques organisées, homogènes et cohérentes, des moyens informatiques, matériels, logiciels et de communication » ([principes généraux](https://georezo.net/wiki/aitf/guidesig/principes_generaux)). L'ordre n'est pas anodin : les compétences humaines viennent en premier.

## Même un village de quatre cents habitants produit désormais de la donnée géographique

La tension devient structurelle ici : les obligations de production de donnée géographique ne s'arrêtent à aucun seuil de taille.

L'article 169 de la loi 3DS impose à toutes les communes la dénomination des voies et lieux-dits, y compris les voies privées ouvertes à la circulation, et la mise à disposition de leurs données d'adressage, au 1er janvier 2024 pour les communes de plus de 2 000 habitants et au 1er juin 2024 pour toutes les autres ([CNIG](https://cnig.gouv.fr/loi-3ds-a25936.html)). Le [programme Bases Adresses Locales](https://adresse.data.gouv.fr/programme-bal) affichait 28 434 communes à jour au 24 août 2026.

Les documents d'urbanisme suivent la même trajectoire : les communes et leurs groupements compétents doivent transmettre à l'État, sous format électronique, la version en vigueur de leurs SCoT, PLU et cartes communales ([article L. 133-2 du code de l'urbanisme](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000031210844)). La [FAQ du Géoportail de l'urbanisme](https://www.geoportail-urbanisme.gouv.fr/faq/) rappelle que, depuis le 1er janvier 2023, la publication du SCoT ou du PLU sur le portail national est, avec la transmission au préfet, la condition qui confère à l'acte son caractère exécutoire.

Enfin, la voirie devient un objet de donnée de précision. Les déclarations d'intention de commencement de travaux devront, à compter de 2026, être apposées sur le Plan Corps de Rue Simplifié ([Géo Vendée](https://www.geovendee.fr/pcrs/)). Le niveau de précision retenu dépend du territoire : la Vendée a fait le choix d'un PCRS vecteur de classe de précision 5 centimètres. À l'échelle nationale, un [comité de coordination animé par le CNIG](https://cnig.gouv.fr/plan-de-corps-de-rue-simplifie-r21411.html) coordonne les actions et initiatives qui favorisent le déploiement et la mise à jour de ces plans.

## L'État lui-même prévoit deux chemins selon qu'on a ou non un géomaticien

C'est peut-être la reconnaissance la plus explicite du problème. Quand l'ANCT a présenté les [modalités et outils de l'adressage légal](https://anct.gouv.fr/espace-presse/communique-de-presse-adressage-legal-modalites-et-outils-disposition-des-communes), elle a décrit deux chemins distincts : l'éditeur en ligne gratuit « Mes Adresses », qui ne demande aucune expertise technique, et, littéralement « pour les géomaticiens », le validateur BAL, le moissonneur et le dépôt par interface de programmation.

La même logique apparaît au Géoportail de l'urbanisme, dont la FAQ conseille d'inscrire, dans le cahier des charges de recrutement du bureau d'études, la numérisation du document d'urbanisme au format prévu par le standard CNIG. L'État part donc du principe que la compétence n'est pas en interne, et qu'elle s'achète avec la prestation d'urbanisme.

Le seuil légal en matière d'ouverture des données raconte la même histoire. L'[article L. 312-1-1 du code des relations entre le public et l'administration](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000033205512) exclut expressément les collectivités de moins de 3 500 habitants, et la [CNIL rappelle](https://www.cnil.fr/fr/les-collectivites-territoriales-et-lopen-data-concilier-ouverture-des-donnees-et-protection-des) que l'obligation vise « les collectivités territoriales de plus de 3500 habitants et employant plus de 50 agents (en équivalent temps plein) », à charge pour elles d'anonymiser, d'informer les personnes et de tenir cette information accessible. Or, sur les 34 875 communes du territoire au 1er janvier 2025, seules 3 346 dépassent 3 500 habitants selon l'[Observatoire open data des territoires](https://opendatafrance.fr/notice-methodologique/), soit environ une sur dix.

## Les offres d'emploi montrent à quoi ressemble un poste de géomaticien

Les annonces publiques révèlent le niveau attendu. En août 2026, [Ploërmel Communauté](https://www.emploi-territorial.fr/offre/o056260813000790-geomaticien-administration-sig-valorisation-donnee-h), intercommunalité morbihannaise de trente communes, recrutait un géomaticien sur le cadre d'emplois des techniciens, catégorie B, en exigeant un master en géomatique, trois ans d'expérience et la maîtrise de QGIS, FME et PostgreSQL/PostGIS. L'offre a été publiée le 13 août 2026 pour une prise de poste au 4 janvier 2027 : près de cinq mois entre le besoin et l'arrivée de la personne.

Dans le Calvados, la [Communauté de communes Coeur Côte Fleurie](https://www.emploi-territorial.fr/offre/o014260622000209-geomaticien) décrit un contenu tout aussi dense : cadastre, réseaux d'eau et d'assainissement, RGPD, open data, formation des utilisateurs des communes membres.

Quand l'équipe est correctement dimensionnée, le métier apparaît encore plus nettement. Le [service SIG mutualisé du Pays de Saint-Malo et de la Côte d'Émeraude](https://www.cote-emeraude.fr/le-service-mutualise-sig/), créé en 2018 pour quatre intercommunalités et toutes leurs communes, affiche publiquement cinq agents. Leurs missions incluent l'audit des services, le recueil des besoins géomatiques, la rédaction de cahiers des charges et la formation aux outils SIG.

Aucune de ces fiches de poste ne dit « tenir à jour la page travaux du site internet » : produire, qualifier et administrer la donnée géographique remplit déjà largement un temps plein.

## La mutualisation est la réponse que les territoires ont déjà trouvée

Puisqu'une commune isolée ne peut ni recruter ni faire vivre un tel poste, les territoires ont inventé l'échelle intermédiaire. GéoMAS, la géomatique mutualisée des Alpes du Sud, en est le cas le mieux documenté : opérationnel depuis 2015, il couvre 204 communes, 10 intercommunalités et 3 départements pour 1 500 utilisateurs, coûte 62 500 euros hors taxes par an et mobilise un équivalent temps plein de pilotage au Département des Hautes-Alpes. Elle a divisé par deux les coûts du Département et rend le service jusqu'à quinze fois moins cher pour un EPCI qu'un SIG en accès indépendant, [selon la Banque des Territoires](https://www.banquedesterritoires.fr/geomas-le-systeme-dinformation-geographique-de-tous-les-superlatifs).

Le même mouvement s'observe ailleurs : le [service SIG du Pays de Brocéliande](https://sig.pays-broceliande.bzh/service-sig), né en 2011 des besoins du SCoT, réunit trois communautés de communes et un syndicat mixte, en mutualisant outils techniques et compétences.

## Une répartition en trois responsabilités ne dépossède personne

De tout ce qui précède se dégage un partage assez simple, et qui ne retire son travail à personne.

**Produire et qualifier la donnée géographique reste au géomaticien**, en interne quand la collectivité en a un, dans un service mutualisé ou départemental sinon. Le cadastre, les réseaux, l'adressage, l'urbanisme numérisé sont des données de référence, et le guide de l'AITF est clair sur ce point : « pour chacune d'elle il doit y avoir un responsable identifié chargé de sa gestion », le service en charge de l'information géographique étant [le plus indiqué](https://georezo.net/wiki/aitf/guidesig/principes_generaux). C'est un travail d'expert, il doit le rester.

**Décider ce qui devient public, et l'écrire, relève de la communication et de la direction générale.** Choisir les projets à exposer, rédiger un texte compréhensible par un habitant, assumer un calendrier annoncé : ce sont des compétences éditoriales et politiques, pas géomatiques.

**Tenir à jour les dates et les états appartient à celui qui les connaît**, c'est-à-dire au service technique qui suit le chantier ou au chargé d'opération qui suit le projet. C'est le sujet de notre article sur la [publication des travaux de voirie à partir du SIG](/home/ressources/travaux-voirie-sig-publication).

C'est cette répartition que le socle d'Open Projets essaie de rendre matérielle : des rôles et des territoires, où chacun n'accède qu'à sa collectivité et aux modules qui la concernent. Le SIG, lui, reste la source de vérité et n'a pas à être remplacé : savoir [si votre besoin relève d'un SIG ou d'un outil métier](/home/ressources/sig-ou-outil-metier-commune) mérite d'être tranché avant tout achat, et la réponse est souvent « les deux, mais pas pour la même chose ». Côté habitants, une [carte des travaux de la commune](/home/ressources/carte-des-travaux-commune) tenue à jour par ceux qui suivent les chantiers vaudra toujours mieux qu'une couche parfaite que personne n'a le temps de publier.

## L'essentiel en six points

- Tenir un SIG est un métier codifié par l'État : une fiche du référentiel territorial, une option dédiée au concours d'ingénieur territorial, un titre professionnel de technicien supérieur en système d'information géographique.
- Le niveau demandé est élevé : Ploërmel Communauté exige un master en géomatique et trois ans d'expérience pour un poste de catégorie B, avec cinq mois entre l'offre et la prise de poste.
- Les obligations de production de donnée géographique ne connaissent aucun seuil de taille : adressage pour toutes les communes depuis 2024, urbanisme au standard CNIG, PCRS pour les DICT à partir de 2026.
- L'État reconnaît le problème : l'ANCT propose un outil sans expertise technique et un autre destiné aux géomaticiens, et le Géoportail de l'urbanisme conseille d'inscrire la numérisation au cahier des charges du bureau d'études.
- La mutualisation est la réponse éprouvée : GéoMAS couvre 204 communes pour un temps plein de pilotage et 62 500 euros hors taxes par an, le Pays de Saint-Malo fait vivre cinq agents pour quatre intercommunalités.
- La répartition saine tient en trois lignes : la donnée de référence au géomaticien, le choix de ce qui est public à la communication et à la direction générale, les dates et les états à ceux qui suivent le terrain.
