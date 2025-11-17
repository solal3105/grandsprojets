# Plan de Tests - Toggles UI

**Total: 68 tests sur 8 toggles**

---

## 🎨 THEME (`#theme-toggle`) - 11 tests

- [ ] Le toggle est visible avec icône `fa-moon` et `aria-pressed="false"`
- [ ] Click active le mode sombre: `data-theme="dark"` sur html, `aria-pressed="true"`, icône `fa-sun`
- [ ] Classe `dark` ajoutée sur `<html>` en mode sombre
- [ ] Click à nouveau désactive: retour à `"light"`, `aria-pressed="false"`, icône `fa-moon`, classe `dark` retirée
- [ ] Persistance: `localStorage.getItem('theme')` === `'dark'` après activation, `'light'` après désactivation
- [ ] Restauration au reload: thème dark persiste après `page.reload()`
- [ ] Clavier Enter: active le mode sombre
- [ ] Clavier Space: active le mode sombre
- [ ] Responsive mobile (375×667): visible
- [ ] Responsive desktop (1280×720): visible
- [ ] Changement visuel: `backgroundColor` différent entre clair et sombre

---

## 🗺️ FILTERS (`#filters-toggle`) - 10 tests

- [ ] Visible avec icône `fa-map`, `aria-pressed="false"`, compteur `.filter-count` existe
- [ ] Click ouvre: `#filters-container` visible (display block), `aria-pressed="true"`
- [ ] Click ferme: container caché (display none), `aria-pressed="false"`
- [ ] Cycle complet: ouverture → fermeture fonctionne avec vérification display
- [ ] Clavier Enter: ouvre le panneau
- [ ] Clavier Space: ouvre le panneau
- [ ] Compteur initial: affiche "0" ou est caché
- [ ] Responsive mobile et desktop: visible
- [ ] Contenu dynamique: `#dynamic-filters` existe (peut être vide)
- [ ] Pas de fermeture par click extérieur (comportement attendu)

---

## 🌍 BASEMAP (`#basemap-toggle`) - 10 tests

- [ ] Visible avec icône `fa-globe`, `aria-pressed="false"`, `aria-haspopup="true"`, `aria-expanded="false"`
- [ ] Click ouvre: `#basemap-menu` a la classe `active`, `aria-pressed="true"`, `aria-expanded="true"`
- [ ] Click ferme: menu perd la classe `active`, `aria-pressed="false"`, `aria-expanded="false"`
- [ ] Click extérieur (sur carte): ferme le menu
- [ ] Clavier Enter: ouvre le menu
- [ ] Clavier Space: ouvre le menu
- [ ] Menu contient des options: chercher `button, .basemap-option, [role="menuitem"]` (≥ 0)
- [ ] Responsive mobile et desktop: visible
- [ ] Sélection d'une option: ferme le menu
- [ ] Changement visuel: URL des tuiles de carte change après sélection d'une autre option

---

## 🔍 SEARCH (`#search-toggle`) - 9 tests

- [ ] Visible avec icône `fa-search`, `aria-pressed="false"`, `aria-haspopup="true"`, `aria-expanded="false"`
- [ ] Click ouvre: `#search-overlay` a classe `active` + display visible + `aria-hidden="false"`, toggle `aria-pressed="true"`
- [ ] Input `#address-search` auto-focusé après ouverture (vérifier `document.activeElement`)
- [ ] Click extérieur (sur carte): ferme l'overlay
- [ ] Touche ESC: ferme l'overlay
- [ ] Clavier Enter: ouvre l'overlay
- [ ] Clavier Space: ouvre l'overlay
- [ ] Saisie de texte: input accepte et retient le texte saisi
- [ ] Responsive mobile et desktop: visible

---

## 📍 LOCATION (`#location-toggle`) - 8 tests

**⚠️ ISO Code:** 4 états (default, loading, active, error), `disabled=true` UNIQUEMENT en loading

