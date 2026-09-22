# Diagnostic terrain : proposition pour le rapport de zone

Proposition discutée le 16 septembre 2026, conservée comme historique de conception. La refonte réalisée et ses limites sont décrites dans [la documentation des dossiers de zone](diagnostic-dossiers.md).

## Intention

Passer d'un inventaire de données à un dossier de compréhension d'un secteur, utilisable par un chargé de mission et transmissible à sa direction. Le dossier doit relier les difficultés décrites, les lieux concernés et les éléments qui les étayent. Le lecteur doit distinguer immédiatement une observation, une interprétation et une question encore ouverte.

Le rapport web devient l'espace de lecture et de préparation. Le PDF est une édition figée de ce dossier, adaptée à une réunion ou à une transmission.

## Ce qui a été examiné

- Les six pages du rapport PDF de l’administration, exporté le 22 juillet 2026 : Grenoble, secteur Berriat / Pierre-Sémard, 166 points, cinq couches annoncées comme sources, sept sujets.
- Les cinq pages du PDF `Admin OpenProjets Agreg Grenoble.pdf`, prototype du 20 juillet 2026 : 61 points, constats notés et recommandations.
- Le code actuel : sélection, calculs, prompt IA, génération des figures, composition HTML, styles d'impression et sauvegarde.

Les deux PDF sont dans les téléchargements de Solal. Ils sont antérieurs au code actuel. Les défauts observés dans ces fichiers ne sont donc pas tous des défauts encore présents en production. Aucun nouvel export connecté n'a été réalisé. L'accès aux rapports par le compte de test configuré a renvoyé une liste vide.

## Diagnostic sur les documents existants

### Le lecteur doit reconstruire l'analyse

Dans le rapport du 22 juillet, « Proximité des voitures », « Carrefour dangereux », « Absence de bande cyclable » et « Aménagements cyclables insuffisants » sont séparés. Plusieurs citations décrivent pourtant des difficultés liées : dépassements dans un passage étroit, redémarrage en montée, sas non respecté, croisements entre modes.

Le rapport classe des textes mais n'explicite pas leurs relations. Une liste par source peut rester utile dans les preuves ; elle ne devrait pas déterminer le plan de lecture principal.

### Les grands nombres renseignent davantage le traitement que le lieu

166 points lus, cinq sources et sept sujets décrivent le travail de l'outil. Ils ne disent pas encore ce que le lecteur doit retenir du secteur.

Les 139 points noirs du Baromètre occupent 84 % des points sélectionnés. Cela n'est ni une part d'habitants insatisfaits, ni une mesure de danger. Trois couches du même Baromètre sont comptées séparément : cinq couches ne signifient pas cinq enquêtes indépendantes.

Les cinq sujets négatifs affichent chacun trois références, soit 15 points cités parmi les 139 points de cette couche. Le PDF ne permet pas de savoir combien des autres points portent un texte exploitable ni pourquoi ils ne sont pas rattachés à un sujet. Il faut mesurer la couverture du classement, et distinguer le nombre de points concernés du nombre de citations choisies pour illustrer.

### Des ambiguïtés importantes restent invisibles

- Le résumé du 22 juillet parle de fermetures de routes « fréquentes », alors que les entrées Waze montrées n'établissent pas une fréquence dans le temps. Le prompt actuel interdit désormais ce type de déduction.
- La rubrique stationnement contient un commentaire sur la cohabitation vélo-piétons. La catégorie d'origine et le sens réel du texte doivent être conservés séparément.
- Des appréciations positives d'une passerelle et un commentaire sur une cohabitation difficile apparaissent dans des rubriques éloignées. Leur éventuelle proximité est une question à examiner, pas une contradiction à effacer ni une identité de lieu à présumer.
- Trois citations Waze répètent une adresse. Une adresse est un repère, pas un témoignage à mettre entre guillemets.
- Des citations sont coupées au milieu d'un mot ou d'une phrase.

### La composition imprimée n'accompagne pas le raisonnement

Dans l'export du 22 juillet, la synthèse commence en bas de la première page et finit au début de la suivante. Les blocs de sources se prolongent sur plusieurs pages. Les annexes répètent de nombreux textes déjà cités. La dernière page est largement vide. La carte permet de voir une concentration, mais elle ne localise pas les sujets avec les mêmes repères que le texte.

Le prototype du 20 juillet montre une autre limite : une présentation plus affirmative peut donner une autorité excessive à des conclusions insuffisamment étayées. Il propose notamment plus de 150 places vélo et trois axes prioritaires, sans base de dimensionnement visible. Ses notes de gravité et de confiance ne sont pas démontrées.

