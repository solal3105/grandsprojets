# Référencement

Ce document décrit ce que les moteurs de recherche voient du site, où chaque
page indexable est produite, et les règles à respecter pour ne pas casser le
référencement. Il s'appuie sur l'audit du 6 septembre 2026 (Search Console,
base de données, pages servies en production).

## Les pages indexables et qui les produit

| Adresse | Produite par | Contenu servi sans JavaScript |
|---|---|---|
| `/` et les pages du site vitrine (`/carte`, `/travaux`, `/participer`, `/chantiers`, `/diagnostic`, `/tarification`, `/a-propos`, `/aide`, `/confidentialite`, `/alternative-*`, `/ressources`) | pré-rendu Vite (`home-src/scripts/prerender.mjs`, fichiers dans `/home/`, servis par `_redirects`) puis edge `home-seo` | page complète (HTML rendu), titre, description et canonical posés par le routeur et figés au prérendu, JSON-LD ajouté par l'edge (WebPage ou Article, BreadcrumbList, Organization) |
| `/ressources/{slug}` | idem, métas lues dans `home/ressources/manifest.json` | guide complet |
| `/ville/{ville}/carte`, `/ville/{ville}/travaux`, `/ville/{ville}/participer` | `index.html` statique (la carte) puis edge `carte-seo` | titre, description, canonical, robots (`city_branding.indexable`) et données structurées par ville et par module ; h1 masqué. La carte elle-même exige JavaScript. Ville inconnue : page « cette carte n'existe pas » en `noindex` (servie en 200, un 404 d'edge function est repris par les règles de `_redirects`) ; module non activé : 301 vers la carte. |
| `/ville/` | edge `ville-hub` (index) | toutes les villes qui ont une fiche, avec leur nombre de projets, en deux groupes : espaces des collectivités, cartes d'essai |
| `/ville/{ville}` | edge `ville-hub` | liste complète des projets de la ville (200 au plus), catégories, JSON-LD CollectionPage + ItemList |
| `/fiche/{ville}/{catégorie}/{slug}` | edge `fiche-ssr` | fil d'Ariane, titre, article markdown rendu en HTML, description, image, projets liés du même espace, lien vers le hub |
| `/cartes/` | edge `cartes` | la liste des communes qui ont une carte d'essai |
| `/demo/` | statique | l'écran de démonstration |
| `/sitemap.xml` | fonction `sitemap` | toutes les adresses ci-dessus |
| `/llms.txt` | fonction `llms-txt` | le même inventaire, en markdown, pour les assistants IA |

Un espace entier peut être retiré des moteurs sans être fermé :
`city_branding.indexable = false` (migration du 8 septembre 2026). Le plan du
site et `llms.txt` l'ignorent (`fetchNoindexVilles` dans `projects-index.mjs`),
`fiche-ssr` et `ville-hub` servent ses fiches et sa page ville en `noindex,
follow`, et l'index `/ville/` ne le relie plus. La carte et les liens partagés
continuent de fonctionner. Premier espace concerné : le hub national `france`
(974 fiches importées en avril 2026, sans commune derrière), dont les fiches
courtes étaient explorées puis écartées par Google et diluaient le budget
d'exploration des espaces des collectivités. Depuis le 14 septembre 2026, les
espaces des collectivités sont tous retirés sauf `metropole-lyon`, ainsi que
l'espace de test `test-e2e`.

Le réglage se fait depuis l'admin, page « Référencement »
(`/admin/referencement/`, `admin/sections/referencement.js`), réservée aux
super administrateurs (profil admin avec `global`). La base garde le réglage
elle-même, quel que soit le chemin (migration `20260914020000`) :

- `is_global_admin()` exprime le rôle une seule fois ;
- le trigger `city_indexing_guard` refuse tout changement de
  `city_branding.indexable` venant d'un utilisateur qui n'est pas super
  administrateur (les écritures sans utilisateur, clé de service ou SQL,
  restent libres) ;
