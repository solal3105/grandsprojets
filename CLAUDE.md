# Grands Projets — Carte interactive des projets urbains

## Commandes

```bash
npm run dev          # Netlify Dev → :3001 (site + fonctions serverless)
npm run lint         # oxlint (pas d'ESLint)
npm test             # Playwright — suite complète (~5 min) — UNIQUEMENT en fin de cycle
npx playwright test tests/admin.categories.spec.js  # cibler un fichier
npx playwright test --grep "3.2.16"                 # cibler un test
```

Build home : `cd home-src && npm ci && npm run build` → output dans `/home/`.

## Architecture

| Zone | Stack |
|---|---|
| **Carte** (`/index.html`) | Vanilla JS, modules IIFE sur `window`, pas de bundler |
| **Admin** (`/admin/`) | Vanilla JS, **ES modules**, routeur pushState custom |
| **Fiche** (`/fiche/`) | Vanilla JS, IIFE autonome |
| **Home** (`/home-src/` → `/home/`) | Vue 3 + Vite + Tailwind, build séparé |
| **Fonctions** (`/netlify/functions/`) | Node.js ESM `.mjs`, Netlify Functions v2 |

## Patterns de code

### Modules carte (`modules/*.js`)
- **IIFE sur `window`** : `window.Module = (() => { ... return {...}; })();`
- Communication inter-modules via `window` globals + optional chaining : `window.FilterManager?.syncUI?.()`
- **NE PAS** convertir en ES modules — l'ordre de chargement dans `index.html` en dépend
- `toggles.js` est la seule exception : `<script type="module">`
- `main.js` orchestre l'init en 9 phases (Phase 0→8)

### `window.L` N'EST PAS Leaflet
`maplibre-compat.js` expose un shim `window.L` (API Leaflet → MapLibre GL JS en interne). Ne jamais importer Leaflet. Pour les couches performantes, utiliser `maplibre-renderer.js`.

### Admin (`admin/*.js`)
- ES modules — seul sous-projet à les utiliser côté navigateur
- Accède à `window.supabaseService` et `window.AuthModule` (chargés par le HTML parent)
- État : `admin/store.js` (pub/sub simple) — Routeur : `admin/router.js`

### Home (`home-src/`)
- Vue 3 Composition API (`<script setup>`), Tailwind 3.4, primary `#FF0037`, icônes `lucide-vue-next`
- **Ne pas éditer `/home/`** — artefacts de build

### Fonctions Netlify
- CORS géré manuellement — Auth : vérification JWT via `/auth/v1/user`
- `OPENAI_API_KEY` injectée automatiquement par `netlify dev` depuis les env vars Netlify

## Supabase
- Client instancié une seule fois sur `win.__supabaseClient` (partagé `auth.js` + `supabaseservice.js`)
- `window.supabaseService` = couche données centralisée — toute requête passe par là
- **City-scoping** : toujours `supabaseService.getActiveCity()` (fallback `metropole-lyon`)
- Clé anon hardcodée (RLS protège les données) — cache TTL 10 min dans `datamodule.js`

## CSS

- Pas de build CSS pour la carte — `@import url()` dans `style.css`, architecture `00-colors.css` → `08-responsive.css`
- Nommage BEM-like : `dock-panel__header`, préfixe `gp-` pour sidebar, états `.is-active / .is-open / .is-visible`
- `* { transition: all 0.3s ease-in-out; }` global — ajouter des exemptions pour les éléments MapLibre

### Couleurs — 3 couches (ne pas bypasser)
1. **Tokens** : `--color-primary #14AE5C`, `--color-danger #EF4444`, `--color-info #2563EB`, `--color-warning #F59E0B`, `--color-success #10B981` + `--gray-50`→`--gray-900`
2. **Variantes alpha** : `--primary-alpha-12` (fond), `--primary-alpha-35` (bordure) — via `color-mix()`
3. **Alias sémantiques** (à utiliser dans tout nouveau CSS) : `--text-primary/secondary/tertiary`, `--surface-base/raised/overlay`, `--border-light/medium/strong`

**Pattern badge/pill** : `color: var(--primary); background: var(--primary-alpha-12); border: 1px solid var(--primary-alpha-35); border-radius: 999px;`