## Ce que le code actuel a amélioré, et ce qui reste structurel

Le rapport actuel ajoute des cartes thématiques, des indicateurs par source, des rapprochements géographiques et des lieux numérotés. Il dispose donc déjà d'une grande partie des briques nécessaires.

Les limites suivantes restent dans la conception actuelle :

| Point | Conséquence | Orientation proposée |
|---|---|---|
| L'IA doit restituer chaque couche séparément. | Elle ne construit pas de constats communs entre sources. | Classer les observations puis construire des constats localisés avec des références explicites. |
| Les trois constats de couverture sont des phrases sélectionnées dans un ordre fixe. | La présence d'une source détermine en partie ce qui apparaît comme essentiel. | Choisir les constats selon leur contenu et leur couverture, avec possibilité de réorganisation par l'agent. |
| Chaque texte est limité à 200 caractères dans le prompt. | Tous les points peuvent être transmis sans que tous les textes soient lus intégralement. | Traiter les textes par lots bornés, conserver les textes complets et signaler tout échec de traitement. |
| Les citations renvoyées par l'IA sont nettoyées, mais pas comparées automatiquement à l'original. | Leur fidélité repose en partie sur le prompt. | Rendre les citations depuis le texte source et vérifier les extraits. |
| Le classement des lieux utilise un score `10 × nombre de couches + nombre de points`. | Beaucoup de points d'une couche peuvent dépasser un lieu étayé par plusieurs couches, contrairement à la méthode annoncée. | Distinguer les familles de provenance et rendre explicite le mode de classement. |
| Surface calculée sur l'emprise des points ; lignes retenues par ancrage ou sommet ; longueurs des lignes retenues comptées en entier. | Surface et kilomètres peuvent ne pas correspondre exactement au polygone tracé. | Calculer sur le polygone réel et découper les lignes aux limites. |
| La proximité d'un aménagement repose sur ses sommets. | Une longue ligne proche peut être considérée comme éloignée. | Calculer une distance à la ligne, en tenant compte du contexte disponible. |
| Le rang territorial compare des cellules occupées dans les données chargées. | Il peut être lu à tort comme un classement de tous les secteurs administratifs ou comme un taux de risque. | Nommer précisément la référence et réserver les comparaisons aux périmètres compatibles. |
| Les métriques génériques Strava totalisent encore les passages par tronçon. | Le contexte IA et les annexes peuvent afficher un total qui compte plusieurs fois un trajet, malgré l'indicateur principal corrigé. | Une définition unique de chaque indicateur pour tous les rendus. |
| Le rapport complet dépend d'une analyse IA comportant des témoignages. | Un secteur riche en mesures seules n'accède pas au même dossier. | Générer le dossier factuel indépendamment de la présence et du succès de l'IA. |
| Les figures ne sont pas sauvegardées. | La réouverture depuis l'historique perd les cartes. | Conserver les figures et la version des données ayant servi au document. |

Références principales : `admin/sections/diagnostic/insights.js`, `analysis.js`, `report.js`, `figure.js`, `map.js`, `data.js`, `recipes.js` et `netlify/functions/ai-diagnostic.mjs`.

## Le nouveau parcours

1. L'agent trace une zone et ouvre son dossier. Les sources incluses, leurs périodes et leurs éventuels défauts de chargement sont visibles. Il peut donner un nom au secteur et préciser l'objet de son étude ; ces champs restent facultatifs.
2. Le dossier présente une synthèse courte et quelques constats localisés. Leur nombre dépend des éléments disponibles, sans obligation de remplir trois ou six cases.
3. L'agent ouvre un constat. La carte affiche ses seuls éléments pertinents et les preuves sont accessibles à côté. Il peut comprendre le rapprochement et consulter ce qui le nuance.
4. Il ajoute sa connaissance terrain, ajuste le titre et choisit les constats à transmettre. Les notes de l'agent sont clairement attribuées ; les mesures et les sources restent traçables. Cette étape ne doit pas devenir un formulaire obligatoire avant chaque export.
5. Il exporte une version datée. Le document sauvegardé conserve son contenu et ses cartes. Une actualisation ultérieure produit une nouvelle version.

## La page web

Une page dédiée dans l'administration, avec une adresse de rapport stable et un accès limité à la collectivité. Elle doit pouvoir se rouvrir sans dépendre de la carte initiale.

