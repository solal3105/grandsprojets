---
title: QGIS en mairie : ce qu'il fait très bien, et ce qu'il ne fera jamais
description: QGIS est gratuit, puissant et officiellement recommandé par l'État : c'est exactement pour cela qu'il finit partout en mairie. Voici ce que QGIS fait très bien en collectivité, ce qu'il demande en retour, et où s'arrête honnêtement son terrain.
date: 2026-06-23
updated: 2026-06-23
tag: SIG
readingTime: 12
solutionHeading: Ce qui se met à côté de QGIS, sans rien lui retirer
solutionIntro: Open Projets ne remplace pas un SIG et n'essaie pas de le faire : il n'ouvre ni Shapefile, ni WFS, ni WMS, son seul format d'import géographique est le GeoJSON. Ce qu'il produit, c'est la couche publique qui manque en aval de QGIS : une page par projet d'aménagement, rédigée et mise à jour par un agent depuis un navigateur.
solutionPoints: Chaque projet a une fiche publique avec sa propre adresse, pré-rendue côté serveur, avec JSON-LD et sitemap | L'agent dessine la zone dans le navigateur ou importe un GeoJSON, rédige et publie sans installer de logiciel | Catégories entièrement paramétrables : nom, icône, couleur, épaisseur de trait, ordre d'affichage | Import géographique limité au GeoJSON, aucun export de données, publication effective en quelques minutes
---

Dans beaucoup de mairies, l'histoire commence de la même façon. Un agent des services techniques télécharge QGIS un jeudi après-midi, parce qu'un collègue le lui a conseillé et qu'il ne coûte rien. Il ouvre le cadastre, ajoute les points de collecte des déchets, sort une mise en page pour la commission voirie. Trois ans plus tard, le zonage d'assainissement, les réseaux d'eau et la carte des travaux du site de la commune sortent tous du même fichier de projet, ouvert sur le même poste, par la même personne.

Ce n'est ni un accident ni une erreur. QGIS est un très bon logiciel, et son omniprésence en collectivité est méritée. Le problème n'est jamais QGIS : il apparaît le jour où on lui demande un travail qui n'a jamais été le sien, faute d'avoir eu autre chose sous la main.

Cet article tient donc une liste honnête, dans les deux sens : ce que QGIS fait très bien, ce qu'il exige en contrepartie, et où passe la frontière entre produire de la donnée géographique et publier une information pour les habitants.

## L'État lui-même recommande QGIS aux administrations

Écartons d'abord tout soupçon. QGIS n'est pas un bricolage toléré : c'est un choix officiellement soutenu. Sa [fiche au Socle interministériel de logiciels libres](https://code.gouv.fr/sill/detail?name=Qgis), la liste de logiciels [recommandés pour les administrations publiques](https://www.data.gouv.fr/datasets/socle-interministeriel-de-logiciels-libres) que publie la DINUM, le référence depuis le 1er janvier 2018, sous licence GPL v2 ou ultérieure. Des dizaines d'organisations publiques y déclarent l'utiliser, parmi lesquelles l'IGN, le CNRS, l'INRAE, l'Eurométropole de Strasbourg et Saint-Nazaire Agglomération.

