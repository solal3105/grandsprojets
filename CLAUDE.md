# Grands Projets - Carte interactive des projets urbains

## Commandes

```bash
npm run dev          # Netlify Dev → :3001 (site + fonctions serverless + edge functions)
npm run lint         # oxlint (pas d'ESLint) - 0 warning, 0 error exigé
npm test             # Playwright - suite complète (~5 min) - UNIQUEMENT si changement transversal
npx playwright test tests/admin.categories.spec.js  # cibler un fichier
npx playwright test --grep "3.2.16"                 # cibler un test
```

Build home : `cd home-src && npm ci && npm run build` → output dans `/home/`.

## Architecture

| Zone | Stack |
|---|---|
| **Carte** (`/index.html` + `main.js` à la racine) | Vanilla JS, modules IIFE sur `window`, pas de bundler |
| **Admin** (`/admin/`) | Vanilla JS, **ES modules**, routeur pushState custom |
| **Fiche** (`/fiche/`) | Vanilla JS, IIFE autonome (`fiche-v2.js`) |
| **Cartes des communes** (`/cartes/`) | Vanilla JS, module ES (`cartes.js` + `catalogue.js` partagé avec l'edge `cartes`), page site + écran de salon `?kiosk=1` - doc `cartes/README.md` |
| **Home** (`/home-src/` → `/home/`) | Vue 3 + Vite + Tailwind, build séparé |
| **Fonctions** (`/netlify/functions/`) | Node.js ESM `.mjs`, Netlify Functions v2 |
| **Edge Functions** (`/netlify/edge-functions/`) | SEO/SSR : `domain-redirect`, `fiche-ssr`, `ville-hub`, `home-seo`, `cartes` - routes dans `netlify.toml [[edge_functions]]` - doc `docs/seo.md` |

## Patterns de code

### Modules carte (`modules/*.js`)
- **IIFE sur `window`** : `window.Module = (() => { ... return {...}; })();`
- Communication inter-modules via `window` globals + optional chaining : `window.FilterManager?.syncUI?.()`
- **NE PAS** convertir en ES modules - l'ordre de chargement dans `index.html` en dépend
- `modules/ui/toggles.js` est la seule exception : `<script type="module">`
- `main.js` (à la racine du repo, pas dans `modules/`) orchestre l'init en phases **0→9**, avec sous-phases : 0a (SSO Phaos), 0b (health-check localStorage), 2.5 (branding), 5.5 (layers par défaut)

### `window.L` N'EST PAS Leaflet
`maplibre-compat.js` expose un shim `window.L` (API Leaflet → MapLibre GL JS en interne). Ne jamais importer Leaflet. Les couches GeoJSON passent par `datamodule.js` (`createGeoJsonLayer`) et `layerregistry.js`.

### SSO Phaos (iframe Azure AD B2C)
Quand la carte tourne dans une iframe Phaos (`window.self !== window.top`), `modules/phaos-auth.js` intercepte l'init : il attend le token Azure B2C envoyé par `postMessage` (origines strictement allowlistées dans `PHAOS_ORIGINS` - c'est le garde-fou de sécurité), l'échange contre une session Supabase via `/api/auth/token`, puis débloque `main.js` (Phase 0a). Hors iframe : aucun effet. Doc complète : `phaos-integration.md` à la racine.

### Admin (`admin/*.js`)
- ES modules - seul sous-projet à les utiliser côté navigateur
- Accède à `window.supabaseService` et `window.AuthModule` (chargés par le HTML parent)
- État : `admin/store.js` (pub/sub simple) - Routeur : `admin/router.js`
- Sections dans `admin/sections/` : `categories`, `contributions`, `structure`, `travaux`, `users`, `villes`, `modules` (cette dernière = gestion des modules par ville, global-admin uniquement), `diagnostic` (dossier `diagnostic/` en modules ES - carte MapLibre plein écran, couches par ville dans `diagnostic_layers`, analyse IA de zone, rapports dans `diagnostic_reports` ; cleanup carte via `router.setBeforeNavigate`)

