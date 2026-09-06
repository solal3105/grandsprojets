# Les cartes des communes : la page du stand, et sa version site

`/cartes/` montre toutes les cartes construites par la démo (les espaces
`essai-*`) et l'espace de démonstration de la Métropole de Lyon. La même page
vit deux vies.

Sur le site, c'est une page qui se lit et se référence : un bandeau avec la
France vue du ciel, puis le titre et la description avec les vrais comptes, la
liste des communes avec un lien vers chaque page ville (`/ville/<slug>`), la
commune la plus illustrée mise en scène, les trois temps de la construction, le
JSON-LD (une collection dont chaque commune est un élément). Elle est inscrite
au sitemap.

Sur le stand (`/cartes/?kiosk=1`), c'est l'écran auquel tout revient. Les
scènes se relaient toutes seules, tout ce qu'un visiteur ouvre se pose en
couche par-dessus l'accueil, et un compteur de veille referme chaque couche
sans geste. **On ne sort jamais de la page.**

## Le parti pris : la commune vue du ciel

Derrière tout, une image aérienne réelle de l'IGN (Géoplateforme, sans clé) :
la France satellite sur l'accueil, avec les communes déjà cartographiées posées
dessus en points ; la commune elle-même quand elle est mise en scène, à 2,4 km
de côté, assez pour lire un centre-bourg entier. Un voile sombre assure la
lecture, et devant, trois tirages photo de ses projets (les photos réelles des
fiches), son logo, son nom en très grand, ce qu'on y a trouvé.

Le passage de l'accueil à une commune est une plongée : la France grossit vers
le point de la commune pendant qu'elle s'efface, la vue aérienne arrive d'un
peu plus près et se pose, le texte monte en place, les tirages se distribuent.
D'une commune à l'autre, les deux calques d'images se relaient. Le retour à
l'accueil est la remontée inverse, et les totaux y remontent en comptant.

Une seule image par vue, à la taille de l'écran (WMS `GetMap`, 1920 × 1080 ou
1080 × 1920 selon l'orientation), plutôt qu'une mosaïque de tuiles : une
requête, un décodage, et le navigateur la garde 21 jours (`max-age` du service).
La vue de la commune suivante est préchargée pendant la scène en cours ; si elle
n'arrive pas en 2,5 s, la scène s'affiche sur la teinte de la commune. Le
service limite à une requête par seconde et quarante par minute : la rotation
en fait une toutes les onze secondes.

Le contour de la France (`index.html`) et les points sont tracés en Mercator
(EPSG:3857), le même repère que les images, l'axe y renversé : la même figure
sert aux deux cadres (paysage et portrait), seul le viewBox change. Les cadres
sont définis dans `catalogue.js` (`VUES_FRANCE`) : les changer sans refaire le
tracé placerait les points à côté des côtes. Le tracé vient de france-geojson
simplifié (Douglas-Peucker, 3,2 km).

Le thème par défaut du stand est le sombre (voile sombre, texte blanc) : c'est
lui qui laisse l'imagerie porter l'écran. L'interrupteur bascule un voile
blanc et de l'encre. Le réglage est celui de l'écran de génération (même clé
`demo-theme`) : la page pose « sombre » au premier lancement du stand si rien
n'est réglé, celui qui tient le stand peut changer sur l'un ou l'autre écran.

## Ce que montre le stand

La rotation : l'accueil (15 s), puis trois communes tirées au sort dans la
vitrine (12 s chacune), puis en alternance « comment la carte se construit » et
la Métropole de Lyon (11 s). Le ruban des communes avance d'un écran à chaque
scène : au fil de la rotation, toutes passent sous les yeux.

La **vitrine** n'accueille que les communes qui ont au moins six fiches
illustrées (`VITRINE_MIN_ILLUSTREES` dans `catalogue.js`) : trois tirages sans
photo font moins envie qu'aucun. Toutes les communes restent dans le ruban,
parce qu'un passant cherche d'abord la sienne.

