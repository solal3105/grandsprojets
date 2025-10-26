# Tests des Toggles UI

Tests end-to-end des 8 toggles de l'interface utilisateur.

## Architecture des toggles

Les toggles sont gérés par le **ToggleManager** (`modules/ui/toggles.js`) avec:
- Configuration centralisée (`modules/ui/toggles-config.js`)
- Gestion d'état (Map)
- Événements (click, keyboard)
- Accessibilité ARIA
- Layout responsive (mobile/desktop)
- Persistance localStorage (theme)

## Toggles testés

### 1. **info-toggle.spec.js** - À propos
- ✅ Visible sur desktop ET mobile
- ✅ Ouvre modale "À propos"
- ✅ Fermeture: click extérieur, ESC, bouton fermer
- ✅ Accessibilité clavier (Enter, Space)
- ✅ ARIA (aria-pressed, aria-expanded, aria-haspopup)

### 2. **theme-toggle.spec.js** - Mode sombre
- ✅ Bascule mode clair/sombre
- ✅ Icône change (fa-moon ↔ fa-sun)
- ✅ Persistance localStorage
- ✅ Restauration au chargement
- ✅ Attribut data-theme sur `<html>`
- ✅ Changement visuel (background-color)

### 3. **search-toggle.spec.js** - Recherche d'adresse
- ✅ Ouvre overlay de recherche
- ✅ Input focusé automatiquement
- ✅ Fermeture: click extérieur, ESC
- ✅ Accepte du texte
- ✅ Accessibilité clavier

### 4. **filters-toggle.spec.js** - Filtres de carte
- ✅ Affiche/masque panneau de filtres
- ✅ Compteur de filtres actifs
- ✅ Bouton de fermeture dans le panneau
- ✅ Contenu dynamique chargé
- ✅ Pas de fermeture automatique (comportement attendu)

### 5. **location-toggle.spec.js** - Géolocalisation
- ✅ Visible sur mobile (et desktop selon config)
- ✅ Demande géolocalisation
- ✅ États: default, loading, active, error
- ✅ Centrage de la carte
- ✅ Gestion des permissions
- ✅ Click multiple géré

### 6. **basemap-toggle.spec.js** - Fond de carte
- ✅ Affiche menu de sélection
- ✅ Fermeture: click extérieur, toggle
- ✅ Plusieurs options disponibles
- ✅ Sélection change le fond
- ✅ Menu ferme après sélection
- ✅ Changement visuel (URL tuiles)

### 7. **contribute-toggle.spec.js** - Contribuer
- ✅ Caché si non connecté
- ✅ Visible si connecté (invited, admin)
- ✅ Ouvre modale de contribution
- ✅ Landing avec sélection de ville
- ✅ État pressed quand modale ouverte
- ✅ Disparaît après déconnexion

### 8. **login-toggle.spec.js** - Connexion
- ✅ Visible si non connecté
- ✅ Caché si connecté
- ✅ Redirige vers /login
- ✅ Formulaire de connexion présent
- ✅ Réapparaît après déconnexion
- ✅ Mutuellement exclusif avec contribute

## Principes de test

### Basés sur l'interaction utilisateur
- Click sur le toggle
- Keyboard (Enter, Space)
- Click extérieur pour fermer
- ESC pour fermer

### Vérifications
- Visibilité initiale
- États ARIA (aria-pressed, aria-expanded, aria-haspopup)
- Overlay/menu/modal apparaît
- Contenu chargé
- Fermeture fonctionne
- Responsive (mobile/desktop)

### Attentes conditionnelles
- `expect(...).toBeVisible({ timeout })`
- `expect(...).toHaveAttribute(...)`
- Pas de `waitForTimeout` sauf nécessaire
- Timeouts adaptés (5s, 10s, 15s)

## Lancer les tests

### Tous les toggles
```bash
npx playwright test tests/toggles/
```

### Un toggle spécifique
```bash
npx playwright test tests/toggles/theme-toggle.spec.js
```

### Mode UI
```bash
npx playwright test tests/toggles/ --ui
```

### Mode debug
```bash
npx playwright test tests/toggles/info-toggle.spec.js --debug
```

## Structure des fichiers

```
tests/
└── toggles/
    ├── README.md (ce fichier)
    ├── info-toggle.spec.js
    ├── theme-toggle.spec.js
    ├── search-toggle.spec.js
    ├── filters-toggle.spec.js
    ├── location-toggle.spec.js
    ├── basemap-toggle.spec.js
    ├── contribute-toggle.spec.js
    └── login-toggle.spec.js
```

## Dépendances

- `@playwright/test`
- `../helpers/auth.js` (pour contribute et login)

## Notes

- **Géolocalisation**: Tests avec permissions accordées via `context.grantPermissions()`
- **Authentification**: Tests login/contribute utilisent `login()` helper
- **Persistance**: Theme teste localStorage
- **Responsive**: Tests vérifient mobile (375x667) et desktop (1280x720)
- **ARIA**: Tous les toggles testent l'accessibilité

## Couverture

- ✅ 8 toggles testés
- ✅ ~80 tests au total
- ✅ Visibilité
- ✅ Interactions
- ✅ États
- ✅ Accessibilité
- ✅ Responsive
- ✅ Persistance
- ✅ Authentification

## Maintenance

Lors de l'ajout d'un nouveau toggle:
1. Ajouter config dans `toggles-config.js`
2. Créer `nouveau-toggle.spec.js`
3. Tester: visibilité, click, ARIA, responsive
4. Mettre à jour ce README
