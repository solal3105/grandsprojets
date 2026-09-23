# Analyse du diagnostic terrain, 23 septembre 2026

Cette analyse porte sur l'état du dépôt au 23 septembre 2026, y compris les modifications non commitées de la nuit du 22 au 23 (numéro d'essai dans l'empreinte des appels, synthèse en raisonnement moyen, mot refusé cité au modèle). Elle ne modifie aucun code. Chaque constat indique comment il a été établi : par une exécution, par une lecture de la base ou par une lecture du code. Un constat relevé à la lecture et non rejoué est signalé comme tel.

## Ce qui a été fait

La suite ciblée du diagnostic (`unauth.diagnostic-ai`, `unauth.diagnostic-dossier`, `unauth.diagnostic-chiffres`, `admin.diagnostic-dossier`, `admin.diagnostic`, `invited.diagnostic`) passe entièrement : 197 essais verts en 1,3 minute, et le contrôle `npm run lint` ne relève rien.

L'outil a été parcouru de bout en bout dans un Chromium piloté, avec le compte de test sur la ville `test-e2e`. Contrairement à ce qu'indique CLAUDE.md, MapLibre s'affiche en mode sans fenêtre avec les options `--enable-unsafe-swiftshader --use-angle=swiftshader --use-gl=angle` : la carte, le lasso et les figures du dossier (fond OpenStreetMap réel) fonctionnent. Le parcours a ajouté depuis le catalogue le Baromètre vélo 2025 de la Métropole de Lyon (trois couches, 24 256, 12 504 et 10 943 points, 11 secondes), les aménagements cyclables OpenStreetMap de Lyon (3 286 tronçons) et les accidents corporels de Lyon (1 976 points). Une zone de 16 km² contenant 2 290 textes a été refusée avant tout appel, comme prévu. Une zone de 0,42 km² au centre de Lyon (223 observations, 124 textes) a été analysée avec les vrais modèles, sur autorisation explicite de Solal.

La base de production a été lue pour l'usage, les coûts et les échecs. Trois relectures du code ont été conduites en parallèle (données et sources, dossier et IA, textes à l'écran) ; leurs constats graves ont été revérifiés un par un avant d'être retenus ici.

Les couches et dossiers créés sur `test-e2e` pendant ces essais seront effacés par le prochain passage de `admin.diagnostic.spec.js`, qui vide cette ville au démarrage.

## Usage réel

Depuis la refonte du 16 septembre, 20 dossiers ont été créés sur de vraies villes (18 à Grenoble, 2 à la Métropole de Lyon), tous par le compte de Solal. Un seul porte son analyse enregistrée : les autres sont restés à l'état initial, l'analyse n'ayant vécu que dans le brouillon du navigateur.

Avant la refonte, du 21 juillet au 15 septembre, 9 rapports venaient du compte de Solal, 6 de comptes VAZY et 7 d'un compte extérieur rattaché à Grenoble seulement. Ce compte a été créé le 21 juillet, a produit ses 7 rapports le 22 juillet et ne s'est pas reconnecté depuis.

PostHog compte 19 pages vues de `/admin/diagnostic` depuis le 6 août, par deux personnes, toutes sur openprojets.com.

Sur les vraies villes, 11 générations IA ont été lancées du 18 au 23 septembre. Elles ont compté 2,14 $ au total, dont 0,89 $ pour des appels coupés ou perdus, comptés au montant réservé (statut `uncertain`). Sept ont abouti à une synthèse. Une réservation de 130 170 µ$ reste ouverte depuis le 18 septembre sur un appel resté `running`. Le dossier le plus cher, le 22 septembre au matin, a compté 0,81 $, dont 0,69 $ pour six synthèses coupées au bout de 20 secondes ; aucune coupure de ce type n'a été vue après le passage à l'appel direct d'OpenAI le même jour, jusqu'à l'essai décrit ci-dessous. Hors appels coupés, un dossier terminé coûte entre 0,07 et 0,34 $, avec une médiane de 0,13 $.

## Mesure réelle du 23 septembre

