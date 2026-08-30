# Démo salon : génération en direct de la carte d'une commune

Écran plein format (« Tapez le nom de votre commune ») qui génère en direct
l'espace Open Projets d'une commune à partir de sources publiques : site de la
mairie (logo, couleur, pages projets, texte des PDF officiels), site de
l'intercommunalité (pages qui nomment la commune), presse locale (articles lus
un par un), marchés publics de travaux (BOAMP, avis complet).

## L'écran de génération : trois zones, une seule voix

L'écran a été refondu après un constat simple : quatre éléments parlaient en
même temps de quatre projets différents, et l'ensemble était illisible. La
règle est désormais une hiérarchie fixe, apprise en dix secondes :

1. **L'en-tête** (une seule barre) : les cinq phases, l'action de phase en
   cours, l'identité de la commune. Il ne change qu'aux changements d'étape.
2. **La carte** : la scène. Sonar, épingles, emprises, photos - rien d'autre
   ne s'y superpose.
3. **L'établi** (un seul panneau, en bas) : trois rangées. Le PLATEAU, seule
   voix de l'écran, montre une information à la fois, cadencée pour être lue -
   soit l'activité de l'instant (page lue, projet placé, article rédigé), soit
   la PREUVE, la phrase exacte relevée dans la source, dévoilée par balayage,
   prioritaire et affichée plus longtemps. La MAIN de cartes : chaque projet
   repéré tombe en carte et prend sa place dans une main qui se resserre à
   mesure qu'elle grossit ; les doublons sont jetés à la vérification, chaque
   carte s'envole vers son point à la localisation, les sans-adresse partent
   au rebut. Le PIED : le compte des projets repérés, quatre compteurs
   (sources, vérifiés, localisés, illustrés) et ce que l'on refuse.

Les activités ne s'empilent jamais : la plus récente remplace celle qui
attendait, donc une rafale de cinq pages ne fait clignoter qu'un titre. Un
changement de phase vide le plateau : il parle toujours de la phase en cours.

## Le site est exploré page par page

C'est le cœur du système, et il a changé. On lisait auparavant un nombre fixe de
pages, on en faisait **un seul document**, et on demandait à l'IA de le
dépouiller d'un coup. Sur une métropole ce document atteignait l'équivalent d'un
livre de cent cinquante pages, et l'IA en ratait le milieu : mesure sur Lyon,
dix projets tirés d'un corpus pourtant plus riche que celui qui en avait rendu
dix-neuf. Le fichier documentait déjà le même phénomène pour la sélection des
liens, découpée en lots pour cette raison exacte.

Le parcours actuel :

1. **Amorçage.** L'accueil et le sitemap donnent les adresses candidates, avec
   leurs seuls intitulés. Le sitemap est cherché aux chemins d'usage **et** dans
   le `robots.txt`, que certaines communes sont les seules à renseigner.
2. **Tri de masse.** Un appel par lot de 150 intitulés **écarte l'évident** :
   état civil, menus de cantine, vie associative, élus et instances. Il ne
   choisit pas les meilleures, il refuse les impossibles - la nuance est tout,
   car deviner laquelle des deux cents pages restantes décrit un chantier est
   impossible sans l'ouvrir. Mesure sur Ploudalmézeau : 325 candidates, 190
   écartées, 135 ouvertes.
3. **Lecture.** Chaque page survivante reçoit **un appel à elle seule**, qui
   répond à deux questions ensemble : quels projets décrit-elle, et quels de ses
   liens méritent d'être ouverts à leur tour. Cinq lectures de front.
4. **Descente.** Les liens recommandés rejoignent la file, débarrassés de ce qui
   a déjà été lu. L'exploration s'enfonce là où elle trouve et s'arrête quand la
   file est vide, pas quand un quota est atteint.

