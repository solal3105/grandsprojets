# Audit IA du diagnostic terrain

Audit du 17 septembre 2026 sur le dossier de zone présent dans le répertoire de travail. Objectif : une analyse utile et fidèle pour moins de 0,30 € par génération. L'audit porte sur le nouveau parcours `mode=dossier`, pas sur les autres fonctions IA du site ni sur le coût de Codex.

**Conclusion :** le petit cas testé laisse une marge budgétaire importante. Le test de 300 observations consomme en revanche 0,24 $ avant la synthèse finale, que le budget prudent du banc d'essai empêche de lancer. L'objet de l'étude manque dans les requêtes actuelles, les textes sont progressivement remplacés par leurs résumés et les contrôles vérifient davantage la forme que le sens. Il faut corriger ces points avant de promettre une excellente analyse sous 0,30 € pour tous les volumes.

Aucun changement de modèle, de prompt ou de comportement de l'application n'a été intégré pendant cet audit. Les variantes ont été exécutées dans des copies temporaires. Les modifications fonctionnelles déjà présentes dans le répertoire de travail sont conservées.

## Mesures effectuées

Les appels réels utilisent l'orchestrateur et le relais du dossier, avec interception de la requête OpenAI pour les variantes. Le relais reçoit directement la clé déjà configurée ; l'audit ne sollicite pas Supabase et ne sauvegarde aucun dossier de collectivité. Les données sont entièrement synthétiques.

Le cas de 20 observations comporte deux sources de témoignages et des mesures issues des fixtures. Il combine des demandes de stationnement, des équipements existants, des observations à des heures différentes, un passage boueux avec une poussette, une appréciation positive, un problème ancien résolu, des périodes inconnues et une instruction malveillante. L'objet de l'étude demande de préparer une visite des cheminements accessibles.

Chaque configuration a été exécutée une fois. Ces résultats comparent des exemples concrets ; ils ne mesurent ni un taux d'erreur moyen ni un coût garanti pour toutes les collectivités.

| Configuration, 20 observations | Appels | Durée totale | Coût API mesuré | Sans remise de cache | Résultat |
| --- | ---: | ---: | ---: | ---: | --- |
| Actuelle : GPT-5.4 mini, raisonnement `low` partout | 7 | 32 s | 0,0346 $ | 0,0368 $ | Analyse partielle : trois synthèses refusées pour longueur |
| Mini avec raisonnement `medium` partout | 5 | 72 s | 0,0703 $ | 0,0703 $ | Terminé ; plusieurs nuances mieux conservées, synthèse toujours sans l'objet de l'étude |
| Mini pour lire, GPT-5.4 `medium` pour les deux étapes suivantes | 6 | 111 s | 0,1163 $ | 0,1187 $ | Terminé ; meilleure distinction des horaires, questions de terrain encore peu pertinentes |
| Prototype 1 : prompt de lecture raccourci, suppression d'une réécriture, GPT-5.4 pour l'ouverture avec les originaux | 5 | 60 s | 0,0604 $ | 0,0604 $ | Écarté : deux reprises pour omission et texte final coupé par la limite de la copie expérimentale |
| Prototype 2 : lecture d'origine précisée, suppression de la réécriture si une couche tient dans un seul lot, GPT-5.4 pour l'ouverture avec originaux et objet de l'étude | 3 | 28 s | 0,0360 $ | 0,0360 $ | Terminé ; synthèse plus pertinente pour la visite, erreurs résiduelles dans les constats |

Le prototype 2 accepte une synthèse plus développée, sans coupe silencieuse. Il ne constitue donc pas une comparaison du modèle seul : contexte, étapes et contrainte de longueur changent ensemble. Il montre une piste économique, pas une version prête à livrer.