- le trigger `city_indexing_log_change` consigne chaque changement dans
  `city_indexing_log` (espace, nouvelle valeur, date, auteur et son adresse
  figée), table lisible par les seuls super administrateurs et jamais écrite
  depuis le client ; le journal a été amorcé avec les retraits antérieurs ;
- la vue `city_indexing_overview` (`security_invoker`) sert l'écran : un
  espace par ligne, son réglage, le nombre de fiches qui seraient proposées
  (mêmes critères que l'inventaire du plan du site, doublons comptés une
  fois) et son dernier changement ;
- la règle « tout admin peut modifier toute ville » a disparu : un
  administrateur ne modifie que les villes de son profil.

Le changement n'est pas instantané côté moteurs : le plan du site est en
cache une heure, les pages cinq minutes, puis Google retire ou ajoute les
pages à son rythme (jours à semaines). L'écran le dit tel quel.

Les pages qui ne doivent pas être indexées le disent elles-mêmes :
`/login/`, `/carte-postale/`, les guides imprimables de l'aide
(`/aide/guide-*`), le document d'estimation (`/tarification/estimation`) et la
page des clients Hélios (`/helios`, absente du menu et du plan du site)
portent un `noindex` (balise posée par le routeur, en-tête `X-Robots-Tag`
posé par `_headers`). `/fiche/` sans projet, une fiche inconnue et une ville
sans projet sont servies en 200 avec l'en-tête `X-Robots-Tag: noindex` (le
client doit s'exécuter pour afficher l'écran d'erreur).

## Anciennes adresses du site et de la carte

Le site vitrine a vécu sous `/home/` jusqu'au 14 septembre 2026, et sa refonte
sous `/home2/` (hors index, sauf la tarification). La carte d'une collectivité
vivait à la racine, sous `/?city={ville}`, ou en un seul segment (`/besancon`,
`/default` pour la démonstration). Toutes ces adresses répondent par une
redirection permanente : `/home/*` et `/home2/*` vers la même page sans
préfixe (`_redirects`, règles forcées, les images des courriels déjà envoyés
comprises), `/?city=` vers `/ville/{ville}/{module}` en conservant les
paramètres de projet (edge `carte-legacy`), les espaces en un seul segment
vers leur carte (liste dans `_redirects`).

## Un seul inventaire pour le sitemap et le llms.txt

`netlify/functions/lib/projects-index.mjs` est la seule source de la liste des
fiches référençables. Une fiche y figure si elle est approuvée, si elle a une
adresse complète (ville, catégorie, slug), un contenu (article ou description),
et si elle n'est pas une entrée de la suite de tests. Le sitemap et le llms.txt
doivent lister exactement les mêmes fiches : le test `0.66.6` le vérifie.

La base est lue page par page. PostgREST plafonne chaque réponse à 1 000
lignes sans le signaler ; avec un seul appel trié par date décroissante, le
premier millier était entièrement composé de cartes d'essai, et le sitemap de
production ne contenait plus aucune fiche des collectivités réelles. Toute
lecture complète d'une table passe par `fetchAllRows` (fonctions Node dans
`projects-index.mjs`, edge dans `_lib/seo.js`).

Le sitemap ne porte pas de `lastmod` sur les pages statiques : Google ignore
les dates qu'il constate fausses, puis toutes celles du site. Les fiches
portent leur date de création, les villes la date de leur fiche la plus
récente, les guides leur date de mise à jour.

## Doublons

Le hub national `france` contient plusieurs centaines de projets saisis deux
fois, avec un suffixe numérique de slug (`bains-dunkerquois` et
`bains-dunkerquois-1321`). La règle est la même partout : dans un groupe (même
ville, même nom, même catégorie), la page la plus ancienne est la page de
référence. Les autres restent servies et indexables, mais portent une balise
canonical vers elle, et seule la page de référence est listée dans le sitemap et
le llms.txt. Le nettoyage des doublons en base reste souhaitable, il n'est pas
nécessaire au référencement.

