# Grands Projets – Plateforme de Cartographie Urbaine

[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC) [![Leaflet](https://img.shields.io/badge/Leaflet-1.9.x-brightgreen)](#) [![Tests](https://img.shields.io/badge/Tests-Playwright-45ba4b)](#)

> **Visualisez et explorez les grands projets d'urbanisme et de mobilité en France**

---

## 📖 Sommaire

- [🌍 À propos de la plateforme](#-à-propos-de-la-plateforme)
  - [Qu'est-ce que Grands Projets ?](#quest-ce-que-grands-projets-)
  - [Pour qui ?](#pour-qui-)
  - [Fonctionnalités principales](#fonctionnalités-principales)
  - [Villes couvertes](#villes-couvertes)
- [🏗️ Architecture technique](#️-architecture-technique)
  - [Principes de conception](#principes-de-conception)
  - [Stack technologique](#stack-technologique)
  - [Architecture modulaire](#architecture-modulaire)
  - [Système de design](#système-de-design)
  - [Gestion des données](#gestion-des-données)
- [🚀 Démarrage rapide](#-démarrage-rapide)

---

## 🌍 À propos de la plateforme

### Qu'est-ce que Grands Projets ?

**Grands Projets** est une plateforme web interactive qui centralise et cartographie les projets d'aménagement urbain et de mobilité des grandes métropoles françaises. À travers une carte interactive intuitive, découvrez les lignes de tramway, les voies cyclables, les zones d'urbanisme, les travaux en cours, et bien plus encore.

L'application permet de :
- **Visualiser** tous les projets d'infrastructure sur une carte dynamique
- **Filtrer** par type (transport, vélo, urbanisme, travaux)
- **Explorer** les détails de chaque projet avec des fiches complètes
- **Contribuer** en proposant de nouveaux projets ou mises à jour
- **Suivre** l'évolution des travaux et des réalisations

### Pour qui ?

#### 🏘️ Citoyens et riverains
- Suivez les travaux qui impactent votre quartier
- Découvrez les futurs aménagements de votre ville
- Consultez les plans d'urbanisme et les études de concertation
- Participez en proposant vos propres contributions

#### 🏢 Professionnels de l'urbanisme
- Centralisez les informations sur les projets en cours
- Accédez aux données géographiques (GeoJSON)
- Visualisez les interconnexions entre projets
- Exportez les données pour vos analyses

#### 🎓 Étudiants et chercheurs
- Analysez les dynamiques urbaines
- Étudiez l'évolution des infrastructures
- Consultez l'historique des projets
- Utilisez les données pour vos recherches

#### 📰 Journalistes et médias
- Suivez les grands chantiers en direct
- Accédez aux dossiers officiels et documents de concertation
- Visualisez l'impact territorial des projets
- Créez des visualisations pour vos articles

### Fonctionnalités principales

#### 🗺️ Carte interactive
- **Navigation intuitive** : zoom, déplacement, recherche d'adresse
- **Couches thématiques** : activez/désactivez les types de projets
- **Géolocalisation** : centrez la carte sur votre position
- **Fonds de carte variés** : OSM, satellite, historique (IGN années 50-80)
- **Mode sombre** : adaptation automatique au thème du système

#### 🔍 Filtres avancés
- **Par type** : tramway, métro, bus, vélo, urbanisme, travaux
- **Par statut** : en cours, planifié, terminé, en concertation
- **Par ligne** : filtrez les lignes de transport spécifiques (T6, T9, etc.)
- **Filtres combinables** : croisez plusieurs critères simultanément

#### 📄 Fiches projet détaillées
- **Informations complètes** : description, calendrier, budget, acteurs
- **Visuels** : photos, plans, schémas, rendus 3D
- **Documents officiels** : dossiers de concertation, études d'impact
- **Liens externes** : sites officiels, articles de presse
- **Géométrie interactive** : tracés exacts sur la carte

#### 🤝 Système de contribution
- **Proposez des projets** : ajoutez des informations manquantes
- **Enrichissez les données** : photos, documents, géométrie
- **Modération** : validation par l'équipe avant publication
- **Multi-villes** : contribuez sur différentes agglomérations

---

## 🏗️ Architecture technique

### Principes de conception

La plateforme repose sur des principes d'architecture modernes et maintenables :

#### **Vanilla First**
Contrairement aux applications web modernes qui s'appuient sur des frameworks lourds (React, Vue, Angular), Grands Projets utilise **JavaScript natif ES6+** sans aucun framework. Cette approche offre :
- **Performance optimale** : pas de bundle volumineux à charger
- **Maintenance simplifiée** : pas de dépendances à mettre à jour constamment
- **Code transparent** : chaque module est lisible et compréhensible
- **Rapidité de développement** : pas de configuration complexe

#### **Architecture modulaire**
Le code est organisé en **modules JavaScript autonomes** exposés sur `window.*`, permettant :
- **Séparation des responsabilités** : chaque module a un rôle précis
- **Réutilisabilité** : les modules peuvent être utilisés indépendamment
- **Testabilité** : chaque module peut être testé isolément
- **Debugging facilité** : accès direct aux modules depuis la console

#### **Mobile-first et responsive**
Le design s'adapte à tous les écrans avec une approche mobile-first. Sur mobile (≤ 720px), la navigation se positionne en bas, les panneaux deviennent des overlays, et les interactions sont optimisées pour le touch. Sur desktop, une navigation latérale classique s'affiche avec des panneaux détaillés côte à côte.

#### **Performance et cache**
Un système de cache intelligent stocke les données GeoJSON en mémoire pour éviter les requêtes réseau répétées. Les couches se chargent à la demande (lazy loading), et les actions utilisateur sont optimisées via debouncing pour garantir une expérience fluide même sur des connexions lentes.

### Stack technologique

#### **Frontend**
- **JavaScript ES6+** : syntaxe moderne (async/await, destructuring, modules)
- **HTML5 sémantique** : structure accessible (ARIA, landmarks)
- **CSS natif** : variables CSS, grid, flexbox (pas de préprocesseur)
- **Leaflet 1.9.x** : cartographie interactive performante
- **Marked.js** : conversion Markdown → HTML pour les fiches

#### **Backend et données**
- **Supabase** : backend-as-a-service basé sur PostgreSQL
  - Base de données relationnelle avec RLS (Row Level Security)
  - Authentification magic link (email sans mot de passe)
  - Stockage de fichiers (images, GeoJSON)
  - API REST automatique
- **GeoJSON** : format standard ISO pour les données géographiques
- **Markdown + YAML** : fiches projet en fichiers texte versionnables

#### **Outils et APIs**
- **Playwright** : tests end-to-end automatisés en JavaScript
- **Python HTTP Server** : serveur de dev léger (pas de Node.js requis)
- **API Adresse (data.gouv)** : géocodage d'adresses françaises
- **Geolocation API** : localisation navigateur (HTML5)
- **Google Analytics** : statistiques anonymisées

### Architecture modulaire

L'application est structurée en **28 modules JavaScript indépendants**, organisés en 5 couches :

#### **Couche Core (orchestration)**

**`main.js`** – Point d'entrée unique qui orchestre l'initialisation en 4 phases : chargement des modules de base (analytics, theme), résolution de la ville active, fetch des données Supabase, et initialisation de la carte avec les couches par défaut.

**`supabaseservice.js`** (90 KB) – Couche d'accès aux données qui expose une API complète : `initAllData()` charge toutes les tables en parallèle, les fonctions `fetch*()` récupèrent les données filtrées par ville, et un cache mémoire évite les requêtes réseau répétées.

**`datamodule.js`** (36 KB) – Gestionnaire de couches GeoJSON qui parse et valide les données, applique les styles aux features (couleurs de lignes, épaisseurs), gère les tooltips interactifs, et fusionne automatiquement les données contributives avec les couches officielles.

**`mapmodule.js`** – Wrapper Leaflet minimaliste qui initialise la carte, gère l'ajout/suppression de couches, contrôle les fonds de carte (basemaps), et expose l'instance `map` globalement pour les autres modules.

#### **Couche UI (interface utilisateur)**

**`navigationmodule.js`** (21 KB) – Moteur de navigation qui rend les listes de projets par catégorie, affiche le panneau détail avec fetch/rendu des fichiers Markdown, extrait le front-matter YAML (couverture, itinéraire, trafic), et anime les transitions entre vues.

**`uimodule.js`** (16 KB) – Gestionnaire d'interface qui contrôle les popups (filtres, basemap, about), toggle les panneaux latéraux, met à jour les compteurs et badges, et gère l'accessibilité (focus trap, ARIA).

**`eventbindings.js`** – Coordinateur d'événements qui lie les clics aux actions (navigation, filtres, carte), reset les états lors des changements de vue, et synchronise les interactions entre modules.

**`modalnavigation.js`** (11 KB) – Gestionnaire de modales avancé avec historique de navigation, fermeture au clic extérieur/ESC, gestion du focus piégé, et animations d'ouverture/fermeture fluides.

#### **Couche Filtres**

**`filtermodule.js`** – Store minimaliste qui stocke les critères actifs par couche dans un objet simple, expose une API CRUD (`set`, `get`, `reset`, `resetAll`), et persiste les sélections en mémoire.

**`filtermanager.js`** (7 KB) – Logique de filtrage qui construit dynamiquement l'UI des filtres depuis Supabase, génère les sous-filtres contextuels selon les propriétés GeoJSON, applique les critères aux features pour masquer/afficher, et compte les résultats visibles.

#### **Couche Contribution**

**`contrib.js`** (100 KB) – Système complet de contribution organisé en stepper multi-étapes : 1) métadonnées (nom, catégorie, description), 2) géométrie (dessin sur carte ou upload GeoJSON), 3) validation et preview. Gère l'édition de contributions existantes, l'upload de fichiers vers Supabase Storage, et la soumission finale avec génération d'URLs publiques.

**`contrib/` (24 fichiers)** – Sous-modules spécialisés : `contrib-list.js` (liste des contributions avec infinite scroll), `contrib-geometry.js` (outils de dessin Leaflet.draw), `contrib-city-context.js` (contexte ville unifié), plus des templates HTML pour les modales d'interface.

#### **Couche Ville (multi-tenancy)**

**`citymanager.js`** (20 KB) – Gestionnaire multi-villes qui charge les villes valides depuis Supabase, résout la ville active (ordre : URL `?city=`, localStorage, null pour mode global), initialise l'UI dropdown de sélection, et applique la vue initiale (zoom, centre GPS).

**`citybranding.js`** (6 KB) – Système de branding personnalisé qui charge les couleurs depuis Supabase (`city_branding`), génère automatiquement les variations (alpha-08, alpha-20, hover, etc.), et injecte les variables CSS pour adapter toute l'interface à la charte de la ville.

**`city-redirect.js`** (9 KB) – Gestionnaire de redirections qui détecte les URLs legacy (`/lyon`, `/besancon`) et redirige proprement vers `/?city=lyon`, gère les cas edge (404, ville invalide), et préserve les query params existants.

#### **Modules utilitaires**

**`searchmodule.js`** (12 KB) – Recherche d'adresse via API Adresse (data.gouv), affichage des résultats en liste, ajout d'un marqueur à la sélection, et recentrage automatique de la carte avec zoom adapté.

**`geolocation.js`** (13 KB) – Géolocalisation HTML5 qui demande l'autorisation utilisateur, affiche la position avec un marqueur + cercle de précision, gère les erreurs (permission refusée, timeout), et recadre la carte.

**`ficheprojet.js`** (26 KB) – Moteur de pages fiche complètes qui charge les `.html` statiques, parse le Markdown avec front-matter, affiche la couverture en hero, charge la géométrie sur la carte, et gère les galeries de médias.

**`thememanager.js`** (6 KB) – Gestionnaire de thèmes qui détecte le thème système (clair/sombre), permet le toggle manuel, persiste le choix dans localStorage, et synchronise avec les basemaps (mode sombre = fond sombre).

**`markdownutils.js`** – Convertisseur Markdown qui utilise Marked.js, prétraite les directives custom (::banner{type=info}), extrait le front-matter YAML avec validation, et sanitize le HTML produit.

**`cameramarkers.js`** (7 KB) – Affichage des photos géolocalisées depuis `image_metadata`, markers cliquables avec popup image, clustering optionnel si trop de points, et chargement différé des images.

**`travauxmodule.js`** (20 KB) – Module spécialisé travaux avec timeline des chantiers, graphiques donut de progression (SVG custom), filtres par statut (en cours, terminé, planifié), et alertes de perturbations.

**`submenumodule.js`** (14 KB) – Gestion des sous-menus de navigation avec transitions CSS fluides, état réduit/étendu persistant, animations d'items en cascade (stagger), et gestion du focus clavier.

### Système de design

L'application utilise un **design system cohérent** basé sur 17 fichiers CSS organisés en cascade :

#### **Architecture CSS en couches**

```
00-colors.css       → Variables de couleurs + dark mode
01-base.css         → Reset CSS + typographie de base
02-layout.css       → Grilles, containers, structure
03-navigation.css   → Menus, onglets, navigation
04-components.css   → Composants globaux + scrollbars
gp-button-system.css→ Système de boutons unifié
gp-card-system.css  → Système de cartes réutilisables
gp-markdown-content.css→ Styles de rendu Markdown
05-map.css          → Carte Leaflet, overlays, tooltips
06-modals.css       → Modales, popups, overlays
08-responsive.css   → Media queries mobile-first
```

#### **Système de couleurs adaptatif**

Toutes les couleurs sont définies via **variables CSS natives** qui s'inversent automatiquement en dark mode. Les variables de base (`--color-primary`, `--gray-*`) génèrent des variations calculées (`--primary-alpha-08`, `--gray-300`). Les alias sémantiques (`--text-primary`, `--surface-base`, `--border-medium`) référencent ces variables, permettant un changement de thème instantané sans réécriture CSS.

En mode sombre, les grays sont inversés (`--gray-50` devient `#0f172a`, `--gray-900` devient `#f8fafc`), les opacités blanc/noir sont échangées, et les couleurs d'accent sont adoucies pour réduire la fatigue oculaire. Le résultat : 360 lignes de variables génèrent automatiquement deux thèmes complets.

#### **Composants unifiés**

**Boutons** : deux classes de base (`.btn-primary` pour les actions principales, `.btn-secondary` pour les actions secondaires) avec variants (`.btn-danger`, `.btn-info`) et tailles (`.btn-small`, `.btn-large`). Cette unification a supprimé ~400 lignes de CSS redondant tout en garantissant une cohérence parfaite sur 100% des boutons de l'application.

**Cartes** : structure `.gp-card` avec header/body/footer, variants thématiques (`--media`, `--info`, `--link`, `--documents`), et système de grille `.gp-card-grid`. Design moderne avec border-radius 16px, ombres multicouches, et animations fluides au hover.

**Scrollbars** : style Apple minimaliste (6px de largeur, transparentes par défaut, visibles au hover) qui s'adaptent automatiquement au thème via `var(--border-medium)`. Compatible Firefox (`scrollbar-width: thin`) et Webkit (`::-webkit-scrollbar`).

#### **Responsive mobile-first**

Les media queries partent du mobile et ajoutent des règles au fur et à mesure que l'écran grandit. Sur mobile (≤ 720px), la navigation est fixée en bas (position: fixed, bottom: 20px), les panneaux deviennent des overlays en fullscreen, et les submenus/détails utilisent `position: fixed` pour une référence viewport commune. Sur desktop (≥ 1024px), la navigation reprend sa position latérale classique, les panneaux s'affichent côte à côte, et les toggles mobiles sont masqués.

### Gestion des données

#### **Architecture Supabase**

La base PostgreSQL contient 11 tables principales organisées en 3 domaines :

**Configuration** : `layers` (couches cartographiques avec URLs GeoJSON et styles), `filter_categories` + `filter_items` (filtres dynamiques hiérarchiques), `basemaps` (fonds de carte avec attributions), `metro_colors` (couleurs des lignes de transport).

**Contenu** : `contribution_uploads` (table unifiée pour tous les projets contributifs avec métadonnées, URLs GeoJSON/images/Markdown, et champ `ville`), `consultation_dossiers` (documents officiels PDF), `image_metadata` (photos géolocalisées avec latitude/longitude).

**Ville** : `cities` (villes valides avec nom, limites GPS, zoom par défaut), `city_branding` (couleurs primaires personnalisées par ville).

**Sécurité RLS** : lecture publique via rôle `anon` (pas de clé secrète exposée), écriture authentifiée pour les contributions (magic link email), et isolation par ville au niveau des requêtes (filtrage via colonne `ville`).

#### **Format GeoJSON standard**

Toutes les géométries respectent la spec RFC 7946 : FeatureCollection avec tableau de Features, chaque Feature ayant une geometry (Point/LineString/Polygon) en coordonnées WGS84 et un objet properties libre. Les properties sont exploitées pour le filtrage (`project_name`, `status`, `line`) et l'affichage (tooltips, styles conditionnels).

#### **Cache multi-niveaux**

**Cache mémoire** : objet `simpleCache` qui stocke les GeoJSON fetchés avec gestion de taille maximale (CacheManager). Les requêtes identiques ne déclenchent qu'un seul fetch réseau.

**Cache navigateur** : les ressources statiques (CSS, JS, images) utilisent les en-têtes HTTP standards (Cache-Control, ETag). Les fonds de carte Leaflet sont automatiquement mis en cache par le navigateur.

**Chargement différé** : les couches ne se chargent que lorsqu'elles sont activées (clic sur catégorie), les fiches Markdown se fetchent au clic sur un projet, et les images utilisent l'attribut `loading="lazy"` natif.

#### **Fichiers Markdown avec métadonnées**

Les fiches projet combinent front-matter YAML et contenu Markdown. Le front-matter est extrait via regex (`---\n...\n---`), parsé en objet JavaScript, puis utilisé pour générer l'UI (cover hero, chips itinéraire/trafic, description). Le corps Markdown est converti en HTML via Marked.js avec support des directives custom (::banner{type=info}).

Avantage : les fichiers restent éditables dans un éditeur de texte simple, versionnables avec Git, et ne nécessitent aucune base de données pour être mis à jour. Un nouveau projet = un nouveau fichier `.md`.

---

## 🚀 Démarrage rapide

### Installation

```bash
# 1. Cloner le repository
git clone https://github.com/your-org/grandsprojets.git
cd grandsprojets

# 2. Installer les dépendances (tests uniquement)
npm install

# 3. Lancer le serveur de développement
npm run start
# → Ouvre http://localhost:3000
```

### Tests automatisés

```bash
# Lancer les tests en mode UI
npm run test:contrib:ui

# Lancer tous les tests
npm test

# Générer un rapport de tests
npm run test:report
```

### Déploiement

L'application est un **site statique** déployable sur :
- **Netlify** (recommandé, CI/CD automatique)
- **Vercel**
- **GitHub Pages**
- **Windsurf Deploy**

Aucun build n'est requis, tous les fichiers sont prêts à être servis.

---

## 📝 Documentation complète

Pour une documentation technique détaillée :
- Consulter les commentaires inline dans chaque module JavaScript
- Voir la structure des tables Supabase dans les migrations
- Lire les tests Playwright pour comprendre les flux utilisateur

---

## 📄 Licence

ISC License – Voir le fichier [Licence.md](./Licence.md)

---

## 🤝 Contribuer

Les contributions sont les bienvenues ! Pour contribuer :

1. Fork le projet
2. Créer une branche (`git checkout -b feat/ma-feature`)
3. Commiter les changements (`git commit -m 'Ajout de ma feature'`)
4. Pusher (`git push origin feat/ma-feature`)
5. Ouvrir une Pull Request

**Style de code** :
- JavaScript ES6+ sans bundler
- Modules exposés sur `window.*`
- CSS natif avec variables
- Commits clairs et atomiques

---

## 📧 Contact

Pour toute question ou suggestion : contact@grandsprojets.com

---

**Dernière mise à jour** : Octobre 2025