Sa page de [téléchargement](https://www.qgis.org/download/) propose des installeurs pour Windows, macOS et Linux, et renvoie vers deux applications tierces, QField et Mergin Maps, pour les usages de terrain sur Android et iOS : QGIS lui-même reste un logiciel de bureau. Deux canaux y coexistent, la dernière version, QGIS 4.2.1 sortie le 31 juillet 2026, et une version de support long terme, QGIS 3.44.13, pour qui privilégie la stabilité. Adopter QGIS, c'est donc aussi choisir une politique de version.

## QGIS fait très bien un travail que rien d'autre ne fera à sa place

Le projet annonce quatre familles de capacités, exactement celles dont une collectivité a besoin. La création et l'édition de couches, points, lignes, polygones et maillages. Le traitement et l'analyse, avec une boîte à outils complète et des chaînes automatisables. La production cartographique, avec un composeur de mise en page pensé pour l'impression grand format, ce qui compte quand il faut sortir un plan de zonage pour une réunion publique. Et l'extensibilité, avec un dépôt officiel qui affiche [3 922 extensions](https://plugins.qgis.org/plugins/) au relevé du 24 août 2026.

Cette richesse n'est pas théorique. L'IGN documente lui-même la [connexion de QGIS à la Géoplateforme](https://cartes.gouv.fr/aide/fr/guides-utilisateur/utiliser-les-services-de-la-geoplateforme/tutoriels-api/qgis/), avec les adresses exactes des flux WMS, WMTS et WFS nationaux, en signalant une limite réelle : l'affichage des flux WFS du Géoportail est plafonné à 5 000 objets par requête. L'État branche officiellement ses données sur QGIS.

Et la matière ne manque pas : le Géoportail de l'urbanisme recense, au 20 juillet 2026, [26 009 communes couvertes par un document d'urbanisme publié](https://www.geoportail-urbanisme.gouv.fr/statistics/). Cette donnée a été produite quelque part, souvent dans QGIS, par des professionnels. C'est le cœur du métier, et ce cœur se porte bien.

## Le mot gratuit désigne la licence, pas le coût de la publication

QGIS demande en retour trois choses qu'aucune licence libre ne fournit : une installation, une compétence et une personne.

L'installation est la plus visible des trois. QGIS est un logiciel de bureau qui vit sur un poste : il faut l'installer, le maintenir, et recommencer sur chaque poste concerné. Ce n'est pas une critique, c'est la nature d'un outil de production.

La compétence, elle, s'acquiert, et on peut en mesurer le temps. Le CNFPT Auvergne-Rhône-Alpes documente [deux sessions « L'utilisation du logiciel QGIS : initiation »](https://www.cnfpt.fr/s-informer/nos-actualites/le-fil-dactus/decouverte-du-logiciel-qgis/auvergne-rhone-alpes) organisées en union de collectivités dans l'Ain, avec douze et quatorze stagiaires, pour devenir autonome dans la gestion de données géographiques. Durée : trois mois, d'avril à juin 2021. Une formation QGIS ne se règle pas en une demi-journée.

La personne, enfin, correspond à une profession constituée. Quand le CNFPT annonce un [webinaire sur le plugin QGIS Géoplateforme](https://inet.cnfpt.fr/formation-continue/offre-de-services/evenements/plugin-qgis-geoplateforme-lhebergement-donnees), il s'adresse aux « géomaticiennes-géomaticiens et ingénieures-ingénieurs SIG de collectivités ». Son Wiki territorial va plus loin et hiérarchise les composantes d'un SIG territorial, la composante technologique étant « totalement subordonnée aux deux autres que sont les [ressources humaines et les bases de données géographiques](https://encyclopedie.wikiterritorial.cnfpt.fr/xwiki/bin/view/fiches/Linformationgeographiqueencollectiviteterritoriale/Linformatiqueauservicedelinformationgeographique/) ». Le logiciel n'est pas le sujet. La personne et la donnée le sont.

Or la structure communale française rend cette condition inégalement tenable. L'INSEE décrit la [structure de la population selon la taille des communes](https://www.insee.fr/fr/statistiques/2012729) pour la France hors Mayotte, en géographie au 1er janvier 2025 : sur 34 858 communes, 25,3 % comptent moins de 200 habitants et 3,0 % seulement atteignent 10 000 habitants ou plus. La question n'est donc pas de savoir si QGIS est bon, mais qui l'ouvre le mardi matin : c'est le sujet de notre article sur [qui tient la carte en mairie](/home/ressources/qui-tient-la-carte-en-mairie).

## Publier une carte QGIS sur le web suppose d'assembler une chaîne

Soyons précis, parce que la caricature circule : oui, une carte QGIS se publie très bien sur le web. Simplement, cela ajoute des briques. La documentation officielle décrit [QGIS Server](https://docs.qgis.org/latest/fr/docs/server_manual/introduction.html) comme « une implémentation open source de WMS, WFS, OGC API for Features 1.0 (WFS3) et WCS », une application écrite en C++ qui fonctionne avec un serveur web comme Apache ou Nginx. On passe d'un logiciel bureautique à une infrastructure. Il faut encore une couche applicative pour donner à tout cela une interface publique, et [Lizmap](https://docs.lizmap.com/current/fr/), conçue par la société 3Liz, en est une : « une application permettant de publier des cartes en ligne à partir de votre projet dans QGIS bureautique ». La chaîne complète tient alors en trois briques : QGIS Desktop avec l'extension Lizmap, QGIS Server, et Lizmap Web Client.

Le résultat est souvent excellent, et les collectivités qui s'en servent le montrent. [Yvetot Normandie](https://lizmap.yvetot-normandie.fr/index.php), en Seine-Maritime, range onze projets en cinq familles, de l'environnement à l'urbanisme. [CAP Nord Martinique](https://lizmap.capnordmartinique.fr/) publie quatorze projets, du PLU réglementaire aux sites refuges en cas de tsunami. La [Région de Suippes](https://ccregionsuippes.lizmap.com/map/), dans la Marne, met en ligne sept cartes opérationnelles, dont les déchetteries avec leurs horaires. Le [Pays du Coquelicot](https://paysducoquelicot.lizmap.com/websig/index.php/view/map/?repository=urbanisme&project=cadastre_public), dans la Somme, ouvre à tous, sans compte, un projet « Cadastre et urbanisme ». Ce sont de vrais services rendus, et une intercommunalité modeste y arrive.

Reste le coût. La licence est gratuite, l'hébergement non. Les [offres publiques de Lizmap Cloud](https://www.lizmap.com/offres.html) vont de 50 euros HT par mois pour 200 Mo de stockage à 495 euros HT pour un serveur dédié, avec un palier à 90 euros dès qu'une base PostgreSQL/PostGIS entre dans l'équation. L'auto-hébergement ne supprime pas ce coût : il le déplace vers du temps d'ingénierie.

## Ce que cette chaîne produit, c'est une carte, pas une page

Voilà la nuance qui compte, et elle n'a rien à voir avec la qualité du logiciel. Une visionneuse cartographique donne à voir des couches : on y consulte, on y sélectionne, on y exporte des entités, la documentation Lizmap précisant que l'activation de la [table attributaire](https://docs.lizmap.com/current/fr/publish/lizmap_plugin/attribute_table.html) entraîne celle des outils de sélection graphique et de l'export en fichier. C'est parfait pour un usage documentaire.

Mais un projet d'aménagement, pour un habitant, n'est pas une entité dans une couche. C'est une histoire : pourquoi cette place est refaite, ce qu'elle deviendra, quand, ce qui change pour les commerçants, à qui écrire. Cela demande un texte rédigé, une adresse stable que l'on peut coller dans un mail ou derrière un QR code, une page qui ressort quand quelqu'un tape le nom du quartier dans un moteur de recherche. Une carte affiche des objets ; une page raconte un projet. Deux livrables différents, et le second n'est pas un défaut du premier.

La mise en ligne n'est d'ailleurs pas qu'une affaire éditoriale. L'[article L312-1-1 du code des relations entre le public et l'administration](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000033205512) impose aux administrations de publier en ligne leurs documents communicables et leurs bases de données mises à jour régulièrement, avec deux seuils : il ne s'applique pas aux collectivités de moins de 3 500 habitants, et l'[article D312-1-1-1](https://www.legifrance.gouv.fr/codes/section_lc/LEGITEXT000031366350/LEGISCTA000031367692/) fixe le second à 50 agents en équivalents temps plein. Le référencement lui-même est une question juridique autant que technique : pour la [publication en ligne des documents des collectivités](https://www.cnil.fr/fr/la-publication-en-ligne-des-documents-des-collectivites-territoriales-lies-lexercice-de-leur-pouvoir), la CNIL recommande d'empêcher l'indexation des données identifiantes par les moteurs externes. Rendre visible et rendre indexable sont deux décisions distinctes.

## Recueillir un avis d'habitant n'est pas un simple champ de saisie

Ici encore, refusons la caricature. La saisie depuis un navigateur existe dans la chaîne QGIS : la documentation Lizmap décrit l'[édition d'une couche depuis l'interface web](https://docs.lizmap.com/current/fr/publish/lizmap_plugin/editing.html), avec création d'entités, modification des attributs et de la géométrie, suppression, le tout restreignable par groupes d'utilisateurs.

Le point est ailleurs : cette possibilité se mérite. Elle suppose une couche stockée dans PostgreSQL, publiée en WFS, sans espace dans les noms de champs, dotée d'une clé primaire auto-incrémentée, et une authentification extérieure à QGIS. C'est une configuration de géomaticien, pas un formulaire prêt à ouvrir au grand public.

Et un dépôt d'habitant traîne derrière lui un cortège d'obligations. La CNIL rappelle aux collectivités [cinq principes clés](https://www.cnil.fr/fr/collectivites-territoriales/les-principes-cles-de-la-protection-des-donnees) : finalité, pertinence des données collectées, durée limitée, sécurité et droits des personnes. L'[obligation de tenir un registre des traitements](https://www.cnil.fr/fr/RGPD-le-registre-des-activites-de-traitement) « concerne tous les organismes, publics comme privés et quelle que soit leur taille, dès lors qu'ils traitent des données personnelles ». Les [durées de conservation](https://www.cnil.fr/fr/les-durees-de-conservation-des-donnees) se déclinent en trois phases : base active, archivage intermédiaire, archivage définitif. Et les avis recueillis dans un cadre formel suivent leur propre procédure : pendant une enquête publique, l'[article R123-13 du code de l'environnement](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000034509539/) organise le registre dématérialisé et la mise en ligne des observations « dans les meilleurs délais ».

Un champ de saisie ne porte rien de tout cela. Un cycle de vie, si. C'est une autre discipline que la production de donnée spatiale.

## Une carte publiée par une mairie reste un service en ligne comme les autres

Dernier angle mort fréquent. Une carte mise en ligne par une collectivité est un service de communication au public en ligne, soumis au RGAA au titre de l'article 47 de la loi du 11 février 2005 : le [champ d'application](https://accessibilite.numerique.gouv.fr/obligations/champ-application/) couvre toutes les personnes morales de droit public.

Cela emporte des obligations concrètes. La page d'accueil doit porter [l'une des trois mentions](https://accessibilite.numerique.gouv.fr/obligations/mentions-et-pages-obligatoires/) « totalement conforme », « partiellement conforme » à partir de 50 % des critères respectés, ou « non conforme », et une page dédiée doit rassembler la [déclaration d'accessibilité](https://accessibilite.numerique.gouv.fr/obligations/declaration-accessibilite/), le schéma pluriannuel et le plan d'action annuel. Cet entretien incombe à la collectivité quel que soit l'outil retenu.

## Ce sont deux métiers différents, et ce n'est pas une hiérarchie

Résumons. QGIS produit, analyse et met en forme la donnée géographique d'un territoire, remarquablement bien et pour un coût de licence nul. Publier cette donnée sur le web est possible et documenté, à condition d'assembler une chaîne et d'assumer son coût d'exploitation. Ce que cette chaîne ne produit pas, c'est une page de projet rédigée, adressable et référencée, avec sa boucle de contribution habitante. Non qu'elle soit mal conçue : ce n'est simplement pas ce pour quoi elle a été conçue.

La bonne question n'est donc pas « faut-il garder QGIS », mais « qu'est-ce qu'on branche derrière ». Une plateforme de publication comme Open Projets prend le relais à cet endroit précis, sans toucher au SIG. Nous détaillons ailleurs comment [garder son SIG et publier quand même](/home/ressources/garder-son-sig-et-publier), et comment [arbitrer entre un SIG et un outil métier](/home/ressources/sig-ou-outil-metier-commune). Le service SIG n'est jamais l'obstacle : il détient la donnée, et sans lui rien ne se publie.

## L'essentiel en six points

- QGIS est un choix officiellement soutenu par l'État : référencé au Socle interministériel de logiciels libres depuis le 1er janvier 2018, sous licence GPL v2 ou ultérieure, et déclaré en usage par des organisations publiques comme l'IGN, le CNRS ou l'INRAE.
- Il excelle là où il a été conçu pour exceller : créer et éditer des couches, analyser, mettre en page, et s'étendre par 3 922 extensions officielles.
- Ce qu'il demande en retour n'est pas gratuit : une installation par poste, une compétence qui se construit sur des mois, et une personne identifiée pour la porter.
- Publier sur le web fonctionne très bien avec QGIS Server et Lizmap, comme le montrent Yvetot Normandie ou le Pays du Coquelicot, mais l'hébergement démarre à 50 euros HT par mois chez 3Liz.
- La frontière utile n'est pas technique : une visionneuse publie une carte, pas une page de projet rédigée, adressable et retrouvable dans un moteur de recherche.
- Un dépôt d'habitant existe dans Lizmap mais suppose PostgreSQL, WFS et une configuration experte, quand les obligations CNIL de finalité, de conservation et de registre s'appliquent dès le premier formulaire ouvert.