Deux curseurs, réglables sans déploiement : `DEMO_PAGES_MAX` (300 par défaut,
plafond de sécurité) et surtout `DEMO_BRUTS_MAX`, le **budget de matière** du
mode salon : l'exploration s'arrête quand elle a repéré assez de projets. Mesure
sur les traces réelles : les pistes froides produisent presque autant que les
chaudes (24 % contre 28 % sur Vannes) et les projets arrivent jusqu'à la
dernière page, donc ni un tri plus dur ni un arrêt au rendement ne marchent -
le budget de matière coupe tôt sur les villes riches (Bordeaux : 60 projets dès
la 80e page sur 266) et jamais sur les communes pauvres. **Actif par défaut à
100 projets repérés**, calibré pour une carte de 40 à 50 fiches ; `0` rétablit
le mode exhaustif.

**Aucun plafond sur le nombre de projets**, et plus de plafond de matière non
plus : il n'y a plus de document commun à rationner, donc plus de répartition à
négocier entre la mairie, les marchés et la presse. Conséquence assumée : une
petite commune se génère en 3 à 4 minutes, une métropole peut demander 6 à 8
minutes, et le coût d'analyse passe d'environ 0,30 à 1 euro par métropole.

## Trois étages de sources, du plus officiel au plus large

Une petite commune épuise vite son site : l'exploration monte alors d'un étage,
tant que le budget de matière n'est pas atteint.

1. **La mairie**, intégralement, comme décrit ci-dessus.
2. **L'intercommunalité.** Son site est identifié par l'annuaire de
   l'administration, et seules ses pages qui **nomment la commune** sont lues :
   le verrou s'applique aux liens suivis ET aux projets récoltés, sans quoi les
   rubriques vitrines de la métropole versaient La Duchère dans la carte de
   Quincieux (mesuré : 236 pages lues et 65 projets d'ailleurs avant le verrou,
   contre 42 pages après).
3. **La presse.** Les flux Google News sont illisibles (leurs liens rendent une
   coquille JavaScript) et le flux Bing est réservé à un usage personnel : la
   découverte passe par la recherche web d'OpenAI, déjà payée pour la
   rédaction, dont les **annotations** portent les adresses réelles des
   articles cités - jamais le texte du modèle, qui invente des adresses.
   Chaque article est ensuite lu par le même lecteur que les pages de mairie,
   sans suivre aucun de ses liens, avec une consigne durcie : opérations
   décidées, financées ou engagées, jamais une piste ni une promesse, et
   uniquement dans la commune. Mesure sur Quincieux : 3 articles lus (Le
   Progrès, Lyon Entreprises, DREAL), 2 fiches nouvelles dont la
   requalification du centre-bourg, invisible des sites officiels.

Le placement sur carte est cadencé à une requête par seconde et retente après
un refus : le géocodeur public bannit les rafales, et un refus transitoire ne
doit jamais faire conclure à tort « aucun projet documenté ».

## Un même chantier vu par plusieurs pages ne fait qu'une fiche

C'est la contrepartie de la lecture séparée. Le même écoquartier figure sur la
rubrique « nos projets », sur l'actualité qui annonce le chantier et dans l'avis
de marché : trois adresses distinctes, aucune lue deux fois, et pourtant trois
entrées à fondre en une. Le rapprochement se fait en trois temps : un tri
mécanique gratuit sur les mots caractéristiques et le lieu, un arbitrage par
l'IA sur les seules paires douteuses (les titres seuls, jamais les pages), puis
la fusion, qui garde le titre le plus informatif, la description la plus
complète, l'adresse la plus précise et **additionne les sources**.

Ce dernier point est un gain inattendu : le nombre de sources distinctes qui
attestent un projet devient une mesure de sa solidité, ce qu'on ne savait pas
mesurer quand une seule lecture voyait tout d'un coup et fusionnait sans dire
ni quoi ni pourquoi.

## Trois règles de fond

**Aucune position inventée.** Un projet qu'on ne sait pas situer précisément est
retiré de la carte. La localisation procède par étages : emprise ou tracé réels
(Nominatim), adresse postale (BAN), puis en dernier recours une requête IA qui
propose un lieu géocodable. Une carte qui invente des emplacements devant un élu
qui connaît sa commune coûte plus cher qu'une carte moins fournie.

