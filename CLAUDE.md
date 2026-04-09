# Grands Projets — Carte interactive des projets urbains

Voir @package.json pour les scripts npm et @netlify.toml pour la config de déploiement.

## Commandes

```bash
npm run dev          # Netlify Dev sur :3001 (inclut les fonctions serverless)
npm run lint         # oxlint . (pas d'ESLint)
npm test             # Playwright (npm run test:ui pour le mode interactif)
```

Build Netlify : `cd home-src && npm ci && npm run build` (output dans `/home/`).

## Architecture

Le projet est un **site statique multi-pages** (pas un SPA unique) déployé sur Netlify :

| Zone | Stack | Modules |
|---|---|---|
| **Carte** (`/index.html`) | Vanilla JS, IIFE sur `window`, pas de bundler | `modules/*.js` chargés synchrones via `<script>` |
| **Admin** (`/admin/`) | Vanilla JS SPA, **ES modules** (`import`/`export`) | `admin/*.js`, routeur hash custom |
| **Fiche** (`/fiche/`) | Vanilla JS, IIFE autonome | Réutilise les modules via `window` globals |
| **Home** (`/home-src/` → `/home/`) | Vue 3 + Vite + Tailwind | Projet séparé, build indépendant |
| **Fonctions** (`/netlify/functions/`) | Node.js ESM (`.mjs`) | Netlify Functions v2 |

## Patterns de code — IMPORTANT

### Modules de la carte (modules/*.js)

- **IIFE assignées à `window`** : `;(function(win) { ... win.Module = Module; })(window);` ou `window.Module = (() => { ... return {...}; })();`
- **Seule exception** : `modules/ui/toggles.js` est un ES module (`<script type="module">`)
- Communication inter-modules **uniquement via `window` globals** avec optional chaining défensif : `window.FilterManager?.syncUI?.()`
- **NE PAS** convertir les modules existants en ES modules — l'ordre de chargement dans `index.html` en dépend
- `main.js` orchestre l'init en 9 phases (Phase 0 → Phase 8)

### `window.L` N'EST PAS Leaflet

`maplibre-compat.js` expose un shim `window.L` avec une API Leaflet (`L.map()`, `L.marker()`, `L.geoJSON()`, etc.) qui utilise **MapLibre GL JS** en interne. Ne jamais importer Leaflet. Pour les couches performantes (fill, line, circle), utiliser `maplibre-renderer.js` qui ajoute des sources/layers MapLibre natifs.

### Admin (admin/*.js)

- **ES modules** avec `import`/`export` — c'est le seul sous-projet qui les utilise côté navigateur
- Accède à `window.supabaseService` et `window.AuthModule` (chargés par le HTML parent)
- État centralisé dans `admin/store.js` (pub/sub simple)
- Routeur custom dans `admin/router.js` (pushState + hash fallback)

### Home (home-src/)

- **Vue 3 Composition API** (`<script setup>`)
- Tailwind CSS 3.4 — palette séparée (primary = `#FF0037`, ≠ carte)
- Build via Vite → output dans `../home/`
- **Ne pas éditer les fichiers dans `/home/`** — ce sont des artefacts de build

### Fonctions Netlify

- ESM Node.js (`.mjs`), export default ou `export const handler`
- CORS géré manuellement dans chaque fonction
- Auth : vérification JWT Supabase via `/auth/v1/user`

## Supabase

- Client UMD chargé via CDN, instancié une seule fois sur `win.__supabaseClient` (partagé entre `auth.js` et `supabaseservice.js`)
- `window.supabaseService` est la couche données centralisée — toute requête passe par là
- **City-scoping** : quasi toute requête filtre par `getActiveCity()`. Fallback : `metropole-lyon`
- Clé anon hardcodée (normal — RLS protège les données)
- Cache mémoire avec TTL dans `datamodule.js` (10 min par défaut)

## CSS