Zone de 0,42 km² autour de Bellecour et d'Ainay, couches visibles : points à améliorer du Baromètre 2025, aménagements cyclables, accidents. Objet de l'étude saisi avant le lancement.

| Étape | Appels | Durée par appel | Montant compté |
| --- | ---: | --- | ---: |
| Lecture (gpt-5.4-mini) | 11 | 5 à 14 s | 84 552 µ$ |
| Vérification (gpt-5.4-mini) | 12, dont une correction de formulation | 4 à 10 s | 62 507 µ$ |
| Synthèse, premier essai (gpt-5.4, raisonnement moyen) | 1, coupé à 24,9 s | | 134 380 µ$ réservés, statut `uncertain` |
| Synthèse, second essai | 1 | 11 s, 17 688 jetons d'entrée, 516 de réflexion | 19 668 µ$ |

Durée totale : 3 minutes 46 secondes. Montant compté : 301 107 µ$, au-dessus du budget prévu de 240 000 µ$. Montant réellement connu : 166 727 µ$, auquel s'ajoute ce qu'OpenAI facture pour l'essai coupé, que nous ne savons pas.

Résultat : 124 textes lus, 45 constats de témoignages et 2 constats de mesures. La synthèse d'ouverture est juste et utile : elle part des lieux (Presqu'île, Bellecour, Ainay, Perrache), distingue les rues étroites en double sens cyclable, l'occupation des bandes par les livraisons et les conflits avec les piétons, et se termine sur ce que la visite de terrain doit vérifier, conformément à l'objet saisi. Aucun chiffre ni aucune fréquence n'y est inventé. Les constats relus sont fidèles à leurs textes. Le défaut est leur nombre et leurs recoupements (voir le constat 6).

## Constats

Classés du plus grave au moins grave pour une collectivité.

### Ce que le dossier affirme à tort

1. **Chaque accident listé est présenté comme impliquant un vélo et un piéton.** `dossier/model.js:59` teste `f.properties.velo ? 'Vélo impliqué' : ''`, alors que `sources/baac.js:100` et `:136` écrivent « oui » ou « non », et que « non » est vrai pour ce test. La liste s'affiche dès qu'une zone compte moins de cinq accidents, sur le web (`dossier/view.js:285`) et dans le PDF (`view.js:125`). Sur la couche lyonnaise téléchargée, 1 619 accidents sur 1 976 portent `velo: 'non'`. Établi par lecture du code et des données.

2. **Les accidents de 2021 et 2022 ne sont jamais chargés.** L'expression de `sources/baac.js:45` attend `caract` ou `caracteristiques`, mais data.gouv.fr publie ces deux années sous `carcteristiques-2021.csv` et `carcteristiques-2022.csv`. La couche « Accidents corporels 2020 à 2024 · Lyon » créée par le catalogue contient 782 accidents de 2020, 661 de 2023 et 533 de 2024, et aucun de 2021 ni 2022 : établi en téléchargeant la couche. Les choix « trois ans » et « tout » supposent des années consécutives (`catalog.js:484-495`) et ne lisent que 2023 et 2024. La relecture signale en outre que le fichier 2022 nomme sa première colonne `Accident_Id` au lieu de `Num_Acc` (`baac.js:89`), ce qui n'a pas été rejoué. L'essai 12.8.2b simule des titres corrects et ne peut pas le voir.

3. **Le catalogue promet des chiffres que le dossier ne calcule pas.** Strava annonce le total des passages, la part de vélos électriques et la vitesse moyenne (`sources.js:157`) ; le dossier donne le tronçon le plus emprunté et sa moyenne par jour (`model.js:75-80`). Les compteurs annoncent des passages cumulés (`sources.js:135`), le dossier les liste un par un (`model.js:96`). OpenStreetMap annonce un nombre de tronçons (`sources.js:100`), le dossier donne des kilomètres. Waze annonce le nombre d'alertes et le retard moyen (`sources.js:179`). Établi par lecture.

