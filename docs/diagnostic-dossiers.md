# Dossiers de zone

Refonte du 16 septembre 2026, issue de [la proposition éditoriale](diagnostic-rapport-proposition.md).

## Parcours livré

Sélectionner une zone dans le diagnostic puis **Analyser la zone**. Les cartes et les données sont conservées, puis l’ouverture du dossier lance automatiquement la lecture de tous les témoignages, leurs rapprochements et la synthèse. Une zone sans texte conserve le bouton **Ouvrir le dossier de zone** et ses données factuelles, sans appel IA inutile.

L'adresse `/admin/diagnostic/{id}/` ouvre une version sans reconstruire la carte initiale. L'agent peut consulter les preuves, ajuster leur lecture, réordonner les constats de la même couche, choisir ceux du PDF et ajouter ses observations. L'agent peut également écrire sa propre synthèse, attribuée à la collectivité dans le web et le PDF. Une reformulation est attribuée à la collectivité ; la proposition générée est conservée dans `finding.generated`. Elle invalide la synthèse automatique pour éviter de transmettre une conclusion devenue incohérente.

**Enregistrer une version** insère un nouveau document. L'ancienne version reste inchangée. **Exporter en PDF** reste indisponible tant que la lecture ou la synthèse est incomplète. L’impression native du navigateur affiche alors un message d’attente, jamais un rapport factuel présenté comme terminé. Une fois l’analyse complète, le bouton lance directement l’impression A4 du même contenu, sans nouvel appel IA. Les options du PDF sont dans le panneau Personnaliser. Les textes utilisés en extrait sont joints intégralement. Une option ajoute toutes les observations. Le navigateur fournit l'enregistrement PDF ; ses en-têtes doivent être désactivés comme indiqué dans ces options.

## Lecture et personnalisation de l’interface

Le dossier s’ouvre dans un espace de lecture dédié. Le bouton « Carte du diagnostic » restaure l’administration. Les trois onglets sont **Synthèse**, **Analyses** et **Sources**, accessibles au clavier.

- **Synthèse** : la lecture croisée, la carte générale et l’étendue des données disponibles. Aucun constat ni indicateur n’y est recopié sous forme de carte supplémentaire.
- **Analyses** : une fiche par couche, qu’elle porte des témoignages ou des mesures. La navigation conserve les couches vides, grisées et non cliquables, avec « Aucune donnée dans cette zone ». Une couche en erreur reste accessible pour expliquer que son contenu dans la zone est inconnu. Dans chaque fiche, les constats se déplient un par un. Les preuves d’un constat et toutes les observations de sa couche sont consultables séparément. Les mesures et leurs cartes appartiennent à cette fiche.
- **Sources** : un registre de provenance, de période et de limites. Les couches d’une même provenance et d’une même édition partagent leur notice. Les volumes restent par couche, sans additionner des couches potentiellement dérivées des mêmes données. Des liens relient une fiche d’analyse à sa notice et réciproquement.

« Personnaliser » ouvre le titre, l’objet, la synthèse et les observations dans un panneau latéral. Les options d’un constat (reformulation, inclusion dans le PDF, ordre au sein de sa couche) se déplient à la demande. Le constat choisi est mémorisé pendant la navigation entre couches. Sur mobile, un sélecteur de couche remplace la colonne latérale ; les constats restent dépliables.

La progression apparaît au-dessus des onglets pendant le traitement ; son bilan est ensuite consultable dans la méthode. Les mesures et les textes d’origine restent accessibles pendant l’analyse.

## Organisation du code

| Fichier | Responsabilité |
| --- | --- |
| `diagnostic/geometry.js` | Surface du polygone, intersections, découpe des lignes, distance aux segments. |
| `diagnostic/report.js` | Création, capture des cartes, enregistrement initial et historique léger. |
| `diagnostic/dossier/model.js` | Document versionné, provenance, périodes, indicateurs et couverture. |
| `diagnostic/dossier/contract.mjs` | Schémas partagés, découpage des textes, validation des références et contrôles ciblés de formulation. |
| `diagnostic/dossier/analyze.js` | Lecture par lots, rapprochements, synthèse hiérarchique, reprise. |
| `diagnostic/dossier/drafts.js` | Brouillons IndexedDB, isolés dans l'application par compte, ville et version. |
| `diagnostic/dossier/page.js` | Chargement, navigation, édition, preuves et export. |
| `diagnostic/dossier/view.js` | Rendus web et papier issus du même document. |
| `diagnostic/dossier/dossier.css` | Styles du lecteur, des dialogues et de l'édition A4. |
| `diagnostic/legacy-report.js` | Lecture seule des versions historiques. |
| `netlify/functions/lib/diagnostic-dossier.mjs` | Appels IA bornés derrière les contrôles JWT et administrateur/ville existants. |

