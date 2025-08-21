# GrandProjetV2

[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC) [![Leaflet](https://img.shields.io/badge/Leaflet-1.9.x-brightgreen)](#)

**Dernière mise à jour :** 2025-08-21

---

## Sommaire
- [1. Présentation générale](#1-pr%C3%A9sentation-g%C3%A9n%C3%A9rale)
- [2. Arborescence du projet](#2-arborescence-du-projet)
- [3. Flux d’initialisation et logique de chargement](#3-flux-dinitialisation-et-logique-de-chargement)
- [4. Détail des modules](#4-d%C3%A9tail-des-modules)
- [5. Pages statiques et Markdown](#5-pages-statiques-et-markdown)
- [6. Styles CSS](#6-styles-css)
- [7. Dépendances externes](#7-d%C3%A9pendances-externes)
- [8. Lancement et configuration](#8-lancement-et-configuration)
- [9. Scénarios d’interaction utilisateur](#9-sc%C3%A9narios-dinteraction-utilisateur)
- [10. FAQ / Erreurs fréquentes](#10-faq--erreurs-fr%C3%A9quentes)
- [11. Conseils pour la maintenance et l’évolution](#11-conseils-pour-la-maintenance-et-l%C3%A9volution)
- [12. Modèle de données Supabase](#12-mod%C3%A8le-de-donn%C3%A9es-supabase)
- [13. Déploiement](#13-d%C3%A9ploiement)
- [14. Contribuer (CONTRIBUTING)](#14-contribuer-contributing)
- [15. Changelog](#15-changelog)

---

## 1. Présentation générale

GrandProjetV2 est une application web **single-page** écrite en JavaScript ES6 (sans framework), destinée à explorer les projets urbains du Grand Lyon via une carte interactive Leaflet. Elle permet :
- d’afficher des couches GeoJSON dynamiques (transport, vélo, urbanisme, travaux)
- de filtrer ces couches selon des critères multi-niveaux
- de consulter des fiches projets détaillées (Markdown rendu dynamiquement ou pages statiques)
- de stocker la configuration (couches, filtres, pages) dans Supabase

**Tout est modulaire et chaque module JS est exposé sur `window.*` pour faciliter le debug ou l’extension.**

---

## 2. Arborescence du projet

```
grandprojetV2/
├── index.html                  # Entrée unique, charge tous les modules JS dans l’ordre
├── style.css                   # Styles globaux (layout, nav, popups)
├── ficheprojet.css             # Styles dédiés aux pages statiques de fiche projet
├── data.js                     # (Hérité) Placeholder non utilisé pour le contenu; données chargées dynamiquement
├── main.js                     # Orchestration, bootstrap général
├── README.md                   # Documentation complète du projet
├── modules/
│   ├── supabaseservice.js      # Accès/fetch Supabase (toutes les tables)
│   ├── datamodule.js           # Cache réseau, gestion GeoJSON, parsing
│   ├── mapmodule.js            # Initialisation Leaflet, gestion des couches
│   ├── filtermodule.js         # Stockage des critères de filtre actifs
│   ├── uimodule.js             # UI filtres, popups, menu basemap, panneau détail
│   ├── navigationmodule.js     # Navigation projets, rendu des listes, panneau détail
│   ├── eventbindings.js        # Liaison boutons & filtres → logique métier
│   └── ficheprojet.js          # (si utilisé, logique fiche projet statique)
├── pages/
│   ├── velo/
│   │   ├── ligne-1.md
│   │   ├── ligne-2.md
│   │   ├── ...
│   │   ├── voie-lyonnaise-1.html
│   │   ├── voie-lyonnaise-2.html
│   │   └── ...
│   └── mobilite/
│       ├── bhns.html
│       ├── t8.html
│       ├── ...
├── img/
│   ├── logo.svg
│   ├── transport.svg
│   ├── velo.svg
│   ├── urbanisme.svg
│   ├── travaux.svg
│   ├── architecture.svg
│   └── mobilite.svg
└── vendor/
    └── leaflet/
        ├── leaflet.js
        └── leaflet.css
```

> **Remarque** :
> - Le dossier `pages/` contient plusieurs sous-dossiers thématiques (`velo/`, `mobilite/`, etc.), chacun avec des fichiers `.md` (Markdown) et `.html` (pages statiques).
> - Le dossier `img/` regroupe tous les logos/icônes utilisés dans l’UI.
> - Le dossier `vendor/leaflet/` contient la librairie Leaflet locale (JS et CSS).
> - L’ordre de chargement des scripts dans `index.html` est crucial (dépendances explicites, pas de bundler).


---

## 3. Flux d’initialisation et logique de chargement

1. **Chargement initial** :
   - `main.js` attend `DOMContentLoaded`, puis lance `initApp()`.
   - `supabaseService.initAllData()` charge en parallèle toutes les tables nécessaires (couches, filtres, pages, etc.) depuis Supabase et expose les résultats sur `window`.
   - Les menus basemap sont générés (`UIModule.updateBasemaps()`), la carte Leaflet est initialisée (`MapModule.initBaseLayer()`), et les couches par défaut sont chargées (`DataModule.loadLayer()`).
   - Les filtres sont générés dynamiquement à partir de la config Supabase (`populateFilters()`, `updateFilterUI()`).
   - Les événements UI sont attachés (`EventBindings.bindFilterControls()`, `UIModule.init()`).

2. **Navigation dynamique** :
   - L’utilisateur n’a jamais besoin de recharger la page ; tout changement de catégorie, filtre ou fond de carte se fait dynamiquement via les modules JS.

---

## 4. Détail des modules

### 4.1. supabaseservice.js
- **Rôle** : centralise tous les accès à Supabase (via CDN, pas de clé admin en prod !)
- **Tables attendues** : `layers`, `metro_colors`, `mobility_data`, `project_pages`, `urbanisme_projects`, `filter_categories`/`filter_items` (via `fetchFiltersConfig()`), `project_filter_mapping`, `project_colors`, `layer_info_config` (+ tables liées), `basemaps`
- **Fonctions principales** :
  - `fetchLayersConfig()`, `fetchMetroColors()`, etc. → récupèrent chaque table (la table `layers` est exposée en `window.layersConfig` via `initAllData()`)
  - `initAllData()` → lance tous les fetchers et expose les résultats sur `window`
- **Exemple d’appel** :
  ```js
  const { layersConfig, basemaps } = await supabaseService.initAllData();
  ```

### 4.2. data.js
- Actuellement non utilisé pour stocker le contenu. Conservé pour compatibilité.
- Optionnel: vous pouvez définir `window.zoomConfig` pour contrôler la visibilité des marqueurs selon le zoom. `MapModule.updateMarkerVisibility()` lira cette config si présente.

### 4.3. datamodule.js
- **Cache réseau** : `simpleCache` (objet clé/valeur) et `CacheManager` (limite la taille du cache)
- **initConfig({urlMap, styleMap, defaultLayers})** : configure les URLs et styles de chaque couche
- **fetchLayerData(layer)** : récupère (et met en cache) le GeoJSON d’une couche
- **loadLayer(layer)** : charge une couche sur la carte (supprime l’ancienne si besoin)
- **createGeoJsonLayer(layer, data)** : applique le style, les tooltips, les événements
- **getProjectDetails(name, category)** : renvoie l’objet projet (description, propriétés)

### 4.4. mapmodule.js
- Initialise la carte Leaflet (`L.map`), gère les fonds et overlays
- **initBaseLayer()**, **setBaseLayer(tileLayer)** : changent le fond de carte
- **addLayer(name, layer)**, **removeLayer(name)** : ajout/suppression de couches
- **updateMarkerVisibility()** : applique le zoomConfig

### 4.5. FilterModule.js
- Stocke les critères actifs dans `filters`
- API : `set(layer, criteria)`, `get(layer)`, `reset(layer)`, `resetAll()`

### 4.6. UIModule.js
- Gère l’ouverture/fermeture des popups filtres et basemap, la gestion des sous-filtres dynamiques (création d’inputs selon les propriétés des features), l’application des filtres, la mise à jour des tags actifs, l’initialisation du menu basemap, l’affichage du panneau détail (en déléguant à NavigationModule)
- **Accessibilité** : gestion du focus et des événements clavier (à compléter si besoin)

### 4.7. EventBindings.js
- **handleNavigation(menu, layersToDisplay)** :
  - masque le panneau détail, réinitialise tous les filtres, ajuste la navigation
  - retire/charge les couches via MapModule/DataModule
  - lance le rendu de la liste de projets via NavigationModule
- **bindFilterControls()** :
  - gère les clics sur `.filter-item` (ajout/suppression d’un **critère** de filtre, pas la couche elle-même)
  - gère les clics sur `.settings-btn` (ouverture des sous-filtres)

### 4.8. navigationmodule.js
- **showProjectDetail(name, category, event)** :
  1. empêche la propagation, masque les sous-menus
  2. récupère le contenu via **fetch()** d’un fichier Markdown sous `pages/<cat>/*.md` pour toutes les catégories (Vélo, Mobilité/Transport, Urbanisme)
  3. extrait le front-matter YAML (couverture, itinéraire `from/to`, **line**, **trafic**, description) et **n'affiche plus** le corps Markdown, pour garder le panneau synthétique
  4. cherche `window.projectPages[name]` (chargé via Supabase) pour afficher un bouton « Voir la fiche complète »; fallback: vérifie l’existence d’une page `.html` correspondante
  5. applique des animations (zoom, surbrillance)
- **renderTransportProjects()**, **renderVeloProjects()**, etc. : génèrent dynamiquement les listes de projets selon la catégorie
- **zoomOutOnLoadedLayers()** : ajuste la vue pour englober toutes les couches visibles


### 4.9. MarkdownUtils & FicheProjet Pipeline
- **MarkdownUtils.preprocessCustomMarkdown()** : normalise les retours à la ligne, corrige les titres et convertit les directives `::banner{type=*}` en balises HTML.
- **ficheprojet.js** (pages complètes) : lit un fichier `.md`, extrait le front-matter YAML, affiche la couverture, les chips, la description **puis** le corps Markdown complet pour une fiche exhaustive.
- **NavigationModule.showProjectDetail()** : ré-utilise le rendu Markdown mais **n’injecte que** la couverture, les chips et la description ; le corps Markdown est volontairement omis pour conserver une vue concise.
- Les classes de bannière générées (`banner-info`, `banner-wip`, `banner-postponed`, `banner-modified`, `banner-unsecured`, etc.) sont stylées dans `ficheprojet.css` pour assurer une apparence homogène.

### 4.10. searchmodule.js
- **Rôle** : recherche d’adresses via l’API Adresse (data.gouv), overlay de résultats, ajout d’un marqueur et recentrage de la carte.
- **API** : `SearchModule.init(map)`

### 4.11. geolocation.js
- **Rôle** : bouton « Centrer sur ma position », récupère la position via `navigator.geolocation`, affiche un marqueur/cercle de précision et recadre la carte.
- **API** : `GeolocationModule.init(map)`, `handleLocationButtonClick()`

---

## 5. Fonctionnement des fiches projets (Project Sheets)

Les "fiches projets" sont les pages de détail qui présentent chaque projet urbain (transport, vélo, urbanisme...) de façon riche et interactive. Il existe deux types de fiches : **fiches dynamiques (Markdown)** et **fiches statiques (HTML)**.

### 5.1 Fiches dynamiques (Markdown)
- **Stockage** : Les contenus sont stockés sous forme de fichiers `.md` dans `pages/velo/`, `pages/mobilite/` et `pages/urbanisme/`.
- **Affichage** : Lorsqu’un utilisateur clique sur un projet, `NavigationModule.showProjectDetail()` :
  1. calcule le chemin du fichier Markdown (`pages/<cat>/<slug>.md`)
  2. lit le fichier avec `fetch()` puis passe par `MarkdownUtils.renderMarkdown()`
  3. extrait le front‑matter (couverture, itinéraire, trafic, description) et insère ces éléments dans le panneau détail; le corps Markdown complet n’est pas affiché dans cette vue.
- **Structure recommandée** du Markdown :
  - Un titre (`# ...`)
  - Une introduction
  - Des sections avec titres (`## ...`)
  - Listes, tableaux, images (liens relatifs possibles vers `/img/`)
- **Avantages** : Facile à éditer, versionnable, rendu dynamique, supporte la mise à jour sans rechargement de page.

### 5.2 Fiches statiques (HTML)
- **Stockage** : Les pages HTML sont placées dans `pages/velo/`, `pages/mobilite/`, etc. (ex : `pages/velo/voie-lyonnaise-5.html`).
- **Association** : Le mapping entre un projet et sa fiche HTML se fait via la table Supabase `project_pages` (chargée par `supabaseservice.js`), puis injectée dans `window.projectPages` :
  ```js
  window.projectPages = {
    "Nom du projet": "/pages/velo/voie-lyonnaise-5.html",
    ...
  }
  ```
- **Affichage** : Quand l’utilisateur consulte le détail d’un projet (voir ci-dessous), un bouton « Voir la fiche complète » apparaît si une page HTML existe ; cliquer dessus ouvre la fiche dans un nouvel onglet.
- **Structure HTML** : Pages autonomes, stylées avec `ficheprojet.css`, peuvent inclure images, tableaux, liens externes, etc.
- **Utilité** : Permet d’afficher des contenus très riches ou spécifiques, ou d’intégrer des fiches produites hors du système.

### 5.3 Logique d’affichage et modules impliqués
- **Affichage panneau détail** :
  1. L’utilisateur clique sur un projet dans la liste (UI ou carte).
  2. `NavigationModule.showProjectDetail(name, category, event)` est appelé.
  3. Ce module :
     - Lit le Markdown depuis `pages/<cat>/*.md` et en extrait les métadonnées et la description.
     - Cherche l’URL HTML dans `window.projectPages` (mapping Supabase) — sinon tente une page `.html` correspondante.
     - Affiche la couverture, les chips itinéraire/trafic ainsi que la description issue du front‑matter (le corps Markdown complet est masqué).
     - Si une fiche HTML existe, affiche un bouton « Voir la fiche complète » (ouvre la page dans un nouvel onglet).
- **Modules impliqués** : `modules/navigationmodule.js`, `modules/datamodule.js`, `modules/uimodule.js`, `modules/supabaseservice.js` (pour le mapping projectPages).

### 5.4 Ajouter ou modifier une fiche projet
- **Pour une fiche dynamique** :
  - Créer/éditer un fichier `.md` dans `pages/velo/`, `pages/mobilite/` ou `pages/urbanisme/`.
  - Respecter le slug attendu par `navigationmodule.js` (ex. vélo: `ligne-<num>.md` ou `pages/velo/<slug>.md`).
  - Renseigner le front‑matter (couverture, itinéraire, trafic, description) en tête de fichier.
- **Pour une fiche statique** :
  - Créer un fichier `.html` dans le bon sous-dossier de `pages/`.
  - Ajouter ou mettre à jour le mapping dans Supabase (`project_pages`), ou dans le mapping local si utilisé.
  - Vérifier que le nom du projet correspond à la clé utilisée dans l’UI.

### 5.5 Résumé visuel du flux

```
[UI] --clic--> NavigationModule.showProjectDetail
         |
         |-- fetch pages/<cat>/*.md ---------------------> MarkdownUtils.renderMarkdown --> attrs --> projectDetailPanel
         |
         |-- window.projectPages ? --> affiche bouton fiche HTML (nouvel onglet)
         |
         +--> projectDetailPanel visible (DOM injecté par NavigationModule)
```

### 5.6 Bonnes pratiques
- Garder les titres de projets cohérents entre Supabase et les noms/chemins des fichiers Markdown/HTML.
- Préférer le Markdown pour les fiches simples ou fréquemment modifiées.
- Utiliser les fiches HTML pour les contenus très riches ou nécessitant une mise en page avancée.
- Toujours tester l’ouverture des fiches sur différents navigateurs pour vérifier le rendu.

---

## 6. Styles CSS

- `style.css` : mise en page générale, navigation, carte, popups, responsive (mobile/tablette)
- `ficheprojet.css` : styles spécifiques aux fiches projet statiques
- `vendor/leaflet/leaflet.css` : styles Leaflet natifs
- Les classes CSS sont nommées de façon explicite pour faciliter la surcharge

---

## 7. Dépendances externes

- **Leaflet** (local dans `vendor/leaflet/`, version recommandée : 1.9.x)
- **Supabase-js** (CDN, version 2.x)
- **Marked** (CDN, version 4.x)
- **Font Awesome** (CDN, version 5.x+)

> Pour mettre à jour une dépendance, remplacer le lien CDN dans `index.html` ou mettre à jour le dossier `vendor/`.

---

## 8. Lancement et configuration

1. Lancer l’application en local (recommandé — live-server via npm) :

   ```powershell
   # 1) Installer les dépendances
   npm install

   # 2) Démarrer le serveur de dev (port 3000)
   npm run start
   ```
   Puis ouvrir `http://127.0.0.1:3000` (ou l’URL affichée par live-server).

   Étapes optionnelles (SEO/Build utilitaires) :
   ```powershell
   # Générer les métadonnées SEO statiques (si Python dispo)
   npm run build:seo   # ou
   npm run build:seo:py

   # Build placeholder (aucun bundling requis)
   npm run build
   ```

   Alternative Python (optionnelle) :
   ```powershell
   python -m http.server 8000
   ```
   Puis ouvrir `http://localhost:8000`.

2. Supabase : `modules/supabaseservice.js` initialise le client à partir d’une URL et d’une clé publique (rôle `anon`). En production, préférez charger ces valeurs via variables d’environnement/injection de build et n’exposez jamais de clé admin.
3. Profiter de l’application : navigation, filtres, fonds de carte, fiches projet.

---

## 9. Scénarios d’interaction utilisateur

### 9.1 Chargement initial de la page
- L’utilisateur arrive sur `index.html` :
  1. `main.js` attend le DOM, puis lance tout le chargement via `supabaseService.initAllData()`
  2. Les couches par défaut sont chargées, les filtres générés, la navigation initialisée
  3. La catégorie “Transport” (ou autre par défaut) s’affiche avec la liste de projets

### 9.2 Navigation par catégorie
- Clic sur un onglet de catégorie (ex : “Vélo”) :
  1. `EventBindings.handleNavigation('velo', [...])` est appelé
  2. Les filtres sont réinitialisés, les couches précédentes retirées, les nouvelles chargées
  3. `NavigationModule.renderVeloProjects()` met à jour la liste de projets
  4. La carte s’ajuste automatiquement pour englober les couches visibles

### 9.3 Activation/désactivation d’un filtre
- Clic sur une case à cocher `.filter-item` :
  1. `FilterModule.set(layer, criteria)` ou `FilterModule.reset(layer)` est appelé
  2. `DataModule.loadLayer(layer)` recharge la couche avec les critères actifs
  3. `UIModule.updateFilterCount(layer)` met à jour le badge

### 9.4 Sélection d’un fond de carte
- Ouvrir le menu basemap, puis cliquer sur un fond :
  1. `MapModule.setBaseLayer(tileUrl)` change la tuile active
  2. Le menu se referme automatiquement
  3. `window.currentBasemap` est mis à jour

### 9.5 Affichage du détail d’un projet
- Clic sur un projet dans la liste :
  1. `NavigationModule.showProjectDetail(name, category, event)` est appelé
  2. Le Markdown du fichier `pages/<cat>/<slug>.md` est lu, puis ses métadonnées (couverture, itinéraire, etc.) sont affichées dans le panneau
  3. Si une fiche statique existe, le bouton “Voir la fiche complète” apparaît
  4. La carte zoome sur le projet, affiche une surbrillance

### 9.6 Affichage d’une fiche projet externe
- Clic sur “Voir la fiche complète” :
  1. Ouvre la page HTML statique correspondante dans un nouvel onglet
  2. L’utilisateur peut revenir à la carte via l’onglet précédent

### 9.7 Clic sur logo
- Clic sur `#logo` :
  1. Déclenche `location.reload()`
  2. Réinitialise l’état de tous les modules

### 9.8 Sous-filtres dynamiques
- Clic sur le bouton “paramètres” d’un filtre :
  1. Ouvre un sous-menu généré dynamiquement (`UIModule.toggleSubFilters()`)
  2. Les critères sélectionnés sont appliqués via `FilterModule.set()`
  3. La couche est rechargée instantanément

### 9.9 Gestion des erreurs
- Si une couche ne charge pas : un message d’erreur s’affiche dans la console
- Si une clé Supabase est invalide : l’application reste partiellement fonctionnelle mais affiche des warnings

---

## 10. FAQ / Erreurs fréquentes

**Q : Je ne vois aucune donnée sur la carte ?**
- Vérifier la connexion internet (CDN, Supabase)
- Vérifier la configuration des URLs dans Supabase et dans `modules/supabaseservice.js`

**Q : Les filtres ne fonctionnent pas ?**
- Vérifier la structure des tables `filter_categories` et `filter_items` dans Supabase
- S’assurer que les propriétés des GeoJSON sont cohérentes

**Q : Les fiches projet ne s’affichent pas ?**
- Vérifier qu’un fichier Markdown existe au bon chemin (`pages/<cat>/<slug>.md`) et/ou qu’un mapping existe dans `window.projectPages` (provenant de la table `project_pages`)

---

## 11. Conseils pour la maintenance et l’évolution

- Pour ajouter une nouvelle catégorie ou couche :
  - Configurer les tables Supabase concernées (`layers`, `filter_categories`/`filter_items`, etc.)
  - Ajouter les styles dans `style.css` si besoin
  - Générer les pages Markdown/HTML associées dans `pages/`
- Pour modifier un module :
  - Tous les modules sont autonomes, mais communiquent via le global `window.*`
  - Utiliser la console pour appeler les fonctions et debugger
- Pour internationaliser l’app :
  - Prévoir un mapping des labels dans Supabase ou un module JS dédié
- Pour renforcer la sécurité :
  - Ne jamais exposer de clé Supabase admin en production
  - Utiliser des règles RLS sur les tables publiques
- Pour améliorer l’accessibilité :
  - Ajouter des attributs ARIA, gérer le focus clavier, tester avec un lecteur d’écran

---

## 12. Modèle de données Supabase

Cette section documente la structure et un aperçu du contenu de la base Supabase utilisée par l’application.

- __Projet__
  - Nom: « solal’s Project »
  - ID: `wqqsuybmyqemhojsamgq`
  - Région: `eu-west-3`
  - Postgres: 15

- __Schémas principaux__
  - `public` (tables fonctionnelles de l’app)
  - `auth`, `storage`, `realtime`, `vault`, `pgsodium` (gérés par Supabase)

- __Tables du schéma public (colonnes clés)__
  - `basemaps` (PK: `name`)
    - `name` text, `url` text, `attribution` text (nullable), `label` text
  - `filter_categories` (PK: `id` int4)
    - `id` seq, `category` text
  - `filter_items` (PK: `id` text)
    - `id` text, `category_id` int4 → FK `filter_categories.id`, `layer` text, `icon` text, `label` text
  - `image_metadata` (PK: `id` bigint identity)
    - `id`, `upload_timestamp` timestamptz default now(), `latitude` float8, `longitude` float8, `image_path` text
  - `layer_display_fields` (PK: `id` int4)
    - `id` seq, `layer` text → FK `layer_info_config.layer`, `field_name` text, `field_order` int4
  - `layer_info_config` (PK: `layer` text)
    - `layer` text (référence centrale)
  - `layer_rename_fields` (PK: `id` int4)
    - `id` seq, `layer` text → FK `layer_info_config.layer`, `original_name` text, `display_name` text
  - `layers` (PK: `id` int4)
    - `id` seq, `name` text unique, `url` text, `style` jsonb, `is_default` bool default false
  - `metro_colors` (PK: `ligne` text)
    - `ligne` text, `color` text
  - `mobility_data` (PK: `id` bigint identity always)
    - `id`, `category` text, `name` text, `year` text?, `status` text?
  - `project_colors` (PK: `name` text)
    - `name` text, `background` text, `icon` text
  - `project_filter_mapping` (PK: `project_name` text)
    - `project_name` text, `layer` text, `key` text, `value` text
  - `project_pages` (PK: `id` bigint identity always)
    - `id`, `project_name` text unique, `page_url` text
  - `urbanisme_projects` (PK: `id` bigint identity always)
    - `id`, `name` text, `city` text
  - `consultation_dossiers` (PK: `id` bigint identity always)
    - `id`, `project_name` text, `title` text, `pdf_url` text
  - `grandlyon_project_links` (PK: `id` bigint identity always)
    - `id`, `project_slug` text unique, `project_name` text, `url` text
  - `sytral_project_links` (PK: `id` bigint identity always)
    - `id`, `project_name` text, `url` text

- __Relations utiles__
  - `filter_items.category_id` → `filter_categories.id`
  - `layer_display_fields.layer` → `layer_info_config.layer`
  - `layer_rename_fields.layer` → `layer_info_config.layer`

- __Aperçus de contenu (extraits)__
  - `basemaps` (6)
    - CartoDB Positron, OpenStreetMap, Esri World Imagery, IGN 1950-1965/1965-1980, ÖPNVKarte
  - `filter_categories` (3)
    - Mobilité, Vélo, Urbanisme
  - `filter_items` (ex.)
    - bus-check → layer `bus`; metro-check → `metroFuniculaire`; tram-check → `tramway`; travaux-check → `travaux`; urbanisme → `urbanisme`
  - `layers` (ex.)
    - `tramway` (default), `metroFuniculaire` (default), `reseauProjeteSitePropre` (default), `voielyonnaise` (default), `urbanisme` (default), `travaux`, `planVelo`, `amenagementCyclable`, `emplacementReserve`, `bus`
  - `mobility_data` (ex.)
    - Tram: T6 nord, T10, T9, T8, TEOL; Bus: BHNS; Vélo: Voies Lyonnaises 1–4
  - `project_pages` (ex.)
    - T6 nord → `pages/mobilite/t6-nord.html`, T10 → `pages/mobilite/t10.html`, …
  - `project_filter_mapping` (ex.)
    - T6 nord → (`reseauProjeteSitePropre`, Name=T6 nord), Voie Lyonnaise 1 → (`voielyonnaise`, line=1)
  - `image_metadata` (≈113)
    - Points géolocalisés avec `image_path` sous `uploads/` et horodatage

Notes:
- Les schémas `auth`, `storage`, `realtime`, `vault`, `pgsodium` contiennent des tables gérées par Supabase (potentiellement sensibles). Exporter ces contenus uniquement si nécessaire.
- Les fiches Urbanisme en Markdown référencent une image de couverture via front‑matter; stocker les fichiers sous `/img/cover/urbanisme/` et utiliser un chemin relatif correct dans chaque `.md`.

## 13. Déploiement

### 13.1 Windsurf (statique)
- Le projet est un site statique. Le fichier `windsurf_deployment.yaml` indique :
  - `framework: html`
  - `publish_directory: "."`
  - `build_command: ""` (aucun build requis par défaut)
- Déployer via l’action de déploiement Windsurf. Assurez‑vous que `index.html` est à la racine et que les chemins relatifs pointent correctement vers `pages/`, `modules/`, `img/`, `vendor/`.

### 13.2 Netlify (alternative)
- Créer un nouveau site sur Netlify et pointer sur ce dossier (ou connecter le dépôt Git).
- Paramètres de build :
  - Build command : vide (ou `npm run build` si vous introduisez un process de build)
  - Publish directory : `.`
- Variables d’environnement (optionnel) :
  - Si vous externalisez `SUPABASE_URL` et `SUPABASE_ANON_KEY`, injectez‑les et chargez‑les dans `modules/supabaseservice.js` (via injection au build ou un petit script qui lit `import.meta.env`/`window.__ENV__`). N’exposez jamais de clé admin.

### 13.3 Autres hébergeurs
- GitHub Pages, Vercel (static export), S3/CloudFront… fonctionnent tant que le site est servi tel quel.
- Vérifier les chemins relatifs et l’accès aux fichiers Markdown sous `pages/`.

---

## 14. Contribuer (CONTRIBUTING)

- **Style de code**
  - JavaScript ES6 sans bundler. Modules attachés à `window.*` (ex: `window.UIModule`).
  - Respecter la casse des fichiers (`modules/supabaseservice.js`, pas `SupabaseService.js`).
  - Imports/chargements au début des fichiers. Pas d’imports au milieu du code.
  - Logs: limiter `console.log` au debug utile, éviter le bruit en production.
- **Workflow Git**
  - Créer une branche par fonctionnalité (`feat/…`, `fix/…`).
  - Petits commits; messages clairs (Conventional Commits recommandé mais non obligatoire).
  - Ouvrir une PR avec description courte, captures si UI, et étapes de test.
- **Tests manuels**
  - `npm run start` puis vérifier: chargement basemaps, filtres, couches, panneau détail Markdown + lien fiche HTML.
  - Vérifier l’absence d’erreurs JS dans la console.
- **Issues**
  - Décrire le contexte, étapes de reproduction, résultat attendu, captures, logs.

## 15. Changelog

Suivi au format inspiré de « Keep a Changelog ».

### [Unreleased]
- Documentation: README refondu (modules, Supabase, Quickstart, Déploiement Windsurf/Netlify, FAQ, maintenance).

---