4. **Les chiffres de Waze et des fichiers importés sortent sous leur nom de colonne.** `model.js:103` produit « Moyenne : retard_s » suivi de « unité non renseignée ». Waze déclare ses métriques sans libellé ni unité (`sources/waze.js:39` et `:53`), l'assistant n'offre aucun champ pour les nommer (`wizard.js:1022-1027`) et la note du dossier renvoie à ce réglage inexistant. Ce défaut a été vu en production le 19 septembre (« Total : confirmations : 0 unité non renseignée »). La relecture relève aussi qu'un tronçon bloqué a un retard de -1 dans le flux Waze, compté tel quel dans la moyenne, et que la longueur additionne des bouchons entiers alors que leur tracé est coupé à la zone (`map.js:709-713`) ; ces deux points n'ont pas été rejoués.

5. Relevés à la lecture, non rejoués : la source « Travaux en cours » charge aussi les chantiers terminés et à venir (`netlify/functions/lib/geojson-aggregate.mjs:77`, libellé dans `sources.js:59` et `state.js:39`) ; la fenêtre d'un compteur affiche sous « hier » un chiffre figé le jour de l'ajout (`popups.js:157`, `sources/counters.js:48`) ; la couche « Compteurs vélo » garde des compteurs mixtes piétons et vélos (13 sur 90 à Lyon selon la page publique Eco-Visio) ; le Baromètre annonce un commentaire sur chaque point alors que beaucoup n'en ont pas (`sources.js:79`).

### La qualité de l'analyse

6. **Les constats ne sont plus rapprochés d'un lot à l'autre.** Les lots comptent 12 textes et 8 000 caractères (`dossier/contract.mjs:2-3`), et `dossier/analyze.js` n'appelle plus l'étape `synthesize`, que le relais accepte encore (`lib/diagnostic-dossier.mjs:10`, `:20`, `:52`). Chaque lot produit ses groupes, et `publish()` (`analyze.js:66-72`) les empile. Mesure du 23 septembre : 45 constats pour 124 textes, dont 21 ne reposent que sur un texte. Environ huit constats portent sur des véhicules arrêtés ou des livraisons sur les bandes et voies cyclables, environ sept sur les conflits avec les piétons, cinq sur les ruptures d'itinéraire entre Bellecour, Perrache et la Saône. `docs/diagnostic-dossiers.md:60-63` décrit toujours des lots de 36 textes et des rapprochements par ensembles de 36 groupes. La version déjà livrée (commit 286f219) a le même comportement. Établi par exécution et par lecture.

7. **Les contrôles automatiques laissent passer la plupart des déformations.** Rejoué localement avec les fonctions du contrat : sur les cinq erreurs injectées par l'audit du 17 septembre, seule la référence inventée est refusée ; le changement d'unité, la demande devenue absence, le texte utile écarté et la question qui prescrit des travaux passent. « Fréquents », « répétés », « tous les jours », « constamment », « systématiquement », « habituels » et « rend dangereux » passent ; seuls « souvent » et « augmente le risque » sont refusés (`contract.mjs:101-108`). Dans la synthèse, une unité fausse passe dès que la bonne figure ailleurs dans le texte (`contract.mjs:224`), et un lien causal inventé entre deux couches passe. À l'inverse, un « souvent » présent dans un témoignage mais pas dans la lecture citée est refusé, et la correction affirme à tort au modèle que ce mot ne figure dans aucune observation : le modèle de synthèse ne reçoit que les identifiants des lectures (`lib/diagnostic-dossier.mjs:56`). Dans la mesure du 23 septembre, le modèle n'a rien inventé ; la fidélité repose aujourd'hui sur lui, pas sur ces contrôles.

### Coût, délais et reprise

8. **La synthèse en raisonnement moyen dépasse la coupure de 24 secondes.** Le relais coupe l'appel à 24 s (`lib/diagnostic-dossier.mjs:113`) et compte alors la réserve entière (`supabase/migrations/20260918090000_diagnostic_ai_budget.sql:53`). Mesure du 23 septembre : premier essai coupé à 24,9 s et compté 134 380 µ$, second essai terminé en 11 s. L'audit du 17 septembre avait mesuré 41 s pour cette configuration. La documentation de Netlify fixe la limite d'une fonction synchrone à 60 secondes, non modifiable : la coupure à 24 s est notre choix, pas une contrainte de l'hébergeur.