### Modules carte - architecture découplée

La carte publique utilise un **système de modules enregistrables** piloté par la table Supabase `city_modules`. Chaque ville définit ses modules actifs (carte, travaux, etc.) sans code spécifique dans le tronc commun.

| Couche | Rôle |
|---|---|
| **`city_modules`** (Supabase) | Source de vérité : `(ville, module_key, label, icon_class, sort_order, enabled, config)` |
| **`sidebar.js`** | Génère les boutons modules depuis `win._cityModules` |
| **`nav-panel.js`** | Contrôleur 3 niveaux (L1→L3) + registre `registerModule(key, renderer)` |
| **`modules/carte/carte-nav.js`** | Renderer carte : L2 = catégories, L3 = contenu catégorie |
| **`modules/travaux/travaux-nav.js`** | Renderer travaux : L2 = sections (timeline/admin/contrib), L3 = vue |
| **`modules/travaux/travaux-views.js`** | Builders partagés : `buildTimeline`, `buildFilters`, `buildAdmin`, `buildContributor`, `drawPanelHTML`, `bindListActions` |

**Ajouter un module :**
1. Créer `modules/<key>/<key>-nav.js` - IIFE exposant `win.<Key>Nav` avec `register()` qui appelle `NavPanel.registerModule(key, { renderL2, renderL3, clearLayers, onBack, onClose })`
2. Ajouter le `<script>` dans `index.html` après `nav-panel.js`
3. Appeler `win.<Key>Nav?.register()` dans `main.js` Phase 5
4. Insérer une ligne dans `city_modules` pour chaque ville qui active ce module
5. Ajouter le template dans `MODULE_TEMPLATES` de `admin/sections/modules.js`

### Home (`home-src/`)
- Vue 3 Composition API (`<script setup>`), Tailwind 3.4, primary `#FF0037`, icônes `lucide-vue-next`
- **Ne pas éditer `/home/`** - artefacts de build

#### Règles de développement Home

**Fichiers et build**
- Toujours éditer dans `home-src/src/` - jamais dans `/home/` (build artifact commité)
- Builder après chaque série de changements : `cd home-src && npm run build`
- Serveur de dev local : `cd home-src && npm run dev` → `:5173` (Vite HMR, pas Netlify Dev)

**Composants et réutilisabilité**
- Avant d'écrire du markup, chercher un composant existant : `TrustBar`, `CtaSection`, `HeroSection`, `TheHeader`, `TheFooter`, `LogoSvg`
- Toute logique UI répétée (tilt 3D, scroll-reveal) → extraire en composable dans `src/composables/` (existants : `useTilt`, `useScrollReveal`)
- Toute structure de données partagée entre vues (navLinks, catégories aide) → extraire dans `src/data/`
- Ne jamais redéfinir `navLinks` - il est partagé entre header et footer via `src/data/navLinks.js`

**Couleurs et tokens**
- Utiliser exclusivement les classes Tailwind définies dans `tailwind.config.js` : `text-primary`, `bg-dark`, `text-gray-text`, `border-gray-border`, etc.
- **Jamais** de couleur hexadécimale ou `rgba()` inline dans `style=` - si une couleur manque dans le config, l'y ajouter
- La `box-shadow` de référence pour les cards est dans le config ou une classe utilitaire - ne pas la copier en inline

**Supabase**
- Toute requête Supabase passe par `src/lib/supabase.js` (instance unique) - ne jamais instancier `createClient` dans une vue