Tous ces chemins côté navigateur sont sous `admin/sections/`.

## Document et persistance

Le JSONB `diagnostic_reports.analysis.dossier` contient `schemaVersion: 2`, un identifiant de famille, une révision, le périmètre, les sources, les observations originales, les indicateurs calculés, les constats, les notes et les figures JPEG. Les figures enregistrent aussi leur emprise et leur attribution. Le placement des observations sur la figure utilise la projection Mercator de cette même emprise.

Le stockage existant suffit : aucune migration et aucun bucket public supplémentaires. Les images suivent les règles RLS du rapport. L'historique ne télécharge plus les analyses ni les images de toutes les versions ; une lecture complète, filtrée par ville et identifiant, intervient à l'ouverture.

Chaque lot terminé est conservé dans le brouillon local. Une version enregistrée peut aussi transporter l'analyse partielle et reprendre sur un autre appareil. Tant que cette version n'est pas enregistrée, la reprise reste propre au navigateur. Fermer la page interrompt les étapes suivantes ; aucun traitement de fond n'est lancé. La réouverture reprend automatiquement les étapes manquantes, sans relire les lots déjà validés. Une pause ou une panne sur la page affiche « Reprendre l’analyse » ; aucun nouvel essai automatique ne tourne en boucle. Les dossiers terminés ne relancent pas l’IA, sauf reprise ciblée des anciennes formulations abstraites ou des anciens constats transversaux non retouchés. Les lectures conservées sont réutilisées seulement si leurs fragments et leur provenance correspondent au lot attendu. Un ancien constat transversal retouché ou inclus dans une sélection éditoriale reste intact, rangé dans sa couche principale avec une mention explicite, sans dupliquer ni retirer ses preuves. Les reprises automatiques sont bornées et restent interruptibles avec « Mettre en pause ». Un défaut de stockage local est signalé, avec un repli en mémoire limité à l'onglet.

Les figures augmentent le poids du JSONB : environ 1 à 2 Mo pour les cas de démonstration. Une source de référence ou un cadrage de constat supplémentaire ajoute une capture. Pour des usages comportant des dizaines de sources ou beaucoup de versions, déplacer les figures dans un stockage privé sera préférable. Les instantanés actuels restent autonomes et migrables.

## Lecture et exactitude

- Les lignes sont découpées au périmètre avant le calcul des longueurs. Les polygones intersectant la zone sont retenus, mais leur surface individuelle n'est pas agrégée.
- Strava utilise le maximum d'un tronçon et la durée réelle de l'année lorsqu'elle est connue. Un ancien paramétrage en somme ne réintroduit pas le cumul des trajets.
- Sous cinq accidents, le dossier affiche leur liste et leur décompte, sans ventilation statistique.
- Les compteurs restent des stations distinctes. Les inconnues de période restent visibles.
- Plusieurs couches d'une même provenance, notamment FUB, ne deviennent pas plusieurs enquêtes indépendantes.
- Les textes ne sont plus coupés à 200 caractères ni limités aux 300 premiers points. Des lots de 36 fragments au plus et 28 000 caractères sont traités successivement. Un texte dépassant 10 000 caractères est partagé sans perte ; il n'est déclaré traité que lorsque tous ses fragments le sont.
- Les citations affichées viennent des originaux. Les références inventées sont ignorées et les omissions d'un lot empêchent sa validation. Un sujet omis par le rapprochement reste présent dans le dossier.
- Les lots de lecture et les rapprochements sont strictement isolés par couche. Les rapprochements reçoivent les groupes, des extraits originaux et jusqu’à 60 indicateurs de cette couche. Tous les indicateurs restent disponibles dans les fiches de mesures, même lorsqu'ils n'ont pas été transmis au modèle.
- Les rapprochements se font par ensembles de 36 groupes. La synthèse d’ouverture reçoit ensuite les constats de toutes les couches, y compris les mesures avec leurs unités, leurs provenances et leurs périodes. Elle les rapproche par réduction hiérarchique sans imposer de lien causal ou spatial. Des constats voisins peuvent subsister entre ensembles : cette limite figure dans la méthode du dossier.
- Les cercles de la carte regroupent les observations pour la lisibilité à l'échelle d'affichage. Ils ne constituent pas des concentrations statistiques ni des scores de risque. Les repères A et B désignent les textes illustratifs.