9. **Un dossier dont la synthèse est refusée relance des appels payants à chaque ouverture.** Le numéro d'essai (modification non commitée) change l'empreinte après chaque refus, ce qui empêche bien de resservir une réponse écartée ; mais la page relance l'analyse à l'ouverture (`dossier/page.js:374`), avec jusqu'à trois appels gpt-5.4 neufs, cinq avec des erreurs réseau (`analyze.js:79-82`, `recovery.js:43`). La relecture l'a rejoué sur un banc local : un modèle qui écrirait toujours « souvent » épuise le dollar en sept ouvertures, puis le dossier reste bloqué avec « choisissez une zone plus petite » alors que tous les textes sont lus.

10. **L'analyse n'est enregistrée qu'au clic sur « Enregistrer ».** La version créée à l'ouverture du dossier ne la contient jamais (`report.js:42-45`, `analyze.js:51`). Sur 20 dossiers réels depuis le 16 septembre, 19 sont dans ce cas. Un autre appareil ou un collègue relance toute la lecture sous un nouvel identifiant de génération, donc la repaie avec un nouveau plafond ; selon le banc de la relecture, un collègue qui ouvre une version enregistrée en cours d'analyse reçoit en boucle « Cette génération appartient à un autre dossier ou utilisateur » (`budget.sql:43-45`).

11. **Les grandes zones acceptées par le panneau ne peuvent pas aboutir.** Une génération est plafonnée à 60 appels (`budget.sql:56`). Avec des lots de 12 textes, deux appels par lot et quelques corrections, l'analyse s'arrête avant sa fin au-delà d'environ 29 lots, soit 350 textes courts : la lecture déjà faite est payée, et il n'y a ni synthèse ni PDF. Le panneau prévient au-delà du budget prévu (environ 170 textes) et n'interdit qu'au-delà du plafond estimé (`analysis.js:343-354`). Dans le parcours simulé du 23 septembre, une zone de 382 textes donnait 32 lots, soit 64 appels avant la synthèse, et le bouton restait actif. L'estimation du coût a été calibrée sur des lots de 36 textes (`contract.mjs:12-18`). La synthèse est aussi refusée au-delà de 240 000 caractères ou de 200 constats (`lib/diagnostic-dossier.mjs:22-23`).

12. Relevés par la relecture et rejoués sur son banc local, sans appel réel : un texte de plus de 8 000 caractères bloque définitivement son dossier, le découpage se faisant à 10 000 caractères (`contract.mjs:3-4`, `lib/diagnostic-dossier.mjs:18`) ; après « Actualiser la synthèse », un échec efface l'ancienne synthèse et bloque le PDF (`analyze.js:37-44`) ; pour un dossier sans témoignage, ce même bouton reste affiché et ne fait rien (`page.js:130-137`). Relevé à la lecture : le plafond d'un dollar vaut par identifiant de génération, choisi par le navigateur, sans limite par dossier, par collectivité ou par jour.

### Données importées

13. **Les fichiers importés sont publics et survivent au retrait de leur couche.** Les couches sont stockées dans le compartiment public `uploads` (`modules/supabaseservice.js:2727-2785`). La couche d'accidents de `test-e2e` se télécharge sans aucun identifiant (HTTP 200). « Retirer la couche » ne supprime que la ligne en base. Pour les données publiques du catalogue, c'est sans conséquence ; pour un export Strava, que le catalogue présente comme réservé à la collectivité (`sources.js:158`), ou un tableau de doléances importé avec toutes ses colonnes (`wizard.js:674-699`), le fichier devient accessible à quiconque obtient son adresse. Un essai de liste du compartiment avec la clé publique a répondu 400, ce qui ne permet pas de conclure sur l'énumération.