## Anciennes adresses de fiches

Le format `/fiche/?cat={catégorie}&project={nom}&city={ville}` est encore
présent dans l'index de Google et dans des liens partagés. L'edge `fiche-ssr`
retrouve le projet par son nom (la ville demandée d'abord, puis la catégorie,
puis le plus ancien) et répond par une redirection 301 vers l'adresse
canonique. Sans correspondance, la page est servie en `noindex`.

## Titres

- Carte (`/ville/{ville}/carte`) : `{nom de la structure} : la carte des projets et des travaux | Open Projets`, le suffixe sacrifié si le nom est long ; `/travaux` et `/participer` ont leur propre formule (edge `carte-seo`). Chaque espace a aussi sa page `/ville/{ville}`.
- Accueil du site (`/`) : « La carte des projets de votre collectivité | Open Projets » ; pages de modules : « Carte des projets urbains de votre commune », « Les travaux du quotidien sur une carte »… (routeur et edge `home-seo`).
- Fiche : `{nom du projet} - {catégorie} | {nom de la structure}`. La catégorie est le libellé de la base avec une majuscule initiale ; il n'existe pas de colonne de libellé séparée.
- Hub ville : `{nom de la structure} : les grands projets urbains à suivre | Open Projets`. Le nom vient de `city_branding.brand_name` : un libellé de travail en base (« Carte de france des projets ») s'affiche tel quel dans les résultats de recherche.
- Site vitrine : titres et descriptions définis deux fois, dans `home-src/src/v2/router.js` (rendu client et pré-rendu) et dans `netlify/edge-functions/home-seo.js` (réécriture à la volée). Les deux doivent rester identiques.

## Maillage interne

- La carte (`/ville/{ville}/{module}`) n'a aucun lien HTML : une navigation masquée (`visually-hidden`) et le bloc `noscript` relient `/ville/`, `/cartes/` et l'accueil.
- Le pied de page du site vitrine relie la carte de la Métropole de Lyon, `/demo/`, le centre d'aide, la confidentialité et les trois pages de comparaison.
- Chaque page de ville relie sa carte (et ses travaux quand le module est activé) ; chaque fiche relie son hub, les projets de la même catégorie dans le même espace, et l'accueil.
- `/ville/` relie tous les hubs ; chaque hub relie toutes ses fiches.

## Ce que dit Search Console (période du 8 juin au 5 septembre 2026)

- Le site recevait l'essentiel de ses impressions sur la racine, alors la carte de Lyon, pour des requêtes lyonnaises : « lyon projet », « carte travaux lyon », « grands projets », « projet lyon » (142 clics et 3 003 impressions du 16 juin au 13 septembre 2026). Depuis le 14 septembre, la racine est le site vitrine : ces requêtes doivent être reprises par `/ville/metropole-lyon` et `/ville/metropole-lyon/carte`, à surveiller.
- Le site vitrine (alors `/home/`) n'apparaissait presque que sur la marque et sur « panneau de chantier qr code » (guide en position 10).
- Les fiches des espaces `fdlm`, `france`, `metropole-lyon`, `vannes` et `besancon` se placent entre les positions 5 et 10 sur le nom du projet.
- Les anciennes adresses `/fiche/?cat=…` cumulaient encore plus de 400 impressions et menaient à une page d'erreur.

## À faire côté compte Google

- Ajouter `https://openprojets.com/` comme propriété « préfixe d'URL » dans Search Console, en plus de la propriété de domaine : la lecture des sitemaps par l'API l'exige, et c'est là que l'on soumet le sitemap après un déploiement.
- Après déploiement, demander l'inspection de `/sitemap.xml`, `/ville/` et de deux ou trois anciennes adresses de fiches pour accélérer la prise en compte des redirections.
- Après la bascule du 14 septembre 2026 : demander l'inspection de `/`, de `/ville/metropole-lyon/carte` et de `/home/` (redirigée), et surveiller les requêtes lyonnaises pendant quelques semaines.
