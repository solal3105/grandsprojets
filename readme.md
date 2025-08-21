# GrandProjetV2

**Dernière mise à jour :** 2025-07-15

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
├── data.js                     # Config zoom + descriptions Markdown en dur
├── main.js                     # Orchestration, bootstrap général
├── README.md                   # Documentation complète du projet
├── modules/
│   ├── supabaseService.js      # Accès/fetch Supabase (toutes les tables)
│   ├── DataModule.js           # Cache réseau, gestion GeoJSON, parsing
│   ├── MapModule.js            # Initialisation Leaflet, gestion des couches
│   ├── FilterModule.js         # Stockage des critères de filtre actifs
│   ├── UIModule.js             # UI filtres, popups, menu basemap, panneau détail
│   ├── NavigationModule.js     # Navigation projets, rendu des listes, panneau détail
│   ├── EventBindings.js        # Liaison boutons & filtres → logique métier
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

### 4.1. supabaseService.js
- **Rôle** : centralise tous les accès à Supabase (via CDN, pas de clé dans le code en prod !)
- **Tables attendues** : `layersConfig`, `metroColors`, `mobilityData`, `projectPages`, `urbanismeProjects`, `filtersConfig`, `projectFilterMapping`, `projectColors`, `layerInfoConfig`, `basemaps`
- **Fonctions principales** :
  - `fetchLayersConfig()`, `fetchMetroColors()`, etc. → récupèrent chaque table
  - `initAllData()` → lance tous les fetchers et expose les résultats sur `window`
- **Exemple d’appel** :
  ```js
  const { layersConfig, basemaps } = await supabaseService.initAllData();
  ```

### 4.2. data.js
- Définit `window.zoomConfig` (minZoom par couche, pour masquer les markers si zoom trop faible)
- Définit `window.projectDetails` : dictionnaire `{ "NomProjet": markdown }` utilisé pour le panneau détail

### 4.3. DataModule.js
- **Cache réseau** : `simpleCache` (objet clé/valeur) et `CacheManager` (limite la taille du cache)
- **initConfig({urlMap, styleMap, defaultLayers})** : configure les URLs et styles de chaque couche
- **fetchLayerData(layer)** : récupère (et met en cache) le GeoJSON d’une couche
- **loadLayer(layer)** : charge une couche sur la carte (supprime l’ancienne si besoin)
- **createGeoJsonLayer(layer, data)** : applique le style, les tooltips, les événements
- **getProjectDetails(name, category)** : renvoie l’objet projet (description, propriétés)

### 4.4. MapModule.js
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

### 4.8. NavigationModule.js
- **showProjectDetail(name, category, event)** :
  1. empêche la propagation, masque les sous-menus
  2. récupère le contenu :
     - via **fetch()** d’un fichier Markdown (`/pages/velo/*.md`) pour les projets « Vélo » ;
     - via **DataModule.getProjectDetails()** pour les autres catégories (Transport, Urbanisme, Travaux).
  3. extrait le front-matter YAML (couverture, itinéraire `from/to`, **line**, **trafic**, description) et **n'affiche plus** le corps Markdown, pour garder le panneau synthétique
  4. cherche `window.projectPages[name]` pour afficher un bouton « Voir la fiche complète »
  5. applique des animations (zoom, surbrillance)
- **renderTransportProjects()**, **renderVeloProjects()**, etc. : génèrent dynamiquement les listes de projets selon la catégorie
- **zoomOutOnLoadedLayers()** : ajuste la vue pour englober toutes les couches visibles


### 4.9. MarkdownUtils & FicheProjet Pipeline
- **MarkdownUtils.preprocessCustomMarkdown()** : normalise les retours à la ligne, corrige les titres et convertit les directives `::banner{type=*}` en balises HTML.
- **ficheprojet.js** (pages complètes) : lit un fichier `.md`, extrait le front-matter YAML, affiche la couverture, les chips, la description **puis** le corps Markdown complet pour une fiche exhaustive.
- **NavigationModule.showProjectDetail()** : ré-utilise le rendu Markdown mais **n’injecte que** la couverture, les chips et la description ; le corps Markdown est volontairement omis pour conserver une vue concise.
- Les classes de bannière générées (`banner-info`, `banner-wip`, `banner-postponed`, `banner-modified`, `banner-unsecured`, etc.) sont stylées dans `ficheprojet.css` pour assurer une apparence homogène.

---

## 5. Fonctionnement des fiches projets (Project Sheets)

Les "fiches projets" sont les pages de détail qui présentent chaque projet urbain (transport, vélo, urbanisme...) de façon riche et interactive. Il existe deux types de fiches : **fiches dynamiques (Markdown)** et **fiches statiques (HTML)**.