**Aucune affirmation hors source.** Le rédacteur travaille à partir de l'extrait
des sources collectées et peut consulter les pages de ces sources, mais
uniquement les leurs : la recherche web est restreinte aux domaines déjà
attestés pour ce projet. Consigne constante de préférer trois lignes exactes à
quinze lignes plausibles. Les sources réellement consultées sont citées en fin
d'article, reconstruites à partir des adresses relevées et non de ce que le
modèle prétend avoir lu.

**Aucune illustration qui trompe.** Une photo n'est retenue que si un juge
visuel confirme qu'elle montre bien ce projet. À défaut, la fiche reçoit la vue
aérienne du lieu exact (IGN, Géoplateforme) : elle ne prétend pas montrer le
projet, elle montre l'endroit, ce qu'un élu peut vérifier d'un coup d'oeil. La
recherche de photos libres *à proximité* a été supprimée : elle rendait l'église
classée du quartier plutôt que la rue en travaux.

## Les marchés publics sont un dernier recours

Un avis de marché apporte l'adresse officielle du chantier et le maître
d'ouvrage, mais une prose administrative et aucun visuel. Il sert donc d'abord à
**compléter** un projet repéré ailleurs, ce que fait la fusion multi-sources. Il
ne crée une fiche à lui seul que si la commune ne documente pas assez
d'opérations par elle-même (seuil `DEMO_MARCHES_CIBLE`, 12 par défaut), et la
réserve écartée se rouvre si le géocodage fait descendre la carte sous huit
projets. Mesure sur Lyon : les douze projets venus du site de la ville ont tous
une vraie photo, les sept venus d'avis n'en avaient aucune.

## Le réseau de transport de la commune

À la fin de la création, l'espace reçoit une couche « transports en commun »
construite depuis OpenStreetMap (`netlify/functions/lib/transit-osm.mjs`) :
le TRANSPORT LOURD uniquement (métro, tramway, funiculaire), une entité par
ligne, la couleur officielle portée par chaque tracé (propriété `_color`, lue
nativement par la carte, sans table de correspondance), chaque rue comptée
une fois par ligne, opacité contenue (0,55) : le réseau est un fond de
contexte sous les projets, pas le sujet de la carte. Les réseaux de bus
complets ont été essayés et retirés : des dizaines de lignes recouvraient la
carte au point d'étouffer les projets. Le fichier va dans le storage
(`layer/<ville>/transports.geojson`), la couche `transports` (affichée par
défaut) et la catégorie sont inscrites pour la ville. Un échec du service
Overpass est silencieux et ne bloque jamais la création ; « Refaire le
recensement » reconstruit aussi cette couche. Aucune ligne de transport
lourd : pas de couche du tout.

## Thème d'affichage

L'écran s'affiche **en clair par défaut** : verre blanc, fond **Voyager**
(vectoriel, données OpenStreetMap) repeint « papier lumineux ». Le sombre
d'origine (verre sombre, dark-matter repeint « navy tech ») reste disponible
derrière l'interrupteur soleil/lune en haut à droite : c'est la commande de
celui qui tient le stand, retenue par écran (`localStorage`, clé
`demo-theme`), jamais par visiteur. La bascule marche à tout moment, y
compris en pleine génération : la scène (relief, bâtiments, contour,
emprises, faisceaux) est rejouée sur le nouveau fond. Le raster OSM standard
a été essayé pour le jour et abandonné : flou dès que la caméra tourne ou
s'incline, et impossible à repeindre. Techniquement : `theme.js` pose
`data-theme` sur `<html>` avant le premier rendu, `demo.css` n'a que des
jetons de thème, `map-fx.js` porte les deux fonds et leurs repeintures dans
sa table `THEMES`.

## URLs

- `/demo/` : écran de saisie (autocomplétion officielle geo.api.gouv.fr)
- `/demo/?commune=<INSEE>&nom=<Nom>&auto=1` : lancement direct (liens de prospection)
- `/demo/?commune=<INSEE>&regen=1` : **refait** le recensement d'une commune déjà
  générée au lieu d'ouvrir son espace. L'adresse de l'espace ne change pas, ses
  fiches sont remplacées : un lien de prospection déjà envoyé reste valide.
  Le même geste est proposé à l'écran (bouton « Refaire le recensement »)
  lorsqu'on retombe sur une commune déjà générée.