Le nouveau traitement utilise `gpt-5.4-mini`, avec un raisonnement faible et des sorties JSON contraintes. Le support de ces paramètres est documenté dans [la fiche officielle du modèle](https://developers.openai.com/api/docs/models/gpt-5.4-mini). Le format structuré ne garantit pas la véracité du texte, comme le précise [la documentation des sorties structurées](https://developers.openai.com/api/docs/guides/structured-outputs).

Les essais réels ont conduit à renforcer les consignes et à refuser certaines extrapolations de fréquence ou de risque. Une réponse refusée par les contrôles reçoit au plus deux corrections automatiques, avec le motif précis (références, couverture, formulation ou longueur de la synthèse). Les erreurs réseau et les réponses temporaires du service sont reprises deux fois avec une attente croissante ; un délai Retry-After est respecté dans la limite de 30 secondes. Les refus de configuration, de quota ou d’authentification ne sont pas relancés automatiquement. Un lot de lecture ou de rapprochement qui dépasse le délai, reste incomplet ou échoue aux contrôles est subdivisé jusqu’à trois niveaux. Les lots déjà validés sont conservés ; leur découpage est stocké dans analysis.splits, compatible avec les anciens dossiers. Une panne persistante garde le dossier partiel et les étapes validées. Ces règles ne sont pas un vérificateur sémantique complet : la page distingue les données, les lectures et les questions terrain, et permet à l'agent de reformuler avant transmission.

La vérification réelle des lectures par couche a également révélé une déformation de 1 240 passages par jour en 1,24 million dans la synthèse. Un contrôle compare désormais les valeurs numériques aux lectures citées et à leurs indicateurs, y compris dans les synthèses intermédiaires. Il accepte les arrondis à l'unité, au dixième et au centième, mais refuse les valeurs inventées et les changements d'échelle. Le motif `numbers` déclenche une correction de la seule synthèse ; les lectures déjà validées sont conservées. Ce contrôle ciblé ne valide pas automatiquement le sens, l'unité ou le périmètre de chaque phrase.

## Simplification du 17 septembre 2026

Les trois onglets partagent une navigation sobre, sans sous-titre ni compteur répété. Les mesures sont présentées une seule fois, dans l’analyse de leur couche. Pour un constat simple fondé sur un même texte, la citation tient lieu d’explication : le paragraphe généré n’est pas répété. Les reformulations manuelles restent affichées.

Les consignes imposent un objet concret, la gêne ou la demande rapportée et uniquement les lieux connus. Une demande ne prouve pas une absence ; une fusion ne propage pas le dispositif demandé dans un texte à tous les lieux. La lecture peut être vide quand le titre suffit. Les réserves génériques restent dans la méthode.

Un contrôle ciblé refuse notamment « associés à des besoins » et transmet un motif de correction `clarity`. Ce contrôle ne garantit pas à lui seul la pertinence sémantique. À l’ouverture d’une ancienne version contenant une telle formule, les rapprochements et la synthèse sont repris en brouillon depuis les lectures et extraits conservés. Les lots de témoignages déjà lus sont réutilisés. La version enregistrée reste intacte. Cette reprise ne s’applique pas si des constats ont été reformulés ou exclus du PDF, ni si les lots conservés ne couvrent pas toutes les observations.

## Budget d'une génération

Chaque appel au service d'analyse est réservé puis réglé dans la base (`reserve_diagnostic_ai`, `settle_diagnostic_ai`, clé de service obligatoire, donc jamais depuis le navigateur). Deux montants, tous deux définis dans `dossier/contract.mjs` : le budget prévu (0,24 $) et le plafond d'arrêt (1 $, valeur par défaut de `diagnostic_ai_runs.limit_micro`). Le coût est estimé à la sélection de la zone, à partir du nombre de textes lisibles (`estimateAnalysisMicro`, coefficients mesurés le 18/09/2026 : environ 1 000 µ$ par texte pour la lecture et la vérification, 70 000 µ$ pour la synthèse finale), et jugé dans le panneau Analyse avant le premier appel, sans afficher de montant. Au-delà du budget prévu, l'écran prévient sans empêcher (zone plus petite ou sources à masquer) : une génération commencée va jusqu'au bout tant qu'elle reste sous le plafond. Au-delà du plafond estimé, le bouton ne se lance pas. Un plafond atteint en cours de route conserve les étapes terminées, ne relance rien de lui-même et renvoie vers la carte pour une zone plus petite. La réflexion interne du modèle se décompte dans la limite de sortie de chaque appel : la vérification dispose de 8 000 jetons et la synthèse finale de 6 000, après trois vérifications facturées qui avaient consommé leurs 3 000 jetons en réflexion sans rien écrire.

## Vérification

Les fichiers ciblés sont :

```sh
npx playwright test tests/unauth.diagnostic-dossier.spec.js tests/unauth.diagnostic-chiffres.spec.js tests/admin.diagnostic-dossier.spec.js tests/admin.diagnostic.spec.js tests/invited.diagnostic.spec.js
npm run lint
```

Les cas synthétiques couvrent un secteur dense, un bourg peu documenté, des mesures seules, une source inconnue et une source en échec, une zone vide, Strava sur une année bissextile, quelques accidents et 410 observations. Les essais portent aussi sur la reprise après rechargement, les textes longs, les références, les reformulations, l'ordre des constats, les anciennes versions et le choix de l'édition PDF.

Un aller-retour réel dans `diagnostic_reports` vérifie la conservation du document et de ses images sous le RLS existant, puis supprime uniquement sa ligne d'essai. Le test du refus contributeur appelle le handler réel avec le JWT du compte de test : Netlify Dev transforme les réponses 403 de la route personnalisée en repli HTML, ce qui fausserait une assertion sur son statut HTTP final.

Les captures web ont été examinées sur écran large, petit écran et thème sombre. Les figures ont été produites par MapLibre avec un fond OSM réel. Les PDF courts et longs ont été exportés dans Chromium puis rendus avec Poppler pour examiner la pagination. Les données des démonstrations sont synthétiques et annoncées comme telles ; elles ne constituent pas un nouveau diagnostic de Grenoble.

## Limites assumées

Le PDF dépend encore du moteur d'impression du navigateur. Une génération identique sur tous les navigateurs nécessiterait un service de rendu commun. Le lasso et les figures restent dépendants de WebGL ; une carte indisponible est signalée et le dossier reste consultable. Le chargement incomplet des tuiles est indiqué dans la figure.

Les classements territoriaux et les notes de priorité ne sont pas repris dans le nouveau dossier : le référentiel chargé ne permet pas de les généraliser à toutes les collectivités. Les mesures et les textes restent exploitables sans leur attribuer une autorité supplémentaire.

Les tests et les essais contrastés ne démontrent pas que chaque jeu réel sera bien interprété. Ils vérifient le contrat de traitement, ses reprises et ses cas limites. La pertinence métier de la première édition doit encore être lue sur les données réelles d'une collectivité.

## Affinage de la lecture et de l'édition papier

Le dossier reprend les neutres et Inter de l'administration, avec l'accent de la collectivité. Les cinq tokens `--print-*` de `styles/00-colors.css` conservent les couleurs claires du papier même lorsque l'écran est sombre.

La couverture sépare la date de constitution des périodes documentées. Elle présente la synthèse, la carte générale et les liens internes vers les chapitres. Les textes très longs disposent d'une ouverture sur deux pages, sans tronquer la synthèse de la collectivité.

Les constats simples (un seul texte distinct, pas de mesure associée, contenu bref) partagent une composition compacte. Le PDF présente directement leurs citations originales ; une reformulation manuelle reste affichée. Les autres constats conservent leur explication développée. L'analyse propose d'abord les constats réunissant plusieurs textes distincts ou des mesures associées, puis les observations simples. Cet ordre de lecture ne mesure aucune gravité et reste modifiable. La composition respecte ensuite l'ordre choisi, sans quota de constats.

Les cartes de constat utilisent un cadrage calculé sur leurs observations, avec du contexte autour d'un point isolé. Les fonds sont produits à la lecture ou avant l'enregistrement et l'export, puis conservés dans `figures`. Deux cadrages identiques partagent leur image. Une panne garde la vue générale et arrête la préparation des zooms restants. Les lettres A et B identifient les citations ; les nombres comptent les observations regroupées à l'échelle d'affichage. Les sources de référence sont cadrées sur les éléments retenus lors de la création.

Chaque PDF inclut toutes les observations référencées par les constats choisis, même si elles ne font pas partie des deux citations illustratives. Une annexe regroupe les textes identiques d'une même source en gardant tous leurs identifiants. Les références sont cliquables dans le PDF. L'option d'annexe complète ajoute les observations non citées. Le lien du dossier web n'est imprimé que pour une version enregistrée sans modification locale.

Les liens publics des sources viennent du catalogue ou du champ explicite `popup.source_url`. Les liens comportant une authentification, une requête ou un fragment sont écartés pour ne pas copier de jetons dans un document diffusé.

Le relais journalise uniquement l’étape, le code d’erreur, le statut, la durée et l’identifiant de requête du service, sans texte des témoignages. Les erreurs structurées distinguent les limites permanentes des interruptions récupérables.