Disposition proposée : un sommaire court, un corps de lecture et une carte liée au constat consulté. Sur petit écran, la carte et le texte s'empilent. Un clic sur une référence révèle l'observation complète et sa provenance.

Le plan principal répond à quatre questions :

1. **Que retenir de ce secteur ?** Une synthèse courte, une carte de repérage et les quelques chiffres nécessaires à sa compréhension.
2. **Où se situent les difficultés et les points positifs ?** Des constats par lieu ou par axe, chacun relié à ses preuves.
3. **Que faut-il encore vérifier ?** Les informations manquantes, les divergences et les observations à conduire sur place.
4. **Sur quoi repose le dossier ?** Les sources, les périodes, la couverture, les définitions et les données détaillées.

Les comparaisons entre périodes ne sont proposées que si des jeux comparables sont réellement présents. Waze reste une observation datée. Un volume Strava ne devient jamais un nombre de personnes distinctes. L'absence de donnée ne devient pas une absence de difficulté.

## La brique centrale : un constat argumenté

Chaque constat comporte :

- Un titre qui dit ce qui ressort, et le lieu auquel il s'applique.
- Une courte explication reliant les observations disponibles.
- Une carte conçue pour cette explication, avec repères identiques dans le texte, légende et période.
- Les chiffres utiles, leurs unités, leurs dénominateurs et leurs références.
- Une ou deux citations illustratives, distinctes de l'ensemble des points concernés.
- Ce qui nuance le constat et ce que les données ne permettent pas de conclure.
- Une question de vérification concrète, si nécessaire.
- Les observations complémentaires de l'agent, lorsqu'il en ajoute.

L'ordre proposé doit rester explicable. Une convergence entre plusieurs provenances peut justifier une mise en avant ; un signal isolé mais précis doit rester consultable. Aucun score global de gravité ou de confiance n'est nécessaire. Préférer des indications factuelles : « témoignages seuls », « plusieurs provenances », « période inconnue », « localisation approximative ».

## Essai éditorial à partir du rapport de Grenoble

Cet exemple utilise uniquement des textes présents dans le PDF du 22 juillet. Il ne constitue pas une nouvelle analyse exhaustive des 166 points, dont les données complètes n'ont pas été récupérées.

### Des difficultés de cohabitation avec les véhicules sont décrites dans les passages étroits

Les points #32, #36, #50, #64, #70, #79 et #81 évoquent des dépassements difficiles, une largeur insuffisante ressentie, un sas vélo non respecté ou la pression des véhicules. Plusieurs commentaires associent ces difficultés à une montée ou au redémarrage après un feu. Le point #64 distingue explicitement les jonctions Berriat vers Semard et Vizille vers Semard.

Cette lecture réunit sept observations citées dans le PDF. Elle ne mesure ni la largeur réelle de la chaussée, ni la fréquence des dépassements, ni un taux d'accident. Les sept références ne doivent pas être présentées comme sept personnes distinctes ni comme l'ensemble des observations concernées.

La carte du constat devrait situer ces observations, séparer les deux approches si leurs coordonnées le confirment et afficher les aménagements connus sur ces passages. L'export existant ne fournit pas les coordonnées individuelles nécessaires à cette vérification.

**À vérifier sur place :** où se termine la continuité cyclable, comment les véhicules et les vélos se positionnent au redémarrage, et si des livraisons réduisent le passage disponible. Ces questions sont issues des témoignages ; elles ne prescrivent pas encore un ouvrage.

### Une passerelle appréciée, avec une question de cohabitation à localiser

Les points #3 et #8 apprécient une liaison dédiée aux vélos. Un commentaire classé dans la couche stationnement évoque une cohabitation vélo-piétons difficile sur une passerelle. Le dossier devrait présenter les deux informations et vérifier leur localisation avant d'affirmer qu'elles décrivent le même ouvrage.

Cela permet de conserver un point positif tout en examinant une difficulté d'usage. Le libellé de la couche d'origine ne doit pas empêcher cette lecture.

## L'édition PDF

Une édition courte par défaut : une page de synthèse, puis les constats retenus, puis la méthode et les sources. La longueur s'adapte au cas. Un petit dossier n'a pas besoin de huit pages ; un constat complexe peut en demander deux.