Le nom de la commune se règle en CSS sur sa longueur (`--n`) et sur son plus
long segment insécable (`--mot`) : le mot le plus long tient sur une ligne, le
nom tient en une ligne dès qu'elle est assez grande, en deux au plus pour les
noms très longs, et jamais plus haut que la scène ne le permet (plafonds en
`vh`). La phrase qui suit tient en trois lignes : un ou deux titres de projets
en exemple, tant que l'ensemble reste sous 150 caractères, jamais de points de
suspension.

Le champ « Tapez le nom de votre commune » garde la même place sur toutes les
scènes. Sur le stand, il ouvre une saisie plein écran (le champ en haut, le
clavier de la tablette en bas, les propositions entre les deux ; le focus est
donné dans le geste du visiteur, Android n'ouvre son clavier qu'ainsi) : si la
carte de la commune existe déjà, elle s'ouvre ; sinon, la génération est
confiée à l'écran `/demo/`, qui reçoit une **adresse de retour** et ramène ici
de lui-même. Chaque proposition annonce la durée à prévoir selon la population
(`dureeEstimee` : environ 3 minutes sous 3 000 habitants, 3 à 4 jusqu'à
20 000, 4 à 6 jusqu'à 100 000, 6 à 8 au-delà ; mesures de `demo/README.md`,
même barème repris par l'écran de génération dans sa première étape). Les
homonymes (Saint-Denis en Seine-Saint-Denis, Saint-Denis de La Réunion) sont
départagés par la position de la commune.

Une carte ouverte en couche porte une barre : revenir à l'accueil, l'identité
de la commune, « Emporter cette carte » (un code à scanner, et le lien par
e-mail via `/api/demo-lead`, réservé aux cartes d'essai puisque l'API n'accepte
qu'elles). La carte tourne dans une iframe de même origine : les liens vers
d'autres sites y sont neutralisés et les nouveaux onglets ramenés dans le cadre.

## Les filets de la veille

| Ce qui est ouvert | Sans geste pendant | Ce qui se passe |
|---|---|---|
| une carte en couche | 75 s | rappel discret à 10 s de la fin, puis retour à l'accueil |
| la saisie plein écran | 45 s | retour à l'accueil |
| une scène retenue par un geste | 20 s | la rotation repart, depuis l'accueil |
| l'écran de génération, en saisie | 60 s | retour à la page des cartes (`demo.js`, paramètre `retour`) |
| l'écran de génération, à l'étape de l'adresse | 120 s | retour à la page des cartes (filet déjà en place) |

Deux garde-fous de plus : un script en erreur entraîne un rechargement de
l'accueil après une minute de calme, et après trois heures de fonctionnement
la page se recharge d'elle-même au premier moment calme de dix minutes (hygiène
mémoire, et prise en compte des corrections déployées). Un changement
d'orientation recharge aussi la page : les cadres du ciel en dépendent.

## La tablette

La page demande à garder l'écran allumé (Wake Lock) et propose un bouton de
plein écran, mais un navigateur Android sort du plein écran à la première
occasion et ne bloque jamais la sortie de la page. Pour un stand, installer une
application kiosque (Fully Kiosk Browser, quelques euros) avec
`/cartes/?kiosk=1` comme adresse de départ : plein écran verrouillé, barres
système masquées, retour à l'adresse de départ après inactivité si on le
souhaite en plus des filets de la page.

Performance, pour une tablette modeste : aucun WebGL sur la page elle-même,
aucun flou de fond, rien d'animé hors `transform` et `opacity` (la dérive
lente du ciel et les transitions sont composées par la carte graphique), une
seule image aérienne par vue, un seul minuteur de veille par seconde, les
photos demandées réduites au service d'images de Supabase (`render/image`,
800 px de large), les images de la scène suivante préchargées, la carte fermée
détruite (`src` vidé) pour rendre sa mémoire.

## Paramètres d'adresse

- `/cartes/` : la page du site
- `/cartes/?kiosk=1` : le stand
- `/cartes/?kiosk=1&k=<clé>` : idem, la clé de stand est transmise à l'écran
  de génération (levée du quota par adresse IP, voir `demo/README.md`)
