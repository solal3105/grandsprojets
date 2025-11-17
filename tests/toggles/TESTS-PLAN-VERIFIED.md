# Plan de Tests - Toggles UI (100% ISO CODE)

**Total: 57 tests sur 8 toggles** ✅ Vérifié ligne par ligne

---

## 🎨 THEME (`#theme-toggle`) - 9 tests

- [ ] Le toggle est visible avec icône `fa-moon`
- [ ] Click active: `data-theme="dark"` sur `<html>`, icône `fa-sun`
- [ ] Classe `dark` ajoutée sur `<html>` en mode sombre
- [ ] Click désactive: `data-theme="light"`, icône `fa-moon`, classe `dark` retirée
- [ ] Persistance: `localStorage.getItem('theme')` === `'dark'` puis `'light'`
- [ ] Restauration au reload: thème persiste
- [ ] Clavier Enter: active le mode sombre ✅ (`main.js:447-452`)
- [ ] Clavier Space: active le mode sombre ✅ (`main.js:447-452`)
- [ ] Responsive mobile et desktop: visible

**Code source:** `thememanager.js`, `main.js:442-452`

---

## 🗺️ FILTERS (`#filters-toggle`) - 8 tests

- [ ] Visible avec icône `fa-map`, compteur `.filter-count` existe ✅ (`index.html:153`)
- [ ] Click ouvre: `#filters-container` `display: block` ✅ (`index.html:156`)
- [ ] Click ferme: `display: none`
- [ ] Clavier Enter: ouvre le panneau ✅ (`toggles.js:101-106`)
- [ ] Clavier Space: ouvre le panneau ✅ (`toggles.js:101-106`)
- [ ] Responsive: visible sur mobile et desktop
- [ ] `#dynamic-filters` existe ✅ (`index.html:160`)
- [ ] Pas de fermeture par click extérieur ✅ (comportement confirm dans `uimodule.js`)

**Code source:** `uimodule.js`, `toggles.js:93-106`

---

## 🌍 BASEMAP (`#basemap-toggle`) - 8 tests

- [ ] Visible avec icône `fa-globe`, `aria-haspopup="true"` ✅ (`toggles.js:203`)
- [ ] Click ouvre: `#basemap-menu` a classe `active` ✅
- [ ] Click ferme: perd classe `active`
- [ ] Click extérieur ferme ✅ (`toggles.js:109-120`)
- [ ] Clavier Enter: ouvre ✅ (`toggles.js:101-106`)
- [ ] Clavier Space: ouvre ✅ (`toggles.js:101-106`)
- [ ] Menu contient `.basemap-tile` ✅ (`uimodule.js:270-273`)
- [ ] Responsive: visible sur mobile et desktop

**Code source:** `uimodule.js:229-367`, `toggles.js`

---

## 🔍 SEARCH (`#search-toggle`) - 7 tests

- [ ] Visible avec icône `fa-search`, `aria-haspopup="true"` ✅ (`toggles.js:203`)
- [ ] Click ouvre: `#search-overlay` classe `active` + `aria-hidden="false"`
- [ ] Input `#address-search` auto-focusé ✅ (`searchmodule.js:111`)
- [ ] Click extérieur ferme ✅ (`toggles.js:109-120`)
- [ ] Clavier Enter: ouvre ✅ (`toggles.js:101-106`)
- [ ] Clavier Space: ouvre ✅ (`toggles.js:101-106`)
- [ ] Responsive: visible

**Code source:** `searchmodule.js:105-114`, `toggles.js`

---

## 📍 LOCATION (`#location-toggle`) - 6 tests

- [ ] Visible sur mobile avec icône `fa-location-arrow`
- [ ] Click demande géolocalisation (context permissions)
- [ ] 4 états: default, loading (classe+disabled), active (classe), error (classe) ✅ (`geolocation.js:240-263`)
- [ ] `disabled=true` UNIQUEMENT en `loading` ✅ (`geolocation.js:250`)
- [ ] Clavier Enter: déclenche ✅ (`toggles.js:101-106`)
- [ ] Responsive: existe sur desktop

**Code source:** `geolocation.js:232-270`, `toggles.js`

---

## ℹ️ INFO (`#info-toggle`) - 7 tests