### Dark mode
Activé par `html[data-theme='dark']` — seule l'échelle `--gray-*` est inversée, tout le reste suit automatiquement. **Ne jamais redéfinir les alias sémantiques.**
- `box-shadow` : toujours `rgba(0,0,0,...)` hardcodé
- Hover dark : `color-mix(in srgb, var(--color-primary) 115%, white)` (s'éclaircit)

### Glassmorphism
Pattern dock/panneaux : `background: color-mix(in srgb, var(--surface-base) 75%, transparent)` + `backdrop-filter: blur(16px) saturate(160%)` + shimmer `inset 0 1.5px 0 rgba(255,255,255,0.95)` (signature visuelle — toujours présent).

### Rayons / Spacing / Animations
- Panneaux `24px`, cards `16px`, boutons `12-14px`, pills `999px` — spacing multiples de 4px
- Global : `0.3s ease-in-out` — rebond : `cubic-bezier(0.34, 1.56, 0.64, 1)` — entrée panneau : `cubic-bezier(0.16, 1, 0.3, 1)`
- Hover bouton flottant : `scale(1.08)` — bouton fermer : `scale(1.12) rotate(90deg)`

## Sécurité
- `SecurityUtils.escapeHtml()` pour toute injection DOM de contenu utilisateur
- `SecurityUtils.sanitizeUrl()` pour les liens externes (bloque `javascript:`, `data:text/html`)
- Valider les codes ville : `/^[a-z0-9-]+$/i`
- Refresh token proactif toutes les 4 min, graceful degradation après 3 échecs

## Conventions
- Code **anglais**, commentaires/logs **français** — Pas de TypeScript
- Icônes : Font Awesome 6.2 (`fas fa-*`) — Home : `lucide-vue-next`
- Données configurables → Supabase (jamais de mapping JS/CSS hardcodé)

## Tests — Règles

**Feature ajoutée = tests écrits. Bug fixé = test de non-régression.**

### Workflow
1. Implémenter la feature (ou corriger le bug)
2. Écrire les tests dans `tests/admin.*.spec.js` (ou `invited.*.spec.js` si rôle contributeur)
3. **Lancer uniquement le fichier spec concerné** — pas la suite complète à chaque itération :
   ```bash
   npx playwright test tests/admin.categories.spec.js
   npx playwright test tests/admin.categories.spec.js --grep "3.2.16"
   ```
4. **`npm test` (suite complète) uniquement à la toute fin** avant de pousser
5. `npm run lint` — 0 warning, 0 error

### Structure des tests
- 1 fichier par section, numérotation `2.7.1`, `2.7.2`...
- Helpers : `waitForBoot(page, path?)`, `goToSection(page)`, `clearToasts(page)`
- Projets Playwright : `setup` → `admin` + `invited` → `admin-logout` → `unauth`
- Toasts admin : `.adm-toast--success / --error / --warning` (≠ `.gp-toast` de la carte)

### Projets Playwright — ordre garanti
`admin.z-logout.spec.js` appelle `signOut()` qui révoque le token Supabase côté serveur (global scope). Ce fichier est isolé dans le projet `admin-logout` avec `dependencies: ['admin', 'invited']` — il tourne toujours EN DERNIER. Ne jamais le déplacer dans le projet `admin`.

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
- **Drag-drop reorder** : interactions Playwright DnD complexes

### Couverture — lacunes connues (275 tests actuels)
La suite couvre l'**admin** et la **carte publique** (UI/navigation). Aucun test sur :

**Carte publique** : `feature-interactions.js` (markers), `travauxmodule.js` / `travaux-views.js`, `article-view.js`, `lightbox.js`, `geolocation.js`, `layerregistry.js` / `maplibre-renderer.js`, `datamodule.js`, `citybranding.js` / `citymanager.js`

**Page `/fiche/`** : `fiche-v2.js` — aucun test

**Home Vue SPA** : toutes les vues (`HomeView`, `HelpView`, `FeaturesView`, etc.) — aucun test E2E

**Admin** : édition/suppression catégorie, upload Supabase Storage, comportement hors-ligne, refresh token

## Pièges courants
- `toggles.js` est le seul `<script type="module">` de la carte
- L'admin charge `auth.js` et `supabaseservice.js` via `<script>` → les IIFE doivent rester fonctionnelles
- Éditer `/home-src/**`, jamais `/home/**` (build)
- `activeCity` : toujours via `supabaseService.getActiveCity()` (3 sources possibles)
- Transition `*` globale → ajouter des exemptions pour les éléments MapLibre

## Règle absolue — Pas de données métier dans le code
Labels, icônes, couleurs, URLs, ordres, activation → **table Supabase** (colonnes `label`, `icon`, `sort_order`, `active`). En cas de doute, demander avant de coder.