**URL et variables d'environnement**
- L'URL de base de production (`https://openprojets.com/home`) et les URLs d'exemple ne doivent pas être dupliquées - les centraliser ou utiliser `import.meta.env`
- Chemins d'assets : toujours `` `${import.meta.env.BASE_URL}img/...` `` - jamais de chemin absolu `/img/...` ou `/home/img/...` hardcodé
- Toute nouvelle page home indexable → ajouter sa route `home-seo` dans `netlify.toml [[edge_functions]]`
- Titre et description d'une page home : définis **deux fois**, dans `src/router/index.js` (rendu client + pré-rendu) et dans `netlify/edge-functions/home-seo.js` (réécriture à la volée) - les garder identiques

### Design system - `ds-bundle/` (généré)
`.design-sync/config.json` pilote un export **tokens-only** du design system vers `ds-bundle/` (sources de vérité : `home-src/tailwind.config.js` + `home-src/src/style.css`). Ne jamais éditer `ds-bundle/` à la main - modifier les sources de tokens puis re-synchroniser.

### Fonctions Netlify (`netlify/functions/*.mjs`)
- CORS géré manuellement dans chaque fonction
- `ai-generate.mjs` : protégée par JWT Supabase (vérif via `/auth/v1/user`) - `OPENAI_API_KEY` injectée automatiquement par `netlify dev`
- `ai-diagnostic.mjs` : analyse IA de zone (Diagnostic terrain) - JWT + vérification serveur du rôle admin/ville, sortie JSON contrainte (`json_schema` strict), SSE - route `/api/ai-diagnostic`
- `auth-token.mjs` : échange token Azure B2C → session Supabase (SSO Phaos), vérif JWKS - route `/api/auth/token`
- `contributions-geojson`, `travaux-geojson`, `sitemap`, `llms-txt` : GET publics (CORS seul, pas d'auth)
- `sitemap` et `llms-txt` partagent `lib/projects-index.mjs` : lecture **paginée** de `contribution_uploads` (PostgREST plafonne à 1 000 lignes par réponse, silencieusement), filtres et doublons identiques - toute lecture complète d'une table passe par `fetchAllRows`

### Edge Functions (`netlify/edge-functions/`)
- `domain-redirect` (toutes les routes), `fiche-ssr` (pré-rendu SEO de `/fiche/*/*/*`, 301 des anciennes adresses `/fiche/?cat=&project=`, canonical des doublons vers la page la plus ancienne), `ville-hub` (`/ville/` = index des villes, `/ville/{ville}` = hub), `home-seo` (meta SSR des pages home), `cartes` (`/cartes/`)
- Routées via `[[edge_functions]]` dans `netlify.toml` - pas de détection automatique par chemin

### Mesure d'audience (`modules/analytics.js`)
Module PostHog **partagé par les 9 espaces**, chargé par une balise
`<script defer src="/modules/analytics.js" data-op-space="<espace>">`. Expose
`window.OPAnalytics` (`capture`, `pageview`, `identify`, `reset`, `setCity`,
`optOut`). Toujours appeler en optional chaining : un bloqueur de traceurs
peut empêcher le chargement, aucune fonctionnalité ne doit en dépendre.
- Clé projet et région : **une seule constante** en tête du module + le proxy
  inverse `/ph/*` de **`_redirects`** (pas `netlify.toml` : ses règles sont
  évaluées APRÈS celles de `_redirects`, dont le catch-all `/*` absorberait tout).
- SPA (admin, home) : `data-op-pageview="manual"`, les pages vues sont émises
  par le routeur. Le home injecte sa balise via le plugin `sharedAnalytics` de
  `home-src/vite.config.js` (sinon Vite préfixerait l'URL par `/home/`).
- Se désactive tout seul sous `navigator.webdriver` : la suite Playwright et le
  prérendu du home n'émettent jamais rien (couvert par `tests/unauth.analytics.spec.js`).
- Refus visiteur : `/home/confidentialite` ou `?tracking=off` sur n'importe quelle URL.
- Doc complète : `docs/analytics.md`. GA4 reste en place en parallèle.

## Supabase
- Client instancié une seule fois sur `win.__supabaseClient` (partagé `auth.js` + `supabaseservice.js`)
- **Couches par ville** : table `layers` (`name`, `url`, `style` jsonb, `is_default`, `icon`). Un tracé portant `properties._color` est colorié par la donnée (expression MapLibre native du shim) - JAMAIS de table de correspondance de couleurs par ville. C'est le contrat des couches `transports` générées depuis OpenStreetMap par `netlify/functions/lib/transit-osm.mjs` (transport lourd uniquement : métro/tram/funiculaire, une entité par ligne, couleur officielle, opacité 0.55, affichée par défaut) ; une catégorie `category_icons` avec `layers_to_display` en fait un filtre activable dans le panneau carte (une catégorie peut exister par ses seules couches, sans fiche)
- `window.supabaseService` = couche données centralisée - toute requête passe par là
- **City-scoping** : toujours `supabaseService.getActiveCity()` (fallback `metropole-lyon`)
- Clé anon hardcodée (RLS protège les données) - cache TTL 10 min dans `datamodule.js` (override : 1 h pour `layer_travaux`)

## CSS

- Pas de build CSS pour la carte - chaque feuille est chargée par un `<link>` individuel dans `index.html`. **L'ordre réel = l'ordre des `<link>`** (`00-colors.css` toujours en premier). La numérotation `00-` → `14-` est indicative, pas exhaustive (fichiers non numérotés : `gp-*`, `hover-popup`, `demo-banner`). Nouvelle feuille → ajouter le `<link>` dans `index.html`.
- Nommage BEM-like : `dock-panel__header`, préfixe `gp-` pour les composants carte, états `.is-active / .is-visible` (du legacy `.active` / `.open` subsiste - tout nouveau code en `.is-*`)
- **Transitions : PAS de `*` global.** `01-base.css` applique `transition: all 0.3s ease-in-out` à une allowlist de sélecteurs (`a`, `button`, `input`, `[class*="btn"]`, `[class*="card"]`, …). Un nouvel élément animé doit y être ajouté ou définir sa propre transition. Les exemptions MapLibre (`.maplibregl-* { transition: none !important }`) sont en place - ne pas les casser.

### Couleurs - 3 couches (ne pas bypasser)
1. **Tokens** : `--color-primary #14AE5C`, `--color-danger #EF4444`, `--color-info #2563EB`, `--color-warning #F59E0B`, `--color-success #10B981` + `--gray-50`→`--gray-900` (`--primary` existe comme alias de `--color-primary`)
2. **Variantes alpha** : `--primary-alpha-12` (fond), `--primary-alpha-35` (bordure) - via `color-mix()`. `00-colors.css` ne contient **que les paliers réellement consommés** (audit code mort 2026-07) : un palier manquant s'ajoute au fichier, on n'invente pas un `var()` qui n'existe pas.
3. **Alias sémantiques** (à utiliser dans tout nouveau CSS) : `--text-primary/secondary/tertiary`, `--surface-base/raised/overlay`, `--border-light/medium`

**Pattern badge/pill** : `color: var(--primary); background: var(--primary-alpha-12); border: 1px solid var(--primary-alpha-35); border-radius: 999px;` (référence : `.etat-pill` dans `04-components.css`)

### Dark mode
Activé par `html[data-theme='dark']`. Le bloc dark de `00-colors.css` redéfinit l'échelle `--gray-*`, les alias sémantiques et les tokens d'état - **c'est le SEUL fichier autorisé à le faire**. Dans un CSS de composant, un bloc `[data-theme='dark']` ne touche que des tokens locaux de composant (`--dock-bg`, `--sb-bg`, …), jamais les alias sémantiques ni les tokens globaux.
- `box-shadow` : toujours `rgba(0,0,0,...)` hardcodé
- Hover dark : `color-mix(in srgb, var(--color-primary) 115%, white)` (s'éclaircit)

### Glassmorphism
Signature commune des panneaux : fond translucide clair + `backdrop-filter: blur(28-44px) saturate(160-180%)` + shimmer `inset 0 1.5px 0 rgba(255,255,255,0.95)` - **le shimmer est la signature visuelle, toujours présent**. Les panneaux existants portent leur fond dans un token de composant (`--dock-bg`, `--sb-bg`, `--nav-panel-bg`). Pour un NOUVEAU panneau : `background: color-mix(in srgb, var(--surface-base) 75%, transparent)` + `backdrop-filter: blur(16px) saturate(160%)` + le shimmer signature (référence : boutons flottants de `04-components.css`).

### Rayons / Spacing / Animations
- Panneaux `18-22px` (nav-panel 18, dock 20, sidebar 22), cards `16px`, boutons `11-14px`, pills `999px` - spacing multiples de 4px
- Durée standard : `0.3s ease-in-out` - rebond : `cubic-bezier(0.34, 1.56, 0.64, 1)` - entrée panneau : `cubic-bezier(0.16, 1, 0.3, 1)`
- Hover bouton flottant : `scale(1.08)` - bouton fermer : `scale(1.12) rotate(90deg)`

## Sécurité
- `SecurityUtils.escapeHtml()` pour toute injection DOM de contenu utilisateur
- `SecurityUtils.sanitizeUrl()` pour les liens externes (bloque `javascript:`, `data:text/html`)
- Valider les codes ville : `/^[a-z0-9-]+$/i`
- Refresh token proactif toutes les 4 min, graceful degradation après 3 échecs
- SSO Phaos : ne jamais élargir `PHAOS_ORIGINS` sans validation - c'est l'unique barrière contre les postMessage forgés

## Conventions
- **Jamais de tirets longs** (U+2013, U+2014, U+2015) : nulle part (code, commentaires, UI, docs, commits). Tiret simple `-` uniquement.
- Code **anglais**, commentaires/logs **français** - Pas de TypeScript
- Icônes : Font Awesome 6.2 (`fas fa-*`) - Home : `lucide-vue-next`
- Données configurables → Supabase (jamais de mapping JS/CSS hardcodé)

## Tests - Règles

**Feature ajoutée = tests écrits. Bug fixé = test de non-régression.**

### Workflow
1. Implémenter la feature (ou corriger le bug)
2. Écrire les tests dans `tests/admin.*.spec.js` (ou `invited.*.spec.js` si rôle contributeur, `unauth.*.spec.js` si public). **Bug fixé → test de non-régression obligatoire SI le bug est testable en E2E** (voir « Ce qui n'est PAS testable ») ; sinon, le signaler dans le message de commit et passer à l'étape suivante.
3. **Lancer uniquement le fichier spec concerné** - pas la suite complète à chaque itération :
   ```bash
   npx playwright test tests/admin.categories.spec.js
   npx playwright test tests/admin.categories.spec.js --grep "3.2.16"
   ```
4. Avant de pousser : **ne relancer que les tests impactés par le changement**. `npm test` (suite complète) uniquement si le changement est transversal (helpers partagés, auth, routeur, CSS global…). Un fix localisé dont le spec ciblé passe → pousser sans la suite complète. Si aucun spec ne couvre la zone modifiée, le lint suffit.
5. `npm run lint` - 0 warning, 0 error

### Structure des tests
- 1 fichier par section, numérotation `2.7.1`, `2.7.2`...
- Helpers : `waitForBoot(page, path = '/admin/')` et `clearToasts(page)` - **dupliqués inline en tête de chaque spec** (pas de fichier helper partagé) : copier depuis un spec existant
- Projets Playwright : `setup` → `admin` + `invited` → `admin-logout` ; `unauth` ne dépend que de `setup` (tourne en parallèle des autres)
- Toasts admin : `.adm-toast--success / --error / --warning` (≠ `.gp-toast` de la carte)

### Projets Playwright - ordre garanti
`admin.z-logout.spec.js` appelle `signOut()` qui révoque le token Supabase côté serveur (global scope). Ce fichier est isolé dans le projet `admin-logout` avec `dependencies: ['admin', 'invited']` - il tourne toujours EN DERNIER. Ne jamais le déplacer dans le projet `admin`.

### CSS et `[hidden]`
Si un composant utilise `element.hidden = true`, ajouter en CSS : `.mon-composant[hidden] { display: none; }`

### Transitions et `transitionend` en headless
`transitionend` ne se déclenche pas toujours en headless. Pour tout composant qui repose dessus pour `hidden = true`, ajouter un fallback :
```js
let done = false;
const hide = () => { if (!done && el) { done = true; el.hidden = true; } };
el.addEventListener('transitionend', hide, { once: true });
setTimeout(hide, 250); // fallback headless
```

### Ce qui n'est PAS testable en E2E actuellement
- **Villes** : nécessite un compte global-admin (non configuré)
- **Draw tools** : WebGL requis (MapLibre en headless)
- **Diagnostic terrain - rendu carte, lasso, flux IA** : WebGL requis ; le dock (CRUD des couches, wizard) est volontairement indépendant de la carte et se teste sans WebGL
- **Démo salon - scène WebGL** : fond de carte, rejeu de scène à la bascule de thème (`MapFX.setTheme`) - WebGL requis ; l'attribut `data-theme`, l'interrupteur et sa persistance se testent sans (section 0.35)
- **Drag-drop reorder** : interactions Playwright DnD complexes
- **SSO Phaos** : l'échange de token Azure B2C réel (l'intégration iframe est testée avec token factice dans `unauth.phaos-iframe.spec.js`)

### Couverture - lacunes connues (compte réel : `ls tests/*.spec.js | wc -l`)
La suite couvre l'**admin**, la **carte publique** (UI/navigation), la **fiche** (`unauth.fiche.spec.js` : boot, canonical, og:url, JSON-LD) et la **mesure d'audience** (`unauth.analytics.spec.js` : chargement par espace, garde-fous, refus visiteur). Aucun test sur :

**Carte publique** : `feature-interactions.js` (markers), vues de `modules/travaux/`, `lightbox.js`, `geolocation.js`, `layerregistry.js`, `datamodule.js`, `citybranding.js` / `citymanager.js`

**Home Vue SPA** : toutes les vues (`HomeView`, `HelpView`, `FeaturesView`, etc.) - aucun test E2E

**Admin** : édition/suppression catégorie, upload Supabase Storage, comportement hors-ligne, refresh token

**Edge Functions** : `home-seo`, `domain-redirect` - aucun test dédié (`fiche-ssr` et `ville-hub` sont couverts par `unauth.fiche` / `unauth.ville`, le sitemap par `unauth.sitemap`)

## Pièges courants
- `modules/ui/toggles.js` est le seul `<script type="module">` de la carte
- `main.js` est à la racine du repo, pas dans `modules/`
- L'admin charge `auth.js` et `supabaseservice.js` via `<script>` → les IIFE doivent rester fonctionnelles
- Éditer `/home-src/**`, jamais `/home/**` (build) - idem `ds-bundle/**` (généré par design-sync)
- `activeCity` : toujours via `supabaseService.getActiveCity()` (3 sources possibles)
- Transitions : allowlist dans `01-base.css` - un nouvel élément n'est PAS animé par défaut ; exemptions MapLibre à préserver
- En iframe Phaos, l'init carte attend le SSO (Phase 0a) - en navigation directe, aucun effet

## Règle absolue - Pas de données métier dans le code
Labels, icônes, couleurs, URLs, ordres, activation → **table Supabase** (colonnes `label`, `icon`, `sort_order`, `active`). En cas de doute, demander avant de coder.