14. Relevés à la lecture, non rejoués :
   - Tout CSV est lu en UTF-8 (`data.js:350`, `:358`, `engine.js:39`, `wizard.js:253`) ; un tableau enregistré par Excel en Windows-1252 arrive avec des « � » à la place des accents, dans les textes que l'IA lit et que le dossier cite.
   - Un GeoJSON en Lambert 93 ou un shapefile sans `.prj` est accepté sans contrôle d'étendue (`data.js:54-66`, `:660-675`) ; au chargement suivant, le cadrage peut lever une erreur dans la création de la carte (`map.js:500-510`, `diagnostic.js:111-134`) et afficher « Carte non disponible » pour toute la collectivité jusqu'au retrait de la couche.
   - La sélection n'est pas recalculée quand une couche finit de charger, est ajoutée ou modifiée après le tracé (`layers.js:43-70`, `panel.js:228-233` et `:395-409`) ; le dossier présente alors cette couche avec zéro élément.
   - Masquer une couche pendant son chargement ne tient pas (`layers.js:45`, `:52-60`).
   - Une page du catalogue peut être remplacée par la réponse tardive d'une autre source, et un administrateur de plusieurs espaces peut enregistrer une couche chez la mauvaise collectivité s'il change d'espace pendant un import (`catalog.js:339-348`, `admin/api.js:13-17`).
   - L'import Strava garde une ligne par tronçon, la dernière lue, sans vérifier que l'export est annuel (`data.js:417-436`), et retient par défaut l'année la plus récente, souvent incomplète (`engine.js:82`).
   - Une erreur de chargement est réduite à « HTTP 502 », visible au seul survol (`data.js:217`, `panel.js:181`), sans reprise possible ni moyen de recoller un lien Waze.
   - Une archive contenant plusieurs shapefiles n'en importe qu'un, sans le dire (`data.js:604-614`).
   - `Math.max(...valeurs)` lève une erreur au-delà d'environ 65 000 valeurs (`data.js:165`, `insights.js:113`, `:116`), ce qu'une zone couvrant une grande partie d'un export Strava peut atteindre.

### Sécurité et confidentialité

15. **Les textes des habitants partent chez OpenAI aux États-Unis, alors que la page confidentialité dit l'inverse pour les signalements.** Le relais appelle `https://api.openai.com/v1/responses` (`lib/ai-common.mjs:24`), et les fonctions du site tournent dans la région `us-east-1` (réglage Netlify lu le 23 septembre). La page `/confidentialite` écrit que les signalements sont hébergés et traités « dans l'Union européenne » (`home-src/src/views/ConfidentialiteView.vue:259`). Aucun signalement du module Participer n'a encore été analysé en production, mais le catalogue les propose en un clic. Aucune pseudonymisation n'est faite avant l'envoi. La relecture relève aussi, sans que ce soit rejoué, que les sorties du modèle restent sans limite de durée dans `diagnostic_ai_calls.result`, et que l'enregistrement des sessions PostHog de l'administration ne masque pas les témoignages affichés (`modules/analytics.js:332-340`).

16. **L'ancien rapport insère sans échappement des valeurs lues en base.** `legacy-report.js` place directement `${v}` (ligne 99), `${ac.vulnerableShare}` (133), `${w.jamKm}` (139), `${c.km}` (149), `${c.n}` (189) et d'autres valeurs du JSON enregistré. Un administrateur de ville peut insérer une ligne de rapport sans dossier (`supabase/migrations/20260721000000_diagnostic_terrain.sql:91-92`) dont le contenu s'exécuterait dans la session de qui l'ouvre, administrateur global compris. Établi par lecture, non rejoué dans un navigateur. La relecture relève aussi que `created_by` vient du navigateur sans contrôle (`supabaseservice.js:2802`).

### Textes à l'écran

17. Aucun tiret long ni demi-long n'a été trouvé. Un trait d'union entouré d'espaces fait office de tiret dans `diagnostic.js:80` et `:132`, `recipes.js:19`, `wizard.js` (lignes 227, 279, 338, 356, 399, 400, 520, 556, 639, 762), `dossier/page.js:83` et `:150`, `legacy-report.js:216`.