- [ ] Visible sur mobile (375×667) avec icône `fa-location-arrow`, `aria-pressed="false"`
- [ ] Existe sur desktop (1280×720) - `toBeAttached()`
- [ ] Click demande géolocalisation (permissions accordées), `aria-pressed` devient "true" ou "false"
- [ ] État loading: toggle reste visible et interactif après click
- [ ] Clavier Enter: déclenche la géolocalisation
- [ ] Centrage carte: `MapModule.map.getCenter()` existe après géolocalisation
- [ ] Erreur permission refusée: toggle reste visible, `aria-pressed="false"`, `disabled=false`
- [ ] Bouton reste interactif entre les états (pas de disabled permanent)

---

## ℹ️ INFO (`#info-toggle`) - 8 tests

- [ ] Visible avec icône `fa-info-circle`, `aria-pressed="false"`, `aria-haspopup="true"`, `aria-expanded="false"`
- [ ] Click ouvre: `#about-overlay` display visible + `aria-hidden="false"`, toggle `aria-pressed="true"`, `aria-expanded="true"`
- [ ] Bouton fermer (`.gp-modal-close` ou `×`): ferme la modale
- [ ] Click extérieur (sur overlay): ferme la modale
- [ ] Touche ESC: ferme la modale
- [ ] Clavier Enter: ouvre la modale
- [ ] Clavier Space: ouvre la modale
- [ ] Contenu: `.gp-modal-body` contient "grandsprojets.com"

---

## ➕ CONTRIBUTE (`#contribute-toggle`) - 7 tests

**⚠️ ISO Code:** Visible UNIQUEMENT si connecté, apparition immédiate via `onAuthStateChange`

- [ ] CACHÉ pour utilisateurs non connectés (`toBeHidden()`)
- [ ] VISIBLE après connexion (timeout 15s), icône `fa-plus`, `aria-pressed="false"`
- [ ] Apparition immédiate sans refresh: URL reste sur localhost:3001, pas de `/login`
- [ ] Click ouvre modale OU change URL (vérifier au moins l'un des deux)
- [ ] Responsive mobile et desktop après connexion: visible
- [ ] Clavier Enter après connexion: ouvre modale ou change URL
- [ ] Reste visible après fermeture de modale/action

---

## 👤 LOGIN (`#login-toggle`) - 5 tests

**⚠️ ISO Code:** Visible UNIQUEMENT si NON connecté, redirection `/login`, **PAS de clavier** (seulement click)

- [ ] VISIBLE pour utilisateurs non connectés, icône `fa-user`
- [ ] CACHÉ après connexion (timeout 10s, `toBeHidden()`)
- [ ] Click redirige vers `/login` ou `/login/` (timeout 15s avec `Promise.race`)
- [ ] Page `/login` contient `input[type="email"]`
- [ ] Responsive mobile et desktop si non connecté: visible

---

## 📝 Notes d'Implémentation

### Accessibilité Clavier
- **✅ AVEC clavier (Enter/Space):** Theme, Filters, Basemap, Search, Location, Info, Contribute
  - Theme: géré dans `main.js` ligne 447-452
  - Autres: gérés dans `toggles.js` ligne 101-106 via `bindToggleEvents()`
- **❌ SANS clavier:** Login (seulement click, `main.js` ligne 431-434)

### Theme
- **localStorage:** clé `'theme'`, valeurs `'dark'|'light'` (PAS `'theme-dark-mode'` ni boolean)
- **HTML:** attribut `data-theme` + classe `dark` sur `<html>`

### Filters
- **Mécanisme:** `#filters-container` avec `display: none` ↔ `block` (PAS de classe active)

### Basemap
- **Mécanisme:** `#basemap-menu` avec classe `active` (PAS de display none/block)

### Search
- **Mécanisme:** `#search-overlay` avec classe `active` + `display` + `aria-hidden`

### Location
- **États:** default, loading (disabled=true), active, error (tous disabled=false sauf loading)

### Info
- **Mécanisme:** `#about-overlay` avec `display` + `aria-hidden`

### Contribute
- **Visibilité:** `isAuthenticated === true` (race condition corrigée avec `skipToggles`)

### Login
- **Visibilité:** `isAuthenticated === false` (inverse de contribute)
- **Accessibilité:** SEULEMENT click, PAS de support clavier