Les coûts viennent de `usage.input_tokens`, `cached_tokens` et `output_tokens` retournés par chaque réponse API, reprises incluses. Les tokens de raisonnement sont déjà compris dans la sortie : ils ne sont pas ajoutés une seconde fois. Prix standards utilisés, par million de tokens : mini = 0,75 $ en entrée, 0,075 $ en entrée cachée, 4,50 $ en sortie ; GPT-5.4 = 2,50 $, 0,25 $ et 15 $. Sources : [GPT-5.4 mini](https://developers.openai.com/api/docs/models/gpt-5.4-mini) et [GPT-5.4](https://developers.openai.com/api/docs/models/gpt-5.4).

Il s'agit du coût API calculé au tarif public, hors taxes, conversion bancaire, hébergement et éventuelles conditions commerciales du compte. Ce n'est pas une lecture de la facture. Les essais réservent un montant prudent avant chaque appel sous un budget de 0,30 $ par exécution ; cette protection appartient au banc d'essai, pas à l'application.

### Test de volume : 300 observations

Le prototype 2 a aussi été exécuté sur 300 textes : les 20 situations initiales déclinées dans 15 secteurs portant des noms distincts. C'est un test de volume avec des formulations volontairement répétitives, pas un échantillon représentatif de 300 contributions réelles. La longueur moyenne des textes et leur diversité peuvent changer fortement le résultat.

| Volume | Appels API terminés | Durée | Coût mesuré | Sans remise de cache | Résultat |
| --- | ---: | ---: | ---: | ---: | --- |
| 300 observations | 26 | 4 min 12 s | 0,2398 $ | 0,2436 $ | Lecture et constats terminés ; synthèse finale non lancée |

Les neuf lots initiaux nécessitent 22 appels de lecture après corrections et divisions, puis quatre réécritures. Neuf appels de correction consomment à eux seuls 0,0761 $. Le montant encore disponible ne permet plus de réserver l'entrée et les 4 000 tokens de sortie maximaux de l'ouverture avec GPT-5.4. Le banc d'essai l'arrête donc avant l'appel payant.

Cet arrêt ne démontre pas que l'ouverture aurait nécessairement dépassé 0,30 $ en consommation effective. Il démontre qu'on ne peut plus garantir le plafond avec la réserve choisie. Le relais transforme l'erreur de budget injectée par le banc d'essai en erreur de connexion et la retente deux fois localement, sans nouvel appel OpenAI. Le message d'erreur conservé dans le JSON doit être lu avec cette précision : il n'y a pas eu de panne fournisseur sur cette étape.

**Coût total des six exécutions de l'audit : 0,5575 $ d'API**, selon les usages retournés et les tarifs ci-dessus. Les probes déterministes ne coûtent aucun appel IA.

## Ce qui limite réellement la qualité

### 1. La question de l'étude n'arrive pas au modèle

Le champ `objective` est enregistré et affiché, mais ni les requêtes de `dossier/analyze.js` ni les données construites dans `netlify/functions/lib/diagnostic-dossier.mjs:37` ne le transmettent. La génération démarre aussi dès la création, avant une éventuelle saisie ultérieure de ce champ.

Dans le cas testé, les variantes actuelles ouvrent surtout sur le stationnement vélo et la gare. Le prototype qui reçoit l'objet de l'étude commence par le chemin boueux, les conditions de passage avec une poussette et le détour accessible non vérifié. Le contexte change donc utilement ce qui mérite d'apparaître en ouverture.

**À faire :** rendre cet objectif disponible avant l'analyse ou permettre de refaire uniquement la synthèse quand il change. L'utiliser pour organiser la réponse, sans faire disparaître les observations qui ne répondent pas directement à cette question.

### 2. Des nuances disparaissent entre lecture et synthèse

Dans `dossier/analyze.js:131`, la réécriture ne reçoit que les trois premiers extraits de chaque groupe, coupés à 400 caractères. Dans `:139`, l'ouverture reçoit les constats générés et les mesures, sans les originaux. Au-delà de 36 constats, les ouvertures intermédiaires sont à nouveau résumées.

Conséquence observée : la lecture initiale de la version actuelle perd la mention « Le détour accessible n'a pas été vérifié ». Une étape ultérieure qui ne reçoit plus ce texte ne peut pas restaurer cette information de manière fiable.

**À faire :** conserver, avec chaque constat, les preuves favorables, les éléments contradictoires, les conditions d'usage, les dates et les inconnues explicites. Fournir ces éléments à la synthèse. Pour les grands dossiers, sélectionner les preuves en fonction de leur rôle, pas seulement leur position dans une liste. Les relations spatiales éventuelles doivent être calculées à partir des données, pas déduites de coordonnées par le modèle.

### 3. Une référence valide ne garantit pas une phrase juste

Les contrôles de `dossier/contract.mjs:93` et `:168` sont utiles, mais incomplets. Les garde-fous de formulation portent surtout sur le titre et la lecture ; les questions et réserves sont moins contrôlées. Le contrôle des nombres vérifie les valeurs, pas leur unité, leur période ni leur attribution.

Cinq réponses volontairement erronées ont été injectées dans les validateurs, sans appel IA. Elles ont toutes été acceptées :

- « 1 240 habitants par an » à partir de « 1 240 passages / jour ».
- Une demande de stationnement transformée en absence d'équipement.
- Un texte utile entièrement classé hors analyse, tout en étant compté comme examiné.
- Une référence inexistante mêlée à une référence valide, puis supprimée silencieusement.
- Une question qui propose d'installer des équipements partout dans la commune.

Ce sont des failles démontrées des contrôles, pas cinq erreurs observées du modèle.

Des erreurs de sens apparaissent aussi dans les générations réelles. Le prototype 2 écrit dans un titre que des arceaux sont demandés devant les commerces alors que le texte ne précise que du stationnement. Sa synthèse attribue à une même personne deux observations distinctes sur le chemin sec et boueux. Plusieurs variantes proposent de rechercher où se trouve désormais une branche qui ne masque plus le feu : cela ne constitue pas une bonne question de visite.

**À faire :** contrôler aussi titres, réserves et questions ; associer les chiffres à des objets structurés `valeur + unité + période + périmètre + source` ; conserver une raison explicite pour tout texte écarté. Ajouter une vérification ciblée des affirmations sensibles avec les originaux : demande devenue absence, changement de date, de lieu, de dispositif, causalité, fusion de personnes. Ne pas multiplier les expressions régulières en prétendant valider tout le sens.

### 4. La limite de longueur provoque des dépenses sans améliorer le fond

Le prompt impose 380 caractères et `validateOverview` refuse au-delà de 420. Sur le cas actuel, l'ouverture échoue trois fois pour ce seul motif ; les constats restent disponibles mais le dossier demeure partiel et le PDF est bloqué.

**À faire :** viser trois à cinq phrases adaptées au contenu, avec une limite éditoriale souple. Un problème de présentation ne doit pas déclencher la même reprise qu'une invention de fait. Toute réduction doit conserver des phrases complètes et être contrôlée ; une simple coupe de chaîne peut supprimer une nuance décisive, comme l'a montré le prototype 1.

## Ce qui menace le budget

Le serveur jette actuellement les données `usage` et ne maintient pas de dépense par génération (`diagnostic-dossier.mjs:58`). Le plafond de 8 000 tokens de sortie par appel n'est pas un plafond de coût pour le dossier entier.

`dossier/recovery.js:21` autorise deux corrections et deux reprises réseau par tentative logique. `analyze.js:77` peut ensuite diviser un lot et recommencer sur ses enfants. Une simulation déterministe, sans appel API, transforme un lot de 36 observations en **29 appels de lecture**, puis une réécriture et une ouverture, soit **31 appels**. Cela montre une amplification possible, pas sa fréquence en production ni le pire cas théorique.

Les corrections renvoient surtout un type d'erreur générique. Elles n'indiquent pas précisément les références manquantes ni la phrase fautive. Le modèle peut donc payer plusieurs tentatives pour refaire le même oubli.

Les étapes validées sont déjà conservées, ce qui évite de tout repayer lors d'une reprise. Mais leur réutilisation ne repose pas sur une empreinte complète des textes, des prompts et des paramètres. Il faut préserver cette économie tout en évitant de réutiliser un résultat devenu obsolète.

## Architecture recommandée

1. **Mesurer et réserver le budget côté serveur.** Un identifiant de génération partagé entre tous les appels ; modèle, version de prompt, tokens, coût, motif de reprise et état de validation enregistrés sans recopier les témoignages dans les logs. Réservation atomique avant l'appel selon entrée et sortie maximale, marge pour la synthèse et les taxes/conversions retenues. Une requête interrompue dont l'usage est inconnu garde sa réservation jusqu'au rapprochement. Un plafond uniquement dans le navigateur ne suffit pas.
2. **Lire avec mini et produire une trace vérifiable.** Une décision explicite pour chaque observation, avec les conditions qui changent le sens. Tester un schéma à identifiants imposés pour réduire les oublis. Les compteurs, longueurs, agrégations et références restent calculés par le code.
3. **Éviter la réécriture systématique.** Si une couche a déjà été lue en un seul lot, une nouvelle reformulation n'est pas toujours nécessaire. Le prototype montre l'économie possible, mais aussi qu'une suppression aveugle peut laisser un mauvais titre. Garder une vérification ciblée, notamment pour les fusions et contradictions.
4. **Réserver le modèle plus fort à la compréhension croisée.** Lui fournir l'objet de l'étude, les originaux utiles, les contradictions et les mesures comparables. GPT-5.4 avec raisonnement `medium` est une piste testée, pas un choix à figer sans évaluation. Une requête de cette variante a pris 41 secondes, proche du délai serveur de 45 secondes : traiter aussi le risque de reprise lié au temps de réponse.
5. **Valider sur un corpus métier avant d'annoncer la qualité.** Comparer les versions à l'aveugle sur 30 à 50 dossiers représentatifs : petits et grands volumes, textes longs, accessibilité, vélo, accidents peu nombreux, chaleur, sources absentes, dates contradictoires, plusieurs personnes, instructions parasites. Faire relire les cas par un utilisateur métier et garder les cas difficiles en non-régression. Cette démarche suit les [recommandations d'évaluation OpenAI](https://developers.openai.com/api/docs/guides/evaluation-best-practices).

Le critère de livraison doit combiner fidélité, conservation des nuances, utilité des questions de terrain, couverture, coût total et délai. Un dossier simplement marqué `complete` ou une prose plus élégante ne suffit pas.

L'ordre conseillé est : mesure du coût et plafond partagé ; transmission de l'objet et des preuves ; correction des reprises et de la longueur ; comparaison sur le corpus métier ; choix définitif du modèle. Le passage de toutes les étapes en raisonnement plus élevé n'est pas justifié par ces essais.

## Pièces de l'audit

Les entrées, sorties et usages par appel sont conservés dans [les résultats locaux](../output/diagnostic-ai-audit-2026-09-17/). `case-20.json` décrit le petit cas ; `baseline.json`, `medium.json`, `hybrid.json`, `optimized.json` et `optimized2.json` contiennent les générations. `case-300.json` et `optimized2-300.json` décrivent le test de volume. `probes.json` conserve les cinq failles des contrôles et la simulation des reprises. Aucune clé API n'y figure.