### 5.1 Fiches dynamiques (Markdown)
- **Stockage** : Les contenus sont stockés dans `data.js` sous la forme d’un objet `window.projectDetails` :
  ```js
  window.projectDetails = {
    "Nom du projet": "# Titre\nDescription en markdown...",
    ...
  }
  ```
- **Affichage** : Lorsqu’un utilisateur clique sur un projet, le module `NavigationModule.js` appelle :
  1. `DataModule.getProjectDetails(name, category)` pour récupérer la description Markdown.
  2. Le front-matter est extrait (couverture, itinéraire, trafic, description) et inséré dans le panneau détail ; le corps Markdown complet n’est plus affiché dans cette vue.
- **Structure recommandée** du Markdown :
  - Un titre (`# ...`)
  - Une introduction
  - Des sections avec titres (`## ...`)
  - Listes, tableaux, images (liens relatifs possibles vers `/img/`)
- **Avantages** : Facile à éditer, versionnable, rendu dynamique, supporte la mise à jour sans rechargement de page.

### 5.2 Fiches statiques (HTML)
- **Stockage** : Les pages HTML sont placées dans `pages/velo/`, `pages/mobilite/`, etc. (ex : `pages/velo/voie-lyonnaise-5.html`).
- **Association** : Le mapping entre un projet et sa fiche HTML se fait via la table Supabase `projectPages` (chargée par `supabaseService.js`), puis injectée dans `window.projectPages` :
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
     - Cherche la description Markdown dans `window.projectDetails`.
     - Cherche l’URL HTML dans `window.projectPages`.
     - Affiche la couverture, les chips itinéraire/trafic ainsi que la description issue du front-matter (le corps Markdown complet est masqué).
     - Si une fiche HTML existe, affiche un bouton « Voir la fiche complète » (ouvre la page dans un nouvel onglet).
- **Modules impliqués** : `NavigationModule.js`, `DataModule.js`, `UIModule.js`, `supabaseService.js` (pour le mapping projectPages).

### 5.4 Ajouter ou modifier une fiche projet
- **Pour une fiche dynamique** :
  - Ajouter ou modifier l’entrée correspondante dans `window.projectDetails` dans `data.js`.
  - Utiliser le Markdown pour structurer le contenu.
- **Pour une fiche statique** :
  - Créer un fichier `.html` dans le bon sous-dossier de `pages/`.
  - Ajouter ou mettre à jour le mapping dans Supabase (`projectPages`), ou dans le mapping local si utilisé.
  - Vérifier que le nom du projet correspond à la clé utilisée dans l’UI.

### 5.5 Résumé visuel du flux

```
[UI] --clic--> NavigationModule.showProjectDetail
         |
         |-- (cat. Vélo) -- fetch /pages/velo/*.md ----\
         |                                              |--> MarkdownUtils.renderMarkdown --> attrs --> projectDetailPanel
         |-- (autres cat.) DataModule.getProjectDetails -/
         |
         |-- window.projectPages ? --> affiche bouton fiche HTML (nouvel onglet)
         |
         +--> projectDetailPanel visible (DOM injecté par NavigationModule)
```

### 5.6 Bonnes pratiques
- Garder les titres de projets cohérents entre Supabase, `data.js` et les fichiers HTML.
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

1. Lancer l’application en local :

   ```powershell
   # (Facultatif) fermer d’éventuels serveurs encore actifs
   taskkill /F /IM node.exe 2>NUL
   taskkill /F /IM python.exe 2>NUL

   # Démarrer le serveur statique Python sur le port 8000
   python -m http.server 8000
   ```
   Puis ouvrir `http://localhost:8000` dans votre navigateur.

2. Vérifier les variables d’environnement Supabase (URL, API key) dans `supabaseService.js` (⚠️ ne jamais exposer la clé admin en prod !).
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
  2. Le Markdown de `window.projectDetails[name]` est converti en HTML et affiché
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
- Vérifier la configuration des URLs dans Supabase et dans `supabaseService.js`

**Q : Les filtres ne fonctionnent pas ?**
- Vérifier la structure de la table `filtersConfig` dans Supabase
- S’assurer que les propriétés des GeoJSON sont cohérentes

**Q : Les fiches projet ne s’affichent pas ?**
- Vérifier que la clé du projet existe dans `window.projectDetails` ou dans `window.projectPages`

---

## 11. Conseils pour la maintenance et l’évolution

- Pour ajouter une nouvelle catégorie ou couche :
  - Ajouter la config dans Supabase (`layersConfig`, `filtersConfig`, etc.)
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

---

*(Ce README est conçu pour permettre à une IA ou un développeur de comprendre, maintenir et faire évoluer l’application sans ambiguïté.)*