- Espaces créés : `/?city=essai-<commune>` (préfixe `essai-` systématique)
- Codes INSEE acceptés : métropole (`69244`), **Corse (`2A004`, `2B033`)**,
  outre-mer (`97411`). La lettre corse est en deuxième position, pas en
  troisième : c'est le piège qui rendait la Corse indémontrable.

## Ce qu'on récolte

- **Adresse en fin de parcours, obligatoire** : l'accès à l'espace (bouton
  « Découvrir l'espace » et QR code) reste masqué tant qu'une adresse valide
  n'a pas été envoyée. Il n'y a plus d'échappatoire à l'écran. Celui qui tient
  le stand dispose d'une porte de service : taper `vazy` dans le champ ouvre
  l'espace sans adresse, sans enregistrement et sans remerciement
  (`LEAD_BYPASS` dans `demo.js`). Le compte à rebours de redirection ne démarre
  qu'une fois l'espace déverrouillé ; en mode kiosque, 120 s sans frappe
  ramènent l'écran à l'accueil (le visiteur est parti, l'espace n'est pas
  déverrouillé pour autant). Route `POST /api/demo-lead`, table `demo_leads`.
- **Journal des générations** : table `demo_runs`, une ligne par tentative,
  ouverte en `running` puis close en `ready` ou `failed`, avec l'étape atteinte,
  le motif d'échec, la durée RÉELLE (de la première invocation à la dernière) et
  les tokens consommés. Une ligne restée `running` est une information : le
  visiteur a fermé l'onglet en route. Avant, `demo_instances` ne gardait que les
  succès et effaçait tout le reste.

Les deux tables sont en RLS **sans aucune politique** : elles ne sont lisibles
que par la clé de service, côté serveur. Une adresse laissée par un élu n'a rien
à faire derrière la clé publique.

### Le message envoyé au visiteur

`netlify/functions/lib/demo-mail.mjs` compose et expédie le message. Ce n'est
pas une route : le fichier vit dans `lib/` précisément pour que Netlify ne le
prenne pas pour une fonction.

**Deux variables d'environnement à poser pour que l'envoi ait lieu**, l'une ou
l'autre selon le fournisseur retenu :

| Variable | Fournisseur |
|---|---|
| `RESEND_API_KEY` | Resend (`api.resend.com`) |
| `BREVO_API_KEY` | Brevo (`api.brevo.com`, hébergement européen) |

Deux réglages facultatifs : `DEMO_MAIL_FROM` (par défaut
`Open Projets <bonjour@openprojets.com>`) et `DEMO_MAIL_REPLY_TO`, qui accepte
plusieurs adresses séparées par des virgules.

`DEMO_MAIL_REPLY_TO` n'est pas vraiment facultative ici : le domaine
d'expédition n'a aucun enregistrement MX, donc une réponse envoyée à
`bonjour@openprojets.com` n'arrive nulle part. Or le message invite le visiteur
à répondre pour ne plus être contacté. Sans cette variable, la sortie
d'opposition promise n'existe pas. Brevo ne retient que la première adresse de
la liste, Resend les reçoit toutes.

**Sans clé, rien n'est envoyé** : le lead est enregistré avec
`mail_status = 'non_configure'`, l'écran remercie sans promettre de lien, et un
avertissement part dans les logs. Jamais de promesse non tenue à un visiteur.

Le **domaine d'expédition doit être vérifié chez le fournisseur** (SPF, DKIM),
sinon les messages partent en indésirable ou sont refusés. C'est la seule étape
que le code ne peut pas faire à votre place.

Le contenu dit franchement que la carte a été construite **sans la
collectivité**, à partir des seules sources publiques, et qu'elle est donc
incomplète. Ce n'est pas de la modestie : un élu qui y trouve une erreur nous
l'imputerait, et ce qui manque est précisément ce que la collectivité
apporterait. Le message porte aussi la mention d'où vient l'adresse et comment
ne plus être contacté.

Suivi : `select mail_status, count(*) from demo_leads group by 1;`

## Garde-fous

- Idempotence : une commune déjà générée redirige vers l'espace existant, sauf
  `regen=1` qui refait le recensement
- Quotas : 80 générations/jour au global, 15 par IP (constantes en tête de
  `netlify/functions/demo-generate.mjs`). Pour le salon : définir la variable
  d'env `DEMO_KIOSK_KEY` et ouvrir `/demo/?kiosk=1&k=<clé>` : le quota par IP
  est levé pour cet écran (le plafond global reste)
- Diagnostic : `DEMO_DEBUG=1` en variable d'env renvoie le détail technique
  des erreurs au navigateur (désactivé par défaut)
- Génération en 6 invocations SSE courtes (sources → ai → locate → media →
  redact → create), état dans `demo_instances.status/payload`, reprise
  automatique côté client en cas de coupure ; échec « sources insuffisantes »
  mémorisé en statut `failed` (aucun re-coût IA)
- **Phases découpées en tranches** : `locate` et `media` travaillent pendant un
  budget borné (22 s) puis rendent la main en redemandant LA MÊME phase, qui
  reprend à son curseur. Sans cela, le déplafonnement du nombre de projets
  ferait perdre tous les projets au-delà du budget. Filet anti-boucle : 14
  tranches maximum, après quoi on finalise avec ce qu'on a
- **Reprises bornées** : 4 par phase, et 12 au total pour une génération, ce
  second compteur n'étant jamais rechargé. Le compteur par phase seul rendait
  possible une boucle sans fin qui repayait l'IA à chaque tour
- Qualité : projet rejeté si sa source n'a pas été réellement collectée, si la
  confiance est basse, s'il géocode hors du contour de la commune, ou si aucun
  emplacement n'est identifiable ; deux fiches sont fusionnées si elles sont à
  moins de 250 m ET partagent deux mots distinctifs, ou à moins de 80 m et un
  seul (un seul mot à 250 m supprimait des projets réels : « avenue Berthelot »
  et « résidence Berthelot ») ; une position DÉJÀ OCCUPÉE écarte le projet, car
  un emplacement partagé par plusieurs fiches n'est celui d'aucune (mesuré sur
  Saint-Denis : cinq avis de marché sans lieu propre rabattus sur le même
  polygone)
- **La rareté n'arrête plus la génération** : un seul projet situé suffit à
  monter la carte, parce qu'un point sur la carte de sa commune vaut mieux
  qu'un écran de texte. Sous `CARTE_COURTE` (3) projets situés, un événement
  `notice` est émis juste après le géocodage, seul moment où le compte est
  définitif, et l'écran de fin remplace son compte rendu de performance par
  l'argument de la carte à construire (`courte: true` dans l'événement `done`).
  Le vide, lui, reste un arrêt : aucune source exploitable, aucun projet
  attesté ou aucun projet situé envoient un `error` de motif `sans-projet`