- [ ] Visible avec icône `fa-info-circle`, `aria-haspopup="true"` ✅ (`toggles.js:203`)
- [ ] Click ouvre: `#about-overlay` display visible + `aria-hidden="false"`
- [ ] Bouton `.gp-modal-close` ferme ✅ (`index.html:174`)
- [ ] Click extérieur ferme (via `ModalHelper`)
- [ ] ESC ferme (via `ModalHelper`)
- [ ] Clavier Enter: ouvre ✅ (`toggles.js:101-106`)
- [ ] Clavier Space: ouvre ✅ (`toggles.js:101-106`)

**Code source:** `modalhelper.js`, `toggles.js`

---

## ➕ CONTRIBUTE (`#contribute-toggle`) - 7 tests

- [ ] CACHÉ si non connecté ✅ (`citybranding.js:226-229`)
- [ ] VISIBLE si connecté ✅ (`citybranding.js:226-229`)
- [ ] Apparition immédiate sans refresh ✅ (`onAuthStateChange`)
- [ ] Click déclenche action (modale ou navigation)
- [ ] Responsive: visible après connexion
- [ ] Clavier Enter: fonctionne ✅ (`toggles.js:101-106`)
- [ ] Reste visible après action

**Code source:** `citybranding.js:198-233`, `toggles.js`

---

## 👤 LOGIN (`#login-toggle`) - 5 tests

- [ ] VISIBLE si NON connecté ✅ (`citybranding.js:221-225`)
- [ ] CACHÉ si connecté ✅ (`citybranding.js:221-225`)
- [ ] Click redirige vers `/login` ✅ (`main.js:431-434`)
- [ ] Page `/login` contient `input[type="email"]` ✅ (`login/index.html`)
- [ ] Responsive: visible si non connecté

**Code source:** `citybranding.js:198-233`, `main.js:428-436`

**⚠️ PAS de support clavier** - seulement click (`main.js:431-434`)

---

## 📝 Tests SUPPRIMÉS (non ISO code)

### ❌ Tests génériques retirés :
1. **Theme - "Changement visuel backgroundColor"** → Pas vérifié dans le code, juste effet CSS
2. **Filters - "Compteur initial 0 ou caché"** → Toujours `<span class="filter-count">0</span>`, pas de logique de cache
3. **Filters - "Cycle complet ouverture/fermeture"** → Redondant avec tests click ouvre/ferme
4. **Basemap - "`aria-pressed` et `aria-expanded`"** → `aria-expanded` oui, mais pas `aria-pressed` pour basemap
5. **Basemap - "Options button/.basemap-option/[role=menuitem]"** → Sélecteur incorrect, c'est `.basemap-tile`
6. **Basemap - "Sélection ferme le menu"** → Pas explicitement testé dans le code
7. **Basemap - "URL tuiles change"** → Trop spécifique, pas directement dans le code toggle
8. **Search - "Saisie texte dans input"** → Pas une fonctionnalité du toggle
9. **Search - "Touche ESC ferme"** → Géré par ModalHelper, pas directement testable via toggle
10. **Location - "État loading visible"** → Trop vague, remplacé par test états
11. **Location - "Centrage carte"** → Fonctionnalité geolocation, pas toggle
12. **Location - "Gestion erreur permission"** → Couvert par test états
13. **Info - "Contenu modale contient text"** → Pas fonctionnalité du toggle
14. **Contribute - "Click ouvre modale OU URL"** → Trop vague
15. **Login - "Clavier Enter/Space"** → ❌ Pas implémenté dans le code

---

## 🔍 Références Code Source

### Accessibilité Clavier ✅
- **Theme:** `main.js` lignes 447-452 (keydown Enter/Space)
- **Filters, Basemap, Search, Location, Info, Contribute:** `toggles.js` lignes 101-106 (bindToggleEvents)
- **Login:** ❌ `main.js` lignes 431-434 (SEULEMENT click, pas de keydown)

### Mécanismes
- **Theme:** `data-theme` + classe `dark` sur `<html>`, localStorage `'theme'`
- **Filters:** `#filters-container` display none/block, compteur `.filter-count`
- **Basemap:** `#basemap-menu` classe `active`, options `.basemap-tile`
- **Search:** `#search-overlay` classe `active` + aria-hidden, focus input
- **Location:** 4 états (default/loading/active/error), disabled SEULEMENT en loading
- **Info:** `#about-overlay` via ModalHelper
- **Contribute/Login:** Visibilité via `citybranding.js` `applyTogglesConfig()`
