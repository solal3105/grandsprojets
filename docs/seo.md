# Référencement

Ce document décrit ce que les moteurs de recherche voient du site, où chaque
page indexable est produite, et les règles à respecter pour ne pas casser le
référencement. Il s'appuie sur l'audit du 6 septembre 2026 (Search Console,
base de données, pages servies en production).

## Les pages indexables et qui les produit

| Adresse | Produite par | Contenu servi sans JavaScript |
|---|---|---|
| `/` | `index.html` statique | titre, description, données structurées, h1 masqué, liens vers les pages de projets. La carte elle-même exige JavaScript. |
| `/home/` et ses pages | pré-rendu Vite (`home-src/scripts/prerender.mjs`) puis edge `home-seo` | page complète (HTML rendu), titres et descriptions réécrits par l'edge, JSON-LD (WebPage ou Article, BreadcrumbList, Organization) |
| `/home/ressources/{slug}` | idem, métas lues dans `home/ressources/manifest.json` | article complet |
| `/ville/` | edge `ville-hub` (index) | toutes les villes qui ont une fiche, avec leur nombre de projets, en deux groupes : espaces des collectivités, cartes d'essai |
| `/ville/{ville}` | edge `ville-hub` | liste complète des projets de la ville (200 au plus), catégories, JSON-LD CollectionPage + ItemList |
| `/fiche/{ville}/{catégorie}/{slug}` | edge `fiche-ssr` | fil d'Ariane, titre, article markdown rendu en HTML, description, image, projets liés du même espace, lien vers le hub |
| `/cartes/` | edge `cartes` | la liste des communes qui ont une carte d'essai |
| `/demo/` | statique | l'écran de démonstration |
| `/sitemap.xml` | fonction `sitemap` | toutes les adresses ci-dessus |
| `/llms.txt` | fonction `llms-txt` | le même inventaire, en markdown, pour les assistants IA |

Les pages qui ne doivent pas être indexées le disent elles-mêmes : `/home2/`,
`/login/`, `/carte-postale/`, les guides imprimables de l'aide et `/home/helios`
portent un `noindex`. `/fiche/` sans projet, une fiche inconnue et une ville
sans projet sont servies en 200 avec l'en-tête `X-Robots-Tag: noindex` (le
client doit s'exécuter pour afficher l'écran d'erreur).

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

- Carte (`/`) : « Carte des grands projets et travaux de la Métropole de Lyon | Open Projets ». La racine est l'espace de démonstration ; les autres espaces ont chacun leur page `/ville/{ville}`.
- Fiche : `{nom du projet} - {catégorie} | {nom de la structure}`. La catégorie est le libellé de la base avec une majuscule initiale ; il n'existe pas de colonne de libellé séparée.
- Hub ville : `{nom de la structure} : les grands projets urbains à suivre | Open Projets`. Le nom vient de `city_branding.brand_name` : un libellé de travail en base (« Carte de france des projets ») s'affiche tel quel dans les résultats de recherche.
- Site vitrine : titres et descriptions définis deux fois, dans `home-src/src/router/index.js` (rendu client et pré-rendu) et dans `netlify/edge-functions/home-seo.js` (réécriture à la volée). Les deux doivent rester identiques.

## Maillage interne

- La carte (`/`) n'a aucun lien HTML : une navigation masquée (`visually-hidden`) et le bloc `noscript` relient `/ville/metropole-lyon`, `/ville/`, `/cartes/` et `/home/`.
- Le pied de page du site vitrine porte une colonne « Explorer » vers la carte de la Métropole de Lyon, `/ville/`, `/cartes/` et `/demo/`.
- Chaque fiche relie son hub, les projets de la même catégorie dans le même espace, et `/home/`.
- `/ville/` relie tous les hubs ; chaque hub relie toutes ses fiches.

## Ce que dit Search Console (période du 8 juin au 5 septembre 2026)

- Le site reçoit l'essentiel de ses impressions sur la carte (`/`) pour des requêtes lyonnaises : « lyon projet », « carte travaux lyon », « grands projets », « projet lyon ». Position moyenne entre 4 et 13, taux de clic faible.
- Le site vitrine (`/home/`) n'apparaît presque que sur la marque et sur « panneau de chantier qr code » (guide en position 10).
- Les fiches des espaces `fdlm`, `france`, `metropole-lyon`, `vannes` et `besancon` se placent entre les positions 5 et 10 sur le nom du projet.
- Les anciennes adresses `/fiche/?cat=…` cumulaient encore plus de 400 impressions et menaient à une page d'erreur.

## À faire côté compte Google

- Ajouter `https://openprojets.com/` comme propriété « préfixe d'URL » dans Search Console, en plus de la propriété de domaine : la lecture des sitemaps par l'API l'exige, et c'est là que l'on soumet le sitemap après un déploiement.
- Après déploiement, demander l'inspection de `/sitemap.xml`, `/ville/` et de deux ou trois anciennes adresses de fiches pour accélérer la prise en compte des redirections.