- **Plus aucun bandeau d'erreur** : le visiteur vient d'attendre trois minutes
  devant sa commune, lui rendre une vignette rouge et un bouton
  « Recommencer » (qui ne recommençait rien, il ramenait à la saisie) était la
  pire fin possible. Les quatre issues qui n'ouvrent aucun espace convergent
  vers l'écran de fin en `done--sans-espace` : ni bouton d'accès, ni QR code,
  ni bandeau de chiffres, un emblème propre à chacune, l'adresse demandée sans
  être exigée et la sortie offerte d'emblée. Elles se décrivent dans la table
  `CONSTATS` de `demo.js`, jamais dans le code qui les affiche :
  | motif | emblème | ce qu'on propose |
  |---|---|---|
  | `sans-projet` | loupe | préparer la carte avec vos documents |
  | `quota` | horloge | recevoir la carte demain matin |
  | `technique` | reprise | reprendre la carte de notre côté, ou réessayer |
  Le motif remonte à PostHog dans `demo_generation_failed.reason`. Le message
  technique du serveur (« Brouillon incomplet ») reste dans la console : il est
  utile au développeur et illisible pour un maire
- L'écran distingue ce qui est écarté faute d'emplacement vérifiable de ce qui
  est fusionné pour cause de doublon : les confondre revenait à mentir sur le
  motif du rejet. Sur une carte courte, ce décompte est tu : afficher cinq
  rejets au-dessus de deux projets retenus insiste sur ce qui manque
