# Diagnostic terrain : proposition d'un système de lecture instrumentée

Proposition du 19 septembre 2026. Elle part de l'état réel du dépôt (chaîne « dossier de zone » livrée le 16 septembre, budget en base le 18), des 36 diagnostics enregistrés en production, de l'audit IA du 17 septembre et d'une revue de la littérature. Elle ne contient pas de code : elle décrit ce qu'il faudrait construire, dans quel ordre, avec quels tests et quelles conditions d'arrêt. Le document compagnon `diagnostic-dossiers.md` décrit ce qui existe ; celui-ci décrit ce qui manque et comment le combler.

## 1. La thèse en une page

Le diagnostic terrain produit aujourd'hui un dossier fidèle par construction (chaque constat cite ses textes, chaque chiffre vient d'un calcul) mais vérifié par des moyens faibles : des expressions régulières et une relecture par le même modèle qui a écrit. L'audit a montré que cinq erreurs de sens injectées volontairement passent tous les contrôles, et les mesures en base montrent que la relecture est l'étape la plus chère et la moins fiable de la chaîne (trois relectures sur seize ont brûlé tout leur budget de réflexion sans rien écrire).

La proposition sépare strictement trois rôles que la chaîne actuelle confond :

- **Calculer** : tout ce qui est dénombrable, géométrique ou temporel est calculé par le code, jamais par un modèle. C'est déjà le cas pour les mesures ; on l'étend aux doublons, aux lieux qui cumulent, à la couverture et aux données personnelles.
- **Écrire** : un modèle de langage propose des regroupements et des formulations, à partir des textes originaux et de rien d'autre. C'est le rôle actuel de GPT-5.4 mini pour les lots et de GPT-5.4 pour l'ouverture ; il ne change pas.
- **Juger** : chaque phrase écrite est découpée en affirmations élémentaires, et chaque affirmation est confrontée à ses seules preuves par un juge qui ne peut répondre que « soutenue », « contredite » ou « absente », avec une probabilité. Ce rôle n'existe pas aujourd'hui. Il est confié à un modèle de décision (Jev de TypeSafe, quasi gratuit, réponse en moins d'une seconde) avec un repli sur GPT-5.4 mini en sortie contrainte, derrière la même interface.

Le juge ne bloque jamais : une affirmation non soutenue déclenche une correction ciblée du rédacteur (une seule), puis, si elle persiste, un marquage « à relire » visible par l'agent. Le dossier reste toujours complet et exportable ; ce qui change, c'est que l'agent sait exactement quelle phrase demande sa relecture, et pourquoi.

Trois compléments ferment le système : l'objet de l'étude est demandé avant l'analyse (il n'a jamais été renseigné sur les 13 dossiers en base), les questions de terrain deviennent un carnet de visite imprimable conforme à la méthode du diagnostic en marchant, et un banc d'essai mesure chaque version de la chaîne sur un corpus étiqueté à la main avant toute mise en production.

## 2. Ce que disent les données réelles

Tout ce qui suit a été lu dans la base de production le 19 septembre 2026.

**Les volumes.** 36 diagnostics enregistrés, tous sur un même espace de test, dont 13 au format dossier. Un dossier porte en moyenne 204 observations (maximum 463) et 4,8 constats. Sur le dernier dossier, 209 observations dont 122 avec un texte ; la longueur médiane d'un texte est de 55 caractères, 90 % font moins de 170 caractères, le plus long en fait 360. Ce sont des phrases nominales, souvent sans verbe (« Pas de piste », « Conflit entre pietons et vélos », « Berriat st bruno »), avec des fautes, des abréviations et des adresses seules.