18. Les défauts de texte les plus visibles, relevés à la lecture :
   - une session expirée affiche « Unauthorized » en anglais, parce que `recovery.js:15` préfère le texte du serveur (`ai-diagnostic.mjs:174`) à son propre message ; même chose pour le Baromètre et Waze (`source-fub.mjs:57`, `source-waze.mjs:25`) ;
   - les motifs de refus rédigés pour le modèle (« Utilisez le marqueur de la mesure », « Conservez les informations essentielles en cinq phrases ») s'affichent à l'agent quand les corrections échouent (`analyze.js:141`, `view.js:227`) ;
   - une analyse en pause est présentée comme « Analyse en cours » dans l'onglet Synthèse (`view.js:273`), et un dossier arrêté au plafond promet encore une synthèse qu'il n'aura jamais (`model.js:180`, `view.js:348`) ;
   - le vocabulaire interne et SIG remonte sur le chemin principal et jusque dans le PDF : couche, entités, intersectant, géométries, lot, génération, popup, noms de colonnes bruts (`catalog.js:108`, `:142-143`, `model.js:80`, `:91`, `:106`, `:145`, `wizard.js:752-772`) ;
   - la même action porte plusieurs noms : « Ajuster ce constat », « Modifier le texte », « Ajuster la lecture du constat », « Appliquer ma reformulation » ; « Historique » ouvre « Dossiers de zone » ; quatre formules différentes pour l'état du brouillon.

### Documentation, code dormant et site public

19. `docs/diagnostic-dossiers.md` décrit des lots de 36 textes, 28 000 caractères, trois niveaux de division et des rapprochements par 36 groupes ; le code fait 12 textes, 8 000 caractères, une seule division (`analyze.js:100`) et aucun rapprochement. La section diagnostic de CLAUDE.md décrit encore l'ancien rapport (comparaison au territoire, lieux qui cumulent, règles R1 à R3, six indicateurs, plafond de 300 points).

20. Selon la relecture, l'essentiel de `insights.js` et plusieurs fonctions d'`analysis.js`, `data.js`, `territory.js` et `state.js` ne sont plus appelés que par les essais : 32 des 75 essais de `unauth.diagnostic-chiffres.spec.js` vérifient ce code dormant. Les 197 essais verts couvrent donc en partie du code que le dossier n'utilise plus, et les autres nourrissent le code de données idéales (titres data.gouv corrects, export Strava annuel, WGS84, UTF-8), ce qui explique qu'ils ne voient pas les constats 2, 13 et 14.

21. La page publique du module (`home-src/src/v2/data/modules.js:518-608`, et `DiagnosticShowcase.vue:139`) décrit l'ancienne version : lecture « dans la limite de trois cents » points, « quatre indicateurs », projets et chantiers comme les deux seules sources chargées d'un clic, signalements « pas dans ce raccourci », captures de l'ancien rapport. Elle a été modifiée pour la dernière fois le 14 septembre, avant la refonte.

## Le travail non commité

Le numéro d'essai fait ce qu'il promet : une réponse refusée ne revient plus de la mémoire, l'essai zéro garde l'ancienne empreinte, et le serveur borne et filtre la valeur reçue. Les essais le couvrent (0.72.17 et 0.72.18). Deux choses doivent l'accompagner avant d'être livrées : un délai compatible avec le raisonnement moyen de la synthèse (constat 8), et l'arrêt des relances payantes automatiques à l'ouverture d'un dossier dont la synthèse a été refusée (constat 9).

## Ce qui tient

Les relais du Baromètre et de Waze vérifient la session puis le rôle d'administrateur pour la ville demandée, et n'appellent que leurs hôtes attendus. Tout contenu venu d'un fichier ou d'une source externe est échappé dans les fenêtres au clic, le dock, le catalogue, l'assistant et le nouveau dossier. Les tables du diagnostic sont cloisonnées par ville, les tables de budget sont fermées au navigateur, la réservation atomique ne dépasse jamais le plafond d'une génération, la mémoire des appels évite la double facturation au rechargement, et l'impression refuse vraiment un dossier incomplet. Les références inventées sont refusées et les citations affichées viennent des originaux. Le plafond a refusé la zone de 2 290 textes avant tout appel.

## Ordre de travail recommandé