- SEO : villes `essai-*` exclues du sitemap et du llms.txt, hubs et fiches en
  noindex
- Modèle IA : `gpt-4o` (surchargable via `DEMO_OPENAI_MODEL`). Les **tâches
  unitaires** - lire une page - tournent sur un modèle léger
  (`DEMO_OPENAI_MODEL_LIGHT`, `gpt-4o-mini` par défaut) : un petit problème
  fermé n'a pas besoin d'un grand modèle, et à l'échelle de quatre-vingt-dix
  pages c'est ce qui rend la lecture page par page moins chère que l'ancien
  dépouillement en bloc. Le **tri des intitulés** reste en revanche sur le
  grand modèle : c'est un jugement, et mesure faite sur Vannes, le léger
  n'écarte que 9 adresses sur 280 là où le grand en écarte 189, chaque adresse
  gardée à tort se payant ensuite en lecture. Les appels de
  vision ont leur propre variable `DEMO_OPENAI_VISION_MODEL`, qui pointe par
  défaut sur le même modèle : **ne pas y mettre un modèle léger**, mesure faite
  le juge d'image y passe de 953 à 13 565 tokens d'entrée par appel, ces
  modèles facturant les images à un tarif de tokens bien plus élevé
- Coût IA : chaque appel journalise ses tokens (`[demo-tokens] <schéma> input= output= total=`)
  et le cumul est persisté dans `demo_runs.tokens_in` / `tokens_out`. Le
  compteur est remis à zéro en tête de chaque invocation : sans cela, un
  conteneur de fonction réutilisé cumulait depuis son démarrage et annonçait
  deux à quatre fois la dépense réelle

## Appels IA

| Appel | Quand | Ordre de grandeur |
|---|---|---|
| `tri_liens` | un par lot de 150 intitulés, écarte l'évident | ~5 500 tokens |
| `lecture_page` | **un par page ouverte**, le gros poste | ~2 500 entrée / 300 sortie |
| `rapprochement_doutes` | seulement s'il reste des paires ambiguës, titres seuls | ~250 tokens |
| `avis_marches` | une fois, les avis BOAMP en une passe | ~8 000 tokens |
| `article` | **un par fiche**, avec recherche web restreinte aux domaines attestés | ~15 000 entrée / 700 sortie |
| `choix_image` | un par projet, images en `detail: 'low'` | ~950 tokens |
| `logo_commune` | une fois, jusqu'à 4 candidats en `detail: 'low'` | ~400 tokens |
| `lieux_projets` | une fois, seulement s'il reste des projets à situer | ~1 000 tokens |
| `themes_illustration` | **rare** : seulement si l'IGN ne couvre pas la commune | ~700 tokens |
| `tri_boamp` | **conditionnel** : seulement si les avis dépassent le plafond | ~4 500 tokens |

Trois de ces appels ont remplacé des règles écrites en dur :

- `logo_commune` remplace 60 lignes de score et deux listes de mots relevées
  commune par commune. Un modèle qui REGARDE l'image voit qu'un logo est en
  version blanche, donc invisible sur l'interface ; un motif textuel ne le peut
  pas. Il coûte moins que l'ancien appel couleur, qui envoyait une image en
  pleine résolution.

### Installation du logo

Le logo est tenté sur **tous** les candidats retenus, dans l'ordre, jusqu'à ce
que l'un se télécharge. Une seule tentative, sans repli et sans trace, faisait
perdre le logo sur un simple délai dépassé : relevé en base, 7 espaces sur 27
sans logo, dont deux communes dont le logo se télécharge parfaitement quand on
rejoue la séquence. Trois corrections :

- **cascade** sur les candidats du scoring puis l'icône déclarée du site ;
- **délai propre de 15 s** au lieu des 8 s du moissonnage : c'est un fichier
  unique et petit, pas une page de site à parcourir ;
- **type lu dans les octets**, pas dans l'en-tête déclaré. Un serveur qui rend
  une page d'erreur en annonçant `image/png`, ou une image en annonçant
  `text/plain`, trompait le contrôle dans un sens comme dans l'autre.