- La première page doit rester compréhensible seule : nom du secteur, objet, période, synthèse et carte annotée.
- Chaque doublet texte/carte doit porter une idée identifiable. Un changement de page ne doit pas séparer un titre de son contenu ou une figure de son explication.
- Les preuves détaillées restent accessibles dans la page web. Une annexe complète peut être incluse à l'export ; les références nécessaires à vérifier les constats restent présentes dans l'édition courte.
- Légendes, unités, sources et dates accompagnent chaque figure. Les styles des sources doivent rester cohérents entre carte et texte.
- Les notes méthodologiques importantes apparaissent près du constat concerné, et pas seulement à la fin.
- En-tête du dossier, numéro de page et version remplacent les éléments techniques du navigateur.

Le PDF et la page web utilisent la même version du dossier. Ils ont deux mises en page adaptées à leur support, sans relancer l'IA au moment de l'impression.

## Faisabilité avec le socle existant

### Conserver

Le catalogue, les imports, les couches de la collectivité, Supabase, les contrôles d'accès, MapLibre et la génération de figures hors écran sont réutilisables. Les indicateurs purs et leurs tests forment une base, sous réserve de corriger leurs définitions et leurs limites géométriques.

### Refondre le traitement analytique

Construire un dossier structuré avant toute mise en page : observations identifiées, métriques définies, lieux, constats et preuves. Chaque donnée conserve sa provenance, son édition ou sa période, son instant de chargement et ses limites connues.

Le traitement comporte quatre étapes :

1. **Préparer les faits.** Sélection géométrique exacte, unités, périodes, regroupements, détection des doublons techniques. Ne pas supprimer des témoignages distincts au seul motif qu'ils se ressemblent.
2. **Lire les témoignages par lots.** Extraire les thèmes et les passages justificatifs, conserver les cas ambigus et comptabiliser ce qui a réellement été traité. Un témoignage peut aborder plusieurs thèmes.
3. **Construire les constats.** Rapprocher les faits compatibles par lieu et sujet. L'IA peut proposer une interprétation explicitement présentée comme telle ; les nombres et les relations géographiques restent calculés.
4. **Vérifier la sortie.** Références existantes, citations exactes, valeurs provenant des métriques, absence de rapprochement temporel injustifié. Un échec conserve le dossier factuel et signale l'analyse manquante.

Des lots relançables et un état d'avancement persistant remplaceraient l'appel unique limité aujourd'hui à 25 secondes et 300 points. Cela demande une orchestration, une maîtrise des coûts et des reprises sur erreur. Il ne suffit pas d'allonger le prompt.

### Enregistrer un document durable

Faire évoluer `diagnostic_reports` pour porter une version de schéma, le périmètre, les métadonnées des sources, les métriques, les constats, les références et les notes de l'agent. Stocker les figures dans un espace protégé avec des règles d'accès adaptées ; ne pas exposer publiquement des données partenaires par simple partage d'URL.

Conserver les références et les extraits nécessaires à l'audit, ainsi que les figures de la version. Le volume de données brutes à conserver et les droits propres aux sources partenaires doivent être définis. Les rapports historiques restent lisibles dans leur ancien format.

### Rendre le web et le PDF

Créer une route d'administration dédiée au dossier. Séparer les calculs, le modèle du document, le rendu web et les styles imprimés aujourd'hui concentrés dans `report.js`.

Une première version peut utiliser l'impression navigateur existante, avec une composition réellement conçue pour l'A4. Un téléchargement PDF identique dans tous les navigateurs demanderait ensuite un rendu centralisé. Cette infrastructure supplémentaire n'est pas nécessaire pour valider la nouvelle lecture du rapport.

## Vérification avant livraison

- Reprendre exactement la même zone pour comparer l'ancien et le nouveau dossier.
- Vérifier chaque constat retenu contre les observations et les calculs sources.
- Essayer une zone sans témoignages, une zone avec peu de données, des sources de périodes différentes, plus de 300 témoignages et une interruption de l'IA.
- Vérifier qu'un même jeu de données, conservé dans une version, produit les mêmes chiffres et les mêmes cartes lors de sa réouverture.
- Inspecter visuellement les PDF courts et longs, avec citations longues, nombreuses références et cartes indisponibles.
- Faire lire la première page à un agent qui n'a pas préparé le dossier : peut-il dire ce qui ressort, où cela se situe et ce qui reste à vérifier ?

## Accord recherché avant développement

Valider d'abord le principe du dossier web organisé par constats localisés, la place des interprétations et des questions terrain, et la liberté laissée à l'agent pour préparer l'édition PDF.

L'étape suivante serait une maquette sur le cas Berriat / Pierre-Sémard, avec des données vérifiées et un exemple de PDF correspondant. La refonte technique viendrait après validation de cette lecture.
