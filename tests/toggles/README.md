# Tests Toggles UI

**57 tests sur 8 toggles** - 100% ISO code vérifié

## 📁 Structure

```
toggles/
├── README.md                       # Ce fichier
├── TESTS-PLAN-VERIFIED.md         # Plan détaillé avec références code
│
├── theme-toggle.spec.js           # 9 tests  ✅ Clavier
├── filters-toggle.spec.js         # 8 tests  ✅ Clavier
├── basemap-toggle.spec.js         # 8 tests  ✅ Clavier
├── search-toggle.spec.js          # 7 tests  ✅ Clavier
├── location-toggle.spec.js        # 6 tests  ✅ Clavier
├── info-toggle.spec.js            # 7 tests  ✅ Clavier
├── contribute-toggle.spec.js      # 7 tests  ✅ Clavier
└── login-toggle.spec.js           # 5 tests  ❌ PAS de clavier
```

## 🚀 Lancer les tests

```bash
# Tous les toggles
npx playwright test tests/toggles/

# Un toggle spécifique
npx playwright test tests/toggles/theme-toggle.spec.js

# Mode UI
npx playwright test tests/toggles/ --ui

# Mode debug
npx playwright test tests/toggles/theme-toggle.spec.js --debug
```

## ✅ Points Clés

### Accessibilité Clavier
- **7 toggles AVEC clavier** (Enter/Space) → Gérés par `toggles.js:101-106`
- **1 toggle SANS clavier** (Login) → Seulement click `main.js:431-434`

### Visibilité Conditionnelle
- **Contribute** → Visible SI connecté (`citybranding.js:226-229`)
- **Login** → Visible SI NON connecté (`citybranding.js:221-225`)

### États Multiples
- **Location** → 4 états (default, loading, active, error)
- **disabled=true** UNIQUEMENT en loading (`geolocation.js:250`)

### Persistance
- **Theme** → localStorage clé `'theme'`, valeurs `'dark'|'light'`

## 📊 Couverture

| Toggle | Tests | Clavier | Auth | Notes |
|--------|-------|---------|------|-------|
| Theme | 9 | ✅ | - | Persistance localStorage |
| Filters | 8 | ✅ | - | Compteur, pas de fermeture extérieure |
| Basemap | 8 | ✅ | - | Fermeture extérieure |
| Search | 7 | ✅ | - | Auto-focus input |
| Location | 6 | ✅ | - | 4 états, disabled en loading |
| Info | 7 | ✅ | - | ESC ferme |
| Contribute | 7 | ✅ | ✅ | Visible si connecté |
| Login | 5 | ❌ | ✅ | Visible si NON connecté |

## 🔧 Helpers Utilisés

- `login(page, user)` - Authentification test (`auth.js`)
- `TEST_USERS.invited` - Utilisateur test invité
- Standard Playwright locators et assertions

## 📝 Conventions

### Nommage
- Fichiers: `{toggle-name}-toggle.spec.js`
- Describe: `'{Toggle Name} Toggle'`
- Tests: Descriptions courtes et explicites

### Structure des tests
```javascript
test('Description courte ISO code', async ({ page }) => {
  // Arrange
  const toggle = page.locator('#toggle-id');
  
  // Act
  await toggle.click();
  await page.waitForTimeout(300);
  
  // Assert
  await expect(something).toBe(expected);
});
```

### Timeouts
- Opérations rapides: `300ms`
- Overlays/Modales: `500ms`
- Géolocalisation: `2000ms`
- Auth/Branding: `15000ms`

## 🎯 Tests Supprimés (non ISO code)

15 tests génériques retirés car non vérifiables dans le code :
- Tests visuels abstraits (backgroundColor)
- Tests de contenu (text modale)
- Tests d'interactions complexes (URL tuiles)
- Tests redondants (cycles complets)

Voir `TESTS-PLAN-VERIFIED.md` pour la liste complète.