Chaque échec est désormais journalisé avec son motif. Auparavant le `catch`
était muet : l'espace prenait le logo Open Projets et personne ne savait que la
commune en avait un.
- `themes_illustration` remplace 18 familles d'ouvrages écrites en dur, dont les
  requêtes étaient en français alors que Wikimedia Commons est indexé en
  anglais.
- `tri_boamp` remplace un tri par récence pure qui évinçait une ZAC majeure
  derrière vingt réfections de trottoir récentes.

À l'inverse, trois endroits restent volontairement SANS IA, parce qu'un appel y
serait du gaspillage : le classement des liens du site de la mairie, le
nettoyage des menus de page, et l'extraction du texte des PDF.

## Collecte sur le site de la commune

**C'est la source la plus précieuse**, loin devant les marchés publics : elle
seule raconte les projets. Trois défauts la bridaient, tous corrigés et mesurés
sur un panel de 18 communes réelles.

| | Avant | Après |
|---|---|---|
| Liens de projet repérés depuis l'accueil | 252 | **303** |
| Pages filles atteintes au second niveau | 60 | **392** |
| Part de menu retirée du texte envoyé à l'IA | 0 % | **jusqu'à 40 %** |

1. **Extraction des liens.** Le libellé était borné à 120 caractères *dans le
   motif*, ce qui faisait échouer le motif entier dès qu'un lien contenait du
   balisage imbriqué. Sur Bourgoin-Jallieu, 108 liens sur 169 étaient perdus,
   dont la rubrique « Les grands projets » qui regroupe tout le contenu utile.
   Les adresses contenant une ancre étaient également rejetées en bloc.
2. **Déclenchement du second niveau.** Il exigeait 45 points de score de
   libellé. Le barème n'accorde 60 points qu'à « grands projets » et 40 à
   « ZAC » : une page nommée « Travaux », le nom le plus courant pour la page
   qui recense les chantiers, plafonne à 23 et n'était donc **jamais dépliée**.
   Un sommaire se reconnaît désormais à ce qu'il expose : plusieurs liens de
   projet encore inconnus. L'ancien score reste en second déclencheur, pour ne
   pas reculer sur les communes où il fonctionnait.
3. **Menus et bandeaux.** `stripHtml` ne retire que `<nav>` et `<footer>` ;
   les CMS de mairie construisent leurs menus autrement. Comme le texte était
   coupé aux premiers caractères, l'IA recevait surtout de la navigation. Un
   enchaînement de 8 mots présent sur la majorité des pages d'un même site est
   désormais retiré : déterministe, sans dépendance, sans appel IA. La
   troncature n'intervient qu'après, donc sur du contenu réel.

### Limite connue : les sites protégés contre la lecture automatique

Quelques sites de communes ne servent pas leur contenu à un client automatique.
Ils renvoient une page de 220 octets qui déplace le navigateur par script vers
une adresse à jeton en posant un cookie ; cette adresse répond `307` **avec un
nouveau cookie** ; et la vraie page n'est rendue qu'à qui présente ce second
cookie. Sans cookie du tout : `403 Attack detected`.