- **Pas de build CSS** pour la carte — fichiers bruts importés via `@import url()` dans `style.css`
- Architecture numérotée : `00-colors.css` → `01-base.css` → ... → `08-responsive.css`
- Système de couleurs basé sur 5 tokens (`--color-primary`, `--color-danger`, `--color-info`, `--color-warning`, `--color-success`) + variantes via `color-mix(in srgb, ...)`
- Thème sombre via `[data-theme="dark"]`
- Nommage BEM-like : `dock-panel__header`, `gp-sidebar__btn--module`, `etat-pill.etat--ouvert`
- Préfixe `gp-` pour les composants sidebar
- États : `.is-active`, `.is-open`, `.is-visible`
- `* { transition: all 0.3s ease-in-out; }` global (avec exemptions MapLibre)
- Support `prefers-reduced-motion: reduce`

## Design

### Système de couleurs — 3 couches

Le système repose sur **3 couches imbriquées** définies dans `styles/00-colors.css`.

#### Couche 1 — Tokens de base (5 couleurs sémantiques + échelle de gris)

```css
--color-primary: #14AE5C;   /* vert — actions, états actifs */
--color-danger:  #EF4444;   /* rouge — erreurs, suppressions */
--color-info:    #2563EB;   /* bleu — infos, liens, eyebrows */
--color-warning: #F59E0B;   /* orange — alertes, "prochain" */
--color-success: #10B981;   /* vert émeraude — progression travaux */

/* Échelle de gris (slate bleuté, light range) */
--gray-50 → --gray-900  /* du plus clair (#F8FAFC) au plus sombre (#0F172A) */
```

Ne jamais utiliser ces tokens directement dans le CSS — passer par les couches suivantes.

#### Couche 2 — Variantes alpha (calculées avec `color-mix`)

