# AGENTS.md - Guide pour les agents IA

> Ce fichier est destiné aux agents de code (IA) travaillant sur ce projet.
> Il complète le `README.md` (orienté humains) avec des informations techniques détaillées.

---

## 📋 Table des matières

1. [Vue d'ensemble](#vue-densemble)
2. [Stack technique](#stack-technique)
3. [Commandes essentielles](#commandes-essentielles)
4. [Structure du projet](#structure-du-projet)
5. [Architecture JavaScript](#architecture-javascript)
6. [Architecture CSS](#architecture-css)
7. [Base de données Supabase](#base-de-données-supabase)
8. [Netlify Functions](#netlify-functions)
9. [Système Fiche Projet](#système-fiche-projet)
10. [Système Multi-Villes (CityManager)](#système-multi-villes-citymanager)
11. [MarkdownUtils](#markdownutils)
12. [EventBindings](#eventbindings)
13. [SubmenuManager](#submenumanager)
14. [ThemeManager](#thememanager)
15. [ModalHelper](#modalhelper)
16. [SearchModule](#searchmodule)
17. [Système de Toggles](#système-de-toggles)
18. [SecurityUtils](#securityutils)
19. [Tests Playwright](#tests-playwright)
20. [Conventions de code](#conventions-de-code)
21. [Sécurité](#sécurité)
22. [Patterns critiques](#patterns-critiques)
23. [Zones sensibles](#zones-sensibles)
24. [Debugging](#debugging)
25. [Déploiement](#déploiement)
26. [Erreurs fréquentes et solutions](#erreurs-fréquentes-et-solutions)
27. [Exceptions de hardcoding](#exceptions-de-hardcoding)
28. [Authentification](#authentification)

---

## Vue d'ensemble

**GrandsProjets** est une plateforme de cartographie urbaine permettant de visualiser les grands projets d'urbanisme et de mobilité (tramway, vélo, travaux, etc.).

### Caractéristiques clés

| Aspect | Description |
|--------|-------------|
| **Type** | Application web statique, côté client uniquement |
| **Framework frontend** | Aucun (Vanilla JS) |
| **Cartographie** | Leaflet 1.9.x |
| **Backend** | Supabase (PostgreSQL + Auth + Storage + Edge Functions) |
| **Hébergement** | Netlify |
| **Tests** | Playwright (E2E) |
| **Bundler** | Aucun (scripts natifs) |

### Philosophie

- **Pas de build** : Le code source est directement servi
- **Modules IIFE** : Chaque module est une IIFE exposée sur `window`
- **CSS modulaire** : Fichiers numérotés avec imports ordonnés
- **Multi-villes** : Une instance, plusieurs configurations de ville

---

## Stack technique

### Frontend

```
JavaScript (ES6+, modules natifs)
├── Leaflet 1.9.x (cartographie)
├── Leaflet.draw (dessin de géométries)
├── Supabase JS Client (CDN)
├── Marked.js (rendu Markdown)
└── FontAwesome 6.x (icônes)
```

### Backend (Supabase)

```
Supabase
├── PostgreSQL (base de données)
├── Row Level Security (RLS)
├── Auth (authentification magic link)
├── Storage (fichiers GeoJSON, images)
└── Edge Functions (Deno)
```

### Outils de développement

```
npm (gestion des devDependencies)
├── Playwright (tests E2E)
├── autoprefixer
├── postcss
└── tailwindcss (non utilisé actuellement)
```

### Hébergement

```
Netlify
├── Static hosting
├── Serverless Functions (Node.js)
├── Redirections (sous-domaines villes)
└── Headers de sécurité (_headers)
```

---

## Commandes essentielles

### Développement

```bash
# Installer les dépendances (tests uniquement)
npm install

# Lancer le serveur de développement (Python HTTP server)
npm start
# → http://localhost:3001

# Alternative : Live Server VS Code ou autre serveur statique
```

### Tests

```bash
# Lancer les tests avec interface UI Playwright
npm run test:ui

# Lancer tous les tests en CLI
npm test

# Voir le rapport HTML
npm run test:report

# Générer le rapport JSON (pour analyse IA)
npm run test:json
```

### Génération de rapport pour analyse IA

```bash
npm run test:json -- --failed-only
# Puis lire : test-results/results.json
```

---

## Structure du projet

```
grandsprojets/
├── index.html              # Page principale de l'application
├── main.js                 # Point d'entrée JavaScript (~870 lignes)
├── style.css               # Point d'entrée CSS (imports modulaires)
│
├── modules/                # Modules JavaScript (57 fichiers)
│   ├── supabaseservice.js  # Service Supabase (~100KB, central)
│   ├── datamodule.js       # Gestion données et cache (~55KB)
│   ├── navigationmodule.js # Navigation et submenus (~43KB)
│   ├── ficheprojet.js      # Fiches projet détaillées (~55KB)
│   ├── mapmodule.js        # Initialisation carte Leaflet
│   ├── auth.js             # Authentification
│   ├── citybranding.js     # Configuration des villes
│   ├── eventbindings.js    # Bindings d'événements
│   ├── travauxmodule.js    # Module travaux/chantiers
│   ├── travauxeditormodule.js # Éditeur de chantiers
│   ├── contrib.js          # Orchestrateur contributions (~107KB)
│   ├── contrib/            # Sous-modules contributions (24 fichiers)
│   │   ├── contrib-list.js
│   │   ├── contrib-form.js
│   │   ├── contrib-map.js
│   │   ├── contrib-city-context.js
│   │   └── ...
│   └── ui/                 # Composants UI
│       ├── toggles.js      # Système de toggles
│       └── toggles-config.js
│
├── styles/                 # CSS modulaire (21 fichiers)
│   ├── 00-colors.css       # Variables de couleurs
│   ├── 01-base.css         # Reset et fondations
│   ├── 02-layout.css       # Structure globale
│   ├── 03-navigation.css   # Navigation latérale
│   ├── 04-components.css   # Composants réutilisables
│   ├── 05-map.css          # Styles Leaflet
│   ├── 06-modals.css       # Modales
│   ├── 07-admin.css        # Admin
│   ├── 08-responsive.css   # Media queries
│   ├── gp-button-system.css # Système de boutons unifié
│   └── ...
│
├── tests/                  # Tests Playwright
│   ├── contribution/       # Tests flux contribution (11 fichiers)
│   ├── toggles/            # Tests toggles (12 fichiers)
│   ├── helpers/            # Helpers réutilisables
│   │   ├── auth.js         # Login/logout
│   │   ├── contribution.js # Actions contributions
│   │   └── toggles.js      # Helpers toggles
│   └── README.md           # Guide des tests
│
├── netlify/                # Serverless functions Netlify
│   └── functions/
│       ├── sitemap.js      # Génération sitemap dynamique
│       ├── openai-generate.js # Génération IA
│       └── send-contact-email.js # DEPRECATED (utiliser Supabase)
│
├── supabase/               # Configuration Supabase
│   └── functions/          # Edge Functions (Deno)
│
├── fiche/                  # Page fiche projet standalone
│   └── index.html
│
├── login/                  # Page de connexion
│   └── index.html
│
├── logout/                 # Page de déconnexion
│   └── index.html
│
├── landing-page/           # Landing page marketing
│   └── index.html
│
├── vendor/                 # Librairies tierces locales
│   └── leaflet/            # Plugins Leaflet
│
├── img/                    # Assets images
│   ├── logo.svg
│   ├── logomin.png
│   └── logos/
│
├── playwright.config.js    # Configuration Playwright
├── netlify.toml            # Configuration Netlify
├── package.json            # Dependencies npm
├── _headers                # Headers de sécurité Netlify
├── SECURITY.md             # Guide de sécurité XSS
└── .gitignore
```

---

## Architecture JavaScript

### Pattern de module (IIFE)

Tous les modules utilisent le pattern IIFE et s'exposent sur `window` :

```javascript
// Pattern standard pour un module
;(function(win) {
  'use strict';
  
  // Variables privées
  let internalState = {};
  
  // Fonctions privées
  function privateHelper() { /* ... */ }
  
  // API publique
  win.ModuleName = {
    init: function() { /* ... */ },
    publicMethod: function() { /* ... */ }
  };
  
})(window);
```

### Modules principaux et leurs responsabilités

| Module | Fichier | Responsabilité |
|--------|---------|----------------|
| `supabaseService` | `supabaseservice.js` | Toutes les interactions Supabase (fetch, auth, storage) |
| `DataModule` | `datamodule.js` | Cache, chargement de layers, gestion des données GeoJSON |
| `MapModule` | `mapmodule.js` | Initialisation et contrôle de la carte Leaflet |
| `NavigationModule` | `navigationmodule.js` | Menus, submenus, rendu des listes de projets |
| `EventBindings` | `eventbindings.js` | Liaison des événements globaux |
| `UIModule` | `uimodule.js` | Composants UI (basemap, recherche, etc.) |
| `AuthModule` | `auth.js` | Authentification (session, login, logout) |
| `CityBranding` | `citybranding.js` | Configuration visuelle par ville |
| `TravauxModule` | `travauxmodule.js` | Submenu et filtres travaux |
| `TravauxEditorModule` | `travauxeditormodule.js` | Création/édition de chantiers |
| `ContribModule` | `contrib.js` | Orchestration du système de contributions |
| `SubmenuModule` | `submenumodule.js` | Rendu des submenus par catégorie |
| `FilterModule` | `filtermanager.js` | Gestion des filtres (state machine) |
| `ModalNavigation` | `ModalNavigation.js` | Navigation multi-panneaux dans les modales |
| `ThemeManager` | `thememanager.js` | Gestion thème clair/sombre |
| `ContribCityContext` | `contrib/contrib-city-context.js` | Contexte de ville pour les contributions |
| `SecurityUtils` | `security-utils.js` | Prévention XSS (escapeHtml, sanitizeUrl) |
| `CityManager` | `citymanager.js` | Détection ville, persistance, menu sélecteur |
| `CityRedirect` | `city-redirect.js` | Redirection auto vers ville utilisateur |
| `MarkdownUtils` | `markdownutils.js` | Rendu Markdown + front-matter + directives custom |
| `ModalHelper` | `modal-helper.js` | Gestion unifiée des modales (open/close/trap focus) |
| `ModalManager` | `modal-helper.js` | Wrapper de compatibilité (ancienne API) |
| `SearchModule` | `searchmodule.js` | Recherche d'adresses (API Nominatim) |
| `SubmenuManager` | `submenumanager.js` | Gestionnaire central des sous-menus |
| `FicheProjet` | `ficheprojet.js` | Affichage fiche projet standalone (/fiche/) |

### Dépendances entre modules

```
main.js
├── supabaseService (chargement des données initiales)
├── MapModule.init()
├── DataModule.init()
├── NavigationModule.init()
├── EventBindings.init()
├── UIModule.init()
└── CityBranding.apply()

DataModule
├── supabaseService (fetch layers, GeoJSON)
├── MapModule (ajout/suppression de layers)
├── FilterModule (critères de filtrage)
└── Cache interne (simpleCache)

NavigationModule
├── DataModule (récupération des données)
├── MapModule (focus sur les features)
├── SubmenuManager (rendu des sous-menus)
└── supabaseService (fetch projets)

EventBindings
├── MapModule (manipulation layers)
├── DataModule (chargement layers)
├── FilterModule (reset filtres)
├── UIModule (panneau détail)
└── SubmenuManager (rendu submenus)

TravauxModule
├── DataModule (chargement layer travaux)
├── supabaseService (config travaux)
└── TravauxEditorModule (édition)
```

### DataModule - API détaillée

| Méthode | Description |
|---------|-------------|
| `initConfig(config)` | Initialise urlMap, styleMap, iconMap, defaultLayers |
| `loadLayer(name)` | Charge un layer et l'ajoute à la carte |
| `preloadLayer(name)` | Précharge un layer sans l'afficher |
| `reloadLayer(name)` | Vide le cache et recharge le layer |
| `createGeoJsonLayer(name, data)` | Crée et affiche un layer GeoJSON |
| `getFeatureStyle(feature, layerName)` | Retourne le style d'une feature |
| `clearLayerCache(name)` | Vide le cache d'un layer spécifique |

```javascript
// Propriétés exposées
DataModule.layerData  // Données en mémoire par layer

// Usage typique
await DataModule.loadLayer('velo');
const data = DataModule.layerData['velo'];
```

### FilterModule - API

Module de gestion des filtres par layer (state machine simple).

| Méthode | Description |
|---------|-------------|
| `set(layer, criteria)` | Définit les critères de filtre pour un layer |
| `get(layer)` | Récupère les critères actuels |
| `reset(layer)` | Réinitialise les filtres d'un layer |
| `resetAll()` | Réinitialise tous les filtres |

```javascript
// Définir un filtre
FilterModule.set('travaux', { etat: 'En cours' });

// Récupérer le filtre actuel
const criteria = FilterModule.get('travaux'); // { etat: 'En cours' }

// Réinitialiser
FilterModule.resetAll();
```

### MapModule - API

| Méthode/Propriété | Description |
|-------------------|-------------|
| `map` | Instance Leaflet |
| `layers` | Objet contenant tous les layers actifs |
| `addLayer(name, layer)` | Ajoute un layer |
| `removeLayer(name)` | Retire un layer |
| `setBaseLayer(tileLayer)` | Change le fond de carte |
| `initBaseLayer()` | Initialise le fond de carte par défaut |
| `hitRenderer` | Renderer SVG pour les hitlines (clics élargis) |
| `hitPaneName` | Nom du pane pour les hitlines |
| `cameraPaneName` | Nom du pane pour les camera markers |

```javascript
// Vérifier si un layer existe
if (MapModule.layers['velo']) { ... }

// Supprimer tous les layers
Object.keys(MapModule.layers).forEach(name => MapModule.removeLayer(name));
```

### Variables globales importantes

```javascript
window.supabaseService   // Service Supabase
window.DataModule        // Gestion des données
window.MapModule         // Carte Leaflet
window.NavigationModule  // Navigation
window.EventBindings     // Événements
window.UIModule          // UI
window.AuthModule        // Auth
window.TravauxModule     // Travaux
window.ModalHelper       // Gestion modales (API moderne)
window.ModalManager      // Gestion modales (API legacy)
window.ThemeManager      // Gestion thème clair/sombre
window.SearchModule      // Recherche d'adresses
window.SubmenuManager    // Gestionnaire des sous-menus
window.SubmenuModule     // Rendu des projets dans les sous-menus
window.toggleManager     // Gestion des toggles UI

// Configuration et état
window.activeCity        // Ville active (string ou null)
window.categoryLayersMap // Mapping catégorie → layers
window.categoryIcons     // Config des icônes de catégories (depuis Supabase)
window.categoryConfig    // Config des catégories (labels, couleurs)
window.defaultLayers     // Layers chargés par défaut au démarrage
window.basemaps          // Liste des fonds de carte disponibles
window.allContributions  // Cache des contributions (toutes catégories)
window.zoomConfig        // Config zoom min par layer (ex: { markers: { minZoom: 14 } })
window.getActiveCity     // Fonction pour récupérer la ville

// Variables de rôle (définies par contrib.js)
window.__CONTRIB_ROLE    // 'admin' | 'invited' | ''
window.__CONTRIB_VILLES  // Array de villes autorisées (ex: ['lyon'] ou ['global'])
window.__CONTRIB_IS_ADMIN // Boolean - raccourci pour role === 'admin'

// Données injectées par supabaseService.initAllData()
window.layersConfig      // Configuration des layers
window.basemaps          // Fonds de carte disponibles
window.categoryIcons     // Icônes des catégories
window.allContributions  // Toutes les contributions (cache)
```

### Accès à la ville active

```javascript
// Pattern recommandé pour récupérer la ville
const city = (typeof window.getActiveCity === 'function') 
  ? window.getActiveCity() 
  : (window.activeCity || null);

// null = mode Global
// 'lyon', 'keolis', etc. = ville spécifique
```

---

## Architecture CSS

### Ordre d'import (style.css)

Les fichiers CSS sont importés dans un ordre précis :

```css
/* 00 - Variables de couleurs (TOUJOURS en premier) */
@import url('./styles/00-colors.css');

/* 01 - Base et reset */
@import url('./styles/01-base.css');

/* 02 - Layout global */
@import url('./styles/02-layout.css');

/* 03 - Navigation */
@import url('./styles/03-navigation.css');

/* 03.6 - Système de boutons unifié */
@import url('./styles/gp-button-system.css');

/* 04 - Composants */
@import url('./styles/04-components.css');

/* 05+ - Le reste par ordre numérique */
```

### Système de couleurs

Variables de base (modifiables pour le branding) :

```css
:root {
  --color-primary: #14AE5C;    /* Couleur principale */
  --color-success: #10B981;    /* Vert */
  --color-danger: #EF4444;     /* Rouge */
  --color-info: #2563EB;       /* Bleu */
  --color-warning: #F59E0B;    /* Orange */
  --color-neutral: #64748B;    /* Gris */
}
```

Variations par transparence (color-mix) :

```css
--primary: var(--color-primary);
--primary-alpha-10: color-mix(in srgb, var(--color-primary) 10%, transparent);
--primary-alpha-20: color-mix(in srgb, var(--color-primary) 20%, transparent);
/* ... */
```

### Système de boutons unifié

Utiliser les classes du `gp-button-system.css` :

```html
<!-- Bouton principal -->
<button class="btn-primary">Action principale</button>

<!-- Bouton secondaire (navigation, fermeture) -->
<button class="btn-secondary">Fermer</button>

<!-- Variantes -->
<button class="btn-danger">Supprimer</button>
<button class="btn-info">Information</button>

<!-- Tailles -->
<button class="btn-primary btn-small">Petit</button>
<button class="btn-primary btn-large">Grand</button>
```

**IMPORTANT** : Ne jamais créer de styles de boutons custom. Toujours utiliser le système unifié.

### Conventions de nommage CSS

| Pattern | Usage | Exemple |
|---------|-------|---------|
| `.gp-*` | Composants système | `.gp-modal`, `.gp-card` |
| `.btn-*` | Boutons | `.btn-primary`, `.btn-danger` |
| `.nav-*` | Navigation | `.nav-category`, `.nav-overflow` |
| `.submenu-*` | Submenus | `.submenu-toggle-btn` |
| `.filter-*` | Filtres | `.filter-group`, `.filter-badge` |
| `#contrib-*` | IDs contribution | `#contrib-overlay`, `#contrib-title` |

---

## Base de données Supabase

### Tables principales

| Table | Description | Colonnes clés |
|-------|-------------|---------------|
| `layers` | Configuration des couches GeoJSON | `name`, `url`, `style`, `is_default`, `ville` |
| `city_branding` | Configuration visuelle par ville | `ville`, `primary_color`, `logo_url`, `dark_logo_url`, `favicon_url`, `brand_name`, `center_lat`, `center_lng`, `zoom`, `enabled_toggles`, `enabled_cities`, `travaux` |
| `city_travaux` | Chantiers par ville | `id`, `name`, `geojson`, `ville`, `date_debut`, `date_fin` |
| `category_icons` | Icônes des catégories | `category`, `icon_class`, `display_order` |
| `contribution_uploads` | Contributions utilisateurs | `id`, `project_name`, `category`, `geojson_url`, `ville`, `created_by`, `approved` |
| `profiles` | Profils utilisateurs (rôles) | `id` (FK auth.users), `role`, `ville` (array), `created_at` |
| `contact_requests` | Demandes de contact | `full_name`, `email`, `message`, `referrer` |
| `basemaps` | Fonds de carte disponibles | `name`, `url`, `attribution`, `is_default` |
| `travaux_config` | Configuration travaux par ville | `ville`, `enabled`, `source_type`, `icon_class` |
| `filter_items` | Items de filtres par layer | `id`, `layer`, `icon`, `label` |
| `consultation_dossiers` | Dossiers PDF de concertation | `id`, `title`, `pdf_url`, `project_name` |

### RLS (Row Level Security)

La sécurité est gérée par RLS côté Supabase. Points importants :

- Lecture publique pour la plupart des tables (données affichées sur la carte)
- Écriture restreinte aux utilisateurs authentifiés
- Certaines tables ont des restrictions par ville (admin de la ville)

### Requêtes Supabase courantes

```javascript
// Récupérer les layers pour une ville
const { data } = await supabaseClient
  .from('layers')
  .select('name, url, style, is_default, ville')
  .or(`ville.is.null,ville.eq.${activeCity}`);

// Récupérer les contributions d'une catégorie
const { data } = await supabaseClient
  .from('contribution_uploads')
  .select('*')
  .eq('category', 'urbanisme')
  .eq('ville', activeCity);

// Insérer un chantier
const { data, error } = await supabaseClient
  .from('city_travaux')
  .insert({
    name: 'Nouveau chantier',
    geojson: geoJsonObject,
    ville: activeCity
  });
```

### Storage Buckets

Bucket principal : `uploads`

```
uploads/
├── geojson/projects/{category}/{slug}-{timestamp}.geojson
├── img/cover/{category}/{slug}-{timestamp}.{jpg|png|webp}
├── md/projects/{category}/{slug}-{timestamp}.md
├── docs/consultation/{slug}-{timestamp}.pdf
├── pdfs/projects/{category}/{slug}-{timestamp}.pdf
└── branding/{ville}-{type}.{ext}  # Logos et images de villes
```

### RPC Functions

| Fonction | Usage |
|----------|-------|
| `get_profiles_with_email` | Récupérer les profils avec emails (admin only) |

### Edge Functions Supabase

Situées dans `supabase/functions/` :

- `send-contact-email/` : Envoi d'emails de contact (via Resend ou autre)

---

## Netlify Functions

Situées dans `netlify/functions/` :

### sitemap.js

Génère dynamiquement le sitemap XML pour le SEO.

```javascript
// Endpoint: /.netlify/functions/sitemap (redirigé via /sitemap.xml)
// Méthode: GET
// Retourne: application/xml

// Récupère les contributions approuvées depuis Supabase
// et génère les URLs de type /fiche/?cat=...&project=...
```

### openai-generate.js

Génère du contenu via OpenAI API.

```javascript
// Endpoint: /.netlify/functions/openai-generate
// Méthode: POST
// Body: { text: string, mode: 'meta' | 'description' | 'article', context: { city, theme } }
// Retourne: { meta, description, article, usage }

// Modes:
// - 'meta': Génère une meta description SEO (<=150 chars)
// - 'description': Génère une description (300-450 chars)
// - 'article': Génère un article Markdown (800-1200 mots)
```

### send-contact-email.js

⚠️ **DEPRECATED** - Retourne status 410. Utiliser le système Supabase à la place :
- Formulaire: `modules/contact-form.js`
- Stockage: Table `contact_requests`
- Email: Edge Function Supabase `clever-endpoint`

---

## Système Fiche Projet

### URL Routing

Les fiches projet utilisent des paramètres URL :

```
/fiche/?project={nom}&cat={catégorie}&city={ville}&embed={true|false}
```

| Paramètre | Description | Exemple |
|-----------|-------------|---------|
| `project` | Nom du projet (exact) | `Tramway T10` |
| `cat` | Catégorie | `mobilite`, `velo`, `urbanisme` |
| `city` | Code ville (optionnel) | `lyon`, `keolis` |
| `embed` | Mode intégré (optionnel) | `true`, `1` |

### Deep linking depuis l'app principale

```javascript
// Construire l'URL de la fiche complète
const params = new URLSearchParams();
params.set('cat', category);
params.set('project', projectName);
if (currentCity) params.set('city', currentCity);
const fullPageUrl = `/fiche/?${params.toString()}`;
```

### SEO et Meta Tags

`ficheprojet.js` gère automatiquement :

```javascript
// Title
document.title = `${projectName} – Grands Projets`;

// Meta description
<meta name="description" content="...">

// Open Graph
<meta property="og:title" content="...">
<meta property="og:description" content="...">
<meta property="og:image" content="...">
<meta property="og:type" content="article">
```

### Flux d'initialisation (initFicheProjet)

1. Initialiser le thème (ThemeManager)
2. Charger MarkdownUtils + dépendances
3. Parser les paramètres URL
4. Fetch le projet depuis Supabase
5. Appliquer le city branding
6. Générer le HTML (cover hero, sidebar, modales)
7. Appliquer SEO (meta tags)
8. Charger le markdown (renderMarkdown)
9. Initialiser la carte Leaflet
10. Bind tous les événements

---

## Système Multi-Villes (CityManager)

### Détection de la ville active

```javascript
// Ordre de priorité :
1. URL path: /lyon/...
2. URL query: ?city=lyon
3. localStorage: activeCity
4. Fallback: 'metropole-lyon'

// Pattern recommandé
const city = window.CityManager?.getActiveCity() 
  || window.getActiveCity?.() 
  || window.activeCity 
  || 'metropole-lyon';
```

### Méthodes principales CityManager

| Méthode | Description |
|---------|-------------|
| `getActiveCity()` | Récupère la ville active (toutes sources) |
| `initializeActiveCity()` | Initialise et persiste la ville |
| `loadValidCities()` | Charge les villes valides depuis Supabase |
| `isValidCity(city)` | Vérifie si une ville est valide |
| `persistCity(city)` | Sauvegarde dans localStorage |
| `restoreCity()` | Restaure depuis localStorage |
| `updateLogoForCity(city)` | Met à jour le logo selon la ville |
| `initCityMenu(city)` | Initialise le menu sélecteur de ville |

### Flux de redirection (CityRedirect)

Après connexion, si l'utilisateur a une seule ville :
```
Connexion → __CONTRIB_VILLES = ['lyon'] → Redirection auto vers ?city=lyon
```

Si plusieurs villes :
```
Connexion → __CONTRIB_VILLES = ['lyon', 'divonne'] → Popup de sélection
```

---

## MarkdownUtils

### Directives custom supportées

**::content-image**
```markdown
::content-image
---
imageUrl: /uploads/img/photo.jpg
caption: Description de l'image
credit: © Auteur
---
::
```

**::banner{type="..."}**
```markdown
::banner{type="info"}
Ceci est un message d'information important.
::
```

Types de banner : `info`, `warning`, `success`, `error`

### Front-matter YAML

```markdown
---
name: Tramway T10
cover: /uploads/img/cover/t10.jpg
description: Description courte
from: Gare Part-Dieu
to: Vaulx-en-Velin
trafic: 45 000 voyageurs/jour
---

# Contenu Markdown...
```

### Dépendances CDN

MarkdownUtils charge automatiquement :
- **marked.js** : Parser Markdown (fallback multi-CDN)
- **DOMPurify** : Sanitisation HTML (XSS prevention)

```javascript
// Utilisation
await window.MarkdownUtils.loadDeps();
const { attrs, html } = window.MarkdownUtils.renderMarkdown(rawMarkdown);
```

---

## EventBindings

Module central de gestion des événements et de la navigation.

### handleNavigation(menu, layersToDisplay)

Fonction principale pour naviguer vers une catégorie :

```javascript
// Afficher une catégorie avec ses layers
EventBindings.handleNavigation('velo', ['velo-pistes', 'velo-stations']);

// Le système va automatiquement :
// 1. Activer l'onglet nav-{menu}
// 2. Masquer le panneau de détail
// 3. Réinitialiser les filtres
// 4. Retirer les layers non désirés
// 5. Charger les layers manquants
// 6. Afficher le sous-menu via SubmenuManager
```

### Autres fonctions

| Fonction | Description |
|----------|-------------|
| `bindFilterControls()` | Lie les clics sur les items de filtre |
| `initCategoryNavigation()` | Initialise la navigation par catégorie |
| `handleFeatureClick(feature, layerName)` | Gère le clic sur une feature de la carte |
| `bindLogoClick()` | Lie le clic sur le logo (refresh page) |

---

## SubmenuManager

Gestionnaire central unifié pour tous les sous-menus.

### Méthodes

| Méthode | Description |
|---------|-------------|
| `renderSubmenu(category)` | Rend le sous-menu pour une catégorie |
| `closeAllSubmenus()` | Ferme tous les sous-menus |
| `isSubmenuOpen(category)` | Vérifie si un sous-menu est ouvert |
| `getCurrentSubmenu()` | Retourne la catégorie du sous-menu actif |

### Routing interne

```javascript
// SubmenuManager délègue le rendu selon le type
if (category === 'travaux') {
  TravauxModule.renderTravauxProjects();  // Système spécialisé
} else {
  SubmenuModule.renderProjectsByCategory(category);  // Système unifié
}
```

---

## ThemeManager

Gestion du thème clair/sombre avec synchronisation système.

### Méthodes

| Méthode | Description |
|---------|-------------|
| `init()` | Initialise le thème (localStorage ou système) |
| `toggle()` | Bascule entre clair et sombre |
| `applyTheme(theme)` | Applique un thème ('light' ou 'dark') |
| `syncBasemapToTheme(theme)` | Change le fond de carte selon le thème |
| `startOSThemeSync()` | Écoute les changements de préférence système |
| `stopOSThemeSync()` | Arrête l'écoute des préférences système |
| `getInitialTheme()` | Retourne le thème initial selon le système |

### Attributs HTML

```html
<!-- Thème clair -->
<html data-theme="light">

<!-- Thème sombre -->
<html data-theme="dark" class="dark">
```

### Stockage

```javascript
localStorage.getItem('theme'); // 'light' | 'dark' | null
```

---

## ModalHelper

API moderne pour la gestion des modales avec stack, focus trap et animations.

### Méthodes

| Méthode | Description |
|---------|-------------|
| `open(modalId, options)` | Ouvre une modale |
| `close(modalId)` | Ferme une modale |
| `closeAll()` | Ferme toutes les modales |
| `isOpen(modalId)` | Vérifie si une modale est ouverte |
| `animate(modalId, class)` | Ajoute une animation (ex: 'shake') |
| `setLoading(modalId, bool)` | Active/désactive l'état loading |

### Options d'ouverture

```javascript
ModalHelper.open('my-modal', {
  dismissible: true,     // Fermeture par ESC/click outside
  lockScroll: true,      // Bloquer le scroll du body
  focusTrap: true,       // Piéger le focus dans la modale
  onOpen: () => {},      // Callback après ouverture
  onClose: () => {},     // Callback après fermeture
  animationDuration: 220 // Durée animation (ms)
});
```

### Structure HTML requise

```html
<div id="my-modal" class="gp-modal-overlay">
  <div class="gp-modal">
    <div class="gp-modal-header">
      <div class="gp-modal-title">Titre</div>
      <button class="gp-modal-close">×</button>
    </div>
    <div class="gp-modal-body">
      <!-- Contenu -->
    </div>
  </div>
</div>
```

---

## SearchModule

Recherche d'adresses via l'API Nominatim (OpenStreetMap).

### Méthodes

| Méthode | Description |
|---------|-------------|
| `init(mapInstance)` | Initialise avec l'instance Leaflet |

### Fonctionnement

1. Utilisateur clique sur le toggle recherche
2. Overlay s'ouvre avec focus sur l'input
3. Debounce de 300ms sur la saisie
4. Requête Nominatim avec bbox de la carte
5. Affichage des résultats
6. Clic sur résultat → zoom sur la carte + marqueur temporaire

### Intégration ToggleManager

```javascript
// SearchModule écoute les changements d'état
window.toggleManager.on('search', (isOpen) => {
  if (isOpen) openSearchOverlay();
  else closeSearchOverlay();
});
```

---

## Système de Toggles

### Toggles disponibles

| Toggle | ID | Description |
|--------|-----|-------------|
| `filters` | `filters-toggle` | Filtres de couches |
| `basemap` | `basemap-toggle` | Sélecteur fond de carte |
| `theme` | `theme-toggle` | Mode clair/sombre |
| `search` | `search-toggle` | Recherche de projets |
| `location` | `location-toggle` | Géolocalisation |
| `city` | `city-toggle` | Sélecteur de ville |
| `info` | `info-toggle` | Informations |
| `contribute` | `contribute-toggle` | Bouton contribution (si connecté) |
| `login` | `login-toggle` | Bouton connexion (si déconnecté) |

### Configuration par ville

Dans `city_branding.enabled_toggles` (array PostgreSQL) :

```javascript
// Exemple pour une ville
enabled_toggles = ['filters', 'basemap', 'theme', 'search', 'city', 'login']

// Toggle 'contribute' apparaît automatiquement si l'utilisateur est connecté
// Toggle 'login' est masqué si l'utilisateur est connecté
```

### API ToggleManager

```javascript
// Vérifier visibilité
win.toggleManager.isVisible('filters'); // true/false

// Changer visibilité
win.toggleManager.setVisible('filters', true);

// Changer état ouvert/fermé
win.toggleManager.setState('filters', true); // ouvert
win.toggleManager.setState('filters', false); // fermé
```

---

## SecurityUtils

### Méthodes disponibles

```javascript
// 1. Échapper HTML (prévention XSS dans innerHTML)
SecurityUtils.escapeHtml('<script>alert(1)</script>')
// → '&lt;script&gt;alert(1)&lt;/script&gt;'

// 2. Échapper attributs HTML
SecurityUtils.escapeAttribute('onclick="alert(1)"')
// → 'onclick=&quot;alert(1)&quot;'

// 3. Valider/nettoyer URL (bloquer javascript:, data:, vbscript:)
SecurityUtils.sanitizeUrl('javascript:alert(1)')
// → '' (chaîne vide)

// 4. Créer élément texte sécurisé (alternative à innerHTML)
const el = SecurityUtils.createSafeElement('p', userInput, 'my-class');
// → <p class="my-class">texte échappé automatiquement</p>
```

### Pattern d'utilisation

```javascript
// ✅ BON - Toujours échapper les données utilisateur
element.innerHTML = `<p>${SecurityUtils.escapeHtml(userInput)}</p>`;

// ✅ BON - Échapper les attributs
element.innerHTML = `<a href="${SecurityUtils.sanitizeUrl(url)}" 
                        title="${SecurityUtils.escapeAttribute(title)}">`;

// ❌ MAUVAIS - Injection directe
element.innerHTML = `<p>${userInput}</p>`; // XSS possible!
```

---

## Tests Playwright

### Structure des tests

```
tests/
├── contribution/           # Tests du flux de contribution
│   ├── 01-auth-and-modal.spec.js
│   ├── 02-city-selection-and-landing.spec.js
│   ├── 03-create-contribution-flow.spec.js
│   ├── 04-list-and-filters.spec.js
│   ├── 05-create-and-delete-contribution-v2.spec.js
│   ├── 05-edit-contribution.spec.js
│   ├── 06-permissions-and-scope.spec.js
│   ├── 07-manage-categories-readonly.spec.js
│   ├── 08-manage-users-readonly.spec.js
│   └── 09-manage-structure-readonly.spec.js
├── toggles/                # Tests des toggles UI
└── helpers/                # Helpers réutilisables
    ├── auth.js             # login(), logout(), TEST_USERS
    ├── contribution.js     # openContributionModal(), etc.
    └── toggles.js          # helpers toggles
```

### Pattern de test

```javascript
import { test, expect } from '@playwright/test';
import { login, TEST_USERS } from '../helpers/auth.js';
import { openContributionModal } from '../helpers/contribution.js';

test.describe('Ma fonctionnalité', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#map', { state: 'visible', timeout: 30000 });
  });

  test('Description du test', async ({ page }) => {
    await login(page, TEST_USERS.invited);
    
    // Attendre un élément
    await expect(page.locator('#my-element')).toBeVisible({ timeout: 10000 });
    
    // Cliquer
    await page.click('#my-button');
    
    // Vérifier un attribut
    await expect(page.locator('#modal')).toHaveAttribute('aria-hidden', 'false');
  });
});
```

### Configuration Playwright

```javascript
// playwright.config.js - Points clés
export default defineConfig({
  testDir: './tests',
  timeout: 60 * 1000,
  expect: { timeout: 15000 },
  
  use: {
    baseURL: 'http://localhost:3001',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  // Le serveur est démarré automatiquement
  webServer: {
    command: 'npm start',
    url: 'http://localhost:3001',
    reuseExistingServer: !process.env.CI,
  },
});
```

### Utilisateurs de test

```javascript
// tests/helpers/auth.js
export const TEST_USERS = {
  invited: { email: 'test-invited@example.com' },
  admin: { email: 'test-admin@example.com' },
  superadmin: { email: 'test-superadmin@example.com' }
};
```

---

## Conventions de code

### JavaScript

1. **Toujours `'use strict';`** en début de module
2. **Pas de `var`**, utiliser `const` et `let`
3. **Noms explicites** : `handleNavigationClick`, pas `handleClick`
4. **Préfixer les logs** : `console.log('[ModuleName] Message');`
5. **Gestion d'erreurs** : toujours `try/catch` pour les async

```javascript
// ✅ Bon
async function loadLayer(layerName) {
  try {
    console.log('[DataModule] Chargement layer:', layerName);
    const data = await fetchLayerData(layerName);
    return data;
  } catch (error) {
    console.error('[DataModule] Erreur chargement:', error);
    return null;
  }
}

// ❌ Mauvais
async function load(n) {
  const d = await fetch(url);
  return d;
}
```

### CSS

1. **Variables CSS** pour les couleurs et espacements
2. **Mobile-first** : styles de base pour mobile, puis media queries
3. **Pas de `!important`** sauf cas exceptionnel documenté
4. **Classes BEM-like** quand approprié

```css
/* ✅ Bon */
.submenu-header {
  display: flex;
  gap: var(--spacing-md);
  padding: var(--spacing-sm);
}

.submenu-header__title {
  font-size: var(--font-size-lg);
  color: var(--text-primary);
}

/* ❌ Mauvais */
.header {
  display: flex;
  gap: 16px;
  padding: 8px !important;
}
```

### HTML

1. **Attributs `aria-*`** pour l'accessibilité
2. **IDs préfixés** par composant : `#contrib-overlay`, `#nav-travaux`
3. **data-attributes** pour les données : `data-category="travaux"`

```html
<!-- ✅ Bon -->
<button 
  id="nav-travaux" 
  class="nav-category" 
  data-category="travaux"
  aria-expanded="false"
  aria-label="Ouvrir le menu Travaux">
  <i class="fa-solid fa-helmet-safety" aria-hidden="true"></i>
  <span class="label">Travaux</span>
</button>

<!-- ❌ Mauvais -->
<button class="btn" onclick="openTravaux()">
  <i class="fa-helmet-safety"></i>
  Travaux
</button>
```

---

## Sécurité

### Protection XSS

Utiliser le module `SecurityUtils` (voir `SECURITY.md`) :

```javascript
// ✅ TOUJOURS échapper les données utilisateur
element.innerHTML = `<p>${SecurityUtils.escapeHtml(userInput)}</p>`;

// ✅ Échapper les attributs
const safeAttr = SecurityUtils.escapeAttribute(data.name);
element.innerHTML = `<img alt="${safeAttr}" src="${safeUrl}">`;

// ✅ Valider les URLs
const safeUrl = SecurityUtils.sanitizeUrl(userProvidedUrl);
```

### API disponibles

| Fonction | Usage |
|----------|-------|
| `SecurityUtils.escapeHtml(text)` | Contenu texte dans innerHTML |
| `SecurityUtils.escapeAttribute(text)` | Valeurs d'attributs HTML |
| `SecurityUtils.sanitizeUrl(url)` | URLs externes (src, href) |
| `SecurityUtils.createSafeElement(tag, text, className)` | Création d'éléments sans innerHTML |

### Ce qu'il ne faut JAMAIS faire

```javascript
// ❌ INTERDIT
eval(userInput);
element.innerHTML = userInput;
document.write(anything);
new Function(userInput);
```

### Headers de sécurité (_headers)

```
X-Frame-Options: ALLOWALL
X-Content-Type-Options: nosniff
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(self), microphone=(), camera=()
```

---

## Patterns critiques

### 1. Gestion des layers travaux

**IMPORTANT** : Le système travaux a une logique complexe avec deux sources de données.

```javascript
// Mode Global → layer externe depuis URL (table layers)
// Mode Ville → layer depuis table city_travaux

const activeCity = getActiveCity();
const layerToLoad = (!activeCity || activeCity === 'default') 
  ? 'travaux'                // Global → URL externe
  : 'city-travaux-chantiers'; // Ville → city_travaux
```

**NE JAMAIS** hardcoder un layer travaux. La logique est dans `datamodule.js` et gère automatiquement le fallback.

### 2. Navigation et categoryLayersMap

Quand on navigue vers une catégorie :

```javascript
// Le mapping catégorie → layers est dans window.categoryLayersMap
win.EventBindings.handleNavigation('travaux', ['city-travaux-chantiers']);

// handleNavigation fait :
// 1. Retirer les layers non listés
// 2. Charger les layers manquants
// 3. Ouvrir le submenu correspondant
```

**IMPORTANT** : Si un submenu est créé "en dur" (pas depuis `category_icons`), il faut ajouter manuellement son mapping :

```javascript
win.categoryLayersMap['travaux'] = ['city-travaux-chantiers'];
```

### 3. Reconstruction du DOM

**ATTENTION** : Après `element.innerHTML = ...`, toutes les références DOM enfants deviennent invalides.

```javascript
// ❌ Bug fréquent
const listEl = submenu.querySelector('.project-list');
submenu.innerHTML = '...'; // listEl est maintenant invalide !
listEl.appendChild(item);  // ERREUR !

// ✅ Correct
submenu.innerHTML = '...';
const listEl = submenu.querySelector('.project-list'); // Nouvelle référence
listEl.appendChild(item);
```

### 4. Async et gestion des erreurs

```javascript
// ✅ Pattern recommandé
async function myFunction() {
  try {
    const data = await supabaseService.fetchData();
    if (!data) {
      console.warn('[Module] Pas de données');
      return;
    }
    // Traitement...
  } catch (error) {
    console.error('[Module] Erreur:', error);
    showNotification('Erreur de chargement', 'error');
  }
}
```

### 5. Vérification de l'existence des modules

```javascript
// Toujours vérifier avant d'appeler un module
if (win.EventBindings?.handleNavigation) {
  win.EventBindings.handleNavigation('category', layers);
}

if (window.MapModule && window.MapModule.layers) {
  // Manipulation des layers
}
```

### 6. Système de rôles et permissions

```javascript
// Vérifier les permissions utilisateur
const role = window.__CONTRIB_ROLE || '';
const userVilles = window.__CONTRIB_VILLES || [];
const activeCity = window.getActiveCity?.() || window.activeCity;

const isAdmin = role === 'admin';
const isGlobalAdmin = Array.isArray(userVilles) && userVilles.includes('global');
const isCityAdmin = Array.isArray(userVilles) && userVilles.includes(activeCity);

// Autoriser si admin global OU admin de cette ville
if (isGlobalAdmin || isCityAdmin) {
  // Action autorisée
}
```

**Rôles disponibles :**
- `admin` : Peut gérer les contributions, catégories, utilisateurs (selon ses villes)
- `invited` : Peut uniquement créer des contributions

**Villes spéciales :**
- `['global']` : Admin global (toutes les villes)
- `['lyon', 'divonne']` : Admin de villes spécifiques

### 7. Événements custom inter-modules

```javascript
// Écouter une mise à jour de contribution
window.addEventListener('contribution:created', (e) => {
  console.log('Nouvelle contribution:', e.detail);
});

window.addEventListener('contribution:updated', (e) => {
  console.log('Contribution modifiée:', e.detail.id);
});

window.addEventListener('categories:updated', (e) => {
  console.log('Catégories mises à jour pour:', e.detail.ville);
});

// Émettre un événement
window.dispatchEvent(new CustomEvent('contribution:created', {
  detail: { id: rowId, project_name: name, category }
}));
```

### 8. Éviter les instances multiples Supabase

```javascript
// ❌ MAUVAIS - Crée une nouvelle instance (warning Multiple GoTrueClient)
const client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ✅ BON - Réutiliser le client existant
const client = window.__supabaseClient || supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
if (!window.__supabaseClient) {
  window.__supabaseClient = client;
}
```

### 9. Fallback de getActiveCity()

**ATTENTION** : `getActiveCity()` dans `supabaseservice.js` retourne `'metropole-lyon'` par défaut si aucune ville n'est trouvée. Ce n'est PAS `null`.

```javascript
// Dans supabaseservice.js
const getActiveCity = () => {
  // ... logique ...
  // Fallback: metropole-lyon (JAMAIS null ou vide)
  return 'metropole-lyon';
};
```

### 10. PostgreSQL array vs JSON array

La colonne `ville` dans `profiles` est un array PostgreSQL. Le parsing peut varier :

```javascript
// Format PostgreSQL array: {lyon,divonne}
// Format JSON array: ["lyon","divonne"]

// Parser correctement
let parsedVille = u.ville;
if (typeof u.ville === 'string' && u.ville) {
  if (u.ville.startsWith('{') && u.ville.endsWith('}')) {
    // PostgreSQL array format
    const content = u.ville.slice(1, -1);
    parsedVille = content ? content.split(',') : [];
  } else {
    // JSON format
    try { parsedVille = JSON.parse(u.ville); } catch (e) {}
  }
}
```

---

## Zones sensibles

### Fichiers à modifier avec précaution

| Fichier | Raison | Impact |
|---------|--------|--------|
| `modules/supabaseservice.js` | Cœur de l'application | Peut casser toute l'app |
| `modules/datamodule.js` | Cache et chargement | Peut casser l'affichage des layers |
| `main.js` | Point d'entrée | Peut empêcher le démarrage |
| `styles/00-colors.css` | Variables globales | Affecte tout le design |
| `playwright.config.js` | Config tests | Peut casser les tests |

### Ne JAMAIS modifier

| Fichier/Dossier | Raison |
|-----------------|--------|
| `vendor/` | Librairies tierces |
| `node_modules/` | Dépendances npm |
| `.env` | Secrets (jamais commité) |
| `package-lock.json` | Généré automatiquement |

### Fichiers de configuration

| Fichier | Rôle | Modification |
|---------|------|--------------|
| `netlify.toml` | Config Netlify | Rare, attention aux redirections |
| `_headers` | Headers de sécurité | Très rare |
| `package.json` | Scripts npm | Rare |

---

## Debugging

### Logs par module

Tous les modules préfixent leurs logs :

```
[Main] ...
[DataModule] ...
[supabaseService] ...
[TravauxModule] ...
[NavigationModule] ...
```

### Console Supabase

Pour voir les requêtes Supabase :

```javascript
// Dans la console du navigateur
window.__supabaseClient // Client Supabase
window.supabaseService  // Service avec toutes les méthodes
```

### Vérification des rôles

```javascript
// Rôle et villes de l'utilisateur connecté
window.__CONTRIB_ROLE    // 'admin' | 'invited' | ''
window.__CONTRIB_VILLES  // ['global'] ou ['lyon', 'divonne']
window.__CONTRIB_IS_ADMIN // true | false
```

### Inspection du cache

```javascript
// Voir l'état du cache (si exposé)
window.debugCache?.debug();
```

### Vérification des layers

```javascript
// Layers actuellement sur la carte
Object.keys(window.MapModule.layers);

// URLs des layers
window.DataModule.urlMap;

// Mapping catégorie → layers
window.categoryLayersMap;
```

### Vérification de la ville active

```javascript
window.activeCity;
window.getActiveCity?.();
```

---

## Déploiement

### Netlify (production)

Le déploiement est automatique via Netlify :

1. Push sur la branche principale → Build automatique
2. Pas de build côté Netlify (site statique)
3. Les Serverless Functions sont dans `netlify/functions/`

### Configuration Netlify

```toml
# netlify.toml
[functions]
  directory = "netlify/functions"

# Redirections sous-domaines → ?city=
[[redirects]]
  from = "https://lyon.grandsprojets.com/*"
  to = "https://grandsprojets.com/:splat?city=lyon"
  status = 301
  force = true
```

### Variables d'environnement

Les secrets sont dans Netlify (pas dans le repo) :

- `SUPABASE_URL`
- `SUPABASE_KEY`
- `OPENAI_API_KEY` (pour la fonction de génération)

**ATTENTION** : Les clés Supabase dans le code (`supabaseservice.js`) sont les clés `anon` publiques, pas les clés secrètes.

---

## Checklist avant modification

### Avant de coder

- [ ] J'ai compris le module que je modifie
- [ ] J'ai vérifié les dépendances entre modules
- [ ] J'ai lu les conventions de code
- [ ] Je connais les zones sensibles

### Pendant le code

- [ ] J'utilise les patterns existants
- [ ] J'échappe les données utilisateur (XSS)
- [ ] Je gère les erreurs (try/catch)
- [ ] Je préfixe mes logs `[ModuleName]`

### Après le code

- [ ] J'ai testé manuellement
- [ ] Les tests Playwright passent
- [ ] Je n'ai pas cassé d'autres fonctionnalités
- [ ] Le code est clean (pas de console.log de debug)

---

## Ressources

- **README.md** : Présentation générale du projet
- **SECURITY.md** : Guide de sécurité XSS détaillé
- **tests/README.md** : Guide des tests Playwright
- **Supabase Dashboard** : Interface d'administration de la base de données
- **Netlify Dashboard** : Déploiements et logs

---

## Erreurs fréquentes et solutions

### 1. ReferenceError: variable is not defined

**Cause** : Variable supprimée lors d'un refactoring mais références restantes.

```javascript
// ❌ Problème : listEl supprimé mais utilisé après
submenu.innerHTML = '...';
listEl.appendChild(item); // ReferenceError!

// ✅ Solution : récupérer la référence après reconstruction
submenu.innerHTML = '...';
const listEl = submenu.querySelector('.project-list');
if (listEl) listEl.appendChild(item);
```

### 2. Layer disparaît au 2ème clic

**Cause** : `categoryLayersMap` ne contient pas le mapping pour les submenus en dur.

```javascript
// ❌ Problème : categoryLayersMap['travaux'] = undefined
const layersToDisplay = categoryLayersMap['travaux'] || []; // []
// Tous les layers sont retirés!

// ✅ Solution : ajouter le mapping manuellement
win.categoryLayersMap['travaux'] = ['city-travaux-chantiers'];
```

### 3. Submenu non créé pour certaines villes

**Cause** : Appel à `initTravauxSubmenu()` à l'intérieur d'une condition qui n'est pas exécutée.

```javascript
// ❌ Problème : si activeCategoryIcons.length === 0, le bloc n'est jamais exécuté
if (activeCategoryIcons.length > 0) {
  await initTravauxSubmenu(); // Jamais appelé!
}

// ✅ Solution : sortir l'appel de la condition
if (categoriesContainer && submenusContainer) {
  await initTravauxSubmenu(categoriesContainer, submenusContainer);
}
```

### 4. Multiple GoTrueClient instances

**Cause** : Création de plusieurs clients Supabase.

**Solution** : Réutiliser `window.__supabaseClient` (voir Pattern #8).

### 5. Session/rôle non disponible immédiatement

**Cause** : Les variables `__CONTRIB_*` sont mises à jour de manière asynchrone.

```javascript
// ❌ Problème : utiliser le rôle immédiatement
const role = window.__CONTRIB_ROLE; // Peut être '' au démarrage

// ✅ Solution : attendre ou écouter l'auth state change
win.AuthModule.onAuthStateChange((event, session) => {
  // Rôle maintenant disponible
  const role = window.__CONTRIB_ROLE;
});
```

---

## Exceptions de hardcoding

### Règle générale

**Tous les layers doivent être chargés depuis la table `layers` dans Supabase.**

### Exception #1 : Layer "travaux" en mode Global

Le layer `travaux` en mode Global est **hardcodé dans le code** (pas récupéré depuis Supabase).

```javascript
// datamodule.js - URL hardcodée
if (layerName === 'travaux') {
  const url = 'https://data.grandlyon.com/geoserver/metropole-de-lyon/ows?SERVICE=WFS&...';
  const response = await fetch(url);
  return await response.json();
}
```

**⚠️ IMPORTANT** : Ne JAMAIS créer de ligne dans la table `layers` avec `name='travaux'` !

### Exception #2 : Mapping categoryLayersMap pour "travaux"

Le submenu Travaux n'est pas dans `category_icons` (système dynamique), il est créé en dur. Il faut ajouter manuellement son mapping :

```javascript
// main.js - après construction de categoryLayersMap
win.categoryLayersMap['travaux'] = ['city-travaux-chantiers'];
```

### Exception #3 : Layer "city-travaux-chantiers"

Ce layer est explicite car directement lié au submenu Travaux (données depuis table `city_travaux`, pas table `layers`).

```javascript
// Toujours gérer ce layer explicitement
win.EventBindings.handleNavigation('travaux', ['city-travaux-chantiers']);
```

### Récapitulatif des sources de layers

| Layer | Source | Hardcodé | Raison |
|-------|--------|----------|--------|
| `travaux` (mode Global) | URL hardcodée dans datamodule.js | ✅ Oui | Layer externe spécifique |
| `city-travaux-chantiers` | Table `city_travaux` | ❌ Non | Données dynamiques par ville |
| Tous les autres | Table `layers` | ❌ Non | Configuration centralisée |

---

## Authentification

### Flux Magic Link

1. Utilisateur entre son email sur `/login/`
2. Supabase envoie un magic link par email
3. Clic sur le lien → redirect vers l'app avec token
4. AuthModule récupère la session
5. Variables `__CONTRIB_*` sont mises à jour
6. CityRedirect gère la redirection vers la ville

### Variables de session

```javascript
// Exposées globalement par contrib.js
window.__CONTRIB_ROLE    // 'admin' | 'invited' | ''
window.__CONTRIB_VILLES  // ['global'] | ['lyon', 'divonne'] | []
window.__CONTRIB_IS_ADMIN // true | false

// Écouter les changements
window.AuthModule.onAuthStateChange((event, session) => {
  // event: 'SIGNED_IN' | 'SIGNED_OUT' | 'TOKEN_REFRESHED'
  if (session?.user) {
    // Utilisateur connecté
  }
});
```

### Vérification des permissions

```javascript
// Pattern recommandé
async function checkPermission(requiredCity = null) {
  const role = window.__CONTRIB_ROLE;
  const villes = window.__CONTRIB_VILLES || [];
  
  if (role !== 'admin') return false;
  
  // Admin global a accès partout
  if (villes.includes('global')) return true;
  
  // Sinon vérifier la ville spécifique
  if (requiredCity && villes.includes(requiredCity)) return true;
  
  return false;
}
```

---

*Dernière mise à jour : Décembre 2025*