- `/cartes/?kiosk=1&ouvrir=<slug>&nom=<Nom>` : ouvre tout de suite cette carte
  en couche. C'est ce que fait « Découvrir l'espace » sur l'écran de génération
  quand il a été ouvert par le stand : rien ne part dans un nouvel onglet.
  L'adresse est nettoyée à la fermeture.
- `/demo/?kiosk=1&retour=<chemin>` : l'écran de génération revient à ce chemin
  (même origine uniquement, un chemin absolu, jamais une adresse complète).

## Comment la page est construite

`catalogue.js` est un module partagé, sans dépendance ni accès au DOM. Il lit
`city_branding` et `contribution_uploads` (par pages de 1 000 lignes), assemble
le catalogue (règle de vitrine, images réduites, coordonnées), porte la
projection Mercator, les adresses des vues aériennes, le barème de durée et les
fonctions de rendu HTML. L'edge function `netlify/edge-functions/cartes.js`
l'importe pour pré-rendre la page (cache CDN de cinq minutes,
`cache: 'manual'`) et embarque le catalogue en JSON dans la page ; `cartes.js`
l'importe pour rejouer les scènes, et pour reconstruire le catalogue côté
client si le pré-rendu a manqué (la coquille est alors servie sans cache). Ce
que Google lit et ce que la tablette montre sont le même objet.

L'espace de démonstration porte en base un libellé de travail (« La métropole
de lyon ») : à l'écran, la page affiche « Métropole de Lyon ».

## Vérifier la mise en page par des mesures

La page expose `window.__cartes.montrer(type, slug)` pour forcer une scène. Un
audit (hors dépôt, dans la session de développement) parcourt cinq formats
d'écran et cinq scènes, et mesure : débordements, chevauchements entre le
texte, les tirages, la recherche, le ruban et l'en-tête, hors-écran, taille des
titres et du texte courant, hauteur des boutons, chargement des images,
alignement du point de Paris sur l'image de la France. C'est ce qui a réglé
les tailles ci-dessus, pas des captures d'écran.

## Mesure d'audience

Espace `cartes` (PostHog, voir `docs/analytics.md`) : `cartes_ville_ouverte`
(scène, ruban, recherche ou retour de génération), `cartes_generation_lancee`
(avec la population), `cartes_adresse_laissee`, `cartes_retour_veille`.

## Tests

`tests/unauth.cartes.spec.js` (section 0.38) : rendu serveur, catalogue et
JSON-LD, rotation et veille à l'horloge simulée, couche et neutralisation des
liens, saisie, envoi par e-mail, retour de génération. Les cartes ouvertes en
couche sont remplacées par des coquilles : aucun test ne démarre l'application
carte dans l'iframe. Le retour depuis l'écran de génération est couvert dans
`tests/unauth.demo.spec.js` (section 0.37).

Non testable en E2E : le rendu réel de la carte dans la couche (WebGL), le
plein écran et le Wake Lock (gestes utilisateur et matériel), la fluidité de la
dérive du ciel sur la tablette.

## Désinstallation

1. Supprimer le dossier `cartes/` et `netlify/edge-functions/cartes.js`
2. Retirer l'entrée `[[edge_functions]] path = "/cartes/"` et la règle
   d'en-têtes `/cartes/*` de `netlify.toml`, la ligne `/cartes/` de
   `netlify/functions/sitemap.mjs`
3. Dans `demo/`, retirer le paramètre `retour` (`RETOUR`, `urlDeRetour`,
   `armerFiletSaisie`, le bouton `#btn-retour`), la durée annoncée
   (`dureeEstimee`) si on ne la veut plus, et incrémenter `?v=`
4. Supprimer `tests/unauth.cartes.spec.js`, la section 0.37 de
   `tests/unauth.demo.spec.js`, l'espace `cartes` de
   `tests/unauth.analytics.spec.js` et de `docs/analytics.md`