Passer ce contrôle demanderait de reproduire le bocal à cookies d'un navigateur
dans le seul but de franchir un garde-barrière que la collectivité a
délibérément installé, et son `robots.txt` (le seul endroit où elle dirait ce
qu'elle autorise) est lui-même derrière ce garde-barrière. **On ne le franchit
donc pas.** On le détecte, on l'écrit dans les logs, on l'affiche à l'écran et
on le consigne dans `demo_runs` : une carte maigre sur une grande commune
s'explique alors d'un coup d'œil. Le recensement se poursuit sur la presse et
les marchés publics.

Mesure sur 160 communes (les 80 plus grandes, plus 80 moyennes tirées
régulièrement entre 5 000 et 50 000 habitants) : **2 sites concernés**, Reims et
Boulogne-Billancourt. Pour ces communes-là, le bon chemin est celui que la démo
propose déjà en cas de sources insuffisantes : préparer la carte avec la
collectivité, à partir de ses documents.

## Développer en local

`netlify dev` injecte dans les fonctions la **passerelle IA de Netlify**
(`OPENAI_BASE_URL=<site>/.netlify/ai` + un jeton de passerelle **à la place** de
la clé du compte). Si cette passerelle n'est pas provisionnée, tous les appels
IA échouent en local (`UND_ERR_CONNECT_TIMEOUT`) alors que la production
fonctionne. Deux variables permettent de viser l'API OpenAI directe :

```bash
DEMO_OPENAI_KEY="$OPENAI_API_KEY" \
DEMO_DUMP=1 \
netlify dev --port 3001
```

- `DEMO_OPENAI_KEY` : clé utilisée à la place de celle injectée ; bascule aussi
  l'URL sur `https://api.openai.com` (surchargeable par `DEMO_OPENAI_BASE_URL`)
- `DEMO_DUMP=1` : déverse les artefacts complets (projets localisés,
  illustrations, articles) dans les logs sous `[demo-dump]`, seule façon de les
  inspecter quand la clé service Supabase manque et que la phase de création
  est court-circuitée

**La clé service Supabase n'arrive JAMAIS par `netlify dev`** : la variable
`SUPABASE_SERVICE_ROLE_KEY` est bien déclarée chez Netlify, mais le CLI ne
transmet pas sa valeur au contexte local (valeur secrète), elle arrive vide.
Conséquences en local : une commune déjà générée est REGÉNÉRÉE au lieu
d'ouvrir son espace (l'idempotence lit `demo_instances` avec cette clé), le
journal `demo_runs` ne s'écrit pas, et la génération se termine sur « la
création de l'espace est désactivée ici » après avoir payé toute l'analyse.
Un avertissement l'annonce désormais dès le départ, à l'écran et dans les
logs. Pour retrouver le comportement de production : copier la clé (tableau
de bord Supabase, ou `netlify env:get SUPABASE_SERVICE_ROLE_KEY`) dans un
fichier `.env` à la racine (ignoré par git), que `netlify dev` charge tout
seul :

```bash
SUPABASE_SERVICE_ROLE_KEY=<la clé service>
```

## Désinstallation complète

1. Supprimer le dossier `demo/`
2. Supprimer `netlify/functions/demo-generate.mjs`,
   `netlify/functions/demo-lead.mjs` et `netlify/functions/lib/demo-mail.mjs`
   (les routes `/api/demo-generate` et `/api/demo-lead` sont déclarées dans ces
   fichiers, rien dans netlify.toml), ainsi que la règle d'en-têtes `/demo/*`
   de netlify.toml
3. Retirer les 5 garde-fous marqués « essai- » : deux dans
   `netlify/functions/sitemap.mjs`, un dans `netlify/functions/llms-txt.mjs`,
   un dans `netlify/edge-functions/ville-hub.js`, un dans
   `netlify/edge-functions/fiche-ssr.js` (rechercher `essai-`)
4. Données : `delete from contribution_uploads where ville like 'essai-%';`
   `delete from city_modules where ville like 'essai-%';`
   `delete from city_branding where ville like 'essai-%';`
   `delete from category_icons where ville like 'essai-%';`
   `delete from layers where ville like 'essai-%';` (couches réseau de transport)
   `drop table demo_leads;` (référence demo_runs), `drop table demo_runs;`,
   `drop table demo_instances;` et vider les dossiers `uploads/demo/`,
   `uploads/layer/essai-*` (fichiers réseau de transport) +
   `uploads/branding/essai-*` du storage
5. Supprimer les specs `tests/unauth.demo.spec.js`,
   `tests/unauth.demo-generate.spec.js`, `tests/unauth.demo-mail.spec.js` et
   `tests/unauth.demo-visuel.spec.js`, ainsi que la migration
   `supabase/migrations/20260728000000_demo_runs_et_leads.sql`

## Dépendance externe

Le QR code de l'écran final est rendu par `api.qrserver.com` (gratuit, sans
clé). En cas d'indisponibilité, seul le QR manque : le bouton et la
redirection automatique fonctionnent.