Chaque couleur dispose de variantes alpha nommées numériquement (le chiffre = % d'opacité) :

```css
--primary-alpha-12:  color-mix(in srgb, var(--color-primary) 12%, transparent);  /* fond léger */
--primary-alpha-35:  color-mix(in srgb, var(--color-primary) 35%, transparent);  /* bordure */
--primary-alpha-18:  ...  /* ombre colorée */
/* idem pour --danger-alpha-*, --info-alpha-*, --warning-alpha-* */
```

Ces variantes sont calculées à partir du token de base — elles héritent automatiquement des overrides dark mode.

**Pattern systématique badge/pill** (à appliquer partout) :
```css
color: var(--primary);
background: var(--primary-alpha-12);
border: 1px solid var(--primary-alpha-35);
```

#### Couche 3 — Alias sémantiques (à utiliser dans tout nouveau CSS)

Les alias pointent sur l'échelle de gris, et donc s'adaptent automatiquement au dark mode :

| Alias | Light | Usage |
|---|---|---|
| `--text-primary` | `--gray-900` | Texte principal |
| `--text-secondary` | `--gray-600` | Texte secondaire |
| `--text-tertiary` | `--gray-500` | Labels, metadata |
| `--text-disabled` | `--gray-400` | États désactivés |
| `--surface-base` | `--gray-50` | Fond de page / panneaux |
| `--surface-raised` | `--gray-50` | Cards, éléments surélevés |
| `--surface-overlay` | `--gray-100` | Fonds de dropdown, overlays |
| `--border-light` | `--gray-200` | Bordures discrètes |
| `--border-medium` | `--gray-300` | Bordures normales |
| `--border-strong` | `--gray-400` | Bordures accentuées |

### Comment fonctionne le dark mode

Le dark mode est activé par l'attribut `html[data-theme='dark']` (géré par `ThemeManager`).

**Mécanisme** : `html[data-theme='dark']` redéfinit **uniquement l'échelle de gris** en l'inversant — tout le reste découle automatiquement via la cascade CSS :

```
light: --gray-50 = #F8FAFC  ←→  dark: --gray-50 = #0F172A
light: --gray-900 = #0F172A ←→  dark: --gray-900 = #F8FAFC
```

Donc `--text-primary` (= `--gray-900`) passe automatiquement de quasi-noir à quasi-blanc. `--surface-base` (= `--gray-50`) passe de blanc à slate profond. **On ne redéfinit jamais les alias sémantiques** — ils suivent les gris.

**Ce qui s'inverse automatiquement :**
- `--gray-*` (toute l'échelle)
- `--text-*`, `--surface-*`, `--border-*` (alias → gris)
- `--white-alpha-*` → devient `rgba(15, 23, 42, N)` (slate sombre translucide)
- `--black-alpha-*` → devient `rgba(248, 250, 252, N)` (blanc translucide)
- Les variantes alpha `--primary-alpha-*` via `color-mix()` (recalculées sur fond dark)

**Ce qui ne s'inverse PAS — règles critiques :**
- `box-shadow` : toujours utiliser `rgba(0,0,0,...)` hardcodé, jamais `--black-alpha-*`
- Les couleurs sémantiques (`--color-danger`, etc.) restent les mêmes hue mais sont adoucies en dark avec des overrides explicites (`#f87171` au lieu de `#EF4444`)
- `--surface-60`, `--surface-92` : rgba hardcodés — ne pas utiliser dans le nouveau code

**En dark, les hover/active s'éclaircissent au lieu de s'assombrir :**
```css
/* light */ --primary-hover: color-mix(in srgb, var(--color-primary) 85%, black);
/* dark  */ --primary-hover: color-mix(in srgb, var(--color-primary) 115%, white);
```

### Glassmorphism — pattern fondateur de l'UI

Le dock, les panneaux flottants, et les boutons overlay partagent ce pattern :

```css
background: color-mix(in srgb, var(--surface-base) 75%, transparent); /* ~75–92% opacity */
backdrop-filter: blur(16px) saturate(160%);
-webkit-backdrop-filter: blur(16px) saturate(160%);
border: 1px solid var(--border-light);
border-radius: 12px–24px;
box-shadow:
  0 0 0 1px rgba(0,0,0,0.055),
  0 6px 22px rgba(0,0,0,0.10),
  0 22px 52px rgba(0,0,0,0.07),
  inset 0 1.5px 0 rgba(255,255,255,0.95); /* shimmer top */
```

Le shimmer supérieur (`inset 0 1.5px 0 rgba(255,255,255,0.95)`) est la signature visuelle — toujours présent sur les surfaces verre.

### Rayons et espacements

| Élément | Radius |
|---|---|
| Panneaux / modales | `24px` |
| Cards | `16px` |
| Boutons d'action principaux | `12px–14px` |
| Pills / badges / chips | `999px` |
| Dock toolbar | `18px` (container), `13px` (boutons) |

Pas de système de spacing rigide — utiliser des multiples de 4px (4, 8, 12, 16, 20, 24, 32, 40).

### Animations

**Transition globale** : `all 0.3s ease-in-out` (définie sur `*` dans `01-base.css`).

Pour les micro-interactions et les éléments qui doivent "rebondir" : `cubic-bezier(0.34, 1.56, 0.64, 1)` (légère overshoot — utilisé sur les cartes, boutons, entrées de modales).

Pour les entrées de panneaux : `cubic-bezier(0.16, 1, 0.3, 1)` (ease-out rapide — iOS-like).

Entrées de listes avec stagger delay : `nth-child(n)` avec `animation-delay` croissants (voir `.project-card`).

Pattern d'état hover sur les boutons flottants : `transform: scale(1.08)` + ombre amplifiée. Sur le bouton fermer : `transform: scale(1.12) rotate(90deg)`.

### Typographie (carte)

- Police : `Arial, sans-serif` (système, pas de font loading pour la carte)
- Eyebrows (labels sections) : `font-size: 0.6875rem`, `font-weight: 700`, `letter-spacing: 0.12em`, `text-transform: uppercase`, couleur `--info`
- Titres de modales : `font-size: 1.75rem`, `font-weight: 800`, `letter-spacing: -0.03em`
- Pills / badges : `font-size: 0.85rem`, `font-weight: 700`

### Composants récurrents

**Pill de statut** (`.etat-pill`) — pattern couleur/fond/bordure :
```css
color: var(--primary);
background: var(--primary-alpha-12);
border: 1px solid var(--primary-alpha-35);
border-radius: 999px;
font-weight: 700;
```
Appliquer ce pattern pour tout badge ou tag de statut.

**Card projet** — fond `--surface-raised`, bordure `--border-light`, hover : lift `-4px + scale(1.01)` avec bordure colorée `color-mix(in srgb, var(--accent) 30%, transparent)`.

**Scrollbars** : style Apple ultra-fin (6px, thumb transparent → visible au hover uniquement) — défini globalement, ne pas redéfinir localement.

### Home (home-src/) — design séparé

- Police : Space Grotesk (titres) + Inter (corps)
- Primary : `#FF0037` (rouge — différent de la carte)
- Tailwind uniquement — pas de CSS custom sauf `src/style.css`
- Icônes : `lucide-vue-next`

## Sécurité

- **Toujours** utiliser `SecurityUtils.escapeHtml()` pour injecter du contenu utilisateur dans le DOM
- `SecurityUtils.sanitizeUrl()` pour les liens externes (bloque `javascript:`, `data:text/html`)
- Valider les inputs ville avec `/^[a-z0-9-]+$/i`
- Auth : refresh token proactif toutes les 4 min, graceful degradation après 3 échecs

## Conventions

- Code en **anglais** (variables, fonctions), commentaires et logs en **français**
- Pas de TypeScript — tout est en JS vanilla
- **Tests E2E Playwright** : `tests/*.spec.js` organisés par section admin
- Icônes : Font Awesome 6.2 (classes `fas fa-*`)
- Pas de `.env.example` — seule variable serveur : `OPENAI_API_KEY` (Netlify)
- Env variable côté client : aucune (Supabase anon key hardcodée)

## Tests — Règle obligatoire

**Toute implémentation de feature doit s'accompagner de tests Playwright.**

### Workflow

1. Implémenter la feature
2. Écrire les tests E2E correspondants dans `tests/admin.*.spec.js` (ou `tests/invited.*.spec.js` si rôle contributeur)
3. Lancer `npm test` — tous les tests doivent passer (0 failed) avant de déployer
4. Lancer `npm run lint` — 0 warning, 0 error

### Structure des tests

- **1 fichier par section** : `admin.contributions.spec.js`, `admin.categories.spec.js`, etc.
- **Numérotation cohérente** des describe/test : `2.7.1`, `2.7.2`, etc.
- **Helpers partagés** : `waitForBoot(page, path?)`, `goToSection(page)`, `clearToasts(page)`
- **Projets Playwright** : `setup` (auth), `admin`, `invited`, `unauth`
- **Assertions Playwright natives** : utiliser `toBeVisible()`, `toBeHidden()`, `toContainText()` — ne jamais contourner un bug CSS par `toHaveAttribute('hidden')` ; fixer le CSS à la place

### CSS et `[hidden]`

Si un composant utilise `element.hidden = true` pour se masquer, son sélecteur CSS ne doit **pas** overrider `display` sans respecter `[hidden]`. Toujours ajouter :
```css
.mon-composant[hidden] { display: none; }
```

### Ce qui n'est PAS testable en E2E actuellement

- **Villes** : nécessite un compte global-admin (non configuré)
- **Draw tools** : WebGL requis (MapLibre en headless)
- **Copilot génération** : nécessite `/api/ai-generate` + OPENAI_API_KEY
- **Drag-drop reorder** : interactions Playwright DnD complexes

## Pièges courants

- `toggles.js` est le seul `<script type="module">` de la carte — ne pas oublier le `type="module"` si on le déplace
- L'admin charge les scripts de la carte (`auth.js`, `supabaseservice.js`) via `<script>` — donc les modules IIFE doivent rester fonctionnels
- Les fichiers `/home/**` sont générés — éditer `/home-src/**` à la place
- `activeCity` peut venir de 3 sources (window.activeCity, CityManager, localStorage) — toujours passer par `supabaseService.getActiveCity()`
- Le `*` transition global peut causer des animations inattendues sur les éléments MapLibre — ajouter des exemptions si nécessaire

## Règle absolue — Ne jamais hardcoder de données métier dans le code

**Toutes les données configurables (labels, icônes, couleurs, URLs, ordres d'affichage, etc.) doivent vivre en base Supabase**, pas dans le code JS ou CSS.

Exemples de ce qui DOIT être en base :
- Icônes des basemaps → colonne `icon` dans `basemaps_v2`
- Labels affichés → colonne `label` dans la table concernée
- Ordre d'affichage → colonne `sort_order`
- Activation/désactivation → colonne `active`

**Si tu n'es pas sûr** : demander avant de coder. Ne jamais créer un dictionnaire/mapping en JS pour des données qui appartiennent à la base.