1. Corriger ce que le dossier affirme à tort (constats 1 à 4) et la page publique du module (constat 21), avant toute démonstration à une collectivité.
2. Rétablir un rapprochement des constats entre lots, ou agrandir les lots, puis mesurer à nouveau sur la zone de Bellecour : 124 textes ne doivent pas donner 45 constats.
3. Porter le délai de la synthèse à 50 secondes, et ne relancer une synthèse refusée qu'à la demande de l'agent.
4. Enregistrer l'analyse terminée dans la version, pour qu'un collègue ou un autre appareil ne la repaie pas.
5. Aligner le plafond de 60 appels, l'estimation et les seuils du panneau sur des lots de 12 textes.
6. Rendre privés les fichiers importés et les supprimer avec leur couche ; mettre la page confidentialité en accord avec l'envoi à OpenAI, ou passer par le point d'accès européen.
7. Mettre à jour `docs/diagnostic-dossiers.md` et CLAUDE.md, retirer le code dormant et ses essais.

## Suites du 23 septembre

Les sept points de l'ordre de travail ont été traités le jour même. Ce qui suit consigne ce que les analyses réelles de validation ont montré ensuite, et ce qui reste ouvert.

Deux analyses complètes ont été relancées sur la zone de Bellecour (124 textes du Baromètre vélo). La première a été interrompue par une modification du relais faite pendant qu'elle tournait : elle s'est arrêtée proprement après 48 textes, et sa reprise est repartie du 49e sans relire ni repayer les quatre premiers lots. Les deux ont montré que le rapprochement ne réduisait pas le nombre de constats (49 puis 43). Trois causes ont été trouvées et corrigées :

- un seul mot de fréquence reformulé (« fréquemment » pour « souvent ») faisait refuser tout un rapprochement ; le contrôle écarte désormais le seul constat fautif ;
- le modèle recopiait des numéros de textes parmi les mesures associées, alors qu'aucune mesure ne lui est fournie à cette étape, et la réponse entière était refusée ; ces références sont maintenant ignorées ;
- sur des groupes qui mêlent plusieurs situations, la consigne de réécrire chaque constat en conservant tout poussait le modèle à ne rien réunir, y compris avec 48 secondes de délai ou un raisonnement moyen ; il ne renvoie plus que les constats qui réunissent au moins deux groupes. Sur les groupes réels des deux analyses, 43 groupes deviennent 20 constats et 49 en deviennent 28, en 13 à 20 secondes et pour environ 0,02 $.

La prévision garde désormais 55 % des groupes après rapprochement, comme mesuré : l'outil refuse au-delà de 552 textes courts et de 387 textes longs. Un mot en hébreu produit par la lecture d'un lot réel avait franchi tous les contrôles ; un contrôle d'écriture (Unicode, pas de vocabulaire) le refuse maintenant à toutes les étapes. La liste des mots de fréquence n'est plus allongée, conformément à la règle du projet sur les listes de mots. L'ancienne analyse de zone en un seul appel, qui n'était plus appelée et échappait au budget, a été retirée du relais.

Restent ouverts :

- aucune analyse complète n'a encore été relancée avec la nouvelle consigne de rapprochement ; l'étape seule a été vérifiée sur les groupes réels ;
- en local, le serveur de Netlify coupe à 30 secondes : la synthèse finale a été coupée deux fois à 25 secondes et chaque coupure est comptée au montant réservé (environ 0,13 $), ce qui gonfle le coût des essais locaux. En production, le délai est de 48 secondes ; une synthèse réelle a pris jusqu'à 21 secondes pour 43 constats, mais aucune mesure n'existe pour une zone proche de la limite ;
- chaque version enregistrée recopiait ses figures en base : 13 Mo pour ce dossier, et 85 Mo sur les 157 de la base pour `diagnostic_reports`. Les images sont désormais rangées dans le compartiment privé `diagnostic`, et les versions existantes y ont été transférées (voir `docs/diagnostic-dossiers.md`) ;
- les captures de la page publique montrent encore l'ancien rapport, avec le nom d'une ville et des tirets longs dans l'image.