**Les provenances.** Sur les 13 dossiers, les témoignages viennent presque exclusivement du Baromètre vélo de la FUB : 1 956 points à améliorer, 471 améliorations constatées, 160 souhaits de stationnement. Les remontées internes sont marginales (40 remontées terrain d'extrait, un chantier, un projet, zéro signalement du module Participer). Le module Participer compte 18 signalements dans toute la base, sur deux espaces, avec des descriptions de 80 caractères en moyenne. Les références sont dominées par Strava (3 209 tronçons, jusqu'à 856 par zone) et les aménagements OpenStreetMap (356) ; les accidents sont rares (42 au total, 10 au maximum par zone, donc presque toujours sous le seuil de cinq où l'on liste au lieu de compter).

**Les périodes.** Huit sources sur quinze déclarent « Période non renseignée ». Seuls le Baromètre, Strava, les accidents et Waze portent une période exploitable. La question « est-ce encore vrai aujourd'hui ? » n'a donc pas de réponse calculable pour la majorité des témoignages.

**L'objet de l'étude.** Zéro dossier sur 13 en porte un. L'audit avait établi que ce champ change ce qui apparaît en ouverture ; il est transmis au modèle depuis le 18 septembre mais personne ne le remplit, parce qu'il est proposé après le lancement de l'analyse, dans un panneau latéral.

**Les coûts et les échecs par étape** (table `diagnostic_ai_calls`, montants en millionièmes de dollar) :

| Étape | Modèle | Appels terminés | Coût moyen | Durée moyenne | Échecs |
| --- | --- | ---: | ---: | ---: | --- |
| Lecture d'un lot | gpt-5.4-mini | 17 | 10 749 | 6 s | 3 refusés sans coût |
| Relecture d'un lot | gpt-5.4-mini | 13 | 7 712 | 7 s | 3 échecs facturés 16 142 chacun : 3 000 jetons de réflexion, aucune sortie |
| Ouverture | gpt-5.4 | 2 | 35 791 | 20 s | 1 appel incertain après 312 s, facturé à la réserve (130 088) |

La génération la plus chère a dépensé 281 062 plus 130 170 réservés, soit au-dessus du budget prévu de 240 000 mais sous le plafond de 1 000 000. L'appel d'ouverture parti en délai dépassé a coûté à lui seul plus que toute la lecture.

**La qualité observable des constats.** Sur le dernier dossier terminé, les constats de témoignages sont lisibles et sourcés, mais on y trouve : un constat qui cite trois couches (hérité d'une ancienne version, la règle « une couche par constat » est postérieure) ; un constat fourre-tout (« Des signalements trop lacunaires pour qualifier précisément la situation », neuf observations) qui n'est pas un constat mais une exclusion déguisée ; des questions fermées (« Les marquages, les feux et les priorités sont-ils compréhensibles ? ») et une question rédigée comme une consigne (« Vérifier sur place le fonctionnement du carrefour ») alors que le prompt demande des questions ouvertes ; des titres abstraits (« Des espaces de passage où les usages se superposent et se disputent »). Les constats de mesures affichent des libellés bruts quand la couche n'a pas d'unité (« Total : confirmations : 0 unité non renseignée », « Moyenne : retard_s : -1 unité non renseignée ») : ce sont des défauts de code, pas de modèle, et ils doivent être corrigés avant tout le reste.

**Le code dormant.** Les calculs déterministes de `insights.js` (lieux qui cumulent dans un rayon de 40 m, règles R1 R2 R3, part de la zone dans la couche, rang parmi des cellules de même taille) ne sont plus appelés par le nouveau dossier ; ils survivent dans les tests et dans l'affichage des anciens rapports. Ils ont été abandonnés plutôt que corrigés. Une partie mérite d'être reprise (section 5.6).

## 3. Ce que dit la littérature, et ce qu'on en retient

**Analyse thématique assistée.** L'étude comparative de 2025 sur le codage inductif par GPT-4o (trois codeurs humains contre le modèle) trouve 31 % de codes concordants, 26 % d'alternatives raisonnables et 42 % de codes jugés non raisonnables ; avec un livre de codes existant appliqué déductivement, la fiabilité devient acceptable sous relecture ciblée. L'atelier de 25 chercheurs de l'ISERN conclut que le modèle est bon pour abstraire des thèmes et repérer des codes semblables, mauvais pour la familiarisation avec les données, et que la traçabilité (prompts, versions, étapes de validation) est une condition, pas une option. On en retient trois règles : le modèle propose, l'humain dispose, et chaque version de consignes est identifiée et mesurée. C'est déjà l'esprit du dossier (`ANALYSIS_VERSION`, constats reformulables). Ce qui manque est la mesure.

**Vérification par décomposition.** La méthode HallDetect (2026) découpe un texte généré en propositions atomiques et confronte chacune à des morceaux de la source par implication textuelle. Sur QAGS, le rappel passe de 0,52 (jugement holistique) à 0,97 : une contradiction locale est diluée quand on juge un paragraphe entier, et retrouvée quand on juge une affirmation. La méthode ne détecte pas les omissions et se trompe sur les pronoms coupés de leur antécédent. Pour nous : les constats sont courts et leurs preuves sont énumérées, donc la décomposition est peu coûteuse et sans problème de coréférence ; les omissions restent à la charge de la couverture calculée par le code.

**Sélection parmi plusieurs versions.** Le papier « When LLM Judge Scores Look Good but Best-of-N Decisions Fail » (2026) montre qu'un juge corrélé à 0,47 avec la vérité ne récupère que 21 % du gain d'un sélecteur parfait, parce que la corrélation globale mesure surtout la difficulté des cas, pas le classement entre candidats d'un même cas. En jugement par paires, la récupération monte à 61 %. Le seuil d'utilité est une corrélation intra-cas d'environ 0,42 pour récupérer la moitié du gain. On en retient : ne jamais utiliser un score absolu pour choisir entre deux formulations ; toujours une comparaison par paire ; et ne pas activer la sélection tant que la récupération n'a pas été mesurée sur notre corpus.

**Modèles de décision calibrés.** Jev répond à trois formes de questions (choix, note, oui/non) avec une distribution de probabilités entraînée sur des résultats réels ; 32 000 jetons de contexte, 70 à 500 ms, 0,042 dollar par million de jetons d'entrée, sortie gratuite. La documentation précise que la calibration vaut en moyenne, pas pour une réponse isolée, que l'anglais est la langue principale et qu'il faut tester sur son propre contenu pour une autre langue. L'accès est encore sur liste d'attente. Les logprobs d'OpenAI ne sont pas un substitut : ils sont vides dès qu'une sortie structurée est demandée sur les GPT-5.x. Le repli est donc un modèle de langage en sortie contrainte à trois valeurs, sans probabilité, qu'on traite comme un juge binaire.

**Statistique spatiale.** La statistique Gi* de Getis-Ord n'est pas fiable sous 30 entités ; nos zones ont souvent moins de 30 témoignages par thème. Le rayon de 40 m et l'agrégation gloutonne de `clusterPoints` sont adaptés à l'échelle d'un carrefour et ne présument rien. On garde donc des lieux qui cumulent calculés, on n'ajoute pas de test statistique, et surtout on n'envoie jamais de coordonnées au rédacteur (règle déjà en place).

**Diagnostic en marchant.** La fiche de diagnostic-territoire.org (2016) et le guide des marches exploratoires du ministère chargé des transports décrivent le livrable attendu par une collectivité : un tableau points forts / points faibles / pistes d'amélioration par thème, des photos, une carte des lieux observés, et un carnet d'enquête que les marcheurs remplissent sur place. La fiche avertit que la méthode « présente le risque de passer trop vite des problèmes observés aux solutions proposées sans étudier les causes » et qu'il faut la croiser avec des données quantitatives. Notre dossier est exactement l'amont de cette marche : il prépare les questions et fournit les données croisées. Il lui manque l'aval, le carnet à emporter et le retour des observations.

**Confidentialité.** OpenAI propose une résidence européenne (eu.api.openai.com, stockage et traitement en région, rétention nulle sur approbation, majoration de 10 % pour les modèles sortis après mars 2026). La CNIL rappelle qu'un prestataire qui traite des données personnelles exige un contrat au sens de l'article 28 et, hors Union, des clauses contractuelles types ou une certification au cadre de transfert. TypeSafe ne documente ni l'hébergement ni la rétention. Conséquence : le rédacteur passe sur le point d'accès européen ; le juge ne reçoit que des textes pseudonymisés ; les signalements non publiés ne partent jamais.

## 4. Principes qui ne changeront pas

1. Le dossier existe sans aucun appel de modèle. Les mesures, la couverture, les lieux, les périodes et les exports ne dépendent d'aucune API.
2. Un modèle n'écrit jamais un nombre, une coordonnée, une fréquence, une cause, une priorité ni une recommandation. Les garde-fous actuels restent en place ; le juge s'ajoute, il ne remplace pas.
3. Un juge ne bloque jamais un dossier. Il marque, il explique, il propose une correction. La décision reste à l'agent.
4. Chaque affirmation présentée à l'agent est reliée aux textes qui la soutiennent, et l'agent voit lesquels.
5. Aucune version de la chaîne n'entre en production sans avoir été mesurée sur le banc d'essai contre la version précédente.
6. Tout réglage (juge actif ou non, sélection active ou non, seuils) vit en base, par espace, jamais dans le code.

## 5. Architecture cible : la lecture instrumentée

La chaîne actuelle a quatre étapes (lecture, relecture, synthèse par couche, ouverture). La chaîne cible en a sept, dont trois nouvelles, et la relecture disparaît. Chaque étape est décrite avec son entrée, sa sortie, qui la fait et ce qu'elle coûte.

### 5.1 Préparation calculée (code, gratuit)

Existe déjà : observations, mesures, périodes, découpage en lots. On ajoute quatre traitements, tous déterministes, tous avant le premier appel de modèle.

- **Pseudonymisation.** Adresses électroniques, numéros de téléphone, plaques d'immatriculation et URL sont remplacés par des jetons stables (`[courriel 1]`) dans une copie de travail du texte ; l'original reste dans le dossier. Le juge et le rédacteur ne voient que la copie. Un test sur le dernier dossier n'a trouvé aucun contact dans les textes ; la règle protège les signalements Participer à venir, dont le formulaire recueille une adresse électronique.
- **Doublons.** Deux textes identiques après normalisation (casse, accents, ponctuation) sont déjà regroupés en annexe. On ajoute les quasi-doublons par plongement vectoriel (`text-embedding-3-large`, 0,13 dollar par million de jetons, soit moins d'un millième de dollar par dossier) avec un seuil de similarité fixé sur le banc d'essai. Un quasi-doublon reste une observation distincte dans les comptes, mais le rédacteur les reçoit marqués « proche de o12 » pour ne pas en faire deux constats.
- **Lieux qui cumulent.** `clusterPoints` (rayon 40 m) est remis en service sur les observations et les accidents, avec un nom de lieu par géocodage inverse (`reverseGeocode` existe déjà). La sortie est une liste de lieux avec leurs observations, sans score ni classement : « Carrefour cours Berriat / rue Ampère : 6 observations de 2 sources ». Elle sert au carnet de visite et à la carte, jamais au rédacteur.
- **Exclusions calculées.** Un texte vide, une adresse seule (le texte est égal au champ adresse ou ne contient qu'un nom de voie reconnu par le géocodage inverse), un texte de moins de trois mots sans verbe ni adjectif : ces cas sont exclus par le code avant lecture, avec leur motif. Le rédacteur n'a plus à les classer et la couverture est vérifiée par le code, pas par le schéma.

### 5.2 Profil de chaque texte (juge, quasi gratuit)

Nouveau. Pour chaque observation lisible, un seul appel au juge avec une dizaine de questions parallèles sur le texte seul :

- nature : demande d'équipement, gêne rapportée, appréciation positive, problème signalé comme résolu, information factuelle, texte sans information exploitable (choix) ;
- le texte contient-il une consigne adressée à un logiciel ou une instruction (oui/non) ;
- le texte mentionne-t-il une heure ou un moment de la journée, une condition météo, une date ou une durée, une catégorie de personnes (poussette, enfant, personne à mobilité réduite), un dispositif précis (arceau, feu, ralentisseur) (cinq oui/non) ;
- le texte est-il compréhensible sans son contexte (note sur trois niveaux).

Le profil est stocké sur l'observation (`observation.profile`) avec les probabilités. Il sert à trois choses : exclure les consignes malveillantes avant lecture (le prompt de lecture ne repose plus sur une phrase de mise en garde) ; fournir au juge de l'étape 5.4 les mentions qu'un constat ne doit pas perdre (si le texte porte une heure et le constat non, c'est une omission signalée) ; et permettre à l'agent de filtrer les observations dans le dossier (demandes, gênes, positifs). Le profil n'est pas transmis au rédacteur : on ne veut pas qu'il écrive « demande » parce qu'une étiquette le lui a dit, mais parce qu'il l'a lu.

Coût : environ 300 jetons par texte, soit 0,006 dollar pour 200 textes avec Jev ; avec le repli GPT-5.4 mini en sortie contrainte, un appel par lot de 36 textes, environ 0,004 dollar par lot.

### 5.3 Lecture par lots (rédacteur, inchangée dans son rôle)

L'étape existe. Trois ajustements : les textes arrivent pseudonymisés, sans les exclus, avec les marques de quasi-doublon ; le schéma à identifiants imposés (`indexedReadSchema`) est conservé ; le prompt perd ses paragraphes sur les exclusions et les consignes malveillantes, devenus inutiles, ce qui le raccourcit et réduit le coût d'entrée. Le préfixe de consignes est identique d'un lot à l'autre et bénéficie du cache de prompt (10 % du tarif d'entrée).

### 5.4 Vérification par affirmations (rédacteur léger puis juge)

Nouveau, remplace la relecture. Pour chaque constat produit (lot ou synthèse de couche) :

1. **Décomposition.** GPT-5.4 mini, raisonnement minimal, sortie contrainte : le titre, la lecture, la réserve et la question sont découpés en affirmations élémentaires, recopiées telles quelles, chacune reliée au champ d'origine. Un constat court donne trois à six affirmations. Coût : environ 0,002 dollar par constat.
2. **Confrontation.** Pour chaque affirmation, un appel au juge avec l'affirmation et les seules preuves du constat (textes pseudonymisés, champs conservés, profils). Questions posées en parallèle : l'affirmation est-elle soutenue par ces textes (choix : soutenue, contredite, absente) ; ajoute-t-elle une fréquence ou une durée absente ; transforme-t-elle une demande en constat d'absence ; attribue-t-elle un dispositif ou un lieu précis d'un texte à d'autres ; réunit-elle deux textes en une même personne ; propose-t-elle des travaux ou une solution ; pour une question, laisse-t-elle la réponse ouverte ; pour une réserve, découle-t-elle de ces textes ou est-elle générique. Toutes en oui/non avec probabilité.
3. **Omissions.** Pour chaque texte cité dont le profil porte une mention (heure, météo, condition, catégorie de personnes), une question : cette mention est-elle reprise ou explicitement écartée par le constat.
4. **Décision.** Une affirmation est retenue si « soutenue » dépasse le seuil réglé sur le banc (départ : 0,7) et qu'aucun défaut ne dépasse son seuil. Sinon elle est marquée avec le défaut le plus probable.

Le résultat est stocké sur le constat : `finding.claims = [{ text, field, verdict, issue, probability, evidence }]` et `finding.audit = { status: 'verified' | 'attention', judge, version, at }`. L'interface montre le statut et, en cas d'attention, l'affirmation surlignée avec son motif.

Coût avec Jev : négligeable (un constat de cinq affirmations avec 1 500 jetons de preuves coûte 0,0003 dollar). Avec le repli GPT-5.4 mini : un appel par constat, toutes les questions dans un même schéma, environ 0,004 dollar par constat, soit 0,04 dollar pour un dossier de dix constats. Dans les deux cas, moins que la relecture actuelle (0,008 par lot, et 0,016 quand elle échoue).

### 5.5 Correction ciblée (rédacteur, une seule fois)

Existe sous une forme générique (`retryReason: 'quality'`) ; devient précise. Un constat en attention est renvoyé au rédacteur avec : le constat, ses preuves, la liste exacte des affirmations refusées et le motif de chacune. Consigne : réécrire uniquement les champs concernés sans toucher aux références. La nouvelle version repasse par 5.4. Si elle échoue encore, le constat reste marqué « à relire » et la chaîne continue ; l'agent tranche dans l'interface. Aucune division de lot, aucune boucle : au plus un appel de correction par constat, au plus deux vérifications.

C'est ce que l'audit demandait (« les corrections n'indiquent pas la phrase fautive ») et ce que la chaîne actuelle ne peut pas faire, faute de savoir quelle phrase est fautive.

### 5.6 Sélection entre deux versions (rédacteur puis juge, optionnelle)

Nouveau, activable par espace, désactivé au départ. Pour la synthèse de couche et pour l'ouverture, le rédacteur produit deux versions (deux appels indépendants, ou un appel qui en renvoie deux dans le schéma). Le juge les compare par paire, avec des questions ordonnées : laquelle est la plus fidèle aux preuves ; laquelle nomme le plus directement l'objet, la gêne ou la demande ; laquelle est la plus courte à information égale. La première question l'emporte ; à égalité, la première version est gardée. La version écartée est conservée dans le cache d'analyse pour le banc, jamais dans le dossier.

Condition d'activation : la récupération mesurée sur le banc (section 7) dépasse 50 %. Coût : un appel de rédaction en plus par couche et pour l'ouverture, soit environ 0,02 dollar par couche de témoignages et 0,036 dollar pour l'ouverture.

### 5.7 Ouverture (rédacteur fort, puis juge)

Inchangée dans son principe (GPT-5.4, originaux joints, marqueurs de mesures, objet de l'étude). Deux changements : l'objet de l'étude est demandé avant le lancement (section 6) ; le texte passe par 5.4 avec, comme preuves, les constats vérifiés et leurs originaux, et une question supplémentaire par phrase : cette phrase établit-elle un lien entre deux couches que les textes ne font pas.

### Ce que fait le juge en dehors de la génération

- **Aide à la reformulation.** Quand l'agent réécrit un constat, la version saisie passe par 5.4 après une pause de saisie ; un message discret indique « Votre formulation ajoute une fréquence que les textes ne mentionnent pas » sans empêcher l'enregistrement. Uniquement avec Jev (temps de réponse), jamais avec le repli.
- **Modération à l'entrée du module Participer.** Hors périmètre de ce document, mais le même profil (5.2) s'applique à un signalement au moment de son dépôt : consigne, insulte, donnée personnelle dans le texte, quasi-doublon d'un signalement publié dans un rayon de 100 m. À traiter dans une proposition séparée.

## 6. L'objet de l'étude et le carnet de visite

**Avant l'analyse.** Le bouton « Analyser la zone » ouvre une étape intermédiaire : « Que cherchez-vous à comprendre sur ce secteur ? », un champ libre de 500 caractères, trois exemples cliquables tirés des sources présentes (« Préparer une visite des cheminements piétons », « Comprendre les difficultés cyclables signalées autour de la gare », « Vérifier ce que disent les habitants avant des travaux de voirie ») et un bouton « Analyser sans objet précis ». L'objet est enregistré dans le dossier avant le premier appel. Le bouton « Actualiser la synthèse » existant reste pour un changement ultérieur.

**Le carnet de visite.** Nouvelle vue imprimable du dossier, distincte du rapport : une page par lieu qui cumule (5.1) ou par constat retenu, avec la carte cadrée, les questions de terrain ouvertes, les mentions à vérifier (heure, météo, condition), les deux citations, et trois zones vides : « Ce que nous avons observé », « Points positifs », « Photos (numéros) ». Le format suit le tableau points forts / points faibles / pistes de la méthode du diagnostic en marchant, sans la colonne « pistes » que le dossier ne prescrit pas. Il se produit par le même moteur d'impression que le PDF.

**Le retour de terrain.** Après la visite, l'agent saisit sur chaque constat une réponse de terrain (texte, date, personne) : `finding.field = { answer, at, by }`. Une nouvelle version du dossier affiche côte à côte ce que disaient les textes et ce que la visite a constaté. Cette version est celle qui vaut compte rendu au sens de la méthode. Aucun modèle n'intervient ici.

## 7. Le banc d'essai, condition de tout le reste

Le banc existe en partie : huit cas synthétiques dans `tests/fixtures/diagnostic-dossiers.js`, le corpus de l'audit dans `output/diagnostic-ai-audit-2026-09-17/` (cas de 20 et de 300 observations, cinq erreurs injectées dans `probes.json`), et les tests Playwright qui vérifient le contrat sans appel réel. Il manque la mesure du sens.

**Le corpus étiqueté.** 50 constats issus des 13 dossiers réels (textes du Baromètre, publics), relus à la main par une personne du métier avec, pour chaque affirmation : soutenue, contredite, absente ; et, pour chaque constat, une comparaison par paire avec une version alternative générée (laquelle est préférable, ou égalité). Environ trois heures de travail pour une personne. C'est l'investissement humain que ce système exige, et il n'est pas contournable : sans étiquettes, aucune des mesures ci-dessous n'a de sens.

**Les mesures, calculées par un script hors interface** (`scripts/diagnostic-bench.mjs`, appels réels sous plafond, résultats en JSON datés et versionnés) :

| Mesure | Définition | Seuil de mise en production |
| --- | --- | --- |
| Rappel du juge | Part des affirmations étiquetées « contredite » ou « absente » que le juge marque | au moins 0,85 sur les cinq erreurs de l'audit et sur le corpus |
| Précision du juge | Part des affirmations marquées qui le sont à raison | au moins 0,80 (au-delà de 20 % de fausses alertes, l'agent cesse de lire les marquages) |
| Couverture | Part des textes lisibles cités par au moins un constat ou exclus avec motif | 1,0 (calculée par le code) |
| Récupération de la sélection | Gain obtenu par le choix du juge entre deux versions, rapporté au gain d'un choix humain | au moins 0,50 avant d'activer 5.6 |
| Coût par dossier | Somme des usages réels pour le dossier de 200 observations | sous 0,24 dollar, ouverture comprise |
| Délai | Durée totale de la chaîne pour 200 observations | sous 3 minutes |

Chaque modification de consigne, de modèle ou de seuil est rejouée sur le corpus, en mode flex ou batch (moitié prix) puisque le délai n'y compte pas, et comparée à la version précédente. Le banc ne remplace pas la relecture métier ; il empêche de régresser sans le savoir.

## 8. Modèle de données et surfaces techniques

**Document dossier, version 3.** Ajouts sur l'observation : `profile` (nature, mentions, probabilités, version du juge), `masked` (texte pseudonymisé), `nearIds` (quasi-doublons), `placeId`. Nouvelle collection `places` (lieux qui cumulent : centre, nom, observationIds, sourceIds). Sur le constat : `claims`, `audit`, `field`. Sur `analysis` : `judge` (fournisseur, version, usage cumulé), `variants` (versions écartées, pour le banc uniquement), `objectiveAskedAt`. Les documents de version 2 restent lisibles ; les nouveaux champs sont absents, pas requis.

**Relais serveur.** Un fournisseur de jugement derrière une interface unique (`judge(state, questions)` renvoyant des probabilités), deux implémentations : TypeSafe (clé et point d'accès en variables d'environnement) et OpenAI en sortie contrainte (probabilités fixées à 0 ou 1). Le choix est un réglage par espace lu en base. Le rédacteur passe par le point d'accès européen d'OpenAI (variable d'environnement, projet à résidence européenne, demande de rétention nulle). Nouvelles phases dans la validation de requête : `profile`, `claims`, `judge`, `select` ; mêmes contrôles de rôle et de ville.

**Budget.** Le suivi existant compte les appels par génération et plafonne à 60 ; les appels de jugement, nombreux et quasi gratuits, doivent en être exclus : nouvelle colonne `kind` (`write` | `judge`) sur `diagnostic_ai_calls`, plafond de 60 conservé pour `write`, plafond de 2 000 pour `judge`, et une entrée de tarif pour Jev. Le budget prévu affiché à la sélection ne change pas.

**Réglages par espace.** Dans `city_modules.config` du module diagnostic : `judge` (`typesafe` | `openai` | `off`), `select` (booléen), `thresholds` (soutenue, défauts), `liveHints` (booléen). Aucune valeur en dur dans le code.

**Interface.** Étape « objet de l'étude » avant analyse ; statut de vérification sur chaque constat avec l'affirmation en cause ; filtre par nature d'observation dans le dialogue des observations ; carnet de visite ; champ de retour de terrain ; correction des libellés de mesures sans unité (une métrique sans unité déclarée ne produit pas de constat, elle produit une ligne « valeur non qualifiée » en annexe).

## 9. Plan de mise en œuvre

Chaque phase est livrable seule, testée, et laisse la chaîne en production fonctionnelle.

**Phase 0, hygiène et mesure (une semaine).** Corriger les constats de mesures sans unité ; demander l'objet de l'étude avant l'analyse ; passer le rédacteur sur le point d'accès européen ; pseudonymiser avant envoi ; sortir les exclusions du prompt et les calculer ; construire le corpus étiqueté et le script de banc avec ses six mesures sur la chaîne actuelle. Tests : `admin.diagnostic-dossier.spec.js` (objet demandé, mesures sans unité), `unauth.diagnostic-chiffres.spec.js` (pseudonymisation, exclusions calculées, quasi-doublons sur des cas fixes). Résultat attendu : une ligne de référence chiffrée pour tout ce qui suit.

**Phase 1, le juge avec le repli OpenAI (deux semaines).** Décomposition en affirmations, confrontation, correction ciblée, statut dans l'interface, suppression de la relecture. Fournisseur : GPT-5.4 mini en sortie contrainte, sans dépendre de TypeSafe. Activation par espace. Tests : validation des affirmations et des verdicts en pur JS avec des réponses simulées, y compris les cinq erreurs de l'audit ; parcours complet simulé par `page.route`. Mise en production quand le banc donne un rappel d'au moins 0,85 et une précision d'au moins 0,80.

**Phase 2, TypeSafe et le profil (une semaine après l'accès).** Deuxième implémentation du juge, profil des observations, aide à la reformulation en direct. Comparaison des deux juges sur le corpus ; bascule par espace si Jev fait au moins aussi bien en français. Tests : mêmes cas, réponses simulées de l'API TypeSafe.

**Phase 3, sélection par paire (une semaine).** Deux versions pour la synthèse de couche et l'ouverture, comparaison par le juge, mesure de la récupération. Activation seulement au-dessus de 0,50.

**Phase 4, carnet de visite et retour de terrain (deux semaines).** Lieux qui cumulent, vue imprimable, champ de retour, version « compte rendu ». Tests : rendu du carnet sur les fixtures, persistance du retour de terrain, historique.

## 10. Ce que ce document ne propose pas, et pourquoi

- **Aucune note de gravité, de priorité ou de confiance affichée.** La calibration du juge vaut en moyenne ; une probabilité isolée présentée à un élu serait lue comme une certitude. Les probabilités servent aux seuils et au banc, jamais à l'écran.
- **Aucune inférence géographique par un modèle.** Les lieux sont calculés ; le rédacteur ne reçoit jamais de coordonnées.
- **Pas de modèle d'implication textuelle local** (DeBERTa et équivalents) : il faudrait un serveur avec accélérateur, hors de l'infrastructure Netlify, et le français y est moins couvert que par les modèles d'API.
- **Pas d'ajustement fin d'un modèle** sur nos données : le corpus est trop petit, et le gain attendu est inférieur à celui d'un juge indépendant.
- **Pas de remplacement du rédacteur par le juge** : Jev n'écrit pas, et une chaîne faite uniquement de classifications produirait des tableaux, pas un dossier lisible.
- **Pas de comparaison au territoire réhabilitée** (rang parmi des cellules) : le référentiel chargé varie d'une collectivité à l'autre et le rang serait invérifiable. La part de la zone dans la couche, simple et honnête, peut revenir comme mesure, à discuter.

## 11. Risques et inconnues

- **Jev en français.** Personne n'a mesuré sa lecture de textes courts et fautifs en français. Le repli OpenAI existe précisément pour cela ; si Jev est moins bon sur le corpus, on reste sur le repli, à un coût de 0,04 dollar par dossier.
- **Fausses alertes.** Un juge trop sévère marque des constats corrects ; au-delà de 20 % l'agent n'y prête plus attention. Le seuil est réglé sur le corpus et surveillé en production par le rapport marquages / constats, journalisé dans `diagnostic_ai_calls`.
- **Étiquetage humain.** Trois heures d'une personne du métier, à refaire partiellement à chaque changement important de consignes. Sans cela, le banc ne mesure que le format.
- **Délai d'ouverture.** L'appel d'ouverture a déjà dépassé 300 s une fois et coûté la réserve entière. Un plafond de 45 s avec reprise unique et une réserve réduite (le coût réel moyen est de 36 000, la réserve de 130 000) limitent la perte ; à traiter en phase 0.
- **Hébergement du juge.** Tant que TypeSafe ne documente pas rétention et région, seuls des textes pseudonymisés déjà publics lui sont envoyés, et le registre des traitements est mis à jour, comme pour la mesure d'audience.
- **Périodes inconnues.** Huit sources sur quinze n'ont pas de période ; aucun juge ne peut dire si un témoignage est encore vrai. Le retour de terrain (section 6) est la seule réponse.

## Sources

- FUB, données du Baromètre vélo : https://opendata.parlons-velo.fr/
- Large Language Model-Assisted Thematic Coding in Medical Education Research (2026) : https://pmc.ncbi.nlm.nih.gov/articles/PMC13505884/
- LLM-Assisted Thematic Analysis: Opportunities, Limitations, and Recommendations (ISERN, 2025) : https://arxiv.org/abs/2511.14528
- Decomposed Entailment for Factuality Checking and Hallucination Detection (HallDetect, 2026) : https://arxiv.org/html/2608.05823
- When LLM Judge Scores Look Good but Best-of-N Decisions Fail (2026) : https://arxiv.org/html/2603.12520
- TypeSafe AI, System One models et Jev : https://typesafe.ai/blog/introducing-system-one-models-and-jev et https://docs.typesafe.ai/concepts/system-one
- Cloudflare, fiche du modèle Jev (contexte 32 000 jetons) : https://developers.cloudflare.com/ai/models/typesafe/jev/
- OpenAI, logprobs vides en sortie structurée sur GPT-5.x : https://community.openai.com/t/gpt-5-1-5-2-message-output-text-logprobs-is-empty-when-structured-outputs-json-schema-is-enabled-in-responses-api/1371927
- OpenAI, résidence des données en Europe : https://help.openai.com/en/articles/10503543-data-residency-for-the-openai-api et https://developers.openai.com/api/docs/guides/your-data
- OpenAI, traitement flex et batch : https://developers.openai.com/api/docs/guides/flex-processing et https://developers.openai.com/api/docs/guides/batch
- Esri, fiabilité de Gi* sous 30 entités : https://pro.arcgis.com/en/pro-app/latest/tool-reference/spatial-statistics/h-how-hot-spot-analysis-getis-ord-gi-spatial-stati.htm
- Diagnostic-territoire.org, Le diagnostic en marchant ou marche exploratoire (2016) : https://www.irev.fr/sites/default/files/atoms/files/le_diagnostic_en_marchant.pdf
- Ministère chargé des transports, Guide des marches exploratoires dans les transports collectifs terrestres : https://www.ecologie.gouv.fr/sites/default/files/documents/Guide_Marches_Exploratoires_251120.pdf
- CNIL, développement des systèmes d'IA et RGPD : https://www.cnil.fr/fr/developpement-des-systemes-dia-les-recommandations-de-la-cnil-pour-respecter-le-rgpd ; transferts hors UE : https://www.cnil.fr/fr/les-outils-de-la-conformite/transferer-des-donnees-hors-de-lue
